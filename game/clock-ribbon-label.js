// game/clock-ribbon-label.js — season clock ribbon label fit (Lora 16px, 216px text-safe).
'use strict';

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SmileClockRibbonLabel = api;
})(typeof self !== 'undefined' ? self : this, function () {
    const TEXT_SAFE_W = 216;
    const FONT_WEIGHT = 600;
    const FONT_FAMILY = 'Lora, Georgia, serif';
    const BASE_SIZE = 16;
    const MIN_SIZE = 9;
    const LONGEST = 'Day 999 · Autumn · 12:00 PM';
    const LONGEST_WIDTH_AT_16 = 214.3;

    function baseFontSpec(sizePx) {
        const size = Math.round(sizePx * 10) / 10;
        return `${FONT_WEIGHT} ${size}px ${FONT_FAMILY}`;
    }

    function estimateLabelWidth(label, fontSize) {
        const text = String(label || '');
        const size = fontSize || BASE_SIZE;
        return LONGEST_WIDTH_AT_16 * (text.length / LONGEST.length) * (size / BASE_SIZE);
    }

    function fontSizeForLabel(label, measureWidth) {
        const text = String(label || '');
        const measure = typeof measureWidth === 'function'
            ? measureWidth
            : (t, sz) => estimateLabelWidth(t, sz);
        let size = BASE_SIZE;
        let width = measure(text, size);
        while (width > TEXT_SAFE_W && size > MIN_SIZE) {
            size -= 0.5;
            width = measure(text, size);
        }
        return {
            font: baseFontSpec(size),
            fontSize: size,
            width,
            fits: width <= TEXT_SAFE_W + 0.5,
        };
    }

    function fitsTextBox(label, measureWidth) {
        return fontSizeForLabel(label, measureWidth).fits;
    }

    return {
        TEXT_SAFE_W,
        BASE_SIZE,
        LONGEST,
        LONGEST_WIDTH_AT_16,
        baseFontSpec,
        estimateLabelWidth,
        fontSizeForLabel,
        fitsTextBox,
    };
});