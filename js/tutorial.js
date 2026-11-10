(function () {
  'use strict';

  var KEY = 'prmsuTutorialSeen';
  var STEPS = [
    { title: 'Welcome to the PRMSU SM Digital Twin',
      text: 'This is an interactive guide to the San Marcelino Campus. It has five pages, and it works offline once it is installed. Here is a quick look at what you can do.' },
    { title: 'Using it offline',
      text: 'Add the app to your home screen to install it. To use the Walkthrough without internet, open it and tap the download button to save the photos on your phone.' },
    { title: 'Navigation Map',
      text: 'Search for a building and tap Navigate Here to get an orange route, or tap Start from to pick where you begin. Drag to move around, pinch to zoom, and use two fingers to rotate. The camera button lets you walk the campus in first person.' },
    { title: 'Campus Walkthrough',
      text: 'Move through 360 photos of the campus. Drag to look around and tap the arrows on the road to go forward, back or into a side path. The Places button jumps straight to a spot.' },
    { title: 'Directory and Development Zones',
      text: 'The Directory lists the academic buildings, facilities and courts with photos. Development Zones shows the campus on a satellite map with photo pins.' }
  ];

  var root = null, idx = 0;

  function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem(KEY, '1'); } catch (e) {} }

  function build() {
    root = document.createElement('div');
    root.id = 'tutorial-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'tut-title');
    root.innerHTML =
      '<div class="tut-card">' +
        '<div class="tut-step" id="tut-step"></div>' +
        '<h2 class="tut-title" id="tut-title"></h2>' +
        '<p class="tut-text" id="tut-text"></p>' +
        '<div class="tut-dots" id="tut-dots"></div>' +
        '<div class="tut-actions">' +
          '<button type="button" class="tut-skip" id="tut-skip">Skip</button>' +
          '<button type="button" class="tut-next" id="tut-next">Next</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    document.getElementById('tut-skip').addEventListener('click', close);
    document.getElementById('tut-next').addEventListener('click', function () {
      if (idx >= STEPS.length - 1) close(); else { idx++; render(); }
    });
    document.addEventListener('keydown', function (e) {
      if (!root || !root.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') document.getElementById('tut-next').click();
      else if (e.key === 'ArrowLeft' && idx > 0) { idx--; render(); }
    });
  }

  function render() {
    var s = STEPS[idx], last = idx === STEPS.length - 1;
    document.getElementById('tut-step').textContent = 'Tutorial ' + (idx + 1) + ' of ' + STEPS.length;
    document.getElementById('tut-title').textContent = s.title;
    document.getElementById('tut-text').textContent = s.text;
    var dots = '';
    for (var i = 0; i < STEPS.length; i++) dots += '<i' + (i === idx ? ' class="on"' : '') + '></i>';
    document.getElementById('tut-dots').innerHTML = dots;
    document.getElementById('tut-next').textContent = last ? 'Got it' : 'Next';
    document.getElementById('tut-skip').style.visibility = last ? 'hidden' : 'visible';
  }

  function open() {
    if (!root) build();
    idx = 0; render();
    root.classList.add('open');
    var b = document.getElementById('tut-next'); if (b) b.focus();
  }

  function close() {
    markSeen();
    if (root) root.classList.remove('open');
  }

  window.showTutorial = open;

  function onMainPage() {
    var p = document.getElementById('page-main');
    return !p || p.classList.contains('active');
  }

  function maybeAuto() {
    if (seen()) return;
    var tries = 0;
    (function wait() {
      var splash = document.getElementById('splash-screen');
      var gone = !splash || splash.style.display === 'none';
      if (gone && onMainPage()) { setTimeout(function () { if (!seen() && onMainPage()) open(); }, 500); return; }
      if (++tries < 40) setTimeout(wait, 500);
    })();
  }

  if (document.readyState === 'complete') maybeAuto();
  else window.addEventListener('load', maybeAuto);
})();
