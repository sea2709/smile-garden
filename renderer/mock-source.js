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
// Keyboard fallback: setKeys({ smile, talk, hide }) switches to manual input
// (hold S / Space to smile, T to talk, F to leave the frame). setAuto(true)
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
        const keys = { smile: false, talk: false, hide: false };
        let h = 0.1;
        let visitT = 0;
        const nowS = () => performance.now() / 1000;

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
                if (phase === 'smile') {
                    target = smileLevel(phaseT);
                    if (night && !darkDone && phaseT > 4 && phaseT < 7.5) {
                        face = false;
                        setValidation('TooDark', 'Scene is too dark');
                    } else {
                        if (night && phaseT >= 7.5) darkDone = true;
                        setValidation('Ok');
                    }
                } else if (phase === 'talk') {
                    talking = talkingAt(phaseT);
                    target = 0.32 + (talking ? 0.1 : 0) + Math.sin(phaseT * 0.9) * 0.05;
                    setValidation('Ok');
                } else {
                    target = 0.14;
                    setValidation('Ok');
                }
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
            } else {
                em.emit('noface', {});
            }
            em.emit('mockFace', { face, happiness: value, talking });

            // Synthetic breathing rate: appears after ~25 s of visit time, settles
            // near ~6 breaths/min (matches the guided standard pace).
            visitT += dt;
            if (visitT > 25) {
                const settling = visitT < 35 && phase !== 'breathe';
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
            setPhase(p) { phase = p; phaseT = 0; },
            setNight(v) { night = !!v; if (!night) darkDone = false; },
            setKeys(k) { Object.assign(keys, k); auto = false; },
            setAuto(v) { auto = !!v; },
            get auto() { return auto; },
        };
    }

    window.SmileSources = window.SmileSources || {};
    window.SmileSources.createMockSource = createMockSource;
})();
