/* ==========================================================================
   sim-defib-i5.js — simulateur Défibrillateur Semi-Automatique Amoul i5
   Scénario : poser les électrodes → analyse → charge → choc → RCP
   ========================================================================== */
(function () {
  'use strict';

  function gauss(x, u, s) { return Math.exp(-((x - u) * (x - u)) / (2 * s * s)); }

  function ecg(rhythm, t) {
    if (rhythm === 'vf') return Math.sin(t * 15) + 0.6 * Math.sin(t * 9.1) + 0.4 * Math.sin(t * 23) + (Math.random() - .5) * 0.5;
    if (rhythm === 'asys') return (Math.random() - .5) * 0.12;
    const ph = (t % 0.8) / 0.8;
    let v = 0;
    v += 0.12 * gauss(ph, 0.12, 0.03);
    v += -0.05 * gauss(ph, 0.20, 0.008);
    v += 1.00 * gauss(ph, 0.23, 0.012);
    v += -0.18 * gauss(ph, 0.26, 0.012);
    v += 0.22 * gauss(ph, 0.40, 0.05);
    return v + (Math.random() - .5) * 0.03;
  }

  function beep(freq, dur, type) {
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      window._ctx = window._ctx || new C();
      const o = window._ctx.createOscillator(), gg = window._ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      gg.gain.setValueAtTime(0.0001, window._ctx.currentTime);
      gg.gain.exponentialRampToValueAtTime(0.18, window._ctx.currentTime + 0.01);
      gg.gain.exponentialRampToValueAtTime(0.0001, window._ctx.currentTime + (dur || 0.15));
      o.connect(gg); gg.connect(window._ctx.destination);
      o.start(); o.stop(window._ctx.currentTime + (dur || 0.15) + 0.02);
    } catch (e) {}
  }

  function create(slide) {
    const cv = slide.querySelector('canvas');
    const g = cv.getContext('2d');
    const $ = function (s) { return slide.querySelector(s); };
    const actions = $('#dActions');
    let raf = 0, last = 0, t = 0, sweep = 0;
    let rhythm = 'vf';
    let shockable = true;
    const st = { phase: 'idle', shocks: 0, energy: 150, startedAt: 0, elapsed: 0 };
    const trace = [];

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = cv.getBoundingClientRect();
      cv.width = Math.max(300, r.width * dpr); cv.height = Math.max(220, r.height * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      st.W = r.width; st.H = r.height;
    }

    function setStatus(cls, txt) {
      const s = $('#dStatus'); if (!s) return;
      s.className = 'lamp ' + cls; s.innerHTML = '<i></i>' + txt;
    }

    function button(label, cls, fn, id) {
      const b = document.createElement('button');
      b.className = 'bigbtn ' + (cls || ''); b.textContent = label;
      if (id) b.id = id;
      b.addEventListener('click', function () { beep(880, .08, 'square'); fn(); });
      return b;
    }

    function prompt(p) {
      st.phase = p;
      actions.innerHTML = '';
      if (p === 'idle') {
        setStatus('bad', 'VICTIME INCONSCIENTE');
        actions.appendChild(button('1 · Poser les électrodes', '', function () { startAnalysis(); }));
        setHint("Sortez le défibrillateur, dénudez le thorax, posez les électrodes.");
      } else if (p === 'analyzing') {
        setStatus('warnl', 'ANALYSE DU RYTHME…');
        setHint("Ne touchez plus la victime pendant l'analyse.");
      } else if (p === 'shock') {
        setStatus('bad', 'CHOC RECOMMANDÉ');
        actions.appendChild(button('2 · Charger (' + st.energy + ' J)', 'warn', charge));
        setHint("Rythme choquable : FV / TV sans pouls. Écartez tout le monde.");
      } else if (p === 'charging') {
        setStatus('warnl', 'CHARGEMENT…');
        setHint("Ne touchez pas le patient.");
      } else if (p === 'ready') {
        setStatus('bad', 'PRÊT — APPUYEZ CHOC');
        const b = button('3 · DÉLIVRER LE CHOC', 'danger', deliver);
        b.classList.add('pulse'); actions.appendChild(b);
        setHint("Annoncez « Tout le monde s'écarte » puis délivrez le choc.");
      } else if (p === 'delivered') {
        setStatus('warnl', 'CHOC DÉLIVRÉ');
        setHint("Reprenez immédiatement les compressions (RCP).");
      } else if (p === 'rosc') {
        setStatus('ok', 'PATIENT SAUVÉ — REPRISE CARDIAQUE');
        actions.appendChild(button('Réinitialiser la démo', '', reset));
        setHint("Signes de circulation présents. Le patient est sauvé — poursuivez la surveillance.");
      } else if (p === 'cpr') {
        setStatus('warnl', 'RCP 2 MIN — puis nouvelle analyse');
        actions.appendChild(button('Nouvelle analyse', '', startAnalysis));
        setHint("Compressions 100–120/min, 5–6 cm de profondeur.");
      }
      const rd = $('#dShocks'); if (rd) rd.textContent = st.shocks;
    }

    function setHint(txt) { const h = $('#dHint'); if (h) h.textContent = txt; }

    function startAnalysis() {
      prompt('analyzing'); rhythm = 'asys';
      beep(660, .12); setTimeout(function () { beep(660, .12); }, 200);
      window.setTimeout(function () {
        if (shockable) { rhythm = 'vf'; prompt('shock'); beep(1046, .5); }
        else { rhythm = 'sinus'; prompt('rosc'); }
      }, 3200);
    }

    function charge() {
      prompt('charging');
      let p = 0;
      const iv = window.setInterval(function () {
        p += 12; const b = actions.querySelector('.bigbtn'); if (b) b.textContent = '2 · Chargement… ' + Math.min(100, p) + '%';
        if (p >= 100) { clearInterval(iv); beep(1320, .4, 'square'); prompt('ready'); }
      }, 180);
    }

    function deliver() {
      prompt('delivered'); st.shocks++;
      rhythm = 'asys'; sweep = 0; // blank during jolt
      const rd = $('#dShocks'); if (rd) rd.textContent = st.shocks;
      window.setTimeout(function () { startAnalysis(); }, 2200);
      // second shock restores rhythm
      shockable = st.shocks < 2;
      if (st.shocks >= 1 && Math.random() > 0.6) shockable = false;
    }

    function reset() {
      st.shocks = 0; shockable = true; rhythm = 'vf'; trace.length = 0;
      const rd = $('#dShocks'); if (rd) rd.textContent = 0;
      prompt('idle');
    }

    function draw() {
      const W = st.W, H = st.H;
      g.fillStyle = '#04101b'; g.fillRect(0, 0, W, H);
      // grid
      g.strokeStyle = 'rgba(0,200,238,.08)'; g.lineWidth = 1;
      for (let x = 0; x < W; x += 26) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y < H; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      const mid = H * 0.56;
      const col = (rhythm === 'vf') ? '#FF5A5F' : (rhythm === 'sinus' ? '#5EE9C4' : '#8FA9BE');
      g.strokeStyle = col; g.lineWidth = 2; g.shadowColor = col; g.shadowBlur = 8;
      g.beginPath();
      const n = trace.length;
      for (let i = 0; i < n; i++) {
        const x = i / 400 * W;
        const y = mid - trace[i] * (H * 0.16);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke(); g.shadowBlur = 0;
      // header
      g.fillStyle = '#8FA9BE'; g.font = '600 11px "JetBrains Mono",monospace';
      g.fillText('ÉCG — 25 mm/s', 12, 20);
      g.fillStyle = col; g.fillText(rhythm.toUpperCase(), W - 90, 20);
      // energy tile
      g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(12, H - 44, 150, 30);
      g.fillStyle = '#FFB020'; g.font = '700 13px "JetBrains Mono",monospace';
      g.fillText('⚡ ' + st.energy + ' J  biphasique', 22, H - 24);
    }

    function loop(ts) {
      raf = requestAnimationFrame(loop);
      if (!last) last = ts;
      let dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      t += dt;
      const PPS = 150, step = 1 / PPS;
      let acc = dt; 
      while (acc > 0) { trace.push(ecg(rhythm, t)); if (trace.length > 400) trace.shift(); acc -= step; if (step <= 0) break; }
      if (st.phase !== 'idle') { st.elapsed += dt; const e = $('#dTime'); if (e) e.textContent = st.elapsed.toFixed(0) + 's'; }
      draw();
    }

    return {
      start: function () {
        if (raf) return;
        resize(); prompt('idle');
        window.addEventListener('resize', resize);
        raf = requestAnimationFrame(loop);
      },
      stop: function () { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
    };
  }

  window.SIMS = window.SIMS || {};
  window.SIMS.defib = {
    _inst: null,
    start: function (slide) { if (!this._inst) this._inst = create(slide); this._inst.start(); },
    stop: function () { if (this._inst) this._inst.stop(); }
  };
})();
