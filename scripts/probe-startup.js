// scripts/probe-startup.js — one-shot Electron startup probe (automation only).
'use strict';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function G(wc, expr) {
    try {
        return await wc.executeJavaScript(expr, true);
    } catch (e) {
        console.error('[probe] executeJavaScript failed for:', expr.slice(0, 80), e && e.message || e);
        throw e;
    }
}

async function run(win) {
    const wc = win.webContents;
    await sleep(2000);

    console.log('[probe-initial]', JSON.stringify(await G(wc, `({
        screen: document.body.dataset.screen || '',
        ready: document.body.dataset.ready || '',
        wellnessAck: !!(window.__smileGarden && window.__smileGarden.state && window.__smileGarden.state.wellnessAck),
        ccHidden: !!(document.getElementById('screen-camera-check') && document.getElementById('screen-camera-check').hidden)
    })`)));

    // Acknowledge wellness through the public hook (sync).
    await G(wc, `String((() => {
        const g = window.__smileGarden;
        if (!g) return 'no-hook';
        if (g.state.wellnessAck) return 'already';
        g.state.wellnessAck = true;
        g.ackWellness();
        return 'acked';
    })())`);
    await sleep(2500);

    const afterWellness = await G(wc, `({
        screen: document.body.dataset.screen || '',
        hookScreen: window.__smileGarden ? window.__smileGarden.screen : '',
        ccHidden: !!(document.getElementById('screen-camera-check') && document.getElementById('screen-camera-check').hidden),
        pipHidden: !!(document.getElementById('pip') && document.getElementById('pip').hidden),
        previewStream: !!(document.getElementById('preview') && document.getElementById('preview').srcObject)
    })`);
    console.log('[probe-after-wellness]', JSON.stringify(afterWellness));

    await G(wc, `String((() => {
        const g = window.__smileGarden;
        if (g.markAllCameraChecksPassed) g.markAllCameraChecksPassed();
        g.finishCameraCheck();
        return 'finish-called';
    })())`);
    await sleep(1500);

    await G(wc, `String((() => {
        const g = window.__smileGarden;
        if (g.fillEmpty) g.fillEmpty();
        if (g.makeAllReady) g.makeAllReady();
        return String(g.state.plots.filter(Boolean).length);
    })())`);
    await sleep(500);

    const pick = await G(wc, `(() => {
        const g = window.__smileGarden;
        const c = g.scene.plotClient(0);
        document.getElementById('app').dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, button: 0,
            clientX: c.x, clientY: c.y, pointerId: 1, pointerType: 'mouse'
        }));
        return {
            after: document.body.dataset.screen || '',
            hookScreen: g.screen,
            sessionStep: g.session ? g.session.step : null,
            selected: g.session ? g.session.selectedPlot : null,
            pipHidden: !!(document.getElementById('pip') && document.getElementById('pip').hidden),
            previewStream: !!(document.getElementById('preview') && document.getElementById('preview').srcObject)
        };
    })()`);
    console.log('[probe-pointer]', JSON.stringify(pick));
    await sleep(1500);

    const after = await G(wc, `({
        screen: document.body.dataset.screen || '',
        hookScreen: window.__smileGarden.screen,
        sessionStep: window.__smileGarden.session ? window.__smileGarden.session.step : null,
        selected: window.__smileGarden.session ? window.__smileGarden.session.selectedPlot : null,
        pipHidden: !!(document.getElementById('pip') && document.getElementById('pip').hidden),
        previewStream: !!(document.getElementById('preview') && document.getElementById('preview').srcObject)
    })`);
    console.log('[probe-final]', JSON.stringify(after));

    const playState = await G(wc, `({
        paused: !!(document.getElementById('preview') && document.getElementById('preview').paused),
        hasStream: !!(document.getElementById('preview') && document.getElementById('preview').srcObject),
        pipHidden: !!(document.getElementById('pip') && document.getElementById('pip').hidden)
    })`);
    console.log('[probe-play]', JSON.stringify(playState));

    const okWarmup = afterWellness.hookScreen === 'camera-check' || afterWellness.screen === 'camera-check';
    const okVisit = after.hookScreen === 'visit' || after.sessionStep === 'care-hub';
    if (!okWarmup) {
        console.error('[probe] FAIL: warm-up did not open after wellness');
        require('electron').app.exit(2);
        return;
    }
    if (!okVisit) {
        console.error('[probe] FAIL: bed pointer did not start visit');
        require('electron').app.exit(3);
        return;
    }
    if (playState.hasStream && playState.paused) {
        console.error('[probe] FAIL: visit preview is paused (frozen camera)');
        require('electron').app.exit(4);
        return;
    }
    console.log('[probe] OK');
    require('electron').app.exit(0);
}

module.exports = { run };
