// game/season-particles.js — drifting season particles (pool pick, reseed rules, night swap).
'use strict';
(function () {

const TAU = Math.PI * 2;
const NIGHT_POOL_THRESHOLD = 0.55;

function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function particlePool(season, nightWeight, pools) {
    if (!pools) return [];
    const nightW = Number(nightWeight) || 0;
    if (season === 'spring') return pools.spring || [];
    if (season === 'autumn') return pools.autumn || [];
    if (season === 'winter') return pools.winter || [];
    if (season === 'summer') return nightW > NIGHT_POOL_THRESHOLD ? (pools.summerNight || []) : (pools.summerDay || []);
    return [];
}

function pickSprite(pool, rnd) {
    return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
}

function inKeepOut(pt, keepOut) {
    if (!keepOut) return false;
    return pt.x >= keepOut.left && pt.x <= keepOut.right
        && pt.y >= keepOut.top && pt.y <= keepOut.bottom;
}

function newParticle({ pool, rnd, width, height, anywhere, keepOut }) {
    let x = rnd() * width;
    let y = anywhere ? rnd() * height * 0.72 : -20 - rnd() * 40;
    if (keepOut && inKeepOut({ x, y }, keepOut)) {
        y = keepOut.bottom + 12 + rnd() * 48;
    }
    return {
        sprite: pickSprite(pool, rnd),
        x,
        y,
        vx: (rnd() - 0.5) * 22,
        vy: 12 + rnd() * 22,
        rot: rnd() * TAU,
        vr: (rnd() - 0.5) * 2.5,
        ph: rnd() * TAU,
    };
}

/** Keep x/y; pick a new sprite when the active pool no longer includes the current one. */
function syncSpritesToPool(particles, pool, rnd) {
    if (!pool.length) return;
    for (const p of particles) {
        if (!p.sprite || !pool.includes(p.sprite)) p.sprite = pickSprite(pool, rnd);
    }
}

function reseedAll(particles, { pool, rnd, width, height, keepOut }) {
    for (let i = 0; i < particles.length; i++) {
        particles[i] = newParticle({ pool, rnd, width, height, anywhere: true, keepOut });
    }
}

/**
 * @param {{ width: number, height: number, pools: object, count?: number, seed?: number }} opts
 */
function createEngine(opts) {
    const width = opts.width;
    const height = opts.height;
    const pools = opts.pools;
    const keepOut = opts.keepOut || null;
    const count = opts.count || 12;
    const rnd = mulberry(opts.seed != null ? opts.seed : 42);
    let season = 'spring';
    let nightWeight = 0;
    const particles = [];

    function currentPool() {
        return particlePool(season, nightWeight, pools);
    }

    function setSeason(next) {
        const s = next || 'spring';
        if (s === season) return false;
        season = s;
        reseedAll(particles, { pool: particlePool(season, nightWeight, pools), rnd, width, height, keepOut });
        return true;
    }

    /** Lighting-only summer day/night pool flip — never moves particles. */
    function setNightWeight(nw) {
        const next = Math.max(0, Math.min(1, Number(nw) || 0));
        const wasNight = nightWeight > NIGHT_POOL_THRESHOLD;
        const isNight = next > NIGHT_POOL_THRESHOLD;
        nightWeight = next;
        if (season === 'summer' && wasNight !== isNight) {
            syncSpritesToPool(particles, currentPool(), rnd);
        }
    }

    function init() {
        particles.length = 0;
        for (let i = 0; i < count; i++) {
            particles.push(newParticle({ pool: currentPool(), rnd, width, height, anywhere: true, keepOut }));
        }
    }

    function update(dt, t) {
        const pool = currentPool();
        if (!pool.length) return;
        const wind = Math.sin(t * 0.35) * 10;
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += (p.vx + wind) * dt;
            p.y += p.vy * dt;
            p.rot += p.vr * dt;
            if (keepOut && inKeepOut(p, keepOut)) {
                p.y = keepOut.bottom + 10 + rnd() * 36;
            }
            if (p.y > height * 0.78 || p.x < -40 || p.x > width + 40) {
                particles[i] = newParticle({ pool, rnd, width, height, anywhere: false, keepOut });
            }
        }
    }

    /** Simulate repeated refreshLighting ticks without re-calling setSeason. */
    function applyLighting({ season: s, nightWeight: nw }) {
        setSeason(s);
        setNightWeight(nw);
    }

    init();

    return {
        get season() { return season; },
        get nightWeight() { return nightWeight; },
        get particles() { return particles; },
        particlePool: currentPool,
        setSeason,
        setNightWeight,
        update,
        applyLighting,
        reseedAll: () => reseedAll(particles, { pool: currentPool(), rnd, width, height, keepOut }),
    };
}

const api = {
    TAU,
    NIGHT_POOL_THRESHOLD,
    particlePool,
    pickSprite,
    newParticle,
    syncSpritesToPool,
    reseedAll,
    createEngine,
    mulberry,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.SmileSeasonParticles = api;
}

})();