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

function saveRate(value) {
    try { localStorage.setItem(RATE_KEY, String(clamp(value, .25, 3, 1))); }
    catch (_) {}
}

function loadVolume() {
    try {
        const value = localStorage.getItem(VOLUME_KEY);
        return value == null ? 1 : clamp(value, 0, 1, 1);
    } catch (_) {
        return 1;
    }
}

function rateText(value) {
    const rate = clamp(value, .25, 3, 1);
    return `${rate.toFixed(rate % 1 ? 2 : 0)}×`;
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-prev {
    top:calc(50% - 52px)!important;
}
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-next {
    position:absolute;
    right:28px;
    top:calc(50% + 52px)!important;
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
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-next:hover,
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-speed:hover {
    background:rgba(45,45,45,.86);
}
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-speed-wrap {
    position:absolute;
    right:28px;
    top:50%;
    transform:translateY(-50%);
    z-index:20;
    width:44px;
    height:44px;
    pointer-events:auto;
}
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-speed {
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
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-speed-panel {
    display:none;
    position:absolute;
    right:54px;
    top:50%;
    transform:translateY(-50%);
    padding:10px 12px;
    border:1px solid rgba(255,255,255,.18);
    border-radius:8px;
    background:rgba(20,20,20,.86);
    white-space:nowrap;
    color:#fff;
    font:12px Arial,sans-serif;
    align-items:center;
    gap:8px;
    pointer-events:auto;
}
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-speed-panel.open {
    display:flex;
}
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-speed-range {
    width:150px!important;
    height:auto!important;
    margin:0!important;
    writing-mode:horizontal-tb!important;
    direction:ltr!important;
    accent-color:#79adff!important;
    cursor:pointer!important;
}
.cig-native-fs-shell[data-cig-native-shell="1"] .cig-native-speed-value {
    min-width:48px;
    text-align:center;
    font-variant-numeric:tabular-nums;
}
.cig-native-fs-shell[data-cig-native-shell="1"].cig-native-ui-hidden .cig-native-next,
.cig-native-fs-shell[data-cig-native-shell="1"].cig-native-ui-hidden .cig-native-speed-wrap {
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

function installControls() {
    const shell = document.fullscreenElement || document.webkitFullscreenElement || null;
    if (!(shell instanceof HTMLElement) || shell.dataset?.cigNativeShell !== "1") return;

    const video = shell.querySelector('video.ovg-inline-video[data-cig-native-fullscreen="1"]');
    if (!(video instanceof HTMLVideoElement)) return;

    if (!shell.querySelector(".cig-native-next")) {
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

    if (shell.querySelector(".cig-native-speed-wrap")) return;

    const wrap = document.createElement("div");
    wrap.className = "cig-native-speed-wrap";
    wrap.innerHTML = `
        <button class="cig-native-speed" type="button" title="Скорость воспроизведения">⏱</button>
        <div class="cig-native-speed-panel">
            <input class="cig-native-speed-range" type="range" min="0.25" max="3" step="0.05">
            <span class="cig-native-speed-value"></span>
        </div>
    `;

    const button = wrap.querySelector(".cig-native-speed");
    const panel = wrap.querySelector(".cig-native-speed-panel");
    const range = wrap.querySelector(".cig-native-speed-range");
    const value = wrap.querySelector(".cig-native-speed-value");
    if (!(button instanceof HTMLButtonElement) || !(panel instanceof HTMLElement) || !(range instanceof HTMLInputElement) || !(value instanceof HTMLElement)) return;

    const sync = () => {
        const rate = clamp(video.playbackRate, .25, 3, loadRate());
        range.value = String(rate);
        value.textContent = rateText(rate);
    };
    sync();

    button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const open = !panel.classList.contains("open");
        panel.classList.toggle("open", open);
        if (open) {
            shell.dataset.cigNativeRateEditing = "1";
            sync();
        } else {
            delete shell.dataset.cigNativeRateEditing;
            shell.dispatchEvent(new Event("pointermove", { bubbles:true }));
        }
    }, true);

    range.addEventListener("input", event => {
        event.stopPropagation();
        const rate = clamp(range.value, .25, 3, 1);
        video.defaultPlaybackRate = rate;
        video.playbackRate = rate;
        saveRate(rate);
        value.textContent = rateText(rate);
    }, true);

    range.addEventListener("pointerdown", event => {
        event.stopPropagation();
        shell.dataset.cigNativeRateEditing = "1";
    }, true);

    panel.addEventListener("dblclick", event => {
        event.preventDefault();
        event.stopPropagation();
    }, true);

    shell.appendChild(wrap);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        document.addEventListener("fullscreenchange", installControls, true);
        document.addEventListener("webkitfullscreenchange", installControls, true);
    },
});
