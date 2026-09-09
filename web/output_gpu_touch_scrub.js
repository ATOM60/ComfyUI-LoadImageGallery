import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputGpuTouchScrub";
const LOCK_PX = 14;
const DIRECTION_RATIO = 1.2;
const CLICK_SUPPRESS_MS = 650;
const DOUBLE_TAP_MS = 340;
const DOUBLE_TAP_DISTANCE = 52;

const attached = new WeakSet();
const modalObservers = new WeakMap();

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

function isPictureArea(video, point) {
    const rect = video.getBoundingClientRect();
    const localY = point.clientY - rect.top;
    const nativeControlsHeight = isFullscreenVideo(video) ? 72 : 52;
    return localY < rect.height - nativeControlsHeight;
}

function targetForSwipe(startTime, duration, dx, width, elapsedMs) {
    const w = Math.max(120, Number(width) || 1);
    const ratio = dx / w;
    const span = clamp(duration * 0.35, 12, 90);
    const velocity = Math.abs(dx) / Math.max(70, elapsedMs || 0);
    const momentum = clamp(1 + velocity * 0.9, 1, 2.5);
    const curved = Math.sign(ratio) * Math.pow(Math.abs(ratio), 0.92);
    return clamp(startTime + curved * span * momentum, 0, duration);
}

function hudHost(video) {
    return video.closest(".ovg-thumb") || video.parentElement;
}

function showHud(video, text) {
    const host = hudHost(video);
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

function hideHud(video) {
    hudHost(video)?.querySelector?.(":scope > .cig-gpu-touch-hud")?.remove();
}

function exitFullscreenAndPause(video) {
    try { video.pause(); } catch (_) {}
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
    try { video.webkitExitFullscreen?.(); } catch (_) {}
}

function attach(video) {
    if (!(video instanceof HTMLVideoElement) || attached.has(video)) return;
    attached.add(video);

    let gesture = null;
    let suppressClickUntil = 0;
    let lastTap = null;
    let singleTapTimer = 0;

    video.addEventListener("touchstart", event => {
        if (event.touches.length !== 1) return;
        const point = event.touches[0];
        if (!isPictureArea(video, point)) return;

        const duration = Number(video.duration);
        const current = Number(video.currentTime);
        gesture = {
            startX:point.clientX,
            startY:point.clientY,
            startedAt:performance.now(),
            startTime:Number.isFinite(current) ? current : 0,
            duration:Number.isFinite(duration) && duration > 0 ? duration : 0,
            targetTime:Number.isFinite(current) ? current : 0,
            locked:false,
            cancelled:false,
        };
    }, { passive:true });

    video.addEventListener("touchmove", event => {
        const g = gesture;
        if (!g || g.cancelled || event.touches.length !== 1 || g.duration <= 0) return;
        const point = event.touches[0];
        const dx = point.clientX - g.startX;
        const dy = point.clientY - g.startY;
        const ax = Math.abs(dx), ay = Math.abs(dy);

        if (!g.locked) {
            if (Math.max(ax, ay) < LOCK_PX) return;
            if (ay > ax * DIRECTION_RATIO) {
                g.cancelled = true;
                hideHud(video);
                return;
            }
            if (ax <= ay * DIRECTION_RATIO) return;
            g.locked = true;
        }

        if (!g.locked) return;
        event.preventDefault();
        event.stopPropagation();

        const elapsed = performance.now() - g.startedAt;
        g.targetTime = targetForSwipe(g.startTime, g.duration, dx, video.getBoundingClientRect().width, elapsed);
        const signed = g.targetTime - g.startTime;
        const sign = signed > .05 ? "+" : signed < -.05 ? "−" : "";
        showHud(video, `${sign}${Math.abs(signed).toFixed(Math.abs(signed) < 10 ? 1 : 0)} с   ${fmtTime(g.targetTime)} / ${fmtTime(g.duration)}`);
    }, { passive:false });

    video.addEventListener("touchend", event => {
        const g = gesture;
        gesture = null;
        hideHud(video);
        if (!g) return;

        const point = event.changedTouches?.[0];

        if (g.locked && !g.cancelled && g.duration > 0) {
            if (point) {
                const dx = point.clientX - g.startX;
                const elapsed = performance.now() - g.startedAt;
                g.targetTime = targetForSwipe(g.startTime, g.duration, dx, video.getBoundingClientRect().width, elapsed);
            }
            event.preventDefault();
            event.stopPropagation();
            suppressClickUntil = performance.now() + CLICK_SUPPRESS_MS;
            try { video.currentTime = g.targetTime; } catch (_) {}
            return;
        }

        if (g.cancelled || !point || !isFullscreenVideo(video)) return;

        const dx = point.clientX - g.startX;
        const dy = point.clientY - g.startY;
        if (Math.hypot(dx, dy) > LOCK_PX) return;

        // In fullscreen, handle touch taps directly. This makes double-tap exit
        // deterministic even on touchscreens where the browser does not emit a
        // reliable click with detail=2.
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil = performance.now() + CLICK_SUPPRESS_MS;

        const now = performance.now();
        if (lastTap && now - lastTap.time <= DOUBLE_TAP_MS && Math.hypot(point.clientX - lastTap.x, point.clientY - lastTap.y) <= DOUBLE_TAP_DISTANCE) {
            if (singleTapTimer) clearTimeout(singleTapTimer);
            singleTapTimer = 0;
            lastTap = null;
            exitFullscreenAndPause(video);
            return;
        }

        lastTap = { time:now, x:point.clientX, y:point.clientY };
        if (singleTapTimer) clearTimeout(singleTapTimer);
        singleTapTimer = setTimeout(() => {
            singleTapTimer = 0;
            lastTap = null;
            if (!video.isConnected || !isFullscreenVideo(video)) return;
            try {
                if (video.paused) video.play()?.catch?.(() => {});
                else video.pause();
            } catch (_) {}
        }, DOUBLE_TAP_MS);
    }, { passive:false });

    video.addEventListener("touchcancel", () => {
        gesture = null;
        hideHud(video);
    }, { passive:true });

    // Suppress only the synthetic click generated after a completed swipe or a
    // fullscreen touch tap handled above. Mouse clicks and normal non-fullscreen
    // taps continue through the proven OutputDirectGestures implementation.
    video.addEventListener("click", event => {
        if (performance.now() >= suppressClickUntil) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
}

function scan(root) {
    if (!(root instanceof Element)) return;
    if (root instanceof HTMLVideoElement && root.classList.contains("ovg-inline-video")) attach(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(attach);
}

function installModal(modal) {
    if (!(modal instanceof HTMLElement) || modalObservers.has(modal)) return;
    scan(modal);
    const observer = new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node instanceof Element) scan(node);
            }
        }
    });
    observer.observe(modal, { childList:true, subtree:true });
    modalObservers.set(modal, observer);
}

function uninstallModal(modal) {
    modalObservers.get(modal)?.disconnect();
    modalObservers.delete(modal);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        document.querySelectorAll(".ovg-modal").forEach(installModal);
        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof HTMLElement && node.classList.contains("ovg-modal")) installModal(node);
                }
                for (const node of record.removedNodes) {
                    if (node instanceof HTMLElement && node.classList.contains("ovg-modal")) uninstallModal(node);
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:false });
    },
});
