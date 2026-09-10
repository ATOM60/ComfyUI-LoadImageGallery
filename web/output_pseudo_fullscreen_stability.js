import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputPseudoFullscreenStability";
const STYLE_ID = "cig-output-pseudo-fullscreen-stability-style";

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
/*
 * The gallery normally lifts a card by 1px on hover using transform.
 * A transformed ancestor becomes the containing block for position:fixed,
 * which made the pseudo-fullscreen thumb collapse back into its card as soon
 * as the pointer moved over it. Disable that hover transform only for the card
 * that currently owns the pseudo-fullscreen player.
 */
.ovg-card:has(> .ovg-thumb.cig-pseudo-fullscreen),
.ovg-card:has(> .ovg-thumb.cig-pseudo-fullscreen):hover {
    transform:none!important;
    transition:none!important;
    overflow:visible!important;
    z-index:2147482999!important;
}
.ovg-grid:has(.ovg-thumb.cig-pseudo-fullscreen),
.ovg-grid-wrap:has(.ovg-thumb.cig-pseudo-fullscreen) {
    overflow:visible!important;
}
`;
    document.head.appendChild(style);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
    },
});
