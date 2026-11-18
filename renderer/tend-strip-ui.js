// Compact tending status strip (replaces the painted needs card during care visits).
(function (global) {
    'use strict';

    const HOLD_MS = 400;
    const lastActiveAt = { water: 0, fertilizer: 0, stake: 0, harvest: 0 };

    const CHANNEL_SLOT = {
        water: 'water',
        fertilizer: 'fertilizer',
        stake: 'stake',
        harvest: 'harvest',
    };

    function resetActiveHold() {
        for (const k of Object.keys(lastActiveAt)) lastActiveAt[k] = 0;
    }

    function slotIsActive(needKey, activeChannel, nowMs) {
        const ch = CHANNEL_SLOT[activeChannel];
        if (ch === needKey) lastActiveAt[needKey] = nowMs;
        return nowMs - (lastActiveAt[needKey] || 0) < HOLD_MS;
    }

    function sunGlowLevel(prog, needs, lighting) {
        if (lighting === 'night') return 'rest';
        const req = needs.sun;
        if (req <= 0) return 3;
        const got = Math.max(0, Number(prog.sun) || 0);
        if (got + 1e-6 >= req) return 3;
        return Math.min(3, Math.ceil(3 * (got / req)));
    }

    function sunIconSrc(ART, lvl, lighting) {
        if (lvl === 'rest') return ART.sunRestingSrc('night', true);
        return ART.sunGlowSrc(lvl, 'midday');
    }

    function bindImg(img, src, artUrl, fallbackText) {
        img.onerror = () => {
            if (fallbackText) img.replaceWith(document.createTextNode(fallbackText));
        };
        img.src = artUrl(src);
    }

    /**
     * @param {object} opts
     * @param {HTMLElement} opts.strip
     * @param {HTMLElement} opts.nameEl
     * @param {HTMLElement} opts.stampEl
     * @param {HTMLElement} opts.rowEl
     * @param {HTMLElement} opts.harvestIconEl
     * @param {HTMLElement} opts.harvestImgEl
     */
    function render(opts) {
        const {
            strip, nameEl, stampEl, rowEl, harvestIconEl, harvestImgEl,
            show, plot, state, session, lighting, ART, C, L, artUrl, nowMs,
        } = opts;
        if (!strip || !C) return;
        strip.hidden = !show || plot == null;
        document.body.dataset.tendStrip = show && plot != null ? '1' : '0';
        if (!show || plot == null) return;

        const pl = state.plots[plot];
        if (!pl) return;
        const needs = L.plantNeeds(pl.plantId);
        const prog = session.careProgressFor(plot);
        const kind = L.plantById(pl.plantId);
        const cardCareLight = 'midday';
        const allMet = C.allNeedsMet(prog, needs, pl.staked);
        const showResting = !!pl.tagResting && !allMet;
        const activeCh = session.activeCareChannel;
        const harvestReady = session.canCareHarvest && session.canCareHarvest(plot);

        nameEl.textContent = '';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = kind.name;
        const bedSmall = document.createElement('small');
        bedSmall.textContent = `bed ${plot + 1}`;
        nameEl.append(nameSpan, bedSmall);

        if (stampEl) {
            if (allMet) {
                bindImg(stampEl, ART.needs.bloomStamp, artUrl, null);
                stampEl.hidden = false;
                stampEl.alt = 'All needs met today';
            } else if (showResting) {
                bindImg(stampEl, ART.needs.restingLeaf, artUrl, null);
                stampEl.hidden = false;
                stampEl.alt = 'Resting until needs are met';
            } else {
                stampEl.hidden = true;
            }
        }

        strip.classList.toggle('tend-strip--harvest', !!harvestReady);

        if (harvestReady) {
            const harvestActive = slotIsActive('harvest', activeCh, nowMs);
            harvestIconEl.classList.toggle('is-active', harvestActive);
            bindImg(harvestImgEl, ART.needsIconSrc('harvest', cardCareLight), artUrl, '🧺');
        } else {
            harvestIconEl.classList.remove('is-active');
        }

        rowEl.textContent = '';

        const sunSlot = document.createElement('div');
        sunSlot.className = 'tend-slot tend-slot--sun';
        sunSlot.dataset.need = 'sun';
        const sunIcon = document.createElement('img');
        sunIcon.className = 'tend-icon';
        const lvl = sunGlowLevel(prog, needs, lighting);
        sunIcon.alt = lighting === 'night' ? 'Resting until daylight' : `Daylight ${lvl} of 3`;
        bindImg(sunIcon, sunIconSrc(ART, lvl, lighting), artUrl, '☀');
        const sunVerb = document.createElement('span');
        sunVerb.className = 'tend-verb';
        sunVerb.textContent = lighting === 'night' ? 'resting' : 'daylight';
        sunSlot.append(sunIcon, document.createElement('span'), sunVerb);
        rowEl.appendChild(sunSlot);

        const div = document.createElement('span');
        div.className = 'tend-divider';
        div.setAttribute('aria-hidden', 'true');
        rowEl.appendChild(div);

        const careSlots = [
            { key: 'water', verb: 'smile', channel: 'water' },
            { key: 'fertilizer', verb: 'talk', channel: 'fertilizer' },
            { key: 'stake', verb: 'stretch', channel: 'stake' },
        ];

        for (const spec of careSlots) {
            const req = C.dotsForNeed(needs, spec.key);
            if (req <= 0) continue;
            const done = spec.key === 'stake'
                ? C.stakeNeedMet(prog, pl.staked)
                : C.fillFraction(prog, needs, spec.key, pl.staked) >= 1;
            const active = slotIsActive(spec.channel, activeCh, nowMs);

            const slot = document.createElement('div');
            slot.className = 'tend-slot' + (done ? ' tend-slot--done' : '') + (active ? ' is-active' : '');
            slot.dataset.need = spec.key;

            const icon = document.createElement('img');
            icon.className = 'tend-icon';
            icon.alt = `${spec.key} ${done ? 'done' : 'in progress'}`;
            bindImg(icon, ART.needsIconSrc(spec.key, cardCareLight), artUrl, '•');

            const dotsWrap = document.createElement('span');
            dotsWrap.className = 'tend-dots';
            if (spec.key !== 'stake' || req > 0) {
                const got = spec.key === 'stake'
                    ? (C.stakeNeedMet(prog, pl.staked) ? 1 : 0)
                    : Math.min(req, Math.floor((Number(prog[spec.key]) || 0) + 1e-6));
                for (let d = 0; d < req; d++) {
                    const dot = document.createElement('img');
                    dot.alt = '';
                    bindImg(dot, ART.needsDotSrc(d < got, cardCareLight), artUrl, null);
                    dotsWrap.appendChild(dot);
                }
            }

            const verb = document.createElement('span');
            verb.className = 'tend-verb';
            verb.textContent = spec.verb;

            slot.append(icon, dotsWrap, verb);
            rowEl.appendChild(slot);
        }
    }

    global.SmileTendStrip = { render, resetActiveHold, HOLD_MS };
}(window));