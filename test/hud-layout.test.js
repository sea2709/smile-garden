'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../game/hud-layout.js');

const widths = [1280, 1100, 960];
const viewH = 800;

test('clock keep-out band maps to centered viewport band', () => {
    for (const cssW of widths) {
        const keep = H.clockKeepOutClientRect(cssW, viewH);
        const { s, ox } = H.viewTransform(cssW, viewH);
        const expLeft = H.CLOCK_KEEP_OUT.left * s + ox;
        const expRight = H.CLOCK_KEEP_OUT.right * s + ox;
        assert.ok(Math.abs(keep.left - expLeft) < 0.5, `left @${cssW}`);
        assert.ok(Math.abs(keep.right - expRight) < 0.5, `right @${cssW}`);
        assert.ok(keep.width > 140, `width @${cssW}`);
    }
});

test('hud rects in the logo+chip and top-actions columns do not intersect keep-out at 1280', () => {
    const cssW = 1280;
    const cssH = viewH;
    const keep = H.clockKeepOutClientRect(cssW, cssH);
    const logoW = 184 + 12;
    const hudRects = [
        { id: 'brand', rect: { left: 18, top: 8, right: 18 + logoW, bottom: 52, width: logoW, height: 44 } },
        { id: 'chips', rect: { left: 18 + logoW + 10, top: 12, right: keep.left - 4, bottom: 44, width: keep.left - 4 - (18 + logoW + 10), height: 32 } },
        { id: 'actions', rect: { left: cssW - 18 - 200, top: 8, right: cssW - 18, bottom: 48, width: 200, height: 40 } },
    ];
    const out = H.findClockOverlaps(cssW, cssH, hudRects);
    assert.equal(out.ok, true, JSON.stringify(out.hits));
    assert.ok(hudRects[1].rect.right <= keep.left + 0.5, 'chips must end before clock band');
    assert.ok(hudRects[2].rect.left >= keep.right - 0.5, 'actions must start after clock band');
});

test('mock badge below top-actions does not intersect keep-out', () => {
    const cssW = 1280;
    const keep = H.clockKeepOutClientRect(cssW, viewH);
    const badge = { id: 'mock-badge', rect: { left: cssW - 240, top: 128, right: cssW - 18, bottom: 160, width: 222, height: 32 } };
    const out = H.findClockOverlaps(cssW, viewH, [badge]);
    assert.equal(out.ok, true);
    assert.ok(badge.rect.top >= keep.bottom - 0.5, 'badge sits below clock band');
});