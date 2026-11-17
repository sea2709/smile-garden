// game/critters.js — daytime garden critters (pure logic for paths, flip, rotation, frames).
'use strict';
(function () {

const TAU = Math.PI * 2;

function easeInOut(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
}

function stripFrameCount(stripWidth, frameW) {
    if (!Number.isFinite(stripWidth) || !Number.isFinite(frameW) || frameW <= 0) return 1;
    return Math.max(1, Math.floor(stripWidth / frameW));
}

function animFrameIndex(t, fps, frameCount, opts) {
    const o = opts || {};
    if (!frameCount) return 0;
    if (o.reducedMotion) return 0;
    const speed = Number.isFinite(o.motionScale) ? o.motionScale : 1;
    const f = Math.floor(t * fps * speed) % frameCount;
    return f < 0 ? f + frameCount : f;
}

/** Butterfly sprites face up (−Y). Rotate toward travel direction. */
function butterflyHeadingRad(vx, vy) {
    if (Math.abs(vx) < 1e-5 && Math.abs(vy) < 1e-5) return 0;
    return Math.atan2(vy, vx) + Math.PI / 2;
}

/** Bee sprites face left (−X). Mirror when moving right. */
function beeFlipX(vx) {
    return vx > 0;
}

function isDayLighting(lighting) {
    return lighting !== 'night';
}

/** Fade critters during day↔night backdrop crossfade (lightFade 0→1 over ~1.6s). */
function critterDayAlpha(lighting, prevLighting, lightFade) {
    const f = easeInOut(Math.max(0, Math.min(1, lightFade)));
    const dayNow = isDayLighting(lighting);
    const dayPrev = prevLighting ? isDayLighting(prevLighting) : dayNow;
    if (dayNow) {
        if (!dayPrev) return f;
        return 1;
    }
    if (dayPrev) return 1 - f;
    return 0;
}

/** Day logo vs night logo crossfade (tracks scene backdrop transition). */
function logoLayerAlphas(lighting, prevLighting, lightFade) {
    const day = critterDayAlpha(lighting, prevLighting, lightFade);
    return { day, night: 1 - day };
}

function prefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

function motionScaleFromReduced(reduced) {
    return reduced ? 0.35 : 1;
}

function wanderPosition(entry, t, bounds) {
    const b = bounds || { width: 1280, height: 720, hudTop: 92, margin: 48 };
    const ax = entry.anchor[0];
    const ay = entry.anchor[1];
    const ampX = entry.ampX != null ? entry.ampX : 80;
    const ampY = entry.ampY != null ? entry.ampY : 22;
    const pathSpeed = entry.pathSpeed != null ? entry.pathSpeed : 0.22;
    const timeScale = entry.timeScale != null ? entry.timeScale : 1;
    const ph = entry.phase != null ? entry.phase : 0;
    const tt = t * timeScale + ph;

    const x = ax + Math.sin(tt * pathSpeed) * ampX + Math.sin(tt * pathSpeed * 0.37 + ph * 1.7) * (ampX * 0.22);
    const y = ay + Math.cos(tt * pathSpeed * 0.83 + 1.2) * ampY + Math.sin(tt * 0.91 + ph * 2.3) * 5;

    const eps = 0.04;
    const tt2 = (t + eps) * timeScale + ph;
    const x2 = ax + Math.sin(tt2 * pathSpeed) * ampX + Math.sin(tt2 * pathSpeed * 0.37 + ph * 1.7) * (ampX * 0.22);
    const y2 = ay + Math.cos(tt2 * pathSpeed * 0.83 + 1.2) * ampY + Math.sin(tt2 * 0.91 + ph * 2.3) * 5;
    const vx = (x2 - x) / eps;
    const vy = (y2 - y) / eps;

    const top = b.hudTop + 16;
    const cx = Math.max(b.margin, Math.min(b.width - b.margin, x));
    const cy = Math.max(top, Math.min(b.height - b.margin, y));
    return { x: cx, y: cy, vx, vy };
}

const api = {
    TAU,
    easeInOut,
    stripFrameCount,
    animFrameIndex,
    butterflyHeadingRad,
    beeFlipX,
    isDayLighting,
    critterDayAlpha,
    logoLayerAlphas,
    prefersReducedMotion,
    motionScaleFromReduced,
    wanderPosition,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.SmileCritters = api;
}

})();