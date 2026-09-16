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

function rawSplice(array, ...args) {
    return Array.prototype.splice.call(array, ...args);
}

function hideAux(w) {
    if (!w) return false;
    let changed = false;
    if (w.hidden !== true) {
        w.hidden = true;
        changed = true;
    }
    if (!w.__cigHiddenSize) {
        w.__cigHiddenSize = () => [0, -4];
        w.__cigHiddenLayoutSize = () => ({ minHeight:0, maxHeight:0, minWidth:0, maxWidth:0 });
    }
    if (w.computeSize !== w.__cigHiddenSize) {
        w.computeSize = w.__cigHiddenSize;
        changed = true;
    }
    if (w.computeLayoutSize !== w.__cigHiddenLayoutSize) {
        w.computeLayoutSize = w.__cigHiddenLayoutSize;
        changed = true;
    }
    return changed;
}

function hideStartInRow(start) {
    if (!start) return false;
    let changed = false;
    if (start.hidden !== true) {
        start.hidden = true;
        changed = true;
    }
    if (!start.__cigRowHiddenSize) {
        start.__cigRowHiddenSize = () => [0, 0];
        start.__cigRowHiddenLayoutSize = () => ({ minHeight:0, maxHeight:0, minWidth:0, maxWidth:0 });
    }
    if (start.computeSize !== start.__cigRowHiddenSize) {
        start.computeSize = start.__cigRowHiddenSize;
        changed = true;
    }
    if (start.computeLayoutSize !== start.__cigRowHiddenLayoutSize) {
        start.computeLayoutSize = start.__cigRowHiddenLayoutSize;
        changed = true;
    }
    return changed;
}

function restoreOutputButton(node, button, start) {
    if (!button) return false;
    let changed = false;

    if (button.hidden !== false) {
        button.hidden = false;
        changed = true;
    }
    if (button.serialize !== false) {
        button.serialize = false;
        changed = true;
    }
    if (!button.__cigRowComputeSize) {
        button.__cigRowComputeSize = width => [width ?? node.size?.[0] ?? 320, 64];
        button.__cigRowComputeLayoutSize = () => ({ minHeight:64, maxHeight:64, minWidth:0 });
    }
    if (button.computeSize !== button.__cigRowComputeSize) {
        button.computeSize = button.__cigRowComputeSize;
        changed = true;
    }
    if (button.computeLayoutSize !== button.__cigRowComputeLayoutSize) {
        button.computeLayoutSize = button.__cigRowComputeLayoutSize;
        changed = true;
    }

    if (button.__cigRowStartWidget !== start) {
        button.__cigRowStartWidget = start;
        changed = true;
    }

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

            drawHalf(outer, startWidget ? half : width - outer * 2, OUTPUT_BUTTON_LABEL, this);
            if (startWidget) drawHalf(outer + half + gap, half, START_BUTTON_LABEL, startWidget);
        };
        changed = true;
    }
    if (button.drawWidget !== button.__cigRowDraw) {
        button.drawWidget = button.__cigRowDraw;
        changed = true;
    }

    if (!button.__cigRowPointerDown) {
        button.__cigRowPointerDown = function(pointer, nodeArg, canvas) {
            const down = pointer?.eDown;
            if (down?.button != null && down.button !== 0) return true;

            const localX = Number(down?.canvasX) - Number(node.pos?.[0] ?? 0);
            const width = Number(node.size?.[0] ?? 320);
            const leftHalf = !this.__cigRowStartWidget || !Number.isFinite(localX) || localX < width / 2;

            pointer.onClick = upEvent => {
                const source = leftHalf ? this : this.__cigRowStartWidget;
                if (source?.computedDisabled) return;
                const cb = source?.callback;
                try {
                    cb?.(source?.value, canvas, nodeArg ?? node, [localX, Number(down?.canvasY) - Number(node.pos?.[1] ?? 0)], upEvent ?? down);
                } catch (error) {
                    console.error("[ImageGallery] button row callback:", error);
                }
            };
            return true;
        };
        changed = true;
    }
    if (button.onPointerDown !== button.__cigRowPointerDown) {
        button.onPointerDown = button.__cigRowPointerDown;
        changed = true;
    }
    return changed;
}

function sameOrder(a, b) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
}

function stabilize(node) {
    if (!node?.widgets || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return false;
    let changed = false;

    for (let i = node.widgets.length - 1; i >= 0; i--) {
        if (node.widgets[i]?.name === LEGACY_BUTTON) {
            rawSplice(node.widgets, i, 1);
            changed = true;
        }
    }

    const preview = exactPreview(node);

    const output = node.widgets.find(w => w?.name === OUTPUT_BUTTON) || null;
    const start = node.widgets.find(w => w?.name === START_BUTTON) || null;

    if (preview && preview.hidden !== false) {
        preview.hidden = false;
        changed = true;
    }
    changed = restoreOutputButton(node, output, start) || changed;
    if (output) changed = hideStartInRow(start) || changed;

    for (const w of node.widgets) {
        if (!w || w === preview || w === output || w === start) continue;
        changed = hideAux(w) || changed;
    }

    const hidden = node.widgets.filter(w => w !== output && w !== preview && w !== start);
    const ordered = preview ? [preview] : [];
    if (output) ordered.push(output);
    if (start) ordered.push(start);
    ordered.push(...hidden);

    if (!sameOrder(node.widgets, ordered)) {
        rawSplice(node.widgets, 0, node.widgets.length, ...ordered);
        changed = true;
    }

    if (changed) {
        node.graph?.setDirtyCanvas?.(true, true);
        node.setDirtyCanvas?.(true, true);
    }
    return true;
}

function installLayout(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return null;
    if (node.__cigNodeLayout) return node.__cigNodeLayout;
    let disposed = false;
    let running = false;
    const hooks = [];
    const refresh = () => {
        if (disposed || running) return;
        running = true;
        try { stabilize(node); } finally { running = false; }
    };
    for (const name of ["addWidget", "addCustomWidget", "onConfigure", "onExecuted"]) {
        const own = Object.hasOwn(node, name);
        const original = node[name];
        const wrapped = function(...args) {
            const result = original?.apply(this, args);
            refresh();
            return result;
        };
        node[name] = wrapped;
        hooks.push([name, original, wrapped, own]);
    }
    const oldRemoved = node.onRemoved;
    const ownRemoved = Object.hasOwn(node, "onRemoved");
    const removed = function(...args) {
        disposed = true;
        for (const [name, original, wrapped, own] of hooks) if (node[name] === wrapped) {
            if (own) node[name] = original;
            else delete node[name];
        }
        if (node.onRemoved === removed) {
            if (ownRemoved) node.onRemoved = oldRemoved;
            else delete node.onRemoved;
        }
        delete node.__cigNodeLayout;
        return oldRemoved?.apply(this, args);
    };
    node.onRemoved = removed;
    const controller = { refresh };
    node.__cigNodeLayout = controller;
    // A single owner sets the row layout whenever widgets are added/restored.
    // No polling, delayed hiding, property locks or patched array methods.
    refresh();
    return controller;
}

app.registerExtension({
    name: EXT_NAME,
    nodeCreated(node) { installLayout(node)?.refresh(); },
    loadedGraphNode(node) { installLayout(node)?.refresh(); },
});
