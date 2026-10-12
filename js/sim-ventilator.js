/* ==========================================================================
   sim-ventilator.js — simulateur de courbes respiratoires (T5 / T6 / VK600)
   Modèle analytique : modes VCV & PCV, PEEP, FR, VT, FiO2.
   ========================================================================== */
(function () {
  'use strict';

  const COL = { P: '#00C8EE', F: '#5EE9C4', V: '#FFB020', grid: 'rgba(255,255,255,.07)', txt: '#8FA9BE' };

  function model(ph, p) {
    const T = 60 / p.rr;
    const ti = T * p.tiFrac;
    const vt = (p.mode === 'PCV') ? Math.min(1000, p.compliance * p.pinsp) : p.vt;
    let P, F, V;
    if (ph < ti) {
      const u = ph / ti;
      if (p.mode === 'VCV') {
        F = p.flowInsp * (u < 0.08 ? u / 0.08 : (u > 0.92 ? (1 - u) / 0.08 : 1));
        V = vt * u;
        P = p.peep + p.resist + (vt / p.compliance) * Math.min(1, u * 1.4);
        if (u < 0.12) P += 7 * (1 - u / 0.12);
      } else {
        const uu = u < 0.1 ? u / 0.1 : (u > 0.9 ? (1 - u) / 0.1 : 1);
        P = p.peep + p.pinsp * uu;
        V = vt * (1 - Math.exp(-u * 4));
        F = (vt * 4 * Math.exp(-u * 4) / ti) * 0.06;
      }
    } else {
      const u = (ph - ti) / (T - ti);
      if (p.mode === 'VCV') {
        P = p.peep + (p.plateau - p.peep) * Math.exp(-u * 5);
        V = vt * Math.exp(-u * 4.5);
        F = -(vt * 4.5 * Math.exp(-u * 4.5) / (T - ti)) * 0.06;
      } else {
        P = p.peep + p.pinsp * Math.exp(-u * 7);
        V = vt * Math.exp(-u * 4);
        F = -p.flowInsp * Math.exp(-u * 5);
      }
    }
    return { P: P, F: F, V: V };
  }

  function band(g, x, y, w, h, min, max, color) {
    const mid = y + h - (0 - min) / (max - min) * h;
    g.strokeStyle = COL.grid; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const yy = y + h * i / 4; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
    if (min < 0 && max > 0) { g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(x, mid); g.lineTo(x + w, mid); g.stroke(); }
    g.fillStyle = color; g.font = '600 10px "JetBrains Mono",monospace'; g.textAlign = 'left';
    g.fillText(color === COL.P ? 'Paw cmH₂O' : color === COL.F ? 'Débit L/min' : 'Volume mL', x + 8, y + 14);
  }

  function create(slide) {
    const cv = slide.querySelector('.sim__stage canvas');
    const g = cv.getContext('2d');
    const $ = function (s) { return slide.querySelector(s); };
    const state = { mode: 'VCV', rr: 16, vt: 500, peep: 5, pinsp: 16, fio2: 40, playing: true, speed: 1 };
    let raf = 0, last = 0, t = 0;
    const PPS = 220; // pixels per second

    function syncDerived() {
      state.tiFrac = 0.33;
      state.vtEff = (state.mode === 'PCV') ? Math.min(1000, state.compliance * state.pinsp) : state.vt;
      state.flowInsp = state.vtEff / (60 / state.rr * state.tiFrac) * 0.06; // L/min approx
      state.plateau = state.peep + state.vtEff / state.compliance;
      state.resist = 3;
    }
    state.compliance = 40;

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = cv.getBoundingClientRect();
      cv.width = Math.max(300, r.width * dpr); cv.height = Math.max(240, r.height * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      state.W = r.width; state.H = r.height;
    }

    function draw() {
      const W = state.W, H = state.H;
      g.clearRect(0, 0, W, H);
      const pad = 14, gap = 10;
      const bh = (H - pad * 2 - gap * 2) / 3;
      const bands = [
        { key: 'P', min: -10, max: Math.max(35, state.peep + state.pinsp + 8), color: COL.P, y: pad },
        { key: 'F', min: -60, max: 60, color: COL.F, y: pad + bh + gap },
        { key: 'V', min: 0, max: Math.max(800, (state.vtEff || state.vt) * 1.15), color: COL.V, y: pad + (bh + gap) * 2 }
      ];
      bands.forEach(function (b) {
        band(g, pad, b.y, W - pad * 2, bh, b.min, b.max, b.color);
        g.save();
        g.beginPath(); g.rect(pad, b.y, W - pad * 2, bh); g.clip();
        g.strokeStyle = b.color; g.lineWidth = 2; g.lineJoin = 'round'; g.shadowColor = b.color; g.shadowBlur = 6;
        g.beginPath();
        let started = false;
        const x0 = pad, x1 = W - pad;
        for (let x = x0; x <= x1; x += 1.5) {
          const tt = t - (x1 - x) / PPS;
          const val = model(((tt % (60 / state.rr)) + (60 / state.rr)) % (60 / state.rr), state)[b.key];
          const yy = b.y + bh - (val - b.min) / (b.max - b.min) * bh;
          if (!started) { g.moveTo(x, yy); started = true; } else g.lineTo(x, yy);
        }
        g.stroke(); g.restore();
      });
      // sweep cursor
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(W - pad, pad); g.lineTo(W - pad, H - pad); g.stroke();
    }

    function loop(ts) {
      raf = requestAnimationFrame(loop);
      if (!last) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      if (state.playing) { t += dt * state.speed; }
      // update readouts (PIP et VT effectifs, cohérents avec le mode)
      const vtEff = (state.mode === 'PCV') ? Math.min(1000, state.compliance * state.pinsp) : state.vt;
      const pip = state.peep + state.resist + vtEff / state.compliance;
      const set = function (id, v) { const el = $(id); if (el) el.textContent = v; };
      set('#rdPip', pip.toFixed(0));
      set('#rdMv', (vtEff * state.rr / 1000).toFixed(1));
      set('#rdVt', Math.round(vtEff));
      set('#rdRr', state.rr);
      draw();
    }

    function bind() {
      const rng = function (sel, prop, fmt) {
        const el = $(sel); if (!el) return;
        el.addEventListener('input', function () { state[prop] = parseFloat(el.value); if (fmt) $(sel + 'v').textContent = fmt(el.value); syncDerived(); });
      };
      rng('#vRr', 'rr'); rng('#vVt', 'vt'); rng('#vPeep', 'peep'); rng('#vPinsp', 'pinsp');
      slide.querySelectorAll('[data-mode]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.mode = b.dataset.mode;
          slide.querySelectorAll('[data-mode]').forEach(function (o) { o.classList.toggle('on', o === b); });
          const pc = $('#pcvOnly'), vc = $('#vcvOnly');
          if (pc) pc.style.display = state.mode === 'PCV' ? 'flex' : 'none';
          if (vc) vc.style.display = state.mode === 'VCV' ? 'flex' : 'none';
          syncDerived();
        });
      });
      const pp = $('#vPlay'); if (pp) pp.addEventListener('click', function () { state.playing = !state.playing; pp.textContent = state.playing ? 'Pause' : 'Reprendre'; });
      const sp = $('#vSpeed'); if (sp) sp.addEventListener('input', function () { state.speed = parseFloat(sp.value); $('#vSpeedv').textContent = state.speed + '×'; });
    }

    return {
      start: function () {
        if (raf) return;
        resize(); syncDerived(); bind();
        const r = $('#vRr'); if (r) { state.rr = parseFloat(r.value); }
        window.addEventListener('resize', resize);
        raf = requestAnimationFrame(loop);
      },
      stop: function () { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
    };
  }

  window.SIMS = window.SIMS || {};
  window.SIMS.ventilator = {
    _inst: null,
    start: function (slide) { if (!this._inst) this._inst = create(slide); this._inst.start(); },
    stop: function () { if (this._inst) this._inst.stop(); }
  };
})();
