// renderer/camera-check-controller.js — camera warm-up flow (complements camera-check-ui.js).
// Pure UI painting stays in SmileCameraCheckUI; session logic in SmileCameraCheck (game/).
(function (global) {
    'use strict';

    /**
     * @param {object} deps
     * @param {object} deps.els
     * @param {object} deps.ART
     * @param {object} deps.CC
     * @param {object} deps.CCUI
     * @param {object} deps.L
     * @param {(rel: string) => string} deps.artUrl
     * @param {() => object} deps.getConfig
     * @param {() => object} deps.getState
     * @param {() => string} deps.getScreen
     * @param {() => object|null} deps.getSource
     * @param {() => object} deps.getSignal
     * @param {() => string} deps.getJournalReturn
     * @param {(name: string) => void} deps.show
     * @param {() => void} deps.save
     * @param {(msg: string) => void} deps.toast
     * @param {() => object} deps.currentInput
     * @param {() => object} deps.stretchSample
     * @param {() => void} deps.renderBreathRate
     * @param {() => void} deps.renderStretchHud
     * @param {() => void} deps.placePipForCameraCheck
     * @param {() => void} deps.restorePipHome
     * @param {() => void} deps.syncPipVisibility
     * @param {() => Promise<void>} deps.startCamera
     * @param {() => Promise<void>} deps.stopCamera
     * @param {() => Promise<void>} deps.abandonVisit
     */
    function create(deps) {
        const {
            els, ART, CC, CCUI, L, artUrl,
            getConfig, getState, getScreen, getSource, getSignal, getJournalReturn,
            show, save, toast, currentInput, stretchSample,
            renderBreathRate, renderStretchHud,
            placePipForCameraCheck, restorePipHome, syncPipVisibility,
            startCamera, stopCamera, abandonVisit,
        } = deps;

        let session = null;
        let lastSnap = null;
        let deniedDemo = false;
        let demoLock = false;
        let gridMounted = false;
        let returnScreen = 'idle';
        let returnToGarden = false;

        function gardenDestFrom(name) {
            if (name === 'greeting' || name === 'idle' || name === 'summary') return name;
            return getState().version >= 5 ? 'idle' : 'greeting';
        }

        function syncCtas() {
            if (els.btnCcStart) {
                els.btnCcStart.textContent = returnToGarden ? 'Back to the garden' : 'Start my garden';
            }
            if (els.btnCcSkipNow) {
                els.btnCcSkipNow.textContent = returnToGarden ? 'Back without testing' : 'Skip for now';
            }
        }

        function buildInput() {
            const input = currentInput();
            const signal = getSignal();
            const state = getState();
            input.validation = signal.validation;
            input.landmarksStable = signal.landmarksStable;
            const now = performance.now();
            input.breathing = signal.breathing && now - signal.breathing.at < 2500
                ? Object.assign({}, signal.breathing, { fresh: true })
                : null;
            input.stretch = stretchSample();
            input.cameraDenied = deniedDemo;
            input.noCamera = signal.validation === 'NoCamera';
            if (state.cameraCheckNote && getScreen() === 'camera-check') {
                input.sourceError = state.cameraCheckNote;
            }
            return input;
        }

        function renderUI(snap) {
            if (!snap) return;
            lastSnap = snap;
            const state = getState();
            if (els.ccNote) {
                const note = state.cameraCheckNote;
                if (note && getScreen() === 'camera-check') {
                    els.ccNote.hidden = false;
                    els.ccNote.textContent = note;
                } else {
                    els.ccNote.hidden = true;
                }
            }
            const active = session && session.active;
            if (CCUI) {
                els.breathGuide.hidden = active !== 'breath';
                els.stretchGuide.hidden = active !== 'stretch';
                if (active === 'breath') renderBreathRate();
                if (active === 'stretch') renderStretchHud();
                CCUI.renderStatus(els.ccStatusFace, els.ccStatusLight, els.ccStatusCamera, snap, {
                    denied: deniedDemo || !!snap.cameraDenied || !!snap.noCamera,
                });
                CCUI.renderPackets(els.ccPackets, snap, active, ART, artUrl, { denied: deniedDemo });
                CCUI.renderPrompt(els.ccPrompt, snap, active, {
                    denied: deniedDemo || !!snap.cameraDenied || !!snap.noCamera,
                });
                if (els.btnCcRetry) els.btnCcRetry.hidden = false;
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

        function mountGrid() {
            if (gridMounted || !CCUI || !els.ccPackets) return;
            const cc = ART.cameraCheck || {};
            const source = () => getSource();
            CCUI.mountPackets(els.ccPackets, ART, artUrl, {
                onSelect(key) {
                    if (!session) return;
                    session.select(key);
                    const src = source();
                    if (src && src.setPhase) src.setPhase(`camera-check-${key}`);
                    renderUI(session.update(0, buildInput()));
                },
                onSkip(key) {
                    if (!session) return;
                    session.skip(key);
                    renderUI(session.update(0, buildInput()));
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
            gridMounted = true;
        }

        async function open(opts) {
            if (getScreen() === 'camera-check') return;
            const options = opts || {};
            const config = getConfig();
            const state = getState();
            const screen = getScreen();
            const fromStartup = screen === 'loading' || options.fromStartup === true;
            const fromVisit = screen === 'visit';
            if (fromVisit) await abandonVisit();
            const fromScreen = fromStartup
                ? (state.version >= 5 ? 'idle' : 'greeting')
                : (screen === 'journal' ? getJournalReturn() : (fromVisit ? 'idle' : screen));
            returnScreen = gardenDestFrom(fromScreen);
            returnToGarden = !fromStartup && (
                options.reopen === true
                || fromVisit
                || (options.reopen !== false && !!state.setupDone && screen !== 'wellness')
            );
            syncCtas();
            mountGrid();
            demoLock = false;
            session = CC.createCameraCheckSession({
                smileOn: L.DEFAULTS.smileOn,
                Stretch: global.SmileStretch,
            });
            placePipForCameraCheck();
            show('camera-check');
            const source = getSource();
            try {
                // Reopen (and leave-visit) must stop→start so a frozen stream recovers.
                if (returnToGarden || (deps.isSourceReady && deps.isSourceReady())) {
                    await stopCamera();
                    if (els.preview) els.preview.srcObject = null;
                }
                await startCamera();
                state.cameraCheckNote = null;
            } catch (e) {
                if (!getSource()) {
                    deniedDemo = !config.mock;
                } else {
                    CC.markCameraCheckRequired(state, `Camera could not start: ${e && e.message || e}`);
                    save();
                }
            }
            const src = getSource();
            if (src && src.setPhase) src.setPhase('camera-check-smile');
            renderUI(session.update(0, buildInput()));
        }

        async function retry() {
            if (!session) return;
            const config = getConfig();
            const state = getState();
            const signal = getSignal();
            deniedDemo = false;
            demoLock = false;
            signal.validation = 'Ok';
            signal.faceGoneAt = 0;
            try {
                await stopCamera();
                await startCamera();
                state.cameraCheckNote = null;
                const src = getSource();
                if (src && src.setPhase && session.active) {
                    src.setPhase(`camera-check-${session.active}`);
                }
                renderUI(session.update(0, buildInput()));
            } catch (e) {
                if (!getSource()) {
                    deniedDemo = !config.mock;
                } else {
                    CC.markCameraCheckRequired(state, `Camera could not start: ${e && e.message || e}`);
                    save();
                }
                renderUI(session.update(0, buildInput()));
            }
        }

        async function finish() {
            const goingBack = returnToGarden;
            const dest = goingBack ? returnScreen : gardenDestFrom('idle');
            const state = getState();
            CC.finishCameraSetup(state);
            save();
            session = null;
            lastSnap = null;
            deniedDemo = false;
            returnToGarden = false;
            els.breathGuide.hidden = true;
            els.stretchGuide.hidden = true;
            restorePipHome();
            const src = getSource();
            if (src && src.setPhase) src.setPhase('idle');
            if (goingBack) {
                await stopCamera();
                if (els.preview) els.preview.srcObject = null;
            }
            syncPipVisibility();
            show(dest);
            syncCtas();
        }

        function update(dt) {
            if (!session) return;
            if (demoLock) {
                renderUI(lastSnap);
                return;
            }
            const snap = session.update(dt, buildInput());
            const src = getSource();
            if (session.active && src && src.setPhase) {
                src.setPhase(`camera-check-${session.active}`);
            }
            renderUI(snap);
        }

        function afterWellnessOrResume() {
            if (!CC) {
                console.error('[smile-garden] SmileCameraCheck module missing');
                show(getState().version >= 5 ? 'idle' : 'greeting');
                return;
            }
            if (CC.shouldShowCameraCheck(getState())) void open({ fromStartup: true });
            else show(getState().version >= 5 ? 'idle' : 'greeting');
        }

        function selectCheck(key) {
            if (!session || !key) return;
            demoLock = false;
            session.select(key);
            const src = getSource();
            if (src && src.setPhase) src.setPhase(`camera-check-${key}`);
            renderUI(session.update(0, buildInput()));
        }

        function skipCheck(key) {
            if (!session || !key) return;
            session.skip(key);
            renderUI(session.update(0, buildInput()));
        }

        function markAllPassed() {
            if (!session) return;
            demoLock = true;
            for (const k of CC.CHECKS) session.markPassed(k);
            renderUI(session.update(0, buildInput()));
        }

        function setDemo(opts) {
            const o = opts || {};
            const signal = getSignal();
            deniedDemo = false;
            demoLock = true;
            signal.validation = 'Ok';
            signal.breathing = null;
            session = CC.createCameraCheckSession({
                smileOn: L.DEFAULTS.smileOn,
                Stretch: global.SmileStretch,
            });
            for (const k of (o.passed || [])) session.markPassed(k);
            if (o.active) session.select(o.active);
            signal.h = 0.82;
            signal.talking = o.active === 'talk';
            signal.hAt = performance.now();
            signal.talkAt = performance.now();
            const src = getSource();
            if (src && src.setPhase && o.active) src.setPhase(`camera-check-${o.active}`);
            const input = buildInput();
            input.breathing = null;
            renderUI(session.update(0, input));
        }

        function setDeniedDemo(on) {
            const signal = getSignal();
            demoLock = on;
            deniedDemo = !!on;
            signal.validation = on ? 'CameraPermissionDenied' : 'Ok';
            signal.faceGoneAt = on ? performance.now() : 0;
            signal.hAt = 0;
            signal.talking = false;
            if (on && getScreen() === 'camera-check') {
                session = CC.createCameraCheckSession({
                    smileOn: L.DEFAULTS.smileOn,
                    Stretch: global.SmileStretch,
                });
            }
            if (getScreen() === 'camera-check' && session) {
                renderUI(session.update(0, buildInput()));
            }
        }

        function reset() {
            session = null;
            lastSnap = null;
            deniedDemo = false;
            demoLock = false;
            gridMounted = false;
            returnToGarden = false;
            returnScreen = 'idle';
        }

        return {
            mountGrid,
            open,
            retry,
            finish,
            update,
            afterWellnessOrResume,
            selectCheck,
            skipCheck,
            markAllPassed,
            setDemo,
            setDeniedDemo,
            reset,
            buildInput,
            renderUI,
            get session() { return session; },
            set session(v) { session = v; },
            get lastSnap() { return lastSnap; },
            get deniedDemo() { return deniedDemo; },
            set deniedDemo(v) { deniedDemo = !!v; },
            get demoLock() { return demoLock; },
            set demoLock(v) { demoLock = !!v; },
            get returnToGarden() { return returnToGarden; },
        };
    }

    global.SmileCameraCheckController = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
