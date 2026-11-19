// renderer/dev-hooks.js — mock/capture automation surface (window.__smileGarden).
// Installed only when config.mock || config.capture. Used by scripts/capture-driver.js.
(function (global) {
    'use strict';

    /**
     * @param {object} api application context from renderer/app.js
     */
    function create(api) {
        const {
            getState, setState, getSession, setSession, getScreen, getScene,
            getStretchDemoSnap, setStretchDemoSnap,
            getForcePickedPlots, setForcePickedPlots,
            getSignalPanelDemoLock, setSignalPanelDemoLock,
            getBreathHudDemoLock, setBreathHudDemoLock,
            getStretchHudDemoLock, setStretchHudDemoLock,
            getHudSeasonOverride, setHudSeasonOverride,
            getMockPipCapture, setMockPipCapture,
            getMockPipWantStream, setMockPipWantStream,
            getSource, getSourceReady, getConfig, getCameraCheck,
            clock, gardenClock, els, scene, signal, signalSwitcher, STORE_KEY,
            L, V, C, CC, D,
            nextDay, simulateDays, fillEmpty, setLightingOverride,
            openJournal, closeJournal, openPicker, closePicker, ackWellness,
            openCameraCheck, retryCameraCheck, finishCameraCheckFlow,
            plant, beginVisit, onStep, renderNeedsCard, syncTendRing,
            show: showScreen, save, toast, mkBtn, gardenTodayKey,
            refreshLighting, renderHud, plotsForScene, syncPipVisibility,
            restorePipHome, startCamera, ensureSource, syncKeyboardStripMode,
            ensureFarmerPipLive, waitForFarmerPipReady,
            primeSignalTraceForCapture, redrawSignalPanel,
            renderBreathRate, renderStretchHud, ensureStretchRingArt,
            renderSummary, renderMorningSummary, finishVisit,
            syncGardenSeasonFromDay, syncHudChipClamp, toggleDev,
        } = api;

        // Local mutable aliases matching previous app.js names.
        let state = getState();
        let session = getSession();
        let screen = getScreen();
        function show(name) {
            showScreen(name);
            screen = name;
        }
        let stretchDemoSnap = getStretchDemoSnap();
        let forcePickedPlots = getForcePickedPlots();
        let signalPanelDemoLock = getSignalPanelDemoLock();
        let breathHudDemoLock = getBreathHudDemoLock();
        let stretchHudDemoLock = getStretchHudDemoLock();
        let hudSeasonOverride = getHudSeasonOverride();
        let mockPipCapture = getMockPipCapture();
        let mockPipWantStream = getMockPipWantStream();
        let source = getSource();
        let sourceReady = getSourceReady();
        let config = getConfig();
        let cameraCheck = getCameraCheck();

        function syncFromApp() {
            state = getState();
            session = getSession();
            screen = getScreen();
            stretchDemoSnap = getStretchDemoSnap();
            forcePickedPlots = getForcePickedPlots();
            signalPanelDemoLock = getSignalPanelDemoLock();
            breathHudDemoLock = getBreathHudDemoLock();
            stretchHudDemoLock = getStretchHudDemoLock();
            hudSeasonOverride = getHudSeasonOverride();
            mockPipCapture = getMockPipCapture();
            mockPipWantStream = getMockPipWantStream();
            source = getSource();
            sourceReady = getSourceReady();
            config = getConfig();
            cameraCheck = getCameraCheck();
        }

        function syncToApp() {
            setState(state);
            setSession(session);
            setStretchDemoSnap(stretchDemoSnap);
            setForcePickedPlots(forcePickedPlots);
            setSignalPanelDemoLock(signalPanelDemoLock);
            setBreathHudDemoLock(breathHudDemoLock);
            setStretchHudDemoLock(stretchHudDemoLock);
            setHudSeasonOverride(hudSeasonOverride);
            setMockPipCapture(mockPipCapture);
            setMockPipWantStream(mockPipWantStream);
        }

        const hooks = {
            // getters installed after wrap
        clock, gardenClock, nextDay, simulateDays, fillEmpty, setLightingOverride, openJournal, closeJournal, openPicker, closePicker, ackWellness: () => ackWellness(),
        openCameraCheck: (opts) => openCameraCheck(opts),
        retryCameraCheck: () => retryCameraCheck(),
        finishCameraCheck: () => finishCameraCheckFlow(),
        selectCameraCheck(key) { cameraCheck.selectCheck(key); },
        skipCameraCheck(key) { cameraCheck.skipCheck(key); },
        markAllCameraChecksPassed() { cameraCheck.markAllPassed(); },
        /** Capture/helper: fix packet visuals to match docs/camera-check-mockup.png */
        setCameraCheckDemo(opts) { cameraCheck.setDemo(opts); },
        setCameraDeniedDemo(on) { cameraCheck.setDeniedDemo(on); },
        setSetupDone(done) {
            if (done) CC.finishCameraSetup(state);
            else {
                state.setupDone = false;
                state.cameraCheckNote = null;
            }
            save();
        },
        getCameraCheckSnap() { return cameraCheck.lastSnap; },
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
            if (!(i >= 0 && i < state.plots.length)) return null;
            if (!state.plots[i] || !state.plots[i].plantId) {
                const res = V.plantSeed(state, i, 'lettuce', clock.now());
                if (!res.ok) return null;
                save();
            }
            if (!state.plots[i] || !state.plots[i].plantId) return null;
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
            if (els.tendStrip) els.tendStrip.hidden = false;
            syncToApp();
            renderNeedsCard();
            refreshLighting();
            renderHud();
            plotsForScene({ instant: true });
            syncToApp();
            return i;
        },
        clearCaptureVisit() {
            session = null;
            stretchHudDemoLock = false;
            stretchDemoSnap = null;
            if (els.breathGuide) els.breathGuide.hidden = true;
            if (els.stretchGuide) els.stretchGuide.hidden = true;
            syncTendRing();
            plotsForScene({ instant: true });
            show('idle');
        },
        captureRedraw() {
            const t = performance.now() / 1000;
            if (signalPanelDemoLock) primeSignalTraceForCapture(signalPanelDemoLock, t);
            plotsForScene({ instant: true });
            renderHud();
            renderNeedsCard();
            redrawSignalPanel(t, { captureRedraw: true });
            try {
                scene.draw(t);
            } catch (e) {
                console.error('[captureRedraw] scene.draw failed', e);
            }
            return document.body.dataset.planted;
        },
        setChartForCapture(on) {
            state.settings.chart = !!on;
            if (els.chartPanel) els.chartPanel.hidden = !on;
            save();
            return state.settings.chart;
        },
        setSignalPanelDemoForCapture(mode) {
            const m = ['idle', 'smile', 'talk', 'breathe', 'stretch'].includes(mode) ? mode : 'idle';
            const t = performance.now() / 1000;
            signalPanelDemoLock = m;
            state.settings.chart = true;
            if (els.breathGuide) els.breathGuide.hidden = true;
            if (els.chartPanel) {
                els.chartPanel.hidden = false;
                els.chartPanel.dataset.state = m;
            }
            if (signalSwitcher && signalSwitcher.forceMode) signalSwitcher.forceMode(m, t);
            primeSignalTraceForCapture(m, t);
            redrawSignalPanel(t);
            if (m === 'stretch') {
                stretchDemoSnap = { rollDeg: 18, leftProgress: 0.4, rightProgress: 0, leftDone: false, rightDone: false };
            }
            if (m === 'breathe') {
                signal.breathing = { rate: 5.8, confidence: 72, stable: true, at: performance.now() };
            } else if (m !== 'idle') {
                signal.breathing = null;
            }
            if (session) {
                session.smiling = m === 'smile';
                session.talking = m === 'talk';
                if (m === 'smile') session.activeCareChannel = 'water';
                else if (m === 'talk') session.activeCareChannel = 'fertilizer';
                else if (m === 'stretch') session.activeCareChannel = 'stake';
                else if (m === 'breathe') session.activeCareChannel = 'harvest';
                else session.activeCareChannel = null;
            }
            document.body.dataset.demoCareChannel = m === 'smile' ? 'water'
                : m === 'talk' ? 'fertilizer'
                    : m === 'stretch' ? 'stake'
                        : m === 'breathe' ? 'harvest'
                            : '';
            syncToApp();
            if (session) renderNeedsCard();
            return m;
        },
        primeSignalTraceForCapture,
        clearSignalPanelDemoForCapture() {
            signalPanelDemoLock = null;
            delete document.body.dataset.demoCareChannel;
            stretchDemoSnap = null;
            if (session) session.activeCareChannel = null;
            if (signalSwitcher && signalSwitcher.reset) signalSwitcher.reset();
            if (els.chartPanel) els.chartPanel.dataset.state = 'idle';
            if (window.SmileTendStrip && window.SmileTendStrip.resetActiveHold) {
                window.SmileTendStrip.resetActiveHold();
            }
            redrawSignalPanel(performance.now() / 1000);
        },
        async ensureSourceForCapture() {
            return ensureSource();
        },
        async setMockPipForCapture(on, opts) {
            const o = opts || {};
            mockPipCapture = !!on;
            mockPipWantStream = !!(on && o.stream !== false);
            restorePipHome();
            if (els.screenCameraCheck) els.screenCameraCheck.hidden = screen !== 'camera-check';
            if (mockPipCapture) {
                if (mockPipWantStream) {
                    await ensureSource();
                    if (source && source.start && !sourceReady) await startCamera();
                }
                if (els.preview) {
                    if (mockPipWantStream) {
                        els.preview.removeAttribute('hidden');
                        els.preview.style.removeProperty('visibility');
                    } else {
                        try { els.preview.pause(); } catch { /* ignore */ }
                        els.preview.srcObject = null;
                        els.preview.setAttribute('hidden', '');
                    }
                }
                els.pip.classList.toggle('pip-mock-capture', !mockPipWantStream);
            } else {
                mockPipWantStream = false;
                els.pip.classList.remove('pip-mock-capture');
                if (els.preview) {
                    try { els.preview.pause(); } catch { /* ignore */ }
                    els.preview.srcObject = null;
                }
            }
            syncPipVisibility();
            return mockPipCapture;
        },
        prepareDomForScreenshot(opts) {
            const o = opts || {};
            if (!o.keepPip) {
                restorePipHome();
                if (els.preview) {
                    try { els.preview.pause(); } catch { /* ignore */ }
                    els.preview.style.visibility = 'hidden';
                }
                if (els.pip) els.pip.hidden = true;
            }
            if (els.smileChart) els.smileChart.classList.remove('is-swapping');
            return true;
        },
        setCareHubProgressForCapture(plot, partial) {
            if (!session) return null;
            const i = Number(plot);
            session.go('care-hub');
            session.selectedPlot = i;
            session.setCareProgress(i, Object.assign(C.emptyProgress(), partial));
            show('visit');
            onStep('care-hub');
            if (els.tendStrip) els.tendStrip.hidden = false;
            syncToApp();
            renderNeedsCard();
            plotsForScene({ instant: true });
            return session.careProgressFor(i);
        },
        setTendStripActiveForCapture(channel) {
            if (!session) return null;
            session.activeCareChannel = channel || null;
            if (window.SmileTendStrip) {
                if (channel && window.SmileTendStrip.primeActiveHold) {
                    window.SmileTendStrip.primeActiveHold(channel);
                } else if (window.SmileTendStrip.resetActiveHold) {
                    window.SmileTendStrip.resetActiveHold();
                }
            }
            syncToApp();
            renderNeedsCard();
            return channel;
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
        primeMaturePlantsForCapture() {
            forcePickedPlots = null;
            session = null;
            show('idle');
            const beds = [
                ['lettuce', 0],
                ['mint', 1],
                ['tomato', 2],
                ['cucumber', 4],
                ['sunflower', 6],
                ['apple', 3],
            ];
            for (const [id, plot] of beds) {
                if (!state.plots[plot]) {
                    const res = V.plantSeed(state, plot, id, clock.now());
                    if (!res.ok) continue;
                }
                const p = state.plots[plot];
                p.stage = V.MAX_STAGE;
                p.tagResting = false;
                p.picked = false;
                p.pickDay = null;
            }
            save();
            plotsForScene({ instant: true });
            renderHud();
            return beds.length;
        },
        primePickedSpritesForCapture() {
            forcePickedPlots = { 1: true, 2: true, 4: true };
            session = null;
            show('idle');
            for (const [id, plot] of [['mint', 1], ['tomato', 2], ['cucumber', 4], ['apple', 3]]) {
                if (!state.plots[plot]) V.plantSeed(state, plot, id, clock.now());
                const p = state.plots[plot];
                if (!p) continue;
                p.stage = V.MAX_STAGE;
                p.tagResting = false;
            }
            save();
            plotsForScene({ instant: true });
            renderHud();
            return Object.keys(forcePickedPlots).length;
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
                // Match Heily make_mockups.py garden tag layout (beds 1,2,3,5,7).
                setBed(0, { allMet: false, progress: { sun: 1, water: 2, fertilizer: 0, stake: false } });
                setBed(1, { allMet: true, staked: false, resting: false });
                setBed(2, { allMet: false, progress: { sun: 1, water: 0, fertilizer: 0, stake: false } });
                setBed(4, { allMet: false, progress: { sun: 1, water: 1, fertilizer: 0, stake: false } });
                setBed(6, { allMet: false, progress: { sun: 3, water: 2, fertilizer: 2, stake: true }, staked: true });
            }
            scene.setEffects({ plot: null, sun: 0, water: 0, fert: 0, stake: 0, breath: 0 });
            scene.setTendSelection(null);
            save();
            show('idle');
            plotsForScene({ instant: true });
            renderHud();
            scene.draw(performance.now() / 1000);
            return mode;
        },
        prepTagGardenDemo(mode) {
            if (state.plots.filter(Boolean).length < 4) hooks.prepCaptureGarden();
            return hooks.applyTagGardenDemo(mode);
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
            else if (needKey === 'harvest') {
                if (session.step === 'care-harvest' && session.pacer) {
                    session.breathT = session.pacer.total;
                    session.breathsDone = session.pacer.breaths;
                    const step = session._completeCareHarvest();
                    onStep(step);
                    plotsForScene({ instant: true });
                    renderHud();
                    return step;
                }
                return session.step;
            } else return null;
            session.setCareProgress(plot, prog);
            let step = session.step;
            if (step === 'care-smile' || step === 'care-talk' || step === 'care-harvest') {
                step = session.go('care-hub');
            }
            onStep(step);
            plotsForScene({ instant: true });
            renderNeedsCard();
            return step;
        },
        prepHarvestTendStripShot(plot) {
            const i = Number(plot);
            if (!state.plots[i] || !state.plots[i].plantId) return false;
            if (!session) {
                const planted = state.plots.map((pl, idx) => (pl ? idx : -1)).filter((idx) => idx >= 0);
                session = new V.VisitSession({
                    fast: config.fast,
                    pace: state.settings.pace,
                    breaths: state.settings.breaths,
                    plots: state.plots,
                    today: gardenTodayKey(),
                    gardenDay: state.dayNumber,
                    dailyTends: state.dailyTends,
                    tendBeds: planted.length ? planted : [i],
                });
                session.phase = 'tend';
                session.plantRound = Math.max(0, planted.indexOf(i));
                session.go('care-hub');
                session.selectedPlot = i;
            }
            if (session.gardenDay == null) session.gardenDay = state.dayNumber;
            session.pendingHarvests = (session.pendingHarvests || []).filter((p) => p !== i);
            session.pacer = null;
            session.breathT = 0;
            session.breathsDone = 0;
            session.activeCareChannel = 'harvest';
            session.step = 'care-hub';
            syncToApp();
            signalPanelDemoLock = null;
            if (signalSwitcher && signalSwitcher.reset) signalSwitcher.reset();
            state.settings.chart = false;
            if (els.chartPanel) els.chartPanel.hidden = true;
            const ok = hooks.primeCareHarvestForCapture(i);
            syncFromApp();
            if (!session) return false;
            session.pendingHarvests = (session.pendingHarvests || []).filter((p) => p !== i);
            show('visit');
            onStep('care-hub');
            if (els.idleBar) els.idleBar.hidden = true;
            if (els.hint) els.hint.hidden = true;
            renderNeedsCard();
            if (els.tendStrip) els.tendStrip.hidden = false;
            document.body.dataset.tendStrip = '1';
            hooks.captureRedraw();
            return ok && session.canCareHarvest(i);
        },
        setCaptureStripGlow(on) {
            if (on) document.body.dataset.captureStripGlow = '1';
            else delete document.body.dataset.captureStripGlow;
            return !!on;
        },
        primeCareHarvestForCapture(plot) {
            const i = Number(plot);
            const p = state.plots[i];
            if (!p || !p.plantId) return false;
            p.stage = V.MAX_STAGE;
            p.picked = false;
            p.pickDay = null;
            p.matureDay = p.matureDay || V.calendarKey(state, clock.now());
            p.matureWater = 1;
            p.matureFert = 1;
            if (L.plantNeedsStake(p.plantId)) p.staked = true;
            if (!session) return false;
            if (session.gardenDay == null) session.gardenDay = state.dayNumber;
            const needs = L.plantNeeds(p.plantId);
            session.go('care-hub');
            session.setCareProgress(i, {
                sun: needs.sun,
                water: needs.water,
                fertilizer: needs.fertilizer,
                stake: needs.stake ? !!p.staked : false,
            });
            session.selectedPlot = i;
            session.activeCareChannel = 'harvest';
            show('visit');
            onStep('care-hub');
            if (els.tendStrip) els.tendStrip.hidden = false;
            plotsForScene({ instant: true });
            renderNeedsCard();
            renderHud();
            return session.canCareHarvest(i);
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
            cameraCheck.reset();
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
        setGardenDay(n) {
            const day = Math.max(1, Math.round(Number(n) || 1));
            state.dayNumber = day;
            hudSeasonOverride = false;
            state.season = D.seasonForDayNumber(day);
            state.seasonDay = D.seasonDayNumber(day);
            scene.setSeason(state.season);
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
        probeClockRibbon() {
            scene.draw(performance.now() / 1000);
            return scene.probeClockRibbon();
        },
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
        const back = mkBtn('Back to needs', 'btn btn-ghost', () => hooks.clearStretchHudDemo());
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
            if (session) {
                session.go('care-hub');
                onStep('care-hub');
                show('visit');
                renderNeedsCard();
            } else show('idle');
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
        previewSummaryDay(sample) {
            const out = sample || {
                grew: [{ plot: 0, plantId: 'lettuce', name: 'Lettuce', from: 2, to: 3, mature: false }],
                careStats: { sunDots: 2.5, waterDots: 3, fertilizerDots: 1, stakes: 1, harvests: 0 },
                weekly: 3,
                harvested: [],
            };
            renderSummary(out, { night: false });
            show('summary');
        },
        previewSummaryNightQuiet() {
            renderMorningSummary({
                grew: [],
                careStats: { sunDots: 0, waterDots: 0, fertilizerDots: 0, stakes: 0, harvests: 0 },
            });
            show('summary');
        },
        async previewMorningCard() {
            renderMorningSummary({
                grew: [{ plot: 0, plantId: 'lettuce', name: 'Lettuce', from: 1, to: 2, mature: false }],
                careStats: { sunDots: 1.5, waterDots: 2, fertilizerDots: 0, stakes: 0, harvests: 0 },
            });
            show('summary');
        },
        async setKeyboardModeForCapture(on = true) {
            config.keyboard = !!on;
            if (on && source && source.setAuto) source.setAuto(false);
            if (els.mockBadge) els.mockBadge.hidden = !on && !config.mock;
            if (on) els.mockMode.textContent = 'Keyboard player';
            syncKeyboardStripMode();
            if (on) {
                await ensureFarmerPipLive();
            }
            renderNeedsCard();
            return config.keyboard;
        },
        setFarmerNightRestForCapture() {
            syncFromApp();
            if (source && source.setNight) source.setNight(true);
            if (source && source.setAuto) source.setAuto(false);
            if (source && source.setKeys) {
                source.setKeys({
                    smile: false, talk: false, hide: false, tiltLeft: false, tiltRight: false,
                });
            }
            return true;
        },
        async ensureFarmerPipForCapture() {
            try {
                await hooks.setKeyboardModeForCapture(true);
                await ensureFarmerPipLive();
                await waitForFarmerPipReady(10000);
                syncFromApp();
                if (source && source.setNight) {
                    source.setNight((document.body.dataset.lighting || '') === 'night');
                }
                return true;
            } catch (e) {
                console.error('[ensureFarmerPipForCapture]', e);
                return false;
            }
        },
        exportFarmerStateGridDataUrl() {
            const SF = global.SmileFarmer;
            if (!SF) return null;
            const specs = [
                {},
                { smile: true },
                { talk: true },
                { tilt: 'left' },
                { tilt: 'right' },
                { face: false },
            ];
            const pipW = 200;
            const pipH = 150;
            const cols = 3;
            const canvas = document.createElement('canvas');
            canvas.width = pipW * cols;
            canvas.height = pipH * 2;
            const ctx = canvas.getContext('2d');
            const off = document.createElement('canvas');
            off.width = 400;
            off.height = 300;
            const t0 = performance.now() / 1000;
            SF.preload('day');
            for (let i = 0; i < specs.length; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const octx = off.getContext('2d');
                octx.clearRect(0, 0, 400, 300);
                SF.paint(octx, Object.assign({ lighting: 'day', t: t0 + i * 0.2 }, specs[i]));
                ctx.save();
                ctx.translate(col * pipW + pipW, row * pipH);
                ctx.scale(-1, 1);
                ctx.drawImage(off, 0, 0, pipW, pipH);
                ctx.restore();
            }
            return canvas.toDataURL('image/png');
        },
        farmerFrameMatchesLabel(label, frameName) {
            const f = String(frameName || '');
            if (label === 'rest') return f === 'rest' || f.startsWith('rest-blink');
            if (label === 'smile') return f === 'smile';
            if (label === 'talk') return f.startsWith('talk');
            if (label === 'tilt [') return f === 'tilt-left';
            if (label === 'tilt ]') return f === 'tilt-right';
            if (label === 'hidden') return f === 'hidden';
            return false;
        },
        async waitForFarmerFrameLabel(label, timeoutMs, prevHash) {
            const deadline = performance.now() + (timeoutMs || 5000);
            let stable = 0;
            while (performance.now() < deadline) {
                syncFromApp();
                if (source && source.flushFarmerFrame) source.flushFarmerFrame();
                if (source && source.requestPreviewFrame) source.requestPreviewFrame();
                const frame = source && source.getFarmerFrame ? source.getFarmerFrame() : '';
                const hash = hooks.pipFrameHash();
                const nameOk = hooks.farmerFrameMatchesLabel(label, frame);
                const hashOk = prevHash == null || (hash != null && hash !== prevHash);
                if (nameOk && hashOk) {
                    stable += 1;
                    if (stable >= 6) return true;
                } else {
                    stable = 0;
                }
                await new Promise((r) => requestAnimationFrame(r));
            }
            return false;
        },
        pipFrameHash() {
            const v = els.preview;
            if (!v || v.readyState < 2 || !v.videoWidth) return null;
            const c = document.createElement('canvas');
            c.width = 16;
            c.height = 16;
            const ctx = c.getContext('2d');
            try {
                ctx.drawImage(v, 0, 0, 16, 16);
            } catch {
                return null;
            }
            const d = ctx.getImageData(0, 0, 16, 16).data;
            let h = 0;
            for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] + d[i + 2]) >>> 0;
            return h;
        },
        async exportFarmerStateGridFromLivePip() {
            syncFromApp();
            if (!els.preview || !els.preview.srcObject) await hooks.ensureFarmerPipForCapture();
            if (source && source.setAuto) source.setAuto(false);
            if (source && source.setNight) source.setNight(false);
            refreshLighting();
            const tiles = [
                { label: 'rest', keys: { smile: false, talk: false, hide: false, tiltLeft: false, tiltRight: false } },
                { label: 'smile', keys: { smile: true, talk: false, hide: false, tiltLeft: false, tiltRight: false } },
                { label: 'talk', keys: { smile: false, talk: true, hide: false, tiltLeft: false, tiltRight: false } },
                { label: 'tilt [', keys: { smile: false, talk: false, hide: false, tiltLeft: true, tiltRight: false } },
                { label: 'tilt ]', keys: { smile: false, talk: false, hide: false, tiltLeft: false, tiltRight: true } },
                { label: 'hidden', keys: { smile: false, talk: false, hide: true, tiltLeft: false, tiltRight: false } },
            ];
            const pipW = 200;
            const pipH = 150;
            const labelH = 22;
            const cols = 3;
            const canvas = document.createElement('canvas');
            canvas.width = pipW * cols;
            canvas.height = (pipH + labelH) * 2;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#f0e6d2';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const v = els.preview;
            if (!v) return null;
            const SF = global.SmileFarmer;
            if (SF && SF.whenPreloaded) await SF.whenPreloaded('day');
            const hashes = [];
            let prevHash = null;
            for (let i = 0; i < tiles.length; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const spec = tiles[i];
                if (SF && SF.freezeBlink) SF.freezeBlink(120);
                if (source && source.setKeys) source.setKeys(spec.keys);
                await hooks.waitForFarmerFrameLabel(spec.label, 8000, prevHash);
                await waitForFarmerPipReady(3000);
                const x = col * pipW;
                const y = row * (pipH + labelH);
                try {
                    ctx.drawImage(v, x, y, pipW, pipH);
                } catch { /* ignore */ }
                const tileHash = hooks.pipFrameHash();
                hashes.push(tileHash);
                prevHash = tileHash;
                ctx.fillStyle = '#3E2A1A';
                ctx.font = 'bold 12px Nunito, system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(spec.label, x + pipW / 2, y + pipH + 16);
            }
            if (source && source.setKeys) {
                source.setKeys({ smile: false, talk: false, hide: false, tiltLeft: false, tiltRight: false });
            }
            const uniq = new Set(hashes.filter((h) => h != null));
            if (uniq.size < 4) {
                console.warn('[exportFarmerStateGridFromLivePip] low pip frame diversity', uniq.size, hashes);
            }
            return canvas.toDataURL('image/png');
        },
        async prepKeyboardHintsStripShot(opts) {
            try {
                const plot = opts && opts.plot != null ? Number(opts.plot) : 4;
                const progress = (opts && opts.progress) || { sun: 2, water: 1, fertilizer: 0, stake: false };
                const channel = (opts && opts.channel) || 'water';
                await hooks.setKeyboardModeForCapture(true);
                hooks.setNeedsCardDemo(plot, progress);
                syncFromApp();
                if (opts && opts.lighting) setLightingOverride(opts.lighting);
                else refreshLighting();
                syncFromApp();
                if (source && source.setNight) {
                    source.setNight((document.body.dataset.lighting || '') === 'night');
                }
                if (opts && opts.harvest) {
                    hooks.prepHarvestTendStripShot(plot);
                } else {
                    hooks.setTendStripActiveForCapture(channel);
                }
                document.body.dataset.demoCareChannel = channel;
                renderNeedsCard();
                await ensureFarmerPipLive();
                await waitForFarmerPipReady(10000);
                hooks.captureRedraw();
                return true;
            } catch (e) {
                console.error('[prepKeyboardHintsStripShot]', e);
                return false;
            }
        },
        };

        // Wrap every own function/method so mutable locals sync with app.js.
        for (const key of Object.keys(hooks)) {
            const val = hooks[key];
            if (typeof val !== 'function') continue;
            if (key === 'state' || key === 'session' || key === 'screen' || key === 'scene' || key === 'stretchDemoSnap') continue;
            hooks[key] = function wrappedHook(...args) {
                syncFromApp();
                const out = val.apply(this, args);
                syncToApp();
                if (out && typeof out.then === 'function') {
                    return out.then((v) => { syncToApp(); return v; });
                }
                return out;
            };
        }

        // Re-bind getters to live app state (not stale copies).
        Object.defineProperties(hooks, {
            state: { enumerable: true, get: () => getState() },
            session: { enumerable: true, get: () => getSession() },
            screen: { enumerable: true, get: () => getScreen() },
            scene: { enumerable: true, get: () => getScene() },
            stretchDemoSnap: { enumerable: true, get: () => getStretchDemoSnap() },
            source: { enumerable: true, get: () => getSource() },
        });

        return hooks;
    }

    global.SmileDevHooks = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
