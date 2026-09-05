import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXTENSION_NAME = "Comfy.ImageGallery";
const NODE_CLASS = "LoadImageGallery";
const CIG_LANG = String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
const CIG_I18N = {
    en: { root:"📁 input (root)", title:"Image Gallery", search:"Search by filename…", refresh:"Refresh", folder:"Folder:", clearCache:"Clear cache", start:"START", selected:"selected", cache:"Cache", noMatches:"No matching images", noImages:"No images in this folder", clearing:"Clearing…", error:"Error", thumbError:"error" },
    ru: { root:"📁 input (корень)", title:"Превью изображений", search:"Поиск по имени файла…", refresh:"Обновить", folder:"Папка:", clearCache:"Очистить кэш", start:"СТАРТ", selected:"выбрано", cache:"Кэш", noMatches:"По этому поиску ничего не найдено", noImages:"В папке нет изображений", clearing:"Очистка…", error:"Ошибка", thumbError:"ошибка" }
};
const cigT = CIG_I18N[CIG_LANG];

const ROOT_LABEL = cigT.root;
const MAX_PARALLEL_THUMBS = 6;
const OBSERVER_MARGIN = "420px 0px";

function injectStyles() {
    if (document.getElementById("comfy-image-gallery-style")) return;
    const style = document.createElement("style");
    style.id = "comfy-image-gallery-style";
    style.textContent = `
.cig-overlay{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.cig-panel{width:min(1500px,96vw);height:min(920px,92vh);background:#181818;border:1px solid #444;border-radius:12px;box-shadow:0 20px 70px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;color:#eee;font-family:Arial,sans-serif}
.cig-header{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #383838;flex:0 0 auto}.cig-title{font-size:18px;font-weight:700;white-space:nowrap}.cig-search{flex:1;min-width:120px;background:#262626;color:#eee;border:1px solid #4a4a4a;border-radius:7px;padding:9px 11px;font-size:14px;outline:none}.cig-search:focus{border-color:#888}.cig-close,.cig-refresh,.cig-clear{background:#2c2c2c;color:#eee;border:1px solid #505050;border-radius:7px;padding:8px 12px;cursor:pointer}.cig-close:hover,.cig-refresh:hover,.cig-clear:hover{background:#3a3a3a}.cig-close:disabled,.cig-refresh:disabled,.cig-clear:disabled{opacity:.45;cursor:default}
.cig-body{flex:1 1 auto;min-height:0;overflow:auto;padding:16px;contain:strict}.cig-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;align-items:start}.cig-card{position:relative;background:#222;border:2px solid transparent;border-radius:9px;padding:6px;cursor:pointer;min-width:0;transition:border-color .12s,background .12s,transform .08s;content-visibility:auto;contain-intrinsic-size:180px 205px}.cig-card:hover{background:#2b2b2b;transform:translateY(-1px)}.cig-card.selected{border-color:#6ba7ff;background:#26364b}.cig-thumb-wrap{width:100%;aspect-ratio:1/1;background:#111;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center;position:relative}.cig-thumb{width:100%;height:100%;object-fit:contain;display:block}.cig-thumb:not([src]){visibility:hidden}.cig-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#666;font-size:12px}.cig-card.loaded .cig-placeholder{display:none}.cig-card.error .cig-placeholder{color:#a77}.cig-name{font-size:12px;line-height:1.25;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;color:#ddd}.cig-empty{padding:40px;text-align:center;color:#aaa;font-size:15px}.cig-footer{display:flex;align-items:center;gap:10px;flex:0 0 auto;border-top:1px solid #383838;padding:12px 16px;background:#1d1d1d}.cig-footer-top{display:flex;align-items:center;gap:10px}.cig-folder-label{white-space:nowrap;font-size:13px;color:#bbb}.cig-folder{flex:1 1 360px;min-width:280px;background:#292929;color:#eee;border:1px solid #4b4b4b;border-radius:7px;padding:9px 10px;font-size:14px}.cig-count,.cig-cache{font-size:12px;color:#aaa;white-space:nowrap}.cig-run{display:inline-flex;align-items:center;justify-content:center;width:auto;height:40px;margin:0;border:1px solid #5a5a5a;border-radius:7px;background:#303030;color:#fff;padding:0 14px;font-size:14px;font-weight:400;line-height:38px;cursor:pointer}.cig-run:hover{background:#3a3a3a}.cig-run:disabled{opacity:.45;cursor:default}
.cig-pick-folder{flex:0 0 auto;width:44px;height:40px;min-width:44px;padding:0;margin:0;background:#2c2c2c;color:#eee;border:1px solid #505050;border-radius:7px;font-size:18px;font-weight:700;line-height:38px;cursor:pointer}.cig-pick-folder:hover{background:#3a3a3a}.cig-pick-folder:disabled{opacity:.45;cursor:default}
.cig-breadcrumbs{flex:0 0 auto;display:flex;align-items:center;gap:3px;min-height:32px;padding:4px 16px;border-bottom:1px solid #303030;background:#1d1d1d;overflow-x:auto;white-space:nowrap}.cig-crumb{border:0;background:transparent;color:#9ec8ff;padding:4px 6px;border-radius:5px;cursor:pointer;font-size:12px}.cig-crumb:hover{background:#303a46;color:#fff}.cig-crumb-sep{color:#666}.cig-up-folder{flex:0 0 auto;width:40px;height:40px;min-width:40px;padding:0;margin:0;background:#2c2c2c;color:#eee;border:1px solid #505050;border-radius:7px;font-size:22px;line-height:38px;cursor:pointer}.cig-up-folder:hover{background:#3a3a3a}.cig-up-folder:disabled{opacity:.3;cursor:default}.cig-folder-card{position:relative;background:#24282d;border:2px solid transparent;border-radius:9px;padding:6px;cursor:pointer;min-width:0;user-select:none}.cig-folder-card:hover{background:#303740;border-color:#53677e}.cig-folder-icon{width:100%;aspect-ratio:1/1;background:#191d22;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:58px}.cig-folder-name{font-size:12px;line-height:1.25;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;color:#ddd}
@media(max-width:700px){.cig-overlay{padding:8px}.cig-panel{width:100vw;height:96vh}.cig-grid{grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:9px}.cig-header{flex-wrap:wrap}.cig-title{width:100%}.cig-footer-top{flex-wrap:wrap}.cig-folder{width:100%;flex-basis:100%}}
`;
    document.head.appendChild(style);
}

function normalizePath(value) {
    if (typeof value !== "string") return "";
    return value.replace(/\\/g, "/").replace(/\s*\[(input|output|temp)\]\s*$/i, "").replace(/^\/+|\/+$/g, "");
}
function splitPath(value) { const clean = normalizePath(value); const i = clean.lastIndexOf("/"); return i < 0 ? { folder:"", filename:clean } : { folder:clean.slice(0,i), filename:clean.slice(i+1) }; }
function joinPath(folder, filename) { const f = normalizePath(folder); return f ? `${f}/${filename}` : filename; }
function thumbnailUrl(folder, filename) { const p = new URLSearchParams(); p.set("folder", folder || ""); p.set("filename", filename); return api.apiURL(`/image-gallery/thumb?${p.toString()}`); }
async function fetchJson(path, options) { const r = await api.fetchApi(path, options); if (!r.ok) { let d=`${r.status}`; try{d=(await r.json()).error||d;}catch(_){} throw new Error(d); } return await r.json(); }
function getImageWidget(node) { return node.widgets?.find(w => w.name === "image") || null; }
// CIG_EXTERNAL_FOLDER_PICKER_V3
function isAbsoluteGalleryPath(value){const v=String(value??"").replace(/\\/g,"/");return /^[A-Za-z]:\//.test(v)||v.startsWith("//");}
function externalSourceUrl(path){const p=new URLSearchParams();p.set("path",path);p.set("_",String(Date.now()));return api.apiURL(`/image-gallery/source?${p.toString()}`);}
function loadExternalPreview(node,path){if(!node||!isAbsoluteGalleryPath(path))return;const clean=normalizePath(path);const token=(node.__cigExternalPreviewToken??0)+1;node.__cigExternalPreviewToken=token;const img=new Image();img.decoding="async";img.onload=()=>{if(node.__cigExternalPreviewToken!==token)return;node.__cigExternalPreviewPath=clean;node.imgs=[img];node.imageIndex=0;node.graph?.setDirtyCanvas?.(true,true);};img.onerror=()=>console.warn("[ImageGallery] external preview failed:",clean);img.src=externalSourceUrl(clean);}
function installExternalPreviewRestore(node){const apply=()=>{const w=getImageWidget(node),v=normalizePath(String(w?.value??""));if(isAbsoluteGalleryPath(v))loadExternalPreview(node,v);};requestAnimationFrame(apply);setTimeout(apply,150);setTimeout(apply,600);}
function setWidgetValue(node,relativePath){
    const w=getImageWidget(node);
    if(!w)return;
    const value=normalizePath(String(relativePath??""));
    if(Array.isArray(w.options?.values)&&!w.options.values.includes(value)){
        w.options.values.push(value);
        w.options.values.sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"}));
    }
    w.value=value;
    if(isAbsoluteGalleryPath(value)){
        loadExternalPreview(node,value);
    }else{
        node.__cigExternalPreviewToken=(node.__cigExternalPreviewToken??0)+1;
        node.__cigExternalPreviewPath=null;
        w.callback?.(value);
    }
    node.graph?.setDirtyCanvas?.(true,true);
}
function humanBytes(n){ if(!Number.isFinite(n))return ""; const u=CIG_LANG==="ru"?["Б","КБ","МБ","ГБ"]:["B","KB","MB","GB"]; let i=0,v=n; while(v>=1024&&i<u.length-1){v/=1024;i++;} return `${v.toFixed(i<2?0:1)} ${u[i]}`; }

function makeThumbLoader(root) {
    let epoch=0, active=0, queue=[], disposed=false;
    const controllers=new Set();
    const observer=new IntersectionObserver(entries=>{ for(const e of entries){ const c=e.target; c.__cigVisible=e.isIntersecting; if(e.isIntersecting){ enqueue(c); } else if(c.__cigController){ c.__cigController.abort(); } } },{root,rootMargin:OBSERVER_MARGIN,threshold:0.01});
    function enqueue(card){ if(disposed||card.__cigLoaded||card.__cigQueued||!card.__cigVisible)return; card.__cigQueued=true; card.__cigEpoch=epoch; queue.push(card); pump(); }
    function pump(){ while(!disposed&&active<MAX_PARALLEL_THUMBS&&queue.length){ const card=queue.shift(); card.__cigQueued=false; if(!card.isConnected||!card.__cigVisible||card.__cigLoaded||card.__cigEpoch!==epoch)continue; load(card,epoch); } }
    async function load(card,myEpoch){ active++; const controller=new AbortController(); card.__cigController=controller; controllers.add(controller); const img=card.querySelector(".cig-thumb"); try{ const r=await fetch(card.__cigUrl,{signal:controller.signal,cache:"force-cache"}); if(!r.ok)throw new Error(String(r.status)); const blob=await r.blob(); if(disposed||myEpoch!==epoch||!card.isConnected)return; const url=URL.createObjectURL(blob); card.__cigObjectUrl=url; img.onload=()=>{ URL.revokeObjectURL(url); card.__cigObjectUrl=null; card.__cigLoaded=true; card.classList.add("loaded"); }; img.onerror=()=>{ URL.revokeObjectURL(url); card.__cigObjectUrl=null; card.classList.add("error"); card.querySelector(".cig-placeholder").textContent=cigT.thumbError; }; img.src=url; } catch(err){ if(err?.name!=="AbortError"&&card.isConnected){ card.classList.add("error"); card.querySelector(".cig-placeholder").textContent=cigT.thumbError; } } finally{ controllers.delete(controller); card.__cigController=null; active=Math.max(0,active-1); pump(); } }
    function observe(card){ observer.observe(card); }
    function reset(){ epoch++; queue=[]; for(const c of controllers)c.abort(); controllers.clear(); observer.disconnect(); root.querySelectorAll?.(".cig-card").forEach(card=>{ if(card.__cigObjectUrl){URL.revokeObjectURL(card.__cigObjectUrl);card.__cigObjectUrl=null;} }); }
    function dispose(){ disposed=true; reset(); }
    return {observe,reset,dispose};
}

// CIG_HELP_SAFE_V1
function showCigHelp(){
    document.querySelector(".cig-help-overlay")?.remove();
    const ru=(typeof CIG_LANG!=="undefined"&&CIG_LANG==="ru");
    const rows=ru?[
        ["Открытие галереи","Нажмите на превью изображения в ноде. Стрелки по краям превью переключают изображения текущей папки."],
        ["Выбор изображений","Один клик выбирает или снимает изображение. Двойной клик загружает изображение в ноду."],
        ["Выделение мышью","Проведите рамкой по изображениям. Выделение накапливается и сохраняется при прокрутке."],
        ["Автопрокрутка","Во время рамочного выделения подведите курсор к верхнему или нижнему краю галереи для автоматической прокрутки."],
        ["Сенсорный экран","Обычный свайп прокручивает галерею. Удерживайте палец около 0,4 секунды, затем ведите им для рамочного выделения."],
        ["Папки","Двойной клик открывает папку. ↑ поднимает на уровень выше. Кнопка … позволяет выбрать внешнюю папку."],
        ["Последние папки","До 10 последних внешних папок сохраняются в списке."],
        ["СТАРТ","Запускает выбранные изображения в очередь, очищает выделение и оставляет галерею открытой."],
        ["Закрытие","Галерея закрывается только кнопкой ✕."]
    ]:[
        ["Open gallery","Click the image preview in the node. Arrows beside the preview navigate through images in the current folder."],
        ["Select images","Single click selects or deselects an image. Double click loads the image into the node."],
        ["Mouse selection","Drag a rectangle across images. Selection accumulates and remains selected while scrolling."],
        ["Auto-scroll","While rectangle-selecting, move the pointer near the top or bottom edge to scroll automatically."],
        ["Touch screen","A normal swipe scrolls the gallery. Hold for about 0.4 seconds, then drag to start rectangle selection."],
        ["Folders","Double-click a folder to open it. ↑ goes up one level. The … button opens an external folder picker."],
        ["Recent folders","Up to 10 recently used external folders are kept in the list."],
        ["START","Queues the selected images, clears the selection and keeps the gallery open."],
        ["Closing","The gallery closes only with the ✕ button."]
    ];
    const ov=document.createElement("div");ov.className="cig-help-overlay";ov.style.cssText="position:fixed;inset:0;z-index:100100;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:20px";
    const box=document.createElement("div");box.style.cssText="width:min(620px,94vw);max-height:86vh;overflow:auto;background:#1d1d1d;color:#eee;border:1px solid #555;border-radius:12px;box-shadow:0 20px 70px rgba(0,0,0,.65);font-family:Arial,sans-serif";
    const head=document.createElement("div");head.style.cssText="display:flex;align-items:center;padding:15px 18px;border-bottom:1px solid #383838;position:sticky;top:0;background:#1d1d1d";
    const title=document.createElement("div");title.style.cssText="font-size:18px;font-weight:700;flex:1";title.textContent=ru?"ⓘ Инструкция — Load Image Gallery":"ⓘ Load Image Gallery Help";
    const x=document.createElement("button");x.type="button";x.textContent="✕";x.style.cssText="width:34px;height:34px;background:#2c2c2c;color:#eee;border:1px solid #555;border-radius:7px;cursor:pointer";
    const content=document.createElement("div");content.style.cssText="padding:10px 18px 18px";
    for(const [a,b] of rows){const r=document.createElement("div");r.style.cssText="padding:10px 0;border-bottom:1px solid #303030";const n=document.createElement("div");n.style.cssText="font-weight:700;font-size:14px;margin-bottom:4px";n.textContent=a;const t=document.createElement("div");t.style.cssText="font-size:13px;line-height:1.45;color:#bbb";t.textContent=b;r.append(n,t);content.appendChild(r);}
    head.append(title,x);box.append(head,content);ov.appendChild(box);document.body.appendChild(ov);
    x.onclick=()=>ov.remove();
}

// CIG_HELP_TITLEBAR_V1
function installCigTitleHelp(node){
    if(node.__cigTitleHelpInstalled)return;
    node.__cigTitleHelpInstalled=true;
    const oldDraw=node.onDrawForeground;
    node.onDrawForeground=function(ctx){
        oldDraw?.call(this,ctx);
        const th=globalThis.LiteGraph?.NODE_TITLE_HEIGHT??30;
        const sz=18;
        ctx.save();ctx.font="14px Arial";const titleText=String(this.title||"Load Image Gallery");const titleWidth=ctx.measureText(titleText).width;ctx.restore();const x=26+titleWidth+22;
        const y=-th+(th-sz)/2;
        this.__cigTitleHelpRect={x,y,w:sz,h:sz};
        ctx.save();
        ctx.beginPath();
        ctx.arc(x+sz/2,y+sz/2,sz/2,0,Math.PI*2);
        ctx.fillStyle="#353535";
        ctx.fill();
        ctx.strokeStyle="#bdbdbd";
        ctx.lineWidth=1;
        ctx.stroke();
        ctx.fillStyle="#ffffff";
        ctx.font="bold 13px Arial";
        ctx.textAlign="center";
        ctx.textBaseline="middle";
        ctx.fillText("i",x+sz/2,y+sz/2+.5);
        ctx.restore();
    };
    const oldDown=node.onMouseDown;
    node.onMouseDown=function(e,pos,graphcanvas){
        const r=this.__cigTitleHelpRect;
        const x=Array.isArray(pos)?pos[0]:pos?.x;
        const y=Array.isArray(pos)?pos[1]:pos?.y;
        if(r&&Number.isFinite(x)&&Number.isFinite(y)&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
            e?.preventDefault?.();
            e?.stopPropagation?.();
            showCigHelp();
            return true;
        }
        return oldDown?oldDown.call(this,e,pos,graphcanvas):false;
    };
    node.setDirtyCanvas?.(true,true);
}

async function openGallery(node){
    injectStyles();
    document.querySelector(".cig-overlay")?.remove();
    const widget = getImageWidget(node);
    if(!widget) return;

    const current = splitPath(String(widget.value ?? ""));
    let activeFolder = normalizePath(node.__cigFolder ?? current.folder);
    let images = [], subfolders = [], filterText = "", loadToken = 0;
    // CIG_SELECTION_PERSIST_V1
    if(!(node.__cigSelectedPaths instanceof Set)){
        node.__cigSelectedPaths=new Set(Array.isArray(node.__cigSelectedPaths)?node.__cigSelectedPaths:[]);
    }
    const selected=node.__cigSelectedPaths;

    const overlay = document.createElement("div");
    overlay.className = "cig-overlay";
    overlay.innerHTML = `<div class="cig-panel" role="dialog" aria-modal="true">
        <div class="cig-header">
            <div class="cig-title">${cigT.title}</div>
            <input class="cig-search" type="search" placeholder="${cigT.search}">
            <button class="cig-refresh" type="button">↻ ${cigT.refresh}</button>
            <button class="cig-close" type="button">✕</button>
        </div>
        <div class="cig-breadcrumbs"></div><div class="cig-body"><div class="cig-grid"></div></div>
        <div class="cig-footer">
            <span class="cig-folder-label">${cigT.folder}</span>
            <select class="cig-folder"></select><button class="cig-up-folder" type="button" title="Вверх">↑</button><button class="cig-pick-folder" type="button">...</button>
            <span class="cig-count"></span>
            <span class="cig-cache"></span>
            <button class="cig-clear" type="button">${cigT.clearCache}</button>
            <button class="cig-run cig-clear" type="button">▶ ${cigT.start} (0)</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);

    const panel = overlay.querySelector(".cig-panel");
    const grid = overlay.querySelector(".cig-grid");
    const body = overlay.querySelector(".cig-body");
    const folderSelect = overlay.querySelector(".cig-folder");
    const upFolderButton=overlay.querySelector(".cig-up-folder");
    const breadcrumbs=overlay.querySelector(".cig-breadcrumbs");
    const pickFolderButton=overlay.querySelector(".cig-pick-folder");
    pickFolderButton.title=(typeof CIG_LANG!=="undefined"&&CIG_LANG==="ru")?"Выбрать папку":"Choose folder";
    const search = overlay.querySelector(".cig-search");
    const count = overlay.querySelector(".cig-count");
    const cacheInfo = overlay.querySelector(".cig-cache");
    const closeButton = overlay.querySelector(".cig-close");
    const helpButton=document.createElement("button");
    helpButton.type="button";
    helpButton.textContent="ⓘ";
    helpButton.title=(typeof CIG_LANG!=="undefined"&&CIG_LANG==="ru")?"Инструкция":"Help";
    helpButton.style.cssText="width:38px;height:38px;min-width:38px;padding:0;border:1px solid #505050;border-radius:50%;background:#2c2c2c;color:#eee;font-size:19px;cursor:pointer;margin-right:6px";
    closeButton.before(helpButton);
    helpButton.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();showCigHelp();});
    const refreshButton = overlay.querySelector(".cig-refresh");
    const clearButton = overlay.querySelector(".cig-clear");
    const runButton = overlay.querySelector(".cig-run");
    let thumbLoader = makeThumbLoader(body);

    const marquee = document.createElement("div");
    Object.assign(marquee.style,{
        position:"fixed",
        display:"none",
        pointerEvents:"none",
        zIndex:"100002",
        border:"1px solid #6ba7ff",
        background:"rgba(107,167,255,.18)",
        borderRadius:"3px",
        boxSizing:"border-box"
    });
    document.body.appendChild(marquee);

    const cleanup = ()=>{
        document.removeEventListener("keydown", onKey);
        thumbLoader?.dispose();
        marquee.remove();
    };
    // CIG_CLOSE_ONLY_X_V2
    let __cigAllowClose=false;
    const close=()=>{if(!__cigAllowClose)return;cleanup();overlay.remove();};
    closeButton.addEventListener("click",()=>{__cigAllowClose=true;close();});
    // CIG_DBLCLICK_CLOSE_V2
    body.addEventListener("click",e=>{
        if(e.detail!==2)return;
        if(!e.target.closest?.(".cig-card"))return;
        setTimeout(()=>{__cigAllowClose=true;close();},0);
    },true);
    // CIG_DBLCLICK_CLOSE_V1
    grid.addEventListener("dblclick",e=>{
        if(!e.target.closest?.(".cig-card"))return;
        setTimeout(()=>{__cigAllowClose=true;close();},0);
    });
    overlay.addEventListener("mousedown", e=>{ if(e.target === overlay) close(); });
    panel.addEventListener("mousedown", e=>e.stopPropagation());
    const onKey = e=>{ if(e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);

    // CIG_FOLDER_NAV_SAFE_V1
    const CIG_RECENT_FOLDERS_KEY="ComfyUI-LoadImageGallery.recentFolders";
    const CIG_RECENT_FOLDERS_LIMIT=10;
    function getRecentExternalFolders(){
        try{
            const raw=JSON.parse(localStorage.getItem(CIG_RECENT_FOLDERS_KEY)||"[]");
            if(!Array.isArray(raw)) return [];
            const out=[];
            for(const item of raw){
                const p=normalizeNavPath(item);
                if(isAbsoluteGalleryPath(p) && !out.some(v=>normalizeNavPath(v)===p)) out.push(p);
                if(out.length>=CIG_RECENT_FOLDERS_LIMIT) break;
            }
            return out;
        }catch(_){
            return [];
        }
    }
    function rememberExternalFolder(path){
        const p=normalizeNavPath(path);
        if(!isAbsoluteGalleryPath(p)) return;
        const arr=[p,...getRecentExternalFolders().filter(v=>normalizeNavPath(v)!==p)].slice(0,CIG_RECENT_FOLDERS_LIMIT);
        try{localStorage.setItem(CIG_RECENT_FOLDERS_KEY,JSON.stringify(arr));}catch(_){}
    }

    function normalizeNavPath(value){
        const raw=String(value??"").replace(/\\/g,"/").trim();
        if(/^[A-Za-z]:\/?$/.test(raw))return raw.slice(0,2)+"/";
        return normalizePath(raw);
    }
    function parentGalleryFolder(value){
        const p=normalizeNavPath(value);
        if(!p)return null;
        if(/^[A-Za-z]:\/$/.test(p))return null;
        if(/^[A-Za-z]:\//.test(p)){const i=p.lastIndexOf("/");return i<=2?p.slice(0,2)+"/":p.slice(0,i);}
        const i=p.lastIndexOf("/");
        return i<0?"":p.slice(0,i);
    }
    async function navigateGalleryFolder(value){
    const chosen=normalizeNavPath(value);
    if(isAbsoluteGalleryPath(chosen)) rememberExternalFolder(chosen);
    let option=[...folderSelect.options].find(o=>normalizeNavPath(o.value)===chosen);
    if(!option){option=document.createElement("option");option.value=chosen;option.textContent=chosen||ROOT_LABEL;folderSelect.appendChild(option);}
    folderSelect.value=option.value;
    filterText="";search.value="";
    await loadFolder(chosen);
}
    function renderBreadcrumbs(){
        breadcrumbs.replaceChildren();
        const p=normalizeNavPath(activeFolder);
        const parts=[];
        if(/^[A-Za-z]:\//.test(p)){
            const drive=p.slice(0,2);let cur=drive+"/";parts.push({label:drive,path:cur});
            for(const name of p.slice(3).split("/").filter(Boolean)){cur=cur.endsWith("/")?cur+name:cur+"/"+name;parts.push({label:name,path:cur});}
        }else{
            parts.push({label:"input",path:""});let cur="";
            for(const name of p.split("/").filter(Boolean)){cur=cur?cur+"/"+name:name;parts.push({label:name,path:cur});}
        }
        parts.forEach((part,index)=>{if(index){const sep=document.createElement("span");sep.className="cig-crumb-sep";sep.textContent="›";breadcrumbs.appendChild(sep);}const b=document.createElement("button");b.type="button";b.className="cig-crumb";b.textContent=part.label;b.title=part.path||"input";b.addEventListener("click",()=>navigateGalleryFolder(part.path));breadcrumbs.appendChild(b);});
        upFolderButton.disabled=parentGalleryFolder(activeFolder)===null;
    }
    function renderFolderCards(){
        grid.querySelectorAll(".cig-folder-card").forEach(el=>el.remove());
        const needle=filterText.trim().toLocaleLowerCase();
        const visible=needle?subfolders.filter(n=>n.toLocaleLowerCase().includes(needle)):subfolders;
        if(!visible.length)return;
        grid.querySelector(".cig-empty")?.remove();
        const frag=document.createDocumentFragment();
        for(const folderName of visible){
            const card=document.createElement("div");card.className="cig-folder-card";card.title=folderName;
            const icon=document.createElement("div");icon.className="cig-folder-icon";icon.textContent="📁";
            const name=document.createElement("div");name.className="cig-folder-name";name.textContent=folderName;
            card.append(icon,name);
            card.addEventListener("mousedown",e=>e.stopPropagation());
            card.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();});
            card.addEventListener("dblclick",e=>{e.preventDefault();e.stopPropagation();navigateGalleryFolder((/^[A-Za-z]:\/$/.test(normalizeNavPath(activeFolder))?normalizeNavPath(activeFolder):normalizeNavPath(activeFolder)?normalizeNavPath(activeFolder)+"/":"")+folderName);});
            frag.appendChild(card);
        }
        grid.insertBefore(frag,grid.firstChild);
    }

    function rebuildThumbLoader(){
        thumbLoader.dispose();
        thumbLoader = makeThumbLoader(body);
    }

    function updateRunState(){
        const n = selected.size;
        runButton.textContent = `▶ ${cigT.start} (${n})`;
        runButton.disabled = n === 0;
        runButton.style.opacity = n ? "1" : ".5";
    }

    function updateCount(filteredLength = images.length){
        count.textContent = `${filteredLength} / ${images.length} · ${cigT.selected} ${selected.size}`;
        updateRunState();
    }

    async function updateCacheStats(){
        try{
            const s = await fetchJson("/image-gallery/cache/stats");
            cacheInfo.textContent = `${cigT.cache}: ${s.count} · ${humanBytes(s.bytes)} / ${humanBytes(s.limit_bytes)}`;
        }catch(_){
            cacheInfo.textContent = "";
        }
    }

    function syncCardSelection(){
        grid.querySelectorAll(".cig-card").forEach(card=>{
            card.classList.toggle("selected", selected.has(card.__cigRelative));
        });
        const needle = filterText.trim().toLocaleLowerCase();
        const filteredLength = needle ? images.filter(n=>n.toLocaleLowerCase().includes(needle)).length : images.length;
        updateCount(filteredLength);
    }

    function render({scrollToCurrent=false} = {}){
        const needle = filterText.trim().toLocaleLowerCase();
        const filtered = needle ? images.filter(n=>n.toLocaleLowerCase().includes(needle)) : images;
        rebuildThumbLoader();
        grid.replaceChildren();
        updateCount(filtered.length);

        if(!filtered.length){
            const e = document.createElement("div");
            e.className = "cig-empty";
            e.textContent = images.length ? cigT.noMatches : cigT.noImages;
            grid.appendChild(e);
            renderFolderCards();
            return;
        }

        const currentValue = normalizePath(String(widget.value ?? ""));
        const frag = document.createDocumentFragment();
        let currentCard = null;

        for(const filename of filtered){
            const relative = joinPath(activeFolder, filename);
            const card = document.createElement("div");
            card.className = "cig-card" + (selected.has(relative) ? " selected" : "");
            card.title = relative;
            card.__cigRelative = relative;
            card.__cigUrl = thumbnailUrl(activeFolder, filename);

            const wrap = document.createElement("div");
            wrap.className = "cig-thumb-wrap";
            const ph = document.createElement("div");
            ph.className = "cig-placeholder";
            ph.textContent = "…";
            const img = document.createElement("img");
            img.className = "cig-thumb";
            img.decoding = "async";
            img.alt = filename;
            wrap.append(ph, img);

            const name = document.createElement("div");
            name.className = "cig-name";
            name.textContent = filename;
            card.append(wrap, name);

            card.addEventListener("click", e=>{
                e.preventDefault();
                e.stopPropagation();
                if(selected.has(relative)) selected.delete(relative);
                else selected.add(relative);
                card.classList.toggle("selected", selected.has(relative));
                updateCount(filtered.length);
            });

            card.addEventListener("dblclick", e=>{
                e.preventDefault();
                e.stopPropagation();
                setWidgetValue(node, relative);
                node.__cigFolder = activeFolder;
                close();
            });

            if(relative === currentValue) currentCard = card;
            frag.appendChild(card);
        }

        grid.appendChild(frag);
        renderFolderCards();
        grid.querySelectorAll(".cig-card").forEach(c=>thumbLoader.observe(c));

        if(scrollToCurrent && currentCard){
            requestAnimationFrame(()=>currentCard.scrollIntoView({block:"center", inline:"nearest"}));
        }
    }

    async function loadFolder(folder,{preserveScroll=false,scrollToCurrent=false} = {}){
        const token = ++loadToken;
        const oldScroll = body.scrollTop;
        activeFolder = normalizeNavPath(folder);
        node.__cigFolder = activeFolder;
        rebuildThumbLoader();
        grid.innerHTML = '<div class="cig-empty">Загрузка списка…</div>';
        count.textContent = "";

        const data = await fetchJson(`/image-gallery/list?folder=${encodeURIComponent(activeFolder)}`);
        if(token !== loadToken || !overlay.isConnected) return;

        images = Array.isArray(data.images) ? data.images : [];subfolders=Array.isArray(data.folders)?data.folders:[];node.__cigGalleryValues=images.map(name=>joinPath(activeFolder,name));
        render({scrollToCurrent});renderBreadcrumbs();

        if(preserveScroll) body.scrollTop = oldScroll;
        else if(!scrollToCurrent) body.scrollTop = 0;

        updateCacheStats();
    }

    async function fillFolders(preferred){
    const data=await fetchJson("/image-gallery/folders");
    const baseFolders=Array.isArray(data.folders)?data.folders:[""];
    const preferredNorm=normalizeNavPath(preferred);
    const recent=getRecentExternalFolders();
    const merged=[];
    if(isAbsoluteGalleryPath(preferredNorm)) merged.push(preferredNorm);
    for(const folder of recent){
        const norm=normalizeNavPath(folder);
        if(!merged.some(v=>normalizeNavPath(v)===norm)) merged.push(norm);
    }
    for(const folder of baseFolders){
        const norm=normalizeNavPath(folder);
        if(!merged.some(v=>normalizeNavPath(v)===norm)) merged.push(folder);
    }
    const selected=merged.some(f=>normalizeNavPath(f)===preferredNorm)?preferredNorm:"";
    folderSelect.replaceChildren();
    const frag=document.createDocumentFragment();
    for(const folder of merged){
        const o=document.createElement("option");
        o.value=folder;
        o.textContent=folder||ROOT_LABEL;
        o.selected=normalizeNavPath(folder)===selected;
        frag.appendChild(o);
    }
    folderSelect.appendChild(frag);
    return selected;
}

    let __cigSelectionSyncRAF=0;
    body.addEventListener("scroll",()=>{
        cancelAnimationFrame(__cigSelectionSyncRAF);
        __cigSelectionSyncRAF=requestAnimationFrame(()=>{
            syncCardSelection();
        });
    },{passive:true});

        // CIG_TOUCH_MARQUEE_V2
    let __cigTouchHoldTimer=0;
    let __cigTouchDown=false;
    let __cigTouchSelecting=false;
    let __cigTouchStartX=0,__cigTouchStartY=0,__cigTouchLastX=0,__cigTouchLastY=0;
    let __cigSuppressTouchClickUntil=0;

    const __cigCancelTouchHold=()=>{
        if(__cigTouchHoldTimer){
            clearTimeout(__cigTouchHoldTimer);
            __cigTouchHoldTimer=0;
        }
    };

    body.addEventListener("touchstart",e=>{
        if(e.touches.length!==1)return;
        const t=e.touches[0];
        __cigCancelTouchHold();
        __cigTouchDown=true;
        __cigTouchSelecting=false;
        __cigTouchStartX=__cigTouchLastX=t.clientX;
        __cigTouchStartY=__cigTouchLastY=t.clientY;

        __cigTouchHoldTimer=setTimeout(()=>{
            __cigTouchHoldTimer=0;
            if(!__cigTouchDown)return;
            __cigTouchSelecting=true;
            body.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,button:0,clientX:__cigTouchStartX,clientY:__cigTouchStartY}));
        },400);
    },{passive:true});

    body.addEventListener("touchmove",e=>{
        if(!__cigTouchDown||e.touches.length!==1)return;
        const t=e.touches[0];
        __cigTouchLastX=t.clientX;
        __cigTouchLastY=t.clientY;

        if(!__cigTouchSelecting){
            const dx=t.clientX-__cigTouchStartX;
            const dy=t.clientY-__cigTouchStartY;
            if(Math.hypot(dx,dy)>10)__cigCancelTouchHold();
            return;
        }

        e.preventDefault();
        document.dispatchEvent(new MouseEvent("mousemove",{bubbles:true,cancelable:true,button:0,clientX:t.clientX,clientY:t.clientY}));
    },{passive:false});

    const __cigFinishTouch=e=>{
        const wasSelecting=__cigTouchSelecting;
        __cigCancelTouchHold();
        __cigTouchDown=false;
        __cigTouchSelecting=false;
        if(!wasSelecting)return;

        __cigSuppressTouchClickUntil=Date.now()+700;
        e?.preventDefault?.();
        document.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,button:0,clientX:__cigTouchLastX,clientY:__cigTouchLastY}));
    };

    body.addEventListener("touchend",__cigFinishTouch,{passive:false});
    body.addEventListener("touchcancel",__cigFinishTouch,{passive:false});

    body.addEventListener("click",e=>{
        if(Date.now()>=__cigSuppressTouchClickUntil)return;
        e.preventDefault();
        e.stopImmediatePropagation();
    },true);

    body.addEventListener("contextmenu",e=>{
        if(!__cigTouchSelecting&&Date.now()>=__cigSuppressTouchClickUntil)return;
        e.preventDefault();
        e.stopImmediatePropagation();
    },true);

body.addEventListener("mousedown", e=>{
        if(e.button !== 0) return;
        if(e.target.closest?.(".cig-card")) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const keepExisting = e.ctrlKey || e.shiftKey;
        // CIG_MARQUEE_PERSIST_V3
        const base = new Set(selected);
        let moved = false;
        // CIG_MARQUEE_AUTOSCROLL_V1
        let lastX=startX,lastY=startY,autoScrollRAF=0;


        marquee.style.display = "block";
        marquee.style.left = `${startX}px`;
        marquee.style.top = `${startY}px`;
        marquee.style.width = "0px";
        marquee.style.height = "0px";

        const move = ev=>{
            lastX=ev.clientX;
            lastY=ev.clientY;
            const x1 = Math.min(startX, ev.clientX);
            const y1 = Math.min(startY, ev.clientY);
            const x2 = Math.max(startX, ev.clientX);
            const y2 = Math.max(startY, ev.clientY);
            if(Math.abs(ev.clientX-startX) > 3 || Math.abs(ev.clientY-startY) > 3) moved = true;

            marquee.style.left = `${x1}px`;
            marquee.style.top = `${y1}px`;
            marquee.style.width = `${x2-x1}px`;
            marquee.style.height = `${y2-y1}px`;


            grid.querySelectorAll(".cig-card").forEach(card=>{
                const r = card.getBoundingClientRect();
                const hit = r.right >= x1 && r.left <= x2 && r.bottom >= y1 && r.top <= y2;
                if(hit) selected.add(card.__cigRelative);
            });
            syncCardSelection();
        };

        const autoScroll=()=>{
            if(!overlay.isConnected)return;
            const r=body.getBoundingClientRect();
            const edge=72;
            const maxStep=28;
            let dy=0;
            if(lastY<=r.top+edge && lastY>=r.top-edge){
                const t=Math.min(1,Math.max(0,(r.top+edge-lastY)/edge));
                dy=-Math.max(1,Math.ceil(maxStep*t*t));
            }else if(lastY>=r.bottom-edge && lastY<=r.bottom+edge){
                const t=Math.min(1,Math.max(0,(lastY-(r.bottom-edge))/edge));
                dy=Math.max(1,Math.ceil(maxStep*t*t));
            }
            if(dy!==0){
                const before=body.scrollTop;
                body.scrollTop+=dy;
                if(body.scrollTop!==before)move({clientX:lastX,clientY:lastY});
            }
            autoScrollRAF=requestAnimationFrame(autoScroll);
        };

        const up = ()=>{
            cancelAnimationFrame(autoScrollRAF);
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", up);
            marquee.style.display = "none";
        };

        autoScrollRAF=requestAnimationFrame(autoScroll);
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
        e.preventDefault();
    });

    runButton.addEventListener("click", async()=>{
        const list = [...selected];
        if(!list.length) return;
        selected.clear();
        syncCardSelection();
        updateRunState();

        runButton.disabled = true;
        refreshButton.disabled = true;
        clearButton.disabled = true;
        folderSelect.disabled = true;
        search.disabled = true;

        try{
            for(let i=0;i<list.length;i++){
                const relative = list[i];
                setWidgetValue(node, relative);
                node.__cigFolder = splitPath(relative).folder;
                runButton.textContent = `▶ ${i+1}/${list.length}`;
                await new Promise(r=>requestAnimationFrame(r));
                await app.queuePrompt(0,1);
            }
            // CIG_KEEP_OPEN_AFTER_START_V1
        }catch(error){
            console.error("[ImageGallery] batch queue:", error);
            runButton.textContent = "Ошибка";
        }finally{
            if(overlay.isConnected){
                refreshButton.disabled = false;
                clearButton.disabled = false;
                folderSelect.disabled = false;
                search.disabled = false;
                updateRunState();
            }
        }
    });

    try{
        activeFolder = await fillFolders(activeFolder);
        await loadFolder(activeFolder,{scrollToCurrent:true});
    }catch(error){
        grid.innerHTML = `<div class="cig-empty">${cigT.error}: ${String(error?.message ?? error)}</div>`;
    }

    pickFolderButton.addEventListener("click",async()=>{
    pickFolderButton.disabled=true;
    try{
        const data=await fetchJson("/image-gallery/pick-folder",{method:"POST"});
        if(!data?.path)return;
        const chosen=normalizeNavPath(data.path);
        rememberExternalFolder(chosen);
        let option=[...folderSelect.options].find(o=>normalizeNavPath(o.value)===chosen);
        if(!option){
            option=document.createElement("option");
            option.value=chosen;
            option.textContent=chosen;
            folderSelect.appendChild(option);
        }
        folderSelect.value=option.value;
        filterText="";
        search.value="";
        await loadFolder(chosen);
    }catch(error){
        grid.innerHTML=`<div class="cig-empty">${String(error?.message??error)}</div>`;
    }finally{
        pickFolderButton.disabled=false;
    }
});

    upFolderButton.addEventListener("click",async()=>{
        const parent=parentGalleryFolder(activeFolder);
        if(parent===null)return;
        upFolderButton.disabled=true;
        try{await navigateGalleryFolder(parent);}finally{upFolderButton.disabled=parentGalleryFolder(activeFolder)===null;}
    });

    folderSelect.addEventListener("change", async()=>{
        filterText = "";
        search.value = "";
        refreshButton.disabled = true;
        try{
            await loadFolder(folderSelect.value);
        }catch(error){
            grid.innerHTML = `<div class="cig-empty">${cigT.error}: ${String(error?.message ?? error)}</div>`;
        }finally{
            refreshButton.disabled = false;
            updateRunState();
        }
    });

    let searchTimer = null;
    search.addEventListener("input", ()=>{
        clearTimeout(searchTimer);
        searchTimer = setTimeout(()=>{
            filterText = search.value;
            body.scrollTop = 0;
            render();
        },100);
    });

    refreshButton.addEventListener("click", async()=>{
        refreshButton.disabled = true;
        selected.clear();
        syncCardSelection();
        updateRunState();
        try{
            const chosen = await fillFolders(activeFolder);
            await loadFolder(chosen,{preserveScroll:true});
        }catch(error){
            grid.innerHTML = `<div class="cig-empty">${cigT.error}: ${String(error?.message ?? error)}</div>`;
        }finally{
            refreshButton.disabled = false;
            updateRunState();
        }
    });

    clearButton.addEventListener("click", async()=>{
        clearButton.disabled = true;
        cacheInfo.textContent = cigT.clearing;
        try{
            await fetchJson("/image-gallery/cache/clear",{method:"POST"});
            rebuildThumbLoader();
            grid.querySelectorAll(".cig-card").forEach(c=>{
                c.__cigLoaded = false;
                c.classList.remove("loaded","error");
                const img = c.querySelector(".cig-thumb");
                if(img) img.removeAttribute("src");
                const ph = c.querySelector(".cig-placeholder");
                if(ph) ph.textContent = "…";
                thumbLoader.observe(c);
            });
            await updateCacheStats();
        }catch(error){
            cacheInfo.textContent = `${cigT.error}: ${String(error?.message ?? error)}`;
        }finally{
            clearButton.disabled = false;
            updateRunState();
        }
    });

    updateRunState();
}
function hookNodePreview(node){const attach=()=>{const preview=node.widgets?.find(w=>w?.constructor?.name==="ImagePreviewWidget"||(w?.type==="custom"&&w?.options?.canvasOnly===true&&typeof w?.drawWidget==="function"&&typeof w?.onPointerDown==="function"));if(!preview||preview.__cigGalleryHooked)return;preview.__cigGalleryHooked=true;preview.onClick=()=>{openGallery(node);return true;};};attach();requestAnimationFrame(attach);setTimeout(attach,150);setTimeout(attach,600);setTimeout(attach,1500);}


function installPreviewClickBridge() {
    if (window.__cigPreviewClickBridgeInstalled) return;
    window.__cigPreviewClickBridgeInstalled = true;
    document.addEventListener("click", (e) => {
        const target = e.target instanceof Element ? e.target : null;
        if (!target) return;
        const preview = target.closest(".image-preview");
        if (!preview) return;
        if (target.closest(".actions,button,a,input,select,textarea")) return;
        const nodeEl = preview.closest("[data-node-id]");
        const rawId = nodeEl?.dataset?.nodeId;
        if (!rawId) return;
        let node = app.graph?.getNodeById?.(rawId);
        if (!node && /^\d+$/.test(rawId)) node = app.graph?.getNodeById?.(Number(rawId));
        if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;
        e.preventDefault();
        e.stopPropagation();
        openGallery(node);
    }, true);
}



function hookCanvasPreviewClickV2(node){
    if(node.__cigCanvasPreviewHookedV2)return;
    node.__cigCanvasPreviewHookedV2=true;
    const original=node.onMouseDown;
    node.onMouseDown=function(event,pos,canvas){
        try{
            if(pos!=null&&pos.length>=2){
                const x=Number(pos[0]),y=Number(pos[1]),w=Number(this.size?.[0]??0),h=Number(this.size?.[1]??0);
                if(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<=w&&y<=h){
                    let previewTop=0,foundWidget=false;
                    for(const wd of (this.widgets??[])){
                        if(!wd||wd.hidden||wd.computedDisabled||wd.name==="$$canvas-image-preview"||wd.type==="IMAGE_PREVIEW")continue;
                        const wy=Number(wd.last_y??wd.y);
                        if(!Number.isFinite(wy))continue;
                        foundWidget=true;
                        let wh=20;
                        try{
                            const cs=wd.computeSize?.(w);
                            if(cs&&cs.length>=2&&Number.isFinite(Number(cs[1])))wh=Number(cs[1]);
                        }catch(_){}
                        previewTop=Math.max(previewTop,wy+Math.max(18,wh));
                    }
                    if(!foundWidget)previewTop=80;
                    previewTop+=4;
                    if(y>=previewTop&&(this.imgs?.length||this.images?.length||getImageWidget(this)?.value)){
                        event?.preventDefault?.();
                        event?.stopPropagation?.();
                        queueMicrotask(()=>openGallery(this));
                        return true;
                    }
                }
            }
        }catch(err){console.warn("[ImageGallery] preview click hook:",err);}
        return original?.call(this,event,pos,canvas);
    };
}
function installGalleryPreviewWidgetHook(node){
    if(node.__cigPreviewWidgetWatcher)return;
    node.__cigPreviewWidgetWatcher=true;
    const patch=(w)=>{
        if(!w||w.__cigGalleryPatched)return w;
        const isPreview=w.name==="$$canvas-image-preview"||(w.options?.canvasOnly===true&&typeof w.drawWidget==="function"&&typeof w.onPointerDown==="function");
        if(!isPreview)return w;
        w.__cigGalleryPatched=true;
        const originalPointerDown=typeof w.onPointerDown==="function"?w.onPointerDown.bind(w):null;
        w.onPointerDown=function(pointer,nodeArg,canvas){
            const button=pointer?.eDown?.button;
            if(button!=null&&button!==0)return originalPointerDown?.(pointer,nodeArg,canvas)??false;
            if(pointer){
                pointer.onDragStart=undefined;
                pointer.onDragEnd=undefined;
                pointer.finally=undefined;
            }
            queueMicrotask(()=>openGallery(node));
            return true;
        };
        w.onClick=function(){};
        return w;
    };
    node.widgets?.forEach(patch);
    const originalAddCustomWidget=typeof node.addCustomWidget==="function"?node.addCustomWidget.bind(node):null;
    if(originalAddCustomWidget){
        node.addCustomWidget=function(widget){
            const result=originalAddCustomWidget(widget);
            patch(result??widget);
            return result;
        };
    }
    const scan=()=>node.widgets?.forEach(patch);
    requestAnimationFrame(scan);
    setTimeout(scan,50);
    setTimeout(scan,250);
    setTimeout(scan,1000);
}


function installGalleryPreviewNavigation(node){
    if(node.__cigPreviewNavWatcher)return;
    node.__cigPreviewNavWatcher=true;

    const inside=(p,r)=>!!r&&p[0]>=r.x&&p[0]<=r.x+r.w&&p[1]>=r.y&&p[1]<=r.y+r.h;

    const folderValues=()=>{
        const w=getImageWidget(node);
        if(!w)return [];
        const current=normalizePath(String(w.value??""));
        const folder=splitPath(current).folder;
        const raw=[...(Array.isArray(w.options?.values)?w.options.values:[]),...(Array.isArray(node.__cigGalleryValues)?node.__cigGalleryValues:[])];
        const seen=new Set(), out=[];
        for(const v of raw){
            const n=normalizePath(String(v??""));
            if(!n||splitPath(n).folder!==folder||seen.has(n))continue;
            seen.add(n); out.push(n);
        }
        return out;
    };

    const navigate=(dir)=>{
        const w=getImageWidget(node);
        if(!w)return;
        const current=normalizePath(String(w.value??""));
        const values=folderValues();
        if(values.length<2)return;
        let i=values.indexOf(current);
        if(i<0)i=0;
        i=(i+dir+values.length)%values.length;
        const next=values[i];
        node.__cigFolder=splitPath(next).folder;
        setWidgetValue(node,next);
    };

    const patch=(w)=>{
        if(!w||w.__cigPrecisePreviewPatched)return w;
        const isPreview=w.name==="$$canvas-image-preview"||(w.options?.canvasOnly===true&&typeof w.drawWidget==="function"&&typeof w.onPointerDown==="function");
        if(!isPreview)return w;
        w.__cigPrecisePreviewPatched=true;

        const originalDraw=typeof w.drawWidget==="function"?w.drawWidget.bind(w):null;
        const originalPointerDown=typeof w.onPointerDown==="function"?w.onPointerDown.bind(w):null;

        w.drawWidget=function(ctx,options){
            originalDraw?.(ctx,options);
            try{
                const imgs=options?.previewImages??node.imgs??[];
                if(!imgs.length){this.__cigImageRect=null;this.__cigPrevRect=null;this.__cigNextRect=null;return;}
                const index=node.imageIndex??0;
                const img=imgs[index]??imgs[0];
                const iw=Number(img?.naturalWidth||img?.width||0), ih=Number(img?.naturalHeight||img?.height||0);
                if(!(iw>0&&ih>0)){this.__cigImageRect=null;return;}
                const dw=Number(options?.width??node.size?.[0]??0);
                const dh=Math.max(1,Number(this.computedHeight??220));
                const sideReserve=Math.min(110,Math.max(72,dw*0.18)),previewWidth=Math.max(80,dw-sideReserve*2-16);const scale=Math.min(previewWidth/iw,dh/ih,1);
                const rw=iw*scale, rh=ih*scale;
                const rx=(dw-rw)/2, ry=Number(this.y??0)+(dh-rh)/2;
                this.__cigImageRect={x:rx,y:ry,w:rw,h:rh};

                const values=folderValues();
                if(values.length<2){this.__cigPrevRect=null;this.__cigNextRect=null;return;}

                const margin=6,gap=8,buttonY=Number(this.y??0)+margin,buttonH=Math.max(20,dh-margin*2);
                const leftX=margin,leftW=Math.max(0,rx-gap-leftX);
                const rightX=rx+rw+gap,rightW=Math.max(0,dw-margin-rightX);
                this.__cigPrevRect=leftW>=18?{x:leftX,y:buttonY,w:leftW,h:buttonH}:null;
                this.__cigNextRect=rightW>=18?{x:rightX,y:buttonY,w:rightW,h:buttonH}:null;

                const mouse=app.canvas?.graph_mouse;
                const local=mouse?[mouse[0]-node.pos[0],mouse[1]-node.pos[1]]:[-9999,-9999];
                const drawBtn=(r,text)=>{
                    if(!r)return;
                    const hover=inside(local,r);
                    ctx.save();
                    ctx.fillStyle=hover?"rgba(9,25,42,.98)":"rgba(28,28,28,.76)";
                    ctx.strokeStyle=hover?"rgba(120,180,255,1)":"rgba(255,255,255,.35)";
                    ctx.lineWidth=1.5;
                    ctx.beginPath();
                    ctx.roundRect(r.x,r.y,r.w,r.h,9);
                    ctx.fill(); ctx.stroke();
                    ctx.fillStyle="#fff";
                    ctx.font=`700 ${Math.max(30,Math.min(72,r.h*0.34,r.w*0.62))}px Arial,sans-serif`;
                    ctx.textAlign="center"; ctx.textBaseline="middle";
                    ctx.fillText(text,r.x+r.w/2,r.y+r.h/2-1);
                    ctx.restore();
                    if(hover&&app.canvas?.canvas)app.canvas.canvas.style.cursor="pointer";
                };
                drawBtn(this.__cigPrevRect,"‹");
                drawBtn(this.__cigNextRect,"›");
                if(inside(local,this.__cigImageRect)&&app.canvas?.canvas)app.canvas.canvas.style.cursor="pointer";
            }catch(err){console.warn("[ImageGallery] preview draw:",err);}
        };

        w.onPointerDown=function(pointer,nodeArg,canvas){
            try{
                const mouse=app.canvas?.graph_mouse;
                const p=mouse?[mouse[0]-node.pos[0],mouse[1]-node.pos[1]]:null;
                const button=pointer?.eDown?.button;
                if(p&&(button==null||button===0)){
                    if(inside(p,this.__cigPrevRect)){navigate(-1);return true;}
                    if(inside(p,this.__cigNextRect)){navigate(1);return true;}
                    if(inside(p,this.__cigImageRect)){queueMicrotask(()=>openGallery(node));return true;}
                }
            }catch(err){console.warn("[ImageGallery] preview pointer:",err);}
            return originalPointerDown?.(pointer,nodeArg,canvas)??true;
        };
        return w;
    };

    const scan=()=>node.widgets?.forEach(patch);
    scan();

    const originalAddCustomWidget=typeof node.addCustomWidget==="function"?node.addCustomWidget.bind(node):null;
    if(originalAddCustomWidget&&!node.__cigAddWidgetWrapped){
        node.__cigAddWidgetWrapped=true;
        node.addCustomWidget=function(widget){
            const result=originalAddCustomWidget(widget);
            patch(result??widget);
            return result;
        };
    }
    requestAnimationFrame(scan);
    setTimeout(scan,50);
    setTimeout(scan,250);
    setTimeout(scan,1000);
}
function installGalleryStartButton(node){
    if(node.__cigStartButtonSetup)return;
    node.__cigStartButtonSetup=true;
    const ensure=()=>{
        if(!node?.widgets)return;
        const previewIndex=node.widgets.findIndex(w=>w?.name==="$$canvas-image-preview");
        if(previewIndex<0)return;
        let button=node.widgets.find(w=>w?.name==="▶ СТАРТ");
        if(!button){
            button=node.addWidget("button","▶ СТАРТ",null,()=>{app.queuePrompt(0,1);},{serialize:false});
            button.serialize=false;
            button.computeSize=(width)=>[width??node.size?.[0]??320,64];
            button.computeLayoutSize=()=>({minHeight:64,maxHeight:64,minWidth:0});button.__cigTallDraw=true;button.drawWidget=function(ctx,options){const h=this.computedHeight??64,y=this.y??0,width=options?.width??node.size?.[0]??320,m=8;ctx.save();ctx.globalAlpha=this.computedDisabled?.45:1;ctx.fillStyle=this.clicked?this.outline_color:this.background_color;ctx.strokeStyle=this.outline_color;ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(m,y,width-m*2,h,12);ctx.fill();ctx.stroke();ctx.fillStyle=this.text_color;ctx.font="700 20px Arial,sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(`▶  ${cigT.start}`,width/2,y+h/2);ctx.restore();};
            // CIG_REMOVE_START_HEIGHT_GROWTH_V1
        }
        const pi=node.widgets.findIndex(w=>w?.name==="$$canvas-image-preview");
        const bi=node.widgets.indexOf(button);
        if(pi>=0&&bi>=0&&bi!==pi+1){
            node.widgets.splice(bi,1);
            const pi2=node.widgets.findIndex(w=>w?.name==="$$canvas-image-preview");
            node.widgets.splice(pi2+1,0,button);
        }
        node.graph?.setDirtyCanvas?.(true,true);
    };
    ensure();
    requestAnimationFrame(ensure);
    setTimeout(ensure,50);
    setTimeout(ensure,250);
    setTimeout(ensure,1000);
}

function hideGalleryTopWidgets(node){const apply=()=>{if(!node?.widgets)return;for(const w of node.widgets){if(!w||w.name==="$$canvas-image-preview"||w.name==="▶ СТАРТ")continue;w.hidden=true;w.computeSize=()=>[0,-4];w.computeLayoutSize=()=>({minHeight:0,maxHeight:0,minWidth:0,maxWidth:0});w.drawWidget=()=>{};}node.graph?.setDirtyCanvas?.(true,true);};apply();requestAnimationFrame(apply);setTimeout(apply,100);setTimeout(apply,500);}

function installGalleryDomFixV2(){
    if(window.__cigDomFixV2)return;
    window.__cigDomFixV2=true;
    if(!document.getElementById("cig-dom-fix-v2")){
        const st=document.createElement("style");
        st.id="cig-dom-fix-v2";
        st.textContent='.cig-footer{flex-wrap:nowrap!important;align-items:center!important}.cig-footer .cig-run{width:auto!important;min-width:0!important;height:auto!important;min-height:0!important;flex:0 0 auto!important;margin:0!important;padding:8px 12px!important;font-size:14px!important;font-weight:400!important;line-height:normal!important;border-radius:7px!important}.cig-footer>div[style*="flex-basis"]{display:none!important}';
        document.head.appendChild(st);
    }
    const fix=()=>{
        document.querySelectorAll(".cig-overlay").forEach(o=>{
            const f=o.querySelector(".cig-footer"),c=o.querySelector(".cig-clear"),r=o.querySelector(".cig-run");
            if(!f||!r)return;
            if(c&&r.previousElementSibling!==c)c.insertAdjacentElement("afterend",r);
            for(const d of [...f.children])if(d.tagName==="DIV"&&(d.getAttribute("style")||"").includes("flex-basis"))d.remove();
            f.style.setProperty("flex-wrap","nowrap","important");
            r.style.setProperty("width","auto","important");
            r.style.setProperty("min-width","0","important");
            r.style.setProperty("height","auto","important");
            r.style.setProperty("min-height","0","important");
            r.style.setProperty("flex","0 0 auto","important");
            r.style.setProperty("margin","0","important");
            r.style.setProperty("padding","8px 12px","important");
            r.style.setProperty("font-size","14px","important");
            r.style.setProperty("font-weight","400","important");
        });
    };
    new MutationObserver(fix).observe(document.body,{childList:true,subtree:true});
    fix();
}

function installGalleryPreviewNavigationV2(node){
    if(node.__cigPreviewNavV2)return;
    node.__cigPreviewNavV2=true;
    const inside=(p,r)=>!!p&&!!r&&p[0]>=r.x&&p[0]<=r.x+r.w&&p[1]>=r.y&&p[1]<=r.y+r.h;
    const values=()=>{
        const w=getImageWidget(node); if(!w)return [];
        const cur=normalizePath(String(w.value??"")),folder=splitPath(cur).folder,raw=Array.isArray(w.options?.values)?w.options.values:[];
        const seen=new Set(),out=[];
        for(const v of raw){const n=normalizePath(String(v??""));if(n&&splitPath(n).folder===folder&&!seen.has(n)){seen.add(n);out.push(n);}}
        return out;
    };
    const nav=dir=>{
        const w=getImageWidget(node),a=values(); if(!w||a.length<2)return;
        const cur=normalizePath(String(w.value??"")); let i=a.indexOf(cur); if(i<0)i=0;
        const n=a[(i+dir+a.length)%a.length]; node.__cigFolder=splitPath(n).folder; setWidgetValue(node,n);
    };
    const patch=()=>{
        const w=node.widgets?.find(x=>x?.name==="$$canvas-image-preview"||(x?.options?.canvasOnly===true&&typeof x?.drawWidget==="function"&&typeof x?.onPointerDown==="function"));
        if(!w||w.__cigPreviewNavV2Patched)return !!w;
        w.__cigPreviewNavV2Patched=true;
        const draw=typeof w.drawWidget==="function"?w.drawWidget.bind(w):null;
        const down=typeof w.onPointerDown==="function"?w.onPointerDown.bind(w):null;
        w.drawWidget=function(ctx,o){
            draw?.(ctx,o);
            try{
                const imgs=o?.previewImages??node.imgs??[],img=imgs[node.imageIndex??0]??imgs[0];
                const iw=Number(img?.naturalWidth||img?.width||0),ih=Number(img?.naturalHeight||img?.height||0);
                if(!(iw>0&&ih>0))return;
                const dw=Number(o?.width??node.size?.[0]??320),y=Number(this.y??0),h=Math.max(1,Number(this.computedHeight??220));
                const side=Math.min(120,Math.max(72,dw*.18)),cw=Math.max(80,dw-side*2);
                const sc=Math.min(cw/iw,h/ih,1),rw=iw*sc,rh=ih*sc,rx=side+(cw-rw)/2,ry=y+(h-rh)/2;
                this.__cigImageRect={x:rx,y:ry,w:rw,h:rh};
                this.__cigPrevRect={x:0,y:y,w:side,h:h};
                this.__cigNextRect={x:dw-side,y:y,w:side,h:h};
                ctx.save();
                ctx.fillStyle="#111";ctx.fillRect(0,y,dw,h);
                ctx.drawImage(img,rx,ry,rw,rh);
                const m=app.canvas?.graph_mouse,p=m?[m[0]-node.pos[0],m[1]-node.pos[1]]:[-9999,-9999];
                const btn=(r,t)=>{
                    const hov=inside(p,r);
                    ctx.fillStyle=hov?"rgba(5,16,28,.98)":"rgba(24,24,24,.9)";
                    ctx.strokeStyle=hov?"rgba(80,150,255,1)":"rgba(255,255,255,.28)";
                    ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(r.x+4,r.y+4,r.w-8,r.h-8,12);ctx.fill();ctx.stroke();
                    ctx.fillStyle="#fff";ctx.font=`700 ${Math.max(34,Math.min(64,r.w*.55,r.h*.38))}px Arial,sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(t,r.x+r.w/2,r.y+r.h/2-1);
                    if(hov&&app.canvas?.canvas)app.canvas.canvas.style.cursor="pointer";
                };
                if(values().length>1){btn(this.__cigPrevRect,"‹");btn(this.__cigNextRect,"›");}
                if(inside(p,this.__cigImageRect)&&app.canvas?.canvas)app.canvas.canvas.style.cursor="pointer";
                ctx.restore();
            }catch(e){console.warn("[ImageGallery] V2 draw",e);}
        };
        w.onPointerDown=function(pointer,nodeArg,canvas){
            try{
                const m=app.canvas?.graph_mouse,p=m?[m[0]-node.pos[0],m[1]-node.pos[1]]:null,b=pointer?.eDown?.button;
                if(p&&(b==null||b===0)){
                    if(inside(p,this.__cigPrevRect)){nav(-1);return true;}
                    if(inside(p,this.__cigNextRect)){nav(1);return true;}
                    if(inside(p,this.__cigImageRect)){queueMicrotask(()=>openGallery(node));return true;}
                }
            }catch(e){console.warn("[ImageGallery] V2 pointer",e);}
            return down?.(pointer,nodeArg,canvas)??true;
        };
        return true;
    };
    if(!patch()){requestAnimationFrame(patch);setTimeout(patch,50);setTimeout(patch,250);setTimeout(patch,1000);}
}




function installGalleryPreviewNavigationV3(node){
    if(node.__cigPreviewNavV3)return;
    node.__cigPreviewNavV3=true;

    const inside=(p,r)=>!!p&&!!r&&p[0]>=r.x&&p[0]<=r.x+r.w&&p[1]>=r.y&&p[1]<=r.y+r.h;

    const folderValues=()=>{
        const w=getImageWidget(node);
        if(!w)return [];
        const current=normalizePath(String(w.value??""));
        const folder=splitPath(current).folder;
        const raw=[...(Array.isArray(w.options?.values)?w.options.values:[]),...(Array.isArray(node.__cigGalleryValues)?node.__cigGalleryValues:[])];
        const seen=new Set(),out=[];
        for(const v of raw){
            const n=normalizePath(String(v??""));
            if(!n||splitPath(n).folder!==folder||seen.has(n))continue;
            seen.add(n);out.push(n);
        }
        return out;
    };

    const navigate=(dir)=>{
        const w=getImageWidget(node);
        const values=folderValues();
        if(!w||values.length<2)return;
        const current=normalizePath(String(w.value??""));
        let i=values.indexOf(current);
        if(i<0)i=0;
        const next=values[(i+dir+values.length)%values.length];
        node.__cigFolder=splitPath(next).folder;
        setWidgetValue(node,next);
    };

    const patch=(w)=>{
        if(!w||w.__cigNavV4Patched)return w;
        const isPreview=w.name==="$$canvas-image-preview"||(w.options?.canvasOnly===true&&typeof w.drawWidget==="function"&&typeof w.onPointerDown==="function");
        if(!isPreview)return w;
        w.__cigNavV4Patched=true;

        const stockPointer=typeof w.onPointerDown==="function"?w.onPointerDown.bind(w):null;

        w.drawWidget=function(ctx,options){
            try{
                const imgs=options?.previewImages??node.imgs??[];
                const img=imgs[node.imageIndex??0]??imgs[0];
                const dw=Number(options?.width??node.size?.[0]??0);
                const y=Number(this.y??0);
                const dh=Math.max(1,Number(this.computedHeight??220));

                ctx.save();
                ctx.fillStyle="#111";
                ctx.fillRect(0,y,dw,dh);

                if(!img){
                    this.__cigImageRect=null;
                    this.__cigPrevRect=null;
                    this.__cigNextRect=null;
                    ctx.restore();
                    return;
                }

                const iw=Number(img?.naturalWidth||img?.width||0);
                const ih=Number(img?.naturalHeight||img?.height||0);
                if(!(iw>0&&ih>0)){
                    this.__cigImageRect=null;
                    this.__cigPrevRect=null;
                    this.__cigNextRect=null;
                    ctx.restore();
                    return;
                }

                const outer=6;
                const gap=8;
                const landscape=(iw/ih)>=1.0;
                const minSide=landscape?Math.min(90,Math.max(58,dw*0.12)):0;
                const maxW=Math.max(40,dw-(outer*2)-(gap*2)-(minSide*2));
                const maxH=Math.max(40,dh-8);
                const scale=Math.min(maxW/iw,maxH/ih);
                const rw=iw*scale;
                const rh=ih*scale;
                const rx=(dw-rw)/2;
                const ry=y+(dh-rh)/2;

                this.__cigImageRect={x:rx,y:ry,w:rw,h:rh};

                ctx.drawImage(img,rx,ry,rw,rh);

                const values=folderValues();
                if(values.length>1){
                    const leftW=Math.max(0,rx-gap-outer);
                    const rightX=rx+rw+gap;
                    const rightW=Math.max(0,dw-outer-rightX);
                    this.__cigPrevRect=leftW>=30?{x:outer,y:y,w:leftW,h:dh}:null;
                    this.__cigNextRect=rightW>=30?{x:rightX,y:y,w:rightW,h:dh}:null;

                    const mouse=app.canvas?.graph_mouse;
                    const p=mouse?[mouse[0]-node.pos[0],mouse[1]-node.pos[1]]:[-9999,-9999];

                    const drawBtn=(r,text)=>{
                        if(!r)return;
                        const hover=inside(p,r);
                        ctx.fillStyle=hover?"rgba(6,18,32,.98)":"rgba(24,24,24,.88)";
                        ctx.strokeStyle=hover?"rgba(70,145,255,1)":"rgba(255,255,255,.28)";
                        ctx.lineWidth=1.5;
                        ctx.beginPath();
                        ctx.roundRect(r.x+3,r.y+3,Math.max(1,r.w-6),Math.max(1,r.h-6),12);
                        ctx.fill();
                        ctx.stroke();
                        ctx.fillStyle="#fff";
                        ctx.font=`700 ${Math.max(34,Math.min(72,r.w*.48,r.h*.28))}px Arial,sans-serif`;
                        ctx.textAlign="center";
                        ctx.textBaseline="middle";
                        ctx.fillText(text,r.x+r.w/2,r.y+r.h/2-1);
                        if(hover&&app.canvas?.canvas)app.canvas.canvas.style.cursor="pointer";
                    };

                    drawBtn(this.__cigPrevRect,"‹");
                    drawBtn(this.__cigNextRect,"›");
                }else{
                    this.__cigPrevRect=null;
                    this.__cigNextRect=null;
                }

                const mouse=app.canvas?.graph_mouse;
                const p=mouse?[mouse[0]-node.pos[0],mouse[1]-node.pos[1]]:null;
                if(inside(p,this.__cigImageRect)&&app.canvas?.canvas)app.canvas.canvas.style.cursor="pointer";
                ctx.restore();
            }catch(e){
                console.warn("[ImageGallery] V4 draw",e);
                try{ctx.restore();}catch(_){}
            }
        };

        w.onPointerDown=function(pointer,nodeArg,canvas){
            try{
                const mouse=app.canvas?.graph_mouse;
                const p=mouse?[mouse[0]-node.pos[0],mouse[1]-node.pos[1]]:null;
                const button=pointer?.eDown?.button;
                if(p&&(button==null||button===0)){
                    if(inside(p,this.__cigPrevRect)){navigate(-1);return true;}
                    if(inside(p,this.__cigNextRect)){navigate(1);return true;}
                    if(inside(p,this.__cigImageRect)){setTimeout(()=>openGallery(node),0);return true;}
                }
            }catch(e){
                console.warn("[ImageGallery] V4 pointer",e);
            }
            return stockPointer?.(pointer,nodeArg,canvas)??true;
        };
        return w;
    };

    const scan=()=>node.widgets?.forEach(patch);
    scan();
    requestAnimationFrame(scan);
    setTimeout(scan,50);
    setTimeout(scan,250);
    setTimeout(scan,1000);
}

function installGalleryFooterFixV3(){
    if(window.__cigFooterFixV3)return;
    window.__cigFooterFixV3=true;

    const apply=()=>{
        document.querySelectorAll(".cig-footer").forEach(footer=>{
            const folder=footer.querySelector(".cig-folder");
            const clear=footer.querySelector(".cig-clear");
            const run=footer.querySelector(".cig-run");
            if(!run||!clear)return;

            footer.querySelectorAll(":scope > div").forEach(el=>{
                const st=el.getAttribute("style")||"";
                if(/flex-basis\s*:\s*100%|width\s*:\s*100%/i.test(st))el.remove();
            });

            clear.insertAdjacentElement("afterend",run);

            Object.assign(footer.style,{
                flexWrap:"nowrap",
                alignItems:"center"
            });

            if(folder){
                folder.style.setProperty("flex","1 1 360px","important");
                folder.style.setProperty("min-width","280px","important");
                folder.style.setProperty("width","auto","important");
                folder.style.setProperty("max-width","none","important");
            }

            for(const btn of [clear,run]){
                btn.style.setProperty("flex","0 0 auto","important");
                btn.style.setProperty("width","auto","important");
                btn.style.setProperty("min-width","0","important");
                btn.style.setProperty("height","40px","important");
                btn.style.setProperty("min-height","40px","important");
                btn.style.setProperty("max-height","40px","important");
                btn.style.setProperty("padding","0 14px","important");
                btn.style.setProperty("margin","0","important");
                btn.style.setProperty("font-size","14px","important");
                btn.style.setProperty("font-weight","400","important");
                btn.style.setProperty("line-height","38px","important");
                btn.style.setProperty("border-radius","7px","important");
            }
        });
    };

    new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});
    apply();
}


app.registerExtension({name:EXTENSION_NAME,async nodeCreated(node){if(node.comfyClass!==NODE_CLASS&&node.type!==NODE_CLASS)return;if(node.widgets?.some(w=>w.name==="🖼 Превью папки"))return;const button=node.addWidget("button","🖼 Превью папки",null,()=>openGallery(node));button.serialize=false;if(node.widgets){const bi=node.widgets.indexOf(button),ii=node.widgets.findIndex(w=>w.name==="image");if(bi>=0&&ii>=0&&bi>ii){node.widgets.splice(bi,1);node.widgets.splice(ii,0,button);}}installGalleryPreviewNavigationV3(node);installGalleryStartButton(node);installCigTitleHelp(node);hideGalleryTopWidgets(node);installExternalPreviewRestore(node);// CIG_STABLE_NODE_HEIGHT_V1
const computed=node.computeSize?.();if(computed){const currentW=node.size?.[0]??computed[0];const currentH=node.size?.[1]??computed[1];const wantedW=Math.max(currentW,computed[0]);if(wantedW>currentW)node.setSize?.([wantedW,currentH]);}}});
