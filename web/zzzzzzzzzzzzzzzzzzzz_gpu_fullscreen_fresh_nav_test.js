import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.GpuFullscreenGalleryRetryTest";
const STYLE_ID = "cig-gpu-fullscreen-gallery-retry-test-style";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const VOLUME_KEY = "ComfyUI-LoadImageGallery.outputVideoVolume";
const sessions = new Map();

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
    } catch (_) { return 1; }
}

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function videoEndpoint(path) {
    return `/image-gallery/output/video?path=${encodeURIComponent(path)}`;
}

function thumbEndpoint(path) {
    return `/image-gallery/output/thumb?path=${encodeURIComponent(path)}`;
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cig-native-fs-shell[data-cig-native-shell="1"] > video.cig-gallery-retry-video {
    position:absolute!important;
    inset:0!important;
    z-index:5!important;
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
`;
    document.head.appendChild(style);
}

function activeRoot(shell) {
    const video = shell?.querySelector?.('video.ovg-inline-video[data-cig-native-fullscreen="1"]');
    return video instanceof HTMLVideoElement ? video : null;
}

function currentPath(video) {
    return String(video?.dataset?.cigCurrentPath || video?.closest?.(".ovg-card")?.dataset?.path || "");
}

function gridFor(shell) {
    return shell?.closest?.(".ovg-card")?.closest?.(".ovg-grid") || null;
}

function cardsFor(shell) {
    const grid = gridFor(shell);
    return grid ? [...grid.querySelectorAll(".ovg-card[data-path]")] : [];
}

function nextPath(shell, path) {
    const cards = cardsFor(shell);
    if (cards.length < 2) return "";
    let index = cards.findIndex(card => String(card.dataset.path || "") === String(path || ""));
    if (index < 0) index = 0;
    index = (index + 1) % cards.length;
    return String(cards[index]?.dataset?.path || "");
}

function cardForPath(shell, path) {
    return cardsFor(shell).find(card => String(card.dataset.path || "") === String(path || "")) || null;
}

function isDemuxError(video, error = null) {
    const text = [video?.error?.message, error?.message, error?.name].filter(Boolean).join(" ");
    return /demux/i.test(text);
}

function restoreOriginalVideo(video, snapshot) {
    if (!(video instanceof HTMLVideoElement) || !snapshot) return;
    try { video.pause(); } catch (_) {}
    try {
        video.dataset.cigCurrentPath = snapshot.path;
        if (snapshot.poster == null) video.removeAttribute("poster");
        else video.setAttribute("poster", snapshot.poster);
        if (snapshot.src == null) video.removeAttribute("src");
        else video.setAttribute("src", snapshot.src);
        video.load();
        video.defaultPlaybackRate = snapshot.rate;
        video.playbackRate = snapshot.rate;
        video.volume = snapshot.volume;
    } catch (_) {}
}

function waitForPlaying(video, timeoutMs = 5000) {
    return new Promise(resolve => {
        if (!(video instanceof HTMLVideoElement)) { resolve(false); return; }
        if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) { resolve(true); return; }
        let done = false;
        const finish = ok => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            video.removeEventListener("playing", onPlaying, true);
            video.removeEventListener("error", onError, true);
            resolve(ok);
        };
        const onPlaying = () => finish(true);
        const onError = () => finish(false);
        const timer = setTimeout(() => finish(!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA), timeoutMs);
        video.addEventListener("playing", onPlaying, { capture:true, once:true });
        video.addEventListener("error", onError, { capture:true, once:true });
    });
}

function returnOverlayVideo(session) {
    const video = session?.overlay;
    if (!(video instanceof HTMLVideoElement)) return;
    const parent = session.overlayParent;
    const next = session.overlayNext;
    try {
        video.classList.remove("cig-gallery-retry-video");
        video.controls = false;
        video.removeAttribute("controls");
        if (parent instanceof Node) {
            if (next instanceof Node && next.parentNode === parent) parent.insertBefore(video, next);
            else parent.appendChild(video);
        }
    } catch (_) {}
    session.overlay = null;
    session.overlayParent = null;
    session.overlayNext = null;
}

function mountOverlay(shell, root, target, path) {
    let session = sessions.get(shell);
    if (!session) {
        session = { shell, root, overlay:null, overlayParent:null, overlayNext:null, currentPath:"" };
        sessions.set(shell, session);
    }

    if (session.overlay && session.overlay !== target) returnOverlayVideo(session);

    const parent = target.parentNode;
    const next = target.nextSibling;
    if (!(parent instanceof Node)) return false;

    try {
        target.__cigGpuControlsObserver?.disconnect?.();
        delete target.__cigGpuControlsObserver;
    } catch (_) {}

    session.root = root;
    session.overlay = target;
    session.overlayParent = parent;
    session.overlayNext = next;
    session.currentPath = path;

    root.style.setProperty("display", "none", "important");
    target.dataset.cigCurrentPath = path;
    target.classList.add("cig-gallery-retry-video");
    try {
        target.controls = true;
        target.setAttribute("controls", "");
    } catch (_) {}
    shell.insertBefore(target, shell.firstChild);
    try { target.play().catch(() => {}); } catch (_) {}
    return true;
}

async function startViaGallery(shell, root, path) {
    const card = cardForPath(shell, path);
    const play = card?.querySelector?.(".ovg-play");
    if (!(card instanceof HTMLElement) || !(play instanceof HTMLButtonElement)) return false;

    let target = card.querySelector("video.ovg-inline-video");
    if (!(target instanceof HTMLVideoElement)) {
        play.click();
        target = card.querySelector("video.ovg-inline-video");
    } else if (target.paused) {
        play.click();
    }
    if (!(target instanceof HTMLVideoElement)) return false;

    target.dataset.cigCurrentPath = path;
    const playing = await waitForPlaying(target);
    if (!playing || fullscreenElement() !== shell) return false;
    return mountOverlay(shell, root, target, path);
}

function navigateOverlayNext(shell, session) {
    const path = nextPath(shell, session.currentPath);
    if (!path) return;
    startViaGallery(shell, session.root, path).catch(error => {
        console.warn("[ImageGallery] gallery retry navigation failed", path, error);
    });
}

async function navigateNormalNext(shell, video) {
    const fromPath = currentPath(video);
    const path = nextPath(shell, fromPath);
    if (!path) return;

    const snapshot = {
        path: fromPath,
        src: video.getAttribute("src"),
        poster: video.getAttribute("poster"),
        rate: Number.isFinite(video.playbackRate) && video.playbackRate > 0 ? video.playbackRate : loadRate(),
        volume: Number.isFinite(video.volume) ? video.volume : loadVolume(),
    };

    let handled = false;
    const cleanup = () => {
        video.removeEventListener("error", onError, true);
        video.removeEventListener("playing", onPlaying, true);
    };
    const fallback = error => {
        if (handled) return;
        handled = true;
        cleanup();
        restoreOriginalVideo(video, snapshot);
        startViaGallery(shell, video, path).catch(retryError => {
            console.warn("[ImageGallery] normal gallery retry failed", path, retryError || error);
        });
    };
    const onError = event => {
        if (!isDemuxError(video)) return;
        event.preventDefault?.();
        event.stopImmediatePropagation();
        fallback(video.error);
    };
    const onPlaying = () => cleanup();

    video.addEventListener("error", onError, true);
    video.addEventListener("playing", onPlaying, { capture:true, once:true });

    video.dataset.cigCurrentPath = path;
    video.poster = thumbEndpoint(path);
    video.src = videoEndpoint(path);
    video.load();
    video.defaultPlaybackRate = loadRate();
    video.playbackRate = loadRate();
    video.volume = loadVolume();

    try {
        await video.play();
    } catch (error) {
        if (!handled && isDemuxError(video, error)) fallback(error);
    }
}

function onNextClick(event) {
    const button = event.target instanceof Element ? event.target.closest(".cig-native-next") : null;
    if (!(button instanceof HTMLElement)) return;
    const shell = button.closest('.cig-native-fs-shell[data-cig-native-shell="1"]');
    if (!(shell instanceof HTMLElement) || fullscreenElement() !== shell) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();

    const session = sessions.get(shell);
    if (session?.overlay instanceof HTMLVideoElement) {
        navigateOverlayNext(shell, session);
        return;
    }

    const root = activeRoot(shell);
    if (root) navigateNormalNext(shell, root).catch(error => console.warn("[ImageGallery] next navigation failed", error));
}

function cleanupSessions() {
    const fs = fullscreenElement();
    for (const [shell, session] of [...sessions.entries()]) {
        if (fs === shell) continue;
        returnOverlayVideo(session);
        try { session.root?.style?.removeProperty?.("display"); } catch (_) {}
        sessions.delete(shell);
    }
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        document.addEventListener("click", onNextClick, true);
        document.addEventListener("fullscreenchange", cleanupSessions, true);
        document.addEventListener("webkitfullscreenchange", cleanupSessions, true);
    },
});
