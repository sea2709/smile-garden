// game/clock-arc.js — sun/moon token angles for Heily clock (see assets/time-manifest.json).
'use strict';

const ARC = Object.freeze({
    centerX: 160.6,
    centerY: 183.1,
    radius: 150.6,
    startDeg: 147,
    endDeg: 33,
});

function degToRad(d) { return (Number(d) || 0) * Math.PI / 180; }

/** Token position in @2x frame pixels (math degrees: 0=right, 90=up). */
function tokenFrameXY(deg, arc) {
    const a = arc || ARC;
    const r = degToRad(deg);
    return {
        x: a.centerX + a.radius * Math.cos(r),
        y: a.centerY - a.radius * Math.sin(r),
    };
}

/**
 * Sun/moon alphas and degrees for garden clock minutes (6:00 = 360, etc.).
 * @returns {{ sunDeg, moonDeg, sunAlpha, moonAlpha, useNightFrame: boolean }}
 */
function clockTokenState(gardenMinutes) {
    const hour = (Number(gardenMinutes) || 0) / 60;
    const startDeg = ARC.startDeg;
    const endDeg = ARC.endDeg;
    let sunDeg = startDeg;
    let moonDeg = endDeg;
    let sunAlpha = 0;
    let moonAlpha = 0;

    if (hour < 6) {
        moonDeg = endDeg;
        moonAlpha = 1;
    } else if (hour < 17.5) {
        const t = Math.min(1, Math.max(0, (hour - 6) / 12));
        sunDeg = startDeg + (endDeg - startDeg) * t;
        sunAlpha = 1;
    } else if (hour < 18.5) {
        const t = hour - 17.5;
        sunDeg = endDeg;
        moonDeg = endDeg;
        sunAlpha = 1 - t;
        moonAlpha = t;
    } else {
        const t = Math.min(1, (hour - 18) / 12);
        moonDeg = startDeg + (endDeg - startDeg) * t;
        moonAlpha = 1;
    }

    const useNightFrame = hour >= 18 || (hour >= 17.5 && hour < 18.5 && moonAlpha > sunAlpha);
    return { sunDeg, moonDeg, sunAlpha, moonAlpha, useNightFrame };
}

const api = { ARC, degToRad, tokenFrameXY, clockTokenState };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SmileClockArc = api;