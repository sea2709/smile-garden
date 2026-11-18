// game/summary-data.js — map visit / morning results to Heily summary card data (pure logic).
'use strict';

const C = (typeof require === 'function')
    ? require('./care-needs.js')
    : (typeof self !== 'undefined' ? self.SmileCareNeeds : null);

const QUIET = '\u2013';

function round1(x) {
    return Math.round(x * 10) / 10;
}

function careStatValue(n) {
    const v = Number(n) || 0;
    if (v <= 1e-6) return { value: QUIET, quiet: true };
    const rounded = Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : String(round1(v));
    return { value: rounded, quiet: false };
}

function sunGlowIcon(sunDots, night) {
    const s = Number(sunDots) || 0;
    if (s <= 1e-6) return night ? 'sun-resting' : 'sun-resting';
    if (s < 1) return 'sun-glow-0';
    if (s < 2) return 'sun-glow-1';
    if (s < 3) return 'sun-glow-2';
    return 'sun-glow-3';
}

/** Sum dot progress across planted beds (care v6). */
function aggregateCareFromBeds(careBeds, harvestCount, state, plantNeeds) {
    let sun = 0;
    let water = 0;
    let fertilizer = 0;
    let stakes = 0;
    for (const b of careBeds || []) {
        const plot = Number(b.plot);
        const p = state && state.plots ? state.plots[plot] : null;
        if (!p) continue;
        const needs = plantNeeds(p.plantId);
        const prog = Object.assign(C.emptyProgress(), b.progress || b);
        sun += Number(prog.sun) || 0;
        water += Number(prog.water) || 0;
        fertilizer += Number(prog.fertilizer) || 0;
        if (needs.stake && C.stakeNeedMet(prog, p.staked)) stakes += 1;
    }
    return {
        sunDots: sun,
        waterDots: water,
        fertilizerDots: fertilizer,
        stakes,
        harvests: Math.max(0, Number(harvestCount) || 0),
    };
}

function aggregateCareFromDailyTends(state, dayNumber, plantNeeds) {
    let sun = 0;
    let water = 0;
    let fertilizer = 0;
    let stakes = 0;
    const day = Math.round(Number(dayNumber) || state.dayNumber || 1);
    for (let i = 0; i < (state.plots || []).length; i++) {
        const t = state.dailyTends && state.dailyTends[i];
        const p = state.plots[i];
        if (!p || !t || t.day !== day) continue;
        const needs = plantNeeds(p.plantId);
        const prog = C.readProgressFromDailyTend(t, needs, p.staked);
        sun += prog.sun;
        water += prog.water;
        fertilizer += prog.fertilizer;
        if (needs.stake && C.stakeNeedMet(prog, p.staked)) stakes += 1;
    }
    return { sunDots: sun, waterDots: water, fertilizerDots: fertilizer, stakes, harvests: 0 };
}

function legacySunHours(out) {
    return Math.max(0, Number(out && out.sunHours) || 0);
}

function buildCareSection(stats, night) {
    const st = stats || { sunDots: 0, waterDots: 0, fertilizerDots: 0, stakes: 0, harvests: 0 };
    const sunVal = st.legacySunHours != null
        ? careStatValue(st.legacySunHours)
        : careStatValue(st.sunDots);
    if (st.legacySunHours != null && !sunVal.quiet) {
        sunVal.value = `${round1(st.legacySunHours)} h`;
        sunVal.quiet = false;
    }
    const sun = {
        icon: sunGlowIcon(st.legacySunHours != null ? st.legacySunHours : st.sunDots, night),
        src: 'from daylight, all by itself',
        ...sunVal,
    };
    const care = [
        Object.assign({ key: 'water', label: 'Water', src: 'from smiles' }, careStatValue(st.waterDots)),
        Object.assign({ key: 'fertilizer', label: 'Fertilizer', src: 'from talking' }, careStatValue(st.fertilizerDots)),
        Object.assign({ key: 'stake', label: 'Stakes', src: 'from stretching' }, careStatValue(st.stakes)),
        Object.assign({ key: 'harvest', label: 'Harvests', src: 'from breathing' }, careStatValue(st.harvests)),
    ];
    return { sun, care };
}

/**
 * @param {object} ctx — { out, state, night, fmtDate, now, lightingLabel, weeklyVisits,
 *   STAGES, plantById, plantSrc, readyPlotIndices, gardenTodayKey, seasonDay, daysPerSeason }
 */
function buildSummaryData(ctx) {
    const out = ctx.out || {};
    const state = ctx.state || {};
    const night = !!ctx.night;
    const plantById = ctx.plantById;
    const STAGES = ctx.STAGES || [];
    const grew = out.grew || [];
    const harvested = out.harvested || [];
    const matured = grew.some((g) => g.mature);
    let title;
    if (night) {
        title = grew.length ? 'Your garden grew overnight' : 'A quiet night in the garden';
    } else if (matured) {
        title = 'Something grew all the way!';
    } else if (grew.length) {
        title = 'Your garden grew today';
    } else {
        title = 'A lovely, quiet visit';
    }

    const weekly = typeof ctx.weeklyVisits === 'function'
        ? ctx.weeklyVisits(state, ctx.now)
        : (out.weekly != null ? out.weekly : 0);
    const light = ctx.lightingLabel || '';
    const datePart = typeof ctx.fmtDate === 'function' ? ctx.fmtDate(ctx.now) : '';
    const eyebrow = [datePart, light, `${weekly} ${weekly === 1 ? 'visit' : 'visits'} this week`].filter(Boolean).join(' · ');

    let hero;
    if (grew.length) {
        hero = {
            icon: 'bloom-stamp',
            num: grew.length,
            text: grew.length === 1 ? 'plant grew a stage' : 'plants grew a stage',
        };
    } else if (night) {
        hero = { art: 'morning-hero.png' };
    } else {
        hero = { icon: 'resting-leaf', text: 'a quiet day in the garden' };
    }

    const garden = [];
    const plantSrc = ctx.plantSrc;
    for (const g of grew) {
        garden.push({
            kind: 'grew',
            icon: 'need-done',
            plantImg: plantSrc ? plantSrc(g.plantId, g.to) : null,
            name: g.name,
            meta: g.mature ? 'fully grown' : `→ ${(STAGES[g.to] && STAGES[g.to].label) || g.to}`,
        });
    }
    for (const h of harvested) {
        garden.push({
            kind: 'harvest',
            icon: 'harvest-badge',
            name: h.name,
            meta: `×${h.yield} from bed ${h.plot + 1}`,
        });
    }
    const readyFn = ctx.readyPlotIndices;
    const todayKey = typeof ctx.gardenTodayKey === 'function' ? ctx.gardenTodayKey() : null;
    if (readyFn && todayKey) {
        const ready = readyFn(state.plots, todayKey);
        if (ready.length) {
            garden.push({
                kind: 'ready',
                icon: 'harvest-badge',
                name: `${ready.length} crop${ready.length === 1 ? '' : 's'}`,
                meta: 'ready to harvest',
            });
        }
    }
    for (const u of out.seedUnlocks || out.unlocked || []) {
        const name = plantById(u).name;
        garden.push({ kind: 'unlock', icon: 'bloom-stamp', name, meta: 'new seeds unlocked' });
    }
    for (const id of out.decorUnlocks || []) {
        const name = typeof ctx.decorLabel === 'function' ? ctx.decorLabel(id) : id;
        garden.push({ kind: 'unlock', icon: 'bloom-stamp', name, meta: 'decoration unlocked' });
    }
    if (!garden.length) {
        garden.push({
            kind: 'resting',
            icon: 'resting-leaf',
            name: 'Your plants',
            meta: night ? 'are resting — tend them today' : 'are waiting for your care',
        });
    }
    for (const w of (out.waiting || []).slice(0, 2)) {
        if (typeof ctx.waitingText === 'function') {
            garden.push({ kind: 'resting', icon: 'resting-leaf', name: w.name || 'A plant', meta: ctx.waitingText(w) });
        }
    }

    let stats = out.careStats;
    if (!stats && state.version >= 6 && C) {
        stats = aggregateCareFromDailyTends(state, state.dayNumber, (id) => plantById(id).needs || {});
    } else if (!stats) {
        stats = {
            legacySunHours: legacySunHours(out),
            waterDots: Math.round((Number(out.water) || 0) * 3),
            fertilizerDots: Math.round((Number(out.fertilizer) || 0) * 3),
            stakes: 0,
            harvests: (harvested || []).length,
        };
    }
  if (!stats.harvests && harvested.length) stats = Object.assign({}, stats, { harvests: harvested.length });

    const { sun, care } = buildCareSection(stats, night);

    let note = null;
    if (night) {
        const sd = ctx.seasonDay != null ? ctx.seasonDay : state.seasonDay;
        const dps = ctx.daysPerSeason || 7;
        note = `Season day ${sd} of ${dps}. Growth happens when you go to bed, not on a timer.`;
    }

    return { eyebrow, title, hero, garden, sun, care, note, careLabel: "Today's care" };
}

const api = {
    QUIET,
    careStatValue,
    sunGlowIcon,
    aggregateCareFromBeds,
    aggregateCareFromDailyTends,
    buildCareSection,
    buildSummaryData,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof self !== 'undefined') {
    self.SmileSummaryData = api;
} else if (typeof window !== 'undefined') {
    window.SmileSummaryData = api;
}