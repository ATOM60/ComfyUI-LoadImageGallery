import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoCpuPlayback";
const STYLE_ID = "cig-output-video-cpu-playback-style";
const MODE_KEY = "ComfyUI-LoadImageGallery.outputVideoCpuPlayback";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const VOLUME_KEY = "ComfyUI-LoadImageGallery.outputVideoVolume";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const CLICK_DELAY = 280;

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en")
    .toLowerCase().startsWith("ru");

const TEXT = RU ? {
    cpu: "CPU",
    enable: "CPU-проигрывание: декодировать видео процессором",
    disable: "Обычное проигрывание видео",
    pause: "Пауза",
    play: "Продолжить",
    prev: "Предыдущее видео",
    next: "Следующее видео",
    speed: "Скорость воспроизведения",
    error: "Ошибка CPU-проигрывания",
    help: "Переключатель CPU в верхней строке переносит декодирование видео на процессор. Это может сделать просмотр плавнее, когда видеокарта занята ComfyUI.",
} : {
    cpu: "CPU",
    enable: "CPU playback: decode video on the processor",
    disable: "Normal video playback",
    pause: "Pause",
    play: "Resume",
    prev: "Previous video",
    next: "Next video",
    speed: "Playback speed",
    error: "CPU playback error",
    help: "The CPU switch in the top row moves video decoding to the processor. This can make playback smoother while ComfyUI is heavily using the GPU.",
};

const states = new Set();

function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function loadRate() {
    try { return clamp(localStorage.getItem(RATE_KEY) || 1, 0.25, 3, 1); }
    catch (_) { return 1; }
}

function saveRate(value) {
    try { localStorage.setItem(RATE_KEY, String(clamp(value, 0.25, 3, 1))); }
    catch (_) {}
}

function loadVolume() {
    try {
        const raw = localStorage.getItem(VOLUME_KEY);
        return raw == null ? 1 : clamp(raw, 0, 1, 1);
    } catch (_) {
        return 1;
    }
}

function saveVolume(value) {
    try { localStorage.setItem(VOLUME_KEY, String(clamp(value, 0, 1, 1))); }
    catch (_) {}
}

function loadMode() {
    try { return localStorage.getItem(MODE_KEY) === "1"; }
    catch (_) { return false; }
}

function saveMode(on) {
    try { localStorage.setItem(MODE_KEY, on ? "1" : "0"); }
    catch (_) {}
}

function apiUrl(route) {
    try { if (typeof api.apiURL === "function") return api.apiURL(route); }
    catch (_) {}
    return route;
}

function wsUrl(path, start, rate) {
    const route = `/image-gallery/output/cpu-stream?path=${encodeURIComponent(path)}&start=${encodeURIComponent(start)}&rate=${encodeURIComponent(rate)}`;
    const url = new URL(apiUrl(route), window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
}

function videoUrl(path) {
    return apiUrl(`/image-gallery/output/video?path=${encodeURIComponent(path)}&v=${Date.now()}`);
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.ovg-cpu-toggle{height:30px!important;min-width:48px!important;padding:0 10px!important;font-size:12px!important;font-weight:700!important;letter-spacing:.3px}
.ovg-cpu-toggle.active{background:#26364b!important;border-color:#6ba7ff!important;color:#b9d6ff!important;box-shadow:inset 0 0 0 1px rgba(107,167,255,.2)}
.ovg-cpu-player{position:absolute;inset:0;z-index:9;background:#000;overflow:hidden}
.ovg-cpu-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;background:#000}
.ovg-cpu-hit{position:absolute;inset:0;z-index:2;width:100%;height:100%;padding:0;margin:0;border:0;background:transparent;cursor:pointer}
.ovg-cpu-badge{position:absolute;left:8px;top:7px;z-index:4;padding:3px 6px;border-radius:5px;background:rgba(0,0,0,.62);color:#d6e8ff;font:700 10px/1.2 Arial,sans-serif;pointer-events:none;letter-spacing:.3px}
.ovg-cpu-paused{position:absolute;left:50%;top:50%;z-index:4;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.58);color:#fff;font-size:23px;pointer-events:none}
.ovg-cpu-player.paused .ovg-cpu-paused{display:flex}
.ovg-cpu-fs-controls{display:none;position:absolute;right:28px;top:50%;z-index:6;transform:translateY(-50%);flex-direction:column;gap:8px;align-items:center}
.ovg-cpu-fs-controls button{width:44px;height:44px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(20,20,20,.72);color:#fff;font:18px/42px Arial,sans-serif;padding:0;cursor:pointer;backdrop-filter:blur(5px)}
.ovg-cpu-fs-controls button:hover{background:rgba(45,45,45,.86)}
.ovg-cpu-speed-panel{display:none;position:absolute;right:54px;top:50%;transform:translateY(-50%);padding:10px 12px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(20,20,20,.86);white-space:nowrap;color:#fff;font:12px Arial,sans-serif}
.ovg-cpu-speed-panel.open{display:flex;align-items:center;gap:8px}
.ovg-cpu-speed-panel input{width:150px}
.ovg-cpu-player:fullscreen{width:100vw!important;height:100vh!important;background:#000!important}
.ovg-cpu-player:fullscreen .ovg-cpu-fs-controls{display:flex}
.ovg-cpu-player:fullscreen .ovg-cpu-canvas{width:100vw!important;height:100vh!important}
`;
    document.head.appendChild(style);
}

function showError(message) {
    try {
        app.extensionManager?.toast?.add({severity:"error", summary:TEXT.error, detail:message, life:4200});
    } catch (_) {
        console.error("[Output CPU Playback]", message);
    }
}

function cardPath(card) {
    return String(card?.dataset?.path || "").trim();
}

function visibleCards(state) {
    return [...state.modal.querySelectorAll(".ovg-grid > .ovg-card")];
}

function drawFrame(state, bitmap) {
    const canvas = state.canvas;
    const player = state.player;
    if (!(canvas instanceof HTMLCanvasElement) || !(player instanceof HTMLElement)) return;
    const rect = player.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(2, Math.round(rect.width * dpr));
    const height = Math.max(2, Math.round(rect.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext("2d", {alpha:false, desynchronized:true});
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    const iw = bitmap.width || 1, ih = bitmap.height || 1;
    const scale = Math.min(width / iw, height / ih);
    const dw = Math.max(1, Math.round(iw * scale));
    const dh = Math.max(1, Math.round(ih * scale));
    const dx = Math.round((width - dw) / 2);
    const dy = Math.round((height - dh) / 2);
    ctx.drawImage(bitmap, dx, dy, dw, dh);
}

function currentTime(state) {
    const audio = state.audio;
    if (audio && !audio.error && Number.isFinite(audio.currentTime) && audio.currentTime > 0) {
        return audio.currentTime;
    }
    if (!state.paused && state.clockStartedAt) {
        return state.clockBase + ((performance.now() - state.clockStartedAt) / 1000) * state.rate;
    }
    return state.currentTime || 0;
}

function closeSocket(state) {
    state.streamGeneration += 1;
    const ws = state.ws;
    state.ws = null;
    if (ws) {
        try { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null; }
        catch (_) {}
        try { ws.close(); }
        catch (_) {}
    }
}

function stopAudio(state) {
    const audio = state.audio;
    state.audio = null;
    if (!audio) return;
    try { audio.pause(); }
    catch (_) {}
    try { audio.removeAttribute("src"); audio.load(); }
    catch (_) {}
}

function restoreMountedCard(state) {
    const card = state.mountCard;
    if (!(card instanceof HTMLElement)) return;
    const holder = card.querySelector(".ovg-thumb");
    holder?.querySelector("img")?.style.removeProperty("display");
    const fallback = holder?.querySelector(".ovg-thumb-fallback");
    if (fallback && !holder?.querySelector("img")?.getAttribute("src")) fallback.style.removeProperty("display");
    holder?.querySelector(".ovg-play")?.style.removeProperty("display");
}

function mountPlayer(state, card) {
    if (!(state.player instanceof HTMLElement) || !(card instanceof HTMLElement)) return false;
    const holder = card.querySelector(".ovg-thumb");
    if (!(holder instanceof HTMLElement)) return false;

    if (state.mountCard && state.mountCard !== card) restoreMountedCard(state);
    holder.querySelector("img")?.style.setProperty("display", "none");
    holder.querySelector(".ovg-thumb-fallback")?.style.setProperty("display", "none");
    holder.querySelector(".ovg-play")?.style.setProperty("display", "none");
    holder.appendChild(state.player);
    state.mountCard = card;
    return true;
}

function updatePauseUi(state) {
    state.player?.classList.toggle("paused", !!state.paused);
    if (state.hit) state.hit.title = state.paused ? TEXT.play : TEXT.pause;
}

function pauseCpu(state) {
    if (!state.player || state.paused) return;
    state.currentTime = currentTime(state);
    state.paused = true;
    state.clockStartedAt = 0;
    closeSocket(state);
    try { state.audio?.pause(); }
    catch (_) {}
    updatePauseUi(state);
}

function makeAudio(state, start) {
    stopAudio(state);
    const audio = new Audio();
    state.audio = audio;
    audio.preload = "metadata";
    audio.volume = state.volume;
    audio.playbackRate = state.rate;
    audio.src = videoUrl(state.currentPath);

    const startAudio = () => {
        if (state.audio !== audio || state.paused) return;
        try { audio.currentTime = Math.max(0, start); }
        catch (_) {}
        try { audio.playbackRate = state.rate; audio.volume = state.volume; }
        catch (_) {}
        const p = audio.play();
        p?.catch?.(() => {});
    };
    audio.addEventListener("loadedmetadata", startAudio, {once:true});
    audio.addEventListener("canplay", startAudio, {once:true});
    audio.addEventListener("error", () => {
        if (state.audio === audio) state.audio = null;
    }, {once:true});
    if (audio.readyState >= 1) startAudio();
}

function openStream(state, start) {
    closeSocket(state);
    const generation = ++state.streamGeneration;
    state.currentTime = Math.max(0, start || 0);
    state.clockBase = state.currentTime;
    state.clockStartedAt = performance.now();
    state.paused = false;
    updatePauseUi(state);
    makeAudio(state, state.currentTime);

    const ws = new WebSocket(wsUrl(state.currentPath, state.currentTime, state.rate));
    ws.binaryType = "arraybuffer";
    state.ws = ws;

    ws.onmessage = async event => {
        if (generation !== state.streamGeneration || state.ws !== ws || state.paused) return;
        if (typeof event.data === "string") {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "meta") {
                    state.duration = Number(data.duration || 0);
                    state.fps = Number(data.fps || 30);
                } else if (data.type === "eof") {
                    if (!state.paused && generation === state.streamGeneration) {
                        state.currentTime = 0;
                        setTimeout(() => {
                            if (!state.paused && state.player?.isConnected && generation === state.streamGeneration) openStream(state, 0);
                        }, 40);
                    }
                } else if (data.type === "error") {
                    showError(data.error || TEXT.error);
                }
            } catch (_) {}
            return;
        }

        try {
            const bitmap = await createImageBitmap(new Blob([event.data], {type:"image/jpeg"}));
            if (generation === state.streamGeneration && !state.paused && state.player?.isConnected) drawFrame(state, bitmap);
            bitmap.close?.();
        } catch (_) {}
    };

    ws.onerror = () => {
        if (generation === state.streamGeneration && !state.paused) showError(TEXT.error);
    };
}

function resumeCpu(state) {
    if (!state.player || !state.currentPath || !state.paused) return;
    openStream(state, state.currentTime || 0);
}

function toggleCpuPlayback(state) {
    state.paused ? resumeCpu(state) : pauseCpu(state);
}

function remountAfterFullscreen(state) {
    if (!state.player || document.fullscreenElement === state.player) return;
    if (state.currentCard && state.currentCard !== state.mountCard) mountPlayer(state, state.currentCard);
}

function setRate(state, value) {
    const next = clamp(value, 0.25, 3, 1);
    if (Math.abs(next - state.rate) < 0.001) return;
    const wasPaused = state.paused;
    const at = currentTime(state);
    state.rate = next;
    saveRate(next);
    if (state.speedValue) state.speedValue.textContent = `${next.toFixed(next % 1 ? 2 : 0)}×`;
    if (state.speedRange) state.speedRange.value = String(next);
    if (state.audio) {
        try { state.audio.playbackRate = next; }
        catch (_) {}
    }
    state.currentTime = at;
    if (!wasPaused) openStream(state, at);
}

function switchCpuPath(state, card) {
    const path = cardPath(card);
    if (!path) return;
    const fullscreen = document.fullscreenElement === state.player;
    state.currentCard = card;
    state.currentPath = path;
    state.currentTime = 0;
    if (!fullscreen) mountPlayer(state, card);
    openStream(state, 0);
}

function navigateCpu(state, direction) {
    const cards = visibleCards(state);
    if (!cards.length) return;
    let index = cards.findIndex(card => cardPath(card) === state.currentPath);
    if (index < 0) index = 0;
    index = (index + direction + cards.length) % cards.length;
    switchCpuPath(state, cards[index]);
}

function buildPlayer(state) {
    const player = document.createElement("div");
    player.className = "ovg-cpu-player";
    player.innerHTML = `
        <canvas class="ovg-cpu-canvas"></canvas>
        <button class="ovg-cpu-hit" type="button" aria-label="${TEXT.pause}"></button>
        <div class="ovg-cpu-badge">CPU</div>
        <div class="ovg-cpu-paused">▶</div>
        <div class="ovg-cpu-fs-controls">
            <button class="ovg-cpu-prev" type="button" title="${TEXT.prev}">⏮</button>
            <div style="position:relative">
                <button class="ovg-cpu-speed" type="button" title="${TEXT.speed}">⏱</button>
                <div class="ovg-cpu-speed-panel"><input class="ovg-cpu-speed-range" type="range" min="0.25" max="3" step="0.05"><span class="ovg-cpu-speed-value"></span></div>
            </div>
            <button class="ovg-cpu-next" type="button" title="${TEXT.next}">⏭</button>
        </div>`;

    state.player = player;
    state.canvas = player.querySelector(".ovg-cpu-canvas");
    state.hit = player.querySelector(".ovg-cpu-hit");
    state.speedRange = player.querySelector(".ovg-cpu-speed-range");
    state.speedValue = player.querySelector(".ovg-cpu-speed-value");
    state.speedRange.value = String(state.rate);
    state.speedValue.textContent = `${state.rate.toFixed(state.rate % 1 ? 2 : 0)}×`;

    let clickTimer = 0;
    state.hit.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.detail >= 2) {
            if (clickTimer) clearTimeout(clickTimer);
            clickTimer = 0;
            if (document.fullscreenElement === player) {
                pauseCpu(state);
                document.exitFullscreen?.();
            } else {
                player.requestFullscreen?.().catch?.(() => {});
            }
            return;
        }
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
            clickTimer = 0;
            toggleCpuPlayback(state);
        }, CLICK_DELAY);
    });
    state.hit.addEventListener("dblclick", event => {
        event.preventDefault();
        event.stopPropagation();
    });

    player.addEventListener("wheel", event => {
        event.preventDefault();
        const step = event.deltaY < 0 ? 0.05 : -0.05;
        state.volume = clamp(state.volume + step, 0, 1, 1);
        saveVolume(state.volume);
        if (state.audio) state.audio.volume = state.volume;
    }, {passive:false});

    player.querySelector(".ovg-cpu-prev").addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation(); navigateCpu(state, -1);
    });
    player.querySelector(".ovg-cpu-next").addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation(); navigateCpu(state, 1);
    });

    const speedButton = player.querySelector(".ovg-cpu-speed");
    const speedPanel = player.querySelector(".ovg-cpu-speed-panel");
    speedButton.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation(); speedPanel.classList.toggle("open");
    });
    state.speedRange.addEventListener("input", event => {
        state.speedValue.textContent = `${Number(event.target.value).toFixed(2)}×`;
    });
    state.speedRange.addEventListener("change", event => {
        setRate(state, event.target.value);
    });

    return player;
}

function stopCpu(state, {restore=true} = {}) {
    if (!state) return;
    state.currentTime = currentTime(state);
    state.paused = true;
    closeSocket(state);
    stopAudio(state);
    if (restore) restoreMountedCard(state);
    try { state.player?.remove(); }
    catch (_) {}
    state.player = state.canvas = state.hit = null;
    state.mountCard = state.currentCard = null;
    state.currentPath = "";
    state.clockStartedAt = 0;
}

function startCpu(state, card, {fullscreen=false, toggleSame=false} = {}) {
    const path = cardPath(card);
    if (!path) return;

    if (state.player && state.currentPath === path) {
        if (fullscreen) {
            state.player.requestFullscreen?.().catch?.(() => {});
        } else if (toggleSame) {
            toggleCpuPlayback(state);
        }
        return;
    }

    stopCpu(state);
    state.rate = loadRate();
    state.volume = loadVolume();
    state.currentCard = card;
    state.currentPath = path;
    state.currentTime = 0;
    buildPlayer(state);
    if (!mountPlayer(state, card)) {
        stopCpu(state);
        return;
    }
    openStream(state, 0);
    if (fullscreen) state.player.requestFullscreen?.().catch?.(() => {});
}

function forceGalleryRerender(modal) {
    const sort = modal.querySelector(".ovg-sort");
    if (sort instanceof HTMLSelectElement) sort.dispatchEvent(new Event("change", {bubbles:true}));
}

function setMode(state, on) {
    state.cpuOn = !!on;
    state.modal.dataset.ovgCpuMode = state.cpuOn ? "1" : "0";
    saveMode(state.cpuOn);
    state.toggle?.classList.toggle("active", state.cpuOn);
    if (state.toggle) state.toggle.title = state.cpuOn ? TEXT.disable : TEXT.enable;
    stopCpu(state);
    forceGalleryRerender(state.modal);
}

function installModal(modal) {
    if (!(modal instanceof HTMLElement) || modal.dataset.ovgCpuPlaybackInstalled === "1") return;
    const titlebar = modal.querySelector(".ovg-titlebar");
    const close = modal.querySelector(".ovg-close");
    const grid = modal.querySelector(".ovg-grid");
    if (!(titlebar instanceof HTMLElement) || !(close instanceof HTMLElement) || !(grid instanceof HTMLElement)) return;

    modal.dataset.ovgCpuPlaybackInstalled = "1";
    const state = {
        modal,
        grid,
        toggle:null,
        cpuOn:loadMode(),
        player:null,
        canvas:null,
        hit:null,
        ws:null,
        audio:null,
        currentCard:null,
        mountCard:null,
        currentPath:"",
        currentTime:0,
        duration:0,
        fps:30,
        rate:loadRate(),
        volume:loadVolume(),
        paused:true,
        clockBase:0,
        clockStartedAt:0,
        streamGeneration:0,
        speedRange:null,
        speedValue:null,
        lastContextPath:"",
        thumbClickTimer:0,
        observer:null,
    };
    states.add(state);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ovg-btn ovg-cpu-toggle";
    toggle.textContent = TEXT.cpu;
    toggle.setAttribute("aria-label", TEXT.enable);
    close.insertAdjacentElement("beforebegin", toggle);
    state.toggle = toggle;
    toggle.classList.toggle("active", state.cpuOn);
    toggle.title = state.cpuOn ? TEXT.disable : TEXT.enable;
    toggle.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        setMode(state, !state.cpuOn);
    });

    modal.addEventListener("contextmenu", event => {
        const card = event.target.closest?.(".ovg-card");
        if (card) state.lastContextPath = cardPath(card);
    }, true);

    modal.addEventListener("click", event => {
        if (!state.cpuOn) return;
        const play = event.target.closest?.(".ovg-play");
        if (play) {
            const card = play.closest(".ovg-card");
            if (!card) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            startCpu(state, card, {toggleSame:true});
            return;
        }

        const thumb = event.target.closest?.(".ovg-thumb");
        if (!thumb || event.target.closest?.("button,video,.ovg-cpu-player")) return;
        const card = thumb.closest(".ovg-card");
        if (!card) return;
        event.preventDefault();
        event.stopImmediatePropagation();

        if (event.detail >= 2) {
            if (state.thumbClickTimer) clearTimeout(state.thumbClickTimer);
            state.thumbClickTimer = 0;
            startCpu(state, card, {fullscreen:true});
            return;
        }
        if (state.thumbClickTimer) clearTimeout(state.thumbClickTimer);
        state.thumbClickTimer = setTimeout(() => {
            state.thumbClickTimer = 0;
            if (state.cpuOn && card.isConnected) startCpu(state, card, {toggleSame:true});
        }, CLICK_DELAY);
    }, true);

    modal.addEventListener("dblclick", event => {
        if (!state.cpuOn) return;
        const thumb = event.target.closest?.(".ovg-thumb");
        if (!thumb || event.target.closest?.("button,video,.ovg-cpu-player")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);

    state.observer = new MutationObserver(() => {
        if (state.player && !state.player.isConnected && document.fullscreenElement !== state.player) stopCpu(state, {restore:false});
    });
    state.observer.observe(grid, {childList:true});

    const onFullscreen = () => remountAfterFullscreen(state);
    document.addEventListener("fullscreenchange", onFullscreen);
    state.fullscreenHandler = onFullscreen;
}

function uninstallState(state) {
    if (!state) return;
    stopCpu(state, {restore:false});
    state.observer?.disconnect();
    if (state.thumbClickTimer) clearTimeout(state.thumbClickTimer);
    if (state.fullscreenHandler) document.removeEventListener("fullscreenchange", state.fullscreenHandler);
    states.delete(state);
}

function scan(root = document) {
    if (root instanceof HTMLElement && root.classList.contains("ovg-modal")) installModal(root);
    root.querySelectorAll?.(".ovg-modal").forEach(installModal);
}

function updateHelp(root) {
    const overlay = root instanceof HTMLElement && root.classList.contains("ovg-help-overlay")
        ? root
        : root.querySelector?.(".ovg-help-overlay");
    if (!(overlay instanceof HTMLElement) || overlay.dataset.ovgCpuHelp === "1") return;
    const lists = overlay.querySelectorAll(".ovg-help-body ul");
    const list = lists.length ? lists[lists.length - 1] : null;
    if (!(list instanceof HTMLElement)) return;
    overlay.dataset.ovgCpuHelp = "1";
    const item = document.createElement("li");
    item.textContent = TEXT.help;
    list.appendChild(item);
}

function activeCpuState() {
    for (const state of states) {
        if (state.cpuOn && state.modal?.isConnected) return state;
    }
    return null;
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        injectStyles();
        scan();
        updateHelp(document);

        document.addEventListener("click", event => {
            const button = event.target.closest?.(".ovg-menu button[data-action='open']");
            if (!button) return;
            const state = activeCpuState();
            if (!state?.lastContextPath) return;
            const card = visibleCards(state).find(c => cardPath(c) === state.lastContextPath);
            if (!card) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            button.closest(".ovg-menu")?.remove();
            startCpu(state, card, {toggleSame:true});
        }, true);

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    scan(node);
                    updateHelp(node);
                }
                for (const node of record.removedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.classList.contains("ovg-modal")) {
                        for (const state of [...states]) if (state.modal === node) uninstallState(state);
                    }
                }
            }
        });
        observer.observe(document.body, {childList:true, subtree:false});
    },
});
