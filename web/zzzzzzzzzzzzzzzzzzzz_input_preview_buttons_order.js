import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.InputPreviewButtonsOrder";
const NODE_CLASS = "LoadImageGallery";
const MAX_FRAMES = 12;

let graphSwitchListenerInstalled = false;

function isGalleryNode(node) {
    return !!node && (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS);
}

function findPreview(node) {
    return node?.widgets?.find?.(w => w?.name === "$$canvas-image-preview" || w?.type === "IMAGE_PREVIEW") || null;
}

function settleOrder(node) {
    if (!isGalleryNode(node)) return;

    const generation = (node.__cigButtonsOrderGeneration || 0) + 1;
    node.__cigButtonsOrderGeneration = generation;

    let frame = 0;
    const tick = () => {
        if (!node?.graph || node.__cigButtonsOrderGeneration !== generation) return;
        frame += 1;

        const preview = findPreview(node);
        if (preview && !app.configuringGraph) {
            // The stable layout already owns the actual ordering. Calling it only
            // after the preview exists keeps the image above the button row while
            // avoiding addWidget/addCustomWidget hooks during workflow restore.
            node.__cigNodeLayout?.refresh?.();
            node.graph?.setDirtyCanvas?.(true, true);
            return;
        }

        if (frame < MAX_FRAMES) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
}

function nodesFromGraph(graph) {
    if (!graph) return [];
    if (Array.isArray(graph._nodes)) return graph._nodes;
    if (Array.isArray(graph.nodes)) return graph.nodes;
    const byId = graph._nodes_by_id;
    if (byId instanceof Map) return [...byId.values()];
    if (byId && typeof byId === "object") return Object.values(byId);
    return [];
}

function settleGraph(graph) {
    for (const node of nodesFromGraph(graph)) {
        if (isGalleryNode(node)) settleOrder(node);
    }
}

function ensureGraphSwitchListener() {
    if (graphSwitchListenerInstalled) return;
    const canvasElement = app?.canvas?.canvas;
    if (!canvasElement?.addEventListener) return;

    graphSwitchListenerInstalled = true;
    canvasElement.addEventListener("litegraph:set-graph", event => {
        const graph = event?.detail?.newGraph || app?.rootGraphOrUndefined || app?.graph;
        // set-graph can fire while ComfyUI is still swapping its active graph.
        // One frame later the node layout controller belongs to the active graph.
        requestAnimationFrame(() => settleGraph(graph));
    });
}

app.registerExtension({
    name: EXT_NAME,
    nodeCreated(node) {
        ensureGraphSwitchListener();
        settleOrder(node);
    },
    loadedGraphNode(node) {
        ensureGraphSwitchListener();
        settleOrder(node);
    },
});
