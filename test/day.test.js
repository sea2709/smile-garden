'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../game/day.js');
const V = require('../game/visit.js');

test('garden clock pauses at late night and advances with real time', () => {
    const s = V.createState(new Date());
    const clock = new D.GardenDayClock(s, { realMsPerGardenMinute: 100 });
    clock.tick(60_000);
    assert.ok(s.gardenMinutes > 360);
    s.gardenMinutes = D.DEFAULT_DAY_CONFIG.lateNightStop;
    clock.tick(60_000);
    assert.equal(s.gardenMinutes, D.DEFAULT_DAY_CONFIG.lateNightStop);
    clock.pause();
    clock.tick(60_000);
    assert.equal(s.gardenMinutes, D.DEFAULT_DAY_CONFIG.lateNightStop);
});

test('lighting blends across dawn, midday, golden hour, and night', () => {
    const dawn = D.lightingBlend(7 * 60);
    assert.ok(dawn.weights.dawn + dawn.weights.midday > 0.9);
    const night = D.lightingBlend(22 * 60);
    assert.equal(night.weights.night, 1);
});

test('goToBed rolls day, season, and runs overnight growth', () => {
    const d = new Date(2026, 10, 16, 20);
    const s = V.createState(d);
    V.plantSeed(s, 0, 'lettuce', d);
    V.applyVisit(s, { beds: [{ plot: 0, sunHours: 12, water: 1, fertilizer: 0 }] }, d);
    assert.equal(s.plots[0].stage, 1);
    const out = V.goToBed(s, d);
    assert.equal(out.grew.length, 1);
    assert.equal(s.dayNumber, 2);
    assert.equal(s.seasonDay, 2);
    assert.equal(s.gardenMinutes, D.DEFAULT_DAY_CONFIG.startMinutes);
    assert.equal(s.plots[0].stage, 2);
});

test('v4 save migrates to day 1 spring 6:00', () => {
    const d = new Date(2026, 10, 16);
    const old = V.createState(d);
    old.version = 4;
    delete old.dayNumber;
    const raw = JSON.stringify(old);
    const s = V.loadState(raw, d);
    assert.equal(s.version, 5);
    assert.equal(s.dayNumber, 1);
    assert.equal(s.season, 'spring');
    assert.equal(s.gardenMinutes, 360);
});

test('season gating pauses out-of-season plants overnight', () => {
    const d = new Date(2026, 0, 10);
    const s = V.createState(d);
    s.season = 'winter';
    V.plantSeed(s, 0, 'cucumber', d);
    V.applyVisit(s, { beds: [{ plot: 0, sunHours: 12, water: 1, fertilizer: 0 }] }, d);
    const out = V.goToBed(s, d);
    assert.equal(out.grew.length, 0);
    assert.equal(s.plots[0].stage, 1);
});

test('persistence round-trips garden clock fields', () => {
    const s = V.createState(new Date());
    s.dayNumber = 9;
    s.gardenMinutes = 720;
    s.dailyTends = { 0: { day: 9, sunHours: 4, water: 1, fertilizer: 0, breaths: 0 } };
    const back = V.loadState(V.serializeState(s), new Date());
    assert.equal(back.dayNumber, 9);
    assert.equal(back.gardenMinutes, 720);
    assert.deepEqual(back.dailyTends[0].sunHours, 4);
});