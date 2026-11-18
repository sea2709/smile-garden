// renderer/smile-chart.js — adaptive left signal panel (toggle with G).
//
// Modes follow auto-care detection: smile, talk, breathe, stretch, idle.
// Breathing view uses SmartSpectra breath *rate* (not a raw waveform) to
// drive a smoothed synthetic wave; harvest uses the visit BreathPacer phase.

(function () {
    'use strict';

    const LABELS = (window.SmileSignalPanel && window.SmileSignalPanel.PANEL_LABELS) || {
        idle: 'Calm · waiting',
        smile: 'Smile · water',
        talk: 'Talk · fertilize',
        breathe: 'Breathe · harvest',
        stretch: 'Neck stretch · stake',
    };

    function drawSmileMode(ctx, samples, now, geom, L) {
        const { x0, y0, plotW, plotH, cssH, stripH } = geom;
        const win = geom.win;
        const t0 = now - win;
        const xAt = (tm) => x0 + ((tm - t0) / win) * plotW;
        const yAt = (h) => y0 + plotH * (1 - h);
        const on = L.DEFAULTS.smileOn, off = L.DEFAULTS.smileOff;

        ctx.fillStyle = 'rgba(255, 251, 238, 0.6)';
        ctx.fillRect(x0, y0, plotW, plotH);

        ctx.fillStyle = 'rgba(150, 140, 130, 0.22)';
        let gap = null;
        for (const s of samples) {
            if (!s.face && gap === null) gap = s.t;
            if (s.face && gap !== null) { ctx.fillRect(xAt(gap), y0, Math.max(1, xAt(s.t) - xAt(gap)), plotH); gap = null; }
        }
        if (gap !== null) ctx.fillRect(xAt(gap), y0, Math.max(1, xAt(now) - xAt(gap)), plotH);

        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(196, 140, 40, 0.8)';
        ctx.beginPath(); ctx.moveTo(x0, yAt(on)); ctx.lineTo(x0 + plotW, yAt(on)); ctx.stroke();
        ctx.strokeStyle = 'rgba(150, 120, 90, 0.5)';
        ctx.beginPath(); ctx.moveTo(x0, yAt(off)); ctx.lineTo(x0 + plotW, yAt(off)); ctx.stroke();
        ctx.setLineDash([]);

        let run = [];
        const flush = () => {
            if (run.length < 2) { run = []; return; }
            const smiling = run.some((s) => s.smiling);
            ctx.beginPath();
            ctx.moveTo(xAt(run[0].t), yAt(run[0].h));
            for (const s of run) ctx.lineTo(xAt(s.t), yAt(s.h));
            if (smiling) {
                ctx.lineTo(xAt(run[run.length - 1].t), y0 + plotH);
                ctx.lineTo(xAt(run[0].t), y0 + plotH);
                ctx.closePath();
                ctx.fillStyle = 'rgba(244, 196, 80, 0.28)';
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(xAt(run[0].t), yAt(run[0].h));
                for (const s of run) ctx.lineTo(xAt(s.t), yAt(s.h));
            }
            ctx.strokeStyle = smiling ? '#b7791f' : '#8a7a68';
            ctx.lineWidth = smiling ? 2.2 : 1.6;
            ctx.lineJoin = 'round';
            ctx.stroke();
            run = [];
        };
        let prevSmile = null;
        for (const s of samples) {
            if (!s.face || s.h === null) { flush(); prevSmile = null; continue; }
            if (prevSmile !== null && prevSmile !== s.smiling) { const last = run[run.length - 1]; flush(); if (last) run.push(last); }
            run.push(s);
            prevSmile = s.smiling;
        }
        flush();

        const sy = y0 + plotH + 3;
        ctx.fillStyle = 'rgba(220, 210, 190, 0.6)';
        ctx.fillRect(x0, sy, plotW, stripH);
        ctx.fillStyle = '#7a6a5c';
        ctx.font = '600 9px Nunito, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('−10 s', x0, cssH - 1);
        ctx.textAlign = 'right';
        ctx.fillText('now', x0 + plotW, cssH - 1);
    }

    function drawTalkMode(ctx, samples, now, geom) {
        const { x0, y0, plotW, plotH, cssH, stripH } = geom;
        const win = geom.win;
        const t0 = now - win;
        const xAt = (tm) => x0 + ((tm - t0) / win) * plotW;

        ctx.fillStyle = 'rgba(238, 246, 255, 0.75)';
        ctx.fillRect(x0, y0, plotW, plotH);
        ctx.fillStyle = '#7fb3d5';
        let ts = null;
        for (const s of samples) {
            if (s.face && s.talking) { if (ts === null) ts = s.t; }
            else if (ts !== null) {
                const h = 10 + (plotH - 14) * 0.55;
                ctx.fillRect(xAt(ts), y0 + plotH - h, Math.max(1, xAt(s.t) - xAt(ts)), h);
                ts = null;
            }
        }
        if (ts !== null && samples.length) {
            const h = 10 + (plotH - 14) * 0.55;
            ctx.fillRect(xAt(ts), y0 + plotH - h, Math.max(1, xAt(samples[samples.length - 1].t) - xAt(ts)), h);
        }
        const sy = y0 + plotH + 3;
        ctx.fillStyle = 'rgba(200, 220, 235, 0.7)';
        ctx.fillRect(x0, sy, plotW, stripH);
        ctx.fillStyle = '#5a7a98';
        ctx.font = '600 9px Nunito, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('talking', x0 + plotW, sy + stripH - 1);
        ctx.textAlign = 'left';
        ctx.fillText('−10 s', x0, cssH - 1);
    }

    function drawBreatheMode(ctx, samples, now, geom, opts) {
        const { x0, y0, plotW, plotH, cssH } = geom;
        const win = geom.win;
        const t0 = now - win;
        const xAt = (tm) => x0 + ((tm - t0) / win) * plotW;
        const mid = y0 + plotH / 2;

        ctx.fillStyle = 'rgba(236, 248, 240, 0.85)';
        ctx.fillRect(x0, y0, plotW, plotH);

        ctx.beginPath();
        ctx.moveTo(x0, mid);
        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            let phase = s.breathPhase;
            if (phase == null && s.breathRate != null) {
                phase = Math.sin((s.t - t0) * (s.breathRate / 60) * Math.PI * 2);
            }
            if (phase == null) phase = 0;
            const y = mid - phase * (plotH * 0.38);
            ctx.lineTo(xAt(s.t), y);
        }
        if (samples.length) ctx.lineTo(xAt(samples[samples.length - 1].t), mid);
        ctx.strokeStyle = '#4a8f62';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (opts && opts.breathPacerFrac != null) {
            const f = Math.max(0, Math.min(1, opts.breathPacerFrac));
            ctx.fillStyle = 'rgba(74, 143, 98, 0.25)';
            ctx.fillRect(x0, y0 + plotH - 6, plotW * f, 6);
        }

        ctx.fillStyle = '#4a6a52';
        ctx.font = '600 9px Nunito, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('rate-led wave', x0, cssH - 1);
    }

    function drawStretchMode(ctx, samples, now, geom) {
        const { x0, y0, plotW, plotH, cssH } = geom;
        const win = geom.win;
        const t0 = now - win;
        const xAt = (tm) => x0 + ((tm - t0) / win) * plotW;
        const mid = y0 + plotH / 2;

        ctx.fillStyle = 'rgba(248, 240, 228, 0.85)';
        ctx.fillRect(x0, y0, plotW, plotH);
        const maxTilt = 28;
        ctx.beginPath();
        ctx.moveTo(x0, mid);
        for (const s of samples) {
            const deg = Number(s.rollDeg) || 0;
            const y = mid - (deg / maxTilt) * (plotH * 0.42);
            ctx.lineTo(xAt(s.t), y);
        }
        ctx.strokeStyle = '#8a6b40';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = 'rgba(130, 100, 70, 0.45)';
        ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x0 + plotW, mid); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#6a5840';
        ctx.font = '600 9px Nunito, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('head roll °', x0, cssH - 1);
    }

    function drawIdleMode(ctx, geom) {
        const { x0, y0, plotW, plotH, cssH } = geom;
        const g = ctx.createLinearGradient(x0, y0, x0, y0 + plotH);
        g.addColorStop(0, 'rgba(245, 238, 225, 0.5)');
        g.addColorStop(1, 'rgba(230, 225, 215, 0.35)');
        ctx.fillStyle = g;
        ctx.fillRect(x0, y0, plotW, plotH);
        const cy = y0 + plotH / 2;
        const breath = Math.sin(performance.now() / 1000 * 0.5) * 0.12;
        ctx.strokeStyle = 'rgba(140, 130, 118, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0 + 8, cy + breath * 6);
        ctx.quadraticCurveTo(x0 + plotW / 2, cy - 8 + breath * 4, x0 + plotW - 8, cy + breath * 6);
        ctx.stroke();
        ctx.fillStyle = '#8a7a68';
        ctx.font = '600 9px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('garden listening', x0 + plotW / 2, cssH - 1);
    }

    function drawSignalPanel(canvas, trace, now, liveEl, opts) {
        if (!canvas) return;
        const L = window.SmileLogic;
        const o = opts || {};
        const mode = o.mode || 'idle';
        const prev = o.prevMode || mode;
        const blend = typeof o.blend === 'number' ? Math.max(0, Math.min(1, o.blend)) : 1;

        const cssW = 250, cssH = 84;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
            canvas.width = Math.round(cssW * dpr);
            canvas.height = Math.round(cssH * dpr);
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        const stripH = 6;
        const geom = { x0: 20, y0: 6, plotW: cssW - 28, plotH: cssH - 6 - 12 - stripH, cssH, stripH, win: trace.windowSec };
        const samples = trace.samples(now);

        if (blend < 0.98 && prev !== mode) {
            ctx.save();
            ctx.globalAlpha = 1 - blend;
            drawLayer(ctx, prev, samples, now, geom, L, o);
            ctx.restore();
            ctx.save();
            ctx.globalAlpha = blend;
            drawLayer(ctx, mode, samples, now, geom, L, o);
            ctx.restore();
        } else {
            drawLayer(ctx, mode, samples, now, geom, L, o);
        }

        if (liveEl) {
            const n = samples[samples.length - 1];
            let tail = '';
            if (mode === 'smile' && n && n.face) tail = ` ${n.h.toFixed(2)}`;
            else if (mode === 'talk' && n && n.talking) tail = ' on';
            else if (mode === 'breathe' && n && n.breathRate != null) tail = ` ${n.breathRate.toFixed(1)}/m`;
            else if (mode === 'stretch' && n && n.rollDeg != null) tail = ` ${n.rollDeg.toFixed(0)}°`;
            liveEl.textContent = (LABELS[mode] || mode) + tail;
        }
    }

    function drawLayer(ctx, mode, samples, now, geom, L, opts) {
        if (mode === 'smile') drawSmileMode(ctx, samples, now, geom, L);
        else if (mode === 'talk') drawTalkMode(ctx, samples, now, geom);
        else if (mode === 'breathe') drawBreatheMode(ctx, samples, now, geom, opts);
        else if (mode === 'stretch') drawStretchMode(ctx, samples, now, geom);
        else drawIdleMode(ctx, geom);
    }

    function drawSmileChart(canvas, trace, now, liveEl) {
        drawSignalPanel(canvas, trace, now, liveEl, { mode: 'smile', prevMode: 'smile', blend: 1 });
    }

    window.SmileChart = { drawSmileChart, drawSignalPanel, PANEL_LABELS: LABELS };
})();