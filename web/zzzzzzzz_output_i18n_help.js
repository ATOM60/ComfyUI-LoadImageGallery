import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputI18nHelp";
const NODE_CLASS = "LoadImageGallery";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const LANG = String(localStorage.getItem(LANG_KEY) || navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en";

const I18N = {
    en: {
        outputButton: "▦  Output Gallery",
        title: "🎬 Video Gallery — output",
        search: "🔍 Search by filename or folder…",
        refresh: "Refresh",
        selectAll: "Select all",
        clearAll: "Clear selection",
        close: "Close",
        sortDateDesc: "Newest first",
        sortDateAsc: "Oldest first",
        sortNameAsc: "Name A → Z",
        sortNameDesc: "Name Z → A",
        sortSizeDesc: "Largest first",
        sortSizeAsc: "Smallest first",
        playInline: "Play in gallery",
        mark: "Select",
        unmark: "Unselect",
        copy: "Copy to clipboard",
        copySelected: n => `Copy selected (${n}) to clipboard`,
        rename: "Rename",
        reveal: "Show in folder",
        delete: "Delete",
        deleteSelected: n => `Delete selected (${n})`,
        empty: "No videos found in the output folder",
        count: (shown, total, selected) => `${shown} of ${total} · selected ${selected}`,
        prev: "Previous video",
        speed: "Playback speed",
        next: "Next video",
        help: "Help",
        helpTitle: "Load Image Gallery — quick guide",
        helpClose: "Close",
        helpHtml: `
            <h3>Images</h3>
            <p>Click the image preview in the node to open the image gallery.</p>
            <ul>
                <li>Single click selects or deselects an image.</li>
                <li>Double click loads an image into the node.</li>
                <li>Drag a rectangle to select several images.</li>
                <li>Use search, sorting, favorites and folders to find images faster.</li>
                <li>Use the right-click menu to save, copy or paste images.</li>
                <li>START queues the selected images one after another.</li>
            </ul>
            <h3>Output videos</h3>
            <p>Open <b>Output Gallery</b> from the button at the top of the node.</p>
            <ul>
                <li>Single click on a video preview starts or pauses playback.</li>
                <li>Double click opens the video in fullscreen.</li>
                <li>Double click in fullscreen pauses the video and exits fullscreen.</li>
                <li>The buttons on the right switch to the previous video, change playback speed and switch to the next video.</li>
                <li>The mouse wheel over the video changes volume.</li>
                <li>Playback speed and volume are remembered.</li>
                <li>Videos loop automatically.</li>
                <li>Right click gives access to play, select, copy, rename, show in folder and delete.</li>
                <li>Several videos can be selected and copied or deleted together.</li>
            </ul>
        `,
    },
    ru: {
        outputButton: "▦  Галерея output",
        title: "🎬 Галерея видео — output",
        search: "🔍 Поиск по имени или папке…",
        refresh: "Обновить",
        selectAll: "Выбрать все",
        clearAll: "Снять выбор",
        close: "Закрыть",
        sortDateDesc: "Сначала новые",
        sortDateAsc: "Сначала старые",
        sortNameAsc: "Имя А → Я",
        sortNameDesc: "Имя Я → А",
        sortSizeDesc: "Сначала большие",
        sortSizeAsc: "Сначала маленькие",
        playInline: "Проиграть в галерее",
        mark: "Выделить",
        unmark: "Снять выделение",
        copy: "Копировать в буфер",
        copySelected: n => `Копировать выбранные (${n}) в буфер`,
        rename: "Переименовать",
        reveal: "Показать в папке",
        delete: "Удалить",
        deleteSelected: n => `Удалить выбранные (${n})`,
        empty: "Видео не найдены в папке output",
        count: (shown, total, selected) => `${shown} из ${total} · выбрано ${selected}`,
        prev: "Предыдущее видео",
        speed: "Скорость воспроизведения",
        next: "Следующее видео",
        help: "Инструкция",
        helpTitle: "Load Image Gallery — краткая инструкция",
        helpClose: "Закрыть",
        helpHtml: `
            <h3>Изображения</h3>
            <p>Нажмите на предпросмотр изображения в ноде, чтобы открыть галерею.</p>
            <ul>
                <li>Один клик выделяет изображение или снимает выделение.</li>
                <li>Двойной клик загружает изображение в ноду.</li>
                <li>Рамкой можно выделить сразу несколько изображений.</li>
                <li>Для быстрого поиска используйте поиск, сортировку, избранное и папки.</li>
                <li>Через правую кнопку мыши можно сохранять, копировать и вставлять изображения.</li>
                <li>Кнопка СТАРТ запускает выбранные изображения по очереди.</li>
            </ul>
            <h3>Видео из output</h3>
            <p>Откройте <b>Галерею output</b> большой кнопкой в верхней части ноды.</p>
            <ul>
                <li>Один клик по предпросмотру запускает видео или ставит его на паузу.</li>
                <li>Двойной клик открывает видео на весь экран.</li>
                <li>Двойной клик в полноэкранном режиме ставит видео на паузу и выходит из полноэкранного режима.</li>
                <li>Кнопки справа переключают предыдущее видео, скорость воспроизведения и следующее видео.</li>
                <li>Колесо мыши над видео меняет громкость.</li>
                <li>Скорость и громкость запоминаются.</li>
                <li>Видео автоматически повторяется по кругу.</li>
                <li>Правая кнопка мыши открывает действия: проиграть, выделить, копировать, переименовать, показать в папке и удалить.</li>
                <li>Несколько видео можно выделить и затем скопировать или удалить вместе.</li>
            </ul>
        `,
    },
};

const t = I18N[LANG];

function injectHelpStyles() {
    if (document.getElementById("cig-output-help-style")) return;
    const style = document.createElement("style");
    style.id = "cig-output-help-style";
    style.textContent = `
.cig-output-help-overlay{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
.cig-output-help-panel{width:min(760px,94vw);max-height:88vh;overflow:auto;background:#1d1d1d;color:#eee;border:1px solid rgba(255,255,255,.18);border-radius:12px;box-shadow:0 20px 70px rgba(0,0,0,.6);font:14px/1.45 Arial,sans-serif}
.cig-output-help-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.12);font-size:17px;font-weight:700}
.cig-output-help-head span{flex:1}.cig-output-help-head button{border:1px solid rgba(255,255,255,.15);background:#2b2b2b;color:#eee;border-radius:6px;padding:7px 10px;cursor:pointer}
.cig-output-help-body{padding:8px 20px 20px}.cig-output-help-body h3{margin:16px 0 6px}.cig-output-help-body p{margin:6px 0}.cig-output-help-body ul{margin:6px 0 12px;padding-left:22px}.cig-output-help-body li{margin:5px 0}
`;
    document.head.appendChild(style);
}

function openHelp() {
    document.querySelector(".cig-output-help-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "cig-output-help-overlay";
    overlay.innerHTML = `<div class="cig-output-help-panel"><div class="cig-output-help-head"><span>${t.helpTitle}</span><button type="button">${t.helpClose}</button></div><div class="cig-output-help-body">${t.helpHtml}</div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector("button")?.addEventListener("click", close);
    overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
}

function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
}

function translateContextMenu(menu) {
    for (const button of menu.querySelectorAll("button[data-action]")) {
        const action = button.dataset.action;
        const current = button.textContent || "";
        const count = Number((current.match(/\((\d+)\)/) || [])[1] || 1);
        if (action === "open") setText(button, `▶ ${t.playInline}`);
        if (action === "mark") setText(button, current.includes("☐") ? `☐ ${t.unmark}` : `☑ ${t.mark}`);
        if (action === "copy") setText(button, `⧉ ${count > 1 ? t.copySelected(count) : t.copy}`);
        if (action === "rename") setText(button, `✎ ${t.rename}`);
        if (action === "reveal") setText(button, `⌖ ${t.reveal}`);
        if (action === "delete") setText(button, `🗑 ${count > 1 ? t.deleteSelected(count) : t.delete}`);
    }
}

function translateModal(modal) {
    setText(modal.querySelector(".ovg-title"), t.title);
    const search = modal.querySelector(".ovg-search");
    if (search) search.placeholder = t.search;
    const refresh = modal.querySelector(".ovg-refresh-modal");
    if (refresh) refresh.title = t.refresh;
    setText(modal.querySelector(".ovg-select-all"), t.selectAll);
    setText(modal.querySelector(".ovg-clear-all"), t.clearAll);
    const close = modal.querySelector(".ovg-close");
    if (close) close.title = t.close;

    const sort = modal.querySelector(".ovg-sort");
    if (sort) {
        const labels = {
            date_desc: t.sortDateDesc,
            date_asc: t.sortDateAsc,
            name_asc: t.sortNameAsc,
            name_desc: t.sortNameDesc,
            size_desc: t.sortSizeDesc,
            size_asc: t.sortSizeAsc,
        };
        for (const option of sort.options) if (labels[option.value]) option.textContent = labels[option.value];
    }

    for (const play of modal.querySelectorAll(".ovg-play")) play.title = t.playInline;
    for (const empty of modal.querySelectorAll(".ovg-empty-grid")) setText(empty, t.empty);

    const count = modal.querySelector(".ovg-count");
    if (count) {
        const nums = [...count.textContent.matchAll(/\d+/g)].map(m => Number(m[0]));
        if (nums.length >= 3) setText(count, t.count(nums[0], nums[1], nums[2]));
    }

    const toolbar = modal.querySelector(".ovg-toolbar");
    if (toolbar && !toolbar.querySelector(".ovg-help")) {
        const help = document.createElement("button");
        help.type = "button";
        help.className = "ovg-btn ovg-help";
        help.textContent = "?";
        help.title = t.help;
        help.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); openHelp(); });
        toolbar.appendChild(help);
    }
}

function translateSpeedControls(root = document) {
    for (const button of root.querySelectorAll?.(".ovg-prev-button") || []) button.title = t.prev;
    for (const button of root.querySelectorAll?.(".ovg-speed-button") || []) button.title = t.speed;
    for (const button of root.querySelectorAll?.(".ovg-next-button") || []) button.title = t.next;
}

function translateDom(root = document) {
    if (root instanceof Element) {
        if (root.matches(".ovg-modal")) translateModal(root);
        if (root.matches(".ovg-menu")) translateContextMenu(root);
        if (root.matches(".ovg-speed-control")) translateSpeedControls(root);
    }
    root.querySelectorAll?.(".ovg-modal").forEach(translateModal);
    root.querySelectorAll?.(".ovg-menu").forEach(translateContextMenu);
    translateSpeedControls(root);
}

function patchOutputButton(node) {
    const button = node?.widgets?.find?.(w => w?.name === "Галерея output");
    if (!button) return;
    button.drawWidget = function(ctx, options) {
        const h = this.computedHeight ?? 64;
        const y = this.y ?? 0;
        const width = options?.width ?? node.size?.[0] ?? 320;
        const m = 8;
        ctx.save();
        ctx.globalAlpha = this.computedDisabled ? .45 : 1;
        ctx.fillStyle = this.clicked ? this.outline_color : this.background_color;
        ctx.strokeStyle = this.outline_color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(m, y, width - m * 2, h, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = this.text_color;
        ctx.font = "700 20px Arial,sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t.outputButton, width / 2, y + h / 2);
        ctx.restore();
    };
    node.graph?.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: EXT_NAME,
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;
        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            const result = originalCreated?.apply(this, arguments);
            const node = this;
            for (const ms of [0, 80, 320, 1200, 2600, 5600, 10600]) setTimeout(() => patchOutputButton(node), ms);
            return result;
        };
    },
    setup() {
        injectHelpStyles();
        translateDom();
        const observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.type === "characterData") {
                    const parent = record.target.parentElement;
                    if (parent?.closest(".ovg-modal,.ovg-menu,.ovg-speed-control")) translateDom(parent.closest(".ovg-modal,.ovg-menu,.ovg-speed-control"));
                    continue;
                }
                for (const node of record.addedNodes) if (node instanceof Element) translateDom(node);
                const parent = record.target instanceof Element ? record.target.closest(".ovg-modal,.ovg-menu,.ovg-speed-control") : null;
                if (parent) translateDom(parent);
            }
        });
        observer.observe(document.body, { childList:true, subtree:true, characterData:true });
    },
});
