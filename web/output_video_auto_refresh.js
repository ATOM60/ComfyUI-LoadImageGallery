import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoAutoRefresh";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const FALLBACK_CHECK_MS = 10000;
const TICK_MS = 2000;
const EVENT_DELAY_MS = 900;
const MIN_EVENT_CHECK_GAP_MS = 1800;

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en")
    .toLowerCase().startsWith("ru");

const TEXT = RU ? {
    help: "Список видео обновляется автоматически: после событий выполнения ComfyUI и дополнительно примерно раз в 10 секунд, пока галерея открыта. Если идёт воспроизведение или есть выделенные видео, обновление откладывается, чтобы не прерывать работу.",
} : {
    help: "The video list refreshes automatically after ComfyUI execution events and also about every 10 seconds while the gallery is open. Refresh is deferred while a video is playing or videos are selected, so playback and selection are not interrupted.",
};

const modalState = new WeakMap();
let eventTimer = 0;
let tickTimer = 0;

function activeModal() {
    const modals = [...document.querySelectorAll(".ovg-modal")];
    for (let i = modals.length - 1; i >= 0; i--) {
        const modal = modals[i];
        if (modal instanceof HTMLElement && modal.isConnected) return modal;
    }
    return null;
}

function folderKey(modal) {
    return String(modal?.dataset?.ovgFolder || "");
}

function getState(modal) {
    let state = modalState.get(modal);
    if (!state) {
        state = {
            folder: folderKey(modal),
            signature: null,
            pendingRefresh: false,
            pendingVideos: null,
            inFlight: false,
            lastCheck: 0,
        };
        modalState.set(modal, state);
    }
    const folder = folderKey(modal);
    if (folder !== state.folder) {
        state.folder = folder;
        state.signature = null;
        state.pendingRefresh = false;
        state.pendingVideos = null;
    }
    return state;
}

function listSignature(videos) {
    let hash = 2166136261 >>> 0;
    const feed = value => {
        const text = String(value ?? "");
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619) >>> 0;
        }
    };
    let count = 0;
    for (const item of Array.isArray(videos) ? videos : []) {
        count++;
        feed(item?.path);
        feed("|");
        feed(item?.mtime);
        feed("|");
        feed(item?.size);
        feed(";");
    }
    return `${count}:${hash.toString(16)}`;
}

function safeToRefresh(modal) {
    if (!(modal instanceof HTMLElement) || !modal.isConnected) return false;
    if (modal.querySelector(".ovg-busy")) return false;
    if (modal.querySelector(".ovg-card.marked")) return false;

    for (const video of modal.querySelectorAll("video")) {
        if (video instanceof HTMLVideoElement && !video.paused && !video.ended) return false;
    }

    const cpu = modal.querySelector(".ovg-cpu-player");
    if (cpu instanceof HTMLElement && !cpu.classList.contains("paused")) return false;
    return true;
}

function applyFetchedList(modal, videos) {
    const graph = app.graph || app.rootGraph;
    const nodes = Array.isArray(graph?._nodes) ? graph._nodes : [];
    const gallery = nodes
        .map(node => node?._outputVideoGallery)
        .find(state => state?.modal === modal);
    if (!gallery) return false;

    gallery.videos = Array.isArray(videos) ? videos : [];

    // Re-use the gallery's existing render path instead of clicking Refresh.
    // Dispatching input with the unchanged search value only re-renders the already
    // fetched list; it does not perform another backend scan.
    const search = modal.querySelector(".ovg-search");
    if (!(search instanceof HTMLInputElement)) return false;
    search.dispatchEvent(new Event("input", { bubbles:true }));
    return true;
}

function performRefresh(modal, state, videos = null) {
    if (Array.isArray(videos)) state.pendingVideos = videos;

    if (!safeToRefresh(modal)) {
        state.pendingRefresh = true;
        return false;
    }

    if (Array.isArray(state.pendingVideos)) {
        const pending = state.pendingVideos;
        state.pendingVideos = null;
        state.pendingRefresh = false;
        if (applyFetchedList(modal, pending)) return true;
    }

    // Compatibility fallback: if the internal gallery state cannot be located,
    // preserve the old behavior and use the normal Refresh button.
    const button = modal.querySelector(".ovg-refresh-modal");
    if (!(button instanceof HTMLElement) || button.hasAttribute("disabled")) {
        state.pendingRefresh = true;
        return false;
    }
    state.pendingRefresh = false;
    button.click();
    return true;
}

async function checkActiveModal({ force = false } = {}) {
    if (document.hidden) return;
    const modal = activeModal();
    if (!modal) return;
    const state = getState(modal);

    if (state.pendingRefresh) {
        if (performRefresh(modal, state)) return;
        return;
    }

    const now = Date.now();
    if (state.inFlight) return;
    if (!force && now - state.lastCheck < FALLBACK_CHECK_MS) return;
    if (force && now - state.lastCheck < MIN_EVENT_CHECK_GAP_MS) return;

    state.inFlight = true;
    state.lastCheck = now;
    try {
        // output_video_folder_picker.js transparently redirects this request to the
        // selected external folder when needed.
        const response = await api.fetchApi("/image-gallery/output/list");
        if (!response.ok) return;
        const data = await response.json();
        if (!modal.isConnected || activeModal() !== modal) return;

        const videos = Array.isArray(data?.videos) ? data.videos : [];
        const signature = listSignature(videos);
        if (state.signature === null) {
            state.signature = signature;
            return;
        }
        if (signature === state.signature) return;

        state.signature = signature;
        performRefresh(modal, state, videos);
    } catch (_) {
        // Auto-refresh is intentionally silent. The manual refresh button still
        // reports errors in the normal gallery UI.
    } finally {
        state.inFlight = false;
    }
}

function stopTicker() {
    if (!tickTimer) return;
    clearInterval(tickTimer);
    tickTimer = 0;
}

function syncTicker() {
    if (document.hidden || !activeModal()) {
        stopTicker();
        return;
    }
    if (tickTimer) return;
    tickTimer = setInterval(() => checkActiveModal(), TICK_MS);
}

function scheduleEventCheck() {
    if (!activeModal() || document.hidden) return;
    clearTimeout(eventTimer);
    eventTimer = setTimeout(() => {
        eventTimer = 0;
        checkActiveModal({ force: true });
    }, EVENT_DELAY_MS);
}

function installHelp(root = document) {
    const overlays = [];
    if (root instanceof HTMLElement && root.classList.contains("ovg-help-overlay")) overlays.push(root);
    root.querySelectorAll?.(".ovg-help-overlay").forEach(el => overlays.push(el));
    for (const overlay of overlays) {
        if (!(overlay instanceof HTMLElement) || overlay.dataset.ovgAutoRefreshHelp === "1") continue;
        const body = overlay.querySelector(".ovg-help-body");
        if (!(body instanceof HTMLElement)) continue;
        overlay.dataset.ovgAutoRefreshHelp = "1";
        const lists = body.querySelectorAll("ul");
        const list = lists.length ? lists[lists.length - 1] : null;
        if (list) {
            const li = document.createElement("li");
            li.textContent = TEXT.help;
            list.appendChild(li);
        }
    }
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        syncTicker();

        for (const eventName of ["executed", "execution_success"]) {
            try { api.addEventListener?.(eventName, scheduleEventCheck); }
            catch (_) {}
        }

        document.addEventListener("visibilitychange", () => {
            syncTicker();
            if (!document.hidden && activeModal()) checkActiveModal({ force:true });
        });

        const observer = new MutationObserver(records => {
            let modalChanged = false;
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    installHelp(node);
                    if (node.classList.contains("ovg-modal")) modalChanged = true;
                }
                for (const node of record.removedNodes) {
                    if (node instanceof Element && node.classList.contains("ovg-modal")) modalChanged = true;
                }
            }
            if (modalChanged) syncTicker();
        });
        observer.observe(document.body, { childList: true, subtree: false });
    },
});
