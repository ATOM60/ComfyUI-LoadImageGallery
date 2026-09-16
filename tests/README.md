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
