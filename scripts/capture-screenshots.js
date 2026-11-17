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
const keepPng = new Set(['breath-mockup.png', 'camera-check-mockup.png']);
if (!timeOnly && !cameraOnly) {
    for (const f of fs.readdirSync(outDir)) {
        if (f.endsWith('.png') && !keepPng.has(f)) fs.unlinkSync(path.join(outDir, f));
    }
}
const electron = require('electron'); // path to the binary when required from Node
const env = Object.assign({}, process.env, {
    SMILE_GARDEN_MOCK: '1',
    SMILE_GARDEN_FAST: '1',
    SMILE_GARDEN_CAPTURE_DIR: outDir,
    SMILE_GARDEN_TIME_SHOTS: timeOnly ? '1' : (process.env.SMILE_GARDEN_TIME_SHOTS || ''),
});
const child = spawn(electron, ['.', '--mock', '--fast', '--no-sandbox'], { cwd: root, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code || 0));
