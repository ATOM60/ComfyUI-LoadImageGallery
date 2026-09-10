import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoScrollMemory";
const STORAGE_KEY = "ComfyUI-LoadImageGallery.outputVideoScrollPositions.v2";
const CURRENT_FOLDER_KEY = "ComfyUI-LoadImageGallery.outputVideoFolder";

const states = new WeakMap();

function normalizeFolder(value) {
    let raw = String(value ?? "").trim().replace(/\\/g, "/");
    if (/^[A-Za-z]:\/?$/.test(raw)) return raw.slice(0, 2) + "/";
    if (raw.length > 1) raw = raw.replace(/\/+$/g, "");
    return raw;
}

function currentFolder(modal) {
    if (modal?.dataset && Object.prototype.hasOwnProperty.call(modal.dataset, "ovgFolder")) {
        return normalizeFolder(modal.dataset.ovgFolder || "");
    }
    try { return normalizeFolder(localStorage.getItem(CURRENT_FOLDER_KEY) || ""); }
    catch (_) { return ""; }
}

function positionKey(modal) {
    const folder = currentFolder(modal);
    return folder ? `folder:${folder}` : "output";
}

function loadPositions() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
}

function itemTop(item) {
    if (item == null) return null;
    if (typeof item === "number") return Math.max(0, item);
    const top = Number(item?.top);
    return Number.isFinite(top) ? Math.max(0, top) : null;
}

function itemTs(item) {
    if (typeof item === "number") return 0;
    const ts = Number(item?.ts);
    return Number.isFinite(ts) ? ts : 0;
}

function savedTop(key) {
    const positions = loadPositions();
    const direct = itemTop(positions[key]);
    if (direct != null) return direct;

    // Migrate the previous per-mode values automatically. CPU and GPU now
    // share one scroll position for the same folder, so use whichever old
    // value was written most recently.
    const legacy = [positions[`cpu|${key}`], positions[`gpu|${key}`]]
        .filter(item => itemTop(item) != null)
        .sort((a, b) => itemTs(b) - itemTs(a))[0];
    return itemTop(legacy);
}

function saveTop(key, top) {
    if (!key) return;
    try {
        const positions = loadPositions();
        positions[key] = {
            top: Math.max(0, Number(top) || 0),
            ts: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch (_) {}
}

function clearRestore(state) {
    if (state.restoreRaf) cancelAnimationFrame(state.restoreRaf);
    state.restoreRaf = 0;
    for (const id of state.restoreTimers) clearTimeout(id);
    state.restoreTimers.length = 0;
    state.restoring = false;
}

function restorePosition(state, requestedTop = null) {
    if (!state.wrap?.isConnected) return;

    clearRestore(state);
    const stored = requestedTop == null ? savedTop(state.key) : Number(requestedTop);
    const wanted = Number.isFinite(stored) ? Math.max(0, stored) : 0;
    const generation = ++state.restoreGeneration;

    state.lastUserTop = wanted;
    state.restoring = true;

    const apply = () => {
        if (!state.wrap?.isConnected || generation !== state.restoreGeneration) return;
        const max = Math.max(0, state.wrap.scrollHeight - state.wrap.clientHeight);
        state.wrap.scrollTop = Math.min(wanted, max);
    };

    state.restoreRaf = requestAnimationFrame(() => {
        state.restoreRaf = 0;
        apply();
        requestAnimationFrame(apply);
    });

    for (const ms of [40, 100, 220, 450, 800, 1250]) {
        state.restoreTimers.push(setTimeout(apply, ms));
    }

    state.restoreTimers.push(setTimeout(() => {
        if (generation !== state.restoreGeneration) return;
        apply();
        state.restoring = false;
        state.restoreTimers.length = 0;
    }, 1600));
}

function cancelRestoreForUser(state) {
    clearRestore(state);
    state.restoreGeneration += 1;
    state.userScrollUntil = performance.now() + 900;
}

function scheduleUserSave(state) {
    if (state.saveRaf || !state.wrap?.isConnected) return;
    state.saveRaf = requestAnimationFrame(() => {
        state.saveRaf = 0;
        if (!state.wrap?.isConnected || state.restoring) return;
        const top = Math.max(0, Number(state.wrap.scrollTop) || 0);
        state.lastUserTop = top;
        saveTop(state.key, top);
    });
}

function searchIsActive(state) {
    const search = state.modal.querySelector(".ovg-search");
    return search instanceof HTMLInputElement && search.value.trim() !== "";
}

function snapshotCurrent(state) {
    if (!state.wrap?.isConnected || state.restoring || searchIsActive(state)) return;
    const top = Math.max(0, Number(state.wrap.scrollTop) || 0);
    state.lastUserTop = top;
    saveTop(state.key, top);
}

function syncKey(state, { restore = true } = {}) {
    const nextKey = positionKey(state.modal);
    if (nextKey === state.key) return false;

    state.key = nextKey;
    state.lastUserTop = savedTop(nextKey) ?? 0;
    if (restore) restorePosition(state, state.lastUserTop);
    return true;
}

function isScrollKey(event) {
    return ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key);
}

function isTextControl(target) {
    return target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
}

function installModal(modal) {
    if (!(modal instanceof HTMLElement) || states.has(modal)) return;
    const wrap = modal.querySelector(".ovg-grid-wrap");
    const grid = modal.querySelector(".ovg-grid");
    if (!(wrap instanceof HTMLElement) || !(grid instanceof HTMLElement)) return;

    const key = positionKey(modal);
    const state = {
        modal,
        wrap,
        grid,
        key,
        lastUserTop: savedTop(key) ?? Math.max(0, Number(wrap.scrollTop) || 0),
        restoring: false,
        restoreGeneration: 0,
        restoreRaf: 0,
        restoreTimers: [],
        saveRaf: 0,
        userScrollUntil: 0,
        scrollbarDragging: false,
        skipGridRestoreUntil: 0,
        attrObserver: null,
        gridObserver: null,
        onScroll: null,
        onWheel: null,
        onTouchMove: null,
        onPointerDown: null,
        onPointerUp: null,
        onKeyDown: null,
        onChangeCapture: null,
        onClickCapture: null,
        onInputCapture: null,
    };
    states.set(modal, state);

    state.onWheel = () => {
        cancelRestoreForUser(state);
    };
    wrap.addEventListener("wheel", state.onWheel, { passive: true, capture: true });

    state.onTouchMove = () => {
        cancelRestoreForUser(state);
    };
    wrap.addEventListener("touchmove", state.onTouchMove, { passive: true, capture: true });

    state.onPointerDown = event => {
        const rect = wrap.getBoundingClientRect();
        const scrollbarWidth = Math.max(0, rect.width - wrap.clientWidth);
        const inVerticalScrollbar = scrollbarWidth > 0 && event.clientX >= rect.right - scrollbarWidth - 3;
        if (!inVerticalScrollbar) return;
        state.scrollbarDragging = true;
        cancelRestoreForUser(state);
    };
    wrap.addEventListener("pointerdown", state.onPointerDown, true);

    state.onPointerUp = () => {
        if (!state.scrollbarDragging) return;
        state.scrollbarDragging = false;
        scheduleUserSave(state);
    };
    window.addEventListener("pointerup", state.onPointerUp, true);

    state.onKeyDown = event => {
        if (!isScrollKey(event) || isTextControl(event.target)) return;
        cancelRestoreForUser(state);
    };
    modal.addEventListener("keydown", state.onKeyDown, true);

    state.onScroll = () => {
        if (state.restoring) return;
        if (state.scrollbarDragging || performance.now() <= state.userScrollUntil) {
            scheduleUserSave(state);
        }
    };
    wrap.addEventListener("scroll", state.onScroll, { passive: true });

    // Save before controls rebuild the grid and can synchronously force
    // scrollTop to 0. CPU/GPU intentionally share the same folder key.
    state.onChangeCapture = event => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.matches(".ovg-folder-select, .ovg-sort, .ovg-size")) snapshotCurrent(state);
    };
    modal.addEventListener("change", state.onChangeCapture, true);

    state.onClickCapture = event => {
        const target = event.target instanceof Element ? event.target.closest(".ovg-folder-pick, .ovg-cpu-toggle, .ovg-refresh-modal") : null;
        if (target) snapshotCurrent(state);
    };
    modal.addEventListener("click", state.onClickCapture, true);

    // Search intentionally starts from the top, but it must not erase the
    // remembered position of the underlying folder.
    state.onInputCapture = event => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !target.matches(".ovg-search")) return;
        clearRestore(state);
        state.restoreGeneration += 1;
        if (target.value.trim()) {
            state.skipGridRestoreUntil = performance.now() + 700;
        } else {
            state.skipGridRestoreUntil = 0;
        }
    };
    modal.addEventListener("input", state.onInputCapture, true);

    // Only folder changes select another saved scroll position. CPU/GPU mode
    // changes keep the same key and the following grid rerender restores the
    // current folder position instead of jumping to the top.
    state.attrObserver = new MutationObserver(records => {
        for (const record of records) {
            if (record.type !== "attributes" || record.attributeName !== "data-ovg-folder") continue;
            syncKey(state, { restore: true });
            break;
        }
    });
    state.attrObserver.observe(modal, {
        attributes: true,
        attributeFilter: ["data-ovg-folder"],
    });

    state.gridObserver = new MutationObserver(() => {
        if (syncKey(state, { restore: true })) return;
        if (performance.now() <= state.skipGridRestoreUntil) return;
        restorePosition(state, state.lastUserTop);
    });
    state.gridObserver.observe(grid, { childList: true, subtree: false });

    restorePosition(state, state.lastUserTop);
}

function uninstallModal(modal) {
    const state = states.get(modal);
    if (!state) return;

    if (!searchIsActive(state)) saveTop(state.key, state.lastUserTop);
    if (state.saveRaf) cancelAnimationFrame(state.saveRaf);
    state.saveRaf = 0;
    clearRestore(state);
    state.attrObserver?.disconnect();
    state.gridObserver?.disconnect();
    state.wrap?.removeEventListener("wheel", state.onWheel, true);
    state.wrap?.removeEventListener("touchmove", state.onTouchMove, true);
    state.wrap?.removeEventListener("pointerdown", state.onPointerDown, true);
    state.wrap?.removeEventListener("scroll", state.onScroll);
    state.modal?.removeEventListener("keydown", state.onKeyDown, true);
    state.modal?.removeEventListener("change", state.onChangeCapture, true);
    state.modal?.removeEventListener("click", state.onClickCapture, true);
    state.modal?.removeEventListener("input", state.onInputCapture, true);
    window.removeEventListener("pointerup", state.onPointerUp, true);
    states.delete(modal);
}

function scan(root) {
    if (root instanceof HTMLElement && root.classList.contains("ovg-modal")) installModal(root);
    root.querySelectorAll?.(".ovg-modal").forEach(installModal);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        scan(document);
        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof Element) scan(node);
                }
                for (const node of record.removedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    if (node.classList.contains("ovg-modal")) uninstallModal(node);
                    node.querySelectorAll?.(".ovg-modal").forEach(uninstallModal);
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: false });
    },
});
