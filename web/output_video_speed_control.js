import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoPlaybackControls";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const VOLUME_KEY = "ComfyUI-LoadImageGallery.outputVideoVolume";
const STYLE_ID = "cig-output-video-playback-style";
const LANG = String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
const LABELS = LANG === "ru"
    ? { prev:"Предыдущее видео", speed:"Скорость воспроизведения", next:"Следующее видео" }
    : { prev:"Previous video", speed:"Playback speed", next:"Next video" };
const attachedVideos = new Set();
const modalObservers = new WeakMap();

function clamp(value, min, max) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

function clampRate(value) {
    return clamp(value, 0.25, 3);
}

function loadRate() {
    try { return clampRate(localStorage.getItem(RATE_KEY) || 1); }
    catch (_) { return 1; }
}

function saveRate(value) {
    try { localStorage.setItem(RATE_KEY, String(clampRate(value))); }
    catch (_) {}
}

function loadVolume() {
    try {
        const raw = localStorage.getItem(VOLUME_KEY);
        return raw == null ? 1 : clamp(raw, 0, 1);
    } catch (_) {
        return 1;
    }
}

function saveVolume(value) {
    try { localStorage.setItem(VOLUME_KEY, String(clamp(value, 0, 1))); }
    catch (_) {}
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.ovg-speed-control[popover]{
    display:none;
    position:fixed!important;
    right:330px!important;
    bottom:78px!important;
    top:auto!important;
    left:auto!important;
    inset:auto 330px 78px auto!important;
    transform:none!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    background:transparent!important;
    color:#fff!important;
    overflow:visible!important;
    flex-direction:column!important;
    align-items:center!important;
    gap:7px!important;
    width:auto!important;
    height:auto!important;
    min-width:0!important;
    min-height:0!important;
    font-family:"Segoe UI Symbol",Arial,sans-serif!important;
    user-select:none!important;
}
.ovg-speed-control[popover]:popover-open{display:flex!important}
.ovg-player-control-row{
    display:flex!important;
    flex-direction:row!important;
    align-items:center!important;
    justify-content:flex-start!important;
    gap:2px!important;
    width:116px!important;
    height:36px!important;
    min-width:116px!important;
    max-width:116px!important;
    padding:0!important;
    margin:0!important;
    border:0!important;
    border-radius:4px!important;
    background:transparent!important;
}
.ovg-player-control-button{
    box-sizing:border-box!important;
    flex:0 0 36px!important;
    width:36px!important;
    min-width:36px!important;
    max-width:36px!important;
    height:36px!important;
    min-height:36px!important;
    max-height:36px!important;
    padding:0!important;
    margin:0!important;
    border:0!important;
    border-radius:4px!important;
    background:transparent!important;
    color:#fff!important;
    font-family:"Segoe UI Symbol",Arial,sans-serif!important;
    font-size:17px!important;
    font-weight:600!important;
    line-height:36px!important;
    text-align:center!important;
    cursor:pointer!important;
    box-shadow:none!important;
    opacity:.92!important;
}
.ovg-player-control-button:hover,.ovg-speed-control.open .ovg-speed-button{
    background:rgba(255,255,255,.12)!important;
    opacity:1!important;
}
.ovg-speed-panel{
    display:none;flex-direction:column;align-items:center;gap:9px;padding:11px 9px 12px;border:1px solid rgba(255,255,255,.25);
    border-radius:10px;background:rgba(15,15,15,.86);backdrop-filter:blur(6px);box-shadow:0 6px 24px rgba(0,0,0,.45)
}
.ovg-speed-control.open .ovg-speed-panel{display:flex}
.ovg-speed-value{min-width:56px;text-align:center;color:#fff;font-size:13px;font-weight:700;white-space:nowrap}
.ovg-speed-slider{
    width:28px;height:180px;margin:0;writing-mode:vertical-lr;direction:rtl;accent-color:#79adff;cursor:pointer
}
@media(max-width:900px){
    .ovg-speed-control[popover]{right:250px!important;inset:auto 250px 78px auto!important}
}
`;
    document.head.appendChild(style);
}

function isFullscreenVideo(video) {
    const fs = document.fullscreenElement || document.webkitFullscreenElement || null;
    const host = video.closest?.(".ovg-thumb");
    return fs === video || fs === host || video.webkitDisplayingFullscreen === true;
}

function videoEndpoint(path) {
    return `/image-gallery/output/video?path=${encodeURIComponent(path)}`;
}

function thumbEndpoint(path) {
    return `/image-gallery/output/thumb?path=${encodeURIComponent(path)}`;
}

function galleryPathsForVideo(video) {
    const card = video.closest?.(".ovg-card");
    const grid = card?.closest?.(".ovg-grid");
    if (!grid) return [];
    return [...grid.querySelectorAll(".ovg-card[data-path]")]
        .map(el => String(el.dataset.path || ""))
        .filter(Boolean);
}

function currentVideoPath(video) {
    return String(video.dataset.cigCurrentPath || video.closest?.(".ovg-card")?.dataset.path || "");
}

async function navigateVideo(video, direction) {
    const paths = galleryPathsForVideo(video);
    if (paths.length < 2) return;
    const current = currentVideoPath(video);
    let index = paths.indexOf(current);
    if (index < 0) index = 0;
    const nextPath = paths[(index + direction + paths.length) % paths.length];
    if (!nextPath || nextPath === current) return;

    const wasPaused = video.paused;
    video.dataset.cigCurrentPath = nextPath;
    video.poster = thumbEndpoint(nextPath);
    video.src = videoEndpoint(nextPath);
    video.load();
    video.defaultPlaybackRate = loadRate();
    video.playbackRate = loadRate();
    video.volume = loadVolume();
    if (!wasPaused) {
        try { await video.play(); } catch (_) {}
    }
}

function showSpeedControl(video) {
    const control = video.__cigSpeedControl;
    if (!control?.isConnected) return;
    for (const other of attachedVideos) {
        if (other !== video) hideSpeedControl(other);
    }
    try {
        if (typeof control.showPopover === "function" && !control.matches(":popover-open")) control.showPopover();
    } catch (_) {}
}

function hideSpeedControl(video) {
    const control = video?.__cigSpeedControl;
    if (!control) return;
    control.classList.remove("open");
    try {
        if (typeof control.hidePopover === "function" && control.matches(":popover-open")) control.hidePopover();
    } catch (_) {}
}

function cleanupVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    hideSpeedControl(video);
    video.__cigSpeedControl?.remove();
    attachedVideos.delete(video);
}

function syncFullscreenControls() {
    for (const video of [...attachedVideos]) {
        if (!video.isConnected) {
            cleanupVideo(video);
            continue;
        }
        if (isFullscreenVideo(video)) showSpeedControl(video);
        else hideSpeedControl(video);
    }
}

function attachPlaybackControls(video) {
    if (!(video instanceof HTMLVideoElement) || video.dataset.cigPlaybackControls === "1") return;
    video.dataset.cigPlaybackControls = "1";
    video.dataset.cigCurrentPath = String(video.closest?.(".ovg-card")?.dataset.path || "");
    attachedVideos.add(video);

    video.controls = true;
    video.loop = true;
    video.setAttribute("loop", "");

    const applySavedRate = () => {
        const rate = loadRate();
        video.defaultPlaybackRate = rate;
        video.playbackRate = rate;
    };
    const applySavedVolume = () => {
        video.volume = loadVolume();
    };
    applySavedRate();
    applySavedVolume();
    video.addEventListener("loadedmetadata", () => {
        applySavedRate();
        applySavedVolume();
    });

    const control = document.createElement("div");
    control.className = "ovg-speed-control";
    control.setAttribute("popover", "manual");
    control.innerHTML = `
        <div class="ovg-speed-panel">
            <div class="ovg-speed-value">1.00×</div>
            <input class="ovg-speed-slider" type="range" min="0.25" max="3" step="0.05" value="1" title="${LABELS.speed}">
        </div>
        <div class="ovg-player-control-row">
            <button class="ovg-player-control-button ovg-prev-button" type="button" title="${LABELS.prev}" aria-label="${LABELS.prev}">⏮︎</button>
            <button class="ovg-player-control-button ovg-speed-button" type="button" title="${LABELS.speed}" aria-label="${LABELS.speed}">⏱︎</button>
            <button class="ovg-player-control-button ovg-next-button" type="button" title="${LABELS.next}" aria-label="${LABELS.next}">⏭︎</button>
        </div>`;
    document.body.appendChild(control);
    video.__cigSpeedControl = control;

    const prevButton = control.querySelector(".ovg-prev-button");
    const speedButton = control.querySelector(".ovg-speed-button");
    const nextButton = control.querySelector(".ovg-next-button");
    const slider = control.querySelector(".ovg-speed-slider");
    const value = control.querySelector(".ovg-speed-value");

    const updateRateUi = () => {
        const rate = clampRate(video.playbackRate || loadRate());
        slider.value = String(rate);
        value.textContent = `${rate.toFixed(2)}×`;
    };
    updateRateUi();

    prevButton.addEventListener("click", async e => {
        e.preventDefault();
        e.stopPropagation();
        await navigateVideo(video, -1);
    });
    nextButton.addEventListener("click", async e => {
        e.preventDefault();
        e.stopPropagation();
        await navigateVideo(video, 1);
    });
    speedButton.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        control.classList.toggle("open");
    });
    slider.addEventListener("input", e => {
        e.stopPropagation();
        const rate = clampRate(slider.value);
        video.defaultPlaybackRate = rate;
        video.playbackRate = rate;
        saveRate(rate);
        updateRateUi();
    });

    for (const type of ["pointerdown","pointerup","mousedown","mouseup","click","dblclick"]) {
        control.addEventListener(type, e => e.stopPropagation(), true);
    }
    control.addEventListener("wheel", e => e.stopPropagation(), { passive:true, capture:true });

    video.addEventListener("ratechange", () => {
        const rate = clampRate(video.playbackRate || 1);
        saveRate(rate);
        updateRateUi();
    });

    video.addEventListener("volumechange", () => saveVolume(video.volume));

    video.addEventListener("wheel", e => {
        e.preventDefault();
        e.stopPropagation();
        const direction = e.deltaY < 0 ? 1 : -1;
        const next = clamp(video.volume + direction * 0.05, 0, 1);
        video.volume = next;
        if (next > 0 && video.muted) video.muted = false;
    }, { passive:false });

    video.addEventListener("click", e => {
        const rect = video.getBoundingClientRect();
        const localY = e.clientY - rect.top;
        const nativeControlsHeight = isFullscreenVideo(video) ? 72 : 52;
        if (localY >= rect.height - nativeControlsHeight) return;
        e.preventDefault();
        e.stopPropagation();
        if (video.paused) video.play().catch(() => {});
        else video.pause();
    });

    video.addEventListener("webkitbeginfullscreen", () => setTimeout(syncFullscreenControls, 0));
    video.addEventListener("webkitendfullscreen", () => setTimeout(syncFullscreenControls, 0));
    video.addEventListener("emptied", () => {
        if (!video.isConnected) cleanupVideo(video);
    });

    queueMicrotask(syncFullscreenControls);
}

function scan(root) {
    if (!(root instanceof Element)) return;
    if (root instanceof HTMLVideoElement && root.classList.contains("ovg-inline-video")) attachPlaybackControls(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(attachPlaybackControls);
}

function cleanupRemoved(root) {
    if (!(root instanceof Element)) return;
    if (root instanceof HTMLVideoElement && root.classList.contains("ovg-inline-video")) cleanupVideo(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(cleanupVideo);
}

function installModal(modal) {
    if (!(modal instanceof HTMLElement) || modalObservers.has(modal)) return;
    scan(modal);
    const observer = new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) if (node instanceof Element) scan(node);
            for (const node of record.removedNodes) if (node instanceof Element) cleanupRemoved(node);
        }
    });
    observer.observe(modal, { childList:true, subtree:true });
    modalObservers.set(modal, observer);
}

function uninstallModal(modal) {
    cleanupRemoved(modal);
    modalObservers.get(modal)?.disconnect();
    modalObservers.delete(modal);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        injectStyles();
        document.addEventListener("fullscreenchange", syncFullscreenControls);
        document.addEventListener("webkitfullscreenchange", syncFullscreenControls);

        document.querySelectorAll(".ovg-modal").forEach(installModal);

        // Observe the full subtree only inside an open output gallery. Outside of
        // the gallery, ComfyUI DOM changes no longer trigger video-control scans.
        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof HTMLElement && node.classList.contains("ovg-modal")) installModal(node);
                }
                for (const node of record.removedNodes) {
                    if (node instanceof HTMLElement && node.classList.contains("ovg-modal")) uninstallModal(node);
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
