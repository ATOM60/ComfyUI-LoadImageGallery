import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.GpuFullscreenGalleryRetryTest";
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

function activeRoot(shell) {
    const video = shell?.querySelector?.('video.ovg-inline-video[data-cig-native-fullscreen="1"]');
    return video instanceof HTMLVideoElement ? video : null;
}

function currentPath(video) {
    return String(video?.dataset?.cigCurrentPath || video?.closest?.(".ovg-card")?.dataset?.path || "");
}

function cardsFor(shell) {
    const grid = shell?.closest?.(".ovg-card")?.closest?.(".ovg-grid");
    return grid ? [...grid.querySelectorAll(".ovg-card[data-path]")] : [];
}

function nextTarget(shell, path) {
    const cards = cardsFor(shell);
    if (cards.length < 2) return null;
    let index = cards.findIndex(card => String(card.dataset.path || "") === String(path || ""));
    if (index < 0) index = 0;
    index = (index + 1) % cards.length;
    const card = cards[index];
    const targetPath = String(card?.dataset?.path || "");
    return card instanceof HTMLElement && targetPath ? { card, path:targetPath } : null;
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

function waitFor(predicate, timeoutMs = 1500) {
    return new Promise(resolve => {
        const started = performance.now();
        const tick = () => {
            let value = null;
            try { value = predicate(); } catch (_) {}
            if (value) { resolve(value); return; }
            if (performance.now() - started >= timeoutMs) { resolve(null); return; }
            requestAnimationFrame(tick);
        };
        tick();
    });
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

async function exitCurrentFullscreen(shell) {
    if (fullscreenElement() !== shell) return true;
    try {
        const result = document.exitFullscreen?.() || document.webkitExitFullscreen?.();
        await result?.catch?.(() => {});
    } catch (_) {}
    await waitFor(() => fullscreenElement() !== shell, 1500);
    return fullscreenElement() !== shell;
}

async function startCardNormally(card, path) {
    if (!(card instanceof HTMLElement) || !card.isConnected) return null;
    let target = card.querySelector("video.ovg-inline-video");
    const play = card.querySelector(".ovg-play");

    if (!(target instanceof HTMLVideoElement)) {
        if (!(play instanceof HTMLButtonElement)) return null;
        play.click();
        target = await waitFor(() => card.querySelector("video.ovg-inline-video"), 1000);
    } else if (target.paused) {
        if (play instanceof HTMLButtonElement) play.click();
        else { try { target.play().catch(() => {}); } catch (_) {} }
    }

    if (!(target instanceof HTMLVideoElement)) return null;
    target.dataset.cigCurrentPath = path;
    const playing = await waitForPlaying(target, 5000);
    return playing ? target : null;
}

async function tryFullscreenAgain(target) {
    if (!(target instanceof HTMLVideoElement)) return false;
    const wrapper = await waitFor(() => target.closest(".ovg-gpu-player"), 1200);
    if (!(wrapper instanceof HTMLElement)) return false;
    try {
        const result = wrapper.requestFullscreen?.() || wrapper.webkitRequestFullscreen?.();
        await result?.catch?.(() => {});
    } catch (_) {}
    return !!fullscreenElement();
}

async function retryOutsideFullscreen(shell, video, snapshot, target) {
    restoreOriginalVideo(video, snapshot);
    const exited = await exitCurrentFullscreen(shell);
    if (!exited) {
        console.warn("[ImageGallery] demux retry could not exit fullscreen", target.path);
        return;
    }

    const normalVideo = await startCardNormally(target.card, target.path);
    if (!(normalVideo instanceof HTMLVideoElement)) {
        console.warn("[ImageGallery] demux retry failed through normal gallery player", target.path);
        return;
    }

    const returned = await tryFullscreenAgain(normalVideo);
    if (!returned) {
        console.warn("[ImageGallery] target plays normally, but automatic fullscreen re-entry was blocked", target.path);
    }
}

async function navigateNormalNext(shell, video) {
    const fromPath = currentPath(video);
    const target = nextTarget(shell, fromPath);
    if (!target) return;

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
        retryOutsideFullscreen(shell, video, snapshot, target).catch(retryError => {
            console.warn("[ImageGallery] outside-fullscreen gallery retry failed", target.path, retryError || error);
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

    video.dataset.cigCurrentPath = target.path;
    video.poster = thumbEndpoint(target.path);
    video.src = videoEndpoint(target.path);
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

    const root = activeRoot(shell);
    if (root) navigateNormalNext(shell, root).catch(error => console.warn("[ImageGallery] next navigation failed", error));
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.addEventListener("click", onNextClick, true);
    },
});
