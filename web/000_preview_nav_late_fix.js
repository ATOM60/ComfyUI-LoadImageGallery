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
    return i < 0 ? { folder: "", filename: clean } : { folder: clean.slice(0, i), filename: clean.slice(i + 1) };
}

function getImageWidget(node) {
    return node.widgets?.find(w => w?.name === "image") || null;
}

function isAbsoluteGalleryPath(value) {
    const v = String(value ?? "").replace(/\\/g, "/");
    return /^[A-Za-z]:\//.test(v) || v.startsWith("//");
}

function externalSourceUrl(path) {
    const p = new URLSearchParams();
    p.set("path", path);
    p.set("_", String(Date.now()));
    return api.apiURL(`/image-gallery/source?${p.toString()}`);
}

function loadExternalPreview(node, path) {
    if (!node || !isAbsoluteGalleryPath(path)) return;
    const clean = normalizePath(path);
    const token = (node.__cigExternalPreviewToken ?? 0) + 1;
    node.__cigExternalPreviewToken = token;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
        if (node.__cigExternalPreviewToken !== token) return;
        node.__cigExternalPreviewPath = clean;
        node.imgs = [img];
        node.imageIndex = 0;
        node.graph?.setDirtyCanvas?.(true, true);
    };
    img.onerror = () => console.warn("[ImageGallery] late-nav external preview failed:", clean);
    img.src = externalSourceUrl(clean);
}

function setWidgetValue(node, value) {
    const w = getImageWidget(node);
    if (!w) return;
    const next = normalizePath(String(value ?? ""));

    if (Array.isArray(w.options?.values) && !w.options.values.includes(next)) {
        w.options.values.push(next);
        w.options.values.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }));
    }

    w.value = next;
    if (next) {
        node.properties = node.properties || {};
        node.properties.__cigLastImage = next;
        try { localStorage.setItem("ComfyUI-LoadImageGallery.lastImage", next); } catch (_) {}
    }

    if (isAbsoluteGalleryPath(next)) {
        loadExternalPreview(node, next);
    } else {
        node.__cigExternalPreviewToken = (node.__cigExternalPreviewToken ?? 0) + 1;
        node.__cigExternalPreviewPath = null;
        w.callback?.(next);
    }

    node.graph?.setDirtyCanvas?.(true, true);
    if (!app.configuringGraph) {
        try {
            app?.extensionManager?.workflow?.activeWorkflow?.changeTracker?.captureCanvasState?.();
        } catch (_) {}
    }
}

function installLatePreviewNavigation(node) {
    if (node.__cigLatePreviewNavWatcher) return;
    node.__cigLatePreviewNavWatcher = true;

    const inside = (p, r) => !!p && !!r && p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h;

    const folderValues = () => {
        const w = getImageWidget(node);
        if (!w) return [];
        const current = normalizePath(String(w.value ?? ""));
        const folder = splitPath(current).folder;
        const raw = [
            ...(Array.isArray(w.options?.values) ? w.options.values : []),
            ...(Array.isArray(node.__cigGalleryValues) ? node.__cigGalleryValues : []),
        ];
        const seen = new Set();
        const out = [];
        for (const v of raw) {
            const n = normalizePath(String(v ?? ""));
            if (!n || splitPath(n).folder !== folder || seen.has(n)) continue;
            seen.add(n);
            out.push(n);
        }
        return out;
    };

    const navigate = dir => {
        const w = getImageWidget(node);
        const values = folderValues();
        if (!w || values.length < 2) return;
        const current = normalizePath(String(w.value ?? ""));
        let i = values.indexOf(current);
        if (i < 0) i = 0;
        const next = values[(i + dir + values.length) % values.length];
        node.__cigFolder = splitPath(next).folder;
        setWidgetValue(node, next);
    };

    const patch = w => {
        if (!w || w.__cigNavV4Patched || w.__cigLateNavPatched) return w;
        const isPreview = w.name === "$$canvas-image-preview" ||
            (w.options?.canvasOnly === true && typeof w.drawWidget === "function" && typeof w.onPointerDown === "function");
        if (!isPreview) return w;

        w.__cigLateNavPatched = true;
        const stockDraw = typeof w.drawWidget === "function" ? w.drawWidget.bind(w) : null;
        const stockPointer = typeof w.onPointerDown === "function" ? w.onPointerDown.bind(w) : null;

        w.drawWidget = function(ctx, options) {
            if (this.__cigNavV4Patched) return stockDraw?.(ctx, options);
            try {
                const imgs = options?.previewImages ?? node.imgs ?? [];
                const img = imgs[node.imageIndex ?? 0] ?? imgs[0];
                const dw = Number(options?.width ?? node.size?.[0] ?? 0);
                const y = Number(this.y ?? 0);
                const dh = Math.max(1, Number(this.computedHeight ?? 220));

                ctx.save();
                ctx.fillStyle = "#111";
                ctx.fillRect(0, y, dw, dh);

                if (!img) {
                    this.__cigImageRect = null;
                    this.__cigPrevRect = null;
                    this.__cigNextRect = null;
                    ctx.restore();
                    return;
                }

                const iw = Number(img?.naturalWidth || img?.width || 0);
                const ih = Number(img?.naturalHeight || img?.height || 0);
                if (!(iw > 0 && ih > 0)) {
                    this.__cigImageRect = null;
                    this.__cigPrevRect = null;
                    this.__cigNextRect = null;
                    ctx.restore();
                    return;
                }

                const outer = 6;
                const gap = 8;
                const landscape = (iw / ih) >= 1.0;
                const minSide = landscape ? Math.min(90, Math.max(58, dw * 0.12)) : 0;
                const maxW = Math.max(40, dw - (outer * 2) - (gap * 2) - (minSide * 2));
                const maxH = Math.max(40, dh - 8);
                const scale = Math.min(maxW / iw, maxH / ih);
                const rw = iw * scale;
                const rh = ih * scale;
                const rx = (dw - rw) / 2;
                const ry = y + (dh - rh) / 2;

                this.__cigImageRect = { x: rx, y: ry, w: rw, h: rh };
                ctx.drawImage(img, rx, ry, rw, rh);

                const values = folderValues();
                if (values.length > 1) {
                    const leftW = Math.max(0, rx - gap - outer);
                    const rightX = rx + rw + gap;
                    const rightW = Math.max(0, dw - outer - rightX);
                    this.__cigPrevRect = leftW >= 30 ? { x: outer, y, w: leftW, h: dh } : null;
                    this.__cigNextRect = rightW >= 30 ? { x: rightX, y, w: rightW, h: dh } : null;

                    const mouse = app.canvas?.graph_mouse;
                    const p = mouse ? [mouse[0] - node.pos[0], mouse[1] - node.pos[1]] : [-9999, -9999];
                    const drawBtn = (r, text) => {
                        if (!r) return;
                        const hover = inside(p, r);
                        ctx.fillStyle = hover ? "rgba(6,18,32,.98)" : "rgba(24,24,24,.88)";
                        ctx.strokeStyle = hover ? "rgba(70,145,255,1)" : "rgba(255,255,255,.28)";
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.roundRect(r.x + 3, r.y + 3, Math.max(1, r.w - 6), Math.max(1, r.h - 6), 12);
                        ctx.fill();
                        ctx.stroke();
                        ctx.fillStyle = "#fff";
                        ctx.font = `700 ${Math.max(34, Math.min(72, r.w * .48, r.h * .28))}px Arial,sans-serif`;
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(text, r.x + r.w / 2, r.y + r.h / 2 - 1);
                        if (hover && app.canvas?.canvas) app.canvas.canvas.style.cursor = "pointer";
                    };
                    drawBtn(this.__cigPrevRect, "‹");
                    drawBtn(this.__cigNextRect, "›");
                } else {
                    this.__cigPrevRect = null;
                    this.__cigNextRect = null;
                }

                const mouse = app.canvas?.graph_mouse;
                const p = mouse ? [mouse[0] - node.pos[0], mouse[1] - node.pos[1]] : null;
                if (inside(p, this.__cigImageRect) && app.canvas?.canvas) app.canvas.canvas.style.cursor = "pointer";
                ctx.restore();
            } catch (e) {
                console.warn("[ImageGallery] late-nav draw", e);
                try { ctx.restore(); } catch (_) {}
                stockDraw?.(ctx, options);
            }
        };

        w.onPointerDown = function(pointer, nodeArg, canvas) {
            if (this.__cigNavV4Patched) return stockPointer?.(pointer, nodeArg, canvas) ?? true;
            try {
                const mouse = app.canvas?.graph_mouse;
                const p = mouse ? [mouse[0] - node.pos[0], mouse[1] - node.pos[1]] : null;
                const button = pointer?.eDown?.button;
                if (p && (button == null || button === 0)) {
                    if (inside(p, this.__cigPrevRect)) { navigate(-1); return true; }
                    if (inside(p, this.__cigNextRect)) { navigate(1); return true; }
                }
            } catch (e) {
                console.warn("[ImageGallery] late-nav pointer", e);
            }
            return stockPointer?.(pointer, nodeArg, canvas) ?? true;
        };

        node.graph?.setDirtyCanvas?.(true, true);
        return w;
    };

    node.widgets?.forEach(patch);

    if (typeof node.addCustomWidget === "function" && !node.__cigLateNavAddCustomWidgetWrapped) {
        node.__cigLateNavAddCustomWidgetWrapped = true;
        const originalAddCustomWidget = node.addCustomWidget.bind(node);
        node.addCustomWidget = function(widget) {
            const result = originalAddCustomWidget(widget);
            patch(result ?? widget);
            return result;
        };
    }
}

app.registerExtension({
    name: "Comfy.ImageGallery.PreviewNavLateFix",
    nodeCreated(node) {
        if (node?.comfyClass !== NODE_CLASS && node?.type !== NODE_CLASS) return;
        installLatePreviewNavigation(node);
    },
});
