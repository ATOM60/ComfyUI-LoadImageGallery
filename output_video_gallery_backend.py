import asyncio
import ctypes
import hashlib
import os
import shutil
import struct
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote, unquote

import folder_paths
from aiohttp import web
from server import PromptServer

try:
    from send2trash import send2trash
except Exception:
    send2trash = None

VIDEO_EXTENSIONS = {
    ".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v",
    ".mpg", ".mpeg", ".wmv", ".flv", ".ts", ".mts", ".m2ts",
}
_IO = ThreadPoolExecutor(max_workers=2)
_THUMBS = ThreadPoolExecutor(max_workers=2)
# CIG_OUTPUT_THUMB_SCHEDULER_V1
_THUMB_WORKERS_IDLE = 2
_THUMB_WORKERS_BUSY = 1          # while ComfyUI is executing a prompt
# A request waits at most _THUMB_WAIT seconds and then answers "busy"; the
# ffmpeg run itself keeps going (up to _THUMB_FFMPEG_LIMIT) so a slow
# thumbnail during inference is finished and cached for the client's retry
# instead of being killed and started over on every attempt.
_THUMB_WAIT = 20
_THUMB_FFMPEG_LIMIT = 180
_THUMB_BUSY_RETRY_SECONDS = 2
# A video modified this recently may still be being written by the workflow;
# a failed thumbnail for it is reported as "busy" (retry) rather than "none".
_THUMB_FRESH_SECONDS = 120
_FFMPEG = None
_FFMPEG_CHECKED = False


def _root() -> Path:
    return Path(folder_paths.get_output_directory()).resolve()


def _cache() -> Path:
    p = Path(folder_paths.get_user_directory()) / "image_gallery_video_cache"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _norm(value: str) -> str:
    return unquote(str(value or "")).replace("\\", "/").lstrip("/")


def _resolve(value: str, must_exist: bool = True) -> Path:
    rel = _norm(value)
    if not rel:
        raise ValueError("Пустой путь к видео")
    root = _root()
    path = (root / Path(rel)).resolve()
    try:
        if os.path.commonpath([str(root), str(path)]) != str(root):
            raise PermissionError("Путь находится вне папки ComfyUI output")
    except ValueError:
        raise PermissionError("Некорректный путь")
    if path.suffix.lower() not in VIDEO_EXTENSIONS:
        raise ValueError("Неподдерживаемое расширение видео")
    if must_exist and (not path.exists() or not path.is_file()):
        raise FileNotFoundError(rel)
    return path


def _rel(path: Path) -> str:
    return path.resolve().relative_to(_root()).as_posix()


def _find_ffmpeg():
    global _FFMPEG, _FFMPEG_CHECKED
    if _FFMPEG_CHECKED:
        return _FFMPEG
    _FFMPEG_CHECKED = True
    _FFMPEG = shutil.which("ffmpeg")
    if _FFMPEG:
        return _FFMPEG
    try:
        import imageio_ffmpeg
        p = imageio_ffmpeg.get_ffmpeg_exe()
        if p and os.path.isfile(p):
            _FFMPEG = p
    except Exception:
        pass
    return _FFMPEG


def _thumb_path(video: Path) -> Path:
    try:
        st = video.stat()
        stamp = f"{video}:{st.st_mtime_ns}:{st.st_size}"
    except OSError:
        stamp = str(video)
    return _cache() / (hashlib.sha1(stamp.encode("utf-8", "ignore")).hexdigest() + ".jpg")


class _ThumbTransientError(Exception):
    """Thumbnail could not be made right now (timeout under load); retry later."""


def _low_priority_command(cmd: list[str]) -> list[str]:
    if sys.platform != "win32":
        nice = shutil.which("nice")
        if nice:
            return [nice, "-n", "10", *cmd]
    return cmd


def _low_priority_flags() -> int:
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    # Thumbnails must never compete with inference for CPU time.
    flags |= getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0)
    return flags


def _cached_thumb(video: Path):
    thumb = _thumb_path(video)
    try:
        if thumb.stat().st_size:
            return thumb
    except OSError:
        pass
    return None


_THUMB_ERRORS = {}          # str(video) -> why the last thumbnail attempt failed
_THUMB_ERRORS_LIMIT = 500


def _thumb_error(video: Path):
    return _THUMB_ERRORS.get(str(video))


def _set_thumb_error(video: Path, reason: str):
    key = str(video)
    if key not in _THUMB_ERRORS:
        print(f"[ImageGallery] Output video thumbnail failed: {video}: {reason}")
    _THUMB_ERRORS.pop(key, None)
    _THUMB_ERRORS[key] = reason
    while len(_THUMB_ERRORS) > _THUMB_ERRORS_LIMIT:
        _THUMB_ERRORS.pop(next(iter(_THUMB_ERRORS)))


def _run_thumb_ffmpeg(ffmpeg: str, video: Path, tmp: Path, seek: list[str]) -> str:
    """Write one frame of *video* to *tmp*; return ffmpeg's error text ("" on success)."""
    proc = subprocess.run(_low_priority_command([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin",
        "-threads", "1", *seek, "-i", str(video),
        "-an", "-sn", "-dn", "-frames:v", "1", "-filter_threads", "1",
        "-vf", "scale='min(640,iw)':-2", "-q:v", "3", "-y", str(tmp),
    ]), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=_THUMB_FFMPEG_LIMIT,
       check=False, creationflags=_low_priority_flags())
    if tmp.exists() and tmp.stat().st_size:
        return ""
    text = proc.stderr.decode("utf-8", "replace").strip() if proc.stderr else ""
    return text or f"ffmpeg exited with code {proc.returncode} and wrote no frame"


def _make_thumb(video: Path):
    thumb = _cached_thumb(video)
    if thumb:
        return thumb
    thumb = _thumb_path(video)
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        _set_thumb_error(video, "ffmpeg not found (not in PATH and imageio-ffmpeg is not installed)")
        return None
    tmp = thumb.with_suffix(".tmp.jpg")
    error = ""
    try:
        # Frame at 0.25 s skips a black/blank first frame; videos shorter than
        # that have no frame there, so fall back to the very first frame.
        for seek in (["-ss", "0.25"], []):
            error = _run_thumb_ffmpeg(ffmpeg, video, tmp, seek)
            if not error:
                tmp.replace(thumb)
                _THUMB_ERRORS.pop(str(video), None)
                return thumb
    except subprocess.TimeoutExpired:
        raise _ThumbTransientError("thumbnail timed out")
    except Exception as e:
        error = f"{type(e).__name__}: {e}"
    finally:
        if tmp.exists():
            try: tmp.unlink()
            except OSError: pass
    if _recently_modified(video):
        raise _ThumbTransientError("video may still be being written")
    lines = [line.strip() for line in error.splitlines() if line.strip()]
    _set_thumb_error(video, " | ".join(lines[-3:])[:400] or "unknown error")
    return None


def _recently_modified(video: Path) -> bool:
    try:
        return time.time() - video.stat().st_mtime < _THUMB_FRESH_SECONDS
    except OSError:
        return False


def _comfy_busy() -> bool:
    try:
        return bool(getattr(PromptServer.instance.prompt_queue, "currently_running", None))
    except Exception:
        return False


def _request_gone(request) -> bool:
    transport = getattr(request, "transport", None)
    return transport is None or transport.is_closing()


_ABANDONED = object()
_BUSY = object()


class _ThumbScheduler:
    """Newest-first thumbnail queue.

    The most recent request is usually the card the user is looking at, so it
    runs first. Identical requests share one ffmpeg run, and jobs whose
    clients have all disconnected (scrolled away, gallery closed) are dropped
    before ffmpeg is started. Concurrency drops to one while a prompt runs.
    """

    def __init__(self):
        self.active = 0
        self.stack = []
        self.jobs = {}

    def limit(self) -> int:
        return _THUMB_WORKERS_BUSY if _comfy_busy() else _THUMB_WORKERS_IDLE

    async def get(self, video: Path, request):
        loop = asyncio.get_running_loop()
        key = str(video)
        job = self.jobs.get(key)
        if job is None:
            # Keyed by id(): aiohttp requests are mappings and therefore unhashable.
            job = {"key": key, "video": video, "future": loop.create_future(), "requests": {}}
            self.jobs[key] = job
            self.stack.append(job)
        elif job in self.stack:
            self.stack.remove(job)
            self.stack.append(job)
        job["requests"][id(request)] = request
        self._pump()
        try:
            return await asyncio.shield(job["future"])
        finally:
            job["requests"].pop(id(request), None)

    def _finish(self, job, result):
        self.jobs.pop(job["key"], None)
        if not job["future"].done():
            job["future"].set_result(result)

    def _pump(self):
        while self.stack and self.active < self.limit():
            job = self.stack.pop()
            if not job["requests"] or all(_request_gone(r) for r in job["requests"].values()):
                self._finish(job, _ABANDONED)
                continue
            self.active += 1
            asyncio.ensure_future(self._run(job))

    async def _run(self, job):
        result = None
        try:
            result = await asyncio.get_running_loop().run_in_executor(_THUMBS, _make_thumb, job["video"])
        except _ThumbTransientError:
            result = _BUSY
        except Exception:
            result = None
        finally:
            self.active -= 1
            self._finish(job, result)
            self._pump()


_THUMB_SCHEDULER = _ThumbScheduler()


def _scan():
    root = _root()
    rows = []
    if not root.exists():
        return rows
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort(key=str.lower)
        for filename in filenames:
            p = Path(dirpath) / filename
            if p.suffix.lower() not in VIDEO_EXTENSIONS:
                continue
            try: st = p.stat()
            except OSError: continue
            rows.append({
                "path": p.relative_to(root).as_posix(), "name": filename,
                "folder": p.parent.relative_to(root).as_posix() if p.parent != root else "",
                "mtime": st.st_mtime, "size": st.st_size, "ext": p.suffix.lower(),
            })
    return rows


def _clipboard(paths: list[Path]) -> int:
    if sys.platform != "win32":
        raise RuntimeError("Копирование файлов в системный буфер реализовано только для Windows")
    if not paths:
        raise ValueError("Не выбраны видео")
    payload = struct.pack("<IiiII", 20, 0, 0, 0, 1) + ("\0".join(str(p.resolve()) for p in paths) + "\0\0").encode("utf-16le")
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32.GlobalAlloc.argtypes = [ctypes.c_uint, ctypes.c_size_t]; kernel32.GlobalAlloc.restype = ctypes.c_void_p
    kernel32.GlobalLock.argtypes = [ctypes.c_void_p]; kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]; kernel32.GlobalFree.argtypes = [ctypes.c_void_p]
    user32.OpenClipboard.argtypes = [ctypes.c_void_p]; user32.OpenClipboard.restype = ctypes.c_bool
    user32.SetClipboardData.argtypes = [ctypes.c_uint, ctypes.c_void_p]; user32.SetClipboardData.restype = ctypes.c_void_p
    user32.RegisterClipboardFormatW.argtypes = [ctypes.c_wchar_p]; user32.RegisterClipboardFormatW.restype = ctypes.c_uint
    def alloc(data: bytes):
        h = kernel32.GlobalAlloc(2, len(data))
        if not h: raise OSError(ctypes.get_last_error(), "GlobalAlloc failed")
        ptr = kernel32.GlobalLock(h)
        if not ptr: kernel32.GlobalFree(h); raise OSError(ctypes.get_last_error(), "GlobalLock failed")
        try: ctypes.memmove(ptr, data, len(data))
        finally: kernel32.GlobalUnlock(h)
        return h
    opened = False
    for _ in range(20):
        if user32.OpenClipboard(None): opened = True; break
        time.sleep(.025)
    if not opened: raise RuntimeError("Не удалось открыть буфер обмена Windows. Попробуйте ещё раз")
    hdrop = heffect = None; own_drop = own_effect = False
    try:
        if not user32.EmptyClipboard(): raise OSError(ctypes.get_last_error(), "EmptyClipboard failed")
        hdrop = alloc(payload)
        if not user32.SetClipboardData(15, hdrop): raise OSError(ctypes.get_last_error(), "SetClipboardData(CF_HDROP) failed")
        own_drop = True
        fmt = user32.RegisterClipboardFormatW("Preferred DropEffect")
        if fmt:
            heffect = alloc(struct.pack("<I", 1))
            if user32.SetClipboardData(fmt, heffect): own_effect = True
    finally:
        user32.CloseClipboard()
        if hdrop and not own_drop: kernel32.GlobalFree(hdrop)
        if heffect and not own_effect: kernel32.GlobalFree(heffect)
    return len(paths)


@PromptServer.instance.routes.get("/image-gallery/output/list")
async def list_videos(request):
    try:
        rows = await asyncio.get_running_loop().run_in_executor(_IO, _scan)
        return web.json_response({"videos": rows, "output": str(_root())})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.get("/image-gallery/output/video")
async def video_file(request):
    try:
        return web.FileResponse(_resolve(request.query.get("path", "")), headers={"Cache-Control": "no-cache"})
    except PermissionError as e: return web.Response(status=403, text=str(e))
    except FileNotFoundError: return web.Response(status=404, text="Видео не найдено")
    except Exception as e: return web.Response(status=400, text=str(e))


@PromptServer.instance.routes.get("/image-gallery/output/thumb")
async def video_thumb(request):
    try:
        path = _resolve(request.query.get("path", ""))
        thumb = await asyncio.to_thread(_cached_thumb, path)
        if not thumb:
            try:
                thumb = await asyncio.wait_for(_THUMB_SCHEDULER.get(path, request), _THUMB_WAIT)
            except asyncio.TimeoutError:
                thumb = _BUSY   # ffmpeg keeps running; the retry picks up the result
        if thumb is _ABANDONED or thumb is _BUSY:
            # Not an error: the client went away, or the machine is too busy.
            return web.Response(status=503, headers={"Retry-After": str(_THUMB_BUSY_RETRY_SECONDS), "Cache-Control": "no-store"})
        if not thumb:
            return _no_thumb(_thumb_error(path) or "no thumbnail")
        return web.FileResponse(thumb, headers={"Cache-Control": "public, max-age=604800"})
    except Exception as e:
        return _no_thumb(f"{type(e).__name__}: {e}")


def _no_thumb(reason: str):
    # The reason is shown as the tooltip of the card's fallback icon.
    return web.Response(status=204, headers={
        "Cache-Control": "no-store",
        "X-CIG-Thumb-Error": quote(str(reason)[:400], safe=" :/()|,.-_"),
        "Access-Control-Expose-Headers": "X-CIG-Thumb-Error",
    })


@PromptServer.instance.routes.post("/image-gallery/output/clipboard")
async def copy_videos(request):
    try:
        data = await request.json(); paths = [_resolve(p) for p in (data.get("paths") or [])]
        count = await asyncio.get_running_loop().run_in_executor(_IO, _clipboard, paths)
        return web.json_response({"status": "ok", "count": count})
    except Exception as e: return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.post("/image-gallery/output/rename")
async def rename_video(request):
    try:
        data = await request.json(); src = _resolve(data.get("path", "")); name = os.path.basename(str(data.get("new_name", "")).strip())
        if not name or name in {".", ".."}: return web.json_response({"error": "Некорректное имя"}, status=400)
        if Path(name).suffix.lower() not in VIDEO_EXTENSIONS: name += src.suffix
        dst = src.with_name(name)
        if dst.exists(): return web.json_response({"error": "Файл с таким именем уже существует"}, status=409)
        src.rename(dst)
        return web.json_response({"status": "ok", "path": _rel(dst), "name": dst.name})
    except PermissionError as e: return web.json_response({"error": str(e)}, status=403)
    except Exception as e: return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.post("/image-gallery/output/delete")
async def delete_videos(request):
    try:
        data = await request.json(); raw = data.get("paths") or []
        deleted, errors = [], []
        def work():
            for rel in raw:
                try:
                    p = _resolve(rel)
                    if send2trash is not None: send2trash(str(p))
                    else: p.unlink()
                    deleted.append(rel)
                except Exception as e: errors.append({"path": rel, "error": str(e)})
        await asyncio.get_running_loop().run_in_executor(_IO, work)
        return web.json_response({"status": "ok", "deleted": deleted, "errors": errors, "recycle_bin": send2trash is not None})
    except Exception as e: return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.post("/image-gallery/output/reveal")
async def reveal_video(request):
    try:
        data = await request.json(); path = _resolve(data.get("path", ""))
        def reveal():
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            if sys.platform == "win32": subprocess.Popen(["explorer", "/select,", str(path)], creationflags=flags)
            elif sys.platform == "darwin": subprocess.Popen(["open", "-R", str(path)])
            else: subprocess.Popen(["xdg-open", str(path.parent)])
        await asyncio.get_running_loop().run_in_executor(_IO, reveal)
        return web.json_response({"status": "ok"})
    except Exception as e: return web.json_response({"error": str(e)}, status=500)
