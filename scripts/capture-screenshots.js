// scripts/capture-screenshots.js — run the game in mock mode and save fresh
// screenshots to docs/ (all four lightings, a smile / talk / breathing step,
// the summary, the journal tabs, the night "turn on a light" hint and a
// fuller garden). Uses a throwaway profile, so your saved garden is untouched.
//
//   npm run screenshots          (on Linux without a display: xvfb-run -a npm run screenshots)

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'docs');
fs.mkdirSync(outDir, { recursive: true });
const timeOnly = process.env.SMILE_GARDEN_TIME_SHOTS === '1';
const cameraOnly = process.env.SMILE_GARDEN_CAPTURE_CAMERA_ONLY === '1';
const stakeOnly = process.env.SMILE_GARDEN_STAKE_SHOTS === '1';
const tagsOnly = process.env.SMILE_GARDEN_TAGS_SHOTS === '1';
const stripGlowOnly = process.env.SMILE_GARDEN_STRIP_GLOW_ONLY === '1';
const keepPng = new Set([
    'breath-mockup.png', 'camera-check-mockup.png',
    '02-greeting-dawn.png', '08-summary-growth.png', '10-greeting-night.png', '11-night-light-hint.png',
    '12-night-garden-fireflies.png', '13-journal-diary.png', '14-journal-my-plants.png', '15-journal-seed-library.png',
    '16-full-garden-midday.png', '17-full-garden-dawn.png', '19-full-garden-night.png',
    '20-demo-tools.png', 'bedtime-window-glow.png', 'morning-card.png', 'stake-ring-midfill.png',
    'clock-dawn.png', 'clock-dawn-6am.png', 'clock-dusk.png', 'clock-night.png', 'clock-noon.png', 'clock-sunset-6pm.png',
    'logo-day-full.png', 'logo-night-full.png', 'logo-night-garden.png',
    'topbar-dawn-6am-2x.png', 'topbar-dusk-6pm-2x.png', 'topbar-logo-day-2x.png', 'topbar-logo-night-2x.png', 'topbar-night-2x.png', 'topbar-noon-2x.png',
    'season-spring.png', 'season-summer.png', 'season-autumn.png', 'season-winter.png',
    'plant-center-before.png', 'plant-center-after.png', 'plant-center-night.png',
    '07a-breath-rate-warming.png', '07b-breath-rate-settling.png', '07c-breath-rate-stable.png', '07d-stretch-offer.png',
    '07f-stretch-right-hold.png', '07g-stretch-complete.png', '07-breath-pill-count-2x.png',
    'needs-tag-complete-soil-day.png', 'needs-tag-resting-morning-day.png', 'needs-tag-night.png', 'needs-garden-tags-midday.png',
    'plants-clean-mature-garden.png', 'plants-clean-picked-garden.png',
]);
if (!timeOnly && !cameraOnly && !stakeOnly && !tagsOnly && !stripGlowOnly) {
    for (const f of fs.readdirSync(outDir)) {
        if (f.endsWith('.png') && !keepPng.has(f)) fs.unlinkSync(path.join(outDir, f));
    }
}
const electron = require('electron'); // path to the binary when required from Node
const env = Object.assign({}, process.env, {
    SMILE_GARDEN_MOCK: '1',
    SMILE_GARDEN_FAST: '1',
    SMILE_GARDEN_CAPTURE_DIR: outDir,
    SMILE_GARDEN_CAPTURE_CAMERA_ONLY: cameraOnly ? '1' : (process.env.SMILE_GARDEN_CAPTURE_CAMERA_ONLY || ''),
    SMILE_GARDEN_TIME_SHOTS: timeOnly ? '1' : (process.env.SMILE_GARDEN_TIME_SHOTS || ''),
    SMILE_GARDEN_STAKE_SHOTS: stakeOnly ? '1' : (process.env.SMILE_GARDEN_STAKE_SHOTS || ''),
    SMILE_GARDEN_TAGS_SHOTS: tagsOnly ? '1' : (process.env.SMILE_GARDEN_TAGS_SHOTS || ''),
    SMILE_GARDEN_STRIP_GLOW_ONLY: stripGlowOnly ? '1' : (process.env.SMILE_GARDEN_STRIP_GLOW_ONLY || ''),
});
const child = spawn(electron, ['.', '--mock', '--fast', '--no-sandbox'], { cwd: root, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code || 0));
