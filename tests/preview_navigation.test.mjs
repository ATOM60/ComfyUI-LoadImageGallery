import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Load the browser module without imposing a package type on this Python plugin.
const source = await readFile(new URL('../web/preview_navigation.js', import.meta.url), 'utf8');
const { installGalleryPreviewNavigation } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const normalizePath = (value) => String(value ?? '').replace(/\\/g, '/').replace(/\s*\[(input|output|temp)\]\s*$/i, '').replace(/^\/+|\/+$/g, '');
function splitPath(value) {
    const clean = normalizePath(value);
    const index = clean.lastIndexOf('/');
    return { folder: index < 0 ? '' : clean.slice(0, index), filename: clean.slice(index + 1) };
}
const joinPath = (folder, name) => normalizePath(folder) ? `${normalizePath(folder)}/${name}` : name;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function scheduler(t) {
    let now = 0;
    let nextId = 1;
    const pending = new Map();
    const saved = new Map();
    function replace(name, value) {
        saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    replace('setTimeout', (callback, delay = 0, ...args) => {
        const id = nextId++;
        pending.set(id, { at: now + Number(delay || 0), callback: () => callback(...args) });
        return id;
    });
    replace('clearTimeout', (id) => pending.delete(id));
    replace('requestAnimationFrame', (callback) => globalThis.setTimeout(() => callback(now), 16));
    replace('cancelAnimationFrame', (id) => pending.delete(id));
    t.after(() => {
        for (const [name, descriptor] of saved) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
    });
    return {
        pending,
        advance(milliseconds) {
            const target = now + milliseconds;
            let calls = 0;
            while (true) {
                const entry = [...pending].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
                if (!entry) break;
                assert.ok(++calls < 10000, 'scheduler must not enter a busy loop');
                pending.delete(entry[0]);
                now = entry[1].at;
                entry[1].callback();
            }
            now = target;
        },
    };
}

function previewWidget() {
    return {
        name: '$$canvas-image-preview',
        options: { canvasOnly: true },
        y: 40,
        computedHeight: 260,
        drawWidget() {},
        onPointerDown() { return 'stock-pointer'; },
    };
}

function canvasContext() {
    const calls = [];
    let depth = 0;
    const ctx = { calls, globalAlpha: 1, get depth() { return depth; } };
    for (const method of ['fillRect', 'clearRect', 'drawImage', 'beginPath', 'closePath', 'roundRect', 'rect', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'fillText', 'translate', 'scale', 'clip', 'setLineDash', 'setTransform']) {
        ctx[method] = (...args) => calls.push([method, ...args]);
    }
    ctx.save = () => { depth++; };
    ctx.restore = () => { depth--; };
    ctx.measureText = (text) => ({ width: String(text).length * 8 });
    ctx.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    return ctx;
}

function fixture(t, { values = ['photos/a.png', 'photos/b.png'], existingPreview = true } = {}) {
    const clock = scheduler(t);
    const image = { name: 'image', value: values[0] ?? 'photos/a.png', options: { values }, callback() {} };
    const preview = previewWidget();
    const requests = [];
    const changes = [];
    let opens = 0;
    let dirty = 0;
    const node = {
        widgets: [image, ...(existingPreview ? [preview] : [])],
        pos: [120, 180],
        size: [420, 340],
        imgs: [{ naturalWidth: 1600, naturalHeight: 900 }],
        graph: { setDirtyCanvas() { dirty++; } },
        setDirtyCanvas() { dirty++; },
        addCustomWidget(widget) { this.widgets.push(widget); return widget; },
        onConfigure() { return 'configured'; },
        onExecuted() { return 'executed'; },
        onRemoved() { return 'removed'; },
    };
    const originals = {
        addCustomWidget: node.addCustomWidget,
        onConfigure: node.onConfigure,
        onExecuted: node.onExecuted,
        onRemoved: node.onRemoved,
        draw: preview.drawWidget,
        pointer: preview.onPointerDown,
        callback: image.callback,
    };
    const app = { canvas: { graph_mouse: [-10000, -10000], canvas: { style: {} }, setDirty() { dirty++; } } };
    const api = { fetchApi(url, options) {
        let resolve, reject;
        const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
        requests.push({ url, options, resolve, reject });
        return promise;
    } };
    const dependencies = {
        app, api, normalizePath, splitPath, joinPath,
        getImageWidget: (target) => target.widgets.find((widget) => widget.name === 'image'),
        setWidgetValue(target, value) {
            changes.push(value);
            const widget = dependencies.getImageWidget(target);
            widget.value = value;
            widget.callback?.call(widget, value);
        },
        openGallery() { opens++; },
    };
    const controller = installGalleryPreviewNavigation(node, dependencies);
    t.after(() => controller.dispose());
    return {
        node, image, preview, app, api, dependencies, originals, controller, clock, requests, changes,
        get opens() { return opens; }, get dirty() { return dirty; },
        async draw(widget = preview, width = node.size[0], images = node.imgs) {
            const ctx = canvasContext();
            widget.drawWidget(ctx, { width, previewImages: images });
            await flush();
            assert.equal(ctx.depth, 0, 'drawing must restore the canvas state');
            return ctx;
        },
        click(rect, widget = preview, button = 0) {
            assert.ok(rect, 'the target button must have a hit area');
            const eDown = { button, canvasX: node.pos[0] + rect.x + rect.w / 2, canvasY: node.pos[1] + rect.y + rect.h / 2 };
            const pointer = { eDown };
            const result = widget.onPointerDown(pointer, node, app.canvas);
            pointer.onClick?.({ ...eDown });
            return result;
        },
    };
}

test('patches existing, arbitrarily late, and replaced preview widgets without a polling deadline', async (t) => {
    const f = fixture(t);
    assert.notEqual(f.preview.drawWidget, f.originals.draw);
    f.clock.advance(10001);
    await flush();
    const late = previewWidget();
    const lateDraw = late.drawWidget;
    assert.equal(f.node.addCustomWidget(late), late, 'preserve addCustomWidget return value');
    assert.notEqual(late.drawWidget, lateDraw, 'a preview added after ten seconds is still patched');
    await f.draw(late);
    assert.ok(late.__cigPrevRect && late.__cigNextRect);

    const replacement = previewWidget();
    f.node.widgets = [f.image, replacement];
    assert.equal(f.node.onConfigure({}), 'configured');
    await f.draw(replacement);
    assert.ok(replacement.__cigPrevRect && replacement.__cigNextRect, 'configuration discovers a replacement widget');
});

test('reserves visible arrow lanes for landscape, portrait, and narrow previews', async (t) => {
    const f = fixture(t);
    for (const width of [420, 220, 140]) {
        for (const [naturalWidth, naturalHeight] of [[1600, 900], [900, 1600], [1000, 1000]]) {
            await f.draw(f.preview, width, [{ naturalWidth, naturalHeight }]);
            const { __cigPrevRect: left, __cigNextRect: right, __cigImageRect: image } = f.preview;
            assert.ok(left?.w > 0 && right?.w > 0, `both arrows at ${width}px for ${naturalWidth}x${naturalHeight}`);
            assert.ok(left.x >= 0 && right.x + right.w <= width, 'arrow lanes stay within the node');
            assert.ok(left.x + left.w <= image.x + 0.001, 'left arrow does not cover the image');
            assert.ok(image.x + image.w <= right.x + 0.001, 'right arrow does not cover the image');
        }
    }
});

test('arrows remain available while preview image is loading or failed', async (t) => {
    const f = fixture(t);
    f.node.imgs = [];
    for (const images of [[], [{ naturalWidth: 0, naturalHeight: 0 }]]) {
        await f.draw(f.preview, 420, images);
        assert.ok(f.preview.__cigPrevRect && f.preview.__cigNextRect);
        assert.equal(f.preview.__cigImageRect, null);
    }
    f.click(f.preview.__cigNextRect);
    assert.equal(f.image.value, 'photos/b.png');
});

test('pointer event coordinates navigate even when cached graph_mouse is stale', async (t) => {
    const f = fixture(t);
    await f.draw();
    assert.equal(f.click(f.preview.__cigNextRect), true);
    assert.deepEqual(f.changes, ['photos/b.png']);
    f.click(f.preview.__cigNextRect);
    assert.equal(f.image.value, 'photos/a.png', 'next wraps to first image');
    f.click(f.preview.__cigPrevRect);
    assert.equal(f.image.value, 'photos/b.png', 'previous wraps to last image');
    const before = f.changes.length;
    f.click(f.preview.__cigNextRect, f.preview, 2);
    assert.equal(f.changes.length, before, 'right click does not change the image');
});

test('opening the image keeps the gallery gesture and disposal cancels deferred work', async (t) => {
    const f = fixture(t);
    await f.draw();
    f.click(f.preview.__cigImageRect);
    f.clock.advance(20);
    assert.equal(f.opens, 1);
    const rect = f.preview.__cigImageRect;
    const pointer = { eDown: { button: 0, canvasX: f.node.pos[0] + rect.x + rect.w / 2, canvasY: f.node.pos[1] + rect.y + rect.h / 2 } };
    f.preview.onPointerDown(pointer, f.node, f.app.canvas);
    assert.equal(f.opens, 1, 'pointer down waits for a completed click');
    f.controller.dispose();
    pointer.onClick?.(pointer.eDown);
    f.clock.advance(10000);
    assert.equal(f.opens, 1, 'removed previews cannot open a delayed gallery');
});

test('queued drawing coalesces duplicate frames and ignores removed or replaced previews', async (t) => {
    const f = fixture(t);
    const contexts = Array.from({ length: 20 }, canvasContext);
    for (const ctx of contexts) f.preview.drawWidget(ctx, { width: 420, previewImages: f.node.imgs });
    assert.ok(contexts.every((ctx) => ctx.calls.length === 0), 'painting is deferred until native node drawing completes');
    await flush();
    assert.ok(contexts.slice(0, -1).every((ctx) => ctx.calls.length === 0), 'superseded frames are not painted');
    assert.equal(contexts.at(-1).calls.filter(([method]) => method === 'drawImage').length, 1);
    assert.equal(contexts.at(-1).depth, 0);

    const obsoleteContext = canvasContext();
    f.preview.drawWidget(obsoleteContext, { width: 420, previewImages: f.node.imgs });
    const replacement = previewWidget();
    f.node.widgets = [f.image, replacement];
    f.node.onExecuted({});
    await flush();
    assert.equal(obsoleteContext.calls.length, 0, 'queued old widget cannot paint over its replacement');

    const removedContext = canvasContext();
    replacement.drawWidget(removedContext, { width: 420, previewImages: f.node.imgs });
    f.node.onRemoved();
    await flush();
    assert.equal(removedContext.calls.length, 0, 'queued removed widget cannot paint after disposal');
});

test('unchanged redraws do not scan a large filename list or schedule more redraws', async (t) => {
    let itemReads = 0;
    const values = new Proxy(Array.from({ length: 10000 }, (_, i) => `photos/${i}.png`), {
        get(target, key, receiver) {
            if (typeof key === 'string' && /^\d+$/.test(key)) itemReads++;
            return Reflect.get(target, key, receiver);
        },
    });
    const f = fixture(t, { values });
    await f.draw();
    itemReads = 0;
    const dirtyBefore = f.dirty;
    const pendingBefore = f.clock.pending.size;
    for (let frame = 0; frame < 120; frame++) {
        const ctx = await f.draw();
        assert.equal(ctx.calls.filter(([method]) => method === 'drawImage').length, 1, 'verify each sampled frame actually painted');
    }
    assert.ok(itemReads < 120 * 10, `120 redraws read ${itemReads} filename items; work must be independent of folder size`);
    assert.equal(f.dirty, dirtyBefore, 'drawing must not schedule its own continuous repaint');
    assert.equal(f.clock.pending.size, pendingBefore, 'drawing must not add animation frames or timers');
});

test('refresh notices new arrays and length changes and excludes sibling folders', async (t) => {
    const f = fixture(t, { values: ['photos/a.png'] });
    await f.draw();
    if (f.preview.__cigNextRect) f.click(f.preview.__cigNextRect);
    assert.deepEqual(f.changes, [], 'a single-image folder cannot navigate');
    f.image.options.values = ['photos/a.png', 'other/ignored.png', 'photos/b.png', 'photos/b.png'];
    f.controller.refresh();
    await f.draw();
    f.click(f.preview.__cigNextRect);
    assert.equal(f.image.value, 'photos/b.png');
    f.click(f.preview.__cigNextRect);
    assert.equal(f.image.value, 'photos/a.png', 'duplicates must not produce an extra navigation stop');
    f.image.options.values.push('photos/c.png');
    await f.draw();
    f.click(f.preview.__cigPrevRect);
    assert.equal(f.image.value, 'photos/c.png', 'in-place length changes invalidate the cached list');
});

test('folder requests are deduplicated and stale responses cannot replace the active folder', async (t) => {
    const f = fixture(t, { values: ['photos/a.png'] });
    f.controller.refresh();
    f.controller.refresh();
    await flush();
    assert.equal(f.requests.length, 1, 'one request while the same folder is pending');
    const oldRequest = f.requests[0];
    f.image.value = 'new/x.png';
    f.image.options.values = ['new/x.png'];
    f.controller.refresh();
    await flush();
    assert.equal(f.requests.length, 2);
    assert.match(f.requests[1].url, /folder=new(?:&|$)/);
    f.requests[1].resolve({ ok: true, json: async () => ({ images: ['x.png', 'y.png'] }) });
    await flush();
    oldRequest.resolve({ ok: true, json: async () => ({ images: ['a.png', 'obsolete.png'] }) });
    await flush();
    await f.draw();
    f.click(f.preview.__cigNextRect);
    assert.equal(f.image.value, 'new/y.png');
    f.controller.refresh();
    await flush();
    assert.equal(f.requests.length, 2, 'a loaded folder is cached');
});

test('explicit folder updates supersede an older in-flight folder listing', async (t) => {
    const f = fixture(t, { values: ['photos/a.png'] });
    await flush();
    const pending = f.requests[0];
    f.controller.setFolderValues('photos', ['photos/a.png', 'photos/recent.png']);
    pending?.resolve({ ok: true, json: async () => ({ images: ['a.png', 'old.png'] }) });
    await flush();
    await f.draw();
    f.click(f.preview.__cigNextRect);
    assert.equal(f.image.value, 'photos/recent.png');
});

test('a transient folder-list failure recovers once its scheduled retry succeeds', async (t) => {
    const f = fixture(t, { values: ['photos/a.png'] });
    f.requests[0].resolve({ ok: false, status: 503 });
    await flush();
    f.controller.refresh();
    f.controller.refresh();
    assert.equal(f.requests.length, 1, 'refresh cannot bypass retry backoff');
    f.clock.advance(1000);
    await flush();
    assert.equal(f.requests.length, 2);
    f.requests[1].resolve({ ok: true, json: async () => ({ images: ['a.png', 'recovered.png'] }) });
    await flush();
    await f.draw();
    f.click(f.preview.__cigNextRect);
    assert.equal(f.image.value, 'photos/recovered.png');
    f.clock.advance(10000);
    assert.equal(f.requests.length, 2, 'successful hydration leaves no retry timer');
});

test('removal clears a pending retry and prevents background folder requests', async (t) => {
    const f = fixture(t, { values: ['photos/a.png'] });
    f.requests[0].resolve({ ok: false, status: 503 });
    await flush();
    assert.equal(f.clock.pending.size, 1, 'failed request schedules one retry');
    f.clock.advance(1000);
    await flush();
    f.requests[1].resolve({ ok: false, status: 503 });
    await flush();
    assert.equal(f.clock.pending.size, 1, 'repeated failure still schedules only one retry');
    f.node.onRemoved();
    assert.equal(f.clock.pending.size, 0);
    f.clock.advance(60000);
    await flush();
    assert.equal(f.requests.length, 2, 'disposed nodes cannot retry later');
});

test('execution refresh discovers replacements, and removal aborts requests and restores hooks', async (t) => {
    const f = fixture(t);
    const replacement = previewWidget();
    const replacementDraw = replacement.drawWidget;
    f.node.widgets = [f.image, replacement];
    assert.equal(f.node.onExecuted({}), 'executed');
    await f.draw(replacement);
    assert.ok(replacement.__cigNextRect);
    await flush();
    assert.ok(f.requests.length > 0);
    const request = f.requests.at(-1);
    assert.ok(request.options?.signal, 'folder requests must support cancellation');
    assert.equal(f.node.onRemoved(), 'removed');
    assert.equal(request.options.signal.aborted, true);
    assert.equal(f.node.addCustomWidget, f.originals.addCustomWidget);
    assert.equal(f.node.onConfigure, f.originals.onConfigure);
    assert.equal(f.node.onExecuted, f.originals.onExecuted);
    assert.equal(f.preview.drawWidget, f.originals.draw);
    assert.equal(f.preview.onPointerDown, f.originals.pointer);
    assert.equal(replacement.drawWidget, replacementDraw);
    assert.equal(f.image.callback, f.originals.callback);
    const dirtyAtRemoval = f.dirty;
    request.resolve({ ok: true, json: async () => ({ images: ['a.png', 'late.png'] }) });
    await flush();
    f.clock.advance(10000);
    assert.equal(f.dirty, dirtyAtRemoval, 'removed node ignores pending async work');
    assert.equal(f.clock.pending.size, 0, 'removed node leaves no callbacks scheduled');
});
