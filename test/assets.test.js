// Checks that the painted art manifest matches the files shipped in assets/.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const L = require('../game/logic.js');

const root = path.join(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'renderer', 'art.js'), 'utf8'), sandbox);
const ART = sandbox.window.SmileArt;
const fromRenderer = (rel) => path.join(root, 'renderer', rel);

test('art manifest: 4 backdrops, 8 plots inside the 1280x720 frame', () => {
    assert.deepEqual(Object.keys(ART.backgrounds).sort(), ['dawn', 'golden-hour', 'midday', 'night']);
    for (const src of Object.values(ART.backgrounds)) assert.ok(fs.existsSync(fromRenderer(src)), src);
    assert.equal(ART.plots.length, 8);
    for (const p of ART.plots) {
        const [x0, y0, x1, y1] = p.box;
        assert.ok(x0 >= 0 && y0 >= 0 && x1 <= ART.width && y1 <= ART.height);
        assert.ok(p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1);
    }
});

test('every plant in the game has 5 painted stages and UI cards exist', () => {
    for (const p of L.PLANTS) {
        assert.ok(ART.plants[p.id], `art for ${p.id}`);
        assert.equal(ART.plants[p.id].stages.length, 5);
        for (let s = 1; s <= 5; s++) assert.ok(fs.existsSync(fromRenderer(ART.plantSrc(p.id, s))), `${p.id} stage ${s}`);
    }
    for (const m of ['sun', 'water', 'fertilizer']) {
        assert.ok(fs.existsSync(path.join(root, 'assets', 'ui', `meter-${m}.png`)));
        assert.equal(ART.meters[m].dots.length, 7);
    }
    assert.ok(fs.existsSync(fromRenderer(ART.card)));
});

test('harvest art: ready loops and per-plant harvest strips', () => {
    assert.ok(ART.harvest);
    for (const kind of ['day', 'night']) {
        assert.ok(fs.existsSync(fromRenderer(ART.readyStripSrc(kind))), `ready ${kind}`);
    }
    for (const id of ART.harvest.plantIds) {
        for (const kind of ['day', 'night']) {
            assert.ok(fs.existsSync(fromRenderer(ART.harvestStripSrc(id, kind))), `${id} ${kind}`);
        }
    }
    assert.ok(fs.existsSync(fromRenderer(ART.produce.basket)));
    for (const p of L.PLANTS) {
        assert.ok(fs.existsSync(fromRenderer(ART.produce.src(p.id))), `produce ${p.id}`);
        assert.ok(fs.existsSync(fromRenderer(ART.produce.src64(p.id))), `produce-64 ${p.id}`);
    }
    for (const id of ['tomato', 'mint', 'cucumber', 'apple']) {
        const src = ART.plantPickedSrc(id);
        assert.ok(src && fs.existsSync(fromRenderer(src)), `picked ${id}`);
        assert.ok(ART.plants[id].picked, `picked meta ${id}`);
    }
});

test('selection ring art: 8 day/night sprites and backdrop offsets', () => {
    assert.ok(ART.selection);
    for (let b = 1; b <= 8; b++) {
        const key = 'bed' + b;
        assert.ok(Array.isArray(ART.selection.offsets[key]) && ART.selection.offsets[key].length === 2, key);
        assert.ok(fs.existsSync(fromRenderer(ART.selection.src('day', b - 1))), `day bed ${b}`);
        assert.ok(fs.existsSync(fromRenderer(ART.selection.src('night', b - 1))), `night bed ${b}`);
    }
});
