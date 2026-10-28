// End-to-end check of the node panel (web/node_panel.js) in a real ComfyUI,
// on the classic canvas and in Nodes 2.0 (Vue nodes).
//
// Needs a running ComfyUI with this node installed and Playwright (or
// playwright-core) plus Chrome. It changes that ComfyUI's settings and clears
// its open workflow, so point it at a test instance, not your working one.
//
//   COMFY_URL=http://127.0.0.1:8188 node tests/node_panel_comfy.cjs
//
// COMFY_URL defaults to http://127.0.0.1:8188, CHROME_PATH selects the Chrome
// executable, PLAYWRIGHT_MODULE a Playwright installation. The input folder
// must contain at least two images in its root, e.g. ComfyUI's example.png
// plus any other.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const URL = process.env.COMFY_URL || 'http://127.0.0.1:8188';

async function runMode(browser, vue) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.app?.graph && window.app?.extensionManager?.setting, null, { timeout: 60000 });
    await page.evaluate(async on => { await window.app.extensionManager.setting.set('Comfy.VueNodes.Enabled', on); }, vue);
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelectorAll('.p-dialog-mask').forEach(el => el.remove()));

    const result = await page.evaluate(async () => {
        const app = window.app, sleep = ms => new Promise(r => setTimeout(r, ms));
        const listing = await (await app.api.fetchApi('/image-gallery/list?folder=')).json();
        const [first] = listing.images;
        app.graph.clear();
        const node = window.LiteGraph.createNode('LoadImageGallery');
        node.pos = [260, 140];
        app.graph.add(node);
        const image = node.widgets.find(w => w.name === 'image');
        image.value = first; image.callback?.(first);
        app.canvas.ds.scale = 1; app.canvas.ds.offset = [0, 0];
        app.graph.setDirtyCanvas(true, true);
        await sleep(1500);
        const out = { first, count: listing.images.length, newSize: [...node.size] };
        const panel = () => document.querySelector('.cig-node-panel');
        out.panels = document.querySelectorAll('.cig-node-panel').length;
        out.drawnOnNode = node.widgets.filter(w => node.isWidgetVisible ? node.isWidgetVisible(w) : !w.hidden).map(w => w.name);
        out.imageInPanel = image.visibility ? image.visibility.surfaces.panel : 'n/a';
        out.loaded = panel().querySelector('img').naturalWidth > 0;
        out.meta = panel().querySelector('.cig-np-meta').innerText.replace(/\s+/g, ' ').trim();
        panel().querySelector('.cig-np-next').click(); await sleep(600);
        out.afterNext = image.value;
        panel().querySelector('.cig-np-prev').click(); await sleep(600);
        out.afterPrev = image.value;

        // The node's right-click menu must use the exact same clipboard
        // command as the Input Gallery, and target the currently shown file.
        const view = panel().querySelector('.cig-np-view'), viewRect = view.getBoundingClientRect();
        const contextEvent = (target, rect) => target.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, button: 2,
            clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
        }));
        out.contextPrevented = !contextEvent(view, viewRect);
        out.nodeMenu = [...document.querySelectorAll('.cig-input-restored-menu button')].map(el => el.textContent);
        const realFetchApi = app.api.fetchApi;
        let clipboardBody = null;
        app.api.fetchApi = async function(url, options, ...rest) {
            if (url === '/image-gallery/clipboard/copy') {
                clipboardBody = JSON.parse(options.body);
                return new Response(JSON.stringify({ok:true, formats:['file','DIB','DIBV5','PNG']}), {
                    status:200, headers:{'Content-Type':'application/json'},
                });
            }
            return realFetchApi.call(this, url, options, ...rest);
        };
        try {
            const copy = [...document.querySelectorAll('.cig-input-restored-menu button')]
                .find(el => /^(Copy Image|Копировать изображение)$/.test(el.textContent));
            copy?.click();
            await sleep(300);
        } finally {
            app.api.fetchApi = realFetchApi;
        }
        out.contextClipboard = clipboardBody;
        out.galleryClipboard = JSON.parse(localStorage.getItem('ComfyUI-LoadImageGallery.inputCopiedImage') || 'null');
        out.menuClosedAfterCopy = !document.querySelector('.cig-input-restored-menu');
        out.galleryBeforeClick = !!document.querySelector('.cig-overlay');
        panel().querySelector('.cig-np-stage').click(); await sleep(900);
        out.galleryOpened = !!document.querySelector('.cig-overlay');
        document.querySelector('.cig-overlay .cig-close')?.click(); await sleep(300);
        panel().querySelector('.cig-np-help').click(); await sleep(300);
        out.helpOpened = !!document.querySelector('.cig-help-overlay');
        document.querySelector('.cig-help-overlay')?.remove();
        panel().querySelector('.cig-np-output').click(); await sleep(800);
        out.outputOpened = !!document.querySelector('.ovg-modal');
        document.querySelectorAll('.ovg-modal').forEach(m => m.remove());
        let queued = 0; const realQueue = app.queuePrompt; app.queuePrompt = async () => { queued++; };
        panel().querySelector('.cig-np-start').click(); await sleep(100); app.queuePrompt = realQueue;
        out.queued = queued;
        const stage = panel().querySelector('.cig-np-stage'), r = stage.getBoundingClientRect();
        stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
        await sleep(500);
        out.zoomOpened = !!document.querySelector('.cig-hold-zoom');
        document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', isPrimary: true }));
        stage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })); await sleep(400);
        out.galleryAfterHold = !!document.querySelector('.cig-overlay');
        node.setSize([520, 600]);
        const saved = JSON.parse(JSON.stringify(app.graph.serialize()));
        out.widgetsValues = saved.nodes[0].widgets_values;
        await app.loadGraphData(saved); await sleep(1500);
        const loaded = app.graph._nodes.find(n => n.type === 'LoadImageGallery');
        out.reloaded = { size: [...loaded.size].map(Math.round), value: loaded.widgets.find(w => w.name === 'image').value, panels: document.querySelectorAll('.cig-node-panel').length };
        return out;
    });
    await page.close();
    return { result, errors };
}

(async () => {
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    let failed = 0;
    try {
        for (const vue of [false, true]) {
            const mode = vue ? 'Nodes 2.0' : 'classic';
            const { result: r, errors } = await runMode(browser, vue);
            const checks = [
                ['no page errors', errors.length === 0, errors.join('; ')],
                ['one panel', r.panels === 1],
                ['only the panel is drawn on the node', JSON.stringify(r.drawnOnNode) === JSON.stringify(['cig_gallery_panel']), JSON.stringify(r.drawnOnNode)],
                ['image combo stays in the properties panel', r.imageInPanel === 'shown' || r.imageInPanel === 'n/a', r.imageInPanel],
                ['new node gets room for the image', r.newSize[1] >= 440, JSON.stringify(r.newSize)],
                ['preview image loads', r.loaded],
                ['metadata shows name and position', r.meta.startsWith(r.first) && (r.count < 2 || /\d+ \/ \d+/.test(r.meta)), r.meta],
                ['arrows move and come back', r.count < 2 || (r.afterNext !== r.first && r.afterPrev === r.first)],
                ['right-click on node image opens shared menu and prevents the ComfyUI menu',
                    r.contextPrevented && r.nodeMenu.length === 3
                    && /^(Copy Image|Копировать изображение)$/.test(r.nodeMenu[1]), JSON.stringify(r.nodeMenu)],
                ['node Copy Image copies the current file using the Input Gallery clipboard command',
                    r.contextClipboard?.filename === r.first && r.contextClipboard?.folder === ''
                    && r.galleryClipboard?.filename === r.first && r.galleryClipboard?.folder === '',
                    JSON.stringify({request:r.contextClipboard, internal:r.galleryClipboard})],
                ['context menu closes after copy without opening gallery',
                    r.menuClosedAfterCopy && !r.galleryBeforeClick],
                ['click opens the image gallery', r.galleryOpened],
                ['? opens the help', r.helpOpened],
                ['Output Gallery button opens it', r.outputOpened],
                ['START queues once', r.queued === 1],
                ['hold zooms instead of opening the gallery', r.zoomOpened && !r.galleryAfterHold],
                ['widgets_values unchanged: [image, "image"]', r.widgetsValues.length === 2 && r.widgetsValues[0] === r.first, JSON.stringify(r.widgetsValues)],
                ['reload keeps size and image', r.reloaded.size[0] === 520 && r.reloaded.size[1] === 600 && r.reloaded.value === r.first && r.reloaded.panels === 1, JSON.stringify(r.reloaded)],
            ];
            for (const [name, ok, details = ''] of checks) {
                if (!ok) failed++;
                console.log(`${ok ? 'ok    ' : 'FAIL  '}${mode}: ${name}${!ok && details ? ' — ' + details : ''}`);
            }
        }
    } finally {
        await browser.close();
    }
    assert.equal(failed, 0, `${failed} check(s) failed`);
})().catch(error => { console.error(error); process.exit(1); });
