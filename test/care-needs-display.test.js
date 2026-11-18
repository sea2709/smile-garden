'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../game/logic.js');
const C = require('../game/care-needs.js');
const D = require('../game/care-needs-display.js');

test('remainingLabel wording', () => {
    assert.equal(D.remainingLabel('water', 3), '3 more smiles');
    assert.equal(D.remainingLabel('water', 1), '1 more smile');
    assert.equal(D.remainingLabel('water', 0), 'all set');
    assert.equal(D.remainingLabel('fertilizer', 2), '2 more chats');
    assert.equal(D.remainingLabel('fertilizer', 1), '1 more chat');
    assert.equal(D.remainingLabel('stake', 1), '1 stretch');
    assert.equal(D.remainingLabel('stake', 0), 'all set');
});

test('filledAndLeft uses floor(progress) for slot fill', () => {
    const needs = L.plantNeeds('cucumber');
    const partial = { sun: 1.6, water: 1.9, fertilizer: 0.4, stake: false };
    const w = D.filledAndLeft(C, partial, needs, 'water', false);
    assert.equal(w.req, 3);
    assert.equal(w.got, 1);
    assert.equal(w.left, 2);
    assert.equal(w.done, false);
    assert.equal(D.remainingLabel('water', w.left), '2 more smiles');
    const f = D.filledAndLeft(C, partial, needs, 'fertilizer', false);
    assert.equal(f.got, 0);
    assert.equal(f.left, 2);
    const s = D.filledAndLeft(C, partial, needs, 'stake', false);
    assert.equal(s.req, 1);
    assert.equal(s.got, 0);
    assert.equal(D.remainingLabel('stake', s.left), '1 stretch');
    const done = { sun: 2, water: 3, fertilizer: 2, stake: true };
    const wd = D.filledAndLeft(C, done, needs, 'water', true);
    assert.equal(wd.done, true);
    assert.equal(D.remainingLabel('water', wd.left), 'all set');
});

test('tagPipLayout places cucumber pips at fixed stage sizes', () => {
    const needs = L.plantNeeds('cucumber');
    const back = D.tagPipLayout(needs, 0.5);
    assert.equal(back.length, 8);
    assert.equal(back[0].key, 'water');
    assert.equal(back[0].pip, 18);
    const front = D.tagPipLayout(needs, 0.62);
    assert.equal(front[0].pip, 20);
    const wreath = D.tagWreathBox([400, 300], 0.5);
    assert.ok(wreath.w > 70 && wreath.h > 60);
});

test('slot and pip asset paths', () => {
    assert.ok(D.slotSrc('water', false, 'night').includes('empty-night'));
    assert.ok(D.slotSrc('water', true, 'night').includes('filled.png'));
    assert.ok(D.pipSrc('water', true, 'night').includes('filled.png'));
    assert.ok(D.pipSrc('sun', false, 'night').includes('empty-night'));
});