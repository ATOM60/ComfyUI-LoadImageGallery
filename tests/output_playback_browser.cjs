// Node >=20, Playwright and Chrome/Chromium. All media and API responses are local fixtures.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const modules = [
    'output_video_gallery.js', 'output_video_favorites.js', 'output_video_scroll_memory.js',
    'zzzzzz_output_controls_capture.js', 'zzzzzzzzzz_output_gpu_cpu_style_player.js',
    'zzzzzzzzzzzz_gpu_native_fullscreen.js', 'zzzzzzzzzzzzz_gpu_native_next.js',
    'zzzzzzzzzzzzzz_gpu_touch_scrub.js', 'output_video_cpu_playback.js',
    'zzzzzzzzzzzzzzz_cpu_light_fullscreen.js',
];

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'],
        ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    try {
        const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let media = null;
        await page.route('http://gallery.test/**', async route => {
            const url = new URL(route.request().url());
            if (url.pathname === '/scripts/app.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const app=window.testApp;' });
            if (url.pathname === '/scripts/api.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const api={fetchApi:(...args)=>fetch(...args),apiURL:p=>p};' });
            if (url.pathname.startsWith('/web/')) {
                const file = path.basename(url.pathname);
                return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'web', file), 'utf8') });
            }
            if (url.pathname.endsWith('/list')) return route.fulfill({ json: { videos: ['a.webm', 'b.webm', 'c.webm'].map((name, i) => ({ path:name, name, folder:'', mtime:3-i, size:1000, ext:'.webm' })) } });
            if (url.pathname.endsWith('/video') || url.pathname.endsWith('/cpu-audio')) return route.fulfill({ contentType: 'video/webm', body: media });
            if (url.pathname.endsWith('/thumb')) return route.fulfill({ contentType: 'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#456"/></svg>' });
            return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' });
        });
        await page.routeWebSocket('**/cpu-stream?**', ws => ws.send(JSON.stringify({type:'meta',duration:20,fps:30})));
        await page.goto('http://gallery.test/');
        media = Buffer.from(await page.evaluate(async () => {
            const canvas = document.createElement('canvas'); canvas.width=160; canvas.height=100;
            const ctx=canvas.getContext('2d'); const stream=canvas.captureStream(10);
            const audio=new AudioContext(); await audio.resume();
            const oscillator=audio.createOscillator(), destination=audio.createMediaStreamDestination();
            oscillator.connect(destination); oscillator.start();
            stream.addTrack(destination.stream.getAudioTracks()[0]);
            const chunks=[], recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus'});
            recorder.ondataavailable=e=>chunks.push(e.data);
            const finished=new Promise(resolve=>{recorder.onstop=resolve;});
            let n=0;const timer=setInterval(()=>{ctx.fillStyle=n++%2?'#567':'#c87';ctx.fillRect(0,0,160,100);},80);
            recorder.start(); await new Promise(resolve=>setTimeout(resolve,1600));recorder.stop();await finished;
            clearInterval(timer);oscillator.stop();stream.getTracks().forEach(t=>t.stop());await audio.close();
            return [...new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer())];
        }));
        await page.evaluate(async modules => {
            window.mediaEvents=[];for(const type of ['play','pause','playing','error','loadedmetadata'])document.addEventListener(type,e=>{if(e.target instanceof HTMLMediaElement)mediaEvents.push({type,time:performance.now(),paused:e.target.paused,path:e.target.closest('.ovg-card')?.dataset.path,error:e.target.error?.message});},true);
            const extensions=[];window.testApp={registerExtension:e=>extensions.push(e),extensionManager:{toast:{add(){}}}};
            localStorage.setItem('ComfyUI-LoadImageGallery.outputVideoFavorites',JSON.stringify(['c.webm']));
            localStorage.setItem('ComfyUI-LoadImageGallery.outputVideoCpuPlayback','0');
            for(const file of modules)await import('/web/'+file);
            for(const extension of extensions)await extension.setup?.();
            class Node{constructor(){this.widgets=[];}addWidget(type,name,value,callback){const w={type,name,value,callback};this.widgets.push(w);return w;}}
            await extensions.find(e=>e.name==='Comfy.ImageGallery.OutputVideoGallery').beforeRegisterNodeDef(Node,{name:'LoadImageGallery'});
            window.testNode=new Node();testNode.onNodeCreated();
            window.openGallery=()=>testNode.widgets[0].callback();
        }, modules);
        const card = name => page.locator(`.ovg-card[data-path="${name}"]`);
        const waitPlaying = name => page.waitForFunction(name => {
            const v=[...document.querySelectorAll('.ovg-card')].find(c=>c.dataset.path===name)?.querySelector('video');
            return v && !v.paused && v.readyState>=2;
        },name);
        async function openGallery() {
            await page.evaluate(()=>window.openGallery());
            await page.waitForSelector('.ovg-card .ovg-favorite');
        }
        async function play(name) {
            await card(name).locator('.ovg-play').click();
            try { await waitPlaying(name); } catch(error) { console.log(await page.evaluate(()=>({html:document.querySelector('.ovg-grid')?.innerHTML,videos:[...document.querySelectorAll('video')].map(v=>({paused:v.paused,readyState:v.readyState,error:v.error?.message,src:v.src})),events:window.mediaEvents}))); throw error; }
            await card(name).locator('.ovg-gpu-player').waitFor();
        }
        const checks=[];
        for (const scenario of [
            { target:'b.webm', cached:false },{target:'c.webm',cached:false},
            {target:'b.webm',cached:true},{target:'c.webm',cached:true},
            {target:'a.webm',cached:false},{target:'b.webm',cached:false,paused:true},
            {target:'c.webm',cached:false,paused:true},{target:'a.webm',cached:false,paused:true},
        ]) {
            await openGallery();
            if(scenario.cached)await play(scenario.target);
            await play('a.webm');
            await page.evaluate(()=>{window.originVideo=document.querySelector('.ovg-card[data-path="a.webm"] video');});
            await card('a.webm').locator('.ovg-gpu-player').hover();
            await card('a.webm').locator('.ovg-gpu-ui-fullscreen').click();
            await page.waitForFunction(()=>document.fullscreenElement?.dataset.cigNativeShell==='1');
            const steps=await page.evaluate(target=>{
                const paths=[...document.querySelectorAll('.ovg-card')].map(c=>c.dataset.path);
                return (paths.indexOf(target)-paths.indexOf('a.webm')+paths.length)%paths.length;
            },scenario.target);
            for(let i=0;i<steps;i++)await page.locator('.cig-native-next').click();
            await page.waitForFunction(()=>originVideo.readyState>=2&&originVideo.currentTime>.25);
            await page.evaluate(async paused=>{
                originVideo.playbackRate=1.25;originVideo.volume=.4;originVideo.muted=false;
                if(paused)originVideo.pause();else await originVideo.play();
                window.exitPosition=originVideo.currentTime;
                await document.exitFullscreen();
            },!!scenario.paused);
            await page.waitForFunction(()=>!document.fullscreenElement&&!originVideo.__cigNativeFsShell&&originVideo.dataset.cigCurrentPath);
            await waitPlaying(scenario.target);
            const state=await page.evaluate(target=>{
                const card=[...document.querySelectorAll('.ovg-card')].find(c=>c.dataset.path===target);
                const v=card.querySelector('video');const registry=testNode._outputVideoGallery.players;
                return {same:v===originVideo,path:v?.dataset.cigCurrentPath,paused:v?.paused,time:v?.currentTime,
                    expectedTime:exitPosition,rate:v?.playbackRate,volume:v?.volume,muted:v?.muted,
                    correctRegistry:registry.get(target)?.video===v,
                    originRestored:target==='a.webm'||!document.querySelector('.ovg-card[data-path="a.webm"] video'),
                    count:card.querySelectorAll('video').length,
                    onlyCurrentPlaying:[...document.querySelectorAll('video')].every(other=>other===v||other.paused),
                    favoritesFirst:document.querySelector('.ovg-card')?.dataset.path==='c.webm'};
            },scenario.target);
            assert.equal(state.same,true,JSON.stringify({scenario,state}));
            assert.equal(state.path,scenario.target);assert.equal(state.paused,false);
            assert.equal(state.correctRegistry,true);assert.equal(state.originRestored,true);assert.equal(state.count,1);
            assert.equal(state.onlyCurrentPlaying,true);assert.equal(state.favoritesFirst,true);
            assert.equal(state.rate,1.25);assert.equal(state.volume,.4);assert.equal(state.muted,false);
            assert.ok(state.expectedTime>.2,'test a nonzero playback position');
            assert.ok(Math.abs(state.time-state.expectedTime)<.2,'retain playback position');
            checks.push({scenario,state});
        }
        // Actual pointer/keyboard input at the smallest and default thumbnail sizes.
        await openGallery();await play('a.webm');
        for(const width of [120,180,320]){
            await page.locator('.ovg-size').evaluate((el,width)=>{el.value=String(width);el.dispatchEvent(new Event('input',{bubbles:true}));},width);
            // The gallery rebuilds on input; this also tests creating a new player with saved volume.
            await play('a.webm');
            const player=card('a.webm').locator('.ovg-gpu-player');await player.hover();
            const slider=player.locator('.ovg-gpu-volume');assert.equal(await slider.isVisible(),true,`GPU volume visible at ${width}`);
            const box=await slider.boundingBox();await page.mouse.click(box.x+box.width*.3,box.y+box.height/2);
            await slider.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
            let volume=await card('a.webm').locator('video').evaluate(v=>v.volume);assert.equal(volume,.1);
            await player.locator('.ovg-gpu-ui-mute').click();assert.equal(await card('a.webm').locator('video').evaluate(v=>v.volume),0);
            await player.locator('.ovg-gpu-ui-mute').click();assert.equal(await card('a.webm').locator('video').evaluate(v=>v.volume),.1);
            await slider.hover();await page.mouse.wheel(0,-100);
            await page.waitForFunction(()=>document.querySelector('.ovg-card[data-path="a.webm"] video').volume>.1);
            assert.equal(await card('a.webm').locator('video').evaluate(v=>v.muted),false);
            checks.push({gpuVolumeWidth:width,volume:await card('a.webm').locator('video').evaluate(v=>v.volume)});
        }
        // CPU fullscreen uses a separate shell, so returning it must remount the
        // source player on the last selected (possibly favorited) card as well.
        await openGallery();
        await page.locator('.ovg-cpu-toggle').click();
        await card('a.webm').locator('.ovg-play').click();
        await card('a.webm').locator('.ovg-cpu-player').waitFor();
        await page.evaluate(()=>{window.activeCpuPlayer=document.querySelector('.ovg-cpu-player');});
        await card('a.webm').locator('.ovg-cpu-player').hover();
        await card('a.webm').locator('.ovg-shared-ui-fullscreen').click();
        await page.waitForFunction(()=>document.fullscreenElement?.dataset.cigCpuLightFullscreen==='1');
        await page.locator('.cig-cpu-fs-next').click();
        await page.locator('.cig-cpu-fs-next').click();
        await page.locator('.cig-cpu-fs-hit').dblclick({position:{x:200,y:150}});
        await page.waitForFunction(()=>!document.fullscreenElement&&activeCpuPlayer.closest('.ovg-card')?.dataset.path==='c.webm');
        assert.equal(await page.evaluate(()=>activeCpuPlayer.classList.contains('paused')),false,'CPU keeps playing after double-click exit');
        assert.equal(await card('a.webm').locator('.ovg-cpu-player').count(),0);
        checks.push({cpuFullscreenFavorite:true});
        await card('c.webm').locator('.ovg-shared-ui-fullscreen').click();
        await page.waitForFunction(()=>document.fullscreenElement?.dataset.cigCpuLightFullscreen==='1');
        await page.locator('.cig-cpu-fs-play').click();
        await page.waitForFunction(()=>activeCpuPlayer.classList.contains('paused'));
        await page.evaluate(()=>document.exitFullscreen());
        await page.waitForFunction(()=>!document.fullscreenElement&&!activeCpuPlayer.classList.contains('paused'));
        assert.equal(await page.evaluate(()=>activeCpuPlayer.closest('.ovg-card')?.dataset.path),'c.webm');
        checks.push({cpuPausedFullscreenFavorite:true});
        // Shared CPU controls use an adapter; no decoding server is needed for UI checks.
        await page.locator('.ovg-close').click();
        await page.evaluate(async()=>{
            const {createOutputVideoPlayer}=await import('/web/output_video_player_shared.js');
            let volume=.6;
            const host=document.createElement('div');host.style.cssText='position:relative;width:120px;height:100px';document.body.append(host);
            window.cpuShell=createOutputVideoPlayer({mode:'CPU',surface:document.createElement('canvas'),host,
                labels:{volume:'Volume',fullscreen:'Fullscreen',play:'Play',pause:'Pause'},
                adapter:{getVolume:()=>volume,setVolume:v=>volume=v,isPaused:()=>true,getCurrentTime:()=>0,getDuration:()=>1}});
            window.cpuVolume=()=>volume;
        });
        const cpuSlider=page.locator('.ovg-shared-volume');assert.equal(await cpuSlider.isVisible(),true);
        await cpuSlider.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
        assert.equal(await page.evaluate(()=>cpuVolume()),.05);
        await page.locator('.ovg-shared-ui-mute').click();assert.equal(await page.evaluate(()=>cpuVolume()),0);
        await page.locator('.ovg-shared-ui-mute').click();assert.equal(await page.evaluate(()=>cpuVolume()),.05);
        checks.push({cpuVolume:true});
        assert.deepEqual(errors,[]);
        console.log(JSON.stringify({passed:checks.length,checks,browserErrors:errors},null,2));
    } finally { await browser.close(); }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
