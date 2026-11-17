// game/stretch.js — neck-stretch detector from face landmarks (head roll).
'use strict';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/**
 * SmartSpectra dense face mesh (MediaPipe-compatible 478-point layout).
 * Eye groups for roll = tilt of line between eye centers vs horizontal.
 * @see https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
 */
const LEFT_EYE_INDICES = Object.freeze([33, 133, 160, 159, 158, 157, 173, 144, 145, 153, 154, 155]);
const RIGHT_EYE_INDICES = Object.freeze([362, 263, 387, 386, 385, 384, 398, 382, 381, 380, 374, 373, 390, 249]);
/** Fallback single points when sparse arrays arrive */
const LEFT_EYE_FALLBACK = 33;
const RIGHT_EYE_FALLBACK = 263;

const DEFAULTS = Object.freeze({
    holdSeconds: 3,
    tiltDeg: 15,
    smoothWindowSec: 0.3,
    dropoutGraceSec: 0.5,
    noFaceHintSec: 1.8,
    minStableLandmarks: 8,
    /** Vine ring eases toward 0 when the player relaxes mid-hold (seconds). */
    displayEaseTau: 0.85,
});

function meanPoint(points, indices) {
    if (!points || !points.length) return null;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const i of indices) {
        const p = points[i];
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
            sx += p.x;
            sy += p.y;
            n += 1;
        }
    }
    return n ? { x: sx / n, y: sy / n } : null;
}

/**
 * Head roll in radians (positive ≈ right ear toward shoulder / viewer's left).
 * @param {Array<{x,y}>} points
 * @param {{ mirrored?: boolean }} opts — front camera mirroring flips sign
 */
function headRollRad(points, opts) {
    const o = opts || {};
    let left = meanPoint(points, LEFT_EYE_INDICES);
    let right = meanPoint(points, RIGHT_EYE_INDICES);
    if (!left && points[LEFT_EYE_FALLBACK]) left = points[LEFT_EYE_FALLBACK];
    if (!right && points[RIGHT_EYE_FALLBACK]) right = points[RIGHT_EYE_FALLBACK];
    if (!left || !right) return null;
    const dx = right.x - left.x;
    const dy = right.y - left.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return 0;
    let roll = Math.atan2(dy, dx);
    // Non-mirrored (raw image) coords flip user-left/right vs front-camera preview.
    if (o.mirrored === false) roll = -roll;
    return roll;
}

function radToDeg(r) {
    return r / DEG;
}

function tiltSide(rollDeg, tiltDeg) {
    const t = Number(tiltDeg) || DEFAULTS.tiltDeg;
    if (rollDeg <= -t) return 'left';
    if (rollDeg >= t) return 'right';
    return null;
}

function createRollSmoother(windowSec) {
    const win = Math.max(0.05, Number(windowSec) || DEFAULTS.smoothWindowSec);
    const buf = [];
    let sum = 0;
    let time = 0;
    return {
        push(rollRad, dt) {
            const d = Math.max(0, Number(dt) || 0);
            time += d;
            if (rollRad == null || !Number.isFinite(rollRad)) return null;
            buf.push({ t: time, v: rollRad });
            sum += rollRad;
            const cutoff = time - win;
            while (buf.length && buf[0].t < cutoff) {
                sum -= buf[0].v;
                buf.shift();
            }
            return buf.length ? sum / buf.length : rollRad;
        },
        reset() {
            buf.length = 0;
            sum = 0;
            time = 0;
        },
    };
}

/**
 * @typedef {'left'|'right'} StretchSide
 */

function createStretchFlow(opts) {
    const cfg = Object.assign({}, DEFAULTS, opts);
    const smoother = createRollSmoother(cfg.smoothWindowSec);
    const sides = {
        left: { hold: 0, done: false, display: 0 },
        right: { hold: 0, done: false, display: 0 },
    };
    let dropout = 0;
    let noFace = 0;
    let lastRollDeg = 0;
    let activeSide = null;

    function reset() {
        sides.left.hold = 0;
        sides.left.done = false;
        sides.right.hold = 0;
        sides.right.done = false;
        sides.left.display = 0;
        sides.right.display = 0;
        dropout = 0;
        noFace = 0;
        activeSide = null;
        smoother.reset();
    }

    function rawProgress(side) {
        return Math.min(1, (sides[side].hold || 0) / cfg.holdSeconds);
    }

    function progress(side) {
        return sides[side].done ? 1 : Math.max(0, Math.min(1, sides[side].display || 0));
    }

    function refreshDisplay(dt) {
        const tau = Math.max(0.12, Number(cfg.displayEaseTau) || DEFAULTS.displayEaseTau);
        const k = Math.min(1, dt / tau);
        for (const side of ['left', 'right']) {
            const raw = rawProgress(side);
            const target = sides[side].done ? 1 : (activeSide === side ? raw : 0);
            sides[side].display += (target - sides[side].display) * k;
            if (sides[side].display < 1e-4) sides[side].display = 0;
        }
    }

    function complete() {
        return sides.left.done && sides.right.done;
    }

    /**
     * @param {number} dt seconds
     * @param {{ points?: Array<{x,y}>, stable?: boolean, faceVisible?: boolean, rollRadOverride?: number|null, mirrored?: boolean }} sample
     */
    function update(dt, sample) {
        const d = Math.max(0, Math.min(0.25, Number(dt) || 0));
        const s = sample || {};
        const faceVisible = s.faceVisible !== false && (s.points?.length || s.rollRadOverride != null);
        let rollRad = null;
        if (s.rollRadOverride != null && Number.isFinite(s.rollRadOverride)) rollRad = s.rollRadOverride;
        else if (s.points && s.points.length) rollRad = headRollRad(s.points, { mirrored: s.mirrored !== false });

        if (!faceVisible || rollRad == null) {
            noFace += d;
            dropout += d;
            if (dropout <= cfg.dropoutGraceSec) return snapshot();
            activeSide = null;
            return snapshot();
        }
        noFace = 0;
        dropout = 0;
        const smooth = smoother.push(rollRad, d);
        const rollDeg = radToDeg(smooth != null ? smooth : rollRad);
        lastRollDeg = rollDeg;
        const side = tiltSide(rollDeg, cfg.tiltDeg);
        if (side && !sides[side].done) {
            activeSide = side;
            sides[side].hold += d;
            if (sides[side].hold >= cfg.holdSeconds) sides[side].done = true;
        } else {
            activeSide = null;
        }
        refreshDisplay(d);
        return snapshot();
    }

    function markComplete() {
        sides.left.done = true;
        sides.right.done = true;
        sides.left.hold = cfg.holdSeconds;
        sides.right.hold = cfg.holdSeconds;
    }

    function snapshot() {
        return {
            complete: complete(),
            rollDeg: lastRollDeg,
            activeSide,
            leftProgress: progress('left'),
            rightProgress: progress('right'),
            leftDone: sides.left.done,
            rightDone: sides.right.done,
            needsFaceHint: noFace >= cfg.noFaceHintSec,
        };
    }

    return { reset, update, markComplete, snapshot, cfg, sides };
}

/** Build synthetic landmark array for mock tilt testing. */
function syntheticLandmarks(rollDeg, count) {
    const n = Math.max(RIGHT_EYE_FALLBACK + 1, count || 478);
    const pts = new Array(n);
    for (let i = 0; i < n; i++) pts[i] = { x: 0.5, y: 0.5 };
    const rad = (Number(rollDeg) || 0) * DEG;
    const cx = 0.5;
    const cy = 0.42;
    const half = 0.045;
    const lx = cx - half * Math.cos(rad);
    const ly = cy - half * Math.sin(rad);
    const rx = cx + half * Math.cos(rad);
    const ry = cy + half * Math.sin(rad);
    for (const i of LEFT_EYE_INDICES) if (i < n) pts[i] = { x: lx, y: ly };
    for (const i of RIGHT_EYE_INDICES) if (i < n) pts[i] = { x: rx, y: ry };
    if (n > LEFT_EYE_FALLBACK) pts[LEFT_EYE_FALLBACK] = { x: lx, y: ly };
    if (n > RIGHT_EYE_FALLBACK) pts[RIGHT_EYE_FALLBACK] = { x: rx, y: ry };
    return pts;
}

const api = {
    DEFAULTS,
    LEFT_EYE_INDICES,
    RIGHT_EYE_INDICES,
    LEFT_EYE_FALLBACK,
    RIGHT_EYE_FALLBACK,
    headRollRad,
    radToDeg,
    tiltSide,
    createRollSmoother,
    createStretchFlow,
    syntheticLandmarks,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof self !== 'undefined') {
    self.SmileStretch = api;
} else if (typeof window !== 'undefined') {
    window.SmileStretch = api;
}