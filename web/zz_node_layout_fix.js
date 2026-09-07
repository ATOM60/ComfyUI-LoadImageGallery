import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.UnifiedNodeLayout";
const NODE_CLASS = "LoadImageGallery";
const LEGACY_BUTTON = "🖼 Превью папки";
const OUTPUT_BUTTON = "Галерея output";
const START_BUTTON = "▶ СТАРТ";

function isPreviewWidget(w) {
    return !!w && (
        w.name === "$$canvas-image-preview" ||
        w.type === "IMAGE_PREVIEW" ||
        (w.options?.canvasOnly === true && typeof w.drawWidget === "function" && w.name !== OUTPUT_BUTTON && w.name !== START_BUTTON)
    );
}

function hideWidget(w) {
    if (!w) return;
    w.hidden = true;
    w.computeSize = () => [0, -4];
    w.computeLayoutSize = () => ({ minHeight:0, maxHeight:0, minWidth:0, maxWidth:0 });
    w.drawWidget = () => {};
}

function restoreOutputButton(node, button) {
    if (!button) return;
    button.hidden = false;
    button.serialize = false;
    button.computeSize = (width) => [width ?? node.size?.[0] ?? 320, 64];
    button.computeLayoutSize = () => ({ minHeight:64, maxHeight:64, minWidth:0 });
    button.drawWidget = function(ctx, options) {
        const h=this.computedHeight ?? 64;
        const y=this.y ?? 0;
        const width=options?.width ?? node.size?.[0] ?? 320;
        const m=8;
        ctx.save();
        ctx.globalAlpha=this.computedDisabled ? .45 : 1;
        ctx.fillStyle=this.clicked ? this.outline_color : this.background_color;
        ctx.strokeStyle=this.outline_color;
        ctx.lineWidth=1.5;
        ctx.beginPath();
        ctx.roundRect(m,y,width-m*2,h,12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle=this.text_color;
        ctx.font="700 20px Arial,sans-serif";
        ctx.textAlign="center";
        ctx.textBaseline="middle";
        ctx.fillText("▦  Галерея output",width/2,y+h/2);
        ctx.restore();
    };
}

function applyUnifiedLayout(node) {
    if (!node?.widgets || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;

    // Remove the old small "Preview folder" button completely. The input gallery
    // is opened by clicking the image preview, so this button is redundant.
    for (let i=node.widgets.length-1; i>=0; i--) {
        if (node.widgets[i]?.name === LEGACY_BUTTON) node.widgets.splice(i,1);
    }

    const preview = node.widgets.find(isPreviewWidget) || null;
    const output = node.widgets.find(w => w?.name === OUTPUT_BUTTON) || null;
    const start = node.widgets.find(w => w?.name === START_BUTTON) || null;

    restoreOutputButton(node, output);
    if (preview) preview.hidden = false;
    if (start) start.hidden = false;

    // Keep the real image selector and the stock upload widget alive internally,
    // but make them take no space. This preserves the stock LoadImage preview and
    // IMAGE/MASK behavior while removing the visible file-upload controls.
    for (const w of node.widgets) {
        if (!w || w === preview || w === output || w === start) continue;
        hideWidget(w);
    }

    // Visible order must always be:
    // Output Gallery -> image preview -> START.
    if (output || preview || start) {
        const keep = new Set([output,preview,start].filter(Boolean));
        const hidden = node.widgets.filter(w => !keep.has(w));
        const ordered = [];
        if (output) ordered.push(output);
        ordered.push(...hidden);
        if (preview) ordered.push(preview);
        if (start) ordered.push(start);
        node.widgets.splice(0,node.widgets.length,...ordered);
    }

    node.graph?.setDirtyCanvas?.(true,true);
    node.setDirtyCanvas?.(true,true);
}

app.registerExtension({
    name: EXT_NAME,
    async nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;

        const run = () => applyUnifiedLayout(node);
        run();
        requestAnimationFrame(run);
        // Other ComfyUI and extension widgets are created asynchronously. Run
        // slightly after their own delayed installers so the final state is stable.
        for (const ms of [75, 300, 1100, 2200, 5200, 10200, 12000]) setTimeout(run, ms);
    },
});
