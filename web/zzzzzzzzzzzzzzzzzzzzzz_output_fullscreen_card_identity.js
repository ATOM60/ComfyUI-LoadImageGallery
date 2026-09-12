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

function findCardForPath(originCard, path) {
    const grid = originCard?.closest?.(".ovg-grid");
    if (!(grid instanceof HTMLElement)) return null;
    for (const card of grid.querySelectorAll(":scope > .ovg-card[data-path]")) {
        if (!(card instanceof HTMLElement)) continue;
        if (String(card.dataset.path || "").trim() === path) return card;
    }
    return null;
}

function applyPlaybackState(video, state, { play = false } = {}) {
    if (!(video instanceof HTMLVideoElement)) return;

    const restore = () => {
        try {
            if (state.ended) {
                video.currentTime = 0;
            } else if (Number.isFinite(state.currentTime) && state.currentTime >= 0 && Number.isFinite(video.duration) && video.duration > 0) {
                video.currentTime = Math.min(state.currentTime, Math.max(0, video.duration - 0.05));
            }
            video.defaultPlaybackRate = state.rate;
            video.playbackRate = state.rate;
            video.volume = state.volume;
            if (play) video.play()?.catch?.(() => {});
        } catch (_) {}
    };

    if (video.readyState >= 1) restore();
    else video.addEventListener("loadedmetadata", restore, { once:true });
}

function restoreOriginCard(state, navigatedAway) {
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

    // If fullscreen navigation moved to another item, keep the origin card quiet.
    // The currently selected item will resume in its own card below.
    applyPlaybackState(video, state, { play: !navigatedAway && !state.paused });
}

function handoffToCurrentCard(state, current) {
    const targetCard = findCardForPath(state.card, current.path);
    if (!(targetCard instanceof HTMLElement) || targetCard === state.card) return;

    const targetVideo = targetCard.querySelector("video.ovg-inline-video");
    if (!(targetVideo instanceof HTMLVideoElement)) return;

    try {
        targetVideo.dataset.cigCurrentPath = current.path;
        targetVideo.poster = thumbEndpoint(current.path);

        const expectedSrc = videoEndpoint(current.path);
        const rawSrc = targetVideo.getAttribute("src") || "";
        if (!rawSrc || !rawSrc.includes(encodeURIComponent(current.path))) {
            targetVideo.src = expectedSrc;
            targetVideo.load();
        }

        targetVideo.defaultPlaybackRate = current.rate;
        targetVideo.playbackRate = current.rate;
        targetVideo.volume = current.volume;
        targetVideo.controls = false;
        targetVideo.removeAttribute("controls");
    } catch (_) {
        return;
    }

    // Natural end is not a user pause: restart that video in its own preview card.
    applyPlaybackState(targetVideo, current, { play: current.ended || !current.paused });
}

function restoreAfterFullscreen(state) {
    if (!state || fullscreenElement()) return;

    const video = state.video;
    if (!(video instanceof HTMLVideoElement)) return;

    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const ended = !!video.ended || (duration > 0 && currentTime >= Math.max(0, duration - 0.15));

    const current = {
        path: String(video.dataset.cigCurrentPath || state.path).trim(),
        currentTime,
        duration,
        ended,
        paused: !!video.paused,
        rate: Number.isFinite(video.playbackRate) ? video.playbackRate : state.rate,
        volume: Number.isFinite(video.volume) ? video.volume : state.volume,
    };

    const navigatedAway = !!current.path && current.path !== state.path;
    if (!navigatedAway) return;

    restoreOriginCard(state, true);
    handoffToCurrentCard(state, current);
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
        if (!fullscreenElement()) restoreAfterFullscreen(state);
    });
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.addEventListener("fullscreenchange", onFullscreenChange, true);
        document.addEventListener("webkitfullscreenchange", onFullscreenChange, true);
    },
});
