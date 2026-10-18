// CIG_NODE_NAVIGATOR_V2
// One navigator per node: the ordered list the ‹ › arrows walk and the
// current position in it. It draws nothing; the node panel (node_panel.js)
// renders the arrows and calls navigate(). No timers or render loop: the list
// is rebuilt only when the image, the gallery listing or an order setting
// changes, and the folder is listed once per folder (with bounded retries).
export function installGalleryPreviewNavigation(node, dependencies) {
    if (node.__cigPreviewNavigation) return node.__cigPreviewNavigation;
    const { api, getImageWidget, setWidgetValue, normalizePath, splitPath, joinPath } = dependencies;
    const empty = [];
    const SORT_KEY = "ComfyUI-LoadImageGallery.sortMode";
    const FAVORITES_KEY = "ComfyUI-LoadImageGallery.favorites";
    const SUBFOLDERS_KEY = "ComfyUI-LoadImageGallery.includeSubfolders";
    let disposed = false;
    // The arrows walk `folder`. With the gallery's Subfolders toggle on (`flat`)
    // that is every image below the folder the image was picked from, in the
    // same flat order the gallery shows; otherwise the image's own folder.
    let folder = null;
    let flat = false;
    let values = empty;
    let cachedWidget, cachedValue, cachedOptions, cachedGallery;
    let optionsLength = -1, galleryLength = -1;
    let cachedSortMode = "", cachedFavoritesRaw = "", cachedFlat = false, cachedNavFolder;
    let listedFolder = null;
    let listedValues = empty;
    let listedMetaFolder = null;
    let listedMeta = new Map();
    let request = null;
    let retryTimer = null;
    let attempts = 0;
    let observed = false;
    const listeners = new Set();

    function notify() {
        if (disposed) return;
        for (const listener of [...listeners]) {
            try { listener(); } catch (error) { console.warn("[ImageGallery] navigator listener:", error); }
        }
    }

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

    function flatMode() {
        try { return localStorage.getItem(SUBFOLDERS_KEY) === "1"; }
        catch (_) { return false; }
    }

    function navFolder() {
        const value = node.properties?.__cigNavFolder;
        return typeof value === "string" ? normalizePath(value) : null;
    }

    const isAbsolute = path => /^[A-Za-z]:\//.test(path) || path.startsWith("//");
    const within = (path, scope) => scope ? path.startsWith(scope + "/") : !!path && !isAbsolute(path);
    const belongs = path => flat ? within(path, folder) : splitPath(path).folder === folder;
    // Path relative to `folder`: the key of the listing's metadata.
    const relName = path => folder ? path.slice(folder.length + 1) : path;
    const baseName = path => path.slice(path.lastIndexOf("/") + 1);
    // normalizePath() turns a drive root "E:/" into "E:"; the server needs the slash.
    const apiFolder = value => /^[A-Za-z]:$/.test(value) ? value + "/" : value;

    function compareText(a, b) {
        return String(a).localeCompare(String(b), undefined, { numeric:true, sensitivity:"base" });
    }

    // File name first, as in the gallery; the path only breaks ties.
    function compareNames(a, b) {
        return compareText(baseName(a), baseName(b)) || compareText(a, b);
    }

    function orderValues(source) {
        const mode = sortMode();
        const favorites = favoritesFrom(favoritesRaw());
        const meta = listedMetaFolder === folder ? listedMeta : new Map();
        const sorted = [...source].sort((pathA, pathB) => {
            const metaA = meta.get(relName(pathA)) || {};
            const metaB = meta.get(relName(pathB)) || {};
            switch (mode) {
                case "name-desc": return -compareNames(pathA, pathB);
                case "date-desc": return (Number(metaB.mtime) || 0) - (Number(metaA.mtime) || 0) || compareNames(pathA, pathB);
                case "date-asc": return (Number(metaA.mtime) || 0) - (Number(metaB.mtime) || 0) || compareNames(pathA, pathB);
                case "size-desc": return (Number(metaB.size) || 0) - (Number(metaA.size) || 0) || compareNames(pathA, pathB);
                case "size-asc": return (Number(metaA.size) || 0) - (Number(metaB.size) || 0) || compareNames(pathA, pathB);
                default: return compareNames(pathA, pathB);
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
            if (path && belongs(path) && !seen.has(path)) {
                seen.add(path);
                collected.push(path);
            }
        }
        values = orderValues(collected);
        notify();
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
        const pending = { folder, flat, controller: new AbortController() };
        request = pending;
        attempts++;
        try {
            const query = `folder=${encodeURIComponent(apiFolder(pending.folder))}${pending.flat ? "&recursive=1" : ""}`;
            const response = await api.fetchApi(`/image-gallery/list?${query}`, { signal: pending.controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (disposed || request !== pending || folder !== pending.folder || flat !== pending.flat) return;
            // A gallery refresh can supply newer filenames while this metadata
            // request is in flight. Keep that list and only fill in its metadata.
            if (listedFolder !== folder) {
                listedFolder = folder;
                listedValues = (Array.isArray(data.images) ? data.images : []).map(name => joinPath(folder, String(name)));
            }
            listedMetaFolder = folder;
            listedMeta = new Map((Array.isArray(data.items) ? data.items : []).map(item => [String(item?.name ?? ""), item || {}]));
            rebuild();
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

    // The fast path compares scalar values, array identities/lengths and the
    // gallery-order settings, so it is cheap enough to call on every change check.
    function syncValues() {
        if (disposed) return;
        const widget = getImageWidget(node);
        const raw = widget?.value ?? node.properties?.__cigLastImage ?? "";
        const options = Array.isArray(widget?.options?.values) ? widget.options.values : empty;
        const gallery = Array.isArray(node.__cigGalleryValues) ? node.__cigGalleryValues : empty;
        const mode = sortMode();
        const favoriteState = favoritesRaw();
        const flatNow = flatMode();
        const nav = navFolder();
        if (observed && widget === cachedWidget && raw === cachedValue && options === cachedOptions &&
            gallery === cachedGallery && options.length === optionsLength && gallery.length === galleryLength &&
            mode === cachedSortMode && favoriteState === cachedFavoritesRaw &&
            flatNow === cachedFlat && nav === cachedNavFolder) return;
        observed = true;
        cachedWidget = widget; cachedValue = raw;
        cachedOptions = options; cachedGallery = gallery;
        optionsLength = options.length; galleryLength = gallery.length;
        cachedSortMode = mode; cachedFavoritesRaw = favoriteState;
        cachedFlat = flatNow; cachedNavFolder = nav;
        const current = normalizePath(String(raw));
        // An image picked outside the remembered folder walks its own folder (and,
        // in the flat view, that folder's subfolders).
        const nextFolder = !current ? null
            : flatNow && nav !== null && within(current, nav) ? nav : splitPath(current).folder;
        const nextFlat = flatNow && nextFolder !== null;
        if (nextFolder !== folder || nextFlat !== flat) {
            cancelRequest();
            folder = nextFolder;
            flat = nextFlat;
            listedFolder = null;
            listedValues = empty;
            listedMetaFolder = null;
            listedMeta = new Map();
            attempts = 0;
        }
        rebuild();
        void loadFolder();
    }

    function currentValue() {
        return normalizePath(String(getImageWidget(node)?.value ?? node.properties?.__cigLastImage ?? ""));
    }

    function navigate(direction) {
        syncValues();
        if (values.length < 2) return;
        const index = values.indexOf(currentValue());
        const next = values[index < 0 ? (direction < 0 ? values.length - 1 : 0) : (index + direction + values.length) % values.length];
        node.__cigFolder = flat ? apiFolder(folder) : splitPath(next).folder;
        setWidgetValue(node, next);
        syncValues();
    }

    /** { value, index (-1 when unknown), count, canNavigate, loading } */
    function state() {
        const value = currentValue();
        return {
            value,
            index: values.indexOf(value),
            count: values.length,
            canNavigate: values.length > 1,
            loading: folder !== null && listedFolder !== folder,
        };
    }

    function setFolderValues(sourceFolder, sourceValues) {
        if (disposed) return;
        syncValues();
        if (normalizePath(String(sourceFolder ?? "")) !== folder) return;
        listedFolder = folder;
        listedValues = sourceValues;
        attempts = 0;
        rebuild();
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
    hook("onConfigure", () => syncValues());
    hook("onExecuted", () => syncValues());
    const originalRemoved = node.onRemoved;
    const removed = function(...args) { dispose(); return originalRemoved?.apply(this, args); };
    node.onRemoved = removed;

    function dispose() {
        if (disposed) return;
        disposed = true;
        cancelRequest();
        listeners.clear();
        for (const [name, original, wrapped] of hooks) if (node[name] === wrapped) node[name] = original;
        if (node.onRemoved === removed) node.onRemoved = originalRemoved;
        delete node.__cigPreviewNavigation;
    }

    const controller = {
        refresh: syncValues,
        setFolderValues,
        navigate,
        state,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dispose,
    };
    node.__cigPreviewNavigation = controller;
    syncValues();
    return controller;
}
