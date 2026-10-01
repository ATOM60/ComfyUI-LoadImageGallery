# Preview and button regressions

Dependency-free navigation tests (Node.js 18+):

```sh
node --test tests/preview_navigation.test.mjs
```

Canvas and extension-lifecycle tests (Node.js 20+ and Playwright with Chromium):

```sh
node tests/node_layout_browser.cjs
```

`CHROME_PATH` can select an existing Chrome executable; `PLAYWRIGHT_MODULE` can select a Playwright installation. On restricted Windows environments, Node may need `--preserve-symlinks --preserve-symlinks-main`.

The browser harness runs the real gallery extension code with concrete-widget and graph fixtures and real canvas pixels. It covers all six extension initialization orders, a preview arriving after 30 seconds, repeated preview replacement, delayed workflow restoration, graph switching, independent values in multiple nodes/graphs, row callbacks, disabled buttons, idle redraws, canvas paint order, and wide portrait arrow targets. It does not launch ComfyUI Desktop or a ComfyUI server.

Metadata checks also load the shipped title-help suppression extension, which clears `onDrawForeground` on immediate and delayed callbacks. They verify that the filename and source resolution remain visible above the preview, update with the selected image, truncate long Unicode names, leave localized output labels clear, and add no height, widgets or redraw timers. Images still decoding must not report CSS dimensions as their source resolution.

The widget registration, value ownership and fixed/growable layout contracts were checked against [frontend 1.53.6](https://github.com/Comfy-Org/ComfyUI_frontend/blob/v1.53.6/src/lib/litegraph/src/LGraphNode.ts), pinned by [ComfyUI 0.38.0](https://github.com/Comfy-Org/ComfyUI/blob/v0.38.0/requirements.txt). The fixture models those contracts, rather than importing the full frontend.

Add `--baseline=6708d946` to reproduce the old late-preview/button-order failures, or `--baseline=f7aaf797` to reproduce the missing metadata. Add `--reference=f7aaf797` to compare the preview/footer pixels against the original appearance at 320, 600 and 900px widths; the header strip is excluded because it now contains metadata. The chosen Git object must exist locally; another equivalent local ref can also be used. `--screenshot=/absolute/path/preview.png` saves a representative canvas fixture for visual inspection.

## Layout ownership

- `zzz_stable_node_layout.js` gives each preview a fixed footer and manages one deferred refresh per lifecycle event. It preserves the host widget array and serialized values.
- `node_controls.js` draws the existing buttons and forwards clicks to their original callbacks.
- `preview_navigation.js` draws and handles the image/arrows in the remaining preview area, then draws the footer. Image and footer always share one layout position.
- `input_preview_metadata.js` draws into the existing empty strip above the preview, called by the preview renderer after layout. It does not depend on the foreground hook cleared by title-help suppression; text measurements are cached until the filename, resolution, width or output labels change.

Widget creation only schedules work; it never reorders or removes widgets while ComfyUI registers them. Graph restoration and switching trigger refreshes through lifecycle events. There is no fixed settling window or continuous layout timer.

Output playback regressions use the same browser dependencies:

```sh
node tests/output_playback_browser.cjs
```

This test records a short local WebM with audio, loads the real gallery/player extensions, enters native fullscreen, and verifies handoff to ordinary/favorited cards, cached/previously unopened players, resumption after pause, position/rate/volume preservation, and volume controls at 120/180/320px thumbnail sizes. CPU fullscreen navigation uses a fixture WebSocket and audio response. No ComfyUI server or external media is required.
