import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.InputThumbSize";
const STYLE_ID = "cig-input-thumb-size-style";
const SIZE_KEY = "ComfyUI-LoadImageGallery.inputThumbSize";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const MIN_SIZE = 120;
const MAX_SIZE = 320;
const DEFAULT_SIZE = 150;

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en")
    .toLowerCase().startsWith("ru");

const TEXT = RU ? {
    title: "Размер превью",
    helpTitle: "Размер превью",
    helpText: "Ползунок справа от поиска меняет размер карточек и превью изображений. Выбранный масштаб запоминается.",
} : {
    title: "Preview size",
    helpTitle: "Preview size",
    helpText: "The slider to the right of search changes image card and preview size. The selected size is remembered.",
};

function clampSize(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_SIZE;
    return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n / 10) * 10));
}

function loadSize() {
    try { return clampSize(localStorage.getItem(SIZE_KEY) ?? DEFAULT_SIZE); }
    catch (_) { return DEFAULT_SIZE; }
}

function saveSize(value) {
    try { localStorage.setItem(SIZE_KEY, String(clampSize(value))); }
    catch (_) {}
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cig-header .cig-size{
    flex:0 0 110px;
    width:110px;
    min-width:80px;
    max-width:130px;
    height:38px;
    margin:0;
    padding:0;
    accent-color:#fff;
    cursor:pointer;
}
.cig-grid{
    grid-template-columns:repeat(auto-fill,minmax(var(--cig-card-size,150px),1fr))!important;
}
@media(max-width:700px){
    .cig-header .cig-size{flex-basis:90px;width:90px;min-width:72px}
    .cig-grid{grid-template-columns:repeat(auto-fill,minmax(var(--cig-card-size,150px),1fr))!important}
}
`;
    document.head.appendChild(style);
}

function cardKey(card) {
    return String(card?.__cigRelative || card?.title || "");
}

function captureViewport(body, grid) {
    if (!(body instanceof HTMLElement) || !(grid instanceof HTMLElement)) return null;
    const bodyRect = body.getBoundingClientRect();
    let anchor = null;
    let bestTop = Infinity;
    for (const card of grid.querySelectorAll(".cig-card,.cig-folder-card")) {
        const r = card.getBoundingClientRect();
        if (r.bottom <= bodyRect.top || r.top >= bodyRect.bottom) continue;
        if (r.top < bestTop) {
            bestTop = r.top;
            anchor = card;
        }
    }
    return {
        top: body.scrollTop,
        left: body.scrollLeft,
        anchorKey: anchor ? cardKey(anchor) : "",
        anchorOffset: anchor ? anchor.getBoundingClientRect().top - bodyRect.top : 0,
    };
}

function restoreViewport(body, grid, snapshot) {
    if (!snapshot || !(body instanceof HTMLElement) || !(grid instanceof HTMLElement)) return;
    body.scrollLeft = snapshot.left;
    if (snapshot.anchorKey) {
        const anchor = [...grid.querySelectorAll(".cig-card,.cig-folder-card")]
            .find(card => cardKey(card) === snapshot.anchorKey);
        if (anchor) {
            const bodyRect = body.getBoundingClientRect();
            const currentOffset = anchor.getBoundingClientRect().top - bodyRect.top;
            body.scrollTop += currentOffset - snapshot.anchorOffset;
            return;
        }
    }
    body.scrollTop = snapshot.top;
}

function applySize(overlay, size, { preserveViewport = false } = {}) {
    const grid = overlay.querySelector(".cig-grid");
    const body = overlay.querySelector(".cig-body");
    if (!(grid instanceof HTMLElement)) return;

    const snapshot = preserveViewport ? captureViewport(body, grid) : null;
    const oldAnchor = body?.style?.overflowAnchor || "";
    const oldBehavior = body?.style?.scrollBehavior || "";
    if (body) {
        body.style.overflowAnchor = "none";
        body.style.scrollBehavior = "auto";
    }

    grid.style.setProperty("--cig-card-size", `${clampSize(size)}px`);

    if (snapshot && body) {
        restoreViewport(body, grid, snapshot);
        requestAnimationFrame(() => {
            restoreViewport(body, grid, snapshot);
            requestAnimationFrame(() => {
                restoreViewport(body, grid, snapshot);
                body.style.overflowAnchor = oldAnchor;
                body.style.scrollBehavior = oldBehavior;
            });
        });
    } else if (body) {
        body.style.overflowAnchor = oldAnchor;
        body.style.scrollBehavior = oldBehavior;
    }
}

function installOverlay(overlay) {
    if (!(overlay instanceof HTMLElement) || overlay.dataset.cigThumbSizeInstalled === "1") return;
    const search = overlay.querySelector(".cig-search");
    if (!(search instanceof HTMLInputElement)) return;

    overlay.dataset.cigThumbSizeInstalled = "1";
    const size = loadSize();

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "cig-size";
    slider.min = String(MIN_SIZE);
    slider.max = String(MAX_SIZE);
    slider.step = "10";
    slider.value = String(size);
    slider.title = TEXT.title;
    slider.setAttribute("aria-label", TEXT.title);
    search.insertAdjacentElement("afterend", slider);

    applySize(overlay, size);

    slider.addEventListener("input", event => {
        const next = clampSize(event.target?.value);
        saveSize(next);
        applySize(overlay, next, { preserveViewport: true });
    });
}

function installHelp(overlay) {
    if (!(overlay instanceof HTMLElement) || overlay.dataset.cigThumbSizeHelp === "1") return;
    const box = overlay.firstElementChild;
    const content = box?.lastElementChild;
    if (!(content instanceof HTMLElement)) return;

    overlay.dataset.cigThumbSizeHelp = "1";
    const row = document.createElement("div");
    row.style.cssText = "padding:10px 0;border-bottom:1px solid #303030";
    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;font-size:14px;margin-bottom:4px";
    title.textContent = TEXT.helpTitle;
    const text = document.createElement("div");
    text.style.cssText = "font-size:13px;line-height:1.45;color:#bbb";
    text.textContent = TEXT.helpText;
    row.append(title, text);
    content.appendChild(row);
}

function scan(root = document) {
    if (root instanceof HTMLElement && root.classList.contains("cig-overlay")) installOverlay(root);
    if (root instanceof HTMLElement && root.classList.contains("cig-help-overlay")) installHelp(root);
    root.querySelectorAll?.(".cig-overlay").forEach(installOverlay);
    root.querySelectorAll?.(".cig-help-overlay").forEach(installHelp);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        injectStyles();
        scan();

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof Element) scan(node);
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: false });
    },
});
