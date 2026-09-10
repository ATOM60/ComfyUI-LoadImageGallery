import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoAutoRefresh";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const FALLBACK_CHECK_MS = 10000;
const TICK_MS = 2000;
const MIN_EVENT_CHECK_GAP_MS = 700;
const EVENT_RETRY_DELAYS = [500, 1500, 3500, 7000];

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en")
    .toLowerCase().startsWith("ru");

const TEXT = RU ? {
    help: "Список видео обновляется автоматически: состояние фиксируется сразу при открытии галереи, после событий выполнения ComfyUI выполняется несколько повторных проверок и дополнительно примерно раз в 10 секунд, пока галерея открыта. Если идёт воспроизведение или есть выделенные видео, обновление откладывается, чтобы не прерывать работу.",
} : {
    help: "The video list refreshes automatically: the initial state is captured as soon as the gallery opens, several retry checks run after ComfyUI execution events, and a fallback check runs about every 10 seconds while the gallery is open. Refresh is deferred while a video is playing or videos are selected, so playback and selection are not interrupted.",
};

const modalState = new WeakMap();
const eventTimers = new Set();
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
        state.lastCheck = 0;
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
    const rows = Array.isArray(videos)
        ? [...videos].sort((a, b) => String(a?.path || "").localeCompare(String(b?.path || "")))
        : [];
    for (const item of rows) {
        feed(item?.path);
        feed("|");
        feed(item?.mtime);
        feed("|");
        feed(item?.size);
        feed(";");
    }
    return `${rows.length}:${hash.toString(16)}`;
}

function safeToRefresh(modal) {
    if (!(modal instanceof HTMLElement) || !modal.isConnected) return false;
    if (modal.querySelector(".ovg-busy")) return false;
    if (modal.querySelector(".ovg-card.marked")) return false;

    // A paused/idle GPU player must not block live gallery updates. Only active
    // playback is deferred so a refresh cannot interrupt the video being watched.
    for (const video of modal.querySelectorAll("video.ovg-inline-video")) {
        if (video instanceof HTMLVideoElement && !video.paused && !video.ended) return false;
    }

    const cpu = modal.querySelector(".ovg-cpu-player");
    if (cpu instanceof HTMLElement && !cpu.classList.contains("paused")) return false;
    return true;
}

function performRefresh(modal, state) {
    if (!safeToRefresh(modal)) {
        state.pendingRefresh = true;
        return false;
    }
    const button = modal.querySelector(".ovg-refresh-modal");
    if (!(button instanceof HTMLElement) || button.hasAttribute("disabled")) {
        state.pendingRefresh = true;
        return false;
    }
    state.pendingRefresh = false;
    button.click();
    return true;
}

async function checkActiveModal({ force = false, baselineOnly = false } = {}) {
    if (document.hidden) return;
    const modal = activeModal();
    if (!modal) return;
    const state = getState(modal);

    if (!baselineOnly && state.pendingRefresh) {
        if (performRefresh(modal, state)) return;
        return;
    }

    const now = Date.now();
    if (state.inFlight) return;
    if (!force && now - state.lastCheck < FALLBACK_CHECK_MS) return;
    if (force && !baselineOnly && now - state.lastCheck < MIN_EVENT_CHECK_GAP_MS) return;

    state.inFlight = true;
    state.lastCheck = now;
    try {
        // output_video_folder_picker.js transparently redirects this request to the
        // selected external folder when needed.
        const response = await api.fetchApi("/image-gallery/output/list");
        if (!response.ok) return;
        const data = await response.json();
        if (!modal.isConnected || activeModal() !== modal) return;

        const signature = listSignature(data?.videos || []);

        // When a gallery has just opened, capture the current disk state immediately.
        // This prevents a fast generator from being swallowed as the first baseline.
        if (baselineOnly || state.signature === null) {
            state.signature = signature;
            return;
        }
        if (signature === state.signature) return;

        state.signature = signature;
        performRefresh(modal, state);
    } catch (_) {
        // Auto-refresh is intentionally silent. The manual refresh button still
        // reports errors in the normal gallery UI.
    } finally {
        state.inFlight = false;
    }
}

function captureInitialBaseline() {
    const modal = activeModal();
    if (!modal || document.hidden) return;
    const state = getState(modal);
    if (state.signature !== null || state.inFlight) return;
    checkActiveModal({ force:true, baselineOnly:true });
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
    if (!tickTimer) tickTimer = setInterval(() => checkActiveModal(), TICK_MS);
}

function clearEventChecks() {
    for (const timer of eventTimers) clearTimeout(timer);
    eventTimers.clear();
}

function scheduleEventChecks() {
    if (!activeModal() || document.hidden) return;

    // A number of video nodes report execution completion before the container is
    // fully flushed/renamed on disk. Retry for a few seconds instead of relying on
    // one narrowly timed check.
    clearEventChecks();
    for (const delay of EVENT_RETRY_DELAYS) {
        const timer = setTimeout(() => {
            eventTimers.delete(timer);
            checkActiveModal({ force:true });
        }, delay);
        eventTimers.add(timer);
    }
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
        captureInitialBaseline();

        for (const eventName of ["executed", "execution_success"]) {
            try { api.addEventListener?.(eventName, scheduleEventChecks); }
            catch (_) {}
        }

        document.addEventListener("visibilitychange", () => {
            syncTicker();
            if (!document.hidden && activeModal()) {
                captureInitialBaseline();
                checkActiveModal({ force:true });
            }
        });

        const observer = new MutationObserver(records => {
            let modalAdded = false;
            let modalChanged = false;
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    installHelp(node);
                    if (node.classList.contains("ovg-modal")) {
                        modalAdded = true;
                        modalChanged = true;
                    }
                }
                for (const node of record.removedNodes) {
                    if (node instanceof Element && node.classList.contains("ovg-modal")) modalChanged = true;
                }
            }
            if (modalChanged) syncTicker();
            if (modalAdded) {
                // Run before the first 2 s ticker tick so short Fengen generations
                // cannot become an unnoticed new baseline.
                queueMicrotask(captureInitialBaseline);
            }
        });
        observer.observe(document.body, { childList: true, subtree: false });
    },
});
