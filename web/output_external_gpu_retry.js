import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.OutputExternalGpuRetry";
const EXTERNAL_PREFIX = "__cig_external__/";
const installed = new WeakSet();
const objectUrls = new WeakMap();

function apiUrl(route) {
    try { if (typeof api.apiURL === "function") return api.apiURL(route); } catch (_) {}
    return route;
}

function toast(message, kind = "error") {
    try {
        app.extensionManager?.toast?.add({
            severity: kind,
            summary: "Output Gallery",
            detail: message,
            life: 9000,
        });
    } catch (_) {
        console[kind === "error" ? "error" : "log"]("[Output external GPU]", message);
    }
}

function mediaErrorText(video) {
    const err = video?.error;
    if (!err) return "неизвестная ошибка media";
    const codes = {
        1: "MEDIA_ERR_ABORTED",
        2: "MEDIA_ERR_NETWORK",
        3: "MEDIA_ERR_DECODE",
        4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
    };
    const name = codes[err.code] || `MEDIA_ERR_${err.code || "UNKNOWN"}`;
    const message = String(err.message || "").trim();
    return message ? `${name}: ${message}` : name;
}

function revokeObjectUrl(video) {
    const url = objectUrls.get(video);
    if (!url) return;
    objectUrls.delete(video);
    try { URL.revokeObjectURL(url); } catch (_) {}
}

async function blobFallback(video, path, name) {
    const route = `/image-gallery/output/video-folder?path=${encodeURIComponent(path)}&v=${Date.now()}`;
    let response;
    try {
        response = await fetch(apiUrl(route), { cache: "no-store" });
    } catch (error) {
        throw new Error(`Сеть: ${error?.message || String(error)}`);
    }

    if (!response.ok) {
        let detail = "";
        try { detail = (await response.text()).trim().slice(0, 240); } catch (_) {}
        throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    const blob = await response.blob();
    if (!blob.size) throw new Error("сервер вернул пустой файл");

    const objectUrl = URL.createObjectURL(blob);
    revokeObjectUrl(video);
    objectUrls.set(video, objectUrl);
    video.dataset.cigExternalGpuBlob = "1";
    video.dataset.cigExternalGpuState = "blob";

    return await new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            video.removeEventListener("canplay", onCanPlay, true);
            video.removeEventListener("error", onError, true);
        };
        const onCanPlay = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
        };
        const onError = event => {
            if (settled) return;
            settled = true;
            event.preventDefault();
            event.stopImmediatePropagation();
            cleanup();
            reject(new Error(mediaErrorText(video)));
        };

        video.addEventListener("canplay", onCanPlay, true);
        video.addEventListener("error", onError, true);
        try {
            video.src = objectUrl;
            video.load();
        } catch (error) {
            settled = true;
            cleanup();
            reject(error);
        }
    });
}

function keepFailedPlayer(video, name, error) {
    video.dataset.cigExternalGpuState = "failed";
    try { video.pause(); } catch (_) {}
    const holder = video.closest(".ovg-thumb");
    if (holder instanceof HTMLElement) {
        let note = holder.querySelector(":scope > .ovg-external-gpu-error");
        if (!(note instanceof HTMLElement)) {
            note = document.createElement("div");
            note.className = "ovg-external-gpu-error";
            note.style.cssText = "position:absolute;inset:0;z-index:8;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;text-align:center;background:rgba(0,0,0,.78);color:#ffb3b3;font:12px/1.35 Arial,sans-serif;white-space:normal;pointer-events:none";
            holder.appendChild(note);
        }
        note.textContent = `GPU: ${error?.message || String(error)}`;
    }
    toast(`GPU не смог открыть «${name}»: ${error?.message || String(error)}`);
}

function install(modal) {
    if (!(modal instanceof HTMLElement) || installed.has(modal)) return;
    installed.add(modal);

    // Media errors do not bubble, but they do travel through capture. For an
    // external item we intercept the first direct-stream error before the core
    // gallery removes the player, then retry from a fetched Blob URL. This
    // bypasses Range/query-path quirks while leaving internal-output playback
    // completely untouched.
    modal.addEventListener("error", event => {
        const video = event.target;
        if (!(video instanceof HTMLVideoElement) || !video.classList.contains("ovg-inline-video")) return;

        const card = video.closest(".ovg-card");
        const path = String(card?.dataset?.path || "");
        if (!path.startsWith(EXTERNAL_PREFIX)) return;

        const state = String(video.dataset.cigExternalGpuState || "");
        if (state === "blob" || state === "failed" || state === "loading") {
            // blobFallback installs its own capture listener for its media error.
            // If another error arrives after that listener is gone, keep the
            // player visible and report the actual browser media error instead
            // of letting the core remove it instantly.
            event.preventDefault();
            event.stopImmediatePropagation();
            if (state !== "loading" && state !== "failed") {
                keepFailedPlayer(video, card?.querySelector(".ovg-card-name")?.textContent?.trim() || "video", new Error(mediaErrorText(video)));
            }
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        video.dataset.cigExternalGpuState = "loading";

        const name = card?.querySelector(".ovg-card-name")?.textContent?.trim() || "video";
        blobFallback(video, path, name)
            .then(() => {
                if (!video.isConnected) return;
                video.dataset.cigExternalGpuState = "playing";
                try { video.play()?.catch?.(() => {}); } catch (_) {}
            })
            .catch(error => {
                if (!video.isConnected) return;
                keepFailedPlayer(video, name, error);
            });
    }, true);

    const observer = new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.removedNodes) {
                if (!(node instanceof Element)) continue;
                if (node instanceof HTMLVideoElement) revokeObjectUrl(node);
                node.querySelectorAll?.("video.ovg-inline-video").forEach(revokeObjectUrl);
            }
        }
    });
    observer.observe(modal, { childList:true, subtree:true });
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
