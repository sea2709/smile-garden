// renderer/smile-chart.js — live 10 s smile-signal chart (toggle with G).
//
// SmartSpectra ships no UI, so this draws the HAPPY expression score
// (0..1) from a SmileLogic.SmileTrace ring buffer: the line, the smile
// thresholds (0.50 on / 0.42 off), grey gaps where no face was found, and a
// strip underneath that lights up while face.talking is detected.

(function () {
    'use strict';

    function drawSmileChart(canvas, trace, now, liveEl) {
        if (!canvas) return;
        const L = window.SmileLogic;
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
        const x0 = 20, y0 = 6, plotW = cssW - 28, plotH = cssH - 6 - 12 - stripH;
        const win = trace.windowSec;
        const t0 = now - win;
        const xAt = (tm) => x0 + ((tm - t0) / win) * plotW;
        const yAt = (h) => y0 + plotH * (1 - h);
        const on = L.DEFAULTS.smileOn, off = L.DEFAULTS.smileOff;

        ctx.fillStyle = 'rgba(255, 251, 238, 0.6)';
        ctx.fillRect(x0, y0, plotW, plotH);

        const samples = trace.samples(now);

        // no-face gaps
        ctx.fillStyle = 'rgba(150, 140, 130, 0.22)';
        let gap = null;
        for (const s of samples) {
            if (!s.face && gap === null) gap = s.t;
            if (s.face && gap !== null) { ctx.fillRect(xAt(gap), y0, Math.max(1, xAt(s.t) - xAt(gap)), plotH); gap = null; }
        }
        if (gap !== null) ctx.fillRect(xAt(gap), y0, Math.max(1, xAt(now) - xAt(gap)), plotH);

        // thresholds
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(196, 140, 40, 0.8)';
        ctx.beginPath(); ctx.moveTo(x0, yAt(on)); ctx.lineTo(x0 + plotW, yAt(on)); ctx.stroke();
        ctx.strokeStyle = 'rgba(150, 120, 90, 0.5)';
        ctx.beginPath(); ctx.moveTo(x0, yAt(off)); ctx.lineTo(x0 + plotW, yAt(off)); ctx.stroke();
        ctx.setLineDash([]);

        // line, golden under-fill while smiling
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

        // talking strip
        const sy = y0 + plotH + 3;
        ctx.fillStyle = 'rgba(220, 210, 190, 0.6)';
        ctx.fillRect(x0, sy, plotW, stripH);
        ctx.fillStyle = '#7fb3d5';
        let ts = null;
        for (const s of samples) {
            if (s.face && s.talking) { if (ts === null) ts = s.t; }
            else if (ts !== null) { ctx.fillRect(xAt(ts), sy, Math.max(1, xAt(s.t) - xAt(ts)), stripH); ts = null; }
        }
        if (ts !== null && samples.length) ctx.fillRect(xAt(ts), sy, Math.max(1, xAt(samples[samples.length - 1].t) - xAt(ts)), stripH);

        ctx.fillStyle = '#7a6a5c';
        ctx.font = '600 9px Nunito, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('1', x0 - 4, y0 + 8);
        ctx.fillText('0', x0 - 4, y0 + plotH);
        ctx.textAlign = 'left';
        ctx.fillText('−10 s', x0, cssH - 1);
        ctx.textAlign = 'right';
        ctx.fillText('now · talking strip', x0 + plotW, cssH - 1);

        if (liveEl) {
            const n = samples[samples.length - 1];
            liveEl.textContent = !n ? '–' : !n.face ? 'no face' : n.h.toFixed(2) + (n.smiling ? ' · sunlight' : '') + (n.talking ? ' · talking' : '');
        }
    }

    window.SmileChart = { drawSmileChart };
})();
