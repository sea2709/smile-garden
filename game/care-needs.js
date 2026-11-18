// game/care-needs.js — per-plant daily need dots (pure logic).
'use strict';
(function () {

const CARE_DOT_SECONDS = Object.freeze({
    sun: 10,
    water: 10,
    fertilizer: 15,
});

/** Player inputs for daily care (sun is automatic by daylight). */
const CARE_PLAYER = Object.freeze({
    sun: { auto: true, label: 'Sunlight' },
    water: { step: 'care-smile', input: 'smile', label: 'Water' },
    fertilizer: { step: 'care-talk', input: 'talk', label: 'Fertilize' },
    harvest: { step: 'care-harvest', input: 'breathe', label: 'Harvest' },
    stake: { step: 'stretch', input: 'stretch', label: 'Stake' },
});

const NEED_KEYS = Object.freeze(['sun', 'water', 'fertilizer', 'stake']);

function emptyProgress() {
    return { sun: 0, water: 0, fertilizer: 0, stake: false };
}

function normalizeNeeds(raw) {
    const n = raw || {};
    return Object.freeze({
        sun: Math.max(0, Math.min(3, Math.round(Number(n.sun) || 0))),
        water: Math.max(0, Math.min(3, Math.round(Number(n.water) || 0))),
        fertilizer: Math.max(0, Math.min(3, Math.round(Number(n.fertilizer) || 0))),
        stake: !!n.stake,
    });
}

function totalDots(needs) {
    const n = normalizeNeeds(needs);
    return n.sun + n.water + n.fertilizer + (n.stake ? 1 : 0);
}

function dotsForNeed(needs, key) {
    const n = normalizeNeeds(needs);
    if (key === 'stake') return n.stake ? 1 : 0;
    return n[key] || 0;
}

function stakeNeedMet(progress, plotStaked) {
    return !!(plotStaked || (progress && progress.stake));
}

function fillFraction(progress, needs, key, plotStaked) {
    const req = dotsForNeed(needs, key);
    if (req <= 0) return 1;
    if (key === 'stake') return stakeNeedMet(progress, plotStaked) ? 1 : 0;
    const got = Math.max(0, Number(progress && progress[key]) || 0);
    return Math.min(1, got / req);
}

function allNeedsMet(progress, needs, plotStaked) {
    const n = normalizeNeeds(needs);
    if (n.sun > 0 && (Number(progress && progress.sun) || 0) + 1e-6 < n.sun) return false;
    if (n.water > 0 && (Number(progress && progress.water) || 0) + 1e-6 < n.water) return false;
    if (n.fertilizer > 0 && (Number(progress && progress.fertilizer) || 0) + 1e-6 < n.fertilizer) return false;
    if (n.stake && !stakeNeedMet(progress, plotStaked)) return false;
    return totalDots(n) > 0 || true;
}

/** Fill sun dots over time while the garden clock is in daylight (not at night). */
function addAutoSun(progress, needs, dtSeconds, isDaylight) {
    const p = Object.assign(emptyProgress(), progress);
    if (!isDaylight) return p;
    const n = normalizeNeeds(needs);
    if (n.sun <= 0) return p;
    const req = n.sun;
    if ((Number(p.sun) || 0) + 1e-6 >= req) return p;
    const add = (Number(dtSeconds) || 0) / CARE_DOT_SECONDS.sun;
    p.sun = Math.min(req, (Number(p.sun) || 0) + add);
    return p;
}

function addDotTime(progress, key, seconds, needs) {
    const p = Object.assign(emptyProgress(), progress);
    if (key === 'stake') {
        p.stake = true;
        return p;
    }
    const unit = CARE_DOT_SECONDS[key];
    if (!unit || key === 'stake') return p;
    const req = dotsForNeed(needs, key);
    const add = (Number(seconds) || 0) / unit;
    p[key] = Math.min(req, (Number(p[key]) || 0) + add);
    return p;
}

function readProgressFromDailyTend(raw, needs, plotStaked) {
    if (!raw || typeof raw !== 'object') return migrateLegacyTend(raw, needs, plotStaked);
    return {
        sun: Math.max(0, Number(raw.sun) || 0),
        water: Math.max(0, Number(raw.water) || 0),
        fertilizer: Math.max(0, Number(raw.fertilizer) || 0),
        stake: raw.stake === true || stakeNeedMet({ stake: raw.stake }, plotStaked),
    };
}

/** Migrate legacy dailyTend { sunHours, water 0-1 } to dot progress (best-effort). */
function migrateLegacyTend(raw, needs, plotStaked) {
    const p = emptyProgress();
    if (!raw) return p;
    if (raw.sun != null || raw.fertilizer != null && typeof raw.sunHours !== 'number') {
        p.sun = Number(raw.sun) || 0;
        p.water = Number(raw.water) || 0;
        p.fertilizer = Number(raw.fertilizer) || 0;
        p.stake = raw.stake === true || stakeNeedMet(p, plotStaked);
        return p;
    }
    const n = normalizeNeeds(needs);
    if (n.sun > 0 && Number(raw.sunHours) > 0) p.sun = n.sun;
    if (n.water > 0 && Number(raw.water) >= 0.99) p.water = n.water;
    if (n.fertilizer > 0 && Number(raw.fertilizer) > 0) p.fertilizer = n.fertilizer;
    if (n.stake && plotStaked) p.stake = true;
    return p;
}

function needStillOpen(progress, needs, plotStaked, key) {
    return fillFraction(progress, needs, key, plotStaked) < 1 - 1e-6;
}

/**
 * Which care channel auto-detection should apply this frame (null = none).
 * Priority: stake > harvest breath > talk > smile.
 * Overlap: talk beats smile; harvest blocks water/fert until breath finishes or is abandoned.
 */
function pickAutoCareChannel(ctx) {
    const c = ctx || {};
    if (!c.faceVisible || c.poorReading) return null;
    const needs = normalizeNeeds(c.needs);
    const progress = Object.assign(emptyProgress(), c.progress);
    const plotStaked = !!c.plotStaked;

    if (needs.stake && !stakeNeedMet(progress, plotStaked) && c.stretchEngaged) return 'stake';

    if (c.canHarvest && (c.harvestBreathStarted || c.breathingFresh)) return 'harvest';

    if (needs.fertilizer > 0 && needStillOpen(progress, needs, plotStaked, 'fertilizer') && c.talking) {
        return 'fertilizer';
    }
    if (needs.water > 0 && needStillOpen(progress, needs, plotStaked, 'water') && c.smiling) {
        return 'water';
    }
    return null;
}

function toDailyTendRecord(progress, needs, plotStaked, day) {
    const p = Object.assign(emptyProgress(), progress);
    const allMet = allNeedsMet(p, needs, plotStaked);
    return {
        day,
        sun: p.sun,
        water: p.water,
        fertilizer: p.fertilizer,
        stake: stakeNeedMet(p, plotStaked),
        allMet,
    };
}

const api = {
    CARE_DOT_SECONDS,
    CARE_PLAYER,
    NEED_KEYS,
    addAutoSun,
    emptyProgress,
    normalizeNeeds,
    totalDots,
    dotsForNeed,
    stakeNeedMet,
    fillFraction,
    allNeedsMet,
    addDotTime,
    needStillOpen,
    pickAutoCareChannel,
    toDailyTendRecord,
    migrateLegacyTend,
    readProgressFromDailyTend,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof self !== 'undefined') {
    self.SmileCareNeeds = api;
} else if (typeof window !== 'undefined') {
    window.SmileCareNeeds = api;
}

})();