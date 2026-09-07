import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.FavoriteScrollGuard";

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

            const lockedTop = body.scrollTop;
            const lockedLeft = body.scrollLeft;
            const oldOverflowAnchor = body.style.overflowAnchor;
            body.style.overflowAnchor = "none";

            // image_gallery.js re-renders the grid and then calls scrollIntoView()
            // for the card that has just moved into/out of Favorites. Instead of
            // trying to compensate for the reordered grid, keep the scroll
            // container at the exact same coordinates until that whole click
            // cycle has finished.
            let active = true;
            let restoring = false;
            const restore = () => {
                if (!active || restoring || !body.isConnected) return;
                if (Math.abs(body.scrollTop - lockedTop) < 0.5 && Math.abs(body.scrollLeft - lockedLeft) < 0.5) return;
                restoring = true;
                body.scrollTop = lockedTop;
                body.scrollLeft = lockedLeft;
                restoring = false;
            };

            const onScroll = () => restore();
            body.addEventListener("scroll", onScroll, { passive:true });

            // Keep correcting after the original handler's render(), its queued
            // requestAnimationFrame(scrollIntoView), browser layout anchoring and
            // any immediate lazy-thumbnail layout work.
            queueMicrotask(restore);
            let frames = 0;
            const tick = () => {
                restore();
                frames += 1;
                if (frames < 12) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);

            setTimeout(() => {
                restore();
                active = false;
                body.removeEventListener("scroll", onScroll);
                body.style.overflowAnchor = oldOverflowAnchor;
            }, 220);
        }, true);
    },
});
