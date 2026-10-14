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
    if (/^[a-z]:/.test(raw)) raw = raw[0].toUpperCase() + raw.slice(1);
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

// Recent folders: most recently opened first, compared case-insensitively.
const folderKey = folder => normalizeFolder(folder).toLowerCase();

function loadRecentFolders() {
    try {
        const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
        if (!Array.isArray(raw)) return [];
        const out = [];
        for (const item of raw) {
            const folder = normalizeFolder(item);
            if (!folder || out.some(v => folderKey(v) === folderKey(folder))) continue;
            out.push(folder);
            if (out.length >= RECENT_LIMIT) break;
        }
        return out;
    } catch (_) {
        return [];
    }
}

function saveRecentFolders(list) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_LIMIT))); }
    catch (_) {}
}

function rememberFolder(folder) {
    const normalized = normalizeFolder(folder);
    if (!normalized) return;
    saveRecentFolders([normalized, ...loadRecentFolders().filter(item => folderKey(item) !== folderKey(normalized))]);
}

// Keeps a folder in the list without moving it to the top.
function keepInRecent(folder) {
    const normalized = normalizeFolder(folder);
    const recent = loadRecentFolders();
    if (normalized && !recent.some(item => folderKey(item) === folderKey(normalized))) saveRecentFolders([...recent, normalized]);
}

// "name — …/parent/folders": tells apart folders with the same name.
function folderLabel(folder) {
    const normalized = normalizeFolder(folder);
    if (!normalized) return TEXT.output;
    if (/^[A-Za-z]:\/$/.test(normalized)) return normalized;
    const i = normalized.lastIndexOf("/");
    const name = normalized.slice(i + 1);
    let parent = normalized.slice(0, i) || normalized.slice(0, 2);
    if (parent.length > 32) parent = "…/" + parent.split("/").slice(-2).join("/");
    return `${name} — ${parent}`;
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

// CIG_OUTPUT_FOLDER_INSTALL_GUARD_V1
// The chosen folder lives in browser storage, which outlives a ComfyUI
// reinstall or move (Comfy Desktop keeps it outside the installation). Each
// listing reports the current installation's output folder; a remembered
// folder that is gone, or that was chosen under another installation, falls
// back to this installation's output. It stays in the recent list.
const OUTPUT_ROOT_KEY = "ComfyUI-LoadImageGallery.outputVideoComfyOutput";

function sameFolder(a, b) {
    return normalizeFolder(a).toLowerCase() === normalizeFolder(b).toLowerCase();
}

function loadOutputRoot() {
    try { return normalizeFolder(localStorage.getItem(OUTPUT_ROOT_KEY) || ""); }
    catch (_) { return ""; }
}

function saveOutputRoot(root) {
    if (!root) return;
    try { localStorage.setItem(OUTPUT_ROOT_KEY, normalizeFolder(root)); }
    catch (_) {}
}

async function jsonOf(response) {
    try { return await response.clone().json(); }
    catch (_) { return null; }
}

function staleReason(folder, response, data) {
    const comfyOutput = normalizeFolder(data?.comfy_output || "");
    if (response.status === 404) return RU ? `Папка не найдена: ${folder}` : `Folder not found: ${folder}`;
    if (!response.ok || !comfyOutput) return "";
    const known = loadOutputRoot();
    // Before this guard existed nothing was recorded: a remembered folder named
    // "output" that is not this installation's output is an old installation's.
    const changed = known ? !sameFolder(known, comfyOutput)
        : /\/output$/i.test(normalizeFolder(folder)) && !sameFolder(folder, comfyOutput);
    if (!changed) return "";
    return RU ? `Папка выбрана в другой установке ComfyUI: ${folder}` : `Folder was chosen in another ComfyUI installation: ${folder}`;
}

function resetToOutput(folder, reason) {
    saveCurrentFolder("");
    keepInRecent(folder);
    const modal = visibleOutputModal();
    if (modal) {
        modal.dataset.ovgFolder = "";
        const select = modal.querySelector(".ovg-folder-select");
        if (select instanceof HTMLSelectElement) rebuildSelect(select, "");
    }
    try {
        app.extensionManager?.toast?.add({
            severity: "info",
            summary: RU ? "Открыта папка output" : "Showing output",
            detail: `${reason}. ${RU ? "Её можно снова выбрать в списке папок." : "You can pick it again from the folder list."}`,
            life: 6000,
        });
    } catch (_) {}
}

function patchOutputListRequest() {
    if (api.__cigOutputFolderListPatched) return;
    api.__cigOutputFolderListPatched = true;

    const originalFetchApi = api.fetchApi;
    api.fetchApi = async function(route, options) {
        if (typeof route !== "string" || route !== "/image-gallery/output/list") {
            return originalFetchApi.call(this, route, options);
        }
        const folder = folderForListRequest();
        if (folder) {
            const response = await originalFetchApi.call(this, `/image-gallery/output/list-folder?folder=${encodeURIComponent(folder)}`, options);
            const data = await jsonOf(response);
            const reason = staleReason(folder, response, data);
            if (!reason) {
                saveOutputRoot(data?.comfy_output);
                return response;
            }
            resetToOutput(folder, reason);
        }
        const response = await originalFetchApi.call(this, route, options);
        if (response.ok) saveOutputRoot((await jsonOf(response))?.output);
        return response;
    };
}

function rebuildSelect(select, selectedFolder) {
    const current = normalizeFolder(selectedFolder);
    const folders = loadRecentFolders();
    if (current && !folders.some(item => folderKey(item) === folderKey(current))) folders.unshift(current);

    select.replaceChildren();

    const output = document.createElement("option");
    output.value = "";
    output.textContent = TEXT.output;
    select.appendChild(output);

    if (folders.length) {
        const group = document.createElement("optgroup");
        group.label = RU ? "Недавние папки" : "Recent folders";
        for (const folder of folders) {
            const option = document.createElement("option");
            option.value = folder;
            option.textContent = folderLabel(folder);
            option.title = folder;
            option.selected = folderKey(folder) === folderKey(current);
            group.appendChild(option);
        }
        select.appendChild(group);
    }

    if (!current) select.value = "";
    select.title = current || TEXT.output;
}

function refreshGallery(modal) {
    const refresh = modal.querySelector(".ovg-refresh-modal");
    if (refresh instanceof HTMLElement) refresh.click();
}

function setFolder(modal, select, folder) {
    const normalized = normalizeFolder(folder);
    modal.dataset.ovgFolder = normalized;
    saveCurrentFolder(normalized);
    if (normalized) rememberFolder(normalized);
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
            const response = await api.fetchApi("/image-gallery/output/pick-folder", { method: "POST" });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || TEXT.error);
            if (!data?.path) return;
            setFolder(modal, select, data.path);
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
