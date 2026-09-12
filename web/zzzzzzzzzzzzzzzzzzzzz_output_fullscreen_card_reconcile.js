import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputFullscreenCardReconcile";

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function reconcileModal(modal) {
    if (!(modal instanceof HTMLElement) || !modal.isConnected) return;

    const mismatched = [...modal.querySelectorAll("video.ovg-inline-video")].some(video => {
        if (!(video instanceof HTMLVideoElement)) return false;
        const card = video.closest(".ovg-card[data-path]");
        if (!(card instanceof HTMLElement)) return false;
        const cardPath = String(card.dataset.path || "").trim();
        const currentPath = String(video.dataset.cigCurrentPath || cardPath).trim();
        return !!cardPath && !!currentPath && cardPath !== currentPath;
    });

    if (!mismatched) return;

    const sort = modal.querySelector(".ovg-sort");
    if (!(sort instanceof HTMLSelectElement)) return;
    sort.dispatchEvent(new Event("change", { bubbles:true }));
}

function reconcileAfterFullscreenExit() {
    if (fullscreenElement()) return;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (fullscreenElement()) return;
            document.querySelectorAll(".ovg-modal").forEach(reconcileModal);
        });
    });
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.addEventListener("fullscreenchange", reconcileAfterFullscreenExit, true);
        document.addEventListener("webkitfullscreenchange", reconcileAfterFullscreenExit, true);
    },
});
