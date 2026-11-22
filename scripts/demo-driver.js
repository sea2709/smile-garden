// scripts/demo-driver.js — record a short smile → water / talk → fertilize demo.
// Loaded by main.js when SMILE_GARDEN_DEMO_DIR is set (throwaway profile).
// Writes frame-XXXX.png under that dir; scripts/record-demo.js encodes the MP4.

'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(win, outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const wc = win.webContents;
    const js = (code) => wc.executeJavaScript(code, true);
    const ds = () => js('Object.assign({}, document.body.dataset)');
    const G = (expr) => js(`(() => { const g = window.__smileGarden; return ${expr}; })()`);

    async function waitFor(desc, pred, timeoutMs) {
        const t0 = Date.now();
        while (Date.now() - t0 < (timeoutMs || 60000)) {
            if (await pred(await ds())) return;
            await sleep(120);
        }
        throw new Error(`timeout waiting for ${desc}`);
    }

    let frame = 0;
    async function grab() {
        const img = await wc.capturePage();
        const name = `frame-${String(frame).padStart(4, '0')}.png`;
        fs.writeFileSync(path.join(outDir, name), img.toPNG());
        frame += 1;
        return name;
    }

    /** Capture at ~fps for durationSec while the mock auto-player runs. */
    async function recordSeconds(durationSec, fps) {
        const interval = 1000 / (fps || 8);
        const tEnd = Date.now() + durationSec * 1000;
        while (Date.now() < tEnd) {
            const t0 = Date.now();
            await grab();
            const spent = Date.now() - t0;
            const wait = Math.max(0, interval - spent);
            if (wait) await sleep(wait);
        }
    }

    console.log('[demo] waiting for ready…');
    await waitFor('ready', (d) => d.ready === '1');
    await G('g.reset()');
    await G(`g.setLightingOverride('midday')`);
    await sleep(500);
    await G('g.ackWellness()');
    await sleep(300);
    if ((await ds()).screen !== 'camera-check') await G('g.openCameraCheck()');
    await waitFor('camera check', (d) => d.screen === 'camera-check', 25000);
    await G('g.markAllCameraChecksPassed()');
    await sleep(300);
    await G('g.finishCameraCheck()');
    await sleep(400);
    await G('g.prepCaptureGarden()');
    await G('g.show("idle")');
    await sleep(400);

    // Tomato bed (plot 2): needs water + fertilizer; good visible care FX.
    const plot = 2;
    await G(`g.setNeedsCardDemo(${plot}, { sun: 2, water: 0, fertilizer: 0, stake: false })`);
    await sleep(400);
    await G('g.setChartForCapture(true)');
    await G('g.setMockPipForCapture(true, { stream: true })');
    await sleep(300);

    // Title beat: garden + open needs
    console.log('[demo] idle beat');
    await recordSeconds(1.5, 6);

    // Smile → water (hold smile so the meter + drops stay clearly on)
    console.log('[demo] smile → water');
    let step = await G(`g.startCare('water')`);
    console.log('[demo] step after startCare(water):', step);
    await G(`(() => {
        const g = window.__smileGarden;
        const s = g && g.source;
        if (s && s.setPhase) s.setPhase('care-smile');
        if (s && s.setKeys) s.setKeys({ smile: true, talk: false, hide: false, tiltLeft: false, tiltRight: false });
        if (g.setSignalPanelDemoForCapture) g.setSignalPanelDemoForCapture('smile');
        if (g.setTendStripActiveForCapture) g.setTendStripActiveForCapture('water');
        return true;
    })()`);
    await recordSeconds(8, 8);

    // Talk → fertilizer
    console.log('[demo] talk → fertilize');
    await G(`g.setNeedsCardDemo(${plot}, { sun: 2, water: 2, fertilizer: 0, stake: false })`);
    step = await G(`g.startCare('fertilizer')`);
    console.log('[demo] step after startCare(fertilizer):', step);
    await G(`(() => {
        const g = window.__smileGarden;
        const s = g && g.source;
        if (s && s.setPhase) s.setPhase('care-talk');
        if (s && s.setKeys) s.setKeys({ smile: false, talk: true, hide: false, tiltLeft: false, tiltRight: false });
        if (g.setSignalPanelDemoForCapture) g.setSignalPanelDemoForCapture('talk');
        if (g.setTendStripActiveForCapture) g.setTendStripActiveForCapture('fertilizer');
        return true;
    })()`);
    await recordSeconds(8, 8);

    // Brief hub / done beat
    console.log('[demo] closing beat');
    await G(`(() => {
        const g = window.__smileGarden;
        const s = g && g.source;
        if (s && s.setKeys) s.setKeys({ smile: false, talk: false, hide: false, tiltLeft: false, tiltRight: false });
        return true;
    })()`);
    await G(`g.setNeedsCardDemo(${plot}, { sun: 2, water: 2, fertilizer: 2, stake: false })`);
    await G(`(() => { const s = window.__smileGarden?.source; if (s) s.setPhase('care-hub'); return true; })()`);
    await recordSeconds(2, 6);

    fs.writeFileSync(
        path.join(outDir, 'meta.json'),
        JSON.stringify({ frames: frame, note: 'smile→water, talk→fertilizer (no breathe)' }, null, 2)
    );
    console.log('[demo] wrote', frame, 'frames to', outDir);
    app.quit();
}

module.exports = { run };
