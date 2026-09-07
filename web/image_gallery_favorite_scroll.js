import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.FavoriteScrollGuard";

function cardKey(card) {
    return String(card?.__cigRelative || "");
}

function findAnchor(body, clickedCard) {
    const bodyRect = body.getBoundingClientRect();
    const cards = [...body.querySelectorAll(".cig-card")];

    // Anchor the viewport to a visible card that is not the card being moved
    // between the normal and favorites groups. This keeps the same content at
    // the same screen position even though the grid itself is re-ordered.
    let best = null;
    for (const card of cards) {
        if (card === clickedCard) continue;
        const key = cardKey(card);
        if (!key) continue;
        const r = card.getBoundingClientRect();
        if (r.bottom <= bodyRect.top || r.top >= bodyRect.bottom) continue;
        if (!best || r.top < best.rect.top || (r.top === best.rect.top && r.left < best.rect.left)) {
            best = { key, rect:r };
        }
    }

    return best ? { key:best.key, offset:best.rect.top - bodyRect.top } : null;
}

function restoreViewport(body, anchor, fallbackTop, fallbackLeft) {
    if (!body.isConnected) return;

    if (anchor?.key) {
        const bodyRect = body.getBoundingClientRect();
        const card = [...body.querySelectorAll(".cig-card")].find(item => cardKey(item) === anchor.key);
        if (card) {
            const currentOffset = card.getBoundingClientRect().top - bodyRect.top;
            const delta = currentOffset - anchor.offset;
            if (Math.abs(delta) > 0.5) body.scrollTop += delta;
            body.scrollLeft = fallbackLeft;
            return;
        }
    }

    body.scrollTop = fallbackTop;
    body.scrollLeft = fallbackLeft;
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.addEventListener("click", event => {
            const target = event.target instanceof Element ? event.target : null;
            const favorite = target?.closest?.(".cig-favorite");
            if (!favorite) return;

            const overlay = favorite.closest?.(".cig-overlay");
            const body = overlay?.querySelector?.(".cig-body");
            if (!(body instanceof HTMLElement)) return;

            const clickedCard = favorite.closest?.(".cig-card");
            const fallbackTop = body.scrollTop;
            const fallbackLeft = body.scrollLeft;
            const anchor = findAnchor(body, clickedCard);
            const oldOverflowAnchor = body.style.overflowAnchor;

            // Disable browser scroll anchoring while image_gallery.js rebuilds
            // and moves the favorite card to/from the favorites group.
            body.style.overflowAnchor = "none";

            const restore = () => restoreViewport(body, anchor, fallbackTop, fallbackLeft);

            // render() runs in the favorite click handler and the old code also
            // schedules scrollIntoView() for the moved card. Restore after both,
            // then keep the viewport fixed for a few frames while grid layout and
            // lazy thumbnails settle.
            queueMicrotask(restore);
            let frame = 0;
            const tick = () => {
                restore();
                frame += 1;
                if (frame < 6) {
                    requestAnimationFrame(tick);
                } else {
                    setTimeout(() => {
                        restore();
                        body.style.overflowAnchor = oldOverflowAnchor;
                    }, 0);
                }
            };
            requestAnimationFrame(tick);
        }, true);
    },
});
