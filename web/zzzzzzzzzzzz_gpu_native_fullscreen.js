import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.GpuNativeFullscreen";
const STYLE_ID = "cig-gpu-native-fullscreen-style";
const OVERLAY_ID = "cig-gpu-native-fullscreen-overlay";
const NATIVE_FS_FLAG = "cigNativeFullscreen";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const OVERLAY_HIDE_DELAY_MS = 3500;

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en").toLowerCase().startsWith("ru");
const TEXT = RU ? {
    prev: "Предыдущее видео",
    next: "Следующее видео",
    speed: "Скорость воспроизведения",
} : {
    prev: "Previous video",
    next: "Next video",
    speed: "Playback speed",
};

let activeVideo = null;
let hideTimer = 0;
let videoListenersCleanup = null;

function clamp(value, min, max, fallback = min) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function rateText(value) {
    const rate = clamp(value, .25, 3, 1);
    return `${rate.toFixed(rate % 1 ? 2 : 0)}×`;
}

function saveRate(value) {
    try { localStorage.setItem(RATE_KEY, String(clamp(value, .25, 3, 1))); } catch (_) {}
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
#${OVERLAY_ID}[popover] {
    position:fixed!important;
    inset:50% 24px auto auto!important;
    transform:translateY(-50%)!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    background:transparent!important;
    overflow:visible!important;
    color:#fff!important;
}
#${OVERLAY_ID}::backdrop { background:transparent!important; }
#${OVERLAY_ID}.cig-hidden { opacity:0!important; pointer-events:none!important; }
#${OVERLAY_ID} .cig-native-fs-controls {
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:8px;
    opacity:1;
    transition:opacity .12s ease;
}
#${OVERLAY_ID} button {
    box-sizing:border-box;
    width:46px;
    height:46px;
    min-width:46px;
    padding:0 4px;
    border:1px solid rgba(255,255,255,.24);
    border-radius:8px;
    background:rgba(18,18,18,.76);
    color:#fff;
    font:600 17px/44px Arial,sans-serif;
    text-align:center;
    cursor:pointer;
    box-shadow:none;
}
#${OVERLAY_ID} button:hover { background:rgba(48,48,48,.9); }
#${OVERLAY_ID} .cig-native-fs-speed-wrap { position:relative; }
#${OVERLAY_ID} .cig-native-fs-speed {
    font-size:13px;
    font-variant-numeric:tabular-nums;
}
#${OVERLAY_ID} .cig-native-fs-speed-panel {
    display:none;
    position:absolute;
    right:54px;
    top:50%;
    transform:translateY(-50%);
    align-items:center;
    gap:9px;
    min-width:210px;
    padding:9px 11px;
    border:1px solid rgba(255,255,255,.22);
    border-radius:8px;
    background:rgba(18,18,18,.88);
    color:#fff;
    font:12px Arial,sans-serif;
    white-space:nowrap;
    box-shadow:none;
}
#${OVERLAY_ID} .cig-native-fs-speed-panel.open { display:flex; }
#${OVERLAY_ID} .cig-native-fs-speed-range {
    width:150px;
    margin:0;
    accent-color:#fff;
    cursor:pointer;
}
#${OVERLAY_ID} .cig-native-fs-speed-value {
    min-width:38px;
    text-align:right;
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
    if (!(video instanceof HTMLVideoElement)) return;
    const paths = galleryPaths(video);
    if (paths.length < 2) return;
    let index = paths.indexOf(currentPath(video));
    if (index < 0) index = 0;
    index = (index + dir + paths.length) % paths.length;
    const path = paths[index];
    if (!path) return;

    const rate = clamp(video.playbackRate, .25, 3, 1);
    const volume = clamp(video.volume, 0, 1, 1);
    const muted = !!video.muted;
    video.dataset.cigCurrentPath = path;
    video.poster = thumbEndpoint(path);
    video.src = videoEndpoint(path);
    video.load();
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
    video.volume = volume;
    video.muted = muted;
    try { await video.play(); } catch (_) {}
    syncOverlayValues();
    showOverlay();
}

function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay instanceof HTMLElement) return overlay;

    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("popover", "manual");
    overlay.className = "cig-hidden";
    overlay.innerHTML = `
        <div class="cig-native-fs-controls">
            <button class="cig-native-fs-prev" type="button" title="${TEXT.prev}">⏮</button>
            <div class="cig-native-fs-speed-wrap">
                <button class="cig-native-fs-speed" type="button" title="${TEXT.speed}">1×</button>
                <div class="cig-native-fs-speed-panel">
                    <input class="cig-native-fs-speed-range" type="range" min="0.25" max="3" step="0.05" value="1">
                    <span class="cig-native-fs-speed-value">1×</span>
                </div>
            </div>
            <button class="cig-native-fs-next" type="button" title="${TEXT.next}">⏭</button>
        </div>`;
    document.body.appendChild(overlay);

    const prev = overlay.querySelector(".cig-native-fs-prev");
    const next = overlay.querySelector(".cig-native-fs-next");
    const speed = overlay.querySelector(".cig-native-fs-speed");
    const panel = overlay.querySelector(".cig-native-fs-speed-panel");
    const range = overlay.querySelector(".cig-native-fs-speed-range");

    const consume = event => event.stopPropagation();
    overlay.addEventListener("pointerdown", consume, true);
    overlay.addEventListener("dblclick", event => {
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
    overlay.addEventListener("pointermove", () => showOverlay(), true);

    prev?.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (activeVideo) navigate(activeVideo, -1);
    });
    next?.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (activeVideo) navigate(activeVideo, 1);
    });
    speed?.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        panel?.classList.toggle("open");
        syncOverlayValues();
        showOverlay();
    });
    range?.addEventListener("input", event => {
        event.stopPropagation();
        if (!activeVideo) return;
        const rate = clamp(range.value, .25, 3, 1);
        activeVideo.defaultPlaybackRate = rate;
        activeVideo.playbackRate = rate;
        saveRate(rate);
        syncOverlayValues();
        showOverlay();
    });

    return overlay;
}

function syncOverlayValues() {
    const overlay = ensureOverlay();
    if (!activeVideo) return;
    const rate = clamp(activeVideo.playbackRate, .25, 3, 1);
    const speed = overlay.querySelector(".cig-native-fs-speed");
    const range = overlay.querySelector(".cig-native-fs-speed-range");
    const value = overlay.querySelector(".cig-native-fs-speed-value");
    if (speed) speed.textContent = rateText(rate);
    if (range) range.value = String(rate);
    if (value) value.textContent = rateText(rate);
}

function clearHideTimer() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = 0;
}

function hideOverlay() {
    clearHideTimer();
    const overlay = document.getElementById(OVERLAY_ID);
    if (!(overlay instanceof HTMLElement)) return;
    const panel = overlay.querySelector(".cig-native-fs-speed-panel");
    if (panel?.classList.contains("open")) return;
    overlay.classList.add("cig-hidden");
}

function scheduleHide() {
    clearHideTimer();
    if (!activeVideo || activeVideo.paused) return;
    const overlay = document.getElementById(OVERLAY_ID);
    const panel = overlay?.querySelector?.(".cig-native-fs-speed-panel");
    if (panel?.classList.contains("open")) return;
    hideTimer = setTimeout(() => hideOverlay(), OVERLAY_HIDE_DELAY_MS);
}

function showOverlay() {
    if (!(activeVideo instanceof HTMLVideoElement) || fullscreenElement() !== activeVideo) return;
    const overlay = ensureOverlay();
    overlay.classList.remove("cig-hidden");
    syncOverlayValues();
    try {
        if (typeof overlay.showPopover === "function" && !overlay.matches(":popover-open")) overlay.showPopover();
    } catch (_) {}
    scheduleHide();
}

function closeOverlay() {
    clearHideTimer();
    const overlay = document.getElementById(OVERLAY_ID);
    if (!(overlay instanceof HTMLElement)) return;
    overlay.classList.add("cig-hidden");
    overlay.querySelector(".cig-native-fs-speed-panel")?.classList.remove("open");
    try {
        if (typeof overlay.hidePopover === "function" && overlay.matches(":popover-open")) overlay.hidePopover();
    } catch (_) {}
}

function detachVideoListeners() {
    videoListenersCleanup?.();
    videoListenersCleanup = null;
}

function attachVideoListeners(video) {
    detachVideoListeners();
    if (!(video instanceof HTMLVideoElement)) return;
    const onPlay = () => scheduleHide();
    const onPause = () => showOverlay();
    const onRate = () => syncOverlayValues();
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ratechange", onRate);
    videoListenersCleanup = () => {
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("ratechange", onRate);
    };
}

function prepareNativeFullscreen(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    try {
        video.__cigGpuControlsObserver?.disconnect?.();
        delete video.__cigGpuControlsObserver;
    } catch (_) {}
    video.dataset[NATIVE_FS_FLAG] = "1";
    try {
        video.controls = true;
        video.setAttribute("controls", "");
    } catch (_) {}
}

function restoreCustomPlayer(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    delete video.dataset[NATIVE_FS_FLAG];
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
        if (result && typeof result.catch === "function") {
            result.catch(() => restoreCustomPlayer(video));
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
            return nativeRequest.apply(video, args);
        } catch (error) {
            restoreCustomPlayer(video);
            throw error;
        }
    };
}

function syncFullscreenState() {
    const fs = fullscreenElement();
    const nativeVideo = fs instanceof HTMLVideoElement && fs.classList.contains("ovg-inline-video") && fs.dataset[NATIVE_FS_FLAG] === "1"
        ? fs
        : null;

    if (nativeVideo) {
        if (activeVideo !== nativeVideo) {
            activeVideo = nativeVideo;
            attachVideoListeners(nativeVideo);
        }
        showOverlay();
        return;
    }

    closeOverlay();
    detachVideoListeners();
    activeVideo = null;

    for (const video of document.querySelectorAll("video.ovg-inline-video[data-cig-native-fullscreen=\"1\"]")) {
        if (!(video instanceof HTMLVideoElement)) continue;
        if (video.webkitDisplayingFullscreen === true) continue;
        restoreCustomPlayer(video);
        try { video.__cigGpuUi && video.__cigGpuUi.fullscreen && (video.__cigGpuUi.fullscreen.textContent = "⛶"); } catch (_) {}
    }
}

function onFullscreenPointerActivity(event) {
    if (!(activeVideo instanceof HTMLVideoElement) || fullscreenElement() !== activeVideo) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest?.(`#${OVERLAY_ID}`)) return;
    showOverlay();
}

function onFullscreenDoubleClick(event) {
    if (!(activeVideo instanceof HTMLVideoElement) || fullscreenElement() !== activeVideo) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest?.(`#${OVERLAY_ID}`)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
        const result = document.exitFullscreen?.() || document.webkitExitFullscreen?.();
        result?.catch?.(() => {});
    } catch (_) {}
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        ensureOverlay();
        patchRequestFullscreen();
        patchWebkitFullscreen();
        document.addEventListener("fullscreenchange", syncFullscreenState, true);
        document.addEventListener("webkitfullscreenchange", syncFullscreenState, true);
        document.addEventListener("pointermove", onFullscreenPointerActivity, true);
        document.addEventListener("pointerdown", onFullscreenPointerActivity, true);
        document.addEventListener("dblclick", onFullscreenDoubleClick, true);
    },
});
