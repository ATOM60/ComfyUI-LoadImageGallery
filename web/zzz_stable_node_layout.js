import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.StableUnifiedNode";
const NODE_CLASS = "LoadImageGallery";
const OUTPUT_BUTTON = "Галерея output";
const START_BUTTON = "▶ СТАРТ";
const LEGACY_BUTTON = "🖼 Превью папки";
const LANG = String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
const OUTPUT_BUTTON_LABEL = LANG === "ru" ? "▦  Галерея output" : "▦  Output Gallery";

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

function restoreOutputButton(node, button) {
    if (!button) return;
    button.hidden = false;
    button.serialize = false;
    button.computeSize = width => [width ?? node.size?.[0] ?? 320, 64];
    button.computeLayoutSize = () => ({ minHeight:64, maxHeight:64, minWidth:0 });
    button.drawWidget = function(ctx, options) {
        const h = this.computedHeight ?? 64;
        const y = this.y ?? 0;
        const width = options?.width ?? node.size?.[0] ?? 320;
        const m = 8;
        ctx.save();
        ctx.globalAlpha = this.computedDisabled ? .45 : 1;
        ctx.fillStyle = this.clicked ? this.outline_color : this.background_color;
        ctx.strokeStyle = this.outline_color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(m, y, width - m * 2, h, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = this.text_color;
        ctx.font = "700 20px Arial,sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(OUTPUT_BUTTON_LABEL, width / 2, y + h / 2);
        ctx.restore();
    };
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
    restoreOutputButton(node, output);
    if (start) start.hidden = false;

    for (const w of node.widgets) {
        if (!w || w === preview || w === output || w === start) continue;
        hideAux(w);
    }

    const hidden = node.widgets.filter(w => w !== output && w !== preview && w !== start);
    const ordered = [];
    if (output) ordered.push(output);
    ordered.push(preview);
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
