import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.GpuNativeFullscreen";
const STYLE_ID = "cig-gpu-native-fullscreen-style";
const OVERLAY_ID = "cig-gpu-native-fs-controls";
const NATIVE_FS_FLAG = "cigNativeFullscreen";
const FULLSCREEN_UI_HIDE_DELAY = 1800;
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

function saveRate(value) {
    try { localStorage.setItem(RATE_KEY, String(clamp(value, .25, 3, 1))); }
    catch (_) {}
}

function loadVolume() {
    try {
        const value = localStorage.getItem(VOLUME_KEY);
        return value == null ? 1 : clamp(value, 0, 1, 1);
    } catch (_) {
        return 1;
    }
}

function currentPath(video) {
    return String(video?.dataset?.cigCurrentPath || video?.closest?.(".ovg-card")?.dataset?.path || "");
}

function videoEndpoint(path) {
    return `/image-gallery/output/video?path=${encodeURIComponent(path)}`;
}

function thumbEndpoint(path) {
    return `/image-gallery/output/thumb?path=${encodeURIComponent(path)}`;
}

function galleryPaths(video) {
    const grid = video?.closest?.(".ovg-card")?.closest?.(".ovg-grid");
    if (!grid) return [];
    return [...grid.querySelectorAll(".ovg-card[data-path]")]
        .map(el => String(el.dataset.path || ""))
        .filter(Boolean);
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

function rateText(value) {
    const rate = clamp(value, .25, 3, 1);
    return `${rate.toFixed(rate % 1 ? 2 : 0)}×`;
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
video.ovg-inline-video[data-cig-native-fullscreen="1"]:fullscreen,
video.ovg-inline-video[data-cig-native-fullscreen="1"]:-webkit-full-screen {
    position:fixed!important;
    inset:0!important;
    width:100vw!important;
    height:100vh!important;
    max-width:none!important;
    max-height:none!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    border-radius:0!important;
    object-fit:contain!important;
    background:#000!important;
    pointer-events:auto!important;
}
video.ovg-inline-video[data-cig-native-fullscreen="1"].cig-native-ui-hidden:fullscreen,
video.ovg-inline-video[data-cig-native-fullscreen="1"].cig-native-ui-hidden:-webkit-full-screen {
    cursor:none!important;
}
#${OVERLAY_ID}[popover] {
    position:fixed!important;
    inset:50% 28px auto auto!important;
    transform:translateY(-50%)!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    background:transparent!important;
    overflow:visible!important;
    color:#fff!important;
}
#${OVERLAY_ID} .cig-gpu-fs-stack {
    display:flex;
    flex-direction:column;
    gap:8px;
    align-items:center;
}
#${OVERLAY_ID} .cig-gpu-fs-button {
    width:44px;
    height:44px;
    min-width:44px;
    padding:0;
    border:1px solid rgba(255,255,255,.22);
    border-radius:8px;
    background:rgba(20,20,20,.72);
    color:#fff;
    font:18px/42px Arial,sans-serif;
    cursor:pointer;
}
#${OVERLAY_ID} .cig-gpu-fs-button:hover {
    background:rgba(45,45,45,.86);
}
#${OVERLAY_ID} .cig-gpu-speed-wrap {
    position:relative;
}
#${OVERLAY_ID} .cig-gpu-speed-panel {
    display:none;
    position:absolute;
    right:54px;
    top:50%;
    transform:translateY(-50%);
    padding:10px 12px;
    border:1px solid rgba(255,255,255,.18);
    border-radius:8px;
    background:rgba(20,20,20,.86);
    white-space:nowrap;
    color:#fff;
    font:12px Arial,sans-serif;
    align-items:center;
    gap:8px;
}
#${OVERLAY_ID} .cig-gpu-speed-panel.open {
    display:flex;
}
#${OVERLAY_ID} .cig-gpu-speed-range {
    width:150px!important;
    height:auto!important;
    margin:0!important;
    writing-mode:horizontal-tb!important;
    direction:ltr!important;
    accent-color:#79adff!important;
    cursor:pointer!important;
}
#${OVERLAY_ID} .cig-gpu-speed-value {
    min-width:48px;
    text-align:center;
    font-variant-numeric:tabular-nums;
}
`;
    document.head.appendChild(style);
}

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function isGpuWrapper(el) {
    return el instanceof HTMLElement && el.classList.contains("ovg-gpu-player");
}

function gpuVideoFromWrapper(el) {
    if (!isGpuWrapper(el)) return null;
    const video = el.querySelector("video.ovg-inline-video");
    return video instanceof HTMLVideoElement ? video : null;
}

function destroyOverlay(video) {
    const overlay = video?.__cigNativeFsOverlay;
    if (!(overlay instanceof HTMLElement)) return;
    try { overlay.hidePopover?.(); } catch (_) {}
    try { overlay.remove(); } catch (_) {}
    delete video.__cigNativeFsOverlay;
}

function createOverlay(video) {
    if (!(video instanceof HTMLVideoElement)) return null;
    destroyOverlay(video);

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("popover", "manual");
    overlay.innerHTML = `
        <div class="cig-gpu-fs-stack">
            <button class="cig-gpu-fs-button cig-gpu-prev" type="button" title="Предыдущее видео">⏮</button>
            <div class="cig-gpu-speed-wrap">
                <button class="cig-gpu-fs-button cig-gpu-speed" type="button" title="Скорость воспроизведения">⏱</button>
                <div class="cig-gpu-speed-panel">
                    <input class="cig-gpu-speed-range" type="range" min="0.25" max="3" step="0.05">
                    <span class="cig-gpu-speed-value"></span>
                </div>
            </div>
            <button class="cig-gpu-fs-button cig-gpu-next" type="button" title="Следующее видео">⏭</button>
        </div>
    `;

    const prev = overlay.querySelector(".cig-gpu-prev");
    const next = overlay.querySelector(".cig-gpu-next");
    const speed = overlay.querySelector(".cig-gpu-speed");
    const speedPanel = overlay.querySelector(".cig-gpu-speed-panel");
    const speedRange = overlay.querySelector(".cig-gpu-speed-range");
    const speedValue = overlay.querySelector(".cig-gpu-speed-value");

    const syncRate = () => {
        const rate = clamp(video.playbackRate, .25, 3, loadRate());
        speedRange.value = String(rate);
        speedValue.textContent = rateText(rate);
    };
    syncRate();

    const keepVisible = () => {
        try { video.__cigNativeFsActivity?.(); } catch (_) {}
    };

    const setInteracting = value => {
        try { video.__cigNativeFsSetInteracting?.(!!value); } catch (_) {}
    };

    overlay.addEventListener("pointermove", keepVisible, true);
    overlay.addEventListener("pointerdown", () => setInteracting(true), true);
    overlay.addEventListener("pointerup", () => setInteracting(false), true);
    overlay.addEventListener("pointercancel", () => setInteracting(false), true);
    overlay.addEventListener("dblclick", event => {
        event.preventDefault();
        event.stopPropagation();
    }, true);

    prev.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        await navigate(video, -1);
        keepVisible();
    });

    next.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        await navigate(video, 1);
        keepVisible();
    });

    speed.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const open = !speedPanel.classList.contains("open");
        speedPanel.classList.toggle("open", open);
        try { video.__cigNativeFsSetRateEditing?.(open); } catch (_) {}
        if (open) syncRate();
        keepVisible();
    });

    speedRange.addEventListener("pointerdown", () => {
        setInteracting(true);
        try { video.__cigNativeFsSetRateEditing?.(true); } catch (_) {}
    });
    speedRange.addEventListener("input", () => {
        const rate = clamp(speedRange.value, .25, 3, 1);
        video.defaultPlaybackRate = rate;
        video.playbackRate = rate;
        saveRate(rate);
        speedValue.textContent = rateText(rate);
    });
    speedRange.addEventListener("change", () => {
        setInteracting(false);
        try { video.__cigNativeFsSetRateEditing?.(true); } catch (_) {}
        keepVisible();
    });

    document.body.appendChild(overlay);
    video.__cigNativeFsOverlay = overlay;
    try { overlay.showPopover?.(); } catch (_) {}
    return overlay;
}

function setNativeControlsVisible(video, visible) {
    if (!(video instanceof HTMLVideoElement)) return;
    video.classList.toggle("cig-native-ui-hidden", !visible);
    try {
        video.controls = !!visible;
        if (visible) video.setAttribute("controls", "");
        else video.removeAttribute("controls");
    } catch (_) {}

    const active = fullscreenElement() === video || video.webkitDisplayingFullscreen === true;
    if (visible && active) {
        if (!(video.__cigNativeFsOverlay instanceof HTMLElement)) createOverlay(video);
    } else if (!visible) {
        destroyOverlay(video);
    }
}

function installNativeFullscreenBehavior(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    try { video.__cigNativeFsCleanup?.(); } catch (_) {}

    let hideTimer = 0;
    let interacting = false;
    let rateEditing = false;

    const clearHideTimer = () => {
        if (!hideTimer) return;
        clearTimeout(hideTimer);
        hideTimer = 0;
    };

    const isActive = () => fullscreenElement() === video || video.webkitDisplayingFullscreen === true;

    const showUi = () => {
        clearHideTimer();
        setNativeControlsVisible(video, true);
    };

    const scheduleHide = () => {
        showUi();
        if (!isActive() || video.paused || interacting || rateEditing) return;
        hideTimer = setTimeout(() => {
            hideTimer = 0;
            if (!isActive() || video.paused || interacting || rateEditing) return;
            setNativeControlsVisible(video, false);
        }, FULLSCREEN_UI_HIDE_DELAY);
    };

    const onActivity = () => {
        if (isActive()) scheduleHide();
    };

    const onPointerDown = () => {
        if (!isActive()) return;
        interacting = true;
        showUi();
    };

    const onPointerUp = () => {
        if (!isActive()) return;
        interacting = false;
        scheduleHide();
    };

    const onPause = () => {
        if (!isActive()) return;
        interacting = false;
        showUi();
    };

    const onPlay = () => {
        if (isActive()) scheduleHide();
    };

    const onDoubleClick = event => {
        if (!isActive()) return;
        event.preventDefault();
        event.stopPropagation();
        clearHideTimer();
        destroyOverlay(video);
        try {
            const result = document.exitFullscreen?.() || document.webkitExitFullscreen?.();
            result?.catch?.(() => {});
        } catch (_) {}
    };

    video.__cigNativeFsActivity = onActivity;
    video.__cigNativeFsSetInteracting = value => {
        interacting = !!value;
        if (interacting) showUi();
        else scheduleHide();
    };
    video.__cigNativeFsSetRateEditing = value => {
        rateEditing = !!value;
        if (rateEditing) showUi();
        else scheduleHide();
    };

    video.addEventListener("pointermove", onActivity, true);
    video.addEventListener("pointerdown", onPointerDown, true);
    video.addEventListener("pointerup", onPointerUp, true);
    video.addEventListener("pointercancel", onPointerUp, true);
    video.addEventListener("touchstart", onActivity, { capture:true, passive:true });
    video.addEventListener("pause", onPause, true);
    video.addEventListener("play", onPlay, true);
    video.addEventListener("dblclick", onDoubleClick, true);
    document.addEventListener("keydown", onActivity, true);

    video.__cigNativeFsCleanup = () => {
        clearHideTimer();
        destroyOverlay(video);
        video.removeEventListener("pointermove", onActivity, true);
        video.removeEventListener("pointerdown", onPointerDown, true);
        video.removeEventListener("pointerup", onPointerUp, true);
        video.removeEventListener("pointercancel", onPointerUp, true);
        video.removeEventListener("touchstart", onActivity, true);
        video.removeEventListener("pause", onPause, true);
        video.removeEventListener("play", onPlay, true);
        video.removeEventListener("dblclick", onDoubleClick, true);
        document.removeEventListener("keydown", onActivity, true);
        delete video.__cigNativeFsActivity;
        delete video.__cigNativeFsSetInteracting;
        delete video.__cigNativeFsSetRateEditing;
        delete video.__cigNativeFsCleanup;
    };

    showUi();
    if (!video.paused) scheduleHide();
}

function prepareNativeFullscreen(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    try {
        video.__cigGpuControlsObserver?.disconnect?.();
        delete video.__cigGpuControlsObserver;
    } catch (_) {}
    video.dataset[NATIVE_FS_FLAG] = "1";
    setNativeControlsVisible(video, true);
    installNativeFullscreenBehavior(video);
}

function restoreCustomPlayer(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    try { video.__cigNativeFsCleanup?.(); } catch (_) {}
    destroyOverlay(video);
    delete video.dataset[NATIVE_FS_FLAG];
    video.classList.remove("cig-native-ui-hidden");
    try {
        video.controls = false;
        video.removeAttribute("controls");
    } catch (_) {}
    try { video.__cigGpuUi && (video.__cigGpuUi.hit.title = ""); } catch (_) {}
}

function patchRequestFullscreen() {
    const proto = Element.prototype;
    if (proto.__cigGpuNativeFullscreenPatched) return;
    const nativeRequest = proto.requestFullscreen;
    if (typeof nativeRequest !== "function") return;

    Object.defineProperty(proto, "__cigGpuNativeFullscreenPatched", {
        configurable:true,
        value:true,
    });
    Object.defineProperty(proto, "__cigGpuNativeFullscreenOriginal", {
        configurable:true,
        value:nativeRequest,
    });

    proto.requestFullscreen = function(...args) {
        const video = gpuVideoFromWrapper(this);
        if (!video) return nativeRequest.apply(this, args);

        prepareNativeFullscreen(video);
        let result;
        try {
            result = nativeRequest.apply(video, args);
        } catch (error) {
            restoreCustomPlayer(video);
            throw error;
        }
        if (result && typeof result.then === "function") {
            result.then(() => video.__cigNativeFsActivity?.()).catch(() => restoreCustomPlayer(video));
        }
        return result;
    };
}

function patchWebkitFullscreen() {
    const proto = Element.prototype;
    if (proto.__cigGpuNativeWebkitFullscreenPatched) return;
    const nativeRequest = proto.webkitRequestFullscreen;
    if (typeof nativeRequest !== "function") return;

    Object.defineProperty(proto, "__cigGpuNativeWebkitFullscreenPatched", {
        configurable:true,
        value:true,
    });
    Object.defineProperty(proto, "__cigGpuNativeWebkitFullscreenOriginal", {
        configurable:true,
        value:nativeRequest,
    });

    proto.webkitRequestFullscreen = function(...args) {
        const video = gpuVideoFromWrapper(this);
        if (!video) return nativeRequest.apply(this, args);
        prepareNativeFullscreen(video);
        try {
            const result = nativeRequest.apply(video, args);
            result?.then?.(() => video.__cigNativeFsActivity?.());
            return result;
        } catch (error) {
            restoreCustomPlayer(video);
            throw error;
        }
    };
}

function syncFullscreenState() {
    const fs = fullscreenElement();
    for (const video of document.querySelectorAll("video.ovg-inline-video[data-cig-native-fullscreen=\"1\"]")) {
        if (!(video instanceof HTMLVideoElement)) continue;
        if (fs === video || video.webkitDisplayingFullscreen === true) {
            try { video.__cigNativeFsActivity?.(); } catch (_) {}
            continue;
        }
        restoreCustomPlayer(video);
        try { video.__cigGpuUi && video.__cigGpuUi.fullscreen && (video.__cigGpuUi.fullscreen.textContent = "⛶"); } catch (_) {}
    }
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        patchRequestFullscreen();
        patchWebkitFullscreen();
        document.addEventListener("fullscreenchange", syncFullscreenState, true);
        document.addEventListener("webkitfullscreenchange", syncFullscreenState, true);
    },
});
