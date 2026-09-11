import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.GpuFullscreenFreshNavTest";
const STYLE_ID = "cig-gpu-fullscreen-fresh-nav-test-style";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const VOLUME_KEY = "ComfyUI-LoadImageGallery.outputVideoVolume";
const sessions = new Set();

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
.cig-native-fs-shell[data-cig-native-shell="1"] > video.cig-native-fresh-video {
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

function galleryPaths(shell) {
    const grid = shell?.closest?.(".ovg-card")?.closest?.(".ovg-grid");
    if (!grid) return [];
    return [...grid.querySelectorAll(".ovg-card[data-path]")]
        .map(el => String(el.dataset.path || ""))
        .filter(Boolean);
}

function rootVideo(shell) {
    const video = shell?.querySelector?.('video.ovg-inline-video[data-cig-native-fullscreen="1"]');
    return video instanceof HTMLVideoElement ? video : null;
}

function currentSession(shell) {
    for (const session of sessions) if (session.shell === shell) return session;
    return null;
}

function currentPath(shell, root) {
    const session = currentSession(shell);
    return String(session?.path || root?.dataset?.cigCurrentPath || root?.closest?.(".ovg-card")?.dataset?.path || "");
}

function releaseFresh(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    try { video.pause(); } catch (_) {}
    try { video.removeAttribute("src"); video.load(); } catch (_) {}
    try { video.remove(); } catch (_) {}
}

async function playFresh(shell, root, path) {
    let session = currentSession(shell);
    if (!session) {
        session = { shell, root, fresh:null, path:"", wasPlaying:false };
        sessions.add(session);
    }

    if (session.fresh) releaseFresh(session.fresh);
    try { root.pause(); } catch (_) {}
    root.style.setProperty("display", "none", "important");

    const fresh = document.createElement("video");
    fresh.className = "cig-native-fresh-video";
    fresh.controls = true;
    fresh.preload = "auto";
    fresh.playsInline = true;
    fresh.loop = true;
    fresh.poster = thumbEndpoint(path);
    fresh.src = videoEndpoint(path);
    fresh.defaultPlaybackRate = loadRate();
    fresh.playbackRate = loadRate();
    fresh.volume = loadVolume();
    fresh.dataset.cigCurrentPath = path;

    session.fresh = fresh;
    session.path = path;
    shell.insertBefore(fresh, shell.firstChild);

    try {
        await fresh.play();
        session.wasPlaying = true;
    } catch (_) {
        session.wasPlaying = false;
    }
}

async function navigate(shell, direction) {
    const root = rootVideo(shell);
    if (!root) return;
    const paths = galleryPaths(shell);
    if (paths.length < 2) return;
    let index = paths.indexOf(currentPath(shell, root));
    if (index < 0) index = 0;
    index = (index + direction + paths.length) % paths.length;
    const path = paths[index];
    if (!path) return;
    await playFresh(shell, root, path);
}

function onClick(event) {
    const button = event.target instanceof Element ? event.target.closest(".cig-native-prev,.cig-native-next") : null;
    if (!(button instanceof HTMLElement)) return;
    const shell = button.closest('.cig-native-fs-shell[data-cig-native-shell="1"]');
    if (!(shell instanceof HTMLElement) || fullscreenElement() !== shell) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    navigate(shell, button.classList.contains("cig-native-next") ? 1 : -1).catch(() => {});
}

function onSpeedInput(event) {
    const range = event.target instanceof Element ? event.target.closest(".cig-native-speed-range") : null;
    if (!(range instanceof HTMLInputElement)) return;
    const shell = range.closest('.cig-native-fs-shell[data-cig-native-shell="1"]');
    const session = shell ? currentSession(shell) : null;
    if (!(session?.fresh instanceof HTMLVideoElement)) return;
    const rate = clamp(range.value, .25, 3, 1);
    session.fresh.defaultPlaybackRate = rate;
    session.fresh.playbackRate = rate;
}

function cleanupEndedSessions() {
    const fs = fullscreenElement();
    for (const session of [...sessions]) {
        if (fs === session.shell) continue;
        const fresh = session.fresh;
        const shouldResume = fresh instanceof HTMLVideoElement && !fresh.paused;
        releaseFresh(fresh);
        session.root.style.removeProperty("display");
        if (session.path) {
            try {
                session.root.dataset.cigCurrentPath = session.path;
                session.root.poster = thumbEndpoint(session.path);
                session.root.src = videoEndpoint(session.path);
                session.root.load();
                const rate = loadRate();
                session.root.defaultPlaybackRate = rate;
                session.root.playbackRate = rate;
                session.root.volume = loadVolume();
                if (shouldResume) session.root.play().catch(() => {});
            } catch (_) {}
        }
        sessions.delete(session);
    }
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        document.addEventListener("click", onClick, true);
        document.addEventListener("input", onSpeedInput, true);
        document.addEventListener("fullscreenchange", cleanupEndedSessions, true);
        document.addEventListener("webkitfullscreenchange", cleanupEndedSessions, true);
    },
});
