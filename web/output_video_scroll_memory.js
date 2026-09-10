import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoScrollMemory";
const STORAGE_KEY = "ComfyUI-LoadImageGallery.outputVideoScrollPositions";
const CURRENT_FOLDER_KEY = "ComfyUI-LoadImageGallery.outputVideoFolder";
const MAX_FOLDERS = 100;

const states = new WeakMap();

function normalizeFolder(value) {
    let raw = String(value ?? "").trim().replace(/\\/g, "/");
    if (/^[A-Za-z]:\/?$/.test(raw)) return raw.slice(0, 2) + "/";
    if (raw.length > 1) raw = raw.replace(/\/+$/g, "");
    return raw;
}

function folderKey(modal) {
    let folder = "";
    if (modal?.dataset && Object.prototype.hasOwnProperty.call(modal.dataset, "ovgFolder")) {
        folder = normalizeFolder(modal.dataset.ovgFolder || "");
    } else {
        try { folder = normalizeFolder(localStorage.getItem(CURRENT_FOLDER_KEY) || ""); }
        catch (_) {}
    }
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

function savedTop(key) {
    const item = loadPositions()[key];
    if (typeof item === "number") return Math.max(0, item);
    const top = Number(item?.top);
    return Number.isFinite(top) ? Math.max(0, top) : 0;
}

function saveTop(key, top) {
    if (!key) return;
    try {
        const positions = loadPositions();
        positions[key] = { top: Math.max(0, Number(top) || 0), ts: Date.now() };

        const entries = Object.entries(positions);
        if (entries.length > MAX_FOLDERS) {
            entries
                .sort((a, b) => Number(b[1]?.ts || 0) - Number(a[1]?.ts || 0))
                .slice(MAX_FOLDERS)
                .forEach(([oldKey]) => delete positions[oldKey]);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch (_) {}
}

function clearTimers(state) {
    for (const id of state.restoreTimers) clearTimeout(id);
    state.restoreTimers.length = 0;
    if (state.restoreRaf) cancelAnimationFrame(state.restoreRaf);
    state.restoreRaf = 0;
}

function restorePosition(state) {
    if (!state.wrap?.isConnected) return;
    clearTimers(state);
    const wanted = savedTop(state.key);
    state.restoring = true;

    const apply = () => {
        if (!state.wrap?.isConnected) return;
        const max = Math.max(0, state.wrap.scrollHeight - state.wrap.clientHeight);
        state.wrap.scrollTop = Math.min(wanted, max);
    };

    state.restoreRaf = requestAnimationFrame(() => {
        state.restoreRaf = 0;
        apply();
    });
    state.restoreTimers.push(setTimeout(apply, 40));
    state.restoreTimers.push(setTimeout(apply, 120));
    state.restoreTimers.push(setTimeout(() => {
        apply();
        state.restoring = false;
        state.restoreTimers.length = 0;
    }, 240));
}

function saveCurrent(state) {
    if (!state.wrap?.isConnected || state.restoring) return;
    saveTop(state.key, state.wrap.scrollTop);
}

function installModal(modal) {
    if (!(modal instanceof HTMLElement) || states.has(modal)) return;
    const wrap = modal.querySelector(".ovg-grid-wrap");
    const grid = modal.querySelector(".ovg-grid");
    if (!(wrap instanceof HTMLElement) || !(grid instanceof HTMLElement)) return;

    const state = {
        modal,
        wrap,
        grid,
        key: folderKey(modal),
        restoring: false,
        saveRaf: 0,
        restoreRaf: 0,
        restoreTimers: [],
        attrObserver: null,
        gridObserver: null,
        onScroll: null,
    };
    states.set(modal, state);

    state.onScroll = () => {
        if (state.restoring) return;
        if (state.saveRaf) return;
        state.saveRaf = requestAnimationFrame(() => {
            state.saveRaf = 0;
            saveCurrent(state);
        });
    };
    wrap.addEventListener("scroll", state.onScroll, { passive: true });

    state.attrObserver = new MutationObserver(records => {
        for (const record of records) {
            if (record.type !== "attributes" || record.attributeName !== "data-ovg-folder") continue;
            saveTop(state.key, state.wrap.scrollTop);
            state.key = folderKey(modal);
            restorePosition(state);
        }
    });
    state.attrObserver.observe(modal, { attributes: true, attributeFilter: ["data-ovg-folder"] });

    // renderGrid replaces the direct card children. Restoring here also keeps
    // the same position when switching CPU/GPU, sorting, refreshing, etc.
    state.gridObserver = new MutationObserver(() => restorePosition(state));
    state.gridObserver.observe(grid, { childList: true, subtree: false });

    restorePosition(state);
}

function uninstallModal(modal) {
    const state = states.get(modal);
    if (!state) return;
    if (!state.restoring) saveTop(state.key, state.wrap?.scrollTop || 0);
    if (state.saveRaf) cancelAnimationFrame(state.saveRaf);
    clearTimers(state);
    state.attrObserver?.disconnect();
    state.gridObserver?.disconnect();
    state.wrap?.removeEventListener("scroll", state.onScroll);
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
