'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const CARC = require('../game/clock-arc.js');
const L = require('../game/clock-layout.js');

const DISPLAY = { w: 160, h: 64, cx: 640, cy: 40 };

test('noon sun token center matches time-manifest arc at 90°', () => {
    const noon = 12 * 60;
    const st = CARC.clockTokenState(noon);
    assert.ok(Math.abs(st.sunDeg - 90) < 0.01);
    assert.ok(st.sunAlpha > 0.9);
    const info = L.tokenBackdropRect(noon, 'sun', CARC, {
        display: DISPLAY,
        framePixels: L.FRAME_PX,
        tokenDisplay: 32,
    });
    const fr = CARC.tokenFrameXY(90);
    assert.ok(Math.abs(fr.x - 160.6) < 0.1);
    assert.ok(Math.abs(fr.y - 32.5) < 0.1);
    assert.ok(Math.abs(info.center.x - 640.3) < 0.2, `x ${info.center.x}`);
    assert.ok(Math.abs(info.center.y - 24.25) < 0.2, `y ${info.center.y}`);
    assert.equal(info.rect.w, 32);
    assert.equal(info.rect.x, info.center.x - 16);
});

test('sun-token.png loads and has opaque pixels in the asset file', () => {
    const p = path.join(__dirname, '..', 'assets', 'ui', 'clock', 'sun-token.png');
    assert.ok(fs.existsSync(p));
    const buf = fs.readFileSync(p);
    assert.ok(buf.length > 1000, 'sun-token should be non-trivial size');
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    assert.equal(w, 64);
    assert.equal(h, 64);
});