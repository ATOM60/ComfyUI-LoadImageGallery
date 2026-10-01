import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.LocaleSync";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const COMFY_LOCALE = "Comfy.Locale";

let listenerInstalled = false;

function galleryLanguage(locale) {
    return String(locale || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function readComfyLocale() {
    try {
        const value = app?.extensionManager?.setting?.get?.(COMFY_LOCALE);
        if (value) return value;
    } catch (_) {}

    try {
        const value = app?.ui?.settings?.getSettingValue?.(COMFY_LOCALE);
        if (value) return value;
    } catch (_) {}

    return navigator.language || "en";
}

function syncFromComfyLocale(locale = readComfyLocale()) {
    const next = galleryLanguage(locale);
    try {
        const previous = localStorage.getItem(LANG_KEY);
        if (previous === next) return false;
        localStorage.setItem(LANG_KEY, next);
        return true;
    } catch (_) {
        return false;
    }
}

// This file is intentionally prefixed with 000_: image_gallery.js and
// output_video_gallery.js read LANG_KEY when their modules are evaluated.
// Sync it from Comfy.Locale before those modules choose their translations.
syncFromComfyLocale();

app.registerExtension({
    name: EXT_NAME,
    setup() {
        syncFromComfyLocale();
        if (listenerInstalled) return;

        const settings = app?.ui?.settings;
        if (!settings?.addEventListener) return;

        listenerInstalled = true;
        settings.addEventListener(`${COMFY_LOCALE}.change`, event => {
            const changed = syncFromComfyLocale(event?.detail?.value);
            if (changed) location.reload();
        });
    },
});
