import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputFullscreenPreserveComfyUI";
const STYLE_ID = "cig-output-fullscreen-preserve-comfy-ui-style";

function px(n) {
    return `${Math.max(0, Math.round(Number(n) || 0))}px`;
}

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
    const selectors = [
        '[data-testid="topbar-workflow-tabs"]',
        '[data-testid="top-menu-actionbars"]',
        '.workflow-tabs-container',
    ];

    for (const selector of selectors) {
        document.querySelectorAll(selector).forEach(el => {
            const r = visibleRect(el);
            if (!r || r.top > 4 || r.bottom <= 0) return;
            top = Math.max(top, r.bottom);
        });
    }

    return Math.min(120, Math.max(0, top));
}

function applyLayout() {
    const thumb = document.querySelector('.ovg-thumb.cig-pseudo-fullscreen');
    if (!(thumb instanceof HTMLElement)) return;
    thumb.style.setProperty('--cig-pseudo-top', px(computeTopInset()));
    thumb.style.removeProperty('--cig-pseudo-left');
    thumb.style.removeProperty('--cig-pseudo-right');
}

function clearLayout() {
    document.querySelectorAll('.ovg-thumb').forEach(el => {
        if (!(el instanceof HTMLElement)) return;
        el.style.removeProperty('--cig-pseudo-left');
        el.style.removeProperty('--cig-pseudo-right');
    });
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
body.cig-output-pseudo-fullscreen-open .ovg-modal{
    background:transparent!important;
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

/* Video uses the entire screen width. ComfyUI controls are overlaid on top. */
body.cig-output-pseudo-fullscreen-open .ovg-thumb.cig-pseudo-fullscreen{
    left:0!important;
    right:0!important;
    width:100vw!important;
    height:calc(100vh - var(--cig-pseudo-top,0px))!important;
}

/* Keep current ComfyUI chrome above the fullscreen video instead of reserving
   horizontal space for it. */
body.cig-output-pseudo-fullscreen-open .side-tool-bar-container,
body.cig-output-pseudo-fullscreen-open [data-testid="topbar-workflow-tabs"],
body.cig-output-pseudo-fullscreen-open [data-testid="top-menu-actionbars"],
body.cig-output-pseudo-fullscreen-open .workflow-tabs-container{
    visibility:visible!important;
    opacity:1!important;
    pointer-events:auto!important;
    position:relative!important;
    z-index:2147483600!important;
}
body.cig-output-pseudo-fullscreen-open *:has(> .side-tool-bar-container),
body.cig-output-pseudo-fullscreen-open *:has(> [data-testid="topbar-workflow-tabs"]),
body.cig-output-pseudo-fullscreen-open *:has(> [data-testid="top-menu-actionbars"]),
body.cig-output-pseudo-fullscreen-open *:has(> .workflow-tabs-container){
    position:relative!important;
    z-index:2147483590!important;
    overflow:visible!important;
}
`;
    document.head.appendChild(style);
}

function sync() {
    if (document.body.classList.contains('cig-output-pseudo-fullscreen-open')) {
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
