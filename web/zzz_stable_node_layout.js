import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.StableUnifiedNode";
const NODE_CLASS = "LoadImageGallery";
const OUTPUT_BUTTON = "Галерея output";
const START_BUTTON = "▶ СТАРТ";
const LEGACY_BUTTON = "🖼 Превью папки";
const CONTROL_ROW = "__cig_controls_row";
const LANG = String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
const OUTPUT_BUTTON_LABEL = LANG === "ru" ? "▦  Галерея output" : "▦  Output Gallery";
const START_BUTTON_LABEL = LANG === "ru" ? "▶  СТАРТ" : "▶  START";

function isTarget(node) {
    return !!node && (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS);
}

function exactPreview(node) {
    return node?.widgets?.find?.(w => w?.name === "$$canvas-image-preview" || w?.type === "IMAGE_PREVIEW") || null;
}

function setHidden(widget, hidden = true) {
    if (!widget) return false;
    let changed = false;
    if (widget.hidden !== hidden) {
        widget.hidden = hidden;
        changed = true;
    }
    if (hidden) {
        if (!widget.__cigHiddenSize) {
            widget.__cigHiddenSize = () => [0, 0];
            widget.__cigHiddenLayoutSize = () => ({ minHeight: 0, maxHeight: 0, minWidth: 0, maxWidth: 0 });
        }
        if (widget.computeSize !== widget.__cigHiddenSize) {
            widget.computeSize = widget.__cigHiddenSize;
            changed = true;
        }
        if (widget.computeLayoutSize !== widget.__cigHiddenLayoutSize) {
            widget.computeLayoutSize = widget.__cigHiddenLayoutSize;
            changed = true;
        }
    }
    return changed;
}

function restorePreview(preview) {
    if (!preview) return false;
    let changed = false;
    if (preview.hidden !== false) {
        preview.hidden = false;
        changed = true;
    }
    return changed;
}

function configureControlRow(node, row, output, start) {
    let changed = false;
    if (!row) return changed;

    if (row.serialize !== false) {
        row.serialize = false;
        changed = true;
    }
    if (row.hidden !== false) {
        row.hidden = false;
        changed = true;
    }
    if (row.__cigOutputWidget !== output) {
        row.__cigOutputWidget = output;
        changed = true;
    }
    if (row.__cigStartWidget !== start) {
        row.__cigStartWidget = start;
        changed = true;
    }

    if (!row.__cigRowComputeSize) {
        row.__cigRowComputeSize = width => [width ?? node.size?.[0] ?? 320, 64];
        row.__cigRowComputeLayoutSize = () => ({ minHeight: 64, maxHeight: 64, minWidth: 0 });
    }
    if (row.computeSize !== row.__cigRowComputeSize) {
        row.computeSize = row.__cigRowComputeSize;
        changed = true;
    }
    if (row.computeLayoutSize !== row.__cigRowComputeLayoutSize) {
        row.computeLayoutSize = row.__cigRowComputeLayoutSize;
        changed = true;
    }

    if (!row.__cigRowDraw) {
        row.__cigRowDraw = function(ctx, options) {
            const h = this.computedHeight ?? 64;
            const y = this.y ?? 0;
            const width = options?.width ?? node.size?.[0] ?? 320;
            const outer = 8;
            const gap = 8;
            const available = Math.max(2, width - outer * 2 - gap);
            const half = available / 2;
            const outputWidget = this.__cigOutputWidget;
            const startWidget = this.__cigStartWidget;

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

            if (outputWidget && startWidget) {
                drawHalf(outer, half, OUTPUT_BUTTON_LABEL, outputWidget);
                drawHalf(outer + half + gap, half, START_BUTTON_LABEL, startWidget);
            } else if (outputWidget) {
                drawHalf(outer, width - outer * 2, OUTPUT_BUTTON_LABEL, outputWidget);
            } else if (startWidget) {
                drawHalf(outer, width - outer * 2, START_BUTTON_LABEL, startWidget);
            }
        };
        changed = true;
    }
    if (row.drawWidget !== row.__cigRowDraw) {
        row.drawWidget = row.__cigRowDraw;
        changed = true;
    }

    if (!row.__cigRowPointerDown) {
        row.__cigRowPointerDown = function(pointer, nodeArg, canvas) {
            const down = pointer?.eDown;
            if (down?.button != null && down.button !== 0) return true;

            const localX = Number(down?.canvasX) - Number(node.pos?.[0] ?? 0);
            const width = Number(node.size?.[0] ?? 320);
            const outputWidget = this.__cigOutputWidget;
            const startWidget = this.__cigStartWidget;
            let source = outputWidget || startWidget;
            if (outputWidget && startWidget && Number.isFinite(localX)) {
                source = localX < width / 2 ? outputWidget : startWidget;
            }

            pointer.onClick = upEvent => {
                if (!source || source.computedDisabled) return;
                try {
                    source.callback?.(
                        source.value,
                        canvas,
                        nodeArg ?? node,
                        [localX, Number(down?.canvasY) - Number(node.pos?.[1] ?? 0)],
                        upEvent ?? down,
                    );
                } catch (error) {
                    console.error("[ImageGallery] control row callback:", error);
                }
            };
            return true;
        };
        changed = true;
    }
    if (row.onPointerDown !== row.__cigRowPointerDown) {
        row.onPointerDown = row.__cigRowPointerDown;
        changed = true;
    }

    return changed;
}

function ensureControlRow(node, preview, output, start) {
    if (!preview || (!output && !start) || app.configuringGraph) return null;
    let row = node.widgets?.find?.(w => w?.name === CONTROL_ROW) || null;
    if (!row) {
        try {
            row = node.addWidget("button", CONTROL_ROW, null, () => {}, { serialize: false });
            if (row) row.serialize = false;
        } catch (error) {
            console.warn("[ImageGallery] unable to create control row:", error);
            return null;
        }
    }
    configureControlRow(node, row, output, start);
    return row;
}

function stabilize(node) {
    if (!isTarget(node) || !Array.isArray(node.widgets)) return false;
    let changed = false;

    const preview = exactPreview(node);
    const output = node.widgets.find(w => w?.name === OUTPUT_BUTTON) || null;
    const start = node.widgets.find(w => w?.name === START_BUTTON) || null;
    let row = node.widgets.find(w => w?.name === CONTROL_ROW) || null;

    changed = restorePreview(preview) || changed;

    // Keep ComfyUI's real widget order intact. In particular, never splice/reorder
    // the image widget: ComfyUI 0.38+ serialises/restores widgets through its own
    // widget store and multiple LoadImageGallery instances must retain independent
    // image values. The original action buttons stay registered but take no space.
    changed = setHidden(output, true) || changed;
    changed = setHidden(start, true) || changed;

    for (const widget of node.widgets) {
        if (!widget || widget === preview || widget === output || widget === start || widget === row) continue;
        if (widget.name === LEGACY_BUTTON) {
            changed = setHidden(widget, true) || changed;
            continue;
        }
        changed = setHidden(widget, true) || changed;
    }

    if (preview) {
        row = ensureControlRow(node, preview, output, start) || row;
        if (row) {
            changed = configureControlRow(node, row, output, start) || changed;
            if (row.hidden !== false) {
                row.hidden = false;
                changed = true;
            }
        }
    } else if (row) {
        changed = setHidden(row, true) || changed;
    }

    if (changed) {
        node.graph?.setDirtyCanvas?.(true, true);
        node.setDirtyCanvas?.(true, true);
    }
    return true;
}

function installLayout(node) {
    if (!isTarget(node)) return null;
    if (node.__cigNodeLayout) return node.__cigNodeLayout;

    let disposed = false;
    let running = false;
    let frame = 0;
    const hooks = [];

    const refresh = () => {
        if (disposed || running || app.configuringGraph) return;
        running = true;
        try { stabilize(node); } finally { running = false; }
    };

    const scheduleRefresh = () => {
        if (disposed || frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            refresh();
        });
    };

    const hook = name => {
        const own = Object.hasOwn(node, name);
        const original = node[name];
        const wrapped = function(...args) {
            const result = original?.apply(this, args);
            scheduleRefresh();
            return result;
        };
        node[name] = wrapped;
        hooks.push([name, original, wrapped, own]);
    };

    hook("onConfigure");
    hook("onExecuted");

    const oldRemoved = node.onRemoved;
    const ownRemoved = Object.hasOwn(node, "onRemoved");
    const removed = function(...args) {
        disposed = true;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        for (const [name, original, wrapped, own] of hooks) {
            if (node[name] !== wrapped) continue;
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

    const controller = { refresh, scheduleRefresh };
    node.__cigNodeLayout = controller;
    return controller;
}

function initializeAfterCurrentRestore(node) {
    installLayout(node)?.scheduleRefresh();
}

app.registerExtension({
    name: EXT_NAME,
    nodeCreated(node) { initializeAfterCurrentRestore(node); },
    loadedGraphNode(node) { initializeAfterCurrentRestore(node); },
});
