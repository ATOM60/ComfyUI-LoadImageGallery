import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoGallery";
const STYLE_ID = "comfy-image-gallery-output-video-style";
const NODE_CLASS = "LoadImageGallery";
const LS_SORT = "ComfyUI-LoadImageGallery.outputVideoSort";
const LS_THUMB = "ComfyUI-LoadImageGallery.outputVideoThumb";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const MAX_LIVE_PLAYERS = 3;
const LANG = String(localStorage.getItem(LANG_KEY) || navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en";

const I18N = {
    en: {
        outputButton: "▦  Output Gallery",
        title: "🎬 Video Gallery — output",
        search: "🔍 Search by filename or folder…",
        sortTitle: "Sorting",
        previewSize: "Preview size",
        refresh: "Refresh",
        selectAll: "Select all",
        clearAll: "Clear selection",
        close: "Close",
        dateDesc: "Newest first",
        dateAsc: "Oldest first",
        nameAsc: "Name A → Z",
        nameDesc: "Name Z → A",
        sizeDesc: "Largest first",
        sizeAsc: "Smallest first",
        play: "Play in gallery",
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
            <ul>
                <li>Single click on a video preview starts or pauses playback.</li>
                <li>Double click opens the video in fullscreen.</li>
                <li>Double click in fullscreen pauses the video and exits fullscreen.</li>
                <li>The controls on the right open the previous video, change playback speed and open the next video.</li>
                <li>The mouse wheel over the video changes volume.</li>
                <li>Playback speed and volume are remembered.</li>
                <li>Videos loop automatically.</li>
                <li>Right click opens actions for play, selection, copy, rename, show in folder and delete.</li>
                <li>Several videos can be selected and copied or deleted together.</li>
            </ul>
        `,
        error: "Error",
        done: "Done",
        fetchError: "Could not load the video list",
        busy: "Working…",
        selectFirst: "Select a video first",
        copyBusy: n => `Copying ${n} file(s) to clipboard…`,
        copyError: "Could not copy files to the clipboard",
        copyDone: n => `Copied to clipboard: ${n}. You can now paste in Explorer with Ctrl+V.`,
        renamePrompt: "New filename:",
        renameError: "Could not rename the file",
        deleteConfirm: n => `Delete selected video${n === 1 ? "" : "s"} (${n})?`,
        deleteBusy: n => `Deleting ${n} file(s)…`,
        deleteError: "Delete failed",
        noRecycle: " (Recycle Bin is unavailable)",
        deleted: (n, failed, suffix) => failed ? `Deleted: ${n}, errors: ${failed}${suffix}` : `Deleted: ${n}${suffix}`,
        revealError: "Could not open the folder",
        videoError: name => `Could not open video: ${name}`,
        refreshBusy: "Refreshing…",
    },
    ru: {
        outputButton: "▦  Галерея output",
        title: "🎬 Галерея видео — output",
        search: "🔍 Поиск по имени или папке…",
        sortTitle: "Сортировка",
        previewSize: "Размер превью",
        refresh: "Обновить",
        selectAll: "Выбрать все",
        clearAll: "Снять выбор",
        close: "Закрыть",
        dateDesc: "Сначала новые",
        dateAsc: "Сначала старые",
        nameAsc: "Имя А → Я",
        nameDesc: "Имя Я → А",
        sizeDesc: "Сначала большие",
        sizeAsc: "Сначала маленькие",
        play: "Проиграть в галерее",
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
        help: "Инструкция",
        helpTitle: "Load Image Gallery — краткая инструкция",
        helpClose: "Закрыть",
        helpHtml: `
            <h3>Изображения</h3>
            <p>Нажмите на предпросмотр изображения в ноде, чтобы открыть галерею изображений.</p>
            <ul>
                <li>Один клик выделяет изображение или снимает выделение.</li>
                <li>Двойной клик загружает изображение в ноду.</li>
                <li>Рамкой можно выделить сразу несколько изображений.</li>
                <li>Для быстрого поиска используйте поиск, сортировку, избранное и папки.</li>
                <li>Через правую кнопку мыши можно сохранять, копировать и вставлять изображения.</li>
                <li>Кнопка СТАРТ запускает выбранные изображения по очереди.</li>
            </ul>
            <h3>Видео из output</h3>
            <ul>
                <li>Один клик по предпросмотру запускает видео или ставит его на паузу.</li>
                <li>Двойной клик открывает видео на весь экран.</li>
                <li>Двойной клик в полноэкранном режиме ставит видео на паузу и выходит из полноэкранного режима.</li>
                <li>Кнопки справа открывают предыдущее видео, меняют скорость воспроизведения и открывают следующее видео.</li>
                <li>Колесо мыши над видео меняет громкость.</li>
                <li>Скорость и громкость запоминаются.</li>
                <li>Видео автоматически повторяется по кругу.</li>
                <li>Правая кнопка мыши открывает действия: проиграть, выделить, копировать, переименовать, показать в папке и удалить.</li>
                <li>Несколько видео можно выделить и затем скопировать или удалить вместе.</li>
            </ul>
        `,
        error: "Ошибка",
        done: "Готово",
        fetchError: "Не удалось получить список видео",
        busy: "Выполняется…",
        selectFirst: "Сначала выделите видео",
        copyBusy: n => `В буфер обмена: ${n} файл(ов)…`,
        copyError: "Не удалось скопировать файлы в буфер обмена",
        copyDone: n => `В буфер обмена скопировано: ${n}. Теперь можно Ctrl+V в Проводнике.`,
        renamePrompt: "Новое имя файла:",
        renameError: "Не удалось переименовать файл",
        deleteConfirm: n => `Удалить выбранные видео (${n})?`,
        deleteBusy: n => `Удаление: ${n} файл(ов)…`,
        deleteError: "Ошибка удаления",
        noRecycle: " (корзина недоступна)",
        deleted: (n, failed, suffix) => failed ? `Удалено: ${n}, ошибок: ${failed}${suffix}` : `Удалено: ${n}${suffix}`,
        revealError: "Не удалось открыть папку",
        videoError: name => `Не удалось открыть видео: ${name}`,
        refreshBusy: "Обновление…",
    },
};
const t = I18N[LANG];

function apiUrl(route) {
    try { if (typeof api.apiURL === "function") return api.apiURL(route); } catch (_) {}
    return route;
}

function esc(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let v = n / 1024, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
}

function toast(message, kind = "info") {
    try {
        app.extensionManager?.toast?.add({
            severity: kind === "error" ? "error" : kind === "success" ? "success" : "info",
            summary: kind === "error" ? t.error : kind === "success" ? t.done : "Output Gallery",
            detail: message,
            life: 3800,
        });
        return;
    } catch (_) {}
    if (kind === "error") alert(message);
}

function openHelp() {
    document.querySelector(".ovg-help-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "ovg-help-overlay";
    overlay.innerHTML = `<div class="ovg-help-panel"><div class="ovg-help-head"><span>${t.helpTitle}</span><button type="button">${t.helpClose}</button></div><div class="ovg-help-body">${t.helpHtml}</div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector("button")?.addEventListener("click", close);
    overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.ovg-modal{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
.ovg-window{width:min(1500px,96vw);height:min(930px,94vh);background:var(--comfy-menu-bg,#1d1d1d);color:var(--input-text,#ddd);border:1px solid rgba(255,255,255,.16);border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;font-family:Arial,sans-serif}
.ovg-titlebar{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1)}
.ovg-title{font-weight:700;white-space:nowrap}.ovg-count{opacity:.7;font-size:12px;margin-right:auto}.ovg-close{width:34px;height:30px;padding:0!important;font-size:20px!important}
.ovg-toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.08)}
.ovg-toolbar input[type=text],.ovg-toolbar select{background:var(--comfy-input-bg,#292929);color:var(--input-text,#ddd);border:1px solid rgba(255,255,255,.13);border-radius:6px;padding:7px 8px}.ovg-search{min-width:220px;flex:1 1 260px}.ovg-toolbar .ovg-size{width:110px}
.ovg-btn{border:1px solid rgba(255,255,255,.14);background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);border-radius:6px;padding:7px 10px;cursor:pointer}.ovg-btn:hover{filter:brightness(1.17)}.ovg-btn:disabled{opacity:.45;cursor:not-allowed}
.ovg-grid-wrap{position:relative;flex:1 1 auto;overflow:auto;padding:12px;user-select:none}.ovg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--ovg-card-size,180px),1fr));gap:10px;align-items:start}
.ovg-card{position:relative;min-width:0;border:1px solid rgba(255,255,255,.11);border-radius:8px;overflow:hidden;background:#151515;cursor:pointer;user-select:none;transition:border-color .12s,box-shadow .12s,transform .12s,background .12s}.ovg-card:hover{border-color:rgba(255,255,255,.35);transform:translateY(-1px)}.ovg-card.marked{box-shadow:inset 0 0 0 2px #6ba7ff;background:#26364b}
.ovg-thumb{position:relative;aspect-ratio:16/10;background:#050505;overflow:hidden}.ovg-thumb img{width:100%;height:100%;display:block;object-fit:cover;background:#000}.ovg-thumb-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#777;font-size:34px}
.ovg-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;width:48px;height:48px;border:0;border-radius:50%;background:rgba(0,0,0,.66);color:#fff;font-size:23px;line-height:48px;padding:0 0 0 3px;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.35)}.ovg-play:hover{background:rgba(0,0,0,.84);transform:translate(-50%,-50%) scale(1.06)}
.ovg-inline-video{position:absolute;inset:0;z-index:5;width:100%;height:100%;display:block;object-fit:contain;background:#000}.ovg-card-info{padding:7px 8px 8px}.ovg-card-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:600}.ovg-card-meta{display:flex;justify-content:space-between;gap:6px;margin-top:4px;opacity:.65;font-size:10px}.ovg-empty-grid{grid-column:1/-1;padding:60px 20px;text-align:center;color:#888}
.ovg-menu{position:fixed;z-index:100003;min-width:225px;padding:5px;background:#202020;border:1px solid rgba(255,255,255,.16);border-radius:7px;box-shadow:0 10px 36px rgba(0,0,0,.5)}.ovg-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:#eee;padding:8px 10px;border-radius:5px;cursor:pointer}.ovg-menu button:hover{background:#383838}.ovg-menu .danger{color:#ff9898}
.ovg-busy{position:absolute;inset:0;z-index:100005;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);font-size:15px}.ovg-select-box{position:fixed;z-index:100004;pointer-events:none;border:1px solid #4b91ff;background:rgba(75,145,255,.16)}
.ovg-inline-video:fullscreen,:fullscreen .ovg-inline-video,.ovg-inline-video:-webkit-full-screen,:-webkit-full-screen .ovg-inline-video{object-fit:contain!important;width:100vw!important;height:100vh!important;max-width:100vw!important;max-height:100vh!important;background:#000!important}
.ovg-help-overlay{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
.ovg-help-panel{width:min(760px,94vw);max-height:88vh;overflow:auto;background:#1d1d1d;color:#eee;border:1px solid rgba(255,255,255,.18);border-radius:12px;box-shadow:0 20px 70px rgba(0,0,0,.6);font:14px/1.45 Arial,sans-serif}
.ovg-help-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.12);font-size:17px;font-weight:700}.ovg-help-head span{flex:1}.ovg-help-head button{border:1px solid rgba(255,255,255,.15);background:#2b2b2b;color:#eee;border-radius:6px;padding:7px 10px;cursor:pointer}
.ovg-help-body{padding:8px 20px 20px}.ovg-help-body h3{margin:16px 0 6px}.ovg-help-body p{margin:6px 0}.ovg-help-body ul{margin:6px 0 12px;padding-left:22px}.ovg-help-body li{margin:5px 0}
@media(max-width:700px){.ovg-modal{padding:7px}.ovg-window{width:100vw;height:97vh}.ovg-grid{gap:7px}.ovg-toolbar{padding:7px}.ovg-search{min-width:150px}}
`;
    document.head.appendChild(style);
}

app.registerExtension({
    name: EXT_NAME,

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            ensureStyles();
            const node = this;

            const state = {
                videos: [],
                marked: new Set(),
                modal: null,
                menu: null,
                sort: localStorage.getItem(LS_SORT) || "date_desc",
                thumbSize: Number(localStorage.getItem(LS_THUMB) || 180),
                search: "",
                thumbObserver: null,
                players: new Map(),
                dragSuppressUntil: 0,
                scrollRaf: 0,
                escapeHandler: null,
            };
            node._outputVideoGallery = state;

            function videoUrl(path, mtime = 0) {
                return apiUrl(`/image-gallery/output/video?path=${encodeURIComponent(path)}&v=${encodeURIComponent(mtime || 0)}`);
            }
            function thumbUrl(path, mtime = 0) {
                return apiUrl(`/image-gallery/output/thumb?path=${encodeURIComponent(path)}&v=${encodeURIComponent(mtime || 0)}`);
            }

            async function fetchVideos({ clearSelection = false } = {}) {
                const response = await api.fetchApi("/image-gallery/output/list");
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || t.fetchError);
                state.videos = data.videos || [];
                if (clearSelection) state.marked.clear();
                return state.videos;
            }

            function sortedFilteredVideos() {
                let rows = [...state.videos];
                const q = state.search.trim().toLowerCase();
                if (q) rows = rows.filter(v => v.path.toLowerCase().includes(q));
                switch (state.sort) {
                    case "date_asc": rows.sort((a, b) => a.mtime - b.mtime); break;
                    case "name_asc": rows.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric:true, sensitivity:"base" })); break;
                    case "name_desc": rows.sort((a, b) => b.path.localeCompare(a.path, undefined, { numeric:true, sensitivity:"base" })); break;
                    case "size_desc": rows.sort((a, b) => b.size - a.size); break;
                    case "size_asc": rows.sort((a, b) => a.size - b.size); break;
                    default: rows.sort((a, b) => b.mtime - a.mtime); break;
                }
                return rows;
            }

            function closeMenu() {
                state.menu?.remove();
                state.menu = null;
            }

            function setBusy(message = t.busy) {
                if (!state.modal) return () => {};
                const win = state.modal.querySelector(".ovg-window");
                const busy = document.createElement("div");
                busy.className = "ovg-busy";
                busy.textContent = message;
                win.style.position = "relative";
                win.appendChild(busy);
                return () => busy.remove();
            }

            function updateCount() {
                if (!state.modal) return;
                const rows = sortedFilteredVideos();
                const count = state.modal.querySelector(".ovg-count");
                if (count) count.textContent = t.count(rows.length, state.videos.length, state.marked.size);
            }

            function paintMarkedCards() {
                if (!state.modal) return;
                for (const card of state.modal.querySelectorAll(".ovg-card")) {
                    card.classList.toggle("marked", state.marked.has(card.dataset.path));
                }
                updateCount();
            }

            function toggleMarked(path) {
                state.marked.has(path) ? state.marked.delete(path) : state.marked.add(path);
                paintMarkedCards();
            }

            async function copyPaths(paths) {
                if (!paths.length) { toast(t.selectFirst, "error"); return; }
                const done = setBusy(t.copyBusy(paths.length));
                try {
                    const response = await api.fetchApi("/image-gallery/output/clipboard", {
                        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({paths}),
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || t.copyError);
                    toast(t.copyDone(data.count || paths.length), "success");
                } finally { done(); }
            }

            async function renameVideo(item) {
                const next = prompt(t.renamePrompt, item.name);
                if (!next || next === item.name) return;
                const response = await api.fetchApi("/image-gallery/output/rename", {
                    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({path:item.path,new_name:next}),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || t.renameError);
                if (state.marked.delete(item.path)) state.marked.add(data.path);
                await fetchVideos();
                renderGrid();
            }

            async function deletePaths(paths) {
                if (!paths.length) return;
                if (!confirm(`${t.deleteConfirm(paths.length)}${paths.length === 1 ? "\n" + paths[0] : ""}`)) return;
                const done = setBusy(t.deleteBusy(paths.length));
                try {
                    const response = await api.fetchApi("/image-gallery/output/delete", {
                        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({paths}),
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || t.deleteError);
                    for (const p of paths) state.marked.delete(p);
                    await fetchVideos();
                    renderGrid();
                    const deleted = data.deleted?.length || 0, failed = data.errors?.length || 0;
                    const suffix = data.recycle_bin === false ? t.noRecycle : "";
                    toast(t.deleted(deleted, failed, suffix), failed ? "info" : "success");
                } finally { done(); }
            }

            async function revealVideo(item) {
                const response = await api.fetchApi("/image-gallery/output/reveal", {
                    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({path:item.path}),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || t.revealError);
            }

            function contextActionPaths(item) {
                return state.marked.has(item.path) && state.marked.size > 1 ? [...state.marked] : [item.path];
            }

            function releaseInlinePlayer(path) {
                const entry = state.players.get(path);
                if (!entry) return;
                try { entry.video.pause(); } catch (_) {}
                try { entry.video.removeAttribute("src"); entry.video.load(); } catch (_) {}
                entry.video.remove();
                if (entry.playBtn?.isConnected) entry.playBtn.style.display = "";
                if (entry.img?.isConnected) entry.img.style.removeProperty("display");
                if (!entry.img && entry.fallback?.isConnected) entry.fallback.style.setProperty("display", "flex");
                state.players.delete(path);
            }

            function releaseAllPlayers() {
                for (const path of [...state.players.keys()]) releaseInlinePlayer(path);
            }

            function pauseOtherPlayers(currentPath) {
                for (const [path, entry] of state.players) if (path !== currentPath && !entry.video.paused) entry.video.pause();
            }

            function evictIfNeeded(exceptPath = "") {
                if (state.players.size < MAX_LIVE_PLAYERS) return;
                const candidates = [...state.players.entries()].filter(([path]) => path !== exceptPath).sort((a,b) => a[1].lastUsed - b[1].lastUsed);
                if (candidates.length) releaseInlinePlayer(candidates[0][0]);
            }

            async function activateInlinePlayer(card, item, playBtn) {
                const existing = state.players.get(item.path);
                if (existing) {
                    existing.lastUsed = performance.now();
                    if (existing.video.paused) { pauseOtherPlayers(item.path); try { await existing.video.play(); } catch (_) {} }
                    else existing.video.pause();
                    return;
                }
                evictIfNeeded(item.path);
                pauseOtherPlayers(item.path);
                const holder = card.querySelector(".ovg-thumb");
                const img = holder.querySelector("img");
                const fallback = holder.querySelector(".ovg-thumb-fallback");
                const video = document.createElement("video");
                video.className = "ovg-inline-video";
                video.controls = true;
                video.preload = "metadata";
                video.playsInline = true;
                video.poster = thumbUrl(item.path, item.mtime);
                video.src = videoUrl(item.path, item.mtime);
                img?.style.setProperty("display", "none");
                fallback?.style.setProperty("display", "none");
                playBtn.style.display = "none";
                holder.prepend(video);
                const entry = { card, holder, img, fallback, playBtn, video, lastUsed:performance.now() };
                state.players.set(item.path, entry);
                video.addEventListener("play", () => { entry.lastUsed = performance.now(); pauseOtherPlayers(item.path); });
                video.addEventListener("contextmenu", e => openContextMenu(e, item));
                video.addEventListener("pointerdown", e => e.stopPropagation());
                video.addEventListener("click", e => e.stopPropagation());
                video.addEventListener("dblclick", e => e.stopPropagation());
                video.addEventListener("error", () => { releaseInlinePlayer(item.path); toast(t.videoError(item.name), "error"); }, {once:true});
                try { await video.play(); } catch (_) {}
            }

            async function playItem(item) {
                if (!state.modal) return;
                const card = [...state.modal.querySelectorAll(".ovg-card")].find(c => c.dataset.path === item.path);
                const playBtn = card?.querySelector(".ovg-play");
                if (card && playBtn) await activateInlinePlayer(card, item, playBtn);
            }

            function openContextMenu(ev, item) {
                ev.preventDefault(); ev.stopPropagation(); closeMenu();
                const bulkCount = state.marked.has(item.path) && state.marked.size > 1 ? state.marked.size : 1;
                const menu = document.createElement("div");
                menu.className = "ovg-menu";
                menu.innerHTML = `
                    <button data-action="open">▶ ${t.play}</button>
                    <button data-action="mark">${state.marked.has(item.path) ? `☐ ${t.unmark}` : `☑ ${t.mark}`}</button>
                    <button data-action="copy">⧉ ${bulkCount > 1 ? t.copySelected(bulkCount) : t.copy}</button>
                    <button data-action="rename">✎ ${t.rename}</button>
                    <button data-action="reveal">⌖ ${t.reveal}</button>
                    <button class="danger" data-action="delete">🗑 ${bulkCount > 1 ? t.deleteSelected(bulkCount) : t.delete}</button>`;
                menu.style.left = `${Math.min(ev.clientX, window.innerWidth - 250)}px`;
                menu.style.top = `${Math.min(ev.clientY, window.innerHeight - 270)}px`;
                document.body.appendChild(menu); state.menu = menu;
                menu.addEventListener("click", async e => {
                    const action = e.target.closest("button")?.dataset.action;
                    if (!action) return;
                    closeMenu();
                    try {
                        if (action === "open") await playItem(item);
                        if (action === "mark") toggleMarked(item.path);
                        if (action === "copy") await copyPaths(contextActionPaths(item));
                        if (action === "rename") await renameVideo(item);
                        if (action === "reveal") await revealVideo(item);
                        if (action === "delete") await deletePaths(contextActionPaths(item));
                    } catch (err) { toast(err.message || String(err), "error"); }
                });
                setTimeout(() => document.addEventListener("pointerdown", closeMenu, {once:true}), 0);
            }

            function bindThumbLazyLoad(card, item) {
                const img = card.querySelector("img");
                if (!img) return;
                const load = () => {
                    if (img.dataset.loaded) return;
                    img.dataset.loaded = "1";
                    img.src = thumbUrl(item.path, item.mtime);
                    img.onerror = () => { img.style.display = "none"; card.querySelector(".ovg-thumb-fallback")?.style.setProperty("display", "flex"); };
                };
                if (!state.thumbObserver) {
                    state.thumbObserver = new IntersectionObserver(entries => {
                        for (const entry of entries) {
                            if (!entry.isIntersecting) continue;
                            entry.target._ovgLoadThumb?.();
                            state.thumbObserver.unobserve(entry.target);
                        }
                    }, { root:state.modal?.querySelector(".ovg-grid-wrap") || null, rootMargin:"350px" });
                }
                card._ovgLoadThumb = load;
                state.thumbObserver.observe(card);
            }

            function renderGrid() {
                if (!state.modal) return;
                releaseAllPlayers();
                state.thumbObserver?.disconnect(); state.thumbObserver = null;
                const grid = state.modal.querySelector(".ovg-grid");
                const rows = sortedFilteredVideos();
                grid.style.setProperty("--ovg-card-size", `${state.thumbSize}px`);
                grid.innerHTML = "";
                if (!rows.length) {
                    grid.innerHTML = `<div class="ovg-empty-grid">${t.empty}</div>`;
                    updateCount(); return;
                }
                const frag = document.createDocumentFragment();
                for (const item of rows) {
                    const card = document.createElement("div");
                    card.className = `ovg-card${state.marked.has(item.path) ? " marked" : ""}`;
                    card.dataset.path = item.path;
                    const date = new Date(item.mtime * 1000).toLocaleString();
                    card.innerHTML = `
                        <div class="ovg-thumb"><img alt="" draggable="false"><div class="ovg-thumb-fallback" style="display:none">🎬</div><button class="ovg-play" type="button" title="${t.play}">▶</button></div>
                        <div class="ovg-card-info">
                            <div class="ovg-card-name" title="${esc(item.path)}">${esc(item.name)}</div>
                            <div class="ovg-card-meta"><span title="${esc(item.folder || "output")}">${esc(item.folder || "output")}</span><span>${formatBytes(item.size)}</span></div>
                            <div class="ovg-card-meta"><span>${esc(date)}</span><span>${esc(item.ext)}</span></div>
                        </div>`;
                    const playBtn = card.querySelector(".ovg-play");
                    playBtn.addEventListener("pointerdown", e => e.stopPropagation());
                    playBtn.addEventListener("click", async e => { e.preventDefault(); e.stopPropagation(); try { await activateInlinePlayer(card,item,playBtn); } catch (err) { toast(err.message || String(err),"error"); } });
                    let clickTimer = null;
                    card.addEventListener("click", e => {
                        if (e.target.closest("button") || e.target.closest("video")) return;
                        if (performance.now() < state.dragSuppressUntil || e.detail !== 1) return;
                        clickTimer = setTimeout(() => toggleMarked(item.path), 180);
                    });
                    card.addEventListener("dblclick", async e => {
                        if (e.target.closest("button") || e.target.closest("video")) return;
                        if (clickTimer) clearTimeout(clickTimer);
                        e.preventDefault();
                        try { await activateInlinePlayer(card,item,playBtn); } catch (err) { toast(err.message || String(err),"error"); }
                    });
                    card.addEventListener("contextmenu", e => openContextMenu(e,item));
                    bindThumbLazyLoad(card,item);
                    frag.appendChild(card);
                }
                grid.appendChild(frag);
                updateCount();
            }

            function setupRectangleSelection(modal) {
                const gridWrap = modal.querySelector(".ovg-grid-wrap");
                let drag = null, pendingTouch = null, autoFrame = 0;

                const paint = () => {
                    if (!drag) return;
                    state.marked = new Set([...drag.base, ...drag.touched]);
                    paintMarkedCards();
                };

                const beginDrag = (pointerId, x, y) => {
                    drag = { startX:x,startY:y,x,y,base:new Set(state.marked),touched:new Set(),active:false,box:null,pointerId };
                    try { gridWrap.setPointerCapture?.(pointerId); } catch (_) {}
                };

                const updateDrag = (x, y) => {
                    if (!drag) return;
                    drag.x = x; drag.y = y;
                    const dx = x - drag.startX, dy = y - drag.startY;
                    if (!drag.active && Math.hypot(dx,dy) < 5) return;
                    if (!drag.active) {
                        drag.active = true;
                        drag.box = document.createElement("div"); drag.box.className = "ovg-select-box"; document.body.appendChild(drag.box);
                        const auto = () => {
                            if (!drag?.active) return;
                            const r = gridWrap.getBoundingClientRect(), edge = 72, maxStep = 28;
                            let speed = 0;
                            if (drag.y <= r.top + edge && drag.y >= r.top - edge) { const t=Math.min(1,Math.max(0,(r.top+edge-drag.y)/edge)); speed=-Math.max(1,Math.ceil(maxStep*t*t)); }
                            else if (drag.y >= r.bottom - edge && drag.y <= r.bottom + edge) { const t=Math.min(1,Math.max(0,(drag.y-(r.bottom-edge))/edge)); speed=Math.max(1,Math.ceil(maxStep*t*t)); }
                            if (speed) { const before=gridWrap.scrollTop; gridWrap.scrollTop += speed; if (gridWrap.scrollTop !== before) updateDrag(drag.x,drag.y); }
                            autoFrame = requestAnimationFrame(auto);
                        };
                        autoFrame = requestAnimationFrame(auto);
                    }
                    const left=Math.min(drag.startX,x),top=Math.min(drag.startY,y),right=Math.max(drag.startX,x),bottom=Math.max(drag.startY,y);
                    Object.assign(drag.box.style,{left:`${left}px`,top:`${top}px`,width:`${right-left}px`,height:`${bottom-top}px`});
                    for (const card of modal.querySelectorAll(".ovg-card")) {
                        const r=card.getBoundingClientRect();
                        if (r.right>=left&&r.left<=right&&r.bottom>=top&&r.top<=bottom) drag.touched.add(card.dataset.path);
                    }
                    paint();
                };

                const cancelPendingTouch = () => {
                    if (!pendingTouch) return;
                    clearTimeout(pendingTouch.timer); pendingTouch = null;
                };

                gridWrap.addEventListener("pointerdown", e => {
                    if (e.button !== 0 || e.target.closest(".ovg-card,button,input,select,video")) return;
                    if (e.pointerType === "touch") {
                        const p = {pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,timer:0};
                        p.timer = setTimeout(() => {
                            if (pendingTouch !== p) return;
                            pendingTouch = null;
                            beginDrag(p.pointerId,p.startX,p.startY);
                        },400);
                        pendingTouch = p;
                        return;
                    }
                    beginDrag(e.pointerId,e.clientX,e.clientY);
                });

                gridWrap.addEventListener("pointermove", e => {
                    if (pendingTouch && e.pointerId === pendingTouch.pointerId) {
                        pendingTouch.lastX=e.clientX; pendingTouch.lastY=e.clientY;
                        if (Math.hypot(e.clientX-pendingTouch.startX,e.clientY-pendingTouch.startY)>10) cancelPendingTouch();
                        return;
                    }
                    if (!drag || e.pointerId !== drag.pointerId) return;
                    if (drag.active) e.preventDefault();
                    updateDrag(e.clientX,e.clientY);
                }, {passive:false});

                const finish = e => {
                    if (pendingTouch && e.pointerId === pendingTouch.pointerId) cancelPendingTouch();
                    if (!drag || e.pointerId !== drag.pointerId) return;
                    if (drag.active) state.dragSuppressUntil = performance.now() + 400;
                    drag.box?.remove(); drag = null;
                    if (autoFrame) cancelAnimationFrame(autoFrame); autoFrame = 0;
                };
                gridWrap.addEventListener("pointerup",finish);
                gridWrap.addEventListener("pointercancel",finish);
            }

            function setupPlayerEvictionOnScroll(modal) {
                const wrap = modal.querySelector(".ovg-grid-wrap");
                wrap.addEventListener("scroll", () => {
                    if (state.scrollRaf) return;
                    state.scrollRaf = requestAnimationFrame(() => {
                        state.scrollRaf = 0;
                        const wr=wrap.getBoundingClientRect(),pad=Math.max(900,wr.height*1.5);
                        for (const [path,entry] of [...state.players.entries()]) {
                            if (!entry.card.isConnected) { releaseInlinePlayer(path); continue; }
                            const r=entry.card.getBoundingClientRect();
                            if (r.bottom < wr.top-pad || r.top > wr.bottom+pad) releaseInlinePlayer(path);
                        }
                    });
                }, {passive:true});
            }

            function closeModal() {
                closeMenu(); releaseAllPlayers();
                state.thumbObserver?.disconnect(); state.thumbObserver = null;
                if (state.scrollRaf) cancelAnimationFrame(state.scrollRaf); state.scrollRaf = 0;
                if (state.escapeHandler) document.removeEventListener("keydown",state.escapeHandler);
                state.escapeHandler = null;
                state.modal?.remove(); state.modal = null;
            }

            async function openModal() {
                closeModal();
                const modal=document.createElement("div"); modal.className="ovg-modal";
                modal.innerHTML=`
                    <div class="ovg-window">
                        <div class="ovg-titlebar"><div class="ovg-title">${t.title}</div><div class="ovg-count"></div><button class="ovg-btn ovg-close" title="${t.close}">×</button></div>
                        <div class="ovg-toolbar">
                            <input class="ovg-search" type="text" placeholder="${t.search}">
                            <select class="ovg-sort" title="${t.sortTitle}">
                                <option value="date_desc">${t.dateDesc}</option><option value="date_asc">${t.dateAsc}</option><option value="name_asc">${t.nameAsc}</option><option value="name_desc">${t.nameDesc}</option><option value="size_desc">${t.sizeDesc}</option><option value="size_asc">${t.sizeAsc}</option>
                            </select>
                            <input class="ovg-size" type="range" min="120" max="320" step="10" value="${state.thumbSize}" title="${t.previewSize}">
                            <button class="ovg-btn ovg-refresh-modal" title="${t.refresh}">↻</button>
                            <button class="ovg-btn ovg-select-all">${t.selectAll}</button>
                            <button class="ovg-btn ovg-clear-all">${t.clearAll}</button>
                            <button class="ovg-btn ovg-help" title="${t.help}">?</button>
                        </div>
                        <div class="ovg-grid-wrap"><div class="ovg-grid"></div></div>
                    </div>`;
                document.body.appendChild(modal); state.modal=modal;
                modal.querySelector(".ovg-sort").value=state.sort;
                modal.querySelector(".ovg-search").value=state.search;
                modal.querySelector(".ovg-close").onclick=closeModal;
                modal.addEventListener("mousedown",e=>{if(e.target===modal)closeModal();});
                modal.querySelector(".ovg-search").addEventListener("input",e=>{state.search=e.target.value;renderGrid();});
                modal.querySelector(".ovg-sort").addEventListener("change",e=>{state.sort=e.target.value;localStorage.setItem(LS_SORT,state.sort);renderGrid();});
                modal.querySelector(".ovg-size").addEventListener("input",e=>{state.thumbSize=Number(e.target.value);localStorage.setItem(LS_THUMB,String(state.thumbSize));renderGrid();});
                modal.querySelector(".ovg-refresh-modal").onclick=async()=>{try{const done=setBusy(t.refreshBusy);await fetchVideos({clearSelection:true});done();renderGrid();}catch(e){toast(e.message||String(e),"error");}};
                modal.querySelector(".ovg-select-all").onclick=()=>{for(const v of sortedFilteredVideos())state.marked.add(v.path);paintMarkedCards();};
                modal.querySelector(".ovg-clear-all").onclick=()=>{state.marked.clear();paintMarkedCards();};
                modal.querySelector(".ovg-help").onclick=e=>{e.preventDefault();e.stopPropagation();openHelp();};
                setupRectangleSelection(modal); setupPlayerEvictionOnScroll(modal); updateCount();
                state.escapeHandler=e=>{if(e.key==="Escape"&&state.modal===modal)closeModal();};
                document.addEventListener("keydown",state.escapeHandler);
                try { await fetchVideos(); renderGrid(); } catch(e) { toast(e.message||String(e),"error"); renderGrid(); }
            }

            const installButton = () => {
                if (!node?.widgets) return;
                let button = node.widgets.find(w => w?.name === "Галерея output");
                if (!button) {
                    button = node.addWidget("button","Галерея output",null,()=>openModal(),{serialize:false});
                    button.serialize=false;
                }
                button.hidden=false;
                button.computeSize=(width)=>[width??node.size?.[0]??320,64];
                button.computeLayoutSize=()=>({minHeight:64,maxHeight:64,minWidth:0});
                button.drawWidget=function(ctx,options){
                    const h=this.computedHeight??64,y=this.y??0,width=options?.width??node.size?.[0]??320,m=8;
                    ctx.save();ctx.globalAlpha=this.computedDisabled?.45:1;ctx.fillStyle=this.clicked?this.outline_color:this.background_color;ctx.strokeStyle=this.outline_color;ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(m,y,width-m*2,h,12);ctx.fill();ctx.stroke();ctx.fillStyle=this.text_color;ctx.font="700 20px Arial,sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(t.outputButton,width/2,y+h/2);ctx.restore();
                };
                const pi=node.widgets.findIndex(w=>w?.name==="$$canvas-image-preview"||(w?.options?.canvasOnly===true&&typeof w?.drawWidget==="function"&&w!==button));
                const bi=node.widgets.indexOf(button);
                if (pi>=0&&bi>=0&&bi!==pi-1) {
                    node.widgets.splice(bi,1);
                    const pi2=node.widgets.findIndex(w=>w?.name==="$$canvas-image-preview"||(w?.options?.canvasOnly===true&&typeof w?.drawWidget==="function"&&w!==button));
                    node.widgets.splice(Math.max(0,pi2),0,button);
                }
                node.graph?.setDirtyCanvas?.(true,true);
            };
            installButton(); requestAnimationFrame(installButton);
            for (const ms of [50,250,1000,2000,5000,10000]) setTimeout(installButton,ms);

            const oldRemoved=node.onRemoved;
            node.onRemoved=function(){closeModal();oldRemoved?.apply(this,arguments);};
            return result;
        };
    },
});
