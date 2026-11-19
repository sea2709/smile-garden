'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

test('SmileKeyboardHints.isKeyboardMode', () => {
    const sandbox = { window: globalThis, globalThis };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'renderer', 'keyboard-hints-render.js'), 'utf8'), sandbox);
    const { isKeyboardMode } = sandbox.SmileKeyboardHints;
    assert.equal(isKeyboardMode({ keyboard: true }, null), true);
    assert.equal(isKeyboardMode({}, null), false);
    assert.equal(isKeyboardMode({ mock: true }, { auto: true }), false);
    assert.equal(isKeyboardMode({ mock: true }, { auto: false, setKeys: () => {} }), true);
    assert.equal(isKeyboardMode({ mock: true, keyboard: false }, { auto: false }), true);
});

test('keyboard hint art ids exist on disk', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'keyboard-hints-manifest.json'), 'utf8'));
    for (const id of manifest.ids) {
        if (id === 'cap-9s') {
            assert.ok(fs.existsSync(path.join(root, 'assets', 'ui', 'keys', 'key-cap-9s.png')), id);
            continue;
        }
        const base = path.join(root, 'assets', 'ui', 'keys', `key-${id}.png`);
        assert.ok(fs.existsSync(base), base);
        assert.ok(fs.existsSync(path.join(root, 'assets', 'ui', 'keys', `key-${id}-active.png`)));
        assert.ok(fs.existsSync(path.join(root, 'assets', 'ui', 'keys', `key-${id}-night.png`)));
        assert.ok(fs.existsSync(path.join(root, 'assets', 'ui', 'keys', `key-${id}-active-night.png`)));
    }
});