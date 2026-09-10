import { app } from "/scripts/app.js";

/*
 * Legacy direct GPU gestures/pseudo-fullscreen are intentionally retired.
 * The shared CPU/GPU player owns click, double-click, touch scrub and fullscreen.
 */
app.registerExtension({
    name: "Comfy.ImageGallery.OutputPreviewInteractions",
    setup() {
        // Compatibility stub. The shared player and GPU preview router provide
        // the only fullscreen path, so the old pseudo-fullscreen cannot compete.
    },
});
