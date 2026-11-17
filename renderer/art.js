// renderer/art.js — painted art manifest (generated from /workspace/smile-garden-art).
// Plot geometry is in backdrop pixels (1280x720); all four backdrops share it.
// Plant sprites: per stage {w, h, base (y of the soil mound's bottom), top}.
// Meter cards: the painted dot row was removed (inpainted) so dots are drawn
// live in code at these centres {x, y, r} (card pixels).
(function () {
    'use strict';
    window.SmileArt = Object.freeze({
        width: 1280,
        height: 720,
        backgrounds: { dawn: '../assets/backgrounds/dawn.jpg', midday: '../assets/backgrounds/midday.jpg', 'golden-hour': '../assets/backgrounds/golden-hour.jpg', night: '../assets/backgrounds/night.jpg' },
        plots: [{"x": 350, "y": 383, "w": 169, "h": 58, "row": 0, "scale": 0.5, "box": [266, 338, 435, 396]}, {"x": 554, "y": 385, "w": 151, "h": 58, "row": 0, "scale": 0.5, "box": [478, 340, 629, 398]}, {"x": 761, "y": 386, "w": 154, "h": 59, "row": 0, "scale": 0.5, "box": [684, 340, 838, 399]}, {"x": 968, "y": 385, "w": 171, "h": 55, "row": 0, "scale": 0.5, "box": [883, 342, 1054, 397]}, {"x": 280, "y": 519, "w": 215, "h": 93, "row": 1, "scale": 0.62, "box": [173, 446, 388, 539]}, {"x": 523, "y": 529, "w": 186, "h": 99, "row": 1, "scale": 0.62, "box": [430, 452, 616, 551]}, {"x": 781, "y": 530, "w": 188, "h": 100, "row": 1, "scale": 0.62, "box": [687, 452, 875, 552]}, {"x": 1034, "y": 529, "w": 226, "h": 101, "row": 1, "scale": 0.62, "box": [921, 450, 1147, 551]}],
        plants: {"lettuce": {"dir": "lettuce", "stages": [{"w": 314, "h": 362, "base": 333, "top": 193}, {"w": 314, "h": 362, "base": 333, "top": 121}, {"w": 314, "h": 362, "base": 333, "top": 126}, {"w": 314, "h": 362, "base": 333, "top": 49}, {"w": 314, "h": 362, "base": 333, "top": 25}]}, "mint": {"dir": "mint", "stages": [{"w": 312, "h": 488, "base": 459, "top": 333}, {"w": 312, "h": 488, "base": 459, "top": 267}, {"w": 312, "h": 488, "base": 459, "top": 205}, {"w": 312, "h": 488, "base": 459, "top": 91}, {"w": 312, "h": 488, "base": 459, "top": 25}]}, "cucumber": {"dir": "cucumber", "stages": [{"w": 314, "h": 487, "base": 460, "top": 325}, {"w": 314, "h": 487, "base": 460, "top": 260}, {"w": 314, "h": 487, "base": 460, "top": 156}, {"w": 314, "h": 487, "base": 460, "top": 52}, {"w": 314, "h": 487, "base": 460, "top": 17}]}, "tomato": {"dir": "tomato", "stages": [{"w": 312, "h": 484, "base": 460, "top": 305}, {"w": 312, "h": 484, "base": 460, "top": 254}, {"w": 312, "h": 484, "base": 460, "top": 197}, {"w": 312, "h": 484, "base": 460, "top": 34}, {"w": 312, "h": 484, "base": 460, "top": 26}]}, "sunflower": {"dir": "sunflower", "stages": [{"w": 296, "h": 520, "base": 498, "top": 334}, {"w": 296, "h": 520, "base": 498, "top": 296}, {"w": 296, "h": 520, "base": 498, "top": 214}, {"w": 296, "h": 520, "base": 498, "top": 77}, {"w": 296, "h": 520, "base": 498, "top": 25}]}, "apple": {"dir": "apple-tree", "stages": [{"w": 356, "h": 538, "base": 511, "top": 385}, {"w": 356, "h": 538, "base": 510, "top": 318}, {"w": 356, "h": 538, "base": 510, "top": 207}, {"w": 356, "h": 538, "base": 510, "top": 92}, {"w": 356, "h": 538, "base": 511, "top": 27}]}},
        meters: {"sun": {"w": 437, "h": 286, "dots": [[74.5, 210.0, 18.5], [124.0, 210.2, 18.5], [173.0, 210.2, 18.5], [221.8, 210.5, 18.2], [270.2, 210.2, 18.2], [317.8, 210.8, 18.2], [365.2, 210.2, 18.2]]}, "water": {"w": 441, "h": 280, "dots": [[76.5, 201.8, 19.0], [126.0, 201.8, 19.0], [174.8, 201.5, 18.8], [223.8, 201.8, 18.8], [271.8, 202.0, 18.8], [319.5, 202.0, 18.5], [367.2, 202.0, 18.2]]}, "fertilizer": {"w": 444, "h": 283, "dots": [[73.8, 195.8, 19.2], [124.2, 195.8, 19.2], [173.8, 196.2, 19.2], [222.8, 196.0, 18.8], [271.5, 196.2, 18.5], [320.2, 196.2, 18.8], [369.2, 196.2, 18.8]]}},
        card: '../assets/ui/card-blank.png',
        // Heily's effect strips: 12 frames of 200x320, bottom-centre anchored, soil line y=282.
        effects: { frameW: 200, frameH: 320, soilY: 282, count: 12, fps: 12,
            names: ['sun-day-loop', 'sun-day-absorb', 'sun-night-loop', 'sun-night-absorb', 'water-day-loop', 'water-day-absorb', 'water-night-loop', 'water-night-absorb', 'fertilizer-day-loop', 'fertilizer-day-absorb', 'fertilizer-night-loop', 'fertilizer-night-absorb'] },
        effectSrc(name) { return '../assets/effects/' + name + '-strip.png'; },
        plantSrc(id, stage) { return '../assets/plants/' + this.plants[id].dir + '/stage-' + stage + '.png'; },
        selection: {
            offsets: {
                bed1: [232, 304],
                bed2: [444, 306],
                bed3: [650, 306],
                bed4: [849, 308],
                bed5: [139, 412],
                bed6: [396, 418],
                bed7: [653, 418],
                bed8: [887, 416],
            },
            src(kind, bed) {
                const i = Math.max(1, Math.min(8, Math.round(Number(bed)) + 1));
                return '../assets/selection/ring-' + kind + '-bed' + i + '.png';
            },
        },
        // Fixed decoration anchors (backdrop px, bottom-centre). Chosen clear of the 8 bed boxes in plots[].
        decorSpots: [
            Object.freeze({ id: 'nw-path', label: 'Northwest path', x: 168, y: 298 }),
            Object.freeze({ id: 'ne-hedge', label: 'Northeast hedge', x: 1110, y: 310 }),
            Object.freeze({ id: 'sw-corner', label: 'Southwest corner', x: 145, y: 580 }),
            Object.freeze({ id: 'se-path', label: 'Southeast path', x: 1155, y: 575 }),
            Object.freeze({ id: 'mid-left', label: 'Mid-left lawn', x: 218, y: 460 }),
        ],
        produce: {
            size: 128,
            placeholder: Object.freeze({
                lettuce: '#8ecf7a', mint: '#6bb88a', cucumber: '#5a9e62', tomato: '#e07055',
                sunflower: '#f0c040', apple: '#c86b4a',
            }),
            src(id) { return '../assets/produce/' + id + '.png'; },
        },
        plantPickedSrc(id) {
            const dir = this.plants[id] && this.plants[id].dir;
            return dir ? '../assets/plants/' + dir + '/picked.png' : null;
        },
        decor: {
            ids: ['lantern', 'birdbath', 'bench', 'scarecrow', 'fairy-lights'],
            src(id, kind) { return '../assets/decor/' + id + '-' + kind + '.png'; },
            placeholderH: 96,
        },
        ui: {
            pantryShelf: '../assets/ui/pantry-shelf.png',
            unlockSeedCard: '../assets/ui/unlock-seed-card.png',
        },
        harvestFx: Object.freeze({ frameW: 200, frameH: 320, soilY: 282, count: 12, fps: 12 }),
        harvestFxSrc(kind) { return '../assets/effects/harvest-' + kind + '-strip.png'; },
        basketHud: Object.freeze({ x: 1195, y: 68 }),
    });
})();
