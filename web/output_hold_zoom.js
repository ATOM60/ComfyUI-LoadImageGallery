import { app } from "/scripts/app.js";
import { holdToZoom, installHoldZoomGuards } from "./hold_zoom.js";

// CIG_PLAYER_HOLD_ZOOM_V1
// Holding the left mouse button or a finger on a playing or paused video in
// the Output Gallery shows the current frame magnified ×5 full screen, live,
// the same way as images (hold_zoom.js). Works for the GPU and CPU players,
// inline and fullscreen. A finger that moves before the hold completes still
// swipes to seek; once the zoom is open the swipe gestures stand down (they
// check <html data-cig-hold-zoom>). The click the release produces must not
// toggle playback.
const EXT_NAME = "Comfy.ImageGallery.OutputPlayerHoldZoom";
const STYLE_ID = "cig-output-hold-zoom-style";
// Native fullscreen <video> controls (seek bar, buttons) live inside the
// video element itself; a press there must not open the zoom.
const NATIVE_CONTROLS_ZONE_PX = 90;
const CLICK_SUPPRESS_MS = 700;

let pending = null;
let suppressUntil = 0;

function mediaFor(target) {
    if (!(target instanceof Element)) return null;
    const hit = target.closest(".ovg-gpu-hit,.ovg-shared-hit");
    if (hit) {
        const player = hit.closest(".ovg-gpu-player,.ovg-shared-player") || hit.parentElement;
        return player?.querySelector("video.ovg-inline-video,canvas.ovg-shared-surface,canvas.ovg-cpu-canvas") || null;
    }
    const shell = target.closest(".cig-native-fs-shell");
    if (shell && (target instanceof HTMLVideoElement || target === shell)) {
        const rect = shell.getBoundingClientRect();
        return { shell, rect, video: shell.querySelector("video.ovg-inline-video") };
    }
    return null;
}

function hasFrame(media) {
    return media?.isConnected && ((media.videoWidth || media.width || 0) > 0);
}

function onPointerDown(event) {
    pending = null;
    if (event.button !== 0 || event.isPrimary === false) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    let media = mediaFor(event.target);
    if (media && !(media instanceof Element)) {
        if (event.clientY >= media.rect.bottom - NATIVE_CONTROLS_ZONE_PX) return;
        media = media.video;
    }
    if (!(media instanceof HTMLVideoElement || media instanceof HTMLCanvasElement)) return;
    pending = holdToZoom(event, () => hasFrame(media) ? { element: media } : null);
}

function onPointerUp() {
    if (pending?.used) suppressUntil = performance.now() + CLICK_SUPPRESS_MS;
    pending = null;
}

function suppressClick(event) {
    if (performance.now() >= suppressUntil) return;
    if (event.type === "click") suppressUntil = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        if (!document.getElementById(STYLE_ID)) {
            // No "save video" callout or text selection on a long touch.
            const style = document.createElement("style");
            style.id = STYLE_ID;
            style.textContent = "video.ovg-inline-video,.ovg-gpu-hit,.ovg-shared-hit{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}";
            document.head.appendChild(style);
        }
        // Present before any touch starts, so a zoom can stop page scrolling.
        installHoldZoomGuards();
        // Window capture runs before the players' own click handlers and before
        // a native <video>'s default click-to-pause.
        document.addEventListener("pointerdown", onPointerDown, true);
        window.addEventListener("pointerup", onPointerUp, true);
        window.addEventListener("click", suppressClick, true);
        window.addEventListener("dblclick", suppressClick, true);
    },
});
