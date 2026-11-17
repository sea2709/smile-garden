// renderer/camera-check-ui.js — Camera check overlay rendering (no game logic).
(function () {
    'use strict';

    const LABELS = Object.freeze({
        smile: { title: 'Smile', sub: 'Happy expression above game threshold ~2 s' },
        talk: { title: 'Talk', sub: 'Face.talking detected ~2 s' },
        breath: { title: 'Breathing', sub: 'Stable breath rate (often 20–30 s)' },
        stretch: { title: 'Neck stretch', sub: 'Tilt each side ~2 s' },
    });

    const FALLBACK_ICON = Object.freeze({ smile: '☀', talk: '💬', breath: '🍃', stretch: '🌻' });

    function imgOrFallback(src, alt, cls, fallback) {
        const img = document.createElement('img');
        img.className = cls;
        img.alt = alt;
        img.src = src;
        img.onerror = () => {
            const span = document.createElement('span');
            span.className = cls + '-fallback';
            span.textContent = fallback;
            img.replaceWith(span);
        };
        return img;
    }

    function mountTestGrid(container, ART, artUrl, handlers) {
        container.textContent = '';
        const checks = ['smile', 'talk', 'breath', 'stretch'];
        const cc = ART.cameraCheck || {};
        for (const key of checks) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cc-test';
            btn.dataset.check = key;
            const iconSrc = cc.icons && cc.icons[key] ? artUrl(cc.icons[key]) : '';
            if (iconSrc) btn.appendChild(imgOrFallback(iconSrc, '', 'cc-test-icon', FALLBACK_ICON[key]));
            else {
                const span = document.createElement('span');
                span.className = 'cc-test-icon-fallback';
                span.textContent = FALLBACK_ICON[key];
                btn.appendChild(span);
            }
            const body = document.createElement('div');
            body.className = 'cc-test-body';
            const t = document.createElement('div');
            t.className = 'cc-test-title';
            t.textContent = LABELS[key].title;
            const sub = document.createElement('div');
            sub.className = 'cc-test-sub';
            sub.textContent = LABELS[key].sub;
            body.append(t, sub);
            btn.appendChild(body);
            const checkSrc = cc.checkPass ? artUrl(cc.checkPass) : '';
            if (checkSrc) {
                btn.appendChild(imgOrFallback(checkSrc, 'Passed', 'cc-check', '✓'));
            } else {
                const ch = document.createElement('span');
                ch.className = 'cc-check';
                ch.textContent = '✓';
                btn.appendChild(ch);
            }
            btn.addEventListener('click', () => handlers.onSelect(key));
            const skip = document.createElement('button');
            skip.type = 'button';
            skip.className = 'btn btn-ghost btn-small';
            skip.textContent = 'Skip';
            skip.addEventListener('click', (e) => { e.stopPropagation(); handlers.onSkip(key); });
            container.appendChild(btn);
            btn.addEventListener('contextmenu', (e) => { e.preventDefault(); handlers.onSkip(key); });
            // skip visible on focus row via detail panel instead
            void skip;
        }
    }

    function renderTests(container, snap, active) {
        container.querySelectorAll('.cc-test').forEach((btn) => {
            const k = btn.dataset.check;
            const passed = snap.passed[k] || snap.skipped[k];
            btn.classList.toggle('done', passed);
            btn.classList.toggle('passed', !!snap.passed[k]);
            btn.classList.toggle('on', k === active);
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

    function renderDetail(detailEl, key, snap, hooks) {
        detailEl.hidden = !key;
        if (!key) {
            detailEl.textContent = '';
            return;
        }
        detailEl.textContent = '';
        const head = document.createElement('div');
        head.className = 'cc-detail-head';
        const title = document.createElement('strong');
        title.textContent = LABELS[key].title;
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'btn btn-ghost btn-small';
        skip.textContent = 'Skip this test';
        skip.addEventListener('click', () => hooks.onSkip(key));
        head.append(title, skip);
        detailEl.appendChild(head);
        const hint = document.createElement('p');
        hint.className = 'note';
        hint.style.margin = '0 0 0.35rem';
        hint.textContent = LABELS[key].sub;
        detailEl.appendChild(hint);
        if (key === 'smile' || key === 'talk') {
            const meter = document.createElement('div');
            meter.className = 'cc-meter';
            const fill = document.createElement('i');
            const frac = key === 'smile' ? snap.smileMeter : snap.talkMeter;
            fill.style.width = `${Math.round(frac * 100)}%`;
            meter.appendChild(fill);
            detailEl.appendChild(meter);
        }
        if (key === 'breath') {
            const note = document.createElement('p');
            note.className = 'note';
            note.textContent = 'Watch the breath rate pill (center): warming → settling → stable. This can take about 20–30 seconds.';
            detailEl.appendChild(note);
        }
        if (key === 'stretch') {
            const note = document.createElement('p');
            note.className = 'note';
            note.textContent = 'Follow the sunflower: tilt toward each shoulder and hold.';
            detailEl.appendChild(note);
        }
    }

    window.SmileCameraCheckUI = Object.freeze({
        LABELS,
        mountTestGrid,
        renderTests,
        renderStatus,
        renderDetail,
    });
})();