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
        meters: {"sun": {"w": 437, "h": 286, "dots": [[74.5, 210.0, 18.5], [124.0, 210.2, 18.5], [173.0, 210.2, 18.5], [221.8, 210.5, 18.2], [270.2, 210.2, 18.2], [317.8, 210.8, 18.2], [365.2, 210.2, 18.2]]}, "water": {"w": 441, "h": 280, "dots": [[76.5, 201.8, 19.0], [126.0, 201.8, 19.0], [174.8, 201.5, 18.8], [223.8, 201.8, 18.8], [271.8, 202.0, 18.8], [319.5, 202.0, 18.5], [367.2, 202.0, 18.2]]}, "fertilizer": {"w": 444, "h": 283, "dots": [[73.8, 195.8, 19.2], [124.2, 195.8, 19.2], [173.8, 196.2, 19.2], [222.8, 196.0, 18.8], [271.5, 196.2, 18.5], [320.2, 196.2, 18.8], [369.2, 196.2, 18.8]]}, "stake": {"w": 444, "h": 283, "dots": [[73.8, 195.8, 19.2], [124.2, 195.8, 19.2], [173.8, 196.2, 19.2], [222.8, 196.0, 18.8], [271.5, 196.2, 18.5], [320.2, 196.2, 18.8], [369.2, 196.2, 18.8]]}},
        card: '../assets/ui/card-blank.png',
        // Heily's effect strips: 12 frames of 200x320, bottom-centre anchored, soil line y=282.
        effects: { frameW: 200, frameH: 320, soilY: 282, count: 12, fps: 12,
            names: ['sun-day-loop', 'sun-day-absorb', 'sun-night-loop', 'sun-night-absorb', 'water-day-loop', 'water-day-absorb', 'water-night-loop', 'water-night-absorb', 'fertilizer-day-loop', 'fertilizer-day-absorb', 'fertilizer-night-loop', 'fertilizer-night-absorb', 'stake-day-loop', 'stake-day-absorb', 'stake-night-loop', 'stake-night-absorb'] },
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
        /** Authoritative: assets/tags-manifest.json */
        tendedSoil: Object.freeze({
            fadeSec: 1.2,
            src(kind, bedIndex) {
                const b = Math.max(1, Math.min(8, Math.round(Number(bedIndex) || 0) + 1));
                return '../assets/scene/soil/soil-' + (kind === 'night' ? 'night' : 'day') + '-bed' + b + '.png';
            },
            pos(bedIndex) {
                const key = 'bed' + (Math.max(1, Math.min(8, Math.round(Number(bedIndex) || 0) + 1)));
                const spot = ART.needs.soilBeds[key];
                return spot ? spot.pos.slice() : [0, 0];
            },
        }),
        plantTendedSoilSrc(lighting, bedIndex) {
            const kind = lighting === 'night' ? 'night' : 'day';
            return this.tendedSoil.src(kind, bedIndex);
        },
        needs: Object.freeze({
            scale2x: true,
            plantTagDay: '../assets/ui/tag/plant-tag-day.png',
            plantTagNight: '../assets/ui/tag/plant-tag-night.png',
            needsCard: '../assets/ui/tag/needs-card.png',
            needsCardNight: '../assets/ui/tag/needs-card-night.png',
            cardInk: '#3E2A1A',
            tagPixels: Object.freeze([224, 227]),
            tagAnchor: Object.freeze([112, 227]),
            faceBox: Object.freeze([14, 13, 209, 116]),
            cardPixels: Object.freeze([720, 560]),
            cardDisplay: Object.freeze([360, 280]),
            cardStamp: Object.freeze([584, 72, 712, 200]),
            cardTitle: Object.freeze([150, 124, 570, 178]),
            cardRows: Object.freeze([
                { key: 'sun', row: [48, 190, 672, 276], icon: [64, 201, 128, 265], dots: [[492, 233], [548, 233], [604, 233]], dotSize: 28, status: [640, 219, 668, 247] },
                { key: 'water', row: [48, 276, 672, 362], icon: [64, 287, 128, 351], dots: [[492, 319], [548, 319], [604, 319]], dotSize: 28, status: [640, 305, 668, 333] },
                { key: 'fertilizer', row: [48, 362, 672, 448], icon: [64, 373, 128, 437], dots: [[492, 405], [548, 405], [604, 405]], dotSize: 28, status: [640, 391, 668, 419] },
                { key: 'stake', row: [48, 448, 672, 534], icon: [64, 459, 128, 523], dots: [[492, 491], [548, 491], [604, 491]], dotSize: 28, status: [640, 477, 668, 505] },
            ]),
            tagSpots: Object.freeze({
                bed1: Object.freeze({ anchor: [278, 419], scale: 0.5 }),
                bed2: Object.freeze({ anchor: [492, 422], scale: 0.5 }),
                bed3: Object.freeze({ anchor: [706, 424], scale: 0.5 }),
                bed4: Object.freeze({ anchor: [924, 423], scale: 0.5 }),
                bed5: Object.freeze({ anchor: [189, 566], scale: 0.62 }),
                bed6: Object.freeze({ anchor: [449, 581], scale: 0.62 }),
                bed7: Object.freeze({ anchor: [714, 582], scale: 0.62 }),
                bed8: Object.freeze({ anchor: [984, 583], scale: 0.62 }),
            }),
            soilBeds: Object.freeze({
                bed1: Object.freeze({ pos: [257, 331] }),
                bed2: Object.freeze({ pos: [471, 333] }),
                bed3: Object.freeze({ pos: [678, 334] }),
                bed4: Object.freeze({ pos: [875, 335] }),
                bed5: Object.freeze({ pos: [163, 440] }),
                bed6: Object.freeze({ pos: [424, 446] }),
                bed7: Object.freeze({ pos: [685, 448] }),
                bed8: Object.freeze({ pos: [914, 445] }),
            }),
            iconSun: '../assets/ui/care/icon-sun.png',
            iconSunNight: '../assets/ui/care/icon-sun-night.png',
            iconWater: '../assets/ui/care/icon-water.png',
            iconWaterNight: '../assets/ui/care/icon-water-night.png',
            iconFertilizer: '../assets/ui/care/icon-fertilizer.png',
            iconFertilizerNight: '../assets/ui/care/icon-fertilizer-night.png',
            iconStake: '../assets/ui/care/icon-stake.png',
            iconStakeNight: '../assets/ui/care/icon-stake-night.png',
            dotEmpty: '../assets/ui/care/need-dot-empty.png',
            dotEmptyNight: '../assets/ui/care/need-dot-empty-night.png',
            dotFilled: '../assets/ui/care/need-dot-filled.png',
            dotFilledNight: '../assets/ui/care/need-dot-filled-night.png',
            needDone: '../assets/ui/care/need-done.png',
            needDoneNight: '../assets/ui/care/need-done-night.png',
            bloomStamp: '../assets/ui/care/bloom-stamp.png',
            bloomStampNight: '../assets/ui/care/bloom-stamp-night.png',
            restingLeaf: '../assets/ui/care/resting-leaf.png',
            restingLeafNight: '../assets/ui/care/resting-leaf-night.png',
            iconDisplay: Object.freeze([32, 32]),
            dotDisplay: Object.freeze([14, 14]),
            bloomDisplay: Object.freeze([64, 64]),
            restingDisplay: Object.freeze([32, 32]),
            tagFaceIconPx: 48,
            tagFaceDotPx: 16,
            nightTagBlend: 0.42,
        }),
        plantTagSrc(lighting) {
            const day = lighting !== 'night';
            return day ? this.needs.plantTagDay : this.needs.plantTagNight;
        },
        /** Dawn/midday/golden hour → day card; night → painted night sheet (same layout boxes). */
        needsCardSrc(lighting) {
            const day = lighting !== 'night';
            return day ? this.needs.needsCard : this.needs.needsCardNight;
        },
        needsIconSrc(key, lighting) {
            const n = this.needs;
            const night = lighting === 'night';
            if (key === 'sun') return night ? n.iconSunNight : n.iconSun;
            if (key === 'water') return night ? n.iconWaterNight : n.iconWater;
            if (key === 'fertilizer') return night ? n.iconFertilizerNight : n.iconFertilizer;
            if (key === 'stake') return night ? n.iconStakeNight : n.iconStake;
            return n.iconSun;
        },
        needsDotSrc(filled, lighting) {
            const n = this.needs;
            if (filled) return lighting === 'night' ? n.dotFilledNight : n.dotFilled;
            return lighting === 'night' ? n.dotEmptyNight : n.dotEmpty;
        },
        needsDoneSrc(lighting) {
            return lighting === 'night' ? this.needs.needDoneNight : this.needs.needDone;
        },
        needsBloomSrc(lighting) {
            return lighting === 'night' ? this.needs.bloomStampNight : this.needs.bloomStamp;
        },
        needsRestingSrc(lighting) {
            return lighting === 'night' ? this.needs.restingLeafNight : this.needs.restingLeaf;
        },
        /** Authoritative: assets/stake-manifest.json */
        stretch: Object.freeze({
            scale2x: true,
            guideFull: '../assets/ui/stretch/guide-full.png',
            guideStem: '../assets/ui/stretch/guide-stem.png',
            guideStemNight: '../assets/ui/stretch/guide-stem-night.png',
            guideHead: '../assets/ui/stretch/guide-head.png',
            guideHeadNight: '../assets/ui/stretch/guide-head-night.png',
            guideBoxDisplay: Object.freeze([160, 220]),
            stemDisplay: Object.freeze([124.5, 153]),
            headDisplay: Object.freeze([80, 80]),
            stemPlaceInBox: Object.freeze([16, 64]),
            stemPivotInBox: Object.freeze([80, 216]),
            stemPivotInStem: Object.freeze([64, 152]),
            headArmLength: 143,
            headRollClamp: 28,
            headRollGain: 1.15,
            hintLeft: '../assets/ui/stretch/hint-left.png',
            hintRight: '../assets/ui/stretch/hint-right.png',
            hintLeftNight: '../assets/ui/stretch/hint-left-night.png',
            hintRightNight: '../assets/ui/stretch/hint-right-night.png',
            hintDisplay: Object.freeze([75, 33.5]),
            ringTrack: '../assets/ui/stretch/ring-track.png',
            ringTrackNight: '../assets/ui/stretch/ring-track-night.png',
            ringFull: '../assets/ui/stretch/ring-full.png',
            ringFullNight: '../assets/ui/stretch/ring-full-night.png',
            ringStripDay: '../assets/ui/stretch/ring-day-strip.png',
            ringStripNight: '../assets/ui/stretch/ring-night-strip.png',
            ringFramesDay: '../assets/ui/stretch/ring-day-frames/',
            ringFramesNight: '../assets/ui/stretch/ring-night-frames/',
            ringFrames: 12,
            ringFrameDisplay: Object.freeze([200, 200]),
            ringOffsetInGuide: Object.freeze([-20, 12]),
            stakeShortDay: '../assets/plants/stake/stake-short-day.png',
            stakeShortNight: '../assets/plants/stake/stake-short-night.png',
            stakeTallDay: '../assets/plants/stake/stake-tall-day.png',
            stakeTallNight: '../assets/plants/stake/stake-tall-night.png',
            stakeOffsetX: 56,
            stakeSprites: Object.freeze({
                tall: Object.freeze({ w: 50, h: 304, base: 293, top: 4 }),
                short: Object.freeze({ w: 52, h: 225, base: 214, top: 4 }),
            }),
            stakeLeftPlants: Object.freeze(['tomato', 'cucumber']),
            stakeTallPlants: Object.freeze(['sunflower', 'tomato', 'cucumber', 'apple']),
        }),
        stakeSpriteKind(plantId, stage) {
            const s = this.stretch;
            const tall = s.stakeTallPlants.includes(plantId) || (Number(stage) || 0) >= 4;
            return tall ? 'tall' : 'short';
        },
        stakeOffsetXForPlant(plantId) {
            return this.stretch.stakeLeftPlants.includes(plantId)
                ? -this.stretch.stakeOffsetX
                : this.stretch.stakeOffsetX;
        },
        plantStakeSrc(plantId, stage) {
            const kind = this.stakeSpriteKind(plantId, stage);
            return kind === 'tall' ? this.stretch.stakeTallDay : this.stretch.stakeShortDay;
        },
        needsStakeIconSrc(lighting) {
            return lighting === 'night' ? this.needs.iconStakeNight : this.needs.iconStake;
        },
    });
})();
