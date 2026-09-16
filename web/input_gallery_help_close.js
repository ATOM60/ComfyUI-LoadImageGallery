import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.InputHelpCloseButton";

function isRu() {
    return String(localStorage.getItem("ComfyUI-LoadImageGallery.language") || navigator.language || "en")
        .toLowerCase().startsWith("ru");
}

function patchHelpOverlay(overlay) {
    if (!(overlay instanceof HTMLElement) || overlay.dataset.cigHelpClosePatched === "1") return;
    overlay.dataset.cigHelpClosePatched = "1";

    const head = overlay.querySelector(":scope > div > div:first-child");
    if (!(head instanceof HTMLElement)) return;

    const old = head.querySelector("button");
    if (!(old instanceof HTMLButtonElement)) return;

    const button = old.cloneNode(false);
    button.type = "button";
    button.textContent = isRu() ? "Закрыть" : "Close";
    button.title = button.textContent;
    button.style.cssText = "height:34px;min-width:84px;padding:0 14px;background:#2c2c2c;color:#eee;border:1px solid #555;border-radius:7px;cursor:pointer;font-size:13px";

    const close = event => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
        overlay.remove();
    };

    button.addEventListener("pointerdown", event => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }, true);
    button.addEventListener("click", close, true);

    old.replaceWith(button);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.querySelectorAll(".cig-help-overlay").forEach(patchHelpOverlay);

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    if (node.classList.contains("cig-help-overlay")) patchHelpOverlay(node);
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
