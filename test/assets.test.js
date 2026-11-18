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
    for (const m of ['sun', 'water', 'fertilizer', 'stake']) {
        const file = m === 'stake' ? 'meter-stake.png' : `meter-${m}.png`;
        assert.ok(fs.existsSync(path.join(root, 'assets', 'ui', file)));
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

test('camera check art matches assets/ui/camera-check/camera-check-manifest.json', () => {
    const manifestPath = path.join(root, 'assets', 'ui', 'camera-check', 'camera-check-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(ART.cameraCheck);
    assert.equal(ART.cameraCheck.layout.camera.w, manifest.camera_rect[2]);
    assert.equal(ART.cameraCheck.layout.windowFrame.w, manifest.assets['window-frame.png'].display_size[0]);
    assert.equal(ART.cameraCheck.packetDisplay[0], manifest.packets.display_size[0]);
    assert.equal(ART.cameraCheck.layout.packetCenters.smile, manifest.packets.centers_x.smile);
    assert.equal(ART.cameraCheck.layout.btnStart.h, manifest.buttons.start.rect[3]);
    assert.ok(ART.cameraCheck.packetSrc('smile', 'sprouted').includes('packet-smile-sprouted'));
    assert.ok(ART.cameraCheck.packetSrc('breath', 'listening').includes('packet-breathe-listening'));
    assert.ok(ART.cameraCheck.packetSrc('breath', 'closed').includes('packet-breathe-closed'));
    for (const rel of Object.keys(manifest.assets)) {
        const ent = manifest.assets[rel];
        const file = ent.file.replace(/^assets\//, '');
        assert.ok(fs.existsSync(path.join(root, 'assets', file)), file);
        if (ent.png_size) {
            const buf = fs.readFileSync(path.join(root, 'assets', file));
            assert.equal(buf.readUInt32BE(16), ent.png_size[0], `${rel} width`);
            assert.equal(buf.readUInt32BE(20), ent.png_size[1], `${rel} height`);
        }
    }
    assert.ok(fs.existsSync(path.join(root, 'renderer', 'camera-check-ui.css')));
    assert.ok(fs.existsSync(path.join(root, 'docs', 'ART-CAMERA-CHECK.md')));
    assert.ok(fs.existsSync(path.join(root, 'docs', 'camera-check-mockup.png')));
    assert.ok(fs.existsSync(path.join(root, 'game', 'camera-check.js')));
});

test('stake art matches assets/stake-manifest.json', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'stake-manifest.json'), 'utf8'));
    assert.equal(ART.meters.stake.w, manifest.meter.w);
    assert.equal(
        JSON.stringify(ART.meters.stake.dots),
        JSON.stringify(manifest.meter.dots),
        'stake meter dots match manifest',
    );
    assert.ok(fs.existsSync(path.join(root, 'assets', manifest.meter.file)));
    assert.ok(fs.existsSync(path.join(root, 'assets', manifest.icon.files[0])));
    assert.ok(fs.existsSync(path.join(root, 'assets', manifest.icon.files[1])));
    assert.equal(ART.stretch.headArmLength, manifest.guide.head.armLength / 2);
    assert.equal(ART.stretch.stakeSprites.tall.base, manifest.stake.sprites.tall.base);
    for (const name of manifest.effects.names) {
        const file = `effects/${name}-strip.png`;
        assert.ok(fs.existsSync(path.join(root, 'assets', file)), file);
        assert.deepEqual(manifest.files[file], [2400, 320]);
    }
    for (const rel of Object.keys(manifest.files)) {
        if (rel.startsWith('effects/')) continue;
        assert.ok(fs.existsSync(path.join(root, 'assets', rel)), rel);
        const [w, h] = manifest.files[rel];
        const buf = fs.readFileSync(path.join(root, 'assets', rel));
        assert.equal(buf.readUInt32BE(16), w, `${rel} width`);
        assert.equal(buf.readUInt32BE(20), h, `${rel} height`);
    }
});

test('tags art matches assets/tags-manifest.json', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'tags-manifest.json'), 'utf8'));
    assert.equal(JSON.stringify(ART.needs.tagPixels), JSON.stringify(manifest.tag.px));
    assert.equal(JSON.stringify(ART.needs.tagAnchor), JSON.stringify(manifest.tag.anchor));
    assert.equal(JSON.stringify(ART.needs.faceBox), JSON.stringify(manifest.tag.faceBox));
    assert.equal(ART.needs.cardPixels[0], manifest.card.px[0]);
    assert.equal(ART.needs.cardDisplay[0], manifest.card.display[0]);
    assert.ok(fs.existsSync(path.join(root, 'assets', manifest.tag.day)));
    assert.ok(fs.existsSync(path.join(root, 'assets', manifest.tag.night)));
    assert.ok(fs.existsSync(path.join(root, 'assets', manifest.card.file)));
    assert.ok(manifest.card.night);
    assert.equal(ART.needs.needsCardNight.includes('needs-card-night'), true);
    assert.ok(fs.existsSync(path.join(root, 'assets', manifest.card.night)));
    const nightCard = fs.readFileSync(path.join(root, 'assets', manifest.card.night));
    assert.equal(nightCard.readUInt32BE(16), manifest.card.px[0], 'needs-card-night width');
    assert.equal(nightCard.readUInt32BE(20), manifest.card.px[1], 'needs-card-night height');
    for (let b = 1; b <= 8; b++) {
        const key = 'bed' + b;
        assert.equal(JSON.stringify(ART.needs.tagSpots[key].anchor), JSON.stringify(manifest.tag.beds[key].anchor));
        assert.equal(ART.needs.tagSpots[key].scale, manifest.tag.beds[key].scale);
        assert.equal(JSON.stringify(ART.needs.soilBeds[key].pos), JSON.stringify(manifest.soil.beds[key].pos));
        assert.ok(fs.existsSync(path.join(root, 'assets', `scene/soil/soil-day-bed${b}.png`)), key);
        assert.ok(fs.existsSync(path.join(root, 'assets', `scene/soil/soil-night-bed${b}.png`)), key);
        const buf = fs.readFileSync(path.join(root, 'assets', `scene/soil/soil-day-bed${b}.png`));
        assert.equal(buf.readUInt32BE(16), manifest.soil.beds[key].px[0], `${key} soil w`);
        assert.equal(buf.readUInt32BE(20), manifest.soil.beds[key].px[1], `${key} soil h`);
    }
    for (const key of ['sun', 'water', 'fertilizer', 'stake']) {
        assert.ok(fs.existsSync(path.join(root, 'assets', manifest.icons[key].file)), key);
    }
    if (manifest.passiveSun) {
        for (const k of Object.keys(manifest.passiveSun.levels)) {
            const e = manifest.passiveSun.levels[k];
            assert.ok(fs.existsSync(path.join(root, 'assets', e.file)), e.file);
            assert.ok(fs.existsSync(path.join(root, 'assets', e.night)), e.night);
        }
        assert.ok(fs.existsSync(path.join(root, 'assets', manifest.passiveSun.resting.file)));
        assert.ok(fs.existsSync(path.join(root, 'assets', manifest.passiveSun.badge.file)));
        assert.ok(fromRenderer(ART.needs.harvestReadyBadge).includes('harvest-badge'));
        assert.ok(fs.existsSync(fromRenderer(ART.needs.harvestReadyBadgeGlow)));
        assert.ok(fs.existsSync(fromRenderer(ART.harvestPrompt64Src('day'))));
    }
    assert.ok(fs.existsSync(path.join(root, 'assets', manifest.icons.bloom.file)));
    assert.ok(fs.existsSync(path.join(root, 'assets', manifest.icons.resting.file)));
});

test('stretch UI art: manifest paths, css, and art spec doc', () => {
    assert.ok(ART.needs);
    assert.ok(ART.needs.plantTagDay.includes('ui/tag/plant-tag-day'));
    assert.ok(ART.needs.bloomStamp.includes('bloom-stamp'));
    assert.ok(ART.needs.restingLeaf.includes('resting-leaf'));
    assert.ok(ART.tendedSoil);
    assert.ok(ART.plantTendedSoilSrc('day', 0).includes('scene/soil/soil-day-bed1'));
    assert.ok(ART.plantTendedSoilSrc('night', 7).includes('scene/soil/soil-night-bed8'));
    assert.ok(fs.existsSync(path.join(root, 'renderer', 'needs-ui.css')));
    assert.ok(ART.stretch);
    assert.ok(ART.stretch.guideStem.includes('guide-stem'));
    assert.ok(ART.stretch.guideHead.includes('guide-head'));
    assert.ok(ART.stretch.ringTrack.includes('ring-track'));
    assert.ok(ART.stretch.stakeTallDay.includes('stake-tall-day'));
    assert.ok(ART.plantStakeSrc('sunflower', 4).includes('stake-tall-day'));
    assert.ok(ART.plantStakeSrc('lettuce', 2).includes('stake-short-day'));
    assert.equal(ART.stakeOffsetXForPlant('tomato'), -56);
    assert.ok(ART.needs.iconStake.includes('care/icon-stake'));
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