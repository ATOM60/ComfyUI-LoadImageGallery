import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputContextMenuFix";

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.addEventListener("pointerdown", event => {
            if (!(event.target instanceof Element)) return;
            if (!event.target.closest(".ovg-menu")) return;
            event.stopImmediatePropagation();
        });
    },
});
