// game/visit.js
//
// Daily-visit layer for Smile Garden v3 (pure logic: no DOM, no Electron, no
// SDK). Runs in Node (node:test) and in the renderer as window.SmileVisit.
//
//   * Local-time helpers: day keys (reset at local midnight), ISO-ish weeks
//     (Mon–Sun), time-of-day lighting (dawn 5–9, midday 9–19, night
//     otherwise).
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
    const day = (typeof module === 'object' && module.exports)
        ? require('./day.js')
        : root.SmileDay;
    const api = factory(logic, harvest, day);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SmileVisit = api;
})(typeof self !== 'undefined' ? self : this, function (L, H, D) {
    'use strict';

    const C = (typeof require === 'function')
        ? require('./care-needs.js')
        : (typeof self !== 'undefined' ? self.SmileCareNeeds : null);
    const Summary = (typeof require === 'function')
        ? require('./summary-data.js')
        : (typeof self !== 'undefined' ? self.SmileSummaryData : null);

    const STATE_VERSION = 6;
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

    // In-game care tips keyed to plantNeeds (smile = water, talk = fertilizer, stretch = stake).
    // Daylight fills sun on its own; library copy leads with what the player does.
    const TIPS = Object.freeze({
        lettuce: Object.freeze([
            'Smile three times to fill its water for the day — lettuce is the thirstiest easy bed.',
            'One short chat adds the fertilizer it needs; no stretch or stake.',
            'When it is mature, click the bed to harvest the leaves.',
        ]),
        mint: Object.freeze([
            'Three smiles keep mint watered; it likes a moist bed every visit.',
            'One chat of fertilizer is enough — soft stems do not need staking.',
            'Click to harvest once mature; it regrows for another pick later.',
        ]),
        cucumber: Object.freeze([
            'Three smiles of water and two chats of fertilizer keep the vine growing.',
            'Stretch once to stake it so the climber can reach for light.',
            'Daylight fills its sun on its own while you tend water and fertilizer.',
        ]),
        tomato: Object.freeze([
            'Two smiles of water, then three chats — tomatoes run on fertilizer.',
            'Stretch to stake the stems before fruit weighs them down.',
            'Sun fills by daylight; your job is water, fertilizer, and the stake.',
        ]),
        sunflower: Object.freeze([
            'Light care: one smile of water and one chat of fertilizer per day.',
            'Stretch to stake the tall stalk so it stays upright as it grows.',
            'It drinks daylight on its own; staking is the main hands-on need.',
        ]),
        apple: Object.freeze([
            'Two smiles of water and two chats of fertilizer each visit.',
            'Stretch to stake young growth while the tree takes its time.',
            'Hard mode means more days of care before harvest — patience pays off.',
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

    const LIGHTINGS = Object.freeze(['dawn', 'midday', 'night']);
    const LIGHTING_LABELS = Object.freeze({ dawn: 'Dawn', midday: 'Midday', night: 'Night' });

    /** dawn 05:00–08:59, midday 09:00–18:59, night otherwise. */
    function lightingForHour(hour) {
        const h = Number(hour);
        if (h >= 5 && h < 9) return 'dawn';
        if (h >= 9 && h < 19) return 'midday';
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
        const needs = L.plantNeeds(id);
        return Object.assign({}, p, {
            tips: TIPS[id] || [],
            needs,
            careSummary: L.plantCareSummary(id),
            unlockAtVisit: (H.SEED_UNLOCK[id] && H.SEED_UNLOCK[id].visits) || 0,
            unlockHarvests: (H.SEED_UNLOCK[id] && H.SEED_UNLOCK[id].harvests) || 0,
            sunCost: p.cost,
        });
    }

    function createState(now) {
        const d = now instanceof Date ? now : new Date(now === undefined ? Date.now() : now);
        const g = D.defaultGardenFields();
        return {
            version: STATE_VERSION,
            createdDay: dayKey(d),
            wellnessAck: false,
            setupDone: false,
            cameraCheckNote: null,
            plots: new Array(PLOTS).fill(null),
            visitDays: [],
            journal: [],
            settings: { pace: 'standard', breaths: 4, lighting: 'auto', offsetDays: 0,
                realMsPerGardenMinute: D.DEFAULT_DAY_CONFIG.realMsPerGardenMinute },
            pantry: H.emptyPantry(),
            spareSeeds: H.emptySpareSeeds(),
            dayNumber: g.dayNumber,
            gardenMinutes: g.gardenMinutes,
            season: g.season,
            seasonDay: g.seasonDay,
            dailyTends: g.dailyTends,
            morningPending: g.morningPending,
            daysCompleted: g.daysCompleted,
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
            tendedDay: p.tendedDay,
            staked: p.staked === true,
            tagResting: p.tagResting === true,
        });
    }

    /** Morning tag: gentle “resting” when a plant did not grow overnight (v6). */
    function applyTagRestingAfterBedtime(state, growthOut) {
        if (state.version < 6) return;
        const grew = new Set((growthOut.grew || []).map((g) => g.plot));
        const season = state.season || D.seasonForDayNumber(state.dayNumber);
        const dayKeyStr = D.gardenDayKey(state.dayNumber);
        state.plots.forEach((p, i) => {
            if (!p || p.stage >= MAX_STAGE || p.picked) return;
            if (H.isPlotRegrowing(p, dayKeyStr)) return;
            if (!D.isPlantInSeason(p.plantId, season)) return;
            if (grew.has(i)) {
                p.tagResting = false;
                return;
            }
            p.tagResting = true;
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
        if (obj.version !== STATE_VERSION && obj.version !== 3 && obj.version !== 4 && obj.version !== 5) return fresh;
        const s = fresh;
        s.createdDay = typeof obj.createdDay === 'string' ? obj.createdDay : s.createdDay;
        s.wellnessAck = obj.wellnessAck === true;
        s.setupDone = obj.setupDone === true;
        s.cameraCheckNote = typeof obj.cameraCheckNote === 'string' && obj.cameraCheckNote.length
            ? obj.cameraCheckNote
            : null;
        const plots = Array.isArray(obj.plots) ? obj.plots : [];
        for (let i = 0; i < PLOTS; i++) s.plots[i] = sanitizePlot(plots[i]);
        s.visitDays = Array.isArray(obj.visitDays)
            ? Array.from(new Set(obj.visitDays.filter((k) => typeof k === 'string' &&
                (/^\d{4}-\d{2}-\d{2}$/.test(k) || /^garden-\d+$/.test(k))))).sort()
            : [];
        s.journal = Array.isArray(obj.journal) ? obj.journal.filter((e) => e && typeof e.kind === 'string').slice(-400) : [];
        const st = obj.settings || {};
        s.settings.pace = st.pace === 'gentle' ? 'gentle' : 'standard';
        s.settings.breaths = clampBreaths(st.breaths);
        s.settings.lighting = LIGHTINGS.includes(st.lighting) ? st.lighting : 'auto';
        delete s.settings.chart;
        s.settings.offsetDays = Number.isFinite(Number(st.offsetDays)) ? Math.max(0, Math.round(Number(st.offsetDays))) : 0;
        s.pantry = H.sanitizePantry(obj.pantry);
        s.spareSeeds = H.sanitizeSpareSeeds(obj.spareSeeds);
        if (obj.version === 3) {
            s.pantry = H.emptyPantry();
            s.spareSeeds = H.emptySpareSeeds();
        }
        if (obj.version === 4) {
            D.migrateGardenFields(s);
            s.dayNumber = 1;
            s.gardenMinutes = D.DEFAULT_DAY_CONFIG.startMinutes;
            s.season = 'spring';
            s.seasonDay = 1;
            s.dailyTends = {};
            s.morningPending = null;
            s.daysCompleted = 0;
        } else {
            s.dayNumber = Math.max(1, Math.round(Number(obj.dayNumber) || 1));
            s.gardenMinutes = D.clampMinutes(obj.gardenMinutes);
            s.season = D.SEASONS.includes(obj.season) ? obj.season : D.seasonForDayNumber(s.dayNumber);
            s.seasonDay = D.seasonDayNumber(s.dayNumber);
            s.dailyTends = obj.dailyTends && typeof obj.dailyTends === 'object' ? obj.dailyTends : {};
            s.morningPending = obj.morningPending || null;
            s.daysCompleted = Math.max(0, Math.round(Number(obj.daysCompleted) || s.dayNumber - 1));
        }
        const st2 = obj.settings || {};
        if (Number.isFinite(Number(st2.realMsPerGardenMinute))) {
            s.settings.realMsPerGardenMinute = Math.max(100, Number(st2.realMsPerGardenMinute));
        }
        if (obj.version < 6) {
            for (let i = 0; i < PLOTS; i++) {
                const p = s.plots[i];
                if (p) p.staked = false;
            }
            if (s.dailyTends && typeof s.dailyTends === 'object') {
                const day = s.dayNumber;
                for (const [k, raw] of Object.entries(s.dailyTends)) {
                    const i = Number(k);
                    const pl = s.plots[i];
                    if (!pl) continue;
                    const needs = L.plantNeeds(pl.plantId);
                    const prog = C ? C.migrateLegacyTend(raw, needs, false) : null;
                    if (prog) {
                        s.dailyTends[k] = C.toDailyTendRecord(prog, needs, false, day);
                        s.dailyTends[k].day = day;
                    }
                }
            }
        }
        s.version = STATE_VERSION;
        const todayKey = s.version >= 5 ? D.gardenDayKey(s.dayNumber) : dayKey(now instanceof Date ? now : new Date(now === undefined ? Date.now() : now));
        advanceRegrowPlots(s, todayKey);
        return s;
    }

    function serializeState(state) { return JSON.stringify(state); }

    function visitCount(state) {
        if (state.version >= 5) {
            const completed = Number.isFinite(state.daysCompleted) ? state.daysCompleted : Math.max(0, state.dayNumber - 1);
            const tendedToday = state.dailyTends && Object.values(state.dailyTends).some(
                (t) => t && t.day === state.dayNumber);
            return completed + (tendedToday ? 1 : 0);
        }
        return state.visitDays.length;
    }

    function calendarKey(state, now) {
        return state.version >= 5 ? D.gardenDayKey(state.dayNumber) : dayKey(now instanceof Date ? now : new Date(now));
    }

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
        const day = calendarKey(state, d);
        state.plots[i] = {
            plantId, plantedDay: day, stage: 1, sunBank: 0, lastGrowDay: null, matureDay: null,
            picked: false, pickDay: null, matureWater: null, matureFert: null, tagResting: false,
        };
        if (state.spareSeeds && state.spareSeeds[plantId] > 0) state.spareSeeds[plantId] -= 1;
        addJournal(state, { day, ts: d.getTime(), kind: 'planted', plantId, plot: i, stage: 1,
            text: `Planted ${kind.name.toLowerCase()} in bed ${i + 1}.` });
        return { ok: true, plot: i };
    }

    /** Distinct visit days in the current local week (Mon–Sun). No streaks. */
    function weeklyVisits(state, now) {
        if (state.version >= 5) {
            return state.visitDays.filter((k) => /^garden-\d+$/.test(k)).length;
        }
        const d = now instanceof Date ? now : new Date(now);
        const start = weekStartKey(d);
        const end = addDaysKey(start, 6);
        return state.visitDays.filter((k) => k >= start && k <= end).length;
    }

    function visitedToday(state, now) {
        if (state.version >= 5) return state.visitDays.includes(D.gardenDayKey(state.dayNumber));
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

    /**
     * Move selection among planted beds along an arrow direction.
     * Prefers a straight-line neighbor on the 2×4 grid; if none is planted
     * (common when beds are staggered), cycles the selectable list so
     * keyboard players can always reach every bed.
     */
    function movePlotSelection(current, dir, planted) {
        const list = Array.isArray(planted) ? planted.filter((i) => i >= 0) : [];
        if (!list.length) return null;
        const set = new Set(list);
        const start = set.has(current) ? current : list[0];
        let i = start;
        for (let n = 0; n < 8; n++) {
            const next = neighborPlot(i, dir);
            if (next === null) break;
            i = next;
            if (set.has(i)) return i;
        }
        const idx = list.indexOf(start);
        if (idx < 0) return list[0];
        if (list.length === 1) return start;
        const delta = (dir === 'left' || dir === 'up') ? -1 : 1;
        return list[(idx + delta + list.length) % list.length];
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
                stretchStaked: !!b.stretchDone,
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

    function growPlotsFromTendsV6(state, dayKeyStr, d, bedResults) {
        const byPlot = Object.create(null);
        for (const b of bedResults) byPlot[b.plot] = b;
        const grew = [];
        const waiting = [];
        const tended = [];
        const season = state.season || D.seasonForDayNumber(state.dayNumber);
        advanceRegrowPlots(state, dayKeyStr);
        state.plots.forEach((p, i) => {
            if (!p || p.stage >= MAX_STAGE || p.picked) return;
            const br = byPlot[i];
            const kind = L.plantById(p.plantId);
            if (!br) return;
            tended.push({ plot: i, plantId: p.plantId, name: kind.name });
            if (!br.allMet) {
                waiting.push({ plot: i, plantId: p.plantId, name: kind.name, reason: 'needs-incomplete' });
                return;
            }
            if (!D.isPlantInSeason(p.plantId, season)) {
                waiting.push({ plot: i, plantId: p.plantId, name: kind.name, reason: 'out-of-season' });
                return;
            }
            if (p.lastGrowDay === dayKeyStr) {
                waiting.push({ plot: i, plantId: p.plantId, name: kind.name, reason: 'grew-today' });
                return;
            }
            const from = p.stage;
            p.stage += 1;
            p.lastGrowDay = dayKeyStr;
            p.sunBank = 0;
            if (p.stage >= MAX_STAGE) {
                p.matureDay = dayKeyStr;
                p.matureWater = 1;
                p.matureFert = 1;
                p.picked = false;
                p.pickDay = null;
            }
            grew.push({ plot: i, plantId: p.plantId, name: kind.name, from, to: p.stage, mature: p.stage >= MAX_STAGE });
            addJournal(state, {
                day: dayKeyStr, ts: d.getTime(), kind: p.stage >= MAX_STAGE ? 'mature' : 'stage', plantId: p.plantId, plot: i, stage: p.stage,
                text: `${kind.name} in bed ${i + 1} ${STAGE_PHRASE[p.stage]}.`,
            });
        });
        return { grew, waiting, tended };
    }

  function growPlotsFromTends(state, dayKeyStr, d, bedResults) {
        if (state.version >= 6 && C) return growPlotsFromTendsV6(state, dayKeyStr, d, bedResults);
        const byPlot = Object.create(null);
        for (const b of bedResults) byPlot[b.plot] = b;
        const grew = [];
        const waiting = [];
        const tended = [];
        const season = state.season || D.seasonForDayNumber(state.dayNumber);
        advanceRegrowPlots(state, dayKeyStr);
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
            if (state.version >= 5 && !D.isPlantInSeason(p.plantId, season)) {
                waiting.push({ plot: i, plantId: p.plantId, name: kind.name, reason: 'out-of-season' });
                return;
            }
            const banked = sun * (1 + TUNING.fertilizerBoost * fert);
            const watered = water >= TUNING.waterToGrow;
            p.sunBank = Math.min(cost, p.sunBank + banked);
            const info = { plot: i, plantId: p.plantId, name: kind.name, stage: p.stage, sunBank: p.sunBank, cost };
            if (p.lastGrowDay === dayKeyStr) { waiting.push(Object.assign(info, { reason: 'grew-today' })); return; }
            if (p.sunBank + 1e-9 < cost) { waiting.push(Object.assign(info, { reason: 'needs-sun', short: cost - p.sunBank })); return; }
            if (!watered) { waiting.push(Object.assign(info, { reason: 'needs-water' })); return; }
            const from = p.stage;
            p.stage += 1;
            p.sunBank = 0;
            p.lastGrowDay = dayKeyStr;
            if (p.stage >= MAX_STAGE) {
                p.matureDay = dayKeyStr;
                p.matureWater = water;
                p.matureFert = fert;
                p.picked = false;
                p.pickDay = null;
            }
            grew.push({ plot: i, plantId: p.plantId, name: kind.name, from, to: p.stage, mature: p.stage >= MAX_STAGE });
            addJournal(state, {
                day: dayKeyStr, ts: d.getTime(), kind: p.stage >= MAX_STAGE ? 'mature' : 'stage', plantId: p.plantId, plot: i, stage: p.stage,
                text: `${kind.name} in bed ${i + 1} ${STAGE_PHRASE[p.stage]}.`,
            });
        });
        return { grew, waiting, tended };
    }

    /** Apply overnight growth from daily tends (v5 day loop). */
    function applyOvernightGrowth(state, now) {
        const d = now instanceof Date ? now : new Date(now);
        const gkey = D.gardenDayKey(state.dayNumber);
        const beds = [];
        for (let i = 0; i < PLOTS; i++) {
            const t = state.dailyTends && state.dailyTends[i];
            if (!t || t.day !== state.dayNumber) continue;
            if (state.version >= 6) {
                beds.push({
                    plot: i,
                    sun: t.sun,
                    water: t.water,
                    fertilizer: t.fertilizer,
                    stake: t.stake,
                    allMet: t.allMet === true,
                });
            } else {
                beds.push(Object.assign({ plot: i }, t));
            }
        }
        return growPlotsFromTends(state, gkey, d, beds);
    }

    function goToBed(state, now) {
        const d = now instanceof Date ? now : new Date(now);
        if (state.version >= 6) {
            state.plots.forEach((p) => { if (p) p.tagResting = false; });
        }
        const out = applyOvernightGrowth(state, d);
        const completedDay = state.dayNumber;
        const completedKey = D.gardenDayKey(completedDay);
        const careStats = (Summary && C)
            ? Summary.aggregateCareFromDailyTends(state, completedDay, (id) => L.plantNeeds(id))
            : null;
        state.morningPending = Object.assign({ day: completedDay + 1 }, out, { careStats });
        state.daysCompleted = completedDay;
        state.dayNumber += 1;
        state.season = D.seasonForDayNumber(state.dayNumber);
        state.seasonDay = D.seasonDayNumber(state.dayNumber);
        state.gardenMinutes = D.DEFAULT_DAY_CONFIG.startMinutes;
        state.dailyTends = {};
        if (state.version >= 6) applyTagRestingAfterBedtime(state, out);
        const day = completedKey;
        if (!state.visitDays.includes(day)) {
            state.visitDays.push(day);
            state.visitDays.sort();
        }
        addJournal(state, {
            day, ts: d.getTime(), kind: 'bedtime',
            text: out.grew.length ? `Overnight: ${out.grew.length} plant(s) grew.` : 'A quiet night in the garden.',
        });
        return Object.assign({}, out, { careStats });
    }

    /**
     * Apply a finished visit / daily tend: record per-plant care; grow immediately on v4,
     * defer growth to bedtime on v5.
     */
    function applyVisit(state, result, now) {
        const d = now instanceof Date ? now : new Date(now);
        const day = state.version >= 5 ? D.gardenDayKey(state.dayNumber) : dayKey(d);
        const bedResults = visitBedResults(result);
        const byPlot = Object.create(null);
        for (const b of bedResults) byPlot[b.plot] = b;

        let grew = [];
        let waiting = [];
        let tended = [];
        const before = unlockedPlants(state);

        if (result && result.careMode && C && state.version >= 6) {
            const careBeds = result.careBeds || [];
            D.recordDayTending(state, careBeds.map((b) => {
                const p = state.plots[b.plot];
                const needs = L.plantNeeds(p.plantId);
                const rec = C.toDailyTendRecord(b.progress, needs, p.staked, state.dayNumber);
                return Object.assign({ plot: b.plot }, rec, { progress: b.progress, allMet: rec.allMet, stake: rec.stake });
            }), state.dayNumber, (id) => L.plantById(id));
            for (const b of careBeds) {
                const p = state.plots[b.plot];
                if (!p) continue;
                const needs = L.plantNeeds(p.plantId);
                if (needs.stake && b.progress && b.progress.stake) p.staked = true;
                if (C.allNeedsMet(b.progress, needs, p.staked)) p.tagResting = false;
                const kind = L.plantById(p.plantId);
                const prog = Object.assign(C.emptyProgress(), b.progress || {});
                const sun = Number(prog.sun) || 0;
                const water = Number(prog.water) || 0;
                const fertilizer = Number(prog.fertilizer) || 0;
                const stake = !!(needs.stake && (prog.stake || p.staked));
                if (sun > 0 || water > 0 || fertilizer > 0 || stake) {
                    tended.push({
                        plot: b.plot, plantId: p.plantId, name: kind.name,
                        careDots: true, sun, water, fertilizer, stake,
                    });
                }
            }
        } else if (state.version >= 5) {
            D.recordDayTending(state, bedResults, state.dayNumber, (id) => L.plantById(id));
            for (const b of bedResults) {
                const p = state.plots[b.plot];
                if (!p) continue;
                if (b.stretchStaked && L.plantNeedsStake(p.plantId)) p.staked = true;
                const kind = L.plantById(p.plantId);
                if (b.sunHours > 0 || b.water > 0 || b.fertilizer > 0) {
                    tended.push({ plot: b.plot, plantId: p.plantId, name: kind.name, sunHours: b.sunHours, water: b.water, fertilizer: b.fertilizer });
                }
            }
        } else {
            ({ grew, waiting, tended } = growPlotsFromTends(state, day, d, bedResults));
        }

        const firstVisitToday = !state.visitDays.includes(day);
        if (firstVisitToday) {
            state.visitDays.push(day);
            state.visitDays.sort();
            if (state.visitDays.length > 400) state.visitDays.splice(0, state.visitDays.length - 400);
        }
        const unlocked = unlockedPlants(state).filter((id) => !before.includes(id));

        const sumSun = tended.reduce((s, t) => s + (Number(t.careDots ? t.sun : t.sunHours) || 0), 0);
        const sumWater = tended.length ? tended.reduce((s, t) => s + (Number(t.water) || 0), 0) / tended.length : 0;
        const sumFert = tended.length ? tended.reduce((s, t) => s + (Number(t.fertilizer) || 0), 0) / tended.length : 0;
        const parts = tended.map((t) => {
            if (t.careDots) {
                const bits = [];
                if (t.sun > 0) bits.push(`${round1(t.sun)} sun`);
                if (t.water > 0) bits.push(`${round1(t.water)} water`);
                if (t.fertilizer > 0) bits.push(`${round1(t.fertilizer)} fertilizer`);
                if (t.stake) bits.push('staked');
                return `bed ${t.plot + 1}: ${bits.join(', ') || 'tended'}`;
            }
            return `bed ${t.plot + 1}: ${round1(t.sunHours)} h sun, ${Math.round((Number(t.water) || 0) * 100)}% water` +
                (t.fertilizer > 0 ? `, ${Math.round((Number(t.fertilizer) || 0) * 100)}% fertilizer` : '');
        });
        addJournal(state, {
            day, ts: d.getTime(), kind: 'visit',
            sunHours: round1(sumSun), water: round2(sumWater), fertilizer: round2(sumFert),
            breaths: tended.reduce((s, t) => s + ((byPlot[t.plot] && byPlot[t.plot].breaths) || 0), 0),
            text: parts.length ? `Visit per plant: ${parts.join('; ')}.` : 'Visit: a quiet hello to the garden.',
        });
        for (const id of unlocked) {
            addJournal(state, { day, ts: d.getTime(), kind: 'unlock', plantId: id, text: `New seeds: ${L.plantById(id).name}.` });
        }
        const legacy = bedResults[0] || { sunHours: 0, water: 0, fertilizer: 0 };
        let careStats = null;
        if (result && result.careMode && C && Summary && state.version >= 6) {
            careStats = Summary.aggregateCareFromBeds(
                result.careBeds,
                (result.harvestPlots || []).length,
                state,
                (id) => L.plantNeeds(id),
            );
        }
        return {
            day, sunHours: sumSun, water: sumWater, fertilizer: sumFert,
            tended, grew, waiting, unlocked, firstVisitToday,
            weekly: weeklyVisits(state, d), visits: visitCount(state),
            banked: legacy.sunHours * (1 + TUNING.fertilizerBoost * legacy.fertilizer),
            watered: legacy.water >= TUNING.waterToGrow,
            careMode: !!(result && result.careMode),
            careStats,
            harvestPlots: (result && result.harvestPlots) || [],
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
    const STEPS = Object.freeze([
        'greeting', 'pick-harvest', 'harvest-hold', 'pick',
        'care-hub', 'care-smile', 'care-talk', 'care-harvest',
        'smile', 'talk', 'breathe-offer', 'breathe', 'stretch-offer', 'stretch', 'summary',
    ]);

    /** When true, maybeChainStretchAfterBreathing() opens stretch after breath (rewire hook). */
    let chainStretchAfterBreath = false;

    function emptyBedTally() {
        return {
            smileWeighted: 0, smileSecondsRaw: 0, talkSecondsRaw: 0,
            breathsDone: 0, breathSkipped: false, breathTaken: false,
            stretchDone: false, stretchSkipped: false,
        };
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
            // Care remap: mature ready beds stay selectable so the player can
            // finish today's needs, then click to harvest on care-hub.
            if (Array.isArray(o.plantedBeds)) {
                this.plantedBeds = o.plantedBeds.slice();
            } else {
                const careSet = new Set([...this.tendBeds, ...this.harvestQueue]);
                this.plantedBeds = [...careSet].sort((a, b) => a - b);
            }
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
            let Stretch = null;
            if (typeof require === 'function') {
                try { Stretch = require('./stretch.js'); } catch (_) { /* browser bundle */ }
            }
            if (!Stretch && typeof globalThis !== 'undefined') Stretch = globalThis.SmileStretch;
            this.stretchFlow = Stretch ? Stretch.createStretchFlow() : null;
            this.stretchSnap = { leftProgress: 0, rightProgress: 0, rollDeg: 0, needsFaceHint: false };
            /** @type {'pick'|'summary'|'advance'|string} */
            this._stretchReturnStep = 'care-hub';
            this._stretchAfterBreathChained = false;
            this.careProgress = Object.create(null);
            this.gardenDay = o.gardenDay || 1;
            this.dailyTendsSeed = o.dailyTends || null;
            this._careSmileRaw = 0;
            this._careTalkRaw = 0;
            this._careBreathRaw = 0;
            this.activeCareChannel = null;
            for (const plot of this.plantedBeds) this._loadCareProgress(plot);
        }

        _loadCareProgress(plot) {
            const p = this.plots[plot];
            if (!p || !C) return;
            // Keep in-session progress when re-selecting a bed mid-tend.
            if (this.careProgress[plot]) return;
            const needs = L.plantNeeds(p.plantId);
            const ext = this.dailyTendsSeed && this.dailyTendsSeed[plot];
            const rec = ext && ext.day === this.gardenDay ? ext : null;
            this.careProgress[plot] = C.readProgressFromDailyTend(rec, needs, p.staked);
        }

        careProgressFor(plot) {
            if (!this.careProgress[plot]) this._loadCareProgress(plot);
            return Object.assign(C.emptyProgress(), this.careProgress[plot]);
        }

        setCareProgress(plot, progress) {
            this.careProgress[plot] = Object.assign(C.emptyProgress(), progress);
            const p = this.plots[plot];
            if (!p) return;
            const needs = L.plantNeeds(p.plantId);
            if (C.stakeNeedMet(this.careProgress[plot], p.staked) && needs.stake && !p.staked) {
                /* staking applied at applyVisit */
            }
            this.events.push({ type: 'care-progress', plot, progress: this.careProgress[plot] });
        }

        allNeedsMetForPlot(plot) {
            const p = this.plots[plot];
            if (!p) return false;
            return C.allNeedsMet(this.careProgressFor(plot), L.plantNeeds(p.plantId), p.staked);
        }

        startCare(needKey) {
            if (this.selectedPlot == null) return this.step;
            const p = this.plots[this.selectedPlot];
            const needs = L.plantNeeds(p.plantId);
            if (needKey === 'stake' && needs.stake) return this.launchStretchCare('care-hub');
            if (needKey === 'sun') return this.step;
            if (needKey === 'water' && needs.water > 0) {
                this._careSmileRaw = 0;
                this.stepTime = 0;
                return this.go('care-smile');
            }
            if (needKey === 'fertilizer' && needs.fertilizer > 0) {
                this._careTalkRaw = 0;
                this.stepTime = 0;
                return this.go('care-talk');
            }
            if (needKey === 'harvest' && this.canCareHarvest(this.selectedPlot)) {
                return this.confirmCareHarvest();
            }
            return this.step;
        }

        careGardenDayKey() {
            if (this.gardenDay != null) return D.gardenDayKey(this.gardenDay);
            return null;
        }

        canCareHarvest(plot) {
            const p = this.plots[plot];
            if (!p || !H) return false;
            if (this.pendingHarvests.includes(plot)) return false;
            if (p.stage < MAX_STAGE) return false;
            const today = this.careGardenDayKey();
            // Mature + ready is enough — click (or Enter) when fully grown.
            // Daily need dots are for growth, not a second gate on picking.
            return !!(today && H.isPlotReady(p, today));
        }

        /** Instant pick from care-hub (click / Enter / Space). */
        confirmCareHarvest() {
            const harvestSteps = ['care-hub', 'care-harvest', 'care-smile', 'care-talk', 'stretch-offer', 'stretch'];
            if (!harvestSteps.includes(this.step)) return this.step;
            if (this.selectedPlot == null || !this.canCareHarvest(this.selectedPlot)) return this.step;
            return this._completeCareHarvest();
        }

        _tickAutoSunForAll(dt, isDaylight) {
            if (!C || !isDaylight) return;
            for (const plot of this.plantedBeds) {
                const p = this.plots[plot];
                if (!p || this.pendingHarvests.includes(plot)) continue;
                const needs = L.plantNeeds(p.plantId);
                if (needs.sun <= 0) continue;
                const prog = C.addAutoSun(this.careProgressFor(plot), needs, dt, isDaylight);
                this.setCareProgress(plot, prog);
            }
        }

        _completeCareHarvest() {
            if (this.selectedPlot == null) return this.go('care-hub');
            const done = this.selectedPlot;
            if (!this.pendingHarvests.includes(done)) this.pendingHarvests.push(done);
            this.events.push({ type: 'harvest-ready', plot: done });
            this.pacer = null;
            this.breathT = 0;
            this.breathsDone = 0;
            this.activeCareChannel = null;
            const next = this.plantedBeds.find((i) => !this.pendingHarvests.includes(i));
            if (next != null) {
                this.selectedPlot = next;
                this._loadCareProgress(next);
                this._syncLiveFromTally();
                return this.go('care-hub');
            }
            // Nothing left to tend or pick — end the visit instead of sitting on a harvested bed.
            return this.go('summary');
        }

        finishCareHub() {
            return this.go('summary');
        }

        bedInfo(plot) {
            const p = this.plots[plot];
            if (!p) return { cost: TUNING.maxSunHours };
            const kind = L.plantById(p.plantId);
            return { cost: kind ? kind.cost : TUNING.maxSunHours, plantId: p.plantId };
        }

        selectedPlantNeedsStake() {
            const plot = this.selectedPlot;
            if (plot == null) return false;
            const p = this.plots[plot];
            return L.plantNeedsStake(p && p.plantId);
        }

        isStretchCareStep() {
            return this.step === 'stretch-offer' || this.step === 'stretch';
        }

        /**
         * Standalone neck-stretch / stake care for the selected stake-eligible plant.
         * @param {string} [returnStep='pick'] step to resume after skip/complete
         */
        launchStretchCare(returnStep) {
            if (!this.selectedPlantNeedsStake()) return this.step;
            this._stretchAfterBreathChained = false;
            this._stretchReturnStep = returnStep || 'pick';
            return this.go('stretch-offer');
        }

        startStretchCare() {
            return this.startStretch();
        }

        skipStretchCare() {
            if (!this.isStretchCareStep()) return this.step;
            this.live.stretchSkipped = true;
            this._saveLiveToTally();
            return this._endStretchCare();
        }

        completeStretchCare() {
            if (this.step !== 'stretch') return this.step;
            this.live.stretchDone = true;
            if (this.selectedPlot != null && C) {
                const prog = this.careProgressFor(this.selectedPlot);
                prog.stake = true;
                this.setCareProgress(this.selectedPlot, prog);
            }
            return this._endStretchCare();
        }

        _endStretchCare() {
            if (this._stretchAfterBreathChained) return this.advanceToNextPlant();
            const back = this._stretchReturnStep || 'pick';
            if (back === 'advance') return this.advanceToNextPlant();
            if (back === 'summary') return this.go('summary');
            return this.go(back);
        }

        /** Single rewire point: optional stretch offer immediately after breathing. */
        maybeChainStretchAfterBreathing() {
            if (!chainStretchAfterBreath) return this.advanceToNextPlant();
            if (!this.selectedPlantNeedsStake()) return this.advanceToNextPlant();
            this._stretchAfterBreathChained = true;
            this._stretchReturnStep = null;
            return this.go('stretch-offer');
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
            if (this.step === 'pick' || this.step === 'care-hub'
                || this.step === 'care-smile' || this.step === 'care-talk' || this.step === 'care-harvest'
                || this.step === 'stretch-offer' || this.step === 'stretch') {
                return this.plantedBeds.filter((i) => !this.pendingHarvests.includes(i));
            }
            return [];
        }

        _careDotSecondsLeft(key) {
            if (!C || this.selectedPlot == null) return 0;
            const p = this.plots[this.selectedPlot];
            const needs = L.plantNeeds(p.plantId);
            const req = C.dotsForNeed(needs, key);
            if (req <= 0) return 0;
            const prog = this.careProgressFor(this.selectedPlot);
            const got = Math.max(0, Number(prog[key]) || 0);
            const unit = C.CARE_DOT_SECONDS[key] || 0;
            return Math.max(0, (req - got) * unit);
        }

        stepDuration() {
            if (this.step === 'smile') return this.smileSeconds;
            if (this.step === 'talk') return this.talkSeconds;
            if (this.step === 'harvest-hold') return this.harvestSeconds;
            if (this.step === 'breathe') return this.pacer ? this.pacer.total : 0;
            if (this.step === 'care-smile') return this._careDotSecondsLeft('water');
            if (this.step === 'care-talk') return this._careDotSecondsLeft('fertilizer');
            if (this.step === 'care-harvest' && this.pacer) return this.pacer.total;
            return 0;
        }
        stepRemaining() {
            if (this.step === 'harvest-hold') return Math.max(0, this.harvestSeconds - this.harvestSmile);
            if (this.step === 'breathe') return Math.max(0, this.stepDuration() - this.breathT);
            if (this.step === 'care-smile' || this.step === 'care-talk') {
                return this._careDotSecondsLeft(this.step === 'care-smile' ? 'water' : 'fertilizer');
            }
            if (this.step === 'care-harvest' && this.pacer) return Math.max(0, this.pacer.total - this.breathT);
            return Math.max(0, this.stepDuration() - this.stepTime);
        }

        go(step) {
            if (!STEPS.includes(step)) throw new Error('unknown step ' + step);
            if (this.step === 'smile' || this.step === 'talk' || this.step === 'breathe' || this.step === 'stretch') this._saveLiveToTally();
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
            if (step === 'care-harvest') {
                // Legacy step: harvest is click-instant now.
                this.pacer = null;
                this.breathT = 0;
                this.breathsDone = 0;
            }
            if (step === 'stretch') {
                if (this.stretchFlow) this.stretchFlow.reset();
                this.stretchSnap = { leftProgress: 0, rightProgress: 0, rollDeg: 0, needsFaceHint: false };
            }
            if (step === 'smile' || step === 'talk' || step === 'breathe' || step === 'breathe-offer' || step === 'stretch-offer' || step === 'stretch' || step === 'pick') {
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
            if (!this.plantedBeds.length) return this.go('summary');
            this.phase = 'tend';
            this.plantRound = 0;
            this.selectedPlot = this.plantedBeds[0];
            return this.go('care-hub');
        }

        confirmPick() {
            if (this.step === 'pick-harvest' && this.selectedPlot != null) return this.go('harvest-hold');
            if (this.step !== 'pick' || this.selectedPlot == null) return this.step;
            return this.go('care-hub');
        }

        confirmHarvestInstant() {
            if (this.step !== 'harvest-hold') return this.step;
            this.harvestSmile = this.harvestSeconds;
            return this._completeHarvest();
        }

        /**
         * Make a planted bed selectable mid-visit (e.g. opened from a single-bed
         * click path that previously omitted siblings).
         */
        ensurePlantedBed(plot) {
            const i = Number(plot);
            if (!(i >= 0 && i < PLOTS) || !this.plots[i]) return false;
            if (this.pendingHarvests.includes(i)) return false;
            if (!this.plantedBeds.includes(i)) {
                this.plantedBeds = this.plantedBeds.concat([i]).sort((a, b) => a - b);
            }
            this._loadCareProgress(i);
            return true;
        }

        setSelectedPlot(plot) {
            const i = Number(plot);
            const careSteps = ['pick', 'pick-harvest', 'care-hub', 'care-smile', 'care-talk', 'care-harvest', 'stretch-offer', 'stretch'];
            if (!careSteps.includes(this.step)) return false;
            // Care-hub (and focused care steps): pull sibling planted beds into the
            // visit if a single-bed open path omitted them.
            if (this.step !== 'pick-harvest' && this.step !== 'pick') this.ensurePlantedBed(i);
            const list = this.selectablePlots();
            if (!(i >= 0 && i < PLOTS) || !list.includes(i)) return false;
            const changed = this.selectedPlot !== i;
            this.selectedPlot = i;
            this._loadCareProgress(i);
            this._syncLiveFromTally();
            this.events.push({ type: 'select', plot: i });
            if (changed) {
                this._clearActiveCareInput();
                // Leaving a focused stretch / single-need step returns to the free care hub.
                if (this.step === 'care-smile' || this.step === 'care-talk' || this.step === 'care-harvest'
                    || this.step === 'stretch-offer' || this.step === 'stretch') {
                    this.go('care-hub');
                }
            }
            return true;
        }

        _clearActiveCareInput() {
            this.activeCareChannel = null;
            this.pacer = null;
            this.breathT = 0;
            this.breathsDone = 0;
            if (this.stretchFlow) this.stretchFlow.reset();
            this.stretchSnap = { leftProgress: 0, rightProgress: 0, rollDeg: 0, needsFaceHint: false };
        }

        moveSelection(dir) {
            if (this.step !== 'pick' && this.step !== 'pick-harvest' && this.step !== 'care-hub'
                && this.step !== 'care-smile' && this.step !== 'care-talk' && this.step !== 'care-harvest'
                && this.step !== 'stretch-offer' && this.step !== 'stretch') return this.selectedPlot;
            const list = this.selectablePlots();
            const next = movePlotSelection(this.selectedPlot, dir, list);
            if (next !== null && next !== this.selectedPlot) this.setSelectedPlot(next);
            return this.selectedPlot;
        }

        /** Cycle to the next selectable bed (Enter / keyboard) — works mid-tend. */
        selectNextPlant() {
            const list = this.selectablePlots();
            if (!list.length || this.selectedPlot == null) return this.selectedPlot;
            const idx = list.indexOf(this.selectedPlot);
            // After a harvest, selection may still sit on a pending bed — jump back onto the list.
            if (idx < 0) {
                this.setSelectedPlot(list[0]);
                return this.selectedPlot;
            }
            if (list.length < 2) return this.selectedPlot;
            const next = list[(idx + 1) % list.length];
            if (next !== this.selectedPlot) this.setSelectedPlot(next);
            return this.selectedPlot;
        }

        /**
         * Care-hub Enter key: harvest when picking is intentional, otherwise switch beds
         * so mid-tend players are not stuck on a mature plant. Finish when this bed is
         * done and nothing else remains to tend or pick.
         * @returns {'harvest'|'switch'|'finish'|'noop'}
         */
        careHubEnterAction() {
            const selectable = this.selectablePlots();
            const onSelectable = this.selectedPlot != null && selectable.includes(this.selectedPlot);
            const doneHere = onSelectable && this.allNeedsMetForPlot(this.selectedPlot);
            const canPick = onSelectable && this.canCareHarvest(this.selectedPlot);
            if (!selectable.length) return 'finish';
            // Sitting on a harvested / non-selectable bed with others left — move first.
            if (!onSelectable) return 'switch';
            if (canPick && (doneHere || selectable.length === 1)) return 'harvest';
            if (selectable.length > 1) return 'switch';
            if (doneHere) return 'finish';
            return 'noop';
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
                return this.go('care-hub');
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
                    return this.go('care-hub');
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
            return this.go('care-hub');
        }

        skip() {
            if (this.step === 'greeting') return this.begin();
            if (this.step === 'pick-harvest') return this.skipHarvestBed();
            if (this.step === 'harvest-hold') return this.skipHarvestBed();
            if (this.step === 'pick') return this.confirmPick();
            if (this.step === 'smile') return this.go('talk');
            if (this.step === 'talk') return this.go('breathe-offer');
            if (this.step === 'breathe-offer') return this.maybeChainStretchAfterBreathing();
            if (this.step === 'breathe') {
                this.breathSkipped = true;
                this.live.breathSkipped = true;
                this._saveLiveToTally();
                return this.maybeChainStretchAfterBreathing();
            }
            if (this.step === 'stretch-offer' || this.step === 'stretch') return this.skipStretchCare();
            if (this.step === 'care-smile' || this.step === 'care-talk' || this.step === 'care-harvest') return this.go('care-hub');
            if (this.step === 'care-hub') return this.finishCareHub();
            return this.step;
        }

        startBreathing(opts) {
            if (opts && opts.pace) this.pace = opts.pace === 'gentle' ? 'gentle' : 'standard';
            if (opts && opts.breaths) this.breathCount = clampBreaths(opts.breaths);
            return this.go('breathe');
        }

        startStretch() {
            if (!this.selectedPlantNeedsStake()) return this._endStretchCare();
            return this.go('stretch');
        }

        confirmStretchManual() {
            return this.completeStretchCare();
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
                    this.maybeChainStretchAfterBreathing();
                }
            }
            const careSteps = new Set(['care-hub', 'care-smile', 'care-talk', 'care-harvest', 'stretch-offer', 'stretch']);
            if (careSteps.has(this.step) && C) {
                this._tickAutoSunForAll(step, !!inp.isDaylight);
            }
            if (this.step === 'care-hub' && this.selectedPlot != null && C) {
                const plot = this.selectedPlot;
                const p = this.plots[plot];
                const needs = L.plantNeeds(p.plantId);
                let stretchSnap = this.stretchSnap;
                const stakeOpen = needs.stake && !C.stakeNeedMet(this.careProgressFor(plot), p.staked);
                if (stakeOpen && this.stretchFlow) {
                    stretchSnap = this.stretchFlow.update(step, inp.stretch || {});
                    this.stretchSnap = stretchSnap;
                    if (stretchSnap.complete) {
                        const prog = this.careProgressFor(plot);
                        prog.stake = true;
                        this.setCareProgress(plot, prog);
                        this.stretchFlow.reset();
                        this.stretchSnap = { leftProgress: 0, rightProgress: 0, rollDeg: 0, needsFaceHint: false };
                    }
                }
                const stretchEngaged = !!(stakeOpen && (
                    stretchSnap.activeSide
                    || Math.abs(Number(stretchSnap.rollDeg) || 0) >= 8
                    || (stretchSnap.leftProgress || 0) > 0.05
                    || (stretchSnap.rightProgress || 0) > 0.05
                ));
                const channel = C.pickAutoCareChannel({
                    faceVisible,
                    poorReading: this.poorReading,
                    smiling: this.smiling,
                    talking: this.talking,
                    stretchEngaged,
                    needs,
                    progress: this.careProgressFor(plot),
                    plotStaked: p.staked,
                });
                this.activeCareChannel = channel;
                if (channel === 'water' && !this.poorReading) {
                    const prog = C.addDotTime(this.careProgressFor(plot), 'water', step, needs);
                    this.setCareProgress(plot, prog);
                } else if (channel === 'fertilizer' && !this.poorReading) {
                    const prog = C.addDotTime(this.careProgressFor(plot), 'fertilizer', step, needs);
                    this.setCareProgress(plot, prog);
                }
            }
            if (this.step === 'care-smile' && this.selectedPlot != null && C) {
                const plot = this.selectedPlot;
                const needs = L.plantNeeds(this.plots[plot].plantId);
                if (this.smiling && faceVisible) {
                    const prog = C.addDotTime(this.careProgressFor(plot), 'water', step, needs);
                    this.setCareProgress(plot, prog);
                }
                if (C.fillFraction(this.careProgressFor(plot), needs, 'water', this.plots[plot].staked) >= 1) this.go('care-hub');
            } else if (this.step === 'care-talk' && this.selectedPlot != null && C) {
                const plot = this.selectedPlot;
                const needs = L.plantNeeds(this.plots[plot].plantId);
                if (this.talking && faceVisible) {
                    const prog = C.addDotTime(this.careProgressFor(plot), 'fertilizer', step, needs);
                    this.setCareProgress(plot, prog);
                }
                if (C.fillFraction(this.careProgressFor(plot), needs, 'fertilizer', this.plots[plot].staked) >= 1) this.go('care-hub');
            } else if (this.step === 'care-harvest' && this.selectedPlot != null && C) {
                this._completeCareHarvest();
            } else if (this.step === 'stretch' && this.stretchFlow) {
                const snap = this.stretchFlow.update(step, input && input.stretch ? input.stretch : {});
                this.stretchSnap = snap;
                if (snap.complete) this.completeStretchCare();
            }
            const ev = this.events;
            this.events = [];
            return ev;
        }

        result() {
            this._saveLiveToTally();
            if (C) {
                const careBeds = [];
                for (const plot of this.plantedBeds) {
                    const p = this.plots[plot];
                    if (!p) continue;
                    const needs = L.plantNeeds(p.plantId);
                    const progress = this.careProgressFor(plot);
                    const stakeDone = C.stakeNeedMet(progress, p.staked);
                    careBeds.push({
                        plot,
                        progress,
                        allMet: C.allNeedsMet(progress, needs, p.staked || progress.stake),
                        stake: stakeDone,
                    });
                }
                return {
                    careMode: true,
                    careBeds,
                    harvestPlots: this.pendingHarvests.slice(),
                    peakHappiness: this.peak,
                };
            }
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
                    stretchDone: t.stretchDone,
                    stretchSkipped: t.stretchSkipped,
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
        const key = calendarKey(state, now);
        for (const plot of plotIndices || []) {
            const harvestFn = (state.version >= 6 && H.completeCareHarvest)
                ? H.completeCareHarvest.bind(H)
                : H.harvestPlot.bind(H);
            const r = harvestFn(state, plot, key, L.plantById);
            if (r.ok) out.push(r);
        }
        return out;
    }

    function newUnlocksAfterHarvest(state, beforeSeeds) {
        const afterSeeds = unlockedPlants(state);
        const seeds = afterSeeds.filter((id) => !beforeSeeds.includes(id));
        return { seeds };
    }

    /** Short human sentence for a waiting plant (no guilt, nothing wilts). */
    function waitingText(w) {
        if (w.reason === 'grew-today') return `${w.name} already grew today. It will be ready for more tomorrow.`;
        if (w.reason === 'needs-incomplete') return `${w.name} is resting until all of today's needs are met. Nothing is lost.`;
        if (w.reason === 'needs-water') return `${w.name} has its sun but would like more water. Chat a little longer next visit.`;
        if (w.reason === 'out-of-season') return `${w.name} is resting for the season. It keeps its growth.`;
        const have = round1(w.sunBank), need = w.cost;
        return `${w.name} has ${have} of ${need} sun-hours saved up. It keeps them and grows on a sunnier visit.`;
    }

    /** Debug/demo: simulate `days` visits with given quality (0..1), advancing the clock. */
    function simulateDays(state, clock, days, quality) {
        const q = quality === undefined ? 1 : clamp01(quality);
        const out = [];
        for (let i = 0; i < days; i++) {
            clock.nextDay();
            advanceRegrowPlots(state, calendarKey(state, clock.now()));
            let visitOut;
            if (state.version >= 6 && C) {
                const careBeds = [];
                state.plots.forEach((p, plot) => {
                    if (!p || H.isPlotRegrowing(p, clock.today()) || p.picked) return;
                    if (p.stage >= MAX_STAGE) return;
                    const needs = L.plantNeeds(p.plantId);
                    const fill = (n) => (q >= 0.99 ? n : Math.min(n, Math.floor(n * q)));
                    let progress = C.emptyProgress();
                    progress = C.addAutoSun(progress, needs, needs.sun * C.CARE_DOT_SECONDS.sun * q, true);
                    progress.water = fill(needs.water);
                    progress.fertilizer = fill(needs.fertilizer);
                    progress.stake = needs.stake ? (p.staked || q >= 0.99) : false;
                    const allMet = C.allNeedsMet(progress, needs, p.staked);
                    careBeds.push({ plot, progress, allMet, stake: progress.stake });
                });
                visitOut = applyVisit(state, { careMode: true, careBeds }, clock.now());
            } else {
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
                visitOut = applyVisit(state, { beds }, clock.now());
            }
            if (state.version >= 5) {
                const night = goToBed(state, clock.now());
                visitOut.grew = night.grew;
                visitOut.waiting = night.waiting;
            }
            const harvested = [];
            for (const plot of H.readyPlotIndices(state.plots, calendarKey(state, clock.now()))) {
                const h = H.harvestPlot(state, plot, calendarKey(state, clock.now()), L.plantById);
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
        plantInfo, createState, loadState, serializeState, visitCount, calendarKey, isUnlocked, unlockedPlants,
        emptyPlots, plantedCount, matureCount, score, plantSeed, weeklyVisits, visitedToday, applyVisit,
        applyOvernightGrowth, goToBed,
        clampBreaths, BreathPacer, VisitSession, waitingText, simulateDays,
        get chainStretchAfterBreath() { return chainStretchAfterBreath; },
        set chainStretchAfterBreath(v) { chainStretchAfterBreath = !!v; },
        neighborPlot, movePlotSelection, plantedPlotIndices, firstPlantedPlot, perBedStepSeconds, visitBedResults,
        advanceRegrowPlots, applySessionHarvests, newUnlocksAfterHarvest,
    }, {
        isPlotReady: H.isPlotReady,
        isPlotRegrowing: H.isPlotRegrowing,
        readyPlotIndices: H.readyPlotIndices,
        tendablePlotIndices: H.tendablePlotIndices,
        computeYield: H.computeYield,
        harvestPlot: (s, i, now) => H.harvestPlot(s, i, calendarKey(s, now), L.plantById),
        makeAllReady: H.makeAllReady,
        SEED_UNLOCK: H.SEED_UNLOCK,
        HARVEST_HOLD_SECONDS: H.HARVEST_HOLD_SECONDS,
        PLANT_HARVEST: H.PLANT_HARVEST,
        SmileDay: D,
        tendableForState(state, now) {
            if (state.version >= 5) {
                return D.tendablePlotIndicesDay(state, { isPlotReady: H.isPlotReady, isPlotRegrowing: H.isPlotRegrowing, MAX_STAGE });
            }
            const k = dayKey(now instanceof Date ? now : new Date(now));
            return H.tendablePlotIndices(state.plots, k);
        },
        lightingForGardenMinutes(minutes, override) {
            if (override && LIGHTINGS.includes(override)) return override;
            return D.lightingBlend(minutes).primary;
        },
    });
});
