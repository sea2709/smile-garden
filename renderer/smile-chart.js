// renderer/smile-chart.js — adaptive left signal panel (Heily art + manifest).
(function () {
    'use strict';

    const CSS_W = 250;
    const CSS_H = 84;
    const GEOM = { x0: 20, y0: 6, plotW: 222, plotH: 60, win: 10, stripH: 0 };
    const BREATHE_GEOM = { x0: 20, y0: 4, plotW: 222, plotH: 38 };
    const SWEEP = [-78, 78];
    const GAUGE = {
        arc: { x: 39, y: 0, w: 172, h: 82.5 },
        pivot: { x: 125, y: 82 },
        needle: { ox: 7, oy: 52.8, w: 14, h: 59 },
    };

    const COLORS = {
        smile: {
            day: { accent: '#6fa3c7', line: '#4f86ad', fill: 'rgba(127, 169, 201, 0.30)', grid: '#8fb3cc', gap: 'rgba(150,140,130,0.18)' },
            night: { accent: '#a9c8de', line: '#2f5f86', fill: 'rgba(150, 190, 222, 0.34)', grid: '#4e6a86', gap: 'rgba(150,140,130,0.18)' },
        },
        talk: {
            day: { accent: '#b8924e', line: '#8f6d34', fill: 'rgba(201, 166, 98, 0.32)', grid: '#c2a676' },
            night: { accent: '#d6bd8c', line: '#5e4620', fill: 'rgba(214, 186, 128, 0.34)', grid: '#6e5d44' },
        },
        stretch: {
            day: { line: '#6b8a3e', accent: '#8aa456' },
            night: { line: '#3f5a22', accent: '#b5c98d' },
        },
        breathe: {
            day: { line: '#66798e', fill: 'rgba(138, 156, 176, 0.28)', accent: '#8a9cb0' },
            night: { line: '#3c4d61', fill: 'rgba(166, 182, 200, 0.32)', accent: '#b6c3d1' },
        },
    };

    const imgCache = {};
    function assetPath(rel) {
        return `../assets/${rel}`;
    }
    function loadImage(key, rel) {
        if (imgCache[key]) return imgCache[key];
        const im = new Image();
        im.src = assetPath(rel);
        imgCache[key] = im;
        return im;
    }
    function gaugeArcSrc(night) {
        return night ? 'ui/signal/gauge-arc-night.png' : 'ui/signal/gauge-arc.png';
    }
    function gaugeNeedleSrc(night) {
        return night ? 'ui/signal/gauge-needle-night.png' : 'ui/signal/gauge-needle.png';
    }

    function palette(mode, night) {
        const m = COLORS[mode];
        if (!m) return COLORS.smile.day;
        return night ? m.night : m.day;
    }

    function rollToGaugeDeg(rollDeg) {
        const maxTilt = 28;
        const mirrored = -Number(rollDeg);
        return Math.max(SWEEP[0], Math.min(SWEEP[1], (mirrored / maxTilt) * SWEEP[1]));
    }

    function drawSmileMode(ctx, samples, now, geom, L, colors) {
        const { x0, y0, plotW, plotH } = geom;
        const win = geom.win;
        const t0 = now - win;
        const xAt = (tm) => x0 + ((tm - t0) / win) * plotW;
        const yAt = (h) => y0 + plotH * (1 - h);
        const on = L.DEFAULTS.smileOn;

        let gap = null;
        for (const s of samples) {
            if (!s.face && gap === null) gap = s.t;
            if (s.face && gap !== null) {
                ctx.fillStyle = colors.gap;
                ctx.fillRect(xAt(gap), y0, Math.max(1, xAt(s.t) - xAt(gap)), plotH);
                gap = null;
            }
        }
        if (gap !== null) ctx.fillRect(xAt(gap), y0, Math.max(1, xAt(now) - xAt(gap)), plotH);

        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = colors.accent;
        ctx.beginPath();
        ctx.moveTo(x0, yAt(on));
        ctx.lineTo(x0 + plotW, yAt(on));
        ctx.stroke();
        ctx.strokeStyle = colors.grid;
        ctx.beginPath();
        ctx.moveTo(x0, yAt(0));
        ctx.lineTo(x0 + plotW, yAt(0));
        ctx.stroke();
        ctx.setLineDash([]);

        let run = [];
        const flush = () => {
            if (run.length < 2) { run = []; return; }
            const watering = run.some((s) => s.smiling);
            ctx.beginPath();
            ctx.moveTo(xAt(run[0].t), yAt(run[0].h));
            for (const s of run) ctx.lineTo(xAt(s.t), yAt(s.h));
            if (watering) {
                ctx.lineTo(xAt(run[run.length - 1].t), y0 + plotH);
                ctx.lineTo(xAt(run[0].t), y0 + plotH);
                ctx.closePath();
                ctx.fillStyle = colors.fill;
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(xAt(run[0].t), yAt(run[0].h));
                for (const s of run) ctx.lineTo(xAt(s.t), yAt(s.h));
            }
            ctx.strokeStyle = watering ? colors.line : colors.grid;
            ctx.lineWidth = watering ? 1.8 : 1.4;
            ctx.lineJoin = 'round';
            ctx.stroke();
            run = [];
        };
        let prev = null;
        for (const s of samples) {
            if (!s.face || s.h === null) { flush(); prev = null; continue; }
            if (prev !== null && prev !== s.smiling) {
                const last = run[run.length - 1];
                flush();
                if (last) run.push(last);
            }
            run.push(s);
            prev = s.smiling;
        }
        flush();
    }

    function drawTalkMode(ctx, samples, now, geom, colors) {
        const { x0, y0, plotW, plotH } = geom;
        const win = geom.win;
        const t0 = now - win;
        const xAt = (tm) => x0 + ((tm - t0) / win) * plotW;
        const mid = y0 + plotH / 2;
        const lo = y0 + plotH * 0.18;
        const hi = y0 + plotH * 0.82;

        let ema = 0;
        const alpha = 0.38;
        const points = [];
        for (const s of samples) {
            const target = s.face && s.talking ? 0.55 : 0.08;
            ema += alpha * (target - ema);
            points.push({ x: xAt(s.t), a: ema });
        }
        if (points.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(points[0].x, mid);
        for (const p of points) {
            const amp = p.a * (plotH * 0.38);
            ctx.lineTo(p.x, mid - amp);
        }
        for (let i = points.length - 1; i >= 0; i--) {
            const p = points[i];
            const amp = p.a * (plotH * 0.38);
            ctx.lineTo(p.x, mid + amp);
        }
        ctx.closePath();
        ctx.fillStyle = colors.fill;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(points[0].x, mid - points[0].a * (plotH * 0.38));
        for (const p of points) ctx.lineTo(p.x, mid - p.a * (plotH * 0.38));
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = colors.grid;
        ctx.beginPath();
        ctx.moveTo(x0, lo);
        ctx.lineTo(x0 + plotW, lo);
        ctx.moveTo(x0, hi);
        ctx.lineTo(x0 + plotW, hi);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function drawStretchGauge(ctx, rollDeg, night, holdFrac, colors) {
        const arc = loadImage('arc', gaugeArcSrc(night));
        const needle = loadImage('needle', gaugeNeedleSrc(night));
        const g = GAUGE;
        if (arc.complete && arc.naturalWidth) {
            ctx.drawImage(arc, g.arc.x, g.arc.y, g.arc.w, g.arc.h);
        }
        const deg = rollToGaugeDeg(rollDeg);
        if (needle.complete && needle.naturalWidth) {
            ctx.save();
            ctx.translate(g.pivot.x, g.pivot.y);
            ctx.rotate((deg * Math.PI) / 180);
            ctx.drawImage(needle, -g.needle.ox, -g.needle.oy, g.needle.w, g.needle.h);
            ctx.restore();
        }
        if (holdFrac != null && holdFrac > 0) {
            const r = 56.2 - 6;
            const start = (-90 + SWEEP[0]) * (Math.PI / 180);
            const end = start + (SWEEP[1] - SWEEP[0]) * (Math.PI / 180) * Math.min(1, holdFrac);
            ctx.strokeStyle = colors.line;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(g.pivot.x, g.pivot.y, r, start, end);
            ctx.stroke();
        }
    }

    function drawBreatheMode(ctx, samples, now, geom, colors, opts) {
        const { x0, y0, plotW, plotH } = geom;
        const win = GEOM.win;
        const t0 = now - win;
        const xAt = (tm) => x0 + ((tm - t0) / win) * plotW;
        const mid = y0 + plotH / 2;

        ctx.beginPath();
        ctx.moveTo(x0, mid);
        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            let phase = s.breathPhase;
            if (phase == null && s.breathRate != null) {
                phase = Math.sin((s.t - t0) * (s.breathRate / 60) * Math.PI * 2);
            }
            if (phase == null) phase = 0;
            ctx.lineTo(xAt(s.t), mid - phase * (plotH * 0.42));
        }
        if (samples.length) {
            const last = samples[samples.length - 1];
            ctx.lineTo(xAt(last.t), mid);
        }
        ctx.closePath();
        ctx.fillStyle = colors.fill;
        ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            let phase = s.breathPhase;
            if (phase == null && s.breathRate != null) {
                phase = Math.sin((s.t - t0) * (s.breathRate / 60) * Math.PI * 2);
            }
            if (phase == null) phase = 0;
            const x = xAt(s.t);
            const y = mid - phase * (plotH * 0.42);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 2;
        ctx.stroke();

        const pillState = (opts && opts.breathPillState) || 'warming';
        const pillMap = {
            warming: 'ui/breath/pill-warming.png',
            settling: 'ui/breath/pill-settling.png',
            stable: 'ui/breath/pill-stable.png',
        };
        const pill = loadImage(`pill-${pillState}`, pillMap[pillState] || pillMap.warming);
        if (pill.complete && pill.naturalWidth) {
            ctx.drawImage(pill, 20, 48, 92, 32);
        }
        const words = { warming: 'Warming', settling: 'Settling', stable: 'Steady' };
        ctx.fillStyle = '#4a3b2c';
        ctx.font = '800 10px Nunito, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(words[pillState] || 'Warming', 30, 67);

        const dotsDone = (opts && opts.breathDotsDone) || 0;
        const dotsTotal = Math.min(6, (opts && opts.breathDotsTotal) || 6);
        const dotOn = loadImage('dot-on', 'ui/breath/dot-on.png');
        const dotOff = loadImage('dot-off', 'ui/breath/dot-off.png');
        let dx = 122;
        for (let i = 0; i < dotsTotal; i++) {
            const d = i < dotsDone ? dotOn : dotOff;
            if (d.complete && d.naturalWidth) ctx.drawImage(d, dx, 56, 16, 16);
            dx += 16 + 5;
        }
    }

    function liveTextForMode(mode, sample, opts) {
        if (mode === 'idle') return '';
        const n = sample;
        if (mode === 'smile' && n && n.face && n.h != null) return `${n.h.toFixed(2)} watering`;
        if (mode === 'talk') return n && n.talking ? 'talking' : '';
        if (mode === 'breathe' && n && n.breathRate != null) return `${n.breathRate.toFixed(1)}/min`;
        if (mode === 'stretch' && n && n.rollDeg != null) {
            const d = rollToGaugeDeg(n.rollDeg);
            if (d <= -12) return 'lean left';
            if (d >= 12) return 'lean right';
            return '';
        }
        return '';
    }

    let lastDrawnMode = 'idle';

    function drawSignalPanel(canvas, trace, now, liveEl, opts) {
        if (!canvas) return;
        const L = window.SmileLogic;
        const o = opts || {};
        const mode = o.mode || 'idle';
        const night = !!(o.night || (document.body && document.body.dataset.lighting === 'night'));

        if (mode !== lastDrawnMode && !o.reducedMotion && !o.captureRedraw) {
            canvas.classList.add('is-swapping');
            setTimeout(() => canvas.classList.remove('is-swapping'), 150);
        }
        lastDrawnMode = mode;

        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(CSS_W * dpr) || canvas.height !== Math.round(CSS_H * dpr)) {
            canvas.width = Math.round(CSS_W * dpr);
            canvas.height = Math.round(CSS_H * dpr);
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, CSS_W, CSS_H);

        if (mode === 'idle') {
            if (liveEl) liveEl.textContent = '';
            return;
        }

        const geom = Object.assign({ cssH: CSS_H }, GEOM);
        const samples = trace.samples(now);
        const colors = palette(mode, night);

        if (mode === 'smile') drawSmileMode(ctx, samples, now, geom, L, colors);
        else if (mode === 'talk') drawTalkMode(ctx, samples, now, geom, colors);
        else if (mode === 'stretch') {
            const last = samples[samples.length - 1];
            const roll = last && last.rollDeg != null ? last.rollDeg : 0;
            drawStretchGauge(ctx, roll, night, o.stretchHoldFrac, colors);
        } else if (mode === 'breathe') {
            drawBreatheMode(ctx, samples, now, Object.assign({ cssH: CSS_H }, BREATHE_GEOM), palette('breathe', night), o);
        }

        if (liveEl) {
            liveEl.textContent = liveTextForMode(mode, samples[samples.length - 1], o);
        }
    }

    function drawSmileChart(canvas, trace, now, liveEl) {
        drawSignalPanel(canvas, trace, now, liveEl, { mode: 'smile', prevMode: 'smile', blend: 1 });
    }

    const LABELS = (window.SmileSignalPanel && window.SmileSignalPanel.PANEL_LABELS) || {
        idle: 'Waiting for you',
        smile: 'Watering',
        talk: 'Fertilizing',
        breathe: 'Harvesting',
        stretch: 'Staking',
    };

    window.SmileChart = { drawSmileChart, drawSignalPanel, PANEL_LABELS: LABELS };
})();