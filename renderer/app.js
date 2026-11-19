// renderer/app.js — Smile Garden: calm in-garden tending on a Stardew-style day clock.
//
// Flow: wellness -> garden idle -> tend beds (smile / talk / breathe per plant)
// -> optional Go to bed -> overnight growth reveal. Clock runs only while open.

(function () {
    'use strict';
    const L = window.SmileLogic;
    const V = window.SmileVisit;
    const D = window.SmileDay;
    const C = window.SmileCareNeeds;
    const SD = window.SmileSummaryData;
    const SP = window.SmileSignalPanel;
    const CC = window.SmileCameraCheck;
    const CCUI = window.SmileCameraCheckUI;
    const ART = window.SmileArt;
    const STORE_KEY = 'smile-garden.v3';
    const $ = (id) => document.getElementById(id);
    const els = {};
    for (const id of ['garden', 'clock-chip', 'week-dots', 'week-text', 'score-chip', 'btn-camera-check', 'btn-journal', 'btn-dev', 'chart-panel', 'chart-live',
        'smile-chart', 'pip', 'preview', 'mock-badge', 'mock-mode', 'hint', 'hint-title', 'hint-sub',         'meter-sun', 'meter-water', 'meter-fert', 'meter-stake',
        'meter-sun-val', 'meter-water-val', 'meter-fert-val', 'meter-stake-val', 'meter-sun-wrap', 'meter-water-wrap', 'meter-fert-wrap', 'meter-stake-wrap', 'step-panel', 'step-track',
        'ring-fg', 'ring-text', 'step-title', 'step-text', 'step-live', 'btn-skip', 'breath-guide', 'breath-orb', 'breath-halo', 'breath-word',
        'breath-sub', 'breath-rate', 'breath-count', 'stretch-guide', 'stretch-guide-box', 'stretch-sunflower', 'stretch-sunflower-stem', 'stretch-hint-left', 'stretch-hint-right', 'stretch-guide-full', 'stretch-ring', 'stretch-care-panel', 'stretch-care-title', 'stretch-care-text', 'stretch-care-live', 'stretch-care-actions', 'tend-strip', 'tend-name', 'tend-stamp', 'tend-row', 'tend-harvest', 'tend-harvest-icon', 'tend-harvest-img', 'idle-bar', 'idle-text', 'btn-plant-idle', 'btn-visit', 'btn-bed', 'day-chip-text', 'garden-clock', 'brand-logo-day', 'brand-logo-night', 'brand-fallback', 'plot-tip', 'float-layer', 'toast',
        'screen-wellness', 'chk-adult', 'btn-wellness-ok', 'screen-camera-check', 'cc-stage', 'cc-backdrop', 'cc-window-frame', 'cc-sill', 'cc-face-outline', 'cc-tilt-left', 'cc-tilt-right', 'cc-note', 'cc-prompt', 'cc-howto', 'cc-packets', 'cc-status-face', 'cc-status-light', 'cc-status-camera', 'cc-preview-wrap', 'cc-mock-slot', 'btn-cc-start', 'btn-cc-skip-now', 'btn-cc-retry',
        'screen-greeting', 'greet-date', 'greet-title', 'greet-status', 'plan-smile', 'plan-talk',
        'greet-note', 'btn-greet-plant', 'btn-begin', 'greet-fine', 'screen-picker', 'picker-target', 'seed-cards', 'btn-picker-close',
        'screen-summary', 'sum-card', 'screen-journal', 'journal-body', 'btn-journal-close', 'dev-drawer', 'btn-dev-close', 'dev-next-day', 'dev-day', 'dev-lighting', 'dev-sim',
        'dev-ready', 'dev-fill', 'dev-reset', 'basket-chip', 'basket-count', 'screen-unlock', 'unlock-title', 'unlock-body', 'unlock-art', 'btn-unlock-ok',
        'brand-logo-day', 'brand-logo-night', 'brand-fallback',
        'error-banner', 'error-title', 'error-message', 'btn-error-retry', 'btn-error-keyboard', 'btn-error-dismiss']) {
        els[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = $(id);
    }

    // ------------------------------------------------------------------
    // State + persistence
    // ------------------------------------------------------------------
    let config = { mock: true, fast: false };
    let state = V.loadState(safeGet(), new Date());
    const clock = new V.GameClock({ offsetDays: state.settings.offsetDays });
    // Prefer the current default so older saves (1000 ms) pick up the faster clock.
    const gardenMinuteMs = D.DEFAULT_DAY_CONFIG.realMsPerGardenMinute;
    state.settings.realMsPerGardenMinute = gardenMinuteMs;
    const gardenClock = new D.GardenDayClock(state, {
        realMsPerGardenMinute: gardenMinuteMs,
    });
    let saveAcc = 0;
    /** @type {null | Record<number, boolean>} capture-only picked sprites */
    let forcePickedPlots = null;
    function safeGet() { try { return localStorage.getItem(STORE_KEY); } catch { return null; } }
    function save() {
        state.settings.offsetDays = clock.offsetDays;
        try { localStorage.setItem(STORE_KEY, V.serializeState(state)); } catch (e) { console.warn('[smile-garden] save failed', e); }
    }

    function artUrl(rel) {
        try { return new URL(rel, window.location.href).href; } catch { return rel; }
    }
    const scene = window.SmileScene.createScene(els.garden);
    if (ART.ui && els.brandLogoDay) {
        els.brandLogoDay.src = artUrl(ART.ui.logoDay);
        els.brandLogoNight.src = artUrl(ART.ui.logoNight);
        const markBrand = () => {
            if ((els.brandLogoDay.complete && els.brandLogoDay.naturalWidth) ||
                (els.brandLogoNight.complete && els.brandLogoNight.naturalWidth)) {
                document.body.dataset.canvasLogo = '1';
            }
        };
        els.brandLogoDay.addEventListener('load', markBrand);
        els.brandLogoNight.addEventListener('load', markBrand);
        if (els.brandLogoDay.complete) markBrand();
    }
    const trace = new L.SmileTrace({ windowSec: 10, capacity: 480 });
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const signalSwitcher = SP ? SP.createSignalPanelSwitcher({
        enterHoldSec: reduceMotion ? 0 : 0.4,
        exitHoldSec: reduceMotion ? 0 : 1.2,
        blendSec: reduceMotion ? 0 : 0.3,
    }) : null;
    let signalPanelDemoLock = null;
    let screen = 'loading';
    let session = null;
    let source = null;
    let sourceReady = false;
    // Keep start/stop ordered across warm-up, visit, and retry so a second
    // sdk.start() never races a still-running session.
    let cameraGate = Promise.resolve();
    let lastResult = null;
    let pickerTarget = null;
    let currentDay = clock.today();
    let lighting = 'midday';
    let devOpen = false;
    /** When true, HUD season stays on `state.season` (demo capture); otherwise it tracks `dayNumber`. */
    let hudSeasonOverride = false;

    const signal = { h: null, hAt: 0, talking: false, talkAt: 0, validation: 'Ok', validationHint: '', faceGoneAt: 0, breathing: null, landmarks: null, landmarksAt: 0, landmarksStable: false };
    let breathHudDemoLock = false;
    let stretchHudDemoLock = false;
    let stretchDemoSnap = null;
    let pipHome = null;
    let mockPipCapture = false;
    let mockPipWantStream = false;
    if (els.pip && els.pip.parentElement) pipHome = els.pip.parentElement;
    /** @type {ReturnType<typeof window.SmileCameraCheckController.create>|null} */
    let cameraCheck = null;

    /** Friendly copy for SmartSpectra ValidationCode (leading k stripped). */
    function faceGuidance(code, sdkHint) {
        const hint = (sdkHint || '').trim();
        switch (code) {
            case 'NoFaceFound':
                return { title: 'Where did you go?', sub: hint || 'Look toward the camera, about an arm\'s length away. The timer waits for you.' };
            case 'MultipleFacesFound':
                return { title: 'One face at a time', sub: hint || 'Make sure only you are in the camera frame.' };
            case 'FaceNotCentered':
                return { title: 'Center your face', sub: hint || 'Move so your face sits in the middle of the preview.' };
            case 'FaceSizeOutOfRange':
                return { title: 'Adjust your distance', sub: hint || 'Move a little closer or farther until your head fills more of the preview.' };
            case 'FaceTooClose':
                return { title: 'A bit too close', sub: hint || 'Scoot back so your shoulders and face fit comfortably in frame.' };
            case 'FaceTooFar':
                return { title: 'A bit too far', sub: hint || 'Move closer — about an arm\'s length — so your face is easier to read.' };
            case 'FaceTooHigh':
                return { title: 'A little lower', sub: hint || 'Lower the camera or tilt your face down into the center of the frame.' };
            case 'FaceTooLow':
                return { title: 'A little higher', sub: hint || 'Raise the camera or sit up so your face is nearer the center.' };
            case 'FaceNotForward':
                return { title: 'Face the camera', sub: hint || 'Look straight at the lens — not turned to the side.' };
            case 'TooDark':
            case 'TooDarkOrBacklit':
                return { title: 'A little more light, please', sub: hint || 'Soft, even light on your face (not behind you) helps.' };
            case 'TooBright':
                return { title: 'A little less glare', sub: hint || 'Soften bright light in front of you, or angle away from harsh lamps.' };
            case 'ExcessiveMotion':
                return { title: 'Hold still a moment', sub: hint || 'Stay steady while the garden finds your face.' };
            case 'FrameRateTooLow':
                return { title: 'Camera is struggling', sub: hint || 'Close other apps using the webcam, or try better light.' };
            case 'ChestNotVisible':
                return { title: 'Show a bit more of your torso', sub: hint || 'Back up slightly so your upper chest is in view.' };
            case 'CameraTuning':
            case 'Ok':
                return null;
            default:
                if (!code || code === 'Ok') return null;
                return {
                    title: 'Adjust for the camera',
                    sub: hint || `Camera says: ${code}. Reposition a little and hold still.`,
                };
        }
    }

    // ------------------------------------------------------------------
    // Screens
    // ------------------------------------------------------------------
    const overlays = ['screenWellness', 'screenCameraCheck', 'screenGreeting', 'screenPicker', 'screenSummary', 'screenJournal', 'screenUnlock'];
    function show(name) {
        screen = name;
        document.body.dataset.screen = name;
        for (const o of overlays) els[o].hidden = true;
        els.stepPanel.hidden = name !== 'visit';
        els.idleBar.hidden = name !== 'idle';
        if (name !== 'visit' && name !== 'camera-check') {
            els.breathGuide.hidden = true;
            els.hint.hidden = true;
        }
        if (name !== 'visit') {
            if (els.tendStrip) els.tendStrip.hidden = true;
            document.body.dataset.tendStrip = '0';
            if (els.stretchCarePanel) els.stretchCarePanel.hidden = true;
            document.body.dataset.stretchCare = '0';
            document.body.dataset.step = '';
        }
        if (name !== 'visit' && name !== 'camera-check' && els.stretchGuide) els.stretchGuide.hidden = true;
        if (name !== 'visit' && name !== 'camera-check') restorePipHome();
        if (name === 'wellness') els.screenWellness.hidden = false;
        if (name === 'camera-check') els.screenCameraCheck.hidden = false;
        if (name === 'greeting') { renderGreeting(); els.screenGreeting.hidden = false; }
        if (name === 'picker') { renderPicker(); els.screenPicker.hidden = false; }
        if (name === 'summary') els.screenSummary.hidden = false;
        if (name === 'journal') els.screenJournal.hidden = false;
        if (name === 'idle') renderIdle();
        scene.setHighlight(name === 'picker' ? pickerTarget : null);
        if (name !== 'picker') scene.setHover(null);
        if (name !== 'visit') scene.setTendSelection(null);
        els.plotTip.hidden = true;
        if (name !== 'visit') els.basketChip.hidden = true;
        syncPipVisibility();
    }

  function gardenTodayKey() {
        return V.calendarKey(state, clock.now());
    }

    function plotsForScene(instant) {
        const today = gardenTodayKey();
        const view = state.plots.map((p, i) => {
            if (!p) return null;
            const regrow = V.isPlotRegrowing(p, today);
            const careAllMet = session && session.careProgressFor && C.allNeedsMet(
                session.careProgressFor(i),
                L.plantNeeds(p.plantId),
                p.staked,
            );
            const tendedAllMet = state.version >= 6 && D.plotTendedToday(state, i);
            const needs = L.plantNeeds(p.plantId);
            let tagProgress = { sun: 0, water: 0, fertilizer: 0, stake: false };
            let offlineCareAll = false;
            if (session) tagProgress = session.careProgressFor(i);
            else if (state.dailyTends && state.dailyTends[i]) {
                const rec = state.dailyTends[i];
                tagProgress = C.readProgressFromDailyTend(rec, needs, p.staked);
                offlineCareAll = rec.allMet === true
                    || C.allNeedsMet(tagProgress, needs, p.staked);
            }
            const careAll = session
                ? careAllMet
                : offlineCareAll;
            return {
                plantId: p.plantId,
                stage: p.stage,
                pickedSprite: !!(forcePickedPlots && forcePickedPlots[i]) || regrow,
                ready: V.isPlotReady(p, today),
                tendedToday: D.plotTendedToday(state, i),
                staked: !!p.staked,
                careAllMet: careAll,
                soilTended: !!(careAll || tendedAllMet),
                tagResting: !!p.tagResting && !careAll && !tendedAllMet,
                tagProgress,
                harvestReadyBadge: (() => {
                    if (!p || p.stage < V.MAX_STAGE) return false;
                    if (!V.isPlotReady(p, today)) return false;
                    const met = session
                        ? (session.canCareHarvest ? session.canCareHarvest(i) : careAllMet)
                        : careAll;
                    if (!met) return false;
                    if (session && session.step === 'care-harvest' && session.selectedPlot === i) return false;
                    return true;
                })(),
                harvestTagPrompt: (() => {
                    if (!p || p.stage < V.MAX_STAGE) return false;
                    if (!V.isPlotReady(p, today)) return false;
                    const met = session
                        ? (session.canCareHarvest ? session.canCareHarvest(i) : careAllMet)
                        : careAll;
                    return !!met;
                })(),
                isDaylight: currentInput().isDaylight,
            };
        });
        scene.setPlots(view, instant ? { instant: true } : undefined);
        scene.setSeason(state.season);
    }

    function syncTendRing() {
        if (!session || screen !== 'visit') {
            scene.setTendSelection(null);
            scene.setEffects({ plot: null, sun: 0, water: 0, fert: 0 });
            return;
        }
        const step = session.step;
        const plot = session.selectedPlot;
        const harvestPick = step === 'pick-harvest' || step === 'harvest-hold';
        const careHub = step === 'care-hub' || step === 'care-smile' || step === 'care-talk' || step === 'care-harvest';
        const ch = session.activeCareChannel;
        scene.setTendSelection(plot, { pulse: step === 'pick' || step === 'pick-harvest' || step === 'care-hub' });
        if (step === 'pick' || harvestPick || careHub) {
            scene.setEffects({
                plot,
                sun: 0,
                water: ch === 'water' ? 1 : 0,
                fert: ch === 'fertilizer' ? 1 : 0,
                stake: ch === 'stake' ? 0.85 : 0,
            });
        }
    }

    function refreshBasketChip(visitCount) {
        const n = visitCount || 0;
        els.basketCount.textContent = String(n);
        els.basketChip.hidden = !(screen === 'visit' && n > 0);
    }

    function selectedPlantLabel() {
        if (!session || session.selectedPlot == null) return '';
        const p = state.plots[session.selectedPlot];
        if (!p) return `Bed ${session.selectedPlot + 1}`;
        return `${L.plantById(p.plantId).name} (bed ${session.selectedPlot + 1})`;
    }

    let journalReturn = 'idle';
    function openJournal(tab) {
        journalReturn = screen === 'journal' ? journalReturn : screen;
        renderJournal(tab || 'diary');
        show('journal');
    }
    function closeJournal() {
        const dest = journalReturn === 'journal' || journalReturn === 'loading' ? 'idle' : journalReturn;
        show(dest);
        // show() clears visit chrome (tend strip, step copy, basket); restore if we came from a visit.
        if (dest === 'visit' && session) {
            onStep(session.step);
            refreshBasketChip(session.pendingHarvests ? session.pendingHarvests.length : 0);
        }
    }

    // ------------------------------------------------------------------
    // Camera (shared PiP + start/stop). Warm-up flow lives in camera-check-controller.js
    // ------------------------------------------------------------------
    function pipShouldShow() {
        if (mockPipCapture) return true;
        if (screen === 'camera-check') return true;
        // Show the PiP shell for the whole visit (stream may arrive a moment later).
        if (screen === 'visit') return true;
        return false;
    }

    function resumePipPreview() {
        if (!els.preview) return;
        els.preview.removeAttribute('hidden');
        els.preview.style.removeProperty('visibility');
        // Idle hides the PiP with pause(); visits must play() again or the frame freezes.
        if (els.preview.srcObject) {
            const play = els.preview.play();
            if (play && typeof play.catch === 'function') play.catch(() => {});
        }
    }

    function syncPipVisibility() {
        if (!els.pip) return;
        const show = pipShouldShow();
        els.pip.hidden = !show;
        if (els.preview) {
            if (show) resumePipPreview();
            else {
                els.preview.pause();
                els.preview.style.visibility = 'hidden';
            }
        }
        if (!show) els.pip.classList.remove('pip-mock-capture');
    }

    function placePipForCameraCheck() {
        if (!els.ccPreviewWrap || !els.pip) return;
        if (!pipHome) pipHome = els.pip.parentElement;
        els.ccPreviewWrap.insertBefore(els.pip, els.ccPreviewWrap.firstChild);
        els.pip.hidden = false;
        if (els.preview) els.preview.style.removeProperty('visibility');
        if (els.ccMockSlot) els.ccMockSlot.hidden = !config.mock;
    }

    function restorePipHome() {
        if (pipHome && els.pip && els.pip.parentElement !== pipHome) {
            pipHome.appendChild(els.pip);
        }
        syncPipVisibility();
    }

    function enqueueCamera(fn) {
        const run = cameraGate.then(fn, fn);
        cameraGate = run.catch(() => {});
        return run;
    }

    async function startCamera() {
        return enqueueCamera(async () => {
            if (!(await ensureSource())) throw new Error('Camera source unavailable');
            if (sourceReady) {
                // Warm-up → visit keeps the same session; just un-pause the PiP.
                resumePipPreview();
                return;
            }
            await source.start();
            sourceReady = true;
            resumePipPreview();
        });
    }

    async function stopCamera() {
        return enqueueCamera(async () => {
            if (!source) {
                sourceReady = false;
                return;
            }
            try { await source.stop(); } catch { /* ignore */ }
            sourceReady = false;
        });
    }

    function renderStretchHudFromSnap(snap) {
        const s = snap || {};
        const ringSide = s.activeSide === 'right' ? 'right' : 'left';
        const ringProg = ringSide === 'right' ? s.rightProgress : s.leftProgress;
        const ringDone = ringSide === 'right' ? s.rightDone : s.leftDone;
        drawStretchRing(els.stretchRing, ringProg, ringDone);
        const roll = s.rollDeg || 0;
        const pivot = els.stretchFlowerPivot || document.getElementById('stretch-flower-pivot');
        if (pivot) pivot.style.transform = `rotate(${(-roll * 0.85).toFixed(2)}deg)`;
    }

    /** Drop an in-progress visit without applying tends so warm-up can reclaim the camera. */
    async function leaveVisitForCameraCheck() {
        if (screen !== 'visit') return;
        session = null;
        signalPanelDemoLock = null;
        scene.setEffects({ sun: 0, water: 0, fert: 0 });
        scene.setTendSelection(null);
        if (els.tendStrip) els.tendStrip.hidden = true;
        document.body.dataset.tendStrip = '0';
        if (els.stretchCarePanel) els.stretchCarePanel.hidden = true;
        document.body.dataset.stretchCare = '0';
        document.body.dataset.step = '';
        document.body.dataset.hint = '';
        document.body.dataset.validation = '';
        els.hint.hidden = true;
        els.breathGuide.hidden = true;
        if (els.stretchGuide) els.stretchGuide.hidden = true;
        els.basketChip.hidden = true;
        els.stepPanel.hidden = true;
        await stopCamera();
        if (els.preview) els.preview.srcObject = null;
        toast('Left the visit to check the camera.');
    }

    if (!window.SmileCameraCheckController) {
        console.error('[smile-garden] SmileCameraCheckController module missing');
    } else {
        cameraCheck = window.SmileCameraCheckController.create({
            els, ART, CC, CCUI, L, artUrl,
            getConfig: () => config,
            getState: () => state,
            getScreen: () => screen,
            getSource: () => source,
            getSignal: () => signal,
            getJournalReturn: () => journalReturn,
            isSourceReady: () => sourceReady,
            show, save, toast, currentInput, stretchSample,
            renderBreathRate, renderStretchHud,
            placePipForCameraCheck, restorePipHome, syncPipVisibility,
            startCamera, stopCamera,
            abandonVisit: leaveVisitForCameraCheck,
        });
    }
    function openCameraCheck(opts) { return cameraCheck ? cameraCheck.open(opts) : undefined; }
    function retryCameraCheck() { return cameraCheck ? cameraCheck.retry() : undefined; }
    function finishCameraCheckFlow() { return cameraCheck ? cameraCheck.finish() : undefined; }
    function updateCameraCheckScreen(dt) { if (cameraCheck) cameraCheck.update(dt); }
    function mountCameraCheckGrid() { if (cameraCheck) cameraCheck.mountGrid(); }
    function afterWellnessOrResume() {
        if (cameraCheck) cameraCheck.afterWellnessOrResume();
        else show(state.version >= 5 ? 'idle' : 'greeting');
    }

    // ------------------------------------------------------------------
    // HUD
    // ------------------------------------------------------------------
    function fmtDate(d) {
        return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    }
    function refreshLighting() {
        const auto = state.settings.lighting === 'auto';
        if (state.version >= 5 && auto) {
            const blend = D.lightingBlend(state.gardenMinutes);
            scene.setLightingBlend(blend.weights);
            lighting = blend.primary;
            document.body.dataset.lighting = lighting;
            if (source && source.setNight) source.setNight((blend.weights.night || 0) > 0.6);
        } else {
            const l = state.version >= 5 && !auto
                ? V.lightingForGardenMinutes(state.gardenMinutes, state.settings.lighting)
                : V.lightingFor(clock.now(), auto ? null : state.settings.lighting);
            if (l !== lighting) {
                lighting = l;
                scene.setLighting(l);
                document.body.dataset.lighting = l;
                if (source && source.setNight) source.setNight(l === 'night');
            }
        }
    }

    function syncGardenSeasonFromDay() {
        if (state.version < 5 || hudSeasonOverride) return;
        const canonical = D.seasonForDayNumber(state.dayNumber);
        if (state.season !== canonical) {
            state.season = canonical;
            state.seasonDay = D.seasonDayNumber(state.dayNumber);
            scene.setSeason(state.season);
        }
    }

    function syncGardenClockHud() {
        if (state.version < 5) return;
        syncGardenSeasonFromDay();
        const seasonLabel = D.SEASON_LABELS[state.season] || state.season;
        const label = `Day ${state.dayNumber} · ${seasonLabel} · ${D.formatGardenTime(state.gardenMinutes)}`;
        scene.setGardenClock(state.gardenMinutes, label);
        if (els.gardenClock) els.gardenClock.hidden = true;
        document.body.dataset.gardenV = state.version >= 6 ? '6' : '5';
    }

    function syncHudChipClamp() {
        if (document.body.dataset.paintedClock !== '1') {
            document.documentElement.style.removeProperty('--hud-chips-max');
            return;
        }
        const H = typeof window !== 'undefined' ? window.SmileHudLayout : null;
        if (!H) return;
        const keep = H.clockKeepOutClientRect(window.innerWidth, window.innerHeight);
        const chips = document.querySelector('.topbar .chips');
        if (!chips) return;
        const chipLeft = chips.getBoundingClientRect().left;
        const pad = 6;
        const maxW = Math.floor(Math.max(96, keep.left - chipLeft - pad));
        document.documentElement.style.setProperty('--hud-chips-max', `${maxW}px`);
    }

    function renderHud() {
        const now = clock.now();
        if (state.version >= 5) {
            const seasonLabel = D.SEASON_LABELS[state.season] || state.season;
            els.dayChipText.textContent = `Day ${state.dayNumber} · ${seasonLabel} · ${D.formatGardenTime(state.gardenMinutes)}`;
            syncGardenClockHud();
        } else {
            const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            els.dayChipText.textContent = `${fmtDate(now)} · ${time} · ${V.LIGHTING_LABELS[lighting]}${state.settings.lighting !== 'auto' ? ' (demo light)' : ''}`;
        }
        const weekly = V.weeklyVisits(state, now);
        els.weekDots.textContent = '';
        if (state.version >= 5) {
            const block = Math.floor((state.dayNumber - 1) / D.DAYS_PER_SEASON);
            const base = block * D.DAYS_PER_SEASON + 1;
            for (let i = 0; i < D.DAYS_PER_SEASON; i++) {
                const n = base + i;
                const k = D.gardenDayKey(n);
                const dot = document.createElement('i');
                if (state.visitDays.includes(k)) dot.className = 'on';
                if (n === state.dayNumber) dot.classList.add('today');
                dot.title = `Day ${n}`;
                els.weekDots.appendChild(dot);
            }
            els.weekText.textContent = `${weekly} ${weekly === 1 ? 'day' : 'days'} this season`;
        } else {
            const start = V.weekStartKey(now);
            const today = V.dayKey(now);
            for (let i = 0; i < 7; i++) {
                const k = V.addDaysKey(start, i);
                const dot = document.createElement('i');
                if (state.visitDays.includes(k)) dot.className = 'on';
                if (k === today) dot.classList.add('today');
                dot.title = V.dayStart(k).toLocaleDateString(undefined, { weekday: 'short' });
                els.weekDots.appendChild(dot);
            }
            els.weekText.textContent = `${weekly} ${weekly === 1 ? 'visit' : 'visits'} this week`;
        }
        const suggestBed = state.version >= 5 && gardenClock.suggestBed();
        if (els.btnBed) els.btnBed.classList.toggle('suggest', suggestBed && screen === 'idle');
        const sc = V.score(state);
        els.scoreChip.textContent = `🌱 ${sc.planted}/${sc.plots} planted · ❀ ${sc.mature} grown`;
        const pantryN = (state.pantry && state.pantry.totalHarvests) || 0;
        if (screen !== 'visit') els.basketChip.hidden = pantryN <= 0;
        else if (session) refreshBasketChip(session.pendingHarvests.length);
        document.body.dataset.planted = String(sc.planted);
        document.body.dataset.mature = String(sc.mature);
        els.devDay.textContent = clock.offsetDays ? `+${clock.offsetDays} day${clock.offsetDays > 1 ? 's' : ''}` : 'today';
        syncHudChipClamp();
    }

    const meterImgs = {};
    for (const k of ['sun', 'water', 'fertilizer', 'stake']) {
        meterImgs[k] = new Image();
        meterImgs[k].src = k === 'stake' ? '../assets/ui/meter-stake.png' : `../assets/ui/meter-${k}.png`;
    }
    const METER_COLORS = { sun: ['#fbe29a', '#e3a22a'], water: ['#d2e5f4', '#5b92c6'], fertilizer: ['#dfe8b8', '#7b9646'], stake: ['#ece2b8', '#9c8c4c'] };
    const stretchRingArt = { framesDay: null, framesNight: null, loadPromise: null };
    const STRETCH_RING_FRAMES = 12;
    function loadStretchImg(src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = artUrl(src);
        });
    }
    async function loadStretchRingFrames(dir, frameCount) {
        const frames = [];
        for (let i = 0; i < frameCount; i++) {
            const img = await loadStretchImg(`${dir}frame-${String(i).padStart(2, '0')}.png`);
            if (!img || !img.naturalWidth) return null;
            frames.push(img);
        }
        return frames;
    }
    function ensureStretchRingArt() {
        if (!ART.stretch) return Promise.resolve(false);
        if (stretchRingArt.loadPromise) return stretchRingArt.loadPromise;
        const s = ART.stretch;
        const dayDir = (s.ringFramesDay || '../assets/ui/stretch/ring-day-frames/').replace(/\/?$/, '/');
        const nightDir = (s.ringFramesNight || '../assets/ui/stretch/ring-night-frames/').replace(/\/?$/, '/');
        stretchRingArt.loadPromise = Promise.all([
            loadStretchRingFrames(dayDir, STRETCH_RING_FRAMES),
            loadStretchRingFrames(nightDir, STRETCH_RING_FRAMES),
        ]).then(([day, night]) => {
            stretchRingArt.framesDay = day;
            stretchRingArt.framesNight = night;
            return !!((day && day.length) || (night && night.length));
        });
        return stretchRingArt.loadPromise;
    }
    function drawMeter(canvas, kind, frac) {
        const meta = ART.meters[kind];
        const img = meterImgs[kind];
        const dpr = window.devicePixelRatio || 1;
        const W = 132, H = Math.round(132 * meta.h / meta.w);
        if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + 'px'; }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr * W / meta.w, 0, 0, dpr * W / meta.w, 0, 0);
        ctx.clearRect(0, 0, meta.w, meta.h);
        if (img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, meta.w, meta.h);
        const n = meta.dots.length;
        const filled = Math.max(0, Math.min(1, frac)) * n;
        const [c0, c1] = METER_COLORS[kind];
        meta.dots.forEach(([x, y, r], i) => {
            ctx.beginPath();
            ctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(214, 206, 188, 0.55)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(170, 160, 140, 0.55)';
            ctx.lineWidth = 2;
            ctx.stroke();
            const f = Math.max(0, Math.min(1, filled - i));
            if (f <= 0) return;
            ctx.save();
            ctx.globalAlpha = 0.35 + 0.65 * f;
            const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
            g.addColorStop(0, c0);
            g.addColorStop(1, c1);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r * (0.55 + 0.37 * f), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }
    function meterValues() {
        if (session && session.selectedPlot != null && String(session.step || '').startsWith('care-')) {
            const plot = session.selectedPlot;
            const pl = state.plots[plot];
            if (pl && C) {
                const needs = L.plantNeeds(pl.plantId);
                const prog = session.careProgressFor(plot);
                return {
                    sun: C.fillFraction(prog, needs, 'sun', pl.staked),
                    water: C.fillFraction(prog, needs, 'water', pl.staked),
                    fert: C.fillFraction(prog, needs, 'fertilizer', pl.staked),
                    fertUsed: session.step === 'care-harvest',
                };
            }
        }
        if (session) return { sun: session.sunHours, water: session.water, fert: session.fertilizer, fertUsed: session.breathTaken };
        const dayKey = state.version >= 5 ? D.gardenDayKey(state.dayNumber) : clock.today();
        if (lastResult && lastResult.day === dayKey) return { sun: lastResult.sunHours, water: lastResult.water, fert: lastResult.fertilizer, fertUsed: lastResult.fertilizer > 0 };
        return { sun: 0, water: 0, fert: 0, fertUsed: false };
    }
    function stakeMeterFrac() {
        if (!session) return 0;
        const snap = stretchHudDemoLock && stretchDemoSnap ? stretchDemoSnap : (session.stretchSnap || {});
        return Math.max(0, Math.min(1, ((snap.leftProgress || 0) + (snap.rightProgress || 0)) / 2));
    }
    function renderMeters() {
        const m = meterValues();
        drawMeter(els.meterSun, 'sun', m.sun / V.TUNING.maxSunHours);
        drawMeter(els.meterWater, 'water', m.water);
        drawMeter(els.meterFert, 'fertilizer', m.fert);
        if (els.meterStake) drawMeter(els.meterStake, 'stake', stakeMeterFrac());
        const step = session ? session.step : '';
        const care = step.startsWith('care-');
        if (care && session && session.selectedPlot != null) {
            const needs = L.plantNeeds(state.plots[session.selectedPlot].plantId);
            const fmt = (key) => {
                const got = Math.round((key === 'sun' ? m.sun : key === 'water' ? m.water : m.fert) * C.dotsForNeed(needs, key));
                const req = C.dotsForNeed(needs, key);
                return req ? `${got} / ${req} dots` : '—';
            };
            els.meterSunVal.textContent = fmt('sun');
            els.meterWaterVal.textContent = fmt('water');
            els.meterFertVal.textContent = fmt('fertilizer');
        } else {
            const goal = session && session.selectedPlot != null ? session.sunGoal(session.selectedPlot) : 12;
            els.meterSunVal.textContent = session ? `${m.sun.toFixed(1)} / ${goal} h` : `${m.sun.toFixed(1)} / 12 h`;
            els.meterWaterVal.textContent = `${Math.round(m.water * 100)}%`;
            els.meterFertVal.textContent = m.fertUsed ? `${Math.round(m.fert * 100)}%` : 'optional';
        }
        els.meterSunWrap.classList.toggle('active', (step === 'care-hub' || step === 'care-smile') && lighting !== 'night');
        const ch = session ? session.activeCareChannel : null;
        els.meterWaterWrap.classList.toggle('active', step === 'smile' || step === 'care-smile' || ch === 'water');
        els.meterFertWrap.classList.toggle('active', step === 'talk' || step === 'care-talk' || step === 'breathe' || step === 'breathe-offer' || step === 'care-harvest' || ch === 'fertilizer');
        if (els.meterStakeWrap) {
            els.meterStakeWrap.classList.toggle('active', step === 'stretch' || step === 'stretch-offer' || ch === 'stake');
            const stakeVal = stakeMeterFrac();
            if (els.meterStakeVal) {
                els.meterStakeVal.textContent = step === 'stretch' || step === 'stretch-offer'
                    ? `${Math.round(stakeVal * 100)}%`
                    : '—';
            }
        }
    }

    // ------------------------------------------------------------------
    // Greeting / idle
    // ------------------------------------------------------------------
    function gardenStatusLine() {
        const sc = V.score(state);
        if (!sc.planted) return 'Your beds are freshly dug and waiting. Pick a seed to plant, then spend a couple of minutes with your garden.';
        const growing = state.plots.filter((p) => p && p.stage < V.MAX_STAGE).length;
        const parts = [`${sc.planted} of 8 beds planted`];
        if (sc.mature) parts.push(`${sc.mature} fully grown`);
        if (growing) parts.push(`${growing} still growing`);
        return parts.join(', ') + '.';
    }
    function renderGreeting() {
        const now = clock.now();
        els.greetDate.textContent = `${fmtDate(now)} · ${V.LIGHTING_LABELS[lighting]}`;
        els.greetTitle.textContent = V.greetingFor(lighting);
        els.greetStatus.textContent = gardenStatusLine();
        const planted = V.plantedCount(state);
        const baseSmile = config.fast ? V.TUNING.fastSmileSeconds : V.TUNING.smileSeconds;
        const baseTalk = config.fast ? V.TUNING.fastTalkSeconds : V.TUNING.talkSeconds;
        const n = Math.max(1, planted);
        els.planSmile.textContent = String(Math.round(V.perBedStepSeconds(baseSmile, n, V.TUNING.minSmilePerBed)));
        els.planTalk.textContent = String(Math.round(V.perBedStepSeconds(baseTalk, n, V.TUNING.minTalkPerBed)));
        const empty = V.emptyPlots(state).length;
        els.btnGreetPlant.hidden = !empty;
        els.btnGreetPlant.textContent = V.plantedCount(state) ? '🌱 Plant another seed' : '🌱 Plant a seed';
        let note = '';
        if (V.visitedToday(state, now)) note = 'You already visited today. Plants grow once a day, but they always enjoy the company.';
        else if (lighting === 'night') note = 'Night visits are extra calm. A soft light in front of you helps the camera see your smile.';
        else note = `Plants grow one stage on a day they get enough sun and water. ${V.weeklyVisits(state, now)} visits so far this week, and every one counts.`;
        els.greetNote.textContent = note;
        els.greetFine.textContent = config.mock
            ? 'Demo mode: a simulated player smiles and chats. Hold S / T to take over with the keyboard.'
            : (config.enableTelemetry ? 'SmartSpectra SDK telemetry is on (SMARTSPECTRA_TELEMETRY=0 to opt out). ' : '') + 'For fun and general wellness only.';
    }
    function renderIdle() {
        const tendable = V.tendableForState(state, clock.now());
        const ready = V.readyPlotIndices(state.plots, gardenTodayKey()).length;
        let msg = 'Wander the beds, tend your plants, and harvest when ready.';
        if (state.version >= 5) {
            if (gardenClock.atLateNight()) msg = 'A peaceful night. Go to bed when you are ready — the day never ends by force.';
            else if (gardenClock.suggestBed()) msg = 'Evening. You can keep tending, or head to bed whenever you like.';
            else if (!tendable.length && !ready) msg = 'Every plant is tended for today. Rest, harvest, or go to bed when ready.';
        }
        els.idleText.textContent = msg;
        // v6 prefers click-a-bed, but keep a clear harvest entry when crops are ready.
        els.btnVisit.hidden = (state.version >= 6 && !ready) || document.body.dataset.captureTags === '1';
        if (!els.btnVisit.hidden) {
            els.btnVisit.textContent = ready && !tendable.length ? 'Pick ready crops'
                : (tendable.length ? 'Tend your plants' : (ready ? 'Tend (harvest)' : 'Tend your plants'));
        }
        els.btnPlantIdle.hidden = !V.emptyPlots(state).length;
        els.btnBed.hidden = state.version < 5;
    }

    // ------------------------------------------------------------------
    // Seed picker
    // ------------------------------------------------------------------
    function openPicker(plot) {
        const empty = V.emptyPlots(state);
        if (!empty.length) { toast('Every bed is planted.'); return; }
        pickerReturn = screen === 'picker' ? pickerReturn : screen;
        pickerTarget = plot !== undefined && plot !== null && empty.includes(plot) ? plot : empty[0];
        show('picker');
    }
    let pickerReturn = 'greeting';
    function closePicker() { pickerTarget = null; show(pickerReturn === 'picker' ? 'idle' : pickerReturn); }

    function renderPicker() {
        els.pickerTarget.textContent = `for bed ${pickerTarget + 1}`;
        els.seedCards.textContent = '';
        for (const p of L.PLANTS) {
            const info = V.plantInfo(p.id);
            const unlocked = V.isUnlocked(state, p.id);
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'seed-card' + (unlocked ? '' : ' locked');
            card.dataset.plant = p.id;
            if (!unlocked) {
                const h = info.unlockHarvests || 0;
                const v = info.unlockAtVisit || 0;
                card.dataset.lock = h > 0
                    ? `Unlocks after ${h} harvest${h === 1 ? '' : 's'} or ${v} visits`
                    : (v > 0 ? `Unlocks after ${v} visits` : 'Locked');
            }
            const img = document.createElement('img');
            img.src = ART.plantSrc(p.id, 5);
            img.alt = '';
            const h3 = document.createElement('h3');
            h3.textContent = p.name;
            const diff = document.createElement('span');
            diff.className = `diff diff-${p.difficulty}`;
            diff.textContent = p.difficultyLabel;
            h3.appendChild(diff);
            const care = document.createElement('div');
            care.className = 'seed-care';
            care.textContent = info.careSummary;
            const meta = document.createElement('div');
            meta.className = 'seed-meta';
            meta.textContent = 'Smile · talk · stretch · 4 stages to grow';
            const blurb = document.createElement('p');
            blurb.className = 'seed-blurb';
            blurb.textContent = info.tips[0] || p.blurb;
            card.append(img, h3, care, meta, blurb);
            if (unlocked) card.addEventListener('click', () => plant(p.id));
            els.seedCards.appendChild(card);
        }
    }

    function plant(plantId, plot) {
        const target = plot !== undefined ? plot : pickerTarget;
        const res = V.plantSeed(state, target, plantId, clock.now());
        if (!res.ok) { toast(res.reason === 'locked' ? 'Those seeds unlock with more harvests or visits.' : 'That bed is taken.'); return res; }
        save();
        plotsForScene();
        floatLabel(res.plot, `${L.plantById(plantId).name} planted`);
        renderHud();
        const empty = V.emptyPlots(state);
        if (screen === 'picker') {
            if (empty.length) { pickerTarget = empty[0]; scene.setHighlight(pickerTarget); renderPicker(); }
            else closePicker();
        }
        return res;
    }

    // ------------------------------------------------------------------
    // Visit
    // ------------------------------------------------------------------
    const STEP_COPY = {
        'pick-harvest': { title: 'Choose a crop to pick', text: 'Ready beds twinkle softly. Select one, then smile for about two seconds while you harvest (or press Enter).' },
        'harvest-hold': { title: 'Smile to harvest', text: 'Hold a gentle smile on the crop you chose. Your harvest goes into the basket — nothing is ever lost.' },
        pick: { title: 'Choose a plant to tend', text: 'Click a bed or use arrow keys, then press Enter or Space. Only planted beds can be selected.' },
        smile: { title: 'Smile: sunlight', text: 'Smile for this plant. Warm light pours onto the bed you chose. Big or small, it all counts.' },
        talk: { title: 'Talk: water', text: 'Tell this plant about your day, out loud or in a whisper. Talking fills its watering can.' },
        'breathe-offer': { title: 'Calm breaths: fertilizer', text: 'Optional. A few soft breaths through your nose give the beds a little fertilizer, which only speeds growth.' },
        breathe: { title: 'Breathe with the light', text: 'Follow the glow: in as it grows, out as it fades. No holding, no straining.' },
        'stretch-offer': { title: 'Stake this plant', text: 'Optional neck stretch — tip each ear toward a shoulder and hold briefly, like setting a gentle stake. Skip anytime.' },
        stretch: { title: 'Neck stretch', text: 'Tilt toward one shoulder (~15°) and hold about 3 seconds, then the other. Order does not matter.' },
        'care-hub': { title: 'Tend with your camera', text: 'Pick any bed anytime (click, arrows, or Enter). Sunlight fills by day; smile to water, talk to fertilize, breathe to harvest when mature, and stretch to stake climbers. Partial care is kept per bed.' },
        'care-smile': { title: 'Water', text: 'Smile at your plant while the water dot fills (~10 s per dot).' },
        'care-talk': { title: 'Fertilize', text: 'Talk to your plant while the fertilizer dot fills (~10 s per dot).' },
        'care-harvest': { title: 'Harvest', text: 'Breathe with the guide to harvest this mature crop. Gentle nose breathing only.' },
    };
    const NEED_LABELS = { sun: 'Sunlight', water: 'Water', fertilizer: 'Fertilizer', harvest: 'Harvest', stake: 'Stake' };
    const NEED_EMOJI = { sun: '☀', water: '💧', fertilizer: '🍃', harvest: '🧺', stake: '🌻' };

    function bindNeedsArt(img, src, fallbackEl) {
        if (!img) return;
        img.onload = () => { img.hidden = false; if (fallbackEl) fallbackEl.hidden = true; };
        img.onerror = () => { img.hidden = true; if (fallbackEl) fallbackEl.hidden = false; };
        img.src = artUrl(src);
    }

    function tendStripVisibleStep(step) {
        return ['care-hub', 'care-smile', 'care-talk', 'care-harvest', 'stretch-offer', 'stretch'].includes(step);
    }

    function renderTendStrip() {
        if (!session || !els.tendStrip || !C || !window.SmileTendStrip) return;
        const plot = session.selectedPlot;
        const show = tendStripVisibleStep(session.step);
        window.SmileTendStrip.render({
            strip: els.tendStrip,
            nameEl: els.tendName,
            stampEl: els.tendStamp,
            rowEl: els.tendRow,
            harvestIconEl: els.tendHarvestIcon,
            harvestImgEl: els.tendHarvestImg,
            show,
            plot,
            state,
            session,
            lighting,
            ART,
            C,
            L,
            artUrl,
            nowMs: performance.now(),
        });
        if (!show) document.body.dataset.tendStrip = '0';
        plotsForScene();
    }

    function renderNeedsCard() {
        renderTendStrip();
    }

    function primeSignalTraceForCapture(mode, now) {
        trace.clear();
        const t1 = Number(now) || performance.now() / 1000;
        for (let i = 0; i < 80; i++) {
            const t = t1 - 9.5 + (i / 79) * 9.5;
            const phase = Math.sin(t * 1.8);
            trace.push({
                t,
                happiness: mode === 'smile' ? 0.76 + phase * 0.14 : 0.55,
                faceVisible: mode !== 'idle',
                talking: mode === 'talk',
                smiling: mode === 'smile',
                breathRate: mode === 'breathe' ? 5.8 : null,
                breathPhase: mode === 'breathe' ? phase : null,
                rollDeg: mode === 'stretch' ? 18 + Math.sin(t * 2) * 6 : null,
                panelMode: mode,
            });
        }
    }

    function redrawSignalPanel(t, extraOpts) {
        const chartOn = state.settings.chart && (screen === 'visit' || !!signalPanelDemoLock);
        if (!chartOn || !els.chartPanel || !window.SmileChart.drawSignalPanel) return;
        const mode = signalPanelDemoLock || (signalSwitcher ? signalSwitcher.mode : 'idle');
        els.chartPanel.hidden = false;
        els.chartPanel.dataset.state = mode;
        const freshBreath = signal.breathing && performance.now() - signal.breathing.at < 2500;
        let breathPillState = 'warming';
        if (freshBreath) breathPillState = signal.breathing.stable ? 'stable' : 'settling';
        const snap = stretchDemoSnap || (session && session.stretchSnap);
        const captureChart = !!(extraOpts && extraOpts.captureRedraw);
        window.SmileChart.drawSignalPanel(els.smileChart, trace, t, els.chartLive, {
            mode,
            night: lighting === 'night',
            reducedMotion: reduceMotion || captureChart,
            captureRedraw: captureChart,
            breathPillState,
            breathDotsDone: session && session.breathsDone ? session.breathsDone : 0,
            breathDotsTotal: session && session.pacer ? session.pacer.breaths : state.settings.breaths,
            stretchHoldFrac: snap
                ? Math.max(snap.leftProgress || 0, snap.rightProgress || 0)
                : null,
        });
    }

    const TALK_PROMPTS = ['What made you smile today?', 'Tell the tomatoes about your morning.', 'What are you looking forward to?',
        'Describe the weather where you are.', 'Say hello to each bed.', 'What would you cook with this harvest?'];

    async function ensureSource() {
        if (source) return true;
        try {
            if (config.mock || config.keyboard) {
                source = window.SmileSources.createMockSource({ auto: !config.keyboard });
            } else {
                const apiKey = window.smileGarden.takeApiKey
                    ? await window.smileGarden.takeApiKey()
                    : '';
                source = window.SmileSources.createSdkSource({
                    apiKey,
                    enableTelemetry: config.enableTelemetry,
                    calmCheck: false,
                });
            }
        } catch (e) {
            showError('Could not start the camera reading', String(e && e.message || e), true);
            CC.markCameraCheckRequired(state, 'Could not start the camera reading.');
            save();
            return false;
        }
        source.on('expression', (e) => { signal.h = e.happiness; signal.hAt = performance.now(); });
        source.on('talking', (e) => { signal.talking = !!e.detected; signal.talkAt = performance.now(); });
        source.on('breathing', (b) => {
            if (!b || typeof b.rate !== 'number') return;
            signal.breathing = {
                rate: b.rate,
                confidence: typeof b.confidence === 'number' ? b.confidence : 0,
                stable: !!b.stable,
                at: performance.now(),
            };
        });
        source.on('validation', (v) => {
            signal.validation = v && v.code ? v.code : 'Ok';
            signal.validationHint = (v && v.hint) || '';
        });
        source.on('status', (s) => { document.body.dataset.status = s; });
        source.on('error', (e) => handleSdkError(e));
        source.on('stream', (stream) => {
            if (mockPipCapture) {
                if (mockPipWantStream && stream) {
                    els.preview.srcObject = stream;
                    els.preview.removeAttribute('hidden');
                    if (els.preview.style) els.preview.style.removeProperty('visibility');
                } else if (els.preview) {
                    els.preview.pause();
                    els.preview.srcObject = null;
                    els.preview.setAttribute('hidden', '');
                }
                els.pip.classList.toggle('pip-mock-capture', !mockPipWantStream || !els.preview.srcObject);
                syncPipVisibility();
                return;
            }
            els.preview.srcObject = stream || null;
            if (stream) resumePipPreview();
            els.pip.classList.toggle('pip-mock-capture', false);
            syncPipVisibility();
        });
        source.on('landmarks', (lm) => {
            if (!lm || !lm.points) return;
            signal.landmarks = lm.points;
            signal.landmarksAt = performance.now();
            signal.landmarksStable = !!lm.stable;
        });
        if (source.setNight) source.setNight(lighting === 'night');
        return true;
    }

    /** Every planted bed that is not mid-regrow — mature ready crops included. */
    function careBedsForState() {
        const today = gardenTodayKey();
        const out = [];
        state.plots.forEach((p, i) => {
            if (!p) return;
            if (V.isPlotRegrowing(p, today)) return;
            out.push(i);
        });
        return out;
    }

    function newVisitSession() {
        const today = gardenTodayKey();
        return new V.VisitSession({
            fast: config.fast,
            pace: state.settings.pace,
            breaths: state.settings.breaths,
            plots: state.plots,
            today,
            gardenDay: state.dayNumber,
            dailyTends: state.dailyTends,
            tendBeds: V.tendableForState(state, clock.now()),
            harvestQueue: V.readyPlotIndices(state.plots, today),
            plantedBeds: careBedsForState(),
        });
    }

    function canStartVisitFromScreen() {
        return screen === 'idle' || screen === 'greeting' || screen === 'summary';
    }

    /** Prefer real camera; if it cannot start, fall back to keyboard/mock so tending still works. */
    async function ensurePlayableSource() {
        if (await ensureSource()) return true;
        if (config.mock || config.keyboard) return false;
        config.keyboard = true;
        els.mockBadge.hidden = false;
        els.mockMode.textContent = 'Keyboard player';
        source = null;
        sourceReady = false;
        if (!(await ensureSource())) return false;
        toast('Camera unavailable — using keyboard (S smile, T talk).');
        return true;
    }

    async function beginVisitAtPlot(plotIndex) {
        const p = state.plots[plotIndex];
        if (!p) return;
        const today = gardenTodayKey();
        if (V.isPlotRegrowing(p, today)) {
            toast('That bed is regrowing. Give it another garden day or two.');
            return;
        }
        // Open the visit immediately — never wait on camera before acknowledging the click.
        scene.setTendSelection(plotIndex, { pulse: true });
        if (signalSwitcher) signalSwitcher.reset();
        trace.clear();
        session = newVisitSession();
        if (!session.plantedBeds.includes(plotIndex)) {
            session.plantedBeds = session.plantedBeds.concat([plotIndex]).sort((a, b) => a - b);
        }
        if (V.isPlotReady(p, today) && !session.harvestQueue.includes(plotIndex)) {
            session.harvestQueue = session.harvestQueue.concat([plotIndex]);
        }
        refreshBasketChip(0);
        els.basketChip.hidden = session.harvestQueue.length === 0;
        signal.breathing = null;
        talkPromptIdx = Math.floor(Math.random() * TALK_PROMPTS.length);
        let step = session.begin();
        if (step === 'summary') {
            session.plantedBeds = [plotIndex];
            session.selectedPlot = plotIndex;
            session.phase = 'tend';
            session.plantRound = 0;
            step = session.go('care-hub');
        }
        session.setSelectedPlot(plotIndex);
        show('visit');
        onStep(session.step);
        syncTendRing();
        syncPipVisibility();
        try {
            if (!(await ensurePlayableSource())) {
                showError('Camera could not start', 'Use Demo tools → keyboard mode, or open Camera to retry.', true);
                return;
            }
            await startCamera();
            syncPipVisibility();
        } catch (e) {
            showError('Camera could not start', String(e && e.message || e), !config.mock);
        }
    }

    async function beginVisit() {
        if (signalSwitcher) signalSwitcher.reset();
        trace.clear();
        signalPanelDemoLock = null;
        session = newVisitSession();
        if (!session.plantedBeds.length) {
            toast('No beds to tend right now. Plant a seed, or wait for regrowth.');
            session = null;
            return;
        }
        refreshBasketChip(0);
        els.basketChip.hidden = session.harvestQueue.length === 0;
        signal.breathing = null;
        talkPromptIdx = Math.floor(Math.random() * TALK_PROMPTS.length);
        show('visit');
        session.begin();
        if (session.step === 'summary') {
            session.selectedPlot = session.plantedBeds[0];
            session.go('care-hub');
        }
        onStep(session.step);
        syncTendRing();
        syncPipVisibility();
        try {
            if (!(await ensurePlayableSource())) {
                showError('Camera could not start', 'Use Demo tools → keyboard mode, or open Camera to retry.', true);
                return;
            }
            await startCamera();
            syncPipVisibility();
        } catch (e) {
            showError('Camera could not start', String(e && e.message || e), !config.mock);
            CC.markCameraCheckRequired(state, `Camera could not start: ${e && e.message || e}`);
            save();
        }
    }

    let talkPromptIdx = 0;
    let lastStep = null;
    let lastSourcePhase = '';
    function careHubMockPhase() {
        if (!session || session.step !== 'care-hub') return 'care-hub';
        if (session.activeCareChannel === 'harvest' || session.canCareHarvest(session.selectedPlot)) {
            return 'care-hub-breathe';
        }
        if (session.activeCareChannel === 'stake') return 'care-hub-stretch';
        // Point the mock auto-player at an open need. Keyboard mode ignores phase
        // and follows held S / T / [ ] keys instead.
        if (session.selectedPlot != null && C) {
            const p = state.plots[session.selectedPlot];
            if (p && p.plantId) {
                const needs = L.plantNeeds(p.plantId);
                const prog = session.careProgressFor(session.selectedPlot);
                if (needs.water > 0 && C.needStillOpen(prog, needs, p.staked, 'water')) {
                    return 'care-hub-smile';
                }
                if (needs.fertilizer > 0 && C.needStillOpen(prog, needs, p.staked, 'fertilizer')) {
                    return 'care-hub-talk';
                }
                if (needs.stake && !C.stakeNeedMet(prog, p.staked)) return 'care-hub-stretch';
            }
        }
        return 'care-hub';
    }
    function setSourcePhase(phase) {
        if (!source || !source.setPhase || phase === lastSourcePhase) return;
        lastSourcePhase = phase;
        source.setPhase(phase);
    }

    function onStep(step) {
        lastStep = step;
        document.body.dataset.step = step;
        setSourcePhase(step === 'care-hub' ? careHubMockPhase() : step);
        const order = ['harvest', 'smile', 'talk', 'breathe', 'stretch', 'summary'];
        let idx = order.indexOf(
            step === 'pick-harvest' || step === 'harvest-hold' ? 'harvest'
                : step === 'breathe-offer' ? 'breathe'
                    : step === 'stretch-offer' ? 'stretch'
                        : step === 'pick' ? 'smile'
                            : step);
        if (idx < 0) idx = 0;
        const stretchTrack = els.stepTrack.querySelector('[data-step="stretch"]');
        const showStretchTrack = session && typeof session.selectedPlantNeedsStake === 'function'
            && session.selectedPlantNeedsStake();
        if (stretchTrack) stretchTrack.hidden = !showStretchTrack;
        els.stepTrack.querySelectorAll('span').forEach((s, i) => {
            if (s.dataset.step === 'stretch' && s.hidden) {
                s.classList.remove('on', 'done');
                return;
            }
            s.classList.toggle('on', i === idx);
            s.classList.toggle('done', i < idx);
        });
        if (step === 'summary') { finishVisit(); return; }
        const stretchCare = step === 'stretch-offer' || step === 'stretch';
        document.body.dataset.stretchCare = stretchCare ? '1' : '0';
        els.stretchCarePanel.hidden = !stretchCare;
        if (stretchCare) renderStretchCarePanel(step);
        const careMode = step === 'care-hub' || step === 'care-smile' || step === 'care-talk' || step === 'care-harvest';
        if (els.tendStrip) els.tendStrip.hidden = !(careMode || step === 'stretch-offer' || step === 'stretch');
        if (careMode || step === 'stretch-offer' || step === 'stretch') renderNeedsCard();
        const copy = STEP_COPY[step] || STEP_COPY.smile;
        const who = selectedPlantLabel();
        els.stepTitle.textContent = step === 'pick' ? copy.title : (who ? `${copy.title} · ${who}` : copy.title);
        els.stepText.textContent = copy.text;
        const harvestReady = step === 'care-hub' && session && session.canCareHarvest(session.selectedPlot);
        const harvestBreath = step === 'care-hub' && session && (session.activeCareChannel === 'harvest' || harvestReady);
        const stakeStretch = step === 'care-hub' && session && session.activeCareChannel === 'stake';
        els.breathGuide.hidden = step !== 'breathe' && step !== 'care-harvest' && !harvestBreath;
        els.stretchGuide.hidden = step !== 'stretch' && !stakeStretch;
        if (stakeStretch) renderStretchHud();
        els.stepPanel.hidden = careMode || step === 'stretch-offer' || step === 'stretch';
        renderStepActions(step);
        if (step !== 'breathe') {
            els.breathRate.hidden = true;
            els.breathRate.removeAttribute('data-state');
        } else {
            renderBreathCount(0);
            renderBreathRate();
        }
        syncTendRing();
    }

    function renderStepActions(step) {
        const box = els.stepPanel.querySelector('.step-actions');
        box.textContent = '';
        const opt = document.getElementById('breath-options');
        if (opt) opt.remove();
        if (step === 'pick-harvest') {
            const go = mkBtn('Harvest this bed', 'btn btn-primary', () => { onStep(session.confirmPick()); });
            go.id = 'btn-pick-go';
            const skip = mkBtn('Skip harvest', 'btn btn-ghost', () => { onStep(session.skip()); });
            skip.id = 'btn-skip';
            box.append(skip, go);
        } else if (step === 'harvest-hold') {
            const inst = mkBtn('Harvest now (Enter)', 'btn btn-primary', () => { onStep(session.confirmHarvestInstant()); });
            inst.id = 'btn-harvest-now';
            const skip = mkBtn('Skip harvest', 'btn btn-ghost', () => { onStep(session.skip()); });
            skip.id = 'btn-skip';
            box.append(skip, inst);
        } else if (step === 'pick') {
            const go = mkBtn('Tend this plant', 'btn btn-primary', () => { onStep(session.confirmPick()); });
            go.id = 'btn-pick-go';
            const skip = mkBtn('Finish visit', 'btn btn-ghost', () => { onStep(session.go('summary')); });
            skip.id = 'btn-skip';
            box.append(skip, go);
        } else if (step === 'care-hub') {
            const done = mkBtn('Finish visit', 'btn btn-ghost', () => { onStep(session.finishCareHub()); });
            done.id = 'btn-skip';
            box.append(done);
        } else if (step === 'care-smile' || step === 'care-talk' || step === 'care-harvest') {
            const back = mkBtn('Back to needs', 'btn btn-ghost', () => { onStep(session.go('care-hub')); });
            back.id = 'btn-skip';
            if (step === 'care-harvest') {
                const skip = mkBtn('Skip breathing', 'btn btn-soft', () => { onStep(session.go('care-hub')); });
                box.append(back, skip);
            } else box.append(back);
        } else if (step === 'stretch-offer' || step === 'stretch') {
            /* actions rendered in stretch-care-panel */
        } else if (step === 'breathe-offer') {
            const group = document.createElement('div');
            group.className = 'opt-group';
            group.id = 'breath-options';
            for (const key of ['standard', 'gentle']) {
                const lab = document.createElement('label');
                const r = document.createElement('input');
                r.type = 'radio'; r.name = 'pace'; r.value = key; r.checked = state.settings.pace === key;
                r.addEventListener('change', () => { state.settings.pace = key; save(); });
                lab.append(r, document.createTextNode(' ' + V.PACES[key].label + (key === 'gentle' ? ': a good place to start' : '')));
                group.appendChild(lab);
            }
            const st = document.createElement('label');
            st.className = 'stepper';
            const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−';
            const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+';
            const val = document.createElement('b'); val.textContent = String(state.settings.breaths);
            const setB = (n) => { state.settings.breaths = V.clampBreaths(n); val.textContent = String(state.settings.breaths); save(); };
            minus.addEventListener('click', () => setB(state.settings.breaths - 1));
            plus.addEventListener('click', () => setB(state.settings.breaths + 1));
            st.append(document.createTextNode('Breaths: '), minus, val, plus, document.createTextNode(' (3–6)'));
            group.appendChild(st);
            const note = document.createElement('div');
            note.className = 'note';
            note.textContent = 'Skip it if you have a heart or lung condition, are pregnant, or just don\'t feel like it today.';
            group.appendChild(note);
            els.stepText.after(group);
            const skip = mkBtn(session.hasMorePlants() ? 'Next plant' : 'Skip breathing', 'btn btn-ghost', () => { session.skip(); });
            skip.id = 'btn-skip';
            const go = mkBtn('Start breathing', 'btn btn-primary', () => {
                session.startBreathing({ pace: state.settings.pace, breaths: state.settings.breaths });
            });
            go.id = 'btn-breathe-start';
            box.append(skip, go);
        } else {
            const skip = mkBtn(step === 'breathe' ? 'Skip breathing' : 'Skip', 'btn btn-ghost', () => { session.skip(); });
            skip.id = 'btn-skip';
            box.append(skip);
        }
    }
    function mkBtn(text, cls, fn) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = cls; b.textContent = text;
        b.addEventListener('click', fn);
        return b;
    }

    function renderStretchCarePanel(step) {
        if (!els.stretchCareActions || !session) return;
        const copy = STEP_COPY[step] || STEP_COPY.stretch;
        const who = selectedPlantLabel();
        els.stretchCareTitle.textContent = who ? `${copy.title} · ${who}` : copy.title;
        els.stretchCareText.textContent = copy.text;
        els.stretchCareLive.textContent = step === 'stretch' && session.stretchSnap && session.stretchSnap.complete
            ? 'Lovely — this plant is staked until harvest.'
            : '';
        const box = els.stretchCareActions;
        box.innerHTML = '';
        const back = mkBtn('Back to plant', 'btn btn-ghost', () => { onStep(session.skipStretchCare()); });
        back.id = 'btn-stretch-back';
        if (step === 'stretch-offer') {
            const go = mkBtn('Start neck stretch', 'btn btn-primary', () => { onStep(session.startStretchCare()); });
            go.id = 'btn-stretch-start';
            box.append(back, go);
        } else {
            const done = mkBtn('I stretched', 'btn btn-primary', () => { onStep(session.completeStretchCare()); });
            done.id = 'btn-stretch-done';
            box.append(back, done);
        }
    }
    function renderBreathCount(done) {
        if (breathHudDemoLock) return;
        const total = session && session.pacer ? session.pacer.breaths : state.settings.breaths;
        els.breathCount.textContent = '';
        for (let i = 0; i < total; i++) {
            const d = document.createElement('i');
            if (i < done) d.className = 'on';
            els.breathCount.appendChild(d);
        }
    }

    function renderBreathRate() {
        const el = els.breathRate;
        if (!el || breathHudDemoLock) return;
        if (screen !== 'visit' && screen !== 'camera-check') return;
        const fresh = signal.breathing && performance.now() - signal.breathing.at < 2500;
        if (!fresh) {
            el.hidden = false;
            el.dataset.state = 'warming';
            el.textContent = 'Listening for your breath…';
            return;
        }
        const b = signal.breathing;
        const bpm = Math.round(b.rate * 10) / 10;
        if (b.stable) {
            el.hidden = false;
            el.dataset.state = 'stable';
            el.textContent = `${bpm} breaths/min`;
        } else {
            el.hidden = false;
            el.dataset.state = 'settling';
            el.textContent = `Settling… ~${bpm} breaths/min`;
        }
    }

    function currentInput() {
        const now = performance.now();
        const fresh = signal.hAt && now - signal.hAt < 700;
        const valOk = signal.validation === 'Ok' || signal.validation === 'CameraTuning';
        const faceVisible = !!fresh && valOk;
        return {
            happiness: faceVisible ? signal.h : null,
            talking: faceVisible && now - signal.talkAt < 700 ? signal.talking : false,
            faceVisible,
            isDaylight: lighting !== 'night',
        };
    }

    function stretchSample() {
        const now = performance.now();
        const valOk = signal.validation === 'Ok' || signal.validation === 'CameraTuning';
        const lmFresh = signal.landmarksAt && now - signal.landmarksAt < 700;
        const faceVisible = lmFresh && valOk && signal.landmarks && signal.landmarks.length > 0;
        return {
            points: faceVisible ? signal.landmarks : null,
            stable: signal.landmarksStable,
            faceVisible,
            mirrored: true,
        };
    }

    let stretchRingScratch = null;
    function softenRingFrameAlpha(ctx, img) {
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!stretchRingScratch || stretchRingScratch.width !== iw || stretchRingScratch.height !== ih) {
            stretchRingScratch = document.createElement('canvas');
            stretchRingScratch.width = iw;
            stretchRingScratch.height = ih;
        }
        const sctx = stretchRingScratch.getContext('2d');
        sctx.clearRect(0, 0, iw, ih);
        sctx.drawImage(img, 0, 0);
        const d = sctx.getImageData(0, 0, iw, ih);
        const data = d.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            let a = data[i + 3];
            const mx = Math.max(r, g, b);
            const mn = Math.min(r, g, b);
            const isPlate = mx < 120 && mx - mn < 36;
            const isVegetal = g > r + 5 && g > b + 3;
            const isFill = isVegetal && mx > 90;
            if (isPlate && !isFill) a = 0;
            else if (a < 64 && !isFill) a = 0;
            else if (mx < 90 && !isFill) a = 0;
            data[i + 3] = a;
        }
        sctx.putImageData(d, 0, 0);
        ctx.drawImage(stretchRingScratch, 0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    function drawStretchRing(canvas, progress, done) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const night = lighting === 'night';
        const frames = night ? stretchRingArt.framesNight : stretchRingArt.framesDay;
        const p = done ? 1 : Math.max(0, Math.min(1, progress));
        let frame = Math.max(1, Math.round(p * (STRETCH_RING_FRAMES - 1)));
        if (stretchHudDemoLock && stretchDemoSnap && Number.isFinite(stretchDemoSnap.ringFrame)) {
            frame = Math.max(0, Math.min(STRETCH_RING_FRAMES - 1, Math.round(stretchDemoSnap.ringFrame)));
        }
        const frameImg = frames && frames[frame];
        if (frameImg && frameImg.naturalWidth > 0) {
            softenRingFrameAlpha(ctx, frameImg);
        } else if (!frames) {
            ctx.strokeStyle = 'rgba(150, 120, 80, 0.35)';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(w / 2, h / 2, w * 0.38, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (done) {
            ctx.fillStyle = 'rgba(125, 154, 91, 0.92)';
            ctx.font = `bold ${Math.round(w * 0.11)}px Nunito, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✓', w / 2, h / 2 + w * 0.02);
        }
    }

    function renderStretchHud() {
        const ccStretch = screen === 'camera-check' && cameraCheck && cameraCheck.session && cameraCheck.session.active === 'stretch';
        if (!stretchHudDemoLock && !ccStretch && (!session || session.step !== 'stretch')) return;
        const snap = stretchHudDemoLock && stretchDemoSnap
            ? stretchDemoSnap
            : ccStretch && cameraCheck.lastSnap
                ? (cameraCheck.lastSnap.stretchSnap || {})
                : (session && session.stretchSnap) || {};
        const roll = snap.rollDeg || 0;
        const s = ART.stretch;
        const theta = Math.max(-(s && s.headRollClamp) || 28, Math.min((s && s.headRollClamp) || 28, roll));
        const rad = (theta * Math.PI) / 180;
        const arm = (s && s.headArmLength) || 143;
        const pv = (s && s.stemPivotInBox) || [80, 216];
        const night = lighting === 'night';
        const stemEl = els.stretchSunflowerStem || document.getElementById('stretch-sunflower-stem');
        const headEl = els.stretchSunflower;
        const fullEl = els.stretchGuideFull;
        if (s && stemEl && headEl && !stemEl.dataset.fallback) {
            const stemSrc = night ? s.guideStemNight : s.guideStem;
            const headSrc = night ? s.guideHeadNight : s.guideHead;
            stemEl.onerror = () => {
                stemEl.dataset.fallback = '1';
                stemEl.hidden = true;
                headEl.hidden = true;
                if (fullEl) {
                    fullEl.hidden = false;
                    fullEl.src = artUrl(s.guideFull);
                    fullEl.onerror = () => {
                        fullEl.replaceWith(Object.assign(document.createElement('div'), {
                            className: 'stretch-flower-fallback',
                            textContent: '🌻',
                        }));
                    };
                }
            };
            if (!stemEl.src) stemEl.src = artUrl(stemSrc);
            if (!headEl.src) headEl.src = artUrl(headSrc);
            stemEl.hidden = false;
            headEl.hidden = false;
            const piv = s.stemPivotInStem || [64, 152];
            stemEl.style.transformOrigin = `${piv[0]}px ${piv[1]}px`;
            stemEl.style.transform = `rotate(${theta}deg)`;
            const hx = pv[0] + arm * Math.sin(rad);
            const hy = pv[1] + arm * (-Math.cos(rad));
            headEl.style.left = `${hx}px`;
            headEl.style.top = `${hy}px`;
            headEl.style.transform = `translate(-50%, -50%) rotate(${theta * (s.headRollGain || 1.15)}deg)`;
        }
        const hintL = els.stretchHintLeft;
        const hintR = els.stretchHintRight;
        if (hintL && hintR && s) {
            const hl = night ? s.hintLeftNight : s.hintLeft;
            const hr = night ? s.hintRightNight : s.hintRight;
            if (!hintL.src) hintL.src = artUrl(hl);
            if (!hintR.src) hintR.src = artUrl(hr);
            hintL.hidden = false;
            hintR.hidden = false;
            const showLeft = !snap.leftDone && (!snap.rightDone || snap.activeSide === 'left');
            const showRight = !snap.rightDone && snap.leftDone;
            hintL.style.opacity = showLeft ? '0.92' : '0';
            hintR.style.opacity = showRight || (!snap.leftDone && snap.activeSide === 'right') ? '0.92' : (snap.leftDone && !snap.rightDone ? '0.92' : '0');
            if (!snap.leftDone && !snap.rightDone && !snap.activeSide) {
                hintL.style.opacity = '0.55';
                hintR.style.opacity = '0';
            }
        }
        const ringSide = snap.activeSide === 'right' ? 'right' : 'left';
        const ringProg = ringSide === 'right' ? snap.rightProgress : snap.leftProgress;
        const ringDone = ringSide === 'right' ? snap.rightDone : snap.leftDone;
        drawStretchRing(els.stretchRing, ringProg, ringDone);
        if (snap.needsFaceHint) {
            els.hint.hidden = false;
            els.hintTitle.textContent = 'Face the camera';
            els.hintSub.textContent = 'Tip one ear toward your shoulder so we can see the stretch. Or tap Skip / I stretched.';
            document.body.dataset.hint = 'stretch-face';
        } else if (document.body.dataset.hint === 'stretch-face') {
            els.hint.hidden = true;
            document.body.dataset.hint = '';
        }
        const side = snap.activeSide;
        const live = snap.complete ? 'Lovely — your plant is staked for harvest.'
            : side === 'left' ? 'Hold toward your left shoulder and keep a gentle stretch.'
                : side === 'right' ? 'Hold toward your right shoulder and keep a gentle stretch.'
                    : 'Tip each ear toward a shoulder and hold gently.';
        els.stepLive.textContent = live;
        if (els.stretchCareLive) els.stretchCareLive.textContent = live;
        renderStretchCarePanel('stretch');
    }

    function stretchEngagedForHub() {
        if (!session || session.step !== 'care-hub' || session.selectedPlot == null) return false;
        const pl = state.plots[session.selectedPlot];
        if (!pl) return false;
        const needs = L.plantNeeds(pl.plantId);
        if (!needs.stake || C.stakeNeedMet(session.careProgressFor(session.selectedPlot), pl.staked)) return false;
        const snap = session.stretchSnap || {};
        return !!(snap.activeSide
            || Math.abs(Number(snap.rollDeg) || 0) >= 8
            || (snap.leftProgress || 0) > 0.05
            || (snap.rightProgress || 0) > 0.05);
    }

    function updateVisit(dt, t) {
        const input = currentInput();
        if (session && (session.step === 'stretch' || session.step === 'care-hub')) input.stretch = stretchSample();
        const events = session.update(dt, input);
        if (signalPanelDemoLock && session && session.step === 'care-hub') {
            if (signalPanelDemoLock === 'smile') {
                session.smiling = true;
                session.activeCareChannel = 'water';
            } else if (signalPanelDemoLock === 'talk') {
                session.talking = true;
                session.activeCareChannel = 'fertilizer';
            } else if (signalPanelDemoLock === 'stretch') {
                session.activeCareChannel = 'stake';
            } else if (signalPanelDemoLock === 'breathe') {
                session.activeCareChannel = 'harvest';
            }
        }
        let breathPhase = null;
        if (session.activeCareChannel === 'harvest' && session.pacer && session.pacer.total > 0) {
            breathPhase = Math.sin((session.breathT / session.pacer.total) * Math.PI * 2);
        } else if (input.breathing && Number.isFinite(input.breathing.rate)) {
            breathPhase = Math.sin(t * (input.breathing.rate / 60) * Math.PI * 2);
        }
        let panelMode = 'idle';
        if (signalPanelDemoLock) {
            panelMode = signalPanelDemoLock;
            if (signalSwitcher) signalSwitcher.step(t, panelMode);
        } else if (signalSwitcher && session.step === 'care-hub') {
            panelMode = SP.rawPanelModeFromSignals({
                smiling: input.faceVisible && session.smiling,
                talking: input.faceVisible && session.talking,
                breathing: !!(input.breathing && input.breathing.fresh) || session.activeCareChannel === 'harvest',
                stretchEngaged: stretchEngagedForHub(),
            });
            panelMode = signalSwitcher.step(t, panelMode);
        }
        trace.push({
            t,
            happiness: input.happiness,
            faceVisible: input.faceVisible,
            talking: input.talking,
            smiling: session.smiling,
            breathRate: input.breathing && Number.isFinite(input.breathing.rate) ? input.breathing.rate : null,
            breathPhase,
            rollDeg: session.stretchSnap && Number.isFinite(session.stretchSnap.rollDeg) ? session.stretchSnap.rollDeg : null,
            panelMode,
        });
        for (const ev of events) {
            if (ev.type === 'care-progress') renderNeedsCard();
            if (ev.type === 'step' && ev.step !== lastStep) onStep(ev.step);
            if (ev.type === 'harvest-ready' && ev.plot != null) {
                const pl = state.plots[ev.plot];
                if (pl) {
                    const mode = (V.PLANT_HARVEST[pl.plantId] || {}).mode;
                    scene.playHarvestAnim(ev.plot, pl.plantId, { pull: mode === 'pull' });
                }
                refreshBasketChip(session.pendingHarvests.length);
                toast('Picked! Finish the visit to store it in your pantry.');
            }
        }
        if (!session) return;
        const step = session.step;
        if (step === 'care-hub') setSourcePhase(careHubMockPhase());
        document.body.dataset.smiling = session.smiling ? '1' : '0';
        document.body.dataset.talking = session.talking ? '1' : '0';

        // ring + live text
        const dur = session.stepDuration();
        const rem = session.stepRemaining();
        const frac = dur > 0 ? 1 - rem / dur : 0;
        els.ringFg.style.strokeDashoffset = String(276.46 * frac);
        const careStep = step === 'care-smile' || step === 'care-talk' || step === 'care-harvest';
        els.ringText.textContent = step === 'breathe-offer' ? '🍃' : (step === 'pick' || step === 'pick-harvest') ? '❀' : step === 'harvest-hold' ? '🧺'
            : step === 'care-hub' ? '❀' : careStep ? String(Math.max(1, Math.ceil(rem))) : String(Math.ceil(rem));
        if (step === 'pick-harvest') {
            const remH = session.remainingHarvestCount();
            els.stepLive.textContent = `${selectedPlantLabel()} · ready to pick · ${remH} bed${remH === 1 ? '' : 's'} left. Enter or Space to harvest.`;
        } else if (step === 'harvest-hold') {
            els.stepLive.textContent = session.poorReading ? pausedFaceLive()
                : session.smiling ? '🧺 Picking… hold that smile' : `Smile gently · ${Math.ceil(rem)} s (or press Enter)`;
        } else if (step === 'pick') {
            const round = session.plantRound + 1;
            const total = session.plantedBeds.length;
            els.stepLive.textContent = `${selectedPlantLabel()} · plant ${round} of ${total}. Enter or Space to tend.`;
        } else if (step === 'care-hub') {
            const pl = state.plots[session.selectedPlot];
            if (pl && session.canCareHarvest(session.selectedPlot)) {
                els.stepLive.textContent = 'Fully grown — breathe calmly to pick, or press Enter. Esc ends the visit.';
            } else {
                const all = pl && C.allNeedsMet(session.careProgressFor(session.selectedPlot), L.plantNeeds(pl.plantId), pl.staked);
                const moreBeds = session.selectablePlots && session.selectablePlots().length > 1;
                els.stepLive.textContent = all
                    ? (moreBeds
                        ? 'All needs met — arrow keys or Enter for another bed. Finish when you like.'
                        : 'All needs met — bloom stamp on the tag. Finish when you like.')
                    : 'Smile to water, talk to fertilize, stretch to stake. Switch beds with arrow keys, Enter, or a click.';
            }
        } else if (step === 'care-smile') {
            els.stepLive.textContent = session.poorReading ? 'Paused: waiting to see your face'
                : session.smiling ? '💧 Watering…' : 'Smile gently to fill the water dot';
        } else if (step === 'care-talk') {
            els.stepLive.textContent = session.poorReading ? 'Paused: waiting to see your face'
                : session.talking ? '🍃 Fertilizing…' : 'Talk to your plant to fill the fertilizer dot';
        } else if (step === 'care-harvest') {
            if (session.pacer) {
                const b = session.pacer.at(session.breathT);
                els.breathGuide.hidden = false;
                const scale = 0.45 + 0.55 * b.size;
                els.breathOrb.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
                els.breathWord.textContent = b.phase === 'in' ? 'Breathe in' : 'And slowly out';
                renderBreathCount(session.breathsDone);
                renderBreathRate();
                scene.setEffects({ breath: b.size });
            }
            els.stepLive.textContent = '🧺 Breathe with the guide to harvest this crop';
        } else if (step === 'smile') {
            els.stepLive.textContent = session.poorReading ? pausedFaceLive()
                : session.smiling ? `☀ Sunlight pouring: ${session.sunHours.toFixed(1)} h` : `${session.sunHours.toFixed(1)} h of sun so far. Smile when you're ready`;
        } else if (step === 'talk') {
            els.stepText.textContent = `${STEP_COPY.talk.text} Try: “${TALK_PROMPTS[(talkPromptIdx + Math.floor(t / 7)) % TALK_PROMPTS.length]}”`;
            els.stepLive.textContent = session.poorReading ? pausedFaceLive()
                : session.talking ? `💧 Watering: can ${Math.round(session.water * 100)}% full` : `Watering can ${Math.round(session.water * 100)}% full`;
        } else if (step === 'breathe-offer') {
            els.stepLive.textContent = '';
        } else if (step === 'stretch') {
            renderStretchHud();
        } else if (step === 'stretch-offer') {
            els.stepLive.textContent = '';
        } else if (step === 'breathe') {
            const b = session.pacer.at(session.breathT);
            const scale = 0.45 + 0.55 * b.size;
            els.breathOrb.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
            els.breathHalo.style.transform = `translate(-50%, -50%) scale(${(0.5 + 0.55 * b.size).toFixed(3)})`;
            els.breathHalo.style.opacity = String(0.4 + 0.6 * b.size);
            els.breathWord.textContent = b.phase === 'in' ? 'Breathe in' : 'And slowly out';
            els.breathSub.textContent = b.phase === 'in' ? `softly through your nose · ${Math.ceil(b.remaining)}` : `let it go gently · ${Math.ceil(b.remaining)}`;
            document.body.dataset.breathPhase = b.phase;
            document.body.dataset.breath = String(session.breathsDone);
            renderBreathCount(session.breathsDone);
            renderBreathRate();
            els.stepLive.textContent = `🍃 Breath ${Math.min(session.pacer.breaths, b.breath + 1)} of ${session.pacer.breaths} · fertilizer ${Math.round(session.fertilizer * 100)}%`;
            scene.setEffects({ breath: b.size });
        }

        // scene effects
        const on = L.DEFAULTS.smileOn;
        const smileAmt = (step === 'smile' || step === 'care-smile' || step === 'harvest-hold') && session.smiling
            ? 0.45 + 0.55 * L.clamp01((session.h - on) / (1 - on)) : 0;
        const stretchSnap = session.stretchSnap || {};
        const stakeAmt = step === 'stretch'
            ? Math.max(stretchSnap.leftProgress || 0, stretchSnap.rightProgress || 0)
            : 0;
        renderNeedsCard();
        renderMeters();
        if (step !== 'care-hub') {
            const waterFx = ((step === 'care-smile' || step === 'smile') && session.smiling)
                || (step === 'talk' && session.talking) ? 1 : 0;
            const fertFx = (step === 'care-talk' && session.talking) ? 1
                : (step === 'breathe' || step === 'care-harvest') ? 0.9 : 0;
            scene.setEffects({
                plot: session.selectedPlot,
                sun: smileAmt,
                water: waterFx,
                fert: fertFx,
                stake: stakeAmt,
            });
        }
        syncTendRing();

        // hints
        updateHint(step, input);
    }

    function pausedFaceLive() {
        const g = faceGuidance(signal.validation, signal.validationHint);
        if (g && signal.validation !== 'Ok' && signal.validation !== 'CameraTuning') {
            return `Paused: ${g.title}`;
        }
        return 'Paused: waiting to see your face';
    }

    function updateHint(step, input) {
        const active = step === 'smile' || step === 'talk' || step === 'care-smile' || step === 'care-talk';
        const poor = active && session.poorReading;
        const code = signal.validation;
        const dark = poor && (code === 'TooDark' || code === 'TooDarkOrBacklit');
        let title = '', sub = '';
        // Only blame darkness when the camera says so — garden "night" lighting
        // is cosmetic and must not override a bright room + missing face.
        if (dark && lighting === 'night') {
            title = '🌙 It\'s a little dark in here';
            sub = 'Try turning on a soft light in front of you. Your garden will wait.';
        } else if (poor) {
            const g = faceGuidance(code, signal.validationHint);
            if (g) {
                title = g.title;
                sub = g.sub;
            } else {
                // Validation Ok/CameraTuning but no fresh expression samples yet.
                title = 'Looking for your expression…';
                sub = 'Hold still, face the camera, and give a clear smile. Soft front light helps.';
            }
        }
        els.hint.hidden = !title;
        document.body.dataset.hint = dark && lighting === 'night' ? 'night-light' : (title ? 'face' : '');
        document.body.dataset.validation = poor ? (code || '') : '';
        if (title) { els.hintTitle.textContent = title; els.hintSub.textContent = sub; }
    }

    async function endTendSession() {
        const result = session.result();
        const beforeSeeds = V.unlockedPlants(state);
        const out = V.applyVisit(state, result, clock.now());
        const harvested = V.applySessionHarvests(state, result.harvestPlots, clock.now());
        const unlocks = V.newUnlocksAfterHarvest(state, beforeSeeds);
        out.harvested = harvested;
        out.seedUnlocks = unlocks.seeds;
        lastResult = Object.assign({}, out);
        save();
        await stopCamera();
        session = null;
        scene.setEffects({ sun: 0, water: 0, fert: 0 });
        plotsForScene();
        renderHud();
        show('idle');
        if (out.seedUnlocks.length) showUnlockReveal(out.seedUnlocks);
        else if (out.tended && out.tended.length) toast('Tending saved for tonight.');
    }

    async function finishVisit() {
        if (state.version >= 5) {
            await endTendSession();
            if (state.version >= 6 && lastResult) {
                document.body.dataset.step = 'summary';
                renderSummary(lastResult, { night: false });
                show('summary');
                document.body.dataset.revealed = '1';
            }
            return;
        }
        const result = session.result();
        const before = state.plots.map((p) => (p ? { plantId: p.plantId, stage: p.stage } : null));
        const beforeSeeds = V.unlockedPlants(state);
        const out = V.applyVisit(state, result, clock.now());
        const harvested = V.applySessionHarvests(state, result.harvestPlots, clock.now());
        const unlocks = V.newUnlocksAfterHarvest(state, beforeSeeds);
        out.harvested = harvested;
        out.seedUnlocks = unlocks.seeds;
        lastResult = Object.assign({}, out);
        save();
        await stopCamera();
        session = null;
        scene.setEffects({ sun: 0, water: 0, fert: 0 });
        document.body.dataset.step = 'summary';
        renderSummary(out);
        show('summary');
        renderHud();
        const shown = before.slice();
        scene.setPlots(shown, { instant: true });
        out.grew.forEach((g, k) => {
            setTimeout(() => {
                shown[g.plot] = { plantId: g.plantId, stage: g.to };
                scene.setPlots(shown);
                floatLabel(g.plot, g.mature ? `${g.name}: fully grown!` : `${g.name} → ${V.STAGES[g.to].label}`);
            }, 700 + k * 650);
        });
        setTimeout(() => { plotsForScene({ instant: true }); document.body.dataset.revealed = '1'; }, 900 + out.grew.length * 650 + 2300);
        document.body.dataset.revealed = '0';
        document.body.dataset.grew = String(out.grew.length);
        if (out.seedUnlocks.length) showUnlockReveal(out.seedUnlocks);
    }

    function summaryBuildCtx(out, opts) {
        const o = opts || {};
        const now = o.now || clock.now();
        return {
            out,
            state,
            night: !!o.night,
            fmtDate,
            now,
            lightingLabel: V.LIGHTING_LABELS[lighting],
            weeklyVisits: V.weeklyVisits,
            STAGES: V.STAGES,
            plantById: L.plantById,
            plantSrc: (id, stage) => ART.plantSrc(id, stage),
            readyPlotIndices: V.readyPlotIndices,
            gardenTodayKey,
            waitingText: V.waitingText,
            seasonDay: state.seasonDay,
            daysPerSeason: D.DAYS_PER_SEASON,
        };
    }

    function bindSummaryButtons(journalBtn, doneBtn) {
        journalBtn.addEventListener('click', () => openJournal('diary'));
        doneBtn.addEventListener('click', () => show('idle'));
    }

    function paintSummaryCard(out, opts) {
        const night = !!(opts && opts.night);
        els.screenSummary.classList.toggle('is-night', night);
        const data = SD.buildSummaryData(summaryBuildCtx(out, opts));
        const hooks = renderSummaryCard(els.sumCard, data, {
            night,
            art: '../assets/ui/care/',
            sumArt: '../assets/ui/summary/',
        });
        bindSummaryButtons(hooks.journal, hooks.done);
    }

    function renderMorningSummary(night) {
        const out = Object.assign({ grew: [], waiting: [], tended: [] }, night || {});
        paintSummaryCard(out, { night: true });
    }

    async function showMorningReveal(night) {
        renderMorningSummary(night);
        show('summary');
        const out = night || { grew: [] };
        out.grew.forEach((g, k) => {
            setTimeout(() => {
                floatLabel(g.plot, g.mature ? `${g.name}: ready!` : `${g.name} grew overnight`);
                scene.playGrowth(g.plot, g.from, g.to);
            }, 400 + k * 500);
        });
        setTimeout(() => plotsForScene({ instant: true }), 400 + out.grew.length * 500 + 800);
    }

    async function goToBed() {
        if (screen === 'visit' && session) await endTendSession();
        document.body.dataset.lighting = 'night';
        scene.setLighting('night');
        state.gardenMinutes = D.DEFAULT_DAY_CONFIG.lateNightStop;
        save();
        const steps = 14;
        for (let i = 1; i <= steps; i++) {
            scene.setBedtimeGlow(i / steps);
            if (i > steps - 4) scene.setBedtimeDark((i - (steps - 4)) / 4);
            await new Promise((r) => setTimeout(r, 65));
        }
        scene.setBedtimeGlow(0);
        scene.setBedtimeDark(0);
        hudSeasonOverride = false;
        const night = V.goToBed(state, clock.now());
        state.morningPending = null;
        save();
        refreshLighting();
        renderHud();
        await showMorningReveal(night);
    }

    function showUnlockReveal(seeds) {
        const parts = [];
        if (seeds.length) parts.push('New seeds: ' + seeds.map((id) => L.plantById(id).name).join(', '));
        const title = 'Fresh seeds for your journal';
        const body = parts.join(' · ');
        els.unlockTitle.textContent = title;
        els.unlockBody.textContent = body;
        els.unlockTitle.hidden = true;
        els.unlockBody.hidden = true;
        els.unlockArt.textContent = '';
        const cardSrc = ART.ui && ART.ui.unlockSeedCard;
        const img = new Image();
        img.alt = '';
        img.className = 'unlock-seed-img';
        img.src = cardSrc || ART.card;
        img.onerror = () => { els.unlockTitle.hidden = false; els.unlockBody.hidden = false; };
        els.unlockArt.appendChild(img);
        const copy = document.createElement('div');
        copy.className = 'unlock-copy';
        const h = document.createElement('h1');
        h.textContent = title;
        const p = document.createElement('p');
        p.className = 'lead';
        p.textContent = body;
        copy.append(h, p);
        els.unlockArt.appendChild(copy);
        if (seeds[0]) {
            const thumb = document.createElement('img');
            thumb.src = ART.plantSrc(seeds[0], 5);
            thumb.alt = '';
            thumb.className = 'unlock-plant';
            els.unlockArt.appendChild(thumb);
        }
        els.screenUnlock.hidden = false;
    }

    function renderSummary(out, opts) {
        paintSummaryCard(out, Object.assign({ night: false }, opts || {}));
    }

    // ------------------------------------------------------------------
    // Journal
    // ------------------------------------------------------------------
    function renderJournal(tab) {
        els.screenJournal.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
        document.body.dataset.journalTab = tab;
        const body = els.journalBody;
        body.textContent = '';
        if (tab === 'diary') {
            const entries = state.journal.slice().reverse();
            if (!entries.length) { const p = document.createElement('p'); p.className = 'j-empty'; p.textContent = 'Nothing yet. Plant a seed and your garden\'s story starts here.'; body.appendChild(p); return; }
            let day = null;
            for (const e of entries) {
                if (e.day !== day) {
                    day = e.day;
                    const h = document.createElement('div');
                    h.className = 'j-day';
                    h.textContent = V.dayStart(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
                    body.appendChild(h);
                }
                const row = document.createElement('div');
                row.className = 'j-entry';
                if (e.plantId && ART.plants[e.plantId]) {
                    const img = document.createElement('img');
                    img.src = ART.plantSrc(e.plantId, Math.max(1, Math.min(5, e.stage || 5)));
                    img.alt = '';
                    row.appendChild(img);
                } else {
                    const ic = document.createElement('span');
                    ic.className = 'j-icon';
                    ic.textContent = e.kind === 'visit' ? '☀' : '❀';
                    row.appendChild(ic);
                }
                const span = document.createElement('span');
                span.textContent = e.text || e.kind;
                row.appendChild(span);
                body.appendChild(row);
            }
        } else if (tab === 'plants') {
            const any = state.plots.some(Boolean);
            if (!any) { const p = document.createElement('p'); p.className = 'j-empty'; p.textContent = 'No plants yet.'; body.appendChild(p); return; }
            const today = clock.today();
            state.plots.forEach((p, i) => {
                if (!p) return;
                const kind = L.plantById(p.plantId);
                const row = document.createElement('div');
                row.className = 'mine-row';
                const img = document.createElement('img');
                img.src = ART.plantSrc(p.plantId, p.stage);
                img.alt = '';
                const txt = document.createElement('div');
                const days = p.plantedDay ? V.daysBetween(p.plantedDay, today) : 0;
                const b = document.createElement('b');
                b.textContent = `Bed ${i + 1}: ${kind.name}`;
                const pips = document.createElement('span');
                pips.className = 'stage-pips';
                for (let s = 1; s <= 5; s++) { const d = document.createElement('i'); if (s <= p.stage) d.className = 'on'; pips.appendChild(d); }
                const line = document.createElement('div');
                line.className = 'note';
                let status = `${V.STAGES[p.stage].label}`;
                if (V.isPlotReady(p, today)) status += ' · ready to pick';
                else if (V.isPlotRegrowing(p, today)) status += ' · regrowing';
                line.textContent = `${status} · planted ${days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago'} · ${L.plantCareSummary(p.plantId)}`;
                txt.append(b, pips, line);
                if (p.stage < 5) {
                    const bank = document.createElement('div');
                    bank.className = 'note';
                    const bar = document.createElement('span'); bar.className = 'bank';
                    const fill = document.createElement('i'); fill.style.width = `${Math.round(100 * p.sunBank / kind.cost)}%`;
                    bar.appendChild(fill);
                    bank.append(document.createTextNode(`Sun saved for next stage: ${p.sunBank.toFixed(1)}/${kind.cost} h `), bar);
                    txt.appendChild(bank);
                }
                row.append(img, txt);
                body.appendChild(row);
            });
        } else if (tab === 'pantry') {
            const P = ART.pantry;
            const items = (state.pantry && state.pantry.items) || {};
            const keys = Object.keys(items).filter((k) => items[k].count > 0);
            if (!keys.length) {
                const p = document.createElement('p');
                p.className = 'j-empty';
                p.textContent = 'Your pantry is empty. Harvest mature crops during a visit to fill the shelf.';
                body.appendChild(p);
            } else if (P && P.cubbies) {
                const shelf = document.createElement('div');
                shelf.className = 'pantry-shelf-frame';
                const canvas = document.createElement('div');
                canvas.className = 'pantry-shelf-canvas';
                canvas.style.aspectRatio = `${P.w} / ${P.h}`;
                const bg = document.createElement('img');
                bg.className = 'pantry-shelf-img';
                bg.src = P.src || ART.ui.pantryShelf;
                bg.alt = 'Pantry shelf';
                canvas.appendChild(bg);
                const order = L.PLANTS.map((p) => p.id);
                const sorted = keys.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
                sorted.slice(0, P.cubbies.length).forEach((id, idx) => {
                    const it = items[id];
                    const cub = P.cubbies[idx];
                    const [x0, y0, x1, y1] = cub.box;
                    const slot = document.createElement('div');
                    slot.className = 'pantry-cubby';
                    slot.style.left = `${(100 * x0) / P.w}%`;
                    slot.style.top = `${(100 * y0) / P.h}%`;
                    slot.style.width = `${(100 * (x1 - x0)) / P.w}%`;
                    slot.style.height = `${(100 * (y1 - y0)) / P.h}%`;
                    const img = document.createElement('img');
                    img.src = ART.produce.src(id);
                    img.alt = L.plantById(id).name;
                    img.className = 'pantry-cubby-icon';
                    const frac = P.iconFrac || 0.52;
                    img.style.width = `${frac * 100}%`;
                    img.style.height = `${frac * 100}%`;
                    img.onerror = () => { img.style.display = 'none'; };
                    slot.appendChild(img);
                    const [lx, ly] = cub.label;
                    const lab = document.createElement('div');
                    lab.className = 'pantry-cubby-label';
                    lab.style.left = `${(100 * lx) / P.w}%`;
                    lab.style.top = `${(100 * ly) / P.h}%`;
                    lab.textContent = `×${it.count}`;
                    canvas.append(slot, lab);
                });
                shelf.appendChild(canvas);
                body.appendChild(shelf);
            }
            const total = (state.pantry && state.pantry.totalHarvests) || 0;
            const foot = document.createElement('p');
            foot.className = 'note';
            foot.textContent = `${total} harvest${total === 1 ? '' : 's'} so far · collection only (no cooking yet).`;
            body.appendChild(foot);
        } else {
            const grid = document.createElement('div');
            grid.className = 'lib-grid';
            for (const p of L.PLANTS) {
                const info = V.plantInfo(p.id);
                const card = document.createElement('div');
                card.className = 'lib-card';
                const img = document.createElement('img');
                img.src = ART.plantSrc(p.id, 5);
                img.alt = '';
                const txt = document.createElement('div');
                const h = document.createElement('h3'); h.textContent = p.name;
                const care = document.createElement('div');
                care.className = 'seed-care';
                care.textContent = info.careSummary;
                const how = document.createElement('div');
                how.className = 'seed-meta';
                how.textContent = 'Smile to water · talk to fertilize · stretch to stake · daylight fills sun';
                const blurb = document.createElement('div'); blurb.className = 'note'; blurb.textContent = p.blurb;
                const ul = document.createElement('ul');
                for (const tip of info.tips) { const li = document.createElement('li'); li.textContent = tip; ul.appendChild(li); }
                txt.append(h, care, how, blurb, ul);
                card.append(img, txt);
                grid.appendChild(card);
            }
            body.appendChild(grid);
            const fine = document.createElement('p');
            fine.className = 'fineprint';
            fine.textContent = 'Care amounts are for this garden: each water or fertilizer dot takes a short smile or chat, and staking is one stretch. Daylight fills sun on its own while you visit.';
            body.appendChild(fine);
        }
    }

    // ------------------------------------------------------------------
    // Little UI helpers
    // ------------------------------------------------------------------
    function floatLabel(plot, text) {
        const c = scene.plotClient(plot);
        const pl = state.plots[plot];
        const meta = pl && ART.plants[pl.plantId] ? ART.plants[pl.plantId].stages[pl.stage - 1] : null;
        const hgt = meta ? (meta.base - meta.top) * ART.plots[plot].scale * c.s : 40;
        const d = document.createElement('div');
        d.className = 'float-label';
        d.textContent = text;
        d.style.left = `${c.x}px`;
        d.style.top = `${Math.max(70, c.y - hgt - 10)}px`;
        els.floatLayer.appendChild(d);
        setTimeout(() => d.remove(), 3700);
    }
    let toastTimer = null;
    function toast(msg) {
        els.toast.textContent = msg;
        els.toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
    }
    function showError(title, msg, offerKeyboard, offerRetry) {
        els.errorTitle.textContent = title;
        els.errorMessage.textContent = msg;
        if (els.btnErrorRetry) {
            els.btnErrorRetry.hidden = !offerRetry;
            els.btnErrorRetry.disabled = false;
        }
        els.btnErrorKeyboard.hidden = !offerKeyboard;
        els.errorBanner.hidden = false;
    }

    /** Map SmartSpectra error events to copy + optional user-initiated retry. */
    function handleSdkError(e) {
        // Pipeline already stopped; keep startCamera() from early-returning.
        sourceReady = false;
        const name = (e && e.name) || '';
        const live = !config.mock && !config.keyboard;
        if (name === 'SustainedLowFrameRate') {
            showError(
                'Camera too slow',
                'The reading paused because the frame rate stayed too low. Close other apps using the webcam, add soft light on your face, then try again.',
                live,
                live,
            );
            return;
        }
        const offerRetry = live && !!(e && e.retryable);
        showError(
            'SmartSpectra error',
            `${name || 'Error'}: ${(e && e.message) || ''}`,
            live,
            offerRetry,
        );
    }

    /**
     * User-initiated recovery after a retryable SDK stop (e.g. SustainedLowFrameRate).
     * Presage: reset after kError, then start — do not auto-loop.
     */
    async function retryAfterSdkError() {
        if (els.btnErrorRetry) els.btnErrorRetry.disabled = true;
        els.errorBanner.hidden = true;
        toast('Restarting the camera…');
        try {
            await enqueueCamera(async () => {
                if (!(await ensureSource())) throw new Error('Camera source unavailable');
                if (typeof source.reset === 'function') {
                    try { await source.reset(); } catch { /* best-effort */ }
                } else if (typeof source.stop === 'function') {
                    try { await source.stop(); } catch { /* ignore */ }
                }
                sourceReady = false;
                await new Promise((r) => setTimeout(r, 250));
                await source.start();
                sourceReady = true;
                resumePipPreview();
                if (source.setPhase) {
                    if (screen === 'visit' && session) {
                        source.setPhase(session.step === 'care-hub' ? careHubMockPhase() : session.step);
                    } else if (screen === 'camera-check') {
                        source.setPhase('camera-check-smile');
                    }
                }
            });
            toast('Camera restarted. Hold still with good light.');
        } catch (err) {
            showError(
                'Camera could not restart',
                String(err && err.message || err),
                !config.mock && !config.keyboard,
                true,
            );
        } finally {
            if (els.btnErrorRetry) els.btnErrorRetry.disabled = false;
        }
    }

    // plot hover tips + clicks
    els.garden.addEventListener('mousemove', (e) => {
        const i = scene.plotAt(e.clientX, e.clientY);
        scene.setHover(i);
        if (screen === 'visit') {
            const pickStep = session && ['pick', 'pick-harvest', 'care-hub', 'care-smile', 'care-talk', 'care-harvest', 'stretch-offer', 'stretch'].includes(session.step);
            const canSelect = pickStep && i !== null && session.selectablePlots().includes(i);
            els.garden.style.cursor = canSelect ? 'pointer' : '';
            if (canSelect && state.plots[i]) {
                const kind = L.plantById(state.plots[i].plantId);
                els.plotTip.textContent = '';
                const b = document.createElement('b'); b.textContent = kind.name;
                const action = session.step === 'pick-harvest' ? 'pick'
                    : (session.selectedPlot === i ? 'selected' : 'switch');
                els.plotTip.append(b, document.createTextNode(` · bed ${i + 1} — click to ${action}`));
                const c = scene.plotClient(i);
                els.plotTip.style.left = `${c.x}px`;
                els.plotTip.style.top = `${c.y - 70 * c.s}px`;
                els.plotTip.hidden = false;
            } else els.plotTip.hidden = true;
            return;
        }
        if (i === null) { els.plotTip.hidden = true; els.garden.style.cursor = ''; return; }
        const p = state.plots[i];
        const canPlantEmpty = !p && V.emptyPlots(state).length && canStartVisitFromScreen();
        const canTendPlant = !!p && state.version >= 6 && canStartVisitFromScreen()
            && !V.isPlotRegrowing(p, gardenTodayKey());
        els.garden.style.cursor = (canPlantEmpty || canTendPlant) ? 'pointer' : '';
        if (!p) {
            els.plotTip.textContent = screen === 'picker' ? `Plant in bed ${i + 1}` : `Bed ${i + 1}: empty. Click to plant`;
        } else {
            const kind = L.plantById(p.plantId);
            els.plotTip.textContent = '';
            const b = document.createElement('b'); b.textContent = kind.name;
            const todayKey = gardenTodayKey();
            let extra = V.isPlotReady(p, todayKey) ? ' · ready to pick — click to tend'
                : V.isPlotRegrowing(p, todayKey) ? ' · regrowing'
                    : (p.stage < 5 ? ` · ${p.sunBank.toFixed(1)}/${kind.cost} sun-hours saved` : ' · fully grown');
            if (canTendPlant && !V.isPlotReady(p, todayKey) && !V.isPlotRegrowing(p, todayKey)) {
                extra += ' — click to tend';
            }
            els.plotTip.append(b, document.createTextNode(` · ${V.STAGES[p.stage].label}${extra}`));
        }
        const c = scene.plotClient(i);
        els.plotTip.style.left = `${c.x}px`;
        els.plotTip.style.top = `${c.y - 70 * c.s}px`;
        els.plotTip.hidden = false;
    });
    els.garden.addEventListener('mouseleave', () => { els.plotTip.hidden = true; scene.setHover(null); });
    function isUiChromeTarget(el) {
        if (!el || !el.closest) return false;
        return !!el.closest([
            'button', 'a', 'input', 'select', 'textarea', 'label',
            '.top-actions', '.dev-drawer', '.error-banner', '.signal-panel',
            '.step-panel', '.stretch-care-panel', '.idle-bar', '.picker',
            '.journal', '.card', '.sg-summary', '#sum-card', '.wellness',
            '.camera-check', '.cc-howto', '.cc-packets',
            '#btn-cc-start', '#btn-cc-skip-now', '#btn-cc-retry',
        ].join(','));
    }

    let lastGardenPickAt = 0;
    function onGardenPointer(e) {
        if (e.button != null && e.button !== 0) return;
        // Capture-phase on #app: beds stay clickable even if a translucent overlay sits above the canvas.
        if (isUiChromeTarget(e.target)) return;
        const now = performance.now();
        if (now - lastGardenPickAt < 350) return;
        const i = scene.plotAt(e.clientX, e.clientY);
        if (i === null) return;
        lastGardenPickAt = now;
        const visitSelectSteps = ['pick', 'pick-harvest', 'care-hub', 'care-smile', 'care-talk', 'care-harvest', 'stretch-offer', 'stretch'];
        if (screen === 'visit' && session && visitSelectSteps.includes(session.step)) {
            if (session.setSelectedPlot(i)) {
                // Mid-tend / stretch: land back on care-hub for the newly chosen bed.
                onStep(session.step);
                if (session.step === 'pick') {
                    els.stepLive.textContent = `${selectedPlantLabel()} · plant ${session.plantRound + 1} of ${session.plantedBeds.length}. Enter or Space to tend.`;
                } else if (session.step === 'pick-harvest') {
                    els.stepLive.textContent = `${selectedPlantLabel()} · ready to pick. Enter or Space to harvest.`;
                }
            }
            return;
        }
        if (state.plots[i]) {
            if (state.version >= 6 && canStartVisitFromScreen()) {
                void beginVisitAtPlot(i);
            } else if (state.version < 6 && canStartVisitFromScreen()) {
                toast('Open Begin visit from the greeting card to tend beds.');
            }
            return;
        }
        if (screen === 'picker') { pickerTarget = i; scene.setHighlight(i); els.pickerTarget.textContent = `for bed ${i + 1}`; }
        else if (canStartVisitFromScreen()) openPicker(i);
    }
    const appRoot = document.getElementById('app') || document.body;
    appRoot.addEventListener('pointerdown', onGardenPointer, true);
    appRoot.addEventListener('click', onGardenPointer, true);

    // ------------------------------------------------------------------
    // Buttons + keys
    // ------------------------------------------------------------------
    els.chkAdult.addEventListener('change', () => { els.btnWellnessOk.disabled = !els.chkAdult.checked; });
    els.btnWellnessOk.addEventListener('click', ackWellness);
    function ackWellness() { state.wellnessAck = true; save(); afterWellnessOrResume(); }
    if (els.btnCcStart) els.btnCcStart.addEventListener('click', () => { void finishCameraCheckFlow(); });
    if (els.btnCcSkipNow) els.btnCcSkipNow.addEventListener('click', () => { void finishCameraCheckFlow(); });
    if (els.btnCcRetry) els.btnCcRetry.addEventListener('click', () => { void retryCameraCheck(); });
    if (els.btnCameraCheck) {
        els.btnCameraCheck.addEventListener('click', () => {
            if (screen === 'camera-check' || screen === 'wellness' || screen === 'loading') return;
            state.cameraCheckNote = null;
            void openCameraCheck({ reopen: true });
        });
    }
    els.btnGreetPlant.addEventListener('click', () => openPicker());
    els.btnBegin.addEventListener('click', beginVisit);
    els.btnPickerClose.addEventListener('click', closePicker);
    els.btnJournal.addEventListener('click', () => (screen === 'journal' ? closeJournal() : openJournal('diary')));
    els.btnJournalClose.addEventListener('click', closeJournal);
    els.screenJournal.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => renderJournal(b.dataset.tab)));
    els.btnVisit.addEventListener('click', () => (state.version >= 5 ? beginVisit() : show('greeting')));
    els.btnBed.addEventListener('click', () => goToBed());
    els.btnPlantIdle.addEventListener('click', () => openPicker());
    els.btnDev.addEventListener('click', () => toggleDev());
    els.btnDevClose.addEventListener('click', () => toggleDev(false));
    els.btnErrorDismiss.addEventListener('click', () => {
        els.errorBanner.hidden = true;
        if (els.btnErrorRetry) els.btnErrorRetry.hidden = true;
    });
    if (els.btnErrorRetry) {
        els.btnErrorRetry.addEventListener('click', () => { void retryAfterSdkError(); });
    }
    els.btnErrorKeyboard.addEventListener('click', () => {
        els.errorBanner.hidden = true;
        if (els.btnErrorRetry) els.btnErrorRetry.hidden = true;
        // Tear down the real SDK fully — including sourceReady — so startCamera()
        // actually starts the mock tick loop (otherwise S/T appear dead).
        if (source) { try { source.destroy(); } catch { /* ignore */ } }
        source = null;
        sourceReady = false;
        config.keyboard = true;
        els.mockBadge.hidden = false;
        els.mockMode.textContent = 'Keyboard player';
        els.btnBegin.disabled = false;
        toast('Keyboard mode: hold S to smile, T to talk, [ / ] to stretch.');
        const resume = screen === 'visit' || screen === 'camera-check';
        if (resume) {
            startCamera().then(() => {
                if (!source || !source.setPhase) return;
                if (screen === 'visit' && session) {
                    source.setPhase(session.step === 'care-hub' ? careHubMockPhase() : session.step);
                } else if (screen === 'camera-check') {
                    source.setPhase('camera-check-smile');
                }
            }).catch(() => {});
        }
    });
    function toggleDev(on) {
        devOpen = on === undefined ? !devOpen : !!on;
        els.devDrawer.hidden = !devOpen;
        els.mockBadge.style.visibility = devOpen ? 'hidden' : '';
    }
    els.devNextDay.addEventListener('click', nextDay);
    els.devLighting.addEventListener('change', () => setLightingOverride(els.devLighting.value));
    els.devSim.addEventListener('click', () => simulateDays(5));
    els.devReady.addEventListener('click', () => {
        if (screen === 'visit') return;
        V.makeAllReady(state);
        save();
        plotsForScene({ instant: true });
        renderHud();
        toast('All planted beds are ready to pick.');
    });
    els.btnUnlockOk.addEventListener('click', () => { els.screenUnlock.hidden = true; });
    els.devFill.addEventListener('click', fillEmpty);
    els.devReset.addEventListener('click', () => {
        state = V.createState(clock.now());
        state.wellnessAck = true;
        clock.offsetDays = 0;
        lastResult = null;
        save();
        plotsForScene({ instant: true });
        refreshLighting(); renderHud();
        show('greeting');
    });

    function nextDay() {
        if (screen === 'visit') return;
        if (state.version >= 5) {
            goToBed();
            return;
        }
        clock.nextDay();
        currentDay = clock.today();
        save();
        refreshLighting();
        renderHud();
        toast(`It's a new day: ${fmtDate(clock.now())}`);
        if (screen === 'idle' || screen === 'summary') show('greeting');
        else if (screen === 'greeting') renderGreeting();
    }
    function setLightingOverride(v) {
        state.settings.lighting = V.LIGHTINGS.includes(v) ? v : 'auto';
        els.devLighting.value = state.settings.lighting;
        save();
        refreshLighting();
        renderHud();
        if (screen === 'greeting') renderGreeting();
    }
    function simulateDays(n) {
        if (screen === 'visit') return;
        const res = V.simulateDays(state, clock, n, 1);
        currentDay = clock.today();
        save();
        lastResult = res[res.length - 1] || lastResult;
        plotsForScene();
        refreshLighting(); renderHud();
        toast(`Simulated ${n} sunny visits.`);
        if (screen === 'greeting') renderGreeting();
    }
    function fillEmpty() {
        const ids = V.unlockedPlants(state);
        V.emptyPlots(state).forEach((plot, k) => V.plantSeed(state, plot, ids[k % ids.length], clock.now()));
        save();
        plotsForScene();
        renderHud();
    }

    const manualKeys = { s: 'smile', ' ': 'smile', t: 'talk', f: 'hide' };
    const tiltKeys = { '[': 'tiltLeft', ']': 'tiltRight' };
    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
        const k = e.key.toLowerCase();
        if (k === 'g') { state.settings.chart = !state.settings.chart; save(); toast(state.settings.chart ? 'Smile chart on (shows during visits)' : 'Smile chart hidden'); return; }
        if (k === 'j') { screen === 'journal' ? closeJournal() : openJournal('diary'); return; }
        if (k === 'c' && screen !== 'camera-check' && screen !== 'wellness' && screen !== 'loading') {
            state.cameraCheckNote = null;
            void openCameraCheck({ reopen: true });
            return;
        }
        if (k === 'd') { toggleDev(); return; }
        if (k === 'n' && devOpen) { nextDay(); return; }
        if (k === 'escape') {
            if (screen === 'journal') closeJournal();
            else if (screen === 'picker') closePicker();
            else if (screen === 'camera-check' && cameraCheck && cameraCheck.returnToGarden) void finishCameraCheckFlow();
            toggleDev(false);
            return;
        }
        if (screen === 'visit' && session) {
            if (k === 'enter' || k === ' ') {
                e.preventDefault();
                if (session.step === 'pick-harvest') { onStep(session.confirmPick()); return; }
                if (session.step === 'harvest-hold') { onStep(session.confirmHarvestInstant()); return; }
                if (session.step === 'pick') { onStep(session.confirmPick()); return; }
                if (session.step === 'care-harvest') {
                    onStep(session.confirmCareHarvest());
                    return;
                }
                if (k === 'enter' && (session.step === 'care-hub' || session.step === 'care-smile'
                    || session.step === 'care-talk' || session.step === 'stretch-offer' || session.step === 'stretch')) {
                    // Harvest only when the breath/harvest channel is live or today's needs are done.
                    // Otherwise Enter switches beds so mid-tend players are not stuck on a mature plant.
                    const harvesting = session.activeCareChannel === 'harvest'
                        || (session.pacer && session.breathT > 0.05);
                    const doneHere = session.selectedPlot != null && session.allNeedsMetForPlot
                        && session.allNeedsMetForPlot(session.selectedPlot);
                    const canPick = session.canCareHarvest(session.selectedPlot);
                    const moreBeds = session.selectablePlots && session.selectablePlots().length > 1;
                    if (canPick && (harvesting || doneHere || !moreBeds)) {
                        onStep(session.confirmCareHarvest());
                        return;
                    }
                    if (moreBeds && typeof session.selectNextPlant === 'function') {
                        const before = session.selectedPlot;
                        session.selectNextPlant();
                        if (session.selectedPlot !== before) onStep('care-hub');
                    }
                    return;
                }
            }
            const nav = { arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down' };
            const navSteps = ['pick', 'pick-harvest', 'care-hub', 'care-smile', 'care-talk', 'care-harvest', 'stretch-offer', 'stretch'];
            if (nav[k] && navSteps.includes(session.step)) {
                e.preventDefault();
                const before = session.selectedPlot;
                const beforeStep = session.step;
                session.moveSelection(nav[k]);
                if (session.selectedPlot !== before || session.step !== beforeStep) onStep(session.step);
                else {
                    renderNeedsCard();
                    syncTendRing();
                }
                return;
            }
        }
        if (k === 'a' && source && source.setAuto && config.mock) { source.setAuto(true); els.mockMode.textContent = 'Demo player (auto)'; return; }
        if (tiltKeys[e.key] && source && source.setKeys && (config.mock || config.keyboard)) {
            source.setKeys({ [tiltKeys[e.key]]: true });
            els.mockMode.textContent = 'Keyboard player';
            return;
        }
        if (manualKeys[k] && source && source.setKeys && (config.mock || config.keyboard)) {
            if (k === ' ') e.preventDefault();
            source.setKeys({ [manualKeys[k]]: true });
            els.mockMode.textContent = 'Keyboard player';
        }
    });
    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (tiltKeys[e.key] && source && source.setKeys && (config.mock || config.keyboard)) {
            source.setKeys({ [tiltKeys[e.key]]: false });
            return;
        }
        if (manualKeys[k] && source && source.setKeys && (config.mock || config.keyboard)) source.setKeys({ [manualKeys[k]]: false });
    });

    // ------------------------------------------------------------------
    // Main loop
    // ------------------------------------------------------------------
    let lastT = performance.now() / 1000;
    let hudAcc = 0;
    function loop() {
        const t = performance.now() / 1000;
        const dt = Math.min(0.1, t - lastT);
        lastT = t;
        if (session && screen === 'visit') updateVisit(dt, t);
        if (screen === 'camera-check' && cameraCheck) updateCameraCheckScreen(dt);
        if (state.version >= 5) syncGardenClockHud();
        if (state.version >= 5 && document.visibilityState === 'visible' && screen !== 'wellness') {
            gardenClock.tick(dt * 1000);
            saveAcc += dt;
            if (saveAcc > 8) { saveAcc = 0; save(); }
        } else if (document.visibilityState !== 'visible') {
            gardenClock.pause();
        } else {
            gardenClock.resume();
        }
        scene.update(dt, t);
        scene.draw(t);
        const brandPainted = els.brandLogoDay && els.brandLogoDay.complete && els.brandLogoDay.naturalWidth > 0;
        const logoVisible = scene.logoOnCanvas || brandPainted;
        document.body.dataset.canvasLogo = logoVisible ? '1' : '0';
        if (state.version >= 5 && els.brandLogoDay) {
            if (els.brandFallback) els.brandFallback.hidden = logoVisible;
        }
        renderMeters();
        const chartOn = state.settings.chart && (screen === 'visit' || !!signalPanelDemoLock);
        if (els.chartPanel && els.chartPanel.hidden === chartOn) els.chartPanel.hidden = !chartOn;
        if (chartOn) redrawSignalPanel(t);
        hudAcc += dt;
        if (hudAcc > 0.35) {
            hudAcc = 0;
            refreshLighting();
            renderHud();
            if (state.version < 5) {
                const today = clock.today();
                if (today !== currentDay) {
                    currentDay = today;
                    if (screen === 'idle') show('greeting');
                }
            }
        }
        requestAnimationFrame(loop);
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error(`failed to load ${src}`));
            document.body.appendChild(s);
        });
    }

    async function init() {
        refreshLighting();
        plotsForScene({ instant: true });
        els.devLighting.value = state.settings.lighting;
        renderHud();
        requestAnimationFrame(loop);
        try {
            config = Object.assign(config, await window.smileGarden.getConfig());
        } catch (e) {
            showError('Startup error', 'Could not read app config: ' + (e && e.message));
        }
        if (config.mock) {
            els.mockBadge.hidden = false;
            els.mockMode.textContent = 'Demo player (auto)';
        } else if (config.sdkLoadError || !config.hasApiKey) {
            els.btnBegin.disabled = true;
            showError(config.sdkLoadError ? 'SmartSpectra SDK could not load' : 'Missing API key',
                (config.sdkLoadError || 'Set SMARTSPECTRA_API_KEY in `.env` (or your environment) and restart (free key: https://physiology.presagetech.com/auth/register).') +
                ' You can still play with the keyboard.', true);
        } else {
            try { await loadScript('../dist/sdk-source.bundle.js'); } catch {
                els.btnBegin.disabled = true;
                showError('Renderer bundle missing', 'Run `npm run build` (or `npm start`) first. You can still play with the keyboard.', true);
            }
        }
        if (state.morningPending && state.version >= 5) {
            const pending = state.morningPending;
            state.morningPending = null;
            save();
            await showMorningReveal(pending);
        } else if (state.wellnessAck) {
            mountCameraCheckGrid();
            // Always open warm-up from startup (screen is still "loading" here).
            if (CC.shouldShowCameraCheck(state)) void openCameraCheck({ fromStartup: true });
            else show(state.version >= 5 ? 'idle' : 'greeting');
        } else {
            show('wellness');
        }
        document.body.dataset.gardenV = String(state.version >= 6 ? 6 : state.version >= 5 ? 5 : 4);
        if (state.version >= 5) {
            scene.setSeason(state.season);
            refreshLighting();
        }
        // Capture / mock automation only — never expose in real production sessions.
        if (config.mock || config.capture) {
            window.__smileGarden = __smileGardenHooks;
        }
        document.body.dataset.ready = '1';
        window.addEventListener('resize', syncHudChipClamp);
    }

    // Dev/test hooks (used by scripts/capture-driver.js). Installed only in mock/capture.
    const __smileGardenHooks = window.SmileDevHooks.create({
        getState: () => state,
        setState: (v) => { state = v; },
        getSession: () => session,
        setSession: (v) => { session = v; },
        getScreen: () => screen,
        getScene: () => scene,
        getStretchDemoSnap: () => stretchDemoSnap,
        setStretchDemoSnap: (v) => { stretchDemoSnap = v; },
        getForcePickedPlots: () => forcePickedPlots,
        setForcePickedPlots: (v) => { forcePickedPlots = v; },
        getSignalPanelDemoLock: () => signalPanelDemoLock,
        setSignalPanelDemoLock: (v) => { signalPanelDemoLock = v; },
        getBreathHudDemoLock: () => breathHudDemoLock,
        setBreathHudDemoLock: (v) => { breathHudDemoLock = v; },
        getStretchHudDemoLock: () => stretchHudDemoLock,
        setStretchHudDemoLock: (v) => { stretchHudDemoLock = v; },
        getHudSeasonOverride: () => hudSeasonOverride,
        setHudSeasonOverride: (v) => { hudSeasonOverride = v; },
        getMockPipCapture: () => mockPipCapture,
        setMockPipCapture: (v) => { mockPipCapture = v; },
        getMockPipWantStream: () => mockPipWantStream,
        setMockPipWantStream: (v) => { mockPipWantStream = v; },
        getSource: () => source,
        getSourceReady: () => sourceReady,
        getConfig: () => config,
        getCameraCheck: () => cameraCheck,
        clock, gardenClock, els, scene, signal, signalSwitcher, STORE_KEY,
        L, V, C, CC, D,
        nextDay, simulateDays, fillEmpty, setLightingOverride,
        openJournal, closeJournal, openPicker, closePicker, ackWellness,
        openCameraCheck, retryCameraCheck, finishCameraCheckFlow,
        plant, beginVisit, onStep, renderNeedsCard, syncTendRing,
        show, save, toast, mkBtn, gardenTodayKey,
        refreshLighting, renderHud, plotsForScene, syncPipVisibility,
        restorePipHome, startCamera, ensureSource,
        primeSignalTraceForCapture, redrawSignalPanel,
        renderBreathRate, renderStretchHud, ensureStretchRingArt,
        renderSummary, renderMorningSummary, finishVisit,
        syncGardenSeasonFromDay, syncHudChipClamp, toggleDev,
    });


    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') gardenClock.resume();
        else { gardenClock.pause(); save(); }
    });

    window.addEventListener('beforeunload', () => { if (source) { try { source.destroy(); } catch { /* ignore */ } } save(); });
    init();
})();
