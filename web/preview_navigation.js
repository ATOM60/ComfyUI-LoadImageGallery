// One controller per node. No timers or render loop are needed to attach previews.
export function installGalleryPreviewNavigation(node, dependencies) {
    if (node.__cigPreviewNavigation) return node.__cigPreviewNavigation;
    const { app, api, getImageWidget, setWidgetValue, openGallery,
        normalizePath, splitPath, joinPath } = dependencies;
    const empty = [];
    const patched = new Map();
    const SORT_KEY = "ComfyUI-LoadImageGallery.sortMode";
    const FAVORITES_KEY = "ComfyUI-LoadImageGallery.favorites";
    let disposed = false;
    let folder = null;
    let values = empty;
    let cachedWidget, cachedValue, cachedOptions, cachedGallery;
    let optionsLength = -1, galleryLength = -1;
    let cachedSortMode = "", cachedFavoritesRaw = "";
    let listedFolder = null;
    let listedValues = empty;
    let listedMetaFolder = null;
    let listedMeta = new Map();
    let request = null;
    let retryTimer = null;
    let attempts = 0;
    let observed = false;

    const dirty = () => { if (!disposed) node.graph?.setDirtyCanvas?.(true, false); };
    const inside = (p, r) => !!p && !!r && p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h;
    const isPreview = w => w && (w.name === "$$canvas-image-preview" || w.type === "IMAGE_PREVIEW" ||
        (w.options?.canvasOnly === true && typeof w.drawWidget === "function" && typeof w.onPointerDown === "function"));

    function sortMode() {
        try { return localStorage.getItem(SORT_KEY) || "name-asc"; }
        catch (_) { return "name-asc"; }
    }

    function favoritesRaw() {
        try { return localStorage.getItem(FAVORITES_KEY) || "[]"; }
        catch (_) { return "[]"; }
    }

    function favoritesFrom(raw) {
        try {
            const data = JSON.parse(raw || "[]");
            return new Set(Array.isArray(data) ? data.map(v => normalizePath(String(v ?? ""))).filter(Boolean) : []);
        } catch (_) {
            return new Set();
        }
    }

    function compareNames(a, b) {
        return String(a).localeCompare(String(b), undefined, { numeric:true, sensitivity:"base" });
    }

    function orderValues(source) {
        const mode = sortMode();
        const favorites = favoritesFrom(favoritesRaw());
        const meta = listedMetaFolder === folder ? listedMeta : new Map();
        const sorted = [...source].sort((pathA, pathB) => {
            const nameA = splitPath(pathA).filename;
            const nameB = splitPath(pathB).filename;
            const metaA = meta.get(nameA) || {};
            const metaB = meta.get(nameB) || {};
            switch (mode) {
                case "name-desc": return -compareNames(nameA, nameB);
                case "date-desc": return (Number(metaB.mtime) || 0) - (Number(metaA.mtime) || 0) || compareNames(nameA, nameB);
                case "date-asc": return (Number(metaA.mtime) || 0) - (Number(metaB.mtime) || 0) || compareNames(nameA, nameB);
                case "size-desc": return (Number(metaB.size) || 0) - (Number(metaA.size) || 0) || compareNames(nameA, nameB);
                case "size-asc": return (Number(metaA.size) || 0) - (Number(metaB.size) || 0) || compareNames(nameA, nameB);
                default: return compareNames(nameA, nameB);
            }
        });
        return [
            ...sorted.filter(path => favorites.has(path)),
            ...sorted.filter(path => !favorites.has(path)),
        ];
    }

    function rebuild() {
        const seen = new Set();
        const collected = [];
        // A successful directory listing is authoritative (including deletions).
        const sources = listedFolder === folder ? [listedValues] : [cachedOptions, cachedGallery];
        for (const source of sources) for (const item of source || empty) {
            const path = normalizePath(String(item ?? ""));
            if (path && splitPath(path).folder === folder && !seen.has(path)) {
                seen.add(path);
                collected.push(path);
            }
        }
        values = orderValues(collected);
    }

    function cancelRequest() {
        request?.controller.abort();
        request = null;
        if (retryTimer !== null) clearTimeout(retryTimer);
        retryTimer = null;
    }

    async function loadFolder() {
        const complete = listedFolder === folder && listedMetaFolder === folder;
        if (disposed || folder === null || complete || request || retryTimer !== null || attempts >= 3) return;
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
            listedMetaFolder = folder;
            listedMeta = new Map((Array.isArray(data.items) ? data.items : []).map(item => [String(item?.name ?? ""), item || {}]));
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

    // The fast path compares scalar values, array identities/lengths and the two
    // gallery-order settings. It does not rescan the directory on render frames.
    function syncValues() {
        const widget = getImageWidget(node);
        const raw = widget?.value ?? node.properties?.__cigLastImage ?? "";
        const options = Array.isArray(widget?.options?.values) ? widget.options.values : empty;
        const gallery = Array.isArray(node.__cigGalleryValues) ? node.__cigGalleryValues : empty;
        const mode = sortMode();
        const favoriteState = favoritesRaw();
        if (observed && widget === cachedWidget && raw === cachedValue && options === cachedOptions &&
            gallery === cachedGallery && options.length === optionsLength && gallery.length === galleryLength &&
            mode === cachedSortMode && favoriteState === cachedFavoritesRaw) return;
        observed = true;
        cachedWidget = widget; cachedValue = raw;
        cachedOptions = options; cachedGallery = gallery;
        optionsLength = options.length; galleryLength = gallery.length;
        cachedSortMode = mode; cachedFavoritesRaw = favoriteState;
        const current = normalizePath(String(raw));
        const nextFolder = current ? splitPath(current).folder : null;
        if (nextFolder !== folder) {
            cancelRequest();
            folder = nextFolder;
            listedFolder = null;
            listedValues = empty;
            listedMetaFolder = null;
            listedMeta = new Map();
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
        const draw = function(ctx, options) {
            if (disposed) return originalDraw?.call(this, ctx, options);
            syncValues();
            const width = Math.max(0, Number(options?.width ?? node.size?.[0] ?? 320));
            const y = Number(this.y ?? 0);
            const height = Math.max(1, Number(this.computedHeight ?? 220));
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
            this.__cigImageRect = null;
            if (iw > 0 && ih > 0) {
                const scale = Math.min(imageWidth / iw, imageHeight / ih);
                const w = iw * scale, h = ih * scale;
                this.__cigImageRect = { x: (width - w) / 2, y: y + (height - h) / 2, w, h };
            }
            // Expand the click targets across ALL space beside the fitted image.
            // The minimum reserved lanes only prevent narrow portraits losing arrows.
            const imageRect = this.__cigImageRect;
            const leftWidth = imageRect ? Math.max(0, imageRect.x - gap - outer) : side;
            const rightX = imageRect ? imageRect.x + imageRect.w + gap : width - outer - side;
            this.__cigPrevRect = showControls ? { x: outer, y, w: leftWidth, h: height } : null;
            this.__cigNextRect = showControls ? { x: rightX, y, w: Math.max(0, width - outer - rightX), h: height } : null;
            ctx.save();
            try {
                // Paint inside the widget's current clip and z-order. Deferring a
                // full-widget background until a microtask can erase later widgets.
                ctx.beginPath();
                ctx.rect(0, y, width, height);
                ctx.clip();
                const alpha = ctx.globalAlpha;
                ctx.fillStyle = "#111";
                ctx.fillRect(0, y, width, height);
                if (imageRect) ctx.drawImage(img, imageRect.x, imageRect.y, imageRect.w, imageRect.h);
                const mouse = point(null, app.canvas);
                for (const [rect, label] of [[this.__cigPrevRect, "‹"], [this.__cigNextRect, "›"]]) {
                    if (!rect) continue;
                    const hover = enabled && inside(mouse, rect);
                    ctx.globalAlpha = alpha * (enabled ? 1 : .35);
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
        listedFolder = sourceFolder;
        listedValues = sourceValues;
        attempts = 0;
        rebuild();
        dirty();
        // The gallery can provide filenames before this controller has fetched
        // metadata. Keep one bounded listing request so date/size sorting is exact.
        void loadFolder();
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
