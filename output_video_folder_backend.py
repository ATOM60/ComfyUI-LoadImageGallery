import asyncio
import os
from pathlib import Path
from urllib.parse import unquote

from aiohttp import web
from server import PromptServer

from . import image_gallery_core as gallery_core
from . import output_video_gallery_backend as base


# Capture the original Explorer-style Windows picker before
# native_folder_picker_backend replaces the shared input-gallery picker.
# Output Gallery should use the same familiar file-dialog style as the normal
# ComfyUI input chooser instead of the separate FolderBrowserDialog UI.
_OUTPUT_PICK_FOLDER = gallery_core._pick_folder_native
_ORIGINAL_RESOLVE = base._resolve
_ORIGINAL_REL = base._rel


def _raw_path(value: str) -> str:
    return unquote(str(value or "")).strip().replace("\\", "/")


def _is_absolute(value: str) -> bool:
    raw = _raw_path(value)
    if not raw:
        return False
    try:
        return os.path.isabs(os.path.expanduser(raw))
    except Exception:
        return False


def _resolve_extended(value: str, must_exist: bool = True) -> Path:
    raw = _raw_path(value)
    if not _is_absolute(raw):
        return _ORIGINAL_RESOLVE(value, must_exist)

    path = Path(os.path.expanduser(raw)).resolve()
    if path.suffix.lower() not in base.VIDEO_EXTENSIONS:
        raise ValueError("Неподдерживаемое расширение видео")
    if must_exist and (not path.exists() or not path.is_file()):
        raise FileNotFoundError(str(path))
    return path


def _rel_extended(path: Path) -> str:
    try:
        return _ORIGINAL_REL(path)
    except Exception:
        return str(path.resolve())


# Existing output routes resolve globals at call time, so extending these two
# helpers automatically gives playback/copy/rename/delete/reveal support to
# videos selected from an external folder without duplicating those routes.
base._resolve = _resolve_extended
base._rel = _rel_extended


def _folder_root(folder: str) -> Path:
    raw = _raw_path(folder)
    if not raw:
        return base._root()
    path = Path(os.path.expanduser(raw)).resolve()
    if not path.exists() or not path.is_dir():
        raise FileNotFoundError(str(path))
    return path


def _scan_folder(folder: str):
    root = _folder_root(folder)
    output_root = base._root()
    use_output_relative = root == output_root
    rows = []

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort(key=str.lower)
        for filename in filenames:
            path = Path(dirpath) / filename
            if path.suffix.lower() not in base.VIDEO_EXTENSIONS:
                continue
            try:
                stat = path.stat()
            except OSError:
                continue

            if use_output_relative:
                stored_path = path.relative_to(output_root).as_posix()
            else:
                stored_path = str(path.resolve())

            folder_label = ""
            if path.parent != root:
                try:
                    folder_label = path.parent.relative_to(root).as_posix()
                except Exception:
                    folder_label = path.parent.name

            rows.append({
                "path": stored_path,
                "name": filename,
                "folder": folder_label,
                "mtime": stat.st_mtime,
                "size": stat.st_size,
                "ext": path.suffix.lower(),
            })

    return rows, root


@PromptServer.instance.routes.post("/image-gallery/output/pick-folder")
async def pick_output_video_folder(request):
    try:
        path = await asyncio.to_thread(_OUTPUT_PICK_FOLDER)
        return web.json_response({"path": path or ""})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.get("/image-gallery/output/list-folder")
async def list_folder_videos(request):
    try:
        folder = request.query.get("folder", "")
        rows, root = await asyncio.get_running_loop().run_in_executor(base._IO, _scan_folder, folder)
        return web.json_response({"videos": rows, "output": str(root)})
    except FileNotFoundError as exc:
        return web.json_response({"error": str(exc)}, status=404)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)
