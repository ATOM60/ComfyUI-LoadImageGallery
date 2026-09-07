import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoDoubleClickFullscreen";

function isFullscreenVideo(video) {
    const fs = document.fullscreenElement || document.webkitFullscreenElement || null;
    return fs === video || video.webkitDisplayingFullscreen === true;
}

function isPictureArea(video, event) {
    const rect = video.getBoundingClientRect();
    const localY = event.clientY - rect.top;
    const nativeControlsHeight = isFullscreenVideo(video) ? 72 : 52;
    return localY < rect.height - nativeControlsHeight;
}

async function enterFullscreenAndPlay(video) {
    try { await video.play(); } catch (_) {}

    if (isFullscreenVideo(video)) return;

    try {
        if (video.requestFullscreen) {
            await video.requestFullscreen();
            return;
        }
    } catch (_) {}

    try {
        if (video.webkitRequestFullscreen) {
            video.webkitRequestFullscreen();
            return;
        }
    } catch (_) {}

    try {
        if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } catch (_) {}
}

function attach(video) {
    if (!(video instanceof HTMLVideoElement) || video.dataset.cigDblFullscreen === "1") return;
    video.dataset.cigDblFullscreen = "1";

    video.addEventListener("dblclick", event => {
        if (!isPictureArea(video, event)) return;
        event.preventDefault();
        event.stopPropagation();
        enterFullscreenAndPlay(video);
    });
}

function scan(root = document) {
    if (root instanceof HTMLVideoElement && root.classList.contains("ovg-inline-video")) attach(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(attach);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        scan();
        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof Element) scan(node);
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:true });
    },
});
