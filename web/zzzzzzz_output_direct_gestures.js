import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputDirectGestures";
const CLICK_DELAY_MS = 300;
const TOUCH_LOCK_PX = 14;
const TOUCH_DIRECTION_RATIO = 1.2;
const TOUCH_CLICK_SUPPRESS_MS = 650;
const clickTimers = new WeakMap();
const modalObservers = new WeakMap();
const touchSuppressUntil = new WeakMap();

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

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function isFullscreenVideo(video) {
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
        for (const el of control.querySelectorAll(".ovg-player-control-button,.ovg-speed-panel,.ovg-speed-slider")) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
        }
    }
    return false;
}

function clearSingle(target) {
    const timer = clickTimers.get(target);
    if (timer) clearTimeout(timer);
    clickTimers.delete(target);
}

function playerForThumb(thumb) {
    return thumb?.querySelector?.("video.ovg-inline-video") || null;
}

function createPlayerNow(thumb) {
    const existing = playerForThumb(thumb);
    if (existing) return existing;

    const playButton = thumb?.querySelector?.(".ovg-play");
    if (!playButton) return null;

    // The gallery inserts the video before its first await, so click() gives us
    // the video synchronously while the browser still considers this a user gesture.
    playButton.click();
    return playerForThumb(thumb);
}

function play(video) {
    if (!video) return;
    try {
        const p = video.play();
        p?.catch?.(() => {});
    } catch (_) {}
}

function togglePlayback(thumb) {
    let video = playerForThumb(thumb);
    if (!video) {
        video = createPlayerNow(thumb);
        play(video);
        queueMicrotask(() => { if (video?.isConnected && video.paused) play(video); });
        return;
    }
    if (video.paused) play(video);
    else video.pause();
}

function enterFullscreen(video) {
    if (!video) return;
    play(video);

    try {
        if (video.requestFullscreen) {
            const p = video.requestFullscreen();
            p?.catch?.(() => {});
            return;
        }
    } catch (_) {}

    try {
        if (video.webkitRequestFullscreen) {
            video.webkitRequestFullscreen();
            return;
        }
    } catch (_) {}

    try { video.webkitEnterFullscreen?.(); } catch (_) {}
}

function exitFullscreenAndPause(video) {
    try { video?.pause?.(); } catch (_) {}

    const fs = fullscreenElement();
    if (fs) {
        try {
            if (document.exitFullscreen) {
                const p = document.exitFullscreen();
                p?.catch?.(() => {});
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

    try { video?.webkitExitFullscreen?.(); } catch (_) {}
}

function toggleFullscreen(thumb) {
    let video = playerForThumb(thumb);
    if (video && isFullscreenVideo(video)) {
        exitFullscreenAndPause(video);
        return;
    }

    if (!video) video = createPlayerNow(thumb);
    enterFullscreen(video);
}

function suppressTouchClick(video, thumb) {
    const until = performance.now() + TOUCH_CLICK_SUPPRESS_MS;
    touchSuppressUntil.set(video, until);
    if (thumb) touchSuppressUntil.set(thumb, until);
}

function isTouchClickSuppressed(targetKey, thumb) {
    const now = performance.now();
    return (touchSuppressUntil.get(targetKey) || 0) > now || (touchSuppressUntil.get(thumb) || 0) > now;
}

function handleClick(targetKey, thumb, event) {
    if (isTouchClickSuppressed(targetKey, thumb)) {
        clearSingle(targetKey);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
    }
    if (isOverCustomControls(event)) return;
    if (event.target instanceof HTMLVideoElement && !isPictureArea(event.target, event)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.detail >= 2) {
        clearSingle(targetKey);
        toggleFullscreen(thumb);
        return;
    }

    clearSingle(targetKey);
    const timer = setTimeout(() => {
        clickTimers.delete(targetKey);
        if (!thumb.isConnected) return;
        togglePlayback(thumb);
    }, CLICK_DELAY_MS);
    clickTimers.set(targetKey, timer);
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

function touchHud(video, text) {
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
    video.closest(".ovg-thumb")?.querySelector?.(":scope > .cig-gpu-touch-hud")?.remove();
}

function attachTouchSeek(video) {
    let gesture = null;

    video.addEventListener("touchstart", event => {
        if (event.touches.length !== 1) return;
        const point = event.touches[0];
        if (!isPictureArea(video, point)) return;

        const duration = Number(video.duration);
        const current = Number(video.currentTime);
        if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(current)) return;

        gesture = {
            startX:point.clientX,
            startY:point.clientY,
            startedAt:performance.now(),
            startTime:current,
            duration,
            targetTime:current,
            locked:false,
            cancelled:false,
        };
    }, { passive:true });

    video.addEventListener("touchmove", event => {
        const g = gesture;
        if (!g || g.cancelled || event.touches.length !== 1) return;
        const point = event.touches[0];
        const dx = point.clientX - g.startX;
        const dy = point.clientY - g.startY;
        const ax = Math.abs(dx), ay = Math.abs(dy);

        if (!g.locked) {
            if (Math.max(ax, ay) < TOUCH_LOCK_PX) return;
            if (ay > ax * TOUCH_DIRECTION_RATIO) {
                g.cancelled = true;
                hideTouchHud(video);
                return;
            }
            if (ax <= ay * TOUCH_DIRECTION_RATIO) return;
            g.locked = true;
        }

        if (!g.locked) return;
        event.preventDefault();
        event.stopPropagation();

        const elapsed = performance.now() - g.startedAt;
        g.targetTime = targetForTouchSwipe(g.startTime, g.duration, dx, video.getBoundingClientRect().width, elapsed);
        const signed = g.targetTime - g.startTime;
        const sign = signed > .05 ? "+" : signed < -.05 ? "−" : "";
        touchHud(video, `${sign}${Math.abs(signed).toFixed(Math.abs(signed) < 10 ? 1 : 0)} с   ${fmtTime(g.targetTime)} / ${fmtTime(g.duration)}`);
    }, { passive:false });

    video.addEventListener("touchend", event => {
        const g = gesture;
        gesture = null;
        hideTouchHud(video);
        if (!g || !g.locked || g.cancelled) return;

        const point = event.changedTouches?.[0];
        if (point) {
            const dx = point.clientX - g.startX;
            const elapsed = performance.now() - g.startedAt;
            g.targetTime = targetForTouchSwipe(g.startTime, g.duration, dx, video.getBoundingClientRect().width, elapsed);
        }

        event.preventDefault();
        event.stopPropagation();
        const thumb = video.closest(".ovg-thumb");
        suppressTouchClick(video, thumb);
        clearSingle(video);
        try { video.currentTime = g.targetTime; } catch (_) {}
    }, { passive:false });

    video.addEventListener("touchcancel", () => {
        gesture = null;
        hideTouchHud(video);
    }, { passive:true });
}

function attachVideo(video) {
    if (!(video instanceof HTMLVideoElement) || video.dataset.cigDirectGestures === "1") return;
    video.dataset.cigDirectGestures = "1";

    attachTouchSeek(video);

    video.addEventListener("click", event => {
        const thumb = video.closest(".ovg-thumb");
        if (!thumb) return;
        handleClick(video, thumb, event);
    }, true);

    // The second click already performed the fullscreen action above. Suppress
    // the browser/native dblclick action so it cannot undo our result.
    video.addEventListener("dblclick", event => {
        if (!isPictureArea(video, event) || isOverCustomControls(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
}

function attachThumb(thumb) {
    if (!(thumb instanceof HTMLElement) || thumb.dataset.cigDirectGestures === "1") return;
    thumb.dataset.cigDirectGestures = "1";

    thumb.addEventListener("click", event => {
        if (event.target instanceof HTMLVideoElement) return;
        if (event.target.closest?.("button")) return;
        handleClick(thumb, thumb, event);
    }, true);

    thumb.addEventListener("dblclick", event => {
        if (event.target instanceof HTMLVideoElement) return;
        if (event.target.closest?.("button")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);

    thumb.querySelectorAll("video.ovg-inline-video").forEach(attachVideo);
}

function protectContextMenu(menu) {
    if (!(menu instanceof HTMLElement) || menu.dataset.cigContextMenuProtected === "1") return;
    menu.dataset.cigContextMenuProtected = "1";

    // output_video_gallery.js closes the menu on the next document pointerdown.
    // Stop pointerdown inside the menu from bubbling to that outside-click handler,
    // otherwise the menu is removed before its button's click event can fire.
    menu.addEventListener("pointerdown", event => {
        event.stopPropagation();
    });
}

function scanGallery(root) {
    if (!(root instanceof Element)) return;
    if (root.classList.contains("ovg-thumb")) attachThumb(root);
    if (root instanceof HTMLVideoElement && root.classList.contains("ovg-inline-video")) attachVideo(root);
    root.querySelectorAll?.(".ovg-thumb").forEach(attachThumb);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(attachVideo);
}

function installModal(modal) {
    if (!(modal instanceof HTMLElement) || modalObservers.has(modal)) return;
    scanGallery(modal);
    const observer = new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node instanceof Element) scanGallery(node);
            }
        }
    });
    observer.observe(modal, { childList:true, subtree:true });
    modalObservers.set(modal, observer);
}

function uninstallModal(modal) {
    const observer = modalObservers.get(modal);
    observer?.disconnect();
    modalObservers.delete(modal);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.querySelectorAll(".ovg-modal").forEach(installModal);
        document.querySelectorAll(".ovg-menu").forEach(protectContextMenu);

        // Only watch direct body children. The heavy subtree observer is attached
        // locally to an output gallery while that gallery is actually open.
        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.classList.contains("ovg-modal")) installModal(node);
                    if (node.classList.contains("ovg-menu")) protectContextMenu(node);
                }
                for (const node of record.removedNodes) {
                    if (node instanceof HTMLElement && node.classList.contains("ovg-modal")) uninstallModal(node);
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
