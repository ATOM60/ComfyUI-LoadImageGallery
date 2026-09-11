import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.GpuNativeFullscreen";
const STYLE_ID = "cig-gpu-native-fullscreen-style";
const NATIVE_FS_FLAG = "cigNativeFullscreen";

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
