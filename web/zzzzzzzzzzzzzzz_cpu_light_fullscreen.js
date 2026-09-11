import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.CpuLightFullscreen";
const STYLE_ID = "cig-cpu-light-fullscreen-style";
const UI_HIDE_DELAY = 1800;
const CLICK_DELAY = 260;

const sessions = new WeakMap();

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function clamp(value, min, max, fallback = min) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function isCpuPlayer(element) {
    return element instanceof HTMLElement && (
        element.classList.contains("ovg-cpu-player") ||
        (element.classList.contains("ovg-shared-player") && element.dataset.ovgDecoder === "CPU")
    );
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cig-cpu-fs-shell.ovg-shared-player{
    position:relative!important;inset:auto!important;width:100vw!important;height:100vh!important;
    max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;
    border:0!important;border-radius:0!important;background:#000!important;overflow:hidden!important;
    z-index:2147483646!important;container-type:normal!important
}
.cig-cpu-fs-shell>.ovg-shared-surface{
    position:absolute!important;inset:0!important;width:100%!important;height:100%!important;
    display:block!important;background:#000!important;border:0!important;border-radius:0!important;
    pointer-events:none!important;object-fit:contain!important
}
.cig-cpu-fs-hit{position:absolute!important;inset:0!important;z-index:2!important;width:100%!important;height:100%!important;padding:0!important;margin:0!important;border:0!important;background:transparent!important;cursor:pointer!important;touch-action:pan-y pinch-zoom!important}
.cig-cpu-fs-badge{position:absolute;left:12px;top:10px;z-index:4;padding:3px 6px;border-radius:5px;background:rgba(0,0,0,.62);color:#d6e8ff;font:700 10px/1.2 Arial,sans-serif;pointer-events:none;letter-spacing:.3px}
.cig-cpu-fs-paused{position:absolute;left:50%;top:50%;z-index:4;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.58);color:#fff;font-size:23px;pointer-events:none}
.cig-cpu-fs-shell.paused .cig-cpu-fs-paused{display:flex}
.cig-cpu-fs-bottom{position:absolute;left:0;right:0;bottom:0;z-index:12;padding:24px 14px 9px;box-sizing:border-box;background:linear-gradient(to top,rgba(0,0,0,.88) 0%,rgba(0,0,0,.55) 58%,transparent 100%);color:#fff;font:12px Arial,sans-serif;opacity:1;pointer-events:auto}
.cig-cpu-fs-seek{display:block!important;width:100%!important;height:12px!important;margin:0 0 2px!important;writing-mode:horizontal-tb!important;direction:ltr!important;accent-color:#fff!important;cursor:pointer!important}
.cig-cpu-fs-row{display:flex;align-items:center;gap:6px;height:30px;min-width:0}
.cig-cpu-fs-row button{width:30px;height:30px;min-width:30px;padding:0;border:0;border-radius:4px;background:transparent;color:#fff;font:16px/30px "Segoe UI Symbol",Arial,sans-serif;cursor:pointer}
.cig-cpu-fs-row button:hover{background:rgba(255,255,255,.15)}
.cig-cpu-fs-time{white-space:nowrap;opacity:.92;font-variant-numeric:tabular-nums}
.cig-cpu-fs-spacer{flex:1 1 auto;min-width:2px}
.cig-cpu-fs-volume{width:100px!important;max-width:120px!important;min-width:46px!important;height:auto!important;margin:0!important;writing-mode:horizontal-tb!important;direction:ltr!important;accent-color:#fff!important;cursor:pointer!important}
.cig-cpu-fs-side{position:absolute;right:28px;top:50%;z-index:14;transform:translateY(-50%);display:flex;flex-direction:column;gap:8px;align-items:center;opacity:1;pointer-events:auto}
.cig-cpu-fs-side button{width:44px;height:44px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(20,20,20,.72);color:#fff;font:18px/42px Arial,sans-serif;padding:0;cursor:pointer}
.cig-cpu-fs-side button:hover{background:rgba(45,45,45,.86)}
.cig-cpu-fs-speed-wrap{position:relative}
.cig-cpu-fs-speed-panel{display:none;position:absolute;right:54px;top:50%;transform:translateY(-50%);padding:10px 12px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(20,20,20,.86);white-space:nowrap;color:#fff;font:12px Arial,sans-serif;align-items:center;gap:8px}
.cig-cpu-fs-speed-panel.open{display:flex!important}
.cig-cpu-fs-speed-range{width:150px!important;height:auto!important;margin:0!important;writing-mode:horizontal-tb!important;direction:ltr!important;accent-color:#79adff!important;cursor:pointer!important}
.cig-cpu-fs-speed-value{min-width:48px;text-align:center;font-variant-numeric:tabular-nums}
.cig-cpu-fs-shell.cig-cpu-fs-ui-hidden:not(.paused) .cig-cpu-fs-bottom,
.cig-cpu-fs-shell.cig-cpu-fs-ui-hidden:not(.paused) .cig-cpu-fs-side,
.cig-cpu-fs-shell.cig-cpu-fs-ui-hidden:not(.paused) .cig-cpu-fs-badge{opacity:0!important;pointer-events:none!important}
.cig-cpu-fs-shell.cig-cpu-fs-ui-hidden:not(.paused) .cig-cpu-fs-hit{cursor:none!important}
`;
    document.head.appendChild(style);
}

function sourceUi(player) {
    return {
        hit: player.querySelector(".ovg-shared-hit"),
        play: player.querySelector(".ovg-shared-ui-play"),
        seek: player.querySelector(".ovg-shared-seek"),
        time: player.querySelector(".ovg-shared-time"),
        volume: player.querySelector(".ovg-shared-volume"),
        fullscreen: player.querySelector(".ovg-shared-ui-fullscreen"),
        prev: player.querySelector(".ovg-shared-prev"),
        next: player.querySelector(".ovg-shared-next"),
        speed: player.querySelector(".ovg-shared-speed"),
        speedRange: player.querySelector(".ovg-shared-speed-range"),
        speedValue: player.querySelector(".ovg-shared-speed-value"),
    };
}

function uiReady(ui) {
    return ui.play instanceof HTMLElement &&
        ui.seek instanceof HTMLInputElement &&
        ui.time instanceof HTMLElement &&
        ui.volume instanceof HTMLInputElement &&
        ui.prev instanceof HTMLElement &&
        ui.next instanceof HTMLElement &&
        ui.speedRange instanceof HTMLInputElement;
}

function buildShell(player, canvas) {
    const shell = document.createElement("div");
    shell.className = "cig-cpu-fs-shell ovg-shared-player";
    shell.dataset.ovgDecoder = "CPU-FS";
    shell.dataset.cigCpuLightFullscreen = "1";
    shell.insertAdjacentHTML("beforeend", `
        <button class="cig-cpu-fs-hit ovg-shared-hit" type="button"></button>
        <div class="cig-cpu-fs-badge">CPU</div>
        <div class="cig-cpu-fs-paused">▶</div>
        <div class="cig-cpu-fs-bottom">
            <input class="cig-cpu-fs-seek ovg-shared-seek" type="range" min="0" max="1" step="0.01">
            <div class="cig-cpu-fs-row">
                <button class="cig-cpu-fs-play" type="button">▶</button>
                <span class="cig-cpu-fs-time">0:00 / 0:00</span>
                <span class="cig-cpu-fs-spacer"></span>
                <span>🔊</span>
                <input class="cig-cpu-fs-volume" type="range" min="0" max="1" step="0.05">
                <button class="cig-cpu-fs-exit" type="button">⤢</button>
            </div>
        </div>
        <div class="cig-cpu-fs-side">
            <button class="cig-cpu-fs-prev" type="button">⏮</button>
            <div class="cig-cpu-fs-speed-wrap">
                <button class="cig-cpu-fs-speed" type="button">⏱</button>
                <div class="cig-cpu-fs-speed-panel">
                    <input class="cig-cpu-fs-speed-range" type="range" min="0.25" max="3" step="0.05">
                    <span class="cig-cpu-fs-speed-value"></span>
                </div>
            </div>
            <button class="cig-cpu-fs-next" type="button">⏭</button>
        </div>
    `);
    shell.insertBefore(canvas, shell.firstChild);
    return shell;
}

function shellUi(shell) {
    return {
        hit: shell.querySelector(".cig-cpu-fs-hit"),
        play: shell.querySelector(".cig-cpu-fs-play"),
        seek: shell.querySelector(".cig-cpu-fs-seek"),
        time: shell.querySelector(".cig-cpu-fs-time"),
        volume: shell.querySelector(".cig-cpu-fs-volume"),
        exit: shell.querySelector(".cig-cpu-fs-exit"),
        prev: shell.querySelector(".cig-cpu-fs-prev"),
        next: shell.querySelector(".cig-cpu-fs-next"),
        speed: shell.querySelector(".cig-cpu-fs-speed"),
        speedPanel: shell.querySelector(".cig-cpu-fs-speed-panel"),
        speedRange: shell.querySelector(".cig-cpu-fs-speed-range"),
        speedValue: shell.querySelector(".cig-cpu-fs-speed-value"),
        seeking: false,
        rateEditing: false,
    };
}

function clearHideTimer(session) {
    if (!session.hideTimer) return;
    clearTimeout(session.hideTimer);
    session.hideTimer = 0;
}

function keepUiVisible(session) {
    clearHideTimer(session);
    session.shell.classList.remove("cig-cpu-fs-ui-hidden");
}

function isPaused(session) {
    return session.player.classList.contains("paused");
}

function scheduleHide(session) {
    keepUiVisible(session);
    if (fullscreenElement() !== session.shell) return;
    if (isPaused(session)) return;
    if (session.ui.seeking || session.ui.rateEditing || session.ui.speedPanel.classList.contains("open")) return;
    session.hideTimer = setTimeout(() => {
        session.hideTimer = 0;
        if (fullscreenElement() !== session.shell) return;
        if (isPaused(session)) return;
        if (session.ui.seeking || session.ui.rateEditing || session.ui.speedPanel.classList.contains("open")) return;
        session.shell.classList.add("cig-cpu-fs-ui-hidden");
    }, UI_HIDE_DELAY);
}

function syncUi(session) {
    if (!session.shell.isConnected) return;
    const paused = isPaused(session);
    session.shell.classList.toggle("paused", paused);
    session.ui.play.textContent = paused ? "▶" : "❚❚";

    if (!session.ui.seeking) {
        session.ui.seek.min = session.source.seek.min || "0";
        session.ui.seek.max = session.source.seek.max || "1";
        session.ui.seek.step = session.source.seek.step || "0.01";
        session.ui.seek.value = session.source.seek.value || "0";
    }
    session.ui.time.textContent = session.source.time.textContent || "0:00 / 0:00";
    session.ui.volume.value = session.source.volume.value || "1";

    if (!session.ui.rateEditing) {
        session.ui.speedRange.value = session.source.speedRange.value || "1";
        session.ui.speedValue.textContent = session.source.speedValue?.textContent || `${clamp(session.ui.speedRange.value,.25,3,1).toFixed(2)}×`;
    }

    if (paused) keepUiVisible(session);
    else if (session.lastPaused === true && fullscreenElement() === session.shell) scheduleHide(session);
    session.lastPaused = paused;
}

function forwardSeek(session, value) {
    const src = session.source.seek;
    const max = Math.max(0, Number(src.max) || Number(value) || 0);
    src.value = String(clamp(value, 0, max, 0));
    src.dispatchEvent(new Event("input", { bubbles:true }));
    src.dispatchEvent(new Event("change", { bubbles:true }));
}

function forwardVolume(session, value) {
    session.source.volume.value = String(clamp(value, 0, 1, 1));
    session.source.volume.dispatchEvent(new Event("input", { bubbles:true }));
}

function forwardRate(session, value) {
    const rate = clamp(value, .25, 3, 1);
    session.source.speedRange.value = String(rate);
    session.source.speedRange.dispatchEvent(new Event("input", { bubbles:true }));
    session.source.speedRange.dispatchEvent(new Event("change", { bubbles:true }));
}

function restorePlayerLayout(session) {
    const { player, originalStyle } = session;
    if (originalStyle == null) player.removeAttribute("style");
    else player.setAttribute("style", originalStyle);
    player.removeAttribute("data-cig-cpu-fs-source");
}

function cleanup(session) {
    if (!session || session.cleaned) return;
    session.cleaned = true;
    clearHideTimer(session);
    if (session.clickTimer) clearTimeout(session.clickTimer);
    session.sourceObserver?.disconnect();
    document.removeEventListener("keydown", session.onKey, true);
    document.removeEventListener("fullscreenchange", session.onFs);
    document.removeEventListener("webkitfullscreenchange", session.onFs);

    try {
        if (session.canvas.parentNode !== session.player) session.player.insertBefore(session.canvas, session.player.firstChild);
    } catch (_) {}
    restorePlayerLayout(session);
    try { session.shell.remove(); } catch (_) {}
    sessions.delete(session.player);
    try { session.player.dispatchEvent(new Event("cigcpufullscreenchange")); } catch (_) {}
}

function exitSession(session, { pause = false } = {}) {
    if (!session || session.cleaned) return;
    if (pause && !isPaused(session)) {
        try { session.source.play.click(); } catch (_) {}
    }
    if (fullscreenElement() === session.shell) {
        try {
            const result = document.exitFullscreen?.() || document.webkitExitFullscreen?.();
            result?.catch?.(() => cleanup(session));
            return result;
        } catch (_) {
            cleanup(session);
            return;
        }
    }
    cleanup(session);
}

function bindShell(session) {
    const { shell, ui, source } = session;
    const stop = event => event.stopPropagation();
    shell.querySelectorAll(".cig-cpu-fs-bottom,.cig-cpu-fs-bottom *,.cig-cpu-fs-side,.cig-cpu-fs-side *")
        .forEach(element => {
            element.addEventListener("pointerdown", stop);
            element.addEventListener("dblclick", stop);
        });

    const activity = () => scheduleHide(session);
    shell.addEventListener("pointermove", activity, true);
    shell.addEventListener("pointerdown", activity, true);
    shell.addEventListener("touchstart", activity, { capture:true, passive:true });
    session.onKey = () => {
        if (fullscreenElement() === shell) scheduleHide(session);
    };
    document.addEventListener("keydown", session.onKey, true);

    ui.hit.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.detail >= 2) {
            if (session.clickTimer) clearTimeout(session.clickTimer);
            session.clickTimer = 0;
            exitSession(session, { pause:true });
            return;
        }
        if (session.clickTimer) clearTimeout(session.clickTimer);
        session.clickTimer = setTimeout(() => {
            session.clickTimer = 0;
            try { source.play.click(); } catch (_) {}
        }, CLICK_DELAY);
    });
    ui.hit.addEventListener("dblclick", event => {
        event.preventDefault();
        event.stopPropagation();
    });

    ui.play.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        source.play.click();
        syncUi(session);
    });

    ui.seek.addEventListener("pointerdown", () => {
        ui.seeking = true;
        keepUiVisible(session);
    });
    ui.seek.addEventListener("input", () => {
        ui.seeking = true;
        const parts = String(source.time.textContent || "0:00 / 0:00").split("/");
        const durationText = parts[1]?.trim() || "0:00";
        const value = Math.max(0, Number(ui.seek.value) || 0);
        const seconds = Math.floor(value);
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const currentText = h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
        ui.time.textContent = `${currentText} / ${durationText}`;
    });
    ui.seek.addEventListener("change", () => {
        forwardSeek(session, ui.seek.value);
        ui.seeking = false;
        syncUi(session);
        scheduleHide(session);
    });
    ui.seek.addEventListener("pointerup", () => {
        ui.seeking = false;
        scheduleHide(session);
    });

    ui.volume.addEventListener("input", () => {
        forwardVolume(session, ui.volume.value);
        syncUi(session);
        scheduleHide(session);
    });

    ui.exit.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        exitSession(session);
    });

    ui.prev.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        source.prev.click();
        syncUi(session);
        scheduleHide(session);
    });
    ui.next.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        source.next.click();
        syncUi(session);
        scheduleHide(session);
    });

    ui.speed.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        ui.speedPanel.classList.toggle("open");
        if (ui.speedPanel.classList.contains("open")) keepUiVisible(session);
        else scheduleHide(session);
    });
    ui.speedRange.addEventListener("pointerdown", () => {
        ui.rateEditing = true;
        keepUiVisible(session);
    });
    ui.speedRange.addEventListener("input", () => {
        ui.rateEditing = true;
        const value = clamp(ui.speedRange.value, .25, 3, 1);
        ui.speedValue.textContent = `${value.toFixed(2)}×`;
    });
    ui.speedRange.addEventListener("change", () => {
        forwardRate(session, ui.speedRange.value);
        ui.rateEditing = false;
        syncUi(session);
        if (!ui.speedPanel.classList.contains("open")) scheduleHide(session);
    });
    ui.speedRange.addEventListener("pointerup", () => {
        ui.rateEditing = false;
        if (!ui.speedPanel.classList.contains("open")) scheduleHide(session);
    });

    shell.addEventListener("wheel", event => {
        if (event.target instanceof Element && event.target.closest("input")) return;
        event.preventDefault();
        event.stopPropagation();
        const current = clamp(source.volume.value, 0, 1, 1);
        const next = clamp(current + (event.deltaY < 0 ? .05 : -.05), 0, 1, 1);
        forwardVolume(session, next);
        syncUi(session);
        scheduleHide(session);
    }, { passive:false });

    session.sourceObserver = new MutationObserver(() => syncUi(session));
    session.sourceObserver.observe(source.time, { childList:true, characterData:true, subtree:true });
    session.sourceObserver.observe(session.player, { attributes:true, attributeFilter:["class"] });

    session.onFs = () => {
        if (session.cleaned) return;
        if (fullscreenElement() === shell) {
            syncUi(session);
            scheduleHide(session);
            return;
        }
        cleanup(session);
    };
    document.addEventListener("fullscreenchange", session.onFs);
    document.addEventListener("webkitfullscreenchange", session.onFs);
}

function prepareSession(player) {
    const old = sessions.get(player);
    if (old && !old.cleaned) return old;

    const canvas = player.querySelector("canvas.ovg-cpu-canvas,canvas.ovg-shared-surface");
    const source = sourceUi(player);
    if (!(canvas instanceof HTMLCanvasElement) || !uiReady(source)) return null;

    const shell = buildShell(player, canvas);
    const ui = shellUi(shell);
    const modal = player.closest(".ovg-modal");
    const originalStyle = player.getAttribute("style");

    const session = {
        player, canvas, source, shell, ui, modal,
        originalStyle, hideTimer:0, clickTimer:0, lastPaused:null,
        sourceObserver:null, onFs:null, onKey:null, cleaned:false,
    };
    sessions.set(player, session);

    player.dataset.cigCpuFsSource = "1";
    player.style.setProperty("position", "fixed", "important");
    player.style.setProperty("inset", "auto", "important");
    player.style.setProperty("left", "-300vw", "important");
    player.style.setProperty("top", "0", "important");
    player.style.setProperty("width", "100vw", "important");
    player.style.setProperty("height", "100vh", "important");
    player.style.setProperty("visibility", "hidden", "important");
    player.style.setProperty("pointer-events", "none", "important");

    (modal instanceof HTMLElement ? modal : document.body).appendChild(shell);
    bindShell(session);
    syncUi(session);
    return session;
}

function enterCpuFullscreen(player, nativeRequest, args) {
    const existing = sessions.get(player);
    if (existing && !existing.cleaned) {
        if (fullscreenElement() === existing.shell) return Promise.resolve();
        return existing.requestPromise || Promise.resolve();
    }

    const session = prepareSession(player);
    if (!session) return nativeRequest.apply(player, args);

    let result;
    try {
        result = nativeRequest.apply(session.shell, args);
    } catch (error) {
        cleanup(session);
        try { return nativeRequest.apply(player, args); }
        catch (_) { throw error; }
    }

    const promise = result && typeof result.then === "function" ? result : Promise.resolve(result);
    session.requestPromise = promise.then(value => {
        syncUi(session);
        scheduleHide(session);
        return value;
    }).catch(error => {
        cleanup(session);
        try {
            const fallback = nativeRequest.apply(player, args);
            return fallback && typeof fallback.then === "function" ? fallback : Promise.resolve(fallback);
        } catch (_) {
            throw error;
        }
    });
    return session.requestPromise;
}

function patchFullscreenMethod(name) {
    const proto = Element.prototype;
    const previous = proto[name];
    if (typeof previous !== "function" || previous.__cigCpuLightFullscreenPatched) return;

    function patched(...args) {
        if (isCpuPlayer(this)) return enterCpuFullscreen(this, previous, args);
        return previous.apply(this, args);
    }
    patched.__cigCpuLightFullscreenPatched = true;
    patched.__cigCpuLightFullscreenPrevious = previous;
    proto[name] = patched;
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        ensureStyles();
        patchFullscreenMethod("requestFullscreen");
        patchFullscreenMethod("webkitRequestFullscreen");
    },
});
