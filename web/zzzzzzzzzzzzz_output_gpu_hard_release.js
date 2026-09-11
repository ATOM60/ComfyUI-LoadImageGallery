import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputGpuHardRelease";
const RELEASE_DELAY_MS = 1200;
const installed = new WeakSet();
const releaseTimers = new WeakMap();
const resumeByPath = new Map();
const MAX_RESUME_ENTRIES = 50;

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function currentPath(video) {
    return String(video?.dataset?.cigCurrentPath || video?.closest?.(".ovg-card")?.dataset?.path || "").trim();
}

function galleryStateForModal(modal) {
    if (!(modal instanceof HTMLElement)) return null;
    for (const node of app.graph?._nodes || []) {
        const state = node?._outputVideoGallery;
        if (state?.modal === modal && state.players instanceof Map) return state;
    }
    return null;
}

function gpuBackendActive(video) {
    if (!(video instanceof HTMLVideoElement)) return false;
    if (video.dataset.cigAutoCpuFallback === "1") return false;
    try {
        if (video.__cigGpuBackend && typeof video.__cigGetPlayerBackend === "function") {
            return video.__cigGetPlayerBackend() === video.__cigGpuBackend;
        }
    } catch (_) {
        return false;
    }
    return video.dataset.cigGpuCpuStyle === "1";
}

function externalProxyBusy(video) {
    const state = String(video?.dataset?.cigExternalGpuState || "");
    return state === "preparing" || state === "proxy-loading";
}

function clearReleaseTimer(video) {
    const timer = releaseTimers.get(video);
    if (timer) clearTimeout(timer);
    releaseTimers.delete(video);
}

function rememberResume(video) {
    const path = currentPath(video);
    if (!path) return;
    const time = Number(video.currentTime);
    const state = {
        time: Number.isFinite(time) ? Math.max(0, time) : 0,
        rate: Number.isFinite(Number(video.playbackRate)) ? Number(video.playbackRate) : 1,
        volume: Number.isFinite(Number(video.volume)) ? Number(video.volume) : 1,
        muted: !!video.muted,
    };
    resumeByPath.delete(path);
    resumeByPath.set(path, state);
    while (resumeByPath.size > MAX_RESUME_ENTRIES) {
        resumeByPath.delete(resumeByPath.keys().next().value);
    }
}

function restoreEntryUi(entry) {
    try { if (entry?.playBtn?.isConnected) entry.playBtn.style.display = ""; } catch (_) {}
    try { if (entry?.img?.isConnected) entry.img.style.removeProperty("display"); } catch (_) {}
    try {
        if (!entry?.img && entry?.fallback?.isConnected) entry.fallback.style.setProperty("display", "flex");
    } catch (_) {}
}

function hardRelease(video, { save = true } = {}) {
    if (!(video instanceof HTMLVideoElement)) return false;
    if (!gpuBackendActive(video)) return false;
    if (externalProxyBusy(video)) return false;

    const shell = video.__cigGpuShell?.player;
    if (shell instanceof HTMLElement && fullscreenElement() === shell) return false;

    clearReleaseTimer(video);
    if (save) rememberResume(video);

    const modal = video.closest(".ovg-modal");
    const state = galleryStateForModal(modal);
    const entries = [];
    if (state) {
        for (const [key, entry] of [...state.players.entries()]) {
            if (entry?.video === video) entries.push([key, entry]);
        }
    }

    try { video.pause(); } catch (_) {}
    try {
        video.removeAttribute("src");
        video.srcObject = null;
        video.load();
    } catch (_) {}

    for (const [, entry] of entries) restoreEntryUi(entry);

    try {
        if (video.__cigGpuShell?.destroy) video.__cigGpuShell.destroy();
        else video.remove();
    } catch (_) {
        try { video.remove(); } catch (_) {}
    }

    if (state) {
        for (const [key, entry] of entries) {
            if (state.players.get(key) === entry) state.players.delete(key);
        }
    }
    return true;
}

function releaseOtherGpuPlayers(activeVideo) {
    const modal = activeVideo.closest(".ovg-modal");
    if (!(modal instanceof HTMLElement)) return;

    const state = galleryStateForModal(modal);
    if (state) {
        for (const entry of [...state.players.values()]) {
            const other = entry?.video;
            if (other instanceof HTMLVideoElement && other !== activeVideo) hardRelease(other, { save:true });
        }
    }

    for (const other of modal.querySelectorAll("video.ovg-inline-video")) {
        if (other instanceof HTMLVideoElement && other !== activeVideo) hardRelease(other, { save:true });
    }
}

function applyResume(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    const path = currentPath(video);
    const state = resumeByPath.get(path);
    if (!state) return;

    try {
        video.defaultPlaybackRate = state.rate;
        video.playbackRate = state.rate;
        video.volume = state.volume;
        video.muted = state.muted;
    } catch (_) {}

    if (video.readyState < 1) return;
    try {
        const duration = Number(video.duration);
        const max = Number.isFinite(duration) && duration > .02 ? duration - .02 : state.time;
        video.currentTime = Math.max(0, Math.min(state.time, max));
    } catch (_) {}
    resumeByPath.delete(path);
}

function scheduleRelease(video, delay = RELEASE_DELAY_MS) {
    if (!(video instanceof HTMLVideoElement)) return;
    clearReleaseTimer(video);
    if (!gpuBackendActive(video) || externalProxyBusy(video)) return;

    const timer = setTimeout(() => {
        releaseTimers.delete(video);
        if (!video.isConnected || !video.paused || !gpuBackendActive(video) || externalProxyBusy(video)) return;
        const shell = video.__cigGpuShell?.player;
        if (shell instanceof HTMLElement && fullscreenElement() === shell) return;
        hardRelease(video, { save:true });
    }, Math.max(0, delay));
    releaseTimers.set(video, timer);
}

function installVideo(video) {
    if (!(video instanceof HTMLVideoElement) || !video.classList.contains("ovg-inline-video") || installed.has(video)) return;
    installed.add(video);

    const onPlay = () => {
        clearReleaseTimer(video);
        // Let the shared GPU wrapper finish attaching before cleaning old entries.
        setTimeout(() => {
            if (video.isConnected && !video.paused) releaseOtherGpuPlayers(video);
        }, 0);
    };
    const onPause = () => scheduleRelease(video);
    const onMetadata = () => applyResume(video);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("loadedmetadata", onMetadata);
    applyResume(video);

    video.__cigHardReleaseCleanup = () => {
        clearReleaseTimer(video);
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("loadedmetadata", onMetadata);
        delete video.__cigHardReleaseCleanup;
    };
}

function scan(root = document) {
    if (root instanceof HTMLVideoElement) installVideo(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(installVideo);
}

function cleanupRemoved(root) {
    if (!(root instanceof Element) || root.isConnected) return;
    if (root instanceof HTMLVideoElement) root.__cigHardReleaseCleanup?.();
    root.querySelectorAll?.("video.ovg-inline-video").forEach(video => video.__cigHardReleaseCleanup?.());
}

function onFullscreenChange() {
    for (const video of document.querySelectorAll("video.ovg-inline-video")) {
        if (!(video instanceof HTMLVideoElement) || !video.paused) continue;
        const shell = video.__cigGpuShell?.player;
        if (!(shell instanceof HTMLElement) || fullscreenElement() !== shell) scheduleRelease(video, 250);
    }
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        scan(document);
        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) if (node instanceof Element) scan(node);
                for (const node of record.removedNodes) if (node instanceof Element) cleanupRemoved(node);
            }
        });
        observer.observe(document.body, { childList:true, subtree:true });
        document.addEventListener("fullscreenchange", onFullscreenChange, true);
        document.addEventListener("webkitfullscreenchange", onFullscreenChange, true);
    },
});
