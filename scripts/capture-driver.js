// scripts/capture-driver.js — dev-only screenshot automation (mock mode).
//
// Loaded by main.js only when SMILE_GARDEN_CAPTURE_DIR is set AND the app runs
// in mock mode (with a throwaway userData profile). Drives the daily-visit UI
// through window.__smileGarden and saves PNGs with webContents.capturePage().

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function probeBitmap(buf) {
    const { nativeImage } = require('electron');
    const img = nativeImage.createFromBuffer(buf.toPNG());
    const { width: w, height: h } = img.getSize();
    return { w, h, data: img.toBitmap() };
}

function sampleRgb(data, w, h, ax, ay) {
    const x = Math.round(ax);
    const y = Math.round(ay);
    if (x < 0 || y < 0 || x >= w || y >= h) return [0, 0, 0];
    const off = (y * w + x) * 4;
    return [data[off + 2], data[off + 1], data[off]];
}

async function assertPlanted(wc, min) {
    const n = await wc.executeJavaScript(`Number(document.body.dataset.planted || 0)`, true);
    if (n < min) throw new Error(`expected planted >= ${min}, got ${n}`);
    return n;
}

async function assertLighting(wc, expected) {
    const list = Array.isArray(expected) ? expected : [expected];
    const lit = await wc.executeJavaScript(`document.body.dataset.lighting || ''`, true);
    if (!list.includes(lit)) throw new Error(`expected lighting ${list.join('|')}, got ${lit}`);
}

async function waitTendStrip(wc, opts) {
    const want = (opts && opts.plant) || '';
    const meta = await wc.executeJavaScript(`(() => {
        const el = document.getElementById('tend-strip');
        const name = document.getElementById('tend-name')?.textContent || '';
        return {
            visible: el && !el.hidden,
            name,
            lit: document.body.dataset.lighting || '',
        };
    })()`, true);
    if (!meta.visible) throw new Error('tend strip hidden');
    if (want && !new RegExp(want, 'i').test(meta.name)) throw new Error(`tend strip plant wrong: ${meta.name}`);
    return meta;
}

async function waitPlantSprite(wc, ax, ay, minPlanted) {
    await assertPlanted(wc, minPlanted == null ? 4 : minPlanted);
    const buf = await wc.capturePage();
    const { w, h, data } = probeBitmap(buf);
    const sx = Math.round((w / 1280) * ax);
    const sy = Math.round((h / 720) * ay);
    let foliage = 0;
    for (let dy = -22; dy <= 22; dy++) {
        for (let dx = -22; dx <= 22; dx++) {
            const [r, g, b] = sampleRgb(data, w, h, sx + dx, sy + dy);
            const sum = r + g + b;
            const soil = r > 95 && g < 95 && b < 85;
            const plant = sum > 110 && !soil && (g > 55 || (r > 70 && g > 35));
            if (plant) foliage++;
        }
    }
    if (foliage < 10) throw new Error(`plant foliage weak at (${ax},${ay}) (${foliage})`);
    return foliage;
}

async function waitTagFacePaint(wc, spotKey, opts) {
    const o = opts || {};
    const spot = await wc.executeJavaScript(`(() => {
        const ART = window.SmileArt;
        const s = ART && ART.needs && ART.needs.tagSpots['${spotKey}'];
        const fb = ART && ART.needs && ART.needs.tag && ART.needs.tag.faceBox;
        return s ? { x: s.anchor[0], y: s.anchor[1], faceDy: fb ? (fb[1] + fb[3]) / 2 - 120 : -70 } : null;
    })()`, true);
    if (!spot) throw new Error('tag spot missing');
    await assertPlanted(wc, o.minPlanted || 4);
    const buf = await wc.capturePage();
    const { w, h, data } = probeBitmap(buf);
    const sx = Math.round((w / 1280) * spot.x);
    const sy = Math.round((h / 720) * (spot.y + (o.faceDy != null ? o.faceDy : spot.faceDy)));
    let painted = 0;
    let bloom = 0;
    for (let dy = -12; dy <= 12; dy++) {
        for (let dx = -12; dx <= 12; dx++) {
            const [r, g, b] = sampleRgb(data, w, h, sx + dx, sy + dy);
            const sum = r + g + b;
            if (sum < 70) continue;
            if (r > 175 && g > 130 && b < 120) continue; /* bare soil */
            if (r > 210 && g > 210 && b > 205) continue; /* wooden tag */
            painted++;
            if (g > 120 && r > 140 && b < 110) bloom++;
            if (g > 150 && r < 120) bloom++; /* resting leaf */
        }
    }
    if (painted < (o.minPainted || 10)) throw new Error(`tag face weak at ${spotKey} (${painted})`);
    if (o.requireBloom && bloom < (o.minBloom || 4)) throw new Error(`tag bloom/rest weak at ${spotKey} (${bloom})`);
    return { painted, bloom };
}

async function runTimeArt(win, outDir) {
    const wc = win.webContents;
    const js = (code) => wc.executeJavaScript(code, true);
    const G = (expr) => js(`(() => { const g = window.__smileGarden; return ${expr}; })()`);
    const assertHudLayouts = async (widths) => {
        const list = widths || [1280, 1100, 960];
        for (const w of list) {
            win.setMinimumSize(720, 640);
            win.setContentSize(w, 800);
            await sleep(450);
            await waitHud();
            const r = await G('g.auditHudLayout()');
            if (!r || !r.ok) {
                console.warn('[capture] hud layout @', w, JSON.stringify(r));
                throw new Error(`HUD overlaps painted clock at width ${w}`);
            }
            console.log('[capture] hud layout ok @', w);
        }
        win.setContentSize(1280, 800);
        await sleep(300);
        await waitHud();
    };
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
        const barH = Math.ceil(118 * (bounds.h / 720));
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
    await G('g.gardenClock.pause()');
    await js(`(() => { const c = document.getElementById('chk-adult'); c.checked = true; c.dispatchEvent(new Event('change')); document.getElementById('btn-wellness-ok').click(); })()`);
    await sleep(800);
    await waitHud();
    await assertHudLayouts([1280, 1100, 960]);
    await frame(async () => {
        await G('g.clearSeasonOverride()');
        await G('g.setGardenTime(6 * 60)');
        await G(`g.show('idle')`);
    });
    await shot('clock-dawn.png');
    await shotTopBar2x('topbar-dawn-6am-2x.png');
    await frame(async () => { await G('g.setGardenTime(12 * 60)'); });
    const probeNoon = await G('g.probeClockSunToken()');
    if (!probeNoon || !probeNoon.ok || (probeNoon.pixel && probeNoon.pixel.a < 48)) {
        console.warn('[capture] clock sun probe', JSON.stringify(probeNoon));
        throw new Error('sun token not visible on canvas at noon (probe failed)');
    }
    await shot('clock-noon.png');
    await shotTopBar2x('topbar-noon-2x.png');
    await frame(async () => { await G('g.setGardenTime(17 * 60 + 45)'); });
    await shot('clock-dusk.png');
    await frame(async () => { await G('g.setGardenTime(18 * 60)'); });
    await shot('clock-sunset-6pm.png');
    await shotTopBar2x('topbar-dusk-6pm-2x.png');
    await frame(async () => { await G('g.setGardenTime(22 * 60)'); });
    const probeNight = await G('g.probeClockMoonToken()');
    if (!probeNight || !probeNight.ok || probeNight.moonAlpha < 0.9 || (probeNight.pixel && probeNight.pixel.a < 48)) {
        console.warn('[capture] clock moon probe', JSON.stringify(probeNight));
        throw new Error('moon token not visible on canvas at 22:00 (probe failed)');
    }
    await shot('clock-night.png');
    await shotTopBar2x('topbar-night-2x.png');
    await assertHudLayouts([1280, 1100, 960]);
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

async function runTagsArt(win, outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const wc = win.webContents;
    const js = (code) => wc.executeJavaScript(code, true);
    const ds = () => js('Object.assign({}, document.body.dataset)');
    const G = (expr) => js(`(() => { const g = window.__smileGarden; return ${expr}; })()`);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function waitFor(desc, pred, timeoutMs) {
        const t0 = Date.now();
        while (Date.now() - t0 < (timeoutMs || 60000)) {
            if (await pred(await ds())) return;
            await sleep(120);
        }
        throw new Error(`timeout waiting for ${desc}`);
    }
    const tagShotHashes = new Set();
    const shot = async (name, { uniqueTag } = {}) => {
        await sleep(500);
        await G('g.captureRedraw()');
        const img = await wc.capturePage();
        const png = img.toPNG();
        const hash = crypto.createHash('md5').update(png).digest('hex');
        if (uniqueTag) {
            if (tagShotHashes.has(hash)) throw new Error(`duplicate tag garden png hash for ${name} (${hash})`);
            tagShotHashes.add(hash);
        }
        fs.writeFileSync(path.join(outDir, name), png);
        console.log('[capture] wrote', name, img.getSize(), hash.slice(0, 8));
    };
    const lightingTo = async (l) => { await G(`g.setLightingOverride('${l}')`); await sleep(1400); };
    await waitFor('ready', (d) => d.ready === '1');
    await G('g.reset()');
    await js(`(() => { const c = document.getElementById('chk-adult'); c.checked = true; c.dispatchEvent(new Event('change')); document.getElementById('btn-wellness-ok').click(); })()`);
    await sleep(700);
    await lightingTo('midday');
    const planted = await G('g.prepCaptureGarden()');
    if (!planted || planted < 3) throw new Error(`prepCaptureGarden planted ${planted}`);
    await sleep(1400);
    await assertPlanted(wc, 4);

    await G(`g.applyTagGardenDemo('partial')`);
  await js(`window.__smileGarden.setNeedsCardDemo(2, { sun: 1, water: 0, fertilizer: 0, stake: false })`);
    await sleep(900);
    await waitTendStrip(wc, { plant: 'tomato' });
    await shot('needs-card-tomato-partial-day.png');

    await G(`g.clearCaptureVisit()`);
    await G(`g.prepCaptureGarden()`);
    await G(`g.applyTagGardenDemo('complete')`);
    await sleep(1200);
    await waitPlantSprite(wc, 761, 300);
    await waitTagFacePaint(wc, 'bed3', { minPainted: 14 });
    await shot('needs-tag-complete-soil-day.png', { uniqueTag: true });

    await G(`g.setGardenTime(420)`);
    await G(`g.prepCaptureGarden()`);
    await G(`g.applyTagGardenDemo('resting')`);
    await sleep(1200);
    await waitPlantSprite(wc, 761, 300);
    await waitTagFacePaint(wc, 'bed3', { minPainted: 10, faceDy: -55 });
    await shot('needs-tag-resting-morning-day.png', { uniqueTag: true });

    await lightingTo('night');
    await G('g.setGardenTime(22 * 60)');
    await assertLighting(wc, 'night');
    await G(`g.prepCaptureGarden()`);
    await G(`g.applyTagGardenDemo('complete')`);
    await sleep(1200);
    await assertLighting(wc, 'night');
    await waitPlantSprite(wc, 761, 300);
    await waitTagFacePaint(wc, 'bed3', { minPainted: 14 });
    await shot('needs-tag-night.png', { uniqueTag: true });

    await lightingTo('night');
    await G('g.setGardenTime(22 * 60)');
    await G(`g.clearCaptureVisit()`);
    await js(`window.__smileGarden.setNeedsCardDemo(2, { sun: 2, water: 1, fertilizer: 0, stake: false })`);
    await sleep(900);
    await waitTendStrip(wc, { plant: 'tomato' });
    await assertLighting(wc, 'night');
    await shot('needs-card-tomato-partial-night.png');

    await G(`g.clearCaptureVisit()`);
    await lightingTo('midday');
    await G('g.setGardenTime(12 * 60)');
    await G(`g.prepCaptureGarden()`);
    await G(`g.applyTagGardenDemo('garden')`);
    await sleep(1200);
    await waitPlantSprite(wc, 761, 300);
    await waitPlantSprite(wc, 347, 300);
    await waitTagFacePaint(wc, 'bed3', { minPainted: 8 });
    await waitTagFacePaint(wc, 'bed1', { minPainted: 8 });
    await shot('needs-garden-tags-midday.png', { uniqueTag: true });
}

async function runPlantsClean(win, outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const wc = win.webContents;
    const js = (code) => wc.executeJavaScript(code, true);
    const G = (expr) => js(`(() => { const g = window.__smileGarden; return ${expr}; })()`);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const shot = async (name) => {
        await sleep(500);
        await G('g.captureRedraw()');
        const img = await wc.capturePage();
        fs.writeFileSync(path.join(outDir, name), img.toPNG());
        console.log('[capture] wrote', name, img.getSize());
    };
    const lightingTo = async (l) => { await G(`g.setLightingOverride('${l}')`); await sleep(1400); };
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
        const ready = await js("document.body.dataset.ready === '1'");
        if (ready) break;
        await sleep(120);
    }
    await G('g.reset()');
    await js(`(() => { const c = document.getElementById('chk-adult'); c.checked = true; c.dispatchEvent(new Event('change')); document.getElementById('btn-wellness-ok').click(); })()`);
    await sleep(700);
    await lightingTo('midday');
    await G('g.unlockSeedsForCapture()');
    await G('g.primeMaturePlantsForCapture()');
    await sleep(1600);
    await shot('plants-clean-mature-garden.png');
    await G('g.primePickedSpritesForCapture()');
    await sleep(1600);
    await shot('plants-clean-picked-garden.png');
}

async function runStakeArt(win, outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const wc = win.webContents;
    const js = (code) => wc.executeJavaScript(code, true);
    const G = (expr) => js(`(() => { const g = window.__smileGarden; return ${expr}; })()`);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const shot = async (name) => {
        await sleep(500);
        await G('g.captureRedraw()');
        const img = await wc.capturePage();
        fs.writeFileSync(path.join(outDir, name), img.toPNG());
        console.log('[capture] wrote', name, img.getSize());
    };
    const lightingTo = async (l) => { await G(`g.setLightingOverride('${l}')`); await sleep(1400); };
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
        const ready = await js("document.body.dataset.ready === '1'");
        if (ready) break;
        await sleep(120);
    }
    await G('g.reset()');
    await js(`(() => { const c = document.getElementById('chk-adult'); c.checked = true; c.dispatchEvent(new Event('change')); document.getElementById('btn-wellness-ok').click(); })()`);
    await sleep(700);
    await lightingTo('midday');
    await G('g.prepCaptureGarden()');
    await sleep(900);
    await G(`g.setStretchHudDemo('tilted-guide')`);
    await sleep(1200);
    const stemTilt = await js(`(() => {
        const el = document.getElementById('stretch-sunflower-stem');
        return el ? el.style.transform : '';
    })()`, true);
    if (!/rotate\s*\(\s*-2[0-9]/i.test(stemTilt)) throw new Error(`stretch stem not tilted: ${stemTilt}`);
    await shot('stake-guide-tilted.png');
    await G(`g.setStretchHudDemo('ring-midfill')`);
    await sleep(900);
    const ringSum = await js(`(() => {
        const c = document.getElementById('stretch-ring');
        if (!c) return 0;
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(88, 20, 24, 24).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
        return sum;
    })()`);
    if (ringSum < 400) throw new Error(`stretch vine ring fill weak (sum=${ringSum})`);
    const ringFrame = await G('g.stretchDemoSnap && g.stretchDemoSnap.ringFrame');
    if (ringFrame !== 7) throw new Error(`expected ring frame 7 for midfill, got ${ringFrame}`);
    const leftOnly = await js(`(() => {
        const row = document.querySelector('.stretch-rings');
        const rings = document.querySelectorAll('#stretch-ring').length;
        return { oldRow: !!(row && row.offsetParent), rings };
    })()`, true);
    if (leftOnly.oldRow) throw new Error('legacy dual ring row still visible');
    await shot('stake-ring-midfill.png');
    await G('g.clearStretchHudDemo()');
    await G(`g.show('idle')`);
    await G('g.prepStakedTomatoCapture()');
    await sleep(1400);
    await assertPlanted(wc, 1);
    await waitPlantSprite(wc, 761, 300, 1);
    await shot('garden-staked-tomato.png');
    await G('g.setStakedBed(6, true)');
    await sleep(1200);
    await shot('garden-staked-sunflower.png');
}

async function run(win, outDir) {
    if (process.env.SMILE_GARDEN_TAGS_SHOTS === '1') {
        await runTagsArt(win, outDir);
        app.quit();
        return;
    }
    if (process.env.SMILE_GARDEN_PLANTS_CLEAN === '1') {
        await runPlantsClean(win, outDir);
        app.quit();
        return;
    }
    if (process.env.SMILE_GARDEN_STAKE_SHOTS === '1') {
        await runStakeArt(win, outDir);
        app.quit();
        return;
    }
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
    async function shot(name, opts) {
        const o = opts || {};
        if (!o.keepPip) await G('g.prepareDomForScreenshot()');
        await sleep(200);
        const img = await wc.capturePage();
        fs.writeFileSync(path.join(outDir, name), img.toPNG());
        console.log('[capture] wrote', name, img.getSize());
    }
    async function captureSignalPanel(mode, opts) {
        const o = opts || {};
        await js('window.__smileGarden.setMockPipForCapture(false)');
        await G('g.setChartForCapture(true)');
        if (o.channel) await G(`g.setTendStripActiveForCapture(${JSON.stringify(o.channel)})`);
        await G(`g.setSignalPanelDemoForCapture("${mode}")`);
        if (o.channel && !o.skipTendStripWait) await waitTendStrip(wc);
        await sleep(200);
        await G('g.captureRedraw()');
        await sleep(350);
        await shot(`signal-panel-${mode}.png`);
    }
    async function prepCareDocShot(spec) {
        const { panel, channel, progress, mockPhase, idle } = spec || {};
        if (progress) await G(`g.setCareHubProgressForCapture(4, ${JSON.stringify(progress)})`);
        await G('g.setSelectedPlot(4)');
        if (mockPhase) {
            await G(`(() => { const s = window.__smileGarden?.source; if (s) s.setPhase('${mockPhase}'); return true; })()`);
        }
        await G('g.setChartForCapture(true)');
        if (idle) {
            await G(`g.setSignalPanelDemoForCapture('idle')`);
            await G('g.setTendStripActiveForCapture(null)');
        } else {
            await G(`g.setSignalPanelDemoForCapture('${panel}')`);
            if (channel) await G(`g.setTendStripActiveForCapture(${JSON.stringify(channel)})`);
            else await G('g.setTendStripActiveForCapture(null)');
        }
        await waitTendStrip(wc);
        await sleep(200);
        await G('g.captureRedraw()');
        await sleep(200);
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

    if (process.env.SMILE_GARDEN_STRIP_GLOW_ONLY === '1') {
        await waitFor('ready', (d) => d.ready === '1');
        await G('g.reset()');
        await lightingTo('midday');
        await G('g.ackWellness()');
        await sleep(300);
        if ((await ds()).screen !== 'camera-check') await G('g.openCameraCheck()');
        await waitFor('camera check', (d) => d.screen === 'camera-check', 25000);
        await G('g.markAllCameraChecksPassed()');
        await sleep(400);
        await G('g.finishCameraCheck()');
        await sleep(400);
        await G('g.prepCaptureGarden()');
        await G('g.show("idle")');
        await sleep(300);
        const daySmileProgress = { sun: 2, water: 1, fertilizer: 0, stake: false };
        await G(`g.setNeedsCardDemo(4, ${JSON.stringify(daySmileProgress)})`);
        await G('g.setChartForCapture(true)');
        await G(`g.setSignalPanelDemoForCapture('smile')`);
        await G(`g.setTendStripActiveForCapture('water')`);
        await G(`(() => { const s = window.__smileGarden?.source; if (s) s.setPhase('care-hub-smile'); return true; })()`);
        await G('g.setCaptureStripGlow(true)');
        await G(`g.setSignalPanelDemoForCapture('smile')`);
        await G(`g.setTendStripActiveForCapture('water')`);
        await sleep(200);
        await G('g.captureRedraw()');
        await sleep(80);
        await js(`(() => new Promise((resolve, reject) => {
            const row = document.querySelector('.tend-care[data-need="water"]');
            if (!row) return reject(new Error('no water row'));
            if (!row.classList.contains('is-active')) {
                return reject(new Error('water row not active demo=' + document.body.dataset.demoCareChannel + ' class=' + row.className));
            }
            const glow = row.querySelector('.tend-row-glow');
            if (!glow) return reject(new Error('no tend-row-glow img'));
            const done = () => {
                if (glow.naturalWidth > 0) resolve(true);
                else reject(new Error('glow image has zero size'));
            };
            if (glow.complete) done();
            else { glow.onload = () => done(); glow.onerror = () => reject(new Error('glow image failed to load')); }
        }))()`);
        await G('g.captureRedraw()');
        await sleep(120);
        await shot('tend-strip-active-glow.png');
        app.quit();
        return;
    }

    await waitFor('ready', (d) => d.ready === '1');
    await G('g.reset()');
    await lightingTo('dawn');
    await G(`g.show('wellness')`);
    await sleep(900);
    await shot('01-wellness-notice.png');

    await G(`g.ackWellness()`);
    await sleep(400);
    if ((await ds()).screen !== 'camera-check') {
        await G(`g.openCameraCheck()`);
        await sleep(400);
    }
    await waitFor('camera check', (d) => d.screen === 'camera-check', 25000);
    await shot('camera-check-initial.png');
    await js(`window.__smileGarden.setCameraCheckDemo({ passed: ['smile', 'talk'], active: 'breath' })`);
    await sleep(500);
    await shot('camera-check-mockup-states.png');
    await G(`g.setCameraCheckDemo({ passed: ['smile', 'talk'], active: 'breath' })`);
    await G('g.setBreathHudDemo("warming")');
    await sleep(500);
    await shot('camera-check-midway.png');
    await G(`g.selectCameraCheck('smile')`);
    await sleep(4200);
    await G(`g.selectCameraCheck('talk')`);
    await sleep(4200);
    await G(`g.selectCameraCheck('breath')`);
    await sleep(400);
    await G('g.selectCameraCheck("breath")');
    await sleep(6000);
    await G(`g.selectCameraCheck('stretch')`);
    await sleep(5000);
    await G('g.markAllCameraChecksPassed()');
    await sleep(500);
    await shot('camera-check-all-passed.png');
    await G('g.setCameraDeniedDemo(true)');
    await sleep(450);
    await shot('camera-check-denied.png');
    await G('g.setCameraDeniedDemo(false)');
    if (process.env.SMILE_GARDEN_CAPTURE_CAMERA_ONLY === '1') {
        app.quit();
        return;
    }
    await G('g.finishCameraCheck()');
    await sleep(800);
    await G('g.prepCaptureGarden()');
    await sleep(400);
    await captureSignalPanel('idle');
    await G('g.clearSignalPanelDemoForCapture()');
    await js('window.__smileGarden.setMockPipForCapture(false)');
    await G('g.clearCaptureVisit()');
    await sleep(400);
    await shot('02-garden-idle-dawn.png');

    await G('g.openPicker(4)');
    await sleep(1000);
    await shot('03-seed-picker.png');
    await G(`g.plant('cucumber', 4)`);
    await G(`g.plant('mint', 5)`);
    await G(`g.plant('lettuce', 1)`);
    await G('g.closePicker()');
    await sleep(1500);

    // --- a full visit at midday ---
    await lightingTo('midday');
    await js('window.__smileGarden.setMockPipForCapture(false)');
    await G('g.begin()');
    await waitFor('care hub', (d) => d.step === 'care-hub', 10000);
    await G('g.setChartForCapture(true)');
    await sleep(800);
    await shot('03b-selection-ring-visit.png');
    const cucumberPartial = { sun: 1, water: 1, fertilizer: 0, stake: false };
    const cucumberAllSet = { sun: 2, water: 3, fertilizer: 2, stake: true };
    await G(`g.setCareHubProgressForCapture(4, { sun: 1, water: 0, fertilizer: 0, stake: false })`);
    await captureSignalPanel('smile', { channel: 'water' });
    await G(`g.setCareHubProgressForCapture(4, { sun: 2, water: 1, fertilizer: 0, stake: false })`);
    await captureSignalPanel('talk', { channel: 'fertilizer' });
    await G('g.setSelectedPlot(4)');
    await G(`g.setCareHubProgressForCapture(4, { sun: 2, water: 2, fertilizer: 0, stake: true })`);
    await captureSignalPanel('stretch', { channel: 'stake' });
    const daySmileProgress = { sun: 2, water: 1, fertilizer: 0, stake: false };
    const dayIdleProgress = { sun: 2, water: 2, fertilizer: 0, stake: false };
    await prepCareDocShot({
        panel: 'smile',
        channel: 'water',
        progress: daySmileProgress,
        mockPhase: 'care-hub-smile',
    });
    await prepCareDocShot({
        panel: 'smile',
        channel: 'water',
        progress: daySmileProgress,
        mockPhase: 'care-hub-smile',
    });
    await shot('04-care-smile-midday.png');
    await prepCareDocShot({
        panel: 'smile',
        channel: 'water',
        progress: daySmileProgress,
        mockPhase: 'care-hub-smile',
    });
    await G('g.setCaptureStripGlow(true)');
    await G(`g.setSignalPanelDemoForCapture('smile')`);
    await G(`g.setTendStripActiveForCapture('water')`);
    await sleep(200);
    await G('g.captureRedraw()');
    await sleep(80);
    await js(`(() => new Promise((resolve, reject) => {
        const row = document.querySelector('.tend-care[data-need="water"]');
        if (!row) return reject(new Error('no water row'));
        if (!row.classList.contains('is-active')) {
            return reject(new Error('water row not active (demo=' + document.body.dataset.demoCareChannel + ')'));
        }
        const glow = row.querySelector('.tend-row-glow');
        if (!glow) return reject(new Error('no tend-row-glow img'));
        const done = () => {
            if (glow.naturalWidth > 0) resolve(true);
            else reject(new Error('glow image has zero size'));
        };
        if (glow.complete) done();
        else {
            glow.onload = () => done();
            glow.onerror = () => reject(new Error('glow image failed to load'));
        }
    }))()`);
    await G('g.captureRedraw()');
    await sleep(120);
    await shot('tend-strip-active-glow.png');
    await G('g.setCaptureStripGlow(false)');
    await js('window.__smileGarden.setMockPipForCapture(true, { stream: false })');
    await prepCareDocShot({
        panel: 'smile',
        channel: 'water',
        progress: daySmileProgress,
        mockPhase: 'care-hub-smile',
    });
    await sleep(200);
    await G('g.captureRedraw()');
    await shot('visit-camera-preview-clear.png', { keepPip: true });
    await js('window.__smileGarden.setMockPipForCapture(false)');
    await G('g.prepareDomForScreenshot()');
    await G(`g.setCareHubProgressForCapture(4, { sun: 2, water: 1, fertilizer: 0, stake: false })`);
    await G(`g.setSignalPanelDemoForCapture('talk')`);
    await G(`g.setTendStripActiveForCapture('fertilizer')`);
    await G(`(() => { const s = window.__smileGarden?.source; if (s) s.setPhase('care-hub-talk'); return true; })()`);
    await sleep(500);
    await shot('05-care-talk.png');
    await prepCareDocShot({ idle: true, progress: dayIdleProgress });
    await shot('tend-strip-day.png');
    await G('g.setSelectedPlot(1)');
    await G('g.setStretchHudDemo("left-hold")');
    await G(`g.setSignalPanelDemoForCapture('stretch')`);
    await G(`g.setTendStripActiveForCapture('stake')`);
    await G(`(() => { const s = window.__smileGarden?.source; if (s) s.setPhase('care-hub-stretch'); return true; })()`);
    await sleep(700);
    await shot('07e-stretch-left-hold.png');
    await shot('stake-guide-tilted.png');
    await G('g.setStretchHudDemo("done")');
    await G('g.clearStretchHudDemo()');
    await sleep(250);
    await G('g.setSelectedPlot(4)');
    await G(`g.setCareHubProgressForCapture(4, { sun: 3, water: 2, fertilizer: 1, stake: true })`);
    await G('g.setSelectedPlot(4)');
    await G('g.primeCareHarvestForCapture(4)');
    await captureSignalPanel('breathe', { channel: 'harvest', skipTendStripWait: true });
    await G(`g.setTendStripActiveForCapture('harvest')`);
    await G(`(() => { const s = window.__smileGarden?.source; if (s) s.setPhase('care-hub-breathe'); return true; })()`);
    await sleep(900);
    await G('g.captureRedraw()');
    await shot('07-care-harvest.png');
    await G('g.prepHarvestTendStripShot(4)');
    await G('g.setTendStripActiveForCapture("harvest")');
    await G('g.setCaptureStripGlow(false)');
    const harvestOk = await js(`(() => {
        const s = window.__smileGarden?.session;
        const strip = document.getElementById('tend-strip');
        if (!s || !strip || strip.hidden) return 'missing strip';
        if (!s.canCareHarvest(4)) return 'canCareHarvest false';
        if (!strip.classList.contains('tend-strip--harvest')) return 'no harvest class';
        if (document.body.dataset.screen !== 'visit') return 'screen not visit';
        return 'ok';
    })()`);
    if (harvestOk !== 'ok') throw new Error(`tend-strip-harvest preflight: ${harvestOk}`);
    await sleep(350);
    await G('g.captureRedraw()');
    await shot('tend-strip-harvest.png');
    await lightingTo('night');
    await G(`g.setCareHubProgressForCapture(4, { sun: 0, water: 1, fertilizer: 0, stake: false })`);
    await G(`g.setSignalPanelDemoForCapture('idle')`);
    await G('g.setTendStripActiveForCapture(null)');
    await sleep(600);
    await shot('tend-strip-night.png');
    await G('g.clearSignalPanelDemoForCapture()');
    await G('g.finishVisitForCapture()');
    await waitFor('visit end', (d) => d.screen === 'idle' || d.screen === 'summary', 25000);
    await sleep(600);
    if ((await ds()).screen === 'summary') {
        await waitFor('revealed', (d) => d.revealed === '1', 15000);
        await G(`g.previewSummaryDay({ grew: [{ plot: 4, plantId: 'cucumber', name: 'Cucumber', from: 3, to: 4, mature: false }], careStats: { sunDots: 3, waterDots: 2, fertilizerDots: 1, stakes: 0, harvests: 1 }, weekly: 2 })`);
        await sleep(800);
        await shot('08-summary-growth-day.png');
        await js(`document.getElementById('btn-sum-done').click()`);
    } else {
        await G(`g.previewSummaryDay({ grew: [{ plot: 4, plantId: 'cucumber', name: 'Cucumber', from: 3, to: 4, mature: false }], careStats: { sunDots: 3, waterDots: 2, fertilizerDots: 1, stakes: 0, harvests: 1 }, weekly: 2 })`);
        await sleep(1200);
        await shot('08-summary-growth-day.png');
        await G(`g.show('idle')`);
    }
    await G('g.previewSummaryNightQuiet()');
    await sleep(1200);
    await shot('08b-summary-quiet-night.png');
    await G(`g.show('idle')`);
    await lightingTo('midday');
    async function primeCucumberStripDemo(progress) {
        const staked = !!(progress && progress.stake);
        await js(`(() => {
            const st = window.__smileGarden?.state;
            const p = st?.plots?.[4];
            if (p) {
                p.stage = 3;
                p.picked = false;
                p.matureDay = null;
                p.matureWater = 0;
                p.matureFert = 0;
                p.staked = ${staked};
            }
            return true;
        })()`);
        await G(`g.setNeedsCardDemo(4, ${JSON.stringify(progress)})`);
        await sleep(600);
    }
    await primeCucumberStripDemo(cucumberPartial);
    await shot('care-needs-strip-day.png');
    await primeCucumberStripDemo(cucumberAllSet);
    await shot('care-needs-strip-all-set.png');
    await lightingTo('night');
    await primeCucumberStripDemo(cucumberPartial);
    await shot('care-needs-strip-night.png');
    await lightingTo('midday');
    await G('g.prepTagGardenDemo("garden")');
    await sleep(900);
    await G('g.captureRedraw()');
    await shot('care-needs-tags-garden.png');

    // --- a few days later, evening (still midday lighting) ---
    await G('g.simulateDays(2)');
    await G(`g.plant('tomato', 2)`);
    await G(`g.plant('lettuce', 6)`);
    await lightingTo('midday');
    await G(`g.show('idle')`);
    await sleep(2500);
    await G(`g.show('idle')`);
    await shot('09-evening-garden.png');
    await G('g.setStakedBed(2, true)');
    await sleep(800);
    await shot('09b-staked-plant-bed.png');
    await shot('garden-staked-tomato.png');
    await G(`g.plant('sunflower', 0)`);
    await G('g.simulateDays(12)');
  await G('g.setStakedBed(0, true)');
    await sleep(900);
    await shot('garden-staked-sunflower.png');
    await G('g.setStakedBed(4, false)');

    await lightingTo('midday');
    await G(`g.show('idle')`);
    await sleep(3500);
    await shot('critters-midday-garden.png');

    // --- a night visit: poor reading -> "turn on a light" ---
    await lightingTo('night');
    await G('g.setGardenTime(1320)');
    await G(`g.show('greeting')`);
    await sleep(800);
    await shot('10-greeting-night.png');
    await G('g.begin()');
    await waitFor('night care hub', (d) => d.step === 'care-hub', 10000);
    await G(`(() => { const s = window.__smileGarden?.source; if (s) s.setPhase('care-hub-smile'); return true; })()`);
    await waitFor('night light hint', (d) => d.hint === 'night-light', 20000);
    await sleep(500);
    await shot('11-night-light-hint.png');
    for (let i = 0; i < 30; i++) {
        const d = await ds();
        if (d.screen === 'summary' || d.step === 'summary') break;
        if (d.step === 'care-hub') await G(`(() => { const g = window.__smileGarden; if (g.session) g.session.finishCareHub(); return true; })()`);
        else if (d.step === 'pick') await G('g.confirmPick()');
        else await G('g.skip()');
        await sleep(280);
    }
    await waitFor('summary', (d) => d.screen === 'summary', 15000);
    await waitFor('revealed', (d) => d.revealed === '1', 15000);
    await G(`g.show('idle')`);
    await sleep(2500);
    await shot('12-night-garden-fireflies.png');

    // --- journal ---
    await lightingTo('midday');
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
    for (const [l, n] of [['midday', '16-full-garden-midday.png'], ['dawn', '17-full-garden-dawn.png'], ['night', '19-full-garden-night.png']]) {
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
