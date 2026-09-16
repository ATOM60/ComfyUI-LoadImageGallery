// Run with Node >=20 and Playwright installed. Uses an isolated headless browser.
// CHROME_PATH optionally selects an existing Chrome installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const files = ['preview_navigation.js', 'image_gallery.js', 'output_video_gallery.js', 'zzz_stable_node_layout.js'];
const sources = Object.fromEntries(files.map(file => [file, baseline
    ? execFileSync('git', ['show', `e8f6ed236bd4234c3f43c3006371714e0e5578eb:web/${file}`], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(path.join(root, 'web', file), 'utf8')]));

(async () => {
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    try {
        const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
        await page.route('http://gallery.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
        await page.goto('http://gallery.test/');
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const results = await page.evaluate(async sources => {
            const reports = [];
            const check = (name, ok, details = '') => reports.push({ name, ok: !!ok, details });
            const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
            const factory = new Function(sources['preview_navigation.js'].replace('export function', 'function') + '\nreturn installGalleryPreviewNavigation;')();
            const extensions = new Map();
            let dirty = 0;
            const app = { registerExtension: extension => extensions.set(extension.name, extension), queuePrompt() {},
                canvas: { graph_mouse: [-1000, -1000], canvas: { style: {} } } };
            const api = { apiURL: p => p, fetchApi: async () => ({ ok: true, json: async () => ({ images: ['a.png', 'b.png'] }) }) };
            for (const file of ['image_gallery.js', 'output_video_gallery.js', 'zzz_stable_node_layout.js']) {
                new Function('app', 'api', 'installGalleryPreviewNavigation', sources[file].replace(/^import[^\n]*\n/gm, ''))(app, api, factory);
            }
            let now = 0, nextId = 0;
            const timers = new Map();
            window.setTimeout = (fn, delay = 0) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; };
            window.clearTimeout = id => timers.delete(id);
            window.setInterval = (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay, interval: delay }); return id; };
            window.clearInterval = id => timers.delete(id);
            window.requestAnimationFrame = fn => setTimeout(fn, 16);
            window.cancelAnimationFrame = id => timers.delete(id);
            function advance(ms) {
                const until = now + ms;
                for (let n = 0; n < 10000; n++) {
                    const first = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
                    if (!first) { now = until; return; }
                    const [id, t] = first;
                    now = t.at;
                    if (t.interval) t.at += t.interval;
                    else timers.delete(id);
                    t.fn();
                }
                throw Error('timer loop');
            }
            function makeClass() {
                return class Node {
                    constructor() {
                        this.comfyClass = this.type = 'LoadImageGallery';
                        this.size = [600, 440]; this.pos = [0, 0]; this.widgets = [];
                        this.graph = { setDirtyCanvas() { dirty++; } };
                        this.addWidget('combo', 'image', 'photos/a.png', () => {}, { values: ['photos/a.png', 'photos/b.png'] });
                    }
                    addWidget(type, name, value, callback, options = {}) {
                        const widget = { type, name, value, callback, options, hidden: false,
                            background_color: '#334155', outline_color: '#789abc', text_color: '#ffffff',
                            computeSize: width => [width, 20], computeLayoutSize: () => ({ minHeight: 20, maxHeight: 20 }),
                            drawWidget() {}, onPointerDown() {} };
                        this.widgets.push(widget); return widget;
                    }
                    addCustomWidget(widget) { this.widgets.push(widget); return widget; }
                    onConfigure() {}
                    onExecuted() {}
                    onRemoved() {}
                };
            }
            const imageExtension = extensions.get('Comfy.ImageGallery');
            const outputExtension = extensions.get('Comfy.ImageGallery.OutputVideoGallery');
            const layoutExtension = extensions.get('Comfy.ImageGallery.StableUnifiedNode');
            const portrait = document.createElement('canvas'); portrait.width = 200; portrait.height = 1600;
            portrait.getContext('2d').fillStyle = '#c67b39'; portrait.getContext('2d').fillRect(0, 0, 200, 1600);
            function preview() { return { name: '$$canvas-image-preview', type: 'custom', options: { canvasOnly: true },
                y: 0, computedHeight: 300, hidden: false, drawWidget() {}, onPointerDown() {} }; }
            const orders = ['IOL', 'ILO', 'OIL', 'OLI', 'LIO', 'LOI'];
            let renderFixture;
            for (const order of orders) {
                const Node = makeClass();
                await outputExtension.beforeRegisterNodeDef(Node, { name: 'LoadImageGallery' });
                const node = new Node();
                for (const action of order) {
                    if (action === 'I') await imageExtension.nodeCreated(node);
                    if (action === 'O') node.onNodeCreated();
                    if (action === 'L') await layoutExtension.nodeCreated(node);
                }
                await flush();
                advance(30000); await flush();
                const p = node.addCustomWidget(preview()); node.imgs = [portrait];
                await flush();
                const row = node.widgets.find(w => w.name === 'Галерея output');
                const start = node.widgets.find(w => w.name === '▶ СТАРТ');
                const stable = row && start && !row.hidden && start.hidden && node.widgets[0] === p && node.widgets[1] === row && row.computeLayoutSize().minHeight === 64;
                check(`late preview after 30 seconds / ${order}`, stable, node.widgets.map(w => `${w.name}:${w.hidden}`).join(', '));
                if (stable) {
                    let outputClicks = 0, startClicks = 0;
                    row.callback = () => { outputClicks++; }; start.callback = () => { startClicks++; };
                    for (const x of [60, 540]) { const pointer = { eDown: { button: 0, canvasX: x, canvasY: 370 } }; row.onPointerDown(pointer, node, app.canvas); pointer.onClick?.(pointer.eDown); }
                    check(`bottom row callbacks / ${order}`, outputClicks === 1 && startClicks === 1);
                    for (let i = 0; i < 10; i++) {
                        const replacement = preview();
                        node.widgets.splice(node.widgets.indexOf(i ? node.widgets[0] : p), 1);
                        node.addCustomWidget(replacement);
                        check(`preview replacement ${i} / ${order}`, node.widgets[0] === replacement && node.widgets[1] === row && !row.hidden);
                    }
                    node.widgets.reverse();
                    row.hidden = true;
                    row.computeLayoutSize = () => ({ minHeight: 0, maxHeight: 0 });
                    node.onConfigure({});
                    await layoutExtension.loadedGraphNode?.(node);
                    check(`restored workflow row / ${order}`, node.widgets[0].name === '$$canvas-image-preview' && node.widgets[1] === row && !row.hidden && row.computeLayoutSize().minHeight === 64);
                    const before = dirty;
                    for (let i = 0; i < 100; i++) node.__cigNodeLayout?.refresh();
                    advance(60000); await flush();
                    check(`idle layout / ${order}`, dirty === before && timers.size === 0, `dirty=${dirty - before}, timers=${timers.size}`);
                }
                if (order === 'LOI') renderFixture = { node, row, start };
                else node.onRemoved();
            }
            // Render a resize frame with a temporarily stale preview height.
            // The host's active clip limits it; later widgets must stay on top.
            const { node, row } = renderFixture;
            const p = node.widgets.find(w => w.name === '$$canvas-image-preview');
            const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 460; document.body.append(canvas);
            const ctx = canvas.getContext('2d');
            p.computedHeight = 400; row.y = 230; row.computedHeight = 64;
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 600, 220); ctx.clip();
            p.drawWidget(ctx, { width: 600, previewImages: [portrait] }); ctx.restore();
            row.drawWidget(ctx, { width: 600 });
            const rowBefore = [...ctx.getImageData(0, 230, 600, 64).data];
            ctx.fillStyle = '#f000ff'; ctx.fillRect(100, 50, 80, 80); // a later node or selection overlay
            await flush();
            const rowAfter = [...ctx.getImageData(0, 230, 600, 64).data];
            check('bottom row pixels survive preview rendering', rowBefore.every((v, i) => v === rowAfter[i]));
            check('later canvas overlay stays above preview', ctx.getImageData(110, 60, 1, 1).data[0] === 240);
            check('portrait arrow uses the entire side margin', p.__cigPrevRect?.w > 200 && p.__cigNextRect?.w > 200);
            node.onRemoved();
            return reports;
        }, sources);
        const failures = results.filter(r => !r.ok);
        console.log(JSON.stringify({ mode: baseline ? 'baseline' : 'current', checks: results.length, failures, browserErrors: errors }, null, 2));
        assert.equal(errors.length, 0, 'browser errors');
        assert.equal(failures.length, 0, 'browser regressions');
    } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
