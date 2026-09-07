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

            const scrollTop = body.scrollTop;
            const scrollLeft = body.scrollLeft;

            // image_gallery.js re-renders the grid and then scrolls the moved
            // favorite card into view. Restore the user's viewport after that
            // scheduled scroll so adding/removing a favorite does not jump away.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (!body.isConnected) return;
                    body.scrollTop = scrollTop;
                    body.scrollLeft = scrollLeft;
                });
            });
        }, true);
    },
});
