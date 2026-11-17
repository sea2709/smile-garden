'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../game/day.js');
const V = require('../game/visit.js');
const C = require('../game/clock-arc.js');

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
    const needs = require('../game/logic.js').plantNeeds('lettuce');
    V.applyVisit(s, {
        careMode: true,
        careBeds: [{
            plot: 0,
            progress: { sun: needs.sun, water: needs.water, fertilizer: needs.fertilizer, stake: false },
            allMet: true,
        }],
    }, d);
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
    assert.equal(s.version, 6);
    assert.equal(s.dayNumber, 1);
    assert.equal(s.season, 'spring');
    assert.equal(s.gardenMinutes, 360);
});

test('season gating pauses out-of-season plants overnight', () => {
    const d = new Date(2026, 0, 10);
    const s = V.createState(d);
    s.season = 'winter';
    V.plantSeed(s, 0, 'cucumber', d);
    s.plots[0].staked = true;
    const needs = require('../game/logic.js').plantNeeds('cucumber');
    V.applyVisit(s, {
        careMode: true,
        careBeds: [{
            plot: 0,
            progress: { sun: needs.sun, water: needs.water, fertilizer: needs.fertilizer, stake: true },
            allMet: true,
        }],
    }, d);
    const out = V.goToBed(s, d);
    assert.equal(out.grew.length, 0);
    assert.equal(s.plots[0].stage, 1);
});

test('clock arc places sun token at 6:00, noon, and 18:00', () => {
    const tol = 0.35;
    const at = (h, m) => h * 60 + m;
    const expectSunAt = (mins, deg, needFullSun) => {
        const st = C.clockTokenState(mins);
        if (needFullSun) assert.ok(st.sunAlpha > 0.9, `sun visible at ${mins}`);
        assert.ok(Math.abs(st.sunDeg - deg) < 0.05, `sunDeg ${st.sunDeg} vs ${deg} at ${mins}m`);
        const p = C.tokenFrameXY(st.sunDeg);
        const exp = C.tokenFrameXY(deg);
        assert.ok(Math.abs(p.x - exp.x) < tol && Math.abs(p.y - exp.y) < tol, `${mins}m → (${p.x},${p.y}) vs (${exp.x},${exp.y})`);
    };
    expectSunAt(at(6, 0), 147, true);
    expectSunAt(at(12, 0), 90, true);
    expectSunAt(at(18, 0), 33, false);
    const night = C.clockTokenState(at(21, 0));
    assert.ok(night.moonAlpha > 0.9 && night.sunAlpha < 0.1);
    assert.ok(Math.abs(night.moonDeg - 33) < 0.05, `moon at right end at 21:00`);
    const moon = C.tokenFrameXY(night.moonDeg);
    const moonRest = C.tokenFrameXY(33);
    assert.ok(Math.abs(moon.x - moonRest.x) < tol && Math.abs(moon.y - moonRest.y) < tol);
});

test('season particle pools distinguish spring, summer day, and summer night', () => {
    const vm = require('vm');
    const fs = require('fs');
    const path = require('path');
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'art.js'), 'utf8'), sandbox);
    const pools = sandbox.window.SmileArt.seasons.particlePools;
    assert.ok(pools.spring.includes('petal-1') && !pools.spring.includes('pollen'));
    assert.equal(pools.summerDay.join(','), 'seed-fluff,pollen');
    assert.equal(pools.summerNight.join(','), 'firefly');
    assert.ok(!pools.summerDay.includes('petal-1'));
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