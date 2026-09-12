import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputFullscreenCardMediaRestore";

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function videoEndpoint(path) {
    return `/image-gallery/output/video?path=${encodeURIComponent(path)}`;
}

function thumbEndpoint(path) {
    return `/image-gallery/output/thumb?path=${encodeURIComponent(path)}`;
}

function restoreCardMedia() {
    if (fullscreenElement()) return;

    for (const modal of document.querySelectorAll(".ovg-modal")) {
        if (!(modal instanceof HTMLElement) || !modal.isConnected) continue;

        for (const video of modal.querySelectorAll("video.ovg-inline-video")) {
            if (!(video instanceof HTMLVideoElement)) continue;
            const card = video.closest(".ovg-card[data-path]");
            if (!(card instanceof HTMLElement)) continue;

            const cardPath = String(card.dataset.path || "").trim();
            const currentPath = String(video.dataset.cigCurrentPath || cardPath).trim();
            if (!cardPath || !currentPath || cardPath === currentPath) continue;

            try { video.pause(); } catch (_) {}
            try {
                video.dataset.cigCurrentPath = cardPath;
                video.poster = thumbEndpoint(cardPath);
                video.src = videoEndpoint(cardPath);
                video.load();
                video.controls = false;
                video.removeAttribute("controls");
            } catch (_) {}
        }
    }
}

function afterFullscreenChange() {
    if (fullscreenElement()) return;
    requestAnimationFrame(() => {
        if (!fullscreenElement()) restoreCardMedia();
    });
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.addEventListener("fullscreenchange", afterFullscreenChange, true);
        document.addEventListener("webkitfullscreenchange", afterFullscreenChange, true);
    },
});
