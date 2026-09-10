globalThis.__CIG_SHARED_OUTPUT_PLAYER_V1 = true;

const STYLE_ID = "cig-output-video-player-shared-style";
export const PLAYER_CLICK_DELAY = 260;
export const PLAYER_DOUBLE_CLICK_WINDOW_MS = 360;
const FULLSCREEN_UI_HIDE_DELAY = 1800;
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const VOLUME_KEY = "ComfyUI-LoadImageGallery.outputVideoVolume";

export function clamp(value, min, max, fallback = min) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function loadSharedRate() {
    try { return clamp(localStorage.getItem(RATE_KEY) || 1, .25, 3, 1); }
    catch (_) { return 1; }
}

export function saveSharedRate(value) {
    try { localStorage.setItem(RATE_KEY, String(clamp(value, .25, 3, 1))); }
    catch (_) {}
}

export function loadSharedVolume() {
    try {
        const value = localStorage.getItem(VOLUME_KEY);
        return value == null ? 1 : clamp(value, 0, 1, 1);
    } catch (_) {
        return 1;
    }
}

export function saveSharedVolume(value) {
    try { localStorage.setItem(VOLUME_KEY, String(clamp(value, 0, 1, 1))); }
    catch (_) {}
}

export function formatPlayerTime(value) {
    let seconds = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(seconds / 3600);
    seconds -= hours * 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    return hours
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

export function ensureOutputVideoPlayerStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.ovg-shared-player{position:absolute;inset:0;z-index:9;background:#000;overflow:hidden;container-type:inline-size}
.ovg-shared-surface{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;background:#000!important;border:0!important;border-radius:0!important;pointer-events:none!important;object-fit:contain!important}
.ovg-shared-hit{position:absolute;inset:0;z-index:2;width:100%;height:100%;padding:0;margin:0;border:0;background:transparent;cursor:pointer}
.ovg-shared-badge{position:absolute;left:8px;top:7px;z-index:4;padding:3px 6px;border-radius:5px;background:rgba(0,0,0,.62);color:#d6e8ff;font:700 10px/1.2 Arial,sans-serif;pointer-events:none;letter-spacing:.3px;transition:opacity .16s ease}
.ovg-shared-paused{position:absolute;left:50%;top:50%;z-index:4;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.58);color:#fff;font-size:23px;pointer-events:none}
.ovg-shared-player.paused .ovg-shared-paused{display:flex}
.ovg-shared-native{position:absolute;left:0;right:0;bottom:0;z-index:12;padding:18px 8px 5px;box-sizing:border-box;background:linear-gradient(to top,rgba(0,0,0,.88) 0%,rgba(0,0,0,.55) 58%,transparent 100%);opacity:0;transform:translateY(2px);transition:opacity .13s ease,transform .13s ease;pointer-events:none;color:#fff;font:12px Arial,sans-serif}
.ovg-shared-player:hover .ovg-shared-native,.ovg-shared-player.paused .ovg-shared-native,.ovg-shared-player:fullscreen .ovg-shared-native,.ovg-shared-player:-webkit-full-screen .ovg-shared-native{opacity:1;transform:none;pointer-events:auto}
.ovg-shared-seek{display:block!important;width:100%!important;height:12px!important;margin:0 0 2px!important;writing-mode:horizontal-tb!important;direction:ltr!important;accent-color:#fff!important;cursor:pointer!important}
.ovg-shared-native-row{display:flex;align-items:center;gap:6px;height:30px;min-width:0}
.ovg-shared-native button{width:30px;height:30px;min-width:30px;padding:0;border:0;border-radius:4px;background:transparent;color:#fff;font:16px/30px "Segoe UI Symbol",Arial,sans-serif;cursor:pointer}
.ovg-shared-native button:hover{background:rgba(255,255,255,.15)}
.ovg-shared-time{white-space:nowrap;opacity:.92;font-variant-numeric:tabular-nums}
.ovg-shared-spacer{flex:1 1 auto;min-width:2px}
.ovg-shared-volume{width:78px!important;max-width:90px!important;min-width:46px!important;height:auto!important;margin:0!important;writing-mode:horizontal-tb!important;direction:ltr!important;accent-color:#fff!important;cursor:pointer!important}
.ovg-shared-fs-controls{display:none;position:absolute;right:28px;top:50%;z-index:14;transform:translateY(-50%);flex-direction:column;gap:8px;align-items:center;opacity:1;transition:opacity .16s ease}
.ovg-shared-fs-controls button{width:44px;height:44px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(20,20,20,.72);color:#fff;font:18px/42px Arial,sans-serif;padding:0;cursor:pointer;backdrop-filter:blur(5px)}
.ovg-shared-fs-controls button:hover{background:rgba(45,45,45,.86)}
.ovg-shared-speed-panel{display:none;position:absolute;right:54px;top:50%;transform:translateY(-50%);padding:10px 12px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(20,20,20,.86);white-space:nowrap;color:#fff;font:12px Arial,sans-serif;align-items:center;gap:8px}
.ovg-shared-speed-panel.open{display:flex!important}
.ovg-shared-speed-range{width:150px!important;height:auto!important;margin:0!important;writing-mode:horizontal-tb!important;direction:ltr!important;accent-color:#79adff!important;cursor:pointer!important}
.ovg-shared-speed-value{min-width:48px;text-align:center;font-variant-numeric:tabular-nums}
.ovg-shared-player:fullscreen,.ovg-shared-player:-webkit-full-screen{width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:#000!important;overflow:hidden!important}
.ovg-shared-player:fullscreen>.ovg-shared-surface,.ovg-shared-player:-webkit-full-screen>.ovg-shared-surface{width:100vw!important;height:100vh!important;object-fit:contain!important}
.ovg-shared-player:fullscreen .ovg-shared-fs-controls,.ovg-shared-player:-webkit-full-screen .ovg-shared-fs-controls{display:flex!important}
.ovg-shared-player:fullscreen .ovg-shared-native,.ovg-shared-player:-webkit-full-screen .ovg-shared-native{padding:24px 14px 9px}
.ovg-shared-player:fullscreen .ovg-shared-volume,.ovg-shared-player:-webkit-full-screen .ovg-shared-volume{width:100px!important;max-width:120px!important}
.ovg-shared-player:fullscreen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-native,.ovg-shared-player:-webkit-full-screen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-native{opacity:0!important;transform:translateY(6px)!important;pointer-events:none!important}
.ovg-shared-player:fullscreen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-fs-controls,.ovg-shared-player:-webkit-full-screen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-fs-controls{opacity:0!important;pointer-events:none!important}
.ovg-shared-player:fullscreen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-badge,.ovg-shared-player:-webkit-full-screen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-badge{opacity:0!important}
.ovg-shared-player:fullscreen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-hit,.ovg-shared-player:-webkit-full-screen.ovg-shared-ui-hidden:not(.paused) .ovg-shared-hit{cursor:none!important}
body:has(.ovg-shared-player[data-ovg-decoder="GPU"])>.ovg-speed-control[popover]{display:none!important}
@container (max-width:360px){.ovg-shared-time,.ovg-shared-volume{display:none!important}.ovg-shared-native-row{gap:2px}.ovg-shared-native{padding-left:5px;padding-right:5px}}
`;
    document.head.appendChild(style);
}

function addAliases(element, aliases) {
    if (!(element instanceof Element)) return;
    for (const name of aliases || []) if (name) element.classList.add(name);
}

function call(adapter, name, ...args) {
    try {
        const fn = adapter?.[name];
        return typeof fn === "function" ? fn(...args) : undefined;
    } catch (_) {
        return undefined;
    }
}

export function createOutputVideoPlayer({
    mode,
    surface,
    adapter,
    labels,
    host = null,
    aliases = {},
    onFullscreenChange = null,
}) {
    ensureOutputVideoPlayerStyles();
    if (!(surface instanceof HTMLElement)) throw new Error("Player surface must be an HTMLElement");

    const player = document.createElement("div");
    player.className = "ovg-shared-player";
    player.dataset.ovgDecoder = String(mode || "");
    addAliases(player, aliases.player);

    if (host instanceof HTMLElement) {
        if (surface.parentNode === host) host.insertBefore(player, surface);
        else host.appendChild(player);
    }
    player.appendChild(surface);
    surface.classList.add("ovg-shared-surface");
    addAliases(surface, aliases.surface);

    player.insertAdjacentHTML("beforeend", `
        <button class="ovg-shared-hit" type="button"></button>
        <div class="ovg-shared-badge">${String(mode || "")}</div>
        <div class="ovg-shared-paused">▶</div>
        <div class="ovg-shared-native">
            <input class="ovg-shared-seek" type="range" min="0" max="1" step="0.01">
            <div class="ovg-shared-native-row">
                <button class="ovg-shared-ui-play" type="button">▶</button>
                <span class="ovg-shared-time">0:00 / 0:00</span>
                <span class="ovg-shared-spacer"></span>
                <span>🔊</span>
                <input class="ovg-shared-volume" type="range" min="0" max="1" step="0.05" title="${labels.volume}">
                <button class="ovg-shared-ui-fullscreen" type="button" title="${labels.fullscreen}">⛶</button>
            </div>
        </div>
        <div class="ovg-shared-fs-controls">
            <button class="ovg-shared-prev" type="button" title="${labels.prev}">⏮</button>
            <div style="position:relative">
                <button class="ovg-shared-speed" type="button" title="${labels.speed}">⏱</button>
                <div class="ovg-shared-speed-panel">
                    <input class="ovg-shared-speed-range" type="range" min="0.25" max="3" step="0.05">
                    <span class="ovg-shared-speed-value"></span>
                </div>
            </div>
            <button class="ovg-shared-next" type="button" title="${labels.next}">⏭</button>
        </div>
    `);

    const ui = {
        hit: player.querySelector(".ovg-shared-hit"),
        play: player.querySelector(".ovg-shared-ui-play"),
        seek: player.querySelector(".ovg-shared-seek"),
        time: player.querySelector(".ovg-shared-time"),
        volume: player.querySelector(".ovg-shared-volume"),
        fullscreen: player.querySelector(".ovg-shared-ui-fullscreen"),
        prev: player.querySelector(".ovg-shared-prev"),
        next: player.querySelector(".ovg-shared-next"),
        speed: player.querySelector(".ovg-shared-speed"),
        speedPanel: player.querySelector(".ovg-shared-speed-panel"),
        speedRange: player.querySelector(".ovg-shared-speed-range"),
        speedValue: player.querySelector(".ovg-shared-speed-value"),
        seeking: false,
        rateEditing: false,
    };

    addAliases(ui.hit, aliases.hit);
    addAliases(ui.seek, aliases.seek);
    addAliases(ui.volume, aliases.volume);
    addAliases(ui.speedRange, aliases.speedRange);

    let uiHideTimer = 0;
    let lastPaused = null;

    const clearUiHideTimer = () => {
        if (!uiHideTimer) return;
        clearTimeout(uiHideTimer);
        uiHideTimer = 0;
    };

    const keepFullscreenUiVisible = () => {
        clearUiHideTimer();
        player.classList.remove("ovg-shared-ui-hidden");
    };

    const scheduleFullscreenUiHide = () => {
        keepFullscreenUiVisible();
        if (fullscreenElement() !== player) return;
        if (call(adapter, "isPaused")) return;
        if (ui.seeking || ui.rateEditing || ui.speedPanel.classList.contains("open")) return;
        uiHideTimer = setTimeout(() => {
            uiHideTimer = 0;
            if (fullscreenElement() !== player) return;
            if (call(adapter, "isPaused")) return;
            if (ui.seeking || ui.rateEditing || ui.speedPanel.classList.contains("open")) return;
            player.classList.add("ovg-shared-ui-hidden");
        }, FULLSCREEN_UI_HIDE_DELAY);
    };

    const onFullscreenActivity = () => {
        if (fullscreenElement() === player) scheduleFullscreenUiHide();
    };

    const onFullscreenKeyActivity = () => {
        if (fullscreenElement() === player) scheduleFullscreenUiHide();
    };

    player.addEventListener("pointermove", onFullscreenActivity, true);
    player.addEventListener("pointerdown", onFullscreenActivity, true);
    player.addEventListener("touchstart", onFullscreenActivity, { capture:true, passive:true });
    document.addEventListener("keydown", onFullscreenKeyActivity, true);

    const update = () => {
        if (!player.isConnected && !player.parentNode) return;
        const paused = !!call(adapter, "isPaused");
        const current = Math.max(0, Number(call(adapter, "getCurrentTime")) || 0);
        const duration = Math.max(0, Number(call(adapter, "getDuration")) || 0);
        const volume = clamp(call(adapter, "getVolume"), 0, 1, loadSharedVolume());
        const rate = clamp(call(adapter, "getRate"), .25, 3, loadSharedRate());

        player.classList.toggle("paused", paused);
        ui.hit.removeAttribute("title");
        ui.play.textContent = paused ? "▶" : "❚❚";
        ui.play.title = paused ? labels.play : labels.pause;

        if (paused) {
            keepFullscreenUiVisible();
        } else if (lastPaused === true && fullscreenElement() === player) {
            scheduleFullscreenUiHide();
        }
        lastPaused = paused;

        if (!ui.seeking) {
            ui.seek.max = String(Math.max(.001, duration));
            ui.seek.value = String(Math.min(current, duration || Number.MAX_SAFE_INTEGER));
        }
        ui.time.textContent = `${formatPlayerTime(current)} / ${formatPlayerTime(duration)}`;
        ui.volume.value = String(volume);

        if (!ui.rateEditing) {
            ui.speedRange.value = String(rate);
            ui.speedValue.textContent = `${rate.toFixed(rate % 1 ? 2 : 0)}×`;
        }

        const fs = fullscreenElement() === player;
        ui.fullscreen.textContent = fs ? "⤢" : "⛶";
        ui.fullscreen.title = fs ? labels.exitFullscreen : labels.fullscreen;
    };

    const requestFullscreen = () => {
        if (fullscreenElement() === player) return;
        try {
            const result = player.requestFullscreen?.() || player.webkitRequestFullscreen?.();
            result?.catch?.(() => {});
        } catch (_) {}
    };

    const exitFullscreen = ({ pause = false } = {}) => {
        if (pause) call(adapter, "pause");
        if (fullscreenElement() !== player) return;
        try {
            const result = document.exitFullscreen?.() || document.webkitExitFullscreen?.();
            result?.catch?.(() => {});
        } catch (_) {}
    };

    const togglePlayback = () => {
        if (call(adapter, "isPaused")) call(adapter, "play");
        else call(adapter, "pause");
    };

    const stop = event => event.stopPropagation();
    player.querySelectorAll(".ovg-shared-native,.ovg-shared-native *,.ovg-shared-fs-controls,.ovg-shared-fs-controls *")
        .forEach(el => {
            el.addEventListener("pointerdown", stop);
            el.addEventListener("dblclick", stop);
        });

    let clickTimer = 0;
    ui.hit.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.detail >= 2) {
            if (clickTimer) clearTimeout(clickTimer);
            clickTimer = 0;
            if (fullscreenElement() === player) exitFullscreen({ pause: true });
            else requestFullscreen();
            return;
        }
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
            clickTimer = 0;
            togglePlayback();
        }, PLAYER_CLICK_DELAY);
    });
    ui.hit.addEventListener("dblclick", event => {
        event.preventDefault();
        event.stopPropagation();
    });

    ui.play.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        togglePlayback();
    });

    ui.seek.addEventListener("pointerdown", () => {
        ui.seeking = true;
        keepFullscreenUiVisible();
    });
    ui.seek.addEventListener("input", () => {
        ui.seeking = true;
        ui.time.textContent = `${formatPlayerTime(ui.seek.value)} / ${formatPlayerTime(call(adapter, "getDuration"))}`;
    });
    ui.seek.addEventListener("change", () => {
        const duration = Math.max(0, Number(call(adapter, "getDuration")) || Number(ui.seek.value) || 0);
        call(adapter, "seek", clamp(ui.seek.value, 0, duration, 0));
        ui.seeking = false;
        update();
        scheduleFullscreenUiHide();
    });
    ui.seek.addEventListener("pointerup", () => {
        ui.seeking = false;
        scheduleFullscreenUiHide();
    });

    ui.volume.addEventListener("input", () => {
        const value = clamp(ui.volume.value, 0, 1, 1);
        saveSharedVolume(value);
        call(adapter, "setVolume", value);
        update();
        scheduleFullscreenUiHide();
    });

    ui.fullscreen.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (fullscreenElement() === player) exitFullscreen();
        else requestFullscreen();
    });

    ui.prev.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve(call(adapter, "navigate", -1)).finally(update);
    });
    ui.next.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve(call(adapter, "navigate", 1)).finally(update);
    });

    ui.speed.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        ui.speedPanel.classList.toggle("open");
        if (ui.speedPanel.classList.contains("open")) keepFullscreenUiVisible();
        else scheduleFullscreenUiHide();
    });
    ui.speedRange.addEventListener("pointerdown", () => {
        ui.rateEditing = true;
        keepFullscreenUiVisible();
    });
    ui.speedRange.addEventListener("input", () => {
        ui.rateEditing = true;
        const value = clamp(ui.speedRange.value, .25, 3, 1);
        ui.speedValue.textContent = `${value.toFixed(2)}×`;
    });
    ui.speedRange.addEventListener("change", () => {
        const value = clamp(ui.speedRange.value, .25, 3, 1);
        saveSharedRate(value);
        call(adapter, "setRate", value);
        ui.rateEditing = false;
        update();
        if (!ui.speedPanel.classList.contains("open")) scheduleFullscreenUiHide();
    });
    ui.speedRange.addEventListener("pointerup", () => {
        ui.rateEditing = false;
        if (!ui.speedPanel.classList.contains("open")) scheduleFullscreenUiHide();
    });

    player.addEventListener("wheel", event => {
        if (event.target instanceof Element && event.target.closest("input")) return;
        event.preventDefault();
        event.stopPropagation();
        scheduleFullscreenUiHide();
        const current = clamp(call(adapter, "getVolume"), 0, 1, loadSharedVolume());
        const next = clamp(current + (event.deltaY < 0 ? .05 : -.05), 0, 1, 1);
        saveSharedVolume(next);
        call(adapter, "setVolume", next);
        update();
    }, { passive: false });

    const onFs = () => {
        const active = fullscreenElement() === player;
        if (active) scheduleFullscreenUiHide();
        else keepFullscreenUiVisible();
        update();
        try { onFullscreenChange?.(active); } catch (_) {}
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);

    let raf = 0;
    const tick = () => {
        if (player.isConnected) update();
        raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    update();

    const destroy = () => {
        if (clickTimer) clearTimeout(clickTimer);
        clearUiHideTimer();
        if (raf) cancelAnimationFrame(raf);
        player.removeEventListener("pointermove", onFullscreenActivity, true);
        player.removeEventListener("pointerdown", onFullscreenActivity, true);
        player.removeEventListener("touchstart", onFullscreenActivity, true);
        document.removeEventListener("keydown", onFullscreenKeyActivity, true);
        document.removeEventListener("fullscreenchange", onFs);
        document.removeEventListener("webkitfullscreenchange", onFs);
        ui.speedPanel.classList.remove("open");
        try { player.remove(); } catch (_) {}
    };

    return { player, surface, ui, update, requestFullscreen, exitFullscreen, destroy };
}
