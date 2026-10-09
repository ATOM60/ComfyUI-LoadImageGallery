// CIG_HOLD_ZOOM_V1
// Hold the left mouse button on an image to see it full screen, magnified ×6
// relative to the image fitted to the screen. While the button is held the
// magnified spot follows the pointer: the pointer's relative position on the
// screen is the relative point of the image under it, so the screen edges
// reach the image edges. Releasing the button closes the window.
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
.cig-hold-zoom-frame{position:absolute;inset:0;overflow:hidden;background:#000;visibility:hidden}
.cig-hold-zoom-frame img{position:absolute;left:0;top:0;max-width:none;max-height:none;display:block;will-change:transform}
.cig-hold-zoom-badge{position:absolute;right:10px;top:8px;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.62);color:#fff;font:600 12px/18px Arial,sans-serif}
`;
    document.head.appendChild(style);
}

const clamp01 = value => Math.min(1, Math.max(0, value));

/**
 * Opens the zoom window at once. `source.src` is the full-resolution image;
 * `source.previewSrc` (optional) is shown while it loads. Closes on button
 * release, Escape, or window blur. Returns { close }.
 */
export function openHoldZoom(source, clientX, clientY) {
    injectStyles();
    const zoom = HOLD_ZOOM_FACTOR;
    const root = document.createElement("div");
    root.className = "cig-hold-zoom";
    const frame = document.createElement("div");
    frame.className = "cig-hold-zoom-frame";
    const badge = document.createElement("div");
    badge.className = "cig-hold-zoom-badge";
    badge.textContent = `×${zoom}`;
    frame.append(badge);
    root.appendChild(frame);
    document.body.appendChild(root);

    let view = null, shownRank = 0;
    let naturalW = 0, naturalH = 0;
    let x = clientX, y = clientY, zoomedW = 0, zoomedH = 0, closed = false;

    // Pointer at fraction u of the screen shows image fraction u under it; a
    // side narrower than the screen even when zoomed is centred instead.
    const offset = (pointer, screen, zoomed) => zoomed <= screen
        ? (screen - zoomed) / 2
        : -clamp01(pointer / screen) * (zoomed - screen);
    function position() {
        if (!view || !zoomedW || !zoomedH) return;
        view.style.transform = `translate(${offset(x, innerWidth, zoomedW)}px,${offset(y, innerHeight, zoomedH)}px)`;
    }
    function layout() {
        if (!view || !naturalW || !naturalH) return;
        const fitted = Math.min(innerWidth / naturalW, innerHeight / naturalH);
        zoomedW = naturalW * fitted * zoom; zoomedH = naturalH * fitted * zoom;
        view.style.width = `${zoomedW}px`;
        view.style.height = `${zoomedH}px`;
        position();
    }
    // Each image is decoded off-screen and swapped in only when ready, so the
    // window never flashes black and the original replaces the thumbnail
    // seamlessly. `rank` keeps a late thumbnail from replacing the original.
    function load(url, rank) {
        if (!url) return;
        const img = new Image();
        img.alt = "";
        img.draggable = false;
        img.decoding = "async";
        img.src = url;
        img.decode().catch(() => {}).then(() => {
            if (closed || rank <= shownRank || !img.naturalWidth || !img.naturalHeight) return;
            shownRank = rank;
            naturalW = img.naturalWidth; naturalH = img.naturalHeight;
            view?.remove();
            view = img;
            frame.prepend(img);
            layout();
            frame.style.visibility = "visible";
        });
    }

    load(source.src, 2);
    load(source.previewSrc, 1);

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
