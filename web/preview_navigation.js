// One controller per node. No timers or render loop are needed to attach previews.
export function installGalleryPreviewNavigation(node, dependencies) {
    if (node.__cigPreviewNavigation) return node.__cigPreviewNavigation;
    const { app, api, getImageWidget, setWidgetValue, openGallery,
        normalizePath, splitPath, joinPath } = dependencies;
    const empty = [];
    const patched = new Map();
    let disposed = false;
    let folder = null;
    let values = empty;
    let cachedWidget, cachedValue, cachedOptions, cachedGallery;
    let optionsLength = -1, galleryLength = -1;
    let listedFolder = null;
    let listedValues = empty;
    let request = null;
    let retryTimer = null;
    let attempts = 0;
    let observed = false;

    const dirty = () => { if (!disposed) node.graph?.setDirtyCanvas?.(true, false); };
    const inside = (p, r) => !!p && !!r && p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h;
    const isPreview = w => w && (w.name === "$$canvas-image-preview" || w.type === "IMAGE_PREVIEW" ||
        (w.options?.canvasOnly === true && typeof w.drawWidget === "function" && typeof w.onPointerDown === "function"));

    function rebuild() {
        const seen = new Set();
        values = [];
        // A successful directory listing is authoritative (including deletions).
        const sources = listedFolder === folder ? [listedValues] : [cachedOptions, cachedGallery];
        for (const source of sources) for (const item of source || empty) {
            const path = normalizePath(String(item ?? ""));
            if (path && splitPath(path).folder === folder && !seen.has(path)) {
                seen.add(path);
                values.push(path);
            }
        }
    }

    function cancelRequest() {
        request?.controller.abort();
        request = null;
        if (retryTimer !== null) clearTimeout(retryTimer);
        retryTimer = null;
    }

    async function loadFolder() {
        if (disposed || folder === null || listedFolder === folder || request || retryTimer !== null || attempts >= 3) return;
        const pending = { folder, controller: new AbortController() };
        request = pending;
        attempts++;
        try {
            const response = await api.fetchApi(`/image-gallery/list?folder=${encodeURIComponent(pending.folder)}`, { signal: pending.controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (disposed || request !== pending || folder !== pending.folder) return;
            listedFolder = folder;
            listedValues = (Array.isArray(data.images) ? data.images : []).map(name => joinPath(folder, String(name)));
            rebuild();
            dirty();
        } catch (error) {
            if (disposed || request !== pending || pending.controller.signal.aborted) return;
            // Bounded retries recover transient cold-start errors without polling.
            if (attempts < 3) retryTimer = setTimeout(() => {
                retryTimer = null;
                loadFolder();
            }, attempts * 1000);
            else console.warn("[ImageGallery] preview navigation listing failed:", error);
        } finally {
            if (request === pending) request = null;
        }
    }

    // The fast path only compares scalar values and array identities/lengths.
    // Directory filtering is never repeated for unchanged render frames.
    function syncValues() {
        const widget = getImageWidget(node);
        const raw = widget?.value ?? node.properties?.__cigLastImage ?? "";
        const options = Array.isArray(widget?.options?.values) ? widget.options.values : empty;
        const gallery = Array.isArray(node.__cigGalleryValues) ? node.__cigGalleryValues : empty;
        if (observed && widget === cachedWidget && raw === cachedValue && options === cachedOptions &&
            gallery === cachedGallery && options.length === optionsLength && gallery.length === galleryLength) return;
        observed = true;
        cachedWidget = widget; cachedValue = raw;
        cachedOptions = options; cachedGallery = gallery;
        optionsLength = options.length; galleryLength = gallery.length;
        const current = normalizePath(String(raw));
        const nextFolder = current ? splitPath(current).folder : null;
        if (nextFolder !== folder) {
            cancelRequest();
            folder = nextFolder;
            listedFolder = null;
            listedValues = empty;
            attempts = 0;
        }
        rebuild();
        void loadFolder();
    }

    function point(event, canvas) {
        const x = Number(event?.canvasX), y = Number(event?.canvasY);
        const mouse = Number.isFinite(x) && Number.isFinite(y) ? [x, y] : (canvas ?? app.canvas)?.graph_mouse;
        return mouse ? [mouse[0] - (node.pos?.[0] ?? 0), mouse[1] - (node.pos?.[1] ?? 0)] : null;
    }

    function navigate(direction) {
        syncValues();
        if (values.length < 2) return;
        const current = normalizePath(String(getImageWidget(node)?.value ?? ""));
        const index = values.indexOf(current);
        const next = values[index < 0 ? (direction < 0 ? values.length - 1 : 0) : (index + direction + values.length) % values.length];
        node.__cigFolder = splitPath(next).folder;
        setWidgetValue(node, next);
        syncValues();
    }

    function patch(widget) {
        if (disposed || !isPreview(widget) || patched.has(widget)) return;
        // Animated/static preview switches can replace the widget many times.
        for (const [old, state] of patched) if (!node.widgets?.includes(old)) {
            if (old.drawWidget === state.draw) old.drawWidget = state.originalDraw;
            if (old.onPointerDown === state.down) old.onPointerDown = state.originalPointer;
            patched.delete(old);
        }
        const originalDraw = widget.drawWidget;
        const originalPointer = widget.onPointerDown;
        const paint = function(ctx, options, geometry) {
            if (disposed) return originalDraw?.call(this, ctx, options);
            syncValues();
            const width = Math.max(0, Number(options?.width ?? node.size?.[0] ?? 320));
            const y = geometry.y;
            const height = geometry.height;
            const outer = Math.min(6, width / 20), gap = Math.min(8, width / 30);
            // Reserve both lanes for every aspect ratio, even while decoding.
            const side = Math.min(90, Math.max(32, width * .12), width * .22);
            const imageWidth = Math.max(1, width - 2 * (outer + side + gap));
            const imageHeight = Math.max(1, height - 8);
            const images = options?.previewImages?.length ? options.previewImages : (node.imgs ?? empty);
            const img = images[node.imageIndex ?? 0] ?? images[0];
            const iw = Number(img?.naturalWidth || img?.width || 0), ih = Number(img?.naturalHeight || img?.height || 0);
            const enabled = values.length > 1;
            const showControls = folder !== null;
            this.__cigPrevRect = showControls ? { x: outer, y, w: side, h: height } : null;
            this.__cigNextRect = showControls ? { x: width - outer - side, y, w: side, h: height } : null;
            this.__cigImageRect = null;
            ctx.save();
            try {
                ctx.fillStyle = "#111";
                ctx.fillRect(0, y, width, height);
                if (iw > 0 && ih > 0) {
                    const scale = Math.min(imageWidth / iw, imageHeight / ih);
                    const w = iw * scale, h = ih * scale;
                    const rect = { x: (width - w) / 2, y: y + (height - h) / 2, w, h };
                    this.__cigImageRect = rect;
                    ctx.drawImage(img, rect.x, rect.y, w, h);
                }
                const mouse = point(null, app.canvas);
                for (const [rect, label] of [[this.__cigPrevRect, "‹"], [this.__cigNextRect, "›"]]) {
                    if (!rect) continue;
                    const hover = enabled && inside(mouse, rect);
                    ctx.globalAlpha = enabled ? 1 : .35;
                    ctx.fillStyle = hover ? "rgba(6,18,32,.98)" : "rgba(24,24,24,.88)";
                    ctx.strokeStyle = hover ? "rgba(70,145,255,1)" : "rgba(255,255,255,.28)";
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    const inset = Math.min(3, rect.w / 4, rect.h / 4);
                    const w = Math.max(1, rect.w - inset * 2), h = Math.max(1, rect.h - inset * 2);
                    ctx.roundRect(rect.x + inset, rect.y + inset, w, h, Math.min(12, w / 2, h / 2));
                    ctx.fill(); ctx.stroke();
                    ctx.fillStyle = "#fff";
                    ctx.font = `700 ${Math.max(12, Math.min(72, rect.w * .6, rect.h * .28))}px Arial,sans-serif`;
                    ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 - 1);
                    if (hover && app.canvas?.canvas) app.canvas.canvas.style.cursor = "pointer";
                }
                if (inside(mouse, this.__cigImageRect) && app.canvas?.canvas) app.canvas.canvas.style.cursor = "pointer";
            } finally { ctx.restore(); }
        };
        let pendingFrame = null;
        const draw = function(ctx, options) {
            // Match ComfyUI's deferred image drawing to avoid Chrome's canvas
            // GPU upload regression. Coalesce repeated draws; never dirty here.
            const queued = pendingFrame !== null;
            pendingFrame = {
                ctx, options: { ...options }, transform: ctx.getTransform(), alpha: ctx.globalAlpha,
                y: Number(this.y ?? 0), height: Math.max(1, Number(this.computedHeight ?? 220)),
            };
            if (queued) return;
            queueMicrotask(() => {
                const frame = pendingFrame;
                pendingFrame = null;
                if (disposed || !patched.has(widget)) return;
                frame.ctx.save();
                try {
                    frame.ctx.setTransform(frame.transform);
                    frame.ctx.globalAlpha = frame.alpha;
                    paint.call(widget, frame.ctx, frame.options, frame);
                } finally { frame.ctx.restore(); }
            });
        };
        const down = function(pointer, nodeArg, canvas) {
            if (pointer?.eDown?.button != null && pointer.eDown.button !== 0) return originalPointer?.call(this, pointer, nodeArg, canvas) ?? false;
            const p = point(pointer?.eDown, canvas);
            let action;
            if (inside(p, this.__cigPrevRect)) action = () => navigate(-1);
            else if (inside(p, this.__cigNextRect)) action = () => navigate(1);
            else if (inside(p, this.__cigImageRect)) action = () => openGallery(node);
            if (!action) return originalPointer?.call(this, pointer, nodeArg, canvas) ?? false;
            pointer.onDragStart = undefined; pointer.onDragEnd = undefined; pointer.finally = undefined;
            // Consume the gesture so the stock preview cannot also open its viewer.
            pointer.onClick = () => { if (!disposed) action(); };
            return true;
        };
        widget.drawWidget = draw;
        widget.onPointerDown = down;
        patched.set(widget, { originalDraw, originalPointer, draw, down });
        dirty();
    }

    function refresh() {
        if (disposed) return;
        node.widgets?.forEach(patch);
        syncValues();
    }

    function setFolderValues(sourceFolder, sourceValues) {
        if (disposed) return;
        syncValues();
        if (sourceFolder !== folder) return;
        cancelRequest();
        listedFolder = sourceFolder;
        listedValues = sourceValues;
        attempts = 0;
        rebuild();
        dirty();
    }

    const hooks = [];
    function hook(name, after) {
        const original = node[name];
        const wrapped = function(...args) {
            const result = original?.apply(this, args);
            after(result, args);
            return result;
        };
        node[name] = wrapped;
        hooks.push([name, original, wrapped]);
    }
    hook("addCustomWidget", (result, args) => { patch(result ?? args[0]); syncValues(); });
    hook("onConfigure", refresh);
    hook("onExecuted", refresh);
    const originalRemoved = node.onRemoved;
    const removed = function(...args) { dispose(); return originalRemoved?.apply(this, args); };
    node.onRemoved = removed;

    function dispose() {
        if (disposed) return;
        disposed = true;
        cancelRequest();
        for (const [widget, state] of patched) {
            if (widget.drawWidget === state.draw) widget.drawWidget = state.originalDraw;
            if (widget.onPointerDown === state.down) widget.onPointerDown = state.originalPointer;
        }
        patched.clear();
        for (const [name, original, wrapped] of hooks) if (node[name] === wrapped) node[name] = original;
        if (node.onRemoved === removed) node.onRemoved = originalRemoved;
        delete node.__cigPreviewNavigation;
    }
    const controller = { refresh, setFolderValues, dispose };
    node.__cigPreviewNavigation = controller;
    refresh();
    return controller;
}
