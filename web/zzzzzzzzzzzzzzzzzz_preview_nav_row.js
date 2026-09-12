import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.PreviewNavDedicatedRow";
const NODE_CLASS = "LoadImageGallery";
const NAV_WIDGET = "cig-preview-nav";
const NAV_HEIGHT = 42;

function exactPreview(node) {
    return node?.widgets?.find?.(w => w?.name === "$$canvas-image-preview" || w?.type === "IMAGE_PREVIEW") || null;
}

function rawSplice(array, ...args) {
    return Array.prototype.splice.call(array, ...args);
}

function drawHalf(ctx, rect, label, widget) {
    ctx.save();
    ctx.fillStyle = widget?.background_color ?? "#222";
    ctx.strokeStyle = widget?.outline_color ?? "rgba(255,255,255,.22)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = widget?.text_color ?? "#ddd";
    ctx.font = "700 28px Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 - 1);
    ctx.restore();
}

function geometry(node, widget, options = null) {
    const width = Math.max(1, Number(options?.width ?? node.size?.[0] ?? 320));
    const y = Number(widget?.y ?? 0);
    const h = Math.max(1, Number(widget?.computedHeight ?? NAV_HEIGHT));
    const outer = 8;
    const gap = 8;
    const available = Math.max(2, width - outer * 2 - gap);
    const half = available / 2;
    return {
        prev: { x: outer, y, w: half, h },
        next: { x: outer + half + gap, y, w: half, h },
    };
}

function installRow(node) {
    if (!node?.widgets || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return false;
    if (!node.__cigUnifiedLayoutLocked || typeof node.__cigPreviewNavigate !== "function") return false;

    const preview = exactPreview(node);
    if (!preview || typeof node.addWidget !== "function") return false;

    let widget = node.widgets.find(w => w?.name === NAV_WIDGET) || null;
    if (!widget) {
        widget = node.addWidget("button", NAV_WIDGET, "", () => {});
        if (!widget) return false;
        widget.serialize = false;

        widget.computeSize = width => [width ?? node.size?.[0] ?? 320, NAV_HEIGHT];
        widget.computeLayoutSize = () => ({ minHeight:NAV_HEIGHT, maxHeight:NAV_HEIGHT, minWidth:0 });

        widget.drawWidget = function(ctx, options) {
            const rects = geometry(node, this, options);
            drawHalf(ctx, rects.prev, "‹", this);
            drawHalf(ctx, rects.next, "›", this);
        };

        widget.onPointerDown = function(pointer) {
            const down = pointer?.eDown;
            if (down?.button != null && down.button !== 0) return true;

            const localX = Number(down?.canvasX) - Number(node.pos?.[0] ?? 0);
            const width = Number(node.size?.[0] ?? 320);
            const direction = Number.isFinite(localX) && localX < width / 2 ? -1 : 1;
            pointer.onClick = () => { void node.__cigPreviewNavigate(direction); };
            return true;
        };
    }

    widget.hidden = false;
    widget.serialize = false;

    // StableUnifiedNode has already finished its cold-start layout pass here.
    // Move only this registered widget directly under the image preview without
    // touching the preview renderer or the existing Output/START row.
    const currentIndex = node.widgets.indexOf(widget);
    const previewIndex = node.widgets.indexOf(preview);
    if (currentIndex >= 0 && previewIndex >= 0 && currentIndex !== previewIndex + 1) {
        rawSplice(node.widgets, currentIndex, 1);
        const freshPreviewIndex = node.widgets.indexOf(preview);
        rawSplice(node.widgets, freshPreviewIndex + 1, 0, widget);
    }

    node.__cigPreviewNavDedicatedInstalled = true;
    node.graph?.setDirtyCanvas?.(true, true);
    node.setDirtyCanvas?.(true, true);
    return true;
}

function install(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;
    if (node.__cigPreviewNavDedicatedInstalled || node.__cigPreviewNavDedicatedPending) return;

    node.__cigPreviewNavDedicatedPending = true;
    const started = performance.now();
    const retry = () => {
        if (installRow(node)) {
            node.__cigPreviewNavDedicatedPending = false;
            return;
        }
        if (!node.graph || performance.now() - started >= 15000) {
            node.__cigPreviewNavDedicatedPending = false;
            return;
        }
        setTimeout(retry, 100);
    };
    retry();
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
