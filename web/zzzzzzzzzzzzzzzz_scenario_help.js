import { app } from "/scripts/app.js";
import { helpScenarios, renderScenarios } from "./help_scenarios.js";

// CIG_SCENARIO_HELP_V2
// Replaces the Output Gallery help with the video scenarios (9–13) from
// help_scenarios.js, the single source shared with the image gallery help and
// numbered like the README.
const EXT_NAME = "Comfy.ImageGallery.ScenarioHelp";

function applyScenarioHelp(root = document) {
    const overlays = [];
    if (root instanceof HTMLElement && root.classList.contains("ovg-help-overlay")) overlays.push(root);
    root.querySelectorAll?.(".ovg-help-overlay").forEach(el => overlays.push(el));

    for (const overlay of overlays) {
        if (!(overlay instanceof HTMLElement)) continue;
        const body = overlay.querySelector(".ovg-help-body");
        if (!(body instanceof HTMLElement)) continue;
        if (body.dataset.cigScenarioHelp === "2") continue;
        body.dataset.cigScenarioHelp = "2";
        const help = helpScenarios();
        const title = overlay.querySelector(".ovg-help-head span");
        if (title instanceof HTMLElement) title.textContent = help.videoTitle;
        body.replaceChildren();
        renderScenarios(body, help.videos, help.videoFooter);
    }
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        applyScenarioHelp(document);
        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof Element) applyScenarioHelp(node);
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
