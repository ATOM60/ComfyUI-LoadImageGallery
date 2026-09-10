import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputFullscreenKeepComfyControls";
const PORTAL_Z = 2147483645;
const moved = [];
let active = false;

function isGpuFullscreenOpen() {
    return !!document.querySelector(".ovg-thumb.cig-pseudo-fullscreen video.ovg-inline-video");
}

function rectOf(el) {
    if (!(el instanceof HTMLElement) || !el.isConnected) return null;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return r;
}

function getTargets() {
    const result = [];
    const add = el => {
        if (!(el instanceof HTMLElement) || result.includes(el)) return;
        if (result.some(other => other.contains(el) || el.contains(other))) return;
        result.push(el);
    };

    add(document.querySelector('[data-testid="topbar-workflow-tabs"]'));
    add(document.querySelector('[data-testid="top-menu-actionbars"]'));
    add(document.querySelector('.side-toolbar-container') || document.querySelector('.side-tool-bar-container'));
    return result;
}

function capture(el) {
    const r = rectOf(el);
    if (!r || !el.parentNode) return null;
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    return {
        el,
        parent: el.parentNode,
        nextSibling: el.nextSibling,
        style: el.getAttribute("style"),
        rect: {
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            right: Math.max(0, vw - r.right),
            bottom: Math.max(0, vh - r.bottom),
            wide: r.width >= vw * 0.5,
            tall: r.height >= vh * 0.5,
            rightSide: r.left + r.width / 2 >= vw / 2,
        },
    };
}

function applyPosition(record) {
    const { el, rect } = record;
    const s = el.style;
    s.setProperty("position", "fixed", "important");
    s.setProperty("z-index", String(PORTAL_Z), "important");
    s.setProperty("margin", "0", "important");
    s.setProperty("transform", "none", "important");
    s.setProperty("visibility", "visible", "important");
    s.setProperty("opacity", "1", "important");
    s.setProperty("pointer-events", "auto", "important");

    s.setProperty("top", `${Math.max(0, Math.round(rect.top))}px`, "important");

    if (rect.wide) {
        s.setProperty("left", `${Math.max(0, Math.round(rect.left))}px`, "important");
        s.setProperty("right", `${Math.max(0, Math.round(rect.right))}px`, "important");
        s.setProperty("width", "auto", "important");
    } else if (rect.rightSide) {
        s.removeProperty("left");
        s.setProperty("right", `${Math.max(0, Math.round(rect.right))}px`, "important");
        s.setProperty("width", `${Math.max(1, Math.round(rect.width))}px`, "important");
    } else {
        s.setProperty("left", `${Math.max(0, Math.round(rect.left))}px`, "important");
        s.removeProperty("right");
        s.setProperty("width", `${Math.max(1, Math.round(rect.width))}px`, "important");
    }

    if (rect.tall) {
        s.setProperty("bottom", `${Math.max(0, Math.round(rect.bottom))}px`, "important");
        s.setProperty("height", "auto", "important");
    } else {
        s.removeProperty("bottom");
        s.setProperty("height", `${Math.max(1, Math.round(rect.height))}px`, "important");
    }
}

function portalControls() {
    if (active || !isGpuFullscreenOpen()) return;
    const records = getTargets().map(capture).filter(Boolean);
    if (!records.length) return;

    active = true;
    for (const record of records) {
        moved.push(record);
        document.body.appendChild(record.el);
        record.el.dataset.cigFullscreenComfyControl = "1";
        applyPosition(record);
    }
}

function restoreControls() {
    if (!active && !moved.length) return;
    active = false;

    while (moved.length) {
        const record = moved.pop();
        const { el, parent, nextSibling, style } = record;
        try {
            if (parent?.isConnected) {
                if (nextSibling?.parentNode === parent) parent.insertBefore(el, nextSibling);
                else parent.appendChild(el);
            }
        } catch (_) {}

        if (style == null) el.removeAttribute("style");
        else el.setAttribute("style", style);
        delete el.dataset.cigFullscreenComfyControl;
    }
}

function sync() {
    if (isGpuFullscreenOpen()) {
        if (!active) requestAnimationFrame(portalControls);
        return;
    }
    restoreControls();
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        const observer = new MutationObserver(sync);
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ["class"],
            childList: true,
            subtree: true,
        });

        document.addEventListener("fullscreenchange", () => setTimeout(sync, 0), true);
        document.addEventListener("webkitfullscreenchange", () => setTimeout(sync, 0), true);
        window.addEventListener("resize", () => {
            if (!active) return;
            moved.forEach(applyPosition);
        });
        window.addEventListener("beforeunload", restoreControls);
        sync();
    },
});
