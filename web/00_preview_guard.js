import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.PreviewGuard";
const NODE_CLASS = "LoadImageGallery";
const OUTPUT_BUTTON = "Галерея output";
const START_BUTTON = "▶ СТАРТ";
const LEGACY_BUTTON = "🖼 Превью папки";

function isExactPreview(w) {
    return !!w && (w.name === "$$canvas-image-preview" || w.type === "IMAGE_PREVIEW");
}

function isNoop(fn) {
    if (typeof fn !== "function") return false;
    const s = String(fn).replace(/\s+/g, "");
    return s === "()=>{}" || s === "function(){}" || s === "function(){};";
}

function isZeroSize(fn) {
    if (typeof fn !== "function") return false;
    const s = String(fn).replace(/\s+/g, "");
    return s.includes("[0,-4]") || (s.includes("minHeight:0") && s.includes("maxHeight:0"));
}

function capturePreview(node) {
    if (!node?.widgets || node.__cigPreviewGuardSnapshot) return node.__cigPreviewGuardSnapshot?.widget || null;
    const preview = node.widgets.find(isExactPreview);
    if (!preview) return null;
    node.__cigPreviewGuardSnapshot = {
        widget: preview,
        drawWidget: preview.drawWidget,
        computeSize: preview.computeSize,
        computeLayoutSize: preview.computeLayoutSize,
        onPointerDown: preview.onPointerDown,
    };
    return preview;
}

function hideAuxWidget(w) {
    if (!w) return;
    w.hidden = true;
    w.computeSize = () => [0, -4];
    w.computeLayoutSize = () => ({ minHeight:0, maxHeight:0, minWidth:0, maxWidth:0 });
}

function repair(node) {
    if (!node?.widgets || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;

    for (let i = node.widgets.length - 1; i >= 0; i--) {
        if (node.widgets[i]?.name === LEGACY_BUTTON) node.widgets.splice(i, 1);
    }

    const snap = node.__cigPreviewGuardSnapshot;
    const preview = snap?.widget?.isConnected !== false && node.widgets.includes(snap?.widget)
        ? snap.widget
        : (node.widgets.find(isExactPreview) || capturePreview(node));
    if (!preview) return;

    const output = node.widgets.find(w => w?.name === OUTPUT_BUTTON) || null;
    const start = node.widgets.find(w => w?.name === START_BUTTON) || null;

    preview.hidden = false;
    if (snap) {
        if (isNoop(preview.drawWidget) && typeof snap.drawWidget === "function") preview.drawWidget = snap.drawWidget;
        if (isZeroSize(preview.computeSize) && typeof snap.computeSize === "function") preview.computeSize = snap.computeSize;
        if (isZeroSize(preview.computeLayoutSize) && typeof snap.computeLayoutSize === "function") preview.computeLayoutSize = snap.computeLayoutSize;
        if (typeof preview.onPointerDown !== "function" && typeof snap.onPointerDown === "function") preview.onPointerDown = snap.onPointerDown;
    }

    if (output) output.hidden = false;
    if (start) start.hidden = false;

    // Only the two large buttons and the real image preview are visible.
    // Keep all stock LoadImage widgets alive internally so image loading and MASK stay intact.
    for (const w of node.widgets) {
        if (!w || w === preview || w === output || w === start) continue;
        hideAuxWidget(w);
    }

    const hidden = node.widgets.filter(w => w !== output && w !== preview && w !== start);
    const ordered = [];
    if (output) ordered.push(output);
    ordered.push(preview);
    if (start) ordered.push(start);
    ordered.push(...hidden);
    node.widgets.splice(0, node.widgets.length, ...ordered);

    // Old workflow versions may have saved the node at a huge height after the preview was hidden.
    // Shrink only obviously oversized nodes; normal user resizing remains untouched.
    try {
        const computed = node.computeSize?.();
        const currentW = Number(node.size?.[0] || computed?.[0] || 320);
        const currentH = Number(node.size?.[1] || 0);
        const naturalH = Math.max(440, Number(computed?.[1] || 0));
        if (currentH > naturalH + 260) node.setSize?.([currentW, naturalH]);
    } catch (_) {}

    node.graph?.setDirtyCanvas?.(true, true);
    node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: EXT_NAME,

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;
        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            const result = originalCreated?.apply(this, arguments);
            capturePreview(this);
            return result;
        };
    },

    async nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;
        capturePreview(node);
        const run = () => { capturePreview(node); repair(node); };
        queueMicrotask(run);
        requestAnimationFrame(run);
        for (const ms of [100, 400, 1300, 2500, 5500, 10500, 12500]) setTimeout(run, ms);
    },
});
