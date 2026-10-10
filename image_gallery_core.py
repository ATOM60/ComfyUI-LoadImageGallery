import asyncio
import hashlib
import subprocess
import json
import os
import shutil
import threading
import time
from pathlib import Path

from aiohttp import web
from PIL import Image, ImageOps, ImageSequence
import numpy as np
import torch
import comfy.model_management
import node_helpers
import folder_paths
from nodes import LoadImage
from server import PromptServer

WEB_DIRECTORY = "./web"

THUMB_SIZE = 320
THUMB_QUALITY = 72
CACHE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024
CACHE_SWEEP_INTERVAL = 600
_cache_lock = threading.Lock()
_sets_lock = threading.Lock()
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
    root = os.path.join(folder_paths.get_user_directory(), "image_gallery_cache")
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
    folder_key = _cache_key(folder)
    filename = _norm_rel(filename)
    if not filename or "/" in filename:
        raise ValueError("Invalid filename")
    cache_dir = _safe_under(_cache_root(), folder_key)
    os.makedirs(cache_dir, exist_ok=True)
    thumb = os.path.join(cache_dir, filename + ".cig.webp")
    meta = os.path.join(cache_dir, filename + ".cig.json")
    return thumb, meta

# CIG_EXTERNAL_PATHS_V1
def _is_abs_path(path: str) -> bool:
    try:
        return bool(path) and os.path.isabs(os.path.expanduser(str(path)))
    except Exception:
        return False

def _normalize_gallery_folder(folder: str) -> str:
    raw = (folder or "").strip()
    if _is_abs_path(raw):
        return os.path.abspath(os.path.expanduser(raw))
    return _norm_rel(raw)

def _gallery_dir(folder: str) -> str:
    folder = _normalize_gallery_folder(folder)
    if _is_abs_path(folder):
        if not os.path.isdir(folder):
            raise FileNotFoundError(folder)
        return folder
    return _safe_input_dir(folder)

def _gallery_file(folder: str, filename: str) -> tuple[str, str]:
    folder = _normalize_gallery_folder(folder)
    filename = _norm_rel(filename)
    if not filename or "/" in filename:
        raise ValueError("Invalid filename")
    base = _gallery_dir(folder)
    full = os.path.abspath(os.path.join(base, filename))
    if os.path.commonpath((os.path.abspath(base), full)) != os.path.abspath(base):
        raise ValueError("Invalid filename")
    if not os.path.isfile(full):
        raise FileNotFoundError(full)
    rel = Path(full).as_posix() if _is_abs_path(folder) else (f"{folder}/{filename}" if folder else filename)
    return full, rel

def _cache_key(folder: str) -> str:
    folder = _normalize_gallery_folder(folder)
    if _is_abs_path(folder):
        key = hashlib.sha256(os.path.normcase(folder).encode("utf-8")).hexdigest()
        return f"_external/{key}"
    return _norm_rel(folder)

def _is_image_file(path: str) -> bool:
    if not os.path.isfile(path):
        return False
    name = os.path.basename(path)
    try:
        return name in folder_paths.filter_files_content_types([name], ["image"])
    except Exception:
        return os.path.splitext(name)[1].lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}

class _ImagePathOptions(list):
    def __contains__(self, value):
        if super().__contains__(value):
            return True
        try:
            path = os.path.abspath(os.path.expanduser(str(value)))
            return _is_abs_path(str(value)) and _is_image_file(path)
        except Exception:
            return False

def _pick_folder_native() -> str:
    if os.name == "nt":
        script = """Add-Type -AssemblyName System.Windows.Forms; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; [System.Windows.Forms.Application]::EnableVisualStyles(); $d=New-Object System.Windows.Forms.OpenFileDialog; $d.Title="Select image folder"; $d.ValidateNames=$false; $d.CheckFileExists=$false; $d.CheckPathExists=$true; $d.FileName="Select this folder"; $d.Filter="Folders|*.folder"; $d.RestoreDirectory=$true; if($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::Write((Split-Path -LiteralPath $d.FileName -Parent))}"""
        result = subprocess.run(["powershell.exe", "-NoProfile", "-STA", "-WindowStyle", "Hidden", "-Command", script], capture_output=True, text=True, encoding="utf-8", errors="replace")
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "Folder picker failed")
        return result.stdout.strip()
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        try:
            root.attributes("-topmost", True)
        except Exception:
            pass
        path = filedialog.askdirectory(title="Select image folder", mustexist=True)
        root.destroy()
        return path or ""
    except Exception as exc:
        raise RuntimeError(f"Native folder picker is unavailable: {exc}")

def _normalize_high_bit_grayscale(image):
    if image.mode.startswith("I;16") or image.mode == "I":
        # Pillow clips high-bit grayscale when converting directly to RGB.
        return image.point(lambda x: x * (1 / 257)).convert("L")
    return image


def _load_external_image(path: str):
    dtype = comfy.model_management.intermediate_dtype()
    device = comfy.model_management.intermediate_device()
    img = node_helpers.pillow(Image.open, path)
    output_images = []
    output_masks = []
    w = h = None
    for frame in ImageSequence.Iterator(img):
        frame = node_helpers.pillow(ImageOps.exif_transpose, frame)
        frame = _normalize_high_bit_grayscale(frame)
        rgb = frame.convert("RGB")
        if w is None:
            w, h = rgb.size
        if rgb.size != (w, h):
            continue
        arr = np.array(rgb).astype(np.float32) / 255.0
        image = torch.from_numpy(arr)[None,].to(dtype=dtype)
        if "A" in frame.getbands():
            mask_arr = np.array(frame.getchannel("A")).astype(np.float32) / 255.0
            mask = 1.0 - torch.from_numpy(mask_arr)
        else:
            mask = torch.zeros((64, 64), dtype=torch.float32, device="cpu")
        output_images.append(image)
        output_masks.append(mask.unsqueeze(0).to(dtype=dtype))
    if not output_images:
        raise ValueError(f"Unable to load image: {path}")
    return (torch.cat(output_images, dim=0).to(device=device, dtype=dtype), torch.cat(output_masks, dim=0).to(device=device, dtype=dtype))

def _filter_image_names(names: list[str]) -> list[str]:
    try:
        names = folder_paths.filter_files_content_types(names, ["image"])
    except Exception:
        exts = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
        names = [name for name in names if os.path.splitext(name)[1].lower() in exts]
    return sorted(names, key=str.casefold)


def _image_files_in_dir(full_dir: str):
    if not os.path.isdir(full_dir):
        return []
    names = [name for name in os.listdir(full_dir) if os.path.isfile(os.path.join(full_dir, name))]
    return _filter_image_names(names)


# CIG_RECURSIVE_LIST_V1
# "Include subfolders" lists every image below a folder. Names are relative to
# that folder ("sub/a.png"), so the client keeps addressing images as
# folder + name. The walk is bounded because an external folder may be a
# whole drive.
RECURSIVE_IMAGE_LIMIT = 20000
RECURSIVE_TIME_LIMIT = 15.0
_SKIP_DIRS = {"system volume information", "$recycle.bin"}


def _image_items_recursive(full_dir: str):
    images, items = [], []
    truncated = False
    deadline = time.monotonic() + RECURSIVE_TIME_LIMIT
    for current, dirs, files in os.walk(full_dir):
        dirs[:] = sorted((d for d in dirs if not d.startswith(".") and d.casefold() not in _SKIP_DIRS), key=str.casefold)
        rel_dir = os.path.relpath(current, full_dir)
        prefix = "" if rel_dir == "." else Path(rel_dir).as_posix() + "/"
        for name in _filter_image_names(files):
            try:
                st = os.stat(os.path.join(current, name))
                size, mtime = st.st_size, st.st_mtime
            except OSError:
                size = mtime = 0
            images.append(prefix + name)
            items.append({"name": prefix + name, "size": size, "mtime": mtime})
            if len(images) >= RECURSIVE_IMAGE_LIMIT:
                return images, items, True
        if time.monotonic() > deadline:
            truncated = True
            break
    return images, items, truncated


# CIG_SORT_METADATA_V1
def _image_items_in_dir(full_dir: str, names: list[str]):
    items = []
    for name in names:
        try:
            st = os.stat(os.path.join(full_dir, name))
            items.append({"name": name, "size": st.st_size, "mtime": st.st_mtime})
        except OSError:
            items.append({"name": name, "size": 0, "mtime": 0})
    return items

# CIG_SUBFOLDERS_V1
def _subfolders_in_dir(full_dir: str):
    if not os.path.isdir(full_dir):
        return []
    try:
        names = [name for name in os.listdir(full_dir) if os.path.isdir(os.path.join(full_dir, name))]
    except OSError:
        return []
    return sorted(names, key=str.casefold)

# CIG_FOLDER_PREVIEW_V1
FOLDER_PREVIEW_LIMIT = 4
FOLDER_PREVIEW_MAX_DIRS = 32


def _child_gallery_folder(parent: str, name: str) -> str:
    if _is_abs_path(parent):
        return os.path.join(parent, name)
    return f"{parent}/{name}" if parent else name


def _client_gallery_folder(folder: str) -> str:
    return Path(folder).as_posix() if _is_abs_path(folder) else folder


def _folder_preview(folder: str, limit: int = FOLDER_PREVIEW_LIMIT):
    """Pick up to `limit` images for a folder card.

    Images directly inside the folder win. A folder that only contains
    subfolders borrows images from them (breadth-first, bounded), so container
    folders still get a meaningful preview without walking a whole tree.
    """
    folder = _normalize_gallery_folder(folder)
    full_dir = _gallery_dir(folder)
    direct = _image_files_in_dir(full_dir)
    picks = [{"folder": _client_gallery_folder(folder), "filename": name} for name in direct[:limit]]
    if not picks:
        queue = [(_child_gallery_folder(folder, sub), os.path.join(full_dir, sub)) for sub in _subfolders_in_dir(full_dir)]
        visited = 0
        while queue and len(picks) < limit and visited < FOLDER_PREVIEW_MAX_DIRS:
            rel, full = queue.pop(0)
            visited += 1
            for name in _image_files_in_dir(full)[: limit - len(picks)]:
                picks.append({"folder": _client_gallery_folder(rel), "filename": name})
            queue.extend((_child_gallery_folder(rel, sub), os.path.join(full, sub)) for sub in _subfolders_in_dir(full))
    return {"images": picks, "count": len(direct), "nested": bool(picks) and not direct}


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
            im = _normalize_high_bit_grayscale(im)
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
    source, _rel = _gallery_file(folder, filename)
    thumb, meta = _cache_paths(folder, filename)
    # Keep thumbnail decode serialized. During inference, several concurrent
    # Pillow decodes in the ComfyUI process can compete with the active job and
    # make gallery images appear to stall or open unreliably.
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
        cache_dir = _safe_under(_cache_root(), _cache_key(folder))
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


# CIG_IMAGE_SETS_V1
def _sets_file() -> str:
    return os.path.join(folder_paths.get_user_directory(), "image_gallery_sets.json")


def _normalize_set_path(value) -> str:
    raw = str(value or "").replace("\\", "/").strip()
    if not raw:
        return ""
    if _is_abs_path(raw):
        return Path(os.path.abspath(os.path.expanduser(raw))).as_posix()
    return _norm_rel(raw)


def _clean_set_images(values) -> list[str]:
    if not isinstance(values, list):
        raise ValueError("images must be a list")
    result = []
    seen = set()
    for value in values:
        path = _normalize_set_path(value)
        if path and path not in seen:
            seen.add(path)
            result.append(path)
    if len(result) > 10000:
        raise ValueError("Too many images in one set")
    return result


def _read_image_sets_unlocked() -> list[dict]:
    path = _sets_file()
    if not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    raw_sets = data.get("sets", []) if isinstance(data, dict) else []
    result = []
    seen_names = set()
    for item in raw_sets:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        key = name.casefold()
        if key in seen_names:
            continue
        seen_names.add(key)
        try:
            images = _clean_set_images(item.get("images", []))
        except Exception:
            images = []
        result.append({"name": name, "images": images})
    return result


def _write_image_sets_unlocked(sets: list[dict]):
    path = _sets_file()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + f".tmp.{os.getpid()}.{threading.get_ident()}"
    data = {"version": 1, "sets": sets}
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def _get_image_sets() -> list[dict]:
    with _sets_lock:
        return _read_image_sets_unlocked()


def _save_image_set(name: str, images: list, old_name: str = "") -> list[dict]:
    name = str(name or "").strip()
    old_name = str(old_name or "").strip()
    if not name:
        raise ValueError("Set name is required")
    if len(name) > 120:
        raise ValueError("Set name is too long")
    clean_images = _clean_set_images(images)
    with _sets_lock:
        sets = _read_image_sets_unlocked()
        old_key = old_name.casefold() if old_name else None
        new_key = name.casefold()
        updated = []
        replaced = False
        for item in sets:
            key = item["name"].casefold()
            if old_key and key == old_key:
                if not replaced:
                    updated.append({"name": name, "images": clean_images})
                    replaced = True
                continue
            if key == new_key:
                if not replaced:
                    updated.append({"name": name, "images": clean_images})
                    replaced = True
                continue
            updated.append(item)
        if not replaced:
            updated.append({"name": name, "images": clean_images})
        _write_image_sets_unlocked(updated)
        return updated


def _delete_image_set(name: str) -> list[dict]:
    name = str(name or "").strip()
    if not name:
        raise ValueError("Set name is required")
    key = name.casefold()
    with _sets_lock:
        sets = [item for item in _read_image_sets_unlocked() if item["name"].casefold() != key]
        _write_image_sets_unlocked(sets)
        return sets


class LoadImageGallery(LoadImage):
    @classmethod
    def INPUT_TYPES(cls):
        files = _ImagePathOptions(_all_images_recursive() or [""])
        return {"required": {"image": (files, {"image_upload": True, "allow_batch": False, "tooltip": "Load an image from input or an absolute path. Use the gallery to choose visually."})}}

    CATEGORY = "image"
    DESCRIPTION = "Load images from ComfyUI input or any absolute folder with a cached visual gallery."

    def load_image(self, image):
        if _is_abs_path(image):
            path = os.path.abspath(os.path.expanduser(str(image)))
            if not _is_image_file(path):
                raise FileNotFoundError(path)
            return _load_external_image(path)
        return super().load_image(image)

    @classmethod
    def IS_CHANGED(cls, image):
        if _is_abs_path(image):
            path = os.path.abspath(os.path.expanduser(str(image)))
            m = hashlib.sha256()
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b""):
                    m.update(chunk)
            return m.hexdigest()
        return super().IS_CHANGED(image)

    @classmethod
    def VALIDATE_INPUTS(cls, image):
        if _is_abs_path(image):
            path = os.path.abspath(os.path.expanduser(str(image)))
            return True if _is_image_file(path) else f"Invalid image file: {image}"
        return super().VALIDATE_INPUTS(image)


@PromptServer.instance.routes.get("/image-gallery/sets")
async def image_gallery_sets_list(request):
    try:
        sets = await asyncio.to_thread(_get_image_sets)
        return web.json_response({"sets": sets})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.post("/image-gallery/sets/save")
async def image_gallery_sets_save(request):
    try:
        data = await request.json()
        sets = await asyncio.to_thread(
            _save_image_set,
            data.get("name", ""),
            data.get("images", []),
            data.get("old_name", ""),
        )
        return web.json_response({"ok": True, "sets": sets})
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.post("/image-gallery/sets/delete")
async def image_gallery_sets_delete(request):
    try:
        data = await request.json()
        sets = await asyncio.to_thread(_delete_image_set, data.get("name", ""))
        return web.json_response({"ok": True, "sets": sets})
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.get("/image-gallery/folders")
async def image_gallery_folders(request):
    try:
        return web.json_response({"folders": _all_folders()})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.get("/image-gallery/list")
async def image_gallery_list(request):
    try:
        folder = _normalize_gallery_folder(request.query.get("folder", ""))
        recursive = request.query.get("recursive", "") in ("1", "true")
        full_dir = _gallery_dir(folder)
        folders = _subfolders_in_dir(full_dir)
        truncated = False
        if recursive:
            images, items, truncated = await asyncio.to_thread(_image_items_recursive, full_dir)
            direct = [name for name in images if "/" not in name]
        else:
            images = _image_files_in_dir(full_dir)
            items = await asyncio.to_thread(_image_items_in_dir, full_dir, images)
            direct = images
        if not truncated:  # a cut-off list must not evict cached thumbnails
            await asyncio.to_thread(_cleanup_orphans_for_folder, folder, direct)
        return web.json_response({"folder": Path(folder).as_posix() if _is_abs_path(folder) else folder, "images": images, "items": items, "folders": folders, "recursive": recursive, "truncated": truncated})
    except FileNotFoundError as exc:
        return web.json_response({"error": f"Folder not found: {exc}"}, status=404)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.get("/image-gallery/folder-preview")
async def image_gallery_folder_preview(request):
    try:
        data = await asyncio.to_thread(_folder_preview, request.query.get("folder", ""))
        return web.json_response(data)
    except FileNotFoundError as exc:
        return web.json_response({"error": f"Folder not found: {exc}"}, status=404)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.get("/image-gallery/thumb")
async def image_gallery_thumb(request):
    try:
        folder = _normalize_gallery_folder(request.query.get("folder", ""))
        filename = request.query.get("filename", "")
        thumb = await asyncio.to_thread(_get_or_make_thumb, folder, filename)
        return web.FileResponse(thumb, headers={"Cache-Control": "private, max-age=86400"})
    except FileNotFoundError:
        return web.json_response({"error": "Source image not found"}, status=404)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)

@PromptServer.instance.routes.post("/image-gallery/pick-folder")
async def image_gallery_pick_folder(request):
    try:
        path = await asyncio.to_thread(_pick_folder_native)
        if not path:
            return web.json_response({"path": ""})
        path = os.path.abspath(os.path.expanduser(path))
        if not os.path.isdir(path):
            return web.json_response({"error": "Selected folder does not exist"}, status=400)
        return web.json_response({"path": Path(path).as_posix()})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)

# CIG_EXTERNAL_VIEW_V1
# The stock frontend previews the image widget's value through /view, splitting
# an absolute value like "E:/refs/a.png" into subfolder="E:/refs". ComfyUI's
# /view then fails with "Paths don't have the same drive" (a traceback per
# request) when that drive differs from ComfyUI's. Serve such absolute input
# images here instead, exactly like /image-gallery/source does.
def _external_view_path(filename: str, subfolder: str):
    filename = str(filename or "").replace("\\", "/")
    subfolder = str(subfolder or "")
    if _is_abs_path(subfolder):
        candidate = os.path.join(os.path.expanduser(subfolder), os.path.basename(filename))
    elif _is_abs_path(filename):
        candidate = filename
    else:
        return None
    candidate = os.path.abspath(os.path.expanduser(candidate))
    return candidate if _is_image_file(candidate) else None


@web.middleware
async def _external_view_middleware(request, handler):
    if request.method == "GET" and request.path in ("/view", "/api/view") and request.query.get("type") == "input":
        path = _external_view_path(request.query.get("filename", ""), request.query.get("subfolder", ""))
        if path:
            return web.FileResponse(path, headers={"Cache-Control": "private, max-age=60"})
    return await handler(request)


try:
    PromptServer.instance.app.middlewares.append(_external_view_middleware)
except Exception as exc:
    print(f"[ImageGallery] External image previews via /view are unavailable: {exc}")


@PromptServer.instance.routes.get("/image-gallery/source")
async def image_gallery_source(request):
    try:
        raw = request.query.get("path", "")
        if not _is_abs_path(raw):
            return web.json_response({"error": "Absolute path required"}, status=400)
        path = os.path.abspath(os.path.expanduser(raw))
        if not _is_image_file(path):
            return web.json_response({"error": "Image not found"}, status=404)
        return web.FileResponse(path, headers={"Cache-Control": "private, max-age=60"})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


# CIG_GALLERY_CONTEXT_PASTE_V1
def _unique_paste_destination(folder: str, filename: str):
    dest_dir = _gallery_dir(folder)
    filename = os.path.basename(str(filename or "")).strip()
    stem, ext = os.path.splitext(filename)
    if not stem: stem = "pasted"
    if not ext: ext = ".png"
    candidate = os.path.join(dest_dir, stem + ext)
    n = 2
    while os.path.exists(candidate):
        candidate = os.path.join(dest_dir, f"{stem} ({n}){ext}")
        n += 1
    return candidate, os.path.basename(candidate)

@PromptServer.instance.routes.get("/image-gallery/original")
async def image_gallery_original(request):
    try:
        folder = _normalize_gallery_folder(request.query.get("folder", ""))
        filename = request.query.get("filename", "")
        source, _ = _gallery_file(folder, filename)
        return web.FileResponse(source, headers={"Cache-Control": "private, max-age=60"})
    except FileNotFoundError:
        return web.json_response({"error": "Image not found"}, status=404)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)

@PromptServer.instance.routes.post("/image-gallery/paste")
async def image_gallery_paste(request):
    tmp = ""
    try:
        if request.content_type == "application/json":
            data = await request.json()
            source_folder = _normalize_gallery_folder(data.get("source_folder", ""))
            target_folder = _normalize_gallery_folder(data.get("target_folder", ""))
            source_filename = data.get("source_filename", "")
            source, _ = _gallery_file(source_folder, source_filename)
            dest, final_name = _unique_paste_destination(target_folder, source_filename)
            await asyncio.to_thread(shutil.copy2, source, dest)
            return web.json_response({"ok": True, "filename": final_name})
        target_folder = _normalize_gallery_folder(request.query.get("folder", ""))
        reader = await request.multipart()
        field = await reader.next()
        while field is not None and field.name != "file":
            field = await reader.next()
        if field is None:
            return web.json_response({"error": "Image file missing"}, status=400)
        filename = os.path.basename(field.filename or "pasted.png")
        dest, final_name = _unique_paste_destination(target_folder, filename)
        tmp = dest + f".uploading_{time.time_ns()}"
        with open(tmp, "wb") as f:
            while True:
                chunk = await field.read_chunk(1024 * 1024)
                if not chunk: break
                f.write(chunk)
        with Image.open(tmp) as im:
            im.verify()
        os.replace(tmp, dest)
        tmp = ""
        return web.json_response({"ok": True, "filename": final_name})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)
    finally:
        if tmp and os.path.isfile(tmp):
            try: os.remove(tmp)
            except OSError: pass

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
