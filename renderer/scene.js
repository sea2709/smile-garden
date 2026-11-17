// renderer/scene.js — the painted garden, drawn on one <canvas>.
//
// Painted layers (backdrop + plant sprites from assets/) with soft,
// code-driven motion on top:
//   * gentle sway (a shear anchored at each plant's soil line)
//   * light motes by day, fireflies at night (code-drawn; see README)
//   * sun shafts that brighten while you smile
//   * drifting water drops while you talk, fertilizer flecks while you breathe
//   * a crossfade + soft bloom when a plant reaches a new stage
//   * a slow crossfade between lighting backdrops
// Everything is drawn in backdrop pixels (1280x720) and scaled to "cover".

(function () {
    'use strict';
    const ART = window.SmileArt;
    const L = window.SmileLogic;
    const Care = window.SmileCareNeeds;
    const TAU = Math.PI * 2;

    function loadImage(src) {
        const img = new Image();
        img.decoding = 'async';
        img.src = src;
        return img;
    }
    const ready = (img) => img && img.complete && img.naturalWidth > 0;

    function createScene(canvas) {
        const ctx = canvas.getContext('2d');
        const resolveArt = (rel) => {
            try { return new URL(rel, window.location.href).href; } catch { return rel; }
        };
        const bgImgs = {};
        for (const [k, src] of Object.entries(ART.backgrounds)) bgImgs[k] = loadImage(src);
        const seasonOverlayImgs = {};
        const seasonNames = ['spring', 'summer', 'autumn', 'winter'];
        if (ART.seasons) {
            for (const s of seasonNames) {
                seasonOverlayImgs[s] = {
                    day: loadImage(ART.seasons.overlaySrc(s, 'day')),
                    night: loadImage(ART.seasons.overlaySrc(s, 'night')),
                };
            }
        }
        const particleImgs = {};
        if (ART.seasons && ART.seasons.particlePools) {
            const keys = new Set();
            for (const list of Object.values(ART.seasons.particlePools)) {
                for (const k of list) keys.add(k);
            }
            for (const k of keys) particleImgs[k] = loadImage(ART.seasons.particleSrc(k));
        }
        const clockFrameImgs = ART.clock ? {
            day: loadImage(resolveArt(ART.clock.frameSrc('day'))),
            night: loadImage(resolveArt(ART.clock.frameSrc('night'))),
        } : { day: null, night: null };
        const clockFrontImgs = ART.clock ? {
            day: loadImage(resolveArt(ART.clock.frontSrc('day'))),
            night: loadImage(resolveArt(ART.clock.frontSrc('night'))),
        } : { day: null, night: null };
        const clockSunImg = ART.clock ? loadImage(resolveArt(ART.clock.sunSrc)) : null;
        const clockMoonImg = ART.clock ? loadImage(resolveArt(ART.clock.moonSrc)) : null;
        const clockRibbonImgs = ART.clock ? {
            day: loadImage(resolveArt(ART.clock.ribbonSrc('day'))),
            night: loadImage(resolveArt(ART.clock.ribbonSrc('night'))),
        } : { day: null, night: null };
        const bedtimeGlowImg = ART.bedtime ? loadImage(resolveArt(ART.bedtime.windowGlow)) : null;
        const bedtimeDarkImg = ART.bedtime ? loadImage(resolveArt(ART.bedtime.windowDark)) : null;
        const plantImgs = {};
        const pickedImgs = {};
        for (const id of Object.keys(ART.plants)) {
            plantImgs[id] = [null];
            for (let s = 1; s <= 5; s++) plantImgs[id].push(loadImage(ART.plantSrc(id, s)));
            const ps = ART.plantPickedSrc(id);
            if (ps) pickedImgs[id] = loadImage(ps);
        }

        const decorImgs = {};
        if (ART.decor) for (const id of ART.decor.ids) {
            decorImgs[id] = { day: loadImage(ART.decor.src(id, 'day')), night: loadImage(ART.decor.src(id, 'night')) };
        }
        const readyStrips = { day: null, night: null };
        const harvestStrips = {};
        const genericHarvest = { day: null, night: null };
        const produceImgs = {};
        const basketImg = (ART.produce && ART.produce.basket) ? loadImage(ART.produce.basket) : null;
        const stakeImgs = { tall: null, short: null };
        if (ART.stretch) {
            stakeImgs.tall = loadImage(resolveArt(ART.stretch.stakeTallDay));
            stakeImgs.short = loadImage(resolveArt(ART.stretch.stakeShortDay));
        }
        const logoDayImg = (ART.ui && ART.ui.logoDay) ? loadImage(resolveArt(ART.ui.logoDay)) : null;
        const logoNightImg = (ART.ui && ART.ui.logoNight) ? loadImage(resolveArt(ART.ui.logoNight)) : null;
        let logoOnCanvas = false;
        function refreshLogoOnCanvas() {
            logoOnCanvas = ready(logoDayImg) || ready(logoNightImg);
        }
        if (logoDayImg) logoDayImg.addEventListener('load', refreshLogoOnCanvas);
        if (logoNightImg) logoNightImg.addEventListener('load', refreshLogoOnCanvas);
        if (ART.harvest) {
            readyStrips.day = loadImage(ART.readyStripSrc('day'));
            readyStrips.night = loadImage(ART.readyStripSrc('night'));
            genericHarvest.day = loadImage(ART.genericHarvestStripSrc('day'));
            genericHarvest.night = loadImage(ART.genericHarvestStripSrc('night'));
            for (const id of ART.harvest.plantIds) {
                harvestStrips[id] = {
                    day: loadImage(ART.harvestStripSrc(id, 'day')),
                    night: loadImage(ART.harvestStripSrc(id, 'night')),
                };
                if (ART.produce) produceImgs[id] = loadImage(ART.produce.src(id));
            }
        }

        const C = window.SmileCritters;
        const critterImgs = {};
        if (ART.critters && ART.critters.strips) {
            for (const key of Object.keys(ART.critters.strips)) {
                const src = ART.critterStripSrc(key);
                if (src) critterImgs[key] = loadImage(src);
            }
        }
        let reducedMotion = C && C.prefersReducedMotion();

        const fxImgs = {};
        if (ART.effects) for (const n of ART.effects.names) fxImgs[n] = loadImage(ART.effectSrc(n));
        const ringImgs = { day: [], night: [] };
        if (ART.selection) {
            for (let b = 1; b <= 8; b++) {
                ringImgs.day[b] = loadImage(ART.selection.src('day', b - 1));
                ringImgs.night[b] = loadImage(ART.selection.src('night', b - 1));
            }
        }
        const tendedSoilImgs = { day: [], night: [] };
        if (ART.tendedSoil) {
            for (let b = 1; b <= 8; b++) {
                tendedSoilImgs.day[b] = loadImage(resolveArt(ART.plantTendedSoilSrc('day', b - 1)));
                tendedSoilImgs.night[b] = loadImage(resolveArt(ART.plantTendedSoilSrc('night', b - 1)));
            }
        }
        const tagImgs = { day: null, night: null };
        const needsFaceImgs = {};
        if (ART.needs) {
            tagImgs.day = loadImage(resolveArt(ART.needs.plantTagDay));
            tagImgs.night = loadImage(resolveArt(ART.needs.plantTagNight));
            for (const key of ['sun', 'water', 'fertilizer', 'stake']) {
                needsFaceImgs[`${key}-day`] = loadImage(resolveArt(ART.needsIconSrc(key, 'day')));
                needsFaceImgs[`${key}-night`] = loadImage(resolveArt(ART.needsIconSrc(key, 'night')));
            }
            needsFaceImgs['bloom-day'] = loadImage(resolveArt(ART.needsBloomSrc('day')));
            needsFaceImgs['bloom-night'] = loadImage(resolveArt(ART.needsBloomSrc('night')));
            needsFaceImgs['rest-day'] = loadImage(resolveArt(ART.needsRestingSrc('day')));
            needsFaceImgs['rest-night'] = loadImage(resolveArt(ART.needsRestingSrc('night')));
            needsFaceImgs['dot-on-day'] = loadImage(resolveArt(ART.needsDotSrc(true, 'day')));
            needsFaceImgs['dot-off-day'] = loadImage(resolveArt(ART.needsDotSrc(false, 'day')));
            needsFaceImgs['dot-on-night'] = loadImage(resolveArt(ART.needsDotSrc(true, 'night')));
            needsFaceImgs['dot-off-night'] = loadImage(resolveArt(ART.needsDotSrc(false, 'night')));
        }
        const soilFadeT0 = new Array(8).fill(null);
        // one-shot absorb plays per plot: { kind, t0, i }
        const absorbs = [];
        const SPRITE_KINDS = { sun: 'sun', water: 'water', fert: 'fertilizer', stake: 'stake' };
        const fxWasOn = { sun: false, water: false, fert: false, stake: false };
        const FX_GAIN = { sun: 1.35, water: 1, fert: 1, stake: 1 };

        let rnd = mulberry(42);
        const view = { s: 1, ox: 0, oy: 0, cssW: 1, cssH: 1, dpr: 1 };
        let lighting = 'midday';
        let prevLighting = null;
        let lightFade = 1;
        /** @type {null | Record<string, number>} */
        let lightWeights = null;
        let season = 'spring';
        let daylight = true;
        let gardenClockMinutes = 360;
        let gardenClockLabel = '';
        let bedtimeGlow = 0;
        let bedtimeDark = 0;
        const SP = typeof window !== 'undefined' ? window.SmileSeasonParticles : null;
        const seasonParticleEngine = SP && ART.seasons && ART.seasons.particlePools
            ? SP.createEngine({
                width: ART.width,
                height: ART.height,
                pools: ART.seasons.particlePools,
                count: 12,
                seed: 42,
            })
            : null;
        let plots = new Array(8).fill(null);   // { plantId, stage, ready?, pickedSprite? }
        let decorPlacements = {}; // spotId -> decorId
        const harvestAnims = []; // { plot, plantId, t0, pull }
        let basketFlash = 0;
        const anims = new Array(8).fill(null); // stage / plant transitions
        const swayPhase = ART.plots.map((_, i) => i * 1.7 + 0.4);
        let highlight = null;   // plot index (picker target)
        let hover = null;
        let tendPlot = null;    // selected bed during a visit
        let tendRingPulse = false;
        let effectPlot = null;  // bed receiving sun/water/fert FX
        const fx = { sun: 0, sunTarget: 0, water: 0, waterTarget: 0, fert: 0, fertTarget: 0, breath: 0, stake: 0, stakeTarget: 0 };

        const motes = [];
        const fireflies = [];
        const drops = [];
        const ripples = [];
        const flecks = [];
        const sparkles = [];

        for (let i = 0; i < 46; i++) motes.push(newMote(true));
        for (let i = 0; i < 26; i++) fireflies.push(newFirefly());

        function mulberry(seed) {
            let a = seed >>> 0;
            return () => {
                a = (a + 0x6D2B79F5) >>> 0;
                let t = a;
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }

        function newMote(anywhere) {
            return {
                x: rnd() * ART.width,
                y: anywhere ? rnd() * ART.height * 0.85 : ART.height * (0.55 + rnd() * 0.3),
                r: 1.2 + rnd() * 2.6,
                vx: (rnd() - 0.5) * 6,
                vy: -(3 + rnd() * 7),
                ph: rnd() * TAU,
                life: 0,
                max: 8 + rnd() * 10,
            };
        }
        function newFirefly() {
            return {
                x: 80 + rnd() * (ART.width - 160),
                y: 250 + rnd() * 380,
                a: rnd() * TAU,
                sp: 6 + rnd() * 10,
                ph: rnd() * TAU,
                blink: 0.25 + rnd() * 0.35,
            };
        }

        function resize() {
            const dpr = window.devicePixelRatio || 1;
            const cssW = canvas.clientWidth || 1, cssH = canvas.clientHeight || 1;
            if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
                canvas.width = Math.round(cssW * dpr);
                canvas.height = Math.round(cssH * dpr);
            }
            const s = Math.max(cssW / ART.width, cssH / ART.height);
            Object.assign(view, { s, ox: (cssW - ART.width * s) / 2, oy: (cssH - ART.height * s) / 2, cssW, cssH, dpr });
        }

        function setLighting(l) {
            lightWeights = null;
            if (l === lighting) return;
            prevLighting = lighting;
            lighting = l;
            lightFade = 0;
            daylight = l !== 'night';
        }

        function setLightingBlend(weights) {
            const w = Object.assign({ dawn: 0, midday: 0, 'golden-hour': 0, night: 0 }, weights || {});
            let primary = 'midday';
            let best = -1;
            for (const k of ['dawn', 'midday', 'golden-hour', 'night']) {
                if ((w[k] || 0) > best) { best = w[k]; primary = k; }
            }
            if (primary !== lighting) {
                prevLighting = lighting;
                lighting = primary;
                lightFade = 0;
            }
            lightWeights = w;
            daylight = (w.night || 0) < 0.55;
        }

        function setSeason(s) {
            const next = s || 'spring';
            if (next === season) return;
            season = next;
            if (seasonParticleEngine) seasonParticleEngine.setSeason(next);
        }

        function logoLayerAlphas() {
            if (C && C.logoLayerAlphas) return C.logoLayerAlphas(lighting, prevLighting, lightFade);
            if (lightWeights) {
                const night = lightWeights.night || 0;
                return { day: 1 - night, night };
            }
            const day = lighting === 'night' ? 0 : 1;
            return { day, night: 1 - day };
        }

        function hudArtReady() {
            const logos = ready(logoDayImg) || ready(logoNightImg);
            const clock = ready(clockFrameImgs.day) || ready(clockFrameImgs.night);
            const tok = ready(clockSunImg) && ready(clockMoonImg);
            return logos && clock && tok;
        }

        function waitForHudArt(timeoutMs) {
            const limit = Math.max(500, Number(timeoutMs) || 25000);
            return new Promise((resolve) => {
                const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
                const tick = () => {
                    refreshLogoOnCanvas();
                    if (hudArtReady()) { resolve(true); return; }
                    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
                    if (now - t0 >= limit) { resolve(hudArtReady()); return; }
                    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(tick);
                    else setTimeout(tick, 32);
                };
                tick();
            });
        }

        function setGardenClock(minutes, label) {
            gardenClockMinutes = Number(minutes) || 0;
            if (label !== undefined) gardenClockLabel = String(label || '');
        }

        function setBedtimeGlow(alpha) {
            bedtimeGlow = Math.max(0, Math.min(1, Number(alpha) || 0));
        }

        function setBedtimeDark(alpha) {
            bedtimeDark = Math.max(0, Math.min(1, Number(alpha) || 0));
        }

        function overlayNightWeight() {
            if (lightWeights) return lightWeights.night || 0;
            return lighting === 'night' ? 1 : 0;
        }

        function particlePool() {
            if (seasonParticleEngine) return seasonParticleEngine.particlePool();
            const pools = ART.seasons && ART.seasons.particlePools;
            if (!pools || !SP) return [];
            return SP.particlePool(season, overlayNightWeight(), pools);
        }

        function setDecor(decorState) {
            decorPlacements = (decorState && decorState.placements) ? Object.assign({}, decorState.placements) : {};
        }

        /** plotsState: array of null | { plantId, stage, ready?, pickedSprite? }. */
        function setPlots(plotsState, opts) {
            const animate = !(opts && opts.instant);
            const now = performance.now() / 1000;
            for (let i = 0; i < 8; i++) {
                const raw = plotsState[i];
                const n = raw ? {
                    plantId: raw.plantId,
                    stage: raw.stage,
                    ready: !!raw.ready,
                    pickedSprite: !!raw.pickedSprite,
                    tendedToday: !!raw.tendedToday,
                    staked: !!raw.staked,
                    careAllMet: !!raw.careAllMet,
                    soilTended: !!raw.soilTended,
                    tagResting: !!raw.tagResting,
                    tagProgress: raw.tagProgress || null,
                } : null;
                const o = plots[i];
                if (n && n.soilTended && (!o || !o.soilTended)) soilFadeT0[i] = now;
                if (n && !n.soilTended) soilFadeT0[i] = null;
                if (animate && n && (!o || o.plantId !== n.plantId)) {
                    anims[i] = { kind: 'plant', t0: now, dur: 1.4, from: null, to: n.stage };
                    burst(i, 'soil');
                } else if (animate && n && o && o.stage !== n.stage) {
                    anims[i] = { kind: 'grow', t0: now, dur: 2.2, from: o.stage, to: n.stage };
                    burst(i, n.stage >= 5 ? 'bloom-big' : 'bloom');
                }
                plots[i] = n;
            }
        }

        /** Replay a growth bloom (summary reveals). */
        function playGrowth(i, from, to) {
            anims[i] = { kind: 'grow', t0: performance.now() / 1000, dur: 2.2, from, to };
            burst(i, to >= 5 ? 'bloom-big' : 'bloom');
        }

        function burst(i, kind) {
            const p = ART.plots[i];
            const n = kind === 'soil' ? 14 : kind === 'bloom-big' ? 40 : 24;
            for (let k = 0; k < n; k++) {
                const a = rnd() * TAU;
                const sp = kind === 'soil' ? 20 + rnd() * 40 : 18 + rnd() * 55;
                sparkles.push({
                    x: p.x + (rnd() - 0.5) * p.w * 0.4,
                    y: p.y - (kind === 'soil' ? 6 : 40 + rnd() * 90 * p.scale * 2),
                    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - (kind === 'soil' ? 25 : 12),
                    r: kind === 'soil' ? 2 + rnd() * 2.5 : 1.6 + rnd() * 2.8,
                    life: 0, max: 1.1 + rnd() * 1.2,
                    color: kind === 'soil' ? [120, 86, 52] : rnd() < 0.5 ? [255, 236, 170] : [214, 244, 190],
                    glow: kind !== 'soil',
                });
            }
        }

        function playAbsorb(kind, plot) {
            const t0 = performance.now() / 1000;
            const i = plot === null || plot === undefined ? effectPlot : plot;
            if (i === null || i === undefined) return;
            if (plots[i]) absorbs.push({ kind, i, t0 });
        }
        function setEffects(e) {
            if ('plot' in e) effectPlot = e.plot === null || e.plot === undefined ? null : e.plot;
            for (const k of ['sun', 'water', 'fert', 'stake']) {
                if (!(k in e)) continue;
                const on = clamp(e[k]) > 0.05;
                if (fxWasOn[k] && !on) playAbsorb(k, effectPlot);
                fxWasOn[k] = on;
            }
            if ('sun' in e) fx.sunTarget = clamp(e.sun);
            if ('water' in e) fx.waterTarget = clamp(e.water);
            if ('fert' in e) fx.fertTarget = clamp(e.fert);
            if ('stake' in e) fx.stakeTarget = clamp(e.stake);
            if ('breath' in e) fx.breath = clamp(e.breath);
        }
        const clamp = (x) => (x > 1 ? 1 : x < 0 || !Number.isFinite(x) ? 0 : x);

        function setHighlight(i) { highlight = i === null || i === undefined ? null : i; }
        function setHover(i) { hover = i; }
        function setTendSelection(plot, opts) {
            const o = opts || {};
            tendPlot = plot === null || plot === undefined ? null : plot;
            tendRingPulse = !!o.pulse;
        }

        function toArt(clientX, clientY) {
            const r = canvas.getBoundingClientRect();
            return { x: (clientX - r.left - view.ox) / view.s, y: (clientY - r.top - view.oy) / view.s };
        }
        function plotAt(clientX, clientY) {
            const { x, y } = toArt(clientX, clientY);
            for (let i = 0; i < ART.plots.length; i++) {
                const b = ART.plots[i].box;
                if (x >= b[0] - 12 && x <= b[2] + 12 && y >= b[1] - 50 && y <= b[3] + 14) return i;
            }
            return null;
        }
        /** Client-space centre of a plot (for floating labels). */
        function plotClient(i) {
            const p = ART.plots[i];
            const r = canvas.getBoundingClientRect();
            return { x: r.left + view.ox + p.x * view.s, y: r.top + view.oy + p.y * view.s, s: view.s };
        }

        // ------------------------------------------------------------------
        function update(dt, t) {
            lightFade = Math.min(1, lightFade + dt / 1.6);
            const k = 1 - Math.exp(-dt / 0.5);
            fx.sun += (fx.sunTarget - fx.sun) * k;
            fx.water += (fx.waterTarget - fx.water) * k;
            fx.fert += (fx.fertTarget - fx.fert) * k;
            fx.stake += (fx.stakeTarget - fx.stake) * k;

            const night = lighting === 'night';
            for (let i = 0; i < motes.length; i++) {
                const m = motes[i];
                m.life += dt;
                const lift = 1 + fx.sun * 1.5;
                m.x += (m.vx + Math.sin(t * 0.6 + m.ph) * 4) * dt;
                m.y += m.vy * dt * lift;
                if (m.life > m.max || m.y < -10) motes[i] = newMote(false);
            }
            if (night) {
                for (const f of fireflies) {
                    f.a += (Math.sin(t * 0.4 + f.ph) * 0.9) * dt;
                    f.x += Math.cos(f.a) * f.sp * dt;
                    f.y += Math.sin(f.a) * f.sp * dt * 0.6;
                    if (f.x < 40 || f.x > ART.width - 40) f.a = Math.PI - f.a;
                    if (f.y < 220 || f.y > 660) f.a = -f.a;
                }
            }
            // water drops while talking
            if (fx.water > 0.05 && effectPlot !== null && rnd() < fx.water * dt * 30) {
                const i = effectPlot;
                const p = ART.plots[i];
                drops.push({ x: p.x + (rnd() - 0.5) * p.w * 0.7, y: p.y - 260 - rnd() * 120, vy: 60 + rnd() * 40, ty: p.y - 4 + (rnd() - 0.5) * 10, r: 2.2 + rnd() * 1.8, sway: rnd() * TAU });
            }
            for (let i = drops.length - 1; i >= 0; i--) {
                const d = drops[i];
                d.vy += 120 * dt;
                d.y += d.vy * dt;
                d.x += Math.sin(t * 2 + d.sway) * 6 * dt;
                if (d.y >= d.ty) {
                    ripples.push({ x: d.x, y: d.ty, life: 0, max: 1.1 });
                    drops.splice(i, 1);
                }
            }
            for (let i = ripples.length - 1; i >= 0; i--) {
                ripples[i].life += dt;
                if (ripples[i].life > ripples[i].max) ripples.splice(i, 1);
            }
            // fertilizer flecks while breathing (spawn mostly on the out-breath)
            if (fx.fert > 0.05 && effectPlot !== null && rnd() < fx.fert * dt * 16 * (0.4 + (1 - fx.breath))) {
                const i = effectPlot;
                const p = ART.plots[i];
                flecks.push({ x: p.x + (rnd() - 0.5) * p.w * 0.9, y: p.y - 120 - rnd() * 60, ty: p.y - 2, vy: 16 + rnd() * 10, ph: rnd() * TAU, r: 1.8 + rnd() * 1.8, rot: rnd() * TAU, hue: rnd() });
            }
            for (let i = flecks.length - 1; i >= 0; i--) {
                const f = flecks[i];
                f.y += f.vy * dt;
                f.x += Math.sin(t * 1.3 + f.ph) * 14 * dt;
                f.rot += dt * 1.5;
                if (f.y >= f.ty) {
                    sparkles.push({ x: f.x, y: f.ty, vx: 0, vy: -8, r: 2.4, life: 0, max: 0.8, color: [200, 230, 150], glow: true });
                    flecks.splice(i, 1);
                }
            }
            for (let i = sparkles.length - 1; i >= 0; i--) {
                const s = sparkles[i];
                s.life += dt;
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                s.vx *= 1 - dt * 1.5;
                s.vy = s.vy * (1 - dt * 1.5) + (s.glow ? -6 : 60) * dt;
                if (s.life > s.max) sparkles.splice(i, 1);
            }
            updateSeasonParticles(dt, t);
        }

        // ------------------------------------------------------------------
        function drawSeasonOverlay() {
            const pair = seasonOverlayImgs[season];
            const nightW = overlayNightWeight();
            const dayW = 1 - nightW;
            let drew = false;
            if (pair) {
                if (ready(pair.day) && dayW > 0.01) {
                    ctx.save();
                    ctx.globalAlpha = dayW;
                    ctx.drawImage(pair.day, 0, 0, ART.width, ART.height);
                    ctx.restore();
                    drew = true;
                }
                if (ready(pair.night) && nightW > 0.01) {
                    ctx.save();
                    ctx.globalAlpha = nightW;
                    ctx.drawImage(pair.night, 0, 0, ART.width, ART.height);
                    ctx.restore();
                    drew = true;
                }
            }
            if (drew) return;
            const t = performance.now() / 1000;
            ctx.save();
            const a = 0.18 * (dayW + nightW * 0.65);
            if (season === 'spring') {
                for (let i = 0; i < 14; i++) {
                    const x = (i * 137.5 + t * 8) % ART.width;
                    const y = 80 + (i * 41) % 220;
                    ctx.fillStyle = `rgba(255, 182, 193, ${a})`;
                    ctx.beginPath();
                    ctx.ellipse(x, y, 5, 3, 0.3, 0, TAU);
                    ctx.fill();
                }
            } else if (season === 'summer') {
                for (let i = 0; i < 10; i++) {
                    const x = (i * 163 + t * 5) % ART.width;
                    const y = 100 + (i * 37) % 180;
                    ctx.fillStyle = `rgba(255, 236, 160, ${a * 0.6})`;
                    ctx.beginPath();
                    ctx.arc(x, y, 2.5, 0, TAU);
                    ctx.fill();
                }
            } else if (season === 'autumn') {
                for (let i = 0; i < 12; i++) {
                    const x = (i * 151 + t * 14) % ART.width;
                    const y = 60 + ((i * 53 + t * 18) % 280);
                    ctx.fillStyle = `rgba(210, 120, 50, ${a})`;
                    ctx.fillRect(x, y, 6, 3);
                }
            } else if (season === 'winter') {
                for (let i = 0; i < 30; i++) {
                    const x = (i * 97 + t * 4) % ART.width;
                    const y = (i * 31 + t * 8) % (ART.height * 0.55);
                    ctx.fillStyle = `rgba(240, 248, 255, ${a * 0.85})`;
                    ctx.fillRect(x, y, 2, 2);
                }
            }
            ctx.restore();
        }

        function updateSeasonParticles(dt, t) {
            if (!seasonParticleEngine) return;
            seasonParticleEngine.setNightWeight(overlayNightWeight());
            seasonParticleEngine.update(dt, t);
        }

        function drawSeasonParticleFallback(p) {
            const name = p.sprite || '';
            if (name.includes('petal') || name.includes('blossom') || name.includes('pollen')) {
                ctx.fillStyle = 'rgba(255, 182, 193, 0.75)';
                ctx.beginPath();
                ctx.ellipse(p.x, p.y, 5, 3, p.rot, 0, TAU);
                ctx.fill();
            } else if (name.includes('leaf') || name.includes('seed')) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = 'rgba(200, 110, 45, 0.8)';
                ctx.fillRect(-4, -2, 8, 4);
                ctx.restore();
            } else if (name.includes('firefly')) {
                ctx.fillStyle = 'rgba(230, 255, 120, 0.85)';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3, 0, TAU);
                ctx.fill();
            } else {
                ctx.fillStyle = 'rgba(245, 250, 255, 0.9)';
                ctx.fillRect(p.x, p.y, 2.5, 2.5);
            }
        }

        function drawSeasonParticles(t) {
            if (!ART.seasons || !seasonParticleEngine || !particlePool().length) return;
            const scale = ART.seasons.particleScale || 0.5;
            const disp = 64 * scale;
            const nightW = overlayNightWeight();
            ctx.save();
            ctx.globalAlpha = 0.55 + 0.35 * (1 - nightW);
            for (const p of seasonParticleEngine.particles) {
                const img = p.sprite ? particleImgs[p.sprite] : null;
                if (ready(img)) {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot);
                    ctx.drawImage(img, -disp / 2, -disp / 2, disp, disp);
                    ctx.restore();
                } else drawSeasonParticleFallback(p);
            }
            ctx.restore();
        }

        function clockPointFromFrame(fx, fy) {
            const L = typeof window !== 'undefined' ? window.SmileClockLayout : null;
            if (L && L.framePointToBackdrop) {
                return L.framePointToBackdrop(fx, fy, {
                    display: ART.clock.display,
                    framePixels: ART.clock.framePixels,
                });
            }
            const d = ART.clock.display;
            const scale = d.w / ART.clock.framePixels[0];
            return { x: d.cx - d.w / 2 + fx * scale, y: d.cy - d.h / 2 + fy * scale };
        }

        function blitClockToken(img, p, disp, alpha) {
            if (alpha < 0.02) return false;
            ctx.save();
            ctx.filter = 'none';
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = alpha;
            ctx.shadowBlur = 0;
            const [tw, th] = ART.clock.tokenPixels || [64, 64];
            if (ready(img)) {
                ctx.drawImage(img, 0, 0, tw, th, p.x - disp / 2, p.y - disp / 2, disp, disp);
                ctx.restore();
                return true;
            }
            ctx.fillStyle = '#f0b84a';
            ctx.beginPath();
            ctx.arc(p.x, p.y, disp * 0.32, 0, TAU);
            ctx.fill();
            ctx.restore();
            return true;
        }

        function sampleBackdrop(x, y) {
            resize();
            const px = Math.round((x * view.s + view.ox) * view.dpr);
            const py = Math.round((y * view.s + view.oy) * view.dpr);
            if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
                return { r: 0, g: 0, b: 0, a: 0, oob: true, px, py };
            }
            const d = ctx.getImageData(px, py, 1, 1).data;
            return { r: d[0], g: d[1], b: d[2], a: d[3], oob: false, px, py };
        }

        function drawClockBitmap(img, alpha, ox, oy, w, h) {
            if (!ready(img) || alpha < 0.02) return false;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.drawImage(img, ox, oy, w, h);
            ctx.restore();
            return true;
        }

        function drawGardenClockHud() {
            if (!ART.clock) return;
            const cfg = ART.clock;
            const { w, h } = cfg.display;
            const ox = cfg.display.cx - w / 2;
            const oy = cfg.display.cy - h / 2;
            const nightW = overlayNightWeight();
            const CARC = typeof window !== 'undefined' ? window.SmileClockArc : null;
            const tok = CARC ? CARC.clockTokenState(gardenClockMinutes) : null;

            let painted = false;
            if (tok) {
                const nf = tok.useNightFrame ? 1 : 0;
                painted = drawClockBitmap(clockFrameImgs.day, 1 - Math.max(nightW, nf), ox, oy, w, h)
                    || drawClockBitmap(clockFrameImgs.night, Math.max(nightW, nf), ox, oy, w, h);
            } else {
                painted = drawClockBitmap(clockFrameImgs.day, 1 - nightW, ox, oy, w, h)
                    || drawClockBitmap(clockFrameImgs.night, nightW, ox, oy, w, h);
            }

            const disp = cfg.tokenDisplay || 32;
            const tokenBehindHill = (deg) => {
                if (!CARC) return true;
                const fr = CARC.tokenFrameXY(deg);
                return fr.y >= cfg.arc.centerY - 1;
            };
            const drawToken = (img, deg, alpha, sun, behindHill) => {
                if (alpha < 0.03) return;
                const isBehind = tokenBehindHill(deg);
                if (behindHill !== undefined && isBehind !== behindHill) return;
                const fr = CARC ? CARC.tokenFrameXY(deg) : cfg.arc;
                const p = clockPointFromFrame(fr.x != null ? fr.x : cfg.arc.centerX, fr.y != null ? fr.y : cfg.arc.centerY);
                ctx.save();
                ctx.globalAlpha = alpha;
                if (ready(img)) ctx.drawImage(img, p.x - disp / 2, p.y - disp / 2, disp, disp);
                else {
                    ctx.fillStyle = sun ? '#f0b84a' : '#d8dce8';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, disp * 0.22, 0, TAU);
                    ctx.fill();
                }
                ctx.restore();
            };

            if (!painted && CARC) {
                ctx.save();
                ctx.strokeStyle = 'rgba(120, 95, 60, 0.45)';
                ctx.lineWidth = 2;
                const a0 = CARC.degToRad ? CARC.degToRad(cfg.arc.startDeg) : (cfg.arc.startDeg * Math.PI / 180);
                const a1 = CARC.degToRad ? CARC.degToRad(cfg.arc.endDeg) : (cfg.arc.endDeg * Math.PI / 180);
                const c = clockPointFromFrame(cfg.arc.centerX, cfg.arc.centerY);
                const r = cfg.arc.radius * (w / cfg.framePixels[0]);
                ctx.beginPath();
                ctx.arc(c.x, c.y, r, -a0, -a1, true);
                ctx.stroke();
                ctx.restore();
            }

            if (tok) {
                drawToken(clockSunImg, tok.sunDeg, tok.sunAlpha, true, true);
                drawToken(clockMoonImg, tok.moonDeg, tok.moonAlpha, false, true);
                const nf = tok.useNightFrame ? 1 : 0;
                drawClockBitmap(clockFrontImgs.day, 1 - Math.max(nightW, nf), ox, oy, w, h);
                drawClockBitmap(clockFrontImgs.night, Math.max(nightW, nf), ox, oy, w, h);
                drawToken(clockSunImg, tok.sunDeg, tok.sunAlpha, true, false);
                drawToken(clockMoonImg, tok.moonDeg, tok.moonAlpha, false, false);
            }

            const rb = cfg.ribbonDisplay;
            const ribNight = (tok && tok.useNightFrame) || nightW > 0.5;
            const rw = rb.w;
            const rh = rb.h;
            const rx = rb.cx - rw / 2;
            const ry = rb.cy - rh / 2;
            drawClockBitmap(clockRibbonImgs.day, ribNight ? 0 : 1, rx, ry, rw, rh);
            drawClockBitmap(clockRibbonImgs.night, ribNight ? 1 : 0, rx, ry, rw, rh);
            if (gardenClockLabel) {
                ctx.save();
                ctx.fillStyle = ribNight ? 'rgba(235, 228, 215, 0.96)' : 'rgba(62, 48, 36, 0.92)';
                ctx.font = '600 12px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(gardenClockLabel, rb.cx, rb.cy + 1);
                ctx.restore();
            }
            if (tok) {
                const paintTok = (img, deg, alpha) => {
                    if (alpha < 0.03 || !CARC) return;
                    const fr = CARC.tokenFrameXY(deg);
                    blitClockToken(img, clockPointFromFrame(fr.x, fr.y), disp, alpha);
                };
                paintTok(clockSunImg, tok.sunDeg, tok.sunAlpha);
                paintTok(clockMoonImg, tok.moonDeg, tok.moonAlpha);
            }
            if (typeof document !== 'undefined' && document.body) {
                document.body.dataset.paintedClock = painted ? '1' : '0';
            }
        }

        function drawBedtimeGlowLayer() {
            if (bedtimeGlow <= 0.01 && bedtimeDark <= 0.01) return;
            if (bedtimeGlow > 0.01 && ready(bedtimeGlowImg)) {
                ctx.save();
                ctx.globalAlpha = bedtimeGlow;
                ctx.drawImage(bedtimeGlowImg, 0, 0, ART.width, ART.height);
                ctx.restore();
            } else if (bedtimeGlow > 0.01) {
                ctx.save();
                const g = ctx.createRadialGradient(420, 260, 20, 420, 260, 220);
                g.addColorStop(0, `rgba(255, 220, 140, ${0.55 * bedtimeGlow})`);
                g.addColorStop(1, 'rgba(255, 180, 80, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, ART.width, ART.height);
                ctx.globalAlpha = 0.35 * bedtimeGlow;
                ctx.fillStyle = 'rgba(5, 12, 40, 0.5)';
                ctx.fillRect(0, 0, ART.width, ART.height);
                ctx.restore();
            }
            if (bedtimeDark > 0.01 && ready(bedtimeDarkImg)) {
                ctx.save();
                ctx.globalAlpha = bedtimeDark;
                ctx.drawImage(bedtimeDarkImg, 0, 0, ART.width, ART.height);
                ctx.restore();
            }
        }

        function drawBackdrop() {
            if (lightWeights) {
                ctx.fillStyle = '#e9e0c9';
                ctx.fillRect(0, 0, ART.width, ART.height);
                for (const k of ['dawn', 'midday', 'golden-hour', 'night']) {
                    const alpha = lightWeights[k] || 0;
                    if (alpha < 0.008) continue;
                    const img = bgImgs[k];
                    if (!ready(img)) continue;
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.drawImage(img, 0, 0, ART.width, ART.height);
                    ctx.restore();
                }
                drawSeasonOverlay();
                ctx.globalAlpha = 1;
                return;
            }
            const cur = bgImgs[lighting];
            const prev = prevLighting ? bgImgs[prevLighting] : null;
            if (prev && ready(prev) && lightFade < 1) {
                ctx.globalAlpha = 1;
                ctx.drawImage(prev, 0, 0, ART.width, ART.height);
            }
            if (ready(cur)) {
                ctx.globalAlpha = prev && lightFade < 1 ? easeInOut(lightFade) : 1;
                ctx.drawImage(cur, 0, 0, ART.width, ART.height);
            } else {
                ctx.fillStyle = '#e9e0c9';
                ctx.fillRect(0, 0, ART.width, ART.height);
            }
            drawSeasonOverlay();
            ctx.globalAlpha = 1;
        }

        function easeInOut(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

        function drawPlotGlow(i, t, strong) {
            const p = ART.plots[i];
            const pulse = 0.55 + 0.45 * Math.sin(t * 2.4);
            ctx.save();
            const g = ctx.createRadialGradient(p.x, p.y - p.h * 0.3, 4, p.x, p.y - p.h * 0.3, p.w * 0.75);
            const a = (strong ? 0.6 : 0.28) * (0.6 + 0.4 * pulse);
            g.addColorStop(0, `rgba(255, 246, 200, ${a})`);
            g.addColorStop(1, 'rgba(255, 246, 200, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y - p.h * 0.3, p.w * 0.75, p.h * 0.95, 0, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = `rgba(255, 250, 225, ${(strong ? 0.95 : 0.5) * (0.6 + 0.4 * pulse)})`;
            ctx.setLineDash([8, 6]);
            ctx.lineWidth = strong ? 3 : 2;
            const b = p.box;
            roundRect(ctx, b[0] - 6, b[1] - 6, b[2] - b[0] + 12, b[3] - b[1] + 12, 12);
            ctx.stroke();
            ctx.restore();
        }

        function roundRect(c, x, y, w, h, r) {
            c.beginPath();
            c.moveTo(x + r, y);
            c.arcTo(x + w, y, x + w, y + h, r);
            c.arcTo(x + w, y + h, x, y + h, r);
            c.arcTo(x, y + h, x, y, r);
            c.arcTo(x, y, x + w, y, r);
            c.closePath();
        }

        function resolveSprite(id, stage) {
            if (stage === 'picked') {
                const pi = pickedImgs[id];
                const stages = ART.plants[id] && ART.plants[id].stages;
                const meta = stages && stages[4];
                if (ready(pi) && meta) return { img: pi, meta };
                return { img: plantImgs[id] && plantImgs[id][4], meta };
            }
            return { img: plantImgs[id] && plantImgs[id][stage], meta: ART.plants[id] && ART.plants[id].stages[stage - 1] };
        }

        function harvestStripFrameCount(img) {
            const H = ART.harvest;
            if (!H) return 12;
            return (ready(img) && img.naturalWidth > 0)
                ? Math.floor(img.naturalWidth / H.frameW)
                : H.defaultHarvestCount;
        }

        function resolveHarvestStrip(plantId, kind) {
            const pack = harvestStrips[plantId];
            const perPlant = pack && pack[kind];
            if (ready(perPlant)) return { img: perPlant, generic: false };
            const gen = genericHarvest[kind];
            if (ready(gen)) return { img: gen, generic: true };
            return { img: null, generic: false };
        }

        function plotStageMeta(plotIndex, stage) {
            const pl = plots[plotIndex];
            if (!pl || !ART.plants[pl.plantId]) return null;
            if (stage === 'picked') return ART.plants[pl.plantId].stages[4];
            const st = typeof stage === 'number' ? stage : pl.stage;
            return ART.plants[pl.plantId].stages[Math.max(0, Math.min(4, st - 1))];
        }

        function harvestLocalToWorld(plot, lx, ly, plantId) {
            const H = ART.harvest;
            const p = ART.plots[plot];
            const s = p.w / 180;
            const meta = plantId && ART.plants[plantId] ? ART.plants[plantId].stages[4] : null;
            const ax = H.frameW / 2;
            return {
                x: p.x + (lx - ax) * s,
                y: p.y - 4 + (ly - H.soilY) * s,
            };
        }

        function harvestAnimFrame(anim, now) {
            const H = ART.harvest;
            if (!H || !anim) return -1;
            return Math.floor((now - anim.t0) * H.fps);
        }

        function activeHarvestAnim(plot) {
            const now = performance.now() / 1000;
            const kind = lighting === 'night' ? 'night' : 'day';
            for (const a of harvestAnims) {
                if (a.plot !== plot) continue;
                const f = harvestAnimFrame(a, now);
                const { img } = resolveHarvestStrip(a.plantId, kind);
                const maxF = harvestStripFrameCount(img);
                if (f >= 0 && f < maxF) return a;
            }
            return null;
        }

        function drawHarvestFrame(i, frame, img, alpha, plantId) {
            const H = ART.harvest;
            if (!ready(img) || !H || alpha <= 0.01) return;
            const p = ART.plots[i];
            const s = p.w / 180;
            const id = plantId || (plots[i] && plots[i].plantId);
            const meta = id && ART.plants[id] ? ART.plants[id].stages[4] : null;
            const ax = H.frameW / 2;
            ctx.save();
            ctx.globalAlpha = Math.min(1, alpha);
            ctx.translate(p.x, p.y - 4);
            ctx.scale(s, s);
            ctx.drawImage(img, frame * H.frameW, 0, H.frameW, H.frameH, -ax, -H.soilY, H.frameW, H.frameH);
            ctx.restore();
        }

        function drawSprite(id, stage, i, t, alpha, scaleMul) {
            const { img, meta } = resolveSprite(id, stage);
            if (!ready(img) || !meta) return;
            const p = ART.plots[i];
            const s = p.scale * (scaleMul || 1);
            const tall = (meta.base - meta.top) / 480; // 0..1-ish
            const amp = 0.012 + 0.03 * tall * (1 + fx.sun * 0.3);
            const shear = Math.sin(t * 0.85 + swayPhase[i]) * amp + Math.sin(t * 2.1 + swayPhase[i] * 2) * amp * 0.18;
            ctx.save();
            ctx.globalAlpha = alpha * 0.5;
            const sh = ctx.createRadialGradient(p.x, p.y - 4, 2, p.x, p.y - 4, meta.w * s * 0.42);
            sh.addColorStop(0, 'rgba(40, 24, 10, 0.55)');
            sh.addColorStop(1, 'rgba(40, 24, 10, 0)');
            ctx.fillStyle = sh;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y - 4, meta.w * s * 0.42, meta.w * s * 0.12, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(p.x, p.y);
            ctx.transform(1, 0, shear, 1, 0, 0);
            ctx.scale(s, s);
            ctx.drawImage(img, -meta.w / 2, -meta.base, meta.w, meta.h);
            ctx.restore();
        }

        // Paint the sprites into each light so they sit in the scene.
        const SPRITE_FILTER = {
            dawn: 'sepia(0.10) saturate(1.02) brightness(0.98) hue-rotate(-4deg)',
            midday: 'none',
            'golden-hour': 'sepia(0.20) saturate(1.08) brightness(0.98)',
            night: 'brightness(0.58) saturate(0.62) hue-rotate(8deg) contrast(0.95)',
        };
        function drawReadyLoop(i, t) {
            const pl = plots[i];
            if (!pl || !pl.ready || activeHarvestAnim(i)) return;
            const H = ART.harvest;
            const kind = lighting === 'night' ? 'night' : 'day';
            const img = readyStrips[kind];
            if (ready(img) && H) {
                const frame = Math.floor(t * H.fps + i * 2) % H.readyCount;
                drawHarvestFrame(i, frame, img, 1, pl.plantId);
                return;
            }
            const p = ART.plots[i];
            const tw = 0.55 + 0.45 * Math.sin(t * 3.2 + i * 0.7);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(p.x, p.y - 40, 2, p.x, p.y - 50, p.w * 0.9);
            g.addColorStop(0, `rgba(255, 248, 180, ${0.35 * tw})`);
            g.addColorStop(0.5, `rgba(255, 220, 120, ${0.18 * tw})`);
            g.addColorStop(1, 'rgba(255, 220, 120, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y - 36, p.w * 0.85, p.h * 1.1, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
        }

        function drawDecorations(t) {
            if (!ART.decorSpots) return;
            const night = lighting === 'night';
            for (const spot of ART.decorSpots) {
                const id = decorPlacements[spot.id];
                if (!id) continue;
                const pack = decorImgs[id];
                const img = pack && (night ? pack.night : pack.day);
                const w = 88;
                let h = ART.decor.placeholderH;
                const drawPlaceholder = !ready(img);
                ctx.save();
                ctx.translate(spot.x, spot.y);
                if (drawPlaceholder) {
                    ctx.fillStyle = night ? 'rgba(180, 170, 140, 0.75)' : 'rgba(120, 100, 70, 0.65)';
                    ctx.beginPath();
                    ctx.ellipse(0, -h * 0.4, w * 0.35, h * 0.12, 0, 0, TAU);
                    ctx.fill();
                    ctx.fillStyle = night ? 'rgba(220, 210, 180, 0.9)' : 'rgba(90, 70, 50, 0.85)';
                    roundRect(ctx, -w / 2, -h, w, h * 0.85, 8);
                    ctx.fill();
                    ctx.font = '600 13px Nunito, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillStyle = night ? '#fff8e8' : '#f7eed8';
                    ctx.fillText(id.replace(/-/g, ' '), 0, -h * 0.45);
                } else {
                    const sc = spot.scale || 0.55;
                    const iw = img.naturalWidth * sc;
                    const ih = img.naturalHeight * sc;
                    ctx.drawImage(img, -iw / 2, -ih, iw, ih);
                    h = ih;
                }
                const def = (window.SmileVisit && window.SmileVisit.DECOR_UNLOCKS || []).find((d) => d.id === id);
                if (night && def && def.nightGlow) {
                    ctx.globalCompositeOperation = 'lighter';
                    const pulse = 0.6 + 0.4 * Math.sin(t * 2.1 + spot.x * 0.01);
                    glowDot(0, -h * 0.72, 18, [255, 220, 140], 0.22 * pulse);
                    glowDot(0, -h * 0.72, 8, [255, 250, 220], 0.35 * pulse);
                }
                ctx.restore();
            }
        }

        function produceColor(id) {
            return (ART.produce && ART.produce.placeholder && ART.produce.placeholder[id]) || '#c4a574';
        }

        function playHarvestAnim(plot, plantId, opts) {
            const o = opts || {};
            const pull = o.pull === true;
            harvestAnims.push({ plot, plantId, t0: performance.now() / 1000, pull });
            basketFlash = 1;
        }

        function drawHarvestProduceFly(a, f) {
            const H = ART.harvest;
            const pi = produceImgs[a.plantId];
            if (!ready(pi) || !H) return;
            const startF = 4;
            const endF = Math.min(harvestStripFrameCount(genericHarvest[lighting === 'night' ? 'night' : 'day']) - 1, 10);
            if (f < startF || f > endF) return;
            const t = (f - startF) / Math.max(1, endF - startF);
            const [bx, by] = H.basketInFrame;
            const lx = 100 + (bx - 100) * t;
            const ly = 140 + (by - 140) * t;
            const w = harvestLocalToWorld(a.plot, lx, ly, a.plantId);
            const bed = ART.plots[a.plot];
            const sz = (ART.produce.size || 128) * (bed.w / 180) * 0.38;
            ctx.save();
            ctx.drawImage(pi, w.x - sz / 2, w.y - sz / 2, sz, sz);
            ctx.restore();
        }

        function drawHarvestAnims() {
            const H = ART.harvest;
            if (!H) return;
            const now = performance.now() / 1000;
            const kind = lighting === 'night' ? 'night' : 'day';
            for (let n = harvestAnims.length - 1; n >= 0; n--) {
                const a = harvestAnims[n];
                const f = harvestAnimFrame(a, now);
                const { img, generic } = resolveHarvestStrip(a.plantId, kind);
                const maxF = harvestStripFrameCount(img);
                if (f >= maxF) { harvestAnims.splice(n, 1); continue; }
                if (f < 0) continue;
                if (ready(img)) {
                    drawHarvestFrame(a.plot, f, img, 1, a.plantId);
                    if (generic) drawHarvestProduceFly(a, f);
                }
            }
            if (basketFlash > 0) basketFlash = Math.max(0, basketFlash - 0.04);
        }

        function drawBasketIcon(t) {
            const b = ART.basketHud;
            const pulse = basketFlash > 0 ? basketFlash : 0.1;
            if (ready(basketImg)) {
                const w = b.w || 36;
                ctx.save();
                ctx.globalAlpha = 0.85 + 0.15 * pulse;
                ctx.drawImage(basketImg, b.x - w / 2, b.y - w / 2, w, w);
                ctx.restore();
                return;
            }
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.fillStyle = 'rgba(90, 60, 30, 0.85)';
            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, TAU);
            ctx.fill();
            ctx.restore();
        }

        function plantSpriteStage(pl, plotIndex) {
            const H = ART.harvest;
            const anim = activeHarvestAnim(plotIndex);
            if (anim && H) {
                const f = harvestAnimFrame(anim, performance.now() / 1000);
                if (f >= H.swapFrame) {
                    if (anim.pull) return null;
                    return 'picked';
                }
            }
            if (pl.pickedSprite) return 'picked';
            return pl.stage;
        }

        function tendedSoilAlpha(i) {
            const fade = (ART.tendedSoil && ART.tendedSoil.fadeSec) || 1.2;
            const t0 = soilFadeT0[i];
            if (t0 == null) return 1;
            const k = Math.min(1, (performance.now() / 1000 - t0) / fade);
            return k;
        }

        function drawTendedSoil(i) {
            const pl = plots[i];
            if (!pl || !pl.soilTended) return;
            const wDay = lightWeights && typeof lightWeights.day === 'number' ? lightWeights.day : (lighting === 'night' ? 0 : 1);
            const wNight = lightWeights && typeof lightWeights.night === 'number' ? lightWeights.night : (lighting === 'night' ? 1 : 0);
            const fade = tendedSoilAlpha(i);
            const pos = ART.tendedSoil.pos(i);
            const [dx, dy] = pos;
            const drawKind = (kind, weight) => {
                if (weight < 0.02) return;
                const img = tendedSoilImgs[kind][i + 1];
                if (!ready(img)) return;
                ctx.save();
                ctx.globalAlpha = fade * weight;
                ctx.drawImage(img, dx, dy);
                ctx.restore();
            };
            drawKind('day', wDay);
            drawKind('night', wNight);
            const img = tendedSoilImgs[lighting === 'night' ? 'night' : 'day'][i + 1];
            if (!ready(img)) {
                const bed = ART.plots[i];
                if (!bed) return;
                const box = bed.box;
                const bw = box[2] - box[0];
                const bh = box[3] - box[1];
                ctx.save();
                ctx.globalAlpha = fade * 0.85;
                roundRect(ctx, box[0], box[1], bw, bh, 10);
                ctx.clip();
                ctx.globalCompositeOperation = 'multiply';
                ctx.fillStyle = lighting === 'night' ? 'rgba(42, 68, 52, 0.38)' : 'rgba(62, 42, 26, 0.32)';
                ctx.fillRect(box[0], box[1], bw, bh);
                ctx.restore();
            }
        }

        function drawBedTag(i) {
            const pl = plots[i];
            if (!pl || !ART.needs || !C) return;
            const spot = ART.needs.tagSpots['bed' + (i + 1)];
            if (!spot) return;
            const kind = lighting === 'night' ? 'night' : 'day';
            const tagImg = tagImgs[kind];
            const [tw, th] = ART.needs.tagPixels;
            const sc = spot.scale;
            const dw = (tw * sc) / 2;
            const dh = (th * sc) / 2;
            const ax = spot.anchor[0];
            const ay = spot.anchor[1];
            const x0 = ax - dw / 2;
            const y0 = ay - dh;
            if (ready(tagImg)) {
                ctx.save();
                if (kind === 'night' && ART.needs.nightTagBlend) {
                    ctx.globalAlpha = 1 - ART.needs.nightTagBlend * 0.08;
                }
                ctx.drawImage(tagImg, x0, y0, dw, dh);
                ctx.restore();
            } else {
                ctx.save();
                ctx.translate(ax, ay);
                ctx.fillStyle = 'rgba(198, 155, 98, 0.95)';
                roundRect(ctx, -dw / 2, -dh, dw, dh, 3);
                ctx.fill();
                ctx.restore();
            }
            const sf = sc / 2;
            const fb = ART.needs.faceBox;
            const fx0 = x0 + fb[0] * sf;
            const fy0 = y0 + fb[1] * sf;
            const fw = (fb[2] - fb[0]) * sf;
            const fh = (fb[3] - fb[1]) * sf;
            const needs = L.plantNeeds(pl.plantId);
            const prog = pl.tagProgress || { sun: 0, water: 0, fertilizer: 0, stake: false };
            const allMet = pl.careAllMet || (Care && Care.allNeedsMet(prog, needs, pl.staked));
            if (allMet) {
                const im = needsFaceImgs[`bloom-${kind}`];
                if (ready(im)) {
                    const bw = ART.needs.bloomDisplay[0];
                    const bh = ART.needs.bloomDisplay[1] * sc;
                    ctx.drawImage(im, fx0 + (fw - bw) / 2, fy0 + (fh - bh) / 2, bw, bh);
                }
                return;
            }
            if (pl.tagResting) {
                const im = needsFaceImgs[`rest-${kind}`];
                if (ready(im)) {
                    const rw = ART.needs.restingDisplay[0];
                    const rh = ART.needs.restingDisplay[1] * sc;
                    ctx.drawImage(im, fx0 + (fw - rw) / 2, fy0 + (fh - rh) / 2, rw, rh);
                }
                return;
            }
            const keys = ['sun', 'water', 'fertilizer', 'stake'].filter((k) => Care.dotsForNeed(needs, k) > 0);
            const iconPx = (ART.needs.tagFaceIconPx || 48) * sf;
            const gap = keys.length > 1 ? (fw - keys.length * iconPx) / (keys.length + 1) : (fw - iconPx) / 2;
            keys.forEach((key, idx) => {
                const ix = fx0 + gap + idx * (iconPx + gap);
                const iy = fy0 + 4 * sf;
                const im = needsFaceImgs[`${key}-${kind}`];
                if (ready(im)) ctx.drawImage(im, ix, iy, iconPx, iconPx);
                const req = Care.dotsForNeed(needs, key);
                const got = key === 'stake'
                    ? (Care.stakeNeedMet(prog, pl.staked) ? 1 : 0)
                    : Math.min(req, Math.floor((Number(prog[key]) || 0) + 1e-6));
                const dotPx = (ART.needs.tagFaceDotPx || 16) * sf;
                const dotY = iy + iconPx + 3 * sf;
                const dotGap = dotPx * 1.15;
                const dotsW = req * dotGap - (dotGap - dotPx);
                let dx0 = ix + (iconPx - dotsW) / 2;
                for (let d = 0; d < req; d++) {
                    const dotIm = needsFaceImgs[`dot-${d < got ? 'on' : 'off'}-${kind}`];
                    if (ready(dotIm)) ctx.drawImage(dotIm, dx0, dotY, dotPx, dotPx);
                    dx0 += dotGap;
                }
            });
        }

        function drawTendedSoils() {
            for (let i = 0; i < ART.plots.length; i++) drawTendedSoil(i);
        }

        function drawSelectionRing(i, t) {
            if (!ART.selection || tendPlot !== i) return;
            const bed = i + 1;
            const kind = lighting === 'night' ? 'night' : 'day';
            const img = ringImgs[kind][bed];
            const off = ART.selection.offsets['bed' + bed];
            if (!ready(img) || !off) return;
            const pulse = tendRingPulse ? 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(t * Math.PI)) : 1;
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.drawImage(img, off[0], off[1]);
            ctx.restore();
        }

        function drawStake(i, pl) {
            const plot = pl || plots[i];
            if (!plot || !plot.staked || !ART.stretch) return;
            if (L.plantNeedsStake && !L.plantNeedsStake(plot.plantId)) return;
            const bed = ART.plots[i];
            const kind = ART.stakeSpriteKind(plot.plantId, plot.stage);
            const meta = ART.stretch.stakeSprites[kind] || ART.stretch.stakeSprites.short;
            const offsetX = ART.stakeOffsetXForPlant(plot.plantId);
            const stakeImg = stakeImgs[kind] || stakeImgs.short;
            const sc = bed.scale || 0.5;
            if (ready(stakeImg)) {
                ctx.save();
                ctx.translate(bed.x + offsetX * sc, bed.y);
                ctx.scale(sc, sc);
                ctx.drawImage(stakeImg, -meta.w / 2, -meta.base, meta.w, meta.h);
                ctx.restore();
            } else {
                ctx.save();
                ctx.translate(bed.x + offsetX * sc, bed.y);
                ctx.strokeStyle = '#8a6b40';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, -meta.h * sc * 0.35);
                ctx.stroke();
                ctx.restore();
            }
        }

        function drawPlantBed(i, t) {
            const now = performance.now() / 1000;
            const pl = plots[i];
            if (i === highlight && !pl && tendPlot === null) drawPlotGlow(i, t, true);
            else if (i === hover && !pl && highlight !== null) drawPlotGlow(i, t, false);
            if (!pl) {
                if (tendPlot === i) drawSelectionRing(i, t);
                return;
            }
            drawReadyLoop(i, t);
            if (tendPlot === i) drawSelectionRing(i, t);
            const an = anims[i];
            if (an) {
                const k = (now - an.t0) / an.dur;
                if (k >= 1) { anims[i] = null; drawSprite(pl.plantId, pl.stage, i, t, 1, 1); return; }
                if (an.kind === 'plant') {
                    const e = easeInOut(Math.min(1, k * 1.4));
                    drawSprite(pl.plantId, pl.stage, i, t, e, 0.7 + 0.3 * e);
                } else {
                    const e = easeInOut(k);
                    const p = ART.plots[i];
                    const glowA = Math.sin(Math.PI * Math.min(1, k * 1.2)) * (an.to >= 5 ? 0.65 : 0.45);
                    const meta = ART.plants[pl.plantId].stages[pl.stage - 1];
                    const hgt = (meta.base - meta.top) * p.scale;
                    const g = ctx.createRadialGradient(p.x, p.y - hgt * 0.5, 4, p.x, p.y - hgt * 0.5, Math.max(80, hgt * 0.9));
                    g.addColorStop(0, `rgba(255, 244, 190, ${glowA})`);
                    g.addColorStop(1, 'rgba(255, 244, 190, 0)');
                    ctx.fillStyle = g;
                    ctx.fillRect(p.x - 220, p.y - hgt * 1.5 - 60, 440, hgt * 2 + 120);
                    if (an.from) drawSprite(pl.plantId, an.from, i, t, 1 - e, 1 + 0.03 * e);
                    const swell = 1 + Math.sin(Math.PI * Math.min(1, k)) * 0.05;
                    drawSprite(pl.plantId, pl.stage, i, t, e, (0.94 + 0.06 * e) * swell);
                }
                return;
            }
            if (pl.staked) drawStake(i, pl);
            const st = plantSpriteStage(pl, i);
            if (st != null) drawSprite(pl.plantId, st, i, t, 1, 1);
        }

        function drawPlants(t) {
            ctx.filter = SPRITE_FILTER[lighting] || 'none';
            const back = [0, 1, 2, 3];
            const front = [4, 5, 6, 7];
            for (const i of back) drawPlantBed(i, t);
            for (const i of front) drawPlantBed(i, t);
            for (const i of back) if (plots[i] && i !== tendPlot) drawBedTag(i);
            for (const i of front) if (plots[i] && i !== tendPlot) drawBedTag(i);
            if (tendPlot != null && plots[tendPlot]) drawBedTag(tendPlot);
            ctx.filter = 'none';
        }

        function drawSunShafts(t) {
            const a = fx.sun;
            if (a < 0.02) return;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const warm = lighting === 'golden-hour' ? [255, 190, 110] : lighting === 'dawn' ? [255, 214, 190] : lighting === 'night' ? [190, 200, 255] : [255, 240, 190];
            for (let k = 0; k < 5; k++) {
                const x0 = 120 + k * 230 + Math.sin(t * 0.25 + k) * 30;
                const w = 90 + (k % 2) * 60;
                const grad = ctx.createLinearGradient(x0, -40, x0 + 260, 640);
                const al = a * (0.16 + 0.06 * Math.sin(t * 0.7 + k * 1.3));
                grad.addColorStop(0, `rgba(${warm}, ${al})`);
                grad.addColorStop(1, `rgba(${warm}, 0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.moveTo(x0, -40);
                ctx.lineTo(x0 + w, -40);
                ctx.lineTo(x0 + w + 300, 680);
                ctx.lineTo(x0 + 240, 680);
                ctx.closePath();
                ctx.fill();
            }
            // warm wash over the beds
            const wash = ctx.createRadialGradient(640, 440, 40, 640, 440, 620);
            wash.addColorStop(0, `rgba(${warm}, ${a * 0.18})`);
            wash.addColorStop(1, `rgba(${warm}, 0)`);
            ctx.fillStyle = wash;
            ctx.fillRect(0, 0, ART.width, ART.height);
            ctx.restore();
        }

        function glowDot(x, y, r, rgb, alpha) {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
            g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
            g.addColorStop(0.35, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha * 0.45})`);
            g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r * 3.2, 0, TAU);
            ctx.fill();
        }

        function drawParticles(t) {
            const night = lighting === 'night';
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            if (!night) {
                const tint = lighting === 'golden-hour' ? [255, 196, 120] : lighting === 'dawn' ? [255, 214, 200] : [255, 248, 214];
                const base = lighting === 'midday' ? 0.28 : 0.36;
                for (const m of motes) {
                    const fade = Math.min(1, m.life / 1.5, (m.max - m.life) / 1.5);
                    const tw = 0.6 + 0.4 * Math.sin(t * 2 + m.ph);
                    glowDot(m.x, m.y, m.r, tint, Math.max(0, fade) * tw * (base + fx.sun * 0.35));
                }
            } else {
                for (const f of fireflies) {
                    const b = Math.max(0, Math.sin(t * f.blink * TAU + f.ph));
                    const a = 0.15 + 0.85 * Math.pow(b, 3);
                    glowDot(f.x, f.y, 3.6, [214, 255, 140], a * 0.8);
                    glowDot(f.x, f.y, 1.2, [255, 255, 220], a);
                }
                // a few motes stay as faint moonlit dust
                for (let i = 0; i < 12; i++) {
                    const m = motes[i];
                    glowDot(m.x, m.y, m.r * 0.8, [200, 210, 255], 0.12 + fx.sun * 0.2);
                }
            }
            for (const s of sparkles) {
                const a = Math.max(0, 1 - s.life / s.max);
                if (s.glow) glowDot(s.x, s.y, s.r, s.color, a * 0.85);
            }
            ctx.restore();

            // non-glowing: soil crumbs, water, fertilizer
            for (const s of sparkles) {
                if (s.glow) continue;
                const a = Math.max(0, 1 - s.life / s.max);
                ctx.fillStyle = `rgba(${s.color},${a})`;
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
            }
            for (const d of drops) {
                ctx.save();
                ctx.translate(d.x, d.y);
                const g = ctx.createLinearGradient(0, -d.r * 3, 0, d.r);
                g.addColorStop(0, 'rgba(170, 210, 240, 0)');
                g.addColorStop(1, 'rgba(120, 175, 225, 0.85)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.moveTo(0, -d.r * 3.2);
                ctx.quadraticCurveTo(d.r * 1.1, -d.r * 0.3, 0, d.r);
                ctx.quadraticCurveTo(-d.r * 1.1, -d.r * 0.3, 0, -d.r * 3.2);
                ctx.fill();
                ctx.restore();
            }
            for (const r of ripples) {
                const k = r.life / r.max;
                ctx.strokeStyle = `rgba(190, 225, 250, ${0.7 * (1 - k)})`;
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.ellipse(r.x, r.y, 4 + 16 * k, 1.5 + 5 * k, 0, 0, TAU);
                ctx.stroke();
            }
            for (const f of flecks) {
                ctx.save();
                ctx.translate(f.x, f.y);
                ctx.rotate(f.rot);
                ctx.fillStyle = f.hue < 0.5 ? 'rgba(150, 178, 92, 0.9)' : 'rgba(214, 186, 110, 0.9)';
                ctx.beginPath();
                ctx.ellipse(0, 0, f.r * 1.7, f.r * 0.8, 0, 0, TAU);
                ctx.fill();
                ctx.restore();
                glowDot(f.x, f.y, f.r * 0.8, [230, 240, 170], 0.25);
            }
        }

        // Painted effect strips over each planted bed. Sun uses additive blending;
        // water and fertilizer stay normal so the damp patch darkens the soil.
        function drawFxFrame(kind, mode, i, frame, alpha) {
            const E = ART.effects;
            const img = fxImgs[SPRITE_KINDS[kind] + '-' + (lighting === 'night' ? 'night' : 'day') + '-' + mode];
            if (!ready(img) || alpha <= 0.01) return;
            const p = ART.plots[i];
            const s = p.w / 180;
            ctx.save();
            ctx.globalAlpha = Math.min(1, alpha);
            ctx.globalCompositeOperation = kind === 'sun' ? 'lighter' : 'source-over';
            ctx.translate(p.x, p.y - 4);
            ctx.scale(s, s);
            const pl = plots[i];
            const meta = pl && pl.plantId ? plotStageMeta(i, pl.stage) : null;
            const ax = E.frameW / 2;
            ctx.drawImage(img, frame * E.frameW, 0, E.frameW, E.frameH, -ax, -E.soilY, E.frameW, E.frameH);
            ctx.restore();
        }
        function drawEffectSprites(t) {
            const E = ART.effects;
            if (!E) return;
            const loopFrame = Math.floor(t * E.fps) % E.count;
            const levels = { sun: fx.sun, water: fx.water, fert: fx.fert, stake: fx.stake };
            const fxI = effectPlot;
            if (fxI !== null && plots[fxI]) {
                for (const k of ['water', 'fert', 'sun', 'stake']) {
                    if (levels[k] > 0.03) drawFxFrame(k, 'loop', fxI, (loopFrame + fxI * 3) % E.count, levels[k] * (FX_GAIN[k] || 1));
                }
            }
            const now = performance.now() / 1000;
            for (let n = absorbs.length - 1; n >= 0; n--) {
                const a = absorbs[n];
                const f = Math.floor((now - a.t0 - a.i * 0.08) * E.fps);
                if (f >= E.count) { absorbs.splice(n, 1); continue; }
                if (f >= 0) drawFxFrame(a.kind, 'absorb', a.i, f, FX_GAIN[a.kind]);
            }
        }

        function drawCritterPlaceholder(x, y, color, sc) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(sc, sc);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(0, 0, 16, 11, 0, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = 'rgba(50, 40, 20, 0.35)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }

        function drawCritters(t) {
            if (!ART.critters || !C) return;
            if (!daylight) return;
            const alpha = C.critterDayAlpha(lighting, prevLighting, lightFade);
            if (alpha < 0.02) return;
            const motionScale = C.motionScaleFromReduced(reducedMotion);
            ctx.save();
            ctx.globalAlpha = alpha;
            for (const entry of ART.critters.roster) {
                const spec = ART.critters.strips[entry.strip];
                if (!spec) continue;
                const img = critterImgs[entry.strip];
                const pos = C.wanderPosition(entry, t, ART.critters.bounds);
                const defaultFrames = spec.kind === 'bee' ? 4 : 8;
                const frameCount = ready(img)
                    ? C.stripFrameCount(img.naturalWidth, spec.frameW)
                    : defaultFrames;
                const frame = C.animFrameIndex(t + (entry.phase || 0), spec.fps, frameCount, { reducedMotion, motionScale });
                const drawScale = spec.scale != null ? spec.scale : 0.32;
                const { frameW: fw, frameH: fh } = spec;
                if (!ready(img)) {
                    const ph = ART.critters.placeholder || {};
                    const col = ph[entry.strip] || ph.butterfly || '#e8a050';
                    drawCritterPlaceholder(pos.x, pos.y, col, drawScale * 2.2);
                    continue;
                }
                ctx.save();
                ctx.translate(pos.x, pos.y);
                if (spec.kind === 'butterfly') {
                    ctx.rotate(C.butterflyHeadingRad(pos.vx, pos.vy));
                    ctx.scale(drawScale, drawScale);
                    ctx.drawImage(img, frame * fw, 0, fw, fh, -fw / 2, -fh / 2, fw, fh);
                } else if (spec.kind === 'bee') {
                    const flip = C.beeFlipX(pos.vx);
                    ctx.scale(drawScale * (flip ? -1 : 1), drawScale);
                    ctx.drawImage(img, frame * fw, 0, fw, fh, -fw / 2, -fh / 2, fw, fh);
                } else {
                    ctx.scale(drawScale, drawScale);
                    ctx.drawImage(img, frame * fw, 0, fw, fh, -fw / 2, -fh / 2, fw, fh);
                }
                ctx.restore();
            }
            ctx.restore();
        }

        function drawLogoHud() {
            const hud = ART.logoHud;
            if (!hud) return;
            if (typeof document !== 'undefined' && document.body && document.body.dataset.canvasLogo === '1' &&
                document.getElementById('brand-logo-day') && document.getElementById('brand-logo-day').naturalWidth > 0) {
                refreshLogoOnCanvas();
                return;
            }
            const layers = logoLayerAlphas();
            const dayReady = ready(logoDayImg);
            const nightReady = ready(logoNightImg);
            refreshLogoOnCanvas();
            if (!logoOnCanvas) return;
            const { x, y, w, h } = hud;
            const [sw, sh] = hud.srcPixels || [w * 2, h * 2];
            if (dayReady && layers.day > 0.02) {
                ctx.save();
                ctx.globalAlpha = layers.day;
                ctx.drawImage(logoDayImg, 0, 0, sw, sh, x, y, w, h);
                ctx.restore();
            }
            if (nightReady && layers.night > 0.02) {
                ctx.save();
                ctx.globalAlpha = layers.night;
                ctx.drawImage(logoNightImg, 0, 0, sw, sh, x, y, w, h);
                ctx.restore();
            }
        }

        function drawVignette() {
            const g = ctx.createRadialGradient(640, 380, 300, 640, 380, 820);
            g.addColorStop(0, 'rgba(60, 40, 20, 0)');
            g.addColorStop(1, lighting === 'night' ? 'rgba(5, 10, 30, 0.45)' : 'rgba(70, 50, 25, 0.22)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, ART.width, ART.height);
        }

        function draw(t) {
            resize();
            ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
            ctx.clearRect(0, 0, view.cssW, view.cssH);
            ctx.setTransform(view.dpr * view.s, 0, 0, view.dpr * view.s, view.dpr * view.ox, view.dpr * view.oy);
            drawBackdrop();
            drawDecorations(t);
            drawSunShafts(t);
            drawTendedSoils();
            drawPlants(t);
            drawSeasonParticles(t);
            drawCritters(t);
            drawEffectSprites(t);
            drawParticles(t);
            drawHarvestAnims();
            drawBasketIcon(t);
            drawGardenClockHud();
            drawBedtimeGlowLayer();
            drawVignette();
            drawLogoHud();
            drawClockTokensOnTop();
        }

        /** Final pass: tokens above vignette / HTML (frame → hills → token → front → ribbon → token). */
        function drawClockTokensOnTop() {
            if (!ART.clock || typeof window === 'undefined' || !window.SmileClockArc) return;
            const CARC = window.SmileClockArc;
            const tok = CARC.clockTokenState(gardenClockMinutes);
            const disp = ART.clock.tokenDisplay || 32;
            const paint = (img, deg, alpha) => {
                if (alpha < 0.03) return;
                const fr = CARC.tokenFrameXY(deg);
                blitClockToken(img, clockPointFromFrame(fr.x, fr.y), disp, alpha);
            };
            paint(clockSunImg, tok.sunDeg, tok.sunAlpha);
            paint(clockMoonImg, tok.moonDeg, tok.moonAlpha);
        }

        function probeClockSunToken() {
            const CARC = typeof window !== 'undefined' ? window.SmileClockArc : null;
            if (!ART.clock || !CARC) return { ok: false, reason: 'missing-clock' };
            const tok = CARC.clockTokenState(gardenClockMinutes);
            const fr = CARC.tokenFrameXY(tok.sunDeg);
            const center = clockPointFromFrame(fr.x, fr.y);
            const pixel = sampleBackdrop(center.x, center.y);
            return {
                ok: true,
                gardenClockMinutes,
                center,
                deg: tok.sunDeg,
                sunAlpha: tok.sunAlpha,
                sunReady: ready(clockSunImg),
                sunNatural: clockSunImg ? clockSunImg.naturalWidth : 0,
                pixel,
            };
        }

        function probeClockMoonToken() {
            const CARC = typeof window !== 'undefined' ? window.SmileClockArc : null;
            if (!ART.clock || !CARC) return { ok: false, reason: 'missing-clock' };
            const tok = CARC.clockTokenState(gardenClockMinutes);
            const fr = CARC.tokenFrameXY(tok.moonDeg);
            const center = clockPointFromFrame(fr.x, fr.y);
            const pixel = sampleBackdrop(center.x, center.y);
            return {
                ok: true,
                gardenClockMinutes,
                center,
                deg: tok.moonDeg,
                moonAlpha: tok.moonAlpha,
                moonReady: ready(clockMoonImg),
                moonNatural: clockMoonImg ? clockMoonImg.naturalWidth : 0,
                pixel,
            };
        }

        return { resize, update, draw, setLighting, setLightingBlend, setSeason, setGardenClock, setBedtimeGlow, setBedtimeDark, setPlots, setDecor, playHarvestAnim, playGrowth, playAbsorb, setEffects, setHighlight, setHover, setTendSelection, plotAt, plotClient,
            waitForHudArt, hudArtReady, sampleBackdrop, probeClockSunToken, probeClockMoonToken,
            get lighting() { return lighting; },
            get reducedMotion() { return reducedMotion; },
            setReducedMotion(v) { reducedMotion = !!v; },
            get logoOnCanvas() { return logoOnCanvas; },
            images: { bgImgs, plantImgs, critterImgs, logoDayImg, logoNightImg } };
    }

    window.SmileScene = { createScene };
})();
