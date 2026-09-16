import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.InputStartImagePersistence";
const NODE_CLASS = "LoadImageGallery";

function normalizePath(value) {
    return String(value ?? "")
        .replace(/\\/g, "/")
        .replace(/\s*\[(input|output|temp)\]\s*$/i, "")
        .replace(/^\/+|\/+$/g, "");
}

function isAbsolutePath(value) {
    const v = String(value ?? "").replace(/\\/g, "/");
    return /^[A-Za-z]:\//.test(v) || v.startsWith("//");
}

function imageWidget(node) {
    return node?.widgets?.find?.(widget => widget?.name === "image") || null;
}

function currentImage(node) {
    return normalizePath(imageWidget(node)?.value || node?.properties?.__cigLastImage || "");
}

function rememberCurrent(node) {
    const value = normalizePath(imageWidget(node)?.value || "");
    if (!value) return;
    node.properties = node.properties || {};
    node.properties.__cigLastImage = value;
}

function restoreSaved(node) {
    if (!node?.graph) return;
    const saved = normalizePath(node?.properties?.__cigLastImage || "");
    if (!saved) return;

    const widget = imageWidget(node);
    if (!widget) return;

    if (Array.isArray(widget.options?.values) && !widget.options.values.includes(saved)) {
        widget.options.values.push(saved);
    }

    if (normalizePath(widget.value || "") === saved) return;
    widget.value = saved;

    // Absolute external paths are rendered by image_gallery.js' external-preview
    // restore. Calling the stock LoadImage callback with an absolute path would
    // incorrectly send it to /view.
    if (!isAbsolutePath(saved)) {
        try { widget.callback?.(saved); } catch (_) {}
    }
    node.graph?.setDirtyCanvas?.(true, true);
}

function install(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) || node.__cigStartImagePersistenceInstalled) return;
    node.__cigStartImagePersistenceInstalled = true;

    const oldSerialize = node.onSerialize;
    node.onSerialize = function(data) {
        rememberCurrent(this);
        const result = oldSerialize?.call(this, data);
        const value = currentImage(this);
        if (value) {
            data.properties = data.properties || {};
            data.properties.__cigLastImage = value;
        }
        return result;
    };

    const oldConfigure = node.onConfigure;
    node.onConfigure = function(...args) {
        const result = oldConfigure?.apply(this, args);
        const saved = normalizePath(this?.properties?.__cigLastImage || "");
        if (saved) {
            requestAnimationFrame(() => {
                if (!this.graph) return;
                restoreSaved(this);
                requestAnimationFrame(() => restoreSaved(this));
            });
        }
        return result;
    };
}

app.registerExtension({
    name: EXT_NAME,
    nodeCreated(node) {
        install(node);
    },
    loadedGraphNode(node) {
        install(node);
        requestAnimationFrame(() => {
            if (!node?.graph) return;
            restoreSaved(node);
            requestAnimationFrame(() => restoreSaved(node));
        });
    },
});
