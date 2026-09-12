import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.GpuFullscreenFreshNavTest";
const STYLE_ID = "cig-gpu-fullscreen-fresh-nav-test-style";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const VOLUME_KEY = "ComfyUI-LoadImageGallery.outputVideoVolume";
const sessions = new Set();
let switchSeq = 0;

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

function notify(message, severity = "info") {
    try {
        app.extensionManager?.toast?.add({
            severity,
            summary:"GPU video test",
            detail:String(message),
            life:6500,
        });
    } catch (_) {}
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
.cig-fresh-video-stage {
    position:fixed!important;
    left:0!important;
    bottom:0!important;
    width:2px!important;
    height:2px!important;
    overflow:hidden!important;
    opacity:.01!important;
    pointer-events:none!important;
    z-index:-1!important;
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

function mediaDiag(video) {
    const err = video?.error;
    return `ready=${video?.readyState ?? "?"}, network=${video?.networkState ?? "?"}, paused=${video?.paused ?? "?"}, time=${Number(video?.currentTime || 0).toFixed(2)}, mediaError=${err?.code || 0}${err?.message ? ` ${err.message}` : ""}`;
}

function startFresh(shell, root, path) {
    let session = currentSession(shell);
    if (!session) {
        session = { shell, root, fresh:null, path:"", pending:null };
        sessions.add(session);
    }

    const previousFresh = session.fresh;
    const seq = ++switchSeq;
    session.pending = seq;

    const stage = document.createElement("div");
    stage.className = "cig-fresh-video-stage";

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

    stage.appendChild(fresh);
    document.body.appendChild(stage);

    let settled = false;
    const cleanupPending = () => {
        if (settled) return false;
        settled = true;
        clearTimeout(timeout);
        return true;
    };

    const commit = () => {
        if (!cleanupPending()) return;
        if (session.pending !== seq || fullscreenElement() !== shell) {
            releaseFresh(fresh);
            stage.remove();
            return;
        }
        if (previousFresh) releaseFresh(previousFresh);
        else {
            try { root.pause(); } catch (_) {}
            root.style.setProperty("display", "none", "important");
        }
        session.fresh = fresh;
        session.path = path;
        session.pending = null;
        shell.insertBefore(fresh, shell.firstChild);
        stage.remove();
    };

    const fail = error => {
        if (!cleanupPending()) return;
        if (session.pending === seq) session.pending = null;
        const name = error?.name || "play failed";
        const message = error?.message ? `: ${error.message}` : "";
        notify(`${name}${message} · ${mediaDiag(fresh)}`, "error");
        console.warn("[ImageGallery] synchronous switched video play failed", path, error, fresh.error, mediaDiag(fresh));
        releaseFresh(fresh);
        stage.remove();
    };

    const timeout = setTimeout(() => {
        if (!settled) fail(new Error(`play timeout · ${mediaDiag(fresh)}`));
    }, 6000);

    // Important: call play() synchronously in the trusted navigation click stack.
    // Waiting for loadeddata/canplay first loses transient user activation in Chromium.
    try {
        const playResult = fresh.play();
        if (playResult && typeof playResult.then === "function") playResult.then(commit).catch(fail);
        else commit();
    } catch (error) {
        fail(error);
    }
}

function navigate(shell, direction) {
    const root = rootVideo(shell);
    if (!root) return;
    const paths = galleryPaths(shell);
    if (paths.length < 2) return;
    let index = paths.indexOf(currentPath(shell, root));
    if (index < 0) index = 0;
    index = (index + direction + paths.length) % paths.length;
    const path = paths[index];
    if (!path) return;
    startFresh(shell, root, path);
}

function onClick(event) {
    const button = event.target instanceof Element ? event.target.closest(".cig-native-prev,.cig-native-next") : null;
    if (!(button instanceof HTMLElement)) return;
    const shell = button.closest('.cig-native-fs-shell[data-cig-native-shell="1"]');
    if (!(shell instanceof HTMLElement) || fullscreenElement() !== shell) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    navigate(shell, button.classList.contains("cig-native-next") ? 1 : -1);
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
        releaseFresh(session.fresh);
        session.root.style.removeProperty("display");
        if (session.path) {
            try {
                session.root.dataset.cigCurrentPath = session.path;
                session.root.poster = thumbEndpoint(session.path);
                session.root.src = videoEndpoint(session.path);
                session.root.load();
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
