#!/usr/bin/env node
/** Dump ART.plants to assets/plants/plant-meta.json (Heily stage-N keys). */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PM = require('../game/plant-meta.js');

const ROOT = path.join(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'renderer', 'art.js'), 'utf8'), sandbox);
const plants = sandbox.window.SmileArt.plants;

const out = {};
for (const [id, info] of Object.entries(plants)) {
    const key = PM.ART_TO_DIR[id] || info.dir;
    const block = {};
    for (let i = 0; i < 5; i++) {
        const st = info.stages[i];
        block[`stage-${i + 1}`] = { w: st.w, h: st.h, base: st.base, top: st.top };
    }
    const pickedSrc = path.join(ROOT, 'assets', 'plants', info.dir, 'picked.png');
    if (fs.existsSync(pickedSrc)) {
        const st = info.stages[4];
        block.picked = { w: st.w, h: st.h, base: st.base, top: st.top };
    }
    out[key] = block;
}
const dest = path.join(ROOT, 'assets', 'plants', 'plant-meta.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
console.log('Wrote', dest);