import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoCpuPlayback";
const STYLE_ID = "cig-output-video-cpu-playback-style";
const MODE_KEY = "ComfyUI-LoadImageGallery.outputVideoCpuPlayback";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const VOLUME_KEY = "ComfyUI-LoadImageGallery.outputVideoVolume";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const CLICK_DELAY = 260;

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en").toLowerCase().startsWith("ru");
const TEXT = RU ? {
    cpu:"CPU", enable:"CPU-проигрывание: декодировать видео процессором", disable:"Обычное проигрывание видео",
    play:"Воспроизвести", pause:"Пауза", prev:"Предыдущее видео", next:"Следующее видео",
    speed:"Скорость воспроизведения", volume:"Громкость", fullscreen:"На весь экран",
    exitFullscreen:"Выйти из полноэкранного режима", error:"Ошибка CPU-проигрывания",
    help:"Переключатель CPU в верхней строке переносит декодирование видео на процессор. В CPU-режиме панель управления работает так же, как у обычного проигрывателя.",
} : {
    cpu:"CPU", enable:"CPU playback: decode video on the processor", disable:"Normal video playback",
    play:"Play", pause:"Pause", prev:"Previous video", next:"Next video",
    speed:"Playback speed", volume:"Volume", fullscreen:"Fullscreen",
    exitFullscreen:"Exit fullscreen", error:"CPU playback error",
    help:"The CPU switch in the top row moves video decoding to the processor. CPU mode uses the same familiar playback controls as normal video playback.",
};

const states = new Set();

function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function loadRate() { try { return clamp(localStorage.getItem(RATE_KEY) || 1, .25, 3, 1); } catch (_) { return 1; } }
function saveRate(v) { try { localStorage.setItem(RATE_KEY, String(clamp(v,.25,3,1))); } catch (_) {} }
function loadVolume() { try { const v=localStorage.getItem(VOLUME_KEY); return v==null?1:clamp(v,0,1,1); } catch (_) { return 1; } }
function saveVolume(v) { try { localStorage.setItem(VOLUME_KEY, String(clamp(v,0,1,1))); } catch (_) {} }
function loadMode() { try { return localStorage.getItem(MODE_KEY)==="1"; } catch (_) { return false; } }
function saveMode(on) { try { localStorage.setItem(MODE_KEY,on?"1":"0"); } catch (_) {} }
function apiUrl(route) { try { if (typeof api.apiURL === "function") return api.apiURL(route); } catch (_) {} return route; }
function wsUrl(path,start,rate) {
    const u=new URL(apiUrl(`/image-gallery/output/cpu-stream?path=${encodeURIComponent(path)}&start=${encodeURIComponent(start)}&rate=${encodeURIComponent(rate)}`),window.location.href);
    u.protocol=u.protocol==="https:"?"wss:":"ws:"; return u.toString();
}
function videoUrl(path) { return apiUrl(`/image-gallery/output/video?path=${encodeURIComponent(path)}&v=${Date.now()}`); }
function fmtTime(value) {
    let s=Math.max(0,Math.floor(Number(value)||0)); const h=Math.floor(s/3600); s-=h*3600; const m=Math.floor(s/60); s%=60;
    return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style=document.createElement("style"); style.id=STYLE_ID; style.textContent=`
.ovg-cpu-toggle{height:30px!important;min-width:48px!important;padding:0 10px!important;font-size:12px!important;font-weight:700!important;letter-spacing:.3px}
.ovg-cpu-toggle.active{background:#26364b!important;border-color:#6ba7ff!important;color:#b9d6ff!important;box-shadow:inset 0 0 0 1px rgba(107,167,255,.2)}
.ovg-cpu-player{position:absolute;inset:0;z-index:9;background:#000;overflow:hidden;container-type:inline-size}
.ovg-cpu-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;background:#000}
.ovg-cpu-hit{position:absolute;inset:0;z-index:2;width:100%;height:100%;padding:0;margin:0;border:0;background:transparent;cursor:pointer}
.ovg-cpu-badge{position:absolute;left:8px;top:7px;z-index:4;padding:3px 6px;border-radius:5px;background:rgba(0,0,0,.62);color:#d6e8ff;font:700 10px/1.2 Arial,sans-serif;pointer-events:none;letter-spacing:.3px}
.ovg-cpu-paused{position:absolute;left:50%;top:50%;z-index:4;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.58);color:#fff;font-size:23px;pointer-events:none}.ovg-cpu-player.paused .ovg-cpu-paused{display:flex}
.ovg-cpu-native{position:absolute;left:0;right:0;bottom:0;z-index:12;padding:18px 8px 5px;box-sizing:border-box;background:linear-gradient(to top,rgba(0,0,0,.88) 0%,rgba(0,0,0,.55) 58%,transparent 100%);opacity:0;transform:translateY(2px);transition:opacity .13s ease,transform .13s ease;pointer-events:none;color:#fff;font:12px Arial,sans-serif}
.ovg-cpu-player:hover .ovg-cpu-native,.ovg-cpu-player.paused .ovg-cpu-native,.ovg-cpu-player:fullscreen .ovg-cpu-native{opacity:1;transform:none;pointer-events:auto}
.ovg-cpu-seek{display:block;width:100%;height:12px;margin:0 0 2px;accent-color:#fff;cursor:pointer}
.ovg-cpu-native-row{display:flex;align-items:center;gap:6px;height:30px;min-width:0}
.ovg-cpu-native button{width:30px;height:30px;min-width:30px;padding:0;border:0;border-radius:4px;background:transparent;color:#fff;font:16px/30px "Segoe UI Symbol",Arial,sans-serif;cursor:pointer}.ovg-cpu-native button:hover{background:rgba(255,255,255,.15)}
.ovg-cpu-time{white-space:nowrap;opacity:.92;font-variant-numeric:tabular-nums}.ovg-cpu-spacer{flex:1 1 auto;min-width:2px}
.ovg-cpu-volume{width:78px;max-width:90px;min-width:46px;accent-color:#fff;cursor:pointer}
.ovg-cpu-fs-controls{display:none;position:absolute;right:28px;top:50%;z-index:14;transform:translateY(-50%);flex-direction:column;gap:8px;align-items:center}
.ovg-cpu-fs-controls button{width:44px;height:44px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(20,20,20,.72);color:#fff;font:18px/42px Arial,sans-serif;padding:0;cursor:pointer;backdrop-filter:blur(5px)}.ovg-cpu-fs-controls button:hover{background:rgba(45,45,45,.86)}
.ovg-cpu-speed-panel{display:none;position:absolute;right:54px;top:50%;transform:translateY(-50%);padding:10px 12px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(20,20,20,.86);white-space:nowrap;color:#fff;font:12px Arial,sans-serif}.ovg-cpu-speed-panel.open{display:flex;align-items:center;gap:8px}.ovg-cpu-speed-panel input{width:150px}
.ovg-cpu-player:fullscreen{width:100vw!important;height:100vh!important;background:#000!important}.ovg-cpu-player:fullscreen .ovg-cpu-canvas{width:100vw!important;height:100vh!important}.ovg-cpu-player:fullscreen .ovg-cpu-fs-controls{display:flex}.ovg-cpu-player:fullscreen .ovg-cpu-native{padding:24px 14px 9px}.ovg-cpu-player:fullscreen .ovg-cpu-volume{width:100px;max-width:120px}
@container (max-width:360px){.ovg-cpu-time,.ovg-cpu-volume{display:none}.ovg-cpu-native-row{gap:2px}.ovg-cpu-native{padding-left:5px;padding-right:5px}}
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
    if (a && !a.error && Number.isFinite(a.currentTime) && a.currentTime>=0) return a.currentTime;
    if (!state.paused && state.clockStartedAt) return state.clockBase+((performance.now()-state.clockStartedAt)/1000)*state.rate;
    return state.currentTime||0;
}
function drawFrame(state,bitmap) {
    const c=state.canvas,p=state.player; if (!(c instanceof HTMLCanvasElement)||!(p instanceof HTMLElement)) return;
    const r=p.getBoundingClientRect(),dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1)),w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));
    if(c.width!==w)c.width=w;if(c.height!==h)c.height=h; const x=c.getContext("2d",{alpha:false,desynchronized:true}); if(!x)return;
    x.fillStyle="#000";x.fillRect(0,0,w,h); const iw=bitmap.width||1,ih=bitmap.height||1,s=Math.min(w/iw,h/ih),dw=Math.max(1,Math.round(iw*s)),dh=Math.max(1,Math.round(ih*s)); x.drawImage(bitmap,Math.round((w-dw)/2),Math.round((h-dh)/2),dw,dh);
}
function closeSocket(state) {
    state.streamGeneration+=1; const ws=state.ws; state.ws=null; if(!ws)return;
    try{ws.onopen=ws.onmessage=ws.onerror=ws.onclose=null;}catch(_){} try{ws.close(1000,"switch");}catch(_){}
}
function stopAudio(state) {
    const a=state.audio;state.audio=null;if(!a)return;try{a.pause();}catch(_){}try{a.removeAttribute("src");a.load();}catch(_){}
}
function restoreMountedCard(state) {
    const card=state.mountCard;if(!(card instanceof HTMLElement))return;const h=card.querySelector(".ovg-thumb");h?.querySelector("img")?.style.removeProperty("display");const f=h?.querySelector(".ovg-thumb-fallback");if(f&&!h?.querySelector("img")?.getAttribute("src"))f.style.removeProperty("display");h?.querySelector(".ovg-play")?.style.removeProperty("display");
}
function mountPlayer(state,card) {
    if(!(state.player instanceof HTMLElement)||!(card instanceof HTMLElement))return false;const h=card.querySelector(".ovg-thumb");if(!(h instanceof HTMLElement))return false;
    if(state.mountCard&&state.mountCard!==card)restoreMountedCard(state);h.querySelector("img")?.style.setProperty("display","none");h.querySelector(".ovg-thumb-fallback")?.style.setProperty("display","none");h.querySelector(".ovg-play")?.style.setProperty("display","none");h.appendChild(state.player);state.mountCard=card;return true;
}
function updateUi(state) {
    const p=state.player;if(!p)return;p.classList.toggle("paused",!!state.paused);if(state.hit)state.hit.title=state.paused?TEXT.play:TEXT.pause;
    if(state.uiPlay){state.uiPlay.textContent=state.paused?"▶":"❚❚";state.uiPlay.title=state.paused?TEXT.play:TEXT.pause;}
    if(state.uiSeek&&!state.seeking){state.uiSeek.max=String(Math.max(.001,state.duration||0));state.uiSeek.value=String(Math.min(state.duration||Number.MAX_SAFE_INTEGER,currentTime(state)));}
    if(state.uiTime)state.uiTime.textContent=`${fmtTime(currentTime(state))} / ${fmtTime(state.duration)}`;
    if(state.uiVolume)state.uiVolume.value=String(state.volume);
    if(state.uiFullscreen){const fs=document.fullscreenElement===p;state.uiFullscreen.textContent=fs?"⤢":"⛶";state.uiFullscreen.title=fs?TEXT.exitFullscreen:TEXT.fullscreen;}
}
function pauseCpu(state) {
    if(!state.player||state.paused)return;state.currentTime=currentTime(state);state.paused=true;state.clockStartedAt=0;closeSocket(state);try{state.audio?.pause();}catch(_){}updateUi(state);
}
function makeAudio(state,start) {
    stopAudio(state);const a=new Audio();state.audio=a;a.preload="metadata";a.volume=state.volume;a.playbackRate=state.rate;a.src=videoUrl(state.currentPath);
    const go=()=>{if(state.audio!==a||state.paused)return;try{a.currentTime=Math.max(0,start);a.playbackRate=state.rate;a.volume=state.volume;}catch(_){}a.play()?.catch?.(()=>{});};
    a.addEventListener("loadedmetadata",go,{once:true});a.addEventListener("canplay",go,{once:true});a.addEventListener("error",()=>{if(state.audio===a)state.audio=null;},{once:true});if(a.readyState>=1)go();
}
function openStream(state,start,{previewPause=false}={}) {
    closeSocket(state);stopAudio(state);const generation=++state.streamGeneration;const at=Math.max(0,Number(start)||0);state.currentTime=at;state.clockBase=at;state.clockStartedAt=performance.now();state.paused=false;state.previewPause=!!previewPause;updateUi(state);if(!previewPause)makeAudio(state,at);
    const ws=new WebSocket(wsUrl(state.currentPath,at,state.rate));ws.binaryType="arraybuffer";state.ws=ws;
    ws.onmessage=async event=>{
        if(generation!==state.streamGeneration||state.ws!==ws||state.paused)return;
        if(typeof event.data==="string"){
            try{const d=JSON.parse(event.data);if(d.type==="meta"){state.duration=Number(d.duration||0);state.fps=Number(d.fps||30);updateUi(state);}else if(d.type==="eof"){if(!state.paused&&generation===state.streamGeneration)setTimeout(()=>{if(!state.paused&&state.player?.isConnected&&generation===state.streamGeneration)openStream(state,0);},40);}else if(d.type==="error")showError(d.error||TEXT.error);}catch(_){}return;
        }
        try{const bm=await createImageBitmap(new Blob([event.data],{type:"image/jpeg"}));if(generation===state.streamGeneration&&!state.paused&&state.player?.isConnected){drawFrame(state,bm);if(state.previewPause){state.previewPause=false;state.currentTime=at;state.paused=true;state.clockStartedAt=0;closeSocket(state);updateUi(state);}}bm.close?.();}catch(_){}
    };
    ws.onerror=()=>{if(generation===state.streamGeneration&&!state.paused)showError(TEXT.error);};
}
function resumeCpu(state){if(state.player&&state.currentPath&&state.paused)openStream(state,state.currentTime||0);}
function toggleCpuPlayback(state){state.paused?resumeCpu(state):pauseCpu(state);}
function seekCpu(state,value){const at=clamp(value,0,Math.max(0,state.duration||value),0),wasPaused=state.paused;state.currentTime=at;openStream(state,at,{previewPause:wasPaused});}
function setVolume(state,value){state.volume=clamp(value,0,1,1);saveVolume(state.volume);if(state.audio)state.audio.volume=state.volume;updateUi(state);}
function setRate(state,value){const next=clamp(value,.25,3,1);if(Math.abs(next-state.rate)<.001)return;const at=currentTime(state),wasPaused=state.paused;state.rate=next;saveRate(next);if(state.speedRange)state.speedRange.value=String(next);if(state.speedValue)state.speedValue.textContent=`${next.toFixed(next%1?2:0)}×`;state.currentTime=at;if(!wasPaused)openStream(state,at);}
function switchCpuPath(state,card){const path=cardPath(card);if(!path)return;const fs=document.fullscreenElement===state.player;state.currentCard=card;state.currentPath=path;state.currentTime=0;state.duration=0;if(!fs)mountPlayer(state,card);openStream(state,0);}
function navigateCpu(state,dir){const cards=visibleCards(state);if(!cards.length)return;let i=cards.findIndex(c=>cardPath(c)===state.currentPath);if(i<0)i=0;i=(i+dir+cards.length)%cards.length;switchCpuPath(state,cards[i]);}
function remountAfterFullscreen(state){if(!state.player||document.fullscreenElement===state.player)return;if(state.currentCard&&state.currentCard!==state.mountCard)mountPlayer(state,state.currentCard);updateUi(state);}

function buildPlayer(state) {
    const p=document.createElement("div");p.className="ovg-cpu-player";p.innerHTML=`
        <canvas class="ovg-cpu-canvas"></canvas><button class="ovg-cpu-hit" type="button"></button><div class="ovg-cpu-badge">CPU</div><div class="ovg-cpu-paused">▶</div>
        <div class="ovg-cpu-native"><input class="ovg-cpu-seek" type="range" min="0" max="1" step="0.01"><div class="ovg-cpu-native-row"><button class="ovg-cpu-ui-play" type="button">▶</button><span class="ovg-cpu-time">0:00 / 0:00</span><span class="ovg-cpu-spacer"></span><span>🔊</span><input class="ovg-cpu-volume" type="range" min="0" max="1" step="0.05" title="${TEXT.volume}"><button class="ovg-cpu-ui-fullscreen" type="button" title="${TEXT.fullscreen}">⛶</button></div></div>
        <div class="ovg-cpu-fs-controls"><button class="ovg-cpu-prev" type="button" title="${TEXT.prev}">⏮</button><div style="position:relative"><button class="ovg-cpu-speed" type="button" title="${TEXT.speed}">⏱</button><div class="ovg-cpu-speed-panel"><input class="ovg-cpu-speed-range" type="range" min="0.25" max="3" step="0.05"><span class="ovg-cpu-speed-value"></span></div></div><button class="ovg-cpu-next" type="button" title="${TEXT.next}">⏭</button></div>`;
    state.player=p;state.canvas=p.querySelector(".ovg-cpu-canvas");state.hit=p.querySelector(".ovg-cpu-hit");state.uiPlay=p.querySelector(".ovg-cpu-ui-play");state.uiSeek=p.querySelector(".ovg-cpu-seek");state.uiTime=p.querySelector(".ovg-cpu-time");state.uiVolume=p.querySelector(".ovg-cpu-volume");state.uiFullscreen=p.querySelector(".ovg-cpu-ui-fullscreen");state.speedRange=p.querySelector(".ovg-cpu-speed-range");state.speedValue=p.querySelector(".ovg-cpu-speed-value");state.speedRange.value=String(state.rate);state.speedValue.textContent=`${state.rate.toFixed(state.rate%1?2:0)}×`;
    const stop=e=>e.stopPropagation();p.querySelectorAll(".ovg-cpu-native,.ovg-cpu-native *, .ovg-cpu-fs-controls,.ovg-cpu-fs-controls *").forEach(el=>{el.addEventListener("pointerdown",stop);el.addEventListener("dblclick",stop);});
    let clickTimer=0;state.hit.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();if(e.detail>=2){if(clickTimer)clearTimeout(clickTimer);clickTimer=0;if(document.fullscreenElement===p){pauseCpu(state);document.exitFullscreen?.();}else p.requestFullscreen?.().catch?.(()=>{});return;}if(clickTimer)clearTimeout(clickTimer);clickTimer=setTimeout(()=>{clickTimer=0;toggleCpuPlayback(state);},CLICK_DELAY);});state.hit.addEventListener("dblclick",e=>{e.preventDefault();e.stopPropagation();});
    state.uiPlay.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();toggleCpuPlayback(state);});
    state.uiSeek.addEventListener("pointerdown",()=>{state.seeking=true;});state.uiSeek.addEventListener("input",e=>{state.seeking=true;if(state.uiTime)state.uiTime.textContent=`${fmtTime(e.target.value)} / ${fmtTime(state.duration)}`;});state.uiSeek.addEventListener("change",e=>{const v=e.target.value;state.seeking=false;seekCpu(state,v);});state.uiSeek.addEventListener("pointerup",()=>{state.seeking=false;});
    state.uiVolume.value=String(state.volume);state.uiVolume.addEventListener("input",e=>setVolume(state,e.target.value));
    state.uiFullscreen.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();if(document.fullscreenElement===p)document.exitFullscreen?.();else p.requestFullscreen?.().catch?.(()=>{});});
    p.addEventListener("wheel",e=>{if(e.target.closest("input"))return;e.preventDefault();setVolume(state,state.volume+(e.deltaY<0?.05:-.05));},{passive:false});
    p.querySelector(".ovg-cpu-prev").addEventListener("click",e=>{e.preventDefault();e.stopPropagation();navigateCpu(state,-1);});p.querySelector(".ovg-cpu-next").addEventListener("click",e=>{e.preventDefault();e.stopPropagation();navigateCpu(state,1);});
    const speedBtn=p.querySelector(".ovg-cpu-speed"),speedPanel=p.querySelector(".ovg-cpu-speed-panel");speedBtn.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();speedPanel.classList.toggle("open");});state.speedRange.addEventListener("input",e=>{state.speedValue.textContent=`${Number(e.target.value).toFixed(2)}×`;});state.speedRange.addEventListener("change",e=>setRate(state,e.target.value));
    const tick=()=>{if(state.player===p&&p.isConnected){updateUi(state);state.uiRaf=requestAnimationFrame(tick);}};state.uiRaf=requestAnimationFrame(tick);updateUi(state);return p;
}

function stopCpu(state,{restore=true}={}) {
    if(!state)return;state.currentTime=currentTime(state);state.paused=true;closeSocket(state);stopAudio(state);if(state.uiRaf)cancelAnimationFrame(state.uiRaf);state.uiRaf=0;if(restore)restoreMountedCard(state);try{state.player?.remove();}catch(_){}state.player=state.canvas=state.hit=null;state.uiPlay=state.uiSeek=state.uiTime=state.uiVolume=state.uiFullscreen=null;state.mountCard=state.currentCard=null;state.currentPath="";state.clockStartedAt=0;
}
function startCpu(state,card,{fullscreen=false,toggleSame=false}={}) {
    const path=cardPath(card);if(!path)return;if(state.player&&state.currentPath===path){if(fullscreen)state.player.requestFullscreen?.().catch?.(()=>{});else if(toggleSame)toggleCpuPlayback(state);return;}
    stopCpu(state);state.rate=loadRate();state.volume=loadVolume();state.currentCard=card;state.currentPath=path;state.currentTime=0;state.duration=0;buildPlayer(state);if(!mountPlayer(state,card)){stopCpu(state);return;}openStream(state,0);if(fullscreen)state.player.requestFullscreen?.().catch?.(()=>{});
}
function forceGalleryRerender(modal){const sort=modal.querySelector(".ovg-sort");if(sort instanceof HTMLSelectElement)sort.dispatchEvent(new Event("change",{bubbles:true}));}
function setMode(state,on){state.cpuOn=!!on;state.modal.dataset.ovgCpuMode=state.cpuOn?"1":"0";saveMode(state.cpuOn);state.toggle?.classList.toggle("active",state.cpuOn);if(state.toggle)state.toggle.title=state.cpuOn?TEXT.disable:TEXT.enable;stopCpu(state);forceGalleryRerender(state.modal);}

function installModal(modal) {
    if(!(modal instanceof HTMLElement)||modal.dataset.ovgCpuPlaybackInstalled==="1")return;const titlebar=modal.querySelector(".ovg-titlebar"),close=modal.querySelector(".ovg-close"),grid=modal.querySelector(".ovg-grid");if(!(titlebar instanceof HTMLElement)||!(close instanceof HTMLElement)||!(grid instanceof HTMLElement))return;
    modal.dataset.ovgCpuPlaybackInstalled="1";const state={modal,grid,toggle:null,cpuOn:loadMode(),player:null,canvas:null,hit:null,ws:null,audio:null,currentCard:null,mountCard:null,currentPath:"",currentTime:0,duration:0,fps:30,rate:loadRate(),volume:loadVolume(),paused:true,clockBase:0,clockStartedAt:0,streamGeneration:0,speedRange:null,speedValue:null,lastContextPath:"",thumbClickTimer:0,observer:null,uiRaf:0,seeking:false,previewPause:false};states.add(state);
    const toggle=document.createElement("button");toggle.type="button";toggle.className="ovg-btn ovg-cpu-toggle";toggle.textContent=TEXT.cpu;toggle.setAttribute("aria-label",TEXT.enable);close.insertAdjacentElement("beforebegin",toggle);state.toggle=toggle;toggle.classList.toggle("active",state.cpuOn);toggle.title=state.cpuOn?TEXT.disable:TEXT.enable;toggle.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();setMode(state,!state.cpuOn);});
    modal.addEventListener("contextmenu",e=>{const card=e.target.closest?.(".ovg-card");if(card)state.lastContextPath=cardPath(card);},true);
    modal.addEventListener("click",e=>{if(!state.cpuOn)return;const play=e.target.closest?.(".ovg-play");if(play){const card=play.closest(".ovg-card");if(!card)return;e.preventDefault();e.stopImmediatePropagation();startCpu(state,card,{toggleSame:true});return;}const thumb=e.target.closest?.(".ovg-thumb");if(!thumb||e.target.closest?.("button,video,.ovg-cpu-player"))return;const card=thumb.closest(".ovg-card");if(!card)return;e.preventDefault();e.stopImmediatePropagation();if(e.detail>=2){if(state.thumbClickTimer)clearTimeout(state.thumbClickTimer);state.thumbClickTimer=0;startCpu(state,card,{fullscreen:true});return;}if(state.thumbClickTimer)clearTimeout(state.thumbClickTimer);state.thumbClickTimer=setTimeout(()=>{state.thumbClickTimer=0;if(state.cpuOn&&card.isConnected)startCpu(state,card,{toggleSame:true});},CLICK_DELAY);},true);
    modal.addEventListener("dblclick",e=>{if(!state.cpuOn)return;const thumb=e.target.closest?.(".ovg-thumb");if(!thumb||e.target.closest?.("button,video,.ovg-cpu-player"))return;e.preventDefault();e.stopImmediatePropagation();},true);
    state.observer=new MutationObserver(()=>{if(state.player&&!state.player.isConnected&&document.fullscreenElement!==state.player)stopCpu(state,{restore:false});});state.observer.observe(grid,{childList:true});const onFs=()=>remountAfterFullscreen(state);document.addEventListener("fullscreenchange",onFs);state.fullscreenHandler=onFs;
}
function uninstallState(state){if(!state)return;stopCpu(state,{restore:false});state.observer?.disconnect();if(state.thumbClickTimer)clearTimeout(state.thumbClickTimer);if(state.fullscreenHandler)document.removeEventListener("fullscreenchange",state.fullscreenHandler);states.delete(state);}
function scan(root=document){if(root instanceof HTMLElement&&root.classList.contains("ovg-modal"))installModal(root);root.querySelectorAll?.(".ovg-modal").forEach(installModal);}
function updateHelp(root){const overlay=root instanceof HTMLElement&&root.classList.contains("ovg-help-overlay")?root:root.querySelector?.(".ovg-help-overlay");if(!(overlay instanceof HTMLElement)||overlay.dataset.ovgCpuHelp==="1")return;const lists=overlay.querySelectorAll(".ovg-help-body ul"),list=lists.length?lists[lists.length-1]:null;if(!(list instanceof HTMLElement))return;overlay.dataset.ovgCpuHelp="1";const li=document.createElement("li");li.textContent=TEXT.help;list.appendChild(li);}
function activeCpuState(){for(const state of states)if(state.cpuOn&&state.modal?.isConnected)return state;return null;}

app.registerExtension({name:EXT_NAME,setup(){injectStyles();scan();updateHelp(document);document.addEventListener("click",e=>{const button=e.target.closest?.(".ovg-menu button[data-action='open']");if(!button)return;const state=activeCpuState();if(!state?.lastContextPath)return;const card=visibleCards(state).find(c=>cardPath(c)===state.lastContextPath);if(!card)return;e.preventDefault();e.stopImmediatePropagation();button.closest(".ovg-menu")?.remove();startCpu(state,card,{toggleSame:true});},true);const observer=new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes){if(!(node instanceof Element))continue;scan(node);updateHelp(node);}for(const node of record.removedNodes){if(!(node instanceof Element))continue;if(node.classList.contains("ovg-modal"))for(const state of [...states])if(state.modal===node)uninstallState(state);}}});observer.observe(document.body,{childList:true,subtree:false});}});
