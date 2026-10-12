/* ==========================================================================
   sim-cpr-e6e8.js — simulateur de massages cardiaques (Amoul E6 / E8)
   Mode manuel (assistant RCP) + mode automatique 3D (E8).
   Mesure la fréquence et la profondeur, retour temps réel + métronome.
   ========================================================================== */
(function () {
  'use strict';

  function tone(freq, dur) {
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      window._ctx = window._ctx || new C();
      const o = window._ctx.createOscillator(), gg = window._ctx.createGain();
      o.type = 'square'; o.frequency.value = freq;
      gg.gain.setValueAtTime(0.0001, window._ctx.currentTime);
      gg.gain.exponentialRampToValueAtTime(0.14, window._ctx.currentTime + 0.005);
      gg.gain.exponentialRampToValueAtTime(0.0001, window._ctx.currentTime + (dur || 0.06));
      o.connect(gg); gg.connect(window._ctx.destination);
      o.start(); o.stop(window._ctx.currentTime + (dur || 0.06) + 0.02);
    } catch (e) {}
  }

  function create(slide) {
    const cv = slide.querySelector('canvas');
    const g = cv.getContext('2d');
    const $ = function (s) { return slide.querySelector(s); };
    const st = {
      mode: 'manual', bpm: 110, playing: true, beat: 0,
      rate: 0, depth: 0, good: 0, total: 0,
      comps: [], liveDepth: 0, autoPhase: 0
    };
    let raf = 0, last = 0, metronomeAcc = 0, downAt = 0, autoAcc = 0;

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = cv.getBoundingClientRect();
      cv.width = Math.max(300, r.width * dpr); cv.height = Math.max(220, r.height * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      st.W = r.width; st.H = r.height;
    }

    function pushCompression(depth) {
      const now = performance.now() / 1000;
      st.comps.push({ t: now, depth: depth });
      if (st.comps.length > 12) st.comps.shift();
      st.liveDepth = depth;
      // rate from intervals
      if (st.comps.length >= 3) {
        const a = st.comps[st.comps.length - 3], b = st.comps[st.comps.length - 1];
        const iv = (b.t - a.t) / 2;
        if (iv > 0) st.rate = Math.round(60 / iv);
      }
      st.depth = depth;
      st.total++;
      if (st.rate >= 100 && st.rate <= 120 && depth >= 5 && depth <= 6) st.good++;
      tone(150, 0.05);
    }

    function rateColor() { return (st.rate >= 100 && st.rate <= 120) ? '#5EE9C4' : (st.rate > 0 ? '#FFB020' : '#8FA9BE'); }
    function depthColor() { return (st.depth >= 5 && st.depth <= 6) ? '#5EE9C4' : (st.depth > 0 ? '#FFB020' : '#8FA9BE'); }

    function manualDown() {
      if (st.mode !== 'manual') return;
      downAt = performance.now();
    }
    function manualUp() {
      if (st.mode !== 'manual' || !downAt) return;
      const held = (performance.now() - downAt) / 1000;
      downAt = 0;
      // 90ms..320ms de maintien => 3.2..6.8 cm
      let d = 3.2 + (Math.min(0.32, Math.max(0.09, held)) - 0.09) / (0.32 - 0.09) * (6.8 - 3.2);
      pushCompression(Math.round(d * 10) / 10);
    }

    function draw() {
      const W = st.W, H = st.H;
      g.fillStyle = '#04101b'; g.fillRect(0, 0, W, H);
      // depth chart area
      const x0 = 54, x1 = W - 16, y0 = 22, y1 = H - 54;
      // target band 5-6 cm
      const depthToY = function (d) { return y1 - (d / 8) * (y1 - y0); };
      g.fillStyle = 'rgba(94,233,196,.12)';
      g.fillRect(x0, depthToY(6), x1 - x0, depthToY(5) - depthToY(6));
      g.strokeStyle = 'rgba(94,233,196,.4)'; g.setLineDash([5, 5]); g.lineWidth = 1;
      [5, 6].forEach(function (d) { g.beginPath(); g.moveTo(x0, depthToY(d)); g.lineTo(x1, depthToY(d)); g.stroke(); });
      g.setLineDash([]);
      // axis
      g.strokeStyle = 'rgba(255,255,255,.14)';
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y1); g.stroke();
      g.fillStyle = '#8FA9BE'; g.font = '600 10px "JetBrains Mono",monospace'; g.textAlign = 'right';
      for (let d = 0; d <= 8; d += 2) { const y = depthToY(d); g.fillText(d + '', x0 - 8, y + 3); }
      g.textAlign = 'left'; g.fillText('profondeur (cm)', x0 + 4, y0 - 6);
      g.fillStyle = '#5EE9C4'; g.fillText('CIBLE 5–6 cm', 12, y1 + 20);

      // live compression cursor (vertical bar following last compression + decay)
      const now = performance.now() / 1000;
      const since = st.comps.length ? now - st.comps[st.comps.length - 1].t : 99;
      const decay = Math.max(0, st.liveDepth * Math.exp(-since * 3));
      const cx = x0 + (x1 - x0) * 0.82;
      const cy = depthToY(decay);
      g.strokeStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.moveTo(cx, y0); g.lineTo(cx, y1); g.stroke();
      g.fillStyle = decay >= 5 && decay <= 6 ? '#5EE9C4' : '#00C8EE';
      g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = '700 12px "JetBrains Mono",monospace';
      g.fillText(decay.toFixed(1) + ' cm', cx + 12, cy + 4);

      // trace of recent compressions depth
      g.strokeStyle = '#00C8EE'; g.lineWidth = 2; g.beginPath();
      const recent = st.comps.slice(-10);
      recent.forEach(function (c, i) {
        const x = x0 + (i + 1) / 11 * (x1 - x0) * 0.7;
        const y = depthToY(c.depth);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.stroke();
      recent.forEach(function (c, i) {
        const x = x0 + (i + 1) / 11 * (x1 - x0) * 0.7;
        const y = depthToY(c.depth);
        g.fillStyle = c.depth >= 5 && c.depth <= 6 ? '#5EE9C4' : '#FFB020';
        g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      });

      // big readouts bottom
      g.font = '800 22px "JetBrains Mono",monospace';
      g.fillStyle = rateColor(); g.fillText(st.rate + '', x1 - 200, y1 + 34);
      g.font = '600 10px "JetBrains Mono",monospace'; g.fillStyle = '#8FA9BE'; g.fillText('COMPR./MIN', x1 - 200, y1 + 46);
      g.font = '800 22px "JetBrains Mono",monospace';
      g.fillStyle = depthColor(); g.fillText(st.depth.toFixed(1), x1 - 110, y1 + 34);
      g.font = '600 10px "JetBrains Mono",monospace'; g.fillStyle = '#8FA9BE'; g.fillText('cm ACTUEL', x1 - 110, y1 + 46);
      const score = st.total ? Math.round(st.good / st.total * 100) : 0;
      g.font = '800 22px "JetBrains Mono",monospace'; g.fillStyle = '#5EE9C4';
      g.fillText(score + '%', x1 - 34, y1 + 34);
      g.fillStyle = '#8FA9BE'; g.font = '600 10px "JetBrains Mono",monospace'; g.fillText('QUALITÉ', x1 - 34, y1 + 46);
    }

    function loop(ts) {
      raf = requestAnimationFrame(loop);
      if (!last) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000); last = ts;

      // metronome
      if (st.playing) {
        metronomeAcc += dt;
        const period = 60 / st.bpm;
        if (metronomeAcc >= period) { metronomeAcc -= period; st.beat = 1; tone(1000, 0.04); }
        else if (st.beat && metronomeAcc > 0.05) { st.beat = 0; }
      }
      // auto mode compression
      if (st.mode === 'auto' && st.playing) {
        autoAcc += dt;
        if (autoAcc >= 60 / st.bpm) {
          autoAcc -= 60 / st.bpm;
          pushCompression(Math.round((5.3 + Math.sin(ts / 500) * 0.35) * 10) / 10);
        }
      }
      if (st.comps.length && st.mode === 'manual') {
        // decay rate if no compression for 3s
        const since = performance.now() / 1000 - st.comps[st.comps.length - 1].t;
        if (since > 3) { st.rate = 0; st.depth = 0; }
      }
      const bd = $('#cBeatDot'); if (bd) bd.style.opacity = st.beat ? '1' : '.25';
      draw();
    }

    function bind() {
      const stage = slide.querySelector('.sim__stage');
      stage.addEventListener('pointerdown', manualDown);
      window.addEventListener('pointerup', manualUp);
      const keyDown = function (e) { if (e.code === 'Space' && slide.classList.contains('is-active')) { const tag = (e.target.tagName || ''); if (tag !== 'INPUT' && tag !== 'BUTTON') { e.preventDefault(); manualDown(); } } };
      const keyUp = function (e) { if (e.code === 'Space') manualUp(); };
      document.addEventListener('keydown', keyDown);
      document.addEventListener('keyup', keyUp);
      slide.querySelectorAll('[data-cprmode]').forEach(function (b) {
        b.addEventListener('click', function () {
          st.mode = b.dataset.cprmode;
          slide.querySelectorAll('[data-cprmode]').forEach(function (o) { o.classList.toggle('on', o === b); });
          const hint = $('#cHint');
          if (hint) hint.textContent = st.mode === 'auto'
            ? "Mode automatique E8 : compressions 3D continues (sans fatigue)."
            : "Mode manuel : cliquez/maintenez sur la zone de compression, ou touchez ESPACE (appui bref et net).";
          const man = $('#cManualArea'); if (man) man.style.display = st.mode === 'manual' ? 'flex' : 'none';
        });
      });
      const bpm = $('#cBpm');
      if (bpm) bpm.addEventListener('input', function () { st.bpm = parseInt(bpm.value, 10); const v = $('#cBpmv'); if (v) v.textContent = st.bpm + '/min'; });
      const pp = $('#cPlay'); if (pp) pp.addEventListener('click', function () { st.playing = !st.playing; pp.textContent = st.playing ? 'Pause' : 'Démarrer'; });
      const rs = $('#cReset'); if (rs) rs.addEventListener('click', function () { st.comps = []; st.rate = 0; st.depth = 0; st.good = 0; st.total = 0; });
    }

    return {
      start: function () {
        if (raf) return;
        resize(); bind();
        window.addEventListener('resize', resize);
        raf = requestAnimationFrame(loop);
      },
      stop: function () { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
    };
  }

  window.SIMS = window.SIMS || {};
  window.SIMS.cpr = {
    _inst: null,
    start: function (slide) { if (!this._inst) this._inst = create(slide); this._inst.start(); },
    stop: function () { if (this._inst) this._inst.stop(); }
  };
})();
