// game/logic.js
//
// Pure game logic for Smile Garden. No DOM, no Electron, no SDK imports, so it
// runs unchanged in Node (node:test) and in the sandboxed renderer (loaded as
// a classic <script>, exposed as window.SmileLogic).
//
// Inputs are already normalized:
//   happiness  0..1  (SDK ExpressionScore.confidence is a percentage 0..100,
//                     https://smartspectra.presagetech.com/docs/data-types.md#expressionscore;
//                     convert with normalizeConfidence())
//   talking    true | false | null   (null = no talking signal available)
//   faceVisible boolean              (false while ValidationCode is NoFaceFound etc.)

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SmileLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // presage.smartspectra.ExpressionType (Data Types page):
    // UNSPECIFIED=0, ANGRY=1, CONTEMPT=2, DISGUST=3, FEAR=4, HAPPY=5, NEUTRAL=6, SAD=7, SURPRISE=8.
    const HAPPY_TYPE = 5;
    const HAPPY_NAME = 'HAPPY';

    const REFERENCE_SESSION_SECONDS = 120;

    const DEFAULTS = Object.freeze({
        sessionSeconds: 120,
        fastSessionSeconds: 50,
        calmSeconds: 60,          // rest before / after for the optional calm check
        fastCalmSeconds: 12,      // mock + fast only
        smileOn: 0.5,             // happiness that starts a smile (and growth)
        smileOff: 0.42,           // hysteresis: smile ends below this
        smoothingTau: 0.25,       // seconds, EMA on raw happiness
        minRate: 0.1,            // plant-units / s right at the threshold (120 s session)
        maxRate: 0.22,            // plant-units / s at a full grin (120 s session)
        plants: 12,
        unlockSpacing: 0.5,       // a new plot sprouts every 0.5 units of total growth
        bloomStreakSec: 2.0,      // a sustained smile this long starts opening buds
        bloomIntervalSec: 1.3,    // ...then one more bud every 1.3 s while it lasts
        visitorStreakSec: 6,      // a long smile attracts an extra butterfly
        laughHappiness: 0.8,      // laugh = happiness >= 0.8 AND talking detected...
        laughHoldSec: 0.35,       // ...for this long
        laughFallbackHappiness: 0.93, // no talking signal: a very big grin...
        laughFallbackHoldSec: 1.0,    // ...held this long counts instead
        laughCooldownSec: 5,
        burstBlooms: 3,           // a sunshine burst opens this many flowers at once
        burstGrowth: 0.8,         // and adds this much growth
        levels: Object.freeze([
            Object.freeze({ key: 'seed',      label: 'Seed',       at: 0 }),
            Object.freeze({ key: 'sprout',    label: 'Sprout',     at: 0.12 }),
            Object.freeze({ key: 'garden',    label: 'Garden',     at: 0.45 }),
            Object.freeze({ key: 'fullBloom', label: 'Full bloom', at: 0.9 }),
        ]),
    });

    const FLOWER_KINDS = Object.freeze(['daisy', 'tulip', 'sunflower', 'poppy', 'bell', 'cosmos']);
    const PETAL_COLORS = Object.freeze(['#ff8fab', '#ffd166', '#f9844a', '#c77dff', '#ff6b6b', '#7bdff2', '#ffffff', '#f4a6ff']);

    function clamp01(x) {
        if (!Number.isFinite(x)) return 0;
        return x < 0 ? 0 : x > 1 ? 1 : x;
    }

    /** SDK confidence percentage [0, 100] -> 0..1. */
    function normalizeConfidence(pct) {
        const n = Number(pct);
        return Number.isFinite(n) ? clamp01(n / 100) : 0;
    }

    /**
     * Happiness 0..1 from one decoded SDK Expression
     * ({ stable, timestamp, scores: [{ type, confidence }] }), or null if the
     * expression carries no HAPPY score. `type` may be the enum number or name.
     */
    function happinessFromExpression(expression) {
        const scores = expression && expression.scores;
        if (!scores || typeof scores.length !== 'number') return null;
        for (const s of scores) {
            if (!s) continue;
            const t = s.type;
            if (t === HAPPY_TYPE || (typeof t === 'string' && t.toUpperCase() === HAPPY_NAME)) {
                return normalizeConfidence(s.confidence);
            }
        }
        return null;
    }

    /** Exponential smoothing with a time constant (frame-rate independent). */
    function smooth(prev, x, dt, tau) {
        if (prev === null || prev === undefined || !Number.isFinite(prev)) return x;
        if (!(tau > 0)) return x;
        const a = 1 - Math.exp(-Math.max(0, dt) / tau);
        return prev + (x - prev) * a;
    }

    function speedFactor(opts) {
        const o = Object.assign({}, DEFAULTS, opts);
        return REFERENCE_SESSION_SECONDS / Math.max(10, o.sessionSeconds);
    }

    /**
     * Growth rate in plant-units per second. 0 below the smile threshold;
     * from minRate at the threshold up to maxRate at a full grin. Shorter
     * sessions grow proportionally faster so full bloom stays reachable.
     */
    function growthRate(happiness, opts) {
        const o = Object.assign({}, DEFAULTS, opts);
        const h = clamp01(happiness);
        if (h < o.smileOn) return 0;
        const intensity = o.smileOn >= 1 ? 1 : (h - o.smileOn) / (1 - o.smileOn);
        return (o.minRate + (o.maxRate - o.minRate) * intensity) * speedFactor(o);
    }

    /** Level for a garden progress 0..1: { index, key, label, at, next, toNext } */
    function levelFor(progress, opts) {
        const o = Object.assign({}, DEFAULTS, opts);
        const p = clamp01(progress);
        let idx = 0;
        for (let i = 0; i < o.levels.length; i++) if (p >= o.levels[i].at) idx = i;
        const lvl = o.levels[idx];
        const next = o.levels[idx + 1] || null;
        const toNext = next ? clamp01((p - lvl.at) / (next.at - lvl.at)) : 1;
        return { index: idx, key: lvl.key, label: lvl.label, at: lvl.at, next: next ? next.key : null, toNext };
    }

    /** Deterministic PRNG so tests and seeded gardens are reproducible. */
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ------------------------------------------------------------------
    // Smile detection with hysteresis
    // ------------------------------------------------------------------
    class SmileDetector {
        constructor(opts) {
            this.o = Object.assign({}, DEFAULTS, opts);
            this.smiling = false;
        }
        update(h) {
            if (this.smiling) { if (h < this.o.smileOff) this.smiling = false; }
            else if (h >= this.o.smileOn) this.smiling = true;
            return this.smiling;
        }
        reset() { this.smiling = false; }
    }

    // ------------------------------------------------------------------
    // Laugh detection: big happiness + talking (mouth moving / sound-free
    // "talking" detection from the SDK). Fallback without a talking signal.
    // ------------------------------------------------------------------
    class LaughDetector {
        constructor(opts) {
            this.o = Object.assign({}, DEFAULTS, opts);
            this.held = 0;
            this.cooldown = 0;
            this.mode = null;
            this.armed = true;     // re-arms once happiness drops below laughHappiness
        }
        /** Returns true exactly once per detected laugh. */
        update(dt, h, talking) {
            const o = this.o;
            this.cooldown = Math.max(0, this.cooldown - dt);
            if (h < o.laughHappiness) this.armed = true;
            let need = Infinity;
            if (talking === true && h >= o.laughHappiness) need = o.laughHoldSec;
            // TODO(sdk): the docs describe Face.talking as "Talking/speech
            // detection status over time" but don't say whether laughing
            // registers as talking. If it doesn't, players only get bursts via
            // this fallback (a very big grin held ~1 s). Tune on real cameras.
            else if (talking !== true && h >= o.laughFallbackHappiness) need = o.laughFallbackHoldSec;
            if (need === Infinity) { this.held = 0; return false; }
            this.held += dt;
            if (this.held >= need && this.cooldown <= 0 && this.armed) {
                this.armed = false;
                this.mode = talking === true ? 'talking' : 'fallback';
                this.held = 0;
                this.cooldown = o.laughCooldownSec;
                return true;
            }
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Streaks and smile time
    // ------------------------------------------------------------------
    class StreakTracker {
        constructor() {
            this.current = 0;
            this.longest = 0;
            this.total = 0;
            this.count = 0;
            this.active = false;
        }
        update(dt, smiling) {
            if (smiling) {
                if (!this.active) { this.active = true; this.count++; this.current = 0; }
                this.current += dt;
                this.total += dt;
                if (this.current > this.longest) this.longest = this.current;
            } else {
                this.active = false;
                this.current = 0;
            }
        }
    }

    // ------------------------------------------------------------------
    // The garden: plots that sprout, grow to a bud, then bloom.
    // ------------------------------------------------------------------
    class Garden {
        constructor(opts) {
            this.o = Object.assign({}, DEFAULTS, opts);
            const rnd = mulberry32(this.o.seed === undefined ? 7 : this.o.seed);
            const n = this.o.plants;
            // Plot order: alternate across the bed so growth looks spread out.
            const slots = [];
            for (let i = 0; i < n; i++) slots.push(i);
            for (let i = slots.length - 1; i > 0; i--) {
                const j = Math.floor(rnd() * (i + 1));
                [slots[i], slots[j]] = [slots[j], slots[i]];
            }
            this.plants = slots.map((slot, i) => ({
                id: i,
                x: (slot + 0.5) / n + (rnd() - 0.5) * 0.4 / n, // 0..1 across the bed
                row: slot % 2,                                   // 0 back, 1 front
                height: 0.75 + rnd() * 0.5,
                kind: FLOWER_KINDS[Math.floor(rnd() * FLOWER_KINDS.length)],
                color: PETAL_COLORS[Math.floor(rnd() * PETAL_COLORS.length)],
                sway: rnd() * Math.PI * 2,
                unlockAt: i * this.o.unlockSpacing,
                growth: 0,      // 0..1 stem -> bud
                bloomed: false,
                bloomedAt: null,
                byBurst: false,
            }));
            this.totalGrowth = 0;
        }
        unlocked() { return this.plants.filter((p) => this.totalGrowth >= p.unlockAt || p.growth > 0); }
        growing() { return this.unlocked().filter((p) => p.growth < 1); }
        buds() { return this.plants.filter((p) => p.growth >= 1 && !p.bloomed); }
        bloomedCount() { return this.plants.filter((p) => p.bloomed).length; }

        /** Spread `units` of growth evenly across plants that are still growing. */
        grow(units) {
            let left = Math.max(0, units);
            let guard = 0;
            const sprouted = [];
            while (left > 1e-9 && guard++ < 50) {
                const before = new Set(this.unlocked().map((p) => p.id));
                const g = this.growing();
                if (!g.length) {
                    if (this.unlocked().length === this.plants.length) break;
                    // Nothing growing yet but locked plots remain: progress unlocks.
                    const nextLocked = this.plants.find((p) => !before.has(p.id));
                    const need = Math.max(0, nextLocked.unlockAt - this.totalGrowth);
                    const use = Math.min(left, need);
                    this.totalGrowth += use;
                    left -= use;
                    if (use === 0) { this.totalGrowth = nextLocked.unlockAt; }
                } else {
                    // Grow until the next unlock or until a plant becomes a bud.
                    const nextLocked = this.plants.find((p) => !before.has(p.id));
                    const toUnlock = nextLocked ? Math.max(1e-6, nextLocked.unlockAt - this.totalGrowth) : Infinity;
                    const minRemaining = Math.min(...g.map((p) => 1 - p.growth));
                    const step = Math.min(left, toUnlock, minRemaining * g.length);
                    const each = step / g.length;
                    for (const p of g) p.growth = Math.min(1, p.growth + each + 1e-12);
                    for (const p of g) if (p.growth > 1 - 1e-9) p.growth = 1;
                    this.totalGrowth += step;
                    left -= step;
                }
                for (const p of this.unlocked()) if (!before.has(p.id)) sprouted.push(p.id);
            }
            return sprouted;
        }

        /** Open the oldest bud. Returns the plant or null. */
        openBud(at, byBurst) {
            const b = this.buds()[0];
            if (!b) return null;
            b.bloomed = true;
            b.bloomedAt = at;
            b.byBurst = !!byBurst;
            return b;
        }

        /**
         * Sunshine burst: add growth, then open up to `count` flowers. If there
         * aren't enough buds, the furthest-along growing plants jump to a bud
         * first so a burst always blooms several flowers (while any remain).
         */
        burst(at, count, growth) {
            this.grow(growth);
            const opened = [];
            for (let i = 0; i < count; i++) {
                if (!this.buds().length) {
                    const candidates = this.plants.filter((p) => p.growth < 1)
                        .sort((a, b) => b.growth - a.growth || a.unlockAt - b.unlockAt);
                    const c = candidates[0];
                    if (!c) break;
                    const add = 1 - c.growth;
                    c.growth = 1;
                    this.totalGrowth = Math.max(this.totalGrowth + add, c.unlockAt);
                }
                const p = this.openBud(at, true);
                if (p) opened.push(p.id);
            }
            return opened;
        }

        /** 0..1: half stem growth, half blooms. */
        progress() {
            const n = this.plants.length;
            if (!n) return 0;
            let g = 0;
            for (const p of this.plants) g += p.growth;
            return clamp01(0.5 * (g / n) + 0.5 * (this.bloomedCount() / n));
        }

        /** Butterflies and bees drawn in the scene, derived from blooms. */
        visitors(streak, opts) {
            const o = Object.assign({}, DEFAULTS, opts);
            const b = this.bloomedCount();
            let butterflies = Math.min(6, Math.floor(b / 2));
            const bees = Math.min(4, Math.floor(b / 3));
            if (b > 0 && streak >= o.visitorStreakSec) butterflies = Math.min(7, butterflies + 1);
            return { butterflies, bees };
        }
    }

    // ------------------------------------------------------------------
    // One play session
    // ------------------------------------------------------------------
    class GardenSession {
        constructor(opts) {
            this.o = Object.assign({}, DEFAULTS, opts);
            this.garden = new Garden(this.o);
            this.smile = new SmileDetector(this.o);
            this.laugh = new LaughDetector(this.o);
            this.streak = new StreakTracker();
            this.elapsed = 0;          // play clock (pauses with no face)
            this.wall = 0;             // real time since start
            this.noFaceTime = 0;
            this.h = null;             // smoothed happiness
            this.bloomTimer = 0;
            this.bursts = 0;
            this.burstLog = [];
            this.peak = 0;
            this.happySum = 0;
            this.happyTime = 0;
            this.level = levelFor(0, this.o);
            this.fullBloomAt = null;
            this.finished = false;
        }

        get duration() { return this.o.sessionSeconds; }
        get remaining() { return Math.max(0, this.o.sessionSeconds - this.elapsed); }

        /**
         * Advance by dt seconds. input: { happiness: 0..1|null, talking: bool|null, faceVisible: bool }.
         * Returns an array of events: sprout, bud-open, burst, level, finished.
         */
        update(dt, input) {
            const events = [];
            if (this.finished || !(dt > 0)) return events;
            const o = this.o;
            const inp = input || {};
            this.wall += dt;
            const faceVisible = inp.faceVisible !== false && inp.happiness !== null && inp.happiness !== undefined;

            if (!faceVisible) {
                // Gentle pause: no growth, no clock, the streak simply ends.
                this.noFaceTime += dt;
                this.smile.reset();
                this.streak.update(dt, false);
                this.laugh.held = 0;
                this.bloomTimer = 0;
                this.paused = true;
                return events;
            }
            this.paused = false;
            this.elapsed += dt;
            this.h = smooth(this.h, clamp01(inp.happiness), dt, o.smoothingTau);
            const h = this.h;
            if (h > this.peak) this.peak = h;

            const smiling = this.smile.update(h);
            this.streak.update(dt, smiling);
            if (smiling) { this.happySum += h * dt; this.happyTime += dt; }

            // Growth (only while smiling; a bigger grin grows faster).
            if (smiling) {
                const rate = growthRate(Math.max(h, o.smileOn), o);
                for (const id of this.garden.grow(rate * dt)) events.push({ type: 'sprout', plant: id });
            }

            // Sustained smile opens buds.
            if (smiling && this.streak.current >= o.bloomStreakSec) {
                this.bloomTimer -= dt;
                if (this.bloomTimer <= 0) {
                    const p = this.garden.openBud(this.elapsed, false);
                    if (p) events.push({ type: 'bloom', plant: p.id });
                    this.bloomTimer = o.bloomIntervalSec;
                }
            } else {
                this.bloomTimer = 0;
            }

            // Laugh -> sunshine burst.
            if (this.laugh.update(dt, h, inp.talking === undefined ? null : inp.talking)) {
                const opened = this.garden.burst(this.elapsed, o.burstBlooms, o.burstGrowth * speedFactor(o));
                this.bursts++;
                this.burstLog.push({ at: this.elapsed, opened: opened.length, mode: this.laugh.mode });
                events.push({ type: 'burst', opened, mode: this.laugh.mode });
            }

            const lvl = levelFor(this.garden.progress(), o);
            if (lvl.index !== this.level.index) {
                if (lvl.index > this.level.index) events.push({ type: 'level', level: lvl.key, label: lvl.label });
                this.level = lvl;
                if (lvl.key === 'fullBloom' && this.fullBloomAt === null) this.fullBloomAt = this.elapsed;
            } else {
                this.level = lvl;
            }

            if (this.elapsed >= o.sessionSeconds) {
                this.finished = true;
                events.push({ type: 'finished' });
            }
            return events;
        }

        isGrowing() { return !this.paused && this.smile.smiling; }

        stats() {
            const g = this.garden;
            const played = Math.max(1e-6, this.elapsed);
            return {
                playedSeconds: this.elapsed,
                smileSeconds: this.streak.total,
                smileShare: clamp01(this.streak.total / played),
                longestStreak: this.streak.longest,
                smileCount: this.streak.count,
                laughBursts: this.bursts,
                flowersBloomed: g.bloomedCount(),
                plants: g.plants.length,
                progress: g.progress(),
                level: levelFor(g.progress(), this.o).key,
                levelLabel: levelFor(g.progress(), this.o).label,
                peakHappiness: this.peak,
                avgSmileHappiness: this.happyTime > 0 ? this.happySum / this.happyTime : 0,
                noFaceSeconds: this.noFaceTime,
                fullBloomAt: this.fullBloomAt,
            };
        }
    }

    /** A friendly, non-judgemental wellness message for the results screen. */
    function wellnessMessage(stats) {
        const s = stats || {};
        if (Number.isFinite(s.plotsFilled)) {
            if (s.plotsFilled > 0 && s.plots > 0 && s.plotsFilled >= s.plots) {
                return 'Your garden is packed! Every plot has something growing. What a sunny session. 🌱';
            }
            if (s.plotsFilled >= 4) {
                return 'Look at that harvest! All that smiling gave your plants a long drink of sunshine. ☀️';
            }
            if (s.plotsFilled >= 1) {
                return 'Your first plants are in. Come back any time to fill a few more plots. 🌱';
            }
            return 'The beds are ready and waiting. A small smile is all the sunshine they need. 🌱';
        }
        if (s.level === 'fullBloom') {
            return 'Your garden is in full bloom! Smiling and laughing can be a lovely little reset. Carry that sunshine into the rest of your day. 🌻';
        }
        if ((s.laughBursts || 0) >= 2) {
            return 'All that laughter brought the sunshine out. A good laugh is a great way to shake off a busy day. ☀️';
        }
        if ((s.smileShare || 0) >= 0.35) {
            return 'Lovely smiling! Your garden is growing nicely. Come back any time to help it bloom. 🌷';
        }
        if ((s.smileSeconds || 0) > 3) {
            return 'Every smile planted a seed. Gardens take their time, and so do we. Thanks for taking a moment for yourself. 🌱';
        }
        return 'Your seeds are resting and ready for next time. No pressure, a small smile is all they need. 🌱';
    }

    // ------------------------------------------------------------------
    // Optional calm check (cardio metrics at rest). Wellness info only.
    // ------------------------------------------------------------------
    function median(xs) {
        if (!xs.length) return null;
        const s = xs.slice().sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }

    /**
     * Summarize one rest window. samples: { pulse: [{t, value, confidence, stable}],
     * hrv: [{t, rmssd, sdnn, meanNn, baevsky, confidence, stable}] }. Only samples
     * flagged `stable` by the SDK and at/after `fromT` count.
     */
    function summarizeCalm(samples, opts) {
        const o = Object.assign({ fromT: -Infinity }, opts);
        const pulse = ((samples && samples.pulse) || [])
            .filter((s) => s && s.stable && Number.isFinite(s.value) && s.t >= o.fromT).map((s) => s.value);
        const hrv = ((samples && samples.hrv) || []).filter((s) => s && s.stable && s.t >= o.fromT);
        const rm = hrv.map((s) => s.rmssd).filter(Number.isFinite);
        const bv = hrv.map((s) => s.baevsky).filter(Number.isFinite);
        return {
            pulse: median(pulse),
            pulseSamples: pulse.length,
            rmssd: median(rm),
            baevsky: median(bv),
            hrvSamples: hrv.length,
        };
    }

    function pct(a, b) {
        if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
        return ((b - a) / Math.abs(a)) * 100;
    }

    /** Compare before/after summaries relative to the player's own baseline. */
    function compareCalm(before, after) {
        const b = before || {}, a = after || {};
        const out = {
            pulse: Number.isFinite(b.pulse) && Number.isFinite(a.pulse) ? { before: b.pulse, after: a.pulse, delta: a.pulse - b.pulse, pct: pct(b.pulse, a.pulse) } : null,
            rmssd: Number.isFinite(b.rmssd) && Number.isFinite(a.rmssd) ? { before: b.rmssd, after: a.rmssd, delta: a.rmssd - b.rmssd, pct: pct(b.rmssd, a.rmssd) } : null,
            baevsky: Number.isFinite(b.baevsky) && Number.isFinite(a.baevsky) ? { before: b.baevsky, after: a.baevsky, delta: a.baevsky - b.baevsky, pct: pct(b.baevsky, a.baevsky) } : null,
        };
        out.enough = !!(out.pulse || out.rmssd || out.baevsky);
        const bits = [];
        if (out.pulse) {
            const d = Math.round(out.pulse.delta);
            bits.push(d < 0 ? `your pulse settled by ${-d} bpm` : d > 0 ? `your pulse was ${d} bpm higher` : 'your pulse was about the same');
        }
        if (out.baevsky && Number.isFinite(out.baevsky.pct)) {
            const p = Math.round(out.baevsky.pct);
            bits.push(p < 0 ? `your stress index dropped ${-p}%` : p > 0 ? `your stress index rose ${p}%` : 'your stress index was unchanged');
        } else if (out.rmssd && Number.isFinite(out.rmssd.pct)) {
            const p = Math.round(out.rmssd.pct);
            bits.push(p > 0 ? `your HRV (RMSSD) rose ${p}%` : p < 0 ? `your HRV (RMSSD) dipped ${-p}%` : 'your HRV was unchanged');
        }
        if (!out.enough) {
            out.message = "We didn't get enough steady readings this time. Sitting still in soft, even light helps. (Wellness info only.)";
        } else {
            const calmer = (out.pulse && out.pulse.delta < -1) || (out.baevsky && out.baevsky.delta < 0) || (out.rmssd && out.rmssd.delta > 0);
            const s = bits.join(' and ');
            out.message = (calmer ? 'You seem more relaxed: ' : 'Compared with your own baseline, ') + s + '. (Wellness info, not a medical measurement.)';
        }
        return out;
    }

    function formatTime(sec) {
        const s = Math.max(0, Math.ceil(sec));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    function formatSeconds(sec) {
        const s = Math.max(0, sec || 0);
        return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} m ${Math.round(s % 60)} s`;
    }


    // ------------------------------------------------------------------
    // Plant collection (Smile Garden prototype v2)
    //
    // Six crops with daily sun-hour needs from university extension sources.
    // In the game, those hours become the sunlight cost (smile-seconds, scaled)
    // to fully grow that plant. Demanding, full-sun crops cost more smiles.
    // ------------------------------------------------------------------
    const GROW_STAGES = Object.freeze([
        Object.freeze({ key: 'seed',    label: 'Seed',    at: 0 }),
        Object.freeze({ key: 'sprout',  label: 'Sprout',  at: 0.12 }),
        Object.freeze({ key: 'young',   label: 'Young',   at: 0.35 }),
        Object.freeze({ key: 'growing', label: 'Growing', at: 0.65 }),
        Object.freeze({ key: 'mature',  label: 'Mature',  at: 1 }),
    ]);

    const PLANTING = Object.freeze({
        plots: 8,
        sunlightScale: 2.5,   // mid-grin ~0.4 sunlight/s in a 120 s session
        laughSunlight: 2.5,   // times speedFactor (not sunlightScale)
        firstPickDelay: 2.2,  // mock/demo: show the picker before auto-planting
        nextPickDelay: 0.7,   // after a plant matures, auto-replant last / next
    });

    const PLANTS = Object.freeze([
        Object.freeze({
            id: 'lettuce', name: 'Lettuce', emoji: '🥬',
            sunHours: 4, sunHoursLabel: '4 hours',
            cost: 4, difficulty: 'easy', difficultyLabel: 'Easy',
            blurb: 'Leafy lettuce is happy with about 4 hours of sun. Keep the soil moist so the leaves stay sweet, not bitter.',
            source: 'https://cals.cornell.edu/school-integrative-plant-science/school-sections/horticulture-section/outreach-and-extension/pandemic-vegetable-gardening/pandemic-vegetable-gardening-2020-archive/sunlight-key-great-vegetables',
            sourceLabel: 'Cornell CALS: leafy crops need about 3–4 hours of sun',
        }),
        Object.freeze({
            id: 'mint', name: 'Mint', emoji: '🌿',
            sunHours: 5, sunHoursLabel: '4–6 hours',
            cost: 5, difficulty: 'easy', difficultyLabel: 'Easy',
            blurb: 'Mint likes 4–6 hours of sun, or a little shade. It spreads, so give it its own plot and keep the soil moist.',
            source: 'https://ipm.ucanr.edu/home-and-landscape/cultural-tips-for-growing-mint/',
            sourceLabel: 'UC IPM: full sun to partial shade, at least 4–6 hours a day',
        }),
        Object.freeze({
            id: 'cucumber', name: 'Cucumber', emoji: '🥒',
            sunHours: 7, sunHoursLabel: '6–8 hours',
            cost: 7, difficulty: 'medium', difficultyLabel: 'Medium',
            blurb: 'Cucumbers want 6–8 hours of direct sun and steady water. Give the vine room to climb.',
            source: 'https://cals.cornell.edu/school-integrative-plant-science/school-sections/horticulture-section/outreach-and-extension/pandemic-vegetable-gardening/pandemic-vegetable-gardening-2021-archive/no-yard-grow-vegetables-and-more-containers',
            sourceLabel: 'Cornell CALS: fruiting crops like cucumbers need 6–8 hours of direct sun',
        }),
        Object.freeze({
            id: 'tomato', name: 'Tomato', emoji: '🍅',
            sunHours: 8, sunHoursLabel: '7–8 hours',
            cost: 8, difficulty: 'medium', difficultyLabel: 'Medium',
            blurb: 'Tomatoes are sun lovers: 7–8 hours if you can. Warmth and regular water help the fruit ripen.',
            source: 'https://cals.cornell.edu/school-integrative-plant-science/school-sections/horticulture-section/outreach-and-extension/pandemic-vegetable-gardening/pandemic-vegetable-gardening-2020-archive/sunlight-key-great-vegetables',
            sourceLabel: 'Cornell CALS: fruiting crops like tomatoes need 7–8 hours of sun',
        }),
        Object.freeze({
            id: 'sunflower', name: 'Sunflower', emoji: '🌻',
            sunHours: 8, sunHoursLabel: '6–8+ hours',
            cost: 10, difficulty: 'hard', difficultyLabel: 'Hard',
            blurb: 'Sunflowers thrive in full sun, 6–8 hours or more. Plant them where they can stretch tall and drink the light.',
            source: 'https://extension.oregonstate.edu/catalog/em-9866-grow-your-own-sunflowers',
            sourceLabel: 'Oregon State Extension: full sun, 6–8+ hours per day',
        }),
        Object.freeze({
            id: 'apple', name: 'Apple tree', emoji: '🍎',
            sunHours: 8, sunHoursLabel: '8 hours',
            cost: 12, difficulty: 'hard', difficultyLabel: 'Hard',
            blurb: 'Apple trees need a full 8 hours of sun. A tree takes patience — more smiles to reach the fruit.',
            source: 'https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/growing-apples',
            sourceLabel: 'University of Minnesota Extension: at least 8 hours of sun per day',
        }),
    ]);

    const PLANTS_BY_ID = Object.freeze(Object.fromEntries(PLANTS.map((p) => [p.id, p])));

    function plantById(id) {
        return PLANTS_BY_ID[id] || null;
    }

    /** Stage for a 0..1 fill: { index, key, label, at, next, toNext, progress }. */
    function stageFor(progress) {
        const p = clamp01(progress);
        let idx = 0;
        for (let i = 0; i < GROW_STAGES.length; i++) {
            if (p + 1e-12 >= GROW_STAGES[i].at) idx = i;
        }
        // Mature only at a full fill.
        if (p < 1 && GROW_STAGES[idx].key === 'mature') idx = GROW_STAGES.length - 2;
        const st = GROW_STAGES[idx];
        const next = GROW_STAGES[idx + 1] || null;
        const toNext = next ? clamp01((p - st.at) / (next.at - st.at)) : 1;
        return { index: idx, key: st.key, label: st.label, at: st.at, next: next ? next.key : null, toNext, progress: p };
    }

    /**
     * Sunlight per second while smiling. Same 0.5 / 0.42 hysteresis thresholds
     * as growthRate; scaled so a mid grin fills a lettuce in about 10 s
     * (120 s session). Shorter (fast) sessions generate sunlight faster.
     */
    function sunlightRate(happiness, opts) {
        const o = Object.assign({}, PLANTING, opts);
        return growthRate(happiness, opts) * o.sunlightScale;
    }

    function laughSunlightBonus(opts) {
        const o = Object.assign({}, DEFAULTS, PLANTING, opts);
        return o.laughSunlight * speedFactor(o);
    }

    /** Score is simply the number of plots filled (mature plants). */
    function scorePlots(grownOrCount) {
        if (typeof grownOrCount === 'number') return Math.max(0, Math.floor(grownOrCount));
        if (Array.isArray(grownOrCount)) return grownOrCount.length;
        if (grownOrCount && typeof grownOrCount.filledCount === 'function') return grownOrCount.filledCount();
        return 0;
    }

    // ------------------------------------------------------------------
    // A bed of empty plots the player fills with chosen plants
    // ------------------------------------------------------------------
    class PlotGarden {
        constructor(opts) {
            this.o = Object.assign({}, DEFAULTS, PLANTING, opts);
            const rnd = mulberry32(this.o.seed === undefined ? 7 : this.o.seed);
            const n = this.o.plots;
            const slots = [];
            for (let i = 0; i < n; i++) slots.push(i);
            for (let i = slots.length - 1; i > 0; i--) {
                const j = Math.floor(rnd() * (i + 1));
                [slots[i], slots[j]] = [slots[j], slots[i]];
            }
            this.plots = slots.map((slot, i) => ({
                id: i,
                x: (slot + 0.5) / n + (rnd() - 0.5) * 0.28 / n,
                row: slot % 2,
                height: 0.8 + rnd() * 0.35,
                sway: rnd() * Math.PI * 2,
                plantId: null,
                sunlight: 0,
                cost: 0,
                grown: false,
                grownAt: null,
            }));
            this.selected = null;
            this.lastPlantId = null;
            this.totalSunlight = 0;
            this.wastedSunlight = 0;
        }

        plot(id) { return this.plots[id] || null; }
        empty() { return this.plots.filter((p) => !p.plantId); }
        filled() { return this.plots.filter((p) => p.grown); }
        filledCount() { return this.filled().length; }
        isFull() { return this.filledCount() === this.plots.length; }
        current() { return this.selected == null ? null : this.plots[this.selected]; }

        fillRatio(p) {
            if (!p || !p.plantId || !(p.cost > 0)) return 0;
            return clamp01(p.sunlight / p.cost);
        }
        stageOf(p) { return p && p.plantId ? stageFor(this.fillRatio(p)) : null; }

        plantAt(plotId, plantId) {
            const plot = this.plots[plotId];
            const kind = plantById(plantId);
            if (!plot || !kind || plot.plantId) return null;
            plot.plantId = kind.id;
            plot.sunlight = 0;
            plot.cost = kind.cost;
            plot.grown = false;
            plot.grownAt = null;
            this.selected = plot.id;
            this.lastPlantId = kind.id;
            return plot;
        }

        plantNext(plantId) {
            const empty = this.plots.find((p) => !p.plantId);
            if (!empty) return null;
            return this.plantAt(empty.id, plantId);
        }

        /**
         * Pour sunlight into the selected growing plant.
         * Returns events: {type:'stage'} and/or {type:'grown'}.
         */
        addSunlight(units, at) {
            const events = [];
            const u = Math.max(0, units);
            if (!(u > 0)) return events;
            this.totalSunlight += u;
            const p = this.current();
            if (!p || !p.plantId || p.grown) {
                this.wastedSunlight += u;
                return events;
            }
            const before = stageFor(this.fillRatio(p));
            p.sunlight = Math.min(p.cost, p.sunlight + u);
            const after = stageFor(this.fillRatio(p));
            if (after.key !== before.key) {
                events.push({ type: 'stage', plot: p.id, plantId: p.plantId, stage: after.key, label: after.label });
            }
            if (!p.grown && p.sunlight >= p.cost - 1e-9) {
                p.sunlight = p.cost;
                p.grown = true;
                p.grownAt = at;
                this.selected = null;
                events.push({ type: 'grown', plot: p.id, plantId: p.plantId });
            }
            return events;
        }

        byType() {
            const out = {};
            for (const kind of PLANTS) out[kind.id] = 0;
            for (const p of this.plots) if (p.grown && p.plantId) out[p.plantId] = (out[p.plantId] || 0) + 1;
            return out;
        }

        /** 0..1: filled plots, plus partial credit for the plant now growing. */
        progress() {
            const n = this.plots.length;
            if (!n) return 0;
            let s = 0;
            for (const p of this.plots) s += this.fillRatio(p);
            return clamp01(s / n);
        }

        visitors(streak, opts) {
            const o = Object.assign({}, DEFAULTS, opts);
            const b = this.filledCount();
            let butterflies = Math.min(6, Math.floor(b / 2));
            const bees = Math.min(4, Math.floor(b / 3));
            if (b > 0 && streak >= o.visitorStreakSec) butterflies = Math.min(7, butterflies + 1);
            return { butterflies, bees };
        }
    }

    // ------------------------------------------------------------------
    // Play session for the plant-collection garden
    // ------------------------------------------------------------------
    class PlantingSession {
        constructor(opts) {
            this.o = Object.assign({}, DEFAULTS, PLANTING, opts);
            this.garden = new PlotGarden(this.o);
            this.smile = new SmileDetector(this.o);
            this.laugh = new LaughDetector(this.o);
            this.streak = new StreakTracker();
            this.elapsed = 0;
            this.wall = 0;
            this.noFaceTime = 0;
            this.h = null;
            this.bursts = 0;
            this.burstLog = [];
            this.peak = 0;
            this.happySum = 0;
            this.happyTime = 0;
            this.finished = false;
            this.paused = false;
            this.pickerOpen = true;
            this.awaitingPick = 0;
            this.autoPick = !!this.o.autoPick;
            this.pickQueue = this.o.pickQueue ? this.o.pickQueue.slice() : PLANTS.map((p) => p.id);
            this.pickIndex = 0;
            this.firstPickDelay = this.o.firstPickDelay;
            this.nextPickDelay = this.o.nextPickDelay;
        }

        get duration() { return this.o.sessionSeconds; }
        get remaining() { return Math.max(0, this.o.sessionSeconds - this.elapsed); }

        /**
         * Plant a crop in the next empty plot. If something is already growing,
         * this only queues that type as the next auto-pick (lastPlantId).
         * Returns a 'planted' or 'queued' event, or null.
         */
        pick(plantId) {
            if (this.finished) return null;
            if (this.garden.isFull()) return null;
            const kind = plantById(plantId);
            if (!kind) return null;
            const cur = this.garden.current();
            if (cur && cur.plantId && !cur.grown) {
                this.garden.lastPlantId = kind.id;
                return { type: 'queued', plantId: kind.id };
            }
            const plot = this.garden.plantNext(kind.id);
            if (!plot) return null;
            this.pickerOpen = false;
            this.awaitingPick = 0;
            return { type: 'planted', plot: plot.id, plantId: kind.id };
        }

        maybeAutoPick() {
            if (!this.pickerOpen || this.finished || this.garden.isFull()) return null;
            const hasLast = !!this.garden.lastPlantId;
            const canAuto = this.autoPick || hasLast;
            if (!canAuto) return null;
            const delay = hasLast ? this.nextPickDelay : this.firstPickDelay;
            if (this.awaitingPick < delay) return null;
            let id;
            if (this.autoPick && this.pickQueue.length) {
                id = this.pickQueue[this.pickIndex % this.pickQueue.length];
                this.pickIndex++;
            } else {
                id = this.garden.lastPlantId || 'lettuce';
            }
            return this.pick(id);
        }

        update(dt, input) {
            const events = [];
            if (this.finished || !(dt > 0)) return events;
            const o = this.o;
            const inp = input || {};
            this.wall += dt;
            const faceVisible = inp.faceVisible !== false && inp.happiness !== null && inp.happiness !== undefined;

            if (!faceVisible) {
                this.noFaceTime += dt;
                this.smile.reset();
                this.streak.update(dt, false);
                this.laugh.held = 0;
                this.paused = true;
                return events;
            }
            this.paused = false;
            this.elapsed += dt;
            this.h = smooth(this.h, clamp01(inp.happiness), dt, o.smoothingTau);
            const h = this.h;
            if (h > this.peak) this.peak = h;

            const smiling = this.smile.update(h);
            this.streak.update(dt, smiling);
            if (smiling) { this.happySum += h * dt; this.happyTime += dt; }

            if (this.pickerOpen) {
                this.awaitingPick += dt;
                const auto = this.maybeAutoPick();
                if (auto) events.push(auto);
            }

            if (smiling) {
                const rate = sunlightRate(Math.max(h, o.smileOn), o);
                events.push(...this.garden.addSunlight(rate * dt, this.elapsed));
            }

            if (this.laugh.update(dt, h, inp.talking === undefined ? null : inp.talking)) {
                const bonus = laughSunlightBonus(o);
                const sunEvents = this.garden.addSunlight(bonus, this.elapsed);
                this.bursts++;
                this.burstLog.push({ at: this.elapsed, bonus, mode: this.laugh.mode });
                events.push({ type: 'burst', bonus, mode: this.laugh.mode, opened: sunEvents.filter((e) => e.type === 'grown').map((e) => e.plot) });
                events.push(...sunEvents);
            }

            for (const e of events) {
                if (e.type === 'grown') {
                    if (this.garden.isFull()) {
                        this.pickerOpen = false;
                    } else {
                        this.pickerOpen = true;
                        this.awaitingPick = 0;
                        events.push({ type: 'need-pick' });
                    }
                }
            }

            if (this.elapsed + 1e-9 >= o.sessionSeconds) {
                this.finished = true;
                events.push({ type: 'finished' });
            }
            return events;
        }

        isGrowing() {
            const cur = this.garden.current();
            return !this.paused && this.smile.smiling && cur && cur.plantId && !cur.grown;
        }

        stats() {
            const g = this.garden;
            const played = Math.max(1e-6, this.elapsed);
            const plotsFilled = g.filledCount();
            return {
                playedSeconds: this.elapsed,
                smileSeconds: this.streak.total,
                smileShare: clamp01(this.streak.total / played),
                longestStreak: this.streak.longest,
                smileCount: this.streak.count,
                laughBursts: this.bursts,
                plotsFilled,
                plots: g.plots.length,
                score: scorePlots(plotsFilled),
                byType: g.byType(),
                totalSunlight: g.totalSunlight,
                wastedSunlight: g.wastedSunlight,
                progress: g.progress(),
                peakHappiness: this.peak,
                avgSmileHappiness: this.happyTime > 0 ? this.happySum / this.happyTime : 0,
                noFaceSeconds: this.noFaceTime,
                // Kept so older UI helpers can still format a headline.
                plants: g.plots.length,
                flowersBloomed: plotsFilled,
                level: plotsFilled >= g.plots.length ? 'fullBloom' : plotsFilled >= 4 ? 'garden' : plotsFilled >= 1 ? 'sprout' : 'seed',
                levelLabel: plotsFilled >= g.plots.length ? 'Garden full' : plotsFilled >= 4 ? 'Growing garden' : plotsFilled >= 1 ? 'First plants' : 'Empty beds',
            };
        }
    }



    // ------------------------------------------------------------------
    // Rolling smile-signal trace (for the live chart). Pure data, no canvas.
    // ------------------------------------------------------------------
    class SmileTrace {
        /**
         * Fixed-size ring buffer of happiness samples over a sliding window
         * (default 10 s). Each sample: { t, h, face, talking, smiling }.
         * `h` is null when the face is missing so the chart can draw a gap.
         */
        constructor(opts) {
            const o = Object.assign({ windowSec: 10, capacity: 480 }, opts);
            this.windowSec = o.windowSec > 0 ? o.windowSec : 10;
            this.capacity = Math.max(8, o.capacity | 0);
            this.buf = new Array(this.capacity);
            this.head = 0;
            this.size = 0;
            this.laughs = [];
        }

        push(sample) {
            const s = sample || {};
            const face = s.faceVisible !== false && s.happiness !== null && s.happiness !== undefined;
            const rec = {
                t: Number(s.t) || 0,
                h: face ? clamp01(s.happiness) : null,
                face: !!face,
                talking: !!s.talking,
                smiling: !!s.smiling,
            };
            this.buf[this.head] = rec;
            this.head = (this.head + 1) % this.capacity;
            if (this.size < this.capacity) this.size++;
            if (s.laugh || s.burst) this.markLaugh(rec.t);
            return rec;
        }

        markLaugh(t) {
            const n = Number(t);
            if (!Number.isFinite(n)) return;
            const last = this.laughs[this.laughs.length - 1];
            if (last !== undefined && Math.abs(last - n) < 1e-4) return;
            this.laughs.push(n);
        }

        /** Samples in (now - window, now], oldest first. Also prunes old laugh marks. */
        samples(now) {
            const t1 = Number(now);
            const t0 = t1 - this.windowSec;
            const out = [];
            if (!this.size || !Number.isFinite(t1)) return out;
            const start = (this.head - this.size + this.capacity) % this.capacity;
            for (let i = 0; i < this.size; i++) {
                const s = this.buf[(start + i) % this.capacity];
                if (s && s.t > t0 && s.t <= t1 + 1e-9) out.push(s);
            }
            this.laughs = this.laughs.filter((t) => t > t0 - 0.05 && t <= t1 + 0.05);
            return out;
        }

        laughMarks(now) {
            const t1 = Number(now);
            const t0 = t1 - this.windowSec;
            return this.laughs.filter((t) => t > t0 && t <= t1 + 1e-9);
        }

        clear() {
            this.head = 0;
            this.size = 0;
            this.laughs = [];
        }
    }


    return {
        DEFAULTS,
        HAPPY_TYPE,
        FLOWER_KINDS,
        PLANTS,
        PLANTS_BY_ID,
        PLANTING,
        GROW_STAGES,
        clamp01,
        normalizeConfidence,
        happinessFromExpression,
        smooth,
        speedFactor,
        growthRate,
        sunlightRate,
        laughSunlightBonus,
        levelFor,
        stageFor,
        plantById,
        scorePlots,
        mulberry32,
        SmileDetector,
        LaughDetector,
        StreakTracker,
        Garden,
        GardenSession,
        PlotGarden,
        PlantingSession,
        SmileTrace,
        wellnessMessage,
        median,
        summarizeCalm,
        compareCalm,
        formatTime,
        formatSeconds,
    };
});
