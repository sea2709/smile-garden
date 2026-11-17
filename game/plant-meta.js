// game/plant-meta.js — read assets/plants/plant-meta.json (Heily stage-N keys).
'use strict';

const DIR_TO_ART = {
    lettuce: 'lettuce',
    mint: 'mint',
    cucumber: 'cucumber',
    tomato: 'tomato',
    sunflower: 'sunflower',
    'apple-tree': 'apple',
};

const ART_TO_DIR = {
    apple: 'apple-tree',
};

function artIdForMetaKey(key) {
    return DIR_TO_ART[key] || key;
}

function dirForMetaKey(key) {
    return key;
}

/** @returns {{w,h,base,top} | null} */
function stageMetaFromEntry(entry, stageNum) {
    if (!entry) return null;
    if (entry.stages && entry.stages[stageNum - 1]) return entry.stages[stageNum - 1];
    return entry[`stage-${stageNum}`] || null;
}

function pickedMetaFromEntry(entry) {
    return entry && entry.picked ? entry.picked : null;
}

function stagesArrayFromEntry(key, entry) {
    const stages = [];
    if (entry.stages) {
        for (const st of entry.stages) {
            stages.push({ w: st.w, h: st.h, base: st.base, top: st.top });
        }
    } else {
        for (let i = 1; i <= 5; i++) {
            const st = entry[`stage-${i}`];
            if (!st) throw new Error(`${key}: missing stage-${i}`);
            stages.push({ w: st.w, h: st.h, base: st.base, top: st.top });
        }
    }
    const pk = pickedMetaFromEntry(entry);
    if (pk && stages.length >= 5) {
        stages[4] = { w: pk.w, h: pk.h, base: pk.base, top: pk.top };
    }
    return stages;
}

function plantsBlockFromMeta(raw) {
    const plants = {};
    for (const [key, entry] of Object.entries(raw)) {
        const id = artIdForMetaKey(key);
        plants[id] = {
            dir: dirForMetaKey(key),
            stages: stagesArrayFromEntry(key, entry),
        };
    }
    return plants;
}

const api = {
    DIR_TO_ART,
    ART_TO_DIR,
    artIdForMetaKey,
    dirForMetaKey,
    stageMetaFromEntry,
    pickedMetaFromEntry,
    stagesArrayFromEntry,
    plantsBlockFromMeta,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.SmilePlantMeta = api;
}