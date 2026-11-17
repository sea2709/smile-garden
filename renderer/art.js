// renderer/art.js — painted art manifest (generated from /workspace/smile-garden-art).
// Plot geometry is in backdrop pixels (1280x720); all four backdrops share it.
// Plant sprites: per stage {w, h, base (stem foot y), top}. Horizontal center is canvas midpoint (Heily-centered art).
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
        plots: [{"x":347,"y":369,"w":169,"h":58,"row":0,"scale":0.5,"box":[266,338,435,396]},{"x":554,"y":369,"w":151,"h":58,"row":0,"scale":0.5,"box":[478,340,629,398]},{"x":761,"y":369,"w":154,"h":59,"row":0,"scale":0.5,"box":[684,340,838,399]},{"x":968,"y":369,"w":171,"h":55,"row":0,"scale":0.5,"box":[883,342,1054,397]},{"x":283,"y":494,"w":215,"h":93,"row":1,"scale":0.62,"box":[173,446,388,539]},{"x":528,"y":504,"w":186,"h":99,"row":1,"scale":0.62,"box":[430,452,616,551]},{"x":771,"y":504,"w":188,"h":100,"row":1,"scale":0.62,"box":[687,452,875,552]},{"x":1027,"y":506,"w":226,"h":101,"row":1,"scale":0.62,"box":[921,450,1147,551]}],
        plants: {"lettuce":{"dir":"lettuce","stages":[{"w":314,"h":362,"base":330,"top":214},{"w":314,"h":362,"base":250,"top":122},{"w":314,"h":362,"base":253,"top":126},{"w":314,"h":362,"base":258,"top":51},{"w":314,"h":362,"base":260,"top":26}]},"mint":{"dir":"mint","stages":[{"w":312,"h":488,"base":456,"top":335},{"w":312,"h":488,"base":380,"top":267},{"w":312,"h":488,"base":375,"top":205},{"w":312,"h":488,"base":397,"top":92},{"w":312,"h":488,"base":394,"top":35}]},"cucumber":{"dir":"cucumber","stages":[{"w":314,"h":487,"base":456,"top":335},{"w":314,"h":487,"base":373,"top":261},{"w":314,"h":487,"base":372,"top":157},{"w":314,"h":487,"base":371,"top":54},{"w":314,"h":487,"base":383,"top":19}]},"tomato":{"dir":"tomato","stages":[{"w":312,"h":484,"base":452,"top":380},{"w":312,"h":484,"base":376,"top":254},{"w":312,"h":484,"base":386,"top":197},{"w":312,"h":484,"base":367,"top":37},{"w":312,"h":484,"base":381,"top":27}]},"sunflower":{"dir":"sunflower","stages":[{"w":296,"h":520,"base":493,"top":395},{"w":296,"h":520,"base":423,"top":296},{"w":296,"h":520,"base":419,"top":214},{"w":296,"h":520,"base":417,"top":83},{"w":296,"h":520,"base":416,"top":26}]},"apple":{"dir":"apple-tree","stages":[{"w":356,"h":538,"base":509,"top":387},{"w":356,"h":538,"base":439,"top":319},{"w":356,"h":538,"base":408,"top":208},{"w":356,"h":538,"base":405,"top":92},{"w":356,"h":538,"base":405,"top":28}]}},
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
        /** Authoritative paths: assets/time-manifest.json */
        clock: Object.freeze({
            scale2x: true,
            display: Object.freeze({ w: 160, h: 64, cx: 640, cy: 40 }),
            frameSrc(kind) {
                return '../assets/ui/clock/clock-frame-' + (kind === 'night' ? 'night' : 'day') + '.png';
            },
            frontSrc(kind) {
                return '../assets/ui/clock/clock-front-' + (kind === 'night' ? 'night' : 'day') + '.png';
            },
            framePixels: Object.freeze([320, 128]),
            sunSrc: '../assets/ui/clock/sun-token.png',
            moonSrc: '../assets/ui/clock/moon-token.png',
            tokenPixels: Object.freeze([64, 64]),
            tokenDisplay: 32,
            arc: Object.freeze({ centerX: 160.6, centerY: 183.1, radius: 150.6, startDeg: 147, endDeg: 33 }),
            ribbonSrc(kind) {
                return kind === 'night' ? '../assets/ui/clock/season-ribbon-night.png' : '../assets/ui/clock/season-ribbon.png';
            },
            ribbonPixels: Object.freeze([280, 61]),
            ribbonDisplay: Object.freeze({ w: 140, h: 30, cx: 640, cy: 88 }),
        }),
        bedtime: Object.freeze({
            bedButtonIcon: '../assets/ui/bed-button-icon.png',
            windowGlow: '../assets/bedtime/window-glow.png',
            windowDark: '../assets/bedtime/window-dark.png',
            morningCard: '../assets/bedtime/morning-card.png',
            morningCardSize: Object.freeze([700, 600]),
            morningTextSafe: Object.freeze([60, 290, 640, 560]),
        }),
        seasons: Object.freeze({
            overlaySrc(season, kind) {
                return '../assets/seasons/' + season + '-' + (kind === 'night' ? 'night' : 'day') + '.png';
            },
            overlayPixels: Object.freeze([1280, 720]),
            particleSrc(name) {
                return '../assets/seasons/particles/' + name + '.png';
            },
            particleScale: 0.5,
            particlePools: Object.freeze({
                spring: ['petal-1', 'petal-2', 'petal-3', 'petal-4', 'petal-5', 'blossom-1', 'blossom-2', 'blossom-3'],
                summerDay: ['seed-fluff', 'pollen'],
                summerNight: ['firefly'],
                autumn: ['leaf-1', 'leaf-2', 'leaf-3', 'leaf-4', 'leaf-5', 'leaf-6'],
                winter: ['snowflake-1', 'snowflake-2', 'snowflake-3', 'snowflake-4', 'snowflake-5', 'snowflake-6'],
            }),
        }),
        logoHud: Object.freeze({ x: 20, y: 20, w: 184, h: 49, srcPixels: Object.freeze([368, 98]) }),
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
        tendedSoil: Object.freeze({
            /** Per-bed damp soil overlay (day/night); anchor on plot soil centroid (plots[].x/y). */
            src(kind, bedIndex) {
                const b = Math.max(1, Math.min(8, Math.round(Number(bedIndex) || 0) + 1));
                return '../assets/plots/tended-soil-' + (kind === 'night' ? 'night' : 'day') + '-bed' + b + '.png';
            },
            /** Bottom-centre of overlay aligns to ART.plots[i].x / .y (same as plant soil anchor). */
            anchor: Object.freeze({ x: 0.5, y: 1 }),
            /** Clip to plots[i].box when using code fallback (backdrop px). */
        }),
        plantTendedSoilSrc(lighting, bedIndex) {
            const kind = lighting === 'night' ? 'night' : 'day';
            return this.tendedSoil.src(kind, bedIndex);
        },
        needs: Object.freeze({
            scale2x: true,
            plantTag: '../assets/ui/needs/plant-tag.png',
            needsCard: '../assets/ui/needs/needs-card-bg.png',
            iconSun: '../assets/ui/needs/icon-sun.png',
            iconWater: '../assets/ui/needs/icon-water.png',
            iconFertilizer: '../assets/ui/needs/icon-fertilizer.png',
            iconStake: '../assets/ui/needs/icon-stake.png',
            dotEmpty: '../assets/ui/needs/dot-empty.png',
            dotFullSun: '../assets/ui/needs/dot-full-sun.png',
            dotFullWater: '../assets/ui/needs/dot-full-water.png',
            dotFullFert: '../assets/ui/needs/dot-full-fert.png',
            bloomStamp: '../assets/ui/needs/bloom-stamp.png',
            restingLeaf: '../assets/ui/needs/resting-leaf.png',
            tagPixels: Object.freeze([80, 96]),
            tagAnchor: Object.freeze({ x: 0.5, y: 1 }),
            cardPixels: Object.freeze([560, 420]),
            iconPixels: Object.freeze([64, 64]),
            bloomPixels: Object.freeze([72, 72]),
            restingPixels: Object.freeze([56, 56]),
            restingDisplay: 28,
            tagOffset: Object.freeze([0, -42]),
        }),
        cameraCheck: Object.freeze({
            scale2x: true,
            backdrop: '../assets/ui/camera-check/backdrop.png',
            windowFrame: '../assets/ui/camera-check/window-frame.png',
            sill: '../assets/ui/camera-check/sill.png',
            /** Game check key → packet filename stem (breath → breathe). */
            packetStem: Object.freeze({ smile: 'smile', talk: 'talk', breath: 'breathe', stretch: 'stretch' }),
            /** Display layout on the 1280×720 stage (art assets @2×). */
            layout: Object.freeze({
                stageW: 1280,
                stageH: 720,
                preview: Object.freeze({ w: 560, h: 420, cx: 640, top: 56 }),
                windowFrame: Object.freeze({ w: 640, h: 500, cx: 640, cy: 266 }),
                sill: Object.freeze({ top: 520, bottom: 600 }),
                packet: Object.freeze({ w: 110, h: 150, bottom: 600 }),
                packetCenters: Object.freeze({ smile: 400, talk: 560, breath: 720, stretch: 880 }),
                label: Object.freeze({ top: 610, bottom: 650 }),
                footerY: 680,
                skipLeft: 96,
                startRight: 96,
            }),
            backdropPixels: Object.freeze([1280, 720]),
            windowFramePixels: Object.freeze([640, 500]),
            sillPixels: Object.freeze([1280, 80]),
            packetPixels: Object.freeze([110, 150]),
            packetSrc(checkKey, sprouted) {
                const stem = this.packetStem[checkKey] || checkKey;
                const state = sprouted ? 'sprouted' : 'closed';
                return `../assets/ui/camera-check/packet-${stem}-${state}.png`;
            },
        }),
        stretch: Object.freeze({
            scale2x: true,
            /** Combined guide (fallback); Heily ships head + stem separately. */
            guideSunflower: '../assets/ui/stretch/guide-sunflower.png',
            guideSunflowerHead: '../assets/ui/stretch/guide-sunflower-head.png',
            guideSunflowerStem: '../assets/ui/stretch/guide-sunflower-stem.png',
            /** Normalized pivot on guide frame (stem base); head rotates around this. */
            guidePivot: Object.freeze({ x: 0.5, y: 0.75 }),
            guidePixels: Object.freeze([192, 192]),
            guideDisplay: 96,
            vineRingEmpty: '../assets/ui/stretch/vine-ring-empty.png',
            vineRingFull: '../assets/ui/stretch/vine-ring-full.png',
            vinePixels: Object.freeze([120, 120]),
            vineDisplay: 60,
            stake: '../assets/plants/stake-day.png',
            stakeDay: '../assets/plants/stake-day.png',
            stakeNight: '../assets/plants/stake-night.png',
            /** Soil anchor on stake sprite (normalized from bottom-left of frame). */
            stakeAnchor: Object.freeze({ x: 0.5, y: 1 }),
            stakePixels: Object.freeze([80, 200]),
            stakeDisplay: Object.freeze({ w: 20, h: 50 }),
            stakeOffset: Object.freeze([14, -8]),
            stakeAbsorbStripDay: '../assets/effects/stake-absorb-day-strip.png',
            stakeAbsorbStripNight: '../assets/effects/stake-absorb-night-strip.png',
            stakeLoopStripDay: '../assets/effects/stake-loop-day-strip.png',
            stakeLoopStripNight: '../assets/effects/stake-loop-night-strip.png',
        }),
        plantStakeSrc(lighting) {
            const kind = lighting === 'night' ? 'night' : 'day';
            return kind === 'night' ? this.stretch.stakeNight : this.stretch.stakeDay;
        },
        plantStakeAbsorbSrc(lighting) {
            return lighting === 'night' ? this.stretch.stakeAbsorbStripNight : this.stretch.stakeAbsorbStripDay;
        },
        plantStakeLoopSrc(lighting) {
            return lighting === 'night' ? this.stretch.stakeLoopStripNight : this.stretch.stakeLoopStripDay;
        },
    });
})();
