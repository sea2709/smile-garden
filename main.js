// main.js — Electron main process for Smile Garden.
//
// Same architecture as Emotion Mirror and Breath Balloon (per
// https://smartspectra.presagetech.com/docs/nodejs.md, "Electron integration",
// and the official electron-quickstart sample):
//   * The native SmartSpectra pipeline runs HERE, in the main process, owned
//     by `bindSmartSpectraIpc(win)` from `@smartspectra/node-sdk/main`.
//   * The renderer uses `@smartspectra/node-sdk/renderer`, which grabs camera
//     frames with getUserMedia and ships them to main over a private
//     MessagePort set up by `@smartspectra/node-sdk/preload`.
//   * contextIsolation + sandbox stay ON. Our own preload exposes only a tiny
//     `window.smileGarden` API via contextBridge.
//
// Mock mode (`--mock` or SMILE_GARDEN_MOCK=1) never loads the SDK, so the game
// runs with no SDK, no API key and no camera. `--fast` or SMILE_GARDEN_FAST=1 shortens
// the smile and talk steps of the daily visit, mock mode only.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Load repo-root `.env` before any process.env reads. Existing shell env wins
// over values in the file (dotenv's default). Never commit `.env`.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');

const MOCK = process.argv.includes('--mock') || process.env.SMILE_GARDEN_MOCK === '1';
const FAST = MOCK && (process.argv.includes('--fast') || process.env.SMILE_GARDEN_FAST === '1');
const DIAGNOSTICS = process.env.SMARTSPECTRA_DIAGNOSTICS === '1';
const SESSION_SECONDS = (() => {
    const v = Number(process.env.SMILE_GARDEN_SESSION_SECONDS);
    return Number.isFinite(v) && v >= 15 && v <= 900 ? v : null;
})();

// Dev-only: scripted screenshot capture (mock mode only). See
// scripts/capture-screenshots.js. Never active in real mode.
const CAPTURE_DIR = MOCK && process.env.SMILE_GARDEN_CAPTURE_DIR
    ? path.resolve(process.env.SMILE_GARDEN_CAPTURE_DIR) : null;

// Scripted capture / probe use a throwaway profile so they never touch (or are
// affected by) your real saved garden in localStorage.
if (CAPTURE_DIR || (MOCK && process.env.SMILE_GARDEN_PROBE === '1')) {
    app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'smile-garden-probe-')));
}

// Telemetry is ON by default in the SDK (`enableTelemetry` defaults to true,
// see SmartSpectraOptions in the API reference). Opt out with
// SMARTSPECTRA_TELEMETRY=0.
const ENABLE_TELEMETRY = process.env.SMARTSPECTRA_TELEMETRY !== '0';

// Read the key from the environment / `.env`. Never hardcode it.
const API_KEY = (process.env.SMARTSPECTRA_API_KEY || '').trim();

let bindSmartSpectraIpc = null;
let sdkLoadError = null;

if (!MOCK) {
    // Packaged builds ship the native runtime outside app.asar. Point the
    // SDK's resolver at it BEFORE requiring the binding (from the official
    // electron-quickstart main.js).
    if (app.isPackaged && !process.env.SMARTSPECTRA_CAPI_PATH) {
        const LIB = {
            darwin: 'libsmartspectra_capi.dylib',
            win32: 'smartspectra_capi.dll',
            linux: 'libsmartspectra_capi.so',
        }[process.platform];
        if (LIB) {
            process.env.SMARTSPECTRA_CAPI_PATH = path.join(process.resourcesPath, 'smartspectra', LIB);
        }
    }
    try {
        ({ bindSmartSpectraIpc } = require('@smartspectra/node-sdk/main'));
    } catch (err) {
        sdkLoadError = String((err && err.message) || err);
        console.error('[smile-garden] Failed to load @smartspectra/node-sdk/main:', sdkLoadError);
    }
}

function resolvePreload() {
    if (MOCK) return path.join(__dirname, 'preload.js');
    // A sandboxed preload can only require('electron'), so `npm run build`
    // bundles preload.js + `@smartspectra/node-sdk/preload` with esbuild.
    const bundled = path.join(__dirname, 'dist', 'preload-sdk.bundle.js');
    if (!fs.existsSync(bundled)) {
        sdkLoadError = sdkLoadError ||
            'dist/preload-sdk.bundle.js is missing. Run `npm run build` (or `npm start`, which builds first).';
        return path.join(__dirname, 'preload.js');
    }
    return bundled;
}

function isOwnPage(url) {
    return typeof url === 'string' && url.startsWith('file://');
}

let mainWindow = null;

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 640,
        backgroundColor: '#e9dfc6',
        title: MOCK ? 'Smile Garden (demo mode)' : 'Smile Garden',
        webPreferences: {
            preload: resolvePreload(),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            backgroundThrottling: false,
        },
    });
    mainWindow = win;

    if (!MOCK && bindSmartSpectraIpc && !sdkLoadError) {
        // One SDK per renderer connection; torn down automatically on close.
        bindSmartSpectraIpc(win);
    }

    // Only ever show our bundled page: no popups, no navigation away.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());

    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    if (DIAGNOSTICS) win.webContents.openDevTools({ mode: 'detach' });
    if (CAPTURE_DIR) {
        win.webContents.once('did-finish-load', () => {
            require('./scripts/capture-driver').run(win, CAPTURE_DIR).catch((e) => {
                console.error('[capture] failed:', e);
                app.exit(1);
            });
        });
    } else if (MOCK && process.env.SMILE_GARDEN_PROBE === '1') {
        win.webContents.once('did-finish-load', () => {
            require('./scripts/probe-startup').run(win).catch((e) => {
                console.error('[probe] failed:', e && e.stack || e);
                app.exit(1);
            });
        });
    }
    win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
    return win;
}

// Config for the renderer. The renderer-side SDK constructor takes `apiKey`
// directly (RendererSmartSpectraOptions), so in real mode the key has to
// reach the renderer. Handed over at runtime, only to our own file:// page.
ipcMain.handle('smile-garden:get-config', (event) => {
    const frameUrl = event.senderFrame ? event.senderFrame.url : '';
    if (!isOwnPage(frameUrl)) throw new Error('config requested from unexpected origin');
    return {
        mock: MOCK,
        fast: FAST,
        sessionSeconds: SESSION_SECONDS,
        capture: !!CAPTURE_DIR,
        apiKey: MOCK ? '' : API_KEY,
        hasApiKey: API_KEY.length > 0,
        enableTelemetry: ENABLE_TELEMETRY,
        sdkLoadError,
        platform: process.platform,
        arch: process.arch,
    };
});

// "Save garden snapshot": the renderer sends a PNG data URL; main validates it
// and writes it where the user picks (default: ~/Pictures). Nothing is uploaded.
const MAX_SNAPSHOT_BYTES = 25 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function defaultSnapshotName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `smile-garden-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}

ipcMain.handle('smile-garden:save-snapshot', async (event, dataUrl) => {
    const frameUrl = event.senderFrame ? event.senderFrame.url : '';
    if (!isOwnPage(frameUrl)) throw new Error('snapshot from unexpected origin');
    const prefix = 'data:image/png;base64,';
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) throw new Error('expected a PNG data URL');
    if (dataUrl.length > MAX_SNAPSHOT_BYTES * 1.4) throw new Error('snapshot too large');
    const buf = Buffer.from(dataUrl.slice(prefix.length), 'base64');
    if (buf.length < 64 || !buf.subarray(0, 8).equals(PNG_MAGIC)) throw new Error('not a PNG image');

    let target;
    if (CAPTURE_DIR) {
        // Scripted capture: no dialog, write next to the screenshots.
        target = path.join(CAPTURE_DIR, 'garden-snapshot.png');
    } else {
        let dir = os.homedir();
        try { dir = app.getPath('pictures'); } catch { /* fall back to home */ }
        const res = await dialog.showSaveDialog(mainWindow || undefined, {
            title: 'Save garden snapshot',
            defaultPath: path.join(dir, defaultSnapshotName()),
            filters: [{ name: 'PNG image', extensions: ['png'] }],
        });
        if (res.canceled || !res.filePath) return { saved: false };
        target = res.filePath.toLowerCase().endsWith('.png') ? res.filePath : res.filePath + '.png';
    }
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, buf);
    return { saved: true, path: target };
});

app.whenReady().then(() => {
    // Grant the camera (video only, no microphone) to our own page only.
    // Same policy as the official electron-quickstart.
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
        const url = (details && details.requestingUrl) || (wc && wc.getURL()) || '';
        const mediaTypes = (details && details.mediaTypes) || [];
        const cameraOnly = mediaTypes.length === 1 && mediaTypes[0] === 'video';
        callback(permission === 'media' && cameraOnly && isOwnPage(url));
    });

    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
