// scripts/capture-driver.js — dev-only screenshot automation (mock mode).
//
// Loaded by main.js only when SMILE_GARDEN_CAPTURE_DIR is set AND the app runs
// in mock mode (with a throwaway userData profile). Drives the daily-visit UI
// through window.__smileGarden and saves PNGs with webContents.capturePage().

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
    async function shot(name) {
        await sleep(200);
        const img = await wc.capturePage();
        fs.writeFileSync(path.join(outDir, name), img.toPNG());
        console.log('[capture] wrote', name, img.getSize());
    }
    async function breathUiShot(name, mode, countDone) {
        await G(`g.setBreathHudDemo(${JSON.stringify(mode)}, ${countDone})`);
        await sleep(450);
        await shot(name);
    }
    async function shotBreathHudCrop(name) {
        const rect = await js(`(() => {
            const rate = document.getElementById('breath-rate');
            const count = document.getElementById('breath-count');
            if (!rate || !count) return null;
            const r = rate.getBoundingClientRect();
            const c = count.getBoundingClientRect();
            const pad = 14;
            const x = Math.max(0, Math.min(r.left, c.left) - pad);
            const y = Math.max(0, Math.min(r.top, c.top) - pad);
            const w = Math.max(r.right, c.right) - x + pad;
            const h = Math.max(r.bottom, c.bottom) - y + pad;
            return { x, y, width: w, height: h };
        })()`);
        if (!rect) return;
        const bounds = await G(`({ w: window.innerWidth, dpr: window.devicePixelRatio || 1 })`);
        let img = await wc.capturePage(rect);
        if (bounds.dpr < 2) {
            const { nativeImage } = require('electron');
            img = nativeImage.createFromBuffer(img.toPNG()).resize({
                width: Math.round(rect.width * 2),
                height: Math.round(rect.height * 2),
            });
        }
        fs.writeFileSync(path.join(outDir, name), img.toPNG());
        console.log('[capture] wrote', name, '(breath hud crop)');
    }
    const lightingTo = async (l) => { await G(`g.setLightingOverride('${l}')`); await sleep(2000); };

    await waitFor('ready', (d) => d.ready === '1');
    await G('g.reset()');
    await lightingTo('dawn');
    await G(`g.show('wellness')`);
    await sleep(900);
    await shot('01-wellness-notice.png');

    await js(`(() => { const c = document.getElementById('chk-adult'); c.checked = true; c.dispatchEvent(new Event('change')); document.getElementById('btn-wellness-ok').click(); })()`);
    await sleep(1200);
    await shot('02-greeting-dawn.png');

    await G('g.openPicker(4)');
    await sleep(1000);
    await shot('03-seed-picker.png');
    await G(`g.plant('lettuce', 4)`);
    await G(`g.plant('mint', 5)`);
    await G(`g.plant('cucumber', 1)`);
    await G('g.closePicker()');
    await sleep(1500);

    // --- a full visit at midday ---
    await lightingTo('midday');
    await G('g.begin()');
    await waitFor('pick', (d) => d.step === 'pick', 10000);
    await sleep(1600);
    await shot('03b-selection-ring-visit.png');
    await G('g.confirmPick()');
    await waitFor('smiling', (d) => d.step === 'smile' && d.smiling === '1', 20000);
    await sleep(2600);
    await shot('04-smile-step-midday.png');
    await waitFor('talking', (d) => d.step === 'talk' && d.talking === '1', 40000);
    await sleep(1800);
    await shot('05-talk-step.png');
    await waitFor('breathe offer', (d) => d.step === 'breathe-offer', 40000);
    await sleep(700);
    await shot('06-breathing-choice.png');
    await js(`document.getElementById('btn-breathe-start').click()`);
    await waitFor('breathing', (d) => d.step === 'breathe', 5000);
    await breathUiShot('07a-breath-rate-warming.png', 'warming', 0);
    await breathUiShot('07b-breath-rate-settling.png', 'settling', 2);
    await breathUiShot('07c-breath-rate-stable.png', 'stable', 3);
    await shotBreathHudCrop('07-breath-pill-count-2x.png');
    await G('g.clearBreathHudDemo()');
    await sleep(6200);
    await shot('07-breathing-step.png');
    await waitFor('2 breaths', (d) => Number(d.breath) >= 2, 30000);
    await js(`document.getElementById('btn-skip').click()`);
    for (let i = 0; i < 30; i++) {
        const d = await ds();
        if (d.screen === 'summary' || d.step === 'summary') break;
        if (d.step === 'pick') await G('g.confirmPick()');
        else await G('g.skip()');
        await sleep(280);
    }
    await waitFor('summary', (d) => d.screen === 'summary', 15000);
    await sleep(1500);
    await shot('08-summary-growth.png');
    await waitFor('revealed', (d) => d.revealed === '1', 15000);
    await js(`document.getElementById('btn-sum-done').click()`);

    // --- a few days later, golden hour ---
    await G('g.simulateDays(2)');
    await G(`g.plant('tomato', 2)`);
    await G(`g.plant('lettuce', 6)`);
    await lightingTo('golden-hour');
    await G(`g.show('idle')`);
    await sleep(2500);
    await G(`g.show('idle')`);
    await shot('09-golden-hour-garden.png');

    await lightingTo('midday');
    await G(`g.show('idle')`);
    await sleep(3500);
    await shot('critters-midday-garden.png');

    // --- a night visit: poor reading -> "turn on a light" ---
    await G('g.nextDay()');
    await lightingTo('night');
    await G(`g.show('greeting')`);
    await sleep(800);
    await shot('10-greeting-night.png');
    await G('g.begin()');
    await G('g.confirmPick()');
    await waitFor('night light hint', (d) => d.hint === 'night-light', 20000);
    await sleep(500);
    await shot('11-night-light-hint.png');
    for (let i = 0; i < 30; i++) {
        const d = await ds();
        if (d.screen === 'summary' || d.step === 'summary') break;
        if (d.step === 'pick') await G('g.confirmPick()');
        else await G('g.skip()');
        await sleep(280);
    }
    await waitFor('summary', (d) => d.screen === 'summary', 15000);
    await waitFor('revealed', (d) => d.revealed === '1', 15000);
    await G(`g.show('idle')`);
    await sleep(2500);
    await shot('12-night-garden-fireflies.png');

    // --- journal ---
    await lightingTo('golden-hour');
    await G(`g.openJournal('diary')`);
    await sleep(800);
    await shot('13-journal-diary.png');
    await G(`g.openJournal('plants')`);
    await sleep(500);
    await shot('14-journal-my-plants.png');
    await G(`g.openJournal('library')`);
    await sleep(500);
    await shot('15-journal-seed-library.png');
    await G('g.closeJournal()');

    // --- a fuller garden with mature plants, in all four lights ---
    await G('g.simulateDays(2)');
    await G(`g.plant('sunflower', 0)`);
    await G(`g.plant('apple', 3)`);
    await G(`g.plant('tomato', 7)`);
    await G('g.simulateDays(14)');
    await sleep(1600);
    await G(`g.show('idle')`);
    for (const [l, n] of [['midday', '16-full-garden-midday.png'], ['dawn', '17-full-garden-dawn.png'], ['golden-hour', '18-full-garden-golden-hour.png'], ['night', '19-full-garden-night.png']]) {
        await lightingTo(l);
        await sleep(1200);
        await shot(n);
    }
    await lightingTo('midday');
    await G('g.toggleDev(true)');
    await sleep(600);
    await shot('20-demo-tools.png');
    app.quit();
}

module.exports = { run };
