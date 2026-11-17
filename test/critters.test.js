'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../game/critters.js');

test('stripFrameCount divides strip width by frame width', () => {
    assert.equal(C.stripFrameCount(1024, 128), 8);
    assert.equal(C.stripFrameCount(448, 112), 4);
    assert.equal(C.stripFrameCount(1000, 128), 7);
});

test('animFrameIndex advances with time and wraps', () => {
    assert.equal(C.animFrameIndex(0, 12, 8, {}), 0);
    assert.equal(C.animFrameIndex(1 / 12, 12, 8, {}), 1);
    assert.equal(C.animFrameIndex(4 / 12, 12, 8, {}), 4);
    assert.equal(C.animFrameIndex(100, 12, 8, {}), 0);
    assert.equal(C.animFrameIndex(2, 12, 8, { reducedMotion: true }), 0);
    assert.equal(C.animFrameIndex(2 / 12, 12, 8, { motionScale: 0.5 }), 1);
});

test('butterflyHeadingRad turns up-facing art toward velocity', () => {
    assert.ok(Math.abs(C.butterflyHeadingRad(0, -1) - 0) < 0.001);
    assert.ok(Math.abs(C.butterflyHeadingRad(1, 0) - Math.PI / 2) < 0.001);
    assert.ok(Math.abs(C.butterflyHeadingRad(0, 1) - Math.PI) < 0.001);
});

test('beeFlipX mirrors when moving right', () => {
    assert.equal(C.beeFlipX(-1), false);
    assert.equal(C.beeFlipX(0.2), true);
    assert.equal(C.beeFlipX(0), false);
});

test('critterDayAlpha fades during day/night transition', () => {
    assert.equal(C.critterDayAlpha('midday', 'midday', 1), 1);
    assert.equal(C.critterDayAlpha('night', 'night', 1), 0);
    assert.equal(C.critterDayAlpha('night', 'midday', 0), 1);
    assert.equal(C.critterDayAlpha('night', 'midday', 1), 0);
    assert.equal(C.critterDayAlpha('midday', 'night', 0), 0);
    assert.ok(C.critterDayAlpha('midday', 'night', 0.5) > 0.4);
});

test('wanderPosition keeps critters inside garden and below HUD band', () => {
    const bounds = { width: 1280, height: 720, hudTop: 92, margin: 48 };
    const entry = { anchor: [50, 50], phase: 0, ampX: 200, ampY: 40, pathSpeed: 0.3 };
    for (let t = 0; t < 20; t += 0.7) {
        const p = C.wanderPosition(entry, t, bounds);
        assert.ok(p.x >= bounds.margin && p.x <= bounds.width - bounds.margin);
        assert.ok(p.y >= bounds.hudTop + 16);
        assert.ok(Number.isFinite(p.vx) && Number.isFinite(p.vy));
    }
});