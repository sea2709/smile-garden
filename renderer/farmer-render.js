// renderer/farmer-render.js — keyboard-mode farmer for the camera .pip (Heily).
//
// Replaces the static peach oval in renderer/mock-source.js paintPreviewFrame().
//
// The mock source paints a 400×300 canvas once at start() and pipes it through
// <video id="preview" class="mirror-video">, which is CSS-flipped with
// scaleX(-1). The oval never changes. Keyboard keys already drive the signals
// (S / Space smile, T talk, F hide, [ ] tilt ±20°); this helper makes the
// picture follow those same states.
//
// Frames in assets/ui/farmer are 800×600 (2×) and are authored in SCREEN SPACE
// — how they should look in the pip. paint() therefore flips them when drawing
// onto the existing mirrored canvas, so hold [ still leans left on screen.
// Pass { preflip: false } if you drop the CSS mirror instead.
//
// Usage, inside mock-source tick() (it must run every tick, not only at start):
//
//   SmileFarmer.paint(previewCanvas.getContext('2d'), {
//       lighting: night ? 'night' : 'day',
//       face: face,
//       smile: keys.smile,
//       talk: talking,
//       tilt: keys.tiltLeft ? 'left' : keys.tiltRight ? 'right' : null,
//       phase: phase,
//       t: nowS(),
//   });
//
(function () {
    'use strict';

    const CANVAS_W = 400;
    const CANVAS_H = 300;
    const BASE = '../assets/ui/farmer';

    const FILES = {
        rest: 'rest.png',
        'rest-blink-half': 'rest-blink-half.png',
        'rest-blink-closed': 'rest-blink-closed.png',
        smile: 'smile.png',
        'talk-1': 'talk-1.png',
        'talk-2': 'talk-2.png',
        'talk-3': 'talk-3.png',
        'tilt-left': 'tilt-left.png',
        'tilt-right': 'tilt-right.png',
        hidden: 'hidden.png',
        'breathe-1': 'breathe-1.png',
        'breathe-2': 'breathe-2.png',
        'breathe-3': 'breathe-3.png',
    };

    const BLINK_STRIP = ['rest', 'rest-blink-half', 'rest-blink-closed', 'rest-blink-half', 'rest'];
    const TALK_STRIP = ['talk-1', 'talk-2', 'talk-3', 'talk-2'];
    const BREATHE_STRIP = ['breathe-1', 'breathe-2', 'breathe-3', 'breathe-2'];
    const BLINK_FPS = 8;
    const TALK_FPS = 7;
    const BREATHE_FPS = 4;
    const BLINK_EVERY_MIN = 3.5;
    const BLINK_EVERY_MAX = 6.5;
    const BREATHE_PHASES = {
        'breathe': true,
        'care-harvest': true,
        'care-hub-breathe': true,
        'camera-check-breath': true,
    };

    const cache = Object.create(null);
    let blinkAt = 0;
    let nextBlink = 2.8;

    function srcFor(lighting, name) {
        const file = FILES[name];
        const lit = lighting === 'night' ? 'night' : 'day';
        return `${BASE}/${lit}/${file}`;
    }

    function preloadImage(url) {
        if (cache[url]) return cache[url];
        const img = new Image();
        img.src = url;
        cache[url] = img;
        return img;
    }

    function preload(lighting) {
        const lit = lighting === 'night' ? 'night' : 'day';
        Object.keys(FILES).forEach((name) => preloadImage(srcFor(lit, name)));
    }

    function stripFrame(strip, fps, t) {
        const i = Math.floor((t * fps) % strip.length);
        return strip[((i % strip.length) + strip.length) % strip.length];
    }

    function pickName(state, t) {
        const face = state.face !== false;
        const hide = !!state.hide || !face;
        if (hide) return 'hidden';
        if (state.tilt === 'left') return 'tilt-left';
        if (state.tilt === 'right') return 'tilt-right';
        if (state.smile) return 'smile';
        if (state.talk) return stripFrame(TALK_STRIP, TALK_FPS, t);
        const phase = state.phase || '';
        if (BREATHE_PHASES[phase] || state.breathe) return stripFrame(BREATHE_STRIP, BREATHE_FPS, t);

        // Occasional blink while resting.
        if (t >= nextBlink) {
            blinkAt = t;
            nextBlink = t + BLINK_EVERY_MIN + (nextBlink % 1) * (BLINK_EVERY_MAX - BLINK_EVERY_MIN);
        }
        const blinkLen = BLINK_STRIP.length / BLINK_FPS;
        if (blinkAt && t >= blinkAt && t < blinkAt + blinkLen) {
            const i = Math.min(BLINK_STRIP.length - 1, Math.floor((t - blinkAt) * BLINK_FPS));
            return BLINK_STRIP[i];
        }
        return 'rest';
    }

    /**
     * Draw the farmer into a 400×300 (or any) 2d context.
     * @param {CanvasRenderingContext2D} ctx
     * @param {{ lighting?: 'day'|'night', face?: boolean, hide?: boolean, smile?: boolean, talk?: boolean, tilt?: 'left'|'right'|null, phase?: string, breathe?: boolean, t?: number, preflip?: boolean }} state
     */
    function paint(ctx, state) {
        const s = state || {};
        const t = typeof s.t === 'number' ? s.t : (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
        const lighting = s.lighting === 'night' ? 'night' : 'day';
        const name = pickName(s, t);
        const img = preloadImage(srcFor(lighting, name));
        const preflip = s.preflip !== false;
        const w = ctx.canvas ? ctx.canvas.width : CANVAS_W;
        const h = ctx.canvas ? ctx.canvas.height : CANVAS_H;
        const onReady = typeof s.onReady === 'function' ? s.onReady : null;
        const draw = () => {
            ctx.save();
            ctx.fillStyle = '#c4d4e2';
            ctx.fillRect(0, 0, w, h);
            if (!img.complete || !img.naturalWidth) {
                ctx.restore();
                return false;
            }
            if (preflip) {
                ctx.translate(w, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(img, 0, 0, w, h);
            ctx.restore();
            if (onReady) onReady(name);
            return true;
        };
        if (!draw()) {
            img.addEventListener('load', () => draw(), { once: true });
            return null;
        }
        return name;
    }

    function whenPreloaded(lighting) {
        const lit = lighting === 'night' ? 'night' : 'day';
        const waits = Object.keys(FILES).map((name) => {
            const img = preloadImage(srcFor(lit, name));
            if (img.complete && img.naturalWidth) return Promise.resolve();
            return new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
            });
        });
        return Promise.all(waits);
    }

    /** Pause idle blinks (e.g. while capturing keyboard states). */
    function freezeBlink(ms) {
        const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
        blinkAt = 0;
        nextBlink = t + (ms || 60);
    }

    /**
     * Suggested hook for mock-source.js. Call from tick(), after the face /
     * smile / talk flags for this frame are known, and once from start()
     * so the first captured frame is already the farmer.
     */
    function installOn(sourceOwner) {
        preload('day');
        preload('night');
        return function paintInto(canvas, state) {
            if (!canvas) return null;
            const ctx = canvas.getContext('2d');
            return paint(ctx, state);
        };
    }

    const api = Object.freeze({
        CANVAS_W,
        CANVAS_H,
        FILES,
        srcFor,
        preload,
        whenPreloaded,
        freezeBlink,
        pickName,
        paint,
        installOn,
    });

    if (typeof window !== 'undefined') {
        window.SmileFarmer = api;
    } else if (typeof module !== 'undefined') {
        module.exports = api;
    }
})();
