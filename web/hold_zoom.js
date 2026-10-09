// CIG_HOLD_ZOOM_V1
// Hold the left mouse button on an image to see it magnified ×6 in a window
// that fills the screen height or width (whichever the image's proportions
// allow). While the button is held the magnified spot follows the pointer:
// the image point under the pointer is the one it would be under if the image
// were shown fitted to that window, so every edge can be reached. Releasing
// the button closes the window.
//
// Shared by the input gallery cards and the node preview. No side effects on
// import, so ComfyUI may also load this file as an extension module.

export const HOLD_ZOOM_FACTOR = 6;
export const HOLD_ZOOM_DELAY_MS = 280;
const HOLD_ZOOM_SLOP_PX = 6;
const STYLE_ID = "cig-hold-zoom-style";

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cig-hold-zoom{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.88);pointer-events:none;user-select:none}
.cig-hold-zoom-frame{position:absolute;overflow:hidden;background:#000;visibility:hidden}
.cig-hold-zoom-frame img{position:absolute;left:0;top:0;max-width:none;max-height:none;display:block;will-change:transform}
.cig-hold-zoom-badge{position:absolute;right:10px;top:8px;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.62);color:#fff;font:600 12px/18px Arial,sans-serif}
`;
    document.head.appendChild(style);
}

const clamp01 = value => Math.min(1, Math.max(0, value));

/**
 * Opens the zoom window at once. `source.src` is the full-resolution image;
 * `source.previewSrc` (optional) is shown while it loads. `width`/`height`
 * are the natural size when already known. Closes on button release, Escape,
 * or window blur. Returns { close }.
 */
export function openHoldZoom(source, clientX, clientY) {
    injectStyles();
    const zoom = HOLD_ZOOM_FACTOR;
    const root = document.createElement("div");
    root.className = "cig-hold-zoom";
    const frame = document.createElement("div");
    frame.className = "cig-hold-zoom-frame";
    const view = document.createElement("img");
    view.alt = "";
    view.draggable = false;
    view.decoding = "async";
    const badge = document.createElement("div");
    badge.className = "cig-hold-zoom-badge";
    badge.textContent = `×${zoom}`;
    frame.append(view, badge);
    root.appendChild(frame);
    document.body.appendChild(root);

    let naturalW = Number(source.width) || 0, naturalH = Number(source.height) || 0;
    let x = clientX, y = clientY, W = 0, H = 0, left = 0, top = 0, closed = false;

    function position() {
        if (!W || !H) return;
        // Same relative point under the pointer in the fitted and zoomed image.
        const u = clamp01((x - left) / W), v = clamp01((y - top) / H);
        view.style.transform = `translate(${-u * (zoom - 1) * W}px,${-v * (zoom - 1) * H}px)`;
    }
    function layout() {
        if (!naturalW || !naturalH) return;
        const scale = Math.min(innerWidth / naturalW, innerHeight / naturalH);
        W = naturalW * scale; H = naturalH * scale;
        left = (innerWidth - W) / 2; top = (innerHeight - H) / 2;
        Object.assign(frame.style, { left: `${left}px`, top: `${top}px`, width: `${W}px`, height: `${H}px`, visibility: "visible" });
        view.style.width = `${W * zoom}px`;
        view.style.height = `${H * zoom}px`;
        position();
    }
    function show(url, w, h) {
        if (closed) return;
        if (w && h) { naturalW = w; naturalH = h; }
        view.src = url;
        layout();
    }

    const full = source.src;
    if (naturalW && naturalH) show(full, naturalW, naturalH);
    else {
        if (source.previewSrc) {
            const preview = new Image();
            preview.onload = () => { if (!view.getAttribute("src")) show(source.previewSrc, preview.naturalWidth, preview.naturalHeight); };
            preview.src = source.previewSrc;
        }
        const original = new Image();
        original.decoding = "async";
        original.onload = () => show(full, original.naturalWidth, original.naturalHeight);
        original.src = full;
    }

    // Browsers already coalesce pointermove to one event per frame, and a
    // requestAnimationFrame here would stall in a hidden or throttled tab.
    const onMove = event => {
        x = event.clientX; y = event.clientY;
        position();
    };
    const onKey = event => { if (event.key === "Escape") close(); };
    function close() {
        if (closed) return;
        closed = true;
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerup", close, true);
        document.removeEventListener("pointercancel", close, true);
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("blur", close);
        window.removeEventListener("resize", layout);
        root.remove();
    }
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", close, true);
    document.addEventListener("pointercancel", close, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", layout);
    return { close };
}

/**
 * Call from a left-button mouse pointerdown. If the button is still held
 * after HOLD_ZOOM_DELAY_MS without moving, opens the zoom window. `source` is
 * an object or a function returning one (see openHoldZoom). The handle's
 * `used` turns true once the window opened, so callers can skip the click
 * that the release produces.
 */
export function holdToZoom(downEvent, source) {
    const handle = { used: false, cancel };
    if (!downEvent || downEvent.button !== 0 || (downEvent.pointerType && downEvent.pointerType !== "mouse")) {
        return handle;
    }
    const startX = downEvent.clientX, startY = downEvent.clientY;
    let x = startX, y = startY;
    const onMove = event => {
        x = event.clientX; y = event.clientY;
        if (Math.abs(x - startX) > HOLD_ZOOM_SLOP_PX || Math.abs(y - startY) > HOLD_ZOOM_SLOP_PX) cancel();
    };
    const timer = setTimeout(() => {
        cancel();
        const resolved = typeof source === "function" ? source() : source;
        if (!resolved?.src) return;
        handle.used = true;
        openHoldZoom(resolved, x, y);
    }, HOLD_ZOOM_DELAY_MS);
    function cancel() {
        clearTimeout(timer);
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerup", cancel, true);
        document.removeEventListener("pointercancel", cancel, true);
    }
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", cancel, true);
    document.addEventListener("pointercancel", cancel, true);
    return handle;
}
