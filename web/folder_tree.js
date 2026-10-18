// CIG_FOLDER_TREE_V1
// The galleries' folder list as a tree, like Explorer's navigation pane:
//   ★ Recent        recently opened folders, each with its full path
//   ▾ input/output  ComfyUI's folder and its subfolders
//   ▸ This PC       the drives and every folder below them
// A button shows the current folder; it opens the tree below (or above) it,
// expanded down to the current folder. A level's subfolders are listed by
// /image-gallery/tree/children when it is first opened. No side effects on
// import (ComfyUI loads every .js in web/ as an extension).

const STYLE_ID = "cig-folder-tree-style";
const INDENT_PX = 18;

const TEXT = {
    ru: {
        recent: "Недавние", thisPc: "Этот компьютер", loading: "Загрузка…", denied: "Нет доступа",
        failed: "Не удалось открыть", truncated: "Показаны не все папки",
        drive: { fixed: "Локальный диск", removable: "Съёмный диск", network: "Сетевой диск", cdrom: "CD-дисковод", ramdisk: "RAM-диск", other: "Диск" },
    },
    en: {
        recent: "Recent", thisPc: "This PC", loading: "Loading…", denied: "Access denied",
        failed: "Could not open", truncated: "Not all folders are shown",
        drive: { fixed: "Local Disk", removable: "Removable Disk", network: "Network Drive", cdrom: "CD Drive", ramdisk: "RAM Disk", other: "Drive" },
    },
};

const ICON = {
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#d9a63a" d="M2.5 6A1.5 1.5 0 0 1 4 4.5h5l2 2.2h9A1.5 1.5 0 0 1 21.5 8.2v10.3A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5z"/><path fill="#f3c55a" d="M2.5 9.2h19v9.3A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5z"/></svg>',
    drive: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="7.5" width="19" height="10" rx="2" fill="#8d97a5"/><rect x="2.5" y="7.5" width="19" height="4.5" rx="2" fill="#c2c9d2"/><circle cx="17.8" cy="14.8" r="1.1" fill="#4cd964"/></svg>',
    pc: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="3.5" width="19" height="13" rx="1.5" fill="#2f7fd8"/><rect x="4" y="5" width="16" height="10" fill="#79bdfc"/><path fill="#8d97a5" d="M9 17.5h6l.8 2.5H8.2z"/></svg>',
    recent: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4aa3ff" d="m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.1l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"/></svg>',
    chevron: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    caret: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cig-ft-button{box-sizing:border-box;display:flex;align-items:center;gap:8px;min-width:0;height:40px;margin:0;padding:0 10px;background:#292929;color:#eee;border:1px solid #4b4b4b;border-radius:7px;cursor:pointer;font:14px/1.2 Inter,Arial,sans-serif;text-align:left}
.cig-ft-button:hover{background:#313131;border-color:#5c5c5c}
.cig-ft-button[aria-expanded=true]{border-color:#6ba7ff}
.cig-ft-button .cig-ft-icon{width:20px;height:20px}
.cig-ft-btext{display:flex;align-items:baseline;gap:8px;min-width:0;flex:1 1 auto;overflow:hidden}
.cig-ft-bname{flex:0 1 auto;max-width:70%;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cig-ft-bpath{flex:1 1 0;min-width:0;color:#9a9a9a;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl;text-align:left}
.cig-ft-bpath>span{direction:ltr;unicode-bidi:isolate}
.cig-ft-caret{flex:none;width:16px;height:16px;color:#aaa}
.cig-ft-pop{position:fixed;z-index:100010;box-sizing:border-box;display:flex;flex-direction:column;background:#1f1f1f;color:#e6e6e6;border:1px solid #474747;border-radius:9px;box-shadow:0 14px 36px rgba(0,0,0,.6);font:13px/1.3 Inter,Arial,sans-serif;overflow:hidden;outline:none}
.cig-ft-list{overflow:auto;padding:6px 0;overscroll-behavior:contain}
.cig-ft-row{box-sizing:border-box;display:flex;align-items:center;gap:6px;min-height:30px;padding:3px 12px 3px calc(8px + var(--depth,0) * ${INDENT_PX}px);border-left:3px solid transparent;cursor:pointer;user-select:none;outline:none}
.cig-ft-row:hover{background:#2a2a2a}
.cig-ft-row.cig-ft-current{background:#26364b;border-left-color:#6ba7ff}
.cig-ft-row.cig-ft-focus{box-shadow:inset 0 0 0 1px #5d86bf}
.cig-ft-top:not(:first-child){margin-top:6px}
.cig-ft-top>.cig-ft-text>.cig-ft-name{font-weight:600}
.cig-ft-twisty{flex:none;width:20px;height:20px;display:flex;align-items:center;justify-content:center;color:#a8a8a8;border-radius:4px}
.cig-ft-twisty:hover{background:#3a3a3a;color:#fff}
.cig-ft-twisty svg{width:14px;height:14px;transition:transform .12s}
.cig-ft-row[aria-expanded=true]>.cig-ft-twisty svg{transform:rotate(90deg)}
.cig-ft-icon{flex:none;width:20px;height:20px;display:flex}
.cig-ft-icon svg{width:100%;height:100%}
.cig-ft-text{display:flex;flex-direction:column;min-width:0;flex:1 1 auto}
.cig-ft-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cig-ft-sub{color:#9a9a9a;font-size:12px;overflow-wrap:anywhere}
.cig-ft-note{color:#8a8a8a;font-style:italic;cursor:default;padding-left:calc(54px + var(--depth,0) * ${INDENT_PX}px)}
.cig-ft-note:hover{background:none}
.cig-ft-spin{width:11px;height:11px;border:2px solid #5a5a5a;border-top-color:#ddd;border-radius:50%;animation:cig-ft-spin .7s linear infinite}
@keyframes cig-ft-spin{to{transform:rotate(360deg)}}
@media (pointer:coarse){.cig-ft-row{min-height:40px}.cig-ft-twisty{width:30px;height:30px}}
`;
    document.head.appendChild(style);
}

// --- paths: forward slashes; drive roots keep their slash ("E:/")
function norm(value) {
    let path = String(value ?? "").trim().replace(/\\/g, "/");
    if (/^[a-z]:/.test(path)) path = path[0].toUpperCase() + path.slice(1);
    if (/^[A-Za-z]:\/?$/.test(path)) return path.slice(0, 2) + "/";
    if (path.length > 1) path = path.replace(/\/+$/, "");
    return path;
}
const isWindowsPath = path => /^[A-Za-z]:\//.test(path) || path.startsWith("//");
const isAbsolute = path => isWindowsPath(path) || path.startsWith("/");
const keyOf = path => { const p = norm(path); return isWindowsPath(p) ? p.toLowerCase() : p; };
const same = (a, b) => keyOf(a) === keyOf(b);
function below(path, root) {
    const p = keyOf(path), r = keyOf(root);
    return !!r && p !== r && p.startsWith(r.endsWith("/") ? r : r + "/");
}
const join = (parent, name) => parent.endsWith("/") ? parent + name : `${parent}/${name}`;
const isDriveRoot = path => /^[A-Za-z]:\/$/.test(norm(path));
function baseName(path) {
    const p = norm(path);
    if (isDriveRoot(p)) return p.slice(0, 2);
    return p.slice(p.lastIndexOf("/") + 1) || p;
}
// Explorer order: digits, then Latin, then other scripts such as Cyrillic
// (a Russian locale would put Cyrillic first).
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const byName = (a, b) => collator.compare(a, b);

// The roots (ComfyUI's input and output folders, the drives) are shared by
// both galleries and re-read on every open, so a plugged-in drive appears.
let rootsPromise = null;
function loadRoots(api) {
    const previous = rootsPromise;
    rootsPromise = api.fetchApi("/image-gallery/tree/roots").then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
        return data;
    }).catch(error => previous ?? Promise.reject(error));
    return rootsPromise;
}

/**
 * Turns `button` into the folder button and returns { update, close }.
 * options: api; language ("ru"/"en"); root ("input": values below it are
 * relative, as the image gallery uses them; "output": values are absolute);
 * rootLabel; current() → the gallery's folder value ("" = the root);
 * recent() → recent folder values; onPick(value).
 */
export function attachFolderTree(button, options) {
    const { api, root = "input", rootLabel = root, current, recent, onPick } = options;
    const t = TEXT[options.language === "ru" ? "ru" : "en"];
    const relativeRoot = root === "input";
    injectStyles();

    let roots = null;
    let pop = null, list = null, nodes = [], focusId = 0, watchTimer = 0, seq = 0;
    const byId = new Map();

    const rootAbs = () => norm(roots?.[root] || "");
    function toAbs(value) {
        const v = norm(value);
        if (!v) return rootAbs();
        if (isAbsolute(v)) return v;
        return rootAbs() ? join(rootAbs(), v) : v;
    }
    function toValue(abs) {
        const a = norm(abs), r = rootAbs();
        if (r && same(a, r)) return "";
        if (relativeRoot && r && below(a, r)) return a.slice(r.length + (r.endsWith("/") ? 0 : 1));
        return a;
    }
    function driveLabel(drive) {
        const letter = norm(drive.path).slice(0, 2);
        if (drive.path === "/") return "/";
        return `${drive.label || t.drive[drive.kind] || t.drive.other} (${letter})`;
    }
    function folderLabel(abs) {
        if (isDriveRoot(abs)) {
            const drive = roots?.drives?.find(d => same(d.path, abs));
            return drive ? driveLabel(drive) : baseName(abs);
        }
        return baseName(abs);
    }

    // --- the button
    button.type = "button";
    button.classList.add("cig-ft-button");
    button.setAttribute("aria-haspopup", "tree");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = `<span class="cig-ft-icon">${ICON.folder}</span><span class="cig-ft-btext"><span class="cig-ft-bname"></span><span class="cig-ft-bpath"><span></span></span></span><span class="cig-ft-caret">${ICON.caret}</span>`;
    const nameEl = button.querySelector(".cig-ft-bname");
    const pathEl = button.querySelector(".cig-ft-bpath>span");
    function update() {
        const value = norm(current?.() ?? "");
        const abs = toAbs(value);
        nameEl.textContent = value ? folderLabel(abs) : rootLabel;
        pathEl.textContent = isAbsolute(abs) ? abs : "";
        button.title = isAbsolute(abs) ? abs : rootLabel;
        if (pop) render();
    }

    // --- tree model
    function node(props, parent = null) {
        const n = { id: ++seq, depth: parent ? parent.depth + 1 : 0, parent, children: null, expanded: false,
            loading: false, leaf: false, error: "", truncated: false, value: null, abs: "", sub: "", ...props };
        byId.set(n.id, n);
        return n;
    }
    const folderNode = (abs, parent) => node({ kind: isDriveRoot(abs) ? "drive" : "folder", abs, value: toValue(abs), label: folderLabel(abs) }, parent);
    function buildTree() {
        byId.clear();
        const top = [];
        const seen = new Set();
        const recentNode = node({ kind: "recent", label: t.recent, expanded: true, children: [] });
        for (const value of recent?.() || []) {
            const abs = toAbs(value);
            if (!norm(value) || seen.has(keyOf(abs))) continue;
            seen.add(keyOf(abs));
            recentNode.children.push(node({ kind: isDriveRoot(abs) ? "drive" : "folder", abs, value: toValue(abs), label: folderLabel(abs), sub: abs, leaf: true }, recentNode));
        }
        if (recentNode.children.length) top.push(recentNode);
        top.push(node({ kind: "folder", abs: rootAbs(), value: "", label: rootLabel, sub: rootAbs() }));
        const pc = node({ kind: "pc", label: t.thisPc, children: [] });
        for (const drive of roots?.drives || []) pc.children.push(node({ kind: "drive", abs: norm(drive.path), value: toValue(drive.path), label: driveLabel(drive) }, pc));
        top.push(pc);
        return top;
    }
    const expandable = n => !n.leaf && (n.abs ? !(n.children && !n.children.length && !n.error) : !!n.children?.length);

    async function load(n) {
        if (n.children || n.loading || !n.abs) return;
        n.loading = true;
        render();
        try {
            const response = await api.fetchApi(`/image-gallery/tree/children?path=${encodeURIComponent(n.abs)}`);
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw Object.assign(new Error(data?.error || `HTTP ${response.status}`), { denied: !!data?.denied });
            n.children = (Array.isArray(data.folders) ? data.folders : []).map(String).sort(byName).map(name => folderNode(join(n.abs, name), n));
            n.truncated = !!data.truncated;
        } catch (error) {
            n.children = [];
            n.error = error?.denied ? t.denied : t.failed;
        } finally {
            n.loading = false;
        }
    }
    async function setExpanded(n, open) {
        n.expanded = open;
        if (open) await load(n);
        render();
    }

    function visibleRows() {
        const rows = [];
        const walk = items => {
            for (const n of items) {
                rows.push(n);
                if (!n.expanded || !n.children) continue;
                if (n.error) rows.push({ id: -n.id, note: n.error, depth: n.depth + 1 });
                walk(n.children);
                if (n.truncated) rows.push({ id: -n.id, note: t.truncated, depth: n.depth + 1 });
            }
        };
        walk(nodes);
        return rows;
    }

    function render() {
        if (!list) return;
        const currentAbs = toAbs(current?.() ?? "");
        const frag = document.createDocumentFragment();
        for (const n of visibleRows()) {
            const row = document.createElement("div");
            row.className = "cig-ft-row";
            row.style.setProperty("--depth", String(n.depth));
            if (n.note) {
                row.classList.add("cig-ft-note");
                row.textContent = n.note;
                frag.appendChild(row);
                continue;
            }
            row.dataset.id = String(n.id);
            row.setAttribute("role", "treeitem");
            row.setAttribute("aria-level", String(n.depth + 1));
            if (n.depth === 0) row.classList.add("cig-ft-top");
            const canExpand = expandable(n);
            if (canExpand) row.setAttribute("aria-expanded", String(n.expanded));
            if (n.value !== null && n.abs && same(n.abs, currentAbs)) {
                row.classList.add("cig-ft-current");
                row.setAttribute("aria-current", "true");
            }
            if (n.id === focusId) row.classList.add("cig-ft-focus");
            row.innerHTML = `<span class="cig-ft-twisty">${canExpand ? (n.loading ? '<span class="cig-ft-spin"></span>' : ICON.chevron) : ""}</span><span class="cig-ft-icon">${ICON[n.kind] || ICON.folder}</span><span class="cig-ft-text"><span class="cig-ft-name"></span>${n.sub ? '<span class="cig-ft-sub"></span>' : ""}</span>`;
            row.querySelector(".cig-ft-name").textContent = n.label;
            if (n.sub) row.querySelector(".cig-ft-sub").textContent = n.sub;
            row.title = n.abs || n.label;
            frag.appendChild(row);
        }
        list.replaceChildren(frag);
    }
    function scrollToFocus(block = "nearest") {
        list?.querySelector(`[data-id="${focusId}"]`)?.scrollIntoView({ block });
    }

    // Opens the levels down to the current folder, like Explorer does.
    async function reveal() {
        const target = toAbs(current?.() ?? "");
        const rootNode = nodes.find(n => n.value === "" && n.depth === 0);
        const pc = nodes.find(n => n.kind === "pc");
        let start = null;
        if (rootNode?.abs && (same(target, rootNode.abs) || below(target, rootNode.abs))) start = rootNode;
        else {
            const drive = pc?.children.find(d => same(target, d.abs) || below(target, d.abs));
            if (drive) { pc.expanded = true; start = drive; }
        }
        if (!start) {
            if (rootNode) await setExpanded(rootNode, true);
            focusId = rootNode?.id ?? nodes[0]?.id ?? 0;
            return;
        }
        let n = start;
        const names = norm(target).slice(norm(start.abs).length).split("/").filter(Boolean);
        if (!names.length) await setExpanded(n, true);
        for (const name of names) {
            n.expanded = true;
            await load(n);
            const next = n.children?.find(child => same(child.abs, join(n.abs, name)));
            if (!next) break;
            n = next;
        }
        focusId = n.id;
    }

    function pick(n) {
        close(true);
        onPick?.(n.value);
    }
    function activate(n) {
        if (n.value === null) setExpanded(n, !n.expanded);
        else pick(n);
    }

    function position() {
        if (!pop) return;
        const r = button.getBoundingClientRect();
        const margin = 8, gap = 4;
        const width = Math.min(Math.max(r.width, 440), 680, innerWidth - 2 * margin);
        const left = Math.min(Math.max(r.left, margin), innerWidth - width - margin);
        const spaceBelow = innerHeight - r.bottom - gap - margin;
        const spaceAbove = r.top - gap - margin;
        const down = spaceBelow >= 360 || spaceBelow >= spaceAbove;
        const height = Math.max(160, Math.min(down ? spaceBelow : spaceAbove, innerHeight * 0.75));
        Object.assign(pop.style, {
            left: `${left}px`, width: `${width}px`, maxHeight: `${height}px`,
            top: down ? `${r.bottom + gap}px` : "", bottom: down ? "" : `${innerHeight - r.top + gap}px`,
        });
    }

    const onOutside = event => {
        if (pop && !pop.contains(event.target) && !button.contains(event.target)) close();
    };
    const onResize = () => close();

    function onKey(event) {
        // The galleries close on Escape and use the arrows themselves.
        event.stopPropagation();
        const rows = visibleRows().filter(n => !n.note);
        const index = rows.findIndex(n => n.id === focusId);
        const n = rows[index];
        const move = i => {
            if (!rows.length) return;
            focusId = rows[Math.max(0, Math.min(rows.length - 1, i))].id;
            render();
            scrollToFocus();
        };
        switch (event.key) {
            case "Escape": close(true); break;
            case "ArrowDown": move(index + 1); break;
            case "ArrowUp": move(index - 1); break;
            case "Home": move(0); break;
            case "End": move(rows.length - 1); break;
            case "ArrowRight":
                if (n && expandable(n)) { if (!n.expanded) setExpanded(n, true); else move(index + 1); }
                break;
            case "ArrowLeft":
                if (n?.expanded && expandable(n)) setExpanded(n, false);
                else if (n?.parent) { focusId = n.parent.id; render(); scrollToFocus(); }
                break;
            case "Enter":
            case " ":
                if (n) activate(n);
                break;
            default:
                return;
        }
        event.preventDefault();
    }

    async function open() {
        if (pop) return;
        pop = document.createElement("div");
        pop.className = "cig-ft-pop";
        pop.tabIndex = -1;
        list = document.createElement("div");
        list.className = "cig-ft-list";
        list.setAttribute("role", "tree");
        list.innerHTML = `<div class="cig-ft-row cig-ft-note">${t.loading}</div>`;
        pop.appendChild(list);
        document.body.appendChild(pop);
        button.setAttribute("aria-expanded", "true");
        position();
        pop.addEventListener("keydown", onKey);
        pop.addEventListener("click", event => {
            const row = event.target.closest(".cig-ft-row");
            const n = row && byId.get(Number(row.dataset.id));
            if (!n) return;
            focusId = n.id;
            if (event.target.closest(".cig-ft-twisty") && expandable(n)) setExpanded(n, !n.expanded);
            else activate(n);
        });
        document.addEventListener("pointerdown", onOutside, true);
        window.addEventListener("resize", onResize);
        // The gallery can close under the open list.
        watchTimer = setInterval(() => { if (!button.isConnected) close(); }, 500);
        const opened = pop;
        try {
            roots = await loadRoots(api);
        } catch (_) {
            if (pop === opened) list.innerHTML = `<div class="cig-ft-row cig-ft-note">${t.failed}</div>`;
            return;
        }
        if (pop !== opened) return;
        update();
        nodes = buildTree();
        render();
        await reveal();
        if (pop !== opened) return;
        render();
        pop.focus({ preventScroll: true });
        scrollToFocus("center");
    }

    function close(returnFocus = false) {
        if (!pop) return;
        pop.remove();
        pop = list = null;
        nodes = [];
        byId.clear();
        clearInterval(watchTimer);
        document.removeEventListener("pointerdown", onOutside, true);
        window.removeEventListener("resize", onResize);
        button.setAttribute("aria-expanded", "false");
        if (returnFocus && button.isConnected) button.focus({ preventScroll: true });
    }

    button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (pop) close();
        else open();
    });

    // Full paths need the roots; fill them in once known.
    loadRoots(api).then(data => { roots = roots || data; update(); }).catch(() => {});
    update();
    return { update, close };
}
