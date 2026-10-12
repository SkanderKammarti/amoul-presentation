/* ==========================================================================
   deck.js — moteur de présentation plein écran
   AMOUL MEDICAL × La Maison Africaine du Médecin
   ========================================================================== */
(function () {
  'use strict';

  const slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  const total = slides.length;
  const dotsBox = document.getElementById('dots');
  const progress = document.getElementById('progress');
  const counter = document.getElementById('counter');
  const overlay = document.getElementById('overview');
  const ovgrid = document.getElementById('ovgrid');
  const deck = document.getElementById('deck');

  let idx = 0;
  let locked = false;
  const inited = new Set();

  /* ---------- dots + overview ---------- */
  slides.forEach(function (s, i) {
    const b = document.createElement('button');
    b.setAttribute('aria-label', 'Slide ' + (i + 1));
    b.addEventListener('click', function () { go(i); });
    dotsBox.appendChild(b);

    const c = document.createElement('button');
    c.className = 'ovcard';
    c.innerHTML = '<span class="n">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<b>' + (s.dataset.title || 'Slide') + '</b>' +
      '<span>' + (s.dataset.chapter || '') + '</span>';
    c.addEventListener('click', function () { go(i); toggleOverview(false); });
    ovgrid.appendChild(c);
  });
  const dots = Array.prototype.slice.call(dotsBox.children);

  /* ---------- lifecycle hooks for simulators ---------- */
  function onEnter(i) {
    const s = slides[i];
    const name = s.dataset.sim;
    if (name && window.SIMS && window.SIMS[name]) {
      try { window.SIMS[name].start(s); inited.add(i); } catch (e) { console.warn('sim start', name, e); }
    }
    // pause any known running sim on other slides
    slides.forEach(function (o, j) {
      if (j === i) return;
      const n = o.dataset.sim;
      if (n && inited.has(j) && window.SIMS && window.SIMS[n] && window.SIMS[n].stop) {
        try { window.SIMS[n].stop(o); } catch (e) {}
      }
    });
  }

  function render() {
    slides.forEach(function (s, i) { s.classList.toggle('is-active', i === idx); });
    dots.forEach(function (d, i) { d.classList.toggle('on', i === idx); });
    progress.style.width = ((idx + 1) / total * 100) + '%';
    counter.innerHTML = '<b>' + String(idx + 1).padStart(2, '0') + '</b> / ' + String(total).padStart(2, '0');
    if (location.hash !== '#/' + (idx + 1)) history.replaceState(null, '', '#/' + (idx + 1));
    onEnter(idx);
  }

  function go(i, silent) {
    i = Math.max(0, Math.min(total - 1, i));
    if (i === idx && !silent) return;
    idx = i;
    render();
  }
  function next() { go(idx + 1); }
  function prev() { go(idx - 1); }

  /* ---------- overview ---------- */
  function toggleOverview(force) {
    const on = typeof force === 'boolean' ? force : !overlay.classList.contains('on');
    overlay.classList.toggle('on', on);
  }

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    else if (e.key === 'Home') { go(0); }
    else if (e.key === 'End') { go(total - 1); }
    else if (e.key === 'Escape') { toggleOverview(false); }
    else if (e.key.toLowerCase() === 'o' || e.key.toLowerCase() === 'm') { toggleOverview(); }
    else if (e.key.toLowerCase() === 'f') { toggleFullscreen(); }
  });

  /* ---------- wheel (throttled) ---------- */
  let wheelLock = false;
  window.addEventListener('wheel', function (e) {
    const scrollable = e.target.closest('[data-scrollable]');
    if (scrollable) {
      const atTop = scrollable.scrollTop <= 0;
      const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;
      if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) return;
    }
    if (wheelLock) return;
    if (Math.abs(e.deltaY) < 18) return;
    wheelLock = true; setTimeout(function () { wheelLock = false; }, 750);
    if (e.deltaY > 0) next(); else prev();
  }, { passive: true });

  /* ---------- touch swipe ---------- */
  let tx = 0, ty = 0;
  window.addEventListener('touchstart', function (e) {
    tx = e.changedTouches[0].clientX; ty = e.changedTouches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchend', function (e) {
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? next() : prev(); }
  }, { passive: true });

  /* ---------- toolbar ---------- */
  function toggleFullscreen() {
    if (!document.fullscreenElement) (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
    else document.exitFullscreen();
  }
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnOv = document.getElementById('btnOverview');
  const btnFs = document.getElementById('btnFullscreen');
  const btnPrint = document.getElementById('btnPrint');
  if (btnPrev) btnPrev.addEventListener('click', prev);
  if (btnNext) btnNext.addEventListener('click', next);
  if (btnOv) btnOv.addEventListener('click', function () { toggleOverview(); });
  if (btnFs) btnFs.addEventListener('click', toggleFullscreen);
  if (btnPrint) btnPrint.addEventListener('click', function () { window.print(); });

  /* ---------- hash boot ---------- */
  function bootFromHash() {
    const m = /#\/(\d+)/.exec(location.hash);
    if (m) idx = Math.max(0, Math.min(total - 1, parseInt(m[1], 10) - 1));
  }
  window.addEventListener('hashchange', function () {
    const m = /#\/(\d+)/.exec(location.hash);
    if (m) { const t = parseInt(m[1], 10) - 1; if (t !== idx) go(t); }
  });

  /* ---------- expose ---------- */
  window.Deck = { go: go, next: next, prev: prev, total: total, current: function () { return idx; } };

  bootFromHash();
  render();
})();
