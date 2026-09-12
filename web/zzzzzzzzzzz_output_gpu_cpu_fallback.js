import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
    clamp,
    createOutputVideoPlayer,
    ensureOutputVideoPlayerStyles,
    loadSharedRate,
    loadSharedVolume,
} from "./output_video_player_shared.js";

const EXT_NAME = "Comfy.ImageGallery.DemuxCpuFallback";
const STYLE_ID = "cig-demux-cpu-fallback-style";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const active = new WeakMap();

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en").toLowerCase().startsWith("ru");
const LABELS = RU ? {
    play:"Воспроизвести", pause:"Пауза", prev:"Предыдущее видео", next:"Следующее видео",
    speed:"Скорость воспроизведения", volume:"Громкость", fullscreen:"На весь экран",
    exitFullscreen:"Выйти из полноэкранного режима",
} : {
    play:"Play", pause:"Pause", prev:"Previous video", next:"Next video",
    speed:"Playback speed", volume:"Volume", fullscreen:"Fullscreen",
    exitFullscreen:"Exit fullscreen",
};

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

function videoUrl(path) {
    return `/image-gallery/output/video?path=${encodeURIComponent(path)}`;
}

function thumbUrl(path) {
    return `/image-gallery/output/thumb?path=${encodeURIComponent(path)}`;
}

function ensureStyles() {
    ensureOutputVideoPlayerStyles();
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cig-native-fs-shell[data-cig-native-shell="1"] > .ovg-shared-player.ovg-demux-cpu-fallback {
    position:absolute!important;
    inset:0!important;
    z-index:30!important;
    width:100%!important;
    height:100%!important;
    max-width:none!important;
    max-height:none!important;
}
.cig-native-fs-shell[data-cig-native-shell="1"] > .ovg-demux-cpu-fallback .ovg-shared-fs-controls {
    display:flex!important;
}
.cig-native-fs-shell[data-cig-native-shell="1"] > .ovg-demux-cpu-fallback .ovg-shared-ui-fullscreen {
    display:none!important;
}
`;
    document.head.appendChild(style);
}

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function isDemuxError(video) {
    const message = String(video?.error?.message || "");
    return /demux/i.test(message);
}

function galleryPaths(video) {
    const grid = video?.closest?.(".ovg-card")?.closest?.(".ovg-grid");
    if (!grid) return [];
    return [...grid.querySelectorAll(".ovg-card[data-path]")]
        .map(card => String(card.dataset.path || ""))
        .filter(Boolean);
}

function currentTime(state) {
    const audio = state.audio;
    if (audio && state.audioReady && !audio.error && Number.isFinite(audio.currentTime) && audio.currentTime >= 0) {
        return (state.audioOffset || 0) + audio.currentTime;
    }
    if (!state.paused && state.clockStartedAt) {
        return state.clockBase + ((performance.now() - state.clockStartedAt) / 1000) * state.rate;
    }
    return state.currentTime || 0;
}

function drawFrame(state, bitmap) {
    const canvas = state.canvas;
    const player = state.playerShell?.player;
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
    let requested = false;
    const play = () => {
        if (state.audio !== audio || state.paused || requested) return;
        requested = true;
        try {
            audio.volume = state.volume;
            audio.playbackRate = state.rate;
        } catch (_) {}
        audio.play()?.catch?.(() => { requested = false; });
    };
    audio.addEventListener("playing", () => {
        if (state.audio === audio) {
            state.audioReady = true;
            state.playerShell?.update?.();
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

function openStream(state, start, { previewPause = false } = {}) {
    closeSocket(state);
    stopAudio(state);
    const generation = ++state.streamGeneration;
    const at = Math.max(0, Number(start) || 0);
    state.currentTime = at;
    state.clockBase = at;
    state.clockStartedAt = performance.now();
    state.paused = false;
    state.previewPause = !!previewPause;
    state.playerShell?.update?.();
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
                    state.playerShell?.update?.();
                } else if (data.type === "eof") {
                    if (!state.paused && generation === state.streamGeneration) {
                        setTimeout(() => {
                            if (!state.paused && state.playerShell?.player?.isConnected && generation === state.streamGeneration) openStream(state, 0);
                        }, 40);
                    }
                }
            } catch (_) {}
            return;
        }
        try {
            const bitmap = await createImageBitmap(new Blob([event.data], { type:"image/jpeg" }));
            if (generation === state.streamGeneration && !state.paused && state.playerShell?.player?.isConnected) {
                drawFrame(state, bitmap);
                if (state.previewPause) {
                    state.previewPause = false;
                    state.currentTime = at;
                    state.paused = true;
                    state.clockStartedAt = 0;
                    closeSocket(state);
                    state.playerShell?.update?.();
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
    state.playerShell?.update?.();
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
    state.playerShell?.update?.();
}

function setRate(state, value) {
    const next = clamp(value, .25, 3, 1);
    if (Math.abs(next - state.rate) < .001) return;
    const at = currentTime(state);
    const wasPaused = state.paused;
    state.rate = next;
    state.currentTime = at;
    if (!wasPaused) openStream(state, at);
    state.playerShell?.update?.();
}

function destroy(state, { showVideo = true } = {}) {
    if (!state || state.destroyed) return;
    state.destroyed = true;
    closeSocket(state);
    stopAudio(state);
    document.removeEventListener("fullscreenchange", state.onFullscreenChange, true);
    document.removeEventListener("webkitfullscreenchange", state.onFullscreenChange, true);
    try { state.playerShell?.destroy?.(); } catch (_) {}
    if (showVideo) state.video?.style?.removeProperty?.("display");
    if (active.get(state.video) === state) active.delete(state.video);
}

function tryGpuPath(state, direction) {
    const paths = state.paths;
    if (paths.length < 2) return;
    let index = paths.indexOf(state.path);
    if (index < 0) index = 0;
    index = (index + direction + paths.length) % paths.length;
    const path = paths[index];
    if (!path) return;

    const video = state.video;
    destroy(state, { showVideo:true });
    if (!(video instanceof HTMLVideoElement) || !video.isConnected) return;

    video.dataset.cigCurrentPath = path;
    video.poster = thumbUrl(path);
    video.src = videoUrl(path);
    video.load();
    video.defaultPlaybackRate = loadSharedRate();
    video.playbackRate = loadSharedRate();
    video.volume = loadSharedVolume();
    try { video.play().catch(() => {}); } catch (_) {}
}

function startFallback(video) {
    if (!(video instanceof HTMLVideoElement) || active.has(video)) return false;
    const holder = video.closest(".ovg-thumb");
    if (!(holder instanceof HTMLElement)) return false;
    const path = String(video.dataset.cigCurrentPath || video.closest(".ovg-card")?.dataset?.path || "").trim();
    if (!path) return false;

    const nativeHost = video.closest('.cig-native-fs-shell[data-cig-native-shell="1"]');
    const host = nativeHost instanceof HTMLElement && fullscreenElement() === nativeHost ? nativeHost : holder;
    if (!(host instanceof HTMLElement)) return false;

    try { video.pause(); } catch (_) {}
    video.style.setProperty("display", "none", "important");

    const state = {
        video,
        holder,
        nativeHost: nativeHost instanceof HTMLElement ? nativeHost : null,
        host,
        path,
        paths:galleryPaths(video),
        canvas:document.createElement("canvas"),
        playerShell:null,
        ws:null,
        audio:null,
        audioReady:false,
        audioOffset:0,
        currentTime:0,
        duration:0,
        rate:loadSharedRate(),
        volume:loadSharedVolume(),
        paused:true,
        clockBase:0,
        clockStartedAt:0,
        streamGeneration:0,
        previewPause:false,
        destroyed:false,
        onFullscreenChange:null,
    };

    const adapter = {
        getCurrentTime:() => currentTime(state),
        getDuration:() => state.duration,
        isPaused:() => state.paused,
        getVolume:() => state.volume,
        getRate:() => state.rate,
        play:() => play(state),
        pause:() => pause(state),
        seek:value => seek(state, value),
        setVolume:value => setVolume(state, value),
        setRate:value => setRate(state, value),
        navigate:direction => tryGpuPath(state, direction),
    };

    state.playerShell = createOutputVideoPlayer({
        mode:"CPU",
        surface:state.canvas,
        adapter,
        labels:LABELS,
        host,
    });
    state.playerShell.player.classList.add("ovg-demux-cpu-fallback");

    state.onFullscreenChange = () => {
        if (state.destroyed || !(state.nativeHost instanceof HTMLElement)) return;
        if (fullscreenElement() !== state.nativeHost) destroy(state, { showVideo:true });
    };
    document.addEventListener("fullscreenchange", state.onFullscreenChange, true);
    document.addEventListener("webkitfullscreenchange", state.onFullscreenChange, true);

    active.set(video, state);
    openStream(state, 0);
    return true;
}

function onMediaError(event) {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement) || !video.classList.contains("ovg-inline-video")) return;
    if (!isDemuxError(video)) return;
    if (!startFallback(video)) return;

    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();
}

app.registerExtension({
    name:EXT_NAME,
    setup() {
        ensureStyles();
        document.addEventListener("error", onMediaError, true);
    },
});
