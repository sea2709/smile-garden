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
        const bgImgs = {};
        for (const [k, src] of Object.entries(ART.backgrounds)) bgImgs[k] = loadImage(src);
        const plantImgs = {};
        for (const id of Object.keys(ART.plants)) {
            plantImgs[id] = [null];
            for (let s = 1; s <= 5; s++) plantImgs[id].push(loadImage(ART.plantSrc(id, s)));
        }

        const fxImgs = {};
        if (ART.effects) for (const n of ART.effects.names) fxImgs[n] = loadImage(ART.effectSrc(n));
        // one-shot absorb plays per plot: { kind, t0 }
        const absorbs = [];
        const SPRITE_KINDS = { sun: 'sun', water: 'water', fert: 'fertilizer' };
        const fxWasOn = { sun: false, water: false, fert: false };
        const FX_GAIN = { sun: 1.35, water: 1, fert: 1 }; // sunbeams boosted on the busy backdrop

        let rnd = mulberry(42);
        const view = { s: 1, ox: 0, oy: 0, cssW: 1, cssH: 1, dpr: 1 };
        let lighting = 'midday';
        let prevLighting = null;
        let lightFade = 1;
        let plots = new Array(8).fill(null);   // { plantId, stage }
        const anims = new Array(8).fill(null); // stage / plant transitions
        const swayPhase = ART.plots.map((_, i) => i * 1.7 + 0.4);
        let highlight = null;   // plot index (picker target)
        let hover = null;
        const fx = { sun: 0, sunTarget: 0, water: 0, waterTarget: 0, fert: 0, fertTarget: 0, breath: 0 };

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
            if (l === lighting) return;
            prevLighting = lighting;
            lighting = l;
            lightFade = 0;
        }

        /** plotsState: array of null | { plantId, stage } (from SmileVisit state). */
        function setPlots(plotsState, opts) {
            const animate = !(opts && opts.instant);
            const now = performance.now() / 1000;
            for (let i = 0; i < 8; i++) {
                const n = plotsState[i] ? { plantId: plotsState[i].plantId, stage: plotsState[i].stage } : null;
                const o = plots[i];
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

        function playAbsorb(kind) {
            const t0 = performance.now() / 1000;
            for (let i = 0; i < 8; i++) if (plots[i]) absorbs.push({ kind, i, t0 });
        }
        function setEffects(e) {
            for (const k of ['sun', 'water', 'fert']) {
                if (!(k in e)) continue;
                const on = clamp(e[k]) > 0.05;
                if (fxWasOn[k] && !on) playAbsorb(k);
                fxWasOn[k] = on;
            }
            if ('sun' in e) fx.sunTarget = clamp(e.sun);
            if ('water' in e) fx.waterTarget = clamp(e.water);
            if ('fert' in e) fx.fertTarget = clamp(e.fert);
            if ('breath' in e) fx.breath = clamp(e.breath);
        }
        const clamp = (x) => (x > 1 ? 1 : x < 0 || !Number.isFinite(x) ? 0 : x);

        function setHighlight(i) { highlight = i === null || i === undefined ? null : i; }
        function setHover(i) { hover = i; }

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
            if (fx.water > 0.05 && rnd() < fx.water * dt * 30) {
                const i = Math.floor(rnd() * 8);
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
            if (fx.fert > 0.05 && rnd() < fx.fert * dt * 16 * (0.4 + (1 - fx.breath))) {
                const i = Math.floor(rnd() * 8);
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
        }

        // ------------------------------------------------------------------
        function drawBackdrop() {
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

        function drawSprite(id, stage, i, t, alpha, scaleMul) {
            const img = plantImgs[id] && plantImgs[id][stage];
            const meta = ART.plants[id] && ART.plants[id].stages[stage - 1];
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
        function drawPlants(t) {
            const now = performance.now() / 1000;
            ctx.filter = SPRITE_FILTER[lighting] || 'none';
            const order = [0, 1, 2, 3, 4, 5, 6, 7];
            for (const i of order) {
                const pl = plots[i];
                if (i === highlight && !pl) drawPlotGlow(i, t, true);
                else if (i === hover && !pl && highlight !== null) drawPlotGlow(i, t, false);
                if (!pl) continue;
                const an = anims[i];
                if (an) {
                    const k = (now - an.t0) / an.dur;
                    if (k >= 1) { anims[i] = null; drawSprite(pl.plantId, pl.stage, i, t, 1, 1); continue; }
                    if (an.kind === 'plant') {
                        const e = easeInOut(Math.min(1, k * 1.4));
                        drawSprite(pl.plantId, pl.stage, i, t, e, 0.7 + 0.3 * e);
                    } else {
                        // bloom glow behind, crossfade old -> new with a gentle swell
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
                    continue;
                }
                drawSprite(pl.plantId, pl.stage, i, t, 1, 1);
            }
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
            ctx.drawImage(img, frame * E.frameW, 0, E.frameW, E.frameH, -E.frameW / 2, -E.soilY, E.frameW, E.frameH);
            ctx.restore();
        }
        function drawEffectSprites(t) {
            const E = ART.effects;
            if (!E) return;
            const loopFrame = Math.floor(t * E.fps) % E.count;
            const levels = { sun: fx.sun, water: fx.water, fert: fx.fert };
            for (let i = 0; i < 8; i++) {
                if (!plots[i]) continue;
                for (const k of ['water', 'fert', 'sun']) {
                    if (levels[k] > 0.03) drawFxFrame(k, 'loop', i, (loopFrame + i * 3) % E.count, levels[k] * FX_GAIN[k]);
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
            drawSunShafts(t);
            drawPlants(t);
            drawEffectSprites(t);
            drawParticles(t);
            drawVignette();
        }

        return { resize, update, draw, setLighting, setPlots, playGrowth, playAbsorb, setEffects, setHighlight, setHover, plotAt, plotClient,
            get lighting() { return lighting; }, images: { bgImgs, plantImgs } };
    }

    window.SmileScene = { createScene };
})();
