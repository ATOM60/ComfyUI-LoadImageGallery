import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.InputStackPointerFinal";
const NODE_CLASS = "LoadImageGallery";
const installed = new WeakSet();

const isTarget = node => node && (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS);

function hit(rect, x, y) {
    return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function install(node) {
    if (!isTarget(node) || installed.has(node)) return;
    installed.add(node);

    const own = Object.hasOwn(node, "onMouseDown");
    const previous = node.onMouseDown;

    const onMouseDown = function(event, pos, graphcanvas) {
        const rects = node.__cigStackControlRects;
        const stack = node.__cigStackController;
        const x = Array.isArray(pos) ? Number(pos[0]) : Number(pos?.x);
        const y = Array.isArray(pos) ? Number(pos[1]) : Number(pos?.y);

        if (rects && stack?.isRoot?.() && Number.isFinite(x) && Number.isFinite(y)) {
            let action = null;
            if (hit(rects.prev, x, y)) {
                action = (Number(stack.count?.()) || 1) > 1 ? () => stack.remove?.() : () => {};
            } else if (hit(rects.next, x, y)) {
                action = () => stack.add?.();
            }

            if (action) {
                const pointer = graphcanvas?.pointer || app.canvas?.pointer;
                if (pointer) {
                    pointer.onDragStart = undefined;
                    pointer.onDragEnd = undefined;
                    pointer.finally = undefined;
                    pointer.onClick = () => {
                        if (!node.graph) return;
                        action();
                        node.graph?.setDirtyCanvas?.(true, true);
                    };
                } else {
                    action();
                    node.graph?.setDirtyCanvas?.(true, true);
                }
                return true;
            }
        }
        return previous?.call(this, event, pos, graphcanvas) ?? false;
    };

    node.onMouseDown = onMouseDown;

    const oldRemoved = node.onRemoved;
    node.onRemoved = function(...args) {
        if (node.onMouseDown === onMouseDown) {
            if (own) node.onMouseDown = previous;
            else delete node.onMouseDown;
        }
        installed.delete(node);
        return oldRemoved?.apply(this, args);
    };
}

function installGraph() {
    for (const node of app.graph?._nodes || []) install(node);
}

app.registerExtension({
    name: EXT_NAME,
    nodeCreated: install,
    loadedGraphNode: install,
    afterConfigureGraph: installGraph,
});
