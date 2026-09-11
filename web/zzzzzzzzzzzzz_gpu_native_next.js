import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.GpuNativeFullscreenNext";
const STYLE_ID = "cig-gpu-native-next-style";
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
    } catch (_) {
        return 1;
    }
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-prev {
    top:calc(50% - 26px)!important;
}
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-next {
    position:absolute;
    right:28px;
    top:calc(50% + 26px);
    transform:translateY(-50%);
    z-index:20;
    width:44px;
    height:44px;
    min-width:44px;
    padding:0;
    border:1px solid rgba(255,255,255,.22);
    border-radius:8px;
    background:rgba(20,20,20,.72);
    color:#fff;
    font:18px/42px Arial,sans-serif;
    cursor:pointer;
    pointer-events:auto;
}
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-next:hover {
    background:rgba(45,45,45,.86);
}
.cig-native-fs-shell[data-cig-native-shell="1"].cig-native-ui-hidden .cig-native-next {
    display:none!important;
}
`;
    document.head.appendChild(style);
}

function currentPath(video) {
    return String(video?.dataset?.cigCurrentPath || video?.closest?.(".ovg-card")?.dataset?.path || "");
}

function galleryPaths(video) {
    const grid = video?.closest?.(".ovg-card")?.closest?.(".ovg-grid");
    if (!grid) return [];
    return [...grid.querySelectorAll(".ovg-card[data-path]")]
        .map(el => String(el.dataset.path || ""))
        .filter(Boolean);
}

function videoEndpoint(path) {
    return `/image-gallery/output/video?path=${encodeURIComponent(path)}`;
}

function thumbEndpoint(path) {
    return `/image-gallery/output/thumb?path=${encodeURIComponent(path)}`;
}

async function navigateNext(video) {
    const paths = galleryPaths(video);
    if (paths.length < 2) return;
    let index = paths.indexOf(currentPath(video));
    if (index < 0) index = 0;
    index = (index + 1) % paths.length;
    const path = paths[index];
    if (!path) return;

    video.dataset.cigCurrentPath = path;
    video.poster = thumbEndpoint(path);
    video.src = videoEndpoint(path);
    video.load();
    const rate = loadRate();
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
    video.volume = loadVolume();
    try { await video.play(); } catch (_) {}
}

function installNextButton() {
    const shell = document.fullscreenElement || document.webkitFullscreenElement || null;
    if (!(shell instanceof HTMLElement) || shell.dataset?.cigNativeShell !== "1") return;
    if (shell.querySelector(".cig-native-next")) return;

    const video = shell.querySelector("video.ovg-inline-video[data-cig-native-fullscreen=\"1\"]");
    if (!(video instanceof HTMLVideoElement)) return;

    const next = document.createElement("button");
    next.type = "button";
    next.className = "cig-native-next";
    next.title = "Следующее видео";
    next.textContent = "⏭";
    next.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        await navigateNext(video);
    }, true);
    shell.appendChild(next);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        document.addEventListener("fullscreenchange", installNextButton, true);
        document.addEventListener("webkitfullscreenchange", installNextButton, true);
    },
});
