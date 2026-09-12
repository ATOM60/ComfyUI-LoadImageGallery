import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.InputPreviewArrowOverlayV6";
const NODE_CLASS = "LoadImageGallery";

function exactPreview(node) {
    return node?.widgets?.find?.(widget =>
        widget?.name === "$$canvas-image-preview" || widget?.type === "IMAGE_PREVIEW"
    ) || null;
}

function drawLargeArrow(ctx, rect, text) {
    if (!rect) return;
    const size = Math.max(64, Math.min(96, rect.w * 0.9, rect.h * 0.55));
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${size}px Arial,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 - 2);
    ctx.restore();
}

function patchOnce(node) {
    const widget = exactPreview(node);
    if (!widget || typeof widget.drawWidget !== "function") return false;
    if (widget.__cigLargeArrowOverlayInstalled) return true;

    const baseDraw = widget.drawWidget;
    widget.__cigLargeArrowOverlayInstalled = true;
    widget.__cigLargeArrowBaseDraw = baseDraw;
    widget.__cigLargeArrowDraw = function(ctx, options) {
        baseDraw.call(this, ctx, options);
        const prev = this.__cigPrevRect || this.__cigNavV5PrevRect || null;
        const next = this.__cigNextRect || this.__cigNavV5NextRect || null;
        if (!prev && !next) return;
        drawLargeArrow(ctx, prev, "‹");
        drawLargeArrow(ctx, next, "›");
    };
    widget.drawWidget = widget.__cigLargeArrowDraw;
    node.graph?.setDirtyCanvas?.(true, true);
    return true;
}

function install(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;
    if (node.__cigLargeArrowInstallPending) return;
    node.__cigLargeArrowInstallPending = true;

    const started = performance.now();
    const tryInstall = () => {
        if (!node.graph) {
            node.__cigLargeArrowInstallPending = false;
            return;
        }
        if (patchOnce(node)) {
            node.__cigLargeArrowInstallPending = false;
            return;
        }
        if (performance.now() - started >= 5000) {
            node.__cigLargeArrowInstallPending = false;
            return;
        }
        setTimeout(tryInstall, 200);
    };

    // The legacy preview renderer performs delayed installs through ~1000 ms.
    // Patch only after it has settled, then stop permanently.
    setTimeout(tryInstall, 1400);
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
