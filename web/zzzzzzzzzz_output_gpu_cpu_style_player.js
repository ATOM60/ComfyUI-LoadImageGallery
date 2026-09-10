import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputGpuCpuStylePlayer";
const STYLE_ID = "cig-output-gpu-cpu-style-player";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const VOLUME_KEY = "ComfyUI-LoadImageGallery.outputVideoVolume";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const DOUBLE_CLICK_WINDOW_MS = 360;

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
const taps = new WeakMap();
let fullscreenOwner = null;
let changingFullscreen = false;

function clamp(value, min, max, fallback = min) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function loadRate() { try { return clamp(localStorage.getItem(RATE_KEY) || 1, .25, 3, 1); } catch (_) { return 1; } }
function saveRate(v) { try { localStorage.setItem(RATE_KEY, String(clamp(v,.25,3,1))); } catch (_) {} }
function loadVolume() { try { const v=localStorage.getItem(VOLUME_KEY); return v==null?1:clamp(v,0,1,1); } catch (_) { return 1; } }
function saveVolume(v) { try { localStorage.setItem(VOLUME_KEY, String(clamp(v,0,1,1))); } catch (_) {} }
function fmtTime(value) {
    let s=Math.max(0,Math.floor(Number(value)||0)); const h=Math.floor(s/3600); s-=h*3600; const m=Math.floor(s/60); s%=60;
    return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;
}
function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
function holderOf(video) { return video?.closest?.(".ovg-thumb") || null; }
function currentPath(video) { return String(video?.dataset?.cigCurrentPath || video?.closest?.(".ovg-card")?.dataset?.path || ""); }
function videoEndpoint(path) { return `/image-gallery/output/video?path=${encodeURIComponent(path)}`; }
function thumbEndpoint(path) { return `/image-gallery/output/thumb?path=${encodeURIComponent(path)}`; }

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    style.textContent=`
/* The GPU player deliberately uses the same custom chrome as the stable CPU player. */
.ovg-thumb:has(> video.ovg-inline-video[data-cig-gpu-cpu-style="1"]){container-type:inline-size}
.ovg-thumb > video.ovg-inline-video[data-cig-gpu-cpu-style="1"]{
    position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;
    object-fit:contain!important;background:#000!important;border:0!important;border-radius:0!important
}
.ovg-gpu-paused{position:absolute;left:50%;top:50%;z-index:14;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.58);color:#fff;font-size:23px;pointer-events:none}
.ovg-thumb[data-cig-gpu-paused="1"] .ovg-gpu-paused{display:flex}
.ovg-gpu-badge{position:absolute;left:8px;top:7px;z-index:14;padding:3px 6px;border-radius:5px;background:rgba(0,0,0,.62);color:#d6e8ff;font:700 10px/1.2 Arial,sans-serif;pointer-events:none;letter-spacing:.3px}
.ovg-gpu-native{position:absolute;left:0;right:0;bottom:0;z-index:16;padding:18px 8px 5px;box-sizing:border-box;background:linear-gradient(to top,rgba(0,0,0,.88) 0%,rgba(0,0,0,.55) 58%,transparent 100%);opacity:0;transform:translateY(2px);transition:opacity .13s ease,transform .13s ease;pointer-events:none;color:#fff;font:12px Arial,sans-serif}
.ovg-thumb:hover > .ovg-gpu-native,.ovg-thumb[data-cig-gpu-paused="1"] > .ovg-gpu-native,.ovg-thumb:fullscreen > .ovg-gpu-native,.ovg-thumb:-webkit-full-screen > .ovg-gpu-native{opacity:1;transform:none;pointer-events:auto}
.ovg-gpu-seek{display:block!important;width:100%!important;height:12px!important;margin:0 0 2px!important;writing-mode:horizontal-tb!important;direction:ltr!important;accent-color:#fff!important;cursor:pointer!important}
.ovg-gpu-native-row{display:flex;align-items:center;gap:6px;height:30px;min-width:0}
.ovg-gpu-native button{width:30px;height:30px;min-width:30px;padding:0;border:0;border-radius:4px;background:transparent;color:#fff;font:16px/30px "Segoe UI Symbol",Arial,sans-serif;cursor:pointer}.ovg-gpu-native button:hover{background:rgba(255,255,255,.15)}
.ovg-gpu-time{white-space:nowrap;opacity:.92;font-variant-numeric:tabular-nums}.ovg-gpu-spacer{flex:1 1 auto;min-width:2px}
.ovg-gpu-volume{width:78px!important;max-width:90px!important;min-width:46px!important;height:auto!important;margin:0!important;writing-mode:horizontal-tb!important;direction:ltr!important;accent-color:#fff!important;cursor:pointer!important}
.ovg-gpu-fs-controls{display:none;position:absolute;right:28px;top:50%;z-index:18;transform:translateY(-50%);flex-direction:column;gap:8px;align-items:center}
.ovg-gpu-fs-controls button{width:44px;height:44px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(20,20,20,.72);color:#fff;font:18px/42px Arial,sans-serif;padding:0;cursor:pointer;backdrop-filter:blur(5px)}.ovg-gpu-fs-controls button:hover{background:rgba(45,45,45,.86)}
.ovg-gpu-speed-panel{display:none;position:absolute;right:54px;top:50%;transform:translateY(-50%);padding:10px 12px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(20,20,20,.86);white-space:nowrap;color:#fff;font:12px Arial,sans-serif;align-items:center;gap:8px}
.ovg-gpu-speed-panel.open{display:flex!important}
.ovg-gpu-speed-panel .ovg-speed-slider{width:150px!important;height:auto!important;margin:0!important;writing-mode:horizontal-tb!important;direction:ltr!important;accent-color:#79adff!important;cursor:pointer!important}
.ovg-gpu-speed-value{min-width:48px;text-align:center;font-variant-numeric:tabular-nums}
.ovg-thumb:fullscreen,.ovg-thumb:-webkit-full-screen{width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;aspect-ratio:auto!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:#000!important;overflow:hidden!important}
.ovg-thumb:fullscreen > video.ovg-inline-video[data-cig-gpu-cpu-style="1"],.ovg-thumb:-webkit-full-screen > video.ovg-inline-video[data-cig-gpu-cpu-style="1"]{width:100vw!important;height:100vh!important;object-fit:contain!important}
.ovg-thumb:fullscreen > .ovg-gpu-fs-controls,.ovg-thumb:-webkit-full-screen > .ovg-gpu-fs-controls{display:flex!important}
.ovg-thumb:fullscreen > .ovg-gpu-native,.ovg-thumb:-webkit-full-screen > .ovg-gpu-native{padding:24px 14px 9px}
.ovg-thumb:fullscreen .ovg-gpu-volume,.ovg-thumb:-webkit-full-screen .ovg-gpu-volume{width:100px!important;max-width:120px!important}
/* Direct-gesture pseudo fullscreen is only a bridge into the same real fullscreen. */
.ovg-thumb.cig-pseudo-fullscreen:fullscreen,.ovg-thumb.cig-pseudo-fullscreen:-webkit-full-screen{top:0!important;left:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;--cig-pseudo-top:0px!important}
/* Hide the previous GPU popover controls; this player owns all visible controls. */
.ovg-speed-control[popover]{display:none!important}
@container (max-width:360px){.ovg-gpu-time,.ovg-gpu-volume{display:none!important}.ovg-gpu-native-row{gap:2px}.ovg-gpu-native{padding-left:5px;padding-right:5px}}
`;
    document.head.appendChild(style);
}

function updateUi(video) {
    const ui=video?.__cigGpuCpuUi;
    if (!ui) return;
    const holder=holderOf(video);
    holder?.setAttribute("data-cig-gpu-paused",video.paused?"1":"0");
    ui.play.textContent=video.paused?"▶":"❚❚";
    ui.play.title=video.paused?TEXT.play:TEXT.pause;
    if (!ui.seeking) {
        ui.seek.max=String(Math.max(.001,Number(video.duration)||0));
        ui.seek.value=String(Math.min(Number(video.currentTime)||0,Number(video.duration)||Number.MAX_SAFE_INTEGER));
    }
    ui.time.textContent=`${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
    ui.volume.value=String(video.volume);
    const fs=fullscreenElement()===holder;
    ui.fullscreen.textContent=fs?"⤢":"⛶";
    ui.fullscreen.title=fs?TEXT.exitFullscreen:TEXT.fullscreen;
    const rate=clamp(video.playbackRate,.25,3,1);
    ui.speedRange.value=String(rate);
    ui.speedValue.textContent=`${rate.toFixed(rate%1?2:0)}×`;
}

function galleryPaths(video) {
    const grid=video.closest?.(".ovg-card")?.closest?.(".ovg-grid");
    if (!grid) return [];
    return [...grid.querySelectorAll(".ovg-card[data-path]")].map(el=>String(el.dataset.path||"")).filter(Boolean);
}
async function navigate(video,dir) {
    const paths=galleryPaths(video); if(paths.length<2)return;
    let i=paths.indexOf(currentPath(video)); if(i<0)i=0; i=(i+dir+paths.length)%paths.length;
    const path=paths[i]; if(!path)return;
    video.dataset.cigCurrentPath=path;
    video.poster=thumbEndpoint(path);
    video.src=videoEndpoint(path);
    video.load();
    video.defaultPlaybackRate=loadRate(); video.playbackRate=loadRate(); video.volume=loadVolume();
    try { await video.play(); } catch (_) {}
    updateUi(video);
}

function requestHolderFullscreen(video,{fromPseudo=false}={}) {
    const holder=holderOf(video); if(!(holder instanceof HTMLElement))return;
    if(fromPseudo) holder.dataset.cigGpuFsFromPseudo="1";
    holder.style.setProperty("--cig-pseudo-top","0px");
    if(fullscreenElement()===holder)return;
    changingFullscreen=true;
    try {
        const result=holder.requestFullscreen?.() || holder.webkitRequestFullscreen?.();
        Promise.resolve(result).catch(()=>{}).finally(()=>{changingFullscreen=false;updateUi(video);});
    } catch (_) { changingFullscreen=false; }
}
function exitHolderFullscreen(video) {
    const holder=holderOf(video); if(fullscreenElement()!==holder)return;
    changingFullscreen=true;
    try {
        const result=document.exitFullscreen?.() || document.webkitExitFullscreen?.();
        Promise.resolve(result).catch(()=>{}).finally(()=>{changingFullscreen=false;updateUi(video);});
    } catch (_) { changingFullscreen=false; }
}

function syncPseudoBridge(video) {
    const holder=holderOf(video); if(!(holder instanceof HTMLElement))return;
    const pseudo=holder.classList.contains("cig-pseudo-fullscreen") || video.dataset.cigPseudoFullscreen==="1";
    if(pseudo) {
        holder.dataset.cigGpuFsFromPseudo="1";
        holder.style.setProperty("--cig-pseudo-top","0px");
        if(fullscreenElement()!==holder && !changingFullscreen) requestHolderFullscreen(video,{fromPseudo:true});
        return;
    }
    if(holder.dataset.cigGpuFsFromPseudo==="1") {
        delete holder.dataset.cigGpuFsFromPseudo;
        if(fullscreenElement()===holder && !changingFullscreen) exitHolderFullscreen(video);
    }
}

function cleanupPseudoState(holder,video) {
    if(!(holder instanceof HTMLElement))return;
    holder.classList.remove("cig-pseudo-fullscreen");
    holder.style.removeProperty("--cig-pseudo-top");
    delete holder.dataset.cigGpuFsFromPseudo;
    delete holder.dataset.cigGpuPendingPseudo;
    if(video) delete video.dataset.cigPseudoFullscreen;
    if(!document.querySelector(".ovg-thumb.cig-pseudo-fullscreen")) document.body.classList.remove("cig-output-pseudo-fullscreen-open");
}

function buildUi(video) {
    const holder=holderOf(video); if(!(holder instanceof HTMLElement))return null;
    holder.querySelector(":scope > .ovg-gpu-native")?.remove();
    holder.querySelector(":scope > .ovg-gpu-fs-controls")?.remove();
    holder.querySelector(":scope > .ovg-gpu-badge")?.remove();
    holder.querySelector(":scope > .ovg-gpu-paused")?.remove();

    const badge=document.createElement("div"); badge.className="ovg-gpu-badge"; badge.textContent="GPU";
    const paused=document.createElement("div"); paused.className="ovg-gpu-paused"; paused.textContent="▶";
    const native=document.createElement("div"); native.className="ovg-gpu-native ovg-speed-control";
    native.innerHTML=`<input class="ovg-gpu-seek ovg-speed-slider" type="range" min="0" max="1" step="0.01"><div class="ovg-gpu-native-row"><button class="ovg-gpu-ui-play" type="button">▶</button><span class="ovg-gpu-time">0:00 / 0:00</span><span class="ovg-gpu-spacer"></span><span>🔊</span><input class="ovg-gpu-volume ovg-speed-slider" type="range" min="0" max="1" step="0.05" title="${TEXT.volume}"><button class="ovg-gpu-ui-fullscreen" type="button" title="${TEXT.fullscreen}">⛶</button></div>`;
    const side=document.createElement("div"); side.className="ovg-gpu-fs-controls ovg-speed-control";
    side.innerHTML=`<button class="ovg-gpu-prev" type="button" title="${TEXT.prev}">⏮</button><div style="position:relative"><button class="ovg-gpu-speed" type="button" title="${TEXT.speed}">⏱</button><div class="ovg-gpu-speed-panel ovg-speed-panel"><input class="ovg-gpu-speed-range ovg-speed-slider" type="range" min="0.25" max="3" step="0.05"><span class="ovg-gpu-speed-value"></span></div></div><button class="ovg-gpu-next" type="button" title="${TEXT.next}">⏭</button>`;
    holder.append(badge,paused,native,side);

    const ui={
        badge,paused,native,side,
        play:native.querySelector(".ovg-gpu-ui-play"), seek:native.querySelector(".ovg-gpu-seek"), time:native.querySelector(".ovg-gpu-time"), volume:native.querySelector(".ovg-gpu-volume"), fullscreen:native.querySelector(".ovg-gpu-ui-fullscreen"),
        prev:side.querySelector(".ovg-gpu-prev"), next:side.querySelector(".ovg-gpu-next"), speed:side.querySelector(".ovg-gpu-speed"), speedPanel:side.querySelector(".ovg-gpu-speed-panel"), speedRange:side.querySelector(".ovg-gpu-speed-range"), speedValue:side.querySelector(".ovg-gpu-speed-value"), seeking:false,
    };
    video.__cigGpuCpuUi=ui;

    ui.play.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();video.paused?video.play().catch(()=>{}):video.pause();});
    ui.seek.addEventListener("pointerdown",()=>{ui.seeking=true;});
    ui.seek.addEventListener("input",()=>{ui.seeking=true;ui.time.textContent=`${fmtTime(ui.seek.value)} / ${fmtTime(video.duration)}`;});
    ui.seek.addEventListener("change",()=>{try{video.currentTime=clamp(ui.seek.value,0,Math.max(0,video.duration||ui.seek.value),0);}catch(_){}ui.seeking=false;updateUi(video);});
    ui.seek.addEventListener("pointerup",()=>{ui.seeking=false;});
    ui.volume.addEventListener("input",()=>{video.volume=clamp(ui.volume.value,0,1,1);if(video.volume>0&&video.muted)video.muted=false;saveVolume(video.volume);});
    ui.fullscreen.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();const holder=holderOf(video);if(fullscreenElement()===holder)exitHolderFullscreen(video);else requestHolderFullscreen(video);});
    ui.prev.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();navigate(video,-1);});
    ui.next.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();navigate(video,1);});
    ui.speed.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();ui.speedPanel.classList.toggle("open");});
    ui.speedRange.addEventListener("input",()=>{const r=clamp(ui.speedRange.value,.25,3,1);video.defaultPlaybackRate=r;video.playbackRate=r;saveRate(r);ui.speedValue.textContent=`${r.toFixed(r%1?2:0)}×`;});

    return ui;
}

function attachVideo(video) {
    if(!(video instanceof HTMLVideoElement)||attached.has(video))return;
    attached.add(video);
    video.dataset.cigGpuCpuStyle="1";
    video.controls=false;
    video.removeAttribute("controls");
    video.loop=true; video.setAttribute("loop","");
    video.defaultPlaybackRate=loadRate(); video.playbackRate=loadRate(); video.volume=loadVolume();
    const holder=holderOf(video);
    const ui=buildUi(video);
    if(!ui)return;

    const apply=()=>{video.controls=false;video.removeAttribute("controls");video.defaultPlaybackRate=loadRate();if(!Number.isFinite(video.playbackRate)||video.playbackRate<=0)video.playbackRate=loadRate();updateUi(video);};
    for(const type of ["loadedmetadata","durationchange","timeupdate","play","pause","ratechange","volumechange"]) video.addEventListener(type,()=>{if(type==="ratechange")saveRate(video.playbackRate);if(type==="volumechange")saveVolume(video.volume);updateUi(video);});
    video.addEventListener("loadedmetadata",apply);

    if(holder instanceof HTMLElement) {
        const observer=new MutationObserver(()=>syncPseudoBridge(video));
        observer.observe(holder,{attributes:true,attributeFilter:["class"]});
        video.__cigGpuPseudoObserver=observer;
    }
    apply();
}

function cleanupVideo(video) {
    if(!(video instanceof HTMLVideoElement))return;
    video.__cigGpuPseudoObserver?.disconnect?.();
    delete video.__cigGpuPseudoObserver;
    const ui=video.__cigGpuCpuUi;
    if(ui){ui.badge?.remove();ui.paused?.remove();ui.native?.remove();ui.side?.remove();}
    delete video.__cigGpuCpuUi;
    delete video.dataset.cigGpuCpuStyle;
    attached.delete(video);
    taps.delete(video);
}

function scan(root) {
    if(!(root instanceof Element))return;
    if(root instanceof HTMLVideoElement&&root.classList.contains("ovg-inline-video"))attachVideo(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(attachVideo);
}
function cleanupRemoved(root) {
    if(!(root instanceof Element))return;
    if(root instanceof HTMLVideoElement&&root.classList.contains("ovg-inline-video"))cleanupVideo(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(cleanupVideo);
}
function installModal(modal) {
    if(!(modal instanceof HTMLElement)||modalObservers.has(modal))return;
    scan(modal);
    const observer=new MutationObserver(records=>{for(const r of records){for(const n of r.addedNodes)if(n instanceof Element)scan(n);for(const n of r.removedNodes)if(n instanceof Element)cleanupRemoved(n);}});
    observer.observe(modal,{childList:true,subtree:true}); modalObservers.set(modal,observer);
}
function uninstallModal(modal) { cleanupRemoved(modal); modalObservers.get(modal)?.disconnect(); modalObservers.delete(modal); }

/* Request real fullscreen on the second pointer-up while user activation is still live.
   The existing direct-gesture module then adds its pseudo marker, but both paths now
   converge on exactly the same fullscreen element. */
function onPointerUpCapture(event) {
    const video=event.target instanceof HTMLVideoElement&&event.target.dataset.cigGpuCpuStyle==="1"?event.target:null;
    if(!video||event.button!==0)return;
    const now=performance.now(),prev=taps.get(video);
    taps.set(video,now);
    if(prev&&now-prev<=DOUBLE_CLICK_WINDOW_MS) {
        const holder=holderOf(video);
        if(holder instanceof HTMLElement&&fullscreenElement()!==holder) {
            holder.dataset.cigGpuPendingPseudo="1";
            requestHolderFullscreen(video,{fromPseudo:true});
        }
        taps.delete(video);
    }
}

function onFullscreenChange() {
    const fs=fullscreenElement();
    if(fs instanceof HTMLElement&&fs.classList.contains("ovg-thumb")) {
        fullscreenOwner=fs;
        const video=fs.querySelector("video.ovg-inline-video[data-cig-gpu-cpu-style=\"1\"]");
        if(video){fs.style.setProperty("--cig-pseudo-top","0px");updateUi(video);}
        return;
    }
    if(fullscreenOwner instanceof HTMLElement) {
        const holder=fullscreenOwner;
        const video=holder.querySelector("video.ovg-inline-video[data-cig-gpu-cpu-style=\"1\"]");
        cleanupPseudoState(holder,video);
        if(video)updateUi(video);
    }
    fullscreenOwner=null;
}

app.registerExtension({
    name:EXT_NAME,
    setup() {
        ensureStyles();
        document.querySelectorAll(".ovg-modal").forEach(installModal);
        const observer=new MutationObserver(records=>{for(const r of records){for(const n of r.addedNodes){if(n instanceof HTMLElement&&n.classList.contains("ovg-modal"))installModal(n);}for(const n of r.removedNodes){if(n instanceof HTMLElement&&n.classList.contains("ovg-modal"))uninstallModal(n);}}});
        observer.observe(document.body,{childList:true,subtree:false});
        window.addEventListener("pointerup",onPointerUpCapture,true);
        document.addEventListener("fullscreenchange",onFullscreenChange,true);
        document.addEventListener("webkitfullscreenchange",onFullscreenChange,true);
    },
});
