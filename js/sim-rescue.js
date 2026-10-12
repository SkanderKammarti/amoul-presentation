/* ==========================================================================
   sim-rescue.js — histoire interactive « Le patient est sauvé »
   Parcours complet de la chaîne Amoul : i5 (défibrillation) → E6 (RCP) →
   T6 (ventilation) jusqu'au rétablissement du patient.
   ========================================================================== */
(function () {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  function tone(freq, dur, type) {
    try {
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      window._ctx = window._ctx || new C();
      var o = window._ctx.createOscillator(), gg = window._ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      gg.gain.setValueAtTime(0.0001, window._ctx.currentTime);
      gg.gain.exponentialRampToValueAtTime(0.16, window._ctx.currentTime + 0.01);
      gg.gain.exponentialRampToValueAtTime(0.0001, window._ctx.currentTime + (dur || 0.14));
      o.connect(gg); gg.connect(window._ctx.destination);
      o.start(); o.stop(window._ctx.currentTime + (dur || 0.14) + 0.02);
    } catch (e) {}
  }

  function create(slide) {
    var cv = slide.querySelector('.sim__stage canvas');
    var g = cv.getContext('2d');
    var $ = function (s) { return slide.querySelector(s); };
    var st = { phase: 'crash', rhythm: 'vf', hr: 0, spo2: 70, etco2: 8, sys: 0, shocks: 0, t: 0, saved: false };
    var ecg = [], pleth = [], capno = [];
    var raf = 0, last = 0, W = 800, H = 340, blip = 0;

    function resize() {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var r = cv.getBoundingClientRect();
      cv.width = Math.max(320, r.width * dpr); cv.height = Math.max(240, r.height * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = r.width; H = r.height;
    }

    function setStatus(cls, txt) { var s = $('#rescStatus'); if (!s) return; s.className = 'lamp ' + cls; s.innerHTML = '<i></i>' + txt; }
    function setHint(txt) { var h = $('#rescHint'); if (h) h.textContent = txt; }
    function badge(id, on) { var b = $(id); if (b) b.classList.toggle('on', on); }

    function btn(label, cls, fn) {
      var b = document.createElement('button');
      b.className = 'bigbtn ' + (cls || ''); b.textContent = label;
      b.addEventListener('click', function () { tone(880, 0.08, 'square'); fn(); });
      return b;
    }

    function targets() {
      switch (st.phase) {
        case 'crash': case 'recognize': case 'shockable':
          return { hr: 0, spo2: 68, etco2: 7, sys: 0 };
        case 'analyzing': return { hr: 0, spo2: 66, etco2: 6, sys: 0 };
        case 'cpr': case 'cpr2': return { hr: 0, spo2: 78, etco2: 32, sys: 66 };
        case 'rosc': return { hr: 108, spo2: 84, etco2: 34, sys: 88 };
        case 'vent': return { hr: 96, spo2: 96, etco2: 38, sys: 116 };
        case 'saved': return { hr: 92, spo2: 97, etco2: 39, sys: 120 };
        default: return { hr: 92, spo2: 97, etco2: 39, sys: 118 };
      }
    }

    function prompt(p) {
      st.phase = p;
      var box = $('#rescActions'); box.innerHTML = '';
      if (p === 'crash') {
        st.rhythm = 'vf';
        setStatus('bad', 'VICTIME INCONSCIENTE — ARRÊT CARDIAQUE');
        box.appendChild(btn('1 · Reconnaître l’arrêt (pas de pouls)', '', function () { prompt('recognize'); }));
        setHint('Chantier : un ouvrier s’effondre, ne répond pas, ne respire pas.');
      } else if (p === 'recognize') {
        st.rhythm = 'vf';
        setStatus('warnl', 'ARRÊT CARDIAQUE — FIBRILLATION VENTRICULAIRE');
        box.appendChild(btn('2 · Poser les électrodes & analyser (i5)', '', analyze));
        setHint('Le défibrillateur Amoul i5 analyse le rythme : FV = choc recommandé.');
      } else if (p === 'analyzing') {
        st.rhythm = 'flat';
        setStatus('warnl', 'i5 — ANALYSE DU RYTHME…');
        setHint('Ne pas toucher la victime pendant l’analyse.');
      } else if (p === 'shockable') {
        st.rhythm = 'vf';
        setStatus('bad', 'RYTHME CHOQUABLE — FV');
        box.appendChild(btn('3 · Délivrer le choc (i5 · 150 J)', 'danger', function () { deliver(true); }));
        setHint('Écartez tout le monde et délivrez le choc biphasique.');
      } else if (p === 'cpr') {
        setStatus('warnl', 'FV PERSISTANTE — RCP MÉCANIQUE');
        box.appendChild(btn('4 · Démarrer le massage (Amoul E6)', 'ok', function () { badge('#rescDevE6', true); prompt('cpr2'); }));
        setHint('Compressions insuffisantes ou fatiguantes ? L’E6 masse sans relâche (100–120/min).');
      } else if (p === 'cpr2') {
        setStatus('warnl', 'E6 — RCP MÉCANIQUE EN COURS');
        box.appendChild(btn('5 · Analyser à nouveau (i5)', '', analyze));
        setHint('L’EtCO₂ remonte : le massage mécanique est efficace. On réévalue le rythme.');
      } else if (p === 'shockable2') {
        st.rhythm = 'vf';
        setStatus('bad', 'FV — 2ᵉ CHOC RECOMMANDÉ');
        box.appendChild(btn('6 · Délivrer le choc (i5 · 150 J)', 'danger', function () { deliver(false); }));
        setHint('Après 2 min de RCP : nouvelle analyse → nouveau choc.');
      } else if (p === 'rosc') {
        st.rhythm = 'sinus';
        setStatus('warnl', 'REPRISE CARDIAQUE — VENTILATION INSUFFISANTE');
        box.appendChild(btn('7 · Ventiler le patient (Amoul T6)', 'ok', function () { badge('#rescDevT6', true); prompt('vent'); }));
        setHint('Le cœur repart, mais le patient reste hypoxique : il faut ventiler.');
      } else if (p === 'vent') {
        setStatus('warnl', 'T6 — VENTILATION PROTECTRICE');
        setHint('Le T6 ventile (VT 6 mL/kg, PEEP, FiO₂). La SpO₂ remonte progressivement…');
      } else if (p === 'saved') {
        st.rhythm = 'sinus'; st.saved = true;
        setStatus('ok', 'PATIENT SAUVÉ ✓');
        box.appendChild(btn('Rejouer le sauvetage', '', reset));
        setHint('Constantes normalisées grâce à la chaîne Amoul : i5 + E6 + T6. Patient transporté stable.');
        tone(1046, 0.25); window.setTimeout(function () { tone(1318, 0.4); }, 180);
      }
    }

    function analyze() {
      prompt('analyzing');
      tone(660, 0.12); window.setTimeout(function () { tone(660, 0.12); }, 200);
      window.setTimeout(function () {
        if (st.phase !== 'analyzing') return;
        if (st.shocks === 0) prompt('shockable'); else prompt('shockable2');
      }, 2800);
    }

    function deliver(first) {
      st.shocks++;
      badge('#rescDevI5', true);
      st.rhythm = 'flat'; tone(1320, 0.4, 'square');
      window.setTimeout(function () {
        if (first) { prompt('cpr'); }
        else { prompt('rosc'); }
      }, 1800);
    }

    function reset() {
      st.phase = 'crash'; st.rhythm = 'vf'; st.hr = 0; st.spo2 = 70; st.etco2 = 8; st.sys = 0; st.shocks = 0; st.saved = false;
      ecg.length = pleth.length = capno.length = 0;
      badge('#rescDevI5', false); badge('#rescDevE6', false); badge('#rescDevT6', false);
      prompt('crash');
    }

    function ecgAt(r) {
      if (r === 'vf') return Math.sin(st.t * 15) + 0.6 * Math.sin(st.t * 9.1) + 0.4 * Math.sin(st.t * 23) + (Math.random() - 0.5) * 0.5;
      if (r === 'flat') return (Math.random() - 0.5) * 0.05;
      var hz = Math.max(40, st.hr) / 60, ph = (st.t % (1 / hz)) * hz, v = 0;
      var gs = function (u, s) { return Math.exp(-((ph - u) * (ph - u)) / (2 * s * s)); };
      v += 1.0 * gs(0.22, 0.012) - 0.2 * gs(0.25, 0.012) + 0.22 * gs(0.4, 0.05);
      return v;
    }

    function draw() {
      g.fillStyle = '#04101b'; g.fillRect(0, 0, W, H);
      var pad = 14, gap = 12, bh = (H - pad * 2 - gap * 2) / 3, x = pad, w = W - pad * 2;
      var col = st.rhythm === 'vf' ? '#FF5A5F' : (st.rhythm === 'flat' ? '#8FA9BE' : '#5EE9C4');
      [pad, pad + bh + gap, pad + (bh + gap) * 2].forEach(function (yy) {
        g.strokeStyle = 'rgba(0,200,238,.07)'; g.lineWidth = 1;
        for (var i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(x, yy + bh * i / 4); g.lineTo(x + w, yy + bh * i / 4); g.stroke(); }
      });
      var trace = function (arr, y, min, max, color) {
        if (!arr.length) return;
        g.save(); g.beginPath(); g.rect(x, y, w, bh); g.clip();
        g.strokeStyle = color; g.lineWidth = 2; g.shadowColor = color; g.shadowBlur = 6; g.beginPath();
        var n = arr.length;
        for (var i = 0; i < n; i++) { var xx = x + i / (n - 1 || 1) * w, yy = y + bh - (arr[i] - min) / (max - min) * bh; i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
        g.stroke(); g.restore();
      };
      trace(ecg, pad, -1.6, 1.6, col);
      trace(pleth, pad + bh + gap, 0, 100, '#00C8EE');
      trace(capno, pad + (bh + gap) * 2, 0, 60, '#FFB020');

      g.font = '600 10px "JetBrains Mono",monospace'; g.textAlign = 'left'; g.fillStyle = '#8FA9BE';
      g.fillText('ÉCG — ' + (st.rhythm === 'vf' ? 'FV' : st.rhythm === 'flat' ? 'ASYS/ANALYSE' : 'RYTHME SINUSAL'), x + 6, pad + 12);
      g.fillText('SpO₂ (pléthysmographie)', x + 6, pad + bh + gap + 12);
      g.fillText('EtCO₂ (capnogramme)', x + 6, pad + (bh + gap) * 2 + 12);

      g.textAlign = 'right';
      var sc = st.spo2 >= 92 ? '#5EE9C4' : (st.spo2 >= 80 ? '#FFB020' : '#FF5A5F');
      g.font = '800 26px "JetBrains Mono",monospace'; g.fillStyle = sc;
      g.fillText(st.spo2.toFixed(0) + '%', x + w - 8, pad + bh + gap + 26);
      g.font = '800 22px "JetBrains Mono",monospace'; g.fillStyle = '#FFB020';
      g.fillText(st.etco2.toFixed(0), x + w - 8, pad + (bh + gap) * 2 + 26);

      if (st.saved) {
        g.fillStyle = 'rgba(15,163,127,.16)'; g.fillRect(x, pad, w, bh * 3 + gap * 2);
        g.textAlign = 'center'; g.fillStyle = '#5EE9C4';
        g.font = '800 34px "JetBrains Mono",monospace';
        var yy = H / 2 + Math.sin(st.t * 3) * 4;
        g.shadowColor = '#0FA37F'; g.shadowBlur = 18;
        g.fillText('PATIENT SAUVÉ', W / 2, yy);
        g.shadowBlur = 0; g.font = '600 13px "JetBrains Mono",monospace'; g.fillStyle = '#bde9dd';
        g.fillText('i5  ·  E6  ·  T6', W / 2, yy + 26);
      }
    }

    function loop(ts) {
      raf = requestAnimationFrame(loop);
      if (!last) last = ts;
      var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      st.t += dt;
      var tg = targets(), k = Math.min(1, dt * 1.4);
      st.hr = lerp(st.hr, tg.hr, k); st.spo2 = lerp(st.spo2, tg.spo2, k);
      st.etco2 = lerp(st.etco2, tg.etco2, k); st.sys = lerp(st.sys, tg.sys, k);

      ecg.push(ecgAt(st.rhythm)); if (ecg.length > 320) ecg.shift();
      var amp = 2 + (st.spo2 - 60) * 0.28;
      var beating = st.rhythm === 'sinus' && st.hr > 30;
      pleth.push(Math.max(0, beating ? amp * Math.abs(Math.sin(st.t * Math.PI * st.hr / 60)) : amp * 0.15 * Math.abs(Math.sin(st.t * 2))));
      if (pleth.length > 320) pleth.shift();
      var compressing = (st.phase === 'cpr2');
      capno.push(st.etco2 * ((st.etco2 > 12) ? (0.85 + 0.15 * Math.sin(st.t * (compressing ? 2.5 : 1.4))) : 0.25));
      if (capno.length > 320) capno.shift();

      var set = function (id, v) { var e = $(id); if (e) e.textContent = v; };
      set('#rescHr', st.hr > 30 ? Math.round(st.hr) : '—');
      set('#rescSpo2', Math.round(st.spo2) + '%');
      set('#rescEtco2', Math.round(st.etco2));
      set('#rescBp', st.sys > 40 ? (Math.round(st.sys) + '/' + Math.round(st.sys * 0.62)) : '—');

      if (st.phase === 'vent' && st.spo2 >= 94 && !st.saved) { prompt('saved'); }

      draw();
    }

    return {
      start: function () { if (raf) return; resize(); prompt('crash'); window.addEventListener('resize', resize); raf = requestAnimationFrame(loop); },
      stop: function () { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
    };
  }

  window.SIMS = window.SIMS || {};
  window.SIMS.rescue = {
    _inst: null,
    start: function (s) { if (!this._inst) this._inst = create(s); this._inst.start(); },
    stop: function () { if (this._inst) this._inst.stop(); }
  };
})();
