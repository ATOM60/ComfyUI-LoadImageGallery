import asyncio
import hashlib
import os
import subprocess
import threading
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
_PROXY_LOCK = threading.Lock()
_PROXY_CACHE_LIMIT = 5 * 1024 * 1024 * 1024


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

    return rows, root


def _proxy_cache() -> Path:
    path = base._cache() / "browser_proxy"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _proxy_path(source: Path) -> Path:
    st = source.stat()
    stamp = f"{source.resolve()}|{st.st_mtime_ns}|{st.st_size}"
    digest = hashlib.sha256(stamp.encode("utf-8", "surrogatepass")).hexdigest()
    return _proxy_cache() / f"{digest}.mp4"


def _cleanup_proxy_cache(keep: Path | None = None):
    try:
        files = [p for p in _proxy_cache().glob("*.mp4") if p.is_file()]
        total = sum(p.stat().st_size for p in files)
        if total <= _PROXY_CACHE_LIMIT:
            return
        files.sort(key=lambda p: p.stat().st_mtime)
        for path in files:
            if keep is not None and path == keep:
                continue
            try:
                size = path.stat().st_size
                path.unlink()
                total -= size
            except OSError:
                pass
            if total <= _PROXY_CACHE_LIMIT:
                break
    except Exception:
        pass


def _run_proxy_ffmpeg(ffmpeg: str, source: Path, target: Path, use_nvenc: bool):
    common = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-i", str(source),
        "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    ]
    if use_nvenc:
        video_args = [
            "-c:v", "h264_nvenc", "-preset", "p4", "-cq", "21", "-b:v", "0",
            "-pix_fmt", "yuv420p",
        ]
    else:
        video_args = [
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
            "-pix_fmt", "yuv420p",
        ]
    cmd = common + video_args + [
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart",
        str(target),
    ]
    return subprocess.run(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=1800,
        check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def _ensure_browser_proxy(source: Path) -> Path:
    target = _proxy_path(source)
    if target.exists() and target.stat().st_size > 0:
        try:
            os.utime(target, None)
        except OSError:
            pass
        return target

    ffmpeg = base._find_ffmpeg()
    if not ffmpeg:
        raise RuntimeError("FFmpeg не найден — невозможно подготовить совместимый GPU-поток")

    with _PROXY_LOCK:
        if target.exists() and target.stat().st_size > 0:
            return target

        tmp = target.with_suffix(".tmp.mp4")
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass

        last_error = ""
        for use_nvenc in (True, False):
            try:
                result = _run_proxy_ffmpeg(ffmpeg, source, tmp, use_nvenc)
                last_error = (result.stderr or "").strip()
                if result.returncode == 0 and tmp.exists() and tmp.stat().st_size > 0:
                    tmp.replace(target)
                    _cleanup_proxy_cache(target)
                    return target
            except subprocess.TimeoutExpired:
                last_error = "превышено время подготовки видео"
            except Exception as exc:
                last_error = str(exc)
            try:
                tmp.unlink(missing_ok=True)
            except Exception:
                pass

        detail = last_error[-1200:] if last_error else "неизвестная ошибка FFmpeg"
        raise RuntimeError(f"Не удалось подготовить H.264 MP4: {detail}")


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


@PromptServer.instance.routes.post("/image-gallery/output/browser-proxy-prepare")
async def prepare_browser_proxy(request):
    try:
        data = await request.json()
        raw = str(data.get("path", ""))
        if not _raw_path(raw).startswith(_EXTERNAL_PREFIX):
            return web.json_response({"error": "Прокси разрешён только для внешних видео"}, status=400)
        source = _resolve_extended(raw)
        proxy = await asyncio.to_thread(_ensure_browser_proxy, source)
        st = proxy.stat()
        return web.json_response({"status": "ok", "version": st.st_mtime_ns, "size": st.st_size})
    except FileNotFoundError as exc:
        return web.json_response({"error": str(exc)}, status=404)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.get("/image-gallery/output/browser-proxy")
async def browser_proxy_file(request):
    try:
        raw = request.query.get("path", "")
        if not _raw_path(raw).startswith(_EXTERNAL_PREFIX):
            return web.Response(status=400, text="Прокси разрешён только для внешних видео")
        source = _resolve_extended(raw)
        proxy = await asyncio.to_thread(_ensure_browser_proxy, source)
        return web.FileResponse(
            proxy,
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )
    except FileNotFoundError:
        return web.Response(status=404, text="Видео не найдено")
    except Exception as exc:
        return web.Response(status=500, text=str(exc))


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
