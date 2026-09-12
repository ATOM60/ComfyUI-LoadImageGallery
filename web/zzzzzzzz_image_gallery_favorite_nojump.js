import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.FavoriteNoJump";

function normalizePath(value) {
    return String(value ?? "")
        .replace(/\\/g, "/")
        .replace(/\s*\[(input|output|temp)\]\s*$/i, "")
        .replace(/^\/+|\/+$/g, "");
}

function cardKey(card) {
    return normalizePath(card?.__cigRelative || card?.title || "");
}

function captureViewport(body, ignoredCard = null) {
    const bodyRect = body.getBoundingClientRect();
    const cards = [...body.querySelectorAll(".cig-card")];
    let best = null;

    for (const card of cards) {
        if (card === ignoredCard) continue;
        const key = cardKey(card);
        if (!key) continue;
        const rect = card.getBoundingClientRect();
        if (rect.bottom <= bodyRect.top || rect.top >= bodyRect.bottom) continue;

        if (!best || rect.top < best.rect.top || (Math.abs(rect.top - best.rect.top) < 0.5 && rect.left < best.rect.left)) {
            best = { key, rect };
        }
    }

    return {
        top: body.scrollTop,
        left: body.scrollLeft,
        anchorKey: best?.key || "",
        anchorOffset: best ? best.rect.top - bodyRect.top : 0,
    };
}

function restoreViewport(body, snapshot) {
    if (!(body instanceof HTMLElement) || !body.isConnected || !snapshot) return;

    if (snapshot.anchorKey) {
        const bodyRect = body.getBoundingClientRect();
        const anchor = [...body.querySelectorAll(".cig-card")]
            .find(card => cardKey(card) === snapshot.anchorKey);
        if (anchor) {
            const currentOffset = anchor.getBoundingClientRect().top - bodyRect.top;
            body.scrollTop += currentOffset - snapshot.anchorOffset;
            body.scrollLeft = snapshot.left;
            return;
        }
    }

    body.scrollTop = snapshot.top;
    body.scrollLeft = snapshot.left;
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.addEventListener("click", event => {
            const target = event.target instanceof Element ? event.target : null;
            const button = target?.closest?.(".cig-favorite");
            if (!button) return;

            const overlay = button.closest?.(".cig-overlay");
            const body = overlay?.querySelector?.(".cig-body");
            const card = button.closest?.(".cig-card");
            if (!(body instanceof HTMLElement) || !(card instanceof HTMLElement)) return;

            // Do not handle the favorite state here. The original image_gallery.js
            // handler must run so its in-memory favorites Set stays synchronized and
            // the card is re-rendered/reordered immediately in the open gallery.
            const snapshot = captureViewport(body, card);
            const oldOverflowAnchor = body.style.overflowAnchor;
            const oldScrollBehavior = body.style.scrollBehavior;
            body.style.overflowAnchor = "none";
            body.style.scrollBehavior = "auto";

            // image_gallery.js also schedules one RAF that scrolls the moved favorite
            // into view. Restore our viewport on the following frame, after that RAF.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (!body.isConnected) return;
                    restoreViewport(body, snapshot);
                    body.style.overflowAnchor = oldOverflowAnchor;
                    body.style.scrollBehavior = oldScrollBehavior;
                });
            });
        }, true);
    },
});
