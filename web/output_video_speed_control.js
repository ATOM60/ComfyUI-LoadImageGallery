import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoPlaybackControls";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const STYLE_ID = "cig-output-video-playback-style";
const attachedVideos = new Set();

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

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.ovg-speed-control[popover]{
    display:none;
    position:fixed;
    inset:auto 20px auto auto;
    top:50%;
    transform:translateY(-50%);
    margin:0;
    padding:0;
    border:0;
    background:transparent;
    color:#fff;
    overflow:visible;
    align-items:center;
    gap:8px;
    font-family:Arial,sans-serif;
    user-select:none;
}
.ovg-speed-control[popover]:popover-open{display:flex}
.ovg-speed-button{
    width:46px;height:46px;padding:0;border:1px solid rgba(255,255,255,.38);border-radius:50%;background:rgba(0,0,0,.62);
    color:#fff;font-size:22px;line-height:44px;text-align:center;cursor:pointer;box-shadow:0 3px 14px rgba(0,0,0,.4)
}
.ovg-speed-button:hover,.ovg-speed-control.open .ovg-speed-button{background:rgba(0,0,0,.88);border-color:rgba(255,255,255,.7)}
.ovg-speed-panel{
    display:none;flex-direction:column;align-items:center;gap:9px;padding:11px 9px 12px;border:1px solid rgba(255,255,255,.25);
    border-radius:10px;background:rgba(15,15,15,.82);backdrop-filter:blur(6px);box-shadow:0 6px 24px rgba(0,0,0,.45)
}
.ovg-speed-control.open .ovg-speed-panel{display:flex}
.ovg-speed-value{min-width:56px;text-align:center;color:#fff;font-size:13px;font-weight:700;white-space:nowrap}
.ovg-speed-slider{
    width:28px;height:180px;margin:0;writing-mode:vertical-lr;direction:rtl;accent-color:#79adff;cursor:pointer
}
`;
    document.head.appendChild(style);
}

function isFullscreenVideo(video) {
    const fs = document.fullscreenElement || document.webkitFullscreenElement || null;
    const host = video.closest?.(".ovg-thumb");
    return fs === video || fs === host || video.webkitDisplayingFullscreen === true;
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

function syncFullscreenControls() {
    for (const video of [...attachedVideos]) {
        if (!video.isConnected) {
            hideSpeedControl(video);
            video.__cigSpeedControl?.remove();
            attachedVideos.delete(video);
            continue;
        }
        if (isFullscreenVideo(video)) showSpeedControl(video);
        else hideSpeedControl(video);
    }
}

function attachPlaybackControls(video) {
    if (!(video instanceof HTMLVideoElement) || video.dataset.cigPlaybackControls === "1") return;
    video.dataset.cigPlaybackControls = "1";
    attachedVideos.add(video);

    // Keep the browser's own controls, including its standard fullscreen button.
    video.controls = true;
    video.loop = true;
    video.setAttribute("loop", "");

    const applySavedRate = () => {
        const rate = loadRate();
        video.defaultPlaybackRate = rate;
        video.playbackRate = rate;
    };
    applySavedRate();
    video.addEventListener("loadedmetadata", applySavedRate, { once:true });

    const control = document.createElement("div");
    control.className = "ovg-speed-control";
    control.setAttribute("popover", "manual");
    control.innerHTML = `
        <div class="ovg-speed-panel">
            <div class="ovg-speed-value">1.00×</div>
            <input class="ovg-speed-slider" type="range" min="0.25" max="3" step="0.05" value="1">
        </div>
        <button class="ovg-speed-button" type="button" title="Скорость воспроизведения">⏱</button>`;
    document.body.appendChild(control);
    video.__cigSpeedControl = control;

    const speedButton = control.querySelector(".ovg-speed-button");
    const slider = control.querySelector(".ovg-speed-slider");
    const value = control.querySelector(".ovg-speed-value");

    const updateRateUi = () => {
        const rate = clampRate(video.playbackRate || loadRate());
        slider.value = String(rate);
        value.textContent = `${rate.toFixed(2)}×`;
    };
    updateRateUi();

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
    for (const el of [control, speedButton, slider]) {
        el.addEventListener("pointerdown", e => e.stopPropagation());
        el.addEventListener("mousedown", e => e.stopPropagation());
    }

    video.addEventListener("ratechange", () => {
        const rate = clampRate(video.playbackRate || 1);
        saveRate(rate);
        updateRateUi();
    });

    // Mouse wheel over the video adjusts volume instead of scrolling the gallery.
    video.addEventListener("wheel", e => {
        e.preventDefault();
        e.stopPropagation();
        const direction = e.deltaY < 0 ? 1 : -1;
        const next = clamp(video.volume + direction * 0.05, 0, 1);
        video.volume = next;
        if (next > 0 && video.muted) video.muted = false;
    }, { passive:false });

    // A single click on the picture area toggles play/pause. Leave the native
    // control strip at the bottom untouched so its buttons and scrubber work normally.
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
        if (!video.isConnected) {
            hideSpeedControl(video);
            control.remove();
            attachedVideos.delete(video);
        }
    });

    queueMicrotask(syncFullscreenControls);
}

function scan(root = document) {
    if (root instanceof HTMLVideoElement && root.classList.contains("ovg-inline-video")) attachPlaybackControls(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(attachPlaybackControls);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        injectStyles();
        scan();
        document.addEventListener("fullscreenchange", syncFullscreenControls);
        document.addEventListener("webkitfullscreenchange", syncFullscreenControls);

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof Element) scan(node);
                }
                for (const node of record.removedNodes) {
                    if (!(node instanceof Element)) continue;
                    const videos = [];
                    if (node instanceof HTMLVideoElement && node.classList.contains("ovg-inline-video")) videos.push(node);
                    node.querySelectorAll?.("video.ovg-inline-video").forEach(v => videos.push(v));
                    for (const video of videos) {
                        hideSpeedControl(video);
                        video.__cigSpeedControl?.remove();
                        attachedVideos.delete(video);
                    }
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:true });
    },
});
