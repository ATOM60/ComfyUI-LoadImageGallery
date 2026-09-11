import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.InputPreviewNavRestore";
const NODE_CLASS = "LoadImageGallery";

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
        ? { folder:"", filename:clean }
        : { folder:clean.slice(0, index), filename:clean.slice(index + 1) };
}

function joinPath(folder, filename) {
    const clean = normalizePath(folder);
    return clean ? `${clean}/${filename}` : filename;
}

function getImageWidget(node) {
    return node?.widgets?.find?.(widget => widget?.name === "image") || null;
}

function currentImage(node) {
    const widget = getImageWidget(node);
    return normalizePath(widget?.value || node?.properties?.__cigLastImage || "");
}

async function hydrateFolderValues(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;

    const image = currentImage(node);
    if (!image) return;

    const folder = splitPath(image).folder;
    const token = (node.__cigPreviewNavHydrateToken || 0) + 1;
    node.__cigPreviewNavHydrateToken = token;

    try {
        const response = await api.fetchApi(`/image-gallery/list?folder=${encodeURIComponent(folder)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (node.__cigPreviewNavHydrateToken !== token) return;

        const images = Array.isArray(data?.images) ? data.images : [];
        node.__cigGalleryValues = images.map(name => joinPath(folder, String(name || ""))).filter(Boolean);
        node.__cigFolder = folder;
        node.graph?.setDirtyCanvas?.(true, true);
    } catch (_) {}
}

function scheduleHydrate(node) {
    const run = () => hydrateFolderValues(node);
    requestAnimationFrame(run);
    setTimeout(run, 120);
    setTimeout(run, 450);
}

app.registerExtension({
    name: EXT_NAME,
    nodeCreated(node) {
        if (node?.comfyClass !== NODE_CLASS && node?.type !== NODE_CLASS) return;
        scheduleHydrate(node);
    },
    loadedGraphNode(node) {
        if (node?.comfyClass !== NODE_CLASS && node?.type !== NODE_CLASS) return;
        scheduleHydrate(node);
    },
});
