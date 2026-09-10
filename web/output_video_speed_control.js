import { app } from "/scripts/app.js";

/*
 * Legacy GPU playback controls are intentionally retired.
 * CPU and GPU now use output_video_player_shared.js for the same controls,
 * fullscreen, seek, volume, speed and navigation behavior.
 */
app.registerExtension({
    name: "Comfy.ImageGallery.OutputVideoPlaybackControls",
    setup() {
        // Compatibility stub: keep the extension name stable, but do not attach
        // the old native-video control layer on top of the shared player.
    },
});
