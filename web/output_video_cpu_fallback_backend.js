import { api } from "/scripts/api.js";
import {
    clamp,
    loadSharedRate,
    loadSharedVolume,
} from "./output_video_player_shared.js";

function apiUrl(route) {
    try { if (typeof api.apiURL === "function") return api.apiURL(route); }
    catch (_) {}
    return route;
}

function wsUrl(path, start, rate) {
    const url = new URL(apiUrl(`/image-gallery/output/cpu-stream?path=${encodeURIComponent(path)}&start=${encodeURIComponent(start)}&rate=${encodeURIComponent(rate)}`), window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
}

function audioUrl(path, start) {
    return apiUrl(`/image-gallery/output/cpu-audio?path=${encodeURIComponent(path)}&start=${encodeURIComponent(start)}&v=${Date.now()}`);
}

function drawFrame(state, bitmap) {
    const canvas = state.canvas;
    const player = state.shell?.player;
    if (!(canvas instanceof HTMLCanvasElement) || !(player instanceof HTMLElement)) return;
    const rect = player.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(2, Math.round(rect.width * dpr));
    const height = Math.max(2, Math.round(rect.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha:false, desynchronized:true });
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    const iw = bitmap.width || 1;
    const ih = bitmap.height || 1;
    const scale = Math.min(width / iw, height / ih);
    const dw = Math.max(1, Math.round(iw * scale));
    const dh = Math.max(1, Math.round(ih * scale));
    ctx.drawImage(bitmap, Math.round((width - dw) / 2), Math.round((height - dh) / 2), dw, dh);
}

function currentTime(state) {
    const audio = state.audio;
    if (audio && state.audioReady && !audio.error && Number.isFinite(audio.currentTime) && audio.currentTime >= 0) return (state.audioOffset || 0) + audio.currentTime;
    if (!state.paused && state.clockStartedAt) return state.clockBase + ((performance.now() - state.clockStartedAt) / 1000) * state.rate;
    return state.currentTime || 0;
}

function closeSocket(state) {
    state.streamGeneration += 1;
    const ws = state.ws;
    state.ws = null;
    if (!ws) return;
    try { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null; } catch (_) {}
    try { ws.close(1000, "switch"); } catch (_) {}
}

function stopAudio(state) {
    const audio = state.audio;
    state.audio = null;
    state.audioReady = false;
    state.audioOffset = 0;
    if (!audio) return;
    try { audio.pause(); } catch (_) {}
    try { audio.removeAttribute("src"); audio.load(); } catch (_) {}
}

function makeAudio(state, start) {
    stopAudio(state);
    const audio = new Audio();
    state.audio = audio;
    state.audioReady = false;
    state.audioOffset = Math.max(0, Number(start) || 0);
    audio.preload = "auto";
    audio.volume = state.volume;
    audio.playbackRate = state.rate;
    audio.src = audioUrl(state.path, state.audioOffset);
    let playRequested = false;
    const play = () => {
        if (state.audio !== audio || state.paused || playRequested) return;
        playRequested = true;
        try {
            audio.playbackRate = state.rate;
            audio.volume = state.volume;
        } catch (_) {}
        const result = audio.play();
        result?.catch?.(() => { playRequested = false; });
    };
    audio.addEventListener("playing", () => {
        if (state.audio === audio) {
            state.audioReady = true;
            state.shell?.update();
        }
    });
    audio.addEventListener("canplay", play, { once:true });
    audio.addEventListener("loadeddata", play, { once:true });
    audio.addEventListener("error", () => {
        if (state.audio === audio) {
            state.audio = null;
            state.audioReady = false;
        }
    }, { once:true });
    if (audio.readyState >= 2) play();
}

function openStream(state, start, { previewPause=false } = {}) {
    closeSocket(state);
    stopAudio(state);
    const generation = ++state.streamGeneration;
    const at = Math.max(0, Number(start) || 0);
    state.currentTime = at;
    state.clockBase = at;
    state.clockStartedAt = performance.now();
    state.paused = false;
    state.previewPause = !!previewPause;
    state.shell?.update();
    if (!previewPause) makeAudio(state, at);

    const ws = new WebSocket(wsUrl(state.path, at, state.rate));
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
                    state.shell?.update();
                } else if (data.type === "eof") {
                    if (!state.paused && generation === state.streamGeneration) {
                        setTimeout(() => {
                            if (!state.paused && state.shell?.player?.isConnected && generation === state.streamGeneration) openStream(state, 0);
                        }, 40);
                    }
                }
            } catch (_) {}
            return;
        }
        try {
            const bitmap = await createImageBitmap(new Blob([event.data], { type:"image/jpeg" }));
            if (generation === state.streamGeneration && !state.paused && state.shell?.player?.isConnected) {
                drawFrame(state, bitmap);
                if (state.previewPause) {
                    state.previewPause = false;
                    state.currentTime = at;
                    state.paused = true;
                    state.clockStartedAt = 0;
                    closeSocket(state);
                    state.shell?.update();
                }
            }
            bitmap.close?.();
        } catch (_) {}
    };
}

function pause(state) {
    if (state.paused) return;
    state.currentTime = currentTime(state);
    state.paused = true;
    state.clockStartedAt = 0;
    closeSocket(state);
    try { state.audio?.pause(); } catch (_) {}
    state.shell?.update();
}

function play(state) {
    if (!state.paused) return;
    openStream(state, state.currentTime || 0);
}

function seek(state, value) {
    const at = clamp(value, 0, Math.max(0, state.duration || value), 0);
    const wasPaused = state.paused;
    state.currentTime = at;
    openStream(state, at, { previewPause:wasPaused });
}

function setVolume(state, value) {
    state.volume = clamp(value, 0, 1, 1);
    if (state.audio) state.audio.volume = state.volume;
    state.shell?.update();
}

function setRate(state, value) {
    const next = clamp(value, .25, 3, 1);
    if (Math.abs(next - state.rate) < .001) return;
    const at = currentTime(state);
    const wasPaused = state.paused;
    state.rate = next;
    state.currentTime = at;
    if (!wasPaused) openStream(state, at);
    state.shell?.update();
}

function navigate(state, direction) {
    const paths = state.paths?.() || [];
    if (paths.length < 2) return;
    let index = paths.indexOf(state.path);
    if (index < 0) index = 0;
    index = (index + direction + paths.length) % paths.length;
    const next = paths[index];
    if (!next) return;
    state.path = next;
    if (state.video instanceof HTMLVideoElement) state.video.dataset.cigCurrentPath = next;
    state.currentTime = 0;
    state.duration = 0;
    openStream(state, 0);
}

function cpuAdapter(state) {
    return {
        getCurrentTime:()=>currentTime(state),
        getDuration:()=>state.duration,
        isPaused:()=>state.paused,
        getVolume:()=>state.volume,
        getRate:()=>state.rate,
        play:()=>play(state),
        pause:()=>pause(state),
        seek:value=>seek(state,value),
        setVolume:value=>setVolume(state,value),
        setRate:value=>setRate(state,value),
        navigate:direction=>navigate(state,direction),
    };
}

function switchShellToCpu(state) {
    const { shell, video, canvas } = state;
    if (!shell?.player || !(video instanceof HTMLVideoElement) || !(canvas instanceof HTMLCanvasElement)) return false;
    if (typeof video.__cigSetPlayerBackend !== "function") return false;

    try { video.pause(); } catch (_) {}
    video.classList.remove("ovg-shared-surface");
    video.style.setProperty("display", "none", "important");

    canvas.classList.add("ovg-shared-surface", "ovg-cpu-canvas");
    shell.player.insertBefore(canvas, shell.player.firstChild);
    shell.player.dataset.ovgDecoder = "CPU";
    shell.player.classList.add("ovg-cpu-player", "ovg-auto-cpu-fallback");
    shell.ui?.hit?.classList.add("ovg-cpu-hit");
    shell.ui?.seek?.classList.add("ovg-cpu-seek");
    const badge = shell.player.querySelector(".ovg-shared-badge");
    if (badge) badge.textContent = "CPU";

    video.__cigSetPlayerBackend(cpuAdapter(state));
    shell.update?.();
    return true;
}

export function startCpuFallback({ holder, path, paths, labels, gpuShell = null, video = null }) {
    if (!(holder instanceof HTMLElement) || !path || !(video instanceof HTMLVideoElement)) return null;
    if (!gpuShell?.player?.isConnected) return null;

    const previous = holder.__cigAutoCpuFallback;
    if (previous?.shell?.player?.isConnected) return previous;

    const state = {
        holder,
        path,
        paths,
        labels,
        video,
        shell:gpuShell,
        canvas:document.createElement("canvas"),
        ws:null,
        audio:null,
        audioReady:false,
        audioOffset:0,
        currentTime:0,
        duration:0,
        fps:30,
        rate:loadSharedRate(),
        volume:loadSharedVolume(),
        paused:true,
        clockBase:0,
        clockStartedAt:0,
        streamGeneration:0,
        previewPause:false,
        observer:null,
    };

    if (!switchShellToCpu(state)) return null;
    holder.__cigAutoCpuFallback = state;

    const grid = holder.closest(".ovg-grid");
    if (grid instanceof HTMLElement) {
        state.observer = new MutationObserver(() => {
            if (!holder.isConnected) state.destroy();
        });
        state.observer.observe(grid, { childList:true, subtree:false });
    }

    state.destroy = () => {
        closeSocket(state);
        stopAudio(state);
        state.observer?.disconnect?.();
        state.observer = null;
        if (holder.__cigAutoCpuFallback === state) delete holder.__cigAutoCpuFallback;
    };

    openStream(state, 0);
    return state;
}
