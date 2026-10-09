import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoAutoRefresh";
const FOLDER_KEY = "ComfyUI-LoadImageGallery.outputVideoFolder";
const FALLBACK_CHECK_MS = 5000;
const TICK_MS = 1000;
const MIN_EVENT_CHECK_GAP_MS = 500;
const EVENT_RETRY_DELAYS = [350, 1000, 2200, 4500, 8000];

// The help text lives in help_scenarios.js (scenario 9).
const modalState = new WeakMap();
const eventTimers = new Set();
let tickTimer = 0;
let executionActive = false;

function activeModal() {
    const modals = [...document.querySelectorAll(".ovg-modal")];
    for (let i = modals.length - 1; i >= 0; i--) {
        const modal = modals[i];
        if (modal instanceof HTMLElement && modal.isConnected) return modal;
    }
    return null;
}

function normalizeFolder(value) {
    let raw = String(value ?? "").trim().replace(/\\/g, "/");
    if (/^[A-Za-z]:\/?$/.test(raw)) return raw.slice(0, 2) + "/";
    if (raw.length > 1) raw = raw.replace(/\/+$/g, "");
    return raw;
}

function selectedFolder(modal) {
    if (modal?.dataset && Object.prototype.hasOwnProperty.call(modal.dataset, "ovgFolder")) {
        return normalizeFolder(modal.dataset.ovgFolder || "");
    }
    try { return normalizeFolder(localStorage.getItem(FOLDER_KEY) || ""); }
    catch (_) { return ""; }
}

function listRoute(modal) {
    const folder = selectedFolder(modal);
    return folder
        ? `/image-gallery/output/list-folder?folder=${encodeURIComponent(folder)}&_=${Date.now()}`
        : `/image-gallery/output/list?_=${Date.now()}`;
}

function getState(modal) {
    const folder = selectedFolder(modal);
    let state = modalState.get(modal);
    if (!state) {
        state = { folder, signature:null, pendingRefresh:false, inFlight:false, lastCheck:0 };
        modalState.set(modal, state);
    }
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
        ? [...videos].sort((a,b) => String(a?.path || "").localeCompare(String(b?.path || "")))
        : [];
    for (const item of rows) {
        feed(item?.path); feed("|"); feed(item?.mtime); feed("|"); feed(item?.size); feed(";");
    }
    return `${rows.length}:${hash.toString(16)}`;
}

function safeToRefresh(modal) {
    if (!(modal instanceof HTMLElement) || !modal.isConnected) return false;
    if (modal.querySelector(".ovg-busy")) return false;
    if (modal.querySelector(".ovg-card.marked")) return false;

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
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
        state.pendingRefresh = true;
        return false;
    }
    state.pendingRefresh = false;
    button.click();
    return true;
}

async function checkActiveModal({ force=false, baselineOnly=false } = {}) {
    if (document.hidden || executionActive) return;
    const modal = activeModal();
    if (!modal) return;
    const state = getState(modal);

    if (!baselineOnly && state.pendingRefresh) {
        if (performRefresh(modal, state)) return;
    }

    const now = Date.now();
    if (state.inFlight) return;
    if (!force && now - state.lastCheck < FALLBACK_CHECK_MS) return;
    if (force && !baselineOnly && now - state.lastCheck < MIN_EVENT_CHECK_GAP_MS) return;

    state.inFlight = true;
    state.lastCheck = now;
    try {
        const response = await api.fetchApi(listRoute(modal), { cache:"no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!modal.isConnected || activeModal() !== modal) return;

        const signature = listSignature(data?.videos || []);
        if (baselineOnly || state.signature === null) {
            state.signature = signature;
            return;
        }
        if (signature === state.signature) return;

        state.signature = signature;
        performRefresh(modal, state);
    } catch (_) {
        // Silent by design: manual refresh remains available for visible errors.
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
    if (document.hidden || executionActive || !activeModal()) {
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
    clearEventChecks();
    for (const delay of EVENT_RETRY_DELAYS) {
        const timer = setTimeout(() => {
            eventTimers.delete(timer);
            checkActiveModal({ force:true });
        }, delay);
        eventTimers.add(timer);
    }
}

app.registerExtension({
    name:EXT_NAME,
    setup() {
        syncTicker();
        setTimeout(captureInitialBaseline, 50);
        setTimeout(captureInitialBaseline, 250);

        const onExecutionStart = () => {
            executionActive = true;
            clearEventChecks();
            stopTicker();
        };
        const onExecutionEnd = () => {
            executionActive = false;
            syncTicker();
            scheduleEventChecks();
        };
        try { api.addEventListener?.("execution_start", onExecutionStart); } catch (_) {}
        for (const eventName of ["execution_success","execution_error","execution_interrupted"]) {
            try { api.addEventListener?.(eventName, onExecutionEnd); } catch (_) {}
        }

        document.addEventListener("visibilitychange",()=>{
            syncTicker();
            if (!document.hidden && activeModal()) {
                captureInitialBaseline();
                checkActiveModal({force:true});
            }
        });

        const observer=new MutationObserver(records=>{
            let modalAdded=false, modalChanged=false;
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.classList.contains("ovg-modal")) { modalAdded=true; modalChanged=true; }
                }
                for (const node of record.removedNodes) {
                    if (node instanceof Element && node.classList.contains("ovg-modal")) modalChanged=true;
                }
            }
            if (modalChanged) syncTicker();
            if (modalAdded) {
                setTimeout(captureInitialBaseline, 40);
                setTimeout(captureInitialBaseline, 250);
            }
        });
        observer.observe(document.body,{childList:true,subtree:false});
    },
});
