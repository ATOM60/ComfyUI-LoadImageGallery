import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.PreviewNavStableRow";
const NODE_CLASS = "LoadImageGallery";
const OUTPUT_BUTTON = "Галерея output";
const LANG = String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
const OUTPUT_LABEL = LANG === "ru" ? "▦  Галерея output" : "▦  Output Gallery";
const START_LABEL = LANG === "ru" ? "▶  СТАРТ" : "▶  START";

function geometry(node, button, options = null) {
    const width = Number(options?.width ?? node.size?.[0] ?? 320);
    const h = Number(button?.computedHeight ?? 64);
    const y = Number(button?.y ?? 0);
    const outer = 8;
    const gap = 6;
    const arrow = 44;
    const inner = Math.max(80, width - outer * 2 - gap * 3 - arrow * 2);
    const main = inner / 2;
    const prev = { x:outer, y, w:arrow, h };
    const output = { x:prev.x + prev.w + gap, y, w:main, h };
    const start = { x:output.x + output.w + gap, y, w:main, h };
    const next = { x:start.x + start.w + gap, y, w:arrow, h };
    return { prev, output, start, next };
}

function contains(x, rect) {
    return Number.isFinite(x) && x >= rect.x && x <= rect.x + rect.w;
}

function patchRow(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return false;
    if (!node.__cigUnifiedLayoutLocked || typeof node.__cigPreviewNavigate !== "function") return false;

    const button = node.widgets?.find?.(w => w?.name === OUTPUT_BUTTON) || null;
    if (!button || !button.__cigRowOutputCallback || !button.__cigRowStartCallback) return false;
    if (button.__cigPreviewNavRowPatched) return true;

    const draw = function(ctx, options) {
        const rects = geometry(node, this, options);
        const startWidget = this.__cigRowStartWidget;

        const drawPart = (rect, label, sourceWidget, font) => {
            ctx.save();
            ctx.globalAlpha = sourceWidget?.computedDisabled ? .45 : 1;
            ctx.fillStyle = sourceWidget?.background_color ?? this.background_color;
            ctx.strokeStyle = sourceWidget?.outline_color ?? this.outline_color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 10);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = sourceWidget?.text_color ?? this.text_color;
            ctx.font = font;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
            ctx.restore();
        };

        drawPart(rects.prev, "‹", this, "700 30px Arial,sans-serif");
        drawPart(rects.output, OUTPUT_LABEL, this, "700 14px Arial,sans-serif");
        drawPart(rects.start, START_LABEL, startWidget, "700 14px Arial,sans-serif");
        drawPart(rects.next, "›", this, "700 30px Arial,sans-serif");
    };

    const pointerDown = function(pointer, nodeArg, canvas) {
        const down = pointer?.eDown;
        if (down?.button != null && down.button !== 0) return true;

        const localX = Number(down?.canvasX) - Number(node.pos?.[0] ?? 0);
        const rects = geometry(node, this);
        let action = "output";
        if (contains(localX, rects.prev)) action = "prev";
        else if (contains(localX, rects.next)) action = "next";
        else if (contains(localX, rects.start)) action = "start";

        pointer.onClick = upEvent => {
            try {
                if (action === "prev") {
                    void node.__cigPreviewNavigate(-1);
                    return;
                }
                if (action === "next") {
                    void node.__cigPreviewNavigate(1);
                    return;
                }
                const cb = action === "start" ? this.__cigRowStartCallback : this.__cigRowOutputCallback;
                const source = action === "start" ? this.__cigRowStartWidget : this;
                cb?.(source?.value, canvas, nodeArg ?? node, [localX, Number(down?.canvasY) - Number(node.pos?.[1] ?? 0)], upEvent ?? down);
            } catch (error) {
                console.error("[ImageGallery] stable row callback:", error);
            }
        };
        return true;
    };

    button.__cigRowDraw = draw;
    button.__cigRowPointerDown = pointerDown;
    if (button.__cigUnifiedLocks?.drawWidget) button.__cigUnifiedLocks.drawWidget.value = draw;
    else button.drawWidget = draw;
    if (button.__cigUnifiedLocks?.onPointerDown) button.__cigUnifiedLocks.onPointerDown.value = pointerDown;
    else button.onPointerDown = pointerDown;
    button.__cigPreviewNavRowPatched = true;
    node.graph?.setDirtyCanvas?.(true, true);
    return true;
}

function install(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;
    const started = performance.now();
    const retry = () => {
        if (patchRow(node)) return;
        if (!node.graph || performance.now() - started > 15000) return;
        setTimeout(retry, 120);
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
