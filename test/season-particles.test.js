'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SP = require('../game/season-particles.js');

const POOLS = Object.freeze({
    spring: ['petal-1', 'petal-2'],
    summerDay: ['seed-fluff', 'pollen'],
    summerNight: ['firefly'],
    autumn: ['leaf-1', 'leaf-2'],
    winter: ['snowflake-1'],
});

function snapXY(engine) {
    return engine.particles.map((p) => ({ x: p.x, y: p.y, sprite: p.sprite }));
}

test('setSeason with the same season leaves particle positions unchanged', () => {
    const eng = SP.createEngine({ width: 1280, height: 720, pools: POOLS, seed: 11, count: 8 });
    eng.setSeason('spring');
    const first = snapXY(eng);
    eng.setSeason('spring');
    eng.setSeason('spring');
    assert.deepEqual(snapXY(eng), first);
});

test('setSeason with a different season reseeds particles', () => {
    const eng = SP.createEngine({ width: 1280, height: 720, pools: POOLS, seed: 11, count: 8 });
    eng.setSeason('spring');
    const spring = snapXY(eng);
    eng.setSeason('autumn');
    const autumn = snapXY(eng);
    assert.notDeepEqual(spring, autumn);
});

test('refreshLighting-style repeated calls across summer night boundary do not move particles', () => {
    const eng = SP.createEngine({ width: 1280, height: 720, pools: POOLS, seed: 99, count: 6 });
    eng.setSeason('summer');
    eng.setNightWeight(0.2);
    eng.update(0.02, 0.5);
    const atDay = snapXY(eng);
    for (let i = 0; i < 5; i++) eng.applyLighting({ season: 'summer', nightWeight: 0.2 });
    assert.deepEqual(snapXY(eng), atDay);
    eng.applyLighting({ season: 'summer', nightWeight: 0.7 });
    const afterDusk = snapXY(eng);
    assert.deepEqual(atDay.map((p) => ({ x: p.x, y: p.y })), afterDusk.map((p) => ({ x: p.x, y: p.y })));
    assert.ok(afterDusk.every((p) => p.sprite === 'firefly'));
    eng.applyLighting({ season: 'summer', nightWeight: 0.85 });
    assert.deepEqual(snapXY(eng).map((p) => ({ x: p.x, y: p.y })), afterDusk.map((p) => ({ x: p.x, y: p.y })));
});

test('3-frame night trace: positions drift smoothly (no refreshLighting teleport)', () => {
    const eng = SP.createEngine({ width: 1280, height: 720, pools: POOLS, seed: 7, count: 4 });
    eng.setSeason('spring');
    eng.setNightWeight(0.92);
    const trace = [];
    const dt = 1 / 60;
    for (let frame = 0; frame < 3; frame++) {
        eng.applyLighting({ season: 'spring', nightWeight: 0.92 });
        const p0 = eng.particles[0];
        trace.push({ frame, x: p0.x, y: p0.y });
        eng.update(dt, frame * dt);
    }
    assert.ok(trace[1].y > trace[0].y, 'particle drifts downward');
    assert.ok(trace[2].y > trace[1].y, 'particle keeps drifting');
    const hop0 = Math.hypot(trace[1].x - trace[0].x, trace[1].y - trace[0].y);
    const hop1 = Math.hypot(trace[2].x - trace[1].x, trace[2].y - trace[1].y);
    assert.ok(hop0 < 80 && hop1 < 80, 'steps are small drift hops, not full-screen teleports');
});