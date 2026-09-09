import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.StableUnifiedNode";
const NODE_CLASS = "LoadImageGallery";
const OUTPUT_BUTTON = "Галерея output";
const START_BUTTON = "▶ СТАРТ";
const LEGACY_BUTTON = "🖼 Превью папки";
const LANG = String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
const OUTPUT_BUTTON_LABEL = LANG === "ru" ? "▦  Галерея output" : "▦  Output Gallery";
const START_BUTTON_LABEL = LANG === "ru" ? "▶  СТАРТ" : "▶  START";

function exactPreview(node) {
    return node?.widgets?.find(w => w?.name === "$$canvas-image-preview" || w?.type === "IMAGE_PREVIEW") || null;
}

function hideAux(w) {
    if (!w) return;
    w.hidden = true;
    w.computeSize = () => [0, -4];
    w.computeLayoutSize = () => ({ minHeight:0, maxHeight:0, minWidth:0, maxWidth:0 });
    // Do not overwrite drawWidget/onPointerDown here. Some stock widgets are used
    // internally by ComfyUI even while hidden.
}

function hideStartInRow(start) {
    if (!start) return;
    start.hidden = true;
    start.computeSize = () => [0, 0];
    start.computeLayoutSize = () => ({ minHeight:0, maxHeight:0, minWidth:0, maxWidth:0 });
}

function restoreOutputButton(node, button, start) {
    if (!button) return;

    button.hidden = false;
    button.serialize = false;
    button.computeSize = width => [width ?? node.size?.[0] ?? 320, 64];
    button.computeLayoutSize = () => ({ minHeight:64, maxHeight:64, minWidth:0 });

    // Keep the original callbacks intact and use the output widget as a single
    // 64 px row containing two equal visual buttons. This avoids changing the
    // proven preview widget or creating another layout widget.
    if (!button.__cigRowOutputCallback) button.__cigRowOutputCallback = button.callback;
    if (start && !button.__cigRowStartCallback) button.__cigRowStartCallback = start.callback;
    button.__cigRowStartWidget = start || button.__cigRowStartWidget || null;

    if (!button.__cigRowDraw) {
        button.__cigRowDraw = function(ctx, options) {
            const h = this.computedHeight ?? 64;
            const y = this.y ?? 0;
            const width = options?.width ?? node.size?.[0] ?? 320;
            const outer = 8;
            const gap = 8;
            const available = Math.max(2, width - outer * 2 - gap);
            const half = available / 2;
            const startWidget = this.__cigRowStartWidget;

            const drawHalf = (x, w, label, sourceWidget) => {
                ctx.save();
                ctx.globalAlpha = sourceWidget?.computedDisabled ? .45 : 1;
                ctx.fillStyle = sourceWidget?.background_color ?? this.background_color;
                ctx.strokeStyle = sourceWidget?.outline_color ?? this.outline_color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, 12);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = sourceWidget?.text_color ?? this.text_color;
                ctx.font = "700 16px Arial,sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(label, x + w / 2, y + h / 2);
                ctx.restore();
            };

            drawHalf(outer, half, OUTPUT_BUTTON_LABEL, this);
            drawHalf(outer + half + gap, half, START_BUTTON_LABEL, startWidget);
        };
    }
    button.drawWidget = button.__cigRowDraw;

    if (!button.__cigRowPointerDown) {
        button.__cigRowPointerDown = function(pointer, nodeArg, canvas) {
            const down = pointer?.eDown;
            if (down?.button != null && down.button !== 0) return true;

            const localX = Number(down?.canvasX) - Number(node.pos?.[0] ?? 0);
            const width = Number(node.size?.[0] ?? 320);
            const leftHalf = !Number.isFinite(localX) || localX < width / 2;

            pointer.onClick = upEvent => {
                const cb = leftHalf ? this.__cigRowOutputCallback : this.__cigRowStartCallback;
                const source = leftHalf ? this : this.__cigRowStartWidget;
                try {
                    cb?.(source?.value, canvas, nodeArg ?? node, [localX, Number(down?.canvasY) - Number(node.pos?.[1] ?? 0)], upEvent ?? down);
                } catch (error) {
                    console.error("[ImageGallery] button row callback:", error);
                }
            };
            return true;
        };
    }
    button.onPointerDown = button.__cigRowPointerDown;
}

function stabilize(node) {
    if (!node?.widgets || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return false;

    for (let i = node.widgets.length - 1; i >= 0; i--) {
        if (node.widgets[i]?.name === LEGACY_BUTTON) node.widgets.splice(i, 1);
    }

    // IMPORTANT: only the real ComfyUI preview widget is accepted here. Previous
    // versions used a broad canvasOnly test and could mistake another custom widget
    // for the preview, causing the real preview to flash and then disappear.
    const preview = exactPreview(node);
    if (!preview) return false;

    const output = node.widgets.find(w => w?.name === OUTPUT_BUTTON) || null;
    const start = node.widgets.find(w => w?.name === START_BUTTON) || null;

    // Never replace preview drawWidget, computeSize or onPointerDown. image_gallery.js
    // owns those methods and draws the image plus the previous/next arrows there.
    preview.hidden = false;
    restoreOutputButton(node, output, start);
    hideStartInRow(start);

    for (const w of node.widgets) {
        if (!w || w === preview || w === output || w === start) continue;
        hideAux(w);
    }

    const hidden = node.widgets.filter(w => w !== output && w !== preview && w !== start);
    const ordered = [];
    ordered.push(preview);
    if (output) ordered.push(output);
    if (start) ordered.push(start);
    ordered.push(...hidden);
    node.widgets.splice(0, node.widgets.length, ...ordered);

    node.graph?.setDirtyCanvas?.(true, true);
    node.setDirtyCanvas?.(true, true);
    return true;
}

app.registerExtension({
    name: EXT_NAME,
    async nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;

        const run = () => stabilize(node);
        queueMicrotask(run);
        requestAnimationFrame(run);

        // image_gallery.js and output_video_gallery.js install their widgets with
        // delayed callbacks during cold start. Keep the final layout stable while
        // those installers finish, then stop polling completely.
        const timer = setInterval(run, 120);
        setTimeout(() => {
            clearInterval(timer);
            run();
        }, 13000);

        const oldRemoved = node.onRemoved;
        node.onRemoved = function() {
            clearInterval(timer);
            return oldRemoved?.apply(this, arguments);
        };
    },
});
