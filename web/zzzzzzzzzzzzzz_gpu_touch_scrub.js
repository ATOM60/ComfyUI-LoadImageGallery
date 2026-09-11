import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputGpuDoubleTapSeek";
const SEEK_SECONDS = 10;
const SIDE_ZONE = 0.35;
const TOUCH_WINDOW_MS = 650;
const FULLSCREEN_CONTROLS_SAFE_ZONE = 90;

let lastTouchUpAt = 0;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function resolveVideoAndRect(target) {
    if (!(target instanceof Element)) return null;

    const shell = target.closest('.cig-native-fs-shell[data-cig-native-shell="1"]');
    if (shell instanceof HTMLElement && fullscreenElement() === shell) {
        const video = shell.querySelector("video.ovg-inline-video");
        if (!(video instanceof HTMLVideoElement)) return null;
        return { video, rect: shell.getBoundingClientRect(), fullscreen: true };
    }

    const player = target.closest(".ovg-gpu-player");
    if (!(player instanceof HTMLElement)) return null;
    const video = player.querySelector("video.ovg-inline-video");
    if (!(video instanceof HTMLVideoElement)) return null;
    return { video, rect: player.getBoundingClientRect(), fullscreen: false };
}

function onPointerUp(event) {
    if (event.pointerType === "touch" && event.isPrimary) lastTouchUpAt = performance.now();
}

function onDoubleClick(event) {
    if (performance.now() - lastTouchUpAt > TOUCH_WINDOW_MS) return;
    if (event.target instanceof Element && event.target.closest("button,input,.cig-native-speed-panel")) return;

    const resolved = resolveVideoAndRect(event.target);
    if (!resolved) return;

    const { video, rect, fullscreen } = resolved;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    if (rect.width <= 0 || rect.height <= 0) return;

    if (fullscreen && event.clientY >= rect.bottom - FULLSCREEN_CONTROLS_SAFE_ZONE) return;

    const ratio = (event.clientX - rect.left) / rect.width;
    let delta = 0;
    if (ratio <= SIDE_ZONE) delta = -SEEK_SECONDS;
    else if (ratio >= 1 - SIDE_ZONE) delta = SEEK_SECONDS;
    else return;

    event.preventDefault();
    event.stopImmediatePropagation();

    try {
        video.currentTime = clamp((Number(video.currentTime) || 0) + delta, 0, video.duration);
    } catch (_) {}
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.addEventListener("pointerup", onPointerUp, { capture:true, passive:true });
        document.addEventListener("dblclick", onDoubleClick, true);
    },
});
