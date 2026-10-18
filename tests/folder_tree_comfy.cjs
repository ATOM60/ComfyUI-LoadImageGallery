// End-to-end check of the galleries' folder tree (web/folder_tree.js) in a
// real ComfyUI. Same requirements as node_panel_comfy.cjs: a running test
// ComfyUI with this node, Playwright (or playwright-core) and Chrome. The
// input folder needs at least one image and one subfolder.
//
//   COMFY_URL=http://127.0.0.1:8188 node tests/folder_tree_comfy.cjs
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const URL = process.env.COMFY_URL || 'http://127.0.0.1:8188';

(async () => {
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'en-US' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { try { localStorage.setItem('ComfyUI-LoadImageGallery.language', 'en'); } catch (_) {} });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.app?.graph && window.app?.extensionManager?.setting, null, { timeout: 60000 });
    await page.keyboard.press('Escape');
    const rows = () => page.evaluate(() => [...document.querySelectorAll('.cig-ft-row[data-id]')].map(r => ({
        name: r.querySelector('.cig-ft-name')?.textContent, depth: +r.style.getPropertyValue('--depth'),
        current: r.classList.contains('cig-ft-current'), expanded: r.getAttribute('aria-expanded'),
    })));
    const clickRow = (name, twisty = false) => page.evaluate(([n, tw]) => {
        const row = [...document.querySelectorAll('.cig-ft-row[data-id]')].find(r => r.querySelector('.cig-ft-name')?.textContent === n);
        (tw ? row?.querySelector('.cig-ft-twisty') : row)?.click();
        return !!row;
    }, [name, twisty]);

    const setup = await page.evaluate(async () => {
        document.querySelectorAll('.p-dialog-mask').forEach(el => el.remove());
        const app = window.app;
        const folders = (await (await app.api.fetchApi('/image-gallery/folders')).json()).folders.filter(Boolean);
        const roots = await (await app.api.fetchApi('/image-gallery/tree/roots')).json();
        const listing = await (await app.api.fetchApi('/image-gallery/list?folder=')).json();
        app.graph.clear();
        const node = window.LiteGraph.createNode('LoadImageGallery');
        node.pos = [300, 150];
        app.graph.add(node);
        const image = node.widgets.find(w => w.name === 'image');
        image.value = listing.images[0]; image.callback?.(listing.images[0]);
        await new Promise(r => setTimeout(r, 1000));
        document.querySelector('.cig-np-stage').click();
        await new Promise(r => setTimeout(r, 1500));
        return { sub: folders.find(f => !f.includes('/')), roots };
    });
    const checks = [];
    const check = (name, ok, details = '') => checks.push([name, !!ok, details]);

    check('roots list input, output and drives', setup.roots.input && setup.roots.output && setup.roots.drives?.length, JSON.stringify(setup.roots));
    await page.click('.cig-folder-tree');
    await page.waitForTimeout(1000);
    let r = await rows();
    check('tree has input and This PC', r.some(x => x.name === 'input' && x.depth === 0) && r.some(x => x.name === 'This PC'), JSON.stringify(r));
    check('input root is current and expanded', r.find(x => x.name === 'input')?.current && r.find(x => x.name === 'input')?.expanded === 'true');
    check('input subfolders are listed', r.some(x => x.name === setup.sub && x.depth === 1), setup.sub);

    await clickRow(setup.sub);
    await page.waitForTimeout(1200);
    check('picking a subfolder opens it', (await page.evaluate(() => document.querySelector('.cig-breadcrumbs')?.innerText)).includes(setup.sub));
    check('the tree closes after picking', !(await page.$('.cig-ft-pop')));

    await page.click('.cig-folder-tree');
    await page.waitForTimeout(1000);
    r = await rows();
    check('reopened tree shows the subfolder as current and in Recent', r.filter(x => x.name === setup.sub && x.current).length === 2, JSON.stringify(r));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('Escape closes only the tree', !(await page.$('.cig-ft-pop')) && !!(await page.$('.cig-overlay')));

    // A drive through This PC: values outside input stay absolute.
    const drive = setup.roots.drives.find(d => setup.roots.input.toLowerCase().startsWith(d.path.toLowerCase())) || setup.roots.drives[0];
    await page.click('.cig-folder-tree');
    await page.waitForTimeout(1000);
    await clickRow('This PC', true);
    await page.waitForTimeout(400);
    const driveName = (await rows()).find(x => x.depth === 1 && x.name.includes(drive.path.slice(0, 2)))?.name;
    await clickRow(driveName);
    await page.waitForTimeout(1500);
    const crumbs = await page.evaluate(() => document.querySelector('.cig-breadcrumbs')?.innerText.replace(/\s+/g, ' '));
    check('picking a drive opens its root', crumbs.startsWith(drive.path.slice(0, 2)) || drive.path === '/', crumbs);
    await page.click('.cig-folder-tree');
    await page.waitForTimeout(1200);
    r = await rows();
    check('the drive is revealed and current under This PC', r.some(x => x.name === driveName && x.current && x.depth === 1), JSON.stringify(r));
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('.cig-overlay .cig-close')?.click());
    await page.waitForTimeout(400);

    // Output Gallery
    await page.evaluate(() => document.querySelector('.cig-np-output').click());
    await page.waitForSelector('.ovg-folder-tree', { timeout: 15000 });
    await page.waitForTimeout(800);
    await page.click('.ovg-folder-tree');
    await page.waitForTimeout(1000);
    r = await rows();
    check('output tree has output as current', r.some(x => x.name === 'output' && x.current), JSON.stringify(r));
    await page.keyboard.press('Escape');
    check('no page errors', errors.length === 0, errors.join('; '));
    await browser.close();

    let failed = 0;
    for (const [name, ok, details] of checks) {
        if (!ok) failed++;
        console.log(`${ok ? 'ok    ' : 'FAIL  '}${name}${!ok && details ? ' — ' + details : ''}`);
    }
    assert.equal(failed, 0, `${failed} check(s) failed`);
})().catch(error => { console.error(error); process.exit(1); });
