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
    if (!w) return false;
    let changed = false;

    if (w.hidden !== true) {
        w.hidden = true;
        changed = true;
    }

    if (!w.__cigStableHiddenComputeSize) {
        w.__cigStableHiddenComputeSize = () => [0, -4];
        w.__cigStableHiddenComputeLayoutSize = () => ({ minHeight:0, maxHeight:0, minWidth:0, maxWidth:0 });
    }
    if (w.computeSize !== w.__cigStableHiddenComputeSize) {
        w.computeSize = w.__cigStableHiddenComputeSize;
        changed = true;
    }
    if (w.computeLayoutSize !== w.__cigStableHiddenComputeLayoutSize) {
        w.computeLayoutSize = w.__cigStableHiddenComputeLayoutSize;
        changed = true;
    }

    // Do not overwrite drawWidget/onPointerDown here. Some stock widgets are used
    // internally by ComfyUI even while hidden.
    return changed;
}

function restoreOutputButton(node, button) {
    if (!button) return false;
    let changed = false;

    if (!button.__cigStableOutputComputeSize) {
        button.__cigStableOutputComputeSize = width => [width ?? node.size?.[0] ?? 320, 64];
        button.__cigStableOutputComputeLayoutSize = () => ({ minHeight:64, maxHeight:64, minWidth:0 });
        button.__cigStableOutputDraw = function(ctx, options) {
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

    if (button.hidden !== false) {
        button.hidden = false;
        changed = true;
    }
    if (button.serialize !== false) {
        button.serialize = false;
        changed = true;
    }
    if (button.computeSize !== button.__cigStableOutputComputeSize) {
        button.computeSize = button.__cigStableOutputComputeSize;
        changed = true;
    }
    if (button.computeLayoutSize !== button.__cigStableOutputComputeLayoutSize) {
        button.computeLayoutSize = button.__cigStableOutputComputeLayoutSize;
        changed = true;
    }
    if (button.drawWidget !== button.__cigStableOutputDraw) {
        button.drawWidget = button.__cigStableOutputDraw;
        changed = true;
    }

    return changed;
}

function stabilize(node) {
    if (!node?.widgets || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return false;
    let changed = false;

    for (let i = node.widgets.length - 1; i >= 0; i--) {
        if (node.widgets[i]?.name === LEGACY_BUTTON) {
            node.widgets.splice(i, 1);
            changed = true;
        }
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
    if (preview.hidden !== false) {
        preview.hidden = false;
        changed = true;
    }
    if (restoreOutputButton(node, output)) changed = true;
    if (start && start.hidden !== false) {
        start.hidden = false;
        changed = true;
    }

    for (const w of node.widgets) {
        if (!w || w === preview || w === output || w === start) continue;
        if (hideAux(w)) changed = true;
    }

    const hidden = node.widgets.filter(w => w !== output && w !== preview && w !== start);
    const ordered = [];
    if (output) ordered.push(output);
    ordered.push(preview);
    if (start) ordered.push(start);
    ordered.push(...hidden);

    const orderChanged = ordered.length !== node.widgets.length || ordered.some((w, i) => node.widgets[i] !== w);
    if (orderChanged) {
        node.widgets.splice(0, node.widgets.length, ...ordered);
        changed = true;
    }

    // The cold-start guard still runs at the same cadence for compatibility, but
    // a stable node now becomes a no-op. Canvas redraws happen only when a widget
    // actually appears, changes visibility/methods, or needs reordering.
    if (changed) {
        node.graph?.setDirtyCanvas?.(true, true);
        node.setDirtyCanvas?.(true, true);
    }
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
        // those installers finish, then stop polling completely. The polling itself
        // is now cheap because stabilize() does not dirty the canvas when unchanged.
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
