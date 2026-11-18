// electron-builder config for Smile Garden.
// Packs the app and copies the host platform's SmartSpectra native closure
// into resources/smartspectra/ (see main.js SMARTSPECTRA_CAPI_PATH).

'use strict';

const fs = require('fs');
const path = require('path');

const plat = process.platform;
const arch = process.arch;
const nativeFrom = path.join(__dirname, 'node_modules', `@smartspectra/node-sdk-${plat}-${arch}`);
const nativeExists = fs.existsSync(nativeFrom);

if (!nativeExists) {
    console.warn(
        `[pack] Native package missing at ${nativeFrom}. ` +
        'Packaged real mode will need SMARTSPECTRA_CAPI_PATH or a rebuild on a machine with that platform package.'
    );
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
    appId: 'garden.smile.app',
    productName: 'Smile Garden',
    copyright: 'Copyright © Smile Garden',
    directories: {
        output: 'release',
        buildResources: 'build',
    },
    files: [
        'main.js',
        'preload.js',
        'preload-sdk.js',
        'dist/**/*',
        'game/**/*',
        'renderer/**/*',
        'assets/**/*',
        'package.json',
        '!**/*.map',
        '!**/README.md',
    ],
    asar: true,
    asarUnpack: [
        '**/*.node',
        '**/koffi/**',
        '**/@smartspectra/node-sdk/**',
    ],
    extraResources: nativeExists
        ? [{
            from: nativeFrom,
            to: 'smartspectra',
            filter: ['**/*'],
        }]
        : [],
    mac: {
        category: 'public.app-category.lifestyle',
        hardenedRuntime: true,
        gatekeeperAssess: false,
        entitlements: 'build/entitlements.mac.plist',
        entitlementsInherit: 'build/entitlements.mac.plist',
        extendInfo: {
            NSCameraUsageDescription:
                'Smile Garden uses the camera on this device to read smile, talk, and breathing signals during your garden visit. Video is processed on this device and is not uploaded.',
        },
        target: ['dmg', 'zip'],
    },
    win: {
        target: ['nsis', 'zip'],
    },
    linux: {
        category: 'Game',
        target: ['AppImage', 'dir'],
    },
};
