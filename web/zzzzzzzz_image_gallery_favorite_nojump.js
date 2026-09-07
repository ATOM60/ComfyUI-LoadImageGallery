import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.FavoriteNoJump";
const FAVORITES_KEY = "ComfyUI-LoadImageGallery.favorites";

function normalizePath(value) {
    return String(value ?? "")
        .replace(/\\/g, "/")
        .replace(/\s*\[(input|output|temp)\]\s*$/i, "")
        .replace(/^\/+|\/+$/g, "");
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

function updateFavoriteButton(button, on) {
    button.classList.toggle("active", on);
    button.textContent = on ? "♥" : "♡";
    button.setAttribute("aria-pressed", on ? "true" : "false");

    const ru = String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en")
        .toLowerCase().startsWith("ru");
    const label = ru
        ? (on ? "Убрать из любимых" : "Добавить в любимые")
        : (on ? "Remove from favorites" : "Add to favorites");
    button.setAttribute("aria-label", label);
    button.title = label;
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.addEventListener("click", event => {
            const target = event.target instanceof Element ? event.target : null;
            const button = target?.closest?.(".cig-favorite");
            if (!button) return;

            const card = button.closest?.(".cig-card");
            const relative = normalizePath(card?.__cigRelative || card?.title || "");
            if (!relative) return;

            // Stop image_gallery.js from rebuilding and re-sorting the entire grid
            // on this click. That rebuild is what moves the scroll position.
            // The favorite state is saved immediately; the card will move into the
            // favorites group on the next normal render/reopen/refresh.
            event.preventDefault();
            event.stopImmediatePropagation();

            const favorites = loadFavorites();
            const on = !favorites.has(relative);
            if (on) favorites.add(relative);
            else favorites.delete(relative);
            saveFavorites(favorites);
            updateFavoriteButton(button, on);
        }, true);
    },
});
