import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoFolderPicker";
const STYLE_ID = "cig-output-video-folder-picker-style";
const FOLDER_KEY = "ComfyUI-LoadImageGallery.outputVideoFolder";
const RECENT_KEY = "ComfyUI-LoadImageGallery.outputVideoRecentFolders";
const RECENT_LIMIT = 10;
const LANG_KEY = "ComfyUI-LoadImageGallery.language";

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en")
    .toLowerCase().startsWith("ru");

const TEXT = RU ? {
    output: "output",
    choose: "Выбрать папку с видео",
    folder: "Папка с видео",
    error: "Не удалось выбрать папку",
} : {
    output: "output",
    choose: "Choose video folder",
    folder: "Video folder",
    error: "Could not choose folder",
};

function normalizeFolder(value) {
    let raw = String(value ?? "").trim().replace(/\\/g, "/");
    if (/^[A-Za-z]:\/?$/.test(raw)) return raw.slice(0, 2) + "/";
    if (raw.length > 1) raw = raw.replace(/\/+$/g, "");
    return raw;
}

function loadCurrentFolder() {
    try { return normalizeFolder(localStorage.getItem(FOLDER_KEY) || ""); }
    catch (_) { return ""; }
}

function saveCurrentFolder(folder) {
    try { localStorage.setItem(FOLDER_KEY, normalizeFolder(folder)); }
    catch (_) {}
}

function loadRecentFolders() {
    try {
        const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
        if (!Array.isArray(raw)) return [];
        const out = [];
        for (const item of raw) {
            const folder = normalizeFolder(item);
            if (!folder || out.includes(folder)) continue;
            out.push(folder);
            if (out.length >= RECENT_LIMIT) break;
        }
        return out;
    } catch (_) {
        return [];
    }
}

function rememberFolder(folder) {
    const normalized = normalizeFolder(folder);
    if (!normalized) return;
    const recent = [normalized, ...loadRecentFolders().filter(item => item !== normalized)].slice(0, RECENT_LIMIT);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); }
    catch (_) {}
}

function shortFolderName(folder) {
    const normalized = normalizeFolder(folder);
    if (!normalized) return TEXT.output;
    const withoutSlash = normalized.replace(/\/+$/g, "");
    const parts = withoutSlash.split("/").filter(Boolean);
    return parts.at(-1) || normalized;
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.ovg-toolbar{flex-wrap:nowrap!important}
.ovg-search{min-width:120px!important}
.ovg-folder-select{
    box-sizing:border-box!important;
    flex:0 0 150px!important;
    width:150px!important;
    min-width:120px!important;
    max-width:150px!important;
    height:34px!important;
    padding:5px 7px!important;
    overflow:hidden!important;
    text-overflow:ellipsis!important;
    white-space:nowrap!important;
}
.ovg-folder-pick{
    box-sizing:border-box!important;
    flex:0 0 36px!important;
    width:36px!important;
    min-width:36px!important;
    height:34px!important;
    padding:0!important;
    font-size:17px!important;
    line-height:32px!important;
}
`;
    document.head.appendChild(style);
}

function visibleOutputModal() {
    const modals = [...document.querySelectorAll(".ovg-modal")];
    for (let i = modals.length - 1; i >= 0; i--) {
        const modal = modals[i];
        if (modal instanceof HTMLElement && modal.isConnected) return modal;
    }
    return null;
}

function folderForListRequest() {
    const modal = visibleOutputModal();
    if (modal?.dataset && Object.prototype.hasOwnProperty.call(modal.dataset, "ovgFolder")) {
        return normalizeFolder(modal.dataset.ovgFolder || "");
    }
    return loadCurrentFolder();
}

function patchOutputListRequest() {
    if (api.__cigOutputFolderListPatched) return;
    api.__cigOutputFolderListPatched = true;

    const originalFetchApi = api.fetchApi;
    api.fetchApi = function(route, options) {
        if (typeof route === "string" && route === "/image-gallery/output/list") {
            const folder = folderForListRequest();
            if (folder) {
                route = `/image-gallery/output/list-folder?folder=${encodeURIComponent(folder)}`;
            }
        }
        return originalFetchApi.call(this, route, options);
    };
}

function rebuildSelect(select, selectedFolder) {
    const current = normalizeFolder(selectedFolder);
    const folders = loadRecentFolders();
    if (current && !folders.includes(current)) folders.unshift(current);

    select.replaceChildren();

    const output = document.createElement("option");
    output.value = "";
    output.textContent = TEXT.output;
    select.appendChild(output);

    for (const folder of folders) {
        const option = document.createElement("option");
        option.value = folder;
        option.textContent = shortFolderName(folder);
        option.title = folder;
        select.appendChild(option);
    }

    select.value = current;
    select.title = current || TEXT.output;
}

function refreshGallery(modal) {
    const refresh = modal.querySelector(".ovg-refresh-modal");
    if (refresh instanceof HTMLElement) refresh.click();
}

function setFolder(modal, select, folder, { remember = false } = {}) {
    const normalized = normalizeFolder(folder);
    modal.dataset.ovgFolder = normalized;
    saveCurrentFolder(normalized);
    if (remember && normalized) rememberFolder(normalized);
    rebuildSelect(select, normalized);
    refreshGallery(modal);
}

function showError(message) {
    try {
        app.extensionManager?.toast?.add({
            severity: "error",
            summary: TEXT.error,
            detail: message,
            life: 3800,
        });
    } catch (_) {
        alert(message);
    }
}

function installControls(modal) {
    if (!(modal instanceof HTMLElement) || modal.dataset.ovgFolderPickerInstalled === "1") return;
    const toolbar = modal.querySelector(".ovg-toolbar");
    const search = toolbar?.querySelector(".ovg-search");
    if (!(toolbar instanceof HTMLElement) || !(search instanceof HTMLElement)) return;

    modal.dataset.ovgFolderPickerInstalled = "1";
    const selectedFolder = loadCurrentFolder();
    modal.dataset.ovgFolder = selectedFolder;

    const select = document.createElement("select");
    select.className = "ovg-folder-select";
    select.setAttribute("aria-label", TEXT.folder);
    rebuildSelect(select, selectedFolder);

    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "ovg-btn ovg-folder-pick";
    pick.textContent = "...";
    pick.title = TEXT.choose;
    pick.setAttribute("aria-label", TEXT.choose);

    search.insertAdjacentElement("afterend", select);
    select.insertAdjacentElement("afterend", pick);

    select.addEventListener("change", () => {
        setFolder(modal, select, select.value || "");
    });

    pick.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        pick.disabled = true;
        try {
            const response = await api.fetchApi("/image-gallery/pick-folder", { method: "POST" });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || TEXT.error);
            if (!data?.path) return;
            setFolder(modal, select, data.path, { remember: true });
        } catch (error) {
            showError(error?.message || String(error));
        } finally {
            pick.disabled = false;
        }
    });
}

function scan(root = document) {
    if (root instanceof HTMLElement && root.classList.contains("ovg-modal")) installControls(root);
    root.querySelectorAll?.(".ovg-modal").forEach(installControls);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        injectStyles();
        patchOutputListRequest();
        scan();

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof Element) scan(node);
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    },
});
