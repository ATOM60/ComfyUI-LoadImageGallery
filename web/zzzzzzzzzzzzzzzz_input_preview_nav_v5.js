import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.InputPreviewNavV5";
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
    const token = (node.__cigNavV5ExternalToken || 0) + 1;
    node.__cigNavV5ExternalToken = token;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
        if (node.__cigNavV5ExternalToken !== token) return;
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
        node.__cigNavV5LoadedFolder = folder;
        return known;
    }
    if (node.__cigNavV5LoadedFolder === folder) return known;
    if (node.__cigNavV5PendingFolder === folder && node.__cigNavV5PendingPromise) {
        return node.__cigNavV5PendingPromise;
    }

    node.__cigNavV5PendingFolder = folder;
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
            node.__cigNavV5LoadedFolder = folder;
            node.graph?.setDirtyCanvas?.(true, true);
            return folderValues(node);
        } catch (_) {
            return folderValues(node);
        } finally {
            if (node.__cigNavV5PendingFolder === folder) {
                node.__cigNavV5PendingFolder = null;
                node.__cigNavV5PendingPromise = null;
            }
        }
    })();
    node.__cigNavV5PendingPromise = pending;
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
        node.__cigNavV5ExternalToken = (node.__cigNavV5ExternalToken || 0) + 1;
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

function inside(point, rect) {
    return !!point && !!rect &&
        point[0] >= rect.x && point[0] <= rect.x + rect.w &&
        point[1] >= rect.y && point[1] <= rect.y + rect.h;
}

function pointerLocalPoint(pointer, node) {
    const event = pointer?.eDown;
    if (Number.isFinite(event?.canvasX) && Number.isFinite(event?.canvasY)) {
        return [event.canvasX - node.pos[0], event.canvasY - node.pos[1]];
    }
    const mouse = app.canvas?.graph_mouse;
    return Array.isArray(mouse) ? [mouse[0] - node.pos[0], mouse[1] - node.pos[1]] : null;
}

function computeRects(widget, node, options) {
    const width = Math.max(1, Number(options?.width ?? node.size?.[0] ?? 320));
    const y = Number(widget.y ?? 0);
    const height = Math.max(1, Number(widget.computedHeight ?? 220));
    const buttonW = Math.max(38, Math.min(52, width * 0.12));
    const buttonH = Math.max(64, Math.min(116, height * 0.52));
    const buttonY = y + (height - buttonH) / 2;
    const margin = 8;

    widget.__cigNavV5PrevRect = { x: margin, y: buttonY, w: buttonW, h: buttonH };
    widget.__cigNavV5NextRect = { x: Math.max(margin, width - margin - buttonW), y: buttonY, w: buttonW, h: buttonH };

    const images = options?.previewImages ?? node.imgs ?? [];
    const image = images[node.imageIndex ?? 0] ?? images[0];
    const iw = Number(image?.naturalWidth || image?.width || 0);
    const ih = Number(image?.naturalHeight || image?.height || 0);
    if (iw > 0 && ih > 0) {
        const scale = Math.min(width / iw, height / ih, 1);
        const rw = iw * scale;
        const rh = ih * scale;
        widget.__cigNavV5ImageRect = {
            x: (width - rw) / 2,
            y: y + (height - rh) / 2,
            w: rw,
            h: rh,
        };
    } else {
        widget.__cigNavV5ImageRect = null;
    }
}

function drawArrowOverlay(widget, node, ctx, options) {
    const values = folderValues(node);
    if (values.length < 2) {
        widget.__cigNavV5PrevRect = null;
        widget.__cigNavV5NextRect = null;
        void hydrateFolderValues(node);
        return;
    }

    computeRects(widget, node, options);
    const transform = ctx.getTransform();
    const prevRect = { ...widget.__cigNavV5PrevRect };
    const nextRect = { ...widget.__cigNavV5NextRect };

    try {
        const drawButton = (rect, text) => {
            if (!rect) return;
            ctx.save();
            ctx.setTransform(transform);
            ctx.fillStyle = "rgba(20,20,20,.72)";
            ctx.strokeStyle = "rgba(255,255,255,.34)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 10);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.font = `700 ${Math.max(34, Math.min(54, rect.w * 0.9))}px Arial,sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 - 2);
            ctx.restore();
        };
        drawButton(prevRect, "‹");
        drawButton(nextRect, "›");
    } catch (_) {}
}

function patchPreviewWidget(node) {
    if (!node?.widgets) return false;
    const widget = node.widgets.find(w =>
        w?.name === "$$canvas-image-preview" ||
        (w?.options?.canvasOnly === true && typeof w?.drawWidget === "function")
    );
    if (!widget) return false;
    if (widget.__cigNavV5Patched) return true;

    const prototype = Object.getPrototypeOf(widget);
    const stockDraw = typeof prototype?.drawWidget === "function"
        ? prototype.drawWidget
        : widget.drawWidget;
    const stockPointerDown = typeof prototype?.onPointerDown === "function"
        ? prototype.onPointerDown
        : widget.onPointerDown;
    if (typeof stockDraw !== "function") return false;

    // Stop the older V3 retry scans from installing their synchronous image renderer.
    node.__cigPreviewNavV3 = true;
    widget.__cigNavV4Patched = true;
    widget.__cigNavV5Patched = true;

    widget.drawWidget = function(ctx, options) {
        stockDraw.call(this, ctx, options);
        computeRects(this, node, options);
        drawArrowOverlay(this, node, ctx, options);
    };

    widget.onPointerDown = function(pointer, nodeArg, canvas) {
        const point = pointerLocalPoint(pointer, node);
        if (point && inside(point, this.__cigNavV5PrevRect)) {
            pointer.onClick = () => { void navigate(node, -1); };
            return true;
        }
        if (point && inside(point, this.__cigNavV5NextRect)) {
            pointer.onClick = () => { void navigate(node, 1); };
            return true;
        }
        if (point && inside(point, this.__cigNavV5ImageRect)) {
            pointer.onClick = () => {
                const galleryButton = node.widgets?.find?.(w => w?.name === "🖼 Превью папки");
                galleryButton?.callback?.();
            };
            return true;
        }
        return typeof stockPointerDown === "function"
            ? stockPointerDown.call(this, pointer, nodeArg, canvas)
            : true;
    };

    node.graph?.setDirtyCanvas?.(true, true);
    return true;
}

function install(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;
    if (node.__cigNavV5InstallPending) return;

    node.__cigNavV5InstallPending = true;
    const started = performance.now();
    const tryPatch = () => {
        if (patchPreviewWidget(node)) {
            node.__cigNavV5InstallPending = false;
            return;
        }

        const elapsed = performance.now() - started;
        if (elapsed >= 10000) {
            node.__cigNavV5InstallPending = false;
            return;
        }

        setTimeout(tryPatch, elapsed < 1000 ? 50 : 200);
    };

    tryPatch();
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
