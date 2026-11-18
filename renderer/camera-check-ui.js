// renderer/camera-check-ui.js — Potting-shed camera check (1280×720 stage layout).
(function () {
    'use strict';

    const CHECKS = Object.freeze(['smile', 'talk', 'breath', 'stretch']);

    const PACKET_TITLES = Object.freeze({
        smile: 'Smile',
        talk: 'Talk',
        breath: 'Breathe',
        stretch: 'Neck stretch',
    });

    /** Care action each camera check packet trains (Heily repaints packet art to match). */
    const PACKET_CARE = Object.freeze({
        smile: 'Water',
        talk: 'Fertilize',
        breath: 'Harvest',
        stretch: 'Stake',
    });

    const FALLBACK_ICON = Object.freeze({ smile: '☀', talk: '💬', breath: '🍃', stretch: '🌻' });

    function firstOpenCheck(snap) {
        for (const k of CHECKS) {
            if (!snap.passed[k] && !snap.skipped[k]) return k;
        }
        return null;
    }

    function queuedNextCheck(snap, active) {
        if (active && CHECKS.includes(active)) {
            const start = CHECKS.indexOf(active) + 1;
            for (let i = start; i < CHECKS.length; i++) {
                const k = CHECKS[i];
                if (!snap.passed?.[k] && !snap.skipped?.[k]) return k;
            }
        }
        return firstOpenCheck(snap);
    }

    function packetState(key, snap, active, denied) {
        if (denied) return 'closed';
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
            renderPacketLabel(lab, key, { passed: {}, skipped: {} }, null, false);
            container.appendChild(btn);
            container.appendChild(lab);
        }
    }

    function statusText(key, snap, active, denied) {
        if (denied) {
            const next = firstOpenCheck(snap);
            return next === key ? 'next' : 'waiting';
        }
        if (snap.skipped && snap.skipped[key]) return 'Skipped';
        if (snap.passed && snap.passed[key]) return 'ready';
        if (active === key) return 'listening…';
        const next = queuedNextCheck(snap, active);
        return next === key ? 'next' : 'waiting';
    }

    function renderPacketLabel(lab, key, snap, active, denied) {
        const title = PACKET_TITLES[key] || key;
        const status = statusText(key, snap, active, denied);
        lab.textContent = '';
        lab.classList.toggle('ready', status === 'ready');
        const name = document.createElement('strong');
        name.className = 'cc-packet-name';
        name.textContent = title;
        const care = document.createElement('span');
        care.className = 'cc-packet-care';
        care.textContent = PACKET_CARE[key] || '';
        const line = document.createElement('small');
        line.className = 'cc-packet-status';
        lab.append(name, care, line);
        if (active === key && !denied && !(snap.passed && snap.passed[key]) && (key === 'smile' || key === 'talk')) {
            line.textContent = 'listening…';
            const frac = key === 'smile' ? snap.smileMeter : snap.talkMeter;
            const meter = document.createElement('div');
            meter.className = 'cc-meter';
            const fill = document.createElement('i');
            fill.style.width = `${Math.round((frac || 0) * 100)}%`;
            meter.appendChild(fill);
            lab.appendChild(meter);
        } else {
            line.textContent = status;
        }
    }

    function renderPackets(container, snap, active, ART, artUrl, opts) {
        if (!container) return;
        const denied = !!(opts && opts.denied);
        const cc = ART.cameraCheck || {};
        container.querySelectorAll('.cc-packet').forEach((btn) => {
            const k = btn.dataset.check;
            const passed = !denied && !!(snap.passed && snap.passed[k]);
            const done = passed || !!(snap.skipped && snap.skipped[k]);
            const state = packetState(k, snap, active, denied);
            btn.classList.toggle('on', !denied && k === active);
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
            renderPacketLabel(lab, k, snap, active, denied);
        });
    }

    function renderStatus(faceEl, lightEl, camEl, snap, opts) {
        const denied = !!(opts && opts.denied) || !!(snap && snap.cameraDenied);
        const noCamera = denied || !!(snap && snap.noCamera);
        if (noCamera) {
            faceEl.hidden = false;
            faceEl.className = 'cc-status-row bad';
            faceEl.innerHTML = '<span class="dot"></span><span>No camera</span>';
            lightEl.hidden = true;
            lightEl.textContent = '';
        } else {
            faceEl.hidden = false;
            lightEl.hidden = false;
            faceEl.className = 'cc-status-row' + (snap.faceFound ? ' ok' : ' bad');
            faceEl.innerHTML = '<span class="dot"></span><span>Face found</span>';
            lightEl.className = 'cc-status-row' + (snap.lightingOk ? ' ok' : (snap.faceFound ? ' warn' : ''));
            lightEl.innerHTML = '<span class="dot"></span><span>Lighting OK</span>';
        }
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