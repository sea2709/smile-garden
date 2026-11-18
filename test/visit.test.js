// node:test suite for game/visit.js: daily loop, persistence, time of day,
// breathing pacing. Pure logic, no DOM/SDK.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../game/logic.js');
const C = require('../game/care-needs.js');
const V = require('../game/visit.js');

function markAllNeedsMet(state, plot) {
    const p = state.plots[plot];
    if (!p) return;
    const needs = L.plantNeeds(p.plantId);
    const prog = {
        sun: needs.sun,
        water: needs.water,
        fertilizer: needs.fertilizer,
        stake: needs.stake ? true : false,
    };
    state.dailyTends[plot] = Object.assign(
        C.toDailyTendRecord(prog, needs, p.staked || prog.stake, state.dayNumber),
        { day: state.dayNumber },
    );
}

function applyCareVisit(state, plot, now) {
    const p = state.plots[plot];
    const needs = L.plantNeeds(p.plantId);
    const progress = {
        sun: needs.sun,
        water: needs.water,
        fertilizer: needs.fertilizer,
        stake: needs.stake,
    };
    return V.applyVisit(state, {
        careMode: true,
        careBeds: [{
            plot,
            progress,
            allMet: C.allNeedsMet(progress, needs, p.staked || progress.stake),
            stake: !!progress.stake,
        }],
    }, now);
}

function finishCareForPlant(session, plot) {
    const needs = L.plantNeeds(session.plots[plot].plantId);
    const prog = {
        sun: needs.sun,
        water: needs.water,
        fertilizer: needs.fertilizer,
        stake: needs.stake,
    };
    session.selectedPlot = plot;
    session.setCareProgress(plot, prog);
    return session.finishCareHub();
}

const at = (y, m, d, h = 10, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);
const DT = 1 / 30;
function run(session, seconds, input) {
    const steps = [];
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
        for (const ev of session.update(DT, typeof input === 'function' ? input(i * DT) : input)) steps.push(ev.step);
    }
    return steps;
}
const smile = { happiness: 0.85, talking: false, faceVisible: true };
const talk = { happiness: 0.3, talking: true, faceVisible: true };
const neutral = { happiness: 0.1, talking: false, faceVisible: true };
const noFace = { happiness: null, talking: null, faceVisible: false };
const withDaylight = (input, isDaylight) => Object.assign({}, input, { isDaylight });

// ---------- time of day ----------
test('lighting follows local time: dawn 5–9, midday 9–16, golden hour 16–19, night otherwise', () => {
    const expect = { 0: 'night', 4: 'night', 5: 'dawn', 8: 'dawn', 9: 'midday', 12: 'midday', 15: 'midday', 16: 'golden-hour', 18: 'golden-hour', 19: 'night', 23: 'night' };
    for (const [h, l] of Object.entries(expect)) assert.equal(V.lightingForHour(Number(h)), l, `hour ${h}`);
    assert.equal(V.lightingFor(at(2026, 11, 16, 8, 59)), 'dawn');
    assert.equal(V.lightingFor(at(2026, 11, 16, 9, 0)), 'midday');
    assert.equal(V.lightingFor(at(2026, 11, 16, 18, 59)), 'golden-hour');
});

test('debug lighting override wins over the clock; bad overrides are ignored', () => {
    assert.equal(V.lightingFor(at(2026, 11, 16, 12), 'night'), 'night');
    assert.equal(V.lightingFor(at(2026, 11, 16, 12), 'auto'), 'midday');
    assert.equal(V.lightingFor(at(2026, 11, 16, 12), 'purple'), 'midday');
    for (const l of V.LIGHTINGS) assert.ok(V.greetingFor(l).length > 5);
});

test('days reset at local midnight and weeks run Monday to Sunday', () => {
    assert.equal(V.dayKey(at(2026, 11, 16, 23, 59)), '2026-11-16');
    assert.equal(V.dayKey(at(2026, 11, 17, 0, 0)), '2026-11-17');
    assert.equal(V.weekStartKey(at(2026, 11, 16)), '2026-11-16'); // Monday
    assert.equal(V.weekStartKey(at(2026, 11, 22, 21)), '2026-11-16'); // Sunday night
    assert.equal(V.weekStartKey(at(2026, 11, 23)), '2026-11-23');
    assert.equal(V.daysBetween('2026-11-16', '2026-11-23'), 7);
    assert.equal(V.addDaysKey('2026-12-31', 1), '2027-01-01');
    // DST change (US, 2026-11-01): still one calendar day apart.
    assert.equal(V.daysBetween('2026-10-31', '2026-11-01'), 1);
});

test('GameClock "next day" moves the calendar day and keeps the wall-clock hour', () => {
    const c = new V.GameClock({ now: () => at(2026, 11, 16, 7, 30).getTime() });
    assert.equal(c.today(), '2026-11-16');
    assert.equal(c.nextDay(), '2026-11-17');
    assert.equal(c.now().getHours(), 7);
    assert.equal(V.lightingFor(c.now()), 'dawn');
    const c2 = new V.GameClock({ now: () => at(2026, 11, 16).getTime(), offsetDays: 3 });
    assert.equal(c2.today(), '2026-11-19');
});

// ---------- persistence ----------
test('state round-trips through JSON', () => {
    const now = at(2026, 11, 16);
    const s = V.createState(now);
    s.wellnessAck = true;
    V.plantSeed(s, 2, 'mint', now);
    applyCareVisit(s, 2, now);
    V.goToBed(s, now);
    s.settings.pace = 'gentle';
    s.settings.breaths = 6;
    const raw = V.serializeState(s);
    const back = V.loadState(raw, now);
    assert.deepEqual(back.plots, V.loadState(raw, now).plots);
    assert.equal(back.dayNumber, s.dayNumber);
    assert.equal(back.gardenMinutes, s.gardenMinutes);
    assert.equal(back.plots[2].stage, 2);
});

test('corrupt, missing or old saves fall back to a fresh garden', () => {
    const now = at(2026, 11, 16);
    for (const raw of [null, '', '{not json', '[]', JSON.stringify({ version: 2, plots: [] })]) {
        const s = V.loadState(raw, now);
        assert.equal(s.version, V.STATE_VERSION);
        assert.equal(s.plots.length, 8);
        assert.ok(s.plots.every((p) => p === null));
        assert.equal(s.wellnessAck, false);
    }
});

test('loadState sanitizes bad plots, stages, settings and visit days', () => {
    const s = V.loadState(JSON.stringify({
        version: V.STATE_VERSION, wellnessAck: true,
        plots: [{ plantId: 'tomato', stage: 99, sunBank: -4 }, { plantId: 'cactus', stage: 2 }, 'x'],
        visitDays: ['2026-11-16', '2026-11-16', 'garbage', 7],
        settings: { pace: 'turbo', breaths: 40, lighting: 'disco', offsetDays: -3 },
    }), at(2026, 11, 16));
    assert.equal(s.plots[0].stage, 5);
    assert.equal(s.plots[0].sunBank, 0);
    assert.equal(s.plots[1], null);
    assert.equal(s.plots[2], null);
    assert.deepEqual(s.visitDays, ['2026-11-16']);
    assert.equal(s.settings.pace, 'standard');
    assert.equal(s.settings.breaths, 6);
    assert.equal(s.settings.lighting, 'auto');
    assert.equal(s.settings.offsetDays, 0);
});

// ---------- planting + growth ----------
test('sun-hour costs come from the real-world plant table', () => {
    const cost = Object.fromEntries(L.PLANTS.map((p) => [p.id, p.cost]));
    assert.deepEqual(cost, { lettuce: 4, mint: 5, cucumber: 7, tomato: 8, sunflower: 10, apple: 12 });
    for (const p of L.PLANTS) {
        const info = V.plantInfo(p.id);
        assert.ok(info.tips.length >= 2, `${p.id} has tips`);
        assert.match(info.source, /^https:\/\//);
        assert.ok(info.sunHoursLabel);
    }
});

test('plantSeed: empty unlocked plots only, and it is journaled', () => {
    const now = at(2026, 11, 16);
    const s = V.createState(now);
    assert.deepEqual(V.plantSeed(s, 0, 'lettuce', now), { ok: true, plot: 0 });
    assert.equal(V.plantSeed(s, 0, 'mint', now).reason, 'plot-taken');
    assert.equal(V.plantSeed(s, 9, 'mint', now).reason, 'plot-taken');
    assert.equal(V.plantSeed(s, 1, 'apple', now).reason, 'locked');
    assert.equal(V.plantSeed(s, 1, 'cactus', now).reason, 'unknown-plant');
    assert.equal(s.journal.filter((e) => e.kind === 'planted').length, 1);
    assert.deepEqual(V.score(s), { planted: 1, mature: 0, plots: 8 });
});

test('a plant grows at most one stage per garden day (overnight)', () => {
    const d1 = at(2026, 11, 16, 8);
    const s = V.createState(d1);
    V.plantSeed(s, 0, 'lettuce', d1);
    applyCareVisit(s, 0, d1);
    assert.equal(s.plots[0].stage, 1);
    let night = V.goToBed(s, d1);
    assert.equal(night.grew.length, 1);
    assert.equal(s.plots[0].stage, 2);
    applyCareVisit(s, 0, at(2026, 11, 16, 21));
    assert.equal(s.plots[0].stage, 2);
    night = V.goToBed(s, at(2026, 11, 16, 22));
    assert.equal(s.plots[0].stage, 3);
});

test('apple grows one stage per garden day when all needs are met', () => {
    const s = V.createState(at(2026, 11, 16));
    s.daysCompleted = 7;
    s.visitDays = ['garden-1', 'garden-2', 'garden-3', 'garden-4', 'garden-5', 'garden-6', 'garden-7'];
    V.plantSeed(s, 0, 'apple', at(2026, 11, 16));
    const p = s.plots[0];
    p.staked = true;
    applyCareVisit(s, 0, at(2026, 11, 16));
    V.goToBed(s, at(2026, 11, 16, 23));
    assert.equal(s.plots[0].stage, 2);
    applyCareVisit(s, 0, at(2026, 11, 17));
    V.goToBed(s, at(2026, 11, 17, 23));
    assert.equal(s.plots[0].stage, 3);
});

test('incomplete needs prevent growth without wilting or losing stage', () => {
    const d = at(2026, 11, 16);
    const s = V.createState(d);
    V.plantSeed(s, 0, 'mint', d);
    const needs = L.plantNeeds('mint');
    V.applyVisit(s, {
        careMode: true,
        careBeds: [{ plot: 0, progress: { sun: needs.sun, water: 0.5, fertilizer: 0, stake: false }, allMet: false }],
    }, d);
    const night = V.goToBed(s, d);
    assert.equal(night.grew.length, 0);
    assert.equal(night.waiting[0].reason, 'needs-incomplete');
    assert.equal(s.plots[0].stage, 1);
});

test('fertilizer dots are required when the plant needs them', () => {
    const mk = () => {
        const s = V.createState(at(2026, 11, 16));
        s.visitDays = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'];
        V.plantSeed(s, 0, 'mint', at(2026, 11, 16));
        return s;
    };
    const plain = mk();
    const needs = L.plantNeeds('mint');
    V.applyVisit(plain, {
        careMode: true,
        careBeds: [{ plot: 0, progress: { sun: needs.sun, water: needs.water, fertilizer: 0, stake: false }, allMet: false }],
    }, at(2026, 11, 16));
    V.goToBed(plain, at(2026, 11, 16, 23));
    assert.equal(plain.plots[0].stage, 1, '4 h < 5 h mint cost without fertilizer');
    const fed = mk();
    applyCareVisit(fed, 0, at(2026, 11, 16));
    V.goToBed(fed, at(2026, 11, 16, 23));
    assert.equal(fed.plots[0].stage, 2, 'all dots met');
});

test('plants stop at mature, seeds unlock with visits, weekly count has no streak penalty', () => {
    const s = V.createState(at(2026, 11, 16));
    const clock = new V.GameClock({ now: () => at(2026, 11, 15, 10).getTime() });
    V.plantSeed(s, 0, 'mint', clock.now());
    const res = V.simulateDays(s, clock, 8, 1);
    assert.equal(s.plots[0].stage, 5);
    assert.ok(s.plots[0].matureDay || s.plots[0].picked);
    assert.ok(s.pantry.totalHarvests >= 1, 'simulateDays exercises harvests');
    assert.equal(V.matureCount(s), 1);
    assert.ok(res.some((r) => r.grew.some((g) => g.mature)));
    assert.ok(V.isUnlocked(s, 'apple'));
    assert.ok(s.journal.some((e) => e.kind === 'unlock' && e.plantId === 'tomato'));
    assert.ok(s.journal.some((e) => e.kind === 'mature'));
    // Visits Mon 16 .. Sat 21 this week = 6; skipping Sunday does not reset anything.
    assert.equal(V.weeklyVisits(s, at(2026, 11, 22)), 8);
    // v5 counts garden days completed, not calendar weeks (no streak pressure).
    assert.equal(V.weeklyVisits(s, at(2026, 11, 30)), 8);
});

// ---------- breathing ----------
test('breathing pace: 4 in / 6 out by default, gentler 3 in / 5 out, no holds', () => {
    assert.deepEqual([V.PACES.standard.inhale, V.PACES.standard.exhale], [4, 6]);
    assert.deepEqual([V.PACES.gentle.inhale, V.PACES.gentle.exhale], [3, 5]);
    // Visit path uses easeIn: false so a default 4-breath bout is exactly 40 s.
    const p = new V.BreathPacer({ pace: 'standard', breaths: 4, easeIn: false });
    assert.equal(p.bpm, 6);
    assert.deepEqual(p.schedule.map((b) => [b.inhale, b.exhale]), [[4, 6], [4, 6], [4, 6], [4, 6]]);
    assert.equal(p.total, 40);
    for (let i = 1; i < p.schedule.length; i++) {
        const prev = p.schedule[i - 1];
        assert.equal(p.schedule[i].start, prev.start + prev.inhale + prev.exhale, 'next inhale starts right as the exhale ends');
    }
    // Sample the whole bout: only 'in' and 'out' phases ever appear.
    const phases = new Set();
    for (let t = 0; t < p.total; t += 0.05) phases.add(p.at(t).phase);
    assert.deepEqual([...phases].sort(), ['in', 'out']);
    const g = new V.BreathPacer({ pace: 'gentle', breaths: 3 });
    assert.equal(g.total, 24);
    assert.equal(g.bpm, 7.5);
    const ease = new V.BreathPacer({ pace: 'standard', breaths: 4, easeIn: true });
    assert.deepEqual(ease.schedule.map((b) => [b.inhale, b.exhale]), [[3, 5], [4, 6], [4, 6], [4, 6]]);
    assert.equal(ease.total, 38);
});

test('breathing bouts are 3–6 breaths and the guide circle follows the breath', () => {
    assert.equal(new V.BreathPacer({ breaths: 1 }).breaths, 3);
    assert.equal(new V.BreathPacer({ breaths: 12 }).breaths, 6);
    assert.equal(new V.BreathPacer({ breaths: 'x' }).breaths, 4);
    const p = new V.BreathPacer({ pace: 'gentle', breaths: 3 });
    assert.equal(p.at(0).phase, 'in');
    assert.ok(p.at(0).size < 0.01);
    assert.ok(p.at(2.99).size > 0.99, 'full at the top of the in-breath');
    assert.equal(p.at(3.01).phase, 'out');
    assert.ok(p.at(7.99).size < 0.01);
    assert.equal(p.completedAt(7.9), 0);
    assert.equal(p.completedAt(8.1), 1);
    assert.equal(p.completedAt(100), 3);
    assert.equal(p.at(100).done, true);
});

// ---------- per-bed tending ----------
test('per-bed timers divide the smile/talk budget with a floor', () => {
    assert.equal(V.perBedStepSeconds(45, 8, V.TUNING.minSmilePerBed), 6);
    assert.equal(V.perBedStepSeconds(30, 8, V.TUNING.minTalkPerBed), 4);
    assert.equal(V.perBedStepSeconds(45, 1, V.TUNING.minSmilePerBed), 45);
});

test('selection moves only among planted beds on the 2×4 grid', () => {
    const planted = [0, 1, 5, 7];
    assert.equal(V.movePlotSelection(1, 'down', planted), 5);
    assert.equal(V.movePlotSelection(5, 'up', planted), 1);
    assert.equal(V.movePlotSelection(0, 'right', planted), 1);
    assert.equal(V.firstPlantedPlot([null, { plantId: 'mint' }, null, null, null, null, null, null]), 1);
});

test('applyVisit records per-bed care; only allMet beds grow overnight', () => {
    const d = at(2026, 11, 16);
    const s = V.createState(d);
    V.plantSeed(s, 0, 'lettuce', d);
    V.plantSeed(s, 3, 'mint', d);
    applyCareVisit(s, 0, d);
    const mintNeeds = L.plantNeeds('mint');
    V.applyVisit(s, {
        careMode: true,
        careBeds: [{
            plot: 3,
            progress: { sun: mintNeeds.sun, water: 1, fertilizer: 0, stake: false },
            allMet: false,
        }],
    }, d);
    V.goToBed(s, d);
    assert.equal(s.plots[0].stage, 2);
    assert.equal(s.plots[3].stage, 1);
    assert.deepEqual(s.dailyTends, {});
});

// ---------- the visit ----------
function mkPlots(ids) {
    const plots = new Array(8).fill(null);
  ids.forEach(([i, id]) => { plots[i] = { plantId: id, stage: 1, sunBank: 0 }; });
    return plots;
}

function tendOnePlant(session) {
    if (session.step === 'pick') session.confirmPick();
    if (session.step === 'care-hub') finishCareForPlant(session, session.plantedBeds[0]);
}

test('visit flow: care hub -> free-order needs -> summary (one plant)', () => {
    const plots = mkPlots([[0, 'lettuce']]);
    const s = new V.VisitSession({ plots, plantedBeds: [0], gardenDay: 1 });
    s.begin();
    assert.equal(s.step, 'care-hub');
    finishCareForPlant(s, 0);
    assert.equal(s.step, 'summary');
    const r = s.result();
    assert.equal(r.careBeds.length, 1);
    assert.equal(r.careBeds[0].allMet, true);
});

test('a full visit with every bed planted stays near 2–3 minutes of smile+talk', () => {
    const planted = [0, 1, 2, 3, 4, 5, 6, 7];
    const smile = V.perBedStepSeconds(V.TUNING.smileSeconds, 8, V.TUNING.minSmilePerBed);
    const talk = V.perBedStepSeconds(V.TUNING.talkSeconds, 8, V.TUNING.minTalkPerBed);
    const smileTalk = (smile + talk) * 8;
    const breathe = new V.BreathPacer({ pace: 'standard', breaths: 4, easeIn: false }).total;
    assert.ok(smileTalk >= 75 && smileTalk <= 95, `smile+talk ${smileTalk} s for 8 beds`);
    assert.ok(smileTalk + breathe <= 180);
});

test('care sun auto-fills in daylight; smile waters; talk fertilizes', () => {
    const plots = mkPlots([[2, 'mint']]);
    const s = new V.VisitSession({ plots, plantedBeds: [2], gardenDay: 1 });
    s.begin();
    s.selectedPlot = 2;
    run(s, 20, withDaylight(neutral, false));
    assert.equal(s.careProgressFor(2).sun, 0);
    run(s, 10, withDaylight(neutral, true));
    assert.ok(s.careProgressFor(2).sun >= 0.9 && s.careProgressFor(2).sun <= 1.1);
    run(s, 10, withDaylight(neutral, true));
    assert.equal(s.careProgressFor(2).water, 0);
    run(s, 10, withDaylight(smile, true));
    assert.ok(s.careProgressFor(2).water >= 0.9);
    run(s, 16, withDaylight(talk, true));
    assert.ok(s.careProgressFor(2).fertilizer >= 0.9);
    assert.equal(s.step, 'care-hub');
});

test('face missing pauses care steps and flags a poor reading', () => {
    const plots = mkPlots([[0, 'lettuce']]);
    const s = new V.VisitSession({ plots, plantedBeds: [0], gardenDay: 1 });
    s.begin();
    s.selectedPlot = 0;
    run(s, 2, withDaylight(smile, true));
    const before = s.careProgressFor(0).water;
    run(s, 5, withDaylight(noFace, true));
    assert.equal(s.poorReading, true);
    assert.equal(s.careProgressFor(0).water, before);
    run(s, 0.5, withDaylight(smile, true));
    assert.equal(s.poorReading, false);
});

test('partial care is saved in the session result; summary ends visit', () => {
    const plots = mkPlots([[0, 'lettuce']]);
    const s = new V.VisitSession({ plots, plantedBeds: [0], gardenDay: 1 });
    s.begin();
    s.selectedPlot = 0;
    run(s, 5, withDaylight(smile, true));
    s.go('care-hub');
    s.finishCareHub();
    assert.equal(s.step, 'summary');
    const r = s.result();
    assert.equal(r.careBeds[0].allMet, false);
    assert.ok(r.careBeds[0].progress.water >= 0.4 && r.careBeds[0].progress.water < 1);
});

test('fast demo completes lettuce needs in one short visit', () => {
    const plots = mkPlots([[0, 'lettuce']]);
    const s = new V.VisitSession({ fast: true, plots, plantedBeds: [0], gardenDay: 1 });
    s.begin();
    finishCareForPlant(s, 0);
    const r = s.result();
    assert.equal(r.careBeds[0].allMet, true);
});
