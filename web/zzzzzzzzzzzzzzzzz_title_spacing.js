import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.LiberTitleSpacing";
const NODE_CLASS = "LoadImageGallery";
const DISPLAY_NAME = "Liber Load Image from Gallery and Output Gallery";
const SPACED_NAME = `${DISPLAY_NAME}\u00A0\u00A0`;

app.registerExtension({
    name: EXT_NAME,
    nodeCreated(node) {
        if (node?.comfyClass !== NODE_CLASS && node?.type !== NODE_CLASS) return;
        const current = String(node.title || "");
        if (!current || current === DISPLAY_NAME) {
            node.title = SPACED_NAME;
            node.setDirtyCanvas?.(true, true);
            node.graph?.setDirtyCanvas?.(true, true);
        }
    },
});
