(function () {
  'use strict';

  var CHOICES = ['random', 'Princess', 'Jonathan', 'Shane'];
  var PORTRAIT_DIR = 'sprites/portraits/';

  var btn, panel, prevBtn, nextBtn, selBtn, imgEl, canvasEl, qEl, nameEl, subEl;
  var idx = 0, isOpen = false, token = 0;

  function $(id) { return document.getElementById(id); }

  // Portraits are tall pictures shown in a square frame. Each artist draws the head at a
  // different height, so a fixed crop cuts some heads. This finds the top of the drawing
  // (first row with visible pixels) and crops from just above it, whatever the picture is.
  var topCache = {};
  function fitPortrait(img) {
    try {
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h || h <= w) return;
      var src = img.currentSrc || img.src;
      var top = topCache[src];
      if (top === undefined) {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0);
        var data = cx.getImageData(0, 0, w, h).data;
        top = 0;
        outer: for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) { if (data[(y * w + x) * 4 + 3] > 40) { top = y; break outer; } }
        }
        topCache[src] = top;
      }
      var p = Math.max(0, Math.min(1, (top - w * 0.06) / (h - w)));
      img.style.objectPosition = 'center ' + (p * 100).toFixed(1) + '%';
    } catch (e) { /* keep the CSS crop */ }
  }
  window.fitPortrait = fitPortrait;

  /* About page portraits are square head-and-shoulders art (sprites/about_portraits).
     Find the drawing's edges and zoom the image so the head and shoulders fill the round frame. */
  function fitSquareAvatar(img) {
    try {
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w || w !== h) return false;
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      var d = cx.getImageData(0, 0, w, h).data, x0 = w, x1 = -1, y0 = h, x, y;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; }
      }
      if (x1 < 0) return false;
      var side = Math.min(w, (x1 - x0 + 1) * 1.22);
      var left = Math.max(0, Math.min(w - side, (x0 + x1) / 2 - side / 2));
      var top = Math.max(0, Math.min(h - side, y0 - side * 0.1));
      img.classList.add('team-avatar-fit');
      img.style.width = (w / side * 100).toFixed(2) + '%';
      img.style.height = (h / side * 100).toFixed(2) + '%';
      img.style.left = (-left / side * 100).toFixed(2) + '%';
      img.style.top = (-top / side * 100).toFixed(2) + '%';
      return true;
    } catch (e) { return false; }
  }

  function fitTeamAvatars() {
    var imgs = document.querySelectorAll('.team-avatar img');
    Array.prototype.forEach.call(imgs, function (im) {
      function go() { if (!fitSquareAvatar(im)) fitPortrait(im); }
      if (im.complete && im.naturalWidth) go();
      else im.addEventListener('load', go, { once: true });
    });
  }
  fitTeamAvatars();

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

    imgEl.onload = function () { fitPortrait(imgEl); if (my === token) imgEl.hidden = false; };
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

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      // In first-person view the character cannot be seen, so this button jumps to a building instead.
      if (window.NavFP && NavFP.active) { if (isOpen) setOpen(false); NavFP.toggleTeleport(); return; }
      setOpen(!isOpen);
    });
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
