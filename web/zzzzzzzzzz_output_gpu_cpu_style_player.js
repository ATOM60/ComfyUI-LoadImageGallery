import { app } from "/scripts/app.js";
import {
    PLAYER_CLICK_DELAY,
    PLAYER_DOUBLE_CLICK_WINDOW_MS,
    clamp,
    createOutputVideoPlayer,
    ensureOutputVideoPlayerStyles,
    loadSharedRate,
    loadSharedVolume,
} from "./output_video_player_shared.js";

const EXT_NAME = "Comfy.ImageGallery.OutputGpuCpuStylePlayer";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const GPU_IDLE_RELEASE_MS = 2500;

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en").toLowerCase().startsWith("ru");
const TEXT = RU ? {
    play:"Воспроизвести", pause:"Пауза", prev:"Предыдущее видео", next:"Следующее видео",
    speed:"Скорость воспроизведения", volume:"Громкость", fullscreen:"На весь экран",
    exitFullscreen:"Выйти из полноэкранного режима",
} : {
    play:"Play", pause:"Pause", prev:"Previous video", next:"Next video",
    speed:"Playback speed", volume:"Volume", fullscreen:"Fullscreen",
    exitFullscreen:"Exit fullscreen",
};

const attached = new Set();
const modalObservers = new WeakMap();
const previewTaps = new WeakMap();

function currentPath(video) {
    return String(video?.dataset?.cigCurrentPath || video?.closest?.(".ovg-card")?.dataset?.path || "");
}
function videoEndpoint(path) { return `/image-gallery/output/video?path=${encodeURIComponent(path)}`; }
function thumbEndpoint(path) { return `/image-gallery/output/thumb?path=${encodeURIComponent(path)}`; }
function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }

function galleryPaths(video) {
    const grid=video.closest?.(".ovg-card")?.closest?.(".ovg-grid");
    if(!grid)return[];
    return [...grid.querySelectorAll(".ovg-card[data-path]")]
        .map(el=>String(el.dataset.path||""))
        .filter(Boolean);
}

function gpuBackendActive(video) {
    if (!(video instanceof HTMLVideoElement) || !video.__cigGpuBackend) return false;
    try {
        return typeof video.__cigGetPlayerBackend !== "function" || video.__cigGetPlayerBackend() === video.__cigGpuBackend;
    } catch (_) {
        return true;
    }
}

function clearGpuIdleRelease(video) {
    const timer = video?.__cigGpuIdleReleaseTimer;
    if (timer) clearTimeout(timer);
    if (video) delete video.__cigGpuIdleReleaseTimer;
}

function savedGpuState(video) {
    return video?.__cigGpuResumeState || null;
}

function suspendGpuVideo(video,{force=false}={}) {
    if (!(video instanceof HTMLVideoElement) || !attached.has(video) || !gpuBackendActive(video)) return false;
    if (video.dataset.cigGpuSuspended === "1") return true;
    const shell = video.__cigGpuShell?.player;
    if (!force && shell && fullscreenElement() === shell) return false;

    clearGpuIdleRelease(video);
    const src = String(video.currentSrc || video.getAttribute("src") || video.src || "").trim();
    if (!src) return false;

    const state = {
        src,
        time:Number.isFinite(Number(video.currentTime)) ? Math.max(0,Number(video.currentTime)) : 0,
        duration:Number.isFinite(Number(video.duration)) ? Math.max(0,Number(video.duration)) : 0,
        rate:clamp(video.playbackRate,.25,3,loadSharedRate()),
        volume:clamp(video.volume,0,1,loadSharedVolume()),
        muted:!!video.muted,
    };
    video.__cigGpuResumeState = state;
    video.dataset.cigGpuSuspended = "1";

    try { video.__cigNativePause?.(); } catch (_) { try { video.pause(); } catch (_) {} }
    try {
        video.removeAttribute("src");
        video.load();
    } catch (_) {}
    video.__cigGpuShell?.update?.();
    return true;
}

function waitForMetadata(video) {
    if (video.readyState >= 1) return Promise.resolve();
    return new Promise((resolve,reject) => {
        let done = false;
        const finish = error => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            video.removeEventListener("loadedmetadata", onLoaded);
            video.removeEventListener("error", onError);
            error ? reject(error) : resolve();
        };
        const onLoaded = () => finish();
        const onError = () => finish(new Error("GPU video reload failed"));
        const timer = setTimeout(() => finish(), 4000);
        video.addEventListener("loadedmetadata", onLoaded, { once:true });
        video.addEventListener("error", onError, { once:true });
    });
}

async function resumeGpuVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    clearGpuIdleRelease(video);
    const nativePlay = video.__cigNativePlay || HTMLMediaElement.prototype.play.bind(video);
    if (video.dataset.cigGpuSuspended !== "1") return nativePlay();
    if (video.__cigGpuResumePromise) return video.__cigGpuResumePromise;

    const state = savedGpuState(video);
    if (!state?.src) {
        delete video.dataset.cigGpuSuspended;
        delete video.__cigGpuResumeState;
        return nativePlay();
    }

    const promise = (async() => {
        delete video.dataset.cigGpuSuspended;
        try {
            video.src = state.src;
            video.defaultPlaybackRate = state.rate;
            video.playbackRate = state.rate;
            video.volume = state.volume;
            video.muted = state.muted;
            video.load();
            await waitForMetadata(video);
            try {
                const duration = Number(video.duration);
                const target = Number.isFinite(duration) && duration > 0
                    ? clamp(state.time,0,Math.max(0,duration-.01),0)
                    : Math.max(0,state.time||0);
                if (target > 0) video.currentTime = target;
            } catch (_) {}
            delete video.__cigGpuResumeState;
            return await nativePlay();
        } catch (error) {
            video.__cigGpuResumeState = state;
            video.dataset.cigGpuSuspended = "1";
            throw error;
        } finally {
            delete video.__cigGpuResumePromise;
        }
    })();
    video.__cigGpuResumePromise = promise;
    return promise;
}

function scheduleGpuIdleRelease(video,delay=GPU_IDLE_RELEASE_MS) {
    if (!(video instanceof HTMLVideoElement)) return;
    clearGpuIdleRelease(video);
    if (!gpuBackendActive(video) || video.dataset.cigGpuSuspended === "1") return;
    video.__cigGpuIdleReleaseTimer = setTimeout(() => {
        delete video.__cigGpuIdleReleaseTimer;
        if (!attached.has(video) || !gpuBackendActive(video) || !video.paused) return;
        const shell = video.__cigGpuShell?.player;
        if (shell && fullscreenElement() === shell) return;
        suspendGpuVideo(video,{force:true});
    },Math.max(0,delay));
}

function releaseOtherGpuDecoders(activeVideo) {
    for (const other of [...attached]) {
        if (!(other instanceof HTMLVideoElement) || other === activeVideo || !other.isConnected) continue;
        if (!gpuBackendActive(other)) continue;
        suspendGpuVideo(other,{force:true});
    }
}

async function navigateGpu(video,dir) {
    const paths=galleryPaths(video);
    if(paths.length<2)return;
    let index=paths.indexOf(currentPath(video));
    if(index<0)index=0;
    index=(index+dir+paths.length)%paths.length;
    const path=paths[index];
    if(!path)return;

    clearGpuIdleRelease(video);
    delete video.__cigGpuResumeState;
    delete video.dataset.cigGpuSuspended;
    video.dataset.cigCurrentPath=path;
    video.poster=thumbEndpoint(path);

    // Explicitly tear down the previous decoder pipeline before loading the next
    // file. Directly replacing src can leave Chromium/NVIDIA surfaces alive for
    // a while when navigating several videos in fullscreen.
    try { video.__cigNativePause?.(); } catch (_) { try { video.pause(); } catch (_) {} }
    try { video.removeAttribute("src"); video.load(); } catch (_) {}
    video.src=videoEndpoint(path);
    video.load();
    video.defaultPlaybackRate=loadSharedRate();
    video.playbackRate=loadSharedRate();
    video.volume=loadSharedVolume();
    try{await video.play();}catch(_){}
    video.__cigGpuShell?.update();
}

function createGpuBackend(video) {
    return {
        getCurrentTime:()=>{
            const saved=savedGpuState(video);
            return video.dataset.cigGpuSuspended==="1" ? Number(saved?.time)||0 : Number(video.currentTime)||0;
        },
        getDuration:()=>{
            const saved=savedGpuState(video);
            return video.dataset.cigGpuSuspended==="1" ? Number(saved?.duration)||0 : Number(video.duration)||0;
        },
        isPaused:()=>video.dataset.cigGpuSuspended==="1" || video.paused,
        getVolume:()=>video.dataset.cigGpuSuspended==="1" ? clamp(savedGpuState(video)?.volume,0,1,loadSharedVolume()) : video.volume,
        getRate:()=>video.dataset.cigGpuSuspended==="1" ? clamp(savedGpuState(video)?.rate,.25,3,loadSharedRate()) : video.playbackRate,
        play:()=>video.play().catch(()=>{}),
        pause:()=>video.pause(),
        seek:value=>{
            if(video.dataset.cigGpuSuspended==="1"){
                const state=savedGpuState(video);
                if(state){state.time=clamp(value,0,Math.max(0,Number(state.duration)||value),0);video.__cigGpuShell?.update?.();}
                return;
            }
            try{video.currentTime=clamp(value,0,Math.max(0,Number(video.duration)||value),0);}catch(_){}
        },
        setVolume:value=>{
            const next=clamp(value,0,1,1);
            const state=savedGpuState(video);
            if(state)state.volume=next;
            video.volume=next;
            if(video.volume>0&&video.muted)video.muted=false;
        },
        setRate:value=>{
            const rate=clamp(value,.25,3,1);
            const state=savedGpuState(video);
            if(state)state.rate=rate;
            video.defaultPlaybackRate=rate;
            video.playbackRate=rate;
        },
        suspend:()=>suspendGpuVideo(video,{force:true}),
        navigate:dir=>navigateGpu(video,dir),
    };
}

function attachVideo(video) {
    if(!(video instanceof HTMLVideoElement)||attached.has(video))return;

    const holder=video.closest(".ovg-thumb");
    if(!(holder instanceof HTMLElement))return;

    attached.add(video);
    video.dataset.cigGpuCpuStyle="1";
    if(!video.dataset.cigCurrentPath)video.dataset.cigCurrentPath=String(holder.closest(".ovg-card")?.dataset?.path||"");

    video.controls=false;
    video.removeAttribute("controls");
    video.loop=true;
    video.setAttribute("loop","");
    video.defaultPlaybackRate=loadSharedRate();
    video.playbackRate=loadSharedRate();
    video.volume=loadSharedVolume();

    // Keep direct calls from the original gallery compatible with decoder
    // suspension. If a paused video was unloaded, video.play() transparently
    // restores the same source and playback position first.
    try {
        video.__cigNativePlay = video.play.bind(video);
        video.__cigNativePause = video.pause.bind(video);
        Object.defineProperty(video,"play",{
            configurable:true,
            value:()=>resumeGpuVideo(video),
        });
    } catch (_) {}

    try{
        video.__cigSpeedControl?.remove?.();
        delete video.__cigSpeedControl;
    }catch(_){}

    const gpuBackend=createGpuBackend(video);
    let activeBackend=gpuBackend;
    const adapter={
        getCurrentTime:()=>activeBackend?.getCurrentTime?.(),
        getDuration:()=>activeBackend?.getDuration?.(),
        isPaused:()=>activeBackend?.isPaused?.(),
        getVolume:()=>activeBackend?.getVolume?.(),
        getRate:()=>activeBackend?.getRate?.(),
        play:()=>activeBackend?.play?.(),
        pause:()=>activeBackend?.pause?.(),
        seek:value=>activeBackend?.seek?.(value),
        setVolume:value=>activeBackend?.setVolume?.(value),
        setRate:value=>activeBackend?.setRate?.(value),
        navigate:dir=>activeBackend?.navigate?.(dir),
    };

    const shell=createOutputVideoPlayer({
        mode:"GPU",
        surface:video,
        host:holder,
        labels:TEXT,
        aliases:{
            player:["ovg-gpu-player"],
            hit:["ovg-gpu-hit"],
            seek:["ovg-gpu-seek"],
        },
        adapter,
    });

    video.__cigGpuShell=shell;
    video.__cigGpuPlayer=shell.player;
    video.__cigGpuUi=shell.ui;
    video.__cigGpuBackend=gpuBackend;
    video.__cigSetPlayerBackend=backend=>{
        if(backend&&backend!==gpuBackend)suspendGpuVideo(video,{force:true});
        activeBackend=backend||gpuBackend;
        shell.update();
    };
    video.__cigGetPlayerBackend=()=>activeBackend;

    const attrObserver=new MutationObserver(()=>{
        if(video.hasAttribute("controls")){
            video.controls=false;
            video.removeAttribute("controls");
        }
    });
    attrObserver.observe(video,{attributes:true,attributeFilter:["controls"]});
    video.__cigGpuControlsObserver=attrObserver;

    const update=()=>{
        video.controls=false;
        video.removeAttribute("controls");
        shell.update();
    };
    const onPlay=()=>{
        clearGpuIdleRelease(video);
        releaseOtherGpuDecoders(video);
        update();
    };
    const onPause=()=>{
        update();
        scheduleGpuIdleRelease(video);
    };
    for(const type of ["loadedmetadata","durationchange","timeupdate","ratechange","volumechange"]){
        video.addEventListener(type,update);
    }
    video.addEventListener("play",onPlay);
    video.addEventListener("pause",onPause);
    video.__cigGpuUpdate=update;
    video.__cigGpuOnPlay=onPlay;
    video.__cigGpuOnPause=onPause;
    update();
}

function ensureGpuVideo(thumb) {
    if(!(thumb instanceof HTMLElement))return null;
    let video=thumb.querySelector("video.ovg-inline-video");
    if(!(video instanceof HTMLVideoElement)){
        const play=thumb.querySelector(".ovg-play");
        if(play instanceof HTMLButtonElement)play.click();
        video=thumb.querySelector("video.ovg-inline-video");
    }
    if(video instanceof HTMLVideoElement&&!attached.has(video))attachVideo(video);
    return video instanceof HTMLVideoElement?video:null;
}

function isBareGpuPreviewEvent(event) {
    if(event.button!==0)return null;
    const target=event.target instanceof Element?event.target:null;
    if(!target||target.closest("button,input,select,.ovg-cpu-player,.ovg-gpu-player,.ovg-shared-player"))return null;
    const thumb=target.closest(".ovg-thumb");
    if(!(thumb instanceof HTMLElement)||!thumb.closest(".ovg-card"))return null;
    const modal=thumb.closest(".ovg-modal");
    if(!(modal instanceof HTMLElement)||modal.dataset.ovgCpuMode==="1")return null;
    return thumb;
}

function onPreviewPointerUp(event) {
    const thumb=isBareGpuPreviewEvent(event);
    if(!thumb)return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const now=performance.now();
    const pending=previewTaps.get(thumb);

    if(pending&&now-pending.time<=PLAYER_DOUBLE_CLICK_WINDOW_MS){
        clearTimeout(pending.timer);
        previewTaps.delete(thumb);
        const video=ensureGpuVideo(thumb);
        video?.__cigGpuShell?.requestFullscreen();
        return;
    }

    if(pending)clearTimeout(pending.timer);
    const timer=setTimeout(()=>{
        previewTaps.delete(thumb);
        if(!thumb.isConnected)return;
        const existing=thumb.querySelector("video.ovg-inline-video");
        if(existing instanceof HTMLVideoElement){
            if(!attached.has(existing))attachVideo(existing);
            existing.paused||existing.dataset.cigGpuSuspended==="1"?existing.play().catch(()=>{}):existing.pause();
            return;
        }
        ensureGpuVideo(thumb);
    },PLAYER_CLICK_DELAY);

    previewTaps.set(thumb,{time:now,timer});
}

function blockPreviewGeneratedClicks(event) {
    const thumb=isBareGpuPreviewEvent(event);
    if(!thumb)return;
    event.preventDefault();
    event.stopImmediatePropagation();
}

function cleanupVideo(video) {
    if(!(video instanceof HTMLVideoElement))return;

    clearGpuIdleRelease(video);
    video.__cigGpuControlsObserver?.disconnect?.();
    delete video.__cigGpuControlsObserver;

    const update=video.__cigGpuUpdate;
    if(update){
        for(const type of ["loadedmetadata","durationchange","timeupdate","ratechange","volumechange"]){
            video.removeEventListener(type,update);
        }
    }
    if(video.__cigGpuOnPlay)video.removeEventListener("play",video.__cigGpuOnPlay);
    if(video.__cigGpuOnPause)video.removeEventListener("pause",video.__cigGpuOnPause);
    delete video.__cigGpuUpdate;
    delete video.__cigGpuOnPlay;
    delete video.__cigGpuOnPause;

    const holder=video.closest?.(".ovg-thumb");
    holder?.__cigAutoCpuFallback?.destroy?.();

    video.__cigGpuShell?.destroy?.();
    delete video.__cigGpuShell;
    delete video.__cigGpuUi;
    delete video.__cigGpuPlayer;
    delete video.__cigGpuBackend;
    delete video.__cigSetPlayerBackend;
    delete video.__cigGetPlayerBackend;
    delete video.__cigGpuResumeState;
    delete video.__cigGpuResumePromise;
    delete video.__cigNativePlay;
    delete video.__cigNativePause;
    delete video.dataset.cigGpuSuspended;
    delete video.dataset.cigGpuCpuStyle;
    try { delete video.play; } catch (_) {}
    attached.delete(video);
}

function scan(root) {
    if(!(root instanceof Element))return;
    if(root instanceof HTMLVideoElement&&root.classList.contains("ovg-inline-video"))attachVideo(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(attachVideo);
}

function cleanupRemoved(root) {
    if(!(root instanceof Element)||root.isConnected)return;
    if(root instanceof HTMLVideoElement&&root.classList.contains("ovg-inline-video"))cleanupVideo(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(cleanupVideo);
}

function installModal(modal) {
    if(!(modal instanceof HTMLElement)||modalObservers.has(modal))return;
    scan(modal);
    const observer=new MutationObserver(records=>{
        for(const record of records){
            for(const node of record.addedNodes)if(node instanceof Element)scan(node);
            for(const node of record.removedNodes)if(node instanceof Element)cleanupRemoved(node);
        }
    });
    observer.observe(modal,{childList:true,subtree:true});
    modalObservers.set(modal,observer);
}

function uninstallModal(modal) {
    cleanupRemoved(modal);
    modalObservers.get(modal)?.disconnect();
    modalObservers.delete(modal);
}

function onFullscreenChange() {
    for(const video of [...attached]){
        if(!(video instanceof HTMLVideoElement)||!video.isConnected)continue;
        if(video.paused&&video.dataset.cigGpuSuspended!=="1")scheduleGpuIdleRelease(video,350);
    }
}

app.registerExtension({
    name:EXT_NAME,
    setup(){
        ensureOutputVideoPlayerStyles();
        document.querySelectorAll(".ovg-modal").forEach(installModal);

        const observer=new MutationObserver(records=>{
            for(const record of records){
                for(const node of record.addedNodes){
                    if(node instanceof HTMLElement&&node.classList.contains("ovg-modal"))installModal(node);
                }
                for(const node of record.removedNodes){
                    if(node instanceof HTMLElement&&node.classList.contains("ovg-modal"))uninstallModal(node);
                }
            }
        });
        observer.observe(document.body,{childList:true,subtree:false});

        document.addEventListener("fullscreenchange",onFullscreenChange,true);
        document.addEventListener("webkitfullscreenchange",onFullscreenChange,true);

        // Bare GPU previews use the same shared fullscreen as the in-player button.
        window.addEventListener("pointerup",onPreviewPointerUp,true);
        window.addEventListener("click",blockPreviewGeneratedClicks,true);
        window.addEventListener("dblclick",blockPreviewGeneratedClicks,true);
    },
});
