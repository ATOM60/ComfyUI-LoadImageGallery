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

    // Keep the title and close action as two independent flex items. Some
    // ComfyUI themes apply aggressive global button/text rules, so the few
    // layout-critical properties are set with !important.
    head.style.setProperty("display", "flex", "important");
    head.style.setProperty("align-items", "center", "important");
    head.style.setProperty("gap", "16px", "important");

    const title = head.firstElementChild;
    if (title instanceof HTMLElement && title !== old) {
        title.style.setProperty("flex", "1 1 auto", "important");
        title.style.setProperty("min-width", "0", "important");
        title.style.setProperty("margin", "0", "important");
    }

    const button = old.cloneNode(false);
    button.type = "button";
    button.classList.add("cig-help-close-fixed");
    button.textContent = isRu() ? "Закрыть" : "Close";
    button.title = button.textContent;
    const fixed = {
        display:"inline-flex",
        alignItems:"center",
        justifyContent:"center",
        flex:"0 0 auto",
        height:"34px",
        minWidth:"84px",
        padding:"0 14px",
        margin:"0",
        background:"#2c2c2c",
        color:"#eee",
        border:"1px solid #555",
        borderRadius:"7px",
        cursor:"pointer",
        fontSize:"13px",
        lineHeight:"32px",
        whiteSpace:"nowrap",
        boxSizing:"border-box",
        textDecoration:"none",
    };
    for (const [key, value] of Object.entries(fixed)) {
        button.style.setProperty(key.replace(/[A-Z]/g, m => "-" + m.toLowerCase()), value, "important");
    }

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
