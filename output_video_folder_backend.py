import asyncio
import hashlib
import os
from pathlib import Path
from urllib.parse import unquote

from aiohttp import web
from server import PromptServer

from . import image_gallery_core as gallery_core
from . import output_video_gallery_backend as base


# Capture the original Explorer-style Windows picker before any optional shared
# picker override can replace it. Output Gallery keeps the familiar Explorer UI.
_OUTPUT_PICK_FOLDER = gallery_core._pick_folder_native
_ORIGINAL_RESOLVE = base._resolve
_ORIGINAL_REL = base._rel

# Do not send Windows absolute paths (drive letters, backslashes, UNC paths) as
# the gallery's item id. A stable opaque token is safer for <video> URLs and is
# also reused by copy/rename/delete/reveal/CPU playback through base._resolve.
_EXTERNAL_PREFIX = "__cig_external__/"
_EXTERNAL_PATHS: dict[str, Path] = {}


def _raw_path(value: str) -> str:
    return unquote(str(value or "")).strip().replace("\\", "/")


def _is_absolute(value: str) -> bool:
    raw = _raw_path(value)
    if not raw:
        return False
    if len(raw) >= 3 and raw[0].isalpha() and raw[1] == ":" and raw[2] == "/":
        return True
    if raw.startswith("//"):
        return True
    try:
        return os.path.isabs(os.path.expanduser(raw))
    except Exception:
        return False


def _external_token(path: Path) -> str:
    resolved = path.resolve()
    key = str(resolved)
    # Windows paths are case-insensitive in normal ComfyUI use; casefold keeps
    # the id stable if Explorer returns the same path with different casing.
    digest = hashlib.sha256(key.casefold().encode("utf-8", "surrogatepass")).hexdigest()[:32]
    token = f"{_EXTERNAL_PREFIX}{digest}"
    _EXTERNAL_PATHS[token] = resolved
    return token


def _resolve_external_token(raw: str, must_exist: bool = True) -> Path:
    path = _EXTERNAL_PATHS.get(raw)
    if path is None:
        raise FileNotFoundError(raw)
    if path.suffix.lower() not in base.VIDEO_EXTENSIONS:
        raise ValueError("Неподдерживаемое расширение видео")
    if must_exist and (not path.exists() or not path.is_file()):
        raise FileNotFoundError(str(path))
    return path


def _resolve_extended(value: str, must_exist: bool = True) -> Path:
    raw = _raw_path(value)
    if raw.startswith(_EXTERNAL_PREFIX):
        return _resolve_external_token(raw, must_exist)

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
        return _external_token(path)


# Existing output routes resolve globals at call time. Extending these helpers
# therefore gives token-based external support to video/thumb/copy/rename/delete/
# reveal and to the CPU stream without duplicating those routes.
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
        filenames.sort(key=str.lower)
        for filename in filenames:
            path = Path(dirpath) / filename
            if path.suffix.lower() not in base.VIDEO_EXTENSIONS:
                continue
            try:
                stat = path.stat()
            except OSError:
                continue

            stored_path = (
                path.relative_to(output_root).as_posix()
                if use_output_relative
                else _external_token(path)
            )

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

    # Keep scan order deterministic. Auto-refresh signatures are order-sensitive,
    # so an unstable os.walk/file-system order must never cause a false refresh
    # that tears down an active external player.
    rows.sort(key=lambda row: str(row.get("path") or "").casefold())
    return rows, root


@PromptServer.instance.routes.post("/image-gallery/output/pick-folder")
async def pick_output_video_folder(request):
    try:
        path = await asyncio.to_thread(_OUTPUT_PICK_FOLDER)
        return web.json_response({"path": path or ""})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.get("/image-gallery/output/video-folder")
async def external_video_file(request):
    try:
        path = _resolve_extended(request.query.get("path", ""))
        return web.FileResponse(path, headers={"Cache-Control": "no-cache"})
    except FileNotFoundError:
        return web.Response(status=404, text="Видео не найдено")
    except PermissionError as exc:
        return web.Response(status=403, text=str(exc))
    except Exception as exc:
        return web.Response(status=400, text=str(exc))


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
