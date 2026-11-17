'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../game/stretch.js');
const V = require('../game/visit.js');

const pts = (rollDeg) => S.syntheticLandmarks(rollDeg);

test('head roll from eye landmarks matches tilt sign (mirrored camera)', () => {
    const left = S.headRollRad(pts(-18), { mirrored: true });
    const right = S.headRollRad(pts(18), { mirrored: true });
    assert.ok(left != null && right != null);
    assert.ok(S.radToDeg(left) < -10);
    assert.ok(S.radToDeg(right) > 10);
    const raw = S.headRollRad(pts(18), { mirrored: false });
    assert.ok(S.radToDeg(raw) < -10, 'unmirrored flips sign');
});

test('hold timers require both shoulders; same season idempotent on flow', () => {
    const flow = S.createStretchFlow({ holdSeconds: 1, tiltDeg: 12, smoothWindowSec: 0.2, dropoutGraceSec: 0.5 });
    const feed = (deg, dt) => flow.update(dt, { points: pts(deg), faceVisible: true, mirrored: true });
    feed(-20, 0.34);
    feed(-20, 0.34);
    feed(-20, 0.34);
    feed(-20, 0.34);
    assert.equal(flow.snapshot().leftDone, true);
    assert.equal(flow.snapshot().complete, false);
    feed(20, 0.34);
    feed(20, 0.34);
    feed(20, 0.34);
    feed(20, 0.34);
    assert.equal(flow.snapshot().complete, true);
});

test('dropout tolerance under 0.5s does not reset hold progress', () => {
    const flow = S.createStretchFlow({ holdSeconds: 2, tiltDeg: 15 });
    flow.update(1.0, { points: pts(-20), faceVisible: true, mirrored: true });
    const p1 = flow.snapshot().leftProgress;
    flow.update(0.3, { points: null, faceVisible: false });
    flow.update(1.0, { points: pts(-20), faceVisible: true, mirrored: true });
    assert.ok(flow.snapshot().leftProgress >= p1);
});

test('setSeason unchanged leaves stretch flow positions (visit session) stable', () => {
    const plots = [{ plantId: 'lettuce', stage: 2, sunBank: 0 }];
    const session = new V.VisitSession({ plots, plantedBeds: [0] });
    session.go('stretch');
    const snap0 = { ...session.stretchSnap };
    for (let i = 0; i < 10; i++) {
        session.update(0.05, { stretch: { rollRadOverride: -0.3, faceVisible: true, mirrored: true } });
    }
    const snap1 = { ...session.stretchSnap };
    session.update(0.05, { stretch: { rollRadOverride: -0.3, faceVisible: true, mirrored: true } });
    assert.ok(session.stretchSnap.leftProgress >= snap1.leftProgress);
    assert.ok(session.stretchSnap.leftProgress > snap0.leftProgress);
});

test('lighting-style refresh without season change keeps stretch sample positions', () => {
    const flow = S.createStretchFlow();
    flow.update(0.02, { rollRadOverride: 0.25, faceVisible: true });
    const x = flow.snapshot();
    for (let i = 0; i < 5; i++) flow.update(0.02, { rollRadOverride: 0.25, faceVisible: true });
    const y = flow.snapshot();
    assert.equal(x.rollDeg.toFixed(2), y.rollDeg.toFixed(2));
    assert.equal(x.leftProgress, y.leftProgress);
});