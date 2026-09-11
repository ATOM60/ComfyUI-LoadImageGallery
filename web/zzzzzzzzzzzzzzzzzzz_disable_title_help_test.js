import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.DisableTitleForegroundPermanent";
const NODE_CLASS = "LoadImageGallery";

function suppressTitleForeground(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;
    if (!node.__cigTitleHelpInstalled) return;
    if (!node.__cigTitleForegroundPermanentOriginal) {
        node.__cigTitleForegroundPermanentOriginal = node.onDrawForeground || null;
    }
    node.onDrawForeground = null;
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

function install(node) {
    const apply = () => suppressTitleForeground(node);
    apply();
    queueMicrotask(apply);
    requestAnimationFrame(apply);
    setTimeout(apply, 80);
    setTimeout(apply, 300);
}

app.registerExtension({
    name: EXT_NAME,
    nodeCreated(node) {
        install(node);
    },
    loadedGraphNode(node) {
        install(node);
    },
});
