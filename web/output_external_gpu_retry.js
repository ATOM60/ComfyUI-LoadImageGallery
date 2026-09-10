import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.OutputExternalGpuRetry";
const EXTERNAL_PREFIX = "__cig_external__/";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const installed = new WeakSet();

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en")
    .toLowerCase().startsWith("ru");

const TEXT = RU ? {
    unknownMedia: "неизвестная ошибка media",
    gpuFailed: (name, error) => `GPU не смог открыть «${name}»: ${error}`,
    preparing: "Браузер не поддерживает исходный контейнер/кодек. Подготавливаю совместимую H.264 MP4-копию…",
    network: error => `Сеть: ${error}`,
    ready: "Совместимая копия готова. Запускаю GPU-плеер…",
} : {
    unknownMedia: "unknown media error",
    gpuFailed: (name, error) => `GPU could not open “${name}”: ${error}`,
    preparing: "The browser does not support the source container/codec. Preparing a compatible H.264 MP4 copy…",
    network: error => `Network: ${error}`,
    ready: "Compatible copy is ready. Starting GPU playback…",
};

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
    if (!err) return TEXT.unknownMedia;
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

function statusNote(video, text, failed = false) {
    const holder = video.closest(".ovg-thumb");
    if (!(holder instanceof HTMLElement)) return null;
    let note = holder.querySelector(":scope > .ovg-external-gpu-error");
    if (!(note instanceof HTMLElement)) {
        note = document.createElement("div");
        note.className = "ovg-external-gpu-error";
        note.style.cssText = "position:absolute;inset:0;z-index:8;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;text-align:center;background:rgba(0,0,0,.78);color:#e7e7e7;font:12px/1.35 Arial,sans-serif;white-space:normal;pointer-events:none";
        holder.appendChild(note);
    }
    note.style.color = failed ? "#ffb3b3" : "#e7e7e7";
    note.textContent = text;
    return note;
}

function clearStatus(video) {
    video.closest(".ovg-thumb")?.querySelector?.(":scope > .ovg-external-gpu-error")?.remove();
}

function keepFailedPlayer(video, name, error) {
    video.dataset.cigExternalGpuState = "failed";
    try { video.pause(); } catch (_) {}
    const detail = error?.message || String(error);
    statusNote(video, `GPU: ${detail}`, true);
    toast(TEXT.gpuFailed(name, detail));
}

async function prepareCompatibleProxy(video, path, name) {
    statusNote(video, TEXT.preparing);
    video.dataset.cigExternalGpuState = "preparing";
    try { video.pause(); } catch (_) {}

    let response;
    try {
        response = await api.fetchApi("/image-gallery/output/browser-proxy-prepare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
        });
    } catch (error) {
        throw new Error(TEXT.network(error?.message || String(error)));
    }

    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
    }
    if (!video.isConnected) return;

    const version = data?.version || Date.now();
    const url = apiUrl(`/image-gallery/output/browser-proxy?path=${encodeURIComponent(path)}&v=${encodeURIComponent(version)}`);
    video.dataset.cigExternalGpuState = "proxy-loading";
    statusNote(video, TEXT.ready);

    const onCanPlay = () => {
        if (!video.isConnected) return;
        video.dataset.cigExternalGpuState = "playing";
        clearStatus(video);
        try { video.play()?.catch?.(() => {}); } catch (_) {}
    };
    video.addEventListener("canplay", onCanPlay, { once:true });

    try {
        video.src = url;
        video.load();
    } catch (error) {
        throw error;
    }
}

function install(modal) {
    if (!(modal instanceof HTMLElement) || installed.has(modal)) return;
    installed.add(modal);

    // Media errors do not bubble but do traverse capture. External videos that
    // Chromium cannot demux are intercepted before the core gallery removes the
    // player. We prepare a browser-safe H.264/AAC MP4 proxy and then keep using
    // the normal <video> element, so decoding remains the browser/GPU path.
    modal.addEventListener("error", event => {
        const video = event.target;
        if (!(video instanceof HTMLVideoElement) || !video.classList.contains("ovg-inline-video")) return;

        const card = video.closest(".ovg-card");
        const path = String(card?.dataset?.path || "");
        if (!path.startsWith(EXTERNAL_PREFIX)) return;

        const name = card?.querySelector(".ovg-card-name")?.textContent?.trim() || "video";
        const state = String(video.dataset.cigExternalGpuState || "");

        event.preventDefault();
        event.stopImmediatePropagation();

        if (state === "preparing") return;
        if (state === "proxy-loading") {
            keepFailedPlayer(video, name, new Error(mediaErrorText(video)));
            return;
        }
        if (state === "failed") return;

        prepareCompatibleProxy(video, path, name).catch(error => {
            if (!video.isConnected) return;
            keepFailedPlayer(video, name, error);
        });
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
