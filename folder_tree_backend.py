"""Folder tree for the galleries' folder list (web/folder_tree.js): ComfyUI's
input and output folders, the drives, and the subfolders of any folder.

/image-gallery/list already lists any absolute folder with its subfolders;
these routes list only subfolder names, so expanding a tree level stays fast.
Hidden and system folders are left out, as in Explorer.
"""
import asyncio
import os
import string
from pathlib import Path

from aiohttp import web
from server import PromptServer

import folder_paths

from . import image_gallery_core as core


CHILD_LIMIT = 3000
_HIDDEN_OR_SYSTEM = 0x2 | 0x4   # FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM


def _posix(path: str) -> str:
    return Path(path).as_posix()


if os.name == "nt":
    import ctypes

    _kernel32 = ctypes.WinDLL("kernel32")
    _kernel32.GetLogicalDrives.argtypes = []
    _kernel32.GetLogicalDrives.restype = ctypes.c_uint32
    _kernel32.GetDriveTypeW.argtypes = [ctypes.c_wchar_p]
    _kernel32.GetDriveTypeW.restype = ctypes.c_uint
    _kernel32.GetVolumeInformationW.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_void_p,
                                                ctypes.c_void_p, ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_uint32]
    _kernel32.GetVolumeInformationW.restype = ctypes.c_int
    _kernel32.SetThreadErrorMode.argtypes = [ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint32)]
    _kernel32.SetThreadErrorMode.restype = ctypes.c_int
    _DRIVE_KINDS = {2: "removable", 3: "fixed", 4: "network", 5: "cdrom", 6: "ramdisk"}


class _NoDiskPrompts:
    """No "There is no disk in the drive" system prompt for an empty drive."""

    def __enter__(self):
        self.old = None
        if os.name == "nt":
            self.old = ctypes.c_uint32()
            _kernel32.SetThreadErrorMode(0x1 | 0x8000, ctypes.byref(self.old))   # FAILCRITICALERRORS | NOOPENFILEERRORBOX
        return self

    def __exit__(self, *_):
        if self.old is not None:
            _kernel32.SetThreadErrorMode(self.old.value, None)


def _drives():
    if os.name != "nt":
        return [{"path": "/", "label": "", "kind": "fixed"}]
    drives = []
    mask = _kernel32.GetLogicalDrives()
    with _NoDiskPrompts():
        for index, letter in enumerate(string.ascii_uppercase):
            if not mask & (1 << index):
                continue
            root = f"{letter}:\\"
            kind = _DRIVE_KINDS.get(_kernel32.GetDriveTypeW(root), "other")
            label = ""
            if kind == "fixed":   # instant for local disks; others may wait on media or the network
                buffer = ctypes.create_unicode_buffer(261)
                if _kernel32.GetVolumeInformationW(root, buffer, 261, None, None, None, None, 0):
                    label = buffer.value
            drives.append({"path": f"{letter}:/", "label": label, "kind": kind})
    return drives


def _subfolder_names(path: str):
    names = []
    truncated = False
    with _NoDiskPrompts(), os.scandir(path) as entries:
        for entry in entries:
            name = entry.name
            if name.startswith(".") or name.casefold() in core._SKIP_DIRS:
                continue
            try:
                if not entry.is_dir():
                    continue
                if os.name == "nt" and getattr(entry.stat(), "st_file_attributes", 0) & _HIDDEN_OR_SYSTEM:
                    continue
            except OSError:
                continue
            if len(names) >= CHILD_LIMIT:
                truncated = True
                break
            names.append(name)
    return names, truncated


@PromptServer.instance.routes.get("/image-gallery/tree/roots")
async def folder_tree_roots(request):
    try:
        drives = await asyncio.to_thread(_drives)
        return web.json_response({
            "input": _posix(core._input_root()),
            "output": _posix(os.path.abspath(folder_paths.get_output_directory())),
            "drives": drives,
        })
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@PromptServer.instance.routes.get("/image-gallery/tree/children")
async def folder_tree_children(request):
    raw = str(request.query.get("path", "")).replace("\\", "/").strip()
    if len(raw) == 2 and raw[1] == ":":
        raw += "/"
    if not core._is_abs_path(raw):
        return web.json_response({"error": "An absolute folder path is required"}, status=400)
    path = os.path.abspath(raw)
    try:
        names, truncated = await asyncio.to_thread(_subfolder_names, path)
        return web.json_response({"path": _posix(path), "folders": names, "truncated": truncated})
    except FileNotFoundError:
        return web.json_response({"error": "Folder not found"}, status=404)
    except NotADirectoryError:
        return web.json_response({"error": "Not a folder"}, status=400)
    except PermissionError:
        return web.json_response({"error": "Access denied", "denied": True}, status=403)
    except OSError as exc:
        return web.json_response({"error": exc.strerror or str(exc)}, status=400)
