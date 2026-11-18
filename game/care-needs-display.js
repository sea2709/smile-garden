// Plain-words remaining labels, slot fill stats, and tag pip layout (Heily care-needs pack).
'use strict';
(function () {

    function remainingLabel(key, remaining) {
        const n = Math.max(0, Math.round(Number(remaining) || 0));
        if (n <= 0) return 'all set';
        if (key === 'water') return n === 1 ? '1 more smile' : `${n} more smiles`;
        if (key === 'fertilizer') return n === 1 ? '1 more chat' : `${n} more chats`;
        if (key === 'stake') return n === 1 ? '1 stretch' : `${n} stretches`;
        return '';
    }

    function filledAndLeft(C, prog, needs, key, plotStaked) {
        const req = C.dotsForNeed(needs, key);
        if (req <= 0) return { req: 0, got: 0, left: 0, done: true };
        if (key === 'stake') {
            const got = C.stakeNeedMet(prog, plotStaked) ? 1 : 0;
            return { req: 1, got, left: 1 - got, done: got === 1 };
        }
        const got = Math.min(req, Math.floor((Number(prog[key]) || 0) + 1e-6));
        return { req, got, left: req - got, done: got >= req };
    }

    /**
     * Pip centres around a wooden tag (stage px), relative to bottom-centre anchor.
     */
    function tagPipLayout(needs, scale) {
        const n = {
            sun: Math.max(0, Math.round(Number(needs && needs.sun) || 0)),
            water: Math.max(0, Math.round(Number(needs && needs.water) || 0)),
            fertilizer: Math.max(0, Math.round(Number(needs && needs.fertilizer) || 0)),
            stake: needs && needs.stake ? 1 : 0,
        };
        const dw = (224 * scale) / 2;
        const dh = (227 * scale) / 2;
        const pip = scale >= 0.6 ? 20 : 18;
        const faceCy = ((13 + 116) / 2) * (scale / 2);
        const boardCy = -dh + faceCy;
        const rx = dw * 0.74;
        const ry = dh * 0.5;
        const groups = [];
        if (n.water) groups.push(['water', n.water, 165, 200]);
        if (n.sun) groups.push(['sun', n.sun, 72, 108]);
        if (n.fertilizer) groups.push(['fertilizer', n.fertilizer, 350, 375]);
        if (n.stake) groups.push(['stake', n.stake, 318, 318]);
        const out = [];
        for (let g = 0; g < groups.length; g++) {
            const key = groups[g][0];
            const count = groups[g][1];
            let a0 = groups[g][2];
            let a1 = groups[g][3];
            if (a1 < a0) a1 += 360;
            for (let i = 0; i < count; i++) {
                const t = count === 1 ? 0.5 : i / (count - 1);
                const ang = ((a0 + (a1 - a0) * t) * Math.PI) / 180;
                out.push({
                    key,
                    index: i,
                    ox: +(Math.cos(ang) * rx).toFixed(2),
                    oy: +(boardCy - Math.sin(ang) * ry).toFixed(2),
                    pip,
                });
            }
        }
        return out;
    }

    function tagWreathBox(anchor, scale) {
        const dw = (320 * scale) / 2;
        const dh = (275 * scale) / 2;
        return { x: anchor[0] - dw / 2, y: anchor[1] - dh, w: dw, h: dh };
    }

    function slotSrc(key, filled, lighting) {
        const night = lighting === 'night' ? '-night' : '';
        if (filled) return `../assets/ui/care/slot-${key}-filled.png`;
        return `../assets/ui/care/slot-${key}-empty${night}.png`;
    }

    function pipSrc(key, filled, lighting) {
        const night = lighting === 'night' ? '-night' : '';
        const state = filled ? 'filled' : 'empty';
        if (filled && key !== 'sun') return `../assets/ui/tag/tag-pip-${key}-filled.png`;
        return `../assets/ui/tag/tag-pip-${key}-${state}${night}.png`;
    }

    const api = {
        remainingLabel,
        filledAndLeft,
        tagPipLayout,
        tagWreathBox,
        slotSrc,
        pipSrc,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof self !== 'undefined') {
        self.SmileCareNeedsDisplay = api;
    } else if (typeof window !== 'undefined') {
        window.SmileCareNeedsDisplay = api;
    }
})();