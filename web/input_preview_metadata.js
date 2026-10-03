import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.InputPreviewMetadata";
const NODE_CLASS = "LoadImageGallery";
const NAME_FONT = "600 13px Arial, sans-serif";
const SIZE_FONT = "500 12px Arial, sans-serif";

function filenameFrom(value) {
    const text = String(value ?? "").replace(/\\/g, "/").replace(/\s*\[(input|output|temp)\]\s*$/i, "");
    return text.slice(text.lastIndexOf("/") + 1);
}

function dimensions(node, options) {
    const images = options?.previewImages?.length ? options.previewImages : node.imgs;
    const image = images?.[node.imageIndex ?? 0] || images?.[0];
    // A not-yet-decoded HTMLImageElement can have CSS width/height, but those
    // are not the source resolution. Canvas/ImageBitmap previews use width.
    const width = Number(image?.naturalWidth ?? image?.videoWidth ?? image?.width ?? 0);
    const height = Number(image?.naturalHeight ?? image?.videoHeight ?? image?.height ?? 0);
    return width > 0 && height > 0 ? Math.round(width) + " × " + Math.round(height) : "";
}

function fitText(ctx, text, maxWidth) {
    if (!text || maxWidth <= 0) return "";
    if (ctx.measureText(text).width <= maxWidth) return text;
    if (ctx.measureText("…").width > maxWidth) return "";
    const letters = Array.from(text);
    let lo = 0, hi = letters.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(letters.slice(0, mid).join("") + "…").width <= maxWidth) lo = mid;
        else hi = mid - 1;
    }
    return letters.slice(0, lo).join("") + "…";
}

function install(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) || node.__cigDrawPreviewMetadata) return;
    let cachedKey = "", cached = null;

    // Called by the preview after LiteGraph has arranged widgets. The legacy
    // title-help suppression clears onDrawForeground, so never attach there.
    const draw = function(ctx, preview, options) {
        const top = Number(preview?.y);
        if (node.flags?.collapsed || node.collapsed || !Number.isFinite(top) || top < 18) return;
        const name = filenameFrom(node.widgets?.find(w => w?.name === "image")?.value ?? node.properties?.__cigLastImage);
        if (!name) return;
        const size = dimensions(node, options);
        const width = Number(options?.width ?? node.size?.[0] ?? 320);
        const slotFont = node.innerFontStyle || ctx.font;
        const labels = (node.outputs || []).map(output => String(output.label || output.localized_name || output.name || ""));
        const key = JSON.stringify([name, size, width, slotFont, labels]);

        ctx.save();
        try {
            if (key !== cachedKey) {
                ctx.font = slotFont;
                const reserved = Math.max(145, ...labels.map(label => ctx.measureText(label).width + 32));
                const available = width - 14 - reserved;
                ctx.font = SIZE_FONT;
                const suffix = size ? "  •  " + size : "";
                const suffixWidth = ctx.measureText(suffix).width;
                ctx.font = NAME_FONT;
                const fitted = fitText(ctx, name, available - suffixWidth);
                const nameWidth = ctx.measureText(fitted).width;
                const displayedSuffix = fitted ? suffix : size;
                ctx.font = SIZE_FONT;
                const textWidth = nameWidth + ctx.measureText(displayedSuffix).width;
                // Center over the image, keeping long labels clear of the outputs.
                const x = Math.max(14, Math.min((width - textWidth) / 2, width - reserved - textWidth));
                cached = { available, name: fitted, suffix: displayedSuffix, nameWidth, x };
                cachedKey = key;
            }
            if (cached.available <= 0) return;
            // Clip to the existing empty band, away from the output labels.
            // No widgets, node dimensions or preview coordinates are changed.
            ctx.beginPath();
            ctx.rect(14, 0, cached.available, top);
            ctx.clip();
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            const y = top / 2;
            ctx.font = NAME_FONT;
            ctx.fillStyle = "rgba(235,235,235,.92)";
            if (cached.name) ctx.fillText(cached.name, cached.x, y);
            if (cached.suffix) {
                ctx.font = SIZE_FONT;
                ctx.fillStyle = "rgba(210,210,210,.82)";
                ctx.fillText(cached.suffix, cached.x + cached.nameWidth, y);
            }
        } finally { ctx.restore(); }
    };
    node.__cigDrawPreviewMetadata = draw;

    const ownRemoved = Object.hasOwn(node, "onRemoved");
    const oldRemoved = node.onRemoved;
    const removed = function(...args) {
        if (node.__cigDrawPreviewMetadata === draw) delete node.__cigDrawPreviewMetadata;
        if (node.onRemoved === removed) {
            if (ownRemoved) node.onRemoved = oldRemoved;
            else delete node.onRemoved;
        }
        return oldRemoved?.apply(this, args);
    };
    node.onRemoved = removed;
    node.graph?.setDirtyCanvas?.(true, false);
}

app.registerExtension({
    name: EXT_NAME,
    nodeCreated: install,
    loadedGraphNode: install,
});
