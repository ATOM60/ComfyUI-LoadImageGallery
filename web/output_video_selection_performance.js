import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputSelectionPerformance";
const states = new WeakMap();
const syntheticMoves = new WeakSet();

function installModal(modal) {
    if (!(modal instanceof HTMLElement) || states.has(modal)) return;
    const gridWrap = modal.querySelector(".ovg-grid-wrap");
    if (!(gridWrap instanceof HTMLElement)) return;

    const state = {
        modal,
        gridWrap,
        active:false,
        pointerId:null,
        pointerType:"mouse",
        isPrimary:true,
        lastX:0,
        lastY:0,
        pending:false,
        raf:0,
    };
    states.set(modal, state);

    const dispatchMove = () => {
        state.raf = 0;
        if (!state.active || !state.pending || !modal.isConnected) return;
        state.pending = false;

        const event = new PointerEvent("pointermove", {
            bubbles:true,
            cancelable:true,
            composed:true,
            pointerId:state.pointerId ?? 1,
            pointerType:state.pointerType || "mouse",
            isPrimary:state.isPrimary,
            clientX:state.lastX,
            clientY:state.lastY,
            button:0,
            buttons:1,
        });
        syntheticMoves.add(event);
        gridWrap.dispatchEvent(event);
    };

    const scheduleMove = () => {
        state.pending = true;
        if (!state.raf) state.raf = requestAnimationFrame(dispatchMove);
    };

    const onPointerDown = event => {
        if (event.button !== 0) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest?.(".ovg-card,button,input,select,video")) return;

        state.active = true;
        state.pointerId = event.pointerId;
        state.pointerType = event.pointerType || "mouse";
        state.isPrimary = event.isPrimary !== false;
        state.lastX = event.clientX;
        state.lastY = event.clientY;
        state.pending = false;
    };

    const onPointerMove = event => {
        if (!state.active || event.pointerId !== state.pointerId || syntheticMoves.has(event)) return;
        state.lastX = event.clientX;
        state.lastY = event.clientY;

        // output_video_gallery.js measures every card for each pointermove while
        // rectangle-selecting. High-polling mice can produce hundreds of events
        // per second, far above the display refresh rate. Keep only the latest
        // position and replay it once per animation frame.
        event.stopImmediatePropagation();
        scheduleMove();
    };

    const flushMove = () => {
        if (!state.pending) return;
        if (state.raf) cancelAnimationFrame(state.raf);
        state.raf = 0;
        dispatchMove();
    };

    const finishPointer = event => {
        if (!state.active || event.pointerId !== state.pointerId) return;
        flushMove();
        state.active = false;
        state.pointerId = null;
        state.pending = false;
    };

    gridWrap.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", finishPointer, true);
    document.addEventListener("pointercancel", finishPointer, true);

    state.cleanup = () => {
        if (state.raf) cancelAnimationFrame(state.raf);
        state.raf = 0;
        state.active = false;
        state.pointerId = null;
        state.pending = false;
        gridWrap.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("pointermove", onPointerMove, true);
        document.removeEventListener("pointerup", finishPointer, true);
        document.removeEventListener("pointercancel", finishPointer, true);
        states.delete(modal);
    };
}

function uninstallModal(modal) {
    states.get(modal)?.cleanup?.();
}

function scanAdded(node) {
    if (!(node instanceof Element)) return;
    if (node.classList.contains("ovg-modal")) installModal(node);
    node.querySelectorAll?.(".ovg-modal").forEach(installModal);
}

function scanRemoved(node) {
    if (!(node instanceof Element)) return;
    if (node.classList.contains("ovg-modal")) uninstallModal(node);
    node.querySelectorAll?.(".ovg-modal").forEach(uninstallModal);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.querySelectorAll(".ovg-modal").forEach(installModal);
        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) scanAdded(node);
                for (const node of record.removedNodes) scanRemoved(node);
            }
        });
        // Output modals are direct body children, so a shallow observer is enough.
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
