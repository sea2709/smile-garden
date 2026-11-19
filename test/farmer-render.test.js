'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const farmer = require('../renderer/farmer-render.js');

test('SmileFarmer state priority', () => {
    const t = 100;
    assert.equal(farmer.pickName({ face: false, smile: true, talk: true, tilt: 'left' }, t), 'hidden');
    assert.equal(farmer.pickName({ face: true, hide: true, smile: true }, t), 'hidden');
    assert.equal(farmer.pickName({ face: true, tilt: 'left', smile: true }, t), 'tilt-left');
    assert.equal(farmer.pickName({ face: true, tilt: 'right', smile: true }, t), 'tilt-right');
    assert.equal(farmer.pickName({ face: true, smile: true, talk: true }, t), 'smile');
    assert.equal(farmer.pickName({ face: true, talk: true }, t), 'talk-1');
    assert.equal(farmer.pickName({ face: true, phase: 'care-harvest' }, t), 'breathe-1');
    assert.equal(farmer.pickName({ face: true }, t), 'rest');
});

test('farmer manifest frames exist', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'farmer-manifest.json'), 'utf8'));
    const check = (rel) => {
        assert.ok(fs.existsSync(path.join(root, 'assets', rel)), rel);
    };
    check(manifest.backdrops.day);
    check(manifest.backdrops.night);
    for (const st of ['rest', 'smile', 'hidden', 'tilt-left', 'tilt-right']) {
        check(manifest.states[st].day);
        check(manifest.states[st].night);
        if (manifest.states[st].figureDay) check(manifest.states[st].figureDay);
    }
    for (const rel of manifest.states.talk.framesDay) check(rel);
    for (const rel of manifest.states.breathe.framesDay) check(rel);
});