(function () {
  'use strict';

  var CHOICES = ['random', 'Princess', 'Jonathan', 'Shane'];
  var PORTRAIT_DIR = 'sprites/sprites_navmap/portraits/';

  var btn, panel, prevBtn, nextBtn, selBtn, imgEl, canvasEl, qEl, nameEl, subEl;
  var idx = 0, isOpen = false, token = 0;

  function $(id) { return document.getElementById(id); }

  function currentChoice() {
    try { if (window.GPSChar) return GPSChar.getChoice(); } catch (e) {}
    return 'random';
  }

  function currentName() {
    return (window.GPSChar && GPSChar.current) || null;
  }

  function showPortrait(choice) {
    var my = ++token;
    imgEl.hidden = true;
    canvasEl.hidden = true;
    qEl.hidden = true;
    if (choice === 'random') { qEl.hidden = false; return; }

    function useSprite() {
      if (my !== token) return;
      try {
        GPSChar.drawPortrait(choice, canvasEl, function (ok) {
          if (my !== token) return;
          if (ok) canvasEl.hidden = false; else qEl.hidden = false;
        });
      } catch (e) { qEl.hidden = false; }
    }

    imgEl.onload = function () { if (my === token) imgEl.hidden = false; };
    imgEl.onerror = function () { imgEl.onload = imgEl.onerror = null; useSprite(); };
    imgEl.alt = choice;
    imgEl.src = PORTRAIT_DIR + choice + '.png';
  }

  function render() {
    var choice = CHOICES[idx];
    nameEl.textContent = choice === 'random' ? 'Random' : choice;
    subEl.textContent = choice === 'random' ? 'A new one each time you open the map' : '';
    var active = choice === currentChoice();
    selBtn.textContent = active ? 'Selected' : 'Select';
    selBtn.disabled = active;
    showPortrait(choice);
  }

  function syncIndex() {
    var i = CHOICES.indexOf(currentChoice());
    idx = i >= 0 ? i : 0;
  }

  function step(delta) {
    idx = (idx + delta + CHOICES.length) % CHOICES.length;
    render();
  }

  function choose() {
    try { if (window.GPSChar) GPSChar.select(CHOICES[idx]); } catch (e) { console.warn('[charpicker]', e); }
    setOpen(false);
  }

  function setOpen(on) {
    isOpen = !!on;
    panel.classList.toggle('hidden', !isOpen);
    btn.classList.toggle('char-active', isOpen);
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) { syncIndex(); render(); }
  }

  function init() {
    btn = $('char-btn'); panel = $('char-panel');
    prevBtn = $('char-prev'); nextBtn = $('char-next'); selBtn = $('char-select');
    imgEl = $('char-portrait'); canvasEl = $('char-portrait-canvas');
    qEl = $('char-q'); nameEl = $('char-name'); subEl = $('char-sub');
    if (!btn || !panel || !prevBtn || !nextBtn || !selBtn || !imgEl || !canvasEl || !qEl || !nameEl || !subEl) return;

    btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(!isOpen); });
    prevBtn.addEventListener('click', function (e) { e.stopPropagation(); step(-1); });
    nextBtn.addEventListener('click', function (e) { e.stopPropagation(); step(1); });
    selBtn.addEventListener('click', function (e) { e.stopPropagation(); choose(); });

    document.addEventListener('pointerdown', function (e) {
      if (!isOpen) return;
      var t = e.target;
      if (panel.contains(t) || btn.contains(t)) return;
      setOpen(false);
    });
    document.addEventListener('keydown', function (e) { if (isOpen && e.key === 'Escape') setOpen(false); });
    document.addEventListener('navmapchar', function () { if (isOpen) setOpen(false); });
  }

  init();
})();
