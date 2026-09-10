import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputFullscreenComfyPortal";
const OLD_STYLE_ID = "cig-output-fullscreen-preserve-comfy-ui-style";
const STYLE_ID = "cig-output-fullscreen-comfy-portal-style";
const BACKDROP_ID = "cig-output-fullscreen-backdrop";
const PORTAL_Z = 2147483644;
const BACKDROP_Z = 2147482500;

const moved = [];
let syncing = false;

function isOpen() {
    return document.body.classList.contains("cig-output-pseudo-fullscreen-open");
}

function visibleRect(el) {
    if (!(el instanceof HTMLElement)) return null;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return rect;
}

function uniqueTargets() {
    const targets = [];
    const push = el => {
        if (!(el instanceof HTMLElement)) return;
        if (targets.includes(el)) return;
        if (targets.some(existing => existing.contains(el) || el.contains(existing))) return;
        targets.push(el);
    };

    // Workflow tabs / top ComfyUI strip.
    push(document.querySelector('[data-testid="topbar-workflow-tabs"]') || document.querySelector('.workflow-tabs-container'));
    // Buttons in the upper-right corner.
    push(document.querySelector('[data-testid="top-menu-actionbars"]'));
    // Vertical ComfyUI toolbar. Prefer its layout wrapper so height/position survive.
    push(document.querySelector('.side-toolbar-container') || document.querySelector('.side-tool-bar-container'));

    return targets;
}

function makeRecord(el) {
    const rect = visibleRect(el);
    if (!rect || !el.parentNode) return null;
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    return {
        el,
        placeholder: document.createComment("cig-fullscreen-portal"),
        parent: el.parentNode,
        cssText: el.style.cssText,
        rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            rightGap: Math.max(0, vw - rect.right),
            bottomGap: Math.max(0, vh - rect.bottom),
            wide: rect.width >= vw * 0.55,
            tall: rect.height >= vh * 0.55,
            rightAnchored: rect.left + rect.width / 2 >= vw / 2,
        },
    };
}

function positionRecord(record) {
    const { el, rect } = record;
    const s = el.style;
    s.setProperty("position", "fixed", "important");
    s.setProperty("z-index", String(PORTAL_Z), "important");
    s.setProperty("margin", "0", "important");
    s.setProperty("transform", "none", "important");
    s.setProperty("visibility", "visible", "important");
    s.setProperty("opacity", "1", "important");
    s.setProperty("pointer-events", "auto", "important");

    if (rect.wide) {
        s.setProperty("left", `${Math.max(0, rect.left)}px`, "important");
        s.setProperty("right", `${Math.max(0, rect.rightGap)}px`, "important");
        s.setProperty("width", "auto", "important");
    } else if (rect.rightAnchored) {
        s.removeProperty("left");
        s.setProperty("right", `${Math.max(0, rect.rightGap)}px`, "important");
        s.setProperty("width", `${Math.max(1, rect.width)}px`, "important");
    } else {
        s.setProperty("left", `${Math.max(0, rect.left)}px`, "important");
        s.removeProperty("right");
        s.setProperty("width", `${Math.max(1, rect.width)}px`, "important");
    }

    s.setProperty("top", `${Math.max(0, rect.top)}px`, "important");
    if (rect.tall) {
        s.setProperty("bottom", `${Math.max(0, rect.bottomGap)}px`, "important");
        s.setProperty("height", "auto", "important");
    } else {
        s.removeProperty("bottom");
        s.setProperty("height", `${Math.max(1, rect.height)}px`, "important");
    }
}

function ensureBackdrop() {
    let backdrop = document.getElementById(BACKDROP_ID);
    if (!(backdrop instanceof HTMLElement)) {
        backdrop = document.createElement("div");
        backdrop.id = BACKDROP_ID;
        document.body.appendChild(backdrop);
    }
    return backdrop;
}

function setVideoTopInset() {
    const thumb = document.querySelector('.ovg-thumb.cig-pseudo-fullscreen');
    if (!(thumb instanceof HTMLElement)) return;

    let top = 0;
    const tab = moved.find(r => r.el.matches?.('[data-testid="topbar-workflow-tabs"],.workflow-tabs-container'));
    if (tab) top = Math.max(0, Math.min(120, tab.rect.top + tab.rect.height));
    thumb.style.setProperty("--cig-pseudo-top", `${Math.round(top)}px`);
    thumb.style.removeProperty("--cig-pseudo-left");
    thumb.style.removeProperty("--cig-pseudo-right");
}

function portalControls() {
    if (moved.length) {
        moved.forEach(positionRecord);
        setVideoTopInset();
        return;
    }

    const records = uniqueTargets().map(makeRecord).filter(Boolean);
    for (const record of records) record.parent.insertBefore(record.placeholder, record.el);
    for (const record of records) {
        document.body.appendChild(record.el);
        record.el.dataset.cigFullscreenPortal = "1";
        moved.push(record);
        positionRecord(record);
    }
    ensureBackdrop();
    setVideoTopInset();
}

function restoreControls() {
    while (moved.length) {
        const record = moved.pop();
        const { el, placeholder, parent, cssText } = record;
        try {
            if (placeholder.parentNode) placeholder.parentNode.insertBefore(el, placeholder);
            else if (parent?.isConnected) parent.appendChild(el);
        } catch (_) {}
        try { placeholder.remove(); } catch (_) {}
        el.style.cssText = cssText;
        delete el.dataset.cigFullscreenPortal;
    }
    document.getElementById(BACKDROP_ID)?.remove();
    document.querySelectorAll('.ovg-thumb').forEach(el => {
        if (!(el instanceof HTMLElement)) return;
        el.style.removeProperty("--cig-pseudo-left");
        el.style.removeProperty("--cig-pseudo-right");
    });
}

function ensureStyles() {
    // Disable the earlier CSS-only attempt. Its JS may still run, but without
    // this style sheet its root markers cannot expose the rest of ComfyUI.
    document.getElementById(OLD_STYLE_ID)?.remove();

    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
#${BACKDROP_ID}{
    position:fixed!important;
    inset:0!important;
    z-index:${BACKDROP_Z}!important;
    background:#000!important;
    pointer-events:auto!important;
}
[data-cig-fullscreen-portal="1"]{
    z-index:${PORTAL_Z}!important;
    visibility:visible!important;
    opacity:1!important;
    pointer-events:auto!important;
}
body.cig-output-pseudo-fullscreen-open .ovg-thumb.cig-pseudo-fullscreen{
    left:0!important;
    right:0!important;
    width:100vw!important;
    height:calc(100vh - var(--cig-pseudo-top,0px))!important;
    z-index:2147483000!important;
}
body.cig-output-pseudo-fullscreen-open .ovg-thumb.cig-pseudo-fullscreen video.ovg-inline-video{
    width:100%!important;
    height:100%!important;
    object-fit:contain!important;
    background:#000!important;
}
`;
    document.head.appendChild(style);
}

function sync() {
    if (syncing) return;
    syncing = true;
    try {
        ensureStyles();
        if (isOpen()) portalControls();
        else restoreControls();
    } finally {
        syncing = false;
    }
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        sync();

        const observer = new MutationObserver(records => {
            if (records.some(r => r.type === "attributes" && r.attributeName === "class")) sync();
        });
        observer.observe(document.body, { attributes:true, attributeFilter:["class"] });

        window.addEventListener("resize", () => {
            if (!isOpen()) return;
            moved.forEach(positionRecord);
            setVideoTopInset();
        });
        document.addEventListener("fullscreenchange", () => setTimeout(sync, 0), true);
        document.addEventListener("webkitfullscreenchange", () => setTimeout(sync, 0), true);
    },
});
