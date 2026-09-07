import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputPreviewInteractions";
const SINGLE_CLICK_DELAY_MS = 260;
const DOUBLE_CLICK_WINDOW_MS = 360;
const clickState = new WeakMap();

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

function findPlayer(thumb) {
    return thumb.querySelector("video.ovg-inline-video");
}

function createPlayer(thumb) {
    const existing = findPlayer(thumb);
    if (existing) return { video: existing, created: false };

    const playButton = thumb.querySelector(".ovg-play");
    if (!playButton) return { video: null, created: false };

    playButton.click();
    return { video: findPlayer(thumb), created: true };
}

function ensurePlaying(video) {
    if (!video) return;
    queueMicrotask(() => {
        if (video.isConnected && video.paused) video.play().catch(() => {});
    });
}

function togglePlayback(thumb) {
    const { video, created } = createPlayer(thumb);
    if (!video) return;

    if (created) {
        ensurePlaying(video);
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
    if (created) ensurePlaying(video);
    enterFullscreen(video);
}

function validPreviewInteraction(event) {
    if (isOverCustomControls(event)) return null;
    const thumb = getThumbFromEvent(event);
    if (!thumb) return null;
    if (event.target instanceof HTMLVideoElement && !isPictureArea(event.target, event)) return null;
    return thumb;
}

function consume(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
}

function onPointerUp(event) {
    if (event.button !== 0) return;
    const thumb = validPreviewInteraction(event);
    if (!thumb) return;

    consume(event);

    const now = performance.now();
    const pending = clickState.get(thumb);
    if (pending && now - pending.time <= DOUBLE_CLICK_WINDOW_MS) {
        clearTimeout(pending.timer);
        clickState.delete(thumb);

        // Fullscreen is requested directly from the second pointer-up user gesture.
        // This is more reliable than waiting for the browser's dblclick event,
        // which can be swallowed by the native video player in fullscreen mode.
        toggleFullscreen(thumb);
        return;
    }

    if (pending) clearTimeout(pending.timer);
    const timer = setTimeout(() => {
        clickState.delete(thumb);
        if (!thumb.isConnected) return;
        togglePlayback(thumb);
    }, SINGLE_CLICK_DELAY_MS);
    clickState.set(thumb, { time: now, timer });
}

function suppressGeneratedClick(event) {
    const thumb = validPreviewInteraction(event);
    if (!thumb) return;
    consume(event);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        // Use pointerup for gesture detection so the second press can request or
        // leave fullscreen synchronously. Suppress the later click/dblclick events
        // to prevent the native player and older handlers from doing the same action.
        document.addEventListener("pointerup", onPointerUp, true);
        document.addEventListener("click", suppressGeneratedClick, true);
        document.addEventListener("dblclick", suppressGeneratedClick, true);
    },
});
