// CIG_SCENARIO_HELP_V2
// The built-in guides, written as scenarios: what you want to do, the steps,
// then the details. One source for both galleries and both languages; the
// numbering matches README.md / README_RU.md. Text may use **bold** for
// control names. No side effects on import, so ComfyUI may also load this
// file as an extension module.

const LANG_KEY = "ComfyUI-LoadImageGallery.language";

export function helpLanguage() {
    try {
        return String(localStorage.getItem(LANG_KEY) || navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
    } catch (_) {
        return "en";
    }
}

const EN = {
    imageTitle: "Image gallery — scenarios",
    videoTitle: "Output Gallery — scenarios",
    imageFooter: "Video scenarios (9–13) are in the help of the Output Gallery.",
    videoFooter: "Image scenarios (1–8) are in the help of the image gallery: click the node preview, then **?**.",
    images: [
        {
            n: 1, title: "Choose one image",
            steps: [
                "Click the image preview in the node — the gallery opens in the folder you last browsed.",
                "Find the file using folders, search, sorting or favorites.",
                "Double-click the image, or select it and press **Enter**.",
            ],
            notes: [
                "The image is loaded into the node and the gallery closes. The **✕** button closes the gallery without a choice; **Esc** and clicks outside do not close it.",
                "The arrow keys move between cards. When the workflow is opened again, the last selected image is restored.",
            ],
        },
        {
            n: 2, title: "Browse images right in the node",
            steps: [
                "Click **‹** or **›** beside the node preview.",
            ],
            notes: [
                "The arrows follow the gallery's sorting and favorites. They are dimmed while the list loads or when there are fewer than two images.",
                "If the image was chosen with **Subfolders** on (scenario 7), the arrows walk the same list, subfolders included.",
            ],
        },
        {
            n: 3, title: "Look at an image up close",
            steps: [
                "Hold the left mouse button on a gallery thumbnail or on the node preview for about 0.3 s.",
                "The image opens full screen, magnified 6×.",
                "Keep holding and move the mouse: the pointer's place on the screen is the place of the image you see — screen corner, image corner.",
                "Release the button to close.",
            ],
            notes: [
                "The original file is shown; the thumbnail stands in until it loads. The selection does not change, and a short click works as before. Mouse only.",
            ],
        },
        {
            n: 4, title: "Queue several images",
            steps: [
                "Select images: click a card; **Shift**+click selects a range; **Space** toggles the focused card; drag a rectangle starting on empty space. On a touch screen, hold about 0.4 s, then drag.",
                "Press **START** in the gallery.",
            ],
            notes: [
                "Images are queued one after another in selection order; the button shows the progress. Queueing continues even if the gallery is closed.",
                "The selection stays while scrolling and when the gallery is reopened for the same node; **Refresh** clears it. Dragging near the top or bottom edge scrolls automatically.",
            ],
        },
        {
            n: 5, title: "Save and reuse image sets",
            steps: [
                "Select the images you need.",
                "Press **Sets ▾** → **+ Create from selected** and enter a name.",
                "Later, click the set name to restore it as the current selection, or open **⋮** → **Start** to queue the whole set at once.",
            ],
            notes: [
                "A set keeps the selection order. **⋮** also offers **Replace with selected**, **Add selected**, **Remove selected**, **Rename** and **Delete**.",
                "Sets may mix folders, including external ones. They are shared by all workflows and nodes and stored in ComfyUI/user/image_gallery_sets.json.",
            ],
        },
        {
            n: 6, title: "Open another folder",
            steps: [
                "Double-click a folder card, or use the path line above the images and **↑** to go up.",
                "Or choose a folder in the **Folder:** list at the bottom.",
                "Press **...** to pick any folder on the computer.",
            ],
            notes: [
                "Folder cards show up to four thumbnails and the image count; a folder without its own images borrows them from its subfolders.",
                "Up to 20 recently used external folders stay in the list.",
            ],
        },
        {
            n: 7, title: "See a folder with all its subfolders as one list",
            steps: [
                "Press **Subfolders** in the top bar.",
                "All images of the folder and of its subfolders at any depth are shown together, as if they lay in this folder; folder cards are hidden.",
                "Press **Subfolders** again to return to the normal view.",
            ],
            notes: [
                "Search and name sorting use the file name; hover a card to see its full path. Selection, sets, **START** and the node arrows work across the whole list.",
                "The setting is remembered. At most 20,000 images are listed — the counter at the bottom says when the list was cut off.",
            ],
        },
        {
            n: 8, title: "Find and handle images faster",
            steps: [
                "Type part of the file name in the search field.",
                "Use **⇅** to sort by name, date or size, and the slider to change the card size.",
                "Click **♡** on a card to add it to favorites — favorites stay on top with any sorting.",
            ],
            notes: [
                "Right-click an image for **Save Image**, **Copy Image** and **Paste Image** — paste puts the copied image into the open folder.",
                "Thumbnails are cached on disk (the counter is at the bottom); **Clear cache** removes them and they are rebuilt when shown again.",
            ],
        },
    ],
    videos: [
        {
            n: 9, title: "Open the video gallery",
            steps: [
                "Press **Output Gallery** in the node.",
                "Choose output or a recent external folder in the list next to search, or press **...** to pick another folder.",
                "Find the video with search (by name or folder), sorting, favorites and the card size slider.",
            ],
            notes: [
                "New videos appear by themselves: the folder is checked every few seconds while the gallery is open and again right after a generation. During a generation, while a video plays or while videos are selected, the update waits. **Refresh** reloads at once.",
                "Thumbnails are made in the background and may take longer during a generation. If a card keeps showing 🎬, hover it to see the reason; it is also written to the ComfyUI console.",
            ],
        },
        {
            n: 10, title: "Watch videos",
            steps: [
                "Click the preview to play or pause.",
                "Double-click to go fullscreen; double-click again to return.",
                "In fullscreen, use **⏮** previous, **⏱** speed and **⏭** next on the right.",
            ],
            notes: [
                "Swipe horizontally over the video to seek; the mouse wheel changes the volume, and the speaker button mutes. Videos loop; speed and volume are remembered.",
                "After fullscreen, the last viewed video keeps playing in its own card from the same position. Controls hide when idle and return on mouse movement, touch or a key press.",
            ],
        },
        {
            n: 11, title: "Watch videos while the GPU is busy",
            steps: [
                "Turn on **CPU** in the gallery's top bar.",
                "Play videos as usual; press **CPU** again to go back.",
            ],
            notes: [
                "CPU mode keeps play/pause, seeking, volume, speed, fullscreen and previous/next.",
                "If the browser cannot decode a video, the player switches to CPU by itself (the badge changes from GPU to CPU), and unsupported audio is converted on the fly.",
            ],
        },
        {
            n: 12, title: "Manage video files",
            steps: [
                "Select videos: click a card below its preview, drag a rectangle, **Shift**+click a range, or press **Select all**.",
                "Right-click a video: play, select, copy, rename, show in folder, delete, or **Open as workflow**.",
                "To copy several videos, choose copy and paste them in Windows Explorer with **Ctrl+V**.",
            ],
            notes: [
                "Deleted files go to the Recycle Bin when it is available.",
                "**Open as workflow** loads the ComfyUI workflow saved inside MP4, MOV, M4V and WebM files.",
            ],
        },
        {
            n: 13, title: "Use favorites",
            steps: [
                "Click the heart under a video, or **♡** on an image card.",
            ],
            notes: [
                "Favorites are shown first in their gallery; click again to remove the mark.",
            ],
        },
    ],
};

const RU = {
    imageTitle: "Галерея изображений — сценарии",
    videoTitle: "Галерея output — сценарии",
    imageFooter: "Сценарии для видео (9–13) — в инструкции галереи output.",
    videoFooter: "Сценарии для изображений (1–8) — в инструкции галереи изображений: нажмите на превью в ноде, затем **?**.",
    images: [
        {
            n: 1, title: "Выбрать одно изображение",
            steps: [
                "Нажмите на превью изображения в ноде — галерея откроется в последней просмотренной папке.",
                "Найдите файл через папки, поиск, сортировку или избранное.",
                "Дважды нажмите на изображение или выделите его и нажмите **Enter**.",
            ],
            notes: [
                "Изображение загрузится в ноду, а галерея закроется. Кнопка **✕** закрывает галерею без выбора; **Esc** и клик вне окна её не закрывают.",
                "Стрелки клавиатуры переключают карточки. При повторном открытии workflow последнее выбранное изображение восстанавливается.",
            ],
        },
        {
            n: 2, title: "Листать изображения прямо в ноде",
            steps: [
                "Нажимайте **‹** или **›** по бокам превью в ноде.",
            ],
            notes: [
                "Стрелки следуют сортировке и избранному галереи. Пока список загружается или изображений меньше двух, стрелки приглушены.",
                "Если изображение выбрано при включённых **Подпапках** (сценарий 7), стрелки листают тот же список вместе с подпапками.",
            ],
        },
        {
            n: 3, title: "Рассмотреть изображение вблизи",
            steps: [
                "Удерживайте левую кнопку мыши на превью в галерее или в ноде около 0,3 секунды.",
                "Изображение откроется на весь экран, увеличенным в 6 раз.",
                "Не отпуская кнопку, водите мышью: где курсор на экране, та часть изображения и видна — угол экрана соответствует углу изображения.",
                "Отпустите кнопку, чтобы закрыть.",
            ],
            notes: [
                "Показывается оригинал файла; пока он загружается, видна миниатюра. Выделение не меняется, короткий клик работает как раньше. Только для мыши.",
            ],
        },
        {
            n: 4, title: "Запустить несколько изображений по очереди",
            steps: [
                "Выделите изображения: клик по карточке; **Shift**+клик — диапазон; **пробел** — карточка в фокусе; рамка, начатая на пустом месте. На сенсорном экране удерживайте палец около 0,4 секунды и затем ведите.",
                "Нажмите **СТАРТ** в галерее.",
            ],
            notes: [
                "Изображения ставятся в очередь одно за другим в порядке выделения, на кнопке виден прогресс. Постановка продолжается, даже если закрыть галерею.",
                "Выделение сохраняется при прокрутке и при повторном открытии галереи у той же ноды; **Обновить** его сбрасывает. Если вести рамку у верхнего или нижнего края, галерея прокручивается сама.",
            ],
        },
        {
            n: 5, title: "Сохранить и повторно использовать набор",
            steps: [
                "Выделите нужные изображения.",
                "Нажмите **Наборы ▾** → **+ Создать из выделенных** и задайте имя.",
                "Позже нажмите на имя набора, чтобы восстановить его как выделение, или откройте **⋮** → **Старт**, чтобы сразу поставить весь набор в очередь.",
            ],
            notes: [
                "Набор хранит порядок выделения. В **⋮** также есть **Заменить текущим**, **Добавить выделенные**, **Убрать выделенные**, **Переименовать** и **Удалить**.",
                "В наборе могут быть изображения из разных папок, в том числе внешних. Наборы общие для всех workflow и нод и хранятся в ComfyUI/user/image_gallery_sets.json.",
            ],
        },
        {
            n: 6, title: "Открыть другую папку",
            steps: [
                "Дважды нажмите на карточку папки или используйте строку пути над изображениями и **↑**, чтобы подняться выше.",
                "Или выберите папку в списке **Папка:** внизу.",
                "Кнопка **...** открывает выбор любой папки на компьютере.",
            ],
            notes: [
                "Карточка папки показывает до четырёх миниатюр и число изображений; если своих изображений нет, миниатюры берутся из подпапок.",
                "До 20 последних внешних папок сохраняются в списке.",
            ],
        },
        {
            n: 7, title: "Видеть папку вместе со всеми подпапками одним списком",
            steps: [
                "Нажмите **Подпапки** в верхней строке.",
                "Все изображения папки и её подпапок любой глубины покажутся вместе, как будто лежат в этой папке; карточки папок скрываются.",
                "Нажмите **Подпапки** ещё раз, чтобы вернуться к обычному виду.",
            ],
            notes: [
                "Поиск и сортировка по имени смотрят на имя файла; полный путь виден в подсказке при наведении. Выделение, наборы, **СТАРТ** и стрелки в ноде работают со всем списком.",
                "Настройка запоминается. Показывается не больше 20 000 изображений — если список обрезан, это видно в счётчике внизу.",
            ],
        },
        {
            n: 8, title: "Быстрее находить изображения и работать с ними",
            steps: [
                "Введите часть имени файла в поле поиска.",
                "Кнопка **⇅** сортирует по имени, дате или размеру, ползунок меняет размер карточек.",
                "**♡** на карточке добавляет изображение в избранное — избранные всегда выше остальных.",
            ],
            notes: [
                "Правый клик по изображению: **Сохранить изображение**, **Копировать изображение** и **Вставить изображение** — вставка кладёт скопированное изображение в открытую папку.",
                "Миниатюры кэшируются на диске (счётчик внизу); **Очистить кэш** удаляет их, и они создаются заново при показе.",
            ],
        },
    ],
    videos: [
        {
            n: 9, title: "Открыть галерею видео",
            steps: [
                "Нажмите **Галерея output** в ноде.",
                "Выберите output или недавнюю внешнюю папку в списке рядом с поиском либо нажмите **...**, чтобы выбрать другую папку.",
                "Найдите видео через поиск (по имени или папке), сортировку, избранное и ползунок размера карточек.",
            ],
            notes: [
                "Новые видео появляются сами: пока галерея открыта, папка проверяется каждые несколько секунд и ещё раз сразу после генерации. Во время генерации, воспроизведения или пока есть выделенные видео обновление ждёт. **Обновить** перечитывает список сразу.",
                "Миниатюры создаются в фоне, во время генерации — дольше. Если на карточке остаётся 🎬, наведите на неё курсор, чтобы увидеть причину; она же пишется в консоль ComfyUI.",
            ],
        },
        {
            n: 10, title: "Смотреть видео",
            steps: [
                "Клик по превью — воспроизведение или пауза.",
                "Двойной клик — на весь экран; ещё один двойной клик — обратно.",
                "На весь экран справа доступны **⏮** предыдущее, **⏱** скорость и **⏭** следующее.",
            ],
            notes: [
                "Горизонтальный жест по видео перематывает, колесо мыши меняет громкость, кнопка динамика выключает звук. Видео повторяется по кругу; скорость и громкость запоминаются.",
                "После выхода из полноэкранного режима последнее видео продолжает играть в своей карточке с той же позиции. Элементы управления скрываются при бездействии и возвращаются при движении мыши, касании или нажатии клавиши.",
            ],
        },
        {
            n: 11, title: "Смотреть видео, когда GPU занят",
            steps: [
                "Включите **CPU** в верхней строке галереи.",
                "Смотрите видео как обычно; ещё одно нажатие **CPU** возвращает обычный режим.",
            ],
            notes: [
                "В CPU-режиме остаются воспроизведение и пауза, перемотка, громкость, скорость, полный экран и переключение видео.",
                "Если браузер не может декодировать видео, плеер сам переходит на CPU (значок меняется с GPU на CPU), а неподдерживаемый звук перекодируется на лету.",
            ],
        },
        {
            n: 12, title: "Управлять видеофайлами",
            steps: [
                "Выделите видео: клик по карточке под превью, рамка, **Shift**+клик для диапазона или **Выбрать все**.",
                "Правый клик по видео: воспроизвести, выделить, копировать, переименовать, показать в папке, удалить или **Открыть как workflow**.",
                "Чтобы скопировать несколько видео, выберите копирование и вставьте их в Проводнике Windows через **Ctrl+V**.",
            ],
            notes: [
                "Удалённые файлы попадают в корзину, если она доступна.",
                "**Открыть как workflow** загружает workflow ComfyUI, сохранённый внутри файлов MP4, MOV, M4V и WebM.",
            ],
        },
        {
            n: 13, title: "Пользоваться избранным",
            steps: [
                "Нажмите сердечко под видео или **♡** на карточке изображения.",
            ],
            notes: [
                "Избранные показываются первыми в своей галерее; повторное нажатие снимает отметку.",
            ],
        },
    ],
};

export function helpScenarios(language = helpLanguage()) {
    return language === "ru" ? RU : EN;
}

const STYLE_ID = "cig-scenario-help-style";

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cig-scn{padding:12px 0;border-bottom:1px solid rgba(255,255,255,.09)}
.cig-scn:last-of-type{border-bottom:0}
.cig-scn-title{margin:0 0 6px;font-size:15px;font-weight:700;color:#fff}
.cig-scn-steps{margin:0 0 6px;padding-left:22px;font-size:13px;line-height:1.5;color:#ddd}
.cig-scn-steps li{margin:3px 0}
.cig-scn-note{margin:4px 0 0;font-size:12.5px;line-height:1.5;color:#aaa}
.cig-scn-footer{margin:14px 0 0;font-size:12.5px;line-height:1.5;color:#9ec8ff}
.cig-scn b{color:#fff;font-weight:700}
`;
    document.head.appendChild(style);
}

// "**Bold**" -> <b>; everything else stays text (no HTML is interpreted).
function appendRich(parent, text) {
    const parts = String(text).split(/\*\*(.+?)\*\*/g);
    parts.forEach((part, i) => {
        if (!part) return;
        if (i % 2) {
            const b = document.createElement("b");
            b.textContent = part;
            parent.appendChild(b);
        } else {
            parent.appendChild(document.createTextNode(part));
        }
    });
    return parent;
}

/** Renders a scenario list (and an optional footer line) into `container`. */
export function renderScenarios(container, scenarios, footer = "") {
    injectStyles();
    const frag = document.createDocumentFragment();
    for (const scenario of scenarios) {
        const section = document.createElement("section");
        section.className = "cig-scn";
        const title = document.createElement("h3");
        title.className = "cig-scn-title";
        title.textContent = `${scenario.n}. ${scenario.title}`;
        section.appendChild(title);
        if (scenario.steps?.length) {
            const list = document.createElement(scenario.steps.length > 1 ? "ol" : "ul");
            list.className = "cig-scn-steps";
            for (const step of scenario.steps) list.appendChild(appendRich(document.createElement("li"), step));
            section.appendChild(list);
        }
        for (const note of scenario.notes || []) {
            section.appendChild(appendRich(Object.assign(document.createElement("p"), { className: "cig-scn-note" }), note));
        }
        frag.appendChild(section);
    }
    if (footer) frag.appendChild(appendRich(Object.assign(document.createElement("p"), { className: "cig-scn-footer" }), footer));
    container.appendChild(frag);
}
