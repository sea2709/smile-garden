#!/usr/bin/env node
/** Dump ART.plants to assets/plants/plant-meta.json (dir keys). */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'renderer', 'art.js'), 'utf8'), sandbox);
const plants = sandbox.window.SmileArt.plants;

const ART_TO_DIR = {
    apple: 'apple-tree',
};

const out = {};
for (const [id, info] of Object.entries(plants)) {
    const key = ART_TO_DIR[id] || info.dir;
    out[key] = {
        dir: info.dir,
        stages: info.stages.map((st) => ({
            w: st.w,
            h: st.h,
            base: st.base,
            top: st.top,
        })),
        picked: { ...info.stages[4] },
    };
}
const dest = path.join(ROOT, 'assets', 'plants', 'plant-meta.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log('Wrote', dest);