import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputCpuTouchScrub";
const STYLE_ID = "cig-output-cpu-touch-scrub-style";
const LOCK_PX = 12;
const DIRECTION_RATIO = 1.15;
const CLICK_SUPPRESS_MS = 550;

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

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.ovg-cpu-hit{touch-action:pan-y pinch-zoom!important}
.cig-touch-scrub-hud{
    position:absolute;left:50%;top:50%;z-index:2147483646;
    transform:translate(-50%,-50%);pointer-events:none;
    padding:9px 13px;border-radius:8px;background:rgba(0,0,0,.72);
    color:#fff;font:700 14px/1.2 Arial,sans-serif;white-space:nowrap;
    box-shadow:0 4px 18px rgba(0,0,0,.35);backdrop-filter:blur(4px)
}
`;
    document.head.appendChild(style);
}

function hudHost(target) {
    return target.closest?.(".ovg-cpu-player") || target.parentElement;
}

function showHud(target, text) {
    const host = hudHost(target);
    if (!(host instanceof HTMLElement)) return;
    let hud = host.querySelector(":scope > .cig-touch-scrub-hud");
    if (!(hud instanceof HTMLElement)) {
        hud = document.createElement("div");
        hud.className = "cig-touch-scrub-hud";
        host.appendChild(hud);
    }
    hud.textContent = text;
}

function hideHud(target) {
    hudHost(target)?.querySelector?.(":scope > .cig-touch-scrub-hud")?.remove();
}

function cpuInfo(hit) {
    const player = hit.closest(".ovg-cpu-player");
    const seek = player?.querySelector?.(".ovg-cpu-seek");
    if (!(seek instanceof HTMLInputElement)) return null;
    const duration = Number(seek.max);
    const current = Number(seek.value);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(current)) return null;
    return {
        duration,
        current,
        seek(value) {
            const at = clamp(value, 0, duration);
            seek.value = String(at);
            seek.dispatchEvent(new Event("input", { bubbles:true }));
            seek.dispatchEvent(new Event("change", { bubbles:true }));
        },
    };
}

function targetForSwipe(startTime, duration, dx, width, elapsedMs) {
    const w = Math.max(120, Number(width) || 1);
    const ratio = dx / w;
    const span = clamp(duration * 0.35, 12, 90);
    const velocity = Math.abs(dx) / Math.max(70, elapsedMs || 0);
    const momentum = clamp(1 + velocity * 0.9, 1, 2.5);
    const curved = Math.sign(ratio) * Math.pow(Math.abs(ratio), 0.92);
    const delta = curved * span * momentum;
    return clamp(startTime + delta, 0, duration);
}

function attach(target) {
    if (!(target instanceof HTMLElement) || attached.has(target)) return;
    attached.add(target);

    let gesture = null;
    let suppressClickUntil = 0;

    target.addEventListener("pointerdown", event => {
        if (event.pointerType !== "touch" || !event.isPrimary) return;
        const info = cpuInfo(target);
        if (!info) return;

        gesture = {
            id:event.pointerId,
            startX:event.clientX,
            startY:event.clientY,
            startedAt:performance.now(),
            startTime:info.current,
            duration:info.duration,
            targetTime:info.current,
            locked:false,
            cancelled:false,
        };
    }, { passive:true });

    target.addEventListener("pointermove", event => {
        const g = gesture;
        if (!g || event.pointerId !== g.id || g.cancelled) return;

        const dx = event.clientX - g.startX;
        const dy = event.clientY - g.startY;
        const ax = Math.abs(dx), ay = Math.abs(dy);

        if (!g.locked) {
            if (Math.max(ax, ay) < LOCK_PX) return;
            if (ay > ax * DIRECTION_RATIO) {
                g.cancelled = true;
                hideHud(target);
                return;
            }
            if (ax <= ay * DIRECTION_RATIO) return;
            g.locked = true;
            try { target.setPointerCapture?.(event.pointerId); } catch (_) {}
        }

        if (!g.locked) return;
        event.preventDefault();
        event.stopPropagation();

        const elapsed = performance.now() - g.startedAt;
        const width = target.getBoundingClientRect().width;
        g.targetTime = targetForSwipe(g.startTime, g.duration, dx, width, elapsed);
        const signed = g.targetTime - g.startTime;
        const sign = signed > .05 ? "+" : signed < -.05 ? "−" : "";
        showHud(target, `${sign}${Math.abs(signed).toFixed(Math.abs(signed) < 10 ? 1 : 0)} с   ${fmtTime(g.targetTime)} / ${fmtTime(g.duration)}`);
    }, { passive:false });

    const finish = (event, cancelled = false) => {
        const g = gesture;
        if (!g || event.pointerId !== g.id) return;
        gesture = null;
        hideHud(target);
        try { target.releasePointerCapture?.(event.pointerId); } catch (_) {}

        if (!g.locked || g.cancelled || cancelled) return;
        event.preventDefault();
        event.stopPropagation();

        const dx = event.clientX - g.startX;
        const elapsed = performance.now() - g.startedAt;
        const width = target.getBoundingClientRect().width;
        g.targetTime = targetForSwipe(g.startTime, g.duration, dx, width, elapsed);

        suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
        cpuInfo(target)?.seek(g.targetTime);
    };

    target.addEventListener("pointerup", event => finish(event, false), { passive:false });
    target.addEventListener("pointercancel", event => finish(event, true), { passive:false });

    target.addEventListener("click", event => {
        if (Date.now() >= suppressClickUntil) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
}

function scan(root) {
    if (!(root instanceof Element)) return;
    if (root.classList.contains("ovg-cpu-hit")) attach(root);
    root.querySelectorAll?.(".ovg-cpu-hit").forEach(attach);
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
        ensureStyles();
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
