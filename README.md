# ComfyUI Load Image Gallery

A visual image loader for ComfyUI with an integrated gallery for videos from `output`.

## What it can do

### Image gallery

- Browse images from the ComfyUI `input` folder and external folders.
- Open nested folders without leaving the gallery.
- Search by filename.
- Sort by name, date or file size.
- Add images to favorites.
- Select one or many images.
- Select several images with a rectangle.
- Use touch hold + drag for multi-selection on touch screens.
- Double click an image to load it into the node.
- Move through the current folder with the previous / next arrows in the node preview.
- Copy, paste and save images from the right-click menu.
- Queue several selected images with START.
- Remember the last image used in a workflow.
- Quickly reopen recently used external folders.

### Output Video Gallery

Use the large **Output Gallery / Галерея output** button at the top of the node.

The video gallery lets you:

- Browse videos from the ComfyUI `output` folder and selected external folders.
- See video thumbnails.
- Search by filename or folder.
- Sort by date, name or file size.
- Add videos to favorites with the heart under the video information; favorite videos are shown first.
- Change the size of video cards.
- Select one or many videos.
- Select several videos with a rectangle.
- Use touch hold + drag for multi-selection.
- Copy selected videos to the clipboard and paste them in Explorer.
- Rename videos.
- Show a video in its folder.
- Delete one or several selected videos.
- Open the right-click menu for play, selection, copy, rename, show in folder and delete actions.

### Video playback

- Single click on a video preview starts playback or pauses it.
- Double click opens the video in fullscreen.
- Double click in fullscreen pauses the video and exits fullscreen.
- Videos loop automatically.
- The mouse wheel over the video changes volume.
- Volume is remembered.
- Playback speed is remembered.
- Fullscreen controls on the right let you open the previous video, change playback speed and open the next video.
- Up to three inline video players can stay active in the gallery.
- A compact **CPU** switch is available in the top row without adding another toolbar row.
- CPU mode moves the main video decoding work to the processor, which can make playback smoother while ComfyUI is heavily using the GPU.
- CPU mode keeps single-click play/pause, double-click fullscreen, looping, remembered volume, remembered playback speed and previous/next fullscreen navigation.

## Languages

The image gallery and the output video gallery support **English and Russian**.

The output gallery follows the same language setting as the image gallery, including toolbar buttons, context-menu actions, playback-control tooltips and the built-in help.

## Built-in instruction

The Output Video Gallery includes a **?** help button. It opens a short user guide for the image gallery and the output video gallery in the currently selected language.

## Node layout

The node keeps the normal ComfyUI outputs:

- **IMAGE**
- **MASK**

Visible controls are arranged as:

1. **Output Gallery / Галерея output**
2. **Image preview**
3. **START**

No video player is shown directly on the node itself. Videos are played inside the Output Video Gallery.

## Installation

Open PowerShell or a terminal in your ComfyUI `custom_nodes` directory and run:

```bash
git clone https://github.com/ATOM60/ComfyUI-LoadImageGallery.git
```

Restart ComfyUI.

The node will appear as:

**Load Image Gallery**

## Updating

From the installed node folder run:

```bash
git pull
```

Then refresh or restart ComfyUI if needed.

## Repository

https://github.com/ATOM60/ComfyUI-LoadImageGallery
