// CIG_NODE_PANEL_V1
// The node's whole UI as one HTML (DOM) widget, so it works the same on the
// classic LiteGraph canvas and in Nodes 2.0 (Vue nodes):
//   name · resolution · position  [?]
//   the image (click: gallery, hold: ×5 zoom) with ‹ › arrows
//   [Output Gallery] [START]
// The stock widgets stay on the node for serialization and behaviour but are
// not drawn on it: the image combo and upload button remain in the properties
// panel; the two button widgets and the stock image preview are hidden. No
// side effects on import.

const PANEL_NAME = "cig_gallery_panel";
const STYLE_ID = "cig-node-panel-style";
const START_WIDGET = "▶ СТАРТ";
const OUTPUT_WIDGET = "Галерея output";
const PREVIEW_WIDGET = "$$canvas-image-preview";
const MIN_PANEL_HEIGHT = 240;
const DEFAULT_SIZE = [400, 460];
const CHANGE_CHECK_MS = 400;

const TEXT = {
    ru: { output: "Галерея output", start: "СТАРТ", help: "Инструкция", prev: "Предыдущее изображение", next: "Следующее изображение",
        open: "Клик — галерея, удержание — увеличение ×5", empty: "Нажмите, чтобы выбрать изображение", failed: "Не удалось загрузить изображение" },
    en: { output: "Output Gallery", start: "START", help: "Help", prev: "Previous image", next: "Next image",
        open: "Click: gallery · hold: zoom ×5", empty: "Click to choose an image", failed: "Could not load the image" },
};

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cig-node-panel{display:flex;flex-direction:column;gap:6px;width:100%;height:100%;min-height:0;box-sizing:border-box;padding:0 0 4px;font:12px/1.3 Inter,Arial,sans-serif;color:var(--input-text,#ddd)}
.cig-np-meta{display:flex;align-items:center;gap:8px;min-height:24px;padding:0 2px;min-width:0}
.cig-np-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto}
.cig-np-dims,.cig-np-pos{color:var(--descrip-text,#a3a3a3);white-space:nowrap;flex:none}
.cig-np-pos{margin-left:auto}
.cig-np-help{flex:none;width:22px;height:22px;padding:0;border:1px solid var(--border-color,#5a5a5a);border-radius:6px;background:transparent;color:var(--input-text,#ddd);font:700 12px/20px Arial,sans-serif;cursor:pointer}
.cig-np-help:hover{border-color:var(--input-text,#ddd)}
.cig-np-stage{position:relative;flex:1 1 auto;min-height:120px;border-radius:8px;background:rgba(0,0,0,.32);overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-touch-callout:none;user-select:none}
.cig-np-stage img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;-webkit-user-drag:none;pointer-events:none}
.cig-np-empty{padding:12px;color:var(--descrip-text,#a3a3a3);text-align:center}
.cig-np-arrow{position:absolute;top:50%;width:40px;height:40px;margin-top:-20px;padding:0;border:1px solid rgba(255,255,255,.24);border-radius:50%;background:rgba(10,10,10,.45);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:.6;transition:opacity .12s,background .12s}
.cig-np-stage:hover .cig-np-arrow{opacity:1}
.cig-np-arrow:hover{background:rgba(10,10,10,.72);border-color:#5b9bff}
.cig-np-arrow:disabled{opacity:.18;cursor:default}
.cig-np-prev{left:8px}.cig-np-next{right:8px}
.cig-np-actions{display:flex;gap:8px;flex:none}
.cig-np-btn{flex:1 1 0;min-width:0;height:36px;border:1px solid var(--border-color,#4e4e4e);border-radius:8px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font:600 13px Inter,Arial,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;overflow:hidden}
.cig-np-btn:hover{filter:brightness(1.18)}
.cig-np-btn.cig-np-start{background:#2f6fd6;border-color:#2f6fd6;color:#fff}
.cig-np-btn:disabled{opacity:.45;cursor:default;filter:none}
`;
    document.head.appendChild(style);
}

// Shows a widget nowhere on the node; `panel` keeps it in the properties panel.
// Uses the frontend's per-surface visibility when it has one (Nodes 2.0 era),
// else the legacy hidden flag.
// Returns whether anything changed.
function hideOnNode(widget, panel = false) {
    if (!widget) return false;
    const surfaces = widget.visibility?.surfaces;
    const panelTier = panel ? "shown" : "never";
    if (surfaces && "vueNode" in surfaces) {
        if (surfaces.canvas === "never" && surfaces.vueNode === "never" && surfaces.panel === panelTier) return false;
        surfaces.canvas = "never";
        surfaces.vueNode = "never";
        surfaces.panel = panelTier;
        return true;
    }
    if (widget.hidden) return false;
    widget.hidden = true;
    widget.computeSize = () => [0, -4];
    return true;
}

const isStockPreview = widget => widget?.name === PREVIEW_WIDGET || widget?.type === "IMAGE_PREVIEW";

export function installNodePanel(node, deps) {
    if (!node || node.__cigNodePanel) return node?.__cigNodePanel;
    const { api, app, getImageWidget, normalizePath, splitPath, openGallery, showHelp, holdToZoom, navigator, language } = deps;
    if (typeof node.addDOMWidget !== "function") return null;
    const t = TEXT[language === "ru" ? "ru" : "en"];
    injectStyles();

    // --- stock widgets: keep them, do not draw them on the node
    const hideStockWidget = widget => {
        if (!widget || widget.name === PANEL_NAME) return false;
        if (widget.name === "image" || widget.name === "upload") return hideOnNode(widget, true);
        if (widget.name === START_WIDGET || widget.name === OUTPUT_WIDGET || isStockPreview(widget)) return hideOnNode(widget, false);
        return false;
    };
    const hideStock = () => {
        let changed = false;
        for (const widget of node.widgets || []) changed = hideStockWidget(widget) || changed;
        if (changed) node.setDirtyCanvas?.(true, true);
    };
    node.hideOutputImages = true;   // Nodes 2.0 stock image preview
    hideStock();
    // Widgets added later (the Output Gallery button, the stock preview that
    // the frontend re-creates) are hidden the moment they are added.
    const wrapped = [];
    for (const method of ["addWidget", "addCustomWidget"]) {
        const original = node[method];
        if (typeof original !== "function") continue;
        const wrapper = function(...args) {
            const widget = original.apply(this, args);
            if (hideStockWidget(widget ?? args[0])) node.setDirtyCanvas?.(true, true);
            return widget;
        };
        node[method] = wrapper;
        wrapped.push([method, original, wrapper]);
    }

    // --- panel DOM
    const el = document.createElement("div");
    el.className = "cig-node-panel";
    el.innerHTML = `
        <div class="cig-np-meta">
            <span class="cig-np-name"></span><span class="cig-np-dims"></span><span class="cig-np-pos"></span>
            <button type="button" class="cig-np-help" title="${t.help}" aria-label="${t.help}">?</button>
        </div>
        <div class="cig-np-stage" role="button" tabindex="0" title="${t.open}" aria-label="${t.open}">
            <img alt="" draggable="false">
            <div class="cig-np-empty"></div>
            <button type="button" class="cig-np-arrow cig-np-prev" aria-label="${t.prev}" title="${t.prev}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></button>
            <button type="button" class="cig-np-arrow cig-np-next" aria-label="${t.next}" title="${t.next}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
        </div>
        <div class="cig-np-actions">
            <button type="button" class="cig-np-btn cig-np-output"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>${t.output}</button>
            <button type="button" class="cig-np-btn cig-np-start"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>${t.start}</button>
        </div>`;
    const q = s => el.querySelector(s);
    const nameEl = q(".cig-np-name"), dimsEl = q(".cig-np-dims"), posEl = q(".cig-np-pos");
    const stage = q(".cig-np-stage"), img = q("img"), emptyEl = q(".cig-np-empty");
    const prev = q(".cig-np-prev"), next = q(".cig-np-next");

    const panel = node.addDOMWidget(PANEL_NAME, "cig-gallery-panel", el, {
        serialize: false,
        getMinHeight: () => MIN_PANEL_HEIGHT,
    });
    if (panel) panel.serialize = false;   // not part of widgets_values
    // Not in the properties panel (and away from its DOM-widget width bug).
    if (panel?.visibility?.surfaces) panel.visibility.surfaces.panel = "never";
    else if (panel) panel.options.hideInPanel = true;

    // --- rendering
    let shownValue = null;
    function imageUrl(value) {
        const { folder, filename } = splitPath(value);
        const p = new URLSearchParams();
        p.set("folder", /^[A-Za-z]:$/.test(folder) ? folder + "/" : folder);
        p.set("filename", filename);
        return api.apiURL(`/image-gallery/original?${p.toString()}`);
    }
    function render() {
        const s = navigator?.state?.() ?? { value: normalizePath(String(getImageWidget(node)?.value ?? "")), index: -1, count: 0, canNavigate: false };
        const value = s.value;
        if (value !== shownValue) {
            shownValue = value;
            dimsEl.textContent = "";
            nameEl.textContent = value ? value.slice(value.lastIndexOf("/") + 1) : "";
            nameEl.title = value;
            if (value) {
                img.style.display = "";
                emptyEl.style.display = "none";
                img.src = imageUrl(value);
            } else {
                img.removeAttribute("src");
                img.style.display = "none";
                emptyEl.style.display = "";
                emptyEl.textContent = t.empty;
            }
        }
        posEl.textContent = s.count > 1 && s.index >= 0 ? `${s.index + 1} / ${s.count}` : "";
        prev.disabled = next.disabled = !s.canNavigate;
    }
    img.addEventListener("load", () => {
        if (img.naturalWidth) dimsEl.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
    });
    img.addEventListener("error", () => {
        if (!shownValue) return;
        img.style.display = "none";
        emptyEl.style.display = "";
        emptyEl.textContent = t.failed;
    });

    // --- interaction
    let hold = null;
    stage.addEventListener("pointerdown", event => {
        hold = null;
        if (event.target.closest(".cig-np-arrow")) return;
        hold = holdToZoom?.(event, () => img.naturalWidth ? { src: img.currentSrc || img.src } : null) ?? null;
    });
    stage.addEventListener("click", event => {
        if (event.target.closest(".cig-np-arrow")) return;
        if (hold?.used) { hold = null; return; }
        openGallery(node);
    });
    stage.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openGallery(node); }
        else if (event.key === "ArrowLeft") { event.preventDefault(); navigator?.navigate(-1); }
        else if (event.key === "ArrowRight") { event.preventDefault(); navigator?.navigate(1); }
    });
    prev.addEventListener("click", event => { event.stopPropagation(); navigator?.navigate(-1); });
    next.addEventListener("click", event => { event.stopPropagation(); navigator?.navigate(1); });
    q(".cig-np-help").addEventListener("click", event => { event.stopPropagation(); showHelp?.(); });
    const runWidget = (name, fallback) => {
        const widget = node.widgets?.find(w => w?.name === name);
        try {
            if (widget?.callback) widget.callback(widget.value, app.canvas, node, [0, 0], undefined);
            else fallback?.();
        } catch (error) { console.error("[ImageGallery] node panel button:", error); }
    };
    q(".cig-np-output").addEventListener("click", () => runWidget(OUTPUT_WIDGET));
    q(".cig-np-start").addEventListener("click", () => runWidget(START_WIDGET, () => app.queuePrompt(0, 1)));

    // --- change tracking: the navigator notifies; a light check catches values
    // changed from outside (properties panel, undo) while the panel is shown.
    const unsubscribe = navigator?.subscribe?.(render);
    const timer = setInterval(() => {
        if (!el.isConnected) return;
        hideStock();
        navigator?.refresh?.();
        render();
    }, CHANGE_CHECK_MS);

    const originalRemoved = node.onRemoved;
    node.onRemoved = function(...args) {
        clearInterval(timer);
        unsubscribe?.();
        for (const [method, original, wrapper] of wrapped) if (node[method] === wrapper) node[method] = original;
        delete node.__cigNodePanel;
        return originalRemoved?.apply(this, args);
    };

    // A new node gets room for the image once the frontend has sized it; a node
    // restored from a workflow (marked __cigFromWorkflow by loadedGraphNode,
    // which runs before the next frame) keeps its saved size.
    if (deps.isNew) {
        requestAnimationFrame(() => {
            if (node.__cigFromWorkflow || !node.graph || !(node.size?.length >= 2)) return;
            node.setSize?.([Math.max(node.size[0] || 0, DEFAULT_SIZE[0]), Math.max(node.size[1] || 0, DEFAULT_SIZE[1])]);
            node.setDirtyCanvas?.(true, true);
        });
    }

    const controller = { render, element: el, widget: panel };
    node.__cigNodePanel = controller;
    render();
    return controller;
}
