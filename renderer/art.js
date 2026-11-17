// renderer/art.js — painted art manifest (generated from /workspace/smile-garden-art).
// Plot geometry is in backdrop pixels (1280x720); all four backdrops share it.
// Plant sprites: per stage {w, h, base (soil mound bottom), top, anchorX (mound centre x)}.
// Meter cards: the painted dot row was removed (inpainted) so dots are drawn
// live in code at these centres {x, y, r} (card pixels).
(function () {
    'use strict';
    window.SmileArt = Object.freeze({
        width: 1280,
        height: 720,
        backgrounds: {
            dawn: '../assets/backgrounds/dawn.png',
            midday: '../assets/backgrounds/midday.png',
            'golden-hour': '../assets/backgrounds/golden-hour.png',
            night: '../assets/backgrounds/night.jpg',
        },
        plots: [{"x": 350, "y": 383, "w": 169, "h": 58, "row": 0, "scale": 0.5, "box": [266, 338, 435, 396]}, {"x": 554, "y": 385, "w": 151, "h": 58, "row": 0, "scale": 0.5, "box": [478, 340, 629, 398]}, {"x": 761, "y": 386, "w": 154, "h": 59, "row": 0, "scale": 0.5, "box": [684, 340, 838, 399]}, {"x": 968, "y": 385, "w": 171, "h": 55, "row": 0, "scale": 0.5, "box": [883, 342, 1054, 397]}, {"x": 280, "y": 519, "w": 215, "h": 93, "row": 1, "scale": 0.62, "box": [173, 446, 388, 539]}, {"x": 523, "y": 529, "w": 186, "h": 99, "row": 1, "scale": 0.62, "box": [430, 452, 616, 551]}, {"x": 781, "y": 530, "w": 188, "h": 100, "row": 1, "scale": 0.62, "box": [687, 452, 875, 552]}, {"x": 1034, "y": 529, "w": 226, "h": 101, "row": 1, "scale": 0.62, "box": [921, 450, 1147, 551]}],
        plants: {"lettuce":{"dir":"lettuce","stages":[{"w":314,"h":362,"base":333,"top":193,"anchorX":154.0},{"w":314,"h":362,"base":333,"top":121,"anchorX":151.9},{"w":314,"h":362,"base":333,"top":126,"anchorX":144.1},{"w":314,"h":362,"base":333,"top":49,"anchorX":150.1},{"w":314,"h":362,"base":333,"top":25,"anchorX":155.3}]},"mint":{"dir":"mint","stages":[{"w":312,"h":488,"base":459,"top":333,"anchorX":156.9},{"w":312,"h":488,"base":459,"top":267,"anchorX":150.0},{"w":312,"h":488,"base":459,"top":205,"anchorX":141.9},{"w":312,"h":488,"base":459,"top":91,"anchorX":148.4},{"w":312,"h":488,"base":459,"top":25,"anchorX":156.5}]},"cucumber":{"dir":"cucumber","stages":[{"w":314,"h":487,"base":460,"top":325,"anchorX":155.4},{"w":314,"h":487,"base":460,"top":260,"anchorX":140.2},{"w":314,"h":487,"base":460,"top":156,"anchorX":138.4},{"w":314,"h":487,"base":460,"top":52,"anchorX":148.0},{"w":314,"h":487,"base":460,"top":17,"anchorX":156.5}]},"tomato":{"dir":"tomato","stages":[{"w":312,"h":484,"base":460,"top":305,"anchorX":154.2},{"w":312,"h":484,"base":460,"top":254,"anchorX":150.9},{"w":312,"h":484,"base":460,"top":197,"anchorX":142.0},{"w":312,"h":484,"base":460,"top":34,"anchorX":142.1},{"w":312,"h":484,"base":460,"top":26,"anchorX":151.2}]},"sunflower":{"dir":"sunflower","stages":[{"w":296,"h":520,"base":498,"top":334,"anchorX":148.9},{"w":296,"h":520,"base":498,"top":296,"anchorX":145.0},{"w":296,"h":520,"base":498,"top":214,"anchorX":149.2},{"w":296,"h":520,"base":498,"top":77,"anchorX":151.3},{"w":296,"h":520,"base":498,"top":25,"anchorX":151.3}]},"apple":{"dir":"apple-tree","stages":[{"w":356,"h":538,"base":511,"top":385,"anchorX":178.5},{"w":356,"h":538,"base":510,"top":318,"anchorX":177.4},{"w":356,"h":538,"base":510,"top":207,"anchorX":179.4},{"w":356,"h":538,"base":510,"top":92,"anchorX":188.3},{"w":356,"h":538,"base":511,"top":27,"anchorX":178.0}]}},
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
            Object.freeze({ id: 'nw-path', label: 'Northwest path', x: 168, y: 298, scale: 0.58 }),
            Object.freeze({ id: 'ne-hedge', label: 'Northeast hedge', x: 1110, y: 310, scale: 0.55 }),
            Object.freeze({ id: 'sw-corner', label: 'Southwest corner', x: 145, y: 580, scale: 0.48 }),
            Object.freeze({ id: 'se-path', label: 'Southeast path', x: 1155, y: 575, scale: 0.62 }),
            Object.freeze({ id: 'mid-left', label: 'Mid-left lawn', x: 218, y: 460, scale: 0.62 }),
        ],
        produce: {
            size: 128,
            placeholder: Object.freeze({
                lettuce: '#8ecf7a', mint: '#6bb88a', cucumber: '#5a9e62', tomato: '#e07055',
                sunflower: '#f0c040', apple: '#c86b4a',
            }),
            src(id) { return '../assets/produce/' + id + '.png'; },
            basket: '../assets/ui/basket.png',
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
        pantry: Object.freeze({
            w: 1047,
            h: 807,
            src: '../assets/ui/pantry-shelf.png',
            iconFrac: 0.52,
            // Cubby interiors (shelf image pixels); labels are blank plaques below each opening.
            cubbies: [
                Object.freeze({ box: [48, 48, 510, 258], label: [279, 278] }),
                Object.freeze({ box: [536, 48, 998, 258], label: [767, 278] }),
                Object.freeze({ box: [48, 305, 510, 515], label: [279, 535] }),
                Object.freeze({ box: [536, 305, 998, 515], label: [767, 535] }),
                Object.freeze({ box: [48, 562, 510, 772], label: [279, 792] }),
                Object.freeze({ box: [536, 562, 998, 772], label: [767, 792] }),
            ],
        }),
        ui: {
            pantryShelf: '../assets/ui/pantry-shelf.png',
            unlockSeedCard: '../assets/ui/unlock-seed-card.png',
            logoDay: '../assets/ui/logo-day.png',
            logoNight: '../assets/ui/logo-night.png',
            logoFallback: 'Smile Garden',
        },
        logoHud: Object.freeze({ x: 20, y: 20, w: 184, h: 49 }),
        critters: Object.freeze({
            dir: '../assets/critters/',
            bounds: Object.freeze({ width: 1280, height: 720, hudTop: 92, margin: 48 }),
            placeholder: Object.freeze({
                butterfly: '#e8a050',
                'butterfly-white': '#f4f2ea',
                bee: '#f0c840',
            }),
            strips: Object.freeze({
                'butterfly-monarch': Object.freeze({ file: 'butterfly-monarch-strip.png', frameW: 200, frameH: 200, fps: 12, scale: 0.32, kind: 'butterfly' }),
                'butterfly-white': Object.freeze({ file: 'butterfly-white-strip.png', frameW: 200, frameH: 200, fps: 12, scale: 0.32, kind: 'butterfly' }),
                bee: Object.freeze({ file: 'bee-strip.png', frameW: 200, frameH: 200, fps: 16, scale: 0.28, kind: 'bee' }),
            }),
            roster: Object.freeze([
                Object.freeze({ id: 'monarch', strip: 'butterfly-monarch', anchor: [420, 280], phase: 0.2, ampX: 75, ampY: 20, pathSpeed: 0.24, timeScale: 1.0 }),
                Object.freeze({ id: 'white', strip: 'butterfly-white', anchor: [820, 320], phase: 2.1, ampX: 82, ampY: 18, pathSpeed: 0.19, timeScale: 1.12 }),
                Object.freeze({ id: 'bee', strip: 'bee', anchor: [640, 240], phase: 4.7, ampX: 70, ampY: 16, pathSpeed: 0.31, timeScale: 0.92 }),
            ]),
        }),
        critterStripSrc(stripKey) {
            const C = this.critters;
            const spec = C && C.strips[stripKey];
            return spec ? C.dir + spec.file : null;
        },
        // Ready + harvest effect strips in assets/effects/ (see docs/ART-NEEDED.md).
        harvest: Object.freeze({
            frameW: 200,
            frameH: 320,
            soilY: 282,
            fps: 12,
            basketInFrame: [150, 286],
            readyCount: 12,
            defaultHarvestCount: 12,
            genericHarvestCount: 12,
            swapFrame: 5,
            plantIds: ['lettuce', 'mint', 'cucumber', 'tomato', 'sunflower', 'apple'],
        }),
        readyStripSrc(lighting) {
            const kind = lighting === 'night' ? 'night' : 'day';
            return '../assets/effects/ready-' + kind + '-strip.png';
        },
        harvestStripSrc(plantId, lighting) {
            const kind = lighting === 'night' ? 'night' : 'day';
            return '../assets/effects/harvest-' + plantId + '-' + kind + '-strip.png';
        },
        genericHarvestStripSrc(lighting) {
            const kind = lighting === 'night' ? 'night' : 'day';
            return '../assets/effects/harvest-' + kind + '-strip.png';
        },
        basketHud: Object.freeze({ x: 1195, y: 68, w: 36, h: 36 }),
    });
})();
