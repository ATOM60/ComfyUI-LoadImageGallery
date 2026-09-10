import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
    PLAYER_CLICK_DELAY,
    clamp,
    createOutputVideoPlayer,
    ensureOutputVideoPlayerStyles,
    loadSharedRate,
    loadSharedVolume,
} from "./output_video_player_shared.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoCpuPlayback";
const STYLE_ID = "cig-output-video-cpu-playback-style";
const MODE_KEY = "ComfyUI-LoadImageGallery.outputVideoCpuPlayback";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en").toLowerCase().startsWith("ru");
const TEXT = RU ? {
    cpu:"CPU", enable:"CPU-проигрывание: декодировать видео процессором", disable:"Обычное проигрывание видео",
    play:"Воспроизвести", pause:"Пауза", prev:"Предыдущее видео", next:"Следующее видео",
    speed:"Скорость воспроизведения", volume:"Громкость", fullscreen:"На весь экран",
    exitFullscreen:"Выйти из полноэкранного режима", error:"Ошибка CPU-проигрывания",
    help:"Переключатель CPU в верхней строке переносит декодирование видео на процессор. CPU и GPU используют одну и ту же оболочку плеера и отличаются только способом декодирования.",
} : {
    cpu:"CPU", enable:"CPU playback: decode video on the processor", disable:"Normal video playback",
    play:"Play", pause:"Pause", prev:"Previous video", next:"Next video",
    speed:"Playback speed", volume:"Volume", fullscreen:"Fullscreen",
    exitFullscreen:"Exit fullscreen", error:"CPU playback error",
    help:"The CPU switch moves decoding to the processor. CPU and GPU use the same player shell and differ only in decoding.",
};

const states = new Set();

function loadMode() { try { return localStorage.getItem(MODE_KEY)==="1"; } catch (_) { return false; } }
function saveMode(on) { try { localStorage.setItem(MODE_KEY,on?"1":"0"); } catch (_) {} }
function apiUrl(route) { try { if (typeof api.apiURL === "function") return api.apiURL(route); } catch (_) {} return route; }
function wsUrl(path,start,rate) {
    const u=new URL(apiUrl(`/image-gallery/output/cpu-stream?path=${encodeURIComponent(path)}&start=${encodeURIComponent(start)}&rate=${encodeURIComponent(rate)}`),window.location.href);
    u.protocol=u.protocol==="https:"?"wss:":"ws:";
    return u.toString();
}
function audioUrl(path,start) { return apiUrl(`/image-gallery/output/cpu-audio?path=${encodeURIComponent(path)}&start=${encodeURIComponent(start)}&v=${Date.now()}`); }

function injectStyles() {
    ensureOutputVideoPlayerStyles();
    if (document.getElementById(STYLE_ID)) return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    style.textContent=`
.ovg-cpu-toggle{height:30px!important;min-width:48px!important;padding:0 10px!important;font-size:12px!important;font-weight:700!important;letter-spacing:.3px}
.ovg-cpu-toggle.active{background:#26364b!important;border-color:#6ba7ff!important;color:#b9d6ff!important;box-shadow:inset 0 0 0 1px rgba(107,167,255,.2)}
`;
    document.head.appendChild(style);
}

function showError(message) {
    try { app.extensionManager?.toast?.add({severity:"error",summary:TEXT.error,detail:message,life:4200}); }
    catch (_) { console.error("[Output CPU Playback]",message); }
}

function cardPath(card) { return String(card?.dataset?.path||"").trim(); }
function visibleCards(state) { return [...state.modal.querySelectorAll(".ovg-grid > .ovg-card")]; }

function currentTime(state) {
    const a=state.audio;
    if (a && state.audioReady && !a.error && Number.isFinite(a.currentTime) && a.currentTime>=0) return (state.audioOffset||0)+a.currentTime;
    if (!state.paused && state.clockStartedAt) return state.clockBase+((performance.now()-state.clockStartedAt)/1000)*state.rate;
    return state.currentTime||0;
}

function drawFrame(state,bitmap) {
    const c=state.canvas,p=state.player;
    if (!(c instanceof HTMLCanvasElement)||!(p instanceof HTMLElement)) return;
    const r=p.getBoundingClientRect();
    const dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
    const w=Math.max(2,Math.round(r.width*dpr));
    const h=Math.max(2,Math.round(r.height*dpr));
    if(c.width!==w)c.width=w;
    if(c.height!==h)c.height=h;
    const x=c.getContext("2d",{alpha:false,desynchronized:true});
    if(!x)return;
    x.fillStyle="#000";
    x.fillRect(0,0,w,h);
    const iw=bitmap.width||1,ih=bitmap.height||1;
    const scale=Math.min(w/iw,h/ih);
    const dw=Math.max(1,Math.round(iw*scale));
    const dh=Math.max(1,Math.round(ih*scale));
    x.drawImage(bitmap,Math.round((w-dw)/2),Math.round((h-dh)/2),dw,dh);
}

function closeSocket(state) {
    state.streamGeneration+=1;
    const ws=state.ws;
    state.ws=null;
    if(!ws)return;
    try{ws.onopen=ws.onmessage=ws.onerror=ws.onclose=null;}catch(_){}
    try{ws.close(1000,"switch");}catch(_){}
}

function stopAudio(state) {
    const a=state.audio;
    state.audio=null;
    state.audioReady=false;
    state.audioOffset=0;
    if(!a)return;
    try{a.pause();}catch(_){}
    try{a.removeAttribute("src");a.load();}catch(_){}
}

function restoreMountedCard(state) {
    const card=state.mountCard;
    if(!(card instanceof HTMLElement))return;
    const holder=card.querySelector(".ovg-thumb");
    holder?.querySelector("img")?.style.removeProperty("display");
    const fallback=holder?.querySelector(".ovg-thumb-fallback");
    if(fallback&&!holder?.querySelector("img")?.getAttribute("src"))fallback.style.removeProperty("display");
    holder?.querySelector(".ovg-play")?.style.removeProperty("display");
}

function mountPlayer(state,card) {
    if(!(state.player instanceof HTMLElement)||!(card instanceof HTMLElement))return false;
    const holder=card.querySelector(".ovg-thumb");
    if(!(holder instanceof HTMLElement))return false;
    if(state.mountCard&&state.mountCard!==card)restoreMountedCard(state);
    holder.querySelector("img")?.style.setProperty("display","none");
    holder.querySelector(".ovg-thumb-fallback")?.style.setProperty("display","none");
    holder.querySelector(".ovg-play")?.style.setProperty("display","none");
    holder.appendChild(state.player);
    state.mountCard=card;
    return true;
}

function updateUi(state) {
    state.shell?.update();
}

function pauseCpu(state) {
    if(!state.player||state.paused)return;
    state.currentTime=currentTime(state);
    state.paused=true;
    state.clockStartedAt=0;
    closeSocket(state);
    try{state.audio?.pause();}catch(_){}
    updateUi(state);
}

function makeAudio(state,start) {
    stopAudio(state);
    const a=new Audio();
    state.audio=a;
    state.audioReady=false;
    state.audioOffset=Math.max(0,Number(start)||0);
    a.preload="auto";
    a.volume=state.volume;
    a.playbackRate=state.rate;
    a.src=audioUrl(state.currentPath,state.audioOffset);
    let playRequested=false;
    const go=()=>{
        if(state.audio!==a||state.paused||playRequested)return;
        playRequested=true;
        try{
            a.playbackRate=state.rate;
            a.volume=state.volume;
        }catch(_){}
        const result=a.play();
        result?.catch?.(()=>{playRequested=false;});
    };
    a.addEventListener("playing",()=>{
        if(state.audio===a){
            state.audioReady=true;
            updateUi(state);
        }
    });
    a.addEventListener("canplay",go,{once:true});
    a.addEventListener("loadeddata",go,{once:true});
    a.addEventListener("error",()=>{
        if(state.audio===a){
            state.audio=null;
            state.audioReady=false;
        }
    },{once:true});
    if(a.readyState>=2)go();
}

function openStream(state,start,{previewPause=false}={}) {
    closeSocket(state);
    stopAudio(state);
    const generation=++state.streamGeneration;
    const at=Math.max(0,Number(start)||0);
    state.currentTime=at;
    state.clockBase=at;
    state.clockStartedAt=performance.now();
    state.paused=false;
    state.previewPause=!!previewPause;
    updateUi(state);
    if(!previewPause)makeAudio(state,at);

    const ws=new WebSocket(wsUrl(state.currentPath,at,state.rate));
    ws.binaryType="arraybuffer";
    state.ws=ws;
    ws.onmessage=async event=>{
        if(generation!==state.streamGeneration||state.ws!==ws||state.paused)return;
        if(typeof event.data==="string"){
            try{
                const d=JSON.parse(event.data);
                if(d.type==="meta"){
                    state.duration=Number(d.duration||0);
                    state.fps=Number(d.fps||30);
                    updateUi(state);
                }else if(d.type==="eof"){
                    if(!state.paused&&generation===state.streamGeneration){
                        setTimeout(()=>{
                            if(!state.paused&&state.player?.isConnected&&generation===state.streamGeneration)openStream(state,0);
                        },40);
                    }
                }else if(d.type==="error"){
                    showError(d.error||TEXT.error);
                }
            }catch(_){}
            return;
        }
        try{
            const bitmap=await createImageBitmap(new Blob([event.data],{type:"image/jpeg"}));
            if(generation===state.streamGeneration&&!state.paused&&state.player?.isConnected){
                drawFrame(state,bitmap);
                if(state.previewPause){
                    state.previewPause=false;
                    state.currentTime=at;
                    state.paused=true;
                    state.clockStartedAt=0;
                    closeSocket(state);
                    updateUi(state);
                }
            }
            bitmap.close?.();
        }catch(_){}
    };
    ws.onerror=()=>{if(generation===state.streamGeneration&&!state.paused)showError(TEXT.error);};
}

function resumeCpu(state) {
    if(state.player&&state.currentPath&&state.paused)openStream(state,state.currentTime||0);
}

function seekCpu(state,value) {
    const at=clamp(value,0,Math.max(0,state.duration||value),0);
    const wasPaused=state.paused;
    state.currentTime=at;
    openStream(state,at,{previewPause:wasPaused});
}

function setVolume(state,value) {
    state.volume=clamp(value,0,1,1);
    if(state.audio)state.audio.volume=state.volume;
    updateUi(state);
}

function setRate(state,value) {
    const next=clamp(value,.25,3,1);
    if(Math.abs(next-state.rate)<.001)return;
    const at=currentTime(state);
    const wasPaused=state.paused;
    state.rate=next;
    state.currentTime=at;
    if(!wasPaused)openStream(state,at);
    updateUi(state);
}

function switchCpuPath(state,card) {
    const path=cardPath(card);
    if(!path)return;
    const fs=document.fullscreenElement===state.player;
    state.currentCard=card;
    state.currentPath=path;
    state.currentTime=0;
    state.duration=0;
    if(!fs)mountPlayer(state,card);
    openStream(state,0);
}

function navigateCpu(state,dir) {
    const cards=visibleCards(state);
    if(!cards.length)return;
    let index=cards.findIndex(c=>cardPath(c)===state.currentPath);
    if(index<0)index=0;
    index=(index+dir+cards.length)%cards.length;
    switchCpuPath(state,cards[index]);
}

function remountAfterFullscreen(state) {
    if(!state.player||document.fullscreenElement===state.player)return;
    if(state.currentCard&&state.currentCard!==state.mountCard)mountPlayer(state,state.currentCard);
    updateUi(state);
}

function buildPlayer(state) {
    const canvas=document.createElement("canvas");
    const shell=createOutputVideoPlayer({
        mode:"CPU",
        surface:canvas,
        labels:TEXT,
        aliases:{
            player:["ovg-cpu-player"],
            surface:["ovg-cpu-canvas"],
            hit:["ovg-cpu-hit"],
            seek:["ovg-cpu-seek"],
        },
        adapter:{
            getCurrentTime:()=>currentTime(state),
            getDuration:()=>state.duration,
            isPaused:()=>state.paused,
            getVolume:()=>state.volume,
            getRate:()=>state.rate,
            play:()=>resumeCpu(state),
            pause:()=>pauseCpu(state),
            seek:value=>seekCpu(state,value),
            setVolume:value=>setVolume(state,value),
            setRate:value=>setRate(state,value),
            navigate:dir=>navigateCpu(state,dir),
        },
        onFullscreenChange:()=>remountAfterFullscreen(state),
    });

    state.shell=shell;
    state.player=shell.player;
    state.canvas=canvas;
    state.hit=shell.ui.hit;
    state.uiPlay=shell.ui.play;
    state.uiSeek=shell.ui.seek;
    state.uiTime=shell.ui.time;
    state.uiVolume=shell.ui.volume;
    state.uiFullscreen=shell.ui.fullscreen;
    state.speedRange=shell.ui.speedRange;
    state.speedValue=shell.ui.speedValue;
    return state.player;
}

function stopCpu(state,{restore=true}={}) {
    if(!state)return;
    state.currentTime=currentTime(state);
    state.paused=true;
    closeSocket(state);
    stopAudio(state);
    if(restore)restoreMountedCard(state);
    state.shell?.destroy();
    state.shell=null;
    state.player=state.canvas=state.hit=null;
    state.uiPlay=state.uiSeek=state.uiTime=state.uiVolume=state.uiFullscreen=null;
    state.speedRange=state.speedValue=null;
    state.mountCard=state.currentCard=null;
    state.currentPath="";
    state.clockStartedAt=0;
}

function startCpu(state,card,{fullscreen=false,toggleSame=false}={}) {
    const path=cardPath(card);
    if(!path)return;
    if(state.player&&state.currentPath===path){
        if(fullscreen)state.shell?.requestFullscreen();
        else if(toggleSame){
            if(state.paused)resumeCpu(state);
            else pauseCpu(state);
        }
        return;
    }

    stopCpu(state);
    state.rate=loadSharedRate();
    state.volume=loadSharedVolume();
    state.currentCard=card;
    state.currentPath=path;
    state.currentTime=0;
    state.duration=0;
    buildPlayer(state);
    if(!mountPlayer(state,card)){
        stopCpu(state);
        return;
    }
    openStream(state,0);
    if(fullscreen)state.shell?.requestFullscreen();
}

function forceGalleryRerender(modal) {
    const sort=modal.querySelector(".ovg-sort");
    if(sort instanceof HTMLSelectElement)sort.dispatchEvent(new Event("change",{bubbles:true}));
}

function setMode(state,on) {
    state.cpuOn=!!on;
    state.modal.dataset.ovgCpuMode=state.cpuOn?"1":"0";
    saveMode(state.cpuOn);
    state.toggle?.classList.toggle("active",state.cpuOn);
    if(state.toggle)state.toggle.title=state.cpuOn?TEXT.disable:TEXT.enable;
    stopCpu(state);
    forceGalleryRerender(state.modal);
}

function installModal(modal) {
    if(!(modal instanceof HTMLElement)||modal.dataset.ovgCpuPlaybackInstalled==="1")return;
    const titlebar=modal.querySelector(".ovg-titlebar");
    const close=modal.querySelector(".ovg-close");
    const grid=modal.querySelector(".ovg-grid");
    if(!(titlebar instanceof HTMLElement)||!(close instanceof HTMLElement)||!(grid instanceof HTMLElement))return;

    modal.dataset.ovgCpuPlaybackInstalled="1";
    const state={
        modal,grid,toggle:null,cpuOn:loadMode(),
        shell:null,player:null,canvas:null,hit:null,ws:null,audio:null,audioReady:false,audioOffset:0,
        currentCard:null,mountCard:null,currentPath:"",currentTime:0,duration:0,fps:30,
        rate:loadSharedRate(),volume:loadSharedVolume(),paused:true,clockBase:0,clockStartedAt:0,
        streamGeneration:0,speedRange:null,speedValue:null,lastContextPath:"",
        thumbClickTimer:0,observer:null,seeking:false,previewPause:false,
    };
    states.add(state);

    const toggle=document.createElement("button");
    toggle.type="button";
    toggle.className="ovg-btn ovg-cpu-toggle";
    toggle.textContent=TEXT.cpu;
    toggle.setAttribute("aria-label",TEXT.enable);
    close.insertAdjacentElement("beforebegin",toggle);
    state.toggle=toggle;
    toggle.classList.toggle("active",state.cpuOn);
    toggle.title=state.cpuOn?TEXT.disable:TEXT.enable;
    toggle.addEventListener("click",event=>{
        event.preventDefault();
        event.stopPropagation();
        setMode(state,!state.cpuOn);
    });

    modal.addEventListener("contextmenu",event=>{
        const card=event.target.closest?.(".ovg-card");
        if(card)state.lastContextPath=cardPath(card);
    },true);

    modal.addEventListener("click",event=>{
        if(!state.cpuOn)return;
        const play=event.target.closest?.(".ovg-play");
        if(play){
            const card=play.closest(".ovg-card");
            if(!card)return;
            event.preventDefault();
            event.stopImmediatePropagation();
            startCpu(state,card,{toggleSame:true});
            return;
        }

        const thumb=event.target.closest?.(".ovg-thumb");
        if(!thumb||event.target.closest?.("button,video,.ovg-cpu-player,.ovg-shared-player"))return;
        const card=thumb.closest(".ovg-card");
        if(!card)return;

        event.preventDefault();
        event.stopImmediatePropagation();
        if(event.detail>=2){
            if(state.thumbClickTimer)clearTimeout(state.thumbClickTimer);
            state.thumbClickTimer=0;
            startCpu(state,card,{fullscreen:true});
            return;
        }

        if(state.thumbClickTimer)clearTimeout(state.thumbClickTimer);
        state.thumbClickTimer=setTimeout(()=>{
            state.thumbClickTimer=0;
            if(state.cpuOn&&card.isConnected)startCpu(state,card,{toggleSame:true});
        },PLAYER_CLICK_DELAY);
    },true);

    modal.addEventListener("dblclick",event=>{
        if(!state.cpuOn)return;
        const thumb=event.target.closest?.(".ovg-thumb");
        if(!thumb||event.target.closest?.("button,video,.ovg-cpu-player,.ovg-shared-player"))return;
        event.preventDefault();
        event.stopImmediatePropagation();
    },true);

    state.observer=new MutationObserver(()=>{
        if(state.player&&!state.player.isConnected&&document.fullscreenElement!==state.player)stopCpu(state,{restore:false});
    });
    state.observer.observe(grid,{childList:true});
}

function uninstallState(state) {
    if(!state)return;
    stopCpu(state,{restore:false});
    state.observer?.disconnect();
    if(state.thumbClickTimer)clearTimeout(state.thumbClickTimer);
    states.delete(state);
}

function scan(root=document) {
    if(root instanceof HTMLElement&&root.classList.contains("ovg-modal"))installModal(root);
    root.querySelectorAll?.(".ovg-modal").forEach(installModal);
}

function updateHelp(root) {
    const overlay=root instanceof HTMLElement&&root.classList.contains("ovg-help-overlay")?root:root.querySelector?.(".ovg-help-overlay");
    if(!(overlay instanceof HTMLElement)||overlay.dataset.ovgCpuHelp==="1")return;
    const lists=overlay.querySelectorAll(".ovg-help-body ul");
    const list=lists.length?lists[lists.length-1]:null;
    if(!(list instanceof HTMLElement))return;
    overlay.dataset.ovgCpuHelp="1";
    const li=document.createElement("li");
    li.textContent=TEXT.help;
    list.appendChild(li);
}

function activeCpuState() {
    for(const state of states)if(state.cpuOn&&state.modal?.isConnected)return state;
    return null;
}

app.registerExtension({
    name:EXT_NAME,
    setup(){
        injectStyles();
        scan();
        updateHelp(document);

        document.addEventListener("click",event=>{
            const button=event.target.closest?.(".ovg-menu button[data-action='open']");
            if(!button)return;
            const state=activeCpuState();
            if(!state?.lastContextPath)return;
            const card=visibleCards(state).find(c=>cardPath(c)===state.lastContextPath);
            if(!card)return;
            event.preventDefault();
            event.stopImmediatePropagation();
            button.closest(".ovg-menu")?.remove();
            startCpu(state,card,{toggleSame:true});
        },true);

        const observer=new MutationObserver(records=>{
            for(const record of records){
                for(const node of record.addedNodes){
                    if(!(node instanceof Element))continue;
                    scan(node);
                    updateHelp(node);
                }
                for(const node of record.removedNodes){
                    if(!(node instanceof Element))continue;
                    if(node.classList.contains("ovg-modal")){
                        for(const state of [...states])if(state.modal===node)uninstallState(state);
                    }
                }
            }
        });
        observer.observe(document.body,{childList:true,subtree:false});
    },
});
