// Keep the existing geometry: LiteGraph adds 4px to a 64px fixed widget.
export const CONTROL_ROW_HEIGHT = 68;
const OUTPUT = "Галерея output";
const START = "▶ СТАРТ";

export function createGalleryControls(node) {
    const ru = String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en").toLowerCase().startsWith("ru");
    const labels = [ru ? "▦  Галерея output" : "▦  Output Gallery", ru ? "▶  СТАРТ" : "▶  START"];
    let output = null, start = null;
    return {
        get height() { return output || start ? CONTROL_ROW_HEIGHT : 0; },
        update(widgets) {
            const nextOutput = widgets.find(w => w?.name === OUTPUT) || null;
            const nextStart = widgets.find(w => w?.name === START) || null;
            const changed = nextOutput !== output || nextStart !== start;
            output = nextOutput; start = nextStart;
            return changed;
        },
        draw(ctx, width, y) {
            const outer = 8, gap = 8;
            const half = Math.max(2, width - outer * 2 - gap) / 2;
            const drawButton = (widget, label, x, w) => {
                ctx.save();
                ctx.globalAlpha = widget.computedDisabled ? .45 : 1;
                ctx.fillStyle = widget.background_color;
                ctx.strokeStyle = widget.outline_color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.roundRect(x, y, w, CONTROL_ROW_HEIGHT, 12);
                ctx.fill(); ctx.stroke();
                ctx.fillStyle = widget.text_color;
                ctx.font = "700 16px Arial,sans-serif";
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(label, x + w / 2, y + CONTROL_ROW_HEIGHT / 2);
                ctx.restore();
            };
            if (output && start) {
                drawButton(output, labels[0], outer, half);
                drawButton(start, labels[1], outer + half + gap, half);
            } else if (output || start) {
                drawButton(output || start, labels[output ? 0 : 1], outer, width - outer * 2);
            }
        },
        pointerDown(pointer, canvas, top, width) {
            const event = pointer?.eDown;
            if (!event || (event.button != null && event.button !== 0)) return false;
            const mouse = Number.isFinite(event.canvasX) && Number.isFinite(event.canvasY)
                ? [event.canvasX, event.canvasY] : canvas?.graph_mouse;
            if (!mouse) return false;
            const x = mouse[0] - (node.pos?.[0] ?? 0), y = mouse[1] - (node.pos?.[1] ?? 0);
            if (x < 0 || x > width || y < top || y > top + this.height) return false;
            const source = output && start ? (x < width / 2 ? output : start) : output || start;
            if (!source) return false;
            pointer.onDragStart = undefined; pointer.onDragEnd = undefined; pointer.finally = undefined;
            pointer.onClick = upEvent => {
                if (!node.graph || source.computedDisabled) return;
                try { source.callback?.(source.value, canvas, node, [x, y], upEvent ?? event); }
                catch (error) { console.error("[ImageGallery] control row callback:", error); }
            };
            return true;
        },
    };
}
