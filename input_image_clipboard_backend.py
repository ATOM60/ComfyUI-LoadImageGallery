"""Local Windows clipboard endpoint for the Input ImageGallery context menu."""
import asyncio
import ipaddress
import os

from aiohttp import web
from server import PromptServer

from .image_gallery_core import _gallery_file, _is_image_file, _normalize_gallery_folder
from .windows_image_clipboard import copy_image_to_windows_clipboard


@PromptServer.instance.routes.post("/image-gallery/clipboard/copy")
async def image_gallery_copy_clipboard(request):
    # Clipboard writes affect the *server* desktop. Reject remote callers:
    # a remote browser cannot paste into its own Windows session this way.
    try:
        remote = ipaddress.ip_address(request.remote or "")
        local = remote.is_loopback or (
            remote.version == 6 and remote.ipv4_mapped is not None and remote.ipv4_mapped.is_loopback
        )
    except ValueError:
        local = False
    if not local:
        return web.json_response({"error": "Windows clipboard requires local ComfyUI access"}, status=403)
    if os.name != "nt":
        return web.json_response({"error": "Native file and image clipboard requires Windows"}, status=501)
    try:
        data = await request.json()
        folder = _normalize_gallery_folder(data.get("folder", ""))
        source, _ = _gallery_file(folder, data.get("filename", ""))
        if not _is_image_file(source):
            return web.json_response({"error": "Not an image file"}, status=400)
        formats = await asyncio.to_thread(copy_image_to_windows_clipboard, source)
        return web.json_response({"ok": True, "formats": formats})
    except FileNotFoundError:
        return web.json_response({"error": "Image file not found"}, status=404)
    except (ValueError, TypeError) as exc:
        return web.json_response({"error": str(exc)}, status=400)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)
