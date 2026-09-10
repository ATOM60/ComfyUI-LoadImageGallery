# ComfyUI Load Image Gallery

Visual image loader for ComfyUI with an integrated video gallery for `output` and external folders.

**Languages / Языки:** English + Русский.

---

## Русский

### Галерея изображений

- Просмотр изображений из `input` и внешних папок.
- Работа с вложенными папками без выхода из галереи.
- Поиск по имени файла.
- Изменение размера карточек/превью с запоминанием значения.
- Сортировка по имени, дате и размеру файла.
- Избранное.
- Одиночное и массовое выделение.
- Выделение рамкой и touch hold + drag.
- Двойной клик загружает изображение в ноду.
- Переход по изображениям стрелками в превью ноды.
- Копирование, вставка и сохранение через контекстное меню.
- Последовательный запуск выбранных изображений кнопкой **СТАРТ**.
- Запоминание последнего изображения workflow.
- Быстрое открытие недавно использованных внешних папок.

### Галерея видео output

Открывается большой кнопкой **Галерея output** в верхней части ноды.

- Видео из ComfyUI `output` и выбранных внешних папок.
- Системная кнопка `...` для выбора внешней папки и список недавних папок.
- Превью видео.
- Поиск по имени/папке.
- Автоматическое появление новых видео во время открытой галереи: после событий выполнения ComfyUI и резервная проверка примерно раз в 10 секунд.
- Автообновление откладывается во время активного воспроизведения или массового выделения, чтобы не сбивать работу.
- Сортировка по дате, имени и размеру.
- Избранное с сохранением позиции прокрутки.
- Изменение размера карточек.
- Одиночное и массовое выделение, включая рамку и touch hold + drag.
- Копирование выбранных видео в буфер Windows с последующей вставкой в Проводник.
- Переименование, показ в папке и удаление.
- Загрузка совместимого видео как ComfyUI workflow через контекстное меню, если метаданные workflow встроены в файл. Поддерживаемые для этого форматы: **MP4, MOV, M4V, WebM**.

### Проигрыватель видео

- Один клик — воспроизведение/пауза.
- Двойной клик — fullscreen; повторный двойной клик в fullscreen ставит видео на паузу и выходит из fullscreen.
- Зацикленное воспроизведение.
- Колесо мыши меняет громкость.
- Громкость и скорость запоминаются.
- Справа в fullscreen доступны предыдущее видео, скорость и следующее видео.
- Интерфейс fullscreen, боковые кнопки, badge CPU/GPU и курсор автоматически скрываются после короткого бездействия и появляются снова при движении мыши, касании или нажатии клавиши.
- GPU-плеер не выполняет постоянный UI polling в простое; после паузы наша оболочка не должна создавать фоновую GPU-нагрузку.
- Галерея может держать до трёх inline-плееров, но одновременно воспроизводится только активный.

### CPU-декодирование и fallback

В верхней строке галереи есть компактный переключатель **CPU**. Он переносит декодирование видео на процессор — это удобно, когда GPU занят ComfyUI.

CPU-плеер использует тот же интерфейс и поддерживает:

- play / pause;
- timeline и seek;
- текущее время / длительность;
- громкость;
- fullscreen;
- предыдущее / следующее видео;
- скорость 0.25–3×;
- запоминание громкости и скорости;
- loop.

Если браузер/GPU не может декодировать конкретное видео, плеер автоматически переключает **только этот файл** на CPU, сохраняя ту же оболочку и fullscreen-сессию. Badge меняется с **GPU** на **CPU**.

Для CPU-воспроизведения видеокадры декодируются FFmpeg. Аудиодорожка старых файлов тоже при необходимости перекодируется FFmpeg на лету в совместимый поток, поэтому старый/неподдерживаемый Chromium аудиокодек не должен оставлять видео без звука.

CPU-интерфейс обновляет прогресс с низкой частотой только во время воспроизведения и не делает фоновых обновлений на паузе.

### Встроенная инструкция

Кнопка **?** в Output Gallery открывает текущую инструкцию на выбранном языке. В ней описаны галерея изображений, output-видео, избранное, автообновление, выбор внешней папки, CPU-режим, автоматический GPU→CPU fallback, совместимый звук старых файлов и поведение fullscreen.

### Язык интерфейса

Галерея изображений и Output Gallery используют общий язык `ComfyUI-LoadImageGallery.language` с fallback на язык браузера. Поддерживаются **русский и английский**: основные кнопки, меню, подсказки, CPU/GPU-плеер, избранное, выбор папок, автообновление, touch-scrub и встроенная инструкция.

---

## English

### Image gallery

- Browse images from ComfyUI `input` and external folders.
- Open nested folders without leaving the gallery.
- Search by filename.
- Change card/preview size with remembered settings.
- Sort by name, date or file size.
- Favorites.
- Single and multi-selection.
- Rectangle selection and touch hold + drag.
- Double click an image to load it into the node.
- Navigate through the current folder with previous/next arrows in the node preview.
- Copy, paste and save images from the context menu.
- Queue selected images with **START**.
- Remember the last image used by a workflow.
- Quickly reopen recently used external folders.

### Output Video Gallery

Open it with the large **Output Gallery** button at the top of the node.

- Browse videos from ComfyUI `output` and selected external folders.
- Use the `...` system folder picker and a recent-folder list.
- Video thumbnails.
- Search by filename/folder.
- Automatically detect new videos while the gallery is open after ComfyUI execution events, with a low-frequency fallback check about every 10 seconds.
- Refresh is deferred while a video is actively playing or videos are selected, so playback/selection is not interrupted.
- Sort by date, name or file size.
- Favorites with stable scroll position.
- Adjustable card size.
- Single and multi-selection, rectangle selection and touch hold + drag.
- Copy selected videos to the Windows clipboard and paste them in Explorer.
- Rename, reveal in folder and delete videos.
- Open compatible videos as a ComfyUI workflow from the context menu when workflow metadata is embedded. Supported workflow-metadata formats: **MP4, MOV, M4V, WebM**.

### Video player

- Single click: play/pause.
- Double click: fullscreen; double click again in fullscreen pauses and exits fullscreen.
- Automatic looping.
- Mouse wheel changes volume.
- Volume and playback speed are remembered.
- Fullscreen side controls provide previous video, speed and next video.
- The fullscreen UI, side controls, CPU/GPU badge and cursor automatically hide after a short idle period and reappear on mouse movement, touch or keyboard activity.
- The GPU player does not run continuous shared-UI polling while idle, so a paused player should not create background GPU load from this extension.
- Up to three inline player instances may remain in the gallery, while only the active video plays.

### CPU decoding and automatic fallback

A compact **CPU** switch in the gallery header moves decoding work to the processor, which is useful while ComfyUI heavily uses the GPU.

The CPU player keeps the same interface with:

- play / pause;
- seek timeline;
- current time / duration;
- volume;
- fullscreen;
- previous / next video;
- 0.25–3× playback speed;
- remembered volume and speed;
- loop.

If the browser/GPU cannot decode a particular video, only that file automatically falls back to CPU decoding while keeping the same player shell and fullscreen session. The badge changes from **GPU** to **CPU**.

CPU video frames are decoded through FFmpeg. Audio from legacy files is also transcoded through FFmpeg on the fly when needed, so an audio codec unsupported by Chromium should not leave CPU playback silent.

The CPU UI updates progress at a low rate only during playback and performs no background progress polling while paused.

### Built-in help

The **?** button in Output Gallery opens the current guide in the selected language. It covers the image gallery, output videos, favorites, auto-refresh, external folders, CPU mode, automatic GPU→CPU fallback, compatible audio for legacy files and fullscreen behavior.

### Interface language

The image gallery and Output Gallery share `ComfyUI-LoadImageGallery.language`, with the browser language as fallback. **English and Russian** are supported across the main controls, menus, tooltips, CPU/GPU player, favorites, folder picker, auto-refresh, touch scrub and built-in help.

---

## Node layout

The node keeps the normal ComfyUI outputs:

- **IMAGE**
- **MASK**

Visible controls:

1. **Output Gallery / Галерея output**
2. **Image preview / Превью изображения**
3. **START / СТАРТ**

Videos are played inside Output Gallery, not directly on the node.

## Installation / Установка

Open a terminal in your ComfyUI `custom_nodes` directory / откройте терминал в папке `custom_nodes` ComfyUI:

```bash
git clone https://github.com/ATOM60/ComfyUI-LoadImageGallery.git
```

Restart ComfyUI / перезапустите ComfyUI.

Node name / название ноды: **Load Image Gallery**.

## Updating / Обновление

From the installed node folder / из папки установленной ноды:

```bash
git pull
```

Then refresh the frontend or restart ComfyUI when Python backend files were changed / затем обновите frontend или перезапустите ComfyUI, если менялись Python-файлы backend.

## Repository

https://github.com/ATOM60/ComfyUI-LoadImageGallery
