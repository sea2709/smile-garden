#!/usr/bin/env node
/**
 * Copy assets/plants/plant-meta.json into renderer/art.js (ART.plants).
 * Dir keys in meta (e.g. apple-tree) map to ART ids (apple).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const META_PATH = path.join(ROOT, 'assets', 'plants', 'plant-meta.json');
const ART_PATH = path.join(ROOT, 'renderer', 'art.js');

const DIR_TO_ART = {
    lettuce: 'lettuce',
    mint: 'mint',
    cucumber: 'cucumber',
    tomato: 'tomato',
    sunflower: 'sunflower',
    'apple-tree': 'apple',
};

function artIdForEntry(key, entry) {
    if (DIR_TO_ART[key]) return DIR_TO_ART[key];
    if (entry && entry.dir && DIR_TO_ART[entry.dir]) return DIR_TO_ART[entry.dir];
    if (entry && entry.dir) return entry.dir;
    return key;
}

function stagesFromEntry(entry) {
    const stages = entry.stages.map((st) => ({
        w: st.w,
        h: st.h,
        base: st.base,
        top: st.top,
    }));
    if (entry.picked && stages.length >= 5) {
        const pk = entry.picked;
        stages[4] = { w: pk.w, h: pk.h, base: pk.base, top: pk.top };
    }
    return stages;
}

function main() {
    if (!fs.existsSync(META_PATH)) {
        console.error('Missing', META_PATH);
        process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
    const plants = {};
    for (const [key, entry] of Object.entries(raw)) {
        const id = artIdForEntry(key, entry);
        const dir = entry.dir || key;
        plants[id] = {
            dir,
            stages: stagesFromEntry(entry),
        };
    }
    const artText = fs.readFileSync(ART_PATH, 'utf8');
    const plantsJson = JSON.stringify(plants);
    const next = artText.replace(
        /(\s+plants:\s*)\{[\s\S]*?\},\s*meters:/,
        `$1${plantsJson},\n        meters:`,
    );
    if (next === artText) {
        console.error('Could not find plants block in art.js');
        process.exit(1);
    }
    const comment =
        '// Plant sprites: per stage {w, h, base (stem foot y), top}. Horizontal center is canvas midpoint (Heily-centered art).\n';
    const withComment = next.replace(/\/\/ Plant sprites:[^\n]+\n/, comment);
    fs.writeFileSync(ART_PATH, withComment);
    console.log('Updated ART.plants from', META_PATH);
}

main();