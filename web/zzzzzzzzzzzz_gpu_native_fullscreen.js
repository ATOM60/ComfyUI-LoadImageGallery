import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.GpuNativeFullscreen";
const STYLE_ID = "cig-gpu-native-fullscreen-style";
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

function loadVolume() {
    try {
        const value = localStorage.getItem(VOLUME_KEY);
        return value == null ? 1 : clamp(value, 0, 1, 1);
    } catch (_) {
        return 1;
    }
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cig-native-fs-shell[data-cig-native-shell="1"]:fullscreen,
.cig-native-fs-shell[data-cig-native-shell="1"]:-webkit-full-screen {
    position:fixed!important;
    inset:0!important;
    width:100vw!important;
    height:100vh!important;
    max-width:none!important;
    max-height:none!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    background:#000!important;
    overflow:hidden!important;
}
.cig-native-fs-shell[data-cig-native-shell="1"] > video.ovg-inline-video[data-cig-native-fullscreen="1"] {
    position:absolute!important;
    inset:0!important;
    width:100%!important;
    height:100%!important;
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
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-prev {
    position:absolute;
    right:28px;
    top:50%;
    transform:translateY(-50%);
    z-index:20;
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
    pointer-events:auto;
}
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-prev:hover {
    background:rgba(45,45,45,.86);
}
.cig-native-fs-shell[data-cig-native-shell="1"].cig-native-ui-hidden .cig-native-prev {
    display:none!important;
}
.cig-native-fs-shell[data-cig-native-shell="1"].cig-native-ui-hidden {
    cursor:none!important;
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

async function navigatePrevious(video) {
    const paths = galleryPaths(video);
    if (paths.length < 2) return;
    let index = paths.indexOf(currentPath(video));
    if (index < 0) index = 0;
    index = (index - 1 + paths.length) % paths.length;
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

function createFullscreenShell(video) {
    if (!(video instanceof HTMLVideoElement) || !(video.parentNode instanceof Node)) return null;

    const parent = video.parentNode;
    const nextSibling = video.nextSibling;
    const shell = document.createElement("div");
    shell.className = "cig-native-fs-shell";
    shell.dataset.cigNativeShell = "1";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "cig-native-prev";
    prev.title = "Предыдущее видео";
    prev.textContent = "⏮";

    parent.insertBefore(shell, video);
    shell.appendChild(video);
    shell.appendChild(prev);

    video.__cigNativeFsShell = shell;
    video.__cigNativeFsOriginalParent = parent;
    video.__cigNativeFsOriginalNextSibling = nextSibling;
    video.__cigNativeFsPrevButton = prev;

    return shell;
}

function restoreVideoParent(video) {
    const shell = video?.__cigNativeFsShell;
    const parent = video?.__cigNativeFsOriginalParent;
    const nextSibling = video?.__cigNativeFsOriginalNextSibling;

    if (parent instanceof Node) {
        try {
            if (nextSibling instanceof Node && nextSibling.parentNode === parent) parent.insertBefore(video, nextSibling);
            else parent.appendChild(video);
        } catch (_) {}
    }
    try { shell?.remove?.(); } catch (_) {}

    delete video.__cigNativeFsShell;
    delete video.__cigNativeFsOriginalParent;
    delete video.__cigNativeFsOriginalNextSibling;
    delete video.__cigNativeFsPrevButton;
}

function setNativeControlsVisible(video, visible) {
    if (!(video instanceof HTMLVideoElement)) return;
    const shell = video.__cigNativeFsShell;
    shell?.classList?.toggle("cig-native-ui-hidden", !visible);
    try {
        video.controls = !!visible;
        if (visible) video.setAttribute("controls", "");
        else video.removeAttribute("controls");
    } catch (_) {}
}

function installNativeFullscreenBehavior(video, shell) {
    if (!(video instanceof HTMLVideoElement) || !(shell instanceof HTMLElement)) return;
    try { video.__cigNativeFsCleanup?.(); } catch (_) {}

    const prev = video.__cigNativeFsPrevButton;
    let hideTimer = 0;
    let interacting = false;

    const clearHideTimer = () => {
        if (!hideTimer) return;
        clearTimeout(hideTimer);
        hideTimer = 0;
    };

    const isActive = () => fullscreenElement() === shell;

    const showUi = () => {
        clearHideTimer();
        setNativeControlsVisible(video, true);
    };

    const scheduleHide = () => {
        showUi();
        if (!isActive() || video.paused || interacting) return;
        hideTimer = setTimeout(() => {
            hideTimer = 0;
            if (!isActive() || video.paused || interacting) return;
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
        if (event.target instanceof Element && event.target.closest(".cig-native-prev")) return;
        event.preventDefault();
        event.stopPropagation();
        clearHideTimer();
        try {
            const result = document.exitFullscreen?.() || document.webkitExitFullscreen?.();
            result?.catch?.(() => {});
        } catch (_) {}
    };

    const onPrevClick = async event => {
        event.preventDefault();
        event.stopPropagation();
        interacting = true;
        showUi();
        await navigatePrevious(video);
        interacting = false;
        scheduleHide();
    };

    shell.addEventListener("pointermove", onActivity, true);
    shell.addEventListener("pointerdown", onPointerDown, true);
    shell.addEventListener("pointerup", onPointerUp, true);
    shell.addEventListener("pointercancel", onPointerUp, true);
    shell.addEventListener("touchstart", onActivity, { capture:true, passive:true });
    shell.addEventListener("dblclick", onDoubleClick, true);
    video.addEventListener("pause", onPause, true);
    video.addEventListener("play", onPlay, true);
    document.addEventListener("keydown", onActivity, true);
    prev?.addEventListener?.("click", onPrevClick, true);

    video.__cigNativeFsCleanup = () => {
        clearHideTimer();
        shell.removeEventListener("pointermove", onActivity, true);
        shell.removeEventListener("pointerdown", onPointerDown, true);
        shell.removeEventListener("pointerup", onPointerUp, true);
        shell.removeEventListener("pointercancel", onPointerUp, true);
        shell.removeEventListener("touchstart", onActivity, true);
        shell.removeEventListener("dblclick", onDoubleClick, true);
        video.removeEventListener("pause", onPause, true);
        video.removeEventListener("play", onPlay, true);
        document.removeEventListener("keydown", onActivity, true);
        prev?.removeEventListener?.("click", onPrevClick, true);
        delete video.__cigNativeFsCleanup;
    };

    showUi();
    if (!video.paused) scheduleHide();
}

function prepareNativeFullscreen(video) {
    if (!(video instanceof HTMLVideoElement)) return null;
    try {
        video.__cigGpuControlsObserver?.disconnect?.();
        delete video.__cigGpuControlsObserver;
    } catch (_) {}

    video.dataset[NATIVE_FS_FLAG] = "1";
    const shell = createFullscreenShell(video);
    if (!(shell instanceof HTMLElement)) return null;
    setNativeControlsVisible(video, true);
    installNativeFullscreenBehavior(video, shell);
    return shell;
}

function restoreCustomPlayer(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    try { video.__cigNativeFsCleanup?.(); } catch (_) {}
    delete video.dataset[NATIVE_FS_FLAG];
    try {
        video.controls = false;
        video.removeAttribute("controls");
    } catch (_) {}
    restoreVideoParent(video);
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

        const shell = prepareNativeFullscreen(video);
        if (!(shell instanceof HTMLElement)) return nativeRequest.apply(this, args);

        let result;
        try {
            result = nativeRequest.apply(shell, args);
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
        const shell = prepareNativeFullscreen(video);
        if (!(shell instanceof HTMLElement)) return nativeRequest.apply(this, args);
        try {
            return nativeRequest.apply(shell, args);
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
        const shell = video.__cigNativeFsShell;
        if (fs === shell) continue;
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
