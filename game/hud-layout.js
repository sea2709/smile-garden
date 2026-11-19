// game/hud-layout.js — keep HTML HUD out of the painted clock band (backdrop px).
'use strict';

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SmileHudLayout = api;
})(typeof self !== 'undefined' ? self : this, function () {
    const BACKDROP = Object.freeze({ w: 1280, h: 720 });
    /** Painted season ribbon in the top bar (no sun/moon arc). */
    const CLOCK_KEEP_OUT = Object.freeze({ left: 486, right: 794, top: 8, bottom: 64 });

    function viewTransform(cssW, cssH) {
        const w = Math.max(1, Number(cssW) || BACKDROP.w);
        const h = Math.max(1, Number(cssH) || BACKDROP.h);
        const s = Math.max(w / BACKDROP.w, h / BACKDROP.h);
        return {
            s,
            ox: (w - BACKDROP.w * s) / 2,
            oy: (h - BACKDROP.h * s) / 2,
        };
    }

    function clockKeepOutClientRect(cssW, cssH) {
        const { s, ox, oy } = viewTransform(cssW, cssH);
        const left = CLOCK_KEEP_OUT.left * s + ox;
        const top = CLOCK_KEEP_OUT.top * s + oy;
        const right = CLOCK_KEEP_OUT.right * s + ox;
        const bottom = CLOCK_KEEP_OUT.bottom * s + oy;
        return { left, top, right, bottom, width: right - left, height: bottom - top };
    }

    function rectsOverlap(a, b) {
        return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    }

  /** @param {number} cssW @param {number} cssH @param {Array<{left,top,right,bottom}>} hudRects */
    function findClockOverlaps(cssW, cssH, hudRects) {
        const keep = clockKeepOutClientRect(cssW, cssH);
        const hits = [];
        for (const item of hudRects) {
            const r = item.rect || item;
            if (!r || r.width === 0 && r.height === 0) continue;
            if (rectsOverlap(keep, r)) hits.push({ id: item.id, cls: item.cls, rect: r });
        }
        return { ok: hits.length === 0, keepOut: keep, hits, cssW, cssH };
    }

    function auditHudLayoutInDocument() {
        if (typeof document === 'undefined') return { ok: false, reason: 'no-dom' };
        const cssW = window.innerWidth;
        const cssH = window.innerHeight;
        const selectors = [
            '.topbar .brand',
            '.topbar .chips',
            '.topbar .chip',
            '.topbar .top-actions',
            '.topbar .top-actions .btn',
            '#pip',
            '#mock-badge',
        ];
        const hudRects = [];
        for (const sel of selectors) {
            document.querySelectorAll(sel).forEach((el) => {
                if (el.hidden) return;
                const r = el.getBoundingClientRect();
                if (r.width < 1 && r.height < 1) return;
                hudRects.push({ id: el.id || null, cls: el.className, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } });
            });
        }
        const out = findClockOverlaps(cssW, cssH, hudRects);
        out.paintedClock = document.body && document.body.dataset.paintedClock === '1';
        return out;
    }

    return {
        BACKDROP,
        CLOCK_KEEP_OUT,
        viewTransform,
        clockKeepOutClientRect,
        rectsOverlap,
        findClockOverlaps,
        auditHudLayoutInDocument,
    };
});