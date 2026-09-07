import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputPreviewInteractions";
const CLICK_DELAY_MS = 240;
const clickTimers = new WeakMap();

function getThumbFromEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    const thumb = target?.closest?.(".ovg-thumb");
    if (!thumb || !thumb.closest(".ovg-card")) return null;
    if (target.closest?.("button")) return null;
    return thumb;
}

function isPictureArea(video, event) {
    const rect = video.getBoundingClientRect();
    const localY = event.clientY - rect.top;
    const fs = document.fullscreenElement || document.webkitFullscreenElement || null;
    const fullscreen = fs === video || fs === video.closest?.(".ovg-thumb") || video.webkitDisplayingFullscreen === true;
    const nativeControlsHeight = fullscreen ? 72 : 52;
    return localY < rect.height - nativeControlsHeight;
}

function clearClickTimer(thumb) {
    const timer = clickTimers.get(thumb);
    if (timer) clearTimeout(timer);
    clickTimers.delete(thumb);
}

function ensurePlayer(thumb) {
    let video = thumb.querySelector("video.ovg-inline-video");
    if (video) return video;

    const playButton = thumb.querySelector(".ovg-play");
    if (!playButton) return null;

    // The gallery's play handler creates the <video> synchronously before its
    // first await, so the player is available immediately after click().
    playButton.click();
    video = thumb.querySelector("video.ovg-inline-video");
    return video || null;
}

function togglePlayback(thumb) {
    const video = ensurePlayer(thumb);
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
}

function requestFullscreen(video) {
    if (!video) return;
    try { video.play().catch(() => {}); } catch (_) {}

    try {
        if (video.requestFullscreen) {
            const result = video.requestFullscreen();
            result?.catch?.(() => {});
            return;
        }
    } catch (_) {}

    try {
        if (video.webkitRequestFullscreen) {
            video.webkitRequestFullscreen();
            return;
        }
    } catch (_) {}

    try {
        if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } catch (_) {}
}

function onClick(event) {
    const thumb = getThumbFromEvent(event);
    if (!thumb) return;

    const video = event.target instanceof HTMLVideoElement ? event.target : thumb.querySelector("video.ovg-inline-video");
    if (event.target instanceof HTMLVideoElement && !isPictureArea(event.target, event)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    clearClickTimer(thumb);
    if (event.detail > 1) return;

    const timer = setTimeout(() => {
        clickTimers.delete(thumb);
        if (!thumb.isConnected) return;
        togglePlayback(thumb);
    }, CLICK_DELAY_MS);
    clickTimers.set(thumb, timer);
}

function onDoubleClick(event) {
    const thumb = getThumbFromEvent(event);
    if (!thumb) return;

    if (event.target instanceof HTMLVideoElement && !isPictureArea(event.target, event)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    clearClickTimer(thumb);

    // This is deliberately synchronous: requestFullscreen must happen in the
    // original double-click user gesture. ensurePlayer() creates the inline video
    // synchronously through the existing gallery play handler.
    const video = ensurePlayer(thumb);
    requestFullscreen(video);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        // Capture phase overrides the old card/video handlers only inside the
        // preview area. Card metadata keeps its normal selection behavior and the
        // browser's native control strip remains untouched.
        document.addEventListener("click", onClick, true);
        document.addEventListener("dblclick", onDoubleClick, true);
    },
});
