'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

test('mock source setKeys repaints distinct farmer frame names', () => {
    const frames = [];
    const L = require('../game/logic.js');
    class FakeCanvas {
        constructor() {
            this.width = 400;
            this.height = 300;
        }
        getContext() {
            return {
                save() {},
                restore() {},
                fillRect() {},
                drawImage() {},
                createLinearGradient() {
                    return { addColorStop() {} };
                },
                fillStyle: '',
            };
        }
    }
    const sandbox = {
        performance: { now: () => 1000 + frames.length * 50 },
        document: {
            createElement(tag) {
                if (tag === 'canvas') return new FakeCanvas();
                return {};
            },
        },
        window: {
            SmileLogic: L,
            SmileStretch: null,
            SmileFarmer: {
                preload() {},
                paint(ctx, state) {
                    const tilt = state.tilt;
                    const hide = state.hide || state.face === false;
                    let name = 'rest';
                    if (hide) name = 'hidden';
                    else if (state.smile) name = 'smile';
                    else if (state.talk) name = 'talk-1';
                    else if (tilt === 'left') name = 'tilt-left';
                    else if (tilt === 'right') name = 'tilt-right';
                    frames.push(name);
                    return name;
                },
            },
        },
        console,
        SmileLogic: L,
    };
    const ctx = vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(root, 'renderer', 'mock-source.js'), 'utf8'), ctx);
    const source = ctx.window.SmileSources.createMockSource({ auto: false });
    source.setKeys({ smile: false, talk: false, hide: false, tiltLeft: false, tiltRight: false });
    assert.equal(source.getFarmerFrame(), 'rest');
    source.setKeys({ smile: true, talk: false, hide: false, tiltLeft: false, tiltRight: false });
    assert.equal(source.getFarmerFrame(), 'smile');
    source.setKeys({ smile: false, talk: true, hide: false, tiltLeft: false, tiltRight: false });
    assert.equal(source.getFarmerFrame(), 'talk-1');
    source.setKeys({ smile: false, talk: false, hide: false, tiltLeft: true, tiltRight: false });
    assert.equal(source.getFarmerFrame(), 'tilt-left');
    source.setKeys({ smile: false, talk: false, hide: true, tiltLeft: false, tiltRight: false });
    assert.equal(source.getFarmerFrame(), 'hidden');
    assert.equal(new Set(frames).size, frames.length);
});