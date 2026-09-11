import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.GpuNativeControlsPointerFix";
const STYLE_ID = "cig-gpu-native-controls-pointer-fix-style";
const OVERLAY_ID = "cig-gpu-native-fs-controls";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const VOLUME_KEY = "ComfyUI-LoadImageGallery.outputVideoVolume";

function clamp(value, min, max, fallback = min) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function loadRate() {
    try { return clamp(localStorage.getItem(RATE_KEY) || 1, .25, 3, 1); }
    catch (_) { return 1; }
}

function loadVolume() {
    try {
        const value = localStorage.getItem(VOLUME_KEY);
        return value == null ? 1 : clamp(value, 0, 1, 1);
    } catch (_) {
        return 1;
    }
}

function currentVideo() {
    const video = document.fullscreenElement || document.webkitFullscreenElement || null;
    return video instanceof HTMLVideoElement && video.dataset?.cigNativeFullscreen === "1" ? video : null;
}

function currentPath(video) {
    return String(video?.dataset?.cigCurrentPath || video?.closest?.(".ovg-card")?.dataset?.path || "");
}

function galleryPaths(video) {
    const grid = video?.closest?.(".ovg-card")?.closest?.(".ovg-grid");
    if (!grid) return [];
    return [...grid.querySelectorAll(".ovg-card[data-path]")]
        .map(el => String(el.dataset.path || ""))
        .filter(Boolean);
}

function videoEndpoint(path) {
    return `/image-gallery/output/video?path=${encodeURIComponent(path)}`;
}

function thumbEndpoint(path) {
    return `/image-gallery/output/thumb?path=${encodeURIComponent(path)}`;
}

async function navigate(video, dir) {
    const paths = galleryPaths(video);
    if (paths.length < 2) return;
    let index = paths.indexOf(currentPath(video));
    if (index < 0) index = 0;
    index = (index + dir + paths.length) % paths.length;
    const path = paths[index];
    if (!path) return;

    video.dataset.cigCurrentPath = path;
    video.poster = thumbEndpoint(path);
    video.src = videoEndpoint(path);
    video.load();
    const rate = loadRate();
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
    video.volume = loadVolume();
    try { await video.play(); } catch (_) {}
}

function buttonFromEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    return target?.closest?.(`#${OVERLAY_ID} .cig-gpu-fs-button`) || null;
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
#${OVERLAY_ID}[popover],
#${OVERLAY_ID}[popover] * {
    pointer-events:auto!important;
}
#${OVERLAY_ID}[popover] {
    touch-action:none!important;
    user-select:none!important;
    -webkit-user-select:none!important;
}
`;
    document.head.appendChild(style);
}

function onPointerDown(event) {
    const button = buttonFromEvent(event);
    if (!(button instanceof HTMLButtonElement)) return;
    const video = currentVideo();
    if (!video) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    try { video.__cigNativeFsSetInteracting?.(true); } catch (_) {}
    try { video.__cigNativeFsActivity?.(); } catch (_) {}

    if (button.classList.contains("cig-gpu-prev")) {
        void navigate(video, -1);
        return;
    }

    if (button.classList.contains("cig-gpu-next")) {
        void navigate(video, 1);
        return;
    }

    if (button.classList.contains("cig-gpu-speed")) {
        const overlay = button.closest(`#${OVERLAY_ID}`);
        const panel = overlay?.querySelector?.(".cig-gpu-speed-panel");
        const range = overlay?.querySelector?.(".cig-gpu-speed-range");
        const value = overlay?.querySelector?.(".cig-gpu-speed-value");
        if (!(panel instanceof HTMLElement)) return;
        const open = !panel.classList.contains("open");
        panel.classList.toggle("open", open);
        try { video.__cigNativeFsSetRateEditing?.(open); } catch (_) {}
        if (open && range instanceof HTMLInputElement) {
            const rate = clamp(video.playbackRate, .25, 3, loadRate());
            range.value = String(rate);
            if (value instanceof HTMLElement) value.textContent = `${rate.toFixed(rate % 1 ? 2 : 0)}×`;
        }
    }
}

function onPointerUp() {
    const video = currentVideo();
    if (!video) return;
    try { video.__cigNativeFsSetInteracting?.(false); } catch (_) {}
}

function onClick(event) {
    const button = buttonFromEvent(event);
    if (!(button instanceof HTMLButtonElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("pointerup", onPointerUp, true);
        document.addEventListener("pointercancel", onPointerUp, true);
        document.addEventListener("click", onClick, true);
    },
});
