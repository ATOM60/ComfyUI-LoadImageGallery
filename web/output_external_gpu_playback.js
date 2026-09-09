import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.OutputExternalGpuPlayback";
const modalObservers = new WeakMap();

function apiUrl(route) {
    try { if (typeof api.apiURL === "function") return api.apiURL(route); } catch (_) {}
    return route;
}

function isAbsolutePath(path) {
    const raw = String(path || "").trim();
    return /^[A-Za-z]:[\\/]/.test(raw) || /^[\\/]{2}/.test(raw) || raw.startsWith("/");
}

function wireVideo(video) {
    if (!(video instanceof HTMLVideoElement) || video.dataset.cigExternalGpuRoute === "1") return;
    const card = video.closest(".ovg-card");
    const path = String(card?.dataset?.path || "").trim();
    if (!isAbsolutePath(path)) return;

    video.dataset.cigExternalGpuRoute = "1";
    const url = apiUrl(`/image-gallery/output/video-folder?path=${encodeURIComponent(path)}&v=${Date.now()}`);

    // The core gallery creates the video synchronously with the generic output
    // route. Replace that source immediately for absolute paths so external
    // folders do not depend on the generic route's resolver monkey-patch.
    if (video.src !== new URL(url, window.location.href).href) {
        const wasPaused = video.paused;
        let at = 0;
        try { if (Number.isFinite(video.currentTime)) at = video.currentTime; } catch (_) {}
        video.src = url;
        try { video.load(); } catch (_) {}
        const restore = () => {
            try { if (at > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(at, video.duration || at); } catch (_) {}
            if (!wasPaused) {
                try { video.play()?.catch?.(() => {}); } catch (_) {}
            }
        };
        if (video.readyState >= 1) restore();
        else video.addEventListener("loadedmetadata", restore, { once:true });
    }
}

function scan(root) {
    if (!(root instanceof Element)) return;
    if (root instanceof HTMLVideoElement && root.classList.contains("ovg-inline-video")) wireVideo(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(wireVideo);
}

function installModal(modal) {
    if (!(modal instanceof HTMLElement) || modalObservers.has(modal)) return;
    scan(modal);
    const observer = new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node instanceof Element) scan(node);
            }
        }
    });
    observer.observe(modal, { childList:true, subtree:true });
    modalObservers.set(modal, observer);
}

function uninstallModal(modal) {
    modalObservers.get(modal)?.disconnect();
    modalObservers.delete(modal);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
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
