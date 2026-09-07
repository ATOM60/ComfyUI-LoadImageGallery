import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoInteractions";
const CLICK_DELAY_MS = 280;
const clickTimers = new WeakMap();

function isOutputVideo(target) {
    return target instanceof HTMLVideoElement && target.classList.contains("ovg-inline-video") ? target : null;
}

function isPictureArea(video, event) {
    const rect = video.getBoundingClientRect();
    const localY = event.clientY - rect.top;
    const fullscreen = document.fullscreenElement === video || document.webkitFullscreenElement === video || video.webkitDisplayingFullscreen === true;
    const nativeControlsHeight = fullscreen ? 72 : 52;
    return localY < rect.height - nativeControlsHeight;
}

function clearSingleClick(video) {
    const timer = clickTimers.get(video);
    if (timer) clearTimeout(timer);
    clickTimers.delete(video);
}

async function toggleNativeFullscreen(video) {
    const fs = document.fullscreenElement || document.webkitFullscreenElement || null;
    if (fs === video) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        return;
    }

    if (video.requestFullscreen) {
        await video.requestFullscreen();
        return;
    }
    if (video.webkitRequestFullscreen) {
        video.webkitRequestFullscreen();
        return;
    }
    if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
}

function onClick(event) {
    const video = isOutputVideo(event.target);
    if (!video || !isPictureArea(video, event)) return;

    // Own clicks on the picture area so the older handler cannot consume the
    // second click before the browser has a chance to enter fullscreen.
    event.preventDefault();
    event.stopImmediatePropagation();

    clearSingleClick(video);
    if (event.detail > 1) return;

    const timer = setTimeout(() => {
        clickTimers.delete(video);
        if (!video.isConnected) return;
        if (video.paused) video.play().catch(() => {});
        else video.pause();
    }, CLICK_DELAY_MS);
    clickTimers.set(video, timer);
}

function onDoubleClick(event) {
    const video = isOutputVideo(event.target);
    if (!video || !isPictureArea(video, event)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    clearSingleClick(video);
    toggleNativeFullscreen(video).catch(err => console.warn("[OutputVideoGallery] native fullscreen:", err));
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        // Capture phase intentionally runs before the target-level handlers in
        // output_video_speed_control.js. Native controls remain untouched because
        // clicks in the bottom control strip are ignored here.
        document.addEventListener("click", onClick, true);
        document.addEventListener("dblclick", onDoubleClick, true);
    },
});
