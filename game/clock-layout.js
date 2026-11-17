// game/clock-layout.js — backdrop positions for painted HUD clock (see assets/time-manifest.json).
'use strict';

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SmileClockLayout = api;
})(typeof self !== 'undefined' ? self : this, function () {
    const FRAME_PX = Object.freeze([320, 128]);
    const DEFAULT_DISPLAY = Object.freeze({ w: 160, h: 64, cx: 640, cy: 40 });
    const DEFAULT_TOKEN = 32;

    /** Map a point in @2x clock frame pixels to backdrop (1280×720) space. */
    function framePointToBackdrop(fx, fy, opts) {
        const o = opts || {};
        const d = o.display || DEFAULT_DISPLAY;
        const frameW = (o.framePixels && o.framePixels[0]) || FRAME_PX[0];
        const scale = d.w / frameW;
        return {
            x: d.cx - d.w / 2 + fx * scale,
            y: d.cy - d.h / 2 + fy * scale,
        };
    }

    /** Sun/moon token draw rect at a garden-clock minute value. */
    function tokenBackdropRect(gardenMinutes, which, CARC, opts) {
        const o = opts || {};
        const arc = CARC.ARC;
        const tok = CARC.clockTokenState(gardenMinutes);
        const deg = which === 'moon' ? tok.moonDeg : tok.sunDeg;
        const fr = CARC.tokenFrameXY(deg, arc);
        const center = framePointToBackdrop(fr.x, fr.y, o);
        const disp = o.tokenDisplay || DEFAULT_TOKEN;
        const half = disp / 2;
        return {
            center,
            rect: { x: center.x - half, y: center.y - half, w: disp, h: disp },
            deg,
            alpha: which === 'moon' ? tok.moonAlpha : tok.sunAlpha,
            tokenState: tok,
        };
    }

    return { framePointToBackdrop, tokenBackdropRect, DEFAULT_DISPLAY, FRAME_PX };
});