import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.ScenarioHelp";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const PRODUCT_NAME = "Liber Load Image from Gallery and Output Gallery";

function isRu() {
    return String(localStorage.getItem(LANG_KEY) || navigator.language || "en")
        .toLowerCase()
        .startsWith("ru");
}

function helpHtml() {
    if (isRu()) {
        return `
            <h3>Изображения</h3>
            <ul>
                <li><b>Выбрать изображение:</b> нажмите на предпросмотр в ноде, найдите файл и дважды нажмите на него.</li>
                <li><b>Листать без открытия галереи:</b> используйте стрелки ‹ и › по бокам предпросмотра ноды.</li>
                <li><b>Запустить несколько изображений:</b> выделите нужные файлы и нажмите СТАРТ.</li>
                <li><b>Массовое выделение:</b> протяните рамку мышью; на сенсорном экране удерживайте палец и затем тяните.</li>
                <li><b>Открыть другую папку:</b> используйте папки внутри галереи или кнопку «...» для системного выбора папки.</li>
                <li><b>Быстро найти файл:</b> используйте поиск, сортировку, размер превью и избранное.</li>
            </ul>

            <h3>Видео</h3>
            <ul>
                <li><b>Открыть видео:</b> нажмите «Галерея output», затем выберите видео.</li>
                <li><b>Воспроизведение:</b> один клик запускает видео или ставит его на паузу.</li>
                <li><b>Fullscreen:</b> двойной клик открывает видео на весь экран; повторный двойной клик выходит из fullscreen.</li>
                <li><b>Перемотка жестом:</b> проведите по видео горизонтально влево или вправо.</li>
                <li><b>Громкость:</b> прокручивайте колесо мыши над видео.</li>
                <li><b>Переключение видео в fullscreen:</b> ⏮ — предыдущее, ⏱ — скорость, ⏭ — следующее.</li>
                <li><b>Скрытый интерфейс:</b> подвигайте мышью, коснитесь экрана или нажмите клавишу, чтобы снова показать элементы управления.</li>
            </ul>

            <h3>Если видео тормозит во время генерации</h3>
            <ul>
                <li>Включите кнопку <b>CPU</b> в верхней панели галереи и запустите видео как обычно.</li>
                <li>В CPU-режиме доступны play/pause, перемотка, громкость, скорость, fullscreen и переключение между видео.</li>
                <li>Чтобы вернуться к обычному режиму, нажмите <b>CPU</b> ещё раз.</li>
            </ul>

            <h3>Работа с файлами</h3>
            <ul>
                <li>Правая кнопка мыши открывает действия с видео: воспроизвести, выделить, скопировать, переименовать, показать в папке и удалить.</li>
                <li>Чтобы скопировать несколько видео, выделите их, скопируйте в буфер и вставьте в Проводнике через Ctrl+V.</li>
                <li>Если в видео сохранён workflow ComfyUI, откройте его через соответствующий пункт контекстного меню.</li>
                <li>Если нового видео ещё нет в списке, нажмите <b>Обновить</b>.</li>
            </ul>
        `;
    }

    return `
        <h3>Images</h3>
        <ul>
            <li><b>Choose an image:</b> click the node preview, find the file and double-click it.</li>
            <li><b>Browse without opening the gallery:</b> use the ‹ and › arrows beside the node preview.</li>
            <li><b>Queue several images:</b> select the files you need and press START.</li>
            <li><b>Multi-selection:</b> drag a selection rectangle; on a touch screen, hold and then drag.</li>
            <li><b>Open another folder:</b> browse folders inside the gallery or use the “...” system folder picker.</li>
            <li><b>Find files faster:</b> use search, sorting, preview size and favorites.</li>
        </ul>

        <h3>Videos</h3>
        <ul>
            <li><b>Open videos:</b> press Output Gallery, then choose a video.</li>
            <li><b>Playback:</b> single click plays or pauses.</li>
            <li><b>Fullscreen:</b> double-click to enter fullscreen; double-click again to exit fullscreen.</li>
            <li><b>Gesture seeking:</b> swipe horizontally left or right over the video.</li>
            <li><b>Volume:</b> use the mouse wheel over the video.</li>
            <li><b>Fullscreen navigation:</b> ⏮ — previous, ⏱ — speed, ⏭ — next.</li>
            <li><b>Hidden controls:</b> move the mouse, touch the screen or press a key to show the controls again.</li>
        </ul>

        <h3>If playback becomes slow during generation</h3>
        <ul>
            <li>Enable <b>CPU</b> in the gallery header and play the video normally.</li>
            <li>CPU mode keeps play/pause, seeking, volume, speed, fullscreen and previous/next navigation.</li>
            <li>Press <b>CPU</b> again to return to normal playback.</li>
        </ul>

        <h3>File actions</h3>
        <ul>
            <li>Right-click a video for play, select, copy, rename, reveal in folder and delete actions.</li>
            <li>To copy several videos, select them, copy to the clipboard and paste in Windows Explorer with Ctrl+V.</li>
            <li>If the video contains saved ComfyUI workflow data, open it from the corresponding context-menu action.</li>
            <li>If a new video is not visible yet, press <b>Refresh</b>.</li>
        </ul>
    `;
}

function applyScenarioHelp(root = document) {
    const overlays = [];
    if (root instanceof HTMLElement && root.classList.contains("ovg-help-overlay")) overlays.push(root);
    root.querySelectorAll?.(".ovg-help-overlay").forEach(el => overlays.push(el));

    for (const overlay of overlays) {
        if (!(overlay instanceof HTMLElement)) continue;
        const body = overlay.querySelector(".ovg-help-body");
        if (!(body instanceof HTMLElement)) continue;
        if (body.dataset.cigScenarioHelp === "1") continue;
        body.dataset.cigScenarioHelp = "1";
        const title = overlay.querySelector(".ovg-help-head span");
        if (title instanceof HTMLElement) title.textContent = isRu() ? `${PRODUCT_NAME} — краткая инструкция` : `${PRODUCT_NAME} — quick guide`;
        body.innerHTML = helpHtml();
    }
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        applyScenarioHelp(document);
        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    queueMicrotask(() => applyScenarioHelp(node));
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
