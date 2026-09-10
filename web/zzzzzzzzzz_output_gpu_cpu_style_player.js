import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputGpuCpuStylePlayer";
const STYLE_ID = "cig-output-gpu-cpu-style-player";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const VOLUME_KEY = "ComfyUI-LoadImageGallery.outputVideoVolume";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const CLICK_DELAY = 260;

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

function clamp(value,min,max,fallback=min){const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;}
function loadRate(){try{return clamp(localStorage.getItem(RATE_KEY)||1,.25,3,1);}catch(_){return 1;}}
function saveRate(v){try{localStorage.setItem(RATE_KEY,String(clamp(v,.25,3,1)));}catch(_){}}
function loadVolume(){try{const v=localStorage.getItem(VOLUME_KEY);return v==null?1:clamp(v,0,1,1);}catch(_){return 1;}}
function saveVolume(v){try{localStorage.setItem(VOLUME_KEY,String(clamp(v,0,1,1)));}catch(_){}}
function fmtTime(value){let s=Math.max(0,Math.floor(Number(value)||0));const h=Math.floor(s/3600);s-=h*3600;const m=Math.floor(s/60);s%=60;return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;}
function fullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement||null;}
function playerOf(video){return video?.__cigGpuPlayer||video?.closest?.(".ovg-gpu-player")||null;}
function currentPath(video){return String(video?.dataset?.cigCurrentPath||video?.closest?.(".ovg-card")?.dataset?.path||"");}
function videoEndpoint(path){return `/image-gallery/output/video?path=${encodeURIComponent(path)}`;}
function thumbEndpoint(path){return `/image-gallery/output/thumb?path=${encodeURIComponent(path)}`;}

function ensureStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");style.id=STYLE_ID;style.textContent=`
.ovg-gpu-player{position:absolute;inset:0;z-index:9;background:#000;overflow:hidden;container-type:inline-size}
.ovg-gpu-player>video.ovg-inline-video[data-cig-gpu-cpu-style="1"]{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;object-fit:contain!important;background:#000!important;border:0!important;border-radius:0!important;pointer-events:none!important}
.ovg-gpu-hit{position:absolute;inset:0;z-index:2;width:100%;height:100%;padding:0;margin:0;border:0;background:transparent;cursor:pointer}
.ovg-gpu-badge{position:absolute;left:8px;top:7px;z-index:4;padding:3px 6px;border-radius:5px;background:rgba(0,0,0,.62);color:#d6e8ff;font:700 10px/1.2 Arial,sans-serif;pointer-events:none;letter-spacing:.3px}
.ovg-gpu-paused{position:absolute;left:50%;top:50%;z-index:4;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.58);color:#fff;font-size:23px;pointer-events:none}.ovg-gpu-player.paused .ovg-gpu-paused{display:flex}
.ovg-gpu-native{position:absolute;left:0;right:0;bottom:0;z-index:12;padding:18px 8px 5px;box-sizing:border-box;background:linear-gradient(to top,rgba(0,0,0,.88) 0%,rgba(0,0,0,.55) 58%,transparent 100%);opacity:0;transform:translateY(2px);transition:opacity .13s ease,transform .13s ease;pointer-events:none;color:#fff;font:12px Arial,sans-serif}
.ovg-gpu-player:hover .ovg-gpu-native,.ovg-gpu-player.paused .ovg-gpu-native,.ovg-gpu-player:fullscreen .ovg-gpu-native,.ovg-gpu-player:-webkit-full-screen .ovg-gpu-native{opacity:1;transform:none;pointer-events:auto}
.ovg-gpu-seek{display:block!important;width:100%!important;height:12px!important;margin:0 0 2px!important;writing-mode:horizontal-tb!important;direction:ltr!important;accent-color:#fff!important;cursor:pointer!important}
.ovg-gpu-native-row{display:flex;align-items:center;gap:6px;height:30px;min-width:0}
.ovg-gpu-native button{width:30px;height:30px;min-width:30px;padding:0;border:0;border-radius:4px;background:transparent;color:#fff;font:16px/30px "Segoe UI Symbol",Arial,sans-serif;cursor:pointer}.ovg-gpu-native button:hover{background:rgba(255,255,255,.15)}
.ovg-gpu-time{white-space:nowrap;opacity:.92;font-variant-numeric:tabular-nums}.ovg-gpu-spacer{flex:1 1 auto;min-width:2px}
.ovg-gpu-volume{width:78px!important;max-width:90px!important;min-width:46px!important;height:auto!important;margin:0!important;writing-mode:horizontal-tb!important;direction:ltr!important;accent-color:#fff!important;cursor:pointer!important}
.ovg-gpu-fs-controls{display:none;position:absolute;right:28px;top:50%;z-index:14;transform:translateY(-50%);flex-direction:column;gap:8px;align-items:center}
.ovg-gpu-fs-controls button{width:44px;height:44px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(20,20,20,.72);color:#fff;font:18px/42px Arial,sans-serif;padding:0;cursor:pointer;backdrop-filter:blur(5px)}.ovg-gpu-fs-controls button:hover{background:rgba(45,45,45,.86)}
.ovg-gpu-speed-panel2{display:none;position:absolute;right:54px;top:50%;transform:translateY(-50%);padding:10px 12px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(20,20,20,.86);white-space:nowrap;color:#fff;font:12px Arial,sans-serif;align-items:center;gap:8px}.ovg-gpu-speed-panel2.open{display:flex!important}
.ovg-gpu-speed-range{width:150px!important;height:auto!important;margin:0!important;writing-mode:horizontal-tb!important;direction:ltr!important;accent-color:#79adff!important;cursor:pointer!important}.ovg-gpu-speed-value2{min-width:48px;text-align:center;font-variant-numeric:tabular-nums}
.ovg-gpu-player:fullscreen,.ovg-gpu-player:-webkit-full-screen{width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:#000!important;overflow:hidden!important}
.ovg-gpu-player:fullscreen>video.ovg-inline-video[data-cig-gpu-cpu-style="1"],.ovg-gpu-player:-webkit-full-screen>video.ovg-inline-video[data-cig-gpu-cpu-style="1"]{width:100vw!important;height:100vh!important;object-fit:contain!important}
.ovg-gpu-player:fullscreen .ovg-gpu-fs-controls,.ovg-gpu-player:-webkit-full-screen .ovg-gpu-fs-controls{display:flex!important}
.ovg-gpu-player:fullscreen .ovg-gpu-native,.ovg-gpu-player:-webkit-full-screen .ovg-gpu-native{padding:24px 14px 9px}.ovg-gpu-player:fullscreen .ovg-gpu-volume,.ovg-gpu-player:-webkit-full-screen .ovg-gpu-volume{width:100px!important;max-width:120px!important}
body:has(.ovg-gpu-player)>.ovg-speed-control[popover]{display:none!important}
@container (max-width:360px){.ovg-gpu-time,.ovg-gpu-volume{display:none!important}.ovg-gpu-native-row{gap:2px}.ovg-gpu-native{padding-left:5px;padding-right:5px}}
`;
    document.head.appendChild(style);
}

function galleryPaths(video){const grid=video.closest?.(".ovg-card")?.closest?.(".ovg-grid");if(!grid)return[];return[...grid.querySelectorAll(".ovg-card[data-path]")].map(el=>String(el.dataset.path||"")).filter(Boolean);}
async function navigate(video,dir){const paths=galleryPaths(video);if(paths.length<2)return;let i=paths.indexOf(currentPath(video));if(i<0)i=0;i=(i+dir+paths.length)%paths.length;const path=paths[i];if(!path)return;video.dataset.cigCurrentPath=path;video.poster=thumbEndpoint(path);video.src=videoEndpoint(path);video.load();video.defaultPlaybackRate=loadRate();video.playbackRate=loadRate();video.volume=loadVolume();try{await video.play();}catch(_){}updateUi(video);}

function updateUi(video){const ui=video?.__cigGpuUi,p=playerOf(video);if(!ui||!p)return;p.classList.toggle("paused",!!video.paused);ui.hit.title=video.paused?TEXT.play:TEXT.pause;ui.play.textContent=video.paused?"▶":"❚❚";ui.play.title=video.paused?TEXT.play:TEXT.pause;if(!ui.seeking){ui.seek.max=String(Math.max(.001,Number(video.duration)||0));ui.seek.value=String(Math.min(Number(video.currentTime)||0,Number(video.duration)||Number.MAX_SAFE_INTEGER));}ui.time.textContent=`${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;ui.volume.value=String(video.volume);const fs=fullscreenElement()===p;ui.fullscreen.textContent=fs?"⤢":"⛶";ui.fullscreen.title=fs?TEXT.exitFullscreen:TEXT.fullscreen;const rate=clamp(video.playbackRate,.25,3,1);ui.speedRange.value=String(rate);ui.speedValue.textContent=`${rate.toFixed(rate%1?2:0)}×`;}

function enterFullscreen(video){const p=playerOf(video);if(!(p instanceof HTMLElement)||fullscreenElement()===p)return;try{const r=p.requestFullscreen?.()||p.webkitRequestFullscreen?.();r?.catch?.(()=>{});}catch(_){}}
function exitFullscreen(video,{pause=false}={}){const p=playerOf(video);if(pause){try{video.pause();}catch(_){}}if(fullscreenElement()!==p)return;try{const r=document.exitFullscreen?.()||document.webkitExitFullscreen?.();r?.catch?.(()=>{});}catch(_){}}

function buildPlayer(video){
    const holder=video.closest(".ovg-thumb");if(!(holder instanceof HTMLElement)||!video.parentNode)return null;
    const p=document.createElement("div");p.className="ovg-gpu-player";p.dataset.cigGpuCpuPlayer="1";
    holder.insertBefore(p,video);p.appendChild(video);video.__cigGpuPlayer=p;
    p.insertAdjacentHTML("beforeend",`<button class="ovg-gpu-hit" type="button"></button><div class="ovg-gpu-badge">GPU</div><div class="ovg-gpu-paused">▶</div><div class="ovg-gpu-native"><input class="ovg-gpu-seek" type="range" min="0" max="1" step="0.01"><div class="ovg-gpu-native-row"><button class="ovg-gpu-ui-play" type="button">▶</button><span class="ovg-gpu-time">0:00 / 0:00</span><span class="ovg-gpu-spacer"></span><span>🔊</span><input class="ovg-gpu-volume" type="range" min="0" max="1" step="0.05" title="${TEXT.volume}"><button class="ovg-gpu-ui-fullscreen" type="button" title="${TEXT.fullscreen}">⛶</button></div></div><div class="ovg-gpu-fs-controls"><button class="ovg-gpu-prev" type="button" title="${TEXT.prev}">⏮</button><div style="position:relative"><button class="ovg-gpu-speed" type="button" title="${TEXT.speed}">⏱</button><div class="ovg-gpu-speed-panel2"><input class="ovg-gpu-speed-range" type="range" min="0.25" max="3" step="0.05"><span class="ovg-gpu-speed-value2"></span></div></div><button class="ovg-gpu-next" type="button" title="${TEXT.next}">⏭</button></div>`);
    const ui={hit:p.querySelector(".ovg-gpu-hit"),play:p.querySelector(".ovg-gpu-ui-play"),seek:p.querySelector(".ovg-gpu-seek"),time:p.querySelector(".ovg-gpu-time"),volume:p.querySelector(".ovg-gpu-volume"),fullscreen:p.querySelector(".ovg-gpu-ui-fullscreen"),prev:p.querySelector(".ovg-gpu-prev"),next:p.querySelector(".ovg-gpu-next"),speed:p.querySelector(".ovg-gpu-speed"),speedPanel:p.querySelector(".ovg-gpu-speed-panel2"),speedRange:p.querySelector(".ovg-gpu-speed-range"),speedValue:p.querySelector(".ovg-gpu-speed-value2"),seeking:false};
    video.__cigGpuUi=ui;
    const stop=e=>e.stopPropagation();p.querySelectorAll(".ovg-gpu-native,.ovg-gpu-native *,.ovg-gpu-fs-controls,.ovg-gpu-fs-controls *").forEach(el=>{el.addEventListener("pointerdown",stop);el.addEventListener("dblclick",stop);});
    let clickTimer=0;
    ui.hit.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();if(e.detail>=2){if(clickTimer)clearTimeout(clickTimer);clickTimer=0;if(fullscreenElement()===p){try{video.pause();}catch(_){}exitFullscreen(video);}else enterFullscreen(video);return;}if(clickTimer)clearTimeout(clickTimer);clickTimer=setTimeout(()=>{clickTimer=0;video.paused?video.play().catch(()=>{}):video.pause();},CLICK_DELAY);});
    ui.hit.addEventListener("dblclick",e=>{e.preventDefault();e.stopPropagation();});
    ui.play.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();video.paused?video.play().catch(()=>{}):video.pause();});
    ui.seek.addEventListener("pointerdown",()=>{ui.seeking=true;});ui.seek.addEventListener("input",()=>{ui.seeking=true;ui.time.textContent=`${fmtTime(ui.seek.value)} / ${fmtTime(video.duration)}`;});ui.seek.addEventListener("change",()=>{try{video.currentTime=clamp(ui.seek.value,0,Math.max(0,video.duration||ui.seek.value),0);}catch(_){}ui.seeking=false;updateUi(video);});ui.seek.addEventListener("pointerup",()=>{ui.seeking=false;});
    ui.volume.addEventListener("input",()=>{video.volume=clamp(ui.volume.value,0,1,1);if(video.volume>0&&video.muted)video.muted=false;saveVolume(video.volume);});
    ui.fullscreen.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();fullscreenElement()===p?exitFullscreen(video):enterFullscreen(video);});
    ui.prev.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();navigate(video,-1);});ui.next.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();navigate(video,1);});
    ui.speed.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();ui.speedPanel.classList.toggle("open");});ui.speedRange.addEventListener("input",()=>{const r=clamp(ui.speedRange.value,.25,3,1);video.defaultPlaybackRate=r;video.playbackRate=r;saveRate(r);ui.speedValue.textContent=`${r.toFixed(r%1?2:0)}×`;});
    p.addEventListener("wheel",e=>{if(e.target instanceof Element&&e.target.closest("input"))return;e.preventDefault();e.stopPropagation();video.volume=clamp(video.volume+(e.deltaY<0?.05:-.05),0,1,1);if(video.volume>0&&video.muted)video.muted=false;saveVolume(video.volume);updateUi(video);},{passive:false});
    return p;
}

function attachVideo(video){
    if(!(video instanceof HTMLVideoElement)||attached.has(video))return;attached.add(video);video.dataset.cigGpuCpuStyle="1";video.controls=false;video.removeAttribute("controls");video.loop=true;video.setAttribute("loop","");video.defaultPlaybackRate=loadRate();video.playbackRate=loadRate();video.volume=loadVolume();
    const p=buildPlayer(video);if(!p)return;
    const attrObserver=new MutationObserver(()=>{if(video.hasAttribute("controls")){video.controls=false;video.removeAttribute("controls");}});attrObserver.observe(video,{attributes:true,attributeFilter:["controls"]});video.__cigGpuControlsObserver=attrObserver;
    const apply=()=>{video.controls=false;video.removeAttribute("controls");video.defaultPlaybackRate=loadRate();if(!Number.isFinite(video.playbackRate)||video.playbackRate<=0)video.playbackRate=loadRate();updateUi(video);};
    for(const type of ["loadedmetadata","durationchange","timeupdate","play","pause","ratechange","volumechange"]){video.addEventListener(type,()=>{if(type==="ratechange")saveRate(video.playbackRate);if(type==="volumechange")saveVolume(video.volume);updateUi(video);});}
    video.addEventListener("loadedmetadata",apply);apply();
}

function cleanupVideo(video){if(!(video instanceof HTMLVideoElement))return;video.__cigGpuControlsObserver?.disconnect?.();delete video.__cigGpuControlsObserver;const p=playerOf(video);if(fullscreenElement()===p){try{document.exitFullscreen?.();}catch(_){}}delete video.__cigGpuUi;delete video.__cigGpuPlayer;delete video.dataset.cigGpuCpuStyle;attached.delete(video);try{p?.remove();}catch(_){}}
function scan(root){if(!(root instanceof Element))return;if(root instanceof HTMLVideoElement&&root.classList.contains("ovg-inline-video"))attachVideo(root);root.querySelectorAll?.("video.ovg-inline-video").forEach(attachVideo);}
function cleanupRemoved(root){if(!(root instanceof Element)||root.isConnected)return;if(root instanceof HTMLVideoElement&&root.classList.contains("ovg-inline-video"))cleanupVideo(root);root.querySelectorAll?.("video.ovg-inline-video").forEach(cleanupVideo);}
function installModal(modal){if(!(modal instanceof HTMLElement)||modalObservers.has(modal))return;scan(modal);const observer=new MutationObserver(records=>{for(const r of records){for(const n of r.addedNodes)if(n instanceof Element)scan(n);for(const n of r.removedNodes)if(n instanceof Element)cleanupRemoved(n);}});observer.observe(modal,{childList:true,subtree:true});modalObservers.set(modal,observer);}
function uninstallModal(modal){cleanupRemoved(modal);modalObservers.get(modal)?.disconnect();modalObservers.delete(modal);}

app.registerExtension({name:EXT_NAME,setup(){ensureStyles();document.querySelectorAll(".ovg-modal").forEach(installModal);const observer=new MutationObserver(records=>{for(const r of records){for(const n of r.addedNodes){if(n instanceof HTMLElement&&n.classList.contains("ovg-modal"))installModal(n);}for(const n of r.removedNodes){if(n instanceof HTMLElement&&n.classList.contains("ovg-modal"))uninstallModal(n);}}});observer.observe(document.body,{childList:true,subtree:false});const fs=()=>{for(const video of attached)if(video.isConnected)updateUi(video);};document.addEventListener("fullscreenchange",fs,true);document.addEventListener("webkitfullscreenchange",fs,true);}});
