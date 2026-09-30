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

The widget registration, value ownership and fixed/growable layout contracts were checked against [frontend 1.53.6](https://github.com/Comfy-Org/ComfyUI_frontend/blob/v1.53.6/src/lib/litegraph/src/LGraphNode.ts), pinned by [ComfyUI 0.38.0](https://github.com/Comfy-Org/ComfyUI/blob/v0.38.0/requirements.txt). The fixture models those contracts, rather than importing the full frontend.

Add `--baseline=6708d946` to reproduce the old late-preview/button-order failures. Add `--reference=6708d946` to compare the current canvas pixels against the original appearance at 320, 600 and 900px widths. The chosen Git object must exist locally; another equivalent local ref can also be used.

## Layout ownership

- `zzz_stable_node_layout.js` gives each preview a fixed footer and manages one deferred refresh per lifecycle event. It preserves the host widget array and serialized values.
- `node_controls.js` draws the existing buttons and forwards clicks to their original callbacks.
- `preview_navigation.js` draws and handles the image/arrows in the remaining preview area, then draws the footer. Image and footer always share one layout position.

Widget creation only schedules work; it never reorders or removes widgets while ComfyUI registers them. Graph restoration and switching trigger refreshes through lifecycle events. There is no fixed settling window or continuous layout timer.

Output playback regressions use the same browser dependencies:

```sh
node tests/output_playback_browser.cjs
```

This test records a short local WebM with audio, loads the real gallery/player extensions, enters native fullscreen, and verifies handoff to ordinary/favorited cards, cached/previously unopened players, resumption after pause, position/rate/volume preservation, and volume controls at 120/180/320px thumbnail sizes. CPU fullscreen navigation uses a fixture WebSocket and audio response. No ComfyUI server or external media is required.
