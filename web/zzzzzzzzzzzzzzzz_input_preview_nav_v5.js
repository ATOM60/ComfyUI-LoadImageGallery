import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.InputPreviewNavDOM";
const NODE_CLASS = "LoadImageGallery";
const LAST_IMAGE_KEY = "ComfyUI-LoadImageGallery.lastImage";
const NAV_WIDGET_NAME = "cig-preview-nav";

function normalizePath(value) {
    return String(value ?? "")
        .replace(/\\/g, "/")
        .replace(/\s*\[(input|output|temp)\]\s*$/i, "")
        .replace(/^\/+|\/+$/g, "");
}

function splitPath(value) {
    const clean = normalizePath(value);
    const index = clean.lastIndexOf("/");
    return index < 0
        ? { folder: "", filename: clean }
        : { folder: clean.slice(0, index), filename: clean.slice(index + 1) };
}

function joinPath(folder, filename) {
    const clean = normalizePath(folder);
    return clean ? `${clean}/${filename}` : filename;
}

function getImageWidget(node) {
    return node?.widgets?.find?.(widget => widget?.name === "image") || null;
}

function isAbsolutePath(value) {
    const clean = String(value ?? "").replace(/\\/g, "/");
    return /^[A-Za-z]:\//.test(clean) || clean.startsWith("//");
}

function externalSourceUrl(path) {
    const params = new URLSearchParams();
    params.set("path", path);
    params.set("_", String(Date.now()));
    return api.apiURL(`/image-gallery/source?${params.toString()}`);
}

function loadExternalPreview(node, path) {
    if (!node || !isAbsolutePath(path)) return;
    const clean = normalizePath(path);
    const token = (node.__cigNavDomExternalToken || 0) + 1;
    node.__cigNavDomExternalToken = token;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
        if (node.__cigNavDomExternalToken !== token) return;
        node.__cigExternalPreviewPath = clean;
        node.imgs = [image];
        node.imageIndex = 0;
        node.graph?.setDirtyCanvas?.(true, true);
    };
    image.onerror = () => console.warn("[ImageGallery] preview navigation could not load", clean);
    image.src = externalSourceUrl(clean);
}

function folderValues(node) {
    const widget = getImageWidget(node);
    if (!widget) return [];
    const current = normalizePath(widget.value);
    const folder = splitPath(current).folder;
    const raw = [
        ...(Array.isArray(widget.options?.values) ? widget.options.values : []),
        ...(Array.isArray(node.__cigGalleryValues) ? node.__cigGalleryValues : []),
    ];
    if (current) raw.push(current);

    const seen = new Set();
    const values = [];
    for (const value of raw) {
        const clean = normalizePath(value);
        if (!clean || splitPath(clean).folder !== folder || seen.has(clean)) continue;
        seen.add(clean);
        values.push(clean);
    }
    return values;
}

async function hydrateFolderValues(node) {
    const widget = getImageWidget(node);
    if (!widget) return [];
    const current = normalizePath(widget.value);
    if (!current) return [];
    const folder = splitPath(current).folder;

    const known = folderValues(node);
    if (known.length > 1) {
        node.__cigNavDomLoadedFolder = folder;
        return known;
    }
    if (node.__cigNavDomLoadedFolder === folder) return known;
    if (node.__cigNavDomPendingFolder === folder && node.__cigNavDomPendingPromise) {
        return node.__cigNavDomPendingPromise;
    }

    node.__cigNavDomPendingFolder = folder;
    const pending = (async () => {
        try {
            const response = await api.fetchApi(`/image-gallery/list?folder=${encodeURIComponent(folder)}`);
            if (!response.ok) return folderValues(node);
            const data = await response.json();
            const liveWidget = getImageWidget(node);
            const liveCurrent = normalizePath(liveWidget?.value);
            if (!liveCurrent || splitPath(liveCurrent).folder !== folder) return folderValues(node);

            const images = Array.isArray(data?.images) ? data.images : [];
            node.__cigGalleryValues = images
                .map(name => joinPath(folder, String(name || "")))
                .filter(Boolean);
            node.__cigNavDomLoadedFolder = folder;
            return folderValues(node);
        } catch (_) {
            return folderValues(node);
        } finally {
            if (node.__cigNavDomPendingFolder === folder) {
                node.__cigNavDomPendingFolder = null;
                node.__cigNavDomPendingPromise = null;
            }
        }
    })();
    node.__cigNavDomPendingPromise = pending;
    return pending;
}

function setCurrentImage(node, value) {
    const widget = getImageWidget(node);
    if (!widget) return;
    const clean = normalizePath(value);
    if (!clean) return;

    if (Array.isArray(widget.options?.values) && !widget.options.values.includes(clean)) {
        widget.options.values.push(clean);
    }
    widget.value = clean;
    node.properties = node.properties || {};
    node.properties.__cigLastImage = clean;
    try { localStorage.setItem(LAST_IMAGE_KEY, clean); } catch (_) {}

    if (isAbsolutePath(clean)) {
        loadExternalPreview(node, clean);
    } else {
        node.__cigNavDomExternalToken = (node.__cigNavDomExternalToken || 0) + 1;
        node.__cigExternalPreviewPath = null;
        widget.callback?.(clean);
    }

    node.graph?.setDirtyCanvas?.(true, true);
    if (!app.configuringGraph) {
        try {
            app?.extensionManager?.workflow?.activeWorkflow?.changeTracker?.captureCanvasState?.();
        } catch (_) {}
    }
}

async function navigate(node, direction) {
    let values = folderValues(node);
    if (values.length < 2) values = await hydrateFolderValues(node);
    if (values.length < 2) return;

    const widget = getImageWidget(node);
    if (!widget) return;
    const current = normalizePath(widget.value);
    let index = values.indexOf(current);
    if (index < 0) index = 0;
    const next = values[(index + direction + values.length) % values.length];
    if (next) setCurrentImage(node, next);
}

function makeButton(text, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = title;
    button.style.cssText = [
        "flex:1 1 0",
        "height:30px",
        "min-width:0",
        "padding:0",
        "margin:0",
        "border:1px solid rgba(255,255,255,.18)",
        "border-radius:6px",
        "background:var(--comfy-input-bg,#222)",
        "color:var(--input-text,#ddd)",
        "font:700 22px/28px Arial,sans-serif",
        "cursor:pointer",
        "touch-action:manipulation",
        "box-sizing:border-box",
    ].join(";");
    return button;
}

function installDomNavigation(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return false;
    if (node.__cigNavDomInstalled) return true;
    if (typeof node.addDOMWidget !== "function" || !getImageWidget(node)) return false;

    const existing = node.widgets?.find?.(widget => widget?.name === NAV_WIDGET_NAME);
    if (existing) {
        node.__cigNavDomInstalled = true;
        return true;
    }

    const row = document.createElement("div");
    row.className = "cig-node-preview-nav";
    row.style.cssText = [
        "display:flex",
        "align-items:center",
        "gap:6px",
        "width:100%",
        "height:34px",
        "padding:2px 4px",
        "margin:0",
        "box-sizing:border-box",
        "pointer-events:auto",
        "--comfy-widget-height:34px",
        "--comfy-widget-min-height:34px",
        "--comfy-widget-max-height:34px",
    ].join(";");

    const prev = makeButton("‹", "Предыдущее изображение");
    const next = makeButton("›", "Следующее изображение");
    row.append(prev, next);

    const stop = event => event.stopPropagation();
    row.addEventListener("pointerdown", stop);
    row.addEventListener("mousedown", stop);
    row.addEventListener("dblclick", stop);

    prev.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void navigate(node, -1);
    });
    next.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void navigate(node, 1);
    });

    const widget = node.addDOMWidget(NAV_WIDGET_NAME, NAV_WIDGET_NAME, row, {
        hideOnZoom: false,
        margin: 2,
        getMinHeight: () => 34,
        getMaxHeight: () => 34,
        getHeight: () => 34,
        surfaces: { canvas: "shown", vueNode: "never", panel: "never" },
    });
    widget.serialize = false;
    widget.serializeValue = () => undefined;

    node.__cigNavDomInstalled = true;
    node.graph?.setDirtyCanvas?.(true, true);
    return true;
}

function install(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;
    if (installDomNavigation(node) || node.__cigNavDomInstallPending) return;

    node.__cigNavDomInstallPending = true;
    const started = performance.now();
    const retry = () => {
        if (installDomNavigation(node)) {
            node.__cigNavDomInstallPending = false;
            return;
        }
        if (performance.now() - started >= 10000 || !node.graph) {
            node.__cigNavDomInstallPending = false;
            return;
        }
        setTimeout(retry, 100);
    };
    setTimeout(retry, 0);
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
