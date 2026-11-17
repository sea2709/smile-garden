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

async function runTimeArt(win, outDir) {
    const wc = win.webContents;
    const js = (code) => wc.executeJavaScript(code, true);
    const G = (expr) => js(`(() => { const g = window.__smileGarden; return ${expr}; })()`);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitHud = async () => {
        const t0 = Date.now();
        while (Date.now() - t0 < 35000) {
            const ok = await G('g.waitForHudArt(800)');
            const canvasLogo = await js("document.body.dataset.canvasLogo");
            const brandW = await js("(() => { const i = document.getElementById('brand-logo-day'); return i && i.naturalWidth; })()");
            if (ok && canvasLogo === '1' && brandW > 0) return;
            await sleep(150);
        }
        throw new Error('timeout waiting for HUD art (logo/clock)');
    };
    const shot = async (name) => {
        await waitHud();
        await sleep(250);
        const img = await wc.capturePage();
        fs.writeFileSync(path.join(outDir, name), img.toPNG());
        console.log('[capture] wrote', name, img.getSize());
    };
    const shotTopBar2x = async (name) => {
        await waitHud();
        const bounds = await G(`(() => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 }))()`);
        const barH = 56;
        const rect = { x: 0, y: 0, width: bounds.w, height: barH };
        let img = await wc.capturePage(rect);
        if (bounds.dpr < 2) {
            const { nativeImage } = require('electron');
            const resized = nativeImage.createFromBuffer(img.toPNG()).resize({ width: bounds.w * 2, height: barH * 2 });
            fs.writeFileSync(path.join(outDir, name), resized.toPNG());
        } else {
            fs.writeFileSync(path.join(outDir, name), img.toPNG());
        }
        console.log('[capture] wrote', name, '(top bar)');
    };
    const lightingTo = async (l) => { await G(`g.setLightingOverride('${l}')`); await sleep(2000); await waitHud(); };
    const frame = async (fn) => { await fn(); await waitHud(); await sleep(350); };
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
        const ready = await js("document.body.dataset.ready === '1'");
        if (ready) break;
        await sleep(120);
    }
    await G('g.reset()');
    await G('gardenClock.pause()');
    await js(`(() => { const c = document.getElementById('chk-adult'); c.checked = true; c.dispatchEvent(new Event('change')); document.getElementById('btn-wellness-ok').click(); })()`);
    await sleep(800);
    await waitHud();
    await frame(async () => {
        await G('g.clearSeasonOverride()');
        await G('g.setGardenTime(6 * 60)');
        await G(`g.show('idle')`);
    });
    await shot('clock-dawn.png');
    await frame(async () => { await G('g.setGardenTime(12 * 60)'); });
    await shot('clock-noon.png');
    await shotTopBar2x('topbar-noon-2x.png');
    await frame(async () => { await G('g.setGardenTime(17 * 60 + 45)'); });
    await shot('clock-dusk.png');
    await frame(async () => { await G('g.setGardenTime(18 * 60)'); });
    await shot('clock-sunset-6pm.png');
    await frame(async () => { await G('g.setGardenTime(22 * 60)'); });
    await shot('clock-night.png');
    for (const [season, name] of [['spring', 'season-spring.png'], ['summer', 'season-summer.png'], ['autumn', 'season-autumn.png'], ['winter', 'season-winter.png']]) {
        await frame(async () => {
            await G(`g.setSeason('${season}')`);
            const mins = season === 'summer' ? 22 * 60 : 12 * 60;
            await G(`g.setGardenTime(${mins})`);
        });
        await shot(name);
    }
    await frame(async () => {
        await G('g.setGardenTime(22 * 60)');
        await G(`g.setSeason('summer')`);
    });
    await G('g.previewBedtimeGlow()');
    await sleep(300);
    await shot('bedtime-window-glow.png');
    await G('g.clearBedtimeLayers()');
    await G('g.previewMorningCard()');
    await sleep(1200);
    await shot('morning-card.png');
    await G(`g.show('idle')`);
    await frame(async () => {
        await G('g.clearSeasonOverride()');
        await G('g.setGardenTime(12 * 60)');
        await lightingTo('midday');
    });
    await shot('logo-day-full.png');
    await shotTopBar2x('topbar-logo-day-2x.png');
    await frame(async () => {
        await lightingTo('night');
        await G('g.setGardenTime(22 * 60)');
    });
    await shot('logo-night-full.png');
    await shotTopBar2x('topbar-logo-night-2x.png');
    const legacyDawn = path.join(outDir, 'clock-dawn.png');
    const legacyAlias = path.join(outDir, 'clock-dawn-6am.png');
    if (fs.existsSync(legacyDawn)) fs.copyFileSync(legacyDawn, legacyAlias);
}

async function run(win, outDir) {
    if (process.env.SMILE_GARDEN_TIME_SHOTS === '1') {
        await runTimeArt(win, outDir);
        app.quit();
        return;
    }
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
    await sleep(10200); // second breath, mid in-breath
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

    await runTimeArt(win, outDir);
    app.quit();
}

module.exports = { run };
