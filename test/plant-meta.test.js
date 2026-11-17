'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PM = require('../game/plant-meta.js');

const root = path.join(__dirname, '..');
const metaPath = path.join(root, 'assets', 'plants', 'plant-meta.json');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'renderer', 'art.js'), 'utf8'), sandbox);
const ART = sandbox.window.SmileArt;

test('plant-meta.json matches ART.plants and on-disk PNG dimensions', () => {
    assert.ok(fs.existsSync(metaPath), 'assets/plants/plant-meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    for (const [key, entry] of Object.entries(meta)) {
        const id = PM.artIdForMetaKey(key);
        const art = ART.plants[id];
        assert.ok(art, `ART.plants.${id}`);
        assert.equal(art.dir, PM.dirForMetaKey(key));
        assert.equal(art.stages.length, 5);
        const pk = PM.pickedMetaFromEntry(entry);
        for (let i = 0; i < 5; i++) {
            const st = art.stages[i];
            const mst = PM.stageMetaFromEntry(entry, i + 1);
            assert.ok(mst, `${key} stage ${i + 1} meta`);
            const expect = i === 4 && pk ? pk : mst;
            assert.equal(st.w, expect.w, `${id} stage ${i + 1} w`);
            assert.equal(st.h, expect.h, `${id} stage ${i + 1} h`);
            assert.equal(st.base, expect.base, `${id} stage ${i + 1} base`);
            assert.equal(st.top, expect.top, `${id} stage ${i + 1} top`);
            assert.ok(st.base > st.top, `${id} stage ${i + 1} base below top`);
            const rel = path.join(root, 'renderer', ART.plantSrc(id, i + 1));
            assert.ok(fs.existsSync(rel), rel);
            const buf = fs.readFileSync(rel);
            const w = buf.readUInt32BE(16);
            const h = buf.readUInt32BE(20);
            assert.equal(w, st.w, `${id} stage ${i + 1} png width`);
            assert.equal(h, st.h, `${id} stage ${i + 1} png height`);
        }
        if (pk) {
            const st = art.stages[4];
            assert.equal(st.w, pk.w, `${id} picked w`);
            assert.equal(st.h, pk.h, `${id} picked h`);
            assert.equal(st.base, pk.base, `${id} picked base`);
            assert.equal(st.top, pk.top, `${id} picked top`);
            const pickedPath = path.join(root, 'renderer', ART.plantPickedSrc(id));
            assert.ok(pickedPath && fs.existsSync(pickedPath), `picked ${id}`);
            const buf = fs.readFileSync(pickedPath);
            assert.equal(buf.readUInt32BE(16), pk.w);
            assert.equal(buf.readUInt32BE(20), pk.h);
        }
        for (const st of art.stages) {
            assert.ok(!('anchorX' in st), `${id} should not use anchorX`);
        }
    }
});

test('plot soil anchors sit near measured bed centroids (backdrop px)', () => {
    const expectY = [369, 369, 369, 369, 494, 504, 504, 506];
    const expectX = [347, 554, 761, 968, 283, 528, 771, 1027];
    for (let i = 0; i < 8; i++) {
        const p = ART.plots[i];
        assert.ok(Math.abs(p.y - expectY[i]) <= 4, `bed ${i + 1} y ~${expectY[i]} (got ${p.y})`);
        assert.ok(Math.abs(p.x - expectX[i]) <= 8, `bed ${i + 1} x ~${expectX[i]} (got ${p.x})`);
    }
});