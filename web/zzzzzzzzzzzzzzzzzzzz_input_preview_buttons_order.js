import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.InputPreviewButtonsOrder";
const NODE_CLASS = "LoadImageGallery";
const MAX_FRAMES = 12;

function isGalleryNode(node) {
    return !!node && (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS);
}

function findPreview(node) {
    return node?.widgets?.find?.(w => w?.name === "$$canvas-image-preview" || w?.type === "IMAGE_PREVIEW") || null;
}

function settleOrder(node) {
    if (!isGalleryNode(node)) return;

    let frame = 0;
    const tick = () => {
        if (!node?.graph) return;
        frame += 1;

        const preview = findPreview(node);
        if (preview && !app.configuringGraph) {
            // The stable layout already owns the actual ordering. Calling it only
            // after the preview exists keeps the image above the button row while
            // avoiding addWidget/addCustomWidget hooks during workflow restore.
            node.__cigNodeLayout?.refresh?.();
            node.graph?.setDirtyCanvas?.(true, true);
            return;
        }

        if (frame < MAX_FRAMES) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
}

app.registerExtension({
    name: EXT_NAME,
    nodeCreated(node) {
        settleOrder(node);
    },
    loadedGraphNode(node) {
        settleOrder(node);
    },
});
