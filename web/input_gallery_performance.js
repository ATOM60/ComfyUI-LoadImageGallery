import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.InputPerformance";
const states = new WeakMap();
const syntheticMoves = new WeakSet();

function installOverlay(overlay) {
    if (!(overlay instanceof HTMLElement) || states.has(overlay)) return;
    const body = overlay.querySelector(".cig-body");
    if (!(body instanceof HTMLElement)) return;

    const state = {
        overlay,
        body,
        active:false,
        raf:0,
        lastX:0,
        lastY:0,
        pending:false,
    };
    states.set(overlay, state);

    // image_gallery.js used to walk every .cig-card on every scroll event only
    // to re-apply selection classes. Cards are not virtualized and keep their
    // classes while scrolling, so that full-grid pass is unnecessary.
    const stopRedundantScrollSync = event => {
        event.stopImmediatePropagation();
    };
    body.addEventListener("scroll", stopRedundantScrollSync, { capture:true, passive:true });

    const dispatchMove = () => {
        state.raf = 0;
        if (!state.active || !state.pending || !overlay.isConnected) return;
        state.pending = false;
        const event = new MouseEvent("mousemove", {
            bubbles:true,
            cancelable:true,
            clientX:state.lastX,
            clientY:state.lastY,
            button:0,
        });
        syntheticMoves.add(event);
        document.dispatchEvent(event);
    };

    const scheduleMove = () => {
        state.pending = true;
        if (!state.raf) state.raf = requestAnimationFrame(dispatchMove);
    };

    const onMouseDown = event => {
        if (event.button !== 0) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest?.(".cig-card")) return;
        state.active = true;
        state.lastX = event.clientX;
        state.lastY = event.clientY;
        state.pending = false;
    };

    const onMouseMove = event => {
        if (!state.active || syntheticMoves.has(event)) return;
        state.lastX = event.clientX;
        state.lastY = event.clientY;

        // The gallery's original document mousemove handler performs a full card
        // geometry scan. Suppress the raw high-frequency event and replay only
        // the latest pointer position once per animation frame.
        event.stopImmediatePropagation();
        scheduleMove();
    };

    const flushMove = () => {
        if (!state.pending) return;
        if (state.raf) cancelAnimationFrame(state.raf);
        state.raf = 0;
        dispatchMove();
    };

    const onMouseUp = () => {
        if (!state.active) return;
        flushMove();
        state.active = false;
        state.pending = false;
    };

    body.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);

    state.cleanup = () => {
        if (state.raf) cancelAnimationFrame(state.raf);
        state.raf = 0;
        state.active = false;
        state.pending = false;
        body.removeEventListener("scroll", stopRedundantScrollSync, true);
        body.removeEventListener("mousedown", onMouseDown, true);
        document.removeEventListener("mousemove", onMouseMove, true);
        document.removeEventListener("mouseup", onMouseUp, true);
        states.delete(overlay);
    };
}

function uninstallOverlay(overlay) {
    states.get(overlay)?.cleanup?.();
}

function scanAdded(node) {
    if (!(node instanceof Element)) return;
    if (node.classList.contains("cig-overlay")) installOverlay(node);
    node.querySelectorAll?.(".cig-overlay").forEach(installOverlay);
}

function scanRemoved(node) {
    if (!(node instanceof Element)) return;
    if (node.classList.contains("cig-overlay")) uninstallOverlay(node);
    node.querySelectorAll?.(".cig-overlay").forEach(uninstallOverlay);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.querySelectorAll(".cig-overlay").forEach(installOverlay);
        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) scanAdded(node);
                for (const node of record.removedNodes) scanRemoved(node);
            }
        });
        // Input gallery overlays are direct children of body. Keep this observer
        // shallow so the optimization itself adds virtually no idle overhead.
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
