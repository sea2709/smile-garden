// game/day.js — Stardew-style in-game day clock, seasons, overnight growth.
'use strict';
(function () {

const SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
const SEASON_LABELS = Object.freeze({ spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' });
const DAYS_PER_SEASON = 7;

const DEFAULT_DAY_CONFIG = Object.freeze({
    startMinutes: 360,       // 6:00
    endMinutes: 1440,        // 24:00
    lateNightStop: 1380,     // 23:00 — clock pauses here until bed
    realMsPerGardenMinute: 500, // 1 real minute = 120 garden minutes (2 garden hours)
});

/** @type {Record<string, string[]>} */
const PLANT_SEASONS = Object.freeze({
    lettuce: ['spring', 'autumn', 'winter'],
    mint: ['spring', 'summer', 'autumn'],
    cucumber: ['summer'],
    tomato: ['summer', 'autumn'],
    sunflower: ['summer'],
    apple: ['spring', 'summer', 'autumn', 'winter'],
});

function seasonForDayNumber(dayNumber) {
    const n = Math.max(1, Math.round(Number(dayNumber) || 1));
    const idx = Math.floor((n - 1) / DAYS_PER_SEASON) % SEASONS.length;
    return SEASONS[idx];
}

function seasonDayNumber(dayNumber) {
    const n = Math.max(1, Math.round(Number(dayNumber) || 1));
    return ((n - 1) % DAYS_PER_SEASON) + 1;
}

function gardenDayKey(dayNumber) {
    return `garden-${Math.max(1, Math.round(Number(dayNumber) || 1))}`;
}

function parseGardenDayKey(key) {
    const m = /^garden-(\d+)$/.exec(String(key));
    return m ? Number(m[1]) : null;
}

function daysBetweenKeys(a, b) {
    const ga = parseGardenDayKey(a), gb = parseGardenDayKey(b);
    if (ga != null && gb != null) return gb - ga;
    return null;
}

function clampMinutes(m, cfg) {
    const c = cfg || DEFAULT_DAY_CONFIG;
    return Math.max(c.startMinutes, Math.min(c.lateNightStop, Number(m) || c.startMinutes));
}

function formatGardenTime(minutes) {
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    const h24 = Math.floor(m / 60) % 24;
    const min = m % 60;
    const h12 = h24 % 12 || 12;
    const ap = h24 >= 12 ? 'PM' : 'AM';
    return `${h12}:${String(min).padStart(2, '0')} ${ap}`;
}

function gardenHour(minutes) {
    return Math.floor((Number(minutes) || 0) / 60);
}

/** Piecewise lighting blend weights (dawn 6–9, midday 9–19, night 19–24). */
function lightingBlend(minutes) {
    const h = (Number(minutes) || 0) / 60;
    const w = { dawn: 0, midday: 0, night: 0 };
    if (h < 6) {
        w.night = 1;
    } else if (h < 9) {
        const t = (h - 6) / 3;
        w.dawn = 1 - t;
        w.midday = t;
    } else if (h < 19) {
        w.midday = 1;
    } else if (h < 21) {
        const t = (h - 19) / 2;
        w.midday = 1 - t;
        w.night = t;
    } else {
        w.night = 1;
    }
    let primary = 'midday';
    let best = -1;
    for (const k of ['dawn', 'midday', 'night']) {
        if (w[k] > best) { best = w[k]; primary = k; }
    }
    return { weights: w, primary, hour: h };
}

function isDaylight(minutes) {
    const lb = lightingBlend(minutes);
    return lb.weights.night < 0.55;
}

function isPlantInSeason(plantId, season) {
    const allowed = PLANT_SEASONS[plantId];
    if (!allowed) return true;
    return allowed.includes(season);
}

function defaultGardenFields() {
    return {
        dayNumber: 1,
        gardenMinutes: DEFAULT_DAY_CONFIG.startMinutes,
        season: 'spring',
        seasonDay: 1,
        dailyTends: {},
        morningPending: null,
        daysCompleted: 0,
    };
}

function migrateGardenFields(state) {
    const g = defaultGardenFields();
    if (!state || typeof state !== 'object') return g;
    state.dayNumber = Math.max(1, Math.round(Number(state.dayNumber) || g.dayNumber));
    state.gardenMinutes = clampMinutes(state.gardenMinutes != null ? state.gardenMinutes : g.gardenMinutes);
    state.season = SEASONS.includes(state.season) ? state.season : seasonForDayNumber(state.dayNumber);
    state.seasonDay = seasonDayNumber(state.dayNumber);
    state.dailyTends = state.dailyTends && typeof state.dailyTends === 'object' ? state.dailyTends : {};
    state.morningPending = state.morningPending || null;
    return state;
}

class GardenDayClock {
    /**
     * @param {object} state — mutable garden state with gardenMinutes
     * @param {object} [cfg]
     */
    constructor(state, cfg) {
        this.state = state;
        this.cfg = Object.assign({}, DEFAULT_DAY_CONFIG, cfg || {});
        this.running = true;
        this.lastRealMs = null;
    }

    pause() { this.running = false; }
    resume() { this.running = true; }
    isRunning() { return this.running; }

    tick(realDtMs) {
        if (!this.running || !this.state) return;
        const c = this.cfg;
        if (this.state.gardenMinutes >= c.lateNightStop) return;
        const add = (Number(realDtMs) || 0) / c.realMsPerGardenMinute;
        this.state.gardenMinutes = clampMinutes(this.state.gardenMinutes + add, c);
    }

    atLateNight() {
        return this.state.gardenMinutes >= this.cfg.lateNightStop - 1e-6;
    }

    suggestBed() {
        const h = gardenHour(this.state.gardenMinutes);
        return h >= 18;
    }
}

/**
 * Record per-plant tending for the current garden day (no growth until bed).
 * beds: [{ plot, sunHours, water, fertilizer, breaths? }]
 */
function recordDayTending(state, beds, dayNumber, plantById) {
    const day = Math.max(1, Math.round(Number(dayNumber) || state.dayNumber || 1));
    const out = [];
    for (const b of beds || []) {
        const i = Number(b.plot);
        const p = state.plots[i];
        if (!p) continue;
        if (!state.dailyTends) state.dailyTends = {};
        if (state.version >= 6 && b.progress) {
            const rec = Object.assign({ day }, b.progress, {
                allMet: !!b.allMet,
                stake: !!b.stake,
            });
            state.dailyTends[i] = rec;
        } else {
            state.dailyTends[i] = {
                day,
                sunHours: Math.max(0, Number(b.sunHours) || 0),
                water: Math.max(0, Math.min(1, Number(b.water) || 0)),
                fertilizer: Math.max(0, Math.min(1, Number(b.fertilizer) || 0)),
                breaths: Number(b.breaths) || 0,
            };
        }
        p.tendedDay = day;
        const kind = plantById(p.plantId);
        out.push({ plot: i, plantId: p.plantId, name: kind ? kind.name : p.plantId });
    }
    return out;
}

function plotTendedToday(state, plotIndex) {
    const p = state.plots[plotIndex];
    const t = state.dailyTends && state.dailyTends[plotIndex];
    if (!p || !t || t.day !== state.dayNumber) return false;
    if (state.version >= 6) return t.allMet === true;
    return true;
}

function tendablePlotIndicesDay(state, harvestApi) {
    const out = [];
    const day = state.dayNumber;
    const key = gardenDayKey(day);
    state.plots.forEach((p, i) => {
        if (!p) return;
        if (harvestApi.isPlotReady(p, key)) return;
        if (harvestApi.isPlotRegrowing(p, key)) return;
        if (p.stage >= harvestApi.MAX_STAGE) return;
        if (state.version >= 6) {
            const t = state.dailyTends && state.dailyTends[i];
            if (t && t.day === day && t.allMet) return;
        } else if (plotTendedToday(state, i)) return;
        if (!isPlantInSeason(p.plantId, state.season)) return;
        out.push(i);
    });
    return out;
}

const api = {
    SEASONS,
    SEASON_LABELS,
    DAYS_PER_SEASON,
    DEFAULT_DAY_CONFIG,
    PLANT_SEASONS,
    seasonForDayNumber,
    seasonDayNumber,
    gardenDayKey,
    parseGardenDayKey,
    daysBetweenKeys,
    clampMinutes,
    formatGardenTime,
    gardenHour,
    lightingBlend,
    isDaylight,
    isPlantInSeason,
    defaultGardenFields,
    migrateGardenFields,
    GardenDayClock,
    recordDayTending,
    plotTendedToday,
    tendablePlotIndicesDay,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.SmileDay = api;
}

})();