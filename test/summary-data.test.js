'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../game/logic.js');
const V = require('../game/visit.js');
const SD = require('../game/summary-data.js');
const C = require('../game/care-needs.js');

const STAGES = V.STAGES;

test('careStatValue uses soft dash when quiet, never skipped', () => {
    assert.deepEqual(SD.careStatValue(0), { value: SD.QUIET, quiet: true });
    assert.deepEqual(SD.careStatValue(2.01), { value: '2', quiet: false });
});

test('aggregateCareFromBeds sums dot progress and harvest count', () => {
    const state = V.createState();
    state.plots[0] = { plantId: 'lettuce', stage: 2, staked: false };
    state.plots[1] = { plantId: 'tomato', stage: 3, staked: true };
    const careBeds = [
        { plot: 0, progress: { sun: 1.2, water: 2, fertilizer: 0, stake: false } },
        { plot: 1, progress: { sun: 0.5, water: 1, fertilizer: 1, stake: true } },
    ];
    const stats = SD.aggregateCareFromBeds(careBeds, 2, state, (id) => L.plantNeeds(id));
    assert.equal(stats.sunDots, 1.7);
    assert.equal(stats.waterDots, 3);
    assert.equal(stats.fertilizerDots, 1);
    assert.equal(stats.stakes, 1);
    assert.equal(stats.harvests, 2);
});

test('buildSummaryData: growth day hero and care labels', () => {
    const state = V.createState();
    const out = {
        grew: [{ plantId: 'lettuce', name: 'Lettuce', from: 2, to: 3, mature: false, plot: 0 }],
        careStats: { sunDots: 3, waterDots: 2, fertilizerDots: 0, stakes: 0, harvests: 1 },
        weekly: 2,
    };
    const data = SD.buildSummaryData({
        out,
        state,
        night: false,
        fmtDate: () => 'Tue, Nov 18',
        now: new Date(),
        lightingLabel: 'Midday',
        STAGES,
        plantById: L.plantById,
        weeklyVisits: () => 2,
    });
    assert.match(data.eyebrow, /2 visits this week/);
    assert.equal(data.title, 'Your garden grew today');
    assert.equal(data.hero.num, 1);
    assert.equal(data.care[0].label, 'Water');
    assert.equal(data.care[0].value, '2');
    assert.equal(data.care[1].quiet, true);
    assert.equal(data.care[1].value, SD.QUIET);
    assert.equal(data.sun.src, 'from daylight, all by itself');
});

test('buildSummaryData: quiet night card with note', () => {
    const state = V.createState();
    state.seasonDay = 3;
    const data = SD.buildSummaryData({
        out: { grew: [], careStats: { sunDots: 0, waterDots: 0, fertilizerDots: 0, stakes: 0, harvests: 0 } },
        state,
        night: true,
        fmtDate: () => 'Wed, Nov 19',
        lightingLabel: 'Night',
        STAGES,
        plantById: L.plantById,
        seasonDay: 3,
        daysPerSeason: 7,
    });
    assert.equal(data.title, 'A quiet night in the garden');
    assert.equal(data.hero.art, 'morning-hero.png');
    assert.equal(data.sun.quiet, true);
    assert.match(data.note, /Season day 3 of 7/);
    assert.ok(!data.note.includes('Breathing'));
});

test('aggregateCareFromDailyTends before bed reset', () => {
    const state = V.createState();
    state.dayNumber = 4;
    state.plots[0] = { plantId: 'lettuce', stage: 2, staked: false };
    state.dailyTends = {
        0: { day: 4, sun: 2, water: 1, fertilizer: 0, stake: false, allMet: false },
    };
    const stats = SD.aggregateCareFromDailyTends(state, 4, (id) => L.plantNeeds(id));
    assert.equal(stats.sunDots, 2);
    assert.equal(stats.waterDots, 1);
    assert.equal(C.stakeNeedMet({ stake: false }, false), false);
});