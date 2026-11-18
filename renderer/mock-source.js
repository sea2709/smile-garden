// renderer/mock-source.js — simulated player for demo mode (no SDK, no camera).
//
// Emits the same events as sdk-source.js (status, validation, expression,
// talking, breathing). The renderer tells it which visit step is running with
// setPhase(step); the simulated player then smiles in waves (smile step),
// chats in bursts (talk step) or rests (breathing). At night it once has a
// dim, hard-to-read moment so the "turn on a light" hint can show.
// Breathing rate warms up across the visit (like the real SDK) and becomes
// stable during the breathe step.
//
// Keyboard fallback: setKeys({ smile, talk, hide, tiltLeft, tiltRight })
// (hold S / Space to smile, T to talk, F to hide, [ / ] to tilt for stretch).
// setAuto(true)
// hands control back to the simulated player.

(function () {
    'use strict';

    function createEmitter() {
        const handlers = Object.create(null);
        return {
            on(evt, cb) { (handlers[evt] = handlers[evt] || []).push(cb); return this; },
            emit(evt, payload) {
                for (const cb of handlers[evt] || []) {
                    try { cb(payload); } catch (e) { console.error(`[mock-source] ${evt} handler failed`, e); }
                }
            },
        };
    }

    function createMockSource(options) {
        const opts = Object.assign({ seed: 11, auto: true }, options);
        const L = window.SmileLogic;
        const em = createEmitter();
        const noise = L.mulberry32(opts.seed + 99);
        let timer = null;
        let phase = 'idle';
        let phaseT = 0;
        let lastTick = 0;
        let lastValidation = null;
        let night = false;
        let darkDone = false;
        let auto = opts.auto !== false;
        const keys = { smile: false, talk: false, hide: false, tiltLeft: false, tiltRight: false };
        const Stretch = typeof window !== 'undefined' ? window.SmileStretch : null;
        let h = 0.1;
        let visitT = 0;
        let previewCanvas = null;
        let previewStream = null;
        const nowS = () => performance.now() / 1000;

        function paintPreviewFrame() {
            if (!previewCanvas) {
                previewCanvas = document.createElement('canvas');
                previewCanvas.width = 400;
                previewCanvas.height = 300;
            }
            const ctx = previewCanvas.getContext('2d');
            const g = ctx.createLinearGradient(0, 0, 0, 300);
            g.addColorStop(0, '#6a8ba8');
            g.addColorStop(1, '#c4d4e2');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 400, 300);
            ctx.fillStyle = 'rgba(255, 235, 210, 0.92)';
            ctx.beginPath();
            ctx.ellipse(200, 128, 72, 92, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#4a5560';
            ctx.beginPath();
            ctx.ellipse(172, 112, 10, 7, 0, 0, Math.PI * 2);
            ctx.ellipse(228, 112, 10, 7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#7a4a45';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(200, 140, 28, 0.15, Math.PI - 0.15);
            ctx.stroke();
        }

        function setValidation(code, hint) {
            if (lastValidation === code) return;
            lastValidation = code;
            em.emit('validation', { code, ok: code === 'Ok', hint: hint || '' });
        }

        // Smile step: waves of smiling with short relaxed gaps (~75% smiling).
        function smileLevel(t) {
            const cycle = 7.5;
            const into = t % cycle;
            const n = Math.floor(t / cycle);
            const peak = 0.68 + 0.22 * ((Math.sin(n * 2.3) + 1) / 2);
            if (into < 0.8) return 0.15 + (peak - 0.15) * (into / 0.8);
            if (into < 5.6) return peak + Math.sin(t * 1.7) * 0.04;
            if (into < 6.2) return peak - (peak - 0.18) * ((into - 5.6) / 0.6);
            return 0.18;
        }
        // Talk step: chatting in bursts (~70% talking), a soft friendly face.
        function talkingAt(t) {
            const cycle = 3.4;
            const into = t % cycle;
            return t > 0.8 && into < 2.4;
        }

        function tick() {
            const t = nowS();
            const dt = Math.min(0.1, t - lastTick);
            lastTick = t;
            phaseT += dt;
            let face = true;
            let target = 0.12;
            let talking = false;

            if (auto) {
                if (phase === 'camera-check-smile') {
                    target = smileLevel(phaseT);
                    setValidation('Ok');
                } else if (phase === 'camera-check-talk') {
                    talking = talkingAt(phaseT);
                    target = 0.34 + (talking ? 0.12 : 0);
                    setValidation('Ok');
                } else if (phase === 'camera-check-breath') {
                    target = 0.16;
                    setValidation('Ok');
                    visitT = Math.max(visitT, 32);
                } else if (phase === 'camera-check-stretch') {
                    target = 0.22;
                    setValidation('Ok');
                } else if (phase === 'care-hub-smile' || phase === 'care-hub-talk' || phase === 'care-hub-breathe' || phase === 'care-hub-stretch') {
                    face = true;
                    setValidation('Ok');
                    talking = phase === 'care-hub-talk' || (phase === 'care-hub-breathe' && Math.sin(phaseT) > 0);
                    target = phase === 'care-hub-smile' ? smileLevel(phaseT)
                        : phase === 'care-hub-stretch' ? 0.22
                            : 0.28 + (talking ? 0.12 : 0);
                    if (Stretch && phase === 'care-hub-stretch') {
                        const rollDeg = 20 * Math.sin(phaseT * 0.55);
                        em.emit('landmarks', { points: Stretch.syntheticLandmarks(rollDeg), stable: true, space: 'normalized' });
                    }
                    if (phase === 'care-hub-breathe' && visitT > 20) {
                        const rate = 5.8 + Math.sin(phaseT * 0.4) * 0.3;
                        em.emit('breathing', { rate, confidence: 72, stable: true, t: nowS() });
                    }
                } else if (phase === 'smile' || phase === 'care-smile') {
                    target = smileLevel(phaseT);
                    if (night && !darkDone && phaseT > 4 && phaseT < 7.5) {
                        face = false;
                        setValidation('TooDark', 'Scene is too dark');
                    } else {
                        if (night && phaseT >= 7.5) darkDone = true;
                        setValidation('Ok');
                    }
                } else if (phase === 'talk' || phase === 'care-talk') {
                    talking = talkingAt(phaseT);
                    target = 0.32 + (talking ? 0.1 : 0) + Math.sin(phaseT * 0.9) * 0.05;
                    setValidation('Ok');
                } else {
                    target = 0.14;
                    setValidation('Ok');
                }
            } else if (phase === 'stretch') {
                target = 0.22;
                talking = false;
                setValidation('Ok');
                face = true;
            } else {
                face = !keys.hide;
                target = keys.smile ? 0.86 : 0.12;
                talking = keys.talk;
                setValidation(face ? 'Ok' : 'NoFaceFound', face ? '' : 'No face detected in frame');
            }

            h += (target - h) * Math.min(1, dt / 0.18);
            const value = Math.max(0, Math.min(1, h + (noise() - 0.5) * 0.04));
            if (face) {
                // Percentages like the SDK (ExpressionScore.confidence is 0..100).
                em.emit('expression', { happiness: L.normalizeConfidence(value * 100), stable: true });
                em.emit('talking', { detected: talking, stable: true });
                if (Stretch && (phase === 'stretch' || phase === 'camera-check-stretch' || keys.tiltLeft || keys.tiltRight)) {
                    let rollDeg = 0;
                    if (auto && (phase === 'stretch' || phase === 'camera-check-stretch')) rollDeg = 20 * Math.sin(phaseT * 0.55);
                    else if (keys.tiltLeft) rollDeg = -20;
                    else if (keys.tiltRight) rollDeg = 20;
                    em.emit('landmarks', { points: Stretch.syntheticLandmarks(rollDeg), stable: true, space: 'normalized' });
                }
            } else {
                em.emit('noface', {});
            }
            em.emit('mockFace', { face, happiness: value, talking });

            // Synthetic breathing rate: appears after ~25 s of visit time, settles
            // near ~6 breaths/min (matches the guided standard pace).
            visitT += dt;
            const breathPhase = phase === 'breathe' || phase === 'care-harvest' || phase === 'care-hub-breathe' || phase === 'camera-check-breath';
            if (visitT > 25 || breathPhase) {
                const settling = visitT < 35 && !breathPhase;
                const rate = 5.6 + Math.sin(visitT * 0.35) * 0.35 + (noise() - 0.5) * 0.15;
                const confidence = settling ? 30 + (visitT - 25) : 55 + Math.min(20, visitT - 35);
                em.emit('breathing', {
                    rate,
                    confidence: Math.min(100, confidence),
                    stable: !settling && confidence >= 45,
                    t: nowS(),
                });
            }
        }

        return {
            kind: 'mock',
            on: em.on.bind(em),
            async start() {
                if (timer) return;
                em.emit('status', 'Starting');
                await new Promise((r) => setTimeout(r, 200));
                lastTick = nowS();
                visitT = 0;
                paintPreviewFrame();
                try {
                    if (!previewStream && previewCanvas && typeof previewCanvas.captureStream === 'function') {
                        previewStream = previewCanvas.captureStream(12);
                    }
                } catch (e) {
                    previewStream = null;
                }
                em.emit('stream', previewStream || null);
                timer = setInterval(tick, 1000 / 30);
                em.emit('status', 'Running');
            },
            async stop() {
                clearInterval(timer);
                timer = null;
                em.emit('status', 'Idle');
                em.emit('stream', null);
            },
            async reset() { await this.stop(); },
            destroy() { clearInterval(timer); timer = null; },
            setPhase(p) {
                phase = p;
                phaseT = 0;
                if (p === 'camera-check-breath') visitT = Math.max(visitT, 32);
            },
            setNight(v) { night = !!v; if (!night) darkDone = false; },
            setKeys(k) { Object.assign(keys, k); auto = false; },
            setAuto(v) { auto = !!v; },
            get auto() { return auto; },
        };
    }

    window.SmileSources = window.SmileSources || {};
    window.SmileSources.createMockSource = createMockSource;
})();
