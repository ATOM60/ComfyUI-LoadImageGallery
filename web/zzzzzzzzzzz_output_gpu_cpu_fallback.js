import { app } from "/scripts/app.js";
import { startCpuFallback } from "./output_video_cpu_fallback_backend.js";

const EXT_NAME = "Comfy.ImageGallery.OutputGpuCpuFallback";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en").toLowerCase().startsWith("ru");
const LABELS = RU ? {
    play:"Воспроизвести", pause:"Пауза", prev:"Предыдущее видео", next:"Следующее видео",
    speed:"Скорость воспроизведения", volume:"Громкость", fullscreen:"На весь экран",
    exitFullscreen:"Выйти из полноэкранного режима",
} : {
    play:"Play", pause:"Pause", prev:"Previous video", next:"Next video",
    speed:"Playback speed", volume:"Volume", fullscreen:"Fullscreen",
    exitFullscreen:"Exit fullscreen",
};

function galleryPaths(holder) {
    const grid = holder?.closest?.(".ovg-card")?.closest?.(".ovg-grid");
    if (!grid) return [];
    return [...grid.querySelectorAll(".ovg-card[data-path]")]
        .map(card => String(card.dataset.path || ""))
        .filter(Boolean);
}

function isGpuGalleryVideo(video) {
    if (!(video instanceof HTMLVideoElement) || !video.classList.contains("ovg-inline-video")) return false;
    const holder = video.closest(".ovg-thumb");
    const modal = holder?.closest?.(".ovg-modal");
    return holder instanceof HTMLElement && modal instanceof HTMLElement && modal.dataset.ovgCpuMode !== "1";
}

function isDecoderFailure(video, error = null) {
    const code = Number(video?.error?.code || 0);
    return code === 3 || code === 4 || error?.name === "NotSupportedError";
}

function fallbackToCpu(video, sourceError = null) {
    if (!isGpuGalleryVideo(video) || !isDecoderFailure(video, sourceError)) return false;
    if (video.dataset.cigAutoCpuFallback === "1") return true;

    const holder = video.closest(".ovg-thumb");
    if (!(holder instanceof HTMLElement) || !holder.isConnected) return false;

    const card = holder.closest(".ovg-card");
    const path = String(video.dataset.cigCurrentPath || card?.dataset?.path || "").trim();
    if (!path) return false;

    video.dataset.cigAutoCpuFallback = "1";
    try { video.pause(); } catch (_) {}

    const state = startCpuFallback({
        holder,
        path,
        paths:() => galleryPaths(holder),
        labels:LABELS,
        gpuShell:video.__cigGpuShell || null,
        video,
    });

    if (!state) {
        delete video.dataset.cigAutoCpuFallback;
        return false;
    }
    return true;
}

function onMediaError(event) {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement)) return;
    if (!fallbackToCpu(video)) return;

    // The same fullscreen shell continues with CPU decoding, so prevent the
    // gallery's original video-error handler from tearing that shell down.
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
}

app.registerExtension({
    name:EXT_NAME,
    setup() {
        // Media error does not bubble reliably; capture it before the original
        // per-video cleanup handler can remove the active shared player.
        document.addEventListener("error", onMediaError, true);
    },
});
