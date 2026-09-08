import asyncio
import json
import math
import os
import re
import subprocess
from pathlib import Path

from aiohttp import web
from server import PromptServer

from . import output_video_gallery_backend as base


_STREAM_LIMIT = asyncio.Semaphore(2)
_META_CACHE = {}


def _creationflags() -> int:
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    flags |= getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0)
    return flags


def _probe_video(path: Path):
    try:
        st = path.stat()
        key = (str(path.resolve()), st.st_mtime_ns, st.st_size)
    except OSError:
        key = (str(path.resolve()), 0, 0)

    cached = _META_CACHE.get(key)
    if cached:
        return cached

    ffmpeg = base._find_ffmpeg()
    if not ffmpeg:
        raise RuntimeError("FFmpeg is not available")

    result = subprocess.run(
        [ffmpeg, "-hide_banner", "-i", str(path)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=8,
        creationflags=_creationflags(),
        check=False,
    )
    text = result.stderr or ""

    duration = 0.0
    m = re.search(r"Duration:\s*(\d+):(\d+):([0-9.]+)", text)
    if m:
        duration = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))

    video_line = next((line for line in text.splitlines() if " Video: " in line), "")
    width = height = 0
    m = re.search(r"(?<!\d)(\d{2,5})x(\d{2,5})(?!\d)", video_line)
    if m:
        width, height = int(m.group(1)), int(m.group(2))

    fps = 30.0
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*fps\b", video_line)
    if m:
        try:
            fps = float(m.group(1))
        except ValueError:
            fps = 30.0
    if not math.isfinite(fps) or fps <= 0:
        fps = 30.0
    fps = min(240.0, max(1.0, fps))

    meta = {"duration": duration, "fps": fps, "width": width, "height": height}
    if len(_META_CACHE) > 128:
        _META_CACHE.clear()
    _META_CACHE[key] = meta
    return meta


def _ffmpeg_command(path: Path, start: float):
    ffmpeg = base._find_ffmpeg()
    if not ffmpeg:
        raise RuntimeError("FFmpeg is not available")

    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin"]
    if start > 0:
        cmd += ["-ss", f"{start:.4f}"]
    cmd += [
        "-hwaccel", "none",
        "-i", str(path),
        "-map", "0:v:0",
        "-an",
        "-vsync", "0",
        "-c:v", "mjpeg",
        "-q:v", "5",
        "-f", "image2pipe",
        "pipe:1",
    ]
    return cmd


async def _terminate_process(proc):
    if proc is None or proc.poll() is not None:
        return
    try:
        proc.terminate()
    except Exception:
        return
    try:
        await asyncio.wait_for(asyncio.to_thread(proc.wait), timeout=1.5)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


@PromptServer.instance.routes.get("/image-gallery/output/cpu-stream")
async def cpu_video_stream(request):
    ws = web.WebSocketResponse(heartbeat=20, max_msg_size=1024 * 1024)
    await ws.prepare(request)

    proc = None
    try:
        raw_path = request.query.get("path", "")
        try:
            start = max(0.0, float(request.query.get("start", "0") or 0))
        except Exception:
            start = 0.0
        try:
            rate = float(request.query.get("rate", "1") or 1)
        except Exception:
            rate = 1.0
        rate = min(3.0, max(0.25, rate))

        path = base._resolve(raw_path)
        meta = await asyncio.to_thread(_probe_video, path)
        await ws.send_str(json.dumps({"type": "meta", **meta}, ensure_ascii=False))

        async with _STREAM_LIMIT:
            proc = subprocess.Popen(
                _ffmpeg_command(path, start),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                bufsize=0,
                creationflags=_creationflags(),
            )
            if proc.stdout is None:
                raise RuntimeError("Could not open FFmpeg output")

            buffer = bytearray()
            frame_interval = 1.0 / max(1.0, float(meta.get("fps") or 30.0) * rate)
            loop = asyncio.get_running_loop()
            next_frame_at = loop.time()

            while not ws.closed:
                chunk = await asyncio.to_thread(proc.stdout.read, 65536)
                if not chunk:
                    break
                buffer.extend(chunk)

                while not ws.closed:
                    start_marker = buffer.find(b"\xff\xd8")
                    if start_marker < 0:
                        if len(buffer) > 2:
                            del buffer[:-2]
                        break
                    if start_marker:
                        del buffer[:start_marker]

                    end_marker = buffer.find(b"\xff\xd9", 2)
                    if end_marker < 0:
                        break

                    frame = bytes(buffer[:end_marker + 2])
                    del buffer[:end_marker + 2]
                    await ws.send_bytes(frame)

                    next_frame_at += frame_interval
                    delay = next_frame_at - loop.time()
                    if delay > 0:
                        await asyncio.sleep(delay)
                    elif delay < -0.5:
                        next_frame_at = loop.time()

            if not ws.closed:
                await ws.send_str(json.dumps({"type": "eof"}))

    except (ConnectionResetError, asyncio.CancelledError):
        pass
    except Exception as exc:
        if not ws.closed:
            try:
                await ws.send_str(json.dumps({"type": "error", "error": str(exc)}, ensure_ascii=False))
            except Exception:
                pass
    finally:
        await _terminate_process(proc)
        if not ws.closed:
            try:
                await ws.close()
            except Exception:
                pass

    return ws
