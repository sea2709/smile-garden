// game/visit.js
//
// Daily-visit layer for Smile Garden v3 (pure logic: no DOM, no Electron, no
// SDK). Runs in Node (node:test) and in the renderer as window.SmileVisit.
//
//   * Local-time helpers: day keys (reset at local midnight), ISO-ish weeks
//     (Mon–Sun), time-of-day lighting (dawn 5–9, midday 9–16, golden hour
//     16–19, night otherwise).
//   * Persistent garden state: 8 plots, plants at stages 1..5, a sun bank per
//     plant, visit days, a journal. JSON in / JSON out, versioned.
//   * VisitSession: greeting -> smile (~45 s) -> talk (~30 s) -> optional
//     guided breathing -> summary. Smiling (HAPPY) fills sunlight, talking
//     (face.talking) fills water, finished guided breaths add fertilizer.
//   * BreathPacer: soft nose breathing, no holds, 3–6 breaths per bout (default 40 s).
//
// Nothing ever dies or wilts. A plant that did not get enough today simply
// waits, and keeps the sunlight it already banked.

(function (root, factory) {
    const logic = (typeof module === 'object' && module.exports)
        ? require('./logic.js')
        : root.SmileLogic;
    const harvest = (typeof module === 'object' && module.exports)
        ? require('./harvest.js')
        : root.SmileHarvest;
    const api = factory(logic, harvest);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SmileVisit = api;
})(typeof self !== 'undefined' ? self : this, function (L, H) {
    'use strict';

    const STATE_VERSION = 4;
    const PLOTS = 8;
    const MAX_STAGE = 5;
    const DAY_MS = 86400000;

    const STAGES = Object.freeze([
        null,
        Object.freeze({ n: 1, key: 'seed', label: 'Seed' }),
        Object.freeze({ n: 2, key: 'sprout', label: 'Sprout' }),
        Object.freeze({ n: 3, key: 'young', label: 'Young plant' }),
        Object.freeze({ n: 4, key: 'growing', label: 'Growing' }),
        Object.freeze({ n: 5, key: 'mature', label: 'Mature' }),
    ]);

    const STAGE_PHRASE = Object.freeze({ 2: 'sprouted', 3: 'became a young plant', 4: 'is growing strong', 5: 'is fully grown!' });

    // Game tuning. Real sun hours live in logic.js PLANTS (cost = the sun-hours
    // a plant needs banked to grow one stage).
    const TUNING = Object.freeze({
        maxSunHours: 12,          // one visit can give the garden at most 12 h of "sun"
        smileSecondsForMax: 30,   // ~30 s of real smiling (out of 45) = a full 12 h day
        talkSecondsForFull: 12,   // ~12 s of chatting (out of 30) fills the watering can
        waterToGrow: 0.5,         // a plant needs at least half a can to grow a stage today
        fertilizerBoost: 0.5,     // full fertilizer = +50% banked sunlight (only speeds growth)
        smileSeconds: 45,
        talkSeconds: 30,
        fastSmileSeconds: 14,
        fastTalkSeconds: 10,
        poorFaceSeconds: 1.5,     // face missing this long = "poor reading" (pause + hint)
        minSmilePerBed: 6,        // per-bed smile step floor when many beds are planted
        minTalkPerBed: 4,         // per-bed talk step floor
    });

    /** @deprecated visit-count only; prefer H.SEED_UNLOCK with harvest milestones. */
    const UNLOCK_AT_VISIT = Object.freeze({ lettuce: 0, mint: 0, cucumber: 0, tomato: 2, sunflower: 3, apple: 4 });

    // General, widely-published growing tips (not from the sun-hour source).
    // The sun need + source stay on logic.js PLANTS.
    const TIPS = Object.freeze({
        lettuce: Object.freeze([
            'Sow seeds shallow, about ¼ inch (6 mm) deep. They need a little light to sprout.',
            'A cool-season crop: spring and fall are best; summer heat makes leaves bitter.',
            'Keep the soil evenly moist and pick the outer leaves as they grow.',
        ]),
        mint: Object.freeze([
            'Easiest from a cutting or a small nursery plant rather than seed.',
            'It spreads by runners, so a pot or its own bed keeps it from taking over.',
            'Keep the soil moist and pinch off the tips to keep it bushy.',
        ]),
        cucumber: Object.freeze([
            'Plant after the last frost, once the soil feels warm.',
            'Give the vines a trellis to climb; it saves space and keeps fruit clean.',
            'Water steadily at the base of the plant and pick often to keep it producing.',
        ]),
        tomato: Object.freeze([
            'Set out young plants after the last frost; they love warmth.',
            'Use a stake or cage so stems and fruit stay off the ground.',
            'Water deeply and evenly, and mulch to keep the soil moisture steady.',
        ]),
        sunflower: Object.freeze([
            'Sow seeds right in the ground after frost, about 1 inch (2–3 cm) deep.',
            'Tall varieties may need a stake on windy sites.',
            'Water deeply while young; established plants handle dry spells better.',
        ]),
        apple: Object.freeze([
            'Most apple trees need a second, different variety nearby for pollination.',
            'Pick a spot with well-drained soil and room for the tree to spread.',
            'Patience: young trees often take a few years before their first fruit.',
        ]),
    });

    function clamp01(x) { return L.clamp01(x); }

    // ------------------------------------------------------------------
    // Local time
    // ------------------------------------------------------------------
    const pad2 = (n) => String(n).padStart(2, '0');

    /** Local calendar day "YYYY-MM-DD". Changes at local midnight. */
    function dayKey(date) {
        const d = date instanceof Date ? date : new Date(date);
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

    /** Local midnight Date for a day key. */
    function dayStart(key) {
        const [y, m, d] = String(key).split('-').map(Number);
        return new Date(y, m - 1, d, 0, 0, 0, 0);
    }

    /** Whole local days from key a to key b (DST-safe: uses calendar dates). */
    function daysBetween(a, b) {
        const da = dayStart(a), db = dayStart(b);
        return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) -
            Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / DAY_MS);
    }

    function addDaysKey(key, n) {
        const d = dayStart(key);
        d.setDate(d.getDate() + n);
        return dayKey(d);
    }

    /** Monday (day key) of the local week containing `date`. */
    function weekStartKey(date) {
        const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
        const dow = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
        d.setDate(d.getDate() - dow);
        return dayKey(d);
    }

    const LIGHTINGS = Object.freeze(['dawn', 'midday', 'golden-hour', 'night']);
    const LIGHTING_LABELS = Object.freeze({ dawn: 'Dawn', midday: 'Midday', 'golden-hour': 'Golden hour', night: 'Night' });

    /** dawn 05:00–08:59, midday 09:00–15:59, golden hour 16:00–18:59, night otherwise. */
    function lightingForHour(hour) {
        const h = Number(hour);
        if (h >= 5 && h < 9) return 'dawn';
        if (h >= 9 && h < 16) return 'midday';
        if (h >= 16 && h < 19) return 'golden-hour';
        return 'night';
    }

    function lightingFor(date, override) {
        if (override && LIGHTINGS.includes(override)) return override;
        const d = date instanceof Date ? date : new Date(date);
        return lightingForHour(d.getHours());
    }

    function greetingFor(lighting) {
        return {
            dawn: 'Good morning, gardener',
            midday: 'Hello, gardener',
            'golden-hour': 'Good evening, gardener',
            night: 'A quiet night in the garden',
        }[lighting] || 'Hello, gardener';
    }

    /** A clock with a debug day offset ("next day" button) for demos. */
    class GameClock {
        constructor(opts) {
            const o = opts || {};
            this.realNow = typeof o.now === 'function' ? o.now : () => Date.now();
            this.offsetDays = Number(o.offsetDays) || 0;
        }
        now() {
            const d = new Date(this.realNow());
            if (this.offsetDays) d.setDate(d.getDate() + this.offsetDays); // keeps local wall-clock time across DST
            return d;
        }
        today() { return dayKey(this.now()); }
        nextDay() { this.offsetDays += 1; return this.today(); }
    }

    // ------------------------------------------------------------------
    // Garden state
    // ------------------------------------------------------------------
    function plantInfo(id) {
        const p = L.plantById(id);
        if (!p) return null;
        return Object.assign({}, p, {
            tips: TIPS[id] || [],
            unlockAtVisit: (H.SEED_UNLOCK[id] && H.SEED_UNLOCK[id].visits) || 0,
            unlockHarvests: (H.SEED_UNLOCK[id] && H.SEED_UNLOCK[id].harvests) || 0,
            sunCost: p.cost,
        });
    }

    function createState(now) {
        const d = now instanceof Date ? now : new Date(now === undefined ? Date.now() : now);
        return {
            version: STATE_VERSION,
            createdDay: dayKey(d),
            wellnessAck: false,
            plots: new Array(PLOTS).fill(null),
            visitDays: [],
            journal: [],
            settings: { pace: 'standard', breaths: 4, chart: true, lighting: 'auto', offsetDays: 0 },
            pantry: H.emptyPantry(),
            decor: H.emptyDecor(),
            spareSeeds: H.emptySpareSeeds(),
        };
    }

    function sanitizePlot(p) {
        if (!p || typeof p !== 'object' || !L.plantById(p.plantId)) return null;
        const stage = Math.max(1, Math.min(MAX_STAGE, Math.round(Number(p.stage) || 1)));
        return H.extendPlotSanitize({
            plantId: p.plantId,
            plantedDay: typeof p.plantedDay === 'string' ? p.plantedDay : null,
            stage,
            sunBank: Math.max(0, Number(p.sunBank) || 0),
            lastGrowDay: typeof p.lastGrowDay === 'string' ? p.lastGrowDay : null,
            matureDay: typeof p.matureDay === 'string' ? p.matureDay : null,
            picked: p.picked,
            pickDay: p.pickDay,
            matureWater: p.matureWater,
            matureFert: p.matureFert,
        });
    }

    function advanceRegrowPlots(state, today) {
        const key = today || dayKey(new Date());
        state.plots.forEach((p) => {
            if (!p || !p.picked) return;
            const cfg = H.plantHarvestCfg(p.plantId);
            if (cfg.mode !== 'regrow' || !p.pickDay) return;
            if (daysBetween(p.pickDay, key) >= cfg.regrowDays) {
                p.picked = false;
                p.pickDay = null;
                p.matureWater = 0;
                p.matureFert = 0;
            }
        });
    }

    /** Parse saved JSON (string or object). Bad / old / missing data -> fresh state. */
    function loadState(raw, now) {
        let obj = raw;
        if (typeof raw === 'string') {
            try { obj = JSON.parse(raw); } catch { obj = null; }
        }
        const fresh = createState(now);
        if (!obj || typeof obj !== 'object') return fresh;
        if (obj.version !== STATE_VERSION && obj.version !== 3) return fresh;
        const s = fresh;
        s.createdDay = typeof obj.createdDay === 'string' ? obj.createdDay : s.createdDay;
        s.wellnessAck = obj.wellnessAck === true;
        const plots = Array.isArray(obj.plots) ? obj.plots : [];
        for (let i = 0; i < PLOTS; i++) s.plots[i] = sanitizePlot(plots[i]);
        s.visitDays = Array.isArray(obj.visitDays)
            ? Array.from(new Set(obj.visitDays.filter((k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)))).sort()
            : [];
        s.journal = Array.isArray(obj.journal) ? obj.journal.filter((e) => e && typeof e.kind === 'string').slice(-400) : [];
        const st = obj.settings || {};
        s.settings.pace = st.pace === 'gentle' ? 'gentle' : 'standard';
        s.settings.breaths = clampBreaths(st.breaths);
        s.settings.chart = st.chart !== false;
        s.settings.lighting = LIGHTINGS.includes(st.lighting) ? st.lighting : 'auto';
        s.settings.offsetDays = Number.isFinite(Number(st.offsetDays)) ? Math.max(0, Math.round(Number(st.offsetDays))) : 0;
        s.pantry = H.sanitizePantry(obj.pantry);
        s.decor = H.sanitizeDecor(obj.decor);
        s.spareSeeds = H.sanitizeSpareSeeds(obj.spareSeeds);
        if (obj.version === 3) {
            s.pantry = H.emptyPantry();
            s.decor = H.emptyDecor();
            s.spareSeeds = H.emptySpareSeeds();
        }
        s.version = STATE_VERSION;
        advanceRegrowPlots(s, dayKey(now instanceof Date ? now : new Date(now === undefined ? Date.now() : now)));
        H.syncDecorUnlocks(s);
        return s;
    }

    function serializeState(state) { return JSON.stringify(state); }

    function visitCount(state) { return state.visitDays.length; }

    function isUnlocked(state, plantId) {
        return H.isSeedUnlocked(state, plantId, visitCount);
    }

    function unlockedPlants(state) {
        return H.unlockedPlantsByHarvest(state, visitCount, L.PLANTS.map((p) => p.id));
    }

    function emptyPlots(state) {
        const out = [];
        state.plots.forEach((p, i) => { if (!p) out.push(i); });
        return out;
    }

    function plantedCount(state) { return state.plots.filter(Boolean).length; }
    function matureCount(state) { return state.plots.filter((p) => p && p.stage >= MAX_STAGE).length; }

    /** Score shown in the HUD: plots filled (planted) and plots grown to maturity. */
    function score(state) {
        return { planted: plantedCount(state), mature: matureCount(state), plots: PLOTS };
    }

    function addJournal(state, entry) {
        state.journal.push(Object.assign({ ts: Date.now() }, entry));
        if (state.journal.length > 400) state.journal.splice(0, state.journal.length - 400);
    }

    function plantSeed(state, plotIndex, plantId, now) {
        const i = Number(plotIndex);
        if (!(i >= 0 && i < PLOTS) || state.plots[i]) return { ok: false, reason: 'plot-taken' };
        const kind = L.plantById(plantId);
        if (!kind) return { ok: false, reason: 'unknown-plant' };
        if (!isUnlocked(state, plantId)) return { ok: false, reason: 'locked' };
        const d = now instanceof Date ? now : new Date(now);
        const day = dayKey(d);
        state.plots[i] = {
            plantId, plantedDay: day, stage: 1, sunBank: 0, lastGrowDay: null, matureDay: null,
            picked: false, pickDay: null, matureWater: null, matureFert: null,
        };
        if (state.spareSeeds && state.spareSeeds[plantId] > 0) state.spareSeeds[plantId] -= 1;
        addJournal(state, { day, ts: d.getTime(), kind: 'planted', plantId, plot: i, stage: 1,
            text: `Planted ${kind.name.toLowerCase()} in bed ${i + 1}.` });
        return { ok: true, plot: i };
    }

    /** Distinct visit days in the current local week (Mon–Sun). No streaks. */
    function weeklyVisits(state, now) {
        const d = now instanceof Date ? now : new Date(now);
        const start = weekStartKey(d);
        const end = addDaysKey(start, 6);
        return state.visitDays.filter((k) => k >= start && k <= end).length;
    }

    function visitedToday(state, now) {
        return state.visitDays.includes(dayKey(now instanceof Date ? now : new Date(now)));
    }

    /** Plot grid: beds 0–3 back row, 4–7 front row (left to right). */
    const PLOT_ROW = (i) => (i < 4 ? 0 : 1);
    const PLOT_COL = (i) => i % 4;

    function neighborPlot(i, dir) {
        const r = PLOT_ROW(i);
        const c = PLOT_COL(i);
        if (dir === 'left' && c > 0) return i - 1;
        if (dir === 'right' && c < 3) return i + 1;
        if (dir === 'up' && r > 0) return i - 4;
        if (dir === 'down' && r < 1) return i + 4;
        return null;
    }

    /** Move selection among planted beds along an arrow direction (wraps within 8 steps). */
    function movePlotSelection(current, dir, planted) {
        const set = new Set(planted);
        if (!set.size) return null;
        const start = set.has(current) ? current : planted[0];
        let i = start;
        for (let n = 0; n < 8; n++) {
            const next = neighborPlot(i, dir);
            if (next === null) break;
            i = next;
            if (set.has(i)) return i;
        }
        return start;
    }

    function plantedPlotIndices(plots) {
        const out = [];
        (plots || []).forEach((p, i) => { if (p) out.push(i); });
        return out;
    }

    function firstPlantedPlot(plots) {
        const idx = plantedPlotIndices(plots);
        return idx.length ? idx[0] : null;
    }

    function perBedStepSeconds(total, plantedCount, floor) {
        const n = Math.max(1, plantedCount);
        return Math.max(floor, total / n);
    }

    /** Normalize visit result: per-bed { beds: [{plot, sunHours, water, fertilizer, breaths}] } or legacy garden-wide. */
    function visitBedResults(result) {
        const r = result || {};
        if (Array.isArray(r.beds) && r.beds.length) {
            return r.beds.map((b) => ({
                plot: Number(b.plot),
                sunHours: Math.max(0, Math.min(TUNING.maxSunHours, Number(b.sunHours) || 0)),
                water: clamp01(b.water),
                fertilizer: clamp01(b.fertilizer),
                breaths: Number(b.breaths) || 0,
            })).filter((b) => b.plot >= 0 && b.plot < PLOTS);
        }
        const sun = Math.max(0, Math.min(TUNING.maxSunHours, Number(r.sunHours) || 0));
        const water = clamp01(r.water);
        const fert = clamp01(r.fertilizer);
        const breaths = Number(r.breaths) || 0;
        const out = [];
        for (let i = 0; i < PLOTS; i++) {
            out.push({ plot: i, sunHours: sun, water, fertilizer: fert, breaths });
        }
        return out;
    }

    /**
     * Apply a finished visit: bank sunlight per bed, grow qualifying plants by at most
     * one stage per local day, record the visit and journal entries.
     * result.beds = [{ plot, sunHours, water, fertilizer, breaths? }, ...].
     * Returns { day, grew, waiting, tended, weekly, firstVisitToday, unlocked, ... }.
     */
    function applyVisit(state, result, now) {
        const d = now instanceof Date ? now : new Date(now);
        const day = dayKey(d);
        const bedResults = visitBedResults(result);
        const byPlot = Object.create(null);
        for (const b of bedResults) byPlot[b.plot] = b;

        const grew = [];
        const waiting = [];
        const tended = [];

        advanceRegrowPlots(state, day);
        state.plots.forEach((p, i) => {
            if (!p || p.stage >= MAX_STAGE || p.picked) return;
            const kind = L.plantById(p.plantId);
            const cost = kind.cost;
            const br = byPlot[i];
            if (!br) return;
            const sun = br.sunHours;
            const water = br.water;
            const fert = br.fertilizer;
            if (sun > 0 || water > 0 || fert > 0) {
                tended.push({ plot: i, plantId: p.plantId, name: kind.name, sunHours: sun, water, fertilizer: fert });
            }
            const banked = sun * (1 + TUNING.fertilizerBoost * fert);
            const watered = water >= TUNING.waterToGrow;
            p.sunBank = Math.min(cost, p.sunBank + banked);
            const info = { plot: i, plantId: p.plantId, name: kind.name, stage: p.stage, sunBank: p.sunBank, cost };
            if (p.lastGrowDay === day) { waiting.push(Object.assign(info, { reason: 'grew-today' })); return; }
            if (p.sunBank + 1e-9 < cost) { waiting.push(Object.assign(info, { reason: 'needs-sun', short: cost - p.sunBank })); return; }
            if (!watered) { waiting.push(Object.assign(info, { reason: 'needs-water' })); return; }
            const from = p.stage;
            p.stage += 1;
            p.sunBank = 0;
            p.lastGrowDay = day;
            if (p.stage >= MAX_STAGE) {
                p.matureDay = day;
                p.matureWater = water;
                p.matureFert = fert;
                p.picked = false;
                p.pickDay = null;
            }
            grew.push({ plot: i, plantId: p.plantId, name: kind.name, from, to: p.stage, mature: p.stage >= MAX_STAGE });
            addJournal(state, {
                day, ts: d.getTime(), kind: p.stage >= MAX_STAGE ? 'mature' : 'stage', plantId: p.plantId, plot: i, stage: p.stage,
                text: `${kind.name} in bed ${i + 1} ${STAGE_PHRASE[p.stage]}.`,
            });
        });

        const before = unlockedPlants(state);
        const firstVisitToday = !state.visitDays.includes(day);
        if (firstVisitToday) {
            state.visitDays.push(day);
            state.visitDays.sort();
            if (state.visitDays.length > 400) state.visitDays.splice(0, state.visitDays.length - 400);
        }
        const unlocked = unlockedPlants(state).filter((id) => !before.includes(id));

        const sumSun = tended.reduce((s, t) => s + t.sunHours, 0);
        const sumWater = tended.length ? tended.reduce((s, t) => s + t.water, 0) / tended.length : 0;
        const sumFert = tended.length ? tended.reduce((s, t) => s + t.fertilizer, 0) / tended.length : 0;
        const parts = tended.map((t) => `bed ${t.plot + 1}: ${round1(t.sunHours)} h sun, ${Math.round(t.water * 100)}% water` +
            (t.fertilizer > 0 ? `, ${Math.round(t.fertilizer * 100)}% fertilizer` : ''));
        addJournal(state, {
            day, ts: d.getTime(), kind: 'visit',
            sunHours: round1(sumSun), water: round2(sumWater), fertilizer: round2(sumFert),
            breaths: tended.reduce((s, t) => s + (byPlot[t.plot].breaths || 0), 0),
            text: parts.length ? `Visit per plant: ${parts.join('; ')}.` : 'Visit: a quiet hello to the garden.',
        });
        for (const id of unlocked) {
            addJournal(state, { day, ts: d.getTime(), kind: 'unlock', plantId: id, text: `New seeds: ${L.plantById(id).name}.` });
        }
        const legacy = bedResults[0] || { sunHours: 0, water: 0, fertilizer: 0 };
        return {
            day, sunHours: sumSun, water: sumWater, fertilizer: sumFert,
            tended, grew, waiting, unlocked, firstVisitToday,
            weekly: weeklyVisits(state, d), visits: visitCount(state),
            banked: legacy.sunHours * (1 + TUNING.fertilizerBoost * legacy.fertilizer),
            watered: legacy.water >= TUNING.waterToGrow,
        };
    }

    const round1 = (x) => Math.round(x * 10) / 10;
    const round2 = (x) => Math.round(x * 100) / 100;

    // ------------------------------------------------------------------
    // Breathing pacer: soft nose breathing, no holds.
    // ------------------------------------------------------------------
    const PACES = Object.freeze({
        standard: Object.freeze({ key: 'standard', label: 'Calm (4 in, 6 out)', inhale: 4, exhale: 6 }),
        gentle: Object.freeze({ key: 'gentle', label: 'Gentler (3 in, 5 out)', inhale: 3, exhale: 5 }),
    });
    const MIN_BREATHS = 3;
    const MAX_BREATHS = 6;

    function clampBreaths(n) {
        const v = Math.round(Number(n));
        if (!Number.isFinite(v)) return 4;
        return Math.max(MIN_BREATHS, Math.min(MAX_BREATHS, v));
    }

    class BreathPacer {
        /**
         * opts: { pace: 'standard'|'gentle', breaths: 3..6, easeIn: true }
         * easeIn: with the standard pace, the first breath uses the gentler
         * 3/5 timing so nobody is pushed straight into a slow rhythm.
         */
        constructor(opts) {
            const o = Object.assign({ pace: 'standard', breaths: 4, easeIn: true }, opts);
            this.pace = PACES[o.pace] || PACES.standard;
            this.breaths = clampBreaths(o.breaths);
            this.schedule = [];
            let t = 0;
            for (let i = 0; i < this.breaths; i++) {
                const p = (o.easeIn && i === 0 && this.pace.key === 'standard') ? PACES.gentle : this.pace;
                this.schedule.push({ start: t, inhale: p.inhale, exhale: p.exhale });
                t += p.inhale + p.exhale; // no hold: exhale ends, next inhale starts
            }
            this.total = t;
        }

        /** Breaths per minute of the chosen pace. */
        get bpm() { return 60 / (this.pace.inhale + this.pace.exhale); }

        /** State at t seconds since the bout started. */
        at(t) {
            const tt = Math.max(0, Number(t) || 0);
            if (tt >= this.total) {
                return { phase: 'done', breath: this.breaths, completed: this.breaths, progress: 1, remaining: 0, size: 0, done: true };
            }
            let i = this.schedule.length - 1;
            while (i > 0 && this.schedule[i].start > tt) i--;
            const b = this.schedule[i];
            const into = tt - b.start;
            const inhaling = into < b.inhale;
            const dur = inhaling ? b.inhale : b.exhale;
            const local = inhaling ? into : into - b.inhale;
            const progress = clamp01(local / dur);
            // Smooth cosine easing for the guide circle (0 = empty lungs, 1 = full).
            const eased = 0.5 - 0.5 * Math.cos(Math.PI * progress);
            return {
                phase: inhaling ? 'in' : 'out',
                breath: i,
                completed: i,
                progress,
                remaining: dur - local,
                phaseSeconds: dur,
                size: inhaling ? eased : 1 - eased,
                done: false,
            };
        }

        /** Completed breaths at t (a breath completes at the end of its exhale). */
        completedAt(t) {
            const s = this.at(t);
            return s.done ? this.breaths : s.completed;
        }
    }

    // ------------------------------------------------------------------
    // One daily visit, step by step.
    // ------------------------------------------------------------------
    const STEPS = Object.freeze(['greeting', 'pick-harvest', 'harvest-hold', 'pick', 'smile', 'talk', 'breathe-offer', 'breathe', 'summary']);

    function emptyBedTally() {
        return { smileWeighted: 0, smileSecondsRaw: 0, talkSecondsRaw: 0, breathsDone: 0, breathSkipped: false, breathTaken: false };
    }

    class VisitSession {
        /**
         * opts: { fast, smileSeconds, talkSeconds, pace, breaths, plantedBeds, plots }
         * update(dt, input) with input = { happiness 0..1|null, talking bool|null, faceVisible bool }
         */
        constructor(opts) {
            const o = Object.assign({ fast: false, plots: [], today: null }, opts);
            const baseSmile = o.smileSeconds || (o.fast ? TUNING.fastSmileSeconds : TUNING.smileSeconds);
            const baseTalk = o.talkSeconds || (o.fast ? TUNING.fastTalkSeconds : TUNING.talkSeconds);
            this.baseSmileSeconds = baseSmile;
            this.baseTalkSeconds = baseTalk;
            this.fast = !!o.fast;
            this.today = o.today || dayKey(new Date());
            this.plots = o.plots || [];
            this.tendBeds = Array.isArray(o.tendBeds)
                ? o.tendBeds.slice()
                : H.tendablePlotIndices(this.plots, this.today);
            this.harvestQueue = Array.isArray(o.harvestQueue)
                ? o.harvestQueue.slice()
                : H.readyPlotIndices(this.plots, this.today);
            this.plantedBeds = this.tendBeds;
            const n = Math.max(1, this.plantedBeds.length || this.harvestQueue.length || 1);
            this.smileSeconds = perBedStepSeconds(baseSmile, n, TUNING.minSmilePerBed);
            this.talkSeconds = perBedStepSeconds(baseTalk, n, TUNING.minTalkPerBed);
            this.harvestSeconds = H.HARVEST_HOLD_SECONDS;
            this.pace = o.pace === 'gentle' ? 'gentle' : 'standard';
            this.breathCount = clampBreaths(o.breaths);
            this.step = 'greeting';
            this.stepTime = 0;
            this.harvestSmile = 0;
            this.detector = new L.SmileDetector();
            this.h = null;
            this.smiling = false;
            this.talking = false;
            this.noFace = 0;
            this.poorReading = false;
            this.peak = 0;
            this.pacer = null;
            this.breathT = 0;
            this.breathsDone = 0;
            this.breathSkipped = false;
            this.breathTaken = false;
            this.events = [];
            this.bedTally = Object.create(null);
            this.plantRound = 0;
            this.harvestRound = 0;
            this.phase = this.harvestQueue.length ? 'harvest' : 'tend';
            this.harvestedPlots = [];
            this.pendingHarvests = [];
            this.selectedPlot = null;
            this.live = emptyBedTally();
        }

        bedInfo(plot) {
            const p = this.plots[plot];
            if (!p) return { cost: TUNING.maxSunHours };
            const kind = L.plantById(p.plantId);
            return { cost: kind ? kind.cost : TUNING.maxSunHours, plantId: p.plantId };
        }

        _syncLiveFromTally() {
            const t = this.bedTally[this.selectedPlot];
            this.live = t ? Object.assign(emptyBedTally(), t) : emptyBedTally();
        }

        _saveLiveToTally() {
            if (this.selectedPlot == null) return;
            this.bedTally[this.selectedPlot] = Object.assign(emptyBedTally(), this.live);
        }

        sunHoursFor(plot, tally) {
            const t = tally || this.live;
            const need = TUNING.smileSecondsForMax * (this.smileSeconds / this.baseSmileSeconds);
            return Math.min(TUNING.maxSunHours, (t.smileWeighted / need) * TUNING.maxSunHours);
        }
        waterFor(tally) {
            const t = tally || this.live;
            return clamp01(t.talkSecondsRaw / (TUNING.talkSecondsForFull * (this.talkSeconds / this.baseTalkSeconds)));
        }
        fertilizerFor(tally) {
            const t = tally || this.live;
            if (this.step === 'breathe' && this.pacer) return clamp01(this.breathsDone / this.pacer.breaths);
            if (t.breathTaken && this.pacer) return clamp01(t.breathsDone / this.pacer.breaths);
            return t.breathsDone > 0 && this.breathCount ? clamp01(t.breathsDone / this.breathCount) : 0;
        }

        get sunHours() { return this.sunHoursFor(this.selectedPlot); }
        get water() { return this.waterFor(); }
        get fertilizer() { return this.fertilizerFor(); }

        sunGoal(plot) {
            const info = this.bedInfo(plot);
            return Math.min(TUNING.maxSunHours, info.cost);
        }
        bedTopped(step) {
            if (step === 'smile') return this.sunHours >= this.sunGoal(this.selectedPlot) - 1e-6;
            if (step === 'talk') return this.water >= 1 - 1e-6;
            return false;
        }

        selectablePlots() {
            if (this.step === 'pick-harvest') {
                return this.harvestQueue.filter((i) => !this.harvestedPlots.includes(i));
            }
            if (this.step === 'pick') return this.plantedBeds;
            return [];
        }

        stepDuration() {
            if (this.step === 'smile') return this.smileSeconds;
            if (this.step === 'talk') return this.talkSeconds;
            if (this.step === 'harvest-hold') return this.harvestSeconds;
            if (this.step === 'breathe') return this.pacer ? this.pacer.total : 0;
            return 0;
        }
        stepRemaining() {
            if (this.step === 'harvest-hold') return Math.max(0, this.harvestSeconds - this.harvestSmile);
            return Math.max(0, this.stepDuration() - (this.step === 'breathe' ? this.breathT : this.stepTime));
        }

        go(step) {
            if (!STEPS.includes(step)) throw new Error('unknown step ' + step);
            if (this.step === 'smile' || this.step === 'talk' || this.step === 'breathe') this._saveLiveToTally();
            this.step = step;
            this.stepTime = 0;
            this.noFace = 0;
            this.poorReading = false;
            if (step === 'breathe') {
                // Default bout is 40 s at standard pace (4 × 4/6). Skip ease-in so
                // the bout length stays predictable for SmartSpectra rate warm-up.
                this.pacer = new BreathPacer({ pace: this.pace, breaths: this.breathCount, easeIn: false });
                this.breathT = 0;
                this.breathsDone = 0;
                this.breathSkipped = false;
                this.breathTaken = true;
                this.live.breathTaken = true;
            }
            if (step === 'harvest-hold') {
                this.harvestSmile = 0;
            }
            if (step === 'smile' || step === 'talk' || step === 'breathe' || step === 'breathe-offer' || step === 'pick') {
                this._syncLiveFromTally();
            }
            this.events.push({ type: 'step', step, plot: this.selectedPlot, round: this.plantRound });
            return step;
        }

        _remainingHarvest() {
            return this.harvestQueue.filter((i) => !this.harvestedPlots.includes(i));
        }

        remainingHarvestCount() { return this._remainingHarvest().length; }

        begin() {
            const remH = this._remainingHarvest();
            if (remH.length) {
                this.phase = 'harvest';
                this.selectedPlot = remH[0];
                return this.go('pick-harvest');
            }
            if (!this.plantedBeds.length) return this.go('summary');
            this.phase = 'tend';
            this.plantRound = 0;
            this.selectedPlot = this.plantedBeds[0];
            return this.go('pick');
        }

        confirmPick() {
            if (this.step === 'pick-harvest' && this.selectedPlot != null) return this.go('harvest-hold');
            if (this.step !== 'pick' || this.selectedPlot == null) return this.step;
            return this.go('smile');
        }

        confirmHarvestInstant() {
            if (this.step !== 'harvest-hold') return this.step;
            this.harvestSmile = this.harvestSeconds;
            return this._completeHarvest();
        }

        setSelectedPlot(plot) {
            const i = Number(plot);
            const list = this.selectablePlots();
            if (!(i >= 0 && i < PLOTS) || !list.includes(i)) return false;
            if (this.step !== 'pick' && this.step !== 'pick-harvest') return false;
            this.selectedPlot = i;
            this._syncLiveFromTally();
            this.events.push({ type: 'select', plot: i });
            return true;
        }

        moveSelection(dir) {
            if (this.step !== 'pick' && this.step !== 'pick-harvest') return this.selectedPlot;
            const list = this.selectablePlots();
            const next = movePlotSelection(this.selectedPlot, dir, list);
            if (next !== null && next !== this.selectedPlot) {
                this.selectedPlot = next;
                this._syncLiveFromTally();
                this.events.push({ type: 'select', plot: next });
            }
            return this.selectedPlot;
        }

        _completeHarvest() {
            if (this.selectedPlot == null) return this.go('summary');
            this.pendingHarvests.push(this.selectedPlot);
            this.harvestedPlots.push(this.selectedPlot);
            this.harvestRound += 1;
            this.events.push({ type: 'harvest-ready', plot: this.selectedPlot });
            const rem = this._remainingHarvest();
            if (rem.length) {
                this.selectedPlot = rem[0];
                return this.go('pick-harvest');
            }
            if (this.plantedBeds.length) {
                this.phase = 'tend';
                this.plantRound = 0;
                this.selectedPlot = this.plantedBeds[0];
                return this.go('pick');
            }
            return this.go('summary');
        }

        skipHarvestBed() {
            if (this.step !== 'pick-harvest' && this.step !== 'harvest-hold') return this.step;
            const rem = this._remainingHarvest().filter((i) => i !== this.selectedPlot);
            const rest = this._remainingHarvest();
            if (this.step === 'harvest-hold' && this.selectedPlot != null) {
                const idx = rest.indexOf(this.selectedPlot);
                if (idx >= 0) rest.splice(idx, 1);
            }
            if (!rest.length) {
                if (this.plantedBeds.length) {
                    this.phase = 'tend';
                    this.plantRound = 0;
                    this.selectedPlot = this.plantedBeds[0];
                    return this.go('pick');
                }
                return this.go('summary');
            }
            this.selectedPlot = rest[0];
            return this.go('pick-harvest');
        }

        hasMorePlants() { return this.plantRound + 1 < this.plantedBeds.length; }

        advanceToNextPlant() {
            this._saveLiveToTally();
            this.plantRound += 1;
            if (this.plantRound >= this.plantedBeds.length) return this.go('summary');
            this.selectedPlot = this.plantedBeds[this.plantRound];
            this.pacer = null;
            this.breathsDone = 0;
            this.breathSkipped = false;
            this.breathTaken = false;
            return this.go('pick');
        }

        skip() {
            if (this.step === 'greeting') return this.begin();
            if (this.step === 'pick-harvest') return this.skipHarvestBed();
            if (this.step === 'harvest-hold') return this.skipHarvestBed();
            if (this.step === 'pick') return this.confirmPick();
            if (this.step === 'smile') return this.go('talk');
            if (this.step === 'talk') return this.go('breathe-offer');
            if (this.step === 'breathe-offer') return this.advanceToNextPlant();
            if (this.step === 'breathe') {
                this.breathSkipped = true;
                this.live.breathSkipped = true;
                this._saveLiveToTally();
                return this.advanceToNextPlant();
            }
            return this.step;
        }

        startBreathing(opts) {
            if (opts && opts.pace) this.pace = opts.pace === 'gentle' ? 'gentle' : 'standard';
            if (opts && opts.breaths) this.breathCount = clampBreaths(opts.breaths);
            return this.go('breathe');
        }

        update(dt, input) {
            const step = Math.max(0, Math.min(0.25, Number(dt) || 0));
            const inp = input || {};
            const faceVisible = inp.faceVisible !== false && inp.happiness !== null && inp.happiness !== undefined;
            if (faceVisible) {
                this.h = L.smooth(this.h, clamp01(inp.happiness), step, L.DEFAULTS.smoothingTau);
                this.noFace = 0;
            } else {
                this.noFace += step;
            }
            this.poorReading = this.noFace >= TUNING.poorFaceSeconds;
            this.smiling = faceVisible ? this.detector.update(this.h) : false;
            this.talking = faceVisible && inp.talking === true;

            if (this.step === 'harvest-hold') {
                if (faceVisible && this.smiling) this.harvestSmile += step;
                if (this.harvestSmile >= this.harvestSeconds) this._completeHarvest();
            } else if (this.step === 'smile' || this.step === 'talk') {
                if (faceVisible) this.stepTime += step;
                if (this.step === 'smile' && this.smiling && faceVisible) {
                    const on = L.DEFAULTS.smileOn;
                    const intensity = clamp01((this.h - on) / (1 - on));
                    this.live.smileWeighted += step * (0.6 + 0.4 * intensity);
                    this.live.smileSecondsRaw += step;
                    this.peak = Math.max(this.peak, this.h);
                }
                if (this.step === 'talk' && this.talking) this.live.talkSecondsRaw += step;
                const topped = this.bedTopped(this.step);
                if (topped || this.stepTime >= this.stepDuration()) {
                    this._saveLiveToTally();
                    this.go(this.step === 'smile' ? 'talk' : 'breathe-offer');
                }
            } else if (this.step === 'breathe') {
                this.breathT += step;
                this.breathsDone = this.pacer.completedAt(this.breathT);
                this.live.breathsDone = this.breathsDone;
                if (this.breathT >= this.pacer.total) {
                    this._saveLiveToTally();
                    this.advanceToNextPlant();
                }
            }
            const ev = this.events;
            this.events = [];
            return ev;
        }

        result() {
            this._saveLiveToTally();
            const beds = [];
            for (const plot of this.plantedBeds) {
                const t = Object.assign(emptyBedTally(), this.bedTally[plot]);
                beds.push({
                    plot,
                    sunHours: this.sunHoursFor(plot, t),
                    water: this.waterFor(t),
                    fertilizer: t.breathsDone > 0 ? clamp01(t.breathsDone / this.breathCount) : 0,
                    breaths: t.breathsDone,
                    breathSkipped: t.breathSkipped,
                    breathTaken: t.breathTaken,
                });
            }
            const totals = beds.reduce((a, b) => ({
                sunHours: a.sunHours + b.sunHours,
                water: a.water + b.water,
                fertilizer: a.fertilizer + b.fertilizer,
                breaths: a.breaths + b.breaths,
            }), { sunHours: 0, water: 0, fertilizer: 0, breaths: 0 });
            const n = Math.max(1, beds.length);
            return Object.assign({
                beds,
                harvestPlots: this.pendingHarvests.slice(),
                breathSkipped: beds.some((b) => b.breathSkipped),
                breathTaken: beds.some((b) => b.breathTaken),
                peakHappiness: this.peak,
                smileSeconds: beds.reduce((s, b, i) => s + (this.bedTally[this.plantedBeds[i]]?.smileSecondsRaw || 0), 0),
                talkSeconds: beds.reduce((s, b, i) => s + (this.bedTally[this.plantedBeds[i]]?.talkSecondsRaw || 0), 0),
            }, {
                sunHours: totals.sunHours,
                water: totals.water / n,
                fertilizer: totals.fertilizer / n,
                breaths: totals.breaths,
            });
        }
    }

    function applySessionHarvests(state, plotIndices, now) {
        const out = [];
        for (const plot of plotIndices || []) {
            const r = H.harvestPlot(state, plot, now, L.plantById);
            if (r.ok) out.push(r);
        }
        return out;
    }

    function newUnlocksAfterHarvest(state, beforeSeeds, beforeDecor) {
        H.syncDecorUnlocks(state);
        const afterSeeds = unlockedPlants(state);
        const seeds = afterSeeds.filter((id) => !beforeSeeds.includes(id));
        const decor = state.decor.unlocked.filter((id) => !beforeDecor.includes(id));
        return { seeds, decor };
    }

    /** Short human sentence for a waiting plant (no guilt, nothing wilts). */
    function waitingText(w) {
        if (w.reason === 'grew-today') return `${w.name} already grew today. It will be ready for more tomorrow.`;
        if (w.reason === 'needs-water') return `${w.name} has its sun but would like more water. Chat a little longer next visit.`;
        const have = round1(w.sunBank), need = w.cost;
        return `${w.name} has ${have} of ${need} sun-hours saved up. It keeps them and grows on a sunnier visit.`;
    }

    /** Debug/demo: simulate `days` visits with given quality (0..1), advancing the clock. */
    function simulateDays(state, clock, days, quality) {
        const q = quality === undefined ? 1 : clamp01(quality);
        const out = [];
        for (let i = 0; i < days; i++) {
            clock.nextDay();
            advanceRegrowPlots(state, clock.today());
            const beds = [];
            state.plots.forEach((p, plot) => {
                if (!p || H.isPlotRegrowing(p, clock.today()) || p.picked) return;
                if (p.stage >= MAX_STAGE) return;
                beds.push({
                    plot,
                    sunHours: 12 * q,
                    water: q,
                    fertilizer: q > 0.8 ? 1 : 0,
                    breaths: q > 0.8 ? 4 : 0,
                });
            });
            const visitOut = applyVisit(state, { beds }, clock.now());
            const harvested = [];
            for (const plot of H.readyPlotIndices(state.plots, clock.today())) {
                const h = H.harvestPlot(state, plot, clock.now(), L.plantById);
                if (h.ok) harvested.push(h);
            }
            out.push(Object.assign(visitOut, { harvested }));
        }
        return out;
    }

    return Object.assign({
        STATE_VERSION, PLOTS, MAX_STAGE, STAGES, TUNING, UNLOCK_AT_VISIT, TIPS, LIGHTINGS, LIGHTING_LABELS,
        PACES, MIN_BREATHS, MAX_BREATHS, STEPS,
        dayKey, dayStart, daysBetween, addDaysKey, weekStartKey,
        lightingForHour, lightingFor, greetingFor, GameClock,
        plantInfo, createState, loadState, serializeState, visitCount, isUnlocked, unlockedPlants,
        emptyPlots, plantedCount, matureCount, score, plantSeed, weeklyVisits, visitedToday, applyVisit,
        clampBreaths, BreathPacer, VisitSession, waitingText, simulateDays,
        neighborPlot, movePlotSelection, plantedPlotIndices, firstPlantedPlot, perBedStepSeconds, visitBedResults,
        advanceRegrowPlots, applySessionHarvests, newUnlocksAfterHarvest,
    }, {
        isPlotReady: H.isPlotReady,
        isPlotRegrowing: H.isPlotRegrowing,
        readyPlotIndices: H.readyPlotIndices,
        tendablePlotIndices: H.tendablePlotIndices,
        computeYield: H.computeYield,
        harvestPlot: (s, i, now) => H.harvestPlot(s, i, now, L.plantById),
        placeDecor: H.placeDecor,
        makeAllReady: H.makeAllReady,
        decorUnlocked: (s) => H.decorUnlocked(s),
        syncDecorUnlocks: (s) => H.syncDecorUnlocks(s),
        SEED_UNLOCK: H.SEED_UNLOCK,
        DECOR_UNLOCKS: H.DECOR_UNLOCKS,
        HARVEST_HOLD_SECONDS: H.HARVEST_HOLD_SECONDS,
        PLANT_HARVEST: H.PLANT_HARVEST,
    });
});
