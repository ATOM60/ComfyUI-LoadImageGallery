import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.GpuNativeFullscreen";
const STYLE_ID = "cig-gpu-native-fullscreen-style";
const NATIVE_FS_FLAG = "cigNativeFullscreen";
const FULLSCREEN_UI_HIDE_DELAY = 1800;

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

function setNativeControlsVisible(video, visible) {
    if (!(video instanceof HTMLVideoElement)) return;
    video.classList.toggle("cig-native-ui-hidden", !visible);
    try {
        video.controls = !!visible;
        if (visible) video.setAttribute("controls", "");
        else video.removeAttribute("controls");
    } catch (_) {}
}

function installNativeFullscreenBehavior(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    try { video.__cigNativeFsCleanup?.(); } catch (_) {}

    let hideTimer = 0;
    let interacting = false;

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
        event.preventDefault();
        event.stopPropagation();
        clearHideTimer();
        try {
            const result = document.exitFullscreen?.() || document.webkitExitFullscreen?.();
            result?.catch?.(() => {});
        } catch (_) {}
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
        video.removeEventListener("pointermove", onActivity, true);
        video.removeEventListener("pointerdown", onPointerDown, true);
        video.removeEventListener("pointerup", onPointerUp, true);
        video.removeEventListener("pointercancel", onPointerUp, true);
        video.removeEventListener("touchstart", onActivity, true);
        video.removeEventListener("pause", onPause, true);
        video.removeEventListener("play", onPlay, true);
        video.removeEventListener("dblclick", onDoubleClick, true);
        document.removeEventListener("keydown", onActivity, true);
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
    for (const video of document.querySelectorAll("video.ovg-inline-video[data-cig-native-fullscreen=\"1\"]")) {
        if (!(video instanceof HTMLVideoElement)) continue;
        if (fs === video || video.webkitDisplayingFullscreen === true) continue;
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
