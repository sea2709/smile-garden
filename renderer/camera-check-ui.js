// renderer/camera-check-ui.js — Potting-shed camera check (1280×720 stage layout).
(function () {
    'use strict';

    const CHECKS = Object.freeze(['smile', 'talk', 'breath', 'stretch']);

    const FALLBACK_ICON = Object.freeze({ smile: '☀', talk: '💬', breath: '🍃', stretch: '🌻' });

    function firstOpenCheck(snap) {
        for (const k of CHECKS) {
            if (!snap.passed[k] && !snap.skipped[k]) return k;
        }
        return null;
    }

    function packetState(key, snap, active) {
        if (snap.passed && snap.passed[key]) return 'sprouted';
        if (active === key) return 'listening';
        return 'closed';
    }

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
            const img = document.createElement('img');
            img.dataset.role = 'packet';
            img.alt = '';
            img.src = artUrl(ART.cameraCheck.packetSrc(key, 'closed'));
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
            lab.textContent = 'ready';
            container.appendChild(btn);
            container.appendChild(lab);
        }
    }

    function labelText(key, snap, active) {
        if (snap.passed && snap.passed[key]) return '';
        if (snap.skipped && snap.skipped[key]) return 'Skipped';
        if (active === key) return 'listening…';
        const next = firstOpenCheck(snap);
        if (next === key) return 'next';
        return 'ready';
    }

    function renderPackets(container, snap, active, ART, artUrl) {
        if (!container) return;
        const cc = ART.cameraCheck || {};
        container.querySelectorAll('.cc-packet').forEach((btn) => {
            const k = btn.dataset.check;
            const passed = !!(snap.passed && snap.passed[k]);
            const done = passed || !!(snap.skipped && snap.skipped[k]);
            const state = packetState(k, snap, active);
            btn.classList.toggle('on', k === active);
            btn.classList.toggle('done', done);
            btn.classList.toggle('passed', passed);
            btn.dataset.state = state;
            const img = btn.querySelector('img[data-role="packet"]');
            if (img && cc.packetSrc) {
                img.src = artUrl(cc.packetSrc(k, state));
            }
        });
        container.querySelectorAll('.cc-packet-label').forEach((lab) => {
            const k = lab.dataset.check;
            const text = labelText(k, snap, active);
            lab.textContent = '';
            lab.classList.toggle('ready', text === 'ready');
            if (!text) {
                lab.textContent = '';
                return;
            }
            if (active === k && (k === 'smile' || k === 'talk')) {
                const frac = k === 'smile' ? snap.smileMeter : snap.talkMeter;
                const cap = document.createElement('span');
                cap.textContent = 'listening…';
                const meter = document.createElement('div');
                meter.className = 'cc-meter';
                const fill = document.createElement('i');
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
        mountPackets,
        renderPackets,
        renderStatus,
    });
})();