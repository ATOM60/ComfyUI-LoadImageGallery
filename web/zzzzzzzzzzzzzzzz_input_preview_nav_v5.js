import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.InputPreviewNavigation";
const NODE_CLASS = "LoadImageGallery";
const LAST_IMAGE_KEY = "ComfyUI-LoadImageGallery.lastImage";

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
    const token = (node.__cigNavExternalToken || 0) + 1;
    node.__cigNavExternalToken = token;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
        if (node.__cigNavExternalToken !== token) return;
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
        node.__cigNavLoadedFolder = folder;
        return known;
    }
    if (node.__cigNavLoadedFolder === folder) return known;
    if (node.__cigNavPendingFolder === folder && node.__cigNavPendingPromise) {
        return node.__cigNavPendingPromise;
    }

    node.__cigNavPendingFolder = folder;
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
            node.__cigNavLoadedFolder = folder;
            return folderValues(node);
        } catch (_) {
            return folderValues(node);
        } finally {
            if (node.__cigNavPendingFolder === folder) {
                node.__cigNavPendingFolder = null;
                node.__cigNavPendingPromise = null;
            }
        }
    })();
    node.__cigNavPendingPromise = pending;
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
        node.__cigNavExternalToken = (node.__cigNavExternalToken || 0) + 1;
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
    const step = Number(direction) < 0 ? -1 : 1;
    const next = values[(index + step + values.length) % values.length];
    if (next) setCurrentImage(node, next);
}

function install(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;
    node.__cigPreviewNavigate = direction => navigate(node, direction);
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
