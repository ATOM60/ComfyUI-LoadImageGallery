import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoCpuInterface";
const STYLE_ID = "cig-output-video-cpu-interface-style";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const VOLUME_KEY = "ComfyUI-LoadImageGallery.outputVideoVolume";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en")
    .toLowerCase().startsWith("ru");

const TEXT = RU ? {
    play: "Воспроизвести",
    pause: "Пауза",
    volume: "Громкость",
    speed: "Скорость",
    fullscreen: "На весь экран",
    exitFullscreen: "Выйти из полноэкранного режима",
    prev: "Предыдущее видео",
    next: "Следующее видео",
} : {
    play: "Play",
    pause: "Pause",
    volume: "Volume",
    speed: "Speed",
    fullscreen: "Fullscreen",
    exitFullscreen: "Exit fullscreen",
    prev: "Previous video",
    next: "Next video",
};

function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function loadVolume() {
    try {
        const raw = localStorage.getItem(VOLUME_KEY);
        return raw == null ? 1 : clamp(raw, 0, 1, 1);
    } catch (_) {
        return 1;
    }
}

function loadRate() {
    try { return clamp(localStorage.getItem(RATE_KEY) || 1, 0.25, 3, 1); }
    catch (_) { return 1; }
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.ovg-cpu-interface{
    position:absolute;
    left:0;
    right:0;
    bottom:0;
    z-index:12;
    display:flex;
    align-items:center;
    gap:7px;
    min-height:38px;
    padding:5px 8px;
    box-sizing:border-box;
    background:linear-gradient(to top,rgba(0,0,0,.88),rgba(0,0,0,.58),transparent);
    opacity:0;
    transform:translateY(3px);
    transition:opacity .14s ease,transform .14s ease;
    pointer-events:none;
}
.ovg-cpu-player:hover .ovg-cpu-interface,
.ovg-cpu-player.paused .ovg-cpu-interface,
.ovg-cpu-player:fullscreen .ovg-cpu-interface{
    opacity:1;
    transform:none;
    pointer-events:auto;
}
.ovg-cpu-interface button{
    flex:0 0 auto;
    width:30px;
    height:30px;
    min-width:30px;
    padding:0;
    border:0;
    border-radius:5px;
    background:transparent;
    color:#fff;
    font:16px/30px "Segoe UI Symbol",Arial,sans-serif;
    text-align:center;
    cursor:pointer;
}
.ovg-cpu-interface button:hover{background:rgba(255,255,255,.16)}
.ovg-cpu-volume{
    flex:0 1 90px;
    width:72px;
    min-width:48px;
    max-width:100px;
    accent-color:#fff;
    cursor:pointer;
}
.ovg-cpu-rate{
    flex:0 0 auto;
    height:28px;
    min-width:52px;
    padding:0 4px;
    border:0;
    border-radius:5px;
    background:rgba(0,0,0,.3);
    color:#fff;
    font:12px Arial,sans-serif;
    cursor:pointer;
}
.ovg-cpu-interface-spacer{flex:1 1 auto;min-width:0}
.ovg-cpu-player:fullscreen .ovg-cpu-interface{padding:7px 12px;min-height:44px}
.ovg-cpu-player:fullscreen .ovg-cpu-volume{width:100px;max-width:120px}
`;
    document.head.appendChild(style);
}

function stopEvent(event) {
    event.stopPropagation();
}

function syncPlayButton(player, button) {
    const paused = player.classList.contains("paused");
    button.textContent = paused ? "▶" : "❚❚";
    button.title = paused ? TEXT.play : TEXT.pause;
    button.setAttribute("aria-label", paused ? TEXT.play : TEXT.pause);
}

function syncFullscreenButton(player, button) {
    const on = document.fullscreenElement === player;
    button.textContent = on ? "⤢" : "⛶";
    button.title = on ? TEXT.exitFullscreen : TEXT.fullscreen;
    button.setAttribute("aria-label", on ? TEXT.exitFullscreen : TEXT.fullscreen);
}

function dispatchVolumeSteps(player, from, to) {
    const start = Math.round(clamp(from, 0, 1, 1) * 20);
    const target = Math.round(clamp(to, 0, 1, 1) * 20);
    const count = Math.abs(target - start);
    if (!count) return;
    const deltaY = target > start ? -100 : 100;
    for (let i = 0; i < count; i++) {
        player.dispatchEvent(new WheelEvent("wheel", {
            deltaY,
            bubbles:false,
            cancelable:true,
        }));
    }
}

function installPlayer(player) {
    if (!(player instanceof HTMLElement) || player.dataset.ovgCpuInterfaceInstalled === "1") return;
    player.dataset.ovgCpuInterfaceInstalled = "1";

    const bar = document.createElement("div");
    bar.className = "ovg-cpu-interface";
    bar.innerHTML = `
        <button class="ovg-cpu-ui-play" type="button"></button>
        <button class="ovg-cpu-ui-prev" type="button" title="${TEXT.prev}">⏮</button>
        <button class="ovg-cpu-ui-next" type="button" title="${TEXT.next}">⏭</button>
        <input class="ovg-cpu-volume" type="range" min="0" max="1" step="0.05" title="${TEXT.volume}" aria-label="${TEXT.volume}">
        <select class="ovg-cpu-rate" title="${TEXT.speed}" aria-label="${TEXT.speed}">
            <option value="0.25">0.25×</option>
            <option value="0.5">0.5×</option>
            <option value="0.75">0.75×</option>
            <option value="1">1×</option>
            <option value="1.25">1.25×</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
            <option value="2.5">2.5×</option>
            <option value="3">3×</option>
        </select>
        <span class="ovg-cpu-interface-spacer"></span>
        <button class="ovg-cpu-ui-fullscreen" type="button"></button>`;

    player.appendChild(bar);

    const play = bar.querySelector(".ovg-cpu-ui-play");
    const prev = bar.querySelector(".ovg-cpu-ui-prev");
    const next = bar.querySelector(".ovg-cpu-ui-next");
    const volume = bar.querySelector(".ovg-cpu-volume");
    const rate = bar.querySelector(".ovg-cpu-rate");
    const fullscreen = bar.querySelector(".ovg-cpu-ui-fullscreen");

    volume.value = String(loadVolume());
    const savedRate = loadRate();
    const nearest = [...rate.options].reduce((best, option) =>
        Math.abs(Number(option.value) - savedRate) < Math.abs(Number(best.value) - savedRate) ? option : best,
        rate.options[0]);
    rate.value = nearest.value;

    syncPlayButton(player, play);
    syncFullscreenButton(player, fullscreen);

    for (const element of [bar, play, prev, next, volume, rate, fullscreen]) {
        element.addEventListener("pointerdown", stopEvent);
        element.addEventListener("mousedown", stopEvent);
        element.addEventListener("click", stopEvent);
        element.addEventListener("dblclick", stopEvent);
    }

    play.addEventListener("click", event => {
        event.preventDefault();
        const hit = player.querySelector(".ovg-cpu-hit");
        hit?.click();
    });

    prev.addEventListener("click", event => {
        event.preventDefault();
        player.querySelector(".ovg-cpu-prev")?.click();
    });

    next.addEventListener("click", event => {
        event.preventDefault();
        player.querySelector(".ovg-cpu-next")?.click();
    });

    volume.addEventListener("input", event => {
        event.preventDefault();
        const current = loadVolume();
        const target = clamp(event.target.value, 0, 1, current);
        dispatchVolumeSteps(player, current, target);
        volume.value = String(loadVolume());
    });

    rate.addEventListener("change", event => {
        event.preventDefault();
        const source = player.querySelector(".ovg-cpu-speed-range");
        if (!(source instanceof HTMLInputElement)) return;
        source.value = String(event.target.value);
        source.dispatchEvent(new Event("input", {bubbles:true}));
        source.dispatchEvent(new Event("change", {bubbles:true}));
    });

    fullscreen.addEventListener("click", event => {
        event.preventDefault();
        if (document.fullscreenElement === player) document.exitFullscreen?.();
        else player.requestFullscreen?.().catch?.(() => {});
    });

    player.addEventListener("wheel", () => {
        requestAnimationFrame(() => { if (volume.isConnected) volume.value = String(loadVolume()); });
    });

    const classObserver = new MutationObserver(() => syncPlayButton(player, play));
    classObserver.observe(player, {attributes:true, attributeFilter:["class"]});

    const onFullscreen = () => syncFullscreenButton(player, fullscreen);
    document.addEventListener("fullscreenchange", onFullscreen);

    const cleanup = new MutationObserver(() => {
        if (player.isConnected) return;
        classObserver.disconnect();
        cleanup.disconnect();
        document.removeEventListener("fullscreenchange", onFullscreen);
    });
    cleanup.observe(document.body, {childList:true, subtree:true});
}

function scan(root = document) {
    if (root instanceof HTMLElement && root.classList.contains("ovg-cpu-player")) installPlayer(root);
    root.querySelectorAll?.(".ovg-cpu-player").forEach(installPlayer);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        injectStyles();
        scan();

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof Element) scan(node);
                }
            }
        });
        observer.observe(document.body, {childList:true, subtree:true});
    },
});
