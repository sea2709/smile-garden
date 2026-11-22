// Keyboard-mode key-cap hints (Heily). Helper for SmileTendStrip.render.
//
// Caps are art-only until Sprout wires them. Two hooks:
//
//  1. Toggle the class that shows the caps, whenever the input source changes:
//
//       const strip = document.getElementById('tend-strip');
//       strip.classList.toggle('is-keyboard', SmileKeyboardHints.isKeyboardMode(config, source));
//
//     Call this when config.keyboard is set (camera fallback or the
//     “Play with keyboard instead” banner).
//
//  2. Inside SmileTendStrip.render, after each .tend-care row is built and
//     after the harvest block is updated:
//
//       SmileKeyboardHints.decorateCareRow(row, spec.key, {
//           lighting: cardLight, active, artUrl, keyboard: strip.classList.contains('is-keyboard'),
//       });
//       SmileKeyboardHints.decorateHarvest(harvestIconEl.parentElement, {
//           lighting: cardLight, active: harvestActive, artUrl,
//           keyboard: strip.classList.contains('is-keyboard'),
//       });
//
// Key mapping used here follows the current care logic in game/care-needs.js
// and the bindings in renderer/app.js (see the manifest for the mismatches
// we found). Sun has no cap.

(function (global) {
    'use strict';

    // Care row → keys. Stake uses both tilt keys; harvest is Enter.
    const ROW_KEYS = {
        water: ['s'],
        fertilizer: ['t'],
        stake: ['bracket-left', 'bracket-right'],
        harvest: ['enter'],
    };

    const KEY_ALT = {
        s: 'S, smile to water',
        t: 'T, talk to fertilize',
        'bracket-left': '[ , tilt left to stake',
        'bracket-right': '] , tilt right to stake',
        enter: 'Enter, pick now',
        space: 'Space',
        esc: 'Esc',
        f: 'F, look away',
        'arrow-left': 'Left arrow, previous bed',
        'arrow-right': 'Right arrow, next bed',
        'arrow-up': 'Up arrow, previous bed',
        'arrow-down': 'Down arrow, next bed',
    };

    const WIDE = { esc: true, enter: true, space: true, 'bracket-left': true, 'bracket-right': true };

    function isKeyboardMode(config) {
        return !!(config && config.keyboard);
    }

    function keySrc(id, lighting, pressed) {
        const night = lighting === 'night' ? '-night' : '';
        const active = pressed ? '-active' : '';
        return `../assets/ui/keys/key-${id}${active}${night}.png`;
    }

    function nineSliceSrc(lighting, pressed) {
        const night = lighting === 'night' ? '-night' : '';
        const active = pressed ? '-active' : '';
        return `../assets/ui/keys/key-cap-9s${active}${night}.png`;
    }

    function makeKeyImg(id, lighting, pressed, artUrl) {
        const img = document.createElement('img');
        img.className = 'tend-key' + (pressed ? ' is-pressed' : '');
        img.dataset.key = id;
        img.dataset.wide = WIDE[id] ? 'true' : 'false';
        img.alt = KEY_ALT[id] || id;
        img.src = artUrl(keySrc(id, lighting, pressed));
        return img;
    }

    function decorateCareRow(row, needKey, opts) {
        const { lighting, active, artUrl, keyboard } = opts;
        const existing = row.querySelector('.tend-keycol');
        if (!keyboard) {
            if (existing) existing.remove();
            return;
        }
        const ids = ROW_KEYS[needKey] || [];
        if (!ids.length) return;
        const col = existing || document.createElement('span');
        col.className = 'tend-keycol';
        col.textContent = '';
        // For stake, both caps press together while the stretch channel is live.
        for (const id of ids) col.appendChild(makeKeyImg(id, lighting, !!active, artUrl));
        const slots = row.querySelector('.tend-slots');
        if (slots) row.insertBefore(col, slots);
        else row.insertBefore(col, row.firstChild);
    }

    function decorateHarvest(harvestEl, opts) {
        const { lighting, active, artUrl, keyboard } = opts;
        if (!harvestEl) return;
        let copy = harvestEl.querySelector('.tend-harvest-copy');
        if (!copy) {
            // Wrap the existing <b> + <span> so the Enter cap can sit on the title line.
            copy = document.createElement('div');
            copy.className = 'tend-harvest-copy';
            const title = document.createElement('div');
            title.className = 'tend-harvest-title';
            const b = harvestEl.querySelector('b');
            const sub = harvestEl.querySelector('span');
            if (b) title.appendChild(b);
            copy.appendChild(title);
            if (sub) copy.appendChild(sub);
            harvestEl.appendChild(copy);
        }
        let title = copy.querySelector('.tend-harvest-title');
        if (!title) {
            title = document.createElement('div');
            title.className = 'tend-harvest-title';
            const b = copy.querySelector('b');
            if (b) title.appendChild(b);
            copy.insertBefore(title, copy.firstChild);
        }
        let cap = title.querySelector('.tend-harvest-key');
        if (!keyboard) {
            if (cap) cap.remove();
            return;
        }
        if (!cap) {
            cap = makeKeyImg('enter', lighting, !!active, artUrl);
            cap.classList.add('tend-harvest-key');
            title.appendChild(cap);
        } else {
            cap.src = artUrl(keySrc('enter', lighting, !!active));
            cap.classList.toggle('is-pressed', !!active);
        }
    }

    global.SmileKeyboardHints = {
        isKeyboardMode,
        keySrc,
        nineSliceSrc,
        makeKeyImg,
        decorateCareRow,
        decorateHarvest,
        ROW_KEYS,
        KEY_ALT,
    };
}(typeof window !== 'undefined' ? window : globalThis));
