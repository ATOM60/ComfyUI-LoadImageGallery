import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoCurrentHelp";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en")
    .toLowerCase().startsWith("ru");

const ITEMS = RU ? [
    "Список папок рядом с поиском позволяет быстро переключаться между output и недавно выбранными внешними папками; кнопка «...» открывает системный выбор папки.",
    "Если браузер/GPU не поддерживает кодек видео, плеер автоматически переключается на CPU-декодирование, сохраняя тот же интерфейс; индикатор меняется с GPU на CPU.",
    "В CPU-режиме звук старых файлов при необходимости перекодируется через FFmpeg на лету, поэтому неподдерживаемый браузером аудиокодек не должен оставлять видео без звука.",
    "В полноэкранном режиме панель управления, боковые кнопки, индикатор CPU/GPU и курсор автоматически скрываются после короткого бездействия и появляются снова при движении мыши, касании или нажатии клавиши.",
] : [
    "The folder selector next to search lets you switch quickly between output and recently selected external folders; the “...” button opens the system folder picker.",
    "If the browser/GPU cannot decode a video codec, the player automatically switches to CPU decoding while keeping the same interface; the badge changes from GPU to CPU.",
    "In CPU mode, audio from legacy files is transcoded through FFmpeg on the fly when needed, so an audio codec unsupported by the browser should not leave the video silent.",
    "In fullscreen, the control bar, side controls, CPU/GPU badge and cursor automatically hide after a short idle period and reappear on mouse movement, touch or keyboard activity.",
];

function updateHelp(root = document) {
    const overlays = [];
    if (root instanceof HTMLElement && root.classList.contains("ovg-help-overlay")) overlays.push(root);
    root.querySelectorAll?.(".ovg-help-overlay").forEach(el => overlays.push(el));

    for (const overlay of overlays) {
        if (!(overlay instanceof HTMLElement) || overlay.dataset.ovgCurrentHelp === "1") continue;
        const lists = overlay.querySelectorAll(".ovg-help-body ul");
        const list = lists.length ? lists[lists.length - 1] : null;
        if (!(list instanceof HTMLElement)) continue;
        overlay.dataset.ovgCurrentHelp = "1";
        for (const text of ITEMS) {
            const li = document.createElement("li");
            li.textContent = text;
            list.appendChild(li);
        }
    }
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        updateHelp(document);
        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof Element) updateHelp(node);
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
