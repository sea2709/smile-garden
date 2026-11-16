// preload-sdk.js — entry for the real-SDK preload bundle.
//
// The SmartSpectra docs say: "If the app already has a preload script,
// require this module from it: require('@smartspectra/node-sdk/preload')".
// Because the window is sandboxed (only `electron` is requireable at
// runtime), `npm run build` bundles this file with esbuild into
// dist/preload-sdk.bundle.js, keeping `electron` external.
//
// Result: the page gets `window.smileGarden` (ours) and
// `window.__smartspectraBridge` (the SDK's MessagePort bridge).

'use strict';

require('./preload');
require('@smartspectra/node-sdk/preload');
