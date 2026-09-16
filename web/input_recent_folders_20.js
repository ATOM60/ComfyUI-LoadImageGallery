import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.InputRecentFolders20";
const NATIVE_KEY = "ComfyUI-LoadImageGallery.recentFolders";
const HISTORY_KEY = "ComfyUI-LoadImageGallery.recentFolders20";
const LIMIT = 20;

function normalizePath(value) {
    return String(value ?? "").replace(/\\/g, "/").trim().replace(/\/+$/g, "");
}

function isAbsolutePath(value) {
    const path = normalizePath(value);
    return /^[A-Za-z]:\//.test(path) || path.startsWith("//");
}

function readList(key) {
    try {
        const raw = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(raw) ? raw.map(normalizePath).filter(isAbsolutePath) : [];
    } catch (_) {
        return [];
    }
}

function uniqueRecent(...sources) {
    const out = [];
    const seen = new Set();
    for (const source of sources) {
        for (const value of source || []) {
            const path = normalizePath(value);
            const key = path.toLowerCase();
            if (!path || !isAbsolutePath(path) || seen.has(key)) continue;
            seen.add(key);
            out.push(path);
            if (out.length >= LIMIT) return out;
        }
    }
    return out;
}

function loadHistory() {
    return uniqueRecent(readList(NATIVE_KEY), readList(HISTORY_KEY));
}

function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(uniqueRecent(list))); }
    catch (_) {}
}

function remember(path) {
    const clean = normalizePath(path);
    if (!isAbsolutePath(clean)) return;
    saveHistory([clean, ...loadHistory().filter(v => normalizePath(v).toLowerCase() !== clean.toLowerCase())]);
}

const installed = new WeakMap();

function installOverlay(overlay) {
    if (!(overlay instanceof HTMLElement) || installed.has(overlay)) return;
    const select = overlay.querySelector(".cig-folder");
    if (!(select instanceof HTMLSelectElement)) return;

    let scheduled = false;
    let disposed = false;

    const observer = new MutationObserver(() => scheduleSync());

    const sync = () => {
        scheduled = false;
        if (disposed || !overlay.isConnected || !select.isConnected) return;

        observer.disconnect();
        try {
            const selectedValue = normalizePath(select.value);
            if (isAbsolutePath(selectedValue)) remember(selectedValue);

            const currentAbsolute = [...select.options]
                .map(option => normalizePath(option.value))
                .filter(isAbsolutePath);
            const recent = uniqueRecent(
                isAbsolutePath(selectedValue) ? [selectedValue] : [],
                currentAbsolute,
                loadHistory(),
            );
            saveHistory(recent);

            const optionByPath = new Map();
            for (const option of [...select.options]) {
                const path = normalizePath(option.value);
                if (isAbsolutePath(path)) optionByPath.set(path.toLowerCase(), option);
            }

            const firstRegular = [...select.options].find(option => !isAbsolutePath(option.value)) || null;
            for (const path of recent) {
                const key = path.toLowerCase();
                let option = optionByPath.get(key);
                if (!option) {
                    option = document.createElement("option");
                    option.value = path;
                    option.textContent = path;
                    optionByPath.set(key, option);
                }
                if (option.nextSibling !== firstRegular) select.insertBefore(option, firstRegular);
            }

            const keep = new Set(recent.map(path => path.toLowerCase()));
            for (const option of [...select.options]) {
                const path = normalizePath(option.value);
                if (isAbsolutePath(path) && !keep.has(path.toLowerCase())) option.remove();
            }

            const selectedOption = [...select.options].find(option => normalizePath(option.value) === selectedValue);
            if (selectedOption) select.value = selectedOption.value;
        } finally {
            if (!disposed && overlay.isConnected && select.isConnected) {
                observer.observe(select, { childList:true });
            }
        }
    };

    function scheduleSync() {
        if (scheduled || disposed) return;
        scheduled = true;
        queueMicrotask(sync);
    }

    const onChange = () => {
        remember(select.value);
        scheduleSync();
    };
    select.addEventListener("change", onChange);
    observer.observe(select, { childList:true });

    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        observer.disconnect();
        select.removeEventListener("change", onChange);
        installed.delete(overlay);
    };

    installed.set(overlay, cleanup);
    scheduleSync();
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.querySelectorAll(".cig-overlay").forEach(installOverlay);

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof HTMLElement && node.classList.contains("cig-overlay")) installOverlay(node);
                }
                for (const node of record.removedNodes) {
                    if (!(node instanceof HTMLElement) || !node.classList.contains("cig-overlay")) continue;
                    installed.get(node)?.();
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
