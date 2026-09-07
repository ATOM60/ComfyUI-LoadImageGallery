import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputControlsCapture";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const VOLUME_KEY = "ComfyUI-LoadImageGallery.outputVideoVolume";
const STYLE_ID = "cig-output-controls-capture-style";
let draggingSlider = null;

function clamp(value, min, max) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

function loadRate() {
    try { return clamp(localStorage.getItem(RATE_KEY) || 1, 0.25, 3); }
    catch (_) { return 1; }
}

function loadVolume() {
    try {
        const raw = localStorage.getItem(VOLUME_KEY);
        return raw == null ? 1 : clamp(raw, 0, 1);
    } catch (_) { return 1; }
}

function saveRate(rate) {
    try { localStorage.setItem(RATE_KEY, String(clamp(rate, 0.25, 3))); }
    catch (_) {}
}

function visibleControls() {
    return [...document.querySelectorAll(".ovg-speed-control")].filter(control => {
        const r = control.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(control).display !== "none";
    });
}

function hitElement(selector, x, y) {
    for (const control of visibleControls()) {
        for (const el of control.querySelectorAll(selector)) {
            const r = el.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { control, el };
        }
    }
    return null;
}

function videoForControl(control) {
    for (const video of document.querySelectorAll("video.ovg-inline-video")) {
        if (video.__cigSpeedControl === control) return video;
    }
    const fs = document.fullscreenElement || document.webkitFullscreenElement || null;
    if (fs instanceof HTMLVideoElement) return fs;
    return fs?.querySelector?.("video.ovg-inline-video") || null;
}

function galleryPaths(video) {
    const grid = video.closest?.(".ovg-card")?.closest?.(".ovg-grid");
    if (!grid) return [];
    return [...grid.querySelectorAll(".ovg-card[data-path]")]
        .map(card => String(card.dataset.path || ""))
        .filter(Boolean);
}

function currentPath(video) {
    return String(video.dataset.cigCurrentPath || video.closest?.(".ovg-card")?.dataset.path || "");
}

async function navigate(video, direction) {
    if (!video) return;
    const paths = galleryPaths(video);
    if (paths.length < 2) return;
    let index = paths.indexOf(currentPath(video));
    if (index < 0) index = 0;
    const nextPath = paths[(index + direction + paths.length) % paths.length];
    if (!nextPath) return;

    const shouldPlay = !video.paused;
    video.dataset.cigCurrentPath = nextPath;
    video.poster = `/image-gallery/output/thumb?path=${encodeURIComponent(nextPath)}`;
    video.src = `/image-gallery/output/video?path=${encodeURIComponent(nextPath)}`;
    video.load();
    video.defaultPlaybackRate = loadRate();
    video.playbackRate = loadRate();
    video.volume = loadVolume();
    if (shouldPlay) {
        try { await video.play(); } catch (_) {}
    }
}

function setRateFromPointer(control, slider, clientY) {
    const video = videoForControl(control);
    if (!video) return;
    const r = slider.getBoundingClientRect();
    if (!r.height) return;
    const t = clamp((r.bottom - clientY) / r.height, 0, 1);
    const rate = Math.round((0.25 + t * 2.75) * 20) / 20;
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
    saveRate(rate);
    slider.value = String(rate);
    const value = control.querySelector(".ovg-speed-value");
    if (value) value.textContent = `${rate.toFixed(2)}×`;
}

function consume(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
}

function onPointerDown(event) {
    if (event.button !== 0) return;
    const x = event.clientX, y = event.clientY;

    const sliderHit = hitElement(".ovg-speed-slider", x, y);
    if (sliderHit) {
        consume(event);
        draggingSlider = sliderHit;
        setRateFromPointer(sliderHit.control, sliderHit.el, y);
        return;
    }

    const buttonHit = hitElement(".ovg-player-control-button", x, y);
    if (!buttonHit) return;
    consume(event);

    const { control, el } = buttonHit;
    const video = videoForControl(control);
    if (el.classList.contains("ovg-prev-button")) {
        navigate(video, -1);
    } else if (el.classList.contains("ovg-next-button")) {
        navigate(video, 1);
    } else if (el.classList.contains("ovg-speed-button")) {
        control.classList.toggle("open");
    }
}

function onPointerMove(event) {
    if (!draggingSlider) return;
    consume(event);
    setRateFromPointer(draggingSlider.control, draggingSlider.el, event.clientY);
}

function onPointerUp(event) {
    if (!draggingSlider) return;
    consume(event);
    setRateFromPointer(draggingSlider.control, draggingSlider.el, event.clientY);
    draggingSlider = null;
}

function blockClicks(event) {
    const x = event.clientX, y = event.clientY;
    if (hitElement(".ovg-player-control-button,.ovg-speed-slider,.ovg-speed-panel", x, y)) consume(event);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement("style");
            style.id = STYLE_ID;
            style.textContent = `
.ovg-speed-control,
.ovg-player-control-row,
.ovg-player-control-button,
.ovg-speed-panel,
.ovg-speed-slider{
    pointer-events:auto!important;
}
.ovg-speed-control[popover]{z-index:2147483647!important}
.ovg-player-control-button{touch-action:none!important}
`;
            document.head.appendChild(style);
        }

        // Capture before the fullscreen <video> / its native UI sees the pointer.
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("pointermove", onPointerMove, true);
        document.addEventListener("pointerup", onPointerUp, true);
        document.addEventListener("pointercancel", () => { draggingSlider = null; }, true);
        document.addEventListener("click", blockClicks, true);
        document.addEventListener("dblclick", blockClicks, true);
    },
});
