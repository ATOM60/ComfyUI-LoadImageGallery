// Node >=20 + Playwright/Chromium. No ComfyUI server is required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const arg = name => process.argv.find(a => a.startsWith(name + '='))?.slice(name.length + 1);
const baseline = arg('--baseline');
const reference = arg('--reference');
const files = ['node_controls.js', 'preview_navigation.js', 'image_gallery.js', 'output_video_gallery.js',
    'zzz_stable_node_layout.js', '000_comfy038_widget_safety.js', 'zzzzzzzzzzzzzzzzzzzz_input_preview_buttons_order.js',
    'input_preview_metadata.js', 'zzzzzzzzzzzz_ui_style_unification.js', 'zzzzzzzzzzzzzzzzzzz_disable_title_help_test.js'];
function readSources(ref) {
    return Object.fromEntries(files.flatMap(file => {
        try { return [[file, ref
            ? execFileSync('git', ['show', ref + ':web/' + file], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
            : fs.readFileSync(path.join(root, 'web', file), 'utf8')]]; }
        catch (error) {
            if (file === 'node_controls.js' || file === 'input_preview_metadata.js' || file.includes('safety') || file.includes('buttons_order')) return [];
            throw error;
        }
    }));
}

(async () => {
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    try {
        const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
        await page.route('http://gallery.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
        await page.goto('http://gallery.test/');
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const reports = await page.evaluate(async ({ sources, referenceSources }) => {
            const reports = [];
            const check = (name, ok, details = '') => reports.push({ name, ok: !!ok, details });
            const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
            let now = 0, nextId = 0, dirty = 0;
            const timers = new Map();
            window.setTimeout = (fn, delay = 0) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; };
            window.clearTimeout = id => timers.delete(id);
            window.requestAnimationFrame = fn => setTimeout(fn, 16);
            window.cancelAnimationFrame = id => timers.delete(id);
            function advance(ms) {
                const until = now + ms;
                for (let n = 0; n < 10000; n++) {
                    const first = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
                    if (!first) { now = until; return; }
                    const [id, task] = first; now = task.at; timers.delete(id); task.fn();
                }
                throw Error('unbounded layout timer loop');
            }
            const strip = source => source.replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '');
            function load(sourceFiles) {
                const extensions = new Map();
                const app = { registerExtension: e => extensions.set(e.name, e), configuringGraph: false, queuePrompt() {},
                    canvas: { graph_mouse: [-1000, -1000], canvas: document.createElement('canvas') } };
                const api = { apiURL: p => p, fetchApi: async () => ({ ok: true, json: async () => ({ images: ['a.png', 'b.png'] }) }) };
                const navigation = new Function(strip(sourceFiles['preview_navigation.js']) + '\nreturn installGalleryPreviewNavigation;')();
                const controls = sourceFiles['node_controls.js'] && new Function(strip(sourceFiles['node_controls.js']) + '\nreturn createGalleryControls;')();
                for (const file of Object.keys(sourceFiles).filter(f => !['preview_navigation.js', 'node_controls.js'].includes(f))) {
                    new Function('app', 'api', 'installGalleryPreviewNavigation', 'createGalleryControls', strip(sourceFiles[file]))(app, api, navigation, controls);
                }
                return { app, extensions };
            }
            // Concrete widgets with private node ownership and store-backed values,
            // matching the public contracts used by frontend 1.53.6 (ComfyUI 0.38.0).
            const valueStore = new Map();
            class Widget {
                #node;
                constructor(data, node) { this.#node = node; this.options = {}; Object.assign(this, data); }
                get node() { return this.#node; }
                get key() { return this.node.scope + ':' + this.node.id + ':' + this.name; }
                get value() { return valueStore.get(this.key); }
                set value(value) { valueStore.set(this.key, value); }
                get hidden() { return this.options.hidden; }
                set hidden(value) { this.options.hidden = value; }
                get background_color() { return '#334155'; }
                get outline_color() { return '#789abc'; }
                get text_color() { return '#ffffff'; }
                drawWidget() {}
                onPointerDown() { return 'stock-pointer'; }
            }
            let nextScope = 0;
            function makeClass() {
                return class Node {
                    constructor(scope, id = 1) {
                        this.scope = scope; this.id = id;
                        this.comfyClass = this.type = 'LoadImageGallery';
                        this.pos = [200, 100]; this.size = [600, 440]; this.widgets = [];
                        this.graph = { _nodes: [this], setDirtyCanvas() { dirty++; } };
                        this.addWidget('combo', 'image', 'photos/a.png', () => {}, { values: ['photos/a.png', 'photos/b.png'] });
                    }
                    addWidget(type, name, value, callback, options = {}) {
                        const result = this.addCustomWidget({ type, name, value, callback, options });
                        // Widget creation must not change the order under this caller.
                        assertRegistered(this, result);
                        return result;
                    }
                    addCustomWidget(input) {
                        const widget = input instanceof Widget ? input : new Widget(input, this);
                        this.widgets.push(widget);
                        assertRegistered(this, widget);
                        return widget;
                    }
                    onConfigure() {}
                    onExecuted() {}
                    onRemoved() {}
                    serialize() { return this.widgets.filter(w => w.serialize !== false).map(w => w.value); }
                };
            }
            function assertRegistered(node, widget) {
                if (node.widgets.at(-1) !== widget || node.widgets.some(w => !w)) throw Error('widget registration corrupted');
            }
            function preview(node) {
                const w = new Widget({ name: '$$canvas-image-preview', type: 'custom', options: { canvasOnly: true },
                    value: '', serialize: false, y: 0 }, node);
                w.computeLayoutSize = () => ({ minHeight: 220, minWidth: 1 });
                return w;
            }
            const image = document.createElement('canvas'); image.width = 200; image.height = 1600;
            image.getContext('2d').fillStyle = '#c67b39'; image.getContext('2d').fillRect(0, 0, 200, 1600);
            // Same fixed/growable allocation used by LGraphNode._arrangeWidgets in
            // v1.53.6. Here there is only one growable preview per gallery node.
            function arrange(node) {
                const visible = node.widgets.filter(w => !w.hidden);
                let fixed = 0;
                const grow = [];
                for (const w of visible) {
                    if (w.computeSize) { w.computedHeight = w.computeSize()[1] + 4; fixed += w.computedHeight; }
                    else if (w.computeLayoutSize) grow.push(w);
                    else { w.computedHeight = 24; fixed += 24; }
                }
                for (const w of grow) w.computedHeight = Math.max(w.computeLayoutSize().minHeight, (node.size[1] - 40 - fixed) / grow.length);
                let y = 40;
                for (const w of visible) { w.y = y; w.last_y = y; y += w.computedHeight; }
                return visible;
            }
            function paint(node) {
                const canvas = document.createElement('canvas'); canvas.width = node.size[0]; canvas.height = node.size[1];
                const ctx = canvas.getContext('2d'), rects = [], texts = [];
                ctx.fillStyle = '#3d4f58'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.save(); ctx.fillStyle = '#b8bdc0'; ctx.font = '12px Arial'; ctx.textAlign = 'right';
                ctx.fillText('IMAGE', canvas.width - 14, 16); ctx.fillText('MASK', canvas.width - 14, 34); ctx.restore();
                const roundRect = ctx.roundRect.bind(ctx);
                ctx.roundRect = (...args) => { rects.push(args); return roundRect(...args); };
                const fillText = ctx.fillText.bind(ctx);
                ctx.fillText = (text, x, y, ...args) => {
                    texts.push({ text, x, y, width: ctx.measureText(text).width });
                    return fillText(text, x, y, ...args);
                };
                // ComfyUI calls this before arranging and drawing its widgets.
                node.onDrawForeground?.(ctx, env.app.canvas);
                for (const w of arrange(node)) w.drawWidget(ctx, { width: canvas.width, previewImages: node.imgs });
                return { canvas, ctx, texts, buttons: rects.filter(r => r[3] === 68 && r[4] === 12) };
            }
            function hasFooter(node) {
                const { buttons } = paint(node);
                const p = node.widgets.find(w => w.name === '$$canvas-image-preview');
                const rect = p?.__cigPrevRect;
                return buttons.length === 2 && rect && buttons.every(r => r[1] === rect.y + rect.h) && buttons[0][1] + 68 === node.size[1];
            }
            const env = load(sources);
            async function create(env, order = 'IOL', withPreview = true, scope = 'graph' + (++nextScope), id = 1) {
                const { extensions, app } = env;
                const Node = makeClass();
                await extensions.get('Comfy.ImageGallery.OutputVideoGallery').beforeRegisterNodeDef(Node, { name: 'LoadImageGallery' });
                const node = new Node(scope, id); app.graph = node.graph;
                node.imgs = [image];
                if (withPreview) node.addCustomWidget(preview(node));
                extensions.get('Comfy.ImageGallery.Comfy038WidgetSafety')?.nodeCreated(node);
                for (const action of order) {
                    if (action === 'I') await extensions.get('Comfy.ImageGallery').nodeCreated(node);
                    if (action === 'O') node.onNodeCreated();
                    if (action === 'L') extensions.get('Comfy.ImageGallery.StableUnifiedNode').nodeCreated(node);
                }
                extensions.get('Comfy.ImageGallery.InputPreviewButtonsOrder')?.nodeCreated(node);
                extensions.get('Comfy.ImageGallery.InputPreviewMetadata')?.nodeCreated(node);
                extensions.get('Comfy.ImageGallery.UnifiedUiStyle')?.nodeCreated(node);
                extensions.get('Comfy.ImageGallery.DisableTitleForegroundTest')?.nodeCreated(node);
                await flush(); advance(1000); await flush();
                return node;
            }
            function click(node, x, y, button = 0) {
                const w = arrange(node).find(w => y >= w.y && y < w.y + w.computedHeight);
                const pointer = { eDown: { button, canvasX: node.pos[0] + x, canvasY: node.pos[1] + y } };
                const result = w?.onPointerDown(pointer, node, env.app.canvas);
                pointer.onClick?.(pointer.eDown);
                return result;
            }
            for (const order of ['IOL', 'ILO', 'OIL', 'OLI', 'LIO', 'LOI']) {
                const node = await create(env, order);
                check('initial footer / ' + order, hasFooter(node));
                const saved = node.serialize();
                advance(30000);
                for (let i = 0; i < 12; i++) {
                    const old = node.widgets.find(w => w.name === '$$canvas-image-preview');
                    old.onRemove?.(); node.widgets.splice(node.widgets.indexOf(old), 1);
                    node.addCustomWidget(preview(node));
                    await flush(); advance(32); await flush();
                    check('late preview replacement ' + i + ' / ' + order, hasFooter(node));
                }
                check('serialization preserved / ' + order, JSON.stringify(node.serialize()) === JSON.stringify(saved) && node.widgets[0].name === 'image');
                let outputClicks = 0, startClicks = 0;
                const output = node.widgets.find(w => w.name === 'Галерея output');
                const start = node.widgets.find(w => w.name === '▶ СТАРТ');
                output.callback = () => outputClicks++; start.callback = () => startClicks++;
                click(node, 60, node.size[1] - 30); click(node, 540, node.size[1] - 30);
                check('button callbacks / ' + order, outputClicks === 1 && startClicks === 1);
                start.computedDisabled = true;
                click(node, 540, node.size[1] - 30); click(node, 60, node.size[1] - 30, 2);
                check('disabled/right-click buttons / ' + order, outputClicks === 1 && startClicks === 1);
                const before = dirty, count = node.widgets.length;
                for (let i = 0; i < 100; i++) { node.__cigNodeLayout.refresh(); paint(node); }
                advance(60000); await flush();
                check('idle layout without redraw/timer loop / ' + order, dirty === before && timers.size === 0 && count === node.widgets.length, 'redraws=' + (dirty - before));
                node.onRemoved();
            }
            const late = await create(env, 'LOI', false);
            advance(30000); late.addCustomWidget(preview(late)); advance(32); await flush();
            check('first preview arrives after 30 seconds', hasFooter(late));
            // Keep image values independent across nodes AND graphs with identical IDs.
            const second = await create(env, 'IOL', true, late.scope, 2);
            const anotherGraph = await create(env, 'IOL', true, 'other-graph', late.id);
            second.widgets[0].value = 'photos/b.png'; anotherGraph.widgets[0].value = 'photos/c.png';
            for (let i = 0; i < 6; i++) {
                env.app.configuringGraph = true;
                for (const node of [late, second, anotherGraph]) { node.onConfigure({}); env.extensions.get('Comfy.ImageGallery.StableUnifiedNode').loadedGraphNode(node); }
                advance(2000);
                env.app.configuringGraph = false;
                const graph = { _nodes: [late, second], setDirtyCanvas() { dirty++; } };
                env.app.graph = graph;
                env.extensions.get('Comfy.ImageGallery.StableUnifiedNode').afterConfigureGraph?.();
                env.app.canvas.canvas.dispatchEvent(new CustomEvent('litegraph:set-graph', { detail: { newGraph: graph } }));
                advance(32); await flush();
                check('workflow switch footer ' + i, hasFooter(late) && hasFooter(second));
            }
            check('independent image values', late.widgets[0].value === 'photos/a.png' && second.widgets[0].value === 'photos/b.png' && anotherGraph.widgets[0].value === 'photos/c.png');
            const recreated = preview(late);
            late.widgets = late.widgets.filter(w => w.name !== '$$canvas-image-preview').concat(recreated);
            late.onExecuted({}); advance(32); await flush();
            check('execution with replaced widget array', hasFooter(late));
            const painted = paint(late), before = [...painted.ctx.getImageData(0, 372, 600, 68).data];
            painted.ctx.fillStyle = '#f000ff'; painted.ctx.fillRect(100, 50, 80, 80);
            await flush();
            const after = painted.ctx.getImageData(0, 372, 600, 68).data;
            check('footer survives asynchronous preview work', before.every((v, i) => v === after[i]));
            check('later canvas overlay survives', painted.ctx.getImageData(110, 60, 1, 1).data[0] === 240);
            check('portrait arrows use entire side margin', recreated.__cigPrevRect.w > 200 && recreated.__cigNextRect.w > 200);
            // Regression: the shipped title-help extension resets onDrawForeground
            // immediately and on delayed callbacks, erasing the previous metadata hook.
            const headerTexts = node => paint(node).texts.filter(t => t.y > 0 && t.y < 40);
            const unchangedSize = [...late.size];
            const unchangedWidgets = [...late.widgets];
            const previewHeight = recreated.computedHeight;
            check('title suppression is active in fixture', late.onDrawForeground == null);
            let text = headerTexts(late);
            check('filename and dimensions survive title suppression', text.some(t => t.text === 'a.png') && text.some(t => t.text.includes('200 × 1600')));
            check('metadata stays above the preview', text.length === 2 && text.every(t => t.x >= 14 && t.x + t.width <= late.size[0] - 145));
            late.widgets[0].value = 'C:\\input\\портрет.png [input]';
            const landscape = document.createElement('canvas'); landscape.width = 1920; landscape.height = 1080;
            late.imgs = [landscape];
            text = headerTexts(late);
            check('metadata follows selected file and actual resolution', text.some(t => t.text === 'портрет.png') && text.some(t => t.text.includes('1920 × 1080')));
            check('metadata does not resize or add widgets', late.size.every((v, i) => v === unchangedSize[i]) && late.widgets.every((w, i) => w === unchangedWidgets[i]) && late.widgets.length === unchangedWidgets.length && recreated.computedHeight === previewHeight);
            late.widgets[0].value = 'photos/' + 'длинное-имя-🖼️-'.repeat(12) + '.png';
            late.size[0] = 320;
            text = headerTexts(late);
            check('long names truncate and keep resolution', text.some(t => t.text.endsWith('…')) && text.some(t => t.text.includes('1920 × 1080')));
            check('narrow node leaves output labels clear', text.length === 2 && text.every(t => t.x + t.width <= 175));
            const pending = new Image(); pending.width = 999; pending.height = 999;
            late.imgs = [pending];
            text = headerTexts(late);
            check('pending image never reports CSS dimensions', !text.some(t => t.text.includes('×')) && text.length === 1);
            late.imgs = [image, landscape]; late.imageIndex = 1; late.size[0] = 600;
            text = headerTexts(late);
            check('metadata uses active image index', text.some(t => t.text.includes('1920 × 1080')));
            late.flags = { collapsed: true };
            check('collapsed node has no preview metadata', headerTexts(late).length === 0);
            late.flags.collapsed = false;
            late.imgs = [image]; late.imageIndex = 0; late.widgets[0].value = 'photos/a.png';
            // Reserve the real localized output label width, not just a fixed lane.
            late.outputs = [{ label: 'ОЧЕНЬ ДЛИННОЕ НАЗВАНИЕ ВЫХОДА' }, { name: 'MASK' }];
            text = headerTexts(late);
            check('localized output labels stay clear', text.every(t => t.x + t.width < 360));
            late.outputs = [];
            const sample = paint(late).canvas;
            sample.dataset.previewMetadata = '1'; document.body.appendChild(sample);
            await flush(); advance(1000); await flush();
            const beforeIdle = dirty;
            for (let i = 0; i < 100; i++) paint(late);
            advance(1000); await flush();
            check('metadata causes no extra redraws or timers', dirty === beforeIdle && timers.size === 0);
            if (referenceSources) {
                const referenceEnv = load(referenceSources);
                const oldNode = await create(referenceEnv);
                for (const [width, height] of [[320, 340], [600, 440], [900, 700]]) {
                    oldNode.size = late.size = [width, height];
                    const oldPixels = paint(oldNode).ctx.getImageData(0, 0, width, height).data;
                    const newPixels = paint(late).ctx.getImageData(0, 0, width, height).data;
                    check('unchanged preview/footer pixels at ' + width + 'x' + height, oldPixels.slice(40 * width * 4).every((v, i) => v === newPixels[i + 40 * width * 4]));
                }
                oldNode.onRemoved();
            }
            late.onExecuted({}); late.onRemoved(); second.onRemoved(); anotherGraph.onRemoved();
            const removedDirty = dirty; advance(60000); await flush();
            check('removed nodes cancel pending layout work', dirty === removedDirty && !late.__cigNodeLayout);
            return reports;
        }, { sources: readSources(baseline), referenceSources: reference ? readSources(reference) : null });
        const failures = reports.filter(r => !r.ok);
        if (arg('--screenshot')) await page.locator('canvas[data-preview-metadata]').screenshot({ path: arg('--screenshot') });
        console.log(JSON.stringify({ mode: baseline || 'current', checks: reports.length, failures, browserErrors: errors }, null, 2));
        assert.equal(errors.length, 0, 'browser errors');
        assert.equal(failures.length, 0, 'layout regressions');
    } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
