import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputUnifiedGpuFullscreen";
const STYLE_ID = "cig-output-unified-gpu-fullscreen-style";
const attachedVideos = new Set();
const modalObservers = new WeakMap();
let activeVideo = null;
let changingFullscreen = false;

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function requestPageFullscreen() {
    const root = document.documentElement;
    if (fullscreenElement() === root) return Promise.resolve();
    try {
        if (root.requestFullscreen) {
            return Promise.resolve(root.requestFullscreen({ navigationUI: "hide" })).catch(() =>
                Promise.resolve(root.requestFullscreen()).catch(() => {})
            );
        }
        if (root.webkitRequestFullscreen) {
            root.webkitRequestFullscreen();
        }
    } catch (_) {}
    return Promise.resolve();
}

function exitPageFullscreen() {
    const fs = fullscreenElement();
    if (!fs) return Promise.resolve();
    try {
        if (document.exitFullscreen) return Promise.resolve(document.exitFullscreen()).catch(() => {});
        if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (_) {}
    return Promise.resolve();
}

function clamp(value, min, max) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

function detectTopInset() {
    const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    let best = 0;
    const candidates = document.querySelectorAll("body *");

    for (const el of candidates) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.closest(".ovg-modal") || el.closest(".ovg-speed-control")) continue;

        const rect = el.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top > 2) continue;
        if (rect.height < 20 || rect.height > 96) continue;

        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;

        const className = typeof el.className === "string" ? el.className : "";
        const id = el.id || "";
        const name = `${className} ${id}`;
        const namedComfyBar = /comfy|menu|toolbar|top[-_ ]?bar|app[-_ ]?header/i.test(name) && !/window[-_ ]?controls|native[-_ ]?title/i.test(name);
        const fixedWide = (style.position === "fixed" || style.position === "sticky") && rect.width >= width * 0.6;

        if (namedComfyBar || fixedWide) best = Math.max(best, rect.bottom);
    }

    return Math.round(clamp(best, 0, 96));
}

function applyInset(video) {
    const thumb = video?.closest?.(".ovg-thumb");
    if (!(thumb instanceof HTMLElement) || !thumb.classList.contains("cig-pseudo-fullscreen")) return;
    thumb.style.setProperty("--cig-pseudo-top", `${detectTopInset()}px`);
}

function setExtraControls(video, visible) {
    const control = video?.__cigSpeedControl;
    if (!control?.isConnected) return;
    if (visible) {
        try {
            if (typeof control.showPopover === "function" && !control.matches(":popover-open")) control.showPopover();
        } catch (_) {}
    } else {
        control.classList.remove("open");
        try {
            if (typeof control.hidePopover === "function" && control.matches(":popover-open")) control.hidePopover();
        } catch (_) {}
    }
}

function markPseudo(video) {
    const thumb = video?.closest?.(".ovg-thumb");
    if (!(thumb instanceof HTMLElement)) return false;
    thumb.classList.add("cig-pseudo-fullscreen");
    video.dataset.cigPseudoFullscreen = "1";
    document.body.classList.add("cig-output-pseudo-fullscreen-open");
    activeVideo = video;
    applyInset(video);
    setExtraControls(video, true);
    return true;
}

function clearPseudo(video, pause = true) {
    if (!(video instanceof HTMLVideoElement)) return;
    const thumb = video.closest(".ovg-thumb");
    if (pause) {
        try { video.pause(); } catch (_) {}
    }
    if (thumb instanceof HTMLElement) {
        thumb.classList.remove("cig-pseudo-fullscreen");
        thumb.style.removeProperty("--cig-pseudo-top");
    }
    delete video.dataset.cigPseudoFullscreen;
    setExtraControls(video, false);
    if (activeVideo === video) activeVideo = null;
    if (!document.querySelector(".ovg-thumb.cig-pseudo-fullscreen")) {
        document.body.classList.remove("cig-output-pseudo-fullscreen-open");
    }
}

async function enterUnified(video) {
    if (!(video instanceof HTMLVideoElement) || !video.isConnected) return;
    if (activeVideo && activeVideo !== video) clearPseudo(activeVideo, false);
    if (!markPseudo(video)) return;

    changingFullscreen = true;
    await requestPageFullscreen();
    changingFullscreen = false;
    requestAnimationFrame(() => applyInset(video));
    setTimeout(() => applyInset(video), 80);
}

async function exitUnified(video, pause = true) {
    if (!(video instanceof HTMLVideoElement)) return;
    clearPseudo(video, pause);
    if (fullscreenElement() === document.documentElement) {
        changingFullscreen = true;
        await exitPageFullscreen();
        changingFullscreen = false;
    }
}

async function toggleUnified(video) {
    const thumb = video?.closest?.(".ovg-thumb");
    const isPseudo = video?.dataset?.cigPseudoFullscreen === "1" || thumb?.classList.contains("cig-pseudo-fullscreen");
    if (isPseudo) await exitUnified(video, true);
    else await enterUnified(video);
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
video.ovg-inline-video::-webkit-media-controls-fullscreen-button{
    display:none!important;
}
.cig-gpu-unified-fullscreen-button{
    position:absolute!important;
    right:8px!important;
    bottom:8px!important;
    z-index:30!important;
    width:34px!important;
    height:30px!important;
    min-width:34px!important;
    min-height:30px!important;
    padding:0!important;
    margin:0!important;
    border:0!important;
    border-radius:4px!important;
    background:rgba(0,0,0,.58)!important;
    color:#fff!important;
    font:600 18px/30px "Segoe UI Symbol",Arial,sans-serif!important;
    text-align:center!important;
    cursor:pointer!important;
    opacity:.9!important;
}
.cig-gpu-unified-fullscreen-button:hover{
    background:rgba(0,0,0,.82)!important;
    opacity:1!important;
}
.ovg-thumb.cig-pseudo-fullscreen .cig-gpu-unified-fullscreen-button{
    right:12px!important;
    bottom:12px!important;
    z-index:2147483646!important;
}
`;
    document.head.appendChild(style);
}

function attachVideo(video) {
    if (!(video instanceof HTMLVideoElement) || attachedVideos.has(video)) return;
    attachedVideos.add(video);

    try {
        video.controlsList?.add?.("nofullscreen");
        const current = String(video.getAttribute("controlslist") || "").split(/\s+/).filter(Boolean);
        if (!current.includes("nofullscreen")) {
            current.push("nofullscreen");
            video.setAttribute("controlslist", current.join(" "));
        }
    } catch (_) {}

    const thumb = video.closest(".ovg-thumb");
    if (!(thumb instanceof HTMLElement)) return;

    let button = thumb.querySelector(":scope > .cig-gpu-unified-fullscreen-button");
    if (!(button instanceof HTMLButtonElement)) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "cig-gpu-unified-fullscreen-button";
        button.textContent = "⛶";
        button.title = "Fullscreen";
        button.setAttribute("aria-label", "Fullscreen");
        thumb.appendChild(button);
    }

    video.__cigUnifiedFullscreenButton = button;
    button.__cigUnifiedVideo = video;

    const consume = event => {
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    button.addEventListener("pointerdown", consume, true);
    button.addEventListener("pointerup", consume, true);
    button.addEventListener("dblclick", consume, true);
    button.addEventListener("click", event => {
        consume(event);
        toggleUnified(video);
    }, true);
}

function cleanupVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    if (activeVideo === video) {
        clearPseudo(video, false);
        if (fullscreenElement() === document.documentElement) exitPageFullscreen();
    }
    const button = video.__cigUnifiedFullscreenButton;
    if (button?.__cigUnifiedVideo === video) button.remove();
    delete video.__cigUnifiedFullscreenButton;
    attachedVideos.delete(video);
}

function scan(root) {
    if (!(root instanceof Element)) return;
    if (root instanceof HTMLVideoElement && root.classList.contains("ovg-inline-video")) attachVideo(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(attachVideo);
}

function cleanupRemoved(root) {
    if (!(root instanceof Element)) return;
    if (root instanceof HTMLVideoElement && root.classList.contains("ovg-inline-video")) cleanupVideo(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(cleanupVideo);
}

function syncPseudoFromDom(modal) {
    const thumb = modal.querySelector(".ovg-thumb.cig-pseudo-fullscreen");
    const video = thumb?.querySelector?.("video.ovg-inline-video");

    if (video instanceof HTMLVideoElement) {
        activeVideo = video;
        setExtraControls(video, true);
        applyInset(video);
        if (fullscreenElement() !== document.documentElement && !changingFullscreen) {
            changingFullscreen = true;
            requestPageFullscreen().finally(() => {
                changingFullscreen = false;
                requestAnimationFrame(() => applyInset(video));
            });
        }
        return;
    }

    if (activeVideo && !activeVideo.closest?.(".ovg-thumb")?.classList.contains("cig-pseudo-fullscreen")) {
        const old = activeVideo;
        activeVideo = null;
        setExtraControls(old, false);
        if (fullscreenElement() === document.documentElement && !changingFullscreen) {
            changingFullscreen = true;
            exitPageFullscreen().finally(() => { changingFullscreen = false; });
        }
    }
}

function installModal(modal) {
    if (!(modal instanceof HTMLElement) || modalObservers.has(modal)) return;
    scan(modal);

    const observer = new MutationObserver(records => {
        let classChanged = false;
        for (const record of records) {
            if (record.type === "attributes") {
                classChanged = true;
                continue;
            }
            for (const node of record.addedNodes) if (node instanceof Element) scan(node);
            for (const node of record.removedNodes) if (node instanceof Element) cleanupRemoved(node);
        }
        if (classChanged) syncPseudoFromDom(modal);
    });
    observer.observe(modal, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
    });
    modalObservers.set(modal, observer);
}

function uninstallModal(modal) {
    cleanupRemoved(modal);
    modalObservers.get(modal)?.disconnect();
    modalObservers.delete(modal);
}

function onFullscreenChange() {
    const fs = fullscreenElement();
    if (fs === document.documentElement) {
        if (activeVideo) requestAnimationFrame(() => applyInset(activeVideo));
        return;
    }

    if (activeVideo && activeVideo.closest?.(".ovg-thumb")?.classList.contains("cig-pseudo-fullscreen") && !changingFullscreen) {
        clearPseudo(activeVideo, true);
    }
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        document.addEventListener("fullscreenchange", onFullscreenChange, true);
        document.addEventListener("webkitfullscreenchange", onFullscreenChange, true);
        window.addEventListener("resize", () => {
            if (activeVideo) applyInset(activeVideo);
        });

        document.querySelectorAll(".ovg-modal").forEach(installModal);
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
