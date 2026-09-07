# ComfyUI Load Image Gallery

An enhanced image loader for ComfyUI with a fast visual gallery, external-folder browsing, favorites, sorting, persistent thumbnail caching, multi-select, preview navigation, clipboard operations, batch queueing, and an integrated Output Video Gallery.

## Features

- Visual gallery for images from the ComfyUI `input` directory or any absolute folder
- Browse nested folders directly from the gallery with breadcrumbs and an Up button
- Remembers up to 10 recently used external folders
- Persistent thumbnail cache that survives ComfyUI restarts
- Fast browser-level thumbnail cache with versioned invalidation
- Lazy thumbnail loading for folders with hundreds or thousands of images
- Search images by filename
- Favorite images with the `♡ / ♥` control in the thumbnail corner
- Favorites always stay above regular images
- Sort by name, modification date, or file size
- Sorting preference is remembered
- Single click to select or deselect an image
- Drag a selection rectangle to select multiple images
- Selection accumulates while dragging and remains selected while scrolling
- Automatic scrolling while rectangle-selecting near the top or bottom edge
- Touch-screen selection: hold for about 0.4 seconds and drag
- Double click an image to load it into the node and close the gallery
- Previous / next navigation directly in the node preview
- Right-click image menu with Save Image, Copy Image, and Paste Image
- Paste clipboard images into the currently open gallery folder
- Copying and pasting between gallery folders preserves the original file when possible
- Batch queue selected images in selection order
- START clears the selection but keeps the gallery open
- Manual thumbnail cache clearing
- Per-workflow last-image persistence
- External absolute-path image loading without copying files into `input`
- Large portrait and landscape preview support
- Integrated Output Video Gallery for browsing and managing videos from ComfyUI `output`
- Output video thumbnails, inline playback, search, sorting, card-size control, multi-select, rectangle select, copy, rename, reveal, and delete

## Installation

Open PowerShell or a terminal in your ComfyUI `custom_nodes` directory and run:

```bash
git clone https://github.com/ATOM60/ComfyUI-LoadImageGallery.git
```

Restart ComfyUI.

The node will appear as:

**Load Image Gallery**

## Node layout

The node keeps the normal ComfyUI image outputs:

- **IMAGE**
- **MASK**

Visible controls are arranged as:

1. **Галерея output** — opens the integrated Output Video Gallery
2. **Image preview** — click the image to open the input image gallery; use the side arrows to navigate the current image folder
3. **START** — queues the current workflow

The stock Load Image file-upload controls remain internal for compatibility but are hidden from the node UI.

## Gallery controls

- **Single click** - select or deselect an image for batch processing
- **Double click** - load the image into the node and close the gallery
- **Drag on empty space** - draw a selection rectangle and add multiple images to the current selection
- **Touch hold + drag** - start rectangle selection on a touch screen
- **♡ / ♥** - add or remove an image from favorites
- **⇅ Sort** - choose name, date, or file-size sorting
- **Search** - filter images by filename
- **Refresh** - rescan the current folder
- **↑** - go to the parent folder
- **...** - choose an external folder with the native folder picker
- **Right click an image** - Save Image, Copy Image, or Paste Image
- **Clear cache** - clear generated gallery thumbnails and invalidate the browser thumbnail cache
- **START (N)** - queue the workflow once for every selected image

Favorites are always displayed before non-favorites. The selected sorting mode is applied independently inside both groups.

## Image copy and paste

Right-click an image and choose **Copy Image**, navigate to another folder, then right-click an image and choose **Paste Image**.

When copying between gallery folders, the node preserves the original source file when possible instead of re-encoding the thumbnail. Clipboard images copied from other applications can also be pasted into the currently open folder.

If a file with the same name already exists, a new unique filename is used.

## Output Video Gallery

Use the large **Галерея output** button at the top of the node to open the integrated video gallery.

The video gallery browses videos from the ComfyUI `output` directory and supports:

- thumbnail previews
- inline video playback inside gallery cards
- search by filename or folder
- sorting by date, name, or file size
- adjustable thumbnail/card size
- single and multi-selection
- rectangle selection with accumulated selection
- touch hold + drag selection
- copy selected video files to the Windows clipboard for pasting in Explorer
- rename
- reveal in Explorer
- delete selected videos

No video player is shown directly on the node itself.

## Node preview

Use the large arrow areas on the left and right side of the preview to move through images in the current folder.

Click the preview image to open the input image gallery.

Portrait images are scaled up to use the available preview area, while landscape images keep dedicated space for navigation controls.

The node remembers the image stored in each workflow. When a workflow is restored from compatible metadata, the saved image path is restored as well.

## Thumbnail cache

The gallery uses two cache levels:

1. A persistent 320 px WebP thumbnail cache stored in the ComfyUI user data area.
2. The browser HTTP cache for very fast repeated gallery opening.

Cached thumbnails are reused while the source file size and modification time remain unchanged.

**Clear cache** removes the persistent gallery thumbnails and changes the browser-cache version. Already visible thumbnails can remain on screen until the folder is refreshed. After refresh, thumbnails are generated once and then become fast again.

The persistent cache has a size limit and automatically removes older entries when necessary.

## External folders

Use the **...** button to select any image folder available to the computer running ComfyUI. Files are loaded directly from their original absolute paths and are not copied into the ComfyUI `input` directory.

Nested external folders can be opened directly inside the gallery. Recently used external folders are remembered for quick access.

## Closing behavior

The input image gallery closes with **✕** or when an image is loaded with a double click.

Pressing Escape or clicking outside the input gallery does not close it.

## Updating

From the installed node folder run:

```bash
git pull
```

Then refresh or restart ComfyUI if necessary.

## Repository

https://github.com/ATOM60/ComfyUI-LoadImageGallery
