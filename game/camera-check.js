// game/camera-check.js — pre-game camera check pass logic (no DOM / SDK).
(function () {
'use strict';

const CHECKS = Object.freeze(['smile', 'talk', 'breath', 'stretch']);
const HOLD_SECONDS = 2;

const DARK_VALIDATION = new Set(['TooDark', 'TooDarkOrBacklit', 'TooBright', 'Backlit']);

/**
 * SmartSpectra validation codes are the only lighting-ish signal in our renderer
 * pipeline; there is no dedicated lux / exposure metric on the events we handle.
 * When the face is visible, also require landmark stability as a proxy for a
 * trackable, adequately lit face.
 */
function inferLightingOk(sample) {
    const s = sample || {};
    if (!s.faceVisible) return false;
    const code = s.validation;
    if (code === 'NoFaceFound' || DARK_VALIDATION.has(code)) return false;
    if (code === 'Ok' || code === 'CameraTuning') return s.landmarksStable === true;
    return s.landmarksStable === true;
}

function faceFound(sample) {
    const s = sample || {};
    if (s.cameraDenied || s.noCamera) return false;
    const fresh = !!s.faceVisible;
    if (!fresh) return false;
    return s.validation !== 'NoFaceFound';
}

function cameraStatusMessage(sample) {
    const s = sample || {};
    if (s.cameraDenied) {
        return {
            level: 'error',
            text: 'Camera permission was denied. Allow camera access in system settings, then tap Try again — or use Skip for now / Start my garden to continue.',
        };
    }
    if (s.noCamera) {
        return {
            level: 'error',
            text: 'No camera was found on this device. Tap Try again after connecting one, or use Skip for now / Start my garden to continue.',
        };
    }
    if (s.sourceError) {
        const text = String(s.sourceError).slice(0, 240);
        return { level: 'warn', text };
    }
    if (s.validation === 'NoFaceFound' || !s.faceVisible) {
        return { level: 'hint', text: 'Look toward the camera so we can find your face.' };
    }
    return null;
}

/** Always show the warm-up / camera-check screen when starting the game. */
function shouldShowCameraCheck(_state, _opts) {
    return true;
}

function markCameraCheckRequired(state, note) {
    if (!state) return;
    state.setupDone = false;
    state.cameraCheckNote = typeof note === 'string' && note.length
        ? note
        : 'We could not read the camera. Open Check camera to verify permissions and lighting.';
}

function finishCameraSetup(state) {
    if (!state) return;
    state.setupDone = true;
    state.cameraCheckNote = null;
}

function createCameraCheckSession(options) {
    const opts = options || {};
    const smileOn = Number.isFinite(opts.smileOn) ? opts.smileOn : 0.5;
    const Stretch = opts.Stretch || null;
    const passed = { smile: false, talk: false, breath: false, stretch: false };
    const skipped = { smile: false, talk: false, breath: false, stretch: false };
    let active = null;
    let smileHold = 0;
    let talkHold = 0;
    const stretchFlow = Stretch
        ? Stretch.createStretchFlow(Object.assign({ holdSeconds: HOLD_SECONDS, tiltDeg: 15 }, opts.stretch || {}))
        : null;

    function done(key) {
        return passed[key] || skipped[key];
    }

    function allMarked() {
        return CHECKS.every((k) => done(k));
    }

    function select(key) {
        if (!CHECKS.includes(key) || done(key)) return;
        active = key;
        if (key === 'stretch' && stretchFlow) stretchFlow.reset();
        if (key === 'smile') smileHold = 0;
        if (key === 'talk') talkHold = 0;
    }

    function skip(key) {
        if (!CHECKS.includes(key) || done(key)) return;
        skipped[key] = true;
        if (active === key) active = null;
    }

    function updateSmile(dt, input) {
        if (passed.smile || skipped.smile) return;
        if (active !== 'smile') return;
        if (input.faceVisible && input.happiness != null && input.happiness >= smileOn) {
            smileHold += dt;
            if (smileHold >= HOLD_SECONDS) passed.smile = true;
        }
    }

    function updateTalk(dt, input) {
        if (passed.talk || skipped.talk) return;
        if (active !== 'talk') return;
        if (input.faceVisible && input.talking) {
            talkHold += dt;
            if (talkHold >= HOLD_SECONDS) passed.talk = true;
        }
    }

    function updateBreath(input) {
        if (passed.breath || skipped.breath) return;
        if (active !== 'breath') return;
        const b = input.breathing;
        if (b && b.fresh && b.stable) passed.breath = true;
    }

    function updateStretch(dt, input) {
        if (passed.stretch || skipped.stretch || !stretchFlow) return;
        if (active !== 'stretch') return;
        const snap = stretchFlow.update(dt, input.stretch || {});
        if (snap.complete) passed.stretch = true;
        return snap;
    }

    function update(dt, input) {
        const d = Math.max(0, Math.min(0.25, Number(dt) || 0));
        const sample = input || {};
        updateSmile(d, sample);
        updateTalk(d, sample);
        updateBreath(sample);
        const stretchSnap = updateStretch(d, sample);
        const lightingOk = inferLightingOk(sample);
        if (passed[active]) active = null;
        return snapshot(sample, lightingOk, stretchSnap);
    }

    function snapshot(sample, lightingOk, stretchSnap) {
        const s = sample || {};
        return {
            active,
            passed: Object.assign({}, passed),
            skipped: Object.assign({}, skipped),
            allMarked: allMarked(),
            smileMeter: Math.min(1, smileHold / HOLD_SECONDS),
            talkMeter: Math.min(1, talkHold / HOLD_SECONDS),
            faceFound: faceFound(s),
            lightingOk: lightingOk !== false ? !!lightingOk : inferLightingOk(s),
            cameraMessage: cameraStatusMessage(s),
            cameraDenied: !!s.cameraDenied,
            noCamera: !!s.noCamera,
            stretchSnap: stretchSnap || (stretchFlow ? stretchFlow.snapshot() : null),
        };
    }

    return {
        CHECKS,
        HOLD_SECONDS,
        select,
        skip,
        update,
        snapshot: () => snapshot({}, inferLightingOk({}), stretchFlow ? stretchFlow.snapshot() : null),
        get active() { return active; },
        markPassed(key) {
            if (CHECKS.includes(key)) passed[key] = true;
        },
    };
}

const api = {
    CHECKS,
    HOLD_SECONDS,
    inferLightingOk,
    faceFound,
    cameraStatusMessage,
    shouldShowCameraCheck,
    markCameraCheckRequired,
    finishCameraSetup,
    createCameraCheckSession,
};

if (typeof window !== 'undefined') {
    window.SmileCameraCheck = api;
} else if (typeof self !== 'undefined') {
    self.SmileCameraCheck = api;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
})();