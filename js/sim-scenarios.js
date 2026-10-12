/* ==========================================================================
   sim-scenarios.js — cas cliniques interactifs (T6 ventilateur / E6 RCP)
   Deux scénarios « concrets » avec physiologie simplifiée et retour guidé.
   ========================================================================== */
(function () {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function tone(freq, dur, type) {
    try {
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      window._ctx = window._ctx || new C();
      var o = window._ctx.createOscillator(), gg = window._ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      gg.gain.setValueAtTime(0.0001, window._ctx.currentTime);
      gg.gain.exponentialRampToValueAtTime(0.14, window._ctx.currentTime + 0.01);
      gg.gain.exponentialRampToValueAtTime(0.0001, window._ctx.currentTime + (dur || 0.12));
      o.connect(gg); gg.connect(window._ctx.destination);
      o.start(); o.stop(window._ctx.currentTime + (dur || 0.12) + 0.02);
    } catch (e) {}
  }

  function fitCanvas(cv, g) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var r = cv.getBoundingClientRect();
    cv.width = Math.max(320, r.width * dpr); cv.height = Math.max(240, r.height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { W: r.width, H: r.height };
  }

  function drawTrace(g, arr, x, y, w, h, min, max, color, blur) {
    if (!arr.length) return;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.strokeStyle = color; g.lineWidth = 2; g.lineJoin = 'round';
    if (blur) { g.shadowColor = color; g.shadowBlur = blur; }
    g.beginPath();
    var n = arr.length;
    for (var i = 0; i < n; i++) {
      var xx = x + i / (n - 1 || 1) * w;
      var yy = y + h - (arr[i] - min) / (max - min) * h;
      i ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
    }
    g.stroke(); g.restore();
  }

  function grid(g, x, y, w, h) {
    g.strokeStyle = 'rgba(0,200,238,.07)'; g.lineWidth = 1;
    for (var i = 0; i <= 4; i++) { var yy = y + h * i / 4; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
    for (var j = 0; j <= 6; j++) { var xx = x + w * j / 6; g.beginPath(); g.moveTo(xx, y); g.lineTo(xx, y + h); g.stroke(); }
  }

  /* ======================================================================
     SCÉNARIO T6 — SDRA : régler le ventilateur (protection pulmonaire)
     ====================================================================== */
  function createT6(slide) {
    var cv = slide.querySelector('.sim__stage canvas');
    var g = cv.getContext('2d');
    var $ = function (s) { return slide.querySelector(s); };
    var KG = 66, C = 25, TIFRAC = 0.35;
    var st = { mode: 'VCV', vt: 500, peep: 5, fio2: 40, rr: 16, pinsp: 20, playing: true };
    var paw = [], pleth = [], capno = [];
    var raf = 0, last = 0, t = 0, stable = 0, done = false, W = 800, H = 340;

    function resize() { var s = fitCanvas(cv, g); W = s.W; H = s.H; }

    function physio() {
      var vt = (st.mode === 'VCV') ? st.vt : Math.min(1000, C * st.pinsp);
      var pplat = st.peep + vt / C;
      var drive = pplat - st.peep;
      var perKg = vt / KG;
      var recruit = clamp(0.52 + 0.48 * (st.peep - 5) / 12, 0.4, 1.0);
      var hyper = st.peep > 15 ? 1 - 0.15 * (st.peep - 15) / 5 : 1;
      var pao2 = clamp((st.fio2 / 21) * 55 * recruit * hyper, 18, 500);
      var spo2 = 100 * Math.pow(pao2, 2.6) / (Math.pow(pao2, 2.6) + Math.pow(27, 2.6));
      var mv = vt * st.rr / 1000;
      var etco2 = clamp(38 * (6.8 / Math.max(0.6, mv)), 12, 85);
      return { vt: vt, pplat: pplat, drive: drive, perKg: perKg, pao2: pao2, spo2: spo2, mv: mv, etco2: etco2 };
    }

    function pushTraces(p) {
      var ph = (t % (60 / st.rr)) / (60 / st.rr);
      var pw;
      if (ph < TIFRAC) { pw = st.peep + (p.pplat - st.peep) * Math.min(1, ph / (TIFRAC * 0.7)); }
      else { var u = (ph - TIFRAC) / (1 - TIFRAC); pw = st.peep + (p.pplat - st.peep) * Math.exp(-u * 5); }
      paw.push(pw); if (paw.length > 300) paw.shift();

      var amp = 2 + (p.spo2 - 70) * 0.25;
      pleth.push(Math.max(0, amp * Math.abs(Math.sin(t * Math.PI * 2 / 0.8)) * (0.6 + 0.4 * Math.sin(t * 9))));
      if (pleth.length > 300) pleth.shift();

      var cph = (t % (60 / st.rr)) / (60 / st.rr);
      var cw;
      if (cph < 0.55) cw = 0;
      else if (cph < 0.68) cw = p.etco2 * (cph - 0.55) / 0.13;
      else if (cph < 0.92) cw = p.etco2 * (0.9 + 0.1 * Math.sin((cph - 0.68) * 40));
      else cw = p.etco2 * (0.92 - cph) / 0.08;
      capno.push(clamp(cw, 0, 60)); if (capno.length > 300) capno.shift();
    }

    function goals(p) {
      return {
        spo2: p.spo2 >= 92 && p.spo2 <= 97,
        pplat: p.pplat <= 30,
        drive: p.drive <= 15,
        vt: p.perKg >= 6 && p.perKg <= 8,
        co2: p.etco2 >= 35 && p.etco2 <= 45
      };
    }

    function setGoals(p) {
      var o = goals(p);
      var all = true;
      slide.querySelectorAll('#t6Goals .goal').forEach(function (el) {
        var k = el.getAttribute('data-g'); var on = !!o[k]; if (!on) all = false;
        el.classList.toggle('on', on);
      });
      return all;
    }

    function setStatus(cls, txt) {
      var s = $('#t6Status'); if (!s) return;
      s.className = 'lamp ' + cls; s.innerHTML = '<i></i>' + txt;
    }

    function advise(p) {
      var h = $('#t6Hint'); if (!h) return;
      var msg;
      if (done) { msg = 'Patient stabilisé — ventilation protectrice et oxygénation adaptée.'; }
      else if (p.spo2 < 88) msg = 'Hypoxémie sévère : augmentez la FiO₂ (puis la PEEP si besoin).';
      else if (p.pplat > 30 || p.drive > 15) msg = 'Pression plateau / motrice trop élevée : réduisez le volume courant.';
      else if (p.perKg > 8) msg = 'Volume courant non protecteur (> 8 mL/kg) : visez ~6 mL/kg (' + Math.round(6 * KG) + ' mL).';
      else if (p.etco2 > 50) msg = 'Hypercapnie : augmentez la fréquence respiratoire.';
      else if (st.fio2 >= 80 && p.spo2 > 98) msg = 'Hyperoxie : réduisez la FiO₂ pour viser 92–97 %.';
      else if (st.peep > 15) msg = 'PEEP élevée : surveillez la pression artérielle (risque d’hyperinflation).';
      else msg = 'Ajustez finement : FiO₂/PEEP pour la SpO₂, VT/FR pour l’EtCO₂ et les pressions.';
      h.textContent = msg;
    }

    function draw(p) {
      g.fillStyle = '#04101b'; g.fillRect(0, 0, W, H);
      var pad = 14, gap = 12;
      var bh = (H - pad * 2 - gap * 2) / 3;
      var x = pad, w = W - pad * 2;
      var bands = [
        { y: pad, color: '#00C8EE', lab: 'Paw (pression voies aériennes)', min: -5, max: Math.max(35, p.pplat + 6) },
        { y: pad + bh + gap, color: '#5EE9C4', lab: 'Pléthysmographie (SpO₂)', min: 0, max: 100 },
        { y: pad + (bh + gap) * 2, color: '#FFB020', lab: 'Capnogramme (EtCO₂)', min: 0, max: 60 }
      ];
      bands.forEach(function (b) { grid(g, x, b.y, w, bh); });
      drawTrace(g, paw, x, bands[0].y, w, bh, bands[0].min, bands[0].max, '#00C8EE', 6);
      drawTrace(g, pleth, x, bands[1].y, w, bh, bands[1].min, bands[1].max, '#5EE9C4', 6);
      drawTrace(g, capno, x, bands[2].y, w, bh, bands[2].min, bands[2].max, '#FFB020', 6);

      g.font = '600 10px "JetBrains Mono",monospace'; g.textAlign = 'left';
      g.fillStyle = '#8FA9BE';
      g.fillText(bands[0].lab, x + 6, bands[0].y + 12);
      g.fillText(bands[1].lab, x + 6, bands[1].y + 12);
      g.fillText(bands[2].lab, x + 6, bands[2].y + 12);

      var spo2c = p.spo2 >= 92 ? '#5EE9C4' : '#FF5A5F';
      g.textAlign = 'right';
      g.font = '800 26px "JetBrains Mono",monospace'; g.fillStyle = spo2c;
      g.fillText(p.spo2.toFixed(0) + '%', x + w - 8, bands[1].y + 26);
      g.font = '600 10px "JetBrains Mono",monospace'; g.fillStyle = '#8FA9BE';
      g.fillText('SpO₂', x + w - 8, bands[1].y + 40);
      g.font = '800 22px "JetBrains Mono",monospace'; g.fillStyle = '#FFB020';
      g.fillText(p.etco2.toFixed(0), x + w - 8, bands[2].y + 26);
      g.font = '600 10px "JetBrains Mono",monospace'; g.fillStyle = '#8FA9BE';
      g.fillText('EtCO₂ mmHg', x + w - 8, bands[2].y + 40);
      g.font = '800 20px "JetBrains Mono",monospace';
      g.fillStyle = p.pplat <= 30 ? '#00C8EE' : '#FF5A5F';
      g.fillText('Pplat ' + p.pplat.toFixed(0), x + w - 8, bands[0].y + 24);
      g.font = '600 10px "JetBrains Mono",monospace'; g.fillStyle = '#8FA9BE';
      g.fillText('Pmotrice ' + p.drive.toFixed(0) + '  ·  VT ' + p.vt.toFixed(0) + ' mL', x + w - 8, bands[0].y + 38);
    }

    function loop(ts) {
      raf = requestAnimationFrame(loop);
      if (!last) last = ts;
      var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      if (st.playing) t += dt;
      var p = physio();
      pushTraces(p);
      var all = setGoals(p);
      if (st.playing && all) { stable += dt; } else { stable = 0; if (!all) done = false; }
      if (stable > 4 && !done) { done = true; tone(1046, 0.3); setStatus('ok', 'PATIENT STABILISÉ — OBJECTIFS ATTEINTS'); }
      if (!done) {
        if (p.spo2 < 88 || p.pplat > 30 || p.drive > 15) setStatus('bad', 'ALARME — RÉGLAGE INADAPTÉ');
        else setStatus('warnl', 'VENTILATION EN COURS');
      }
      advise(p);
      draw(p);
    }

    function bind() {
      function rng(sel, prop, fmt) {
        var el = $(sel); if (!el) return;
        el.addEventListener('input', function () { st[prop] = parseFloat(el.value); if (fmt) $(sel + 'v').textContent = fmt(el.value); });
      }
      rng('#t6Vt', 'vt', function (v) { return v + ' mL'; });
      rng('#t6Peep', 'peep', function (v) { return v + ' cmH₂O'; });
      rng('#t6Fio2', 'fio2', function (v) { return v + ' %'; });
      rng('#t6Rr', 'rr', function (v) { return v + ' /min'; });
      rng('#t6Pinsp', 'pinsp', function (v) { return v + ' cmH₂O'; });
      slide.querySelectorAll('[data-mode]').forEach(function (b) {
        b.addEventListener('click', function () {
          st.mode = b.dataset.mode;
          slide.querySelectorAll('[data-mode]').forEach(function (o) { o.classList.toggle('on', o === b); });
          var pc = $('#t6PcvOnly'); if (pc) pc.style.display = st.mode === 'PCV' ? 'flex' : 'none';
        });
      });
      var pp = $('#t6Play');
      if (pp) pp.addEventListener('click', function () { st.playing = !st.playing; pp.textContent = st.playing ? 'Pause' : 'Reprendre'; });
    }

    return {
      start: function () { if (raf) return; resize(); bind(); window.addEventListener('resize', resize); raf = requestAnimationFrame(loop); },
      stop: function () { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
    };
  }

  /* ======================================================================
     SCÉNARIO E6 — arrêt cardiaque préhospitalier : E6 (RCP mécanique) + i5
     ====================================================================== */
  function createE6(slide) {
    var cv = slide.querySelector('.sim__stage canvas');
    var g = cv.getContext('2d');
    var $ = function (s) { return slide.querySelector(s); };
    var ecgBuf = [], compBuf = [], capnoBuf = [];
    var st = { phase: 'idle', rate: 110, running: false, compT: 0, totalT: 0, shocks: 0, etco2: 6, quality: 0 };
    var raf = 0, last = 0, t = 0, W = 800, H = 340, rhythm = 'vf', phaseT = 0, lastComp = 0;

    function resize() { var s = fitCanvas(cv, g); W = s.W; H = s.H; }

    function setStatus(cls, txt) { var s = $('#e6Status'); if (!s) return; s.className = 'lamp ' + cls; s.innerHTML = '<i></i>' + txt; }
    function setHint(txt) { var h = $('#e6Hint'); if (h) h.textContent = txt; }

    function btn(label, cls, fn) {
      var b = document.createElement('button');
      b.className = 'bigbtn ' + (cls || ''); b.textContent = label;
      b.addEventListener('click', function () { tone(880, 0.08, 'square'); fn(); });
      return b;
    }

    function ecgAt(r) {
      if (r === 'vf') return Math.sin(t * 15) + 0.6 * Math.sin(t * 9.1) + 0.4 * Math.sin(t * 23) + (Math.random() - 0.5) * 0.5;
      if (r === 'asys') return (Math.random() - 0.5) * 0.12;
      var ph = (t % 0.8) / 0.8, v = 0;
      var gs = function (u, s) { return Math.exp(-((ph - u) * (ph - u)) / (2 * s * s)); };
      v += 1.0 * gs(0.23, 0.012) - 0.18 * gs(0.26, 0.012) + 0.22 * gs(0.4, 0.05);
      return v;
    }

    function prompt(p) {
      st.phase = p; phaseT = 0;
      var box = $('#e6Actions'); box.innerHTML = '';
      var rw = $('#e6RateWrap');
      if (p === 'idle') {
        setStatus('bad', 'VICTIME INCONSCIENTE');
        box.appendChild(btn('1 · Confirmer l’arrêt (pas de respiration)', '', function () { prompt('position'); }));
        setHint('Ambulance : victime inconsciente, aucun mouvement respiratoire normal.');
      } else if (p === 'position') {
        setStatus('warnl', 'PRÉPARATION DE L’E6');
        if (rw) rw.style.display = 'flex';
        box.appendChild(btn('2 · Poser l’E6 & démarrer les compressions', 'ok', function () { st.running = true; prompt('compr'); }));
        setHint('Dénudez le thorax, positionnez la ventouse de l’E6 au centre du sternum, puis démarrez.');
      } else if (p === 'compr') {
        setStatus('warnl', 'RCP MÉCANIQUE E6 EN COURS');
        var b = btn('3 · Analyser le rythme', '', function () { st.lastQuality = st.etco2; st.running = false; prompt('analyzing'); });
        box.appendChild(b);
        setHint('L’E6 compresse automatiquement. Visez 100–120/min : l’EtCO₂ doit remonter (> 20 mmHg).');
      } else if (p === 'analyzing') {
        setStatus('warnl', 'ANALYSE DU RYTHME…');
        setHint('Interrompez brièvement les compressions pendant l’analyse.');
        window.setTimeout(function () {
          if (st.phase !== 'analyzing') return;
          rhythm = 'vf'; prompt('shock'); tone(1046, 0.5);
        }, 3000);
      } else if (p === 'shock') {
        setStatus('bad', 'FV — CHOC RECOMMANDÉ');
        box.appendChild(btn('4 · Délivrer le choc (150 J)', 'danger', deliver));
        setHint('Écartez tout le monde, puis délivrez le choc biphasique.');
      } else if (p === 'recompr') {
        setStatus('warnl', 'REPRISE DE LA RCP');
        var b2 = btn('Analyser à nouveau', '', function () { st.lastQuality = st.etco2; st.running = false; prompt('analyzing'); });
        box.appendChild(b2);
        setHint('Compressions insuffisantes : reprenez la RCP E6 (100–120/min) et laissez l’EtCO₂ remonter.');
      } else if (p === 'rosc') {
        setStatus('ok', 'PATIENT SAUVÉ — REPRISE CARDIAQUE');
        st.running = false;
        box.appendChild(btn('Réinitialiser le scénario', '', reset));
        setHint('Rythme organisé avec circulation (montée de l’EtCO₂). Le patient est sauvé — poursuivez les soins.');
      }
    }

    function deliver() {
      st.shocks++; var rd = $('#e6Shocks'); if (rd) rd.textContent = st.shocks;
      rhythm = 'sinus';
      var success = (st.lastQuality >= 18) || st.shocks >= 2;
      window.setTimeout(function () {
        if (success) prompt('rosc'); else prompt('recompr');
      }, 1600);
    }

    function reset() {
      st.phase = 'idle'; st.running = false; st.compT = 0; st.totalT = 0; st.shocks = 0; st.etco2 = 6; st.lastQuality = 0;
      var rd = $('#e6Shocks'); if (rd) rd.textContent = 0;
      rhythm = 'vf'; ecgBuf.length = compBuf.length = capnoBuf.length = 0;
      prompt('idle');
    }

    function draw() {
      g.fillStyle = '#04101b'; g.fillRect(0, 0, W, H);
      var pad = 14, gap = 12, bh = (H - pad * 2 - gap * 2) / 3, x = pad, w = W - pad * 2;
      var col = rhythm === 'vf' ? '#FF5A5F' : (rhythm === 'sinus' ? '#5EE9C4' : '#8FA9BE');
      grid(g, x, pad, w, bh); grid(g, x, pad + bh + gap, w, bh); grid(g, x, pad + (bh + gap) * 2, w, bh);
      drawTrace(g, ecgBuf, x, pad, w, bh, -1.6, 1.6, col, 6);
      drawTrace(g, compBuf, x, pad + bh + gap, w, bh, 0, 7, '#00C8EE', 6);
      drawTrace(g, capnoBuf, x, pad + (bh + gap) * 2, w, bh, 0, 60, '#FFB020', 6);
      g.font = '600 10px "JetBrains Mono",monospace'; g.textAlign = 'left'; g.fillStyle = '#8FA9BE';
      g.fillText('ÉCG — ' + rhythm.toUpperCase(), x + 6, pad + 12);
      g.fillText('Compression E6 (profondeur cm)', x + 6, pad + bh + gap + 12);
      g.fillText('Capnogramme (EtCO₂)', x + 6, pad + (bh + gap) * 2 + 12);
      g.textAlign = 'right'; g.font = '800 24px "JetBrains Mono",monospace';
      g.fillStyle = st.etco2 >= 20 ? '#5EE9C4' : '#FFB020';
      g.fillText(st.etco2.toFixed(0), x + w - 8, pad + (bh + gap) * 2 + 26);
      g.font = '600 10px "JetBrains Mono",monospace'; g.fillStyle = '#8FA9BE';
      g.fillText('mmHg', x + w - 8, pad + (bh + gap) * 2 + 40);
      g.font = '800 20px "JetBrains Mono",monospace'; g.fillStyle = '#00C8EE';
      g.fillText(st.rate + ' /min', x + w - 8, pad + bh + gap + 24);
      g.font = '600 10px "JetBrains Mono",monospace'; g.fillStyle = '#8FA9BE';
      g.fillText('E6 (auto, 5–6 cm)', x + w - 8, pad + bh + gap + 38);
    }

    function loop(ts) {
      raf = requestAnimationFrame(loop);
      if (!last) last = ts;
      var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      t += dt; phaseT += dt;

      var analyzing = st.phase === 'analyzing';
      if (st.phase !== 'idle') st.totalT += dt;

      ecgBuf.push(analyzing ? (Math.random() - 0.5) * 0.12 : ecgAt(rhythm));
      if (ecgBuf.length > 320) ecgBuf.shift();

      var comp = 0;
      if (st.running) {
        var period = 60 / st.rate;
        if (t - lastComp >= period) { lastComp = t; st.compT += 1; tone(160, 0.04); }
        var cph = ((t - lastComp) / period);
        comp = cph < 0.4 ? Math.sin(cph / 0.4 * Math.PI) * (5.3 + Math.sin(t * 3) * 0.2) : 0;
        var good = st.rate >= 100 && st.rate <= 120;
        st.etco2 += ((good ? 30 : 11) - st.etco2) * Math.min(1, dt * 0.6);
      } else {
        st.etco2 += (6 - st.etco2) * Math.min(1, dt * 0.5);
      }
      compBuf.push(comp); if (compBuf.length > 320) compBuf.shift();
      capnoBuf.push(st.etco2 * (st.running ? (0.85 + 0.15 * Math.sin(t * 6)) : 0.3));
      if (capnoBuf.length > 320) capnoBuf.shift();

      var e = $('#e6Time'); if (e) e.textContent = st.totalT.toFixed(0) + 's';
      var ee = $('#e6Etco2'); if (ee) ee.textContent = st.etco2.toFixed(0);
      draw();
    }

    function bind() {
      var r = $('#e6Rate');
      if (r) r.addEventListener('input', function () { st.rate = parseInt(r.value, 10); var v = $('#e6Ratev'); if (v) v.textContent = st.rate + ' /min'; });
    }

    return {
      start: function () { if (raf) return; resize(); bind(); prompt('idle'); window.addEventListener('resize', resize); raf = requestAnimationFrame(loop); },
      stop: function () { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
    };
  }

  window.SIMS = window.SIMS || {};
  window.SIMS.caseT6 = { _inst: null, start: function (s) { if (!this._inst) this._inst = createT6(s); this._inst.start(); }, stop: function () { if (this._inst) this._inst.stop(); } };
  window.SIMS.caseE6 = { _inst: null, start: function (s) { if (!this._inst) this._inst = createE6(s); this._inst.start(); }, stop: function () { if (this._inst) this._inst.stop(); } };
})();
