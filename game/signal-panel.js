// game/signal-panel.js — care signal panel mode + hysteresis (pure logic).
'use strict';
(function () {

const PANEL_MODES = Object.freeze(['idle', 'smile', 'talk', 'breathe', 'stretch']);
const PANEL_LABELS = Object.freeze({
    idle: 'Calm · waiting',
    smile: 'Smile · water',
    talk: 'Talk · fertilize',
    breathe: 'Breathe · harvest',
    stretch: 'Neck stretch · stake',
});

const CHANNEL_TO_PANEL = Object.freeze({
    water: 'smile',
    fertilizer: 'talk',
    harvest: 'breathe',
    stake: 'stretch',
});

/**
 * Raw detection priority (matches auto-care routing):
 * stretch > breathe > talk > smile > idle.
 * Pass only signals that are true this frame.
 */
function rawPanelModeFromSignals(signals) {
    const s = signals || {};
    if (s.stretchEngaged) return 'stretch';
    if (s.breathing) return 'breathe';
    if (s.talking) return 'talk';
    if (s.smiling) return 'smile';
    return 'idle';
}

function panelModeFromCareChannel(channel) {
    if (!channel) return 'idle';
    return CHANNEL_TO_PANEL[channel] || 'idle';
}

/**
 * Hysteresis: require `enterHoldSec` to switch to a non-idle mode,
 * and `exitHoldSec` to return to idle (reduces flicker).
 */
function createSignalPanelSwitcher(opts) {
    const enterHold = (opts && opts.enterHoldSec) > 0 ? opts.enterHoldSec : 0.32;
    const exitHold = (opts && opts.exitHoldSec) > 0 ? opts.exitHoldSec : 0.5;
    const blendSec = (opts && opts.blendSec) > 0 ? opts.blendSec : 0.45;
    let mode = 'idle';
    let prevMode = 'idle';
    let blendT0 = 0;
    let candidate = 'idle';
    let candidateSince = 0;

    function step(now, desired) {
        const want = PANEL_MODES.includes(desired) ? desired : 'idle';
        const t = Number(now) || 0;
        if (want === mode) {
            candidate = want;
            candidateSince = t;
            return mode;
        }
        if (want !== candidate) {
            candidate = want;
            candidateSince = t;
        }
        const held = t - candidateSince;
        const need = want === 'idle' ? exitHold : enterHold;
        if (held >= need) {
            if (want !== mode) {
                prevMode = mode;
                mode = want;
                blendT0 = t;
            }
        }
        return mode;
    }

    function blendAlpha(now) {
        const t = Number(now) || 0;
        const k = Math.min(1, Math.max(0, (t - blendT0) / blendSec));
        return k;
    }

    function reset() {
        mode = 'idle';
        prevMode = 'idle';
        blendT0 = 0;
        candidate = 'idle';
        candidateSince = 0;
    }

    return {
        step, blendAlpha, reset,
        get mode() { return mode; },
        get prevMode() { return prevMode; },
        enterHoldSec: enterHold,
        exitHoldSec: exitHold,
        blendSec,
    };
}

const api = {
    PANEL_MODES,
    PANEL_LABELS,
    CHANNEL_TO_PANEL,
    rawPanelModeFromSignals,
    panelModeFromCareChannel,
    createSignalPanelSwitcher,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof self !== 'undefined') {
    self.SmileSignalPanel = api;
} else if (typeof window !== 'undefined') {
    window.SmileSignalPanel = api;
}

})();