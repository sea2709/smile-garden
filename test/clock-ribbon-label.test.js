'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CRL = require('../game/clock-ribbon-label.js');
const fs = require('fs');
const path = require('path');

test('longest clock ribbon label fits 216px text-safe box', () => {
    assert.equal(CRL.fitsTextBox(CRL.LONGEST), true);
    const spec = CRL.fontSizeForLabel(CRL.LONGEST);
    assert.equal(spec.fontSize, CRL.BASE_SIZE);
    assert.ok(spec.width <= CRL.TEXT_SAFE_W + 0.5, `width ${spec.width}`);
});

test('season ribbon png assets are 584×96 @2x', () => {
    const root = path.join(__dirname, '..', 'assets', 'ui', 'clock');
    for (const name of ['season-ribbon.png', 'season-ribbon-night.png']) {
        const p = path.join(root, name);
        assert.ok(fs.existsSync(p), p);
        const buf = fs.readFileSync(p);
        assert.equal(buf.readUInt32BE(16), 584, name);
        assert.equal(buf.readUInt32BE(20), 96, name);
    }
});