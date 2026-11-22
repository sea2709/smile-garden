'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CC = require('../game/camera-check.js');
const S = require('../game/stretch.js');
const V = require('../game/visit.js');

test('lighting OK uses validation + landmark stability (no SDK light metric)', () => {
    assert.equal(CC.inferLightingOk({ faceVisible: true, validation: 'Ok', landmarksStable: true }), true);
    assert.equal(CC.inferLightingOk({ faceVisible: true, validation: 'Ok', landmarksStable: false }), false);
    assert.equal(CC.inferLightingOk({ faceVisible: true, validation: 'TooDark', landmarksStable: true }), false);
    assert.equal(CC.inferLightingOk({ faceVisible: false, validation: 'Ok', landmarksStable: true }), false);
});

test('smile check passes after ~2s above smile threshold', () => {
    const session = CC.createCameraCheckSession({ smileOn: 0.5 });
    session.select('smile');
    let snap;
    for (let i = 0; i < 50; i++) {
        snap = session.update(0.05, { faceVisible: true, happiness: 0.62, validation: 'Ok', landmarksStable: true });
    }
    assert.equal(snap.passed.smile, true);
    assert.ok(snap.smileMeter >= 1);
});

test('talk check passes after ~2s talking', () => {
    const session = CC.createCameraCheckSession({});
    session.select('talk');
    let snap;
    for (let i = 0; i < 45; i++) {
        snap = session.update(0.05, { faceVisible: true, talking: true, validation: 'Ok', landmarksStable: true });
    }
    assert.equal(snap.passed.talk, true);
});

test('camera check no longer includes breath (harvest is click)', () => {
    assert.deepEqual(CC.CHECKS, ['smile', 'talk', 'stretch']);
    const session = CC.createCameraCheckSession({});
    session.select('breath');
    assert.equal(session.active, null);
});

test('stretch check uses stretch flow both sides', () => {
    const session = CC.createCameraCheckSession({ Stretch: S });
    session.select('stretch');
    const feed = (deg, dt) => session.update(dt, {
        faceVisible: true,
        validation: 'Ok',
        landmarksStable: true,
        stretch: { points: S.syntheticLandmarks(deg), faceVisible: true, mirrored: true },
    });
    for (let i = 0; i < 50; i++) feed(-20, 0.05);
    assert.equal(session.update(0.05, {
        faceVisible: true,
        validation: 'Ok',
        landmarksStable: true,
        stretch: { points: S.syntheticLandmarks(-20), faceVisible: true, mirrored: true },
    }).stretchSnap.leftDone, true);
    for (let i = 0; i < 50; i++) feed(20, 0.05);
    const snap = session.update(0.05, {
        faceVisible: true,
        validation: 'Ok',
        landmarksStable: true,
        stretch: { points: S.syntheticLandmarks(20), faceVisible: true, mirrored: true },
    });
    assert.equal(snap.passed.stretch, true);
});

test('checks are skippable in any order', () => {
    const session = CC.createCameraCheckSession({});
    session.select('talk');
    session.skip('talk');
    assert.equal(session.snapshot().allMarked, false);
    session.skip('smile');
    session.skip('stretch');
    assert.equal(session.snapshot().allMarked, true);
});

test('warm-up / camera check always shows on start', () => {
    const state = V.createState(new Date());
    assert.equal(state.setupDone, false);
    assert.equal(CC.shouldShowCameraCheck(state), true);
    CC.finishCameraSetup(state);
    assert.equal(state.setupDone, true);
    assert.equal(CC.shouldShowCameraCheck(state), true);
    CC.markCameraCheckRequired(state, 'Camera could not start.');
    assert.equal(CC.shouldShowCameraCheck(state), true);
    assert.match(state.cameraCheckNote, /Camera/);
});

test('loadState preserves setupDone and camera note', () => {
    const raw = { version: 6, wellnessAck: true, setupDone: true, plots: [], visitDays: [], journal: [], settings: {} };
    const s = V.loadState(raw, new Date());
    assert.equal(s.setupDone, true);
    const raw2 = Object.assign({}, raw, { setupDone: false, cameraCheckNote: 'Try again' });
    const s2 = V.loadState(raw2, new Date());
    assert.equal(s2.setupDone, false);
    assert.equal(s2.cameraCheckNote, 'Try again');
});