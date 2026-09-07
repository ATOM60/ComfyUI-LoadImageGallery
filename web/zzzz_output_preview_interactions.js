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

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function isFullscreenVideo(video) {
    const fs = fullscreenElement();
    const thumb = video?.closest?.(".ovg-thumb") || null;
    return !!video && (fs === video || fs === thumb || video.webkitDisplayingFullscreen === true);
}

function isPictureArea(video, event) {
    const rect = video.getBoundingClientRect();
    const localY = event.clientY - rect.top;
    const nativeControlsHeight = isFullscreenVideo(video) ? 72 : 52;
    return localY < rect.height - nativeControlsHeight;
}

function isOverCustomControls(event) {
    const x = event.clientX;
    const y = event.clientY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

    for (const control of document.querySelectorAll(".ovg-speed-control")) {
        const style = getComputedStyle(control);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const nodes = control.querySelectorAll(".ovg-player-control-button,.ovg-speed-panel,.ovg-speed-slider");
        for (const node of nodes) {
            const r = node.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
        }
    }
    return false;
}

function clearClickTimer(thumb) {
    const timer = clickTimers.get(thumb);
    if (timer) clearTimeout(timer);
    clickTimers.delete(thumb);
}

function findPlayer(thumb) {
    return thumb.querySelector("video.ovg-inline-video");
}

function createPlayer(thumb) {
    const existing = findPlayer(thumb);
    if (existing) return { video: existing, created: false };

    const playButton = thumb.querySelector(".ovg-play");
    if (!playButton) return { video: null, created: false };

    // The gallery creates the video synchronously before the first await.
    // Its own play-button handler also starts playback, so a first click must
    // not immediately toggle the freshly-created player back to pause.
    playButton.click();
    return { video: findPlayer(thumb), created: true };
}

function playCreatedVideo(video) {
    if (!video) return;
    // Let the gallery's original play() run first, then make sure playback is active.
    queueMicrotask(() => {
        if (video.isConnected && video.paused) video.play().catch(() => {});
    });
}

function togglePlayback(thumb) {
    const { video, created } = createPlayer(thumb);
    if (!video) return;

    if (created) {
        playCreatedVideo(video);
        return;
    }

    if (video.paused) video.play().catch(() => {});
    else video.pause();
}

function enterFullscreen(video) {
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

function exitFullscreenAndPause(video) {
    if (!video) return;
    try { video.pause(); } catch (_) {}

    const fs = fullscreenElement();
    if (fs) {
        try {
            if (document.exitFullscreen) {
                const result = document.exitFullscreen();
                result?.catch?.(() => {});
                return;
            }
        } catch (_) {}
        try {
            if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
                return;
            }
        } catch (_) {}
    }

    try {
        if (video.webkitDisplayingFullscreen && video.webkitExitFullscreen) video.webkitExitFullscreen();
    } catch (_) {}
}

function toggleFullscreen(thumb) {
    const existing = findPlayer(thumb);
    if (existing && isFullscreenVideo(existing)) {
        exitFullscreenAndPause(existing);
        return;
    }

    const { video, created } = createPlayer(thumb);
    if (!video) return;
    if (created) playCreatedVideo(video);
    enterFullscreen(video);
}

function onClick(event) {
    // In native fullscreen Chromium can report the underlying <video> as the
    // event target even when our top-layer custom controls are visually under
    // the pointer. Ignore those coordinates here so button presses never become
    // preview play/pause clicks.
    if (isOverCustomControls(event)) return;

    const thumb = getThumbFromEvent(event);
    if (!thumb) return;

    const video = event.target instanceof HTMLVideoElement ? event.target : findPlayer(thumb);
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
    if (isOverCustomControls(event)) return;

    const thumb = getThumbFromEvent(event);
    if (!thumb) return;

    if (event.target instanceof HTMLVideoElement && !isPictureArea(event.target, event)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    clearClickTimer(thumb);

    // Double click is a true fullscreen toggle:
    // preview -> play + fullscreen; fullscreen -> pause + exit fullscreen.
    toggleFullscreen(thumb);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        // Capture phase owns only the preview/picture area. Native controls at
        // the bottom remain untouched.
        document.addEventListener("click", onClick, true);
        document.addEventListener("dblclick", onDoubleClick, true);
    },
});
