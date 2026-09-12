import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.InputContextMenuRestore";
const STYLE_ID = "cig-input-context-menu-restore-style";
const COPY_KEY = "ComfyUI-LoadImageGallery.inputCopiedImage";

const RU = String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en")
    .toLowerCase().startsWith("ru");

const TEXT = RU ? {
    save: "Сохранить изображение",
    copy: "Копировать изображение",
    paste: "Вставить изображение",
    copyOk: "Изображение скопировано",
    pasteError: "Не удалось вставить изображение",
} : {
    save: "Save Image",
    copy: "Copy Image",
    paste: "Paste Image",
    copyOk: "Image copied",
    pasteError: "Could not paste image",
};

let menu = null;
let copied = loadCopied();

function normalizePath(value) {
    return String(value ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function splitPath(value) {
    const clean = normalizePath(value);
    const i = clean.lastIndexOf("/");
    return i < 0
        ? { folder:"", filename:clean }
        : { folder:clean.slice(0, i), filename:clean.slice(i + 1) };
}

function loadCopied() {
    try {
        const value = JSON.parse(localStorage.getItem(COPY_KEY) || "null");
        if (!value || typeof value !== "object") return null;
        const folder = normalizePath(value.folder || "");
        const filename = String(value.filename || "").trim();
        return filename ? { folder, filename } : null;
    } catch (_) {
        return null;
    }
}

function saveCopied(value) {
    copied = value;
    try { localStorage.setItem(COPY_KEY, JSON.stringify(value)); }
    catch (_) {}
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cig-input-restored-menu{
    position:fixed;z-index:2147483646;min-width:205px;padding:6px;
    background:#242424;border:1px solid #4b4b4b;border-radius:8px;
    box-shadow:0 10px 35px rgba(0,0,0,.62);font:14px Arial,sans-serif;color:#eee
}
.cig-input-restored-menu button{
    display:block;width:100%;height:38px;padding:0 12px;border:0;border-radius:5px;
    background:transparent;color:#eee;text-align:left;font:14px Arial,sans-serif;
    cursor:pointer;white-space:nowrap
}
.cig-input-restored-menu button:hover{background:#3a3a3a}
.cig-input-restored-menu button:disabled{opacity:.4;cursor:default;background:transparent}
`;
    document.head.appendChild(style);
}

function closeMenu() {
    menu?.remove?.();
    menu = null;
}

function cardInfo(card) {
    if (!(card instanceof HTMLElement)) return null;
    const relative = normalizePath(card.__cigRelative || card.title || "");
    if (!relative) return null;
    const { folder, filename } = splitPath(relative);
    if (!filename) return null;
    return { relative, folder, filename };
}

function originalUrl(folder, filename) {
    const p = new URLSearchParams();
    p.set("folder", folder || "");
    p.set("filename", filename);
    return api.apiURL(`/image-gallery/original?${p.toString()}`);
}

async function copyToSystemClipboard(info) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
    try {
        const response = await fetch(originalUrl(info.folder, info.filename), { credentials:"same-origin" });
        if (!response.ok) return false;
        let blob = await response.blob();
        let type = blob.type || "image/png";
        if (!type.startsWith("image/")) type = "image/png";
        await navigator.clipboard.write([new ClipboardItem({ [type]:blob })]);
        return true;
    } catch (_) {
        return false;
    }
}

async function copyImage(info) {
    saveCopied({ folder:info.folder, filename:info.filename });
    // System clipboard is best-effort only. Internal copy always succeeds first.
    void copyToSystemClipboard(info);
}

function saveImage(info) {
    const a = document.createElement("a");
    a.href = originalUrl(info.folder, info.filename);
    a.download = info.filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function pasteInternal(targetFolder) {
    if (!copied?.filename) return false;
    const response = await api.fetchApi("/image-gallery/paste", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({
            source_folder: copied.folder || "",
            source_filename: copied.filename,
            target_folder: targetFolder || "",
        }),
    });
    if (!response.ok) {
        let message = `${response.status}`;
        try { message = (await response.json())?.error || message; } catch (_) {}
        throw new Error(message);
    }
    return true;
}

async function pasteSystemClipboard(targetFolder) {
    if (!navigator.clipboard?.read) return false;
    let items;
    try { items = await navigator.clipboard.read(); }
    catch (_) { return false; }

    for (const item of items || []) {
        const type = item.types?.find(t => String(t).startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        const ext = type === "image/jpeg" ? ".jpg" : type === "image/webp" ? ".webp" : type === "image/gif" ? ".gif" : ".png";
        const form = new FormData();
        form.append("file", blob, `pasted${ext}`);
        const response = await api.fetchApi(`/image-gallery/paste?folder=${encodeURIComponent(targetFolder || "")}`, {
            method:"POST",
            body:form,
        });
        if (!response.ok) {
            let message = `${response.status}`;
            try { message = (await response.json())?.error || message; } catch (_) {}
            throw new Error(message);
        }
        return true;
    }
    return false;
}

async function pasteImage(targetFolder, overlay) {
    let ok = false;
    try {
        if (copied?.filename) ok = await pasteInternal(targetFolder);
        if (!ok) ok = await pasteSystemClipboard(targetFolder);
        if (!ok) throw new Error(TEXT.pasteError);

        // Reuse the gallery's own refresh logic so sorting, favorites and cache state stay intact.
        const refresh = overlay?.querySelector?.(".cig-refresh");
        if (refresh instanceof HTMLButtonElement) refresh.click();
    } catch (error) {
        console.error("[InputGalleryContextMenu] paste failed:", error);
    }
}

function addButton(label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("pointerdown", event => event.stopPropagation());
    button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        void handler();
    });
    menu.appendChild(button);
    return button;
}

function showMenu(event, card) {
    const info = cardInfo(card);
    if (!info) return;
    const overlay = card.closest(".cig-overlay");
    if (!(overlay instanceof HTMLElement)) return;

    closeMenu();
    menu = document.createElement("div");
    menu.className = "cig-input-restored-menu";

    addButton(TEXT.save, () => saveImage(info));
    addButton(TEXT.copy, () => copyImage(info));
    addButton(TEXT.paste, () => pasteImage(info.folder, overlay));

    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const left = Math.max(4, Math.min(event.clientX, innerWidth - rect.width - 4));
    const top = Math.max(4, Math.min(event.clientY, innerHeight - rect.height - 4));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function onContextMenu(event) {
    if (!(event.target instanceof Element)) return;
    const card = event.target.closest(".cig-overlay .cig-card");
    if (!(card instanceof HTMLElement)) return;
    if (event.target.closest(".cig-favorite")) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showMenu(event, card);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        document.addEventListener("contextmenu", onContextMenu, true);
        document.addEventListener("pointerdown", event => {
            if (menu && event.target instanceof Node && !menu.contains(event.target)) closeMenu();
        }, true);
        window.addEventListener("blur", closeMenu);
        window.addEventListener("resize", closeMenu, { passive:true });
        document.addEventListener("scroll", closeMenu, true);
    },
});
