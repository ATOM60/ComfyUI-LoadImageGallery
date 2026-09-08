import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoFavorites";
const STYLE_ID = "cig-output-video-favorites-style";
const FAVORITES_KEY = "ComfyUI-LoadImageGallery.outputVideoFavorites";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en")
    .toLowerCase().startsWith("ru");

const TEXT = RU ? {
    add: "Добавить в избранное",
    remove: "Убрать из избранного",
    help: "Сердечко под видео добавляет его в избранное. Избранные видео показываются в начале галереи.",
} : {
    add: "Add to favorites",
    remove: "Remove from favorites",
    help: "Use the heart under a video to add it to favorites. Favorite videos are shown first in the gallery.",
};

function normalizePath(value) {
    return String(value ?? "").trim().replace(/\\/g, "/");
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

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.ovg-card-info{position:relative;padding-right:36px!important}
.ovg-favorite{
    position:absolute;
    top:2px;
    right:4px;
    z-index:4;
    width:30px;
    height:30px;
    min-width:30px;
    padding:0;
    margin:0;
    border:0;
    border-radius:0;
    background:transparent;
    color:rgba(255,255,255,.68);
    font-size:23px;
    line-height:30px;
    text-align:center;
    cursor:pointer;
    user-select:none;
    touch-action:manipulation;
    opacity:.8;
    text-shadow:0 1px 3px rgba(0,0,0,.85);
}
.ovg-favorite:hover{background:transparent;color:#fff;opacity:1}
.ovg-favorite.active{background:transparent;color:#ff6f8f;opacity:1;text-shadow:0 1px 3px rgba(0,0,0,.9)}
`;
    document.head.appendChild(style);
}

function updateButton(button, on) {
    button.classList.toggle("active", on);
    button.textContent = on ? "♥" : "♡";
    button.setAttribute("aria-pressed", on ? "true" : "false");
    const label = on ? TEXT.remove : TEXT.add;
    button.title = label;
    button.setAttribute("aria-label", label);
}

function visibleAnchor(gridWrap, cards, excluded) {
    if (!(gridWrap instanceof HTMLElement)) return null;
    const wr = gridWrap.getBoundingClientRect();
    let best = null;
    for (const card of cards) {
        if (card === excluded) continue;
        const r = card.getBoundingClientRect();
        if (r.bottom <= wr.top || r.top >= wr.bottom) continue;
        if (!best || r.top < best.rect.top || (Math.abs(r.top - best.rect.top) < 0.5 && r.left < best.rect.left)) {
            best = { card, rect:r };
        }
    }
    return best ? { card:best.card, top:best.rect.top } : null;
}

function reorderGrid(modalState, clickedCard = null) {
    const { modal, grid } = modalState;
    if (!modal.isConnected || !grid.isConnected) return;

    const cards = [...grid.querySelectorAll(":scope > .ovg-card")];
    if (!cards.length) return;

    if (cards.some(card => !card.dataset.ovgFavoriteBaseOrder)) {
        cards.forEach((card, index) => { card.dataset.ovgFavoriteBaseOrder = String(index); });
    }

    const favorites = loadFavorites();
    const ordered = [...cards].sort((a, b) => {
        const af = favorites.has(normalizePath(a.dataset.path));
        const bf = favorites.has(normalizePath(b.dataset.path));
        if (af !== bf) return af ? -1 : 1;
        return Number(a.dataset.ovgFavoriteBaseOrder || 0) - Number(b.dataset.ovgFavoriteBaseOrder || 0);
    });

    const alreadyOrdered = ordered.every((card, index) => cards[index] === card);
    if (alreadyOrdered) return;

    const gridWrap = modal.querySelector(".ovg-grid-wrap");
    const anchor = visibleAnchor(gridWrap, cards, clickedCard);
    const fallbackTop = gridWrap instanceof HTMLElement ? gridWrap.scrollTop : 0;

    modalState.ignoreMutation = true;
    for (const card of ordered) grid.appendChild(card);

    if (gridWrap instanceof HTMLElement) {
        if (anchor?.card?.isConnected) {
            const after = anchor.card.getBoundingClientRect().top;
            gridWrap.scrollTop += after - anchor.top;
        } else {
            gridWrap.scrollTop = fallbackTop;
        }
    }
}

function installFavoriteButton(modalState, card) {
    if (!(card instanceof HTMLElement) || card.dataset.ovgFavoriteInstalled === "1") return;
    const info = card.querySelector(".ovg-card-info");
    if (!(info instanceof HTMLElement)) return;

    card.dataset.ovgFavoriteInstalled = "1";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ovg-favorite";
    info.appendChild(button);

    const path = () => normalizePath(card.dataset.path);
    updateButton(button, loadFavorites().has(path()));

    button.addEventListener("pointerdown", event => event.stopPropagation());
    button.addEventListener("mousedown", event => event.stopPropagation());
    button.addEventListener("dblclick", event => {
        event.preventDefault();
        event.stopPropagation();
    });
    button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        const key = path();
        if (!key) return;
        const favorites = loadFavorites();
        const on = !favorites.has(key);
        if (on) favorites.add(key);
        else favorites.delete(key);
        saveFavorites(favorites);
        updateButton(button, on);
        reorderGrid(modalState, card);
    });
}

function patchGrid(modalState) {
    const { grid } = modalState;
    if (!grid.isConnected) return;

    const cards = [...grid.querySelectorAll(":scope > .ovg-card")];
    if (!cards.length) return;

    const freshRender = cards.some(card => !card.dataset.ovgFavoriteBaseOrder);
    if (freshRender) {
        cards.forEach((card, index) => { card.dataset.ovgFavoriteBaseOrder = String(index); });
    }

    for (const card of cards) {
        installFavoriteButton(modalState, card);
        const button = card.querySelector(".ovg-favorite");
        if (button) updateButton(button, loadFavorites().has(normalizePath(card.dataset.path)));
    }

    reorderGrid(modalState);
}

const modalStates = new WeakMap();

function installModal(modal) {
    if (!(modal instanceof HTMLElement) || modalStates.has(modal)) return;
    const grid = modal.querySelector(".ovg-grid");
    if (!(grid instanceof HTMLElement)) return;

    const state = { modal, grid, observer:null, raf:0, ignoreMutation:false };
    modalStates.set(modal, state);

    const schedule = () => {
        if (state.raf) return;
        state.raf = requestAnimationFrame(() => {
            state.raf = 0;
            patchGrid(state);
        });
    };

    state.observer = new MutationObserver(() => {
        if (state.ignoreMutation) {
            state.ignoreMutation = false;
            return;
        }
        schedule();
    });
    state.observer.observe(grid, { childList:true });
    schedule();
}

function uninstallModal(modal) {
    const state = modalStates.get(modal);
    if (!state) return;
    state.observer?.disconnect();
    if (state.raf) cancelAnimationFrame(state.raf);
    modalStates.delete(modal);
}

function updateHelp(root) {
    const overlay = root instanceof HTMLElement && root.classList.contains("ovg-help-overlay")
        ? root
        : root.querySelector?.(".ovg-help-overlay");
    if (!(overlay instanceof HTMLElement) || overlay.dataset.ovgFavoritesHelp === "1") return;
    const lists = overlay.querySelectorAll(".ovg-help-body ul");
    const list = lists.length ? lists[lists.length - 1] : null;
    if (!(list instanceof HTMLElement)) return;
    overlay.dataset.ovgFavoritesHelp = "1";
    const item = document.createElement("li");
    item.textContent = TEXT.help;
    list.appendChild(item);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        injectStyles();
        document.querySelectorAll(".ovg-modal").forEach(installModal);
        updateHelp(document);

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.classList.contains("ovg-modal")) installModal(node);
                    node.querySelectorAll?.(".ovg-modal").forEach(installModal);
                    updateHelp(node);
                }
                for (const node of record.removedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.classList.contains("ovg-modal")) uninstallModal(node);
                    node.querySelectorAll?.(".ovg-modal").forEach(uninstallModal);
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
