// game/plant-anchor.js — horizontal anchor for plant sprites (soil mound centre).
'use strict';

function spriteAnchorX(meta) {
    if (!meta || !Number.isFinite(meta.w)) return 0;
    return Number.isFinite(meta.anchorX) ? meta.anchorX : meta.w / 2;
}

/** Map plant sprite anchor into an effect/harvest strip frame (200px-wide strips). */
function stripAnchorX(meta, frameW) {
    if (!meta || !Number.isFinite(meta.w) || !Number.isFinite(frameW)) return frameW / 2;
    return spriteAnchorX(meta) * (frameW / meta.w);
}

const api = { spriteAnchorX, stripAnchorX };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.SmilePlantAnchor = api;
}