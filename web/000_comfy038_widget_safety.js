import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.Comfy038WidgetSafety";
const NODE_CLASS = "LoadImageGallery";
const LEGACY_BUTTON = "🖼 Превью папки";

function isTarget(node) {
    return !!node && (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS);
}

function compactWidgets(node) {
    if (!Array.isArray(node?.widgets) || !node.widgets.length) return;
    const clean = node.widgets.filter(Boolean);
    if (clean.length === node.widgets.length) return;
    node.widgets.splice(0, node.widgets.length, ...clean);
    node.graph?.setDirtyCanvas?.(true, true);
}

function install(node) {
    if (!isTarget(node) || node.__cigComfy038WidgetSafety) return;

    const originalAddWidget = node.addWidget;
    if (typeof originalAddWidget !== "function") return;

    const wrappedAddWidget = function(type, name, value, callback, options) {
        // image_gallery.js historically created this helper button and then
        // immediately moved it inside node.widgets with splice(). ComfyUI 0.38+
        // keeps concrete widgets in its own store, so mutating the widget array
        // during nodeCreated can leave an undefined entry that later crashes
        // serialisation at widget.serialize. The button is legacy and the stable
        // node layout removes it anyway, so keep the old setup flow alive without
        // ever registering this obsolete widget.
        if (type === "button" && name === LEGACY_BUTTON) {
            return {
                type: "button",
                name,
                value,
                callback: typeof callback === "function" ? callback : undefined,
                options: (options && typeof options === "object") ? options : {},
                serialize: false,
                y: 0,
            };
        }
        return originalAddWidget.apply(this, arguments);
    };

    node.addWidget = wrappedAddWidget;
    node.__cigComfy038WidgetSafety = { originalAddWidget, wrappedAddWidget };

    const oldRemoved = node.onRemoved;
    node.onRemoved = function(...args) {
        const state = this.__cigComfy038WidgetSafety;
        if (state && this.addWidget === state.wrappedAddWidget) {
            this.addWidget = state.originalAddWidget;
        }
        delete this.__cigComfy038WidgetSafety;
        return oldRemoved?.apply(this, args);
    };

    requestAnimationFrame(() => compactWidgets(node));
}

app.registerExtension({
    name: EXT_NAME,
    nodeCreated(node) {
        install(node);
    },
    loadedGraphNode(node) {
        if (!isTarget(node)) return;
        compactWidgets(node);
        requestAnimationFrame(() => compactWidgets(node));
    },
});
