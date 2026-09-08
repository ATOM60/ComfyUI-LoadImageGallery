import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputControlsRightEdge";
const STYLE_ID = "cig-output-controls-right-edge";

app.registerExtension({
    name: EXT_NAME,
    setup() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
.ovg-speed-control[popover]{
    right:18px!important;
    top:50%!important;
    bottom:auto!important;
    left:auto!important;
    inset:50% 18px auto auto!important;
    transform:translateY(-50%)!important;
    flex-direction:row!important;
    align-items:center!important;
    justify-content:flex-end!important;
    gap:8px!important;
}
.ovg-player-control-row{
    display:flex!important;
    flex-direction:column!important;
    align-items:center!important;
    justify-content:center!important;
    gap:2px!important;
    width:36px!important;
    min-width:36px!important;
    max-width:36px!important;
    height:116px!important;
    min-height:116px!important;
    max-height:116px!important;
}
.ovg-speed-panel{
    order:0!important;
    margin:0!important;
}
.ovg-player-control-row{
    order:1!important;
}
`;
        document.head.appendChild(style);
    },
});
