'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../game/logic.js');
const H = require('../game/harvest.js');
const V = require('../game/visit.js');

const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h, 0, 0, 0);

test('computeYield: base 1, +1 full water, +1 fertilizer, never below 1 (staking is not a yield bonus)', () => {
    const p = { plantId: 'tomato', matureWater: 1, matureFert: 1 };
    assert.equal(H.computeYield(p), 3);
    assert.equal(H.computeYield({ plantId: 'tomato', matureWater: 0, matureFert: 0 }), 1);
    assert.equal(H.computeYield({ plantId: 'tomato', matureWater: 0.5, matureFert: 0 }), 1);
    assert.equal(H.computeYield({ plantId: 'tomato', matureWater: 0, matureFert: 0, staked: true }), 1);
});

test('harvestPlot pull clears bed and grants spare seed', () => {
    const s = V.createState(at(2026, 11, 16));
    V.plantSeed(s, 0, 'lettuce', at(2026, 11, 16));
    s.plots[0].stage = 5;
    const r = H.harvestPlot(s, 0, '2026-11-16', L.plantById);
    assert.equal(r.ok, true);
    assert.equal(r.mode, 'pull');
    assert.equal(s.plots[0], null);
    assert.equal(s.spareSeeds.lettuce, 1);
    assert.equal(s.pantry.items.lettuce.count, 1);
});

test('harvestPlot regrow marks picked and increments pantry', () => {
    const s = V.createState(at(2026, 11, 16));
    s.visitDays = ['garden-1', 'garden-2'];
    s.daysCompleted = 2;
    s.dayNumber = 3;
    V.plantSeed(s, 0, 'tomato', at(2026, 11, 16));
    s.plots[0].stage = 5;
    s.plots[0].matureWater = 1;
    const r = H.harvestPlot(s, 0, '2026-11-16', L.plantById);
    assert.equal(r.ok, true);
    assert.equal(r.yield, 2);
    assert.equal(s.plots[0].picked, true);
    assert.equal(s.plots[0].pickDay, '2026-11-16');
    assert.equal(H.isPlotReady(s.plots[0], '2026-11-16'), false);
    assert.equal(H.isPlotRegrowing(s.plots[0], '2026-11-16'), true);
    assert.equal(H.isPlotReady(s.plots[0], '2026-11-18'), true);
});

test('advanceRegrowPlots clears picked after regrow days', () => {
    const s = V.createState(at(2026, 11, 16));
    V.plantSeed(s, 0, 'mint', at(2026, 11, 16));
    s.plots[0].stage = 5;
    H.harvestPlot(s, 0, '2026-11-16', L.plantById);
    V.advanceRegrowPlots(s, '2026-11-16');
    assert.equal(s.plots[0].picked, true);
    V.advanceRegrowPlots(s, '2026-11-17');
    assert.equal(s.plots[0].picked, false);
    assert.equal(H.isPlotReady(s.plots[0], '2026-11-17'), true);
});

test('seed unlocks use harvest milestones with visit fallback', () => {
    const s = V.createState(at(2026, 11, 16));
    assert.equal(V.isUnlocked(s, 'tomato'), false);
    s.visitDays.push('garden-1', 'garden-2');
    s.daysCompleted = 2;
    assert.equal(V.isUnlocked(s, 'tomato'), true);
    const s2 = V.createState(at(2026, 11, 16));
    s2.pantry.totalHarvests = 1;
    assert.equal(V.isUnlocked(s2, 'tomato'), true);
    const s3 = V.createState(at(2026, 11, 16));
    s3.pantry.totalHarvests = 2;
    assert.equal(V.isUnlocked(s3, 'sunflower'), false);
    s3.visitDays = ['garden-1', 'garden-2', 'garden-3', 'garden-4'];
    s3.daysCompleted = 4;
    assert.equal(V.isUnlocked(s3, 'sunflower'), true);
});

test('loadState v3 migrates with empty pantry', () => {
    const now = at(2026, 11, 16);
    const legacy = {
        version: 3,
        wellnessAck: true,
        plots: [{ plantId: 'mint', stage: 3, sunBank: 1, plantedDay: '2026-11-10' }],
        visitDays: ['2026-11-16'],
        journal: [],
        settings: { pace: 'standard', breaths: 4, lighting: 'auto', offsetDays: 0 },
    };
    const s = V.loadState(JSON.stringify(legacy), now);
    assert.equal(s.version, V.STATE_VERSION);
    assert.equal(s.pantry.totalHarvests, 0);
    assert.equal(s.spareSeeds.mint || 0, 0);
    assert.equal(s.plots[0].plantId, 'mint');
    assert.equal(s.decor, undefined);
});

test('completeCareHarvest clears regrow beds when CARE_HARVEST_BED_RESET is empty', () => {
    const H = require('../game/harvest.js');
    const s = V.createState(at(2026, 11, 16));
    V.plantSeed(s, 0, 'cucumber', at(2026, 11, 16));
    s.plots[0].staked = true;
    s.plots[0].stage = 5;
    const dk = V.calendarKey(s, at(2026, 11, 16));
    const r = H.completeCareHarvest(s, 0, dk, require('../game/logic.js').plantById);
    assert.equal(r.ok, true);
    assert.equal(s.plots[0], null);
    assert.equal(H.CARE_HARVEST_BED_RESET, 'empty');
});

test('applySessionHarvests applies pending visit harvests', () => {
    const s = V.createState(at(2026, 11, 16));
    V.plantSeed(s, 0, 'cucumber', at(2026, 11, 16));
    s.plots[0].stage = 5;
    const list = V.applySessionHarvests(s, [0], at(2026, 11, 16));
    assert.equal(list.length, 1);
    assert.equal(s.pantry.totalHarvests, 1);
});

test('simulateDays performs harvests on ready beds', () => {
    const s = V.createState(at(2026, 11, 16));
    V.plantSeed(s, 0, 'lettuce', at(2026, 11, 16));
    const clock = new V.GameClock({ now: () => at(2026, 11, 16).getTime() });
    const L = require('../game/logic.js');
    const C = require('../game/care-needs.js');
    const needs = L.plantNeeds('lettuce');
    for (let i = 0; i < 4; i++) {
        const progress = { sun: needs.sun, water: needs.water, fertilizer: needs.fertilizer, stake: false };
        V.applyVisit(s, {
            careMode: true,
            careBeds: [{ plot: 0, progress, allMet: C.allNeedsMet(progress, needs, false) }],
        }, clock.now());
        V.goToBed(s, clock.now());
        clock.nextDay();
    }
    assert.equal(s.plots[0].stage, 5);
    const out = V.simulateDays(s, clock, 1, 1);
    assert.ok(out[0].harvested && out[0].harvested.length >= 1);
});