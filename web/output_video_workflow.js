import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoWorkflow";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en").toLowerCase().startsWith("ru");

const TEXT = RU ? {
    open: "Открыть как workflow",
    loading: "Загрузка workflow из видео…",
    unsupported: "ComfyUI умеет читать workflow из MP4, MOV, M4V и WebM.",
    failed: "Не удалось открыть workflow из видео",
    noWorkflow: "В видео не найден workflow ComfyUI",
    help: "В контекстном меню видео есть «Открыть как workflow». Для MP4, MOV, M4V и WebM с сохранёнными метаданными ComfyUI будет загружен встроенный workflow.",
} : {
    open: "Open as workflow",
    loading: "Loading workflow from video…",
    unsupported: "ComfyUI can read workflows from MP4, MOV, M4V and WebM videos.",
    failed: "Could not open workflow from video",
    noWorkflow: "No ComfyUI workflow was found in this video",
    help: "The video context menu includes “Open as workflow”. For MP4, MOV, M4V and WebM files with ComfyUI metadata, the embedded workflow is loaded.",
};

let lastContext = null;

function toast(message, kind = "info") {
    try {
        app.extensionManager?.toast?.add({
            severity: kind === "error" ? "error" : kind === "success" ? "success" : "info",
            summary: RU ? "Галерея output" : "Output Gallery",
            detail: message,
            life: 4200,
        });
    } catch (_) {
        if (kind === "error") console.error("[Output workflow]", message);
    }
}

function extOf(name) {
    const m = String(name || "").toLowerCase().match(/\.([^.\\/]+)$/);
    return m ? m[1] : "";
}

function basename(path) {
    return String(path || "").replace(/\\/g, "/").split("/").pop() || "video.mp4";
}

function graphNodes() {
    const graph = app.graph || app.rootGraph;
    return { graph, nodes: Array.isArray(graph?._nodes) ? [...graph._nodes] : [] };
}

async function openAsWorkflow(item) {
    const name = item?.name || basename(item?.path);
    const ext = extOf(name);
    if (!["mp4", "mov", "m4v", "webm"].includes(ext)) {
        toast(TEXT.unsupported, "error");
        return;
    }

    toast(TEXT.loading);
    const response = await api.fetchApi(`/image-gallery/output/video?path=${encodeURIComponent(item.path)}`);
    if (!response.ok) {
        let detail = TEXT.failed;
        try { const data = await response.json(); detail = data?.error || detail; } catch (_) {}
        throw new Error(detail);
    }

    const blob = await response.blob();
    const before = ext === "webm" ? graphNodes() : null;

    // MP4/MOV/M4V are detected by filename by ComfyUI's metadata parser, so an
    // application MIME type prevents handleFile() from falling back to creating
    // a LoadVideo node when the file has no workflow metadata.
    const type = ext === "webm" ? "video/webm" : "application/octet-stream";
    const file = new File([blob], name, { type, lastModified: Date.now() });
    await app.handleFile(file);

    // WebM metadata detection requires video/webm. If no workflow exists,
    // handleFile() falls back to adding LoadVideo; undo only that fallback.
    if (before) {
        const after = graphNodes();
        if (after.graph === before.graph) {
            const beforeSet = new Set(before.nodes);
            const added = after.nodes.filter(node => !beforeSet.has(node));
            const oldGraphStillPresent = before.nodes.every(node => after.nodes.includes(node));
            if (oldGraphStillPresent && added.length === 1 && added[0]?.type === "LoadVideo") {
                try { after.graph.remove(added[0]); after.graph.change?.(); } catch (_) {}
                toast(TEXT.noWorkflow, "error");
            }
        }
    }
}

function installMenu(menu) {
    if (!(menu instanceof HTMLElement) || !menu.classList.contains("ovg-menu") || menu.dataset.ovgWorkflowInstalled === "1") return;
    if (!lastContext?.path) return;

    menu.dataset.ovgWorkflowInstalled = "1";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "workflow-open";
    button.textContent = `⎇ ${TEXT.open}`;

    const first = menu.querySelector("button[data-action='open']");
    if (first?.nextSibling) menu.insertBefore(button, first.nextSibling);
    else if (first) first.insertAdjacentElement("afterend", button);
    else menu.prepend(button);

    const item = { ...lastContext };
    button.addEventListener("pointerdown", event => event.stopPropagation());
    button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        menu.remove();
        try { await openAsWorkflow(item); }
        catch (error) { toast(error?.message || TEXT.failed, "error"); }
    });
}

function updateHelp(root) {
    const overlay = root instanceof HTMLElement && root.classList.contains("ovg-help-overlay")
        ? root
        : root.querySelector?.(".ovg-help-overlay");
    if (!(overlay instanceof HTMLElement) || overlay.dataset.ovgWorkflowHelp === "1") return;
    const lists = overlay.querySelectorAll(".ovg-help-body ul");
    const list = lists.length ? lists[lists.length - 1] : null;
    if (!(list instanceof HTMLElement)) return;
    overlay.dataset.ovgWorkflowHelp = "1";
    const li = document.createElement("li");
    li.textContent = TEXT.help;
    list.appendChild(li);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.addEventListener("contextmenu", event => {
            const card = event.target instanceof Element ? event.target.closest(".ovg-card") : null;
            if (!(card instanceof HTMLElement)) return;
            const path = String(card.dataset.path || "").trim();
            if (!path) return;
            const title = card.querySelector(".ovg-card-name")?.textContent?.trim();
            lastContext = { path, name: title || basename(path) };
        }, true);

        document.querySelectorAll(".ovg-menu").forEach(installMenu);
        updateHelp(document);

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.classList.contains("ovg-menu")) installMenu(node);
                    node.querySelectorAll?.(".ovg-menu").forEach(installMenu);
                    updateHelp(node);
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
