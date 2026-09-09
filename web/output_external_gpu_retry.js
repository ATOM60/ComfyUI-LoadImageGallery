import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.OutputExternalGpuRetry";
const EXTERNAL_PREFIX = "__cig_external__/";
const installed = new WeakSet();

function apiUrl(route) {
    try { if (typeof api.apiURL === "function") return api.apiURL(route); } catch (_) {}
    return route;
}

function install(modal) {
    if (!(modal instanceof HTMLElement) || installed.has(modal)) return;
    installed.add(modal);

    // Error does not bubble, but it does travel through the capture phase. Keep
    // this handler scoped to the open Output Gallery instead of patching document.
    modal.addEventListener("error", event => {
        const video = event.target;
        if (!(video instanceof HTMLVideoElement) || !video.classList.contains("ovg-inline-video")) return;

        const card = video.closest(".ovg-card");
        const path = String(card?.dataset?.path || "");
        if (!path.startsWith(EXTERNAL_PREFIX)) return;

        // On a second error let the gallery's original error listener run and
        // clean the failed player normally. The retry is strictly one-shot.
        if (video.dataset.cigExternalGpuRetried === "1") return;
        video.dataset.cigExternalGpuRetried = "1";

        // Prevent the original target error listener from removing the player
        // before we can retry it through the explicit external-file endpoint.
        event.preventDefault();
        event.stopImmediatePropagation();

        const url = apiUrl(`/image-gallery/output/video-folder?path=${encodeURIComponent(path)}&v=${Date.now()}`);
        const resume = () => {
            try {
                const result = video.play();
                result?.catch?.(() => {});
            } catch (_) {}
        };

        try {
            video.src = url;
            video.load();
            if (video.readyState >= 2) resume();
            else video.addEventListener("canplay", resume, { once:true });
        } catch (_) {
            // If assigning/reloading the retry source itself fails, dispatching a
            // normal media error is left to the browser/core gallery.
        }
    }, true);
}

function scan(root = document) {
    if (root instanceof HTMLElement && root.classList.contains("ovg-modal")) install(root);
    root.querySelectorAll?.(".ovg-modal").forEach(install);
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
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
