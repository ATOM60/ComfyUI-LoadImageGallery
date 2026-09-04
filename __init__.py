import asyncio
import json
import os
import shutil
import threading
import time
from pathlib import Path

from aiohttp import web
from PIL import Image, ImageOps

import folder_paths
from nodes import LoadImage
from server import PromptServer

WEB_DIRECTORY = "./web"

THUMB_SIZE = 320
THUMB_QUALITY = 72
CACHE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024
CACHE_SWEEP_INTERVAL = 600
_cache_lock = threading.Lock()
_last_cache_sweep = 0.0


def _norm_rel(path: str) -> str:
    path = (path or "").replace("\\", "/").strip("/")
    if not path or path == ".":
        return ""
    parts = [p for p in path.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise ValueError("Invalid path")
    return "/".join(parts)


def _input_root() -> str:
    return os.path.abspath(folder_paths.get_input_directory())


def _cache_root() -> str:
    root = os.path.join(folder_paths.get_temp_directory(), "image_gallery_cache")
    os.makedirs(root, exist_ok=True)
    return os.path.abspath(root)


def _safe_under(root: str, rel: str) -> str:
    root = os.path.abspath(root)
    rel = _norm_rel(rel)
    full = os.path.abspath(os.path.join(root, rel.replace("/", os.sep)))
    if os.path.commonpath((root, full)) != root:
        raise ValueError("Invalid path")
    return full


def _safe_input_dir(rel: str) -> str:
    return _safe_under(_input_root(), rel)


def _safe_input_file(folder: str, filename: str) -> tuple[str, str]:
    folder = _norm_rel(folder)
    filename = _norm_rel(filename)
    if not filename or "/" in filename:
        raise ValueError("Invalid filename")
    rel = f"{folder}/{filename}" if folder else filename
    full = _safe_under(_input_root(), rel)
    if not os.path.isfile(full):
        raise FileNotFoundError(full)
    return full, rel


def _cache_paths(folder: str, filename: str) -> tuple[str, str]:
    folder = _norm_rel(folder)
    filename = _norm_rel(filename)
    if not filename or "/" in filename:
        raise ValueError("Invalid filename")
    cache_dir = _safe_under(_cache_root(), folder)
    os.makedirs(cache_dir, exist_ok=True)
    thumb = os.path.join(cache_dir, filename + ".cig.webp")
    meta = os.path.join(cache_dir, filename + ".cig.json")
    return thumb, meta


def _image_files_in_dir(full_dir: str):
    if not os.path.isdir(full_dir):
        return []
    names = [name for name in os.listdir(full_dir) if os.path.isfile(os.path.join(full_dir, name))]
    try:
        names = folder_paths.filter_files_content_types(names, ["image"])
    except Exception:
        exts = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
        names = [name for name in names if os.path.splitext(name)[1].lower() in exts]
    return sorted(names, key=str.casefold)


def _all_images_recursive():
    root = _input_root()
    result = []
    if not os.path.isdir(root):
        return result
    for current, dirs, _files in os.walk(root):
        dirs.sort(key=str.casefold)
        rel_dir = os.path.relpath(current, root)
        for name in _image_files_in_dir(current):
            rel = name if rel_dir == "." else os.path.join(rel_dir, name)
            result.append(rel.replace("\\", "/"))
    return sorted(result, key=str.casefold)


def _all_folders():
    root = _input_root()
    folders = [""]
    if not os.path.isdir(root):
        return folders
    for current, dirs, _files in os.walk(root):
        dirs.sort(key=str.casefold)
        rel_current = os.path.relpath(current, root)
        for name in dirs:
            rel = name if rel_current == "." else os.path.join(rel_current, name)
            folders.append(rel.replace("\\", "/"))
    return folders


def _read_meta(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _write_meta(path: str, data: dict):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def _thumb_valid(source: str, thumb: str, meta: str) -> bool:
    if not os.path.isfile(thumb) or not os.path.isfile(meta):
        return False
    try:
        st = os.stat(source)
        info = _read_meta(meta)
        return bool(info and info.get("size") == st.st_size and info.get("mtime_ns") == st.st_mtime_ns and info.get("thumb_size") == THUMB_SIZE)
    except Exception:
        return False


def _make_thumb(source: str, thumb: str, meta: str):
    st = os.stat(source)
    os.makedirs(os.path.dirname(thumb), exist_ok=True)
    tmp = thumb + ".tmp.webp"
    try:
        with Image.open(source) as im:
            try:
                im.seek(0)
            except Exception:
                pass
            im = ImageOps.exif_transpose(im)
            if im.mode not in ("RGB", "RGBA"):
                if "transparency" in im.info or im.mode in ("LA", "P"):
                    im = im.convert("RGBA")
                else:
                    im = im.convert("RGB")
            resampling = getattr(Image, "Resampling", Image).LANCZOS
            im.thumbnail((THUMB_SIZE, THUMB_SIZE), resampling)
            im.save(tmp, "WEBP", quality=THUMB_QUALITY, method=4)
        os.replace(tmp, thumb)
        _write_meta(meta, {"size": st.st_size, "mtime_ns": st.st_mtime_ns, "thumb_size": THUMB_SIZE})
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def _get_or_make_thumb(folder: str, filename: str) -> str:
    source, _rel = _safe_input_file(folder, filename)
    thumb, meta = _cache_paths(folder, filename)
    with _cache_lock:
        if not _thumb_valid(source, thumb, meta):
            for p in (thumb, meta):
                try:
                    if os.path.exists(p):
                        os.remove(p)
                except OSError:
                    pass
            _make_thumb(source, thumb, meta)
        try:
            now = time.time()
            os.utime(thumb, (now, now))
            os.utime(meta, (now, now))
        except OSError:
            pass
    _maybe_sweep_cache()
    return thumb


def _cleanup_orphans_for_folder(folder: str, live_names: list[str]):
    try:
        cache_dir = _safe_under(_cache_root(), folder)
        if not os.path.isdir(cache_dir):
            return
        live = set(live_names)
        for name in os.listdir(cache_dir):
            if name.endswith(".cig.webp"):
                original = name[:-9]
                if original not in live:
                    for suffix in (".cig.webp", ".cig.json"):
                        p = os.path.join(cache_dir, original + suffix)
                        try:
                            if os.path.isfile(p):
                                os.remove(p)
                        except OSError:
                            pass
    except Exception:
        pass


def _cache_entries():
    root = _cache_root()
    entries = []
    total = 0
    for current, _dirs, files in os.walk(root):
        for name in files:
            if not name.endswith(".cig.webp"):
                continue
            path = os.path.join(current, name)
            try:
                st = os.stat(path)
            except OSError:
                continue
            total += st.st_size
            entries.append((st.st_mtime, st.st_size, path))
    return total, entries


def _sweep_cache(force=False):
    global _last_cache_sweep
    now = time.time()
    if not force and now - _last_cache_sweep < CACHE_SWEEP_INTERVAL:
        return
    with _cache_lock:
        if not force and now - _last_cache_sweep < CACHE_SWEEP_INTERVAL:
            return
        _last_cache_sweep = now
        total, entries = _cache_entries()
        if total <= CACHE_LIMIT_BYTES:
            return
        entries.sort(key=lambda x: x[0])
        target = int(CACHE_LIMIT_BYTES * 0.90)
        for _mtime, size, thumb in entries:
            if total <= target:
                break
            meta = thumb[:-9] + ".cig.json"
            for p in (thumb, meta):
                try:
                    if os.path.isfile(p):
                        os.remove(p)
                except OSError:
                    pass
            total -= size


def _maybe_sweep_cache():
    try:
        _sweep_cache(False)
    except Exception:
        pass


def _cache_stats():
    total, entries = _cache_entries()
    return {"count": len(entries), "bytes": total, "limit_bytes": CACHE_LIMIT_BYTES}


def _clear_cache():
    root = _cache_root()
    with _cache_lock:
        shutil.rmtree(root, ignore_errors=True)
        os.makedirs(root, exist_ok=True)


class LoadImageGallery(LoadImage):
    @classmethod
    def INPUT_TYPES(cls):
        files = _all_images_recursive() or [""]
        return {
            "required": {
                "image": (
                    files,
                    {
                        "image_upload": True,
                        "allow_batch": False,
                        "tooltip": "Load an image from input. Use Preview folder to choose visually.",
                    },
                )
            }
        }

    CATEGORY = "image"
    DESCRIPTION = "Copy of Load Image with a cached visual folder gallery."


@PromptServer.instance.routes.get("/image-gallery/folders")
async def image_gallery_folders(request):
    try:
        return web.json_response({"folders": _all_folders()})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.get("/image-gallery/list")
async def image_gallery_list(request):
    try:
        folder = _norm_rel(request.query.get("folder", ""))
        full_dir = _safe_input_dir(folder)
        images = _image_files_in_dir(full_dir)
        await asyncio.to_thread(_cleanup_orphans_for_folder, folder, images)
        return web.json_response({"folder": folder, "images": images})
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.get("/image-gallery/thumb")
async def image_gallery_thumb(request):
    try:
        folder = _norm_rel(request.query.get("folder", ""))
        filename = request.query.get("filename", "")
        thumb = await asyncio.to_thread(_get_or_make_thumb, folder, filename)
        return web.FileResponse(thumb, headers={"Cache-Control": "private, max-age=86400"})
    except FileNotFoundError:
        return web.json_response({"error": "Source image not found"}, status=404)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.get("/image-gallery/cache/stats")
async def image_gallery_cache_stats(request):
    try:
        return web.json_response(await asyncio.to_thread(_cache_stats))
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.post("/image-gallery/cache/clear")
async def image_gallery_cache_clear(request):
    try:
        await asyncio.to_thread(_clear_cache)
        return web.json_response({"ok": True})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


NODE_CLASS_MAPPINGS = {"LoadImageGallery": LoadImageGallery}
NODE_DISPLAY_NAME_MAPPINGS = {"LoadImageGallery": "Load Image Gallery"}

try:
    _maybe_sweep_cache()
except Exception:
    pass
