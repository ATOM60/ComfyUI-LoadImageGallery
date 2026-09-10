import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.UnifiedUiStyle";
const STYLE_ID = "cig-unified-ui-style";
const NODE_CLASS = "LoadImageGallery";

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
/* Match the cleaner Output Gallery control language in the image gallery. */
.cig-header .cig-sort,
.cig-header .cig-refresh,
.cig-header .cig-help-unified,
.cig-header .cig-close,
.cig-footer .cig-up-folder,
.cig-footer .cig-pick-folder,
.cig-footer .cig-clear,
.cig-footer .cig-run,
.cig-help-close-unified{
    box-sizing:border-box!important;
    border:1px solid rgba(255,255,255,.14)!important;
    border-radius:6px!important;
    background:var(--comfy-input-bg,#222)!important;
    color:var(--input-text,#ddd)!important;
    cursor:pointer!important;
}
.cig-header .cig-sort:hover,
.cig-header .cig-refresh:hover,
.cig-header .cig-help-unified:hover,
.cig-header .cig-close:hover,
.cig-footer .cig-up-folder:hover,
.cig-footer .cig-pick-folder:hover,
.cig-footer .cig-clear:hover,
.cig-footer .cig-run:hover,
.cig-help-close-unified:hover{
    filter:brightness(1.17)!important;
}
.cig-header .cig-sort:disabled,
.cig-header .cig-refresh:disabled,
.cig-header .cig-help-unified:disabled,
.cig-header .cig-close:disabled,
.cig-footer .cig-up-folder:disabled,
.cig-footer .cig-pick-folder:disabled,
.cig-footer .cig-clear:disabled,
.cig-footer .cig-run:disabled{
    opacity:.45!important;
    cursor:default!important;
}
.cig-header .cig-sort,
.cig-header .cig-help-unified{
    width:38px!important;
    min-width:38px!important;
    height:38px!important;
    padding:0!important;
    margin:0!important;
    font-size:18px!important;
    line-height:36px!important;
}
.cig-header .cig-close{
    width:38px!important;
    min-width:38px!important;
    height:38px!important;
    padding:0!important;
    margin:0!important;
    font-size:19px!important;
    line-height:36px!important;
}
.cig-header .cig-refresh{
    height:38px!important;
    padding:0 12px!important;
    margin:0!important;
}
.cig-footer .cig-up-folder,
.cig-footer .cig-pick-folder{
    width:40px!important;
    min-width:40px!important;
    height:40px!important;
    padding:0!important;
    margin:0!important;
    line-height:38px!important;
}
.cig-footer .cig-clear,
.cig-footer .cig-run{
    height:40px!important;
    min-height:40px!important;
    max-height:40px!important;
    padding:0 14px!important;
    margin:0!important;
    line-height:38px!important;
}
.cig-help-close-unified{
    width:34px!important;
    min-width:34px!important;
    height:34px!important;
    padding:0!important;
    margin:0!important;
    font-size:18px!important;
    line-height:32px!important;
}
`;
    document.head.appendChild(style);
}

function patchInputGallery(root = document) {
    const overlays = [];
    if (root instanceof HTMLElement && root.classList.contains("cig-overlay")) overlays.push(root);
    root.querySelectorAll?.(".cig-overlay").forEach(el => overlays.push(el));

    for (const overlay of overlays) {
        const header = overlay.querySelector(".cig-header");
        if (!(header instanceof HTMLElement)) continue;

        for (const button of header.querySelectorAll("button")) {
            if (!(button instanceof HTMLButtonElement)) continue;
            const text = button.textContent?.trim();
            if (text === "ⓘ" || text === "i" || button.title === "Инструкция" || button.title === "Help") {
                button.classList.add("cig-help-unified");
                button.textContent = "?";
                button.removeAttribute("style");
            }
        }
    }
}

function patchHelpOverlay(root = document) {
    const overlays = [];
    if (root instanceof HTMLElement && root.classList.contains("cig-help-overlay")) overlays.push(root);
    root.querySelectorAll?.(".cig-help-overlay").forEach(el => overlays.push(el));

    for (const overlay of overlays) {
        const title = overlay.querySelector("div > div > div");
        if (title instanceof HTMLElement && title.textContent?.startsWith("ⓘ ")) {
            title.textContent = title.textContent.slice(2);
        }
        const buttons = overlay.querySelectorAll("button");
        for (const button of buttons) {
            if (!(button instanceof HTMLButtonElement) || button.textContent?.trim() !== "✕") continue;
            button.classList.add("cig-help-close-unified");
        }
    }
}

function patchNodeInfoButton(node) {
    if (!node || (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) || node.__cigUnifiedInfoStyle) return;
    node.__cigUnifiedInfoStyle = true;

    const oldDraw = node.onDrawForeground;
    node.onDrawForeground = function(ctx) {
        oldDraw?.call(this, ctx);
        const r = this.__cigTitleHelpRect;
        if (!r) return;
        ctx.save();
        ctx.fillStyle = "#353535";
        ctx.strokeStyle = "#bdbdbd";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", r.x + r.w / 2, r.y + r.h / 2 + .5);
        ctx.restore();
    };
    node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        injectStyles();
        patchInputGallery(document);
        patchHelpOverlay(document);
        app.graph?._nodes?.forEach?.(patchNodeInfoButton);

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    patchInputGallery(node);
                    patchHelpOverlay(node);
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:false });
    },
    nodeCreated(node) {
        patchNodeInfoButton(node);
    },
    loadedGraphNode(node) {
        patchNodeInfoButton(node);
    },
});
