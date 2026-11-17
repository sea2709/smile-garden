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

test('harvest art: ready loops, per-plant harvest strips, generic fallback, pantry UI', () => {
    assert.ok(ART.harvest);
    for (const kind of ['day', 'night']) {
        assert.ok(fs.existsSync(fromRenderer(ART.readyStripSrc(kind))), `ready ${kind}`);
        assert.ok(fs.existsSync(fromRenderer(ART.genericHarvestStripSrc(kind))), `generic harvest ${kind}`);
    }
    for (const id of ART.harvest.plantIds) {
        for (const kind of ['day', 'night']) {
            assert.ok(fs.existsSync(fromRenderer(ART.harvestStripSrc(id, kind))), `${id} ${kind}`);
        }
    }
    assert.ok(fs.existsSync(fromRenderer(ART.produce.basket)));
    for (const p of L.PLANTS) {
        assert.ok(fs.existsSync(fromRenderer(ART.produce.src(p.id))), `produce ${p.id}`);
    }
    assert.equal(ART.produce.size, 128);
    assert.ok(ART.pantry && ART.pantry.cubbies.length === 6);
    assert.ok(fs.existsSync(fromRenderer(ART.pantry.src)));
    assert.ok(fs.existsSync(fromRenderer(ART.ui.unlockSeedCard)));
    for (const id of ['tomato', 'mint', 'cucumber', 'apple']) {
        const src = ART.plantPickedSrc(id);
        assert.ok(src && fs.existsSync(fromRenderer(src)), `picked ${id}`);
        assert.ok(!ART.plants[id].picked, `picked uses stage-5 geometry for ${id}`);
        assert.ok(ART.plants[id].stages[4], `stage-5 meta ${id}`);
    }
});

test('decoration art and per-spot scale', () => {
    for (const id of ART.decor.ids) {
        for (const kind of ['day', 'night']) {
            assert.ok(fs.existsSync(fromRenderer(ART.decor.src(id, kind))), `${id} ${kind}`);
        }
    }
    for (const spot of ART.decorSpots) {
        assert.ok(typeof spot.scale === 'number' && spot.scale > 0 && spot.scale < 2, spot.id);
    }
});

const CRITTER_FILES = {
    'butterfly-monarch': 'butterfly-monarch-strip.png',
    'butterfly-white': 'butterfly-white-strip.png',
    bee: 'bee-strip.png',
};

function critterManifestEntries(manifest) {
    if (manifest.strips) {
        return Object.entries(manifest.strips).map(([key, spec]) => [key, spec]);
    }
    return Object.entries(manifest)
        .filter(([key]) => CRITTER_FILES[key])
        .map(([key, spec]) => [key, {
            file: CRITTER_FILES[key],
            frameW: spec.size[0],
            frameH: spec.size[1],
            fps: spec.fps,
            frames: spec.frames,
        }]);
}

test('critter strips and day backdrops without painted insects', () => {
    assert.ok(ART.critters);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'critters', 'manifest.json'), 'utf8'));
    for (const [key, spec] of critterManifestEntries(manifest)) {
        assert.ok(ART.critters.strips[key], `art critters ${key}`);
        assert.equal(ART.critters.strips[key].frameW, spec.frameW);
        assert.equal(ART.critters.strips[key].fps, spec.fps);
        assert.ok(fs.existsSync(path.join(root, 'assets', 'critters', spec.file)), spec.file);
        const buf = fs.readFileSync(path.join(root, 'assets', 'critters', spec.file));
        const w = buf.readUInt32BE(16);
        const Cmod = require('../game/critters.js');
        const frames = Cmod.stripFrameCount(w, spec.frameW);
        assert.equal(frames, spec.frames, `${key} frame count`);
    }
    for (const day of ['dawn', 'midday', 'golden-hour']) {
        assert.ok(ART.backgrounds[day].endsWith('.png'), day);
    }
    assert.ok(fs.existsSync(fromRenderer(ART.ui.logoDay)));
    assert.ok(fs.existsSync(fromRenderer(ART.ui.logoNight)));
    assert.equal(ART.logoHud.w, 184);
    assert.equal(ART.logoHud.h, 49);
    assert.equal(ART.critters.strips['butterfly-monarch'].scale, 0.32);
    assert.equal(ART.critters.strips.bee.scale, 0.28);
});

test('time-of-day art matches assets/time-manifest.json', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'time-manifest.json'), 'utf8'));
    assert.ok(fs.existsSync(fromRenderer(ART.clock.frameSrc('day'))));
    assert.ok(fs.existsSync(fromRenderer(ART.clock.frameSrc('night'))));
    assert.ok(fs.existsSync(fromRenderer(ART.clock.frontSrc('day'))));
    assert.ok(fs.existsSync(fromRenderer(ART.clock.sunSrc)));
    assert.ok(fs.existsSync(fromRenderer(ART.bedtime.windowGlow)));
    assert.ok(fs.existsSync(fromRenderer(ART.bedtime.morningCard)));
    assert.ok(fs.existsSync(fromRenderer(ART.bedtime.bedButtonIcon)));
    for (const list of Object.values(ART.seasons.particlePools)) {
        for (const name of list) {
            assert.ok(fs.existsSync(fromRenderer(ART.seasons.particleSrc(name))), name);
        }
    }
    assert.equal(ART.clock.arc.centerX, manifest.clock.arc.centerX);
    assert.equal(ART.clock.arc.startDeg, manifest.clock.arc.startDeg);
});

test('breath UI art: manifest pills, icons, dots and breath-ui.css', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'breath-manifest.json'), 'utf8'));
    assert.equal(manifest.scale, 2);
    for (const key of ['warming', 'settling', 'stable']) {
        const pill = manifest.pills[key];
        assert.equal(pill.display.height, 32, `${key} pill height`);
        assert.ok(fs.existsSync(path.join(root, 'assets', pill.file)), pill.file);
        const icon = manifest.icons[key];
        assert.ok(fs.existsSync(path.join(root, 'assets', icon.file)), icon.file);
    }
    for (const key of ['on', 'off']) {
        const dot = manifest.dots[key];
        assert.deepEqual(dot.display, [18, 18]);
        assert.ok(fs.existsSync(path.join(root, 'assets', dot.file)), dot.file);
    }
    assert.ok(fs.existsSync(path.join(root, 'renderer', 'breath-ui.css')));
    assert.ok(fs.existsSync(path.join(root, 'docs', 'breath-mockup.png')));
});

test('camera check art: manifest paths, css, and art spec doc', () => {
    assert.ok(ART.cameraCheck);
    assert.ok(ART.cameraCheck.frame.includes('camera-check'));
    for (const key of ['smile', 'talk', 'breath', 'stretch']) {
        assert.ok(ART.cameraCheck.icons[key].includes(key), key);
    }
    assert.ok(ART.cameraCheck.checkPass.includes('check'));
    assert.ok(fs.existsSync(path.join(root, 'renderer', 'camera-check-ui.css')));
    assert.ok(fs.existsSync(path.join(root, 'docs', 'ART-CAMERA-CHECK.md')));
    assert.ok(fs.existsSync(path.join(root, 'game', 'camera-check.js')));
});

test('stretch UI art: manifest paths, css, and art spec doc', () => {
    assert.ok(ART.needs);
    assert.ok(ART.needs.plantTag.includes('needs/'));
    assert.ok(ART.needs.bloomStamp.includes('bloom'));
    assert.ok(ART.needs.restingLeaf.includes('resting-leaf'));
    assert.ok(ART.tendedSoil);
    assert.ok(ART.plantTendedSoilSrc('day', 0).includes('tended-soil-day-bed1'));
    assert.ok(ART.plantTendedSoilSrc('night', 7).includes('tended-soil-night-bed8'));
    assert.ok(fs.existsSync(path.join(root, 'renderer', 'needs-ui.css')));
    assert.ok(ART.stretch);
    assert.ok(ART.stretch.guideSunflower.includes('stretch/'));
    assert.ok(ART.stretch.stakeDay.includes('stake-day'));
    assert.ok(ART.stretch.stakeNight.includes('stake-night'));
    assert.ok(ART.stretch.guideSunflowerHead.includes('head'));
    assert.ok(ART.plantStakeSrc('day').includes('stake-day'));
    assert.ok(ART.plantStakeLoopSrc('night').includes('stake-loop'));
    assert.ok(fs.existsSync(path.join(root, 'renderer', 'stretch-ui.css')));
    assert.ok(fs.existsSync(path.join(root, 'docs', 'ART-NEEDS.md')));
    assert.ok(fs.existsSync(path.join(root, 'game', 'stretch.js')));
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