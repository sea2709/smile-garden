'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../game/logic.js');
const C = require('../game/care-needs.js');
const V = require('../game/visit.js');
const D = require('../game/day.js');

test('plant needs table matches design', () => {
    assert.deepEqual(L.plantNeeds('lettuce'), { sun: 1, water: 3, fertilizer: 1, stake: false });
    assert.deepEqual(L.plantNeeds('mint'), { sun: 1, water: 3, fertilizer: 1, stake: false });
    assert.deepEqual(L.plantNeeds('cucumber'), { sun: 2, water: 3, fertilizer: 2, stake: true });
    assert.deepEqual(L.plantNeeds('tomato'), { sun: 3, water: 2, fertilizer: 3, stake: true });
    assert.deepEqual(L.plantNeeds('sunflower'), { sun: 3, water: 1, fertilizer: 1, stake: true });
    assert.deepEqual(L.plantNeeds('apple'), { sun: 3, water: 2, fertilizer: 2, stake: true });
});

test('plantCareSummary leads with water, fertilizer, and stake', () => {
    assert.match(L.plantCareSummary('lettuce'), /Water 3 smiles/);
    assert.match(L.plantCareSummary('lettuce'), /Fertilizer 1 chat/);
    assert.match(L.plantCareSummary('lettuce'), /No stake/);
    assert.match(L.plantCareSummary('tomato'), /Water 2 smiles/);
    assert.match(L.plantCareSummary('tomato'), /Fertilizer 3 chats/);
    assert.match(L.plantCareSummary('tomato'), /Needs staking/);
    const info = V.plantInfo('cucumber');
    assert.equal(info.careSummary, L.plantCareSummary('cucumber'));
    assert.deepEqual(info.needs, L.plantNeeds('cucumber'));
});

test('dot unit lengths', () => {
    assert.deepEqual(C.CARE_DOT_SECONDS, { sun: 10, water: 10, fertilizer: 15 });
});

test('dot accounting fills each need independently', () => {
    const needs = L.plantNeeds('tomato');
    let p = C.emptyProgress();
    p = C.addDotTime(p, 'sun', 10, needs);
    assert.equal(p.sun, 1);
    p = C.addDotTime(p, 'sun', 20, needs);
    assert.equal(p.sun, 3);
    p = C.addDotTime(p, 'water', 20, needs);
    assert.equal(p.water, 2);
});

test('all needs required for growth flag', () => {
    const needs = L.plantNeeds('tomato');
    const partial = { sun: 3, water: 2, fertilizer: 2, stake: false };
    assert.equal(C.allNeedsMet(partial, needs, false), false);
    const full = { sun: 3, water: 2, fertilizer: 3, stake: true };
    assert.equal(C.allNeedsMet(full, needs, true), true);
});

test('staked plants satisfy stake need daily without redoing stretch', () => {
    const needs = L.plantNeeds('tomato');
    const p = { sun: 3, water: 2, fertilizer: 3, stake: false };
    assert.equal(C.allNeedsMet(p, needs, true), true);
});

test('free-order care session stores progress per bed', () => {
    const plots = [{ plantId: 'tomato', stage: 2, sunBank: 0, staked: false }];
    const session = new V.VisitSession({ plots, plantedBeds: [0], gardenDay: 3 });
    session.selectedPlot = 0;
    session.startCare('water');
    assert.equal(session.step, 'care-smile');
    session.startCare('sun');
    assert.equal(session.step, 'care-smile');
    session.startCare('fertilizer');
    assert.equal(session.step, 'care-talk');
});

test('auto sun fills only in daylight', () => {
    const needs = L.plantNeeds('mint');
    let p = C.emptyProgress();
    p = C.addAutoSun(p, needs, 20, false);
    assert.equal(p.sun, 0);
    p = C.addAutoSun(p, needs, 10, true);
    assert.ok(p.sun >= 0.99 && p.sun <= 1.01);
});

test('grows one stage overnight only when allMet', () => {
    const s = V.createState(new Date(2026, 10, 16));
    V.plantSeed(s, 0, 'lettuce', new Date(2026, 10, 16));
    const day = s.dayNumber;
    s.dailyTends[0] = { day, sun: 1, water: 3, fertilizer: 1, stake: false, allMet: true };
    const out = V.goToBed(s, new Date(2026, 10, 16, 22));
    assert.equal(s.plots[0].stage, 2);
    assert.equal(out.grew.length, 1);
    const s2 = V.createState(new Date(2026, 10, 16));
    V.plantSeed(s2, 1, 'lettuce', new Date(2026, 10, 16));
    s2.dailyTends[1] = { day: s2.dayNumber, sun: 1, water: 1, fertilizer: 0, stake: false, allMet: false };
    const out2 = V.goToBed(s2, new Date(2026, 10, 16, 22));
    assert.equal(s2.plots[1].stage, 1);
    assert.equal(out2.grew.length, 0);
});

test('save v6 migration clears staked and bumps version', () => {
    const raw = {
        version: 5,
        plots: [{ plantId: 'tomato', stage: 3, sunBank: 0, staked: true }],
        dayNumber: 2,
        gardenMinutes: 360,
        season: 'spring',
        seasonDay: 2,
        dailyTends: {},
        visitDays: [],
        journal: [],
        settings: {},
        pantry: {},
        spareSeeds: {},
    };
    const s = V.loadState(JSON.stringify(raw), new Date());
    assert.equal(s.version, 6);
    assert.equal(s.plots[0].staked, false);
});

test('tagResting set after incomplete overnight growth, cleared when allMet', () => {
    const d = new Date(2026, 10, 16);
    const s = V.createState(d);
    V.plantSeed(s, 0, 'lettuce', d);
    s.dailyTends[0] = { day: 1, sun: 1, water: 1, fertilizer: 0, stake: false, allMet: false };
    V.goToBed(s, d);
    assert.equal(s.plots[0].tagResting, true);
    const needs = L.plantNeeds('lettuce');
    V.applyVisit(s, {
        careMode: true,
        careBeds: [{
            plot: 0,
            progress: { sun: needs.sun, water: needs.water, fertilizer: needs.fertilizer, stake: false },
            allMet: true,
        }],
    }, new Date(2026, 10, 17, 10));
    assert.equal(s.plots[0].tagResting, false);
});

test('tagResting clears at next bedtime even if needs still incomplete', () => {
    const d = new Date(2026, 10, 16);
    const s = V.createState(d);
    V.plantSeed(s, 0, 'mint', d);
    s.dailyTends[0] = { day: 1, sun: 1, water: 0, fertilizer: 0, stake: false, allMet: false };
    V.goToBed(s, d);
    assert.equal(s.plots[0].tagResting, true);
    s.dailyTends[0] = { day: 2, sun: 1, water: 1, fertilizer: 0, stake: false, allMet: false };
    V.goToBed(s, new Date(2026, 10, 17, 22));
    assert.equal(s.plots[0].tagResting, true, 'still resting after another night without growth');
});

test('plotTendedToday (damp soil) is allMet only and clears after bedtime', () => {
    const d = new Date(2026, 10, 16);
    const s = V.createState(d);
    V.plantSeed(s, 0, 'lettuce', d);
    const needs = L.plantNeeds('lettuce');
    assert.equal(D.plotTendedToday(s, 0), false);
    V.applyVisit(s, {
        careMode: true,
        careBeds: [{
            plot: 0,
            progress: { sun: needs.sun, water: 1, fertilizer: 0, stake: false },
            allMet: false,
        }],
    }, d);
    assert.equal(D.plotTendedToday(s, 0), false);
    V.applyVisit(s, {
        careMode: true,
        careBeds: [{
            plot: 0,
            progress: { sun: needs.sun, water: needs.water, fertilizer: needs.fertilizer, stake: false },
            allMet: true,
        }],
    }, d);
    assert.equal(D.plotTendedToday(s, 0), true);
    V.goToBed(s, d);
    assert.equal(D.plotTendedToday(s, 0), false);
});

test('morning reset clears daily tends', () => {
    const s = V.createState(new Date(2026, 10, 16));
    s.dailyTends[0] = { day: 1, sun: 2, water: 1, fertilizer: 0, allMet: false };
    V.goToBed(s, new Date(2026, 10, 16, 22));
    assert.deepEqual(s.dailyTends, {});
});