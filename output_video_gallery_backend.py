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
from urllib.parse import unquote

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


def _make_thumb(video: Path):
    thumb = _thumb_path(video)
    if thumb.exists() and thumb.stat().st_size:
        return thumb
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        return None
    tmp = thumb.with_suffix(".tmp.jpg")
    try:
        subprocess.run([
            ffmpeg, "-hide_banner", "-loglevel", "error", "-ss", "0.25",
            "-i", str(video), "-frames:v", "1", "-vf", "scale='min(640,iw)':-2",
            "-q:v", "3", "-y", str(tmp),
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=25,
           check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if tmp.exists() and tmp.stat().st_size:
            tmp.replace(thumb)
            return thumb
    except Exception:
        pass
    finally:
        if tmp.exists():
            try: tmp.unlink()
            except OSError: pass
    return None


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
        thumb = await asyncio.get_running_loop().run_in_executor(_THUMBS, _make_thumb, path)
        return web.Response(status=204) if not thumb else web.FileResponse(thumb, headers={"Cache-Control": "public, max-age=604800"})
    except Exception:
        return web.Response(status=204)


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
