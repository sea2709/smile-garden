// renderer/camera-check-ui.js — Potting-shed camera check (1280×720 stage layout).
(function () {
    'use strict';

    const CHECKS = Object.freeze(['smile', 'talk', 'breath', 'stretch']);

    const LABELS = Object.freeze({
        smile: { title: 'Smile', sub: 'Hold a happy smile ~2 s' },
        talk: { title: 'Talk', sub: 'Talk to the garden ~2 s' },
        breath: { title: 'Breathe', sub: 'Stable breath (~20–30 s)' },
        stretch: { title: 'Neck stretch', sub: 'Tilt each side ~2 s' },
    });

    const FALLBACK_ICON = Object.freeze({ smile: '☀', talk: '💬', breath: '🍃', stretch: '🌻' });

    function mountPackets(container, ART, artUrl, handlers) {
        container.textContent = '';
        const centers = (ART.cameraCheck && ART.cameraCheck.layout && ART.cameraCheck.layout.packetCenters) || {};
        for (const key of CHECKS) {
            const cx = centers[key] || 400;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cc-packet';
            btn.dataset.check = key;
            btn.style.left = `${cx}px`;
            btn.title = LABELS[key].title;
            const img = document.createElement('img');
            img.dataset.role = 'packet';
            img.alt = '';
            img.src = artUrl(ART.cameraCheck.packetSrc(key, false));
            img.onerror = () => {
                const fb = document.createElement('span');
                fb.className = 'cc-packet-fallback';
                fb.textContent = FALLBACK_ICON[key];
                img.replaceWith(fb);
            };
            btn.appendChild(img);
            btn.addEventListener('click', () => handlers.onSelect(key));
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                handlers.onSkip(key);
            });
            const lab = document.createElement('div');
            lab.className = 'cc-packet-label';
            lab.dataset.check = key;
            lab.style.left = `${cx}px`;
            lab.textContent = LABELS[key].title;
            container.appendChild(btn);
            container.appendChild(lab);
        }
    }

    function labelText(key, snap, active, extras) {
        if (snap.passed[key]) return '✓ Sprouted';
        if (snap.skipped[key]) return 'Skipped';
        if (active !== key) return LABELS[key].title;
        if (key === 'smile') {
            const pct = Math.round((snap.smileMeter || 0) * 100);
            return pct > 0 ? `Smile ${pct}%` : LABELS.smile.sub;
        }
        if (key === 'talk') {
            const pct = Math.round((snap.talkMeter || 0) * 100);
            return pct > 0 ? `Talking ${pct}%` : LABELS.talk.sub;
        }
        if (key === 'breath') {
            return (extras && extras.breathLabel) || 'Listening…';
        }
        if (key === 'stretch' && snap.stretchSnap) {
            if (snap.stretchSnap.complete) return '✓ Both sides';
            const side = snap.stretchSnap.activeSide;
            if (side === 'left') return 'Hold left tilt…';
            if (side === 'right') return 'Hold right tilt…';
            return LABELS.stretch.sub;
        }
        return LABELS[key].sub;
    }

    function renderPackets(container, snap, active, ART, artUrl, extras) {
        if (!container) return;
        const cc = ART.cameraCheck || {};
        container.querySelectorAll('.cc-packet').forEach((btn) => {
            const k = btn.dataset.check;
            const passed = !!(snap.passed && snap.passed[k]);
            const done = passed || !!(snap.skipped && snap.skipped[k]);
            btn.classList.toggle('on', k === active);
            btn.classList.toggle('done', done);
            btn.classList.toggle('passed', passed);
            const img = btn.querySelector('img[data-role="packet"]');
            if (img && cc.packetSrc) {
                img.src = artUrl(cc.packetSrc(k, passed));
            }
        });
        container.querySelectorAll('.cc-packet-label').forEach((lab) => {
            const k = lab.dataset.check;
            const text = labelText(k, snap, active, extras);
            lab.textContent = '';
            if (active === k && (k === 'smile' || k === 'talk')) {
                const cap = document.createElement('span');
                cap.textContent = text.replace(/ \d+%$/, '') + ' ';
                const meter = document.createElement('div');
                meter.className = 'cc-meter';
                const fill = document.createElement('i');
                const frac = k === 'smile' ? snap.smileMeter : snap.talkMeter;
                fill.style.width = `${Math.round((frac || 0) * 100)}%`;
                meter.appendChild(fill);
                lab.append(cap, meter);
            } else {
                lab.textContent = text;
            }
        });
    }

    function renderStatus(faceEl, lightEl, camEl, snap) {
        faceEl.className = 'cc-status-row' + (snap.faceFound ? ' ok' : ' bad');
        faceEl.innerHTML = '<span class="dot"></span><span>Face found</span>';
        lightEl.className = 'cc-status-row' + (snap.lightingOk ? ' ok' : (snap.faceFound ? ' warn' : ''));
        lightEl.innerHTML = '<span class="dot"></span><span>Lighting OK</span>';
        const msg = snap.cameraMessage;
        if (msg && msg.text) {
            camEl.hidden = false;
            camEl.className = 'cc-status-row ' + (msg.level === 'error' ? 'bad' : 'warn');
            camEl.innerHTML = `<span class="dot"></span><span>${msg.text}</span>`;
        } else {
            camEl.hidden = true;
            camEl.textContent = '';
        }
    }

    window.SmileCameraCheckUI = Object.freeze({
        CHECKS,
        LABELS,
        mountPackets,
        renderPackets,
        renderStatus,
    });
})();