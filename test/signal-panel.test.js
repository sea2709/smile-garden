'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SP = require('../game/signal-panel.js');
const C = require('../game/care-needs.js');
const L = require('../game/logic.js');

test('rawPanelModeFromSignals prioritizes stretch then breathe then talk over smile', () => {
    assert.equal(SP.rawPanelModeFromSignals({ stretchEngaged: true, talking: true, smiling: true }), 'stretch');
    assert.equal(SP.rawPanelModeFromSignals({ breathing: true, talking: true, smiling: true }), 'breathe');
    assert.equal(SP.rawPanelModeFromSignals({ talking: true, smiling: true }), 'talk');
    assert.equal(SP.rawPanelModeFromSignals({ smiling: true }), 'smile');
    assert.equal(SP.rawPanelModeFromSignals({}), 'idle');
});

test('signal panel hysteresis holds before switching modes', () => {
    const sw = SP.createSignalPanelSwitcher({ enterHoldSec: 0.4, exitHoldSec: 1.2 });
    assert.equal(sw.step(0, 'smile'), 'idle');
    assert.equal(sw.step(0.1, 'smile'), 'idle');
    assert.equal(sw.step(0.45, 'smile'), 'smile');
    assert.equal(sw.step(0.5, 'talk'), 'smile');
    assert.equal(sw.step(0.7, 'talk'), 'smile');
    assert.equal(sw.step(0.91, 'talk'), 'talk');
    assert.equal(sw.step(1.0, 'idle'), 'talk');
    assert.equal(sw.step(2.21, 'idle'), 'idle');
});

test('default hysteresis matches signal-manifest (400ms / 1.2s)', () => {
    const sw = SP.createSignalPanelSwitcher();
    assert.equal(sw.enterHoldSec, 0.4);
    assert.equal(sw.exitHoldSec, 1.2);
});

test('pickAutoCareChannel ignores full needs and immature harvest breath', () => {
    const needs = L.plantNeeds('lettuce');
    const full = { sun: 1, water: 3, fertilizer: 1, stake: false };
    assert.equal(C.pickAutoCareChannel({
        faceVisible: true,
        poorReading: false,
        smiling: true,
        talking: false,
        breathingFresh: false,
        stretchEngaged: false,
        needs,
        progress: full,
        plotStaked: false,
        canHarvest: false,
        harvestBreathStarted: false,
    }), null);
    const partial = { sun: 1, water: 0, fertilizer: 0, stake: false };
    assert.equal(C.pickAutoCareChannel({
        faceVisible: true,
        poorReading: false,
        smiling: true,
        talking: true,
        breathingFresh: false,
        stretchEngaged: false,
        needs,
        progress: partial,
        plotStaked: false,
        canHarvest: false,
        harvestBreathStarted: false,
    }), 'fertilizer');
});