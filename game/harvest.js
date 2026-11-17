// game/harvest.js — harvests, pantry, seed unlock milestones, decorations (pure logic).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SmileHarvest = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAX_STAGE = 5;
    const HARVEST_HOLD_SECONDS = 2;
    const WATER_FULL = 1 - 1e-6;

    /** Per-plant harvest behaviour. */
    const PLANT_HARVEST = Object.freeze({
        lettuce: Object.freeze({ mode: 'pull', baseYield: 1 }),
        sunflower: Object.freeze({ mode: 'pull', baseYield: 1 }),
        mint: Object.freeze({ mode: 'regrow', regrowDays: 1, baseYield: 1 }),
        cucumber: Object.freeze({ mode: 'regrow', regrowDays: 2, baseYield: 1 }),
        tomato: Object.freeze({ mode: 'regrow', regrowDays: 2, baseYield: 1 }),
        apple: Object.freeze({ mode: 'regrow', regrowDays: 3, baseYield: 1 }),
    });

    /** Seed unlock: first path wins (harvests OR visit fallback). */
    const SEED_UNLOCK = Object.freeze({
        lettuce: Object.freeze({ harvests: 0, visits: 0 }),
        mint: Object.freeze({ harvests: 0, visits: 0 }),
        cucumber: Object.freeze({ harvests: 0, visits: 0 }),
        tomato: Object.freeze({ harvests: 1, visits: 2 }),
        sunflower: Object.freeze({ harvests: 3, visits: 4 }),
        apple: Object.freeze({ harvests: 6, visits: 7 }),
    });

  const DECOR_UNLOCKS = Object.freeze([
        Object.freeze({ id: 'lantern', label: 'Lantern', harvests: 2, nightGlow: true }),
        Object.freeze({ id: 'birdbath', label: 'Birdbath', harvests: 5, nightGlow: false }),
        Object.freeze({ id: 'bench', label: 'Garden bench', harvests: 8, nightGlow: false }),
        Object.freeze({ id: 'scarecrow', label: 'Scarecrow', harvests: 12, nightGlow: false }),
        Object.freeze({ id: 'fairy-lights', label: 'Fairy lights', harvests: 16, nightGlow: true }),
    ]);

    function plantHarvestCfg(plantId) {
        return PLANT_HARVEST[plantId] || Object.freeze({ mode: 'regrow', regrowDays: 2, baseYield: 1 });
    }

    function emptyPantry() {
        return { items: {}, totalHarvests: 0 };
    }

    function emptyDecor() {
        return { placements: {}, unlocked: [] };
    }

    function emptySpareSeeds() {
        return {};
    }

    function sanitizePantry(raw) {
        const p = emptyPantry();
        if (!raw || typeof raw !== 'object') return p;
        p.totalHarvests = Math.max(0, Math.round(Number(raw.totalHarvests) || 0));
        const items = raw.items && typeof raw.items === 'object' ? raw.items : {};
        for (const [k, v] of Object.entries(items)) {
            if (!v || typeof v !== 'object') continue;
            p.items[k] = {
                count: Math.max(0, Math.round(Number(v.count) || 0)),
                firstDay: typeof v.firstDay === 'string' ? v.firstDay : null,
            };
        }
        return p;
    }

    function sanitizeDecor(raw) {
        const d = emptyDecor();
        if (!raw || typeof raw !== 'object') return d;
        const u = Array.isArray(raw.unlocked) ? raw.unlocked : [];
        d.unlocked = u.filter((id) => DECOR_UNLOCKS.some((x) => x.id === id));
        const pl = raw.placements && typeof raw.placements === 'object' ? raw.placements : {};
        for (const [spot, id] of Object.entries(pl)) {
            if (typeof id !== 'string' || !d.unlocked.includes(id)) continue;
            d.placements[spot] = id;
        }
        return d;
    }

    function sanitizeSpareSeeds(raw) {
        const o = emptySpareSeeds();
        if (!raw || typeof raw !== 'object') return o;
        for (const [k, v] of Object.entries(raw)) {
            const n = Math.max(0, Math.round(Number(v) || 0));
            if (n) o[k] = n;
        }
        return o;
    }

    function extendPlotSanitize(p) {
        if (!p) return p;
        return Object.assign({}, p, {
            picked: p.picked === true,
            pickDay: typeof p.pickDay === 'string' ? p.pickDay : null,
            matureWater: p.matureWater == null ? null : Math.max(0, Math.min(1, Number(p.matureWater) || 0)),
            matureFert: p.matureFert == null ? null : Math.max(0, Math.min(1, Number(p.matureFert) || 0)),
            tendedDay: Number.isFinite(Number(p.tendedDay)) ? Math.round(Number(p.tendedDay)) : p.tendedDay,
        });
    }

    /** True when the crop can be harvested today. */
    function isPlotReady(p, today) {
        if (!p || p.stage < MAX_STAGE) return false;
        if (!p.picked) return true;
        const cfg = plantHarvestCfg(p.plantId);
        if (cfg.mode !== 'regrow' || !p.pickDay) return false;
        return daysBetween(p.pickDay, today) >= cfg.regrowDays;
    }

    function isPlotRegrowing(p, today) {
        if (!p || !p.picked) return false;
        const cfg = plantHarvestCfg(p.plantId);
        if (cfg.mode !== 'regrow') return false;
        if (!p.pickDay) return true;
        return daysBetween(p.pickDay, today) < cfg.regrowDays;
    }

    function parseGardenDayKey(key) {
        const m = /^garden-(\d+)$/.exec(String(key));
        return m ? Number(m[1]) : null;
    }

    function daysBetween(a, b) {
        const ga = parseGardenDayKey(a), gb = parseGardenDayKey(b);
        if (ga != null && gb != null) return gb - ga;
        const da = dayStart(a), db = dayStart(b);
        const DAY_MS = 86400000;
        return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) -
            Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / DAY_MS);
    }

    function dayStart(key) {
        const [y, m, d] = String(key).split('-').map(Number);
        return new Date(y, m - 1, d, 0, 0, 0, 0);
    }

    function computeYield(p) {
        const cfg = plantHarvestCfg(p.plantId);
        let y = cfg.baseYield || 1;
        const w = p.matureWater == null ? 0 : p.matureWater;
        const f = p.matureFert == null ? 0 : p.matureFert;
        if (w >= WATER_FULL) y += 1;
        if (f > 0) y += 1;
        return y;
    }

    function readyPlotIndices(plots, today) {
        const out = [];
        plots.forEach((p, i) => { if (isPlotReady(p, today)) out.push(i); });
        return out;
    }

    function tendablePlotIndices(plots, today) {
        const out = [];
        plots.forEach((p, i) => {
            if (!p) return;
            if (isPlotReady(p, today)) return;
            if (isPlotRegrowing(p, today)) return;
            if (p.stage < MAX_STAGE) out.push(i);
        });
        return out;
    }

    function totalHarvests(state) {
        return (state.pantry && state.pantry.totalHarvests) || 0;
    }

    function isSeedUnlocked(state, plantId, visitCount) {
        const rule = SEED_UNLOCK[plantId];
        if (!rule) return false;
        const h = totalHarvests(state);
        const v = visitCount(state);
        if (rule.harvests > 0 && h >= rule.harvests) return true;
        return v >= rule.visits;
    }

    function unlockedPlantsByHarvest(state, visitCount, allPlantIds) {
        return allPlantIds.filter((id) => isSeedUnlocked(state, id, visitCount));
    }

    function decorUnlocked(state) {
        const h = totalHarvests(state);
        const have = new Set(state.decor?.unlocked || []);
        for (const d of DECOR_UNLOCKS) {
            if (h >= d.harvests) have.add(d.id);
        }
        return [...have];
    }

    function syncDecorUnlocks(state) {
        if (!state.decor) state.decor = emptyDecor();
        state.decor.unlocked = decorUnlocked(state);
        const pl = state.decor.placements;
        for (const spot of Object.keys(pl)) {
            if (!state.decor.unlocked.includes(pl[spot])) delete pl[spot];
        }
    }

    function addToPantry(state, plantId, amount, day) {
        if (!state.pantry) state.pantry = emptyPantry();
        if (!state.pantry.items[plantId]) {
            state.pantry.items[plantId] = { count: 0, firstDay: day };
        }
        const item = state.pantry.items[plantId];
        item.count += Math.max(0, amount);
        if (!item.firstDay) item.firstDay = day;
        state.pantry.totalHarvests += Math.max(0, amount);
        syncDecorUnlocks(state);
    }

    /**
     * Harvest one ready plot. Mutates state.plots and pantry.
     * Returns { plot, plantId, name, yield, mode }.
     */
    function dayKeyFrom(now) {
        if (typeof now === 'string' && (/^\d{4}-\d{2}-\d{2}$/.test(now) || /^garden-\d+$/.test(now))) return now;
        const dt = now instanceof Date ? now : new Date(now);
        return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    }

    function harvestPlot(state, plotIndex, now, plantById) {
        const i = Number(plotIndex);
        const p = state.plots[i];
        const dk = dayKeyFrom(now);
        if (!p || !isPlotReady(p, dk)) return { ok: false, reason: 'not-ready' };
        const kind = plantById(p.plantId);
        if (!kind) return { ok: false, reason: 'unknown' };
        const y = computeYield(p);
        addToPantry(state, p.plantId, y, dk);
        const cfg = plantHarvestCfg(p.plantId);
        let mode = cfg.mode;
        if (cfg.mode === 'pull') {
            state.plots[i] = null;
            if (!state.spareSeeds) state.spareSeeds = emptySpareSeeds();
            state.spareSeeds[p.plantId] = (state.spareSeeds[p.plantId] || 0) + 1;
        } else {
            state.plots[i] = Object.assign({}, p, {
                picked: true,
                pickDay: dk,
                matureWater: null,
                matureFert: null,
            });
        }
        return {
            ok: true,
            plot: i,
            plantId: p.plantId,
            name: kind.name,
            yield: y,
            mode,
            totalHarvests: state.pantry.totalHarvests,
        };
    }

    function placeDecor(state, spotId, decorId) {
        if (!state.decor) state.decor = emptyDecor();
        syncDecorUnlocks(state);
        if (!decorId) {
            delete state.decor.placements[spotId];
            return { ok: true, spot: spotId, decor: null };
        }
        if (!state.decor.unlocked.includes(decorId)) return { ok: false, reason: 'locked' };
        state.decor.placements[spotId] = decorId;
        return { ok: true, spot: spotId, decor: decorId };
    }

    function makeAllReady(state) {
        const today = null;
        state.plots.forEach((p, i) => {
            if (!p) return;
            p.stage = MAX_STAGE;
            p.sunBank = 0;
            p.picked = false;
            p.pickDay = null;
            p.matureDay = p.matureDay || 'demo';
            p.matureWater = 1;
            p.matureFert = 1;
        });
        return state;
    }

    const pad2 = (n) => String(n).padStart(2, '0');

    return {
        HARVEST_HOLD_SECONDS,
        PLANT_HARVEST,
        SEED_UNLOCK,
        DECOR_UNLOCKS,
        plantHarvestCfg,
        emptyPantry,
        emptyDecor,
        emptySpareSeeds,
        sanitizePantry,
        sanitizeDecor,
        sanitizeSpareSeeds,
        extendPlotSanitize,
        isPlotReady,
        isPlotRegrowing,
        computeYield,
        readyPlotIndices,
        tendablePlotIndices,
        totalHarvests,
        isSeedUnlocked,
        unlockedPlantsByHarvest,
        decorUnlocked,
        syncDecorUnlocks,
        addToPantry,
        harvestPlot,
        placeDecor,
        makeAllReady,
    };
});