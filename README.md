# Liber Load Image from Gallery and Output Gallery

Image and video gallery for ComfyUI with fast browsing, selection, playback, fullscreen controls and external-folder support.

**Languages / Языки:** English + Русский.

---

# Русский

## Быстрый старт

Добавьте ноду **Liber Load Image from Gallery and Output Gallery** в workflow.

В ноде доступны:

- **Галерея output** — работа с видео;
- предпросмотр текущего изображения — открывает галерею изображений;
- **СТАРТ** — запускает выбранные изображения по очереди;
- выходы **IMAGE** и **MASK**.

## Сценарий 1. Выбрать одно изображение

1. Нажмите на предпросмотр изображения в ноде.
2. Найдите нужный файл через папки, поиск, сортировку или избранное.
3. Дважды нажмите на изображение.
4. Изображение загрузится в ноду, а галерея закроется.

После повторного открытия workflow последнее выбранное изображение восстанавливается автоматически.

## Сценарий 2. Быстро листать изображения прямо в ноде

Если в текущей папке несколько изображений, по бокам предпросмотра появляются стрелки.

- **‹** — предыдущее изображение;
- **›** — следующее изображение.

Стрелки доступны сразу после загрузки workflow — предварительно открывать галерею не нужно.

## Сценарий 3. Запустить несколько изображений по очереди

1. Откройте галерею изображений.
2. Выделите нужные изображения одиночными кликами или рамкой.
3. На сенсорном экране можно удержать палец и затем протянуть область выделения.
4. Нажмите **СТАРТ**.

Выбранные изображения будут последовательно отправлены в очередь ComfyUI.

## Сценарий 4. Работать с другой папкой изображений

1. Откройте галерею изображений.
2. Используйте навигацию по вложенным папкам или кнопку **...**.
3. Через **...** выберите любую доступную папку в системном окне.
4. Недавно использованные внешние папки можно быстро открыть повторно.

## Сценарий 5. Найти изображения быстрее

В галерее можно:

- искать по имени файла;
- сортировать по имени, дате и размеру;
- менять размер превью;
- добавлять изображения в избранное;
- копировать, вставлять и сохранять изображения через контекстное меню.

## Сценарий 6. Открыть галерею видео

1. Нажмите **Галерея output**.
2. Выберите `output` или ранее открытую внешнюю папку.
3. Для выбора новой внешней папки нажмите **...**.
4. Используйте поиск, сортировку, избранное и размер карточек, чтобы найти нужное видео.

Если новый файл ещё не появился в списке, нажмите **Обновить**.

## Сценарий 7. Смотреть видео

- Один клик по видео — воспроизведение или пауза.
- Двойной клик — открыть на весь экран.
- В полноэкранном режиме повторный двойной клик — выйти из полноэкранного режима.
- Горизонтальный жест по видео — перемотка назад или вперёд.
- Колесо мыши над видео — изменение громкости.
- Видео повторяется по кругу.
- Скорость и громкость запоминаются.

В полноэкранном режиме справа доступны:

- **⏮** — предыдущее видео;
- **⏱** — скорость воспроизведения;
- **⏭** — следующее видео.

Во время просмотра элементы управления скрываются после короткого бездействия. Подвигайте мышью, коснитесь экрана или нажмите клавишу, чтобы показать их снова. На паузе интерфейс остаётся видимым.

## Сценарий 8. Смотреть видео, когда GPU занят

Если во время генерации обычное воспроизведение начинает тормозить:

1. Откройте **Галерею output**.
2. Включите кнопку **CPU** в верхней панели.
3. Запустите видео как обычно.

В CPU-режиме остаются те же основные действия: play/pause, перемотка, громкость, скорость, fullscreen и переключение между видео.

Чтобы вернуться к обычному режиму, нажмите **CPU** ещё раз.

## Сценарий 9. Управлять видеофайлами

Через контекстное меню видео можно:

- воспроизвести файл;
- выделить его;
- скопировать;
- переименовать;
- показать в папке;
- удалить.

Для нескольких файлов:

1. Выделите нужные видео.
2. Скопируйте их в буфер обмена.
3. Вставьте в Проводнике Windows через **Ctrl+V**.

Также можно удалить сразу несколько выбранных видео.

Если в видео сохранены данные workflow ComfyUI, используйте соответствующий пункт контекстного меню, чтобы открыть workflow.

## Сценарий 10. Использовать избранное

Нажмите значок избранного на карточке изображения или видео. Избранные элементы можно быстро находить повторно, не меняя текущую позицию просмотра галереи.

## Встроенная инструкция

Кнопка **? / Инструкция** в галерее видео открывает краткую справку на выбранном языке. Она построена по тем же сценариям: изображения, выбор папок, массовая работа, воспроизведение, fullscreen, жесты, CPU-режим и управление файлами.

## Язык

Интерфейс поддерживает **русский и английский**. Язык применяется к основным кнопкам, меню, подсказкам и встроенной инструкции.

---

# English

## Quick start

Add the **Liber Load Image from Gallery and Output Gallery** node to your workflow.

The node provides:

- **Output Gallery** — work with videos;
- the current image preview — opens the image gallery;
- **START** — queues selected images one by one;
- **IMAGE** and **MASK** outputs.

## Scenario 1. Choose one image

1. Click the image preview in the node.
2. Find the file using folders, search, sorting or favorites.
3. Double-click the image.
4. The image is loaded into the node and the gallery closes.

When the workflow is opened again, the last selected image is restored automatically.

## Scenario 2. Browse images directly in the node

When the current folder contains several images, navigation arrows appear beside the preview.

- **‹** — previous image;
- **›** — next image.

The arrows are available immediately after the workflow loads; you do not need to open the gallery first.

## Scenario 3. Queue several images

1. Open the image gallery.
2. Select images with single clicks or rectangle selection.
3. On a touch screen, hold and then drag to select an area.
4. Press **START**.

The selected images are sent to the ComfyUI queue one after another.

## Scenario 4. Use another image folder

1. Open the image gallery.
2. Browse nested folders or press **...**.
3. Use **...** to choose any available folder in the system folder picker.
4. Recently used external folders can be reopened quickly.

## Scenario 5. Find images faster

You can:

- search by filename;
- sort by name, date or file size;
- change preview size;
- add images to favorites;
- copy, paste and save images from the context menu.

## Scenario 6. Open the video gallery

1. Press **Output Gallery**.
2. Choose `output` or a previously opened external folder.
3. Press **...** to select a new external folder.
4. Use search, sorting, favorites and card size to find the video you need.

If a new file is not visible yet, press **Refresh**.

## Scenario 7. Watch videos

- Single click — play or pause.
- Double click — enter fullscreen.
- Double click again in fullscreen — exit fullscreen.
- Horizontal swipe over the video — seek backward or forward.
- Mouse wheel over the video — change volume.
- Videos loop automatically.
- Playback speed and volume are remembered.

Fullscreen controls on the right:

- **⏮** — previous video;
- **⏱** — playback speed;
- **⏭** — next video.

Controls hide after a short period of inactivity. Move the mouse, touch the screen or press a key to show them again. While paused, the interface stays visible.

## Scenario 8. Watch videos while the GPU is busy

If normal playback becomes slow during generation:

1. Open **Output Gallery**.
2. Enable **CPU** in the top bar.
3. Play the video normally.

CPU mode keeps the same main actions: play/pause, seeking, volume, speed, fullscreen and previous/next video.

Press **CPU** again to return to normal playback.

## Scenario 9. Manage video files

The video context menu lets you:

- play a file;
- select it;
- copy it;
- rename it;
- reveal it in its folder;
- delete it.

For several files:

1. Select the videos you need.
2. Copy them to the clipboard.
3. Paste them in Windows Explorer with **Ctrl+V**.

You can also delete several selected videos at once.

If a video contains saved ComfyUI workflow data, use the corresponding context-menu action to open the workflow.

## Scenario 10. Use favorites

Click the favorite icon on an image or video card. Favorites make frequently used files easier to find again without losing your current gallery position.

## Built-in help

The **? / Help** button in the video gallery opens a short guide in the selected language. It follows the same usage scenarios: images, folders, multi-selection, playback, fullscreen, gestures, CPU mode and file management.

## Language

The interface supports **English and Russian** across the main buttons, menus, tooltips and built-in help.

---

# Installation / Установка

Open a terminal in your ComfyUI `custom_nodes` directory / откройте терминал в папке `custom_nodes` ComfyUI:

```bash
git clone https://github.com/ATOM60/ComfyUI-LoadImageGallery.git
```

Restart ComfyUI / перезапустите ComfyUI.

Node name / название ноды: **Liber Load Image from Gallery and Output Gallery**.

# Updating / Обновление

From the installed node folder / из папки установленной ноды:

```bash
git pull
```

Then refresh the frontend. Restart ComfyUI when the update also changes backend files / затем обновите frontend. Если обновление затрагивает backend-файлы, перезапустите ComfyUI.

# Repository

https://github.com/ATOM60/ComfyUI-LoadImageGallery
