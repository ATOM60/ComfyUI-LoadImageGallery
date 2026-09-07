import { app } from "/scripts/app.js";

const EXT_NAME = "Comfy.ImageGallery.OutputVideoSpeedControl";
const RATE_KEY = "ComfyUI-LoadImageGallery.outputVideoPlaybackRate";
const STYLE_ID = "cig-output-video-speed-style";

function clampRate(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.min(3, Math.max(0.25, n));
}

function loadRate() {
    try { return clampRate(localStorage.getItem(RATE_KEY) || 1); }
    catch (_) { return 1; }
}

function saveRate(value) {
    try { localStorage.setItem(RATE_KEY, String(clampRate(value))); }
    catch (_) {}
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.ovg-thumb:fullscreen,
.ovg-thumb:-webkit-full-screen{
    width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;
    aspect-ratio:auto!important;background:#000!important;border-radius:0!important;overflow:hidden!important;
}
.ovg-thumb:fullscreen .ovg-inline-video,
.ovg-thumb:-webkit-full-screen .ovg-inline-video{
    position:absolute!important;inset:0!important;width:100%!important;height:100%!important;
    max-width:100vw!important;max-height:100vh!important;object-fit:contain!important;background:#000!important;
}
.ovg-custom-fullscreen{
    position:absolute;z-index:28;right:10px;bottom:10px;width:38px;height:38px;padding:0;border:1px solid rgba(255,255,255,.35);
    border-radius:8px;background:rgba(0,0,0,.64);color:#fff;font:700 23px/36px Arial,sans-serif;text-align:center;
    cursor:pointer;opacity:.72;transition:opacity .12s,background .12s;box-shadow:0 2px 10px rgba(0,0,0,.35)
}
.ovg-custom-fullscreen:hover{opacity:1;background:rgba(0,0,0,.86)}
.ovg-thumb:fullscreen .ovg-custom-fullscreen,
.ovg-thumb:-webkit-full-screen .ovg-custom-fullscreen{right:20px;bottom:58px;opacity:.82}
.ovg-speed-control{
    display:none;position:absolute;z-index:30;right:20px;top:50%;transform:translateY(-50%);align-items:center;gap:8px;
    font-family:Arial,sans-serif;user-select:none
}
.ovg-thumb:fullscreen .ovg-speed-control,
.ovg-thumb:-webkit-full-screen .ovg-speed-control{display:flex}
.ovg-speed-button{
    width:46px;height:46px;padding:0;border:1px solid rgba(255,255,255,.38);border-radius:50%;background:rgba(0,0,0,.62);
    color:#fff;font-size:22px;line-height:44px;text-align:center;cursor:pointer;box-shadow:0 3px 14px rgba(0,0,0,.4)
}
.ovg-speed-button:hover,.ovg-speed-control.open .ovg-speed-button{background:rgba(0,0,0,.88);border-color:rgba(255,255,255,.7)}
.ovg-speed-panel{
    display:none;flex-direction:column;align-items:center;gap:9px;padding:11px 9px 12px;border:1px solid rgba(255,255,255,.25);
    border-radius:10px;background:rgba(15,15,15,.82);backdrop-filter:blur(6px);box-shadow:0 6px 24px rgba(0,0,0,.45)
}
.ovg-speed-control.open .ovg-speed-panel{display:flex}
.ovg-speed-value{min-width:56px;text-align:center;color:#fff;font-size:13px;font-weight:700;white-space:nowrap}
.ovg-speed-slider{
    width:28px;height:180px;margin:0;writing-mode:vertical-lr;direction:rtl;accent-color:#79adff;cursor:pointer
}
`;
    document.head.appendChild(style);
}

function isHostFullscreen(host) {
    return document.fullscreenElement === host || document.webkitFullscreenElement === host;
}

async function toggleFullscreen(host) {
    if (isHostFullscreen(host)) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        return;
    }
    if (host.requestFullscreen) await host.requestFullscreen();
    else if (host.webkitRequestFullscreen) host.webkitRequestFullscreen();
}

function attachSpeedControl(video) {
    if (!(video instanceof HTMLVideoElement) || video.dataset.cigSpeedControl === "1") return;
    const host = video.closest(".ovg-thumb");
    if (!host) return;
    video.dataset.cigSpeedControl = "1";

    try {
        if (video.controlsList?.add) video.controlsList.add("nofullscreen");
        else video.setAttribute("controlsList", `${video.getAttribute("controlsList") || ""} nofullscreen`.trim());
    } catch (_) {}

    const rate = loadRate();
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;

    let fsButton = host.querySelector(":scope > .ovg-custom-fullscreen");
    if (!fsButton) {
        fsButton = document.createElement("button");
        fsButton.type = "button";
        fsButton.className = "ovg-custom-fullscreen";
        fsButton.textContent = "⛶";
        fsButton.title = "На весь экран";
        host.appendChild(fsButton);
    }

    let speed = host.querySelector(":scope > .ovg-speed-control");
    if (!speed) {
        speed = document.createElement("div");
        speed.className = "ovg-speed-control";
        speed.innerHTML = `
            <div class="ovg-speed-panel">
                <div class="ovg-speed-value">1.00×</div>
                <input class="ovg-speed-slider" type="range" min="0.25" max="3" step="0.05" value="1">
            </div>
            <button class="ovg-speed-button" type="button" title="Скорость воспроизведения">⏱</button>`;
        host.appendChild(speed);
    }

    const speedButton = speed.querySelector(".ovg-speed-button");
    const slider = speed.querySelector(".ovg-speed-slider");
    const value = speed.querySelector(".ovg-speed-value");

    const updateRateUi = () => {
        const r = clampRate(video.playbackRate || loadRate());
        slider.value = String(r);
        value.textContent = `${r.toFixed(2)}×`;
    };
    updateRateUi();

    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    for (const el of [fsButton, speed, speedButton, slider]) {
        el.addEventListener("pointerdown", e => e.stopPropagation());
        el.addEventListener("mousedown", e => e.stopPropagation());
        el.addEventListener("click", e => e.stopPropagation());
    }

    fsButton.addEventListener("click", async (e) => {
        stop(e);
        try { await toggleFullscreen(host); }
        catch (err) { console.warn("[OutputVideoGallery] fullscreen:", err); }
    });

    speedButton.addEventListener("click", (e) => {
        stop(e);
        speed.classList.toggle("open");
    });

    slider.addEventListener("input", (e) => {
        e.stopPropagation();
        const r = clampRate(slider.value);
        video.playbackRate = r;
        video.defaultPlaybackRate = r;
        saveRate(r);
        updateRateUi();
    });

    video.addEventListener("ratechange", updateRateUi);
    video.addEventListener("dblclick", async (e) => {
        stop(e);
        try { await toggleFullscreen(host); }
        catch (_) {}
    }, true);

    const onFullscreen = () => {
        const full = isHostFullscreen(host);
        fsButton.textContent = full ? "↙" : "⛶";
        fsButton.title = full ? "Выйти из полноэкранного режима" : "На весь экран";
        if (!full) speed.classList.remove("open");
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
}

function scan(root = document) {
    if (root instanceof HTMLVideoElement && root.classList.contains("ovg-inline-video")) attachSpeedControl(root);
    root.querySelectorAll?.("video.ovg-inline-video").forEach(attachSpeedControl);
}

app.registerExtension({
    name: EXT_NAME,
    setup() {
        injectStyles();
        scan();
        const observer = new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof Element) scan(node);
                }
            }
        });
        observer.observe(document.body, { childList:true, subtree:true });
    },
});
