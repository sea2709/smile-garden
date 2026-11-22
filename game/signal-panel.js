// game/signal-panel.js — care signal panel mode + hysteresis (pure logic).
'use strict';
(function () {

const PANEL_MODES = Object.freeze(['idle', 'smile', 'talk', 'breathe', 'stretch']);
const PANEL_LABELS = Object.freeze({
    idle: 'Waiting for you',
    smile: 'Watering',
    talk: 'Fertilizing',
    breathe: 'Harvesting',
    stretch: 'Staking',
});

const CHANNEL_TO_PANEL = Object.freeze({
    water: 'smile',
    fertilizer: 'talk',
    harvest: 'breathe',
    stake: 'stretch',
});

/**
 * Raw detection priority (matches auto-care routing):
 * stretch > talk > smile > idle.
 * Harvest is click-only; breathing no longer drives a care channel.
 * Pass only signals that are true this frame.
 */
function rawPanelModeFromSignals(signals) {
    const s = signals || {};
    if (s.stretchEngaged) return 'stretch';
    if (s.talking) return 'talk';
    if (s.smiling) return 'smile';
    return 'idle';
}

function panelModeFromCareChannel(channel) {
    if (!channel) return 'idle';
    return CHANNEL_TO_PANEL[channel] || 'idle';
}

/**
 * Hysteresis (signal-manifest): hold a detected state ≥400ms; ~1.2s of
 * nothing before idle. `prefers-reduced-motion` callers may pass 0 holds.
 */
function createSignalPanelSwitcher(opts) {
    const enterHold = opts && Number.isFinite(opts.enterHoldSec) ? opts.enterHoldSec : 0.4;
    const exitHold = opts && Number.isFinite(opts.exitHoldSec) ? opts.exitHoldSec : 1.2;
    const blendSec = opts && Number.isFinite(opts.blendSec) ? opts.blendSec : 0.3;
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

    /** Capture/UI: jump to a mode without waiting on hysteresis. */
    function forceMode(m, now) {
        const want = PANEL_MODES.includes(m) ? m : 'idle';
        const t = Number(now) || 0;
        if (want !== mode) {
            prevMode = mode;
            mode = want;
            blendT0 = t;
        }
        candidate = want;
        candidateSince = t;
        return mode;
    }

    return {
        step, blendAlpha, reset, forceMode,
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