# Liber Load Image from Gallery and Output Gallery

<p align="center">
  <strong>🇬🇧 English</strong> &nbsp;|&nbsp; <a href="./README_RU.md">🇷🇺 Русский</a>
</p>

Image and video gallery for ComfyUI with fast browsing, selection, close-up viewing, playback, fullscreen controls and external-folder support.

This guide is organised by scenarios — what you want to do, the steps, then the details. The built-in help uses the same scenarios and numbers: 1–8 for images, 9–13 for videos.

## Quick start

Add the **Liber Load Image from Gallery and Output Gallery** node to your workflow.

The node provides:

- the current image preview — click it to open the image gallery, hold it to zoom, use **‹ ›** beside it to browse;
- **Output Gallery** — work with videos;
- **START** — queues selected images one by one;
- **IMAGE** and **MASK** outputs.

![Liber Load Image from Gallery node](docs/images/node-en.png)

## Images

### Scenario 1. Choose one image

1. Click the image preview in the node — the gallery opens in the folder you last browsed.
2. Find the file using folders, search, sorting or favorites.
3. Double-click the image, or select it and press **Enter**.

The image is loaded into the node and the gallery closes. The **✕** button closes the gallery without a choice; **Esc** and clicks outside do not close it. The arrow keys move between cards. When the workflow is opened again, the last selected image is restored automatically.

![Image Gallery](docs/images/image-gallery-en.png)

### Scenario 2. Browse images right in the node

1. Click **‹** (previous) or **›** (next) beside the node preview.

The file list loads automatically when the workflow opens or the image changes — you do not need to open the gallery first. The arrows follow the gallery's sorting and favorites. They are dimmed while the list loads or when there are fewer than two images; their position does not depend on the image aspect ratio.

If the image was chosen with **Subfolders** on (scenario 7), the arrows walk the same list, subfolders included.

### Scenario 3. Look at an image up close

1. Hold the left mouse button on a gallery thumbnail or on the node preview for about 0.3 s.
2. The image opens full screen, magnified 6× relative to the image fitted to the screen.
3. Keep holding and move the mouse: the pointer's place on the screen is the place of the image you see — the screen's top-left corner shows the image's top-left corner, the centre shows the centre, and so on.
4. Release the button to close.

The original file is shown; the thumbnail stands in until it loads. A side that is still narrower than the screen when magnified is centred. A short click works as before and the selection does not change. Zoom is for the mouse only; on a touch screen, holding still starts rectangle selection.

### Scenario 4. Queue several images

1. Open the image gallery.
2. Select images:
   - click a card to select or deselect it;
   - **Shift**+click selects the range from the previous click;
   - **Space** toggles the focused card;
   - drag a rectangle that starts on empty space between cards; near the top or bottom edge the gallery scrolls by itself;
   - on a touch screen, hold about 0.4 s, then drag.
3. Press **START**.

The images are sent to the ComfyUI queue one after another in selection order; the button shows the progress. Queueing continues even if the gallery is closed before every prompt has been added.

The selection stays while scrolling and when the gallery is reopened for the same node; **Refresh** clears it.

### Scenario 5. Save and reuse image sets

1. Select the images you need.
2. Press **Sets ▾** in the bottom bar.
3. Choose **+ Create from selected** and enter a name.
4. Later, click the set name to restore it as the current selection — or open **⋮** → **Start** to queue the whole set at once in its saved order.

A set keeps the selection order: with individual clicks, this is the click order; if you deselect an image and select it again, it moves to the end.

Open **⋮** next to a saved set to edit it:

- **Replace with selected** — replace the whole set with the current selection;
- **Add selected** — append selected images that are not already in the set;
- **Remove selected** — remove only selected images that are in the set; selected images outside the set are ignored;
- **Rename** — change the set name;
- **Delete** — remove the saved set;
- **Start** — queue the whole set immediately, without loading it into the current selection.

Sets can contain images from different folders, including external folders. They are shared between workflows and nodes and are stored in `ComfyUI/user/image_gallery_sets.json`, not in the workflow file.

### Scenario 6. Open another folder

1. Double-click a folder card, or use the path line above the images and **↑** to go up.
2. Or choose a folder in the **Folder:** list at the bottom.
3. Press **...** to pick any folder on the computer in the system folder picker.

Folder cards show up to four thumbnails and the image count. A folder with no images of its own borrows them from its subfolders. Previews load as you scroll and share the thumbnail cache; **Refresh** reloads them.

Up to 20 recently used external folders stay in the **Folder:** list.

### Scenario 7. See a folder with all its subfolders as one list

1. Press **Subfolders** in the top bar.
2. All images of the folder and of its subfolders at any depth are shown together, as if they lay in this folder; folder cards are hidden.
3. Press **Subfolders** again to return to the normal view.

In this view search and name sorting use the file name, so images from different subfolders are interleaved; hover a card to see its full path. Selection, sets, **START** and the node arrows (scenario 2) work across the whole list, and the node receives the image's real path.

The setting is remembered. Hidden and system folders are skipped. At most 20,000 images are listed — the counter at the bottom says when the list was cut off.

### Scenario 8. Find and handle images faster

1. Type part of the file name in the search field.
2. Use **⇅** to sort by name, date or file size, and the slider next to search to change the card size (it is remembered).
3. Click **♡** in the top-right corner of a card to add it to favorites — favorites are marked **♥** and stay on top with any sorting; click again to remove.

Right-click an image for **Save Image**, **Copy Image** and **Paste Image** — paste puts the copied image into the open folder.

Thumbnails are cached on disk; the counter at the bottom shows the cache size. **Clear cache** removes them, and they are rebuilt when shown again.

## Videos

### Scenario 9. Open the video gallery

1. Press **Output Gallery** in the node.
2. Choose `output` or a recently used external folder in the list next to search, or press **...** to pick another folder.
3. Find the video with search (by name or folder), sorting, favorites and the card size slider.

New videos appear by themselves: while the gallery is open the folder is checked every few seconds and again right after a generation finishes. During a generation, while a video plays or while videos are selected, the update waits and catches up afterwards. **Refresh** reloads the list at once.

Thumbnails are made in the background; during a generation this takes longer, and the gallery keeps retrying. If a card keeps showing 🎬, hover it to see the reason (for example, `ffmpeg not found`); the same reason is written to the ComfyUI console as `[ImageGallery] Output video thumbnail failed: …`.

![Video Gallery](docs/images/video-gallery-en.png)

### Scenario 10. Watch videos

1. Click the preview to play or pause.
2. Double-click to go fullscreen; double-click again to return.
3. In fullscreen, use the controls on the right: **⏮** previous video, **⏱** playback speed, **⏭** next video.

- Swipe horizontally over the video to seek backward or forward.
- The mouse wheel over the video changes the volume; the speaker button mutes and restores it. The volume slider is available even on small previews.
- Videos loop; playback speed and volume are remembered.

After leaving fullscreen, the last viewed video keeps playing in its own card from the same position, including favorites and CPU playback — even if it was paused before exiting.

Controls hide after a short period of inactivity; move the mouse, touch the screen or press a key to show them again. While paused, the interface stays visible.

### Scenario 11. Watch videos while the GPU is busy

1. Turn on **CPU** in the gallery's top bar.
2. Play videos as usual.
3. Press **CPU** again to return to normal playback.

CPU mode keeps the same actions: play/pause, seeking, volume, speed, fullscreen and previous/next video.

If the browser cannot decode a video's codec, the player switches to CPU by itself — the badge changes from GPU to CPU — and audio the browser does not support is converted on the fly through FFmpeg.

### Scenario 12. Manage video files

1. Select videos: click a card below its preview, drag a rectangle, **Shift**+click a range, or press **Select all** (**Clear selection** removes it).
2. Right-click a video to play, select, copy, rename, show it in its folder, delete it, or **Open as workflow**.
3. To copy several videos, choose copy in the context menu and paste them in Windows Explorer with **Ctrl+V**.

Several selected videos can also be deleted at once; deleted files go to the Recycle Bin when it is available.

**Open as workflow** loads the ComfyUI workflow saved inside MP4, MOV, M4V and WebM files.

### Scenario 13. Use favorites

1. Click the heart under a video, or **♡** on an image card.

Favorites are shown first in their gallery; click again to remove the mark. They make frequently used files easier to find without losing your place in the gallery.

## Built-in help

The **?** next to the node title and the **?** button in each gallery open the same scenarios in the selected language: scenarios 1–8 in the image gallery, 9–13 in the Output Gallery.

## Language

The interface supports **English and Russian** and follows the language selected in ComfyUI.

## Installation

Open a terminal in your ComfyUI `custom_nodes` directory:

```bash
git clone https://github.com/ATOM60/ComfyUI-LoadImageGallery.git
```

Restart ComfyUI.

Node name: **Liber Load Image from Gallery and Output Gallery**.

## Updating

From the installed node folder:

```bash
git pull
```

Then refresh the frontend. Restart ComfyUI when the update also changes backend (`.py`) files.

## Repository

https://github.com/ATOM60/ComfyUI-LoadImageGallery
