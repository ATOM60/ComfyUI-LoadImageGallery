import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputGpuFullscreenLowPower";
const STYLE_ID = "cig-output-gpu-fullscreen-low-power-style";

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
/* Keep the fullscreen GPU path as close as possible to a plain hardware video
 * surface. Once the shared UI auto-hides, remove overlay boxes from layout
 * completely instead of leaving transparent composited layers over the frame. */
.ovg-shared-player[data-ovg-decoder="GPU"]:fullscreen,
.ovg-shared-player[data-ovg-decoder="GPU"]:-webkit-full-screen{
    contain:layout paint style!important;
    isolation:isolate!important;
}
.ovg-shared-player[data-ovg-decoder="GPU"]:fullscreen .ovg-shared-fs-controls button,
.ovg-shared-player[data-ovg-decoder="GPU"]:-webkit-full-screen .ovg-shared-fs-controls button{
    backdrop-filter:none!important;
    -webkit-backdrop-filter:none!important;
    box-shadow:none!important;
}
.ovg-shared-player[data-ovg-decoder="GPU"]:fullscreen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-native,
.ovg-shared-player[data-ovg-decoder="GPU"]:fullscreen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-fs-controls,
.ovg-shared-player[data-ovg-decoder="GPU"]:fullscreen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-badge,
.ovg-shared-player[data-ovg-decoder="GPU"]:fullscreen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-paused,
.ovg-shared-player[data-ovg-decoder="GPU"]:fullscreen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-hit,
.ovg-shared-player[data-ovg-decoder="GPU"]:-webkit-full-screen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-native,
.ovg-shared-player[data-ovg-decoder="GPU"]:-webkit-full-screen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-fs-controls,
.ovg-shared-player[data-ovg-decoder="GPU"]:-webkit-full-screen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-badge,
.ovg-shared-player[data-ovg-decoder="GPU"]:-webkit-full-screen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-paused,
.ovg-shared-player[data-ovg-decoder="GPU"]:-webkit-full-screen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-hit{
    display:none!important;
}
`;
    document.head.appendChild(style);
}

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function activeGpuFullscreenPlayer() {
    const fs = fullscreenElement();
    if (!(fs instanceof HTMLElement)) return null;
    if (!fs.classList.contains("ovg-shared-player")) return null;
    return fs.dataset.ovgDecoder === "GPU" ? fs : null;
}

function pauseOtherGpuVideos(activePlayer) {
    if (!(activePlayer instanceof HTMLElement)) return;
    const activeVideo = activePlayer.querySelector("video.ovg-inline-video");
    for (const video of document.querySelectorAll("video.ovg-inline-video")) {
        if (!(video instanceof HTMLVideoElement) || video === activeVideo) continue;
        try { if (!video.paused) video.pause(); } catch (_) {}
    }
}

function syncFullscreenState() {
    const player = activeGpuFullscreenPlayer();
    if (player) pauseOtherGpuVideos(player);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        document.addEventListener("fullscreenchange", syncFullscreenState, true);
        document.addEventListener("webkitfullscreenchange", syncFullscreenState, true);
        syncFullscreenState();
    },
});
