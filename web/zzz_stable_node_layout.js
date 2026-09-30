import { app } from "/scripts/app.js";
import { createGalleryControls } from "./node_controls.js";

const NODE_CLASS = "LoadImageGallery";
const controllers = new WeakMap();
const canvases = new WeakSet();
const hiddenSize = () => [0, 0];
const hiddenLayoutSize = () => ({ minHeight: 0, maxHeight: 0, minWidth: 0, maxWidth: 0 });
const isTarget = node => node && (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS);
const isPreview = widget => widget?.name === "$$canvas-image-preview" || widget?.type === "IMAGE_PREVIEW";

function installLayout(node) {
    if (!isTarget(node)) return null;
    if (controllers.has(node)) return controllers.get(node);

    const controls = createGalleryControls(node);
    const widgets = new Map();
    const hooks = [];
    let preview = null, frame = 0, disposed = false, running = false;

    // Preserve widget identities, registration order and values. The preview owns
    // its footer, so removing/recreating it cannot leave buttons above the image.
    function remember(widget) {
        let state = widgets.get(widget);
        if (!state) {
            state = { hidden: widget.hidden, size: widget.computeSize, layout: widget.computeLayoutSize };
            if (isPreview(widget)) {
                if (state.size) state.previewSize = function(...args) {
                    const [width, height] = state.size.apply(this, args);
                    return [width, height + controls.height];
                };
                state.previewLayout = function(...args) {
                    const size = state.layout?.apply(this, args) || { minHeight: 220, minWidth: 1 };
                    return { ...size, minHeight: size.minHeight + controls.height,
                        ...(Number.isFinite(size.maxHeight) ? { maxHeight: size.maxHeight + controls.height } : {}) };
                };
            }
            widgets.set(widget, state);
        }
        return state;
    }

    function restore(widget, state) {
        if (widget.computeSize === hiddenSize || widget.computeSize === state.previewSize) widget.computeSize = state.size;
        if (widget.computeLayoutSize === hiddenLayoutSize || widget.computeLayoutSize === state.previewLayout) widget.computeLayoutSize = state.layout;
        widget.hidden = state.hidden;
        widgets.delete(widget);
    }

    function refresh() {
        if (disposed || running || app.configuringGraph || !Array.isArray(node.widgets)) return;
        running = true;
        try {
            const current = node.widgets;
            let changed = controls.update(current);
            preview = current.find(isPreview) || null;
            for (const [widget, state] of widgets) if (!current.includes(widget)) restore(widget, state);
            for (const widget of current) {
                if (!widget) continue;
                const state = remember(widget);
                const visible = widget === preview;
                const size = visible ? state.previewSize : hiddenSize;
                const layout = visible ? state.previewLayout : hiddenLayoutSize;
                if (widget.hidden !== !visible) { widget.hidden = !visible; changed = true; }
                if (widget.computeSize !== size) { widget.computeSize = size; changed = true; }
                if (widget.computeLayoutSize !== layout) { widget.computeLayoutSize = layout; changed = true; }
            }
            node.__cigPreviewNavigation?.refresh();
            if (changed) node.graph?.setDirtyCanvas?.(true, true);
        } finally { running = false; }
    }

    function scheduleRefresh() {
        if (disposed || frame) return;
        frame = requestAnimationFrame(() => { frame = 0; refresh(); });
    }

    function hook(name) {
        const own = Object.hasOwn(node, name), original = node[name];
        const wrapped = function(...args) {
            const result = original?.apply(this, args);
            // Never change widgets while ComfyUI is registering a concrete widget.
            scheduleRefresh();
            return result;
        };
        node[name] = wrapped;
        hooks.push({ name, original, wrapped, own });
    }
    for (const name of ["addCustomWidget", "onConfigure", "onExecuted", "onAdded"]) hook(name);

    const oldRemoved = node.onRemoved, ownRemoved = Object.hasOwn(node, "onRemoved");
    function removed(...args) {
        dispose();
        return oldRemoved?.apply(this, args);
    }
    node.onRemoved = removed;

    function dispose() {
        if (disposed) return;
        disposed = true;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        for (const [widget, state] of widgets) restore(widget, state);
        for (const { name, original, wrapped, own } of hooks) if (node[name] === wrapped) {
            if (own) node[name] = original;
            else delete node[name];
        }
        if (node.onRemoved === removed) {
            if (ownRemoved) node.onRemoved = oldRemoved;
            else delete node.onRemoved;
        }
        controllers.delete(node);
        if (node.__cigNodeLayout === controller) delete node.__cigNodeLayout;
    }

    const previewHeight = widget => Math.max(1, Number(widget.computedHeight ?? 220) - (widget === preview ? controls.height : 0));
    const controller = {
        refresh, scheduleRefresh, dispose, previewHeight,
        drawControls(widget, ctx, width) {
            if (widget === preview) controls.draw(ctx, width, Number(widget.y ?? 0) + previewHeight(widget));
        },
        pointerDown(widget, pointer, canvas) {
            return widget === preview && controls.pointerDown(pointer, canvas,
                Number(widget.y ?? 0) + previewHeight(widget), Number(node.size?.[0] ?? 320));
        },
    };
    controllers.set(node, controller);
    node.__cigNodeLayout = controller;
    return controller;
}

function refreshGraph(graph) {
    const nodes = graph?._nodes || graph?.nodes || [];
    for (const node of nodes) installLayout(node)?.scheduleRefresh();
}

function installGraphListener() {
    const canvas = app.canvas?.canvas;
    if (!canvas?.addEventListener || canvases.has(canvas)) return;
    canvases.add(canvas);
    canvas.addEventListener("litegraph:set-graph", event => {
        refreshGraph(event.detail?.newGraph || app.rootGraphOrUndefined || app.graph);
    });
}

function initialize(node) {
    installGraphListener();
    installLayout(node)?.scheduleRefresh();
}

app.registerExtension({
    name: "Comfy.ImageGallery.StableUnifiedNode",
    setup: installGraphListener,
    nodeCreated: initialize,
    loadedGraphNode: initialize,
    afterConfigureGraph() { refreshGraph(app.rootGraphOrUndefined || app.graph); },
});
