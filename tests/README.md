# Preview and button regressions

Dependency-free navigation tests (Node.js 18+):

```sh
node --test tests/preview_navigation.test.mjs
```

Node panel end-to-end check (Node.js 20+, Playwright or playwright-core, Chrome, and a running ComfyUI with this node installed):

```sh
COMFY_URL=http://127.0.0.1:8188 node tests/node_panel_comfy.cjs
```

`COMFY_URL` defaults to `http://127.0.0.1:8188`. `CHROME_PATH` can select an existing Chrome executable; `PLAYWRIGHT_MODULE` can select a Playwright installation. On restricted Windows environments, Node may need `--preserve-symlinks --preserve-symlinks-main`. The test changes that ComfyUI's settings and clears its open workflow, so point it at a test instance. Its input folder needs at least two images in the root.

The check runs twice, on the classic canvas and with Nodes 2.0 (`Comfy.VueNodes.Enabled`). Each run creates a node and verifies that only the panel is drawn on it, that the image selector stays in the properties panel, that a new node gets room for the image, and that the image, file name and position load. It then clicks the arrows, the image (gallery), **?** (help), **Output Gallery** and **START** (one queued prompt), holds the image (zoom instead of the gallery), and saves and reloads the workflow. `widgets_values` must stay `[image, "image"]`, and the node size and image must survive the reload. It verified ComfyUI 0.41.0 with frontend 1.55.18.

## Node UI ownership

- `node_panel.js` puts one DOM widget on the node: the metadata line with **?**, the image with its ‹ › arrows, and the **Output Gallery** and **START** buttons. ComfyUI mounts the same element on the classic canvas and in Nodes 2.0. The stock image preview, the START and Output Gallery widgets and the file selector are hidden on the node; the buttons forward to the hidden widgets' callbacks, and the file selector and upload stay in the properties panel. The panel is not serialized.
- `preview_navigation.js` keeps the ordered list the arrows walk and the current position; it draws nothing. The panel subscribes to its changes.

The panel re-checks the image, the listing and the gallery order every 400 ms while it is on screen. The check compares scalars and array identities and does no work when nothing changed.

Output playback regressions use the same browser dependencies:

```sh
node tests/output_playback_browser.cjs
```

This test records a short local WebM with audio, loads the real gallery/player extensions, enters native fullscreen, and verifies handoff to ordinary/favorited cards, cached/previously unopened players, resumption after pause, position/rate/volume preservation, and volume controls at 120/180/320px thumbnail sizes. CPU fullscreen navigation uses a fixture WebSocket and audio response. No ComfyUI server or external media is required.
