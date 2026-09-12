import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const NODE_CLASS = "LoadImageGallery";

function normalizePath(value) {
    if (typeof value !== "string") return "";
    return value.replace(/\\/g, "/").replace(/\s*\[(input|output|temp)\]\s*$/i, "").replace(/^\/+|\/+$/g, "");
}

function splitPath(value) {
    const clean = normalizePath(value);
    const i = clean.lastIndexOf("/");
    return i < 0
        ? { folder: "", filename: clean }
        : { folder: clean.slice(0, i), filename: clean.slice(i + 1) };
}

function joinPath(folder, filename) {
    const clean = normalizePath(folder);
    return clean ? `${clean}/${filename}` : filename;
}

function getImageWidget(node) {
    return node.widgets?.find(w => w?.name === "image") || null;
}

async function hydratePreviewNavigationValues(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;

    const widget = getImageWidget(node);
    const current = normalizePath(String(widget?.value ?? node?.properties?.__cigLastImage ?? ""));
    if (!current) return;

    const folder = splitPath(current).folder;
    if (node.__cigNavValuesFolder === folder || node.__cigNavValuesLoading === folder) return;

    node.__cigNavValuesLoading = folder;
    try {
        const response = await api.fetchApi(`/image-gallery/list?folder=${encodeURIComponent(folder)}`);
        if (!response.ok) return;

        const data = await response.json();
        const activeWidget = getImageWidget(node);
        const active = normalizePath(String(activeWidget?.value ?? node?.properties?.__cigLastImage ?? ""));
        if (!active || splitPath(active).folder !== folder) return;

        const images = Array.isArray(data?.images) ? data.images : [];
        node.__cigGalleryValues = images.map(name => joinPath(folder, String(name)));
        node.__cigNavValuesFolder = folder;
        node.graph?.setDirtyCanvas?.(true, true);
    } catch (error) {
        console.warn("[ImageGallery] preview navigation filename preload failed:", error);
    } finally {
        if (node.__cigNavValuesLoading === folder) node.__cigNavValuesLoading = null;
    }
}

function scheduleHydration(node) {
    queueMicrotask(() => hydratePreviewNavigationValues(node));
    requestAnimationFrame(() => hydratePreviewNavigationValues(node));
}

app.registerExtension({
    name: "Comfy.ImageGallery.PreviewNavigationValues",
    nodeCreated(node) {
        if (node?.comfyClass !== NODE_CLASS && node?.type !== NODE_CLASS) return;
        scheduleHydration(node);
    },
    loadedGraphNode(node) {
        if (node?.comfyClass !== NODE_CLASS && node?.type !== NODE_CLASS) return;
        scheduleHydration(node);
    },
});
