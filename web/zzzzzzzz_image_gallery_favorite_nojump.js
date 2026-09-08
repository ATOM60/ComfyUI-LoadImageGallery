import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.FavoriteNoJump";
const FAVORITES_KEY = "ComfyUI-LoadImageGallery.favorites";
const SORT_KEY = "ComfyUI-LoadImageGallery.sortMode";
const installedOverlays = new WeakSet();

function normalizePath(value) {
    return String(value ?? "")
        .replace(/\\/g, "/")
        .replace(/\s*\[(input|output|temp)\]\s*$/i, "")
        .replace(/^\/+|\/+$/g, "");
}

function splitPath(value) {
    const clean = normalizePath(value);
    const index = clean.lastIndexOf("/");
    return index < 0
        ? { folder:"", filename:clean }
        : { folder:clean.slice(0, index), filename:clean.slice(index + 1) };
}

function loadFavorites() {
    try {
        const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
        return new Set(Array.isArray(raw) ? raw.map(normalizePath).filter(Boolean) : []);
    } catch (_) {
        return new Set();
    }
}

function saveFavorites(favorites) {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); }
    catch (_) {}
}

function currentLanguageIsRussian() {
    return String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en")
        .toLowerCase().startsWith("ru");
}

function updateFavoriteButton(button, on) {
    button.classList.toggle("active", on);
    button.textContent = on ? "♥" : "♡";
    button.setAttribute("aria-pressed", on ? "true" : "false");

    const label = currentLanguageIsRussian()
        ? (on ? "Убрать из любимых" : "Добавить в любимые")
        : (on ? "Remove from favorites" : "Add to favorites");
    button.setAttribute("aria-label", label);
    button.title = label;
}

function cardKey(card) {
    return normalizePath(card?.__cigRelative || card?.title || "");
}

function captureViewport(body, ignoredCard = null) {
    const bodyRect = body.getBoundingClientRect();
    const cards = [...body.querySelectorAll(".cig-card")];
    let best = null;

    for (const card of cards) {
        if (card === ignoredCard) continue;
        const key = cardKey(card);
        if (!key) continue;
        const rect = card.getBoundingClientRect();
        if (rect.bottom <= bodyRect.top || rect.top >= bodyRect.bottom) continue;

        if (!best || rect.top < best.rect.top || (Math.abs(rect.top - best.rect.top) < 0.5 && rect.left < best.rect.left)) {
            best = { key, rect };
        }
    }

    return {
        top: body.scrollTop,
        left: body.scrollLeft,
        anchorKey: best?.key || "",
        anchorOffset: best ? best.rect.top - bodyRect.top : 0,
    };
}

function restoreViewport(body, snapshot) {
    if (!body?.isConnected || !snapshot) return;

    if (snapshot.anchorKey) {
        const bodyRect = body.getBoundingClientRect();
        const anchor = [...body.querySelectorAll(".cig-card")].find(card => cardKey(card) === snapshot.anchorKey);
        if (anchor) {
            const currentOffset = anchor.getBoundingClientRect().top - bodyRect.top;
            body.scrollTop += currentOffset - snapshot.anchorOffset;
            body.scrollLeft = snapshot.left;
            return;
        }
    }

    body.scrollTop = snapshot.top;
    body.scrollLeft = snapshot.left;
}

function compareNames(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric:true, sensitivity:"base" });
}

function sortCards(cards, metadata, mode) {
    const metaFor = card => metadata.get(splitPath(cardKey(card)).filename) || {};
    const nameFor = card => splitPath(cardKey(card)).filename;

    return [...cards].sort((a, b) => {
        const nameA = nameFor(a), nameB = nameFor(b);
        const metaA = metaFor(a), metaB = metaFor(b);
        switch (mode) {
            case "name-desc": return -compareNames(nameA, nameB);
            case "date-desc": return (Number(metaB.mtime) || 0) - (Number(metaA.mtime) || 0) || compareNames(nameA, nameB);
            case "date-asc": return (Number(metaA.mtime) || 0) - (Number(metaB.mtime) || 0) || compareNames(nameA, nameB);
            case "size-desc": return (Number(metaB.size) || 0) - (Number(metaA.size) || 0) || compareNames(nameA, nameB);
            case "size-asc": return (Number(metaA.size) || 0) - (Number(metaB.size) || 0) || compareNames(nameA, nameB);
            default: return compareNames(nameA, nameB);
        }
    });
}

async function loadMetadata(folder) {
    try {
        const response = await api.fetchApi(`/image-gallery/list?folder=${encodeURIComponent(folder || "")}`);
        if (!response.ok) return new Map();
        const data = await response.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        return new Map(items.map(item => [String(item?.name ?? ""), item || {}]));
    } catch (_) {
        return new Map();
    }
}

async function reorderGallery(body, grid, folder, clickedCard) {
    if (!body?.isConnected || !grid?.isConnected) return;

    const metadata = await loadMetadata(folder);
    if (!body?.isConnected || !grid?.isConnected) return;

    const snapshot = captureViewport(body, clickedCard);
    const oldOverflowAnchor = body.style.overflowAnchor;
    const oldScrollBehavior = body.style.scrollBehavior;
    body.style.overflowAnchor = "none";
    body.style.scrollBehavior = "auto";

    const favorites = loadFavorites();
    const cards = [...grid.children].filter(child => child.classList?.contains("cig-card"));
    const sortMode = (() => {
        try { return localStorage.getItem(SORT_KEY) || "name-asc"; }
        catch (_) { return "name-asc"; }
    })();

    const sorted = sortCards(cards, metadata, sortMode);
    const ordered = [
        ...sorted.filter(card => favorites.has(cardKey(card))),
        ...sorted.filter(card => !favorites.has(cardKey(card))),
    ];

    const firstFolderCard = [...grid.children].find(child => child.classList?.contains("cig-folder-card")) || null;
    for (const card of ordered) grid.insertBefore(card, firstFolderCard);

    restoreViewport(body, snapshot);
    requestAnimationFrame(() => {
        restoreViewport(body, snapshot);
        requestAnimationFrame(() => {
            restoreViewport(body, snapshot);
            body.style.overflowAnchor = oldOverflowAnchor;
            body.style.scrollBehavior = oldScrollBehavior;
        });
    });
}

function installOverlay(overlay) {
    if (!(overlay instanceof HTMLElement) || installedOverlays.has(overlay)) return;
    installedOverlays.add(overlay);

    overlay.addEventListener("click", event => {
        const target = event.target instanceof Element ? event.target : null;
        const button = target?.closest?.(".cig-favorite");
        if (!button || !overlay.contains(button)) return;

        const card = button.closest?.(".cig-card");
        const relative = cardKey(card);
        if (!relative) return;

        const body = overlay.querySelector?.(".cig-body");
        const grid = overlay.querySelector?.(".cig-grid");
        if (!(body instanceof HTMLElement) || !(grid instanceof HTMLElement)) return;

        // Intercept on the gallery overlay during capture so the original favorite
        // handler in image_gallery.js never rebuilds the whole grid or jumps scroll.
        event.preventDefault();
        event.stopImmediatePropagation();

        const favorites = loadFavorites();
        const on = !favorites.has(relative);
        if (on) favorites.add(relative);
        else favorites.delete(relative);
        saveFavorites(favorites);
        updateFavoriteButton(button, on);

        const folder = splitPath(relative).folder;
        void reorderGallery(body, grid, folder, card);
    }, true);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.querySelectorAll(".cig-overlay").forEach(installOverlay);

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.classList.contains("cig-overlay")) installOverlay(node);
                }
            }
        });
        // Input gallery overlays are direct body children. No global click capture
        // is needed while the gallery is closed.
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
