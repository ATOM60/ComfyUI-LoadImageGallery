# ComfyUI Load Image Gallery

An enhanced image loader for ComfyUI with a fast visual gallery, thumbnail caching, multi-select, preview navigation, and batch queueing.

## Features

- Visual gallery for images from the ComfyUI `input` directory
- Browse subfolders directly from the gallery
- Persistent thumbnail cache for fast reopening
- Lazy thumbnail loading for folders with hundreds of images
- Search images by filename
- Single click to select or deselect images
- Drag a selection rectangle to select multiple images
- Double click an image to load it into the node
- Previous / next navigation directly in the node preview
- Batch queue selected images in selection order
- Manual thumbnail cache clearing
- Large portrait and landscape preview support

## Installation

Open PowerShell or a terminal in your ComfyUI `custom_nodes` directory and run:

```bash
git clone https://github.com/ATOM60/ComfyUI-LoadImageGallery.git
```

Restart ComfyUI.

The node will appear as:

**Load Image Gallery**

## Gallery controls

- **Single click** - select or deselect an image for batch processing
- **Double click** - load the image into the node and close the gallery
- **Drag on empty space** - draw a selection rectangle and select multiple images
- **Ctrl / Shift + drag** - add images to the current selection
- **Search** - filter images by filename
- **Refresh** - rescan the current folder
- **Clear cache** - remove generated gallery thumbnails
- **START (N)** - queue the workflow once for every selected image

## Node preview

Use the large arrow areas on the left and right side of the preview to move through images in the current folder.

Click the preview image to open the gallery.

Portrait images are scaled up to use the available preview area, while landscape images keep dedicated space for navigation controls.

## Thumbnail cache

Gallery thumbnails are stored separately from the source images and reused between sessions. This makes large folders much faster to browse after the first load.

The cache automatically refreshes when source files change and can also be cleared manually from the gallery.

## Updating

From the installed node folder run:

```bash
git pull
```

Then refresh or restart ComfyUI if necessary.

## Repository

https://github.com/ATOM60/ComfyUI-LoadImageGallery
