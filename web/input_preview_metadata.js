import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.InputPreviewMetadata";
const NODE_CLASS = "LoadImageGallery";
const NAME_FONT = "600 13px Arial, sans-serif";
const SIZE_FONT = "500 12px Arial, sans-serif";
const COUNT_FONT = "600 11px Arial, sans-serif";
const RU = String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en")
    .toLowerCase().startsWith("ru");

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

function inside(x, y, rect) {
    return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function install(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) || node.__cigDrawPreviewMetadata) return;
    let cachedKey = "", cached = null;

    // Called by the preview after LiteGraph has arranged widgets. The legacy
    // title-help suppression clears onDrawForeground, so never attach there.
    const draw = function(ctx, preview, options) {
        const top = Number(preview?.y);
        if (node.flags?.collapsed || node.collapsed || !Number.isFinite(top) || top < 18) return;

        const stack = node.__cigStackController;
        const showStack = !!stack?.isRoot?.();
        const stackCount = showStack ? Math.max(1, Number(stack.count?.()) || 1) : 0;
        const name = filenameFrom(node.widgets?.find(w => w?.name === "image")?.value ?? node.properties?.__cigLastImage);
        if (!name && !showStack) return;

        const size = name ? dimensions(node, options) : "";
        const width = Number(options?.width ?? node.size?.[0] ?? 320);
        const slotFont = node.innerFontStyle || ctx.font;
        const labels = (node.outputs || []).map(output => String(output.label || output.localized_name || output.name || ""));

        ctx.save();
        try {
            let contentLeft = 14;
            node.__cigStackControlRects = null;

            if (showStack) {
                const y = top / 2;
                const buttonSize = 18;
                const buttonY = Math.max(1, y - buttonSize / 2);
                const prev = { x:10, y:buttonY, w:buttonSize, h:buttonSize };

                ctx.font = COUNT_FONT;
                const countLabel = `${RU ? "нод" : "nodes"}: ${stackCount}`;
                const labelWidth = Math.ceil(ctx.measureText(countLabel).width);
                const labelX = prev.x + prev.w + 5;
                const next = { x:labelX + labelWidth + 5, y:buttonY, w:buttonSize, h:buttonSize };

                node.__cigStackControlRects = { prev, next };

                const drawArrow = (rect, glyph, enabled) => {
                    ctx.save();
                    ctx.globalAlpha *= enabled ? 1 : .35;
                    ctx.fillStyle = "rgba(255,255,255,.06)";
                    ctx.strokeStyle = "rgba(255,255,255,.18)";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 5);
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = "rgba(238,238,238,.92)";
                    ctx.font = "700 14px Arial, sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(glyph, rect.x + rect.w / 2, rect.y + rect.h / 2 - .5);
                    ctx.restore();
                };

                drawArrow(prev, "‹", stackCount > 1);
                drawArrow(next, "›", true);

                ctx.font = COUNT_FONT;
                ctx.fillStyle = "rgba(220,220,220,.86)";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(countLabel, labelX, y);

                contentLeft = next.x + next.w + 10;
            }

            const key = JSON.stringify([name, size, width, slotFont, labels, showStack, stackCount, contentLeft]);
            if (key !== cachedKey) {
                ctx.font = slotFont;
                const reservedRight = Math.max(145, ...labels.map(label => ctx.measureText(label).width + 32));
                const available = Math.max(0, width - contentLeft - reservedRight);
                ctx.font = SIZE_FONT;
                const suffix = size ? "  •  " + size : "";
                const suffixWidth = ctx.measureText(suffix).width;
                ctx.font = NAME_FONT;
                const fitted = fitText(ctx, name, available - suffixWidth);
                const nameWidth = ctx.measureText(fitted).width;
                const displayedSuffix = fitted ? suffix : size;
                ctx.font = SIZE_FONT;
                const textWidth = nameWidth + ctx.measureText(displayedSuffix).width;
                const centered = contentLeft + Math.max(0, (available - textWidth) / 2);
                const x = Math.max(contentLeft, Math.min(centered, width - reservedRight - textWidth));
                cached = { available, contentLeft, name:fitted, suffix:displayedSuffix, nameWidth, x };
                cachedKey = key;
            }

            if (!cached || cached.available <= 0 || !name) return;
            // Keep filename/resolution in the same existing band, to the right of
            // the node counter and away from output labels. Node height is unchanged.
            ctx.beginPath();
            ctx.rect(cached.contentLeft, 0, cached.available, top);
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
        delete node.__cigStackControlRects;
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
