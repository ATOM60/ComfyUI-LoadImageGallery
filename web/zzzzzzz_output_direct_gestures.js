import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputPreviewInteractions";
const STYLE_ID = "cig-output-gpu-touch-style";
const SINGLE_CLICK_DELAY_MS = 260;
const DOUBLE_CLICK_WINDOW_MS = 360;
const TOUCH_LOCK_PX = 14;
const TOUCH_DIRECTION_RATIO = 1.2;
const clickState = new WeakMap();
const touchGestures = new Map();
let activePseudoVideo = null;

function ensureTouchStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
video.ovg-inline-video{
    touch-action:pan-y pinch-zoom!important;
    -webkit-user-select:none!important;
    user-select:none!important;
}
.ovg-thumb.cig-pseudo-fullscreen{
    position:fixed!important;
    top:var(--cig-pseudo-top,0px)!important;
    right:0!important;
    bottom:0!important;
    left:0!important;
    width:100vw!important;
    height:calc(100vh - var(--cig-pseudo-top,0px))!important;
    min-width:0!important;
    min-height:0!important;
    max-width:none!important;
    max-height:none!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    border-radius:0!important;
    box-sizing:border-box!important;
    background:#000!important;
    overflow:hidden!important;
    z-index:2147483000!important;
}
.ovg-thumb.cig-pseudo-fullscreen video.ovg-inline-video{
    position:absolute!important;
    inset:0!important;
    width:100%!important;
    height:100%!important;
    min-width:0!important;
    min-height:0!important;
    max-width:none!important;
    max-height:none!important;
    margin:0!important;
    border:0!important;
    border-radius:0!important;
    object-fit:contain!important;
    background:#000!important;
}
body.cig-output-pseudo-fullscreen-open{
    overflow:hidden!important;
}
`;
    document.head.appendChild(style);
}

function clamp(value, min, max) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

function fmtTime(value) {
    let s = Math.max(0, Math.floor(Number(value) || 0));
    const h = Math.floor(s / 3600);
    s -= h * 3600;
    const m = Math.floor(s / 60);
    s %= 60;
    return h
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${m}:${String(s).padStart(2, "0")}`;
}

function getThumbFromEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest?.(".ovg-cpu-player")) return null;
    const thumb = target?.closest?.(".ovg-thumb");
    if (!thumb || !thumb.closest(".ovg-card")) return null;
    if (target.closest?.("button")) return null;
    return thumb;
}

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function isPseudoFullscreenVideo(video) {
    const thumb = video?.closest?.(".ovg-thumb") || null;
    return !!video && (video.dataset.cigPseudoFullscreen === "1" || thumb?.classList.contains("cig-pseudo-fullscreen"));
}

function isFullscreenVideo(video) {
    if (isPseudoFullscreenVideo(video)) return true;
    const fs = fullscreenElement();
    const thumb = video?.closest?.(".ovg-thumb") || null;
    return !!video && (fs === video || fs === thumb || video.webkitDisplayingFullscreen === true);
}

function isPictureArea(video, event) {
    const rect = video.getBoundingClientRect();
    const localY = event.clientY - rect.top;
    const nativeControlsHeight = isFullscreenVideo(video) ? 72 : 52;
    return localY < rect.height - nativeControlsHeight;
}

function isOverCustomControls(event) {
    const x = event.clientX;
    const y = event.clientY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

    for (const control of document.querySelectorAll(".ovg-speed-control")) {
        const style = getComputedStyle(control);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const nodes = control.querySelectorAll(".ovg-player-control-button,.ovg-speed-panel,.ovg-speed-slider");
        for (const node of nodes) {
            const r = node.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
        }
    }
    return false;
}

function findPlayer(thumb) {
    return thumb.querySelector("video.ovg-inline-video");
}

function createPlayer(thumb) {
    const existing = findPlayer(thumb);
    if (existing) return { video: existing, created: false };

    const playButton = thumb.querySelector(".ovg-play");
    if (!playButton) return { video: null, created: false };

    playButton.click();
    return { video: findPlayer(thumb), created: true };
}

function ensurePlaying(video) {
    if (!video) return;
    queueMicrotask(() => {
        if (video.isConnected && video.paused) video.play().catch(() => {});
    });
}

function togglePlayback(thumb) {
    const { video, created } = createPlayer(thumb);
    if (!video) return;

    if (created) {
        ensurePlaying(video);
        return;
    }

    if (video.paused) video.play().catch(() => {});
    else video.pause();
}

function detectTopInset() {
    const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    let best = 0;
    const candidates = document.querySelectorAll("body *");

    for (const el of candidates) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.closest(".ovg-modal") || el.closest(".ovg-speed-control")) continue;

        const rect = el.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top > 2) continue;
        if (rect.height < 20 || rect.height > 96) continue;

        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;

        const appRegion = style.webkitAppRegion || style.getPropertyValue("-webkit-app-region");
        const className = typeof el.className === "string" ? el.className : "";
        const id = el.id || "";
        const namedTopBar = /title[-_ ]?bar|top[-_ ]?bar|window[-_ ]?controls|app[-_ ]?header/i.test(`${className} ${id}`);
        const fixedWide = (style.position === "fixed" || style.position === "sticky") && rect.width >= width * 0.6;
        const draggable = appRegion === "drag" && rect.width >= Math.min(width * 0.3, 320);

        if (namedTopBar || fixedWide || draggable) {
            best = Math.max(best, rect.bottom);
        }
    }

    return Math.round(clamp(best, 0, 96));
}

function setPseudoControls(video, visible) {
    const apply = () => {
        const control = video?.__cigSpeedControl;
        if (!control?.isConnected) return;
        if (visible) {
            try {
                if (typeof control.showPopover === "function" && !control.matches(":popover-open")) control.showPopover();
            } catch (_) {}
        } else {
            control.classList.remove("open");
            try {
                if (typeof control.hidePopover === "function" && control.matches(":popover-open")) control.hidePopover();
            } catch (_) {}
        }
    };
    apply();
    if (visible) {
        queueMicrotask(apply);
        setTimeout(apply, 0);
    }
}

function enterPseudoFullscreen(video) {
    if (!video) return;
    const thumb = video.closest(".ovg-thumb");
    if (!(thumb instanceof HTMLElement)) return;

    if (activePseudoVideo && activePseudoVideo !== video) {
        exitPseudoFullscreen(activePseudoVideo, false);
    }

    const topInset = detectTopInset();
    thumb.style.setProperty("--cig-pseudo-top", `${topInset}px`);
    thumb.classList.add("cig-pseudo-fullscreen");
    video.dataset.cigPseudoFullscreen = "1";
    document.body.classList.add("cig-output-pseudo-fullscreen-open");
    activePseudoVideo = video;
    setPseudoControls(video, true);
    try { video.play().catch(() => {}); } catch (_) {}
}

function exitPseudoFullscreen(video, pause = true) {
    if (!video) return;
    const thumb = video.closest(".ovg-thumb");
    if (pause) {
        try { video.pause(); } catch (_) {}
    }
    if (thumb instanceof HTMLElement) {
        thumb.classList.remove("cig-pseudo-fullscreen");
        thumb.style.removeProperty("--cig-pseudo-top");
    }
    delete video.dataset.cigPseudoFullscreen;
    setPseudoControls(video, false);
    if (activePseudoVideo === video) activePseudoVideo = null;
    if (!document.querySelector(".ovg-thumb.cig-pseudo-fullscreen")) {
        document.body.classList.remove("cig-output-pseudo-fullscreen-open");
    }
}

function enterFullscreen(video) {
    enterPseudoFullscreen(video);
}

function exitFullscreenAndPause(video) {
    if (!video) return;
    if (isPseudoFullscreenVideo(video)) {
        exitPseudoFullscreen(video, true);
        return;
    }

    try { video.pause(); } catch (_) {}
    const fs = fullscreenElement();
    if (fs) {
        try {
            if (document.exitFullscreen) {
                const result = document.exitFullscreen();
                result?.catch?.(() => {});
                return;
            }
        } catch (_) {}
        try {
            if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
                return;
            }
        } catch (_) {}
    }
    try {
        if (video.webkitDisplayingFullscreen && video.webkitExitFullscreen) video.webkitExitFullscreen();
    } catch (_) {}
}

function toggleFullscreen(thumb) {
    const existing = findPlayer(thumb);
    if (existing && isFullscreenVideo(existing)) {
        exitFullscreenAndPause(existing);
        return;
    }

    const { video, created } = createPlayer(thumb);
    if (!video) return;
    if (created) ensurePlaying(video);
    enterFullscreen(video);
}

function validPreviewInteraction(event) {
    if (isOverCustomControls(event)) return null;
    const thumb = getThumbFromEvent(event);
    if (!thumb) return null;
    if (event.target instanceof HTMLVideoElement && !isPictureArea(event.target, event)) return null;
    return thumb;
}

function consume(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
}

function targetForTouchSwipe(startTime, duration, dx, width, elapsedMs) {
    const w = Math.max(120, Number(width) || 1);
    const ratio = dx / w;
    const span = clamp(duration * 0.35, 12, 90);
    const velocity = Math.abs(dx) / Math.max(70, elapsedMs || 0);
    const momentum = clamp(1 + velocity * 0.9, 1, 2.5);
    const curved = Math.sign(ratio) * Math.pow(Math.abs(ratio), 0.92);
    return clamp(startTime + curved * span * momentum, 0, duration);
}

function showTouchHud(video, text) {
    const host = video.closest(".ovg-thumb");
    if (!(host instanceof HTMLElement)) return;
    let hud = host.querySelector(":scope > .cig-gpu-touch-hud");
    if (!(hud instanceof HTMLElement)) {
        hud = document.createElement("div");
        hud.className = "cig-gpu-touch-hud";
        hud.style.cssText = "position:absolute;left:50%;top:50%;z-index:2147483646;transform:translate(-50%,-50%);pointer-events:none;padding:9px 13px;border-radius:8px;background:rgba(0,0,0,.72);color:#fff;font:700 14px/1.2 Arial,sans-serif;white-space:nowrap;box-shadow:0 4px 18px rgba(0,0,0,.35);";
        host.appendChild(hud);
    }
    hud.textContent = text;
}

function hideTouchHud(video) {
    video?.closest?.(".ovg-thumb")?.querySelector?.(":scope > .cig-gpu-touch-hud")?.remove();
}

function onTouchPointerDown(event) {
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    const video = event.target instanceof HTMLVideoElement && event.target.classList.contains("ovg-inline-video")
        ? event.target
        : null;
    if (!video || isOverCustomControls(event) || !isPictureArea(video, event)) return;

    const duration = Number(video.duration);
    const current = Number(video.currentTime);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(current)) return;

    touchGestures.set(event.pointerId, {
        video,
        thumb: video.closest(".ovg-thumb"),
        startX: event.clientX,
        startY: event.clientY,
        startedAt: performance.now(),
        startTime: current,
        duration,
        targetTime: current,
        locked: false,
        cancelled: false,
    });
}

function onTouchPointerMove(event) {
    const g = touchGestures.get(event.pointerId);
    if (!g || g.cancelled) return;

    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);

    if (!g.locked) {
        if (Math.max(ax, ay) < TOUCH_LOCK_PX) return;
        if (ay > ax * TOUCH_DIRECTION_RATIO) {
            g.cancelled = true;
            hideTouchHud(g.video);
            return;
        }
        if (ax <= ay * TOUCH_DIRECTION_RATIO) return;
        g.locked = true;
    }

    if (!g.locked) return;
    event.preventDefault();
    event.stopPropagation();

    const elapsed = performance.now() - g.startedAt;
    g.targetTime = targetForTouchSwipe(
        g.startTime,
        g.duration,
        dx,
        g.video.getBoundingClientRect().width,
        elapsed,
    );
    const signed = g.targetTime - g.startTime;
    const sign = signed > .05 ? "+" : signed < -.05 ? "−" : "";
    showTouchHud(g.video, `${sign}${Math.abs(signed).toFixed(Math.abs(signed) < 10 ? 1 : 0)} с   ${fmtTime(g.targetTime)} / ${fmtTime(g.duration)}`);
}

function finishTouchPointer(event, cancelled = false) {
    const g = touchGestures.get(event.pointerId);
    if (!g) return false;
    touchGestures.delete(event.pointerId);
    hideTouchHud(g.video);

    if (cancelled || g.cancelled || !g.locked) return false;

    const dx = event.clientX - g.startX;
    const elapsed = performance.now() - g.startedAt;
    g.targetTime = targetForTouchSwipe(
        g.startTime,
        g.duration,
        dx,
        g.video.getBoundingClientRect().width,
        elapsed,
    );
    try { g.video.currentTime = g.targetTime; } catch (_) {}
    consume(event);
    return true;
}

function onPointerUp(event) {
    if (event.pointerType === "touch" && finishTouchPointer(event, false)) return;
    if (event.button !== 0) return;
    const thumb = validPreviewInteraction(event);
    if (!thumb) return;

    consume(event);

    const now = performance.now();
    const pending = clickState.get(thumb);
    if (pending && now - pending.time <= DOUBLE_CLICK_WINDOW_MS) {
        clearTimeout(pending.timer);
        clickState.delete(thumb);
        toggleFullscreen(thumb);
        return;
    }

    if (pending) clearTimeout(pending.timer);
    const timer = setTimeout(() => {
        clickState.delete(thumb);
        if (!thumb.isConnected) return;
        togglePlayback(thumb);
    }, SINGLE_CLICK_DELAY_MS);
    clickState.set(thumb, { time: now, timer });
}

function onPointerCancel(event) {
    if (event.pointerType !== "touch") return;
    finishTouchPointer(event, true);
}

function suppressGeneratedClick(event) {
    const thumb = validPreviewInteraction(event);
    if (!thumb) return;
    consume(event);
}

function protectContextMenu(menu) {
    if (!(menu instanceof HTMLElement) || menu.dataset.cigContextMenuProtected === "1") return;
    menu.dataset.cigContextMenuProtected = "1";
    menu.addEventListener("pointerdown", event => event.stopPropagation());
}

function onKeyDown(event) {
    if (event.key !== "Escape" || !activePseudoVideo) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    exitPseudoFullscreen(activePseudoVideo, true);
}

function onResize() {
    const video = activePseudoVideo;
    if (!video?.isConnected) return;
    const thumb = video.closest(".ovg-thumb");
    if (thumb instanceof HTMLElement) {
        thumb.style.setProperty("--cig-pseudo-top", `${detectTopInset()}px`);
    }
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureTouchStyles();
        document.addEventListener("pointerdown", onTouchPointerDown, { capture:true, passive:true });
        document.addEventListener("pointermove", onTouchPointerMove, { capture:true, passive:false });
        document.addEventListener("pointerup", onPointerUp, { capture:true, passive:false });
        document.addEventListener("pointercancel", onPointerCancel, { capture:true, passive:false });
        document.addEventListener("click", suppressGeneratedClick, true);
        document.addEventListener("dblclick", suppressGeneratedClick, true);
        document.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("resize", onResize);
        document.querySelectorAll(".ovg-menu").forEach(protectContextMenu);

        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.classList.contains("ovg-menu")) protectContextMenu(node);
                    node.querySelectorAll?.(".ovg-menu").forEach(protectContextMenu);
                }
                for (const node of record.removedNodes) {
                    if (!(node instanceof Element) || !activePseudoVideo) continue;
                    if (node === activePseudoVideo || node.contains(activePseudoVideo)) {
                        exitPseudoFullscreen(activePseudoVideo, false);
                    }
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
