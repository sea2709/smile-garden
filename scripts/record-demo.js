// scripts/record-demo.js — run Electron demo automation, then encode docs/demo-smile-talk.mp4
//
//   npm run demo:video
//
// Uses the mock farmer PiP (automation) so the garden responds to smile/talk
// without requiring a live face. Breathe-as-fertilizer was removed; this demo
// shows smile → water and talk → fertilizer only.

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const outMp4 = path.join(root, 'docs', 'demo-smile-talk.mp4');
const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smile-garden-demo-'));
const ffmpegCandidates = [
    path.join(root, 'tools', 'ffmpeg'),
    'ffmpeg',
];

function findFfmpeg() {
    for (const c of ffmpegCandidates) {
        if (c === 'ffmpeg') return c;
        if (fs.existsSync(c)) return c;
    }
    return null;
}

function run(cmd, args, opts) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, Object.assign({ stdio: 'inherit' }, opts));
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code) reject(new Error(`${cmd} exited ${code}`));
            else resolve();
        });
    });
}

async function main() {
    const electron = require('electron');
    const env = Object.assign({}, process.env, {
        SMILE_GARDEN_DEMO_DIR: framesDir,
        SMILE_GARDEN_FAST: '1',
    });
    // Drop capture dir so we don't also run screenshot capture.
    delete env.SMILE_GARDEN_CAPTURE_DIR;

    console.log('[record-demo] frames →', framesDir);
    await run(electron, ['.', '--fast', '--no-sandbox'], { cwd: root, env });

    const frames = fs.readdirSync(framesDir).filter((f) => f.startsWith('frame-') && f.endsWith('.png'));
    if (frames.length < 8) {
        throw new Error(`too few frames (${frames.length}) in ${framesDir}`);
    }
    frames.sort();

    const ffmpeg = findFfmpeg();
    if (!ffmpeg) {
        throw new Error('ffmpeg not found. Place a binary at tools/ffmpeg or install ffmpeg on PATH.');
    }

    fs.mkdirSync(path.dirname(outMp4), { recursive: true });
    // ~8 fps input; mild CRF for a small uploadable clip.
    await run(ffmpeg, [
        '-y',
        '-framerate', '8',
        '-i', path.join(framesDir, 'frame-%04d.png'),
        // Electron capture can be an odd height; libx264 needs even dims.
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-crf', '23',
        '-movflags', '+faststart',
        outMp4,
    ]);

    const st = fs.statSync(outMp4);
    console.log('[record-demo] wrote', outMp4, `(${Math.round(st.size / 1024)} KB, ${frames.length} frames)`);

    // Cleanup temp frames
    for (const f of fs.readdirSync(framesDir)) {
        fs.unlinkSync(path.join(framesDir, f));
    }
    fs.rmdirSync(framesDir);
}

main().catch((err) => {
    console.error('[record-demo] failed:', err && err.stack || err);
    process.exit(1);
});
