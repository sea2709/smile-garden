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
    const CC = window.SmileCameraCheck;
    const CCUI = window.SmileCameraCheckUI;
    const ART = window.SmileArt;
    const STORE_KEY = 'smile-garden.v3';
    const $ = (id) => document.getElementById(id);
    const els = {};
    for (const id of ['garden', 'clock-chip', 'week-dots', 'week-text', 'score-chip', 'btn-journal', 'btn-dev', 'chart-panel', 'chart-live',
        'smile-chart', 'pip', 'preview', 'mock-badge', 'mock-mode', 'hint', 'hint-title', 'hint-sub',         'meter-sun', 'meter-water', 'meter-fert', 'meter-stake',
        'meter-sun-val', 'meter-water-val', 'meter-fert-val', 'meter-stake-val', 'meter-sun-wrap', 'meter-water-wrap', 'meter-fert-wrap', 'meter-stake-wrap', 'step-panel', 'step-track',
        'ring-fg', 'ring-text', 'step-title', 'step-text', 'step-live', 'btn-skip', 'breath-guide', 'breath-orb', 'breath-halo', 'breath-word',
        'breath-sub', 'breath-rate', 'breath-count', 'stretch-guide', 'stretch-guide-box', 'stretch-sunflower', 'stretch-sunflower-stem', 'stretch-hint-left', 'stretch-hint-right', 'stretch-guide-full', 'stretch-ring', 'stretch-care-panel', 'stretch-care-title', 'stretch-care-text', 'stretch-care-live', 'stretch-care-actions', 'needs-card', 'needs-card-bg', 'needs-card-fallback', 'needs-plant-name', 'needs-rows', 'needs-bloom-stamp', 'needs-resting-stamp', 'needs-resting-fallback', 'btn-needs-done', 'idle-bar', 'idle-text', 'btn-plant-idle', 'btn-visit', 'btn-bed', 'day-chip-text', 'garden-clock', 'brand-logo-day', 'brand-logo-night', 'brand-fallback', 'plot-tip', 'float-layer', 'toast',
        'screen-wellness', 'chk-adult', 'btn-wellness-ok', 'screen-camera-check', 'cc-stage', 'cc-backdrop', 'cc-window-frame', 'cc-sill', 'cc-face-outline', 'cc-tilt-left', 'cc-tilt-right', 'cc-note', 'cc-prompt', 'cc-packets', 'cc-status-face', 'cc-status-light', 'cc-status-camera', 'cc-preview-wrap', 'cc-mock-slot', 'btn-cc-start', 'btn-cc-skip-now', 'btn-cc-retry',
        'screen-greeting', 'greet-date', 'greet-title', 'greet-status', 'plan-smile', 'plan-talk',
        'greet-note', 'btn-greet-plant', 'btn-begin', 'greet-fine', 'screen-picker', 'picker-target', 'seed-cards', 'btn-picker-close',
        'screen-summary', 'sum-card', 'sum-card-art', 'sum-date', 'sum-title', 'sum-sun', 'sum-water', 'sum-fert', 'sum-grew', 'sum-wait', 'sum-week', 'btn-sum-journal',
        'btn-sum-done', 'screen-journal', 'journal-body', 'btn-journal-close', 'dev-drawer', 'btn-dev-close', 'dev-next-day', 'dev-day', 'dev-lighting', 'dev-sim',
        'dev-ready', 'dev-fill', 'dev-reset', 'basket-chip', 'basket-count', 'screen-unlock', 'unlock-title', 'unlock-body', 'unlock-art', 'btn-unlock-ok',
        'brand-logo-day', 'brand-logo-night', 'brand-fallback',
        'error-banner', 'error-title', 'error-message', 'btn-error-keyboard', 'btn-error-dismiss']) {
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
    let cameraCheckSession = null;
    let lastCameraCheckSnap = null;
    let cameraDeniedDemo = false;
    let cameraCheckDemoLock = false;
    let pipHome = null;

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
            if (els.needsCard) els.needsCard.hidden = true;
            if (els.stretchCarePanel) els.stretchCarePanel.hidden = true;
            document.body.dataset.stretchCare = '0';
            document.body.dataset.step = '';
        }
        if (name !== 'visit' && name !== 'camera-check' && els.stretchGuide) els.stretchGuide.hidden = true;
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
                pickedSprite: regrow,
                ready: V.isPlotReady(p, today),
                tendedToday: D.plotTendedToday(state, i),
                staked: !!p.staked,
                careAllMet: careAll,
                soilTended: !!(careAll || tendedAllMet),
                tagResting: !!p.tagResting && !careAll && !tendedAllMet,
                tagProgress,
            };
        });
        scene.setPlots(view, instant ? { instant: true } : undefined);
        scene.setDecor(state.decor);
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
        const careHub = step === 'care-hub' || step === 'care-sun' || step === 'care-water' || step === 'care-breathe';
        scene.setTendSelection(plot, { pulse: step === 'pick' || step === 'pick-harvest' || step === 'care-hub' });
        if (step === 'pick' || harvestPick || careHub) scene.setEffects({ plot: plot, sun: 0, water: 0, fert: 0 });
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
        if (screen === 'visit') return;
        journalReturn = screen === 'journal' ? journalReturn : screen;
        renderJournal(tab || 'diary');
        show('journal');
    }
    function closeJournal() { show(journalReturn === 'journal' || journalReturn === 'loading' ? 'idle' : journalReturn); }

    // ------------------------------------------------------------------
    // Camera check (pre-garden setup)
    // ------------------------------------------------------------------
    let cameraCheckGridMounted = false;
    function mountCameraCheckGrid() {
        if (cameraCheckGridMounted || !CCUI || !els.ccPackets) return;
        const cc = ART.cameraCheck || {};
        CCUI.mountPackets(els.ccPackets, ART, artUrl, {
            onSelect(key) {
                if (!cameraCheckSession) return;
                cameraCheckSession.select(key);
                if (source && source.setPhase) source.setPhase(`camera-check-${key}`);
                renderCameraCheckUI(cameraCheckSession.update(0, buildCameraCheckInput()));
            },
            onSkip(key) {
                if (!cameraCheckSession) return;
                cameraCheckSession.skip(key);
                renderCameraCheckUI(cameraCheckSession.update(0, buildCameraCheckInput()));
            },
        });
        if (els.ccBackdrop && cc.backdrop) {
            els.ccBackdrop.src = artUrl(cc.backdrop);
            els.ccBackdrop.onerror = () => { els.ccBackdrop.dataset.fallback = '1'; };
        }
        if (els.ccWindowFrame && cc.windowFrame) {
            els.ccWindowFrame.src = artUrl(cc.windowFrame);
            els.ccWindowFrame.onerror = () => { els.ccWindowFrame.hidden = true; };
        }
        if (els.ccSill && cc.sill) {
            els.ccSill.src = artUrl(cc.sill);
            els.ccSill.onerror = () => { els.ccSill.dataset.fallback = '1'; };
        }
        if (els.ccFaceOutline && cc.faceOutline) {
            els.ccFaceOutline.src = artUrl(cc.faceOutline);
            els.ccFaceOutline.hidden = false;
            els.ccFaceOutline.onerror = () => { els.ccFaceOutline.dataset.fallback = '1'; };
        }
        if (els.ccTiltLeft && cc.tiltLeft) {
            els.ccTiltLeft.src = artUrl(cc.tiltLeft);
            els.ccTiltLeft.hidden = false;
        }
        if (els.ccTiltRight && cc.tiltRight) {
            els.ccTiltRight.src = artUrl(cc.tiltRight);
            els.ccTiltRight.hidden = false;
        }
        cameraCheckGridMounted = true;
    }

    function buildCameraCheckInput() {
        const input = currentInput();
        input.validation = signal.validation;
        input.landmarksStable = signal.landmarksStable;
        const now = performance.now();
        input.breathing = signal.breathing && now - signal.breathing.at < 2500
            ? Object.assign({}, signal.breathing, { fresh: true })
            : null;
        input.stretch = stretchSample();
        input.cameraDenied = cameraDeniedDemo;
        input.noCamera = signal.validation === 'NoCamera';
        if (state.cameraCheckNote && screen === 'camera-check') {
            input.sourceError = state.cameraCheckNote;
        }
        return input;
    }

    function renderCameraCheckUI(snap) {
        if (!snap) return;
        lastCameraCheckSnap = snap;
        if (els.ccNote) {
            const note = state.cameraCheckNote;
            if (note && screen === 'camera-check') {
                els.ccNote.hidden = false;
                els.ccNote.textContent = note;
            } else {
                els.ccNote.hidden = true;
            }
        }
        const active = cameraCheckSession && cameraCheckSession.active;
        if (CCUI) {
            els.breathGuide.hidden = active !== 'breath';
            els.stretchGuide.hidden = active !== 'stretch';
            if (active === 'breath') renderBreathRate();
            if (active === 'stretch') renderStretchHud();
            CCUI.renderStatus(els.ccStatusFace, els.ccStatusLight, els.ccStatusCamera, snap, {
                denied: cameraDeniedDemo || !!snap.cameraDenied || !!snap.noCamera,
            });
            CCUI.renderPackets(els.ccPackets, snap, active, ART, artUrl, { denied: cameraDeniedDemo });
            CCUI.renderPrompt(els.ccPrompt, snap, active, {
                denied: cameraDeniedDemo || !!snap.cameraDenied || !!snap.noCamera,
            });
            if (els.btnCcRetry) {
                els.btnCcRetry.hidden = !(cameraDeniedDemo || snap.cameraDenied || snap.noCamera);
            }
        }
        if (els.ccFaceOutline) {
            els.ccFaceOutline.classList.toggle('found', !!snap.faceFound);
        }
        const stretch = snap.stretchSnap || {};
        const tiltOn = active === 'stretch' && !stretch.complete;
        if (els.ccTiltLeft) {
            els.ccTiltLeft.classList.toggle('on', tiltOn && stretch.activeSide === 'left');
        }
        if (els.ccTiltRight) {
            els.ccTiltRight.classList.toggle('on', tiltOn && stretch.activeSide === 'right');
        }
    }

    function placePipForCameraCheck() {
        if (!els.ccPreviewWrap || !els.pip) return;
        if (!pipHome) pipHome = els.pip.parentElement;
        els.ccPreviewWrap.insertBefore(els.pip, els.ccPreviewWrap.firstChild);
        els.pip.hidden = false;
        if (els.ccMockSlot) els.ccMockSlot.hidden = !config.mock;
    }

    function restorePipHome() {
        if (pipHome && els.pip && els.pip.parentElement !== pipHome) {
            pipHome.appendChild(els.pip);
        }
        if (config.mock) els.pip.hidden = true;
    }

    function enqueueCamera(fn) {
        const run = cameraGate.then(fn, fn);
        cameraGate = run.catch(() => {});
        return run;
    }

    async function startCamera() {
        return enqueueCamera(async () => {
            if (!(await ensureSource())) throw new Error('Camera source unavailable');
            if (sourceReady) return;
            await source.start();
            sourceReady = true;
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

    async function openCameraCheck() {
        mountCameraCheckGrid();
        cameraCheckDemoLock = false;
        cameraCheckSession = CC.createCameraCheckSession({
            smileOn: L.DEFAULTS.smileOn,
            Stretch: window.SmileStretch,
        });
        journalReturn = screen === 'journal' ? journalReturn : screen;
        placePipForCameraCheck();
        show('camera-check');
        try {
            await startCamera();
            state.cameraCheckNote = null;
        } catch (e) {
            if (!source) {
                cameraDeniedDemo = !config.mock;
            } else {
                CC.markCameraCheckRequired(state, `Camera could not start: ${e && e.message || e}`);
                save();
            }
        }
        if (source && source.setPhase) source.setPhase('camera-check-smile');
        renderCameraCheckUI(cameraCheckSession.update(0, buildCameraCheckInput()));
    }

    async function retryCameraCheck() {
        if (!cameraCheckSession) return;
        cameraDeniedDemo = false;
        cameraCheckDemoLock = false;
        signal.validation = 'Ok';
        signal.faceGoneAt = 0;
        try {
            await stopCamera();
            await startCamera();
            state.cameraCheckNote = null;
            if (source.setPhase && cameraCheckSession.active) {
                source.setPhase(`camera-check-${cameraCheckSession.active}`);
            }
            renderCameraCheckUI(cameraCheckSession.update(0, buildCameraCheckInput()));
        } catch (e) {
            if (!source) {
                cameraDeniedDemo = !config.mock;
            } else {
                CC.markCameraCheckRequired(state, `Camera could not start: ${e && e.message || e}`);
                save();
            }
            renderCameraCheckUI(cameraCheckSession.update(0, buildCameraCheckInput()));
        }
    }

    async function finishCameraCheckFlow() {
        CC.finishCameraSetup(state);
        save();
        cameraCheckSession = null;
        lastCameraCheckSnap = null;
        cameraDeniedDemo = false;
        els.breathGuide.hidden = true;
        els.stretchGuide.hidden = true;
        restorePipHome();
        if (source && source.setPhase) source.setPhase('idle');
        // Keep the warm-up session running into the visit. Stopping here and
        // calling start() again was racing the SDK/OS camera release and
        // threw "Camera could not start". beginVisit is idempotent via
        // sourceReady / startCamera().
        show(state.version >= 5 ? 'idle' : 'greeting');
    }

    function updateCameraCheckScreen(dt) {
        if (!cameraCheckSession) return;
        if (cameraCheckDemoLock) {
            renderCameraCheckUI(lastCameraCheckSnap);
            return;
        }
        const snap = cameraCheckSession.update(dt, buildCameraCheckInput());
        if (cameraCheckSession.active && source && source.setPhase) {
            source.setPhase(`camera-check-${cameraCheckSession.active}`);
        }
        renderCameraCheckUI(snap);
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

    function afterWellnessOrResume() {
        if (!CC) {
            console.error('[smile-garden] SmileCameraCheck module missing');
            show(state.version >= 5 ? 'idle' : 'greeting');
            return;
        }
        if (CC.shouldShowCameraCheck(state)) void openCameraCheck();
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
                    fertUsed: session.step === 'care-breathe',
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
        els.meterSunWrap.classList.toggle('active', step === 'smile' || step === 'care-sun');
        els.meterWaterWrap.classList.toggle('active', step === 'talk' || step === 'care-water');
        els.meterFertWrap.classList.toggle('active', step === 'breathe' || step === 'breathe-offer' || step === 'care-breathe');
        if (els.meterStakeWrap) {
            els.meterStakeWrap.classList.toggle('active', step === 'stretch' || step === 'stretch-offer');
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
            else if (gardenClock.suggestBed()) msg = 'Golden hour. You can keep tending, or head to bed whenever you like.';
            else if (!tendable.length && !ready) msg = 'Every plant is tended for today. Rest, harvest, or go to bed when ready.';
        }
        els.idleText.textContent = msg;
        els.btnVisit.hidden = state.version >= 6 || document.body.dataset.captureTags === '1';
        if (!els.btnVisit.hidden) {
            els.btnVisit.textContent = tendable.length ? 'Tend your plants' : (ready ? 'Tend (harvest)' : 'Tend your plants');
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
            const sun = document.createElement('div');
            sun.className = 'seed-sun';
            sun.textContent = `☀ ${p.sunHoursLabel} of sun a day`;
            const meta = document.createElement('div');
            meta.className = 'seed-meta';
            meta.textContent = `Needs ${p.cost} sun-hours per stage · 4 stages to grow`;
            const blurb = document.createElement('p');
            blurb.className = 'seed-blurb';
            blurb.textContent = info.tips[0] || p.blurb;
            const src = document.createElement('div');
            src.className = 'seed-src';
            src.textContent = 'Sun need: ' + p.sourceLabel.split(':')[0];
            card.append(img, h3, sun, meta, blurb, src);
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
        'care-hub': { title: 'Today\'s needs', text: 'Tap a need icon in any order. Dots fill as you go — you can pause and come back the same day.' },
        'care-sun': { title: 'Sun dot', text: 'Smile while the dot fills (~10 s per dot).' },
        'care-water': { title: 'Water dot', text: 'Talk to your plant while the dot fills (~10 s per dot).' },
        'care-breathe': { title: 'Fertilizer dot', text: 'Follow the breath guide (~15 s per dot). Gentle nose breathing only.' },
    };
    const NEED_LABELS = { sun: 'Sun', water: 'Water', fertilizer: 'Fertilizer', stake: 'Stake' };
    const NEED_EMOJI = { sun: '☀', water: '💧', fertilizer: '🍃', stake: '🌻' };

    function bindNeedsArt(img, src, fallbackEl) {
        if (!img) return;
        img.onload = () => { img.hidden = false; if (fallbackEl) fallbackEl.hidden = true; };
        img.onerror = () => { img.hidden = true; if (fallbackEl) fallbackEl.hidden = false; };
        img.src = artUrl(src);
    }

    function renderNeedsCard() {
        if (!session || !els.needsCard || !C) return;
        const plot = session.selectedPlot;
        const careSteps = ['care-hub', 'care-sun', 'care-water', 'care-breathe', 'stretch-offer', 'stretch'];
        const show = careSteps.includes(session.step);
        els.needsCard.hidden = !show || plot == null;
        if (!show || plot == null) return;
        const pl = state.plots[plot];
        if (!pl) return;
        const needs = L.plantNeeds(pl.plantId);
        const prog = session.careProgressFor(plot);
        const kind = L.plantById(pl.plantId);
        els.needsPlantName.textContent = `${kind.name} · bed ${plot + 1}`;
        bindNeedsArt(els.needsCardBg, ART.needsCardSrc(lighting), els.needsCardFallback);
        const cardCareLight = 'midday';
        const allMet = C.allNeedsMet(prog, needs, pl.staked);
        const showResting = !!pl.tagResting && !allMet;
        if (els.needsBloomStamp) {
            bindNeedsArt(els.needsBloomStamp, ART.needs.bloomStamp, null);
            els.needsBloomStamp.hidden = !allMet;
        }
        if (els.needsRestingStamp) {
            bindNeedsArt(els.needsRestingStamp, ART.needs.restingLeaf, els.needsRestingFallback);
            els.needsRestingStamp.hidden = !showResting;
            if (els.needsRestingFallback) els.needsRestingFallback.hidden = !showResting || !els.needsRestingStamp.hidden;
        }
        const rowsEl = els.needsRows;
        if (rowsEl) {
            rowsEl.textContent = '';
            const half = (n) => n / 2;
            const rowsOriginY = half(ART.needs.cardRows[0].row[1]);
            for (const rowSpec of ART.needs.cardRows) {
                const key = rowSpec.key;
                const req = C.dotsForNeed(needs, key);
                if (req <= 0) continue;
                const done = C.fillFraction(prog, needs, key, pl.staked) >= 1;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'need-row' + (done ? ' need-row--done' : '');
                const [rx0, ry0, rx1, ry1] = rowSpec.row;
                const rowAbsTop = half(ry0);
                const rowTop = rowAbsTop - rowsOriginY;
                btn.style.top = `${rowTop}px`;
                btn.style.height = `${half(ry1 - ry0)}px`;
                const [ix0, iy0, ix1, iy1] = rowSpec.icon;
                const icon = document.createElement('img');
                icon.className = 'need-row-icon';
                icon.alt = '';
                icon.src = artUrl(ART.needsIconSrc(key, cardCareLight));
                icon.style.left = `${half(ix0)}px`;
                icon.style.top = `${half(iy0) - rowAbsTop}px`;
                icon.style.width = `${half(ix1 - ix0)}px`;
                icon.style.height = `${half(iy1 - iy0)}px`;
                icon.onerror = () => { icon.replaceWith(document.createTextNode(NEED_EMOJI[key] || '•')); };
                const dotsWrap = document.createElement('span');
                dotsWrap.className = 'need-row-dots';
                const got = key === 'stake'
                    ? (C.stakeNeedMet(prog, pl.staked) ? 1 : 0)
                    : Math.min(req, Math.floor((Number(prog[key]) || 0) + 1e-6));
                const dotSz = half(rowSpec.dotSize);
                rowSpec.dots.slice(0, req).forEach((cent, d) => {
                    const dot = document.createElement('img');
                    dot.className = 'need-row-dot';
                    dot.alt = '';
                    dot.src = artUrl(ART.needsDotSrc(d < got, cardCareLight));
                    dot.style.width = `${dotSz}px`;
                    dot.style.height = `${dotSz}px`;
                    dot.style.left = `${half(cent[0]) - dotSz / 2}px`;
                    dot.style.top = `${half(cent[1]) - rowAbsTop - dotSz / 2}px`;
                    dot.style.position = 'absolute';
                    dot.onerror = () => {
                        const span = document.createElement('span');
                        span.className = `need-dot-fallback ${key}${d < got ? ' on' : ''}`;
                        dotsWrap.appendChild(span);
                        return;
                    };
                    dotsWrap.appendChild(dot);
                });
                if (done) {
                    const [sx0, sy0, sx1, sy1] = rowSpec.status;
                    const check = document.createElement('img');
                    check.className = 'need-row-check';
                    check.alt = '';
                    check.src = artUrl(ART.needsDoneSrc(cardCareLight));
                    check.style.left = `${half(sx0)}px`;
                    check.style.top = `${half(sy0) - rowAbsTop}px`;
                    check.style.width = `${half(sx1 - sx0)}px`;
                    check.style.height = `${half(sy1 - sy0)}px`;
                    btn.append(check);
                }
                btn.append(icon, dotsWrap);
                btn.addEventListener('click', () => {
                    if (key === 'stake' && needs.stake) onStep(session.launchStretchCare('care-hub'));
                    else onStep(session.startCare(key));
                });
                rowsEl.appendChild(btn);
            }
        }
        plotsForScene();
    }
    const TALK_PROMPTS = ['What made you smile today?', 'Tell the tomatoes about your morning.', 'What are you looking forward to?',
        'Describe the weather where you are.', 'Say hello to each bed.', 'What would you cook with this harvest?'];

    async function ensureSource() {
        if (source) return true;
        try {
            if (config.mock || config.keyboard) {
                source = window.SmileSources.createMockSource({ auto: !config.keyboard });
            } else {
                source = window.SmileSources.createSdkSource({ apiKey: config.apiKey, enableTelemetry: config.enableTelemetry, calmCheck: false });
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
        source.on('error', (e) => showError('SmartSpectra error', `${e.name}: ${e.message || ''}`, !config.mock));
        source.on('stream', (stream) => { els.preview.srcObject = stream || null; els.pip.hidden = !stream; });
        source.on('landmarks', (lm) => {
            if (!lm || !lm.points) return;
            signal.landmarks = lm.points;
            signal.landmarksAt = performance.now();
            signal.landmarksStable = !!lm.stable;
        });
        if (source.setNight) source.setNight(lighting === 'night');
        return true;
    }

    function newVisitSession() {
        return new V.VisitSession({
            fast: config.fast,
            pace: state.settings.pace,
            breaths: state.settings.breaths,
            plots: state.plots,
            today: gardenTodayKey(),
            gardenDay: state.dayNumber,
            dailyTends: state.dailyTends,
            tendBeds: V.tendableForState(state, clock.now()),
        });
    }

    async function beginVisitAtPlot(plotIndex) {
        if (!(await ensureSource())) return;
        session = newVisitSession();
        refreshBasketChip(0);
        els.basketChip.hidden = session.harvestQueue.length === 0;
        trace.clear();
        signal.breathing = null;
        talkPromptIdx = Math.floor(Math.random() * TALK_PROMPTS.length);
        const step = session.begin();
        if (session.step === 'care-hub' || session.step === 'pick') {
            session.setSelectedPlot(plotIndex);
        } else if (session.step === 'pick-harvest') {
            session.setSelectedPlot(plotIndex);
        }
        show('visit');
        onStep(session.step);
        try {
            await startCamera();
        } catch (e) {
            showError('Camera could not start', String(e && e.message || e), !config.mock);
        }
    }

    async function beginVisit() {
        if (!(await ensureSource())) return;
        session = newVisitSession();
        refreshBasketChip(0);
        els.basketChip.hidden = session.harvestQueue.length === 0;
        trace.clear();
        signal.breathing = null;
        talkPromptIdx = Math.floor(Math.random() * TALK_PROMPTS.length);
        show('visit');
        session.begin();
        onStep(session.step);
        try {
            await startCamera();
        } catch (e) {
            showError('Camera could not start', String(e && e.message || e), !config.mock);
            CC.markCameraCheckRequired(state, `Camera could not start: ${e && e.message || e}`);
            save();
        }
    }

    let talkPromptIdx = 0;
    let lastStep = null;
    function onStep(step) {
        lastStep = step;
        document.body.dataset.step = step;
        if (source && source.setPhase) source.setPhase(step);
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
        const careMode = step === 'care-hub' || step === 'care-sun' || step === 'care-water' || step === 'care-breathe';
        els.needsCard && (els.needsCard.hidden = !careMode && step !== 'stretch-offer' && step !== 'stretch');
        if (careMode || step === 'stretch-offer' || step === 'stretch') renderNeedsCard();
        const copy = STEP_COPY[step] || STEP_COPY.smile;
        const who = selectedPlantLabel();
        els.stepTitle.textContent = step === 'pick' ? copy.title : (who ? `${copy.title} · ${who}` : copy.title);
        els.stepText.textContent = copy.text;
        els.breathGuide.hidden = step !== 'breathe' && step !== 'care-breathe';
        els.stretchGuide.hidden = step !== 'stretch';
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
        } else if (step === 'care-sun' || step === 'care-water' || step === 'care-breathe') {
            const back = mkBtn('Back to needs', 'btn btn-ghost', () => { onStep(session.go('care-hub')); });
            back.id = 'btn-skip';
            if (step === 'care-breathe') {
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
        const ccStretch = screen === 'camera-check' && cameraCheckSession && cameraCheckSession.active === 'stretch';
        if (!stretchHudDemoLock && !ccStretch && (!session || session.step !== 'stretch')) return;
        const snap = stretchHudDemoLock && stretchDemoSnap
            ? stretchDemoSnap
            : ccStretch && lastCameraCheckSnap
                ? (lastCameraCheckSnap.stretchSnap || {})
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

    function updateVisit(dt, t) {
        const input = currentInput();
        if (session && session.step === 'stretch') input.stretch = stretchSample();
        const events = session.update(dt, input);
        trace.push({ t, happiness: input.happiness, faceVisible: input.faceVisible, talking: input.talking, smiling: session.smiling });
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
            }
        }
        if (!session) return;
        const step = session.step;
        document.body.dataset.smiling = session.smiling ? '1' : '0';
        document.body.dataset.talking = session.talking ? '1' : '0';

        // ring + live text
        const dur = session.stepDuration();
        const rem = session.stepRemaining();
        const frac = dur > 0 ? 1 - rem / dur : 0;
        els.ringFg.style.strokeDashoffset = String(276.46 * frac);
        const careStep = step === 'care-sun' || step === 'care-water' || step === 'care-breathe';
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
            const all = pl && C.allNeedsMet(session.careProgressFor(session.selectedPlot), L.plantNeeds(pl.plantId), pl.staked);
            els.stepLive.textContent = all ? 'All needs met — bloom stamp on the tag. Finish when you like.' : 'Pick any need icon. Switch beds with arrow keys.';
        } else if (step === 'care-sun') {
            els.stepLive.textContent = session.poorReading ? 'Paused: waiting to see your face'
                : session.smiling ? '☀ Smiling…' : 'Smile gently to fill the sun dot';
        } else if (step === 'care-water') {
            els.stepLive.textContent = session.poorReading ? 'Paused: waiting to see your face'
                : session.talking ? '💧 Talking…' : 'Talk to your plant to fill the water dot';
        } else if (step === 'care-breathe') {
            if (session.pacer) {
                const b = session.pacer.at(session.breathT);
                els.breathGuide.hidden = false;
                const scale = 0.45 + 0.55 * b.size;
                els.breathOrb.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
                els.breathWord.textContent = b.phase === 'in' ? 'Breathe in' : 'And slowly out';
                renderBreathCount(session.breathsDone);
                renderBreathRate();
            }
            els.stepLive.textContent = '🍃 Guided breath for fertilizer dots';
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
        const smileAmt = (step === 'smile' || step === 'care-sun' || step === 'harvest-hold') && session.smiling
            ? 0.45 + 0.55 * L.clamp01((session.h - on) / (1 - on)) : 0;
        const stretchSnap = session.stretchSnap || {};
        const stakeAmt = step === 'stretch'
            ? Math.max(stretchSnap.leftProgress || 0, stretchSnap.rightProgress || 0)
            : 0;
        scene.setEffects({
            plot: session.selectedPlot,
            sun: smileAmt,
            water: (step === 'talk' || step === 'care-water') && session.talking ? 1 : 0,
            fert: (step === 'breathe' || step === 'care-breathe') ? 0.9 : 0,
            stake: stakeAmt,
        });
        renderNeedsCard();
        renderMeters();
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
        const active = step === 'smile' || step === 'talk' || step === 'harvest-hold' || step === 'care-sun' || step === 'care-water';
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
        const beforeDecor = V.decorUnlocked(state);
        const out = V.applyVisit(state, result, clock.now());
        const harvested = V.applySessionHarvests(state, result.harvestPlots, clock.now());
        const unlocks = V.newUnlocksAfterHarvest(state, beforeSeeds, beforeDecor);
        out.harvested = harvested;
        out.seedUnlocks = unlocks.seeds;
        out.decorUnlocks = unlocks.decor;
        lastResult = Object.assign({}, out);
        save();
        await stopCamera();
        session = null;
        scene.setEffects({ sun: 0, water: 0, fert: 0 });
        plotsForScene();
        renderHud();
        show('idle');
        if (out.seedUnlocks.length || out.decorUnlocks.length) showUnlockReveal(out.seedUnlocks, out.decorUnlocks);
        else if (out.tended && out.tended.length) toast('Tending saved for tonight.');
    }

    async function finishVisit() {
        if (state.version >= 5) {
            await endTendSession();
            return;
        }
        const result = session.result();
        const before = state.plots.map((p) => (p ? { plantId: p.plantId, stage: p.stage } : null));
        const beforeSeeds = V.unlockedPlants(state);
        const beforeDecor = V.decorUnlocked(state);
        const out = V.applyVisit(state, result, clock.now());
        const harvested = V.applySessionHarvests(state, result.harvestPlots, clock.now());
        const unlocks = V.newUnlocksAfterHarvest(state, beforeSeeds, beforeDecor);
        out.harvested = harvested;
        out.seedUnlocks = unlocks.seeds;
        out.decorUnlocks = unlocks.decor;
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
        if (out.seedUnlocks.length || out.decorUnlocks.length) showUnlockReveal(out.seedUnlocks, out.decorUnlocks);
    }

    function mountMorningCard(title, body) {
        const host = els.sumCardArt;
        if (!host) return;
        host.hidden = false;
        host.textContent = '';
        const cardSrc = (ART.bedtime && ART.bedtime.morningCard) || (ART.ui && ART.ui.morningCard);
        const img = new Image();
        img.alt = '';
        img.className = 'morning-card-img';
        img.src = cardSrc || ART.card;
        const copy = document.createElement('div');
        copy.className = 'morning-card-copy';
        const h = document.createElement('h1');
        h.textContent = title;
        const p = document.createElement('p');
        p.className = 'lead';
        p.textContent = body;
        copy.append(h, p);
        img.onerror = () => { els.sumTitle.hidden = false; els.sumDate.hidden = false; };
        img.onload = () => { els.sumTitle.hidden = true; els.sumDate.hidden = true; };
        host.append(img, copy);
        if (cardSrc) {
            els.sumCard.classList.add('summary-painted');
        }
    }

    function renderMorningSummary(night) {
        const out = night || { grew: [], waiting: [], tended: [] };
        const title = out.grew.length ? 'Your garden grew overnight' : 'A quiet night in the garden';
        const body = `Day ${state.dayNumber} · ${D.SEASON_LABELS[state.season]} · ${D.formatGardenTime(state.gardenMinutes)}`;
        els.sumDate.textContent = body;
        els.sumTitle.textContent = title;
        els.sumTitle.hidden = false;
        els.sumDate.hidden = false;
        if (els.sumCardArt) {
            els.sumCardArt.hidden = true;
            els.sumCardArt.textContent = '';
            els.sumCard.classList.remove('summary-painted');
        }
        if (state.version >= 5) mountMorningCard(title, body);
        els.sumSun.textContent = '—';
        els.sumWater.textContent = '—';
        els.sumFert.textContent = '—';
        els.sumGrew.textContent = '';
        for (const g of out.grew) {
            const li = document.createElement('li');
            li.textContent = g.mature ? `${g.name} in bed ${g.plot + 1} is fully grown.` : `${g.name} in bed ${g.plot + 1} grew to ${V.STAGES[g.to].label}.`;
            els.sumGrew.appendChild(li);
        }
        const readyN = V.readyPlotIndices(state.plots, gardenTodayKey()).length;
        if (readyN) {
            const li = document.createElement('li');
            li.textContent = `${readyN} crop${readyN === 1 ? '' : 's'} ready to harvest today.`;
            els.sumGrew.appendChild(li);
        }
        if (!out.grew.length && !readyN) {
            const li = document.createElement('li');
            li.textContent = 'Plants are resting — tend them today and they will grow after bed.';
            els.sumGrew.appendChild(li);
        }
        els.sumWait.textContent = '';
        for (const w of (out.waiting || []).slice(0, 4)) {
            const li = document.createElement('li');
            li.textContent = V.waitingText(w);
            els.sumWait.appendChild(li);
        }
        els.sumWeek.textContent = `Season day ${state.seasonDay} of ${D.DAYS_PER_SEASON}. Growth happens when you go to bed, not on a timer.`;
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

    function showUnlockReveal(seeds, decor) {
        const parts = [];
        if (seeds.length) parts.push('New seeds: ' + seeds.map((id) => L.plantById(id).name).join(', '));
        if (decor.length) {
            const labels = decor.map((id) => (V.DECOR_UNLOCKS.find((d) => d.id === id) || { label: id }).label);
            parts.push('New decorations: ' + labels.join(', '));
        }
        const title = seeds.length ? 'Fresh seeds for your journal' : 'Garden decorations';
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

    function renderSummary(out) {
        const now = clock.now();
        els.sumDate.textContent = `${fmtDate(now)} · ${V.LIGHTING_LABELS[lighting]}`;
        els.sumTitle.textContent = out.grew.length ? (out.grew.some((g) => g.mature) ? 'Something grew all the way!' : 'Your garden grew today') : 'A lovely, quiet visit';
        els.sumSun.textContent = `${out.sunHours.toFixed(1)} h total`;
        els.sumWater.textContent = out.tended && out.tended.length
            ? out.tended.map((t) => `bed ${t.plot + 1}: ${Math.round(t.water * 100)}%`).join(' · ')
            : `${Math.round(out.water * 100)}%`;
        els.sumFert.textContent = out.tended && out.tended.some((t) => t.fertilizer > 0)
            ? out.tended.filter((t) => t.fertilizer > 0).map((t) => `bed ${t.plot + 1}: ${Math.round(t.fertilizer * 100)}%`).join(' · ')
            : (out.fertilizer > 0 ? `${Math.round(out.fertilizer * 100)}%` : 'skipped');
        els.sumGrew.textContent = '';
        if (out.tended && out.tended.length) {
            const li = document.createElement('li');
            li.textContent = 'Today you tended: ' + out.tended.map((t) => `${t.name} (${t.sunHours.toFixed(1)} h sun, ${Math.round(t.water * 100)}% water` +
                (t.fertilizer > 0 ? `, ${Math.round(t.fertilizer * 100)}% fertilizer` : '') + ')').join('; ') + '.';
            els.sumGrew.appendChild(li);
        }
        for (const g of out.grew) {
            const li = document.createElement('li');
            li.textContent = g.mature ? `${g.name} in bed ${g.plot + 1} is fully grown.` : `${g.name} in bed ${g.plot + 1} grew: ${V.STAGES[g.from].label} → ${V.STAGES[g.to].label}.`;
            els.sumGrew.appendChild(li);
        }
        if (!out.grew.length && !V.plantedCount(state)) {
            const li = document.createElement('li');
            li.textContent = 'Plant a seed next time and today\'s kind of sunlight will make it sprout.';
            els.sumGrew.appendChild(li);
        }
        els.sumWait.textContent = '';
        for (const w of out.waiting.slice(0, 4)) {
            const li = document.createElement('li');
            li.textContent = V.waitingText(w);
            els.sumWait.appendChild(li);
        }
        for (const h of out.harvested || []) {
            const li = document.createElement('li');
            li.textContent = `Harvested ${h.yield}× ${h.name} from bed ${h.plot + 1}` + (h.mode === 'pull' ? ' (bed cleared; 1 seed returned).' : ' (will regrow soon).');
            els.sumGrew.appendChild(li);
        }
        for (const id of out.seedUnlocks || out.unlocked || []) {
            const li = document.createElement('li');
            li.textContent = `New seeds unlocked: ${L.plantById(id).name}!`;
            els.sumGrew.appendChild(li);
        }
        for (const id of out.decorUnlocks || []) {
            const d = V.DECOR_UNLOCKS.find((x) => x.id === id);
            const li = document.createElement('li');
            li.textContent = `Decoration unlocked: ${d ? d.label : id} — place it from the Decorate journal tab.`;
            els.sumGrew.appendChild(li);
        }
        els.sumWeek.textContent = `${out.weekly} ${out.weekly === 1 ? 'visit' : 'visits'} this week. ` +
            (out.fertilizer > 0 ? 'Thanks for breathing with the garden.' : 'Breathing is always optional.') +
            ' Plants grow at most one stage a day.';
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
        } else if (tab === 'settings') {
            const intro = document.createElement('p');
            intro.textContent = 'Camera and permissions. Re-run setup if you changed cameras or lighting.';
            body.appendChild(intro);
            const row = document.createElement('div');
            row.className = 'j-entry';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-primary';
            btn.textContent = 'Check camera';
            btn.addEventListener('click', () => {
                closeJournal();
                state.cameraCheckNote = null;
                openCameraCheck();
            });
            row.appendChild(btn);
            body.appendChild(row);
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
                line.textContent = `${status} · planted ${days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago'} · needs ${kind.sunHoursLabel} of sun a day`;
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
        } else if (tab === 'decorate') {
            V.syncDecorUnlocks(state);
            const unlocked = state.decor.unlocked || [];
            if (!unlocked.length) {
                const p = document.createElement('p');
                p.className = 'j-empty';
                p.textContent = 'Decorations unlock as you harvest. Lantern unlocks after 2 total harvests.';
                body.appendChild(p);
                return;
            }
            const intro = document.createElement('p');
            intro.className = 'note';
            intro.textContent = 'Pick a decoration, then tap a spot in the list to place or swap. Remove with Clear.';
            body.appendChild(intro);
            const picks = document.createElement('div');
            picks.className = 'decor-picks';
            let activeDecor = unlocked[0];
            for (const id of unlocked) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'btn btn-soft btn-small decor-pick';
                const def = V.DECOR_UNLOCKS.find((d) => d.id === id);
                b.textContent = def ? def.label : id;
                b.addEventListener('click', () => {
                    activeDecor = id;
                    picks.querySelectorAll('.decor-pick').forEach((x) => x.classList.toggle('on', x === b));
                });
                if (id === activeDecor) b.classList.add('on');
                picks.appendChild(b);
            }
            body.appendChild(picks);
            const spots = document.createElement('div');
            spots.className = 'decor-spots';
            for (const spot of ART.decorSpots) {
                const row = document.createElement('div');
                row.className = 'decor-spot';
                const cur = state.decor.placements[spot.id];
                const label = document.createElement('b');
                label.textContent = spot.label;
                const now = document.createElement('span');
                now.className = 'note';
                now.textContent = cur ? (V.DECOR_UNLOCKS.find((d) => d.id === cur) || { label: cur }).label : 'Empty';
                const place = mkBtn('Place here', 'btn btn-soft btn-small', () => {
                    const r = V.placeDecor(state, spot.id, activeDecor);
                    if (r.ok) { save(); plotsForScene({ instant: true }); renderJournal('decorate'); toast('Decoration placed.'); }
                });
                const clear = mkBtn('Clear', 'btn btn-ghost btn-small', () => {
                    V.placeDecor(state, spot.id, null);
                    save();
                    plotsForScene({ instant: true });
                    renderJournal('decorate');
                });
                row.append(label, now, place, clear);
                spots.appendChild(row);
            }
            body.appendChild(spots);
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
                const sun = document.createElement('div'); sun.className = 'seed-sun'; sun.textContent = `☀ Sun need: ${p.sunHoursLabel} a day · in the game ${p.cost} sun-hours per stage`;
                const blurb = document.createElement('div'); blurb.className = 'note'; blurb.textContent = p.blurb;
                const ul = document.createElement('ul');
                for (const tip of info.tips) { const li = document.createElement('li'); li.textContent = tip; ul.appendChild(li); }
                const src = document.createElement('div'); src.className = 'src';
                const sb = document.createElement('b'); sb.textContent = 'Source: ';
                src.append(sb, document.createTextNode(`${p.sourceLabel}. ${p.source}`));
                txt.append(h, sun, blurb, ul, src);
                card.append(img, txt);
                grid.appendChild(card);
            }
            body.appendChild(grid);
            const fine = document.createElement('p');
            fine.className = 'fineprint';
            fine.textContent = 'Sun needs come from the university extension sources shown. The other tips are general gardening advice; your local extension service knows your climate best. Water and fertilizer amounts in the game are simplified.';
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
    function showError(title, msg, offerKeyboard) {
        els.errorTitle.textContent = title;
        els.errorMessage.textContent = msg;
        els.btnErrorKeyboard.hidden = !offerKeyboard;
        els.errorBanner.hidden = false;
    }

    // plot hover tips + clicks
    els.garden.addEventListener('mousemove', (e) => {
        const i = scene.plotAt(e.clientX, e.clientY);
        scene.setHover(i);
        if (screen === 'visit') {
            const pickStep = session && (session.step === 'pick' || session.step === 'pick-harvest' || session.step === 'care-hub');
            const canSelect = pickStep && i !== null && session.selectablePlots().includes(i);
            els.garden.style.cursor = canSelect ? 'pointer' : '';
            if (canSelect && state.plots[i]) {
                const kind = L.plantById(state.plots[i].plantId);
                els.plotTip.textContent = '';
                const b = document.createElement('b'); b.textContent = kind.name;
                const action = session.step === 'pick-harvest' ? 'pick' : 'tend';
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
        els.garden.style.cursor = (!p && V.emptyPlots(state).length) ? 'pointer' : '';
        if (!p) {
            els.plotTip.textContent = screen === 'picker' ? `Plant in bed ${i + 1}` : `Bed ${i + 1}: empty. Click to plant`;
        } else {
            const kind = L.plantById(p.plantId);
            els.plotTip.textContent = '';
            const b = document.createElement('b'); b.textContent = kind.name;
            let extra = V.isPlotReady(p, clock.today()) ? ' · ready to pick'
                : V.isPlotRegrowing(p, clock.today()) ? ' · regrowing'
                    : (p.stage < 5 ? ` · ${p.sunBank.toFixed(1)}/${kind.cost} sun-hours saved` : ' · fully grown');
            els.plotTip.append(b, document.createTextNode(` · ${V.STAGES[p.stage].label}${extra}`));
        }
        const c = scene.plotClient(i);
        els.plotTip.style.left = `${c.x}px`;
        els.plotTip.style.top = `${c.y - 70 * c.s}px`;
        els.plotTip.hidden = false;
    });
    els.garden.addEventListener('mouseleave', () => { els.plotTip.hidden = true; scene.setHover(null); });
    els.garden.addEventListener('click', (e) => {
        const i = scene.plotAt(e.clientX, e.clientY);
        if (i === null) return;
        if (screen === 'visit' && session && (session.step === 'pick' || session.step === 'pick-harvest' || session.step === 'care-hub')) {
            if (session.setSelectedPlot(i)) {
                syncTendRing();
                renderNeedsCard();
                if (session.step === 'care-hub') onStep('care-hub');
                else if (session.step === 'pick') {
                    els.stepLive.textContent = `${selectedPlantLabel()} · plant ${session.plantRound + 1} of ${session.plantedBeds.length}. Enter or Space to tend.`;
                } else if (session.step === 'pick-harvest') {
                    els.stepLive.textContent = `${selectedPlantLabel()} · ready to pick. Enter or Space to harvest.`;
                }
            }
            return;
        }
        if (state.plots[i]) {
            if (state.version >= 6 && screen === 'idle') {
                beginVisitAtPlot(i);
            }
            return;
        }
        if (screen === 'picker') { pickerTarget = i; scene.setHighlight(i); els.pickerTarget.textContent = `for bed ${i + 1}`; }
        else if (screen === 'idle' || screen === 'greeting') openPicker(i);
    });

    // ------------------------------------------------------------------
    // Buttons + keys
    // ------------------------------------------------------------------
    els.chkAdult.addEventListener('change', () => { els.btnWellnessOk.disabled = !els.chkAdult.checked; });
    els.btnWellnessOk.addEventListener('click', ackWellness);
    function ackWellness() { state.wellnessAck = true; save(); afterWellnessOrResume(); }
    if (els.btnCcStart) els.btnCcStart.addEventListener('click', finishCameraCheckFlow);
    if (els.btnCcSkipNow) els.btnCcSkipNow.addEventListener('click', finishCameraCheckFlow);
    if (els.btnCcRetry) els.btnCcRetry.addEventListener('click', () => { void retryCameraCheck(); });
    els.btnGreetPlant.addEventListener('click', () => openPicker());
    els.btnBegin.addEventListener('click', beginVisit);
    els.btnPickerClose.addEventListener('click', closePicker);
    els.btnSumDone.addEventListener('click', () => show('idle'));
    els.btnSumJournal.addEventListener('click', () => openJournal('diary'));
    els.btnJournal.addEventListener('click', () => (screen === 'journal' ? closeJournal() : openJournal('diary')));
    els.btnJournalClose.addEventListener('click', closeJournal);
    els.screenJournal.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => renderJournal(b.dataset.tab)));
    els.btnVisit.addEventListener('click', () => (state.version >= 5 ? beginVisit() : show('greeting')));
    if (els.btnNeedsDone) els.btnNeedsDone.addEventListener('click', () => { if (session) onStep(session.finishCareHub()); });
    els.btnBed.addEventListener('click', () => goToBed());
    els.btnPlantIdle.addEventListener('click', () => openPicker());
    els.btnDev.addEventListener('click', () => toggleDev());
    els.btnDevClose.addEventListener('click', () => toggleDev(false));
    els.btnErrorDismiss.addEventListener('click', () => { els.errorBanner.hidden = true; });
    els.btnErrorKeyboard.addEventListener('click', () => {
        els.errorBanner.hidden = true;
        if (source) { try { source.destroy(); } catch { /* ignore */ } source = null; }
        config.keyboard = true;
        els.mockBadge.hidden = false;
        els.mockMode.textContent = 'Keyboard player';
        els.btnBegin.disabled = false;
        toast('Keyboard mode: hold S to smile, T to talk.');
        if (session) {
            startCamera().then(() => {
                if (source && source.setPhase) source.setPhase(session.step);
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
        if (k === 'd') { toggleDev(); return; }
        if (k === 'n' && devOpen) { nextDay(); return; }
        if (k === 'escape') { if (screen === 'journal') closeJournal(); else if (screen === 'picker') closePicker(); toggleDev(false); return; }
        if (screen === 'visit' && session) {
            if (k === 'enter' || k === ' ') {
                e.preventDefault();
                if (session.step === 'pick-harvest') { onStep(session.confirmPick()); return; }
                if (session.step === 'harvest-hold') { onStep(session.confirmHarvestInstant()); return; }
                if (session.step === 'pick') { onStep(session.confirmPick()); return; }
            }
            const nav = { arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down' };
            if (nav[k] && (session.step === 'pick' || session.step === 'pick-harvest' || session.step === 'care-hub')) {
                e.preventDefault();
                session.moveSelection(nav[k]);
                renderNeedsCard();
                syncTendRing();
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
        if (screen === 'camera-check') updateCameraCheckScreen(dt);
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
        const chartOn = state.settings.chart && screen === 'visit';
        if (els.chartPanel.hidden === chartOn) els.chartPanel.hidden = !chartOn;
        if (chartOn) window.SmileChart.drawSmileChart(els.smileChart, trace, t, els.chartLive);
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
            if (CC.shouldShowCameraCheck(state)) openCameraCheck();
            else show(state.version >= 5 ? 'idle' : 'greeting');
        } else {
            show('wellness');
        }
        document.body.dataset.gardenV = String(state.version >= 6 ? 6 : state.version >= 5 ? 5 : 4);
        if (state.version >= 5) {
            scene.setSeason(state.season);
            refreshLighting();
        }
        document.body.dataset.ready = '1';
        window.addEventListener('resize', syncHudChipClamp);
    }

    // Dev/test hooks (used by scripts/capture-driver.js; harmless otherwise).
    window.__smileGarden = {
        get state() { return state; },
        get session() { return session; },
        get screen() { return screen; },
        get scene() { return scene; },
        get stretchDemoSnap() { return stretchDemoSnap; },
        clock, gardenClock, nextDay, simulateDays, fillEmpty, setLightingOverride, openJournal, closeJournal, openPicker, closePicker, ackWellness: () => ackWellness(),
        openCameraCheck: () => openCameraCheck(),
        retryCameraCheck: () => retryCameraCheck(),
        finishCameraCheck: () => finishCameraCheckFlow(),
        selectCameraCheck(key) {
            if (!cameraCheckSession || !key) return;
            cameraCheckDemoLock = false;
            cameraCheckSession.select(key);
            if (source && source.setPhase) source.setPhase(`camera-check-${key}`);
            renderCameraCheckUI(cameraCheckSession.update(0, buildCameraCheckInput()));
        },
        skipCameraCheck(key) {
            if (!cameraCheckSession || !key) return;
            cameraCheckSession.skip(key);
            renderCameraCheckUI(cameraCheckSession.update(0, buildCameraCheckInput()));
        },
        markAllCameraChecksPassed() {
            if (!cameraCheckSession) return;
            cameraCheckDemoLock = true;
            for (const k of CC.CHECKS) cameraCheckSession.markPassed(k);
            renderCameraCheckUI(cameraCheckSession.update(0, buildCameraCheckInput()));
        },
        /** Capture/helper: fix packet visuals to match docs/camera-check-mockup.png */
        setCameraCheckDemo(opts) {
            const o = opts || {};
            cameraDeniedDemo = false;
            cameraCheckDemoLock = true;
            signal.validation = 'Ok';
            signal.breathing = null;
            cameraCheckSession = CC.createCameraCheckSession({
                smileOn: L.DEFAULTS.smileOn,
                Stretch: window.SmileStretch,
            });
            for (const k of (o.passed || [])) cameraCheckSession.markPassed(k);
            if (o.active) cameraCheckSession.select(o.active);
            signal.h = 0.82;
            signal.talking = o.active === 'talk';
            signal.hAt = performance.now();
            signal.talkAt = performance.now();
            if (source && source.setPhase && o.active) source.setPhase(`camera-check-${o.active}`);
            const input = buildCameraCheckInput();
            input.breathing = null;
            renderCameraCheckUI(cameraCheckSession.update(0, input));
        },
        setCameraDeniedDemo(on) {
            cameraCheckDemoLock = on;
            cameraDeniedDemo = !!on;
            signal.validation = on ? 'CameraPermissionDenied' : 'Ok';
            signal.faceGoneAt = on ? performance.now() : 0;
            signal.hAt = 0;
            signal.talking = false;
            if (on && screen === 'camera-check') {
                cameraCheckSession = CC.createCameraCheckSession({
                    smileOn: L.DEFAULTS.smileOn,
                    Stretch: window.SmileStretch,
                });
            }
            if (screen === 'camera-check' && cameraCheckSession) {
                renderCameraCheckUI(cameraCheckSession.update(0, buildCameraCheckInput()));
            }
        },
        setSetupDone(done) {
            if (done) CC.finishCameraSetup(state);
            else {
                state.setupDone = false;
                state.cameraCheckNote = null;
            }
            save();
        },
        getCameraCheckSnap() { return lastCameraCheckSnap; },
        plant: (id, plot) => plant(id, plot),
        begin: () => (screen === 'greeting' || screen === 'idle' ? beginVisit() : null),
        skip: () => {
            if (!session) return null;
            const step = session.skip();
            onStep(step);
            return step;
        },
        confirmPick: () => {
            if (!session) return null;
            const step = session.confirmPick();
            onStep(step);
            return step;
        },
        setSelectedPlot(plot) {
            if (!session) return false;
            const ok = session.setSelectedPlot(plot);
            if (ok) { renderNeedsCard(); syncTendRing(); }
            return ok;
        },
        startCare(needKey) {
            if (!session) return null;
            const step = session.startCare(needKey);
            onStep(step);
            return step;
        },
        fillCareDemo(plot) {
            if (!session || plot == null) return;
            const p = state.plots[plot];
            if (!p) return;
            const needs = L.plantNeeds(p.plantId);
            session.setCareProgress(plot, {
                sun: needs.sun,
                water: needs.water,
                fertilizer: needs.fertilizer,
                stake: needs.stake ? !!p.staked : false,
            });
            if (needs.stake && !p.staked) session.setCareProgress(plot, Object.assign(session.careProgressFor(plot), { stake: true }));
            renderNeedsCard();
        },
        /** Mock capture: fill one care meter then return to the hub without waiting on face input. */
        setNeedsCardDemo(plot, progress) {
            const i = Number(plot);
            if (!(i >= 0 && i < state.plots.length && state.plots[i] && state.plots[i].plantId)) return null;
            const planted = state.plots.map((p, idx) => (p ? idx : -1)).filter((idx) => idx >= 0);
            if (!planted.includes(i)) planted.push(i);
            session = new V.VisitSession({
                fast: config.fast,
                pace: state.settings.pace,
                breaths: state.settings.breaths,
                plots: state.plots,
                today: gardenTodayKey(),
                gardenDay: state.dayNumber,
                dailyTends: state.dailyTends,
                tendBeds: planted,
            });
            session.phase = 'tend';
            session.plantRound = planted.indexOf(i);
            session.go('care-hub');
            session.selectedPlot = i;
            session.setCareProgress(i, Object.assign(C.emptyProgress(), progress));
            show('visit');
            onStep('care-hub');
            els.needsCard.hidden = false;
            renderNeedsCard();
            refreshLighting();
            renderHud();
            plotsForScene({ instant: true });
            return i;
        },
        clearCaptureVisit() {
            session = null;
            stretchHudDemoLock = false;
            stretchDemoSnap = null;
            syncTendRing();
            plotsForScene({ instant: true });
            show('idle');
        },
        captureRedraw() {
            plotsForScene({ instant: true });
            renderHud();
            try {
                scene.draw(performance.now() / 1000);
            } catch (e) {
                console.error('[captureRedraw] scene.draw failed', e);
            }
            return document.body.dataset.planted;
        },
        /** Mock capture: garden tag/soil states without a live visit session. */
        unlockSeedsForCapture() {
            if (!state.pantry) state.pantry = V.emptyPantry();
            state.pantry.totalHarvests = Math.max(state.pantry.totalHarvests || 0, 12);
            if (!state.visitDays) state.visitDays = [];
            while (state.visitDays.length < 4) state.visitDays.push(gardenTodayKey());
            save();
        },
        prepCaptureGarden() {
            if (!state.pantry) state.pantry = V.emptyPantry();
            state.pantry.totalHarvests = Math.max(state.pantry.totalHarvests || 0, 12);
            if (!state.visitDays) state.visitDays = [];
            while (state.visitDays.length < 4) state.visitDays.push(gardenTodayKey());
            show('idle');
            const beds = [
                ['lettuce', 0, 2],
                ['mint', 1, 2],
                ['tomato', 2, 4],
                ['cucumber', 4, 3],
                ['sunflower', 6, 4],
            ];
            for (const [id, plot, stage] of beds) {
                if (!state.plots[plot]) {
                    const res = V.plantSeed(state, plot, id, clock.now());
                    if (!res.ok) continue;
                }
                state.plots[plot].stage = stage;
                state.plots[plot].tagResting = false;
            }
            save();
            plotsForScene({ instant: true });
            renderHud();
            return state.plots.filter(Boolean).length;
        },
        applyTagGardenDemo(mode) {
            session = null;
            document.body.dataset.captureTags = '1';
            if (els.btnVisit) els.btnVisit.hidden = true;
            const day = state.dayNumber;
            if (!state.dailyTends) state.dailyTends = {};
            const setBed = (plot, cfg) => {
                const p = state.plots[plot];
                if (!p || !p.plantId) return;
                const needs = L.plantNeeds(p.plantId);
                state.plots[plot].staked = !!cfg.staked;
                state.plots[plot].tagResting = !!cfg.resting;
                const prog = cfg.progress || {
                    sun: cfg.allMet ? needs.sun : 0,
                    water: cfg.allMet ? needs.water : 0,
                    fertilizer: cfg.allMet ? needs.fertilizer : 0,
                    stake: cfg.staked && needs.stake,
                };
                state.dailyTends[plot] = Object.assign({ day, allMet: !!cfg.allMet }, prog, {
                    stake: !!cfg.staked || !!prog.stake,
                });
            };
            if (mode === 'complete') {
                setBed(2, { allMet: true, staked: true, resting: false });
            } else if (mode === 'resting') {
                setBed(2, { allMet: false, resting: true, progress: { sun: 0, water: 0, fertilizer: 0, stake: false } });
            } else if (mode === 'partial') {
                setBed(2, { allMet: false, progress: { sun: 1, water: 0, fertilizer: 0, stake: false } });
            } else if (mode === 'garden') {
                setBed(0, { allMet: false, progress: { sun: 2, water: 1, fertilizer: 0, stake: false } });
                setBed(1, { allMet: false, progress: { sun: 0, water: 2, fertilizer: 0, stake: false } });
                setBed(2, { allMet: true, staked: true, resting: false });
                setBed(6, { allMet: false, progress: { sun: 3, water: 2, fertilizer: 1, stake: false } });
            }
            save();
            show('idle');
            plotsForScene({ instant: true });
            renderHud();
            return mode;
        },
        prepTagGardenDemo(mode) {
            if (state.plots.filter(Boolean).length < 4) prepCaptureGarden();
            return applyTagGardenDemo(mode);
        },
        prepStakedTomatoCapture() {
            session = null;
            stretchHudDemoLock = false;
            stretchDemoSnap = null;
            syncTendRing();
            show('idle');
            state.plots = new Array(state.plots.length).fill(null);
            const res = V.plantSeed(state, 2, 'tomato', clock.now());
            if (res.ok && state.plots[2]) {
                state.plots[2].stage = 4;
                state.plots[2].staked = true;
                state.plots[2].tagResting = false;
            }
            if (!state.dailyTends) state.dailyTends = {};
            state.dailyTends[2] = {
                day: state.dayNumber,
                sun: 2,
                water: 1,
                fertilizer: 0,
                stake: true,
                allMet: false,
            };
            save();
            plotsForScene({ instant: true });
            renderHud();
        },
        completeCareNeedForCapture(needKey) {
            if (!session || session.selectedPlot == null) return null;
            const plot = session.selectedPlot;
            const p = state.plots[plot];
            if (!p || !p.plantId) return null;
            const needs = L.plantNeeds(p.plantId);
            const prog = Object.assign({}, session.careProgressFor(plot));
            if (needKey === 'sun') prog.sun = needs.sun;
            else if (needKey === 'water') prog.water = needs.water;
            else if (needKey === 'fertilizer') prog.fertilizer = needs.fertilizer;
            else return null;
            session.setCareProgress(plot, prog);
            const step = session.skip();
            onStep(step);
            return step;
        },
        startBreathing: (o) => session && session.startBreathing(o || {}),
        launchStretchCare(returnStep) {
            if (!session) return null;
            const step = session.launchStretchCare(returnStep || 'pick');
            onStep(step);
            return step;
        },
        skipStretchCare() {
            if (!session) return null;
            const step = session.skipStretchCare();
            onStep(step);
            return step;
        },
        show,
        toggleDev,
        makeAllReady: () => { V.makeAllReady(state); save(); plotsForScene({ instant: true }); renderHud(); },
        reset() {
            localStorage.removeItem(STORE_KEY);
            hudSeasonOverride = false;
            state = V.createState(new Date());
            gardenClock.state = state;
            clock.offsetDays = 0;
            cameraCheckSession = null;
            lastCameraCheckSnap = null;
            cameraDeniedDemo = false;
            cameraCheckGridMounted = false;
            plotsForScene({ instant: true });
            scene.setSeason(state.season);
            refreshLighting();
            renderHud();
            document.body.dataset.gardenV = String(state.version >= 6 ? 6 : state.version >= 5 ? 5 : 4);
            show(state.wellnessAck ? 'idle' : 'wellness');
        },
        setGardenTime(m) {
            state.gardenMinutes = D.clampMinutes(m);
            gardenClock.pause();
            refreshLighting();
            renderHud();
        },
        setSeason(season) {
            if (!D.SEASONS.includes(season)) return;
            hudSeasonOverride = true;
            state.season = season;
            state.seasonDay = Math.min(D.DAYS_PER_SEASON, Math.max(1, state.seasonDay || 1));
            scene.setSeason(season);
            refreshLighting();
            renderHud();
        },
        clearSeasonOverride() { hudSeasonOverride = false; syncGardenSeasonFromDay(); renderHud(); },
        waitForHudArt: (ms) => scene.waitForHudArt(ms),
        probeClockSunToken() {
            scene.draw(performance.now() / 1000);
            return scene.probeClockSunToken();
        },
        probeClockMoonToken() {
            scene.draw(performance.now() / 1000);
            return scene.probeClockMoonToken();
        },
        syncHudChipClamp,
        auditHudLayout() {
            syncHudChipClamp();
            const H = typeof window !== 'undefined' ? window.SmileHudLayout : null;
            if (!H) return { ok: false, reason: 'missing-hud-layout' };
            return H.auditHudLayoutInDocument();
        },
        setBreathHudDemo(mode, countDone) {
            breathHudDemoLock = true;
            els.breathGuide.hidden = false;
            els.breathRate.hidden = false;
            const done = Number(countDone) || 0;
            if (mode === 'warming') {
                signal.breathing = null;
                els.breathRate.dataset.state = 'warming';
                els.breathRate.textContent = 'Listening for your breath…';
            } else if (mode === 'settling') {
                signal.breathing = { rate: 5.8, stable: false, confidence: 42, at: performance.now() };
                breathHudDemoLock = false;
                renderBreathRate();
                breathHudDemoLock = true;
            } else if (mode === 'stable') {
                signal.breathing = { rate: 6.1, stable: true, confidence: 88, at: performance.now() };
                breathHudDemoLock = false;
                renderBreathRate();
                breathHudDemoLock = true;
            }
            const total = session && session.pacer ? session.pacer.breaths : state.settings.breaths;
            els.breathCount.textContent = '';
            for (let i = 0; i < total; i++) {
                const d = document.createElement('i');
                if (i < done) d.className = 'on';
                els.breathCount.appendChild(d);
            }
        },
        clearBreathHudDemo() {
            breathHudDemoLock = false;
            if (session && session.step === 'breathe') renderBreathRate();
        },
        setStretchHudDemo(mode) {
            const modes = {
                'tilted-guide': { leftProgress: 0.12, rightProgress: 0, leftDone: false, rightDone: false, rollDeg: -26, activeSide: 'left', ringFrame: 2, complete: false, needsFaceHint: false },
                'ring-midfill': { leftProgress: 7 / 11, rightProgress: 0, leftDone: false, rightDone: false, rollDeg: -4, activeSide: 'left', ringFrame: 7, complete: false, needsFaceHint: false },
                'left-hold': { leftProgress: 7 / 11, rightProgress: 0, leftDone: false, rightDone: false, rollDeg: -22, activeSide: 'left', complete: false, needsFaceHint: false },
                'right-hold': { leftProgress: 1, rightProgress: 0.72, leftDone: true, rightDone: false, rollDeg: 19, activeSide: 'right', complete: false, needsFaceHint: false },
                done: { leftProgress: 1, rightProgress: 1, leftDone: true, rightDone: true, rollDeg: 2, activeSide: null, complete: true, needsFaceHint: false },
            };
        stretchHudDemoLock = true;
        stretchDemoSnap = modes[mode] || modes['left-hold'];
        show('visit');
        document.body.dataset.step = 'stretch';
        document.body.dataset.stretchCare = '1';
        els.stretchCarePanel.hidden = false;
        els.stretchGuide.hidden = false;
        els.stepPanel.hidden = true;
        if (els.stretchCareLive) {
            const snap = stretchDemoSnap;
            els.stretchCareLive.textContent = snap.activeSide === 'left'
                ? 'Hold toward your left shoulder and keep a gentle stretch.'
                : 'Hold toward your right shoulder and keep a gentle stretch.';
        }
        const back = mkBtn('Back to needs', 'btn btn-ghost', () => clearStretchHudDemo());
        if (els.stretchCareActions) {
            els.stretchCareActions.textContent = '';
            els.stretchCareActions.appendChild(back);
        }
        scene.setEffects({ plot: null, sun: 0, water: 0, fert: 0, stake: 0 });
        return ensureStretchRingArt().then(() => renderStretchHud());
        },
        clearStretchHudDemo() {
            stretchHudDemoLock = false;
            stretchDemoSnap = null;
            if (els.stretchCarePanel) els.stretchCarePanel.hidden = true;
            if (els.stretchGuide) els.stretchGuide.hidden = true;
            document.body.dataset.stretchCare = '0';
            document.body.dataset.step = '';
            if (session) onStep(session.step);
            else show('idle');
        },
        setStakedBed(plot, staked) {
            const p = state.plots[plot];
            if (!p || !p.plantId) return;
            p.staked = staked !== false;
            save();
            plotsForScene({ instant: true });
            renderHud();
        },
        finishVisitForCapture() {
            if (!session) return;
            stretchHudDemoLock = false;
            stretchDemoSnap = null;
            let guard = 0;
            while (session.step !== 'summary' && guard++ < 90) {
                if (session.step === 'care-hub') onStep(session.finishCareHub());
                else if (session.step === 'pick' || session.step === 'pick-harvest') onStep(session.confirmPick());
                else onStep(session.skip());
            }
            if (session.step !== 'summary') onStep(session.go('summary'));
            else finishVisit();
        },
        async previewBedtimeGlow() {
            scene.setLighting('night');
            document.body.dataset.lighting = 'night';
            for (let i = 1; i <= 10; i++) {
                scene.setBedtimeGlow(i / 10);
                if (i > 6) scene.setBedtimeDark((i - 6) / 4);
                await new Promise((r) => setTimeout(r, 40));
            }
        },
        clearBedtimeLayers() { scene.setBedtimeGlow(0); scene.setBedtimeDark(0); refreshLighting(); },
        async previewMorningCard() {
            renderMorningSummary({ grew: [{ plot: 0, name: 'Lettuce', from: 1, to: 2, mature: false }] });
            show('summary');
        },
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') gardenClock.resume();
        else { gardenClock.pause(); save(); }
    });

    window.addEventListener('beforeunload', () => { if (source) { try { source.destroy(); } catch { /* ignore */ } } save(); });
    init();
})();
