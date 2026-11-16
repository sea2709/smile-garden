// node:test suite for game/logic.js (pure logic, no DOM/SDK).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../game/logic.js');

const DT = 1 / 30;
function run(session, seconds, input) {
    const events = [];
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
        const inp = typeof input === 'function' ? input(i * DT) : input;
        events.push(...session.update(DT, inp));
    }
    return events;
}
const face = (h, talking) => ({ happiness: h, talking: talking === undefined ? false : talking, faceVisible: true });

test('normalizeConfidence converts SDK percentages to 0..1 and clamps', () => {
    assert.equal(L.normalizeConfidence(0), 0);
    assert.equal(L.normalizeConfidence(50), 0.5);
    assert.equal(L.normalizeConfidence(100), 1);
    assert.equal(L.normalizeConfidence(140), 1);
    assert.equal(L.normalizeConfidence(-3), 0);
    assert.equal(L.normalizeConfidence('nope'), 0);
});

test('happinessFromExpression picks the HAPPY score (enum number or name)', () => {
    assert.equal(L.happinessFromExpression({ scores: [{ type: 6, confidence: 20 }, { type: 5, confidence: 82 }] }), 0.82);
    assert.equal(L.happinessFromExpression({ scores: [{ type: 'HAPPY', confidence: 40 }] }), 0.4);
    assert.equal(L.happinessFromExpression({ scores: [{ type: 7, confidence: 90 }] }), null);
    assert.equal(L.happinessFromExpression(null), null);
});

test('growthRate: zero below threshold, grows with a bigger grin', () => {
    assert.equal(L.growthRate(0), 0);
    assert.equal(L.growthRate(0.49), 0);
    const atThr = L.growthRate(0.5);
    const mid = L.growthRate(0.75);
    const full = L.growthRate(1);
    assert.ok(atThr > 0);
    assert.ok(mid > atThr && full > mid);
    assert.ok(Math.abs(atThr - L.DEFAULTS.minRate) < 1e-9);
    assert.ok(Math.abs(full - L.DEFAULTS.maxRate) < 1e-9);
});

test('growthRate scales up for shorter sessions so full bloom stays reachable', () => {
    const normal = L.growthRate(0.8, { sessionSeconds: 120 });
    const fast = L.growthRate(0.8, { sessionSeconds: 60 });
    assert.ok(Math.abs(fast - normal * 2) < 1e-9);
});

test('levelFor maps progress to seed / sprout / garden / full bloom', () => {
    assert.equal(L.levelFor(0).key, 'seed');
    assert.equal(L.levelFor(0.11).key, 'seed');
    assert.equal(L.levelFor(0.12).key, 'sprout');
    assert.equal(L.levelFor(0.5).key, 'garden');
    assert.equal(L.levelFor(0.9).key, 'fullBloom');
    assert.equal(L.levelFor(1).next, null);
    const l = L.levelFor(0.285);
    assert.equal(l.key, 'sprout');
    assert.ok(l.toNext > 0.45 && l.toNext < 0.55);
});

test('SmileDetector uses hysteresis', () => {
    const d = new L.SmileDetector();
    assert.equal(d.update(0.45), false);
    assert.equal(d.update(0.5), true);
    assert.equal(d.update(0.45), true);   // still smiling above smileOff
    assert.equal(d.update(0.4), false);
});

test('no growth without a smile, and no punishment when the smile stops', () => {
    const s = new L.GardenSession({ seed: 1 });
    run(s, 5, face(0.2));
    assert.equal(s.garden.totalGrowth, 0);
    run(s, 10, face(0.8));
    run(s, 1, face(0.1)); // let the smoothed happiness settle below the threshold
    const grown = s.garden.totalGrowth;
    const bloomed = s.garden.bloomedCount();
    assert.ok(grown > 0);
    run(s, 9, face(0.1));
    assert.equal(s.garden.totalGrowth, grown, 'growth pauses, never shrinks');
    assert.equal(s.garden.bloomedCount(), bloomed, 'flowers stay open');
});

test('a bigger grin grows the garden faster', () => {
    const a = new L.GardenSession({ seed: 2 });
    const b = new L.GardenSession({ seed: 2 });
    run(a, 8, face(0.6));
    run(b, 8, face(0.95, false));
    assert.ok(b.garden.totalGrowth > a.garden.totalGrowth * 1.3);
});

test('buds only open after a sustained smile, then one per interval', () => {
    const g = new L.Garden({ seed: 4 });
    g.grow(6);
    assert.ok(g.buds().length >= 2, 'some plants reached the bud stage');
    const s = new L.GardenSession({ seed: 4 });
    s.garden = g;
    // Short smiles (1.5 s) never reach bloomStreakSec (2 s).
    for (let i = 0; i < 4; i++) { run(s, 1.5, face(0.7)); run(s, 1, face(0.1)); }
    assert.equal(g.bloomedCount(), 0);
    const ev = run(s, 2.0 + L.DEFAULTS.bloomIntervalSec * 1.5, face(0.7));
    const blooms = ev.filter((e) => e.type === 'bloom').length;
    assert.ok(blooms >= 2 && blooms <= 3, `expected 2-3 blooms, got ${blooms}`);
});

test('LaughDetector: happiness + talking triggers once, with cooldown and re-arm', () => {
    const d = new L.LaughDetector();
    let n = 0;
    for (let i = 0; i < 30; i++) if (d.update(DT, 0.9, true)) n++; // 1 s of laughing
    assert.equal(n, 1);
    assert.equal(d.mode, 'talking');
    // Still laughing after the cooldown: needs a dip first (re-arm).
    for (let i = 0; i < 200; i++) if (d.update(DT, 0.9, true)) n++;
    assert.equal(n, 1);
    for (let i = 0; i < 5; i++) d.update(DT, 0.3, false);
    for (let i = 0; i < 30; i++) if (d.update(DT, 0.9, true)) n++;
    assert.equal(n, 2);
});

test('LaughDetector: talking alone or a modest smile is not a laugh', () => {
    const d = new L.LaughDetector();
    let n = 0;
    for (let i = 0; i < 300; i++) if (d.update(DT, 0.3, true)) n++;   // just talking
    for (let i = 0; i < 300; i++) if (d.update(DT, 0.85, false)) n++; // big smile, silent
    assert.equal(n, 0);
});

test('LaughDetector: fallback without talking signal needs a very big grin held longer', () => {
    const d = new L.LaughDetector();
    let n = 0;
    for (let i = 0; i < 20; i++) if (d.update(DT, 0.96, null)) n++; // 0.67 s
    assert.equal(n, 0);
    for (let i = 0; i < 15; i++) if (d.update(DT, 0.96, null)) n++; // > 1 s total
    assert.equal(n, 1);
    assert.equal(d.mode, 'fallback');
});

test('sunshine burst blooms several flowers at once and counts in stats', () => {
    const s = new L.GardenSession({ seed: 9 });
    run(s, 1, face(0.7));
    const ev = run(s, 1.5, (t) => face(t < 0.3 ? 0.8 : 0.95, true));
    const bursts = ev.filter((e) => e.type === 'burst');
    assert.equal(bursts.length, 1);
    assert.equal(bursts[0].opened.length, L.DEFAULTS.burstBlooms);
    assert.ok(s.garden.bloomedCount() >= L.DEFAULTS.burstBlooms);
    assert.equal(s.stats().laughBursts, 1);
});

test('Garden.burst never exceeds the number of plants', () => {
    const g = new L.Garden({ seed: 1, plants: 4 });
    for (let i = 0; i < 5; i++) g.burst(i, 3, 0.5);
    assert.equal(g.bloomedCount(), 4);
    assert.equal(g.progress(), 1);
});

test('Garden.grow unlocks plots progressively and keeps growth in range', () => {
    const g = new L.Garden({ seed: 3 });
    assert.equal(g.unlocked().length, 1);
    g.grow(1.2);
    assert.ok(g.unlocked().length >= 3);
    g.grow(100);
    assert.equal(g.unlocked().length, g.plants.length);
    for (const p of g.plants) assert.ok(p.growth >= 0 && p.growth <= 1);
    assert.equal(g.buds().length, g.plants.length);
});

test('streaks: longest streak, total smile time and smile count', () => {
    const s = new L.GardenSession({ seed: 1 });
    run(s, 3, face(0.7));
    run(s, 2, face(0.1));
    run(s, 6, face(0.7));
    run(s, 1, face(0.1));
    const st = s.stats();
    assert.ok(Math.abs(st.longestStreak - 6) < 0.4, `longest ${st.longestStreak}`);
    assert.ok(Math.abs(st.smileSeconds - 9) < 0.6, `total ${st.smileSeconds}`);
    assert.equal(st.smileCount, 2);
    assert.ok(st.smileShare > 0.65 && st.smileShare < 0.8);
});

test('no face: growth and the clock pause gently, streak ends', () => {
    const s = new L.GardenSession({ seed: 1 });
    run(s, 3, face(0.8));
    const g = s.garden.totalGrowth, el = s.elapsed;
    run(s, 4, { happiness: null, talking: null, faceVisible: false });
    assert.equal(s.garden.totalGrowth, g);
    assert.equal(s.elapsed, el);
    assert.equal(s.paused, true);
    assert.equal(s.streak.current, 0);
    assert.ok(s.stats().noFaceSeconds > 3.9);
    run(s, 1, face(0.8));
    assert.equal(s.paused, false);
    assert.ok(s.garden.totalGrowth > g);
});

test('session finishes after sessionSeconds of play and reports stats', () => {
    const s = new L.GardenSession({ sessionSeconds: 30, seed: 2 });
    const ev = run(s, 31, (t) => face(t % 6 < 4 ? 0.85 : 0.1));
    assert.ok(ev.some((e) => e.type === 'finished'));
    assert.equal(s.finished, true);
    assert.deepEqual(s.update(DT, face(1)), []);
    const st = s.stats();
    assert.ok(st.playedSeconds >= 30 && st.playedSeconds < 30.1);
    for (const k of ['smileSeconds', 'longestStreak', 'laughBursts', 'flowersBloomed', 'progress', 'level']) assert.ok(k in st, k);
});

test('a cheerful 2-minute session can reach full bloom; a neutral one stays a seed', () => {
    const happy = new L.GardenSession({ seed: 6 });
    run(happy, 120, (t) => face(t % 10 < 7 ? 0.82 : 0.15));
    assert.equal(happy.stats().level, 'fullBloom');
    const neutral = new L.GardenSession({ seed: 6 });
    run(neutral, 120, face(0.2));
    assert.equal(neutral.stats().level, 'seed');
    assert.equal(neutral.stats().flowersBloomed, 0);
});

test('level events fire in order while growing', () => {
    const s = new L.GardenSession({ seed: 8 });
    const ev = run(s, 120, face(0.85));
    const levels = ev.filter((e) => e.type === 'level').map((e) => e.level);
    assert.deepEqual(levels, ['sprout', 'garden', 'fullBloom']);
    assert.ok(s.stats().fullBloomAt > 0);
});

test('visitors: butterflies and bees come with blooms; long smiles add one', () => {
    const g = new L.Garden({ seed: 1 });
    assert.deepEqual(g.visitors(0), { butterflies: 0, bees: 0 });
    g.grow(100);
    for (let i = 0; i < 6; i++) g.openBud(0);
    assert.deepEqual(g.visitors(0), { butterflies: 3, bees: 2 });
    assert.equal(g.visitors(10).butterflies, 4);
});

test('wellnessMessage is friendly for every outcome', () => {
    for (const s of [{ level: 'fullBloom' }, { laughBursts: 3 }, { smileShare: 0.5 }, { smileSeconds: 10 }, {}]) {
        const m = L.wellnessMessage(s);
        assert.ok(typeof m === 'string' && m.length > 20);
        assert.doesNotMatch(m, /fail|bad|poor|lose/i);
    }
});

test('summarizeCalm uses only stable samples after fromT', () => {
    const sum = L.summarizeCalm({
        pulse: [
            { t: 1, value: 95, stable: true },   // before fromT
            { t: 5, value: 70, stable: false },  // not stable
            { t: 6, value: 78, stable: true },
            { t: 7, value: 80, stable: true },
            { t: 8, value: 79, stable: true },
        ],
        hrv: [
            { t: 6, rmssd: 30, baevsky: 150, stable: false },
            { t: 7, rmssd: 40, baevsky: 140, stable: true },
        ],
    }, { fromT: 3 });
    assert.equal(sum.pulse, 79);
    assert.equal(sum.pulseSamples, 3);
    assert.equal(sum.rmssd, 40);
    assert.equal(sum.baevsky, 140);
    assert.equal(L.summarizeCalm({}, {}).pulse, null);
});

test('compareCalm reports change relative to the player baseline', () => {
    const cmp = L.compareCalm({ pulse: 80, rmssd: 38, baevsky: 140 }, { pulse: 74, rmssd: 45, baevsky: 112 });
    assert.equal(cmp.enough, true);
    assert.equal(cmp.pulse.delta, -6);
    assert.equal(Math.round(cmp.baevsky.pct), -20);
    assert.match(cmp.message, /more relaxed/);
    assert.match(cmp.message, /settled by 6 bpm/);
    assert.match(cmp.message, /not a medical/);
    const none = L.compareCalm({ pulse: null }, { pulse: 70 });
    assert.equal(none.enough, false);
    assert.match(none.message, /enough steady readings/);
});

test('formatTime / formatSeconds', () => {
    assert.equal(L.formatTime(120), '2:00');
    assert.equal(L.formatTime(59.2), '1:00');
    assert.equal(L.formatTime(-1), '0:00');
    assert.equal(L.formatSeconds(4.25), '4.3 s');
    assert.equal(L.formatSeconds(75), '1 m 15 s');
});

// ---------------------------------------------------------------------------
// Plant collection, sunlight economy, growth stages, scoring
// ---------------------------------------------------------------------------

test('PLANTS catalog has six crops with sun hours, cost and a source', () => {
    assert.equal(L.PLANTS.length, 6);
    const ids = L.PLANTS.map((p) => p.id);
    assert.deepEqual(ids, ['lettuce', 'mint', 'cucumber', 'tomato', 'sunflower', 'apple']);
    for (const p of L.PLANTS) {
        assert.ok(p.cost > 0 && p.sunHours > 0, p.id);
        assert.ok(typeof p.blurb === 'string' && p.blurb.length > 20, p.id);
        assert.ok(/^https:\/\//.test(p.source), p.id);
        assert.ok(L.plantById(p.id) === p);
    }
    assert.equal(L.plantById('nope'), null);
    // Easy plants are cheaper than hard, full-sun ones.
    assert.ok(L.plantById('lettuce').cost < L.plantById('tomato').cost);
    assert.ok(L.plantById('tomato').cost < L.plantById('sunflower').cost);
    assert.ok(L.plantById('sunflower').cost < L.plantById('apple').cost);
    assert.equal(L.plantById('lettuce').difficulty, 'easy');
    assert.equal(L.plantById('apple').difficulty, 'hard');
});

test('sunlightRate is zero below the smile threshold and rises with a bigger grin', () => {
    assert.equal(L.sunlightRate(0), 0);
    assert.equal(L.sunlightRate(0.49), 0);
    const atThr = L.sunlightRate(0.5);
    const mid = L.sunlightRate(0.75);
    const full = L.sunlightRate(1);
    assert.ok(atThr > 0);
    assert.ok(mid > atThr && full > mid);
    assert.ok(Math.abs(atThr - L.DEFAULTS.minRate * L.PLANTING.sunlightScale) < 1e-9);
    const normal = L.sunlightRate(0.8, { sessionSeconds: 120 });
    const fast = L.sunlightRate(0.8, { sessionSeconds: 60 });
    assert.ok(Math.abs(fast - normal * 2) < 1e-9);
});

test('stageFor maps fill progress to seed / sprout / young / growing / mature', () => {
    assert.equal(L.stageFor(0).key, 'seed');
    assert.equal(L.stageFor(0.11).key, 'seed');
    assert.equal(L.stageFor(0.12).key, 'sprout');
    assert.equal(L.stageFor(0.4).key, 'young');
    assert.equal(L.stageFor(0.7).key, 'growing');
    assert.equal(L.stageFor(0.99).key, 'growing');
    assert.equal(L.stageFor(1).key, 'mature');
    assert.equal(L.stageFor(1).next, null);
});

test('PlotGarden plants in empty plots and grows through stages on sunlight', () => {
    const g = new L.PlotGarden({ seed: 1, plots: 8 });
    assert.equal(g.plots.length, 8);
    assert.equal(g.empty().length, 8);
    assert.equal(g.plantAt(0, 'nope'), null);
    const p = g.plantNext('lettuce');
    assert.ok(p);
    assert.equal(p.plantId, 'lettuce');
    assert.equal(p.cost, L.plantById('lettuce').cost);
    assert.equal(g.current().id, p.id);
    assert.equal(g.plantAt(p.id, 'mint'), null, 'cannot plant on an occupied plot');

    const ev1 = g.addSunlight(p.cost * 0.2, 1);
    assert.equal(g.stageOf(p).key, 'sprout');
    assert.ok(ev1.some((e) => e.type === 'stage' && e.stage === 'sprout'));

    const ev2 = g.addSunlight(p.cost, 2); // enough to finish
    assert.equal(p.grown, true);
    assert.equal(p.sunlight, p.cost);
    assert.equal(g.current(), null);
    assert.equal(g.filledCount(), 1);
    assert.ok(ev2.some((e) => e.type === 'grown' && e.plantId === 'lettuce'));
    assert.equal(g.byType().lettuce, 1);
    assert.equal(g.byType().apple, 0);
});

test('score is the number of plots filled; sunlight only feeds the selected plant', () => {
    const g = new L.PlotGarden({ seed: 2, plots: 4 });
    assert.equal(L.scorePlots(g), 0);
    g.addSunlight(10, 0);
    assert.equal(g.totalSunlight, 10);
    assert.equal(g.wastedSunlight, 10);
    g.plantNext('mint');
    g.addSunlight(L.plantById('mint').cost, 1);
    g.plantNext('apple');
    g.addSunlight(3, 2);
    assert.equal(g.filledCount(), 1);
    assert.equal(L.scorePlots(g), 1);
    assert.equal(L.scorePlots(g.filled()), 1);
    assert.equal(g.current().plantId, 'apple');
    assert.ok(g.current().sunlight > 0 && g.current().sunlight < g.current().cost);
    assert.ok(g.totalSunlight > g.wastedSunlight);
});

test('PlantingSession: smiles pour sunlight, laughs add a bonus, auto-pick can plant', () => {
    const s = new L.PlantingSession({ seed: 3, sessionSeconds: 40, autoPick: true, firstPickDelay: 0, nextPickDelay: 0, pickQueue: ['lettuce', 'apple'] });
    // First tick should auto-pick lettuce.
    const ev0 = s.update(0.05, face(0.2));
    assert.ok(ev0.some((e) => e.type === 'planted' && e.plantId === 'lettuce'), JSON.stringify(ev0));
    assert.equal(s.garden.current().plantId, 'lettuce');

    const evGrow = run(s, 20, face(0.9));
    assert.ok(s.garden.totalSunlight > 0);
    const grown = evGrow.filter((e) => e.type === 'grown');
    assert.ok(grown.length >= 1, 'lettuce should finish under a long grin');
    // Auto-pick continues to apple after lettuce matures.
    assert.ok(evGrow.some((e) => e.type === 'planted' && e.plantId === 'apple') || (s.garden.current() && s.garden.current().plantId === 'apple'));

    const before = s.garden.current() ? s.garden.current().sunlight : s.garden.totalSunlight;
    const evBurst = run(s, 1.5, (t) => face(t < 0.3 ? 0.8 : 0.95, true));
    assert.ok(evBurst.some((e) => e.type === 'burst'));
    assert.equal(s.stats().laughBursts, 1);
    assert.ok(s.garden.totalSunlight > before);
    assert.equal(s.stats().score, s.stats().plotsFilled);
    assert.ok(s.stats().byType.lettuce >= 1);
});

test('PlantingSession: no face pauses sunlight and the clock; pick queues while growing', () => {
    const s = new L.PlantingSession({ seed: 4, sessionSeconds: 30, autoPick: false });
    assert.equal(s.pick('lettuce').type, 'planted');
    run(s, 2, face(0.8));
    const sun = s.garden.totalSunlight, el = s.elapsed;
    run(s, 3, { happiness: null, talking: null, faceVisible: false });
    assert.equal(s.garden.totalSunlight, sun);
    assert.equal(s.elapsed, el);
    assert.equal(s.paused, true);
    const q = s.pick('apple');
    assert.equal(q.type, 'queued');
    assert.equal(s.garden.lastPlantId, 'apple');
    assert.equal(s.garden.current().plantId, 'lettuce');
});

test('a 2-minute cheerful session can fill several easy plots', () => {
    const s = new L.PlantingSession({
        seed: 8, sessionSeconds: 120, autoPick: true,
        firstPickDelay: 0, nextPickDelay: 0,
        pickQueue: ['lettuce', 'lettuce', 'mint', 'lettuce', 'mint', 'lettuce', 'mint', 'lettuce'],
    });
    run(s, 120, (t) => face(t % 10 < 7 ? 0.82 : 0.15));
    assert.ok(s.finished);
    assert.ok(s.stats().plotsFilled >= 3, `filled ${s.stats().plotsFilled}`);
    assert.ok(s.stats().totalSunlight > 8);
    assert.equal(s.stats().score, s.stats().plotsFilled);
});

test('SmileTrace is a ring buffer: keeps a 10 s window and wraps capacity', () => {
    const tr = new L.SmileTrace({ windowSec: 10, capacity: 8 });
    assert.equal(tr.samples(0).length, 0);
    for (let i = 0; i < 20; i++) {
        tr.push({ t: i * 0.5, happiness: 0.2 + i * 0.02, faceVisible: true, talking: false });
    }
    // 20 pushes into capacity 8: only the last 8 physical slots remain.
    assert.equal(tr.size, 8);
    const at9 = tr.samples(9.5);
    assert.equal(at9.length, 8);
    assert.ok(at9[0].t >= 9.5 - 10);
    assert.equal(at9[0].t, 20 * 0.5 - 8 * 0.5); // t=6.0, the oldest kept
    assert.equal(at9[at9.length - 1].t, 9.5);
    // A later clock drops samples older than the 10 s window (even if still in the ring).
    const late = tr.samples(20);
    assert.equal(late.length, 0);
    // Push one fresh sample at t=20; only that one is in the window.
    tr.push({ t: 20, happiness: 0.9, faceVisible: true });
    const now = tr.samples(20);
    assert.equal(now.length, 1);
    assert.equal(now[0].h, 0.9);
});

test('SmileTrace records no-face gaps, smiling tint, talking, and laugh marks', () => {
    const tr = new L.SmileTrace({ windowSec: 10, capacity: 60 });
    tr.push({ t: 1, happiness: 0.7, faceVisible: true, smiling: true, talking: false });
    tr.push({ t: 2, happiness: null, faceVisible: false });
    tr.push({ t: 3, happiness: 0.85, faceVisible: true, smiling: true, talking: true });
    tr.markLaugh(3);
    tr.markLaugh(3); // duplicate timestamp ignored
    const xs = tr.samples(5);
    assert.equal(xs.length, 3);
    assert.equal(xs[0].h, 0.7);
    assert.equal(xs[0].face, true);
    assert.equal(xs[0].smiling, true);
    assert.equal(xs[1].h, null);
    assert.equal(xs[1].face, false);
    assert.equal(xs[2].talking, true);
    assert.deepEqual(tr.laughMarks(5), [3]);
    // Marks outside the window are dropped once samples() prunes.
    tr.samples(14);
    assert.deepEqual(tr.laughMarks(14), []);
    tr.clear();
    assert.equal(tr.samples(14).length, 0);
    assert.equal(tr.size, 0);
});
