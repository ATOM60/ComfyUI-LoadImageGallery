import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.SafeTitleHelp";
const NODE_CLASS = "LoadImageGallery";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";

function isRu() {
    return String(localStorage.getItem(LANG_KEY) || navigator.language || "en").toLowerCase().startsWith("ru");
}

function openHelp() {
    document.querySelector(".cig-safe-help")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "cig-safe-help";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px";
    const panel = document.createElement("div");
    panel.style.cssText = "width:min(680px,94vw);max-height:86vh;overflow:auto;background:#1d1d1d;color:#eee;border:1px solid #555;border-radius:12px;padding:20px;font:14px/1.5 Arial,sans-serif;box-shadow:0 20px 70px rgba(0,0,0,.6)";
    panel.innerHTML = isRu()
        ? "<h2>Liber Load Image from Gallery and Output Gallery</h2><p><b>Изображения:</b> нажмите на предпросмотр для галереи; стрелки листают изображения; СТАРТ запускает выделенные изображения по очереди.</p><p><b>Видео:</b> откройте Галерею output; один клик — play/pause, двойной — fullscreen, колесо — громкость.</p><p><b>Файлы:</b> правая кнопка мыши по видео открывает действия с файлом.</p><button type='button'>Закрыть</button>"
        : "<h2>Liber Load Image from Gallery and Output Gallery</h2><p><b>Images:</b> click the preview to open the gallery; arrows browse images; START queues selected images.</p><p><b>Video:</b> open Output Gallery; single click plays or pauses, double-click opens fullscreen, mouse wheel changes volume.</p><p><b>Files:</b> right-click a video for file actions.</p><button type='button'>Close</button>";
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    panel.querySelector("button")?.addEventListener("click", close);
    overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
}

function disableCanvasTitleHook(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;
    if (node.__cigTitleHelpInstalled) node.onDrawForeground = null;
}

function installMenu(node) {
    if (!node || node.__cigSafeHelpMenuInstalled) return;
    node.__cigSafeHelpMenuInstalled = true;
    const original = typeof node.getExtraMenuOptions === "function" ? node.getExtraMenuOptions : null;
    node.getExtraMenuOptions = function(...args) {
        const result = original?.apply(this, args);
        const options = args.find(Array.isArray) || (Array.isArray(result) ? result : null);
        if (options && !options.some(item => item?.__cigSafeHelp)) {
            options.unshift({content:isRu() ? "ⓘ Инструкция" : "ⓘ Help", callback:openHelp, __cigSafeHelp:true}, null);
        }
        return result;
    };
}

function install(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS)) return;
    installMenu(node);
    const apply = () => disableCanvasTitleHook(node);
    apply();
    queueMicrotask(apply);
    requestAnimationFrame(apply);
    setTimeout(apply, 80);
    setTimeout(apply, 300);
}

app.registerExtension({
    name: EXT_NAME,
    nodeCreated: install,
    loadedGraphNode: install,
});
