'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PA = require('../game/plant-anchor.js');

const root = path.join(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'renderer', 'art.js'), 'utf8'), sandbox);
const ART = sandbox.window.SmileArt;

test('every plant stage has anchorX within canvas width', () => {
    for (const [id, info] of Object.entries(ART.plants)) {
        info.stages.forEach((st, i) => {
            assert.ok(Number.isFinite(st.anchorX), `${id} stage ${i + 1} anchorX`);
            assert.ok(st.anchorX >= 0 && st.anchorX <= st.w, `${id} stage ${i + 1} in bounds`);
            assert.ok(Math.abs(PA.spriteAnchorX(st) - st.anchorX) < 0.001);
        });
    }
});

test('stripAnchorX scales mound centre into effect strip frames', () => {
    const meta = ART.plants.tomato.stages[2];
    const ax = PA.stripAnchorX(meta, 200);
    assert.ok(ax > 85 && ax < 95, `tomato stage 3 strip anchor ~${ax}`);
    assert.ok(PA.stripAnchorX(null, 200) === 100);
});