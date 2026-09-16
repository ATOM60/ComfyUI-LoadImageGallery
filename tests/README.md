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

The browser harness runs the real gallery extension code with a small host fixture and real canvas pixels. It covers all six extension initialization orders, a preview arriving after 30 seconds, repeated preview replacement, workflow restoration, row callbacks, idle redraws, canvas clipping, and wide portrait arrow targets. It does not start a full ComfyUI server.

Add `--baseline` to run against the known-broken commit `e8f6ed2` (that Git object must exist locally). The old commit is expected to fail the late-preview and paint-order checks.

Output playback regressions use the same browser dependencies:

```sh
node tests/output_playback_browser.cjs
```

This test records a short local WebM with audio, loads the real gallery/player extensions, enters native fullscreen, and verifies handoff to ordinary/favorited cards, cached/previously unopened players, resumption after pause, position/rate/volume preservation, and volume controls at 120/180/320px thumbnail sizes. CPU fullscreen navigation uses a fixture WebSocket and audio response. No ComfyUI server or external media is required.
