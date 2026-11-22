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
// Capture / probe automation never loads the SDK (no API key, no camera).
// `--fast` or SMILE_GARDEN_FAST=1 shortens smile/talk steps during automation only.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');

// Load repo-root `.env` before any process.env reads. Existing shell env wins
// over values in the file (dotenv's default). Never commit `.env`.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { app, BrowserWindow, ipcMain, session } = require('electron');

const DIAGNOSTICS = process.env.SMARTSPECTRA_DIAGNOSTICS === '1';
const SESSION_SECONDS = (() => {
    const v = Number(process.env.SMILE_GARDEN_SESSION_SECONDS);
    return Number.isFinite(v) && v >= 15 && v <= 900 ? v : null;
})();

// Dev-only: scripted screenshot capture. See scripts/capture-screenshots.js.
const CAPTURE_DIR = process.env.SMILE_GARDEN_CAPTURE_DIR
    ? path.resolve(process.env.SMILE_GARDEN_CAPTURE_DIR) : null;
// Dev-only: short demo MP4 of smile/talk care. See scripts/record-demo.js.
const DEMO_DIR = process.env.SMILE_GARDEN_DEMO_DIR
    ? path.resolve(process.env.SMILE_GARDEN_DEMO_DIR) : null;
const PROBE = process.env.SMILE_GARDEN_PROBE === '1';
const AUTOMATION = !!(CAPTURE_DIR || DEMO_DIR || PROBE);
const FAST = AUTOMATION && (process.argv.includes('--fast') || process.env.SMILE_GARDEN_FAST === '1');

// Scripted capture / probe use a throwaway profile so they never touch (or are
// affected by) your real saved garden in localStorage.
if (AUTOMATION) {
    app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'smile-garden-probe-')));
}

// Telemetry is ON by default in the SDK (`enableTelemetry` defaults to true,
// see SmartSpectraOptions in the API reference). Opt out with
// SMARTSPECTRA_TELEMETRY=0.
const ENABLE_TELEMETRY = process.env.SMARTSPECTRA_TELEMETRY !== '0';

// Read the key from the environment / `.env`. Never hardcode it.
const API_KEY = (process.env.SMARTSPECTRA_API_KEY || '').trim();
// One-shot handoff to the renderer SDK constructor — never re-sent after take.
let apiKeyConsumed = false;

let bindSmartSpectraIpc = null;
let sdkLoadError = null;

if (!AUTOMATION) {
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

const OWN_PAGE_PATH = path.normalize(path.join(__dirname, 'renderer', 'index.html'));
const OWN_PAGE_URL = pathToFileURL(OWN_PAGE_PATH).href;

function resolvePreload() {
    if (AUTOMATION) return path.join(__dirname, 'preload.js');
    // A sandboxed preload can only require('electron'), so `npm run build`
    // bundles preload.js + `@smartspectra/node-sdk/preload` with esbuild.
    const bundled = path.join(__dirname, 'dist', 'preload-sdk.bundle.js');
    if (!fs.existsSync(bundled)) {
        throw new Error(
            'dist/preload-sdk.bundle.js is missing. Run `npm run build` (or `npm start`, which builds first).'
        );
    }
    return bundled;
}

/** Only our bundled renderer/index.html — not any other file:// URL. */
function isOwnPage(url) {
    if (typeof url !== 'string' || !url) return false;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'file:') return false;
        return path.normalize(fileURLToPath(parsed)) === OWN_PAGE_PATH;
    } catch {
        // Fall back to exact href match (covers odd file URL forms).
        return url === OWN_PAGE_URL || url.split('#')[0].split('?')[0] === OWN_PAGE_URL;
    }
}

function allowCameraMedia(permission, mediaTypes, url) {
    if (!isOwnPage(url)) return false;
    if (permission === 'media') {
        return Array.isArray(mediaTypes) && mediaTypes.length === 1 && mediaTypes[0] === 'video';
    }
    // Chromium also queries discrete media permissions in some Electron versions.
    if (permission === 'mediaVideo' || permission === 'camera') return true;
    return false;
}

let mainWindow = null;

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 640,
        backgroundColor: '#e9dfc6',
        title: 'Smile Garden',
        webPreferences: {
            preload: resolvePreload(),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            backgroundThrottling: false,
        },
    });
    mainWindow = win;

    if (!AUTOMATION && bindSmartSpectraIpc && !sdkLoadError) {
        // One SDK per renderer connection; torn down automatically on close.
        bindSmartSpectraIpc(win);
    }

    // Only ever show our bundled page: no popups, no navigation away.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());

    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    if (DIAGNOSTICS) win.webContents.openDevTools({ mode: 'detach' });
    if (DEMO_DIR) {
        win.webContents.once('did-finish-load', () => {
            require('./scripts/demo-driver').run(win, DEMO_DIR).catch((e) => {
                console.error('[demo] failed:', e);
                app.exit(1);
            });
        });
    } else if (CAPTURE_DIR) {
        win.webContents.once('did-finish-load', () => {
            require('./scripts/capture-driver').run(win, CAPTURE_DIR).catch((e) => {
                console.error('[capture] failed:', e);
                app.exit(1);
            });
        });
    } else if (PROBE) {
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

// Config for the renderer. The API key is NOT included here — the renderer
// takes it once via smile-garden:take-api-key when constructing the SDK.
ipcMain.handle('smile-garden:get-config', (event) => {
    const frameUrl = event.senderFrame ? event.senderFrame.url : '';
    if (!isOwnPage(frameUrl)) throw new Error('config requested from unexpected origin');
    return {
        automation: AUTOMATION,
        fast: FAST,
        sessionSeconds: SESSION_SECONDS,
        capture: !!CAPTURE_DIR,
        hasApiKey: API_KEY.length > 0,
        enableTelemetry: ENABLE_TELEMETRY,
        sdkLoadError,
        platform: process.platform,
        arch: process.arch,
    };
});

// One-shot API key handoff for SmartSpectraSDK. Empty after first successful take
// (and always empty during automation) so the key does not linger on the config object.
ipcMain.handle('smile-garden:take-api-key', (event) => {
    const frameUrl = event.senderFrame ? event.senderFrame.url : '';
    if (!isOwnPage(frameUrl)) throw new Error('api key requested from unexpected origin');
    if (AUTOMATION || !API_KEY) return '';
    if (apiKeyConsumed) return '';
    apiKeyConsumed = true;
    return API_KEY;
});

app.whenReady().then(() => {
    // Deny-by-default permissions. Grant camera (video only) to our own page.
    // Both handlers are required: sync checks can otherwise report granted.
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
        const url = (details && details.requestingUrl) || (wc && wc.getURL()) || '';
        const mediaTypes = (details && details.mediaTypes) || [];
        callback(allowCameraMedia(permission, mediaTypes, url));
    });
    session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
        const url = requestingOrigin || (wc && wc.getURL()) || '';
        if (permission === 'media') {
            const mediaType = details && details.mediaType;
            // mediaType is 'video' | 'audio' | 'unknown' on the check path.
            if (mediaType && mediaType !== 'video') return false;
            return isOwnPage(url);
        }
        return allowCameraMedia(permission, ['video'], url);
    });

    try {
        createWindow();
    } catch (err) {
        console.error('[smile-garden] Failed to start:', err && err.message || err);
        app.exit(1);
        return;
    }
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            try { createWindow(); } catch (err) {
                console.error('[smile-garden] Failed to recreate window:', err && err.message || err);
                app.exit(1);
            }
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
