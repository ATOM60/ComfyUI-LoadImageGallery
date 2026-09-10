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

function galleryPaths(video) {
    const grid=video.closest?.(".ovg-card")?.closest?.(".ovg-grid");
    if(!grid)return[];
    return [...grid.querySelectorAll(".ovg-card[data-path]")]
        .map(el=>String(el.dataset.path||""))
        .filter(Boolean);
}

async function navigate(video,dir) {
    const paths=galleryPaths(video);
    if(paths.length<2)return;
    let index=paths.indexOf(currentPath(video));
    if(index<0)index=0;
    index=(index+dir+paths.length)%paths.length;
    const path=paths[index];
    if(!path)return;

    video.dataset.cigCurrentPath=path;
    video.poster=thumbEndpoint(path);
    video.src=videoEndpoint(path);
    video.load();
    video.defaultPlaybackRate=loadSharedRate();
    video.playbackRate=loadSharedRate();
    video.volume=loadSharedVolume();
    try{await video.play();}catch(_){}
    video.__cigGpuShell?.update();
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

    try{
        video.__cigSpeedControl?.remove?.();
        delete video.__cigSpeedControl;
    }catch(_){}

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
        adapter:{
            getCurrentTime:()=>Number(video.currentTime)||0,
            getDuration:()=>Number(video.duration)||0,
            isPaused:()=>video.paused,
            getVolume:()=>video.volume,
            getRate:()=>video.playbackRate,
            play:()=>video.play().catch(()=>{}),
            pause:()=>video.pause(),
            seek:value=>{try{video.currentTime=clamp(value,0,Math.max(0,Number(video.duration)||value),0);}catch(_){}},
            setVolume:value=>{
                video.volume=clamp(value,0,1,1);
                if(video.volume>0&&video.muted)video.muted=false;
            },
            setRate:value=>{
                const rate=clamp(value,.25,3,1);
                video.defaultPlaybackRate=rate;
                video.playbackRate=rate;
            },
            navigate:dir=>navigate(video,dir),
        },
    });

    video.__cigGpuShell=shell;
    video.__cigGpuPlayer=shell.player;
    video.__cigGpuUi=shell.ui;

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
    for(const type of ["loadedmetadata","durationchange","timeupdate","play","pause","ratechange","volumechange"]){
        video.addEventListener(type,update);
    }
    video.__cigGpuUpdate=update;
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
            existing.paused?existing.play().catch(()=>{}):existing.pause();
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

    video.__cigGpuControlsObserver?.disconnect?.();
    delete video.__cigGpuControlsObserver;

    const update=video.__cigGpuUpdate;
    if(update){
        for(const type of ["loadedmetadata","durationchange","timeupdate","play","pause","ratechange","volumechange"]){
            video.removeEventListener(type,update);
        }
    }
    delete video.__cigGpuUpdate;

    video.__cigGpuShell?.destroy?.();
    delete video.__cigGpuShell;
    delete video.__cigGpuUi;
    delete video.__cigGpuPlayer;
    delete video.dataset.cigGpuCpuStyle;
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

        // Window capture runs before the older document-level direct-gesture handler,
        // so bare GPU previews enter the exact same shared fullscreen as the player button.
        window.addEventListener("pointerup",onPreviewPointerUp,true);
        window.addEventListener("click",blockPreviewGeneratedClicks,true);
        window.addEventListener("dblclick",blockPreviewGeneratedClicks,true);
    },
});
