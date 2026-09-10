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

    if (!button.__cigRowOutputCallback) {
        button.__cigRowOutputCallback = button.callback;
        changed = true;
    }
    if (start && !button.__cigRowStartCallback) {
        button.__cigRowStartCallback = start.callback;
        changed = true;
    }
    const rowStart = start || button.__cigRowStartWidget || null;
    if (button.__cigRowStartWidget !== rowStart) {
        button.__cigRowStartWidget = rowStart;
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

            drawHalf(outer, half, OUTPUT_BUTTON_LABEL, this);
            drawHalf(outer + half + gap, half, START_BUTTON_LABEL, startWidget);
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

function lockFixedProperty(object, key, value) {
    if (!object) return;
    if (!object.__cigUnifiedLocks) {
        try {
            Object.defineProperty(object, "__cigUnifiedLocks", {
                configurable:true,
                enumerable:false,
                writable:false,
                value:Object.create(null),
            });
        } catch (_) {
            object.__cigUnifiedLocks = Object.create(null);
        }
    }
    const locks = object.__cigUnifiedLocks;
    if (locks[key]) {
        locks[key].value = value;
        return;
    }
    const slot = { value };
    locks[key] = slot;
    try {
        Object.defineProperty(object, key, {
            configurable:true,
            enumerable:true,
            get() { return slot.value; },
            // Old cold-start installers are still allowed to run, but once the
            // unified row exists they may no longer hide or redraw these widgets.
            set(_) {},
        });
    } catch (_) {
        try { object[key] = value; } catch (_) {}
    }
}

function lockUnifiedButtonState(button, start) {
    if (!button || !start) return;

    lockFixedProperty(button, "hidden", false);
    lockFixedProperty(button, "serialize", false);
    lockFixedProperty(button, "computeSize", button.__cigRowComputeSize);
    lockFixedProperty(button, "computeLayoutSize", button.__cigRowComputeLayoutSize);
    lockFixedProperty(button, "drawWidget", button.__cigRowDraw);
    lockFixedProperty(button, "onPointerDown", button.__cigRowPointerDown);

    lockFixedProperty(start, "hidden", true);
    lockFixedProperty(start, "computeSize", start.__cigRowHiddenSize);
    lockFixedProperty(start, "computeLayoutSize", start.__cigRowHiddenLayoutSize);
}

function installMoveGuard(node, output, start) {
    const widgets = node?.widgets;
    if (!widgets || !output || !start) return;

    if (!widgets.__cigUnifiedProtected) {
        try {
            Object.defineProperty(widgets, "__cigUnifiedProtected", {
                configurable:true,
                enumerable:false,
                writable:true,
                value:new Set(),
            });
        } catch (_) {
            widgets.__cigUnifiedProtected = new Set();
        }
    }
    widgets.__cigUnifiedProtected.clear();
    widgets.__cigUnifiedProtected.add(output);
    widgets.__cigUnifiedProtected.add(start);

    if (widgets.__cigUnifiedSpliceGuard) return;
    const guardedSplice = function(startIndex, deleteCount, ...items) {
        const protectedWidgets = this.__cigUnifiedProtected;
        if (protectedWidgets instanceof Set) {
            const len = this.length;
            let index = Number(startIndex);
            if (!Number.isFinite(index)) index = 0;
            index = index < 0 ? Math.max(0, len + Math.trunc(index)) : Math.min(len, Math.trunc(index));

            // image_gallery.js / output_video_gallery.js repeatedly perform
            // remove+insert moves on cold start. Once the final row is locked,
            // suppress only moves of our two protected widgets. All other array
            // operations keep native behaviour.
            if (Number(deleteCount) === 1 && items.length === 0) {
                const target = this[index];
                if (protectedWidgets.has(target)) return [target];
            }
            if (Number(deleteCount) === 0 && items.length === 1) {
                const target = items[0];
                if (protectedWidgets.has(target) && this.includes(target)) return [];
            }
        }
        return Array.prototype.splice.call(this, startIndex, deleteCount, ...items);
    };

    try {
        Object.defineProperty(widgets, "splice", {
            configurable:true,
            enumerable:false,
            writable:true,
            value:guardedSplice,
        });
        Object.defineProperty(widgets, "__cigUnifiedSpliceGuard", {
            configurable:true,
            enumerable:false,
            writable:true,
            value:true,
        });
    } catch (_) {
        widgets.splice = guardedSplice;
        widgets.__cigUnifiedSpliceGuard = true;
    }
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
    if (!preview) return false;

    const output = node.widgets.find(w => w?.name === OUTPUT_BUTTON) || null;
    const start = node.widgets.find(w => w?.name === START_BUTTON) || null;

    if (preview.hidden !== false) {
        preview.hidden = false;
        changed = true;
    }
    changed = restoreOutputButton(node, output, start) || changed;
    changed = hideStartInRow(start) || changed;

    for (const w of node.widgets) {
        if (!w || w === preview || w === output || w === start) continue;
        changed = hideAux(w) || changed;
    }

    const hidden = node.widgets.filter(w => w !== output && w !== preview && w !== start);
    const ordered = [preview];
    if (output) ordered.push(output);
    if (start) ordered.push(start);
    ordered.push(...hidden);

    if (!sameOrder(node.widgets, ordered)) {
        rawSplice(node.widgets, 0, node.widgets.length, ...ordered);
        changed = true;
    }

    // The row is complete. Freeze only the properties/order that old delayed
    // installers used to fight over; the rest of the node remains untouched.
    if (output && start) {
        lockUnifiedButtonState(output, start);
        installMoveGuard(node, output, start);
        node.__cigUnifiedLayoutLocked = true;
    }

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

        let timer = null;
        let finishTimer = null;
        const run = () => {
            stabilize(node);
            if (node.__cigUnifiedLayoutLocked && timer) {
                clearInterval(timer);
                timer = null;
            }
        };

        queueMicrotask(run);
        requestAnimationFrame(run);

        // Poll only until preview + output + START have appeared. As soon as the
        // final unified row is locked, polling stops permanently.
        timer = setInterval(run, 120);
        finishTimer = setTimeout(() => {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            run();
        }, 13000);

        const oldRemoved = node.onRemoved;
        node.onRemoved = function() {
            if (timer) clearInterval(timer);
            if (finishTimer) clearTimeout(finishTimer);
            return oldRemoved?.apply(this, arguments);
        };
    },
});
