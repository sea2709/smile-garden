// preload.js — runs in the sandboxed, context-isolated preload world.
//
// Exposes a deliberately tiny API to the page. No Node APIs, no raw
// ipcRenderer. Sandboxed preloads may only require('electron').

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smileGarden', {
    /** Returns { mock, fast, sessionSeconds, capture, apiKey, hasApiKey, enableTelemetry, sdkLoadError, platform, arch }. */
    getConfig: () => ipcRenderer.invoke('smile-garden:get-config'),
    /** Save a PNG data URL locally (save dialog). Resolves { saved, path }. */
    saveSnapshot: (dataUrl) => ipcRenderer.invoke('smile-garden:save-snapshot', String(dataUrl)),
});
