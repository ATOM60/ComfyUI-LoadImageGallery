import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputGpuTouchScrubLite";
const STYLE_ID = "cig-output-gpu-touch-scrub-lite-style";
const LANG_KEY = "ComfyUI-LoadImageGallery.language";
const LOCK_PX = 12;
const DIRECTION_RATIO = 1.15;
const CLICK_SUPPRESS_MS = 550;
const FULLSCREEN_CONTROLS_SAFE_ZONE = 90;

const RU = String(localStorage.getItem(LANG_KEY) || navigator.language || "en")
    .toLowerCase().startsWith("ru");
const SECOND_UNIT = RU ? "с" : "s";

let activeGesture = null;

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

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.ovg-gpu-hit,.cig-native-fs-shell[data-cig-native-shell="1"]{touch-action:pan-y pinch-zoom!important}
.cig-gpu-touch-scrub-hud{
    position:absolute;left:50%;top:50%;z-index:2147483646;
    transform:translate(-50%,-50%);pointer-events:none;
    padding:9px 13px;border-radius:8px;background:rgba(0,0,0,.74);
    color:#fff;font:700 14px/1.2 Arial,sans-serif;white-space:nowrap
}
`;
    document.head.appendChild(style);
}

function gestureTargetFromEvent(event) {
    if (!(event.target instanceof Element)) return null;
    return event.target.closest(
        '.ovg-gpu-hit,.cig-native-fs-shell[data-cig-native-shell="1"]'
    );
}

function videoForTarget(target) {
    if (!(target instanceof HTMLElement)) return null;
    if (target.classList.contains("ovg-gpu-hit")) {
        const video = target.closest(".ovg-gpu-player")?.querySelector("video.ovg-inline-video");
        return video instanceof HTMLVideoElement ? video : null;
    }
    if (target.classList.contains("cig-native-fs-shell")) {
        const video = target.querySelector("video.ovg-inline-video");
        return video instanceof HTMLVideoElement ? video : null;
    }
    return null;
}

function hudHost(target) {
    if (target.classList.contains("cig-native-fs-shell")) return target;
    return target.closest(".ovg-gpu-player") || target.parentElement;
}

function showHud(target, text) {
    const host = hudHost(target);
    if (!(host instanceof HTMLElement)) return;
    let hud = host.querySelector(":scope > .cig-gpu-touch-scrub-hud");
    if (!(hud instanceof HTMLElement)) {
        hud = document.createElement("div");
        hud.className = "cig-gpu-touch-scrub-hud";
        host.appendChild(hud);
    }
    hud.textContent = text;
}

function hideHud(target) {
    hudHost(target)?.querySelector?.(":scope > .cig-gpu-touch-scrub-hud")?.remove();
}

function playerInfo(target) {
    const video = videoForTarget(target);
    if (!(video instanceof HTMLVideoElement)) return null;
    const duration = Number(video.duration);
    const current = Number(video.currentTime);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(current)) return null;
    return { video, duration, current };
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

function suppressNextClick(target) {
    if (!(target instanceof HTMLElement)) return;
    let done = false;
    const handler = event => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        target.removeEventListener("click", handler, true);
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    const timer = setTimeout(() => {
        if (done) return;
        done = true;
        target.removeEventListener("click", handler, true);
    }, CLICK_SUPPRESS_MS);
    target.addEventListener("click", handler, true);
}

function stopActiveGesture({ commit = false, event = null } = {}) {
    const g = activeGesture;
    if (!g) return;
    activeGesture = null;

    document.removeEventListener("pointermove", g.onMove, true);
    document.removeEventListener("pointerup", g.onUp, true);
    document.removeEventListener("pointercancel", g.onCancel, true);
    hideHud(g.target);

    if (!commit || !g.locked || g.cancelled) return;

    const dx = Number(event?.clientX ?? g.lastX) - g.startX;
    const elapsed = performance.now() - g.startedAt;
    const width = g.target.getBoundingClientRect().width;
    const targetTime = targetForSwipe(g.startTime, g.duration, dx, width, elapsed);

    try { g.video.currentTime = targetTime; } catch (_) {}
    suppressNextClick(g.target);

    event?.preventDefault?.();
    event?.stopPropagation?.();
}

function startGesture(event, target, info) {
    const g = {
        id: event.pointerId,
        target,
        video: info.video,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        startedAt: performance.now(),
        startTime: info.current,
        duration: info.duration,
        targetTime: info.current,
        locked: false,
        cancelled: false,
        onMove: null,
        onUp: null,
        onCancel: null,
    };

    g.onMove = moveEvent => {
        if (activeGesture !== g || moveEvent.pointerId !== g.id || g.cancelled) return;
        g.lastX = moveEvent.clientX;

        const dx = moveEvent.clientX - g.startX;
        const dy = moveEvent.clientY - g.startY;
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);

        if (!g.locked) {
            if (Math.max(ax, ay) < LOCK_PX) return;
            if (ay > ax * DIRECTION_RATIO) {
                g.cancelled = true;
                stopActiveGesture({ commit:false });
                return;
            }
            if (ax <= ay * DIRECTION_RATIO) return;
            g.locked = true;
        }

        moveEvent.preventDefault();
        moveEvent.stopPropagation();

        const elapsed = performance.now() - g.startedAt;
        const width = g.target.getBoundingClientRect().width;
        g.targetTime = targetForSwipe(g.startTime, g.duration, dx, width, elapsed);
        const signed = g.targetTime - g.startTime;
        const sign = signed > .05 ? "+" : signed < -.05 ? "−" : "";
        showHud(
            g.target,
            `${sign}${Math.abs(signed).toFixed(Math.abs(signed) < 10 ? 1 : 0)} ${SECOND_UNIT}   ${fmtTime(g.targetTime)} / ${fmtTime(g.duration)}`
        );
    };

    g.onUp = upEvent => {
        if (upEvent.pointerId !== g.id) return;
        stopActiveGesture({ commit:true, event:upEvent });
    };

    g.onCancel = cancelEvent => {
        if (cancelEvent.pointerId !== g.id) return;
        stopActiveGesture({ commit:false, event:cancelEvent });
    };

    activeGesture = g;
    document.addEventListener("pointermove", g.onMove, { capture:true, passive:false });
    document.addEventListener("pointerup", g.onUp, { capture:true, passive:false });
    document.addEventListener("pointercancel", g.onCancel, { capture:true, passive:false });
}

function onPointerDown(event) {
    if (activeGesture) return;
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    if (event.target instanceof Element && event.target.closest("button,input")) return;

    const target = gestureTargetFromEvent(event);
    if (!(target instanceof HTMLElement)) return;

    if (target.classList.contains("cig-native-fs-shell")) {
        const rect = target.getBoundingClientRect();
        if (event.clientY >= rect.bottom - FULLSCREEN_CONTROLS_SAFE_ZONE) return;
    }

    const info = playerInfo(target);
    if (!info) return;
    startGesture(event, target, info);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        document.addEventListener("pointerdown", onPointerDown, { capture:true, passive:true });
    },
});
