import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.InputNodeStack";
const NODE_CLASS = "LoadImageGallery";
const STACK_PARENT = "__cigStackParentId";
const STACK_INDEX = "__cigStackIndex";
const STACK_GAP = 4;

const registered = new Set();
const controllers = new WeakMap();
const lastPositions = new WeakMap();
let hookedCanvas = null;
let previousOnNodeMoved = null;

const isTarget = node => node && (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS);
const graphNodes = graph => graph?._nodes || graph?.nodes || [];
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

function properties(node) {
    node.properties = node.properties || {};
    return node.properties;
}

function parentId(node) {
    return properties(node)[STACK_PARENT];
}

function clearParent(node) {
    const p = properties(node);
    delete p[STACK_PARENT];
    delete p[STACK_INDEX];
}

function findNode(graph, id) {
    if (id == null) return null;
    try {
        const node = graph?.getNodeById?.(id);
        if (node) return node;
    } catch (_) {}
    return graphNodes(graph).find(node => sameId(node?.id, id)) || null;
}

function validParent(node) {
    const id = parentId(node);
    if (id == null) return null;
    const parent = findNode(node.graph, id);
    return isTarget(parent) && parent !== node ? parent : null;
}

function stackChildren(root) {
    if (!root?.graph) return [];
    return graphNodes(root.graph)
        .filter(node => isTarget(node) && node !== root && sameId(parentId(node), root.id))
        .sort((a, b) => {
            const ai = Number(properties(a)[STACK_INDEX]);
            const bi = Number(properties(b)[STACK_INDEX]);
            if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
            return Number(a.pos?.[1] || 0) - Number(b.pos?.[1] || 0);
        });
}

function setLastPosition(node) {
    if (!node?.pos) return;
    lastPositions.set(node, [Number(node.pos[0]) || 0, Number(node.pos[1]) || 0]);
}

function markDirty(node, foreground = false) {
    node?.graph?.setDirtyCanvas?.(true, foreground);
    node?.setDirtyCanvas?.(true, foreground);
}

function refreshRoot(root) {
    if (!isTarget(root) || validParent(root)) return;
    const children = stackChildren(root);
    children.forEach((child, index) => {
        properties(child)[STACK_PARENT] = root.id;
        properties(child)[STACK_INDEX] = index + 1;
    });
    root.__cigStackCount = children.length + 1;
    markDirty(root, false);
}

function reflowRoot(root) {
    if (!isTarget(root) || validParent(root) || !root.graph) return;
    const children = stackChildren(root);
    let y = Number(root.pos?.[1] || 0) + Number(root.size?.[1] || 0) + STACK_GAP;
    const x = Number(root.pos?.[0] || 0);

    children.forEach((child, index) => {
        properties(child)[STACK_PARENT] = root.id;
        properties(child)[STACK_INDEX] = index + 1;
        child.pos = child.pos || [x, y];
        child.pos[0] = x;
        child.pos[1] = y;
        setLastPosition(child);
        y += Number(child.size?.[1] || root.size?.[1] || 220) + STACK_GAP;
        markDirty(child, false);
    });

    root.__cigStackCount = children.length + 1;
    setLastPosition(root);
    markDirty(root, true);
}

function reconcileGraph(graph, { reflow = false } = {}) {
    if (!graph) return;
    const nodes = graphNodes(graph).filter(isTarget);

    for (const node of nodes) {
        const id = parentId(node);
        if (id == null) continue;
        const parent = findNode(graph, id);
        if (!isTarget(parent) || parent === node) clearParent(node);
    }

    for (const node of nodes) {
        if (validParent(node)) continue;
        refreshRoot(node);
        if (reflow) reflowRoot(node);
    }

    for (const node of nodes) setLastPosition(node);
}

function hasLinks(node) {
    if (node?.inputs?.some(input => input?.link != null)) return true;
    return !!node?.outputs?.some(output => {
        if (Array.isArray(output?.links)) return output.links.length > 0;
        return output?.links != null;
    });
}

function confirmRemoveConnected() {
    const lang = String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en")
        .toLowerCase().startsWith("ru");
    return confirm(lang
        ? "У последней ноды есть подключения. Удалить её из стека вместе с подключениями?"
        : "The last node has connections. Remove it from the stack together with its connections?");
}

function rootFor(node) {
    if (!isTarget(node)) return null;
    return validParent(node) || node;
}

function addNode(root) {
    root = rootFor(root);
    const graph = root?.graph;
    if (!root || !graph) return null;

    const factory = globalThis.LiteGraph?.createNode;
    if (typeof factory !== "function") return null;

    const child = factory(root.type || NODE_CLASS);
    if (!child) return null;

    child.properties = child.properties || {};
    child.properties[STACK_PARENT] = root.id;
    child.properties[STACK_INDEX] = stackChildren(root).length + 1;

    try {
        const width = Number(root.size?.[0]);
        const height = Number(root.size?.[1]);
        if (Number.isFinite(width) && Number.isFinite(height)) child.setSize?.([width, height]);
    } catch (_) {}

    graph.add(child);
    reconcileGraph(graph);
    reflowRoot(root);

    // Layout-dependent widgets can settle one or two frames after graph.add().
    requestAnimationFrame(() => {
        if (!child.graph || child.graph !== graph) return;
        reflowRoot(root);
        requestAnimationFrame(() => {
            if (child.graph === graph) reflowRoot(root);
        });
    });

    graph.change?.();
    return child;
}

function removeNode(root) {
    root = rootFor(root);
    const graph = root?.graph;
    if (!root || !graph) return false;

    const children = stackChildren(root);
    const child = children.at(-1);
    if (!child) return false;
    if (hasLinks(child) && !confirmRemoveConnected()) return false;

    child.__cigStackRemoving = true;
    graph.remove(child);
    reconcileGraph(graph);
    reflowRoot(root);
    graph.change?.();
    return true;
}

function detachChild(child) {
    const graph = child?.graph;
    const oldRoot = validParent(child);
    if (!graph || !oldRoot) return;

    clearParent(child);
    child.__cigStackCount = 1;
    setLastPosition(child);
    reconcileGraph(graph);
    reflowRoot(oldRoot);
    markDirty(child, true);
    graph.change?.();
}

function handleMoved(graph) {
    if (!graph) return;
    const nodes = [...registered].filter(node => node.graph === graph && isTarget(node));
    const moved = new Set();

    for (const node of nodes) {
        const previous = lastPositions.get(node);
        const x = Number(node.pos?.[0] || 0), y = Number(node.pos?.[1] || 0);
        if (!previous || previous[0] !== x || previous[1] !== y) moved.add(node);
    }
    if (!moved.size) return;

    const movedRoots = [...moved].filter(node => !validParent(node));

    for (const root of movedRoots) {
        const previous = lastPositions.get(root);
        if (!previous) continue;
        const dx = Number(root.pos?.[0] || 0) - previous[0];
        const dy = Number(root.pos?.[1] || 0) - previous[1];
        if (!dx && !dy) continue;

        for (const child of stackChildren(root)) {
            // If the canvas already moved the child as part of a multi-selection,
            // do not apply the root delta a second time.
            if (moved.has(child)) continue;
            child.pos[0] += dx;
            child.pos[1] += dy;
            setLastPosition(child);
            markDirty(child, false);
        }
    }

    // Dragging only a child intentionally detaches it from the managed stack.
    for (const child of [...moved]) {
        const parent = validParent(child);
        if (!parent || movedRoots.includes(parent)) continue;
        detachChild(child);
    }

    for (const node of nodes) setLastPosition(node);
    for (const root of movedRoots) refreshRoot(root);
}

function installCanvasHook() {
    const canvas = app.canvas;
    if (!canvas || canvas === hookedCanvas) return;

    hookedCanvas = canvas;
    previousOnNodeMoved = canvas.onNodeMoved;
    canvas.onNodeMoved = function(node) {
        const result = previousOnNodeMoved?.apply(this, arguments);
        handleMoved(node?.graph || this.graph || app.graph);
        return result;
    };
}

function install(node) {
    if (!isTarget(node) || controllers.has(node)) return;

    registered.add(node);
    setLastPosition(node);

    const controller = {
        isRoot: () => !validParent(node),
        count: () => {
            if (validParent(node)) return 1;
            if (!Number.isFinite(node.__cigStackCount)) refreshRoot(node);
            return Math.max(1, Number(node.__cigStackCount) || 1);
        },
        add: () => addNode(node),
        remove: () => removeNode(node),
        root: () => rootFor(node),
    };
    controllers.set(node, controller);
    node.__cigStackController = controller;

    const ownRemoved = Object.hasOwn(node, "onRemoved");
    const oldRemoved = node.onRemoved;
    const removed = function(...args) {
        const graph = node.graph;
        const root = validParent(node);

        if (!root && graph) {
            // Removing the top node must not silently delete independent child
            // nodes. Promote every child to a standalone stack.
            for (const child of stackChildren(node)) {
                clearParent(child);
                child.__cigStackCount = 1;
                markDirty(child, true);
            }
        }

        registered.delete(node);
        controllers.delete(node);
        lastPositions.delete(node);
        if (node.__cigStackController === controller) delete node.__cigStackController;

        if (node.onRemoved === removed) {
            if (ownRemoved) node.onRemoved = oldRemoved;
            else delete node.onRemoved;
        }

        const result = oldRemoved?.apply(this, args);
        if (graph) {
            reconcileGraph(graph);
            if (root && !node.__cigStackRemoving) reflowRoot(root);
        }
        return result;
    };
    node.onRemoved = removed;

    installCanvasHook();
    requestAnimationFrame(() => {
        if (!node.graph) return;
        reconcileGraph(node.graph);
    });
}

function refreshCurrentGraph() {
    installCanvasHook();
    const graph = app.rootGraphOrUndefined || app.graph;
    for (const node of graphNodes(graph)) install(node);
    reconcileGraph(graph);
}

app.registerExtension({
    name: EXT_NAME,
    setup: installCanvasHook,
    nodeCreated: install,
    loadedGraphNode: install,
    afterConfigureGraph: refreshCurrentGraph,
});
