import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { installGalleryPreviewNavigation } from "./preview_navigation.js";
import { holdToZoom } from "./hold_zoom.js";
import { helpScenarios, renderScenarios } from "./help_scenarios.js";

const EXTENSION_NAME = "Comfy.ImageGallery";
const NODE_CLASS = "LoadImageGallery";
const CIG_LANG = String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
const CIG_I18N = {
    en: { root:"📁 input (root)", title:"Image Gallery", search:"Search by filename…", refresh:"Refresh", folder:"Folder:", clearCache:"Clear cache", start:"START", selected:"selected", cache:"Cache", noMatches:"No matching images", noImages:"No images in this folder", loadingList:"Loading list…", up:"Up", clearing:"Clearing…", error:"Error", thumbError:"error", subfolders:"Subfolders", subfoldersTitle:"Also show images from all subfolders of this folder", noImagesDeep:"No images in this folder or its subfolders", truncated:"list cut off" },
    ru: { root:"📁 input (корень)", title:"Превью изображений", search:"Поиск по имени файла…", refresh:"Обновить", folder:"Папка:", clearCache:"Очистить кэш", start:"СТАРТ", selected:"выбрано", cache:"Кэш", noMatches:"По этому поиску ничего не найдено", noImages:"В папке нет изображений", loadingList:"Загрузка списка…", up:"Вверх", clearing:"Очистка…", error:"Ошибка", thumbError:"ошибка", subfolders:"Подпапки", subfoldersTitle:"Показывать также изображения из всех подпапок этой папки", noImagesDeep:"В папке и её подпапках нет изображений", truncated:"список обрезан" }
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
.cig-header{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #383838;flex:0 0 auto}.cig-title{font-size:18px;font-weight:700;white-space:nowrap}.cig-search{flex:1;min-width:120px;background:#262626;color:#eee;border:1px solid #4a4a4a;border-radius:7px;padding:9px 11px;font-size:14px;outline:none}.cig-search:focus{border-color:#888}.cig-close,.cig-refresh,.cig-clear,.cig-sort{background:#2c2c2c;color:#eee;border:1px solid #505050;border-radius:7px;padding:8px 12px;cursor:pointer}.cig-close:hover,.cig-refresh:hover,.cig-clear:hover,.cig-sort:hover{background:#3a3a3a}.cig-close:disabled,.cig-refresh:disabled,.cig-clear:disabled,.cig-sort:disabled{opacity:.45;cursor:default}
.cig-body{flex:1 1 auto;min-height:0;overflow:auto;padding:16px;contain:strict}.cig-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;align-items:start}.cig-card{position:relative;background:#222;border:2px solid transparent;border-radius:9px;padding:6px;cursor:pointer;min-width:0;transition:border-color .12s,background .12s,transform .08s;content-visibility:auto;contain-intrinsic-size:180px 205px}.cig-card:hover{background:#2b2b2b;transform:translateY(-1px)}.cig-card:focus{outline:none}.cig-card.cig-keynav-focus{outline:2px solid #6ba7ff;outline-offset:2px}.cig-card.selected{border-color:#6ba7ff;background:#26364b}.cig-thumb-wrap{width:100%;aspect-ratio:1/1;background:#111;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center;position:relative}.cig-thumb{width:100%;height:100%;object-fit:contain;display:block}.cig-thumb:not([src]){visibility:hidden}.cig-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#666;font-size:12px}.cig-card.loaded .cig-placeholder{display:none}.cig-card.error .cig-placeholder{color:#a77}.cig-name{font-size:12px;line-height:1.25;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;color:#ddd}.cig-empty{grid-column:1/-1;padding:40px;text-align:center;color:#aaa;font-size:15px}.cig-footer{display:flex;align-items:center;gap:10px;flex:0 0 auto;border-top:1px solid #383838;padding:12px 16px;background:#1d1d1d}.cig-footer-top{display:flex;align-items:center;gap:10px}.cig-folder-label{white-space:nowrap;font-size:13px;color:#bbb}.cig-folder{flex:1 1 360px;min-width:280px;background:#292929;color:#eee;border:1px solid #4b4b4b;border-radius:7px;padding:9px 10px;font-size:14px}.cig-count,.cig-cache{font-size:12px;color:#aaa;white-space:nowrap}.cig-run{display:inline-flex;align-items:center;justify-content:center;width:auto;height:40px;margin:0;border:1px solid #5a5a5a;border-radius:7px;background:#303030;color:#fff;padding:0 14px;font-size:14px;font-weight:400;line-height:38px;cursor:pointer}.cig-run:hover{background:#3a3a3a}.cig-run:disabled{opacity:.45;cursor:default}
.cig-pick-folder{flex:0 0 auto;width:44px;height:40px;min-width:44px;padding:0;margin:0;background:#2c2c2c;color:#eee;border:1px solid #505050;border-radius:7px;font-size:18px;font-weight:700;line-height:38px;cursor:pointer}.cig-pick-folder:hover{background:#3a3a3a}.cig-pick-folder:disabled{opacity:.45;cursor:default}
.cig-breadcrumbs{flex:0 0 auto;display:flex;align-items:center;gap:3px;min-height:32px;padding:4px 16px;border-bottom:1px solid #303030;background:#1d1d1d;overflow-x:auto;white-space:nowrap}.cig-crumb{border:0;background:transparent;color:#9ec8ff;padding:4px 6px;border-radius:5px;cursor:pointer;font-size:12px}.cig-crumb:hover{background:#303a46;color:#fff}.cig-crumb-sep{color:#666}.cig-up-folder{flex:0 0 auto;width:40px;height:40px;min-width:40px;padding:0;margin:0;background:#2c2c2c;color:#eee;border:1px solid #505050;border-radius:7px;font-size:22px;line-height:38px;cursor:pointer}.cig-up-folder:hover{background:#3a3a3a}.cig-up-folder:disabled{opacity:.3;cursor:default}.cig-folder-card{position:relative;background:#24282d;border:2px solid transparent;border-radius:9px;padding:6px;cursor:pointer;min-width:0;user-select:none}.cig-folder-card:hover{background:#303740;border-color:#53677e}.cig-folder-icon{width:100%;aspect-ratio:1/1;background:#191d22;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:58px}.cig-folder-name{font-size:12px;line-height:1.25;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;color:#ddd}
/* CIG_FAVORITES_CORNER_V3 */ .cig-favorite{position:absolute;top:0;right:0;z-index:3;width:38px;height:38px;min-width:38px;padding:0;border:0;border-radius:0;background:transparent;color:rgba(255,255,255,.68);font-size:24px;line-height:38px;text-align:center;cursor:pointer;touch-action:manipulation;user-select:none;opacity:.78;text-shadow:0 1px 3px rgba(0,0,0,.85)}.cig-favorite:hover{background:transparent;color:#fff;opacity:1}.cig-favorite.active{color:#ff6f8f;background:transparent;opacity:1;text-shadow:0 1px 3px rgba(0,0,0,.9)}
/* CIG_SORT_MENU_V1 */ .cig-sort{flex:0 0 auto;width:40px;height:38px;min-width:40px;padding:0;font-size:21px;line-height:36px}.cig-sort-menu{position:fixed;z-index:100030;min-width:210px;padding:6px;background:#242424;border:1px solid #4b4b4b;border-radius:8px;box-shadow:0 10px 35px rgba(0,0,0,.6)}.cig-sort-menu button{display:flex;align-items:center;gap:9px;width:100%;height:40px;padding:0 12px;border:0;border-radius:5px;background:transparent;color:#eee;text-align:left;font-size:14px;cursor:pointer;white-space:nowrap}.cig-sort-menu button:hover{background:#3a3a3a}.cig-sort-menu button.active{color:#9ec8ff;background:#303a46}.cig-sort-check{width:14px;display:inline-block;text-align:center}
/* CIG_IMAGE_SETS_V1 */ .cig-sets{flex:0 0 auto;height:40px;padding:0 12px;margin:0;background:#2c2c2c;color:#eee;border:1px solid #505050;border-radius:7px;font-size:13px;cursor:pointer;white-space:nowrap}.cig-sets:hover{background:#3a3a3a}.cig-sets:disabled{opacity:.45;cursor:default}.cig-sets-menu{position:fixed;z-index:100040;width:330px;max-height:min(520px,70vh);overflow:auto;padding:7px;background:#242424;border:1px solid #4b4b4b;border-radius:9px;box-shadow:0 12px 40px rgba(0,0,0,.65)}.cig-sets-menu button{font-family:Arial,sans-serif}.cig-sets-create{width:100%;height:38px;border:0;border-radius:6px;background:#303a46;color:#dcecff;text-align:left;padding:0 11px;cursor:pointer;font-size:13px}.cig-sets-create:hover{background:#38485a}.cig-sets-create:disabled{opacity:.4;cursor:default}.cig-sets-empty{padding:14px 10px;color:#888;font-size:12px;text-align:center}.cig-set-row{margin-top:6px;border:1px solid #3a3a3a;border-radius:7px;overflow:hidden;background:#202020}.cig-set-main{display:flex;align-items:stretch;min-height:38px}.cig-set-load{flex:1;min-width:0;border:0;background:transparent;color:#eee;text-align:left;padding:0 10px;cursor:pointer;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cig-set-load:hover{background:#303030}.cig-set-count{color:#888;margin-left:7px;font-size:11px}.cig-set-more{width:38px;min-width:38px;border:0;border-left:1px solid #383838;background:transparent;color:#bbb;cursor:pointer;font-size:18px}.cig-set-more:hover{background:#333;color:#fff}.cig-set-actions{display:none;padding:6px;border-top:1px solid #383838;background:#1d1d1d}.cig-set-row.editing .cig-set-actions{display:grid;grid-template-columns:1fr 1fr;gap:5px}.cig-set-actions button{height:32px;border:1px solid #444;border-radius:5px;background:#2a2a2a;color:#ddd;cursor:pointer;font-size:11px;padding:0 7px}.cig-set-actions button:hover{background:#373737}.cig-set-actions button.danger{color:#ff9b9b}.cig-set-actions button:disabled{opacity:.4;cursor:default}
/* CIG_FOLDER_PREVIEW_V1 */ .cig-folder-icon{position:relative;overflow:hidden}.cig-folder-icon.has-preview{display:grid;gap:2px;font-size:0;background:#191d22}.cig-folder-icon.has-preview[data-count="1"]{grid-template:1fr/1fr}.cig-folder-icon.has-preview[data-count="2"]{grid-template:1fr/1fr 1fr}.cig-folder-icon.has-preview[data-count="3"],.cig-folder-icon.has-preview[data-count="4"]{grid-template:1fr 1fr/1fr 1fr}.cig-folder-icon.has-preview[data-count="3"] .cig-folder-tile:first-child{grid-row:span 2}.cig-folder-tile{width:100%;height:100%;min-width:0;min-height:0;object-fit:cover;display:block;background:#111;opacity:0;transition:opacity .18s}.cig-folder-tile.loaded{opacity:1}.cig-folder-badge{position:absolute;left:5px;bottom:5px;z-index:2;display:flex;align-items:center;gap:4px;max-width:calc(100% - 10px);padding:2px 7px 2px 5px;border-radius:999px;background:rgba(15,18,22,.82);border:1px solid rgba(120,150,185,.35);color:#dfe8f2;font-size:12px;line-height:18px;pointer-events:none;white-space:nowrap}.cig-folder-badge-icon{font-size:13px}
/* CIG_RECURSIVE_LIST_V1 */ .cig-header .cig-subfolders{flex:0 0 auto;height:38px;padding:0 12px;margin:0;box-sizing:border-box;border:1px solid rgba(255,255,255,.14);border-radius:6px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font-size:13px;white-space:nowrap;cursor:pointer}.cig-header .cig-subfolders:hover{filter:brightness(1.17)}.cig-header .cig-subfolders.active{background:#303a46;border-color:#6ba7ff;color:#dcecff}
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
// CIG_BROWSER_CACHE_VERSION_V2
const CIG_THUMB_CACHE_VERSION_KEY="ComfyUI-LoadImageGallery.thumbCacheVersion";
function getThumbCacheVersion(){try{return localStorage.getItem(CIG_THUMB_CACHE_VERSION_KEY)||"1";}catch(_){return "1";}}
function bumpThumbCacheVersion(){const v=String(Date.now());try{localStorage.setItem(CIG_THUMB_CACHE_VERSION_KEY,v);}catch(_){}return v;}
function thumbnailUrl(folder, filename) { const p = new URLSearchParams(); p.set("folder", folder || ""); p.set("filename", filename); p.set("v",getThumbCacheVersion()); return api.apiURL(`/image-gallery/thumb?${p.toString()}`); }
function originalUrl(folder, filename) { const p = new URLSearchParams(); p.set("folder", folder || ""); p.set("filename", filename); return api.apiURL(`/image-gallery/original?${p.toString()}`); }
async function fetchJson(path, options) { const r = await api.fetchApi(path, options); if (!r.ok) { let d=`${r.status}`; try{d=(await r.json()).error||d;}catch(_){} throw new Error(d); } return await r.json(); }
function getImageWidget(node) { return node.widgets?.find(w => w.name === "image") || null; }
// CIG_WORKFLOW_PERSIST_V4
const CIG_LAST_IMAGE_KEY="ComfyUI-LoadImageGallery.lastImage";
function captureSerializedGalleryImage(graphData){
    const visit=g=>{
        if(!g||typeof g!=="object")return;
        for(const n of (Array.isArray(g.nodes)?g.nodes:[])){
            if(n?.type!==NODE_CLASS)continue;
            const positional=Array.isArray(n.widgets_values)?n.widgets_values[0]:"";
            const value=normalizePath(String(n?.properties?.__cigLastImage??n?.widgets_values_named?.image??positional??""));
            if(value){
                n.properties=n.properties||{};
                n.properties.__cigLastImage=value;
            }
        }
        const subs=g?.definitions?.subgraphs;
        if(Array.isArray(subs))for(const sg of subs)visit(sg);
    };
    visit(graphData);
}
function restoreSerializedGalleryImage(node){
    if(node?.comfyClass!==NODE_CLASS&&node?.type!==NODE_CLASS)return;
    const value=normalizePath(String(node?.properties?.__cigLastImage??""));
    if(!value)return;
    // CIG_ABSOLUTE_PREVIEW_GUARD_V1
    if(isAbsoluteGalleryPath(value)){
        const w=getImageWidget(node);
        if(!w)return;
        // Не даём штатному ComfyUI отправить абсолютный путь в /view.
        w.value=null;
        requestAnimationFrame(()=>{
            if(!node.graph)return;
            setWidgetValue(node,value,false);
        });
        return;
    }
    setWidgetValue(node,value,false);
}
// CIG_EXTERNAL_FOLDER_PICKER_V3
function isAbsoluteGalleryPath(value){const v=String(value??"").replace(/\\/g,"/");return /^[A-Za-z]:\//.test(v)||v.startsWith("//");}
function externalSourceUrl(path){const p=new URLSearchParams();p.set("path",path);p.set("_",String(Date.now()));return api.apiURL(`/image-gallery/source?${p.toString()}`);}
function loadExternalPreview(node,path){if(!node||!isAbsoluteGalleryPath(path))return;const clean=normalizePath(path);const token=(node.__cigExternalPreviewToken??0)+1;node.__cigExternalPreviewToken=token;const img=new Image();img.decoding="async";img.onload=()=>{if(node.__cigExternalPreviewToken!==token)return;node.__cigExternalPreviewPath=clean;node.imgs=[img];node.imageIndex=0;node.graph?.setDirtyCanvas?.(true,true);};img.onerror=()=>console.warn("[ImageGallery] external preview failed:",clean);img.src=externalSourceUrl(clean);}
function installExternalPreviewRestore(node){const apply=()=>{const w=getImageWidget(node),v=normalizePath(String(w?.value??""));if(isAbsoluteGalleryPath(v))loadExternalPreview(node,v);};requestAnimationFrame(apply);setTimeout(apply,150);setTimeout(apply,600);}
function setWidgetValue(node,relativePath,captureState=true){
    const w=getImageWidget(node);
    if(!w)return;
    const value=normalizePath(String(relativePath??""));
    if(Array.isArray(w.options?.values)&&!w.options.values.includes(value)){
        w.options.values.push(value);
        w.options.values.sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"}));
    }
    w.value=value;
    node.__cigPreviewNavigation?.refresh();
    if(value){node.properties=node.properties||{};node.properties.__cigLastImage=value;try{localStorage.setItem(CIG_LAST_IMAGE_KEY,value);}catch(_){}}
    if(isAbsoluteGalleryPath(value)){
        loadExternalPreview(node,value);
    }else{
        node.__cigExternalPreviewToken=(node.__cigExternalPreviewToken??0)+1;
        node.__cigExternalPreviewPath=null;
        w.callback?.(value);
    }
    node.graph?.setDirtyCanvas?.(true,true);
    // CIG_CAPTURE_ACTIVE_WORKFLOW_V4
    if(captureState&&!app.configuringGraph){
        try{
            const wf=app?.extensionManager?.workflow?.activeWorkflow;
            wf?.changeTracker?.captureCanvasState?.();
        }catch(e){
            console.warn("[ImageGallery] workflow state capture failed",e);
        }
    }
}
// CIG_RECURSIVE_LIST_V1
const CIG_SUBFOLDERS_KEY="ComfyUI-LoadImageGallery.includeSubfolders";
function subfoldersEnabled(){try{return localStorage.getItem(CIG_SUBFOLDERS_KEY)==="1";}catch(_){return false;}}
function isInsideGalleryFolder(path,folder){
    const p=normalizePath(String(path??"")),f=normalizePath(String(folder??""));
    return f?p.startsWith(f+"/"):!!p&&!isAbsoluteGalleryPath(p);
}
// CIG_DETACHED_BATCH_QUEUE_V1
// Batch queueing belongs to the node, not to the gallery modal. Closing the
// gallery only removes its UI; this task keeps queueing the captured image list.
const CIG_BATCH_JOBS = new WeakMap();

function notifyBatchJob(job){
    for(const listener of [...job.listeners]){
        try{listener(job);}catch(error){console.warn("[ImageGallery] batch listener:",error);}
    }
}

function watchBatchJob(job,listener){
    if(!job||typeof listener!=="function")return ()=>{};
    job.listeners.add(listener);
    try{listener(job);}catch(_){}
    return ()=>job.listeners.delete(listener);
}

function startDetachedBatchQueue(node,sourceList){
    const existing=CIG_BATCH_JOBS.get(node);
    if(existing?.running)return existing;

    const list=[...sourceList].map(v=>normalizePath(String(v??""))).filter(Boolean);
    if(!list.length)return null;

    const job={running:true,index:0,total:list.length,list,listeners:new Set(),error:null,promise:null};
    CIG_BATCH_JOBS.set(node,job);

    job.promise=(async()=>{
        try{
            for(let i=0;i<list.length;i++){
                if(!node?.graph)throw new Error("Load Image Gallery node was removed");
                const relative=list[i];
                setWidgetValue(node,relative);
                // In the flat subfolder view the gallery stays on the folder it was started from.
                if(!(subfoldersEnabled()&&isInsideGalleryFolder(relative,node.__cigFolder)))node.__cigFolder=splitPath(relative).folder;
                job.index=i+1;
                notifyBatchJob(job);

                // Do not depend on the gallery DOM or requestAnimationFrame:
                // the modal may already be closed when the next prompt is queued.
                await new Promise(resolve=>setTimeout(resolve,0));
                await app.queuePrompt(0,1);
            }
        }catch(error){
            job.error=error;
            console.error("[ImageGallery] detached batch queue:",error);
        }finally{
            job.running=false;
            notifyBatchJob(job);
            if(CIG_BATCH_JOBS.get(node)===job)CIG_BATCH_JOBS.delete(node);
            job.listeners.clear();
        }
    })();

    return job;
}

function humanBytes(n){ if(!Number.isFinite(n))return ""; const u=CIG_LANG==="ru"?["Б","КБ","МБ","ГБ"]:["B","KB","MB","GB"]; let i=0,v=n; while(v>=1024&&i<u.length-1){v/=1024;i++;} return `${v.toFixed(i<2?0:1)} ${u[i]}`; }

function makeThumbLoader(root,onProgress=null) {
    let epoch=0, active=0, queue=[], disposed=false;
    const controllers=new Set();
    const observer=new IntersectionObserver(entries=>{ for(const e of entries){ const c=e.target; c.__cigVisible=e.isIntersecting; if(e.isIntersecting){ enqueue(c); } else if(c.__cigController){ c.__cigController.abort(); } } },{root,rootMargin:OBSERVER_MARGIN,threshold:0.01});
    function enqueue(card){ if(disposed||card.__cigLoaded||card.__cigQueued||!card.__cigVisible)return; card.__cigQueued=true; card.__cigEpoch=epoch; queue.push(card); pump(); }
    function pump(){ while(!disposed&&active<MAX_PARALLEL_THUMBS&&queue.length){ const card=queue.shift(); card.__cigQueued=false; if(!card.isConnected||!card.__cigVisible||card.__cigLoaded||card.__cigEpoch!==epoch)continue; load(card,epoch); } }
    async function load(card,myEpoch){ active++; const controller=new AbortController(); card.__cigController=controller; controllers.add(controller); const img=card.querySelector(".cig-thumb"); try{ const r=await fetch(card.__cigUrl,{signal:controller.signal,cache:"force-cache"})/* CIG_BROWSER_CACHE_VERSION_V2 */; if(!r.ok)throw new Error(String(r.status)); const blob=await r.blob(); if(disposed||myEpoch!==epoch||!card.isConnected)return; const url=URL.createObjectURL(blob); card.__cigObjectUrl=url; img.onload=()=>{ URL.revokeObjectURL(url); card.__cigObjectUrl=null; card.__cigLoaded=true; card.classList.add("loaded"); }; img.onerror=()=>{ URL.revokeObjectURL(url); card.__cigObjectUrl=null; card.classList.add("error"); card.querySelector(".cig-placeholder").textContent=cigT.thumbError; }; img.src=url; } catch(err){ if(err?.name!=="AbortError"&&card.isConnected){ card.classList.add("error"); card.querySelector(".cig-placeholder").textContent=cigT.thumbError; } } finally{ controllers.delete(controller); card.__cigController=null; active=Math.max(0,active-1); pump(); try{onProgress?.();}catch(_){} } }
    function observe(card){ observer.observe(card); }
    function reset(){ epoch++; queue=[]; for(const c of controllers)c.abort(); controllers.clear(); observer.disconnect(); root.querySelectorAll?.(".cig-card").forEach(card=>{ if(card.__cigObjectUrl){URL.revokeObjectURL(card.__cigObjectUrl);card.__cigObjectUrl=null;} }); }
    function dispose(){ disposed=true; reset(); }
    return {observe,reset,dispose};
}

// CIG_FOLDER_PREVIEW_V1
// Folder cards show a collage of up to four thumbnails. The image list per
// folder is requested only when its card is near the viewport, at most two at
// a time, and memoized for the lifetime of the open gallery.
const FOLDER_PREVIEW_PARALLEL = 2;
function makeFolderPreviewLoader(root, cache) {
    let active=0, queue=[], disposed=false;
    const observer=new IntersectionObserver(entries=>{ for(const e of entries){ if(e.isIntersecting){ observer.unobserve(e.target); queue.push(e.target); pump(); } } },{root,rootMargin:OBSERVER_MARGIN,threshold:0.01});
    function pump(){ while(!disposed&&active<FOLDER_PREVIEW_PARALLEL&&queue.length){ const card=queue.shift(); if(card.isConnected) load(card); } }
    function request(folder){ let p=cache.get(folder); if(!p){ p=fetchJson(`/image-gallery/folder-preview?folder=${encodeURIComponent(folder)}`).catch(err=>{ cache.delete(folder); throw err; }); cache.set(folder,p); } return p; }
    async function load(card){
        active++;
        try{
            const data=await request(card.__cigFolderPath);
            if(disposed||!card.isConnected)return;
            await apply(card,data);
        }catch(_){ /* keep the plain folder icon */ }
        finally{ active=Math.max(0,active-1); pump(); }
    }
    function apply(card,data){
        const icon=card.querySelector(".cig-folder-icon");
        const picks=(Array.isArray(data?.images)?data.images:[]).slice(0,4);
        const total=Number(data?.count)||0;
        if(!icon||!picks.length)return;
        icon.replaceChildren();
        icon.classList.add("has-preview");
        icon.dataset.count=String(picks.length);
        const loads=picks.map(pick=>new Promise(resolve=>{
            const img=document.createElement("img");
            img.className="cig-folder-tile"; img.decoding="async"; img.alt=""; img.draggable=false;
            img.onload=()=>{ img.classList.add("loaded"); resolve(); };
            img.onerror=()=>resolve();
            img.src=thumbnailUrl(pick.folder,pick.filename);
            icon.appendChild(img);
        }));
        const badge=document.createElement("div"); badge.className="cig-folder-badge";
        const glyph=document.createElement("span"); glyph.className="cig-folder-badge-icon"; glyph.textContent="📁";
        badge.appendChild(glyph);
        if(total>0){ const n=document.createElement("span"); n.textContent=String(total); badge.appendChild(n); }
        icon.appendChild(badge);
        return Promise.all(loads);
    }
    function observe(card){ if(!disposed) observer.observe(card); }
    function dispose(){ disposed=true; queue=[]; observer.disconnect(); }
    return {observe,dispose};
}

// CIG_HELP_SAFE_V1
function showCigHelp(){
    document.querySelector(".cig-help-overlay")?.remove();
    // CIG_SCENARIO_HELP_V2: scenarios 1–8 from help_scenarios.js (same numbering as the README).
    const help=helpScenarios(CIG_LANG);
    const ov=document.createElement("div");ov.className="cig-help-overlay";ov.dataset.cigHelpClosePatched="1";ov.style.cssText="position:fixed;inset:0;z-index:100100;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:20px";
    const box=document.createElement("div");box.style.cssText="width:min(620px,94vw);max-height:86vh;overflow:auto;background:#1d1d1d;color:#eee;border:1px solid #555;border-radius:12px;box-shadow:0 20px 70px rgba(0,0,0,.65);font-family:Arial,sans-serif";
    const head=document.createElement("div");head.style.cssText="position:sticky;top:0;z-index:2;min-height:34px;padding:15px 120px 15px 18px;border-bottom:1px solid #383838;background:#1d1d1d;box-sizing:border-box";
    const title=document.createElement("div");title.style.cssText="font-size:18px;font-weight:700;line-height:34px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";title.textContent=help.imageTitle;
    const x=document.createElement("button");x.type="button";x.textContent=CIG_LANG==="ru"?"Закрыть":"Close";x.title=x.textContent;x.style.cssText="all:unset;box-sizing:border-box;position:absolute;right:18px;top:15px;width:84px;height:34px;display:flex;align-items:center;justify-content:center;background:#2c2c2c;color:#eee;border:1px solid #555;border-radius:7px;cursor:pointer;font:500 13px/1 Arial,sans-serif;white-space:nowrap;text-align:center";
    const content=document.createElement("div");content.style.cssText="padding:10px 18px 18px";
    renderScenarios(content,help.images,help.imageFooter);
    head.append(title,x);box.append(head,content);ov.appendChild(box);document.body.appendChild(ov);
    x.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();ov.remove();});
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
    let imageMeta = new Map();
    const CIG_SORT_KEY="ComfyUI-LoadImageGallery.sortMode";
    const sortChoices=[
        ["name-asc","Имя: А → Я","Name: A → Z"],
        ["name-desc","Имя: Я → А","Name: Z → A"],
        ["date-desc","Новые сначала","Newest first"],
        ["date-asc","Старые сначала","Oldest first"],
        ["size-desc","Большие сначала","Largest first"],
        ["size-asc","Маленькие сначала","Smallest first"]
    ];
    let sortMode=(()=>{try{return localStorage.getItem(CIG_SORT_KEY)||"name-asc";}catch(_){return "name-asc";}})();
    if(!sortChoices.some(x=>x[0]===sortMode))sortMode="name-asc";
    // CIG_RECURSIVE_LIST_V1
    // With "Subfolders" on, image names are relative to activeFolder and may
    // contain "/" ("sub/a.png"); joinPath(activeFolder,name) stays the real path.
    let includeSubfolders=subfoldersEnabled();
    let listTruncated=false;
    // The node's ‹ › arrows walk the list an image was picked from; in the
    // flat subfolder view that is the whole tree below this folder.
    function rememberNavFolder(){node.properties=node.properties||{};node.properties.__cigNavFolder=activeFolder;}
    function imageLocation(name){
        const i=name.lastIndexOf("/");
        if(i<0)return {folder:activeFolder,filename:name,sub:""};
        const sub=name.slice(0,i);
        const base=/^[A-Za-z]:\/$/.test(activeFolder)?activeFolder:activeFolder?activeFolder+"/":"";
        return {folder:base+sub,filename:name.slice(i+1),sub};
    }
    // The subfolder view is flat: images behave as if they all lay in the open
    // folder, so search and name sorting look at the file name only.
    const imageBaseName=name=>name.slice(name.lastIndexOf("/")+1);
    const matchesFilter=(name,needle)=>imageBaseName(name).toLocaleLowerCase().includes(needle);
    // CIG_SELECTION_PERSIST_V1
    if(!(node.__cigSelectedPaths instanceof Set)){
        node.__cigSelectedPaths=new Set(Array.isArray(node.__cigSelectedPaths)?node.__cigSelectedPaths:[]);
    }
    const selected=node.__cigSelectedPaths;
    // CIG_FAVORITES_V1
    // CIG_FAVORITES_CORNER_V2
    const CIG_FAVORITES_KEY="ComfyUI-LoadImageGallery.favorites";
    function loadFavorites(){
        try{
            const raw=JSON.parse(localStorage.getItem(CIG_FAVORITES_KEY)||"[]");
            return new Set(Array.isArray(raw)?raw.map(v=>normalizePath(String(v??""))).filter(Boolean):[]);
        }catch(_){return new Set();}
    }
    function saveFavorites(){
        try{localStorage.setItem(CIG_FAVORITES_KEY,JSON.stringify([...favorites]));}catch(_){}
    }
    const favorites=loadFavorites();
    const isFavorite=relative=>favorites.has(normalizePath(String(relative??"")));
    function setFavorite(relative,on){
        const key=normalizePath(String(relative??""));
        if(!key)return;
        if(on)favorites.add(key);else favorites.delete(key);
        saveFavorites();
    }


    const overlay = document.createElement("div");
    overlay.className = "cig-overlay";
    overlay.innerHTML = `<div class="cig-panel" role="dialog" aria-modal="true">
        <div class="cig-header">
            <div class="cig-title">${cigT.title}</div>
            <input class="cig-search" type="search" placeholder="${cigT.search}">
            <button class="cig-sort" type="button">⇅</button>
            <button class="cig-subfolders" type="button" title="${cigT.subfoldersTitle}">${cigT.subfolders}</button>
            <button class="cig-refresh" type="button">↻ ${cigT.refresh}</button>
            <button class="cig-close" type="button">✕</button>
        </div>
        <div class="cig-breadcrumbs"></div><div class="cig-body"><div class="cig-grid"></div></div>
        <div class="cig-footer">
            <span class="cig-folder-label">${cigT.folder}</span>
            <select class="cig-folder"></select><button class="cig-up-folder" type="button" title="${cigT.up}">↑</button><button class="cig-pick-folder" type="button">...</button>
            <span class="cig-count"></span>
            <span class="cig-cache"></span>
            <button class="cig-clear" type="button">${cigT.clearCache}</button>
            <button class="cig-sets" type="button">${CIG_LANG==="ru"?"Наборы ▾":"Sets ▾"}</button>
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
    const setsButton = overlay.querySelector(".cig-sets");
    const cacheInfo = overlay.querySelector(".cig-cache");
    const sortButton = overlay.querySelector(".cig-sort");
    const subfoldersButton = overlay.querySelector(".cig-subfolders");
    const syncSubfoldersButton=()=>{subfoldersButton.classList.toggle("active",includeSubfolders);subfoldersButton.setAttribute("aria-pressed",includeSubfolders?"true":"false");};
    syncSubfoldersButton();
    subfoldersButton.addEventListener("click",e=>{
        e.preventDefault();e.stopPropagation();
        __cigSaveScroll();
        includeSubfolders=!includeSubfolders;
        try{localStorage.setItem(CIG_SUBFOLDERS_KEY,includeSubfolders?"1":"0");}catch(_){}
        syncSubfoldersButton();
        void loadFolder(activeFolder).catch(error=>{grid.innerHTML="";const e=document.createElement("div");e.className="cig-empty";e.textContent=`${cigT.error}: ${error?.message??error}`;grid.appendChild(e);});
    });
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

    // CIG_IMAGE_SETS_V1
    const setUi=CIG_LANG==="ru"?{
        create:"+ Создать из выделенных",empty:"Сохранённых наборов пока нет",replace:"Заменить текущим",add:"Добавить выделенные",remove:"Убрать выделенные",rename:"Переименовать",del:"Удалить",start:"Старт",name:"Название набора",confirmDelete:"Удалить набор",error:"Ошибка наборов"
    }:{
        create:"+ Create from selected",empty:"No saved sets yet",replace:"Replace with selected",add:"Add selected",remove:"Remove selected",rename:"Rename",del:"Delete",start:"Start",name:"Set name",confirmDelete:"Delete set",error:"Sets error"
    };
    let __cigSetsMenu=null;
    let __cigSavedSets=[];

    function closeSetsMenu(){__cigSetsMenu?.remove();__cigSetsMenu=null;}
    function normalizeSetList(data){
        return (Array.isArray(data?.sets)?data.sets:[]).map(item=>({
            name:String(item?.name??"").trim(),
            images:(Array.isArray(item?.images)?item.images:[]).map(v=>normalizePath(String(v??""))).filter(Boolean)
        })).filter(item=>item.name);
    }
    async function loadSavedSets(){
        const data=await fetchJson("/image-gallery/sets");
        __cigSavedSets=normalizeSetList(data);
        return __cigSavedSets;
    }
    async function saveNamedSet(name,images,oldName=""){
        const data=await fetchJson("/image-gallery/sets/save",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({name,images:[...images],old_name:oldName})
        });
        __cigSavedSets=normalizeSetList(data);
        return __cigSavedSets;
    }
    async function deleteNamedSet(name){
        const data=await fetchJson("/image-gallery/sets/delete",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({name})
        });
        __cigSavedSets=normalizeSetList(data);
        return __cigSavedSets;
    }
    function askSetName(initial=""){
        return new Promise(resolve=>{
            const shade=document.createElement("div");
            shade.style.cssText="position:fixed;inset:0;z-index:100080;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box";

            const box=document.createElement("div");
            box.style.cssText="width:min(420px,92vw);background:#202020;border:1px solid #555;border-radius:10px;box-shadow:0 18px 60px rgba(0,0,0,.65);padding:16px;font-family:Arial,sans-serif;color:#eee";

            const title=document.createElement("div");
            title.textContent=setUi.name;
            title.style.cssText="font-size:15px;font-weight:700;margin-bottom:10px";

            const input=document.createElement("input");
            input.type="text";
            input.value=initial;
            input.maxLength=120;
            input.autocomplete="off";
            input.style.cssText="width:100%;height:38px;box-sizing:border-box;background:#292929;color:#eee;border:1px solid #555;border-radius:7px;padding:0 10px;font:14px Arial,sans-serif;outline:none";

            const buttons=document.createElement("div");
            buttons.style.cssText="display:flex;justify-content:flex-end;gap:8px;margin-top:12px";

            const cancel=document.createElement("button");
            cancel.type="button";
            cancel.textContent=CIG_LANG==="ru"?"Отмена":"Cancel";
            cancel.style.cssText="height:34px;padding:0 14px;border:1px solid #4d4d4d;border-radius:6px;background:#292929;color:#ddd;cursor:pointer";

            const ok=document.createElement("button");
            ok.type="button";
            ok.textContent=CIG_LANG==="ru"?"Сохранить":"Save";
            ok.style.cssText="height:34px;padding:0 14px;border:1px solid #557aa8;border-radius:6px;background:#30445e;color:#fff;cursor:pointer";

            let done=false;
            const finish=value=>{
                if(done)return;
                done=true;
                shade.remove();
                resolve(value);
            };
            const submit=()=>{
                const value=String(input.value??"").trim();
                if(!value){
                    input.focus();
                    input.style.borderColor="#b85c5c";
                    return;
                }
                finish(value);
            };

            cancel.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();finish(null);});
            ok.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();submit();});
            input.addEventListener("keydown",e=>{
                if(e.key==="Enter"){e.preventDefault();submit();}
                else if(e.key==="Escape"){e.preventDefault();finish(null);}
            });
            shade.addEventListener("pointerdown",e=>{
                if(e.target===shade){e.preventDefault();e.stopPropagation();finish(null);}
            });

            buttons.append(cancel,ok);
            box.append(title,input,buttons);
            shade.appendChild(box);
            document.body.appendChild(shade);
            requestAnimationFrame(()=>{input.focus();input.select();});
        });
    }
    function reportSetError(error){
        console.error("[ImageGallery] image sets:",error);
        window.alert(`${setUi.error}: ${String(error?.message??error)}`);
    }
    function applySavedSet(item){
        selected.clear();
        for(const path of item.images)selected.add(normalizePath(path));
        syncCardSelection();
        closeSetsMenu();
    }
    function positionSetsMenu(menu){
        const r=setsButton.getBoundingClientRect();
        const mr=menu.getBoundingClientRect();
        const left=Math.max(4,Math.min(r.left,innerWidth-mr.width-4));
        const above=r.top-mr.height-6;
        const top=above>=4?above:Math.min(r.bottom+6,innerHeight-mr.height-4);
        menu.style.left=`${left}px`;
        menu.style.top=`${Math.max(4,top)}px`;
    }
    async function reopenSetsMenu(){
        closeSetsMenu();
        await openSetsMenu();
    }
    async function openSetsMenu(){
        if(__cigSetsMenu){closeSetsMenu();return;}
        setsButton.disabled=true;
        try{await loadSavedSets();}catch(error){reportSetError(error);setsButton.disabled=false;return;}
        setsButton.disabled=false;
        if(!overlay.isConnected)return;

        const menu=document.createElement("div");
        menu.className="cig-sets-menu";

        const create=document.createElement("button");
        create.type="button";create.className="cig-sets-create";create.textContent=setUi.create;
        create.disabled=selected.size===0;
        create.addEventListener("click",async e=>{
            e.preventDefault();e.stopPropagation();
            const name=await askSetName("");
            if(!name)return;
            try{await saveNamedSet(name,[...selected]);await reopenSetsMenu();}catch(error){reportSetError(error);}
        });
        menu.appendChild(create);

        if(!__cigSavedSets.length){
            const empty=document.createElement("div");empty.className="cig-sets-empty";empty.textContent=setUi.empty;menu.appendChild(empty);
        }

        for(const item of __cigSavedSets){
            const row=document.createElement("div");row.className="cig-set-row";
            const main=document.createElement("div");main.className="cig-set-main";
            const load=document.createElement("button");load.type="button";load.className="cig-set-load";
            const label=document.createElement("span");label.textContent=item.name;
            const qty=document.createElement("span");qty.className="cig-set-count";qty.textContent=`(${item.images.length})`;
            load.append(label,qty);
            load.title=item.name;
            load.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();applySavedSet(item);});
            const more=document.createElement("button");more.type="button";more.className="cig-set-more";more.textContent="⋮";
            more.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();row.classList.toggle("editing");positionSetsMenu(menu);});
            main.append(load,more);

            const actions=document.createElement("div");actions.className="cig-set-actions";
            const addAction=(text,handler,{danger=false,needsSelection=false,disabled=false}={})=>{
                const b=document.createElement("button");b.type="button";b.textContent=text;b.classList.toggle("danger",danger);b.disabled=disabled||(needsSelection&&selected.size===0);
                b.addEventListener("click",async e=>{e.preventDefault();e.stopPropagation();try{await handler();}catch(error){reportSetError(error);}});
                actions.appendChild(b);
            };
            addAction(setUi.replace,async()=>{await saveNamedSet(item.name,[...selected],item.name);await reopenSetsMenu();},{needsSelection:true});
            addAction(setUi.add,async()=>{
                const merged=new Set(item.images);
                for(const path of selected)merged.add(normalizePath(path));
                await saveNamedSet(item.name,[...merged],item.name);await reopenSetsMenu();
            },{needsSelection:true});
            addAction(setUi.remove,async()=>{
                const remove=new Set([...selected].map(v=>normalizePath(v)));
                const next=item.images.filter(path=>!remove.has(normalizePath(path)));
                await saveNamedSet(item.name,next,item.name);await reopenSetsMenu();
            },{needsSelection:true});
            addAction(setUi.rename,async()=>{
                const name=await askSetName(item.name);
                if(!name||name===item.name)return;
                await saveNamedSet(name,item.images,item.name);await reopenSetsMenu();
            });
            addAction(setUi.del,async()=>{
                if(!window.confirm(`${setUi.confirmDelete} “${item.name}”? `))return;
                await deleteNamedSet(item.name);await reopenSetsMenu();
            },{danger:true});
            addAction(setUi.start,async()=>{
                if(CIG_BATCH_JOBS.get(node)?.running)return;
                closeSetsMenu();
                rememberNavFolder();
                const job=startDetachedBatchQueue(node,item.images);
                if(job)bindBatchUi(job);
            },{disabled:!!CIG_BATCH_JOBS.get(node)?.running});

            row.append(main,actions);menu.appendChild(row);
        }

        document.body.appendChild(menu);
        __cigSetsMenu=menu;
        positionSetsMenu(menu);
    }

    setsButton.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();void openSetsMenu();});
    const __cigSetsOutside=e=>{if(__cigSetsMenu&&!__cigSetsMenu.contains(e.target)&&e.target!==setsButton)closeSetsMenu();};
    document.addEventListener("pointerdown",__cigSetsOutside,true);

    let __cigSortMenu=null;
    function sortLabel(mode=sortMode){const x=sortChoices.find(v=>v[0]===mode);return x?(CIG_LANG==="ru"?x[1]:x[2]):"Sort";}
    function updateSortButton(){sortButton.title=(CIG_LANG==="ru"?"Сортировка: ":"Sort: ")+sortLabel();}
    function closeSortMenu(){__cigSortMenu?.remove();__cigSortMenu=null;}
    const __cigSortOutside=e=>{if(__cigSortMenu&&!__cigSortMenu.contains(e.target)&&e.target!==sortButton)closeSortMenu();};
    document.addEventListener("pointerdown",__cigSortOutside,true);
    sortButton.addEventListener("click",e=>{
        e.preventDefault();e.stopPropagation();
        if(__cigSortMenu){closeSortMenu();return;}
        const menu=document.createElement("div");menu.className="cig-sort-menu";
        for(const choice of sortChoices){
            const [mode,ru,en]=choice;const b=document.createElement("button");b.type="button";b.classList.toggle("active",mode===sortMode);
            const check=document.createElement("span");check.className="cig-sort-check";check.textContent=mode===sortMode?"✓":"";
            const label=document.createElement("span");label.textContent=CIG_LANG==="ru"?ru:en;b.append(check,label);
            b.addEventListener("click",ev=>{ev.preventDefault();ev.stopPropagation();__cigSaveScroll();sortMode=mode;try{localStorage.setItem(CIG_SORT_KEY,mode);}catch(_){}closeSortMenu();updateSortButton();body.scrollTop=0;render();});
            menu.appendChild(b);
        }
        document.body.appendChild(menu);const r=sortButton.getBoundingClientRect(),mr=menu.getBoundingClientRect();menu.style.left=`${Math.max(4,Math.min(r.right-mr.width,innerWidth-mr.width-4))}px`;menu.style.top=`${Math.min(r.bottom+5,innerHeight-mr.height-4)}px`;__cigSortMenu=menu;
    });
    updateSortButton();
    // CIG_LIVE_CACHE_COUNTER_V1
    let __cigCacheStatsTimer=0;
    const scheduleCacheStats=()=>{
        if(__cigCacheStatsTimer||!overlay.isConnected)return;
        __cigCacheStatsTimer=setTimeout(()=>{
            __cigCacheStatsTimer=0;
            if(overlay.isConnected)updateCacheStats();
        },1000);
    };
    let thumbLoader = makeThumbLoader(body,scheduleCacheStats);
    const folderPreviewCache = new Map();
    let folderPreviewLoader = makeFolderPreviewLoader(body,folderPreviewCache);

    // CIG_SESSION_SCROLL_MEMORY_V1
    // Keep gallery position per node/folder/sort mode for the current ComfyUI
    // session only. This intentionally never enters workflow JSON or localStorage.
    if(!(node.__cigScrollByFolder instanceof Map)) node.__cigScrollByFolder = new Map();
    const __cigScrollByFolder = node.__cigScrollByFolder;
    const __cigScrollKey = (folder, mode=sortMode) => `${normalizeNavPath(folder)}\u0000${mode}${includeSubfolders?"\u0000deep":""}`;
    const __cigSaveScroll = () => {
        if(filterText.trim()) return;
        __cigScrollByFolder.set(__cigScrollKey(activeFolder), Math.max(0, Number(body.scrollTop) || 0));
    };
    const __cigSavedScroll = folder => {
        const value = __cigScrollByFolder.get(__cigScrollKey(folder));
        return Number.isFinite(value) ? value : null;
    };

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

    let stopBatchUiSync=()=>{};
    const cleanup = ()=>{
        stopBatchUiSync();
        stopBatchUiSync=()=>{};
        __cigSaveScroll();
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("pointerdown",__cigSortOutside,true);
        document.removeEventListener("pointerdown",__cigSetsOutside,true);
        closeSortMenu();
        closeSetsMenu();
        clearTimeout(__cigCacheStatsTimer);
        thumbLoader?.dispose();
        folderPreviewLoader?.dispose();
        marquee.remove();
    };
    // CIG_CLOSE_ONLY_X_V2
    let __cigAllowClose=false;
    const close=()=>{if(!__cigAllowClose)return;cleanup();overlay.remove();};
    closeButton.addEventListener("click",()=>{__cigAllowClose=true;close();});
    // CIG_DBLCLICK_CLOSE_V2
    body.addEventListener("click",e=>{
        if(e.detail!==2)return;
        if(!e.target.closest?.(".cig-card")||e.target.closest?.(".cig-favorite"))return;
        setTimeout(()=>{__cigAllowClose=true;close();},0);
    },true);
    // CIG_DBLCLICK_CLOSE_V1
    grid.addEventListener("dblclick",e=>{
        if(!e.target.closest?.(".cig-card")||e.target.closest?.(".cig-favorite"))return;
        setTimeout(()=>{__cigAllowClose=true;close();},0);
    });
    overlay.addEventListener("mousedown", e=>{ if(e.target === overlay) close(); });
    panel.addEventListener("mousedown", e=>e.stopPropagation());
    // CIG_HOLD_ZOOM_V1
    // Holding the left mouse button on a card shows the original ×6 (hold_zoom.js).
    // The click produced by the release must not toggle the card's selection.
    let __cigHoldZoom=null;
    body.addEventListener("pointerdown",e=>{
        __cigHoldZoom=null;
        if(e.shiftKey||e.ctrlKey||e.metaKey||e.altKey)return;
        const card=e.target.closest?.(".cig-card");
        if(!card||e.target.closest?.(".cig-favorite"))return;
        __cigHoldZoom=holdToZoom(e,()=>card.isConnected&&{src:card.__cigOriginalUrl,previewSrc:card.__cigUrl});
    });
    overlay.addEventListener("click",e=>{
        if(!__cigHoldZoom?.used)return;
        __cigHoldZoom=null;
        e.preventDefault();
        e.stopImmediatePropagation();
    },true);
    const onKey = e=>{
        if(e.key === "Escape"){ close(); return; }
        const active=document.activeElement;
        if(!active?.classList?.contains("cig-card")||!grid.contains(active))return;

        if(e.key==="Enter"){
            e.preventDefault();
            const relative=active.__cigRelative;
            if(!relative)return;
            rememberNavFolder();
            setWidgetValue(node,relative);
            node.__cigFolder=activeFolder;
            __cigAllowClose=true;
            close();
            return;
        }

        if(e.key===" "){
            e.preventDefault();
            const relative=active.__cigRelative;
            if(!relative)return;
            if(selected.has(relative))selected.delete(relative);
            else selected.add(relative);
            active.classList.toggle("selected",selected.has(relative));
            updateCount();
            return;
        }

        if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key))return;
        const cards=[...grid.querySelectorAll(".cig-card")];
        const index=cards.indexOf(active);
        if(index<0||!cards.length)return;

        let columns=1;
        const firstTop=cards[0].offsetTop;
        while(columns<cards.length&&Math.abs(cards[columns].offsetTop-firstTop)<2)columns++;

        const delta={
            ArrowLeft:-1,
            ArrowRight:1,
            ArrowUp:-columns,
            ArrowDown:columns,
        }[e.key];
        const next=Math.max(0,Math.min(cards.length-1,index+delta));
        if(next===index)return;
        e.preventDefault();
        for(const card of cards)card.classList.remove("cig-keynav-focus");
        cards[next]?.classList.add("cig-keynav-focus");
        cards[next]?.focus({preventScroll:true});
        cards[next]?.scrollIntoView({block:"nearest",inline:"nearest"});
    };
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
        if(includeSubfolders)return; // subfolder images are already shown inline
        const needle=filterText.trim().toLocaleLowerCase();
        const visible=needle?subfolders.filter(n=>n.toLocaleLowerCase().includes(needle)):subfolders;
        if(!visible.length)return;
        grid.querySelector(".cig-empty")?.remove();
        const frag=document.createDocumentFragment();
        folderPreviewLoader.dispose();
        folderPreviewLoader=makeFolderPreviewLoader(body,folderPreviewCache);
        const parentPath=normalizeNavPath(activeFolder);
        const childPrefix=/^[A-Za-z]:\/$/.test(parentPath)?parentPath:parentPath?parentPath+"/":"";
        const cards=[];
        for(const folderName of visible){
            const folderPath=childPrefix+folderName;
            const card=document.createElement("div");card.className="cig-folder-card";card.title=folderName;card.__cigFolderPath=folderPath;
            const icon=document.createElement("div");icon.className="cig-folder-icon";icon.textContent="📁";
            const name=document.createElement("div");name.className="cig-folder-name";name.textContent=folderName;
            card.append(icon,name);
            card.addEventListener("mousedown",e=>e.stopPropagation());
            card.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();});
            card.addEventListener("dblclick",e=>{e.preventDefault();e.stopPropagation();navigateGalleryFolder(folderPath);});
            frag.appendChild(card);cards.push(card);
        }
        grid.insertBefore(frag,grid.firstChild);
        cards.forEach(card=>folderPreviewLoader.observe(card));
    }

    function rebuildThumbLoader(){
        thumbLoader.dispose();
        thumbLoader = makeThumbLoader(body,scheduleCacheStats);
    }

    function updateRunState(){
        const job=CIG_BATCH_JOBS.get(node);
        if(job?.running){
            runButton.textContent=`▶ ${job.index}/${job.total}`;
            runButton.disabled=true;
            runButton.style.opacity="1";
            return;
        }
        const n = selected.size;
        runButton.textContent = `▶ ${cigT.start} (${n})`;
        runButton.disabled = n === 0;
        runButton.style.opacity = n ? "1" : ".5";
    }

    function bindBatchUi(job){
        stopBatchUiSync();
        stopBatchUiSync=()=>{};
        if(!job?.running){updateRunState();return;}
        stopBatchUiSync=watchBatchJob(job,()=>{
            if(overlay.isConnected)updateRunState();
        });
    }

    bindBatchUi(CIG_BATCH_JOBS.get(node));

    function updateCount(filteredLength = images.length){
        count.textContent = `${filteredLength} / ${images.length}${listTruncated?` (${cigT.truncated})`:""} · ${cigT.selected} ${selected.size}`;
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
        const filteredLength = needle ? images.filter(n=>matchesFilter(n,needle)).length : images.length;
        updateCount(filteredLength);
    }

    function render({scrollToCurrent=false} = {}){
        const needle = filterText.trim().toLocaleLowerCase();
        const baseFiltered = needle ? images.filter(n=>matchesFilter(n,needle)) : images;
        const compareText=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"});
        const nameCompare=(a,b)=>compareText(imageBaseName(a),imageBaseName(b))||compareText(a,b);
        const compareGalleryImages=(a,b)=>{
            const ma=imageMeta.get(a)||{},mb=imageMeta.get(b)||{};
            switch(sortMode){
                case "name-desc": return -nameCompare(a,b);
                case "date-desc": return (Number(mb.mtime)||0)-(Number(ma.mtime)||0)||nameCompare(a,b);
                case "date-asc": return (Number(ma.mtime)||0)-(Number(mb.mtime)||0)||nameCompare(a,b);
                case "size-desc": return (Number(mb.size)||0)-(Number(ma.size)||0)||nameCompare(a,b);
                case "size-asc": return (Number(ma.size)||0)-(Number(mb.size)||0)||nameCompare(a,b);
                default: return nameCompare(a,b);
            }
        };
        const sorted=[...baseFiltered].sort(compareGalleryImages);
        const filtered = [
            ...sorted.filter(filename=>isFavorite(joinPath(activeFolder,filename))),
            ...sorted.filter(filename=>!isFavorite(joinPath(activeFolder,filename)))
        ];
        rebuildThumbLoader();
        grid.replaceChildren();
        updateCount(filtered.length);

        if(!filtered.length){
            const e = document.createElement("div");
            e.className = "cig-empty";
            e.textContent = images.length ? cigT.noMatches : includeSubfolders ? cigT.noImagesDeep : cigT.noImages;
            grid.appendChild(e);
            renderFolderCards();
            return;
        }

        const currentValue = normalizePath(String(widget.value ?? ""));
        const frag = document.createDocumentFragment();
        let currentCard = null;

        for(const filename of filtered){
            const relative = joinPath(activeFolder, filename);
            const location = imageLocation(filename);
            const card = document.createElement("div");
            card.className = "cig-card" + (selected.has(relative) ? " selected" : "");
            card.tabIndex = -1;
            card.title = relative;
            card.__cigRelative = relative;
            card.__cigUrl = thumbnailUrl(location.folder, location.filename);
            card.__cigOriginalUrl = originalUrl(location.folder, location.filename);

            const wrap = document.createElement("div");
            wrap.className = "cig-thumb-wrap";
            const ph = document.createElement("div");
            ph.className = "cig-placeholder";
            ph.textContent = "…";
            const img = document.createElement("img");
            img.className = "cig-thumb";
            img.decoding = "async";
            img.alt = location.filename;
            img.draggable = false; // a native image drag would swallow hold-to-zoom moves
            wrap.append(ph, img);

            const name = document.createElement("div");
            name.className = "cig-name";
            name.textContent = location.filename;

            const fav = document.createElement("button");
            fav.type = "button";
            fav.className = "cig-favorite";
            const updateFavoriteButton=()=>{
                const on=isFavorite(relative);
                fav.classList.toggle("active",on);
                fav.textContent=on?"♥":"♡";
                fav.setAttribute("aria-pressed",on?"true":"false");
                fav.setAttribute("aria-label",CIG_LANG==="ru"?(on?"Убрать из любимых":"Добавить в любимые"):(on?"Remove from favorites":"Add to favorites"));
                fav.title=fav.getAttribute("aria-label");
            };
            updateFavoriteButton();
            fav.addEventListener("mousedown",e=>e.stopPropagation());
            fav.addEventListener("pointerdown",e=>e.stopPropagation());
            fav.addEventListener("touchstart",e=>e.stopPropagation(),{passive:true});
            fav.addEventListener("dblclick",e=>{e.preventDefault();e.stopPropagation();});
            fav.addEventListener("click",e=>{
                e.preventDefault();
                e.stopPropagation();
                setFavorite(relative,!isFavorite(relative));
                render();
                requestAnimationFrame(()=>{
                    const moved=[...grid.querySelectorAll(".cig-card")].find(c=>c.__cigRelative===relative);
                    moved?.scrollIntoView({block:"center",inline:"nearest"});
                });
            });

            wrap.appendChild(fav);
            card.append(wrap,name);

            card.addEventListener("click", e=>{
                e.preventDefault();
                e.stopPropagation();
                grid.querySelectorAll(".cig-keynav-focus").forEach(el=>el.classList.remove("cig-keynav-focus"));
                card.focus({preventScroll:true});
                if(selected.has(relative)) selected.delete(relative);
                else selected.add(relative);
                card.classList.toggle("selected", selected.has(relative));
                updateCount(filtered.length);
            });

            card.addEventListener("dblclick", e=>{
                e.preventDefault();
                e.stopPropagation();
                rememberNavFolder();
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
        grid.innerHTML = `<div class="cig-empty">${cigT.loadingList}</div>`;
        count.textContent = "";

        const data = await fetchJson(`/image-gallery/list?folder=${encodeURIComponent(activeFolder)}${includeSubfolders?"&recursive=1":""}`);
        if(token !== loadToken || !overlay.isConnected) return;
        listTruncated = !!data.truncated;

        images = Array.isArray(data.images) ? data.images : [];imageMeta=new Map((Array.isArray(data.items)?data.items:[]).map(x=>[String(x?.name??""),x]));subfolders=Array.isArray(data.folders)?data.folders:[];node.__cigGalleryValues=images.map(name=>joinPath(activeFolder,name));
        node.__cigPreviewNavigation?.setFolderValues(activeFolder, node.__cigGalleryValues);
        const savedScroll = preserveScroll ? oldScroll : __cigSavedScroll(activeFolder);
        render({scrollToCurrent: scrollToCurrent && savedScroll === null});renderBreadcrumbs();

        if(savedScroll !== null){
            requestAnimationFrame(()=>{
                if(overlay.isConnected) body.scrollTop = savedScroll;
            });
        }else if(!scrollToCurrent){
            body.scrollTop = 0;
        }

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
            __cigSaveScroll();
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
        if(e.target.closest?.(".cig-favorite"))return;
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

    runButton.addEventListener("click",()=>{
        const list=[...selected];
        if(!list.length||CIG_BATCH_JOBS.get(node)?.running)return;
        rememberNavFolder();

        // Snapshot the selected paths now. From this point the queue task is
        // independent of the gallery window and survives overlay cleanup/removal.
        selected.clear();
        syncCardSelection();

        const job=startDetachedBatchQueue(node,list);
        if(!job)return;
        bindBatchUi(job);

        job.promise.finally(()=>{
            if(!overlay.isConnected)return;
            refreshButton.disabled=false;
            clearButton.disabled=false;
            folderSelect.disabled=false;
            search.disabled=false;
            updateRunState();
        });
    });

    try{
        activeFolder = await fillFolders(activeFolder);
        await loadFolder(activeFolder,{scrollToCurrent:true});
        requestAnimationFrame(()=>{
            if(!overlay.isConnected)return;
            const cards=[...grid.querySelectorAll(".cig-card")];
            if(!cards.length)return;
            const viewport=body.getBoundingClientRect();
            const visible=cards.find(card=>{
                const r=card.getBoundingClientRect();
                return r.bottom>viewport.top&&r.top<viewport.bottom;
            });
            const currentValue=normalizePath(String(widget.value??""));
            const currentCard=cards.find(card=>card.__cigRelative===currentValue);
            (visible||currentCard||cards[0])?.focus({preventScroll:true});
        });
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
        folderPreviewCache.clear();
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
            bumpThumbCacheVersion();
            // CIG_CLEAR_CACHE_NO_REBUILD_V1
            // Оставляем уже загруженные превью на экране; дисковый кэш уже удалён.
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
function installGalleryStartButton(node) {
    if (node.widgets?.some(w => w?.name === "▶ СТАРТ")) return;
    const button = node.addWidget("button", "▶ СТАРТ", null, () => app.queuePrompt(0, 1), { serialize: false });
    button.serialize = false;
}

function installNodePreview(node) {
    return installGalleryPreviewNavigation(node, {
        app, api, getImageWidget, setWidgetValue, openGallery,
        normalizePath, splitPath, joinPath, holdToZoom,
    });
}

app.registerExtension({
    name: EXTENSION_NAME,
    beforeConfigureGraph(graphData) { captureSerializedGalleryImage(graphData); },
    loadedGraphNode(node) {
        restoreSerializedGalleryImage(node);
        if (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS) installNodePreview(node).refresh();
    },
    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;
        if (node.__cigImageGalleryInitialized) return;
        node.__cigImageGalleryInitialized = true;
        // The preview opens the gallery directly; no legacy helper widget is needed.
        installNodePreview(node);
        installGalleryStartButton(node);
        installCigTitleHelp(node);
        installExternalPreviewRestore(node);
        const computed = node.computeSize?.();
        if (computed) {
            const currentW = node.size?.[0] ?? computed[0];
            const currentH = node.size?.[1] ?? computed[1];
            if (computed[0] > currentW) node.setSize?.([computed[0], currentH]);
        }
    },
});
