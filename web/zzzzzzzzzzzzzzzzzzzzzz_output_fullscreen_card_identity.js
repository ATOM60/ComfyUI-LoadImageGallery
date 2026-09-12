import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputFullscreenCardIdentity";

let active = null;

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function videoEndpoint(path) {
    return `/image-gallery/output/video?path=${encodeURIComponent(path)}`;
}

function thumbEndpoint(path) {
    return `/image-gallery/output/thumb?path=${encodeURIComponent(path)}`;
}

function captureActiveCard() {
    const shell = fullscreenElement();
    if (!(shell instanceof HTMLElement) || shell.dataset?.cigNativeShell !== "1") return;

    const video = shell.querySelector('video.ovg-inline-video[data-cig-native-fullscreen="1"]');
    if (!(video instanceof HTMLVideoElement)) return;

    const card = shell.closest(".ovg-card[data-path]");
    if (!(card instanceof HTMLElement)) return;

    const path = String(card.dataset.path || "").trim();
    if (!path) return;

    active = {
        shell,
        video,
        card,
        path,
        src: video.getAttribute("src") || "",
        poster: video.getAttribute("poster") || "",
        currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
        paused: !!video.paused,
        rate: Number.isFinite(video.playbackRate) ? video.playbackRate : 1,
        volume: Number.isFinite(video.volume) ? video.volume : 1,
    };
}

function restoreCapturedCard(state) {
    if (!state || fullscreenElement()) return;

    const { video, card, path } = state;
    if (!(video instanceof HTMLVideoElement) || !(card instanceof HTMLElement)) return;
    if (!video.isConnected || !card.isConnected || !card.contains(video)) return;

    const currentPath = String(video.dataset.cigCurrentPath || "").trim();
    if (!currentPath || currentPath === path) return;

    try { video.pause(); } catch (_) {}

    try {
        video.dataset.cigCurrentPath = path;
        video.poster = state.poster || thumbEndpoint(path);
        video.src = state.src || videoEndpoint(path);
        video.defaultPlaybackRate = state.rate;
        video.playbackRate = state.rate;
        video.volume = state.volume;
        video.controls = false;
        video.removeAttribute("controls");
        video.load();
    } catch (_) {
        return;
    }

    const restorePlaybackState = () => {
        try {
            if (Number.isFinite(state.currentTime) && state.currentTime > 0 && Number.isFinite(video.duration) && video.duration > 0) {
                video.currentTime = Math.min(state.currentTime, Math.max(0, video.duration - 0.05));
            }
            video.defaultPlaybackRate = state.rate;
            video.playbackRate = state.rate;
            video.volume = state.volume;
            if (!state.paused) video.play()?.catch?.(() => {});
        } catch (_) {}
    };

    if (video.readyState >= 1) restorePlaybackState();
    else video.addEventListener("loadedmetadata", restorePlaybackState, { once:true });
}

function onFullscreenChange() {
    const fs = fullscreenElement();
    if (fs instanceof HTMLElement && fs.dataset?.cigNativeShell === "1") {
        captureActiveCard();
        return;
    }

    if (!active) return;
    const state = active;
    active = null;

    requestAnimationFrame(() => {
        if (!fullscreenElement()) restoreCapturedCard(state);
    });
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.addEventListener("fullscreenchange", onFullscreenChange, true);
        document.addEventListener("webkitfullscreenchange", onFullscreenChange, true);
    },
});
