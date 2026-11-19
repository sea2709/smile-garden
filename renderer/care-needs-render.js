// Clearer tending strip + tag pip layout (Heily). Same SmileTendStrip.render contract.
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

    const display = () => global.SmileCareNeedsDisplay;
    const disp = (fn, ...args) => display()[fn](...args);

    function resetActiveHold() {
        for (const k of Object.keys(lastActiveAt)) lastActiveAt[k] = 0;
    }

    function primeActiveHold(channel) {
        const ch = CHANNEL_SLOT[channel];
        if (!ch) return;
        lastActiveAt[ch] = performance.now();
    }

    function slotIsActive(needKey, activeChannel, nowMs) {
        const ch = CHANNEL_SLOT[activeChannel];
        if (ch === needKey) {
            lastActiveAt[needKey] = nowMs;
            return true;
        }
        return nowMs - (lastActiveAt[needKey] || 0) < HOLD_MS;
    }

    function rowGlowSrc(needKey, lighting) {
        const night = lighting === 'night' ? '-night' : '';
        return `../assets/ui/tend/tend-glow-${needKey}-row${night}.png`;
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
   * @param {object} opts same contract as the previous SmileTendStrip.render
   */
    function render(opts) {
        const {
            strip, nameEl, stampEl, rowEl, harvestEl, harvestIconEl, harvestImgEl,
            show, plot, state, session, lighting, ART, C, L, artUrl, nowMs,
        } = opts;
        const KB = global.SmileKeyboardHints;
        const keyboard = !!(strip && strip.classList.contains('is-keyboard'));
        if (!strip || !C) return;
        strip.hidden = !show || plot == null;
        document.body.dataset.tendStrip = show && plot != null ? '1' : '0';
        if (!show || plot == null || !display()) return;

        const pl = state.plots[plot];
        if (!pl) return;
        const needs = L.plantNeeds(pl.plantId);
        const prog = session.careProgressFor(plot);
        const kind = L.plantById(pl.plantId);
        const allMet = C.allNeedsMet(prog, needs, pl.staked);
        const showResting = !!pl.tagResting && !allMet;
        const demoCh = typeof document !== 'undefined' ? document.body.dataset.demoCareChannel : '';
        const activeCh = demoCh || session.activeCareChannel || null;
        const harvestReady = session.canCareHarvest && session.canCareHarvest(plot);
        const cardLight = lighting === 'night' ? 'night' : 'midday';

        nameEl.textContent = '';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = kind.name;
        const bedSmall = document.createElement('small');
        bedSmall.textContent = `bed ${plot + 1}`;
        nameEl.append(nameSpan, bedSmall);

        let sunEl = opts.sunEl || strip.querySelector('.tend-sun');
        if (!sunEl) {
            sunEl = document.createElement('div');
            sunEl.className = 'tend-sun';
            sunEl.dataset.need = 'sun';
            sunEl.innerHTML = '<img class="tend-sun-icon" alt=""><span class="tend-sun-verb"></span>';
            const head = strip.querySelector('.tend-head') || nameEl.parentElement;
            if (stampEl && stampEl.parentElement === head) head.insertBefore(sunEl, stampEl);
            else head.appendChild(sunEl);
        }
        const sunImg = sunEl.querySelector('.tend-sun-icon');
        const sunVerb = sunEl.querySelector('.tend-sun-verb');
        const lvl = sunGlowLevel(prog, needs, lighting);
        sunImg.alt = lighting === 'night' ? 'Resting until daylight' : `Daylight ${lvl} of 3`;
        bindImg(sunImg, sunIconSrc(ART, lvl, lighting), artUrl, '☀');
        sunVerb.textContent = lighting === 'night' ? 'resting' : 'daylight';

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
            let harvestGlow = harvestIconEl.querySelector('.tend-harvest-glow');
            if (!harvestGlow) {
                harvestGlow = document.createElement('img');
                harvestGlow.className = 'tend-harvest-glow';
                harvestGlow.alt = '';
                harvestIconEl.insertBefore(harvestGlow, harvestImgEl);
            }
            bindImg(harvestGlow, rowGlowSrc('harvest', cardLight), artUrl, null);
            bindImg(harvestImgEl, ART.needsIconSrc('harvest', cardLight === 'night' ? 'night' : 'day'), artUrl, '🧺');
        } else if (harvestIconEl) {
            harvestIconEl.classList.remove('is-active');
        }

        rowEl.textContent = '';
        const careSlots = [
            { key: 'water', channel: 'water' },
            { key: 'fertilizer', channel: 'fertilizer' },
            { key: 'stake', channel: 'stake' },
        ];
        for (const spec of careSlots) {
            const stat = disp('filledAndLeft', C, prog, needs, spec.key, pl.staked);
            if (stat.req <= 0) continue;
            const channel = activeCh || demoCh;
            const active = channel === spec.channel || slotIsActive(spec.channel, channel, nowMs);
            const row = document.createElement('div');
            row.className = 'tend-care' + (stat.done ? ' tend-care--done' : '') + (active ? ' is-active' : '');
            row.dataset.need = spec.key;

            const glow = document.createElement('img');
            glow.className = 'tend-row-glow';
            glow.alt = '';
            bindImg(glow, rowGlowSrc(spec.key, cardLight), artUrl, null);
            row.appendChild(glow);

            const slots = document.createElement('span');
            slots.className = 'tend-slots';
            for (let d = 0; d < stat.req; d++) {
                const pip = document.createElement('img');
                pip.className = 'tend-slot-pip' + (d < stat.got ? ' is-filled' : '');
                pip.alt = '';
                bindImg(pip, disp('slotSrc', spec.key, d < stat.got, cardLight), artUrl, null);
                slots.appendChild(pip);
            }
            row.appendChild(slots);

            if (stat.done) {
                const chk = document.createElement('img');
                chk.className = 'tend-check';
                chk.alt = '';
                const checkSrc = cardLight === 'night'
                    ? '../assets/ui/care/care-check-night.png'
                    : '../assets/ui/care/care-check.png';
                bindImg(chk, checkSrc, artUrl, null);
                row.appendChild(chk);
            }

            const remain = document.createElement('span');
            remain.className = 'tend-remain';
            remain.textContent = disp('remainingLabel', spec.key, stat.left);
            row.appendChild(remain);
            if (KB) {
                KB.decorateCareRow(row, spec.key, {
                    lighting: cardLight, active, artUrl, keyboard,
                });
            }
            rowEl.appendChild(row);
        }

        const harvestWrap = harvestEl || strip.querySelector('.tend-harvest');
        if (KB && harvestWrap) {
            const harvestActive = harvestReady && slotIsActive('harvest', activeCh, nowMs);
            KB.decorateHarvest(harvestWrap, {
                lighting: cardLight,
                active: harvestActive,
                artUrl,
                keyboard,
            });
        }
    }

    const d = display();
    global.SmileTendStrip = {
        render,
        resetActiveHold,
        primeActiveHold,
        HOLD_MS,
        remainingLabel: d ? d.remainingLabel : undefined,
        filledAndLeft: d ? d.filledAndLeft : undefined,
        tagPipLayout: d ? d.tagPipLayout : undefined,
        tagWreathBox: d ? d.tagWreathBox : undefined,
        pipSrc: d ? d.pipSrc : undefined,
        slotSrc: d ? d.slotSrc : undefined,
    };
}(window));