import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.ShiftRangeSelection";
const installedInputs = new WeakMap();
const installedOutputs = new WeakMap();

function inputCardKey(card) {
    if (!(card instanceof HTMLElement)) return "";
    return String(card.__cigRelative || card.title || "");
}

function outputCardKey(card) {
    if (!(card instanceof HTMLElement)) return "";
    return String(card.dataset.path || "");
}

function replayClick(card, state) {
    state.replaying = true;
    try {
        card.dispatchEvent(new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            composed: true,
            detail: 1,
            button: 0,
            buttons: 0,
        }));
    } finally {
        state.replaying = false;
    }
}

function installInput(overlay) {
    if (!(overlay instanceof HTMLElement) || installedInputs.has(overlay)) return;

    const state = { anchorKey: "", replaying: false };
    installedInputs.set(overlay, state);

    overlay.addEventListener("click", event => {
        if (state.replaying) return;
        const target = event.target instanceof Element ? event.target : null;
        const card = target?.closest?.(".cig-card");
        if (!(card instanceof HTMLElement) || !overlay.contains(card)) return;
        if (target.closest?.("button,.cig-favorite")) return;
        if (event.detail !== 1) return;

        const key = inputCardKey(card);
        if (!key) return;

        if (!event.shiftKey) {
            state.anchorKey = key;
            return;
        }

        const cards = [...overlay.querySelectorAll(".cig-grid .cig-card")]
            .filter(el => el instanceof HTMLElement);
        if (!cards.length) return;

        let anchorIndex = cards.findIndex(el => inputCardKey(el) === state.anchorKey);
        const targetIndex = cards.indexOf(card);

        if (anchorIndex < 0) {
            const selectedIndex = cards.findIndex(el => el.classList.contains("selected"));
            anchorIndex = selectedIndex >= 0 ? selectedIndex : targetIndex;
            state.anchorKey = inputCardKey(cards[anchorIndex]);
        }
        if (targetIndex < 0 || anchorIndex < 0) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const from = Math.min(anchorIndex, targetIndex);
        const to = Math.max(anchorIndex, targetIndex);
        for (let i = from; i <= to; i++) {
            const item = cards[i];
            if (!item.classList.contains("selected")) replayClick(item, state);
        }
    }, true);
}

function installOutput(modal) {
    if (!(modal instanceof HTMLElement) || installedOutputs.has(modal)) return;

    const state = { anchorKey: "", replaying: false };
    installedOutputs.set(modal, state);

    modal.addEventListener("click", event => {
        if (state.replaying) return;
        const target = event.target instanceof Element ? event.target : null;
        const card = target?.closest?.(".ovg-card[data-path]");
        if (!(card instanceof HTMLElement) || !modal.contains(card)) return;
        if (target.closest?.("button,video,input,select")) return;
        if (event.detail !== 1) return;

        const key = outputCardKey(card);
        if (!key) return;

        if (!event.shiftKey) {
            state.anchorKey = key;
            return;
        }

        const cards = [...modal.querySelectorAll(".ovg-grid .ovg-card[data-path]")]
            .filter(el => el instanceof HTMLElement);
        if (!cards.length) return;

        let anchorIndex = cards.findIndex(el => outputCardKey(el) === state.anchorKey);
        const targetIndex = cards.indexOf(card);

        if (anchorIndex < 0) {
            const selectedIndex = cards.findIndex(el => el.classList.contains("marked"));
            anchorIndex = selectedIndex >= 0 ? selectedIndex : targetIndex;
            state.anchorKey = outputCardKey(cards[anchorIndex]);
        }
        if (targetIndex < 0 || anchorIndex < 0) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const from = Math.min(anchorIndex, targetIndex);
        const to = Math.max(anchorIndex, targetIndex);
        for (let i = from; i <= to; i++) {
            const item = cards[i];
            if (!item.classList.contains("marked")) replayClick(item, state);
        }
    }, true);
}

function scanAdded(node) {
    if (!(node instanceof Element)) return;
    if (node.classList.contains("cig-overlay")) installInput(node);
    if (node.classList.contains("ovg-modal")) installOutput(node);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.querySelectorAll(".cig-overlay").forEach(installInput);
        document.querySelectorAll(".ovg-modal").forEach(installOutput);

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) scanAdded(node);
            }
        });
        // Both galleries are direct children of body. Keep observation shallow so
        // this feature adds no meaningful idle overhead while galleries are closed.
        observer.observe(document.body, { childList: true, subtree: false });
    },
});
