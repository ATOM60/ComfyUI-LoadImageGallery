import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputFullscreenPreserveComfyUI";
const STYLE_ID = "cig-output-fullscreen-preserve-comfy-ui-style";
const KEEP_SELECTOR = [
    '.side-tool-bar-container',
    '[data-testid="topbar-workflow-tabs"]',
    '[data-testid="top-menu-actionbars"]',
    '.workflow-tabs-container',
].join(',');

function visibleRect(el) {
    if (!(el instanceof HTMLElement)) return null;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return rect;
}

function computeTopInset() {
    let top = 0;
    for (const selector of ['[data-testid="topbar-workflow-tabs"]', '.workflow-tabs-container']) {
        document.querySelectorAll(selector).forEach(el => {
            const r = visibleRect(el);
            if (!r || r.top > 4 || r.bottom <= 0) return;
            top = Math.max(top, r.bottom);
        });
    }
    return Math.min(120, Math.max(0, Math.round(top)));
}

function appRootsToPreserve() {
    const roots = new Set();
    for (const el of document.querySelectorAll(KEEP_SELECTOR)) {
        let node = el;
        while (node?.parentElement && node.parentElement !== document.body) node = node.parentElement;
        if (node?.parentElement === document.body && !node.classList.contains('ovg-modal')) roots.add(node);
    }
    return roots;
}

function markRoots() {
    document.querySelectorAll('[data-cig-fullscreen-ui-root="1"]').forEach(el => {
        el.removeAttribute('data-cig-fullscreen-ui-root');
    });
    for (const root of appRootsToPreserve()) root.setAttribute('data-cig-fullscreen-ui-root', '1');
}

function applyLayout() {
    const thumb = document.querySelector('.ovg-thumb.cig-pseudo-fullscreen');
    if (!(thumb instanceof HTMLElement)) return;
    thumb.style.setProperty('--cig-pseudo-top', `${computeTopInset()}px`);
    thumb.style.removeProperty('--cig-pseudo-left');
    thumb.style.removeProperty('--cig-pseudo-right');
    markRoots();
}

function clearLayout() {
    document.querySelectorAll('.ovg-thumb').forEach(el => {
        if (!(el instanceof HTMLElement)) return;
        el.style.removeProperty('--cig-pseudo-left');
        el.style.removeProperty('--cig-pseudo-right');
    });
    document.querySelectorAll('[data-cig-fullscreen-ui-root="1"]').forEach(el => {
        el.removeAttribute('data-cig-fullscreen-ui-root');
    });
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
body.cig-output-pseudo-fullscreen-open .ovg-modal{
    background:#000!important;
    pointer-events:none!important;
}
body.cig-output-pseudo-fullscreen-open .ovg-window{
    background:transparent!important;
    border-color:transparent!important;
    box-shadow:none!important;
    pointer-events:none!important;
}
body.cig-output-pseudo-fullscreen-open .ovg-window > :not(.ovg-grid-wrap){
    visibility:hidden!important;
    pointer-events:none!important;
}
body.cig-output-pseudo-fullscreen-open .ovg-grid-wrap,
body.cig-output-pseudo-fullscreen-open .ovg-grid{
    background:transparent!important;
    pointer-events:none!important;
    overflow:visible!important;
}
body.cig-output-pseudo-fullscreen-open .ovg-card:not(:has(.cig-pseudo-fullscreen)){
    visibility:hidden!important;
}
body.cig-output-pseudo-fullscreen-open .ovg-card:has(.cig-pseudo-fullscreen),
body.cig-output-pseudo-fullscreen-open .ovg-thumb.cig-pseudo-fullscreen,
body.cig-output-pseudo-fullscreen-open .ovg-thumb.cig-pseudo-fullscreen video,
body.cig-output-pseudo-fullscreen-open .ovg-thumb.cig-pseudo-fullscreen button{
    visibility:visible!important;
    pointer-events:auto!important;
}
body.cig-output-pseudo-fullscreen-open .ovg-thumb.cig-pseudo-fullscreen{
    left:0!important;
    right:0!important;
    width:100vw!important;
    height:calc(100vh - var(--cig-pseudo-top,0px))!important;
}

/* Lift only the ComfyUI app root(s) that contain controls we explicitly keep.
   Everything in those roots is hidden by default, then the selected chrome is
   made visible again. This prevents the graph, panels and other UI from showing
   through the fullscreen gallery. */
body.cig-output-pseudo-fullscreen-open > [data-cig-fullscreen-ui-root="1"]{
    position:relative!important;
    z-index:2147483600!important;
    visibility:hidden!important;
    pointer-events:none!important;
}
body.cig-output-pseudo-fullscreen-open > [data-cig-fullscreen-ui-root="1"] *{
    visibility:hidden!important;
    pointer-events:none!important;
}

/* Keep the ancestors of selected chrome invisible but layout-preserving and
   unclipped; only the selected controls themselves and their descendants show. */
body.cig-output-pseudo-fullscreen-open > [data-cig-fullscreen-ui-root="1"] *:has(.side-tool-bar-container),
body.cig-output-pseudo-fullscreen-open > [data-cig-fullscreen-ui-root="1"] *:has([data-testid="topbar-workflow-tabs"]),
body.cig-output-pseudo-fullscreen-open > [data-cig-fullscreen-ui-root="1"] *:has([data-testid="top-menu-actionbars"]),
body.cig-output-pseudo-fullscreen-open > [data-cig-fullscreen-ui-root="1"] *:has(.workflow-tabs-container){
    overflow:visible!important;
}
body.cig-output-pseudo-fullscreen-open .side-tool-bar-container,
body.cig-output-pseudo-fullscreen-open .side-tool-bar-container *,
body.cig-output-pseudo-fullscreen-open [data-testid="topbar-workflow-tabs"],
body.cig-output-pseudo-fullscreen-open [data-testid="topbar-workflow-tabs"] *,
body.cig-output-pseudo-fullscreen-open [data-testid="top-menu-actionbars"],
body.cig-output-pseudo-fullscreen-open [data-testid="top-menu-actionbars"] *,
body.cig-output-pseudo-fullscreen-open .workflow-tabs-container,
body.cig-output-pseudo-fullscreen-open .workflow-tabs-container *{
    visibility:visible!important;
    opacity:1!important;
    pointer-events:auto!important;
}
body.cig-output-pseudo-fullscreen-open .side-tool-bar-container,
body.cig-output-pseudo-fullscreen-open [data-testid="topbar-workflow-tabs"],
body.cig-output-pseudo-fullscreen-open [data-testid="top-menu-actionbars"],
body.cig-output-pseudo-fullscreen-open .workflow-tabs-container{
    z-index:2147483640!important;
}
`;
    document.head.appendChild(style);
}

function sync() {
    if (document.body.classList.contains('cig-output-pseudo-fullscreen-open')) {
        markRoots();
        requestAnimationFrame(applyLayout);
        setTimeout(applyLayout, 50);
        setTimeout(applyLayout, 180);
    } else {
        clearLayout();
    }
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        sync();

        const observer = new MutationObserver(sync);
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class'],
        });

        window.addEventListener('resize', sync);
        document.addEventListener('fullscreenchange', sync, true);
        document.addEventListener('webkitfullscreenchange', sync, true);
    },
});
