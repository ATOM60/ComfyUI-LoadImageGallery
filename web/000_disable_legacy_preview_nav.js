import { app } from "/scripts/app.js";

const NODE_CLASS = "LoadImageGallery";

app.registerExtension({
    name: "Comfy.ImageGallery.DisableLegacyPreviewNavV3",
    nodeCreated(node) {
        if (node?.comfyClass !== NODE_CLASS && node?.type !== NODE_CLASS) return;
        node.__cigPreviewNavV3 = true;
    },
});
