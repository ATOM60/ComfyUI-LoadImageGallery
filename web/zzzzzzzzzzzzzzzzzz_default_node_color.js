import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.DefaultNodeColor";
const NODE_CLASS = "LoadImageGallery";
const TITLE_COLOR = "#1F7A7A";
const BODY_COLOR = "#123E3E";

app.registerExtension({
    name: EXT_NAME,
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_CLASS) return;

        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalOnNodeCreated?.apply(this, arguments);
            this.color = TITLE_COLOR;
            this.bgcolor = BODY_COLOR;
            return result;
        };
    },
});
