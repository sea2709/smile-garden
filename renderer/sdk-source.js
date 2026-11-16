// renderer/sdk-source.js — real SmartSpectra face (+ optional cardio) source.
//
// Bundled by esbuild (`npm run build`) into dist/sdk-source.bundle.js and
// loaded by renderer.js only when NOT in mock mode. Uses only APIs from:
//   - https://smartspectra.presagetech.com/docs/nodejs.md  (Electron integration)
//   - https://smartspectra.presagetech.com/docs/nodejs/metrics.md  (bundles, reading face/cardio fields)
//   - https://smartspectra.presagetech.com/docs/data-types.md  (Face, Expression, DetectionStatus, Cardio, Hrv)
//   - github.com/Presage-Security/SmartSpectra nodejs/samples/electron-quickstart/renderer.js
//
// Exposes window.SmileSources.createSdkSource(config) returning the same tiny
// event interface as the mock source:
//   on(event, cb)  events:
//     status      'Running' | 'Idle' | ...            (ProcessingStatus name)
//     validation  { code, ok, hint }                  (ValidationCode name, leading k stripped)
//     expression  { happiness: 0..1, stable }         (HAPPY ExpressionScore / 100)
//     talking     { detected, stable }                (Face.talking DetectionStatus)
//     landmarks   { points: [{x, y}], stable, space } (Face.landmarks, latest)
//     cardio      { pulse: [{t, value, confidence, stable}], hrv: [{t, rmssd, sdnn, meanNn, baevsky, confidence, stable}] }
//     error       { code, name, message, retryable }
//     stream      MediaStream | null                  (camera preview)
//   start() / stop() / reset() / destroy()  (Promises)

'use strict';

const {
    SmartSpectraSDK,
    ProcessingStatus,
    ValidationCode,
    SmartSpectraErrorCode,
    faceMetrics,
    cardioMetrics,
} = require('@smartspectra/node-sdk/renderer');

// Renderer-safe protobuf decoder (no koffi/FFI on its require graph).
const { decodeMetrics } = require('@smartspectra/node-sdk/messages');

function invert(obj) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k.replace(/^k/, '')]));
}
const STATUS_NAMES = invert(ProcessingStatus);
const VALIDATION_NAMES = invert(ValidationCode);
const ERROR_NAMES = invert(SmartSpectraErrorCode);

function createEmitter() {
    const handlers = Object.create(null);
    return {
        on(evt, cb) { (handlers[evt] = handlers[evt] || []).push(cb); return this; },
        emit(evt, payload) {
            for (const cb of handlers[evt] || []) {
                try { cb(payload); } catch (e) { console.error(`[sdk-source] ${evt} handler failed`, e); }
            }
        },
    };
}

// Timestamps are "absolute ... in microseconds, since Linux epoch"
// (data-types.md) and may decode as a protobufjs Long.
function toSeconds(ts) {
    if (ts === null || ts === undefined) return null;
    const n = typeof ts === 'number' ? ts : Number(ts.toString ? ts.toString() : ts);
    return Number.isFinite(n) && n > 0 ? n / 1e6 : null;
}

function createSdkSource(config) {
    const Logic = window.SmileLogic;
    const em = createEmitter();
    const withCardio = !!config.calmCheck;
    let sdk = null;

    function build() {
        sdk = new SmartSpectraSDK({
            apiKey: config.apiKey,
            // Face bundle = FACE_LANDMARKS, BLINKING, TALKING, EXPRESSIONS.
            // The optional calm check adds the cardio bundle = PULSE_RATE,
            // ARTERIAL_PRESSURE_TRACE, HRV (docs/nodejs/metrics.md "Advanced").
            // TODO(sdk): every official sample also requests breathingMetrics;
            // the docs don't say whether a face-only request is accepted. If
            // start() fails with kConfigurationFailed, add ...breathingMetrics.
            // TODO(sdk): your API key must be authorized for face (and, for the
            // calm check, cardio) metrics, or start() fails with kMetricNotAuthorized.
            requestedMetrics: withCardio ? [...faceMetrics, ...cardioMetrics] : [...faceMetrics],
            enableAccumulatedOutput: false,
            enableTelemetry: config.enableTelemetry !== false,
        });

        sdk.on('processingStatus', (status) => {
            em.emit('status', STATUS_NAMES[status] || `Status(${status})`);
        });

        sdk.on('validationStatus', (code, timestampUs, hint) => {
            em.emit('validation', {
                code: VALIDATION_NAMES[code] || `Code(${code})`,
                ok: code === ValidationCode.kOk,
                hint: hint || '',
            });
        });

        // Each 'metrics' event carries the slice since the previous emit
        // (electron-quickstart renderer.js), so forward every entry.
        sdk.on('metrics', (buf, timestampUs) => {
            let m;
            try { m = decodeMetrics(buf); } catch (e) {
                console.error('[sdk-source] decodeMetrics failed', e);
                return;
            }
            if (!m) return;
            const fallbackT = toSeconds(timestampUs);
            const face = m.face;
            if (face) {
                for (const ex of face.expression || []) {
                    const happiness = Logic.happinessFromExpression(ex);
                    // TODO(sdk): Expression.stable is "considered stable/reliable"
                    // with no real-time guidance; we use every sample and only
                    // show the flag.
                    if (happiness !== null) em.emit('expression', { happiness, stable: !!ex.stable });
                }
                // TODO(sdk): docs don't say whether a laugh registers as
                // talking. game/logic.js has a big-grin fallback.
                const talk = face.talking && face.talking.length ? face.talking[face.talking.length - 1] : null;
                if (talk) em.emit('talking', { detected: !!talk.detected, stable: !!talk.stable });

                const lm = face.landmarks && face.landmarks.length ? face.landmarks[face.landmarks.length - 1] : null;
                if (lm && lm.value && lm.value.length) {
                    em.emit('landmarks', {
                        points: lm.value.map((p) => ({ x: p.x, y: p.y })),
                        stable: !!lm.stable,
                        // TODO(sdk): Point2dFloat x/y coordinate space (frame
                        // pixels vs normalized) isn't documented; renderer auto-detects.
                        space: 'auto',
                    });
                }
            }
            const cardio = m.cardio;
            if (withCardio && cardio) {
                const pulse = (cardio.pulseRate || [])
                    .filter((r) => r && typeof r.value === 'number')
                    .map((r) => ({
                        t: toSeconds(r.timestamp) || fallbackT,
                        value: r.value,
                        // confidence is a percentage [0, 100]; stable <=> confidence >= 40 (data-types.md#cardio).
                        confidence: typeof r.confidence === 'number' ? r.confidence : 0,
                        stable: !!r.stable,
                    }));
                const hrv = (cardio.hrv || [])
                    .filter((h) => h)
                    .map((h) => ({
                        t: toSeconds(h.timestamp) || fallbackT,
                        rmssd: h.rmssd, sdnn: h.sdnn, meanNn: h.meanNn, baevsky: h.baevsky,
                        // stable <=> confidence >= 50 (data-types.md#cardio).
                        confidence: typeof h.confidence === 'number' ? h.confidence : 0,
                        stable: !!h.stable,
                    }));
                if (pulse.length || hrv.length) em.emit('cardio', { pulse, hrv });
            }
        });

        sdk.on('error', (code, message, retryable) => {
            em.emit('error', { code, name: ERROR_NAMES[code] || String(code), message, retryable: !!retryable });
        });

        // The SDK acquires the front camera on start() and hands us the
        // MediaStream for the preview.
        sdk.on('streamAvailable', (stream) => em.emit('stream', stream));
    }

    return {
        kind: 'sdk',
        calmCheck: withCardio,
        on: em.on.bind(em),
        async start() {
            if (!sdk) build();
            await sdk.start();
        },
        async stop() {
            if (!sdk) return;
            try { await sdk.stop(); } finally { em.emit('stream', null); }
        },
        async reset() {
            if (!sdk) return;
            await sdk.reset(); // rebuild after kError; releases the camera
            em.emit('stream', null);
        },
        destroy() {
            if (!sdk) return;
            try { sdk.destroy(); } catch { /* idempotent */ }
            sdk = null;
        },
        setPhase() {},
    };
}

window.SmileSources = window.SmileSources || {};
window.SmileSources.createSdkSource = createSdkSource;
window.SmileSources.sdkVersion = SmartSpectraSDK.version;
