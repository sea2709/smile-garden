#!/usr/bin/env node
/**
 * Copy assets/plants/plant-meta.json into renderer/art.js (ART.plants).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const PM = require('../game/plant-meta.js');

const ROOT = path.join(__dirname, '..');
const META_PATH = path.join(ROOT, 'assets', 'plants', 'plant-meta.json');
const ART_PATH = path.join(ROOT, 'renderer', 'art.js');

function main() {
    if (!fs.existsSync(META_PATH)) {
        console.error('Missing', META_PATH);
        process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
    const plants = PM.plantsBlockFromMeta(raw);
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