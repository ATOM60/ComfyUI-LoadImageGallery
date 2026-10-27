"""Publish an image as both a real file and a bitmap on the Windows clipboard.

This is deliberately a server-side Windows integration: a web page cannot write
CF_HDROP (Explorer's file format) via the browser Clipboard API.
"""

import ctypes
import io
import os
import struct
import threading
import time

from PIL import Image, ImageOps

_CF_DIB = 8
_CF_HDROP = 15
_CF_DIBV5 = 17
_GMEM_MOVEABLE = 0x0002
_LCS_SRGB = 0x73524742
_MAX_PIXELS = 64_000_000
_LOCK = threading.Lock()


def _payloads(path):
    """Return the DROPFILES, CF_DIB, CF_DIBV5 and PNG bytes for one file."""
    path = os.path.abspath(os.fspath(path))
    with Image.open(path) as opened:
        if opened.width * opened.height > _MAX_PIXELS:
            raise ValueError("Image is too large for the Windows clipboard (64 MP limit)")
        # Clipboard bitmaps hold one frame. CF_HDROP still references the intact
        # source file, including GIF animation, metadata and original encoding.
        rgba = ImageOps.exif_transpose(opened).convert("RGBA")

    width, height = rgba.size
    data = rgba.transpose(Image.Transpose.FLIP_TOP_BOTTOM).tobytes("raw", "BGRA")
    size = len(data)
    dib_header = struct.pack("<IiiHHIIiiII", 40, width, height, 1, 32, 0, size, 0, 0, 0, 0)
    # BITMAPV5HEADER with explicit alpha channel and sRGB color space.
    v5_header = struct.pack("<IiiHHIIiiII", 124, width, height, 1, 32, 3, size, 0, 0, 0, 0)
    v5_header += struct.pack("<IIIII", 0x00FF0000, 0x0000FF00, 0x000000FF, 0xFF000000, _LCS_SRGB)
    v5_header += bytes(124 - len(v5_header))
    png = io.BytesIO()
    rgba.save(png, format="PNG")
    # DROPFILES: pFiles, pt.x, pt.y, fNC, fWide; UTF-16LE double-NUL path list.
    drop = struct.pack("<IiiII", 20, 0, 0, 0, 1) + (path + "\0\0").encode("utf-16le")
    return {_CF_HDROP: drop, _CF_DIBV5: v5_header + data, _CF_DIB: dib_header + data}, png.getvalue()


def copy_image_to_windows_clipboard(path):
    """Replace the clipboard with file and bitmap formats in one operation.

    The ComfyUI server must run in the same interactive Windows desktop session
    as Explorer/Photoshop. Other operating systems are unsupported here.
    """
    if os.name != "nt":
        raise OSError("Windows clipboard is available only when ComfyUI runs on Windows")
    static_formats, png = _payloads(path)  # Encode before touching the clipboard.
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    V = ctypes.c_void_p
    kernel32.GlobalAlloc.argtypes = [ctypes.c_uint, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = V
    kernel32.GlobalLock.argtypes = [V]
    kernel32.GlobalLock.restype = V
    kernel32.GlobalUnlock.argtypes = [V]
    kernel32.GlobalUnlock.restype = ctypes.c_bool
    kernel32.GlobalFree.argtypes = [V]
    kernel32.GlobalFree.restype = V
    user32.RegisterClipboardFormatW.argtypes = [ctypes.c_wchar_p]
    user32.RegisterClipboardFormatW.restype = ctypes.c_uint
    user32.CreateWindowExW.argtypes = [ctypes.c_uint, ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_uint,
                                       ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, V, V, V, V]
    user32.CreateWindowExW.restype = V
    user32.DestroyWindow.argtypes = [V]
    user32.DestroyWindow.restype = ctypes.c_bool
    user32.OpenClipboard.argtypes = [V]
    user32.OpenClipboard.restype = ctypes.c_bool
    user32.EmptyClipboard.argtypes = []
    user32.EmptyClipboard.restype = ctypes.c_bool
    user32.SetClipboardData.argtypes = [ctypes.c_uint, V]
    user32.SetClipboardData.restype = V
    user32.CloseClipboard.argtypes = []
    user32.CloseClipboard.restype = ctypes.c_bool

    def alloc(blob):
        handle = kernel32.GlobalAlloc(_GMEM_MOVEABLE, len(blob))
        if not handle:
            raise OSError(ctypes.get_last_error(), "GlobalAlloc failed")
        pointer = kernel32.GlobalLock(handle)
        if not pointer:
            kernel32.GlobalFree(handle)
            raise OSError(ctypes.get_last_error(), "GlobalLock failed")
        try:
            ctypes.memmove(pointer, blob, len(blob))
        finally:
            kernel32.GlobalUnlock(handle)
        return handle

    with _LOCK:
        png_format = user32.RegisterClipboardFormatW("PNG")
        effect_format = user32.RegisterClipboardFormatW("Preferred DropEffect")
        if not png_format or not effect_format:
            raise OSError(ctypes.get_last_error(), "RegisterClipboardFormatW failed")
        formats = list(static_formats.items()) + [(png_format, png), (effect_format, struct.pack("<I", 1))]
        handles = []
        hwnd = None
        opened = False
        try:
            # Preallocate all movable memory: an allocation error must not clear
            # the existing clipboard contents.
            for fmt, blob in formats:
                handles.append([fmt, alloc(blob)])
            # A real HWND is required as clipboard owner by EmptyClipboard.
            hwnd = user32.CreateWindowExW(0, "STATIC", "ComfyUI Image Clipboard", 0,
                                          0, 0, 0, 0, None, None, None, None)
            if not hwnd:
                raise OSError(ctypes.get_last_error(), "CreateWindowExW failed")
            for _ in range(30):
                if user32.OpenClipboard(hwnd):
                    opened = True
                    break
                time.sleep(0.03)
            if not opened:
                raise OSError(ctypes.get_last_error(), "Cannot open Windows clipboard")
            if not user32.EmptyClipboard():
                raise OSError(ctypes.get_last_error(), "EmptyClipboard failed")
            for item in handles:
                fmt, handle = item
                if not user32.SetClipboardData(fmt, handle):
                    raise OSError(ctypes.get_last_error(), f"SetClipboardData({fmt}) failed")
                # The system now owns this global memory handle.
                item[1] = None
        finally:
            if opened:
                user32.CloseClipboard()
            for _, handle in handles:
                if handle:
                    kernel32.GlobalFree(handle)
            if hwnd:
                user32.DestroyWindow(hwnd)
    return ["file", "DIB", "DIBV5", "PNG"]
