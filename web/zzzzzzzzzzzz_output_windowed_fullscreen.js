import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputWindowedFullscreen";
const STYLE_ID = "cig-output-windowed-fullscreen-style";
const CLASS_NAME = "cig-windowed-fullscreen";
const ROOT_CLASS = "cig-windowed-fullscreen-open";

const patched = new WeakMap();
let activePlayer = null;

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
html.${ROOT_CLASS},
body.${ROOT_CLASS}{
    overflow:hidden!important;
}

.ovg-shared-player.${CLASS_NAME}{
    position:fixed!important;
    inset:0!important;
    left:0!important;
    top:0!important;
    right:0!important;
    bottom:0!important;
    width:100vw!important;
    height:100vh!important;
    min-width:100vw!important;
    min-height:100vh!important;
    max-width:none!important;
    max-height:none!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    border-radius:0!important;
    transform:none!important;
    background:#000!important;
    overflow:hidden!important;
    z-index:2147483000!important;
}

.ovg-shared-player.${CLASS_NAME}>.ovg-shared-surface{
    position:absolute!important;
    inset:0!important;
    width:100%!important;
    height:100%!important;
    max-width:none!important;
    max-height:none!important;
    object-fit:contain!important;
    background:#000!important;
}

.ovg-shared-player.${CLASS_NAME} .ovg-shared-fs-controls{
    display:flex!important;
}

.ovg-shared-player.${CLASS_NAME} .ovg-shared-native{
    opacity:1!important;
    transform:none!important;
    pointer-events:auto!important;
    padding:24px 14px 9px!important;
}

.ovg-shared-player.${CLASS_NAME} .ovg-shared-volume{
    width:100px!important;
    max-width:120px!important;
}

.ovg-shared-player.${CLASS_NAME} .ovg-shared-ui-fullscreen{
    font-size:0!important;
}

.ovg-shared-player.${CLASS_NAME} .ovg-shared-ui-fullscreen::before{
    content:"⤢";
    font-size:16px;
    line-height:30px;
}
`;
    document.head.appendChild(style);
}

function markRoot(open) {
    document.documentElement.classList.toggle(ROOT_CLASS, open);
    document.body?.classList.toggle(ROOT_CLASS, open);
}

function exitWindowed(player = activePlayer) {
    if (!(player instanceof HTMLElement)) return;
    player.classList.remove(CLASS_NAME);
    player.dataset.cigWindowedFullscreen = "0";
    if (activePlayer === player) activePlayer = null;
    if (!activePlayer) markRoot(false);
}

function enterWindowed(player) {
    if (!(player instanceof HTMLElement) || !player.isConnected) return;
    if (activePlayer && activePlayer !== player) exitWindowed(activePlayer);
    activePlayer = player;
    player.classList.add(CLASS_NAME);
    player.dataset.cigWindowedFullscreen = "1";
    markRoot(true);
}

function toggleWindowed(player) {
    if (activePlayer === player && player.classList.contains(CLASS_NAME)) exitWindowed(player);
    else enterWindowed(player);
}

function patchPlayer(player) {
    if (!(player instanceof HTMLElement) || patched.has(player)) return;

    const originalRequest = typeof player.requestFullscreen === "function"
        ? player.requestFullscreen.bind(player)
        : null;
    const originalWebkitRequest = typeof player.webkitRequestFullscreen === "function"
        ? player.webkitRequestFullscreen.bind(player)
        : null;

    const requestWindowed = () => {
        toggleWindowed(player);
        return Promise.resolve();
    };

    try {
        Object.defineProperty(player, "requestFullscreen", {
            configurable:true,
            writable:true,
            value:requestWindowed,
        });
    } catch (_) {
        try { player.requestFullscreen = requestWindowed; } catch (_) {}
    }

    try {
        Object.defineProperty(player, "webkitRequestFullscreen", {
            configurable:true,
            writable:true,
            value:requestWindowed,
        });
    } catch (_) {
        try { player.webkitRequestFullscreen = requestWindowed; } catch (_) {}
    }

    patched.set(player, { originalRequest, originalWebkitRequest });
}

function scan(root = document) {
    if (root instanceof HTMLElement && root.classList.contains("ovg-shared-player")) patchPlayer(root);
    root.querySelectorAll?.(".ovg-shared-player").forEach(patchPlayer);
}

function cleanupRemoved(root) {
    if (!(root instanceof Element)) return;
    if (activePlayer && (root === activePlayer || root.contains(activePlayer))) exitWindowed(activePlayer);
}

app.registerExtension({
    name:EXT_NAME,
    setup() {
        ensureStyles();
        scan();

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof Element) scan(node);
                }
                for (const node of record.removedNodes) {
                    if (node instanceof Element) cleanupRemoved(node);
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:true });

        window.addEventListener("keydown", event => {
            if (event.key !== "Escape" || !activePlayer) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            exitWindowed(activePlayer);
        }, true);

        // If native fullscreen was entered by some external code/plugin,
        // do not fight it. Windowed mode is only responsible for our players.
        document.addEventListener("fullscreenchange", () => {
            if (document.fullscreenElement && activePlayer) exitWindowed(activePlayer);
        }, true);
    },
});
