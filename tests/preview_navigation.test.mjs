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

function storage(t, entries = {}) {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const map = new Map(Object.entries(entries));
    const value = { getItem: (key) => map.has(key) ? map.get(key) : null, setItem: (key, v) => map.set(key, String(v)), removeItem: (key) => map.delete(key) };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value });
    t.after(() => {
        if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
        else delete globalThis.localStorage;
    });
    return map;
}

function fixture(t, { values = ['photos/a.png', 'photos/b.png'], properties } = {}) {
    const clock = scheduler(t);
    const image = { name: 'image', value: values[0] ?? 'photos/a.png', options: { values }, callback() {} };
    const requests = [];
    const changes = [];
    const node = {
        widgets: [image],
        ...(properties ? { properties } : {}),
        onConfigure() { return 'configured'; },
        onExecuted() { return 'executed'; },
        onRemoved() { return 'removed'; },
    };
    const originals = { onConfigure: node.onConfigure, onExecuted: node.onExecuted, onRemoved: node.onRemoved };
    const api = { fetchApi(url, options) {
        let resolve, reject;
        const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
        requests.push({ url, options, resolve, reject });
        return promise;
    } };
    const dependencies = {
        api, normalizePath, splitPath, joinPath,
        getImageWidget: (target) => target.widgets.find((widget) => widget.name === 'image'),
        setWidgetValue(target, value) {
            changes.push(value);
            dependencies.getImageWidget(target).value = value;
            target.__cigPreviewNavigation?.refresh();
        },
    };
    const controller = installGalleryPreviewNavigation(node, dependencies);
    t.after(() => controller.dispose());
    return { node, image, api, dependencies, originals, controller, clock, requests, changes };
}

test('navigate walks the folder in order and wraps both ways', async (t) => {
    const f = fixture(t, { values: ['photos/b.png', 'photos/a.png', 'photos/c.png'] });
    f.image.value = 'photos/a.png';
    f.controller.refresh();
    f.controller.navigate(1);
    assert.equal(f.image.value, 'photos/b.png');
    f.controller.navigate(1);
    f.controller.navigate(1);
    assert.equal(f.image.value, 'photos/a.png', 'next wraps to the first image');
    f.controller.navigate(-1);
    assert.equal(f.image.value, 'photos/c.png', 'previous wraps to the last image');
    assert.deepEqual(f.changes, ['photos/b.png', 'photos/c.png', 'photos/a.png', 'photos/c.png']);
});

test('state reports the position and whether the arrows can move', async (t) => {
    const f = fixture(t, { values: ['photos/a.png', 'photos/b.png', 'photos/c.png'] });
    f.image.value = 'photos/b.png';
    f.controller.refresh();
    assert.deepEqual({ ...f.controller.state(), loading: undefined }, { value: 'photos/b.png', index: 1, count: 3, canNavigate: true, loading: undefined });
    assert.equal(f.controller.state().loading, true, 'the folder listing is still pending');
    const single = fixture(t, { values: ['solo/a.png'] });
    assert.equal(single.controller.state().canNavigate, false);
    single.controller.navigate(1);
    assert.deepEqual(single.changes, [], 'a single-image folder cannot navigate');
});

test('subscribers hear about changes, and idle refreshes cost nothing', async (t) => {
    let itemReads = 0;
    const values = new Proxy(Array.from({ length: 10000 }, (_, i) => `photos/${i}.png`), {
        get(target, key, receiver) {
            if (typeof key === 'string' && /^\d+$/.test(key)) itemReads++;
            return Reflect.get(target, key, receiver);
        },
    });
    const f = fixture(t, { values });
    let calls = 0;
    const unsubscribe = f.controller.subscribe(() => calls++);
    itemReads = 0;
    const pendingBefore = f.clock.pending.size;
    for (let i = 0; i < 120; i++) f.controller.refresh();
    assert.ok(itemReads < 120 * 10, `120 idle refreshes read ${itemReads} items; work must not depend on folder size`);
    assert.equal(calls, 0, 'nothing changed, so nobody is notified');
    assert.equal(f.clock.pending.size, pendingBefore, 'refresh adds no timers');
    f.image.value = 'photos/7.png';
    f.controller.refresh();
    assert.equal(calls, 1, 'a new image notifies once');
    unsubscribe();
    f.image.value = 'photos/8.png';
    f.controller.refresh();
    assert.equal(calls, 1, 'unsubscribed listeners are not called');
});

test('refresh notices new arrays and length changes and excludes sibling folders', async (t) => {
    const f = fixture(t, { values: ['photos/a.png'] });
    f.image.options.values = ['photos/a.png', 'other/ignored.png', 'photos/b.png', 'photos/b.png'];
    f.controller.refresh();
    f.controller.navigate(1);
    assert.equal(f.image.value, 'photos/b.png');
    f.controller.navigate(1);
    assert.equal(f.image.value, 'photos/a.png', 'duplicates must not produce an extra navigation stop');
    f.image.options.values.push('photos/c.png');
    f.controller.navigate(-1);
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
    f.controller.navigate(1);
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
    f.controller.navigate(1);
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
    f.controller.navigate(1);
    assert.equal(f.image.value, 'photos/recovered.png');
    f.clock.advance(10000);
    assert.equal(f.requests.length, 2, 'successful hydration leaves no retry timer');
});

test('removal clears a pending retry, aborts requests and restores hooks', async (t) => {
    const f = fixture(t, { values: ['photos/a.png'] });
    f.requests[0].resolve({ ok: false, status: 503 });
    await flush();
    assert.equal(f.clock.pending.size, 1, 'failed request schedules one retry');
    f.clock.advance(1000);
    await flush();
    const request = f.requests[1];
    assert.ok(request.options?.signal, 'folder requests must support cancellation');
    assert.equal(f.node.onRemoved(), 'removed');
    assert.equal(request.options.signal.aborted, true);
    assert.equal(f.clock.pending.size, 0);
    assert.equal(f.node.onConfigure, f.originals.onConfigure);
    assert.equal(f.node.onExecuted, f.originals.onExecuted);
    assert.equal(f.node.onRemoved, f.originals.onRemoved);
    assert.equal(f.node.__cigPreviewNavigation, undefined);
    f.clock.advance(60000);
    await flush();
    assert.equal(f.requests.length, 2, 'disposed nodes cannot retry later');
});

const SUBFOLDERS = 'ComfyUI-LoadImageGallery.includeSubfolders';
const SORT = 'ComfyUI-LoadImageGallery.sortMode';
const treeListing = {
    images: ['b.png', 'sub/a.png', 'sub/deep/c.png'],
    items: [{ name: 'b.png', mtime: 2 }, { name: 'sub/a.png', mtime: 1 }, { name: 'sub/deep/c.png', mtime: 3 }],
};

test('flat Subfolders view walks the whole remembered folder tree in gallery order', async (t) => {
    storage(t, { [SUBFOLDERS]: '1', [SORT]: 'name-asc' });
    const f = fixture(t, { values: ['photos/sub/a.png', 'photos/b.png', 'other/x.png'], properties: { __cigNavFolder: 'photos' } });
    await flush();
    assert.equal(f.requests.length, 1);
    assert.match(f.requests[0].url, /folder=photos&recursive=1$/);
    f.requests[0].resolve({ ok: true, json: async () => treeListing });
    await flush();
    const walk = [];
    for (let i = 0; i < 3; i++) { f.controller.navigate(1); walk.push(f.image.value); }
    assert.deepEqual(walk, ['photos/b.png', 'photos/sub/deep/c.png', 'photos/sub/a.png'], 'file names interleave across subfolders and wrap');
    assert.equal(f.node.__cigFolder, 'photos', 'the gallery keeps opening on the remembered folder');
});

test('flat view sorts by date with metadata keyed by the path below the folder', async (t) => {
    storage(t, { [SUBFOLDERS]: '1', [SORT]: 'date-desc' });
    const f = fixture(t, { values: ['photos/sub/deep/c.png'], properties: { __cigNavFolder: 'photos' } });
    await flush();
    f.requests[0].resolve({ ok: true, json: async () => treeListing });
    await flush();
    f.controller.navigate(1);
    assert.equal(f.image.value, 'photos/b.png');
    f.controller.navigate(1);
    assert.equal(f.image.value, 'photos/sub/a.png');
});

test('outside the remembered folder, or with the toggle off, the arrows use the image folder', async (t) => {
    const store = storage(t, { [SUBFOLDERS]: '1' });
    const f = fixture(t, { values: ['other/x.png'], properties: { __cigNavFolder: 'photos' } });
    await flush();
    assert.match(f.requests[0].url, /folder=other&recursive=1$/, 'an image picked elsewhere walks its own tree');
    f.image.value = 'photos/sub/a.png';
    store.set(SUBFOLDERS, '0');
    f.controller.refresh();
    await flush();
    assert.match(f.requests.at(-1).url, /folder=photos%2Fsub$/, 'toggle off restores the per-folder listing');
});
