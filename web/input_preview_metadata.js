import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.InputPreviewMetadata";
const NODE_CLASS = "LoadImageGallery";

function isTarget(node) {
    return !!node && (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS);
}

function isPreview(widget) {
    return widget?.name === "$$canvas-image-preview" || widget?.type === "IMAGE_PREVIEW";
}

function imageWidget(node) {
    return node?.widgets?.find?.(w => w?.name === "image") || null;
}

function filenameFrom(value) {
    const text = String(value ?? "").replace(/\\/g, "/");
    const name = text.slice(text.lastIndexOf("/") + 1);
    return name.replace(/\s*\[(input|output|temp)\]\s*$/i, "");
}

function currentImage(node) {
    const images = Array.isArray(node?.imgs) ? node.imgs : [];
    return images[node?.imageIndex ?? 0] || images[0] || null;
}

function dimensions(node) {
    const img = currentImage(node);
    const width = Number(img?.naturalWidth || img?.videoWidth || img?.width || 0);
    const height = Number(img?.naturalHeight || img?.videoHeight || img?.height || 0);
    return width > 0 && height > 0 ? `${Math.round(width)} × ${Math.round(height)}` : "";
}

function fitText(ctx, text, maxWidth) {
    if (!text || maxWidth <= 0) return "";
    if (ctx.measureText(text).width <= maxWidth) return text;
    const ellipsis = "…";
    if (ctx.measureText(ellipsis).width > maxWidth) return "";
    let lo = 0, hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid;
        else hi = mid - 1;
    }
    return text.slice(0, lo) + ellipsis;
}

function install(node) {
    if (!isTarget(node) || node.__cigPreviewMetadataInstalled) return;
    node.__cigPreviewMetadataInstalled = true;

    const original = node.onDrawForeground;
    node.onDrawForeground = function(ctx, ...args) {
        original?.call(this, ctx, ...args);
        if (this.flags?.collapsed || !Array.isArray(this.widgets)) return;

        const preview = this.widgets.find(isPreview);
        const previewY = Number(preview?.y);
        if (!preview || !Number.isFinite(previewY) || previewY < 18) return;

        const name = filenameFrom(imageWidget(this)?.value ?? this.properties?.__cigLastImage ?? "");
        if (!name) return;

        const size = dimensions(this);
        const nodeWidth = Math.max(1, Number(this.size?.[0] ?? 320));
        const left = 14;
        // Keep the right side clear for IMAGE / MASK output labels and sockets.
        const rightReserved = 145;
        const maxWidth = Math.max(40, nodeWidth - left - rightReserved);
        const y = Math.max(15, Math.min(previewY - 10, previewY * 0.5));

        ctx.save();
        try {
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.font = "600 13px Arial, sans-serif";
            ctx.fillStyle = "rgba(235,235,235,.92)";

            const separator = size ? "  •  " : "";
            const sizeWidth = size ? ctx.measureText(separator + size).width : 0;
            const fittedName = fitText(ctx, name, Math.max(20, maxWidth - sizeWidth));
            if (!fittedName) return;

            ctx.fillText(fittedName, left, y);
            if (size) {
                const nameWidth = ctx.measureText(fittedName).width;
                ctx.font = "500 12px Arial, sans-serif";
                ctx.fillStyle = "rgba(210,210,210,.72)";
                ctx.fillText(separator + size, left + nameWidth, y);
            }
        } finally {
            ctx.restore();
        }
    };

    const oldRemoved = node.onRemoved;
    node.onRemoved = function(...args) {
        if (this.onDrawForeground && this.__cigPreviewMetadataInstalled) this.onDrawForeground = original;
        delete this.__cigPreviewMetadataInstalled;
        return oldRemoved?.apply(this, args);
    };
}

app.registerExtension({
    name: EXT_NAME,
    nodeCreated: install,
    loadedGraphNode: install,
});
