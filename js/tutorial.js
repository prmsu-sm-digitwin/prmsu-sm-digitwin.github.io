(function () {
  'use strict';

  var SEEN_KEY = 'prmsuTourSeen';
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var deferredPrompt = null, installedNow = false;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; });
  window.addEventListener('appinstalled', function () { deferredPrompt = null; installedNow = true; });

  function isStandalone() {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    } catch (e) {}
    return !!window.navigator.standalone;
  }
  function isIOS() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }
  function isAndroid() { return /Android/i.test(navigator.userAgent || ''); }

  function installInfo() {
    if (isStandalone() || installedNow) {
      return { text: 'The app is already installed on this device, so you can open it from your home screen anytime. Nice!' };
    }
    if (deferredPrompt) {
      return {
        text: 'Install this app so it opens like a normal app and keeps working with no internet. Tap the Install button below.',
        action: { label: 'Install app', run: function (done) {
          var p = deferredPrompt; deferredPrompt = null;
          try {
            p.prompt();
            if (p.userChoice && p.userChoice.then) p.userChoice.then(function (c) { done(c && c.outcome === 'accepted' ? 'Installing. Look for the app on your home screen.' : 'No problem. You can install it later from the About page.'); });
            else done('');
          } catch (e) { done(''); }
        } }
      };
    }
    if (isIOS()) {
      return { text: 'To put this app on your home screen: open this page in Safari, tap the Share button (the square with an arrow pointing up), scroll down, tap Add to Home Screen, then tap Add.' };
    }
    if (isAndroid()) {
      return { text: 'To put this app on your home screen: tap the menu button (the three dots) in your browser, then tap Install app, or Add to Home screen, and confirm.' };
    }
    return { text: 'To install this app on a computer: click the install icon at the right end of the address bar, or open the browser menu and choose Install. On a phone, use the browser menu and pick Add to Home screen.' };
  }

  var INSTALL_STEP = { dynamic: installInfo, skipIf: function () { return isStandalone() || installedNow; } };

  var TOURS = {
    main: { guide: 'Princess', steps: [
      { text: 'Hi! I am Princess, and I will show you around the PRMSU SM Digital Twin. It only takes a minute.' },
      { target: '.main-nav-buttons', text: 'These are the five pages of the app. Tap any button to open it. Every page also has its own short guide the first time you visit.' },
      { target: '#help-btn-main', text: 'See this ? button? Every page has one. Tap it any time to play that page guide again.' },
      INSTALL_STEP,
      { text: 'That is it! Pick a page to start exploring. You can replay any guide from the About page.', last: true }
    ] },
    map: { guide: 'Princess', steps: [
      { text: 'This is the Navigation Map, a 3D model of the whole campus. Let me show you the main parts.' },
      { target: '#sheet-search-bar', text: 'Search for a building here, like CCIT, CAg or Library. You can also scroll the list below it.' },
      { text: 'Drag to move around the map, pinch to zoom, and use two fingers to rotate. Tap a building to see its details, then press Navigate Here to get an orange route, or Start from to pick where you begin.' },
      { target: '#fp-btn', text: 'This camera button lets you walk around the campus in first person, with a joystick.' },
      { target: '#legend-btn', text: 'This opens the legend, so you can see what the colors and symbols on the map mean.' },
      { target: '#char-btn', text: 'Tap here to choose your character. It is the one that shows where you are on the map. In first person view this button turns into a pin that jumps you to any building.' },
      { target: '#gps-btn', text: 'This shows your location on campus using your phone GPS. If you are off campus, your character waits at the Main Gate.', last: true }
    ] },
    firstperson: { guide: 'Princess', steps: [
      { text: 'You are now in first person view, walking on the campus paths like you are really there!' },
      { target: '#fp-joy', text: 'Drag this joystick to walk. Push it forward to go ahead, and sideways to turn.' },
      { text: 'Drag anywhere else on the screen to look around. You will always stay on the campus paths, so you will never walk through a building.' },
      { target: '#char-btn', text: 'This pin button is a teleport. Tap it to see a list of buildings, pick one, and you will jump near it and face it.' },
      { target: '#fp-search-btn', text: 'Need to get somewhere? Tap this search button, pick a building, and press Navigate Here. The orange arrows start right where you are standing, so just follow them along the path.' },
      { target: '#fp-btn', text: 'Tap this camera button when you want to go back to the normal map view.', last: true }
    ] },
    walkthrough: { guide: 'Jonathan', steps: [
      { text: 'Hey, I am Jonathan! This is the Campus Walkthrough, a tour of the campus made from 360 degree photos.' },
      { text: 'Drag to look around. Tap or hold the arrows on the road to walk forward, go back, or turn into a side path.' },
      { target: '#tour-places-btn', text: 'The Places button takes you straight to a spot, like the gates, the Library or the dorms.' },
      { target: '#tour-offline-btn', text: 'Want the tour without internet? Tap this to download all the photos to your phone. It is a big download, so use Wi-Fi.', optional: true },
      { target: '#tour-back', text: 'And this button takes you back to the home page. Enjoy the tour!', last: true }
    ] },
    directory: { guide: 'Shane', steps: [
      { text: 'Hi, I am Shane! This is the Campus Directory. It lists the buildings and facilities of the campus with photos.' },
      { target: '.dir-stage', text: 'Swipe the photo or tap the arrows to see more pictures of a place. Tap a photo to zoom in.' },
      { target: '.dir-info', text: 'Under the photo you can read the name of the place and what it is for.' },
      { text: 'Scroll down to see more places. They are grouped as Academic, Facility and Multi-Court.', last: true }
    ] },
    devzones: { guide: 'Jonathan', steps: [
      { text: 'Hey again! This is Development Zones. It shows parts of the campus that are planned for future development.' },
      { target: '.devzones-marker', text: 'Each pin is a planned zone. Tap a pin to see a picture of how the area may look.' },
      { text: 'Drag the map to move around and pinch to zoom. In the photo viewer you can also tilt, pan and zoom.', last: true }
    ] },
    about: { guide: 'Shane', steps: [
      { text: 'I am Shane again! This is the About page, with the university vision and mission, and the people behind this app.' },
      { target: '.vmq-grid', text: 'Tap Vision, Mission or Quality Policy to read the full text.' },
      { target: '.team-section', text: 'These are the people who made the app: Princess, Jonathan and me.' },
      { target: '#about-howto-row', text: 'Tap here any time to replay a guide, or to see how to install the app on your phone.', last: true }
    ] }
  };
  var PAGE_NAMES = { main: 'Home', map: 'Navigation Map', firstperson: 'First-person view', walkthrough: 'Campus Walkthrough', directory: 'Campus Directory', devzones: 'Development Zones', about: 'About' };

  var INSTALL_TOUR = { guide: null, steps: [ INSTALL_STEP ] };

  function readSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function markSeen(page) {
    if (!page || !TOURS[page]) return;
    try { var s = readSeen(); s[page] = 1; localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function seen(page) { return !!readSeen()[page]; }
  function markAllSeen() {
    try { var o = {}; Object.keys(TOURS).forEach(function (k) { o[k] = 1; }); localStorage.setItem(SEEN_KEY, JSON.stringify(o)); } catch (e) {}
  }

  var PORTRAIT_DIR = 'sprites/portraits/';
  var spriteCache = {};
  function guideCanvas(name, cb) {
    if (spriteCache[name]) { cb(spriteCache[name]); return; }
    var img = new Image();
    img.onload = function () {
      try {
        var W = img.naturalWidth, H = img.naturalHeight;
        var c = document.createElement('canvas'); c.width = W; c.height = H;
        var cx = c.getContext('2d'); cx.imageSmoothingEnabled = false;
        cx.drawImage(img, 0, 0);
        var d = cx.getImageData(0, 0, W, H).data, x0 = W, y0 = H, x1 = -1, y1 = -1, x, y;
        for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
          if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        if (x1 < 0) { cb(null); return; }
        var w = x1 - x0 + 1, h = y1 - y0 + 1;
        var out = document.createElement('canvas'); out.width = w; out.height = h;
        var ox = out.getContext('2d'); ox.imageSmoothingEnabled = false;
        ox.drawImage(c, x0, y0, w, h, 0, 0, w, h);
        spriteCache[name] = out; cb(out);
      } catch (e) { cb(null); }
    };
    img.onerror = function () { cb(null); };
    img.src = PORTRAIT_DIR + name + '.png';
  }

  var root = null, cutEl = null, stageEl = null, charBox = null, nameEl = null, textEl = null, hintEl = null;
  var actionBtn = null, nextBtn = null, skipBtn = null, caret = null;
  var run = null;
  var typeTimer = null, typing = false, fullText = '';
  var layoutRaf = 0, askEl = null, asking = false;

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'tg-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'App guide');
    root.innerHTML =
      '<div class="tg-cut" id="tg-cut"></div>' +
      '<div class="tg-stage" id="tg-stage">' +
        '<div class="tg-char" id="tg-char"></div>' +
        '<div class="tg-box" id="tg-box">' +
          '<div class="tg-name" id="tg-name"></div>' +
          '<p class="tg-text" id="tg-text"></p>' +
          '<div class="tg-hint" id="tg-hint"></div>' +
          '<div class="tg-row">' +
            '<button type="button" class="tg-skip" id="tg-skip">Skip</button>' +
            '<span class="tg-spacer"></span>' +
            '<button type="button" class="tg-action" id="tg-action" hidden></button>' +
            '<button type="button" class="tg-next" id="tg-next">Next</button>' +
          '</div>' +
          '<span class="tg-caret" id="tg-caret" aria-hidden="true">▼</span>' +
        '</div>' +
      '</div>' +
      '<div class="tg-ask" id="tg-ask">' +
        '<div class="tg-ask-card" role="alertdialog" aria-labelledby="tg-ask-title">' +
          '<div class="tg-ask-title" id="tg-ask-title">Skip the guide?</div>' +
          '<p class="tg-ask-sub">You can play any guide again from the ? button or the About page.</p>' +
          '<button type="button" class="tg-ask-btn" id="tg-ask-page">Skip this page guide</button>' +
          '<button type="button" class="tg-ask-btn tg-ask-all" id="tg-ask-all">Skip all guides</button>' +
          '<button type="button" class="tg-ask-keep" id="tg-ask-keep">Keep going</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    cutEl = root.querySelector('#tg-cut'); stageEl = root.querySelector('#tg-stage');
    charBox = root.querySelector('#tg-char'); nameEl = root.querySelector('#tg-name');
    textEl = root.querySelector('#tg-text'); hintEl = root.querySelector('#tg-hint');
    actionBtn = root.querySelector('#tg-action'); nextBtn = root.querySelector('#tg-next');
    skipBtn = root.querySelector('#tg-skip'); caret = root.querySelector('#tg-caret');

    askEl = root.querySelector('#tg-ask');
    skipBtn.addEventListener('click', function (e) { e.stopPropagation(); openAsk(); });
    root.querySelector('#tg-ask-page').addEventListener('click', function (e) { e.stopPropagation(); finish(); });
    root.querySelector('#tg-ask-all').addEventListener('click', function (e) { e.stopPropagation(); markAllSeen(); finish(); });
    root.querySelector('#tg-ask-keep').addEventListener('click', function (e) { e.stopPropagation(); closeAsk(); });
    askEl.addEventListener('click', function (e) { e.stopPropagation(); if (e.target === askEl) closeAsk(); });
    nextBtn.addEventListener('click', function (e) { e.stopPropagation(); if (!asking) advance(); });
    cutEl.addEventListener('click', function (e) { e.stopPropagation(); if (!asking && cutEl.classList.contains('tg-live')) advance(); });
    root.querySelector('#tg-box').addEventListener('click', function () {
      if (asking) return;
      if (typing) { finishTyping(); return; }
      var st = currentStep();
      if (st && !st._hasTarget) advance();
    });
    root.addEventListener('click', function (e) {
      if (e.target !== root || asking) return;
      if (typing) finishTyping();
      else { stageEl.classList.remove('tg-nudge'); void stageEl.offsetWidth; stageEl.classList.add('tg-nudge'); }
    });
    ['touchmove', 'wheel'].forEach(function (ev) {
      root.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false });
    });
    document.addEventListener('keydown', function (e) {
      if (!run) return;
      if (e.key === 'Escape') { if (asking) closeAsk(); else openAsk(); }
      else if (asking) {}
      else if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); if (typing) finishTyping(); else advance(); }
    });
    window.addEventListener('resize', scheduleLayout);
    window.addEventListener('orientationchange', scheduleLayout);
  }

  function currentStep() { return run ? run.steps[run.i] : null; }

  function openAsk() {
    if (!run || asking) return;
    if (run.preview) { finish(); return; }
    asking = true; askEl.classList.add('open'); root.classList.add('tg-asking');
    var b = root.querySelector('#tg-ask-page'); if (b) b.focus();
  }
  function closeAsk() {
    asking = false;
    if (askEl) askEl.classList.remove('open');
    if (root) root.classList.remove('tg-asking');
  }

  function scheduleLayout() {
    if (!run || layoutRaf) return;
    layoutRaf = requestAnimationFrame(function () { layoutRaf = 0; if (run) place(currentStep(), false); });
  }

  function visibleRect(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    return r;
  }

  function findTarget(sel) {
    if (!sel) return null;
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) {
      var page = els[i].closest('.page');
      if (page && !page.classList.contains('active')) continue;
      if (els[i].closest('[hidden]')) continue;
      if (visibleRect(els[i])) return els[i];
    }
    return null;
  }

  function place(step, animate) {
    if (!step) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    var el = step._el;
    var r = el ? visibleRect(el) : null;
    step._hasTarget = !!r;
    if (r) {
      var pad = 6;
      var x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
      var w = Math.min(vw - 8, r.width + pad * 2), h = Math.min(vh - 8, r.height + pad * 2);
      var round = Math.abs(w - h) <= Math.max(6, Math.min(w, h) * 0.16) && Math.max(w, h) <= 130;
      var rad = round ? '50%' : Math.min(18, Math.max(10, parseFloat(window.getComputedStyle(el).borderTopLeftRadius) + pad || 12)) + 'px';
      if (!animate) cutEl.style.transition = 'none';
      cutEl.style.left = x + 'px'; cutEl.style.top = y + 'px';
      cutEl.style.width = w + 'px'; cutEl.style.height = h + 'px';
      cutEl.style.borderRadius = rad;
      if (!animate) { void cutEl.offsetWidth; cutEl.style.transition = ''; }
      cutEl.classList.add('tg-live'); root.classList.remove('tg-fulldim');
      var boxH = stageEl.offsetHeight || 150;
      var overlapsBottom = (y + h) > (vh - boxH - 24);
      stageEl.classList.toggle('tg-top', overlapsBottom);
    } else {
      cutEl.classList.remove('tg-live'); root.classList.add('tg-fulldim');
      stageEl.classList.remove('tg-top');
    }
    hintEl.textContent = r ? 'Tap the highlighted area to continue' : '';
    hintEl.style.display = r ? '' : 'none';
    nextBtn.style.display = r ? 'none' : '';
    caret.style.display = r ? 'none' : '';
  }

  function scrollParent(el) {
    var n = el.parentElement;
    while (n && n !== document.body && n !== document.documentElement) {
      var cs = window.getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 2) return n;
      n = n.parentElement;
    }
    return null;
  }
  function ensureVisible(el) {
    try {
      var r = el.getBoundingClientRect(), vh = window.innerHeight;
      if (r.top >= 0 && r.bottom <= vh) return;
      var sp = scrollParent(el);
      if (!sp) return;
      var delta = (r.height > vh * 0.6) ? (r.top - vh * 0.18) : ((r.top + r.height / 2) - vh / 2);
      sp.scrollTop += delta;
    } catch (e) {}
  }

  function stepIsSkipped(st) {
    if (st.skipIf && st.skipIf()) return true;
    return false;
  }

  function showStep() {
    var st = currentStep();
    if (!st) { finish(); return; }
    if (stepIsSkipped(st)) { run.i++; showStep(); return; }
    var dyn = st.dynamic ? st.dynamic() : null;
    var text = dyn ? dyn.text : st.text;
    st._el = st.target ? findTarget(st.target) : null;
    if (st.target && !st._el && st.optional) { run.i++; showStep(); return; }
    if (st._el) ensureVisible(st._el);
    var isLast = run.i >= lastIndex();
    nextBtn.textContent = isLast ? 'Got it!' : 'Next';
    skipBtn.style.visibility = isLast ? 'hidden' : 'visible';
    if (dyn && dyn.action) {
      actionBtn.hidden = false; actionBtn.textContent = dyn.action.label;
      actionBtn.onclick = function (e) {
        e.stopPropagation();
        dyn.action.run(function (msg) { actionBtn.hidden = true; if (msg) { stopTyping(); typeText(msg); } });
      };
    } else { actionBtn.hidden = true; actionBtn.onclick = null; }
    nameEl.textContent = run.tour.guide || 'Guide';
    place(st, true);
    typeText(text);
    setTimeout(function () { if (run && currentStep() === st) place(st, true); }, 120);
  }

  function lastIndex() {
    var n = run.steps.length - 1;
    while (n > 0 && stepIsSkipped(run.steps[n])) n--;
    return n;
  }

  function stopTyping() { if (typeTimer) { clearInterval(typeTimer); typeTimer = null; } typing = false; }
  function setTyped(n) {
    textEl.textContent = '';
    var a = document.createElement('span'), b = document.createElement('span');
    a.textContent = fullText.slice(0, n);
    b.textContent = fullText.slice(n);
    b.className = 'tg-ghost';
    textEl.appendChild(a); textEl.appendChild(b);
  }
  function finishTyping() { stopTyping(); textEl.textContent = fullText; root.classList.remove('tg-typing'); }
  function typeText(t) {
    stopTyping();
    fullText = t || '';
    if (reduced || !fullText) { textEl.textContent = fullText; root.classList.remove('tg-typing'); return; }
    typing = true; root.classList.add('tg-typing');
    var n = 0;
    setTyped(0);
    typeTimer = setInterval(function () {
      n += 2;
      if (n >= fullText.length) { finishTyping(); return; }
      setTyped(n);
    }, 24);
  }

  function advance() {
    if (!run) return;
    if (typing) { finishTyping(); }
    var idx = run.i;
    if (idx >= lastIndex()) { finish(); return; }
    run.i++;
    showStep();
  }

  function finish(abort) {
    if (!run) return;
    var page = run.page;
    stopTyping();
    closeAsk();
    if (!abort && page && !run.preview) markSeen(page);
    run = null;
    if (root) { root.classList.remove('tg-open', 'tg-fulldim'); cutEl.classList.remove('tg-live'); }
    document.documentElement.classList.remove('tg-active');
  }

  function start(page, forced, tourDef) {
    var tour = tourDef || TOURS[page];
    if (!tour) return false;
    if (run) finish(true);
    if (!forced && seen(page)) return false;
    if (page === 'map' && window.NavFP && NavFP.active) NavFP.exit();
    build();
    run = { page: page, tour: tour, steps: tour.steps, i: 0, preview: !!tourDef };
    document.documentElement.classList.add('tg-active');
    root.classList.add('tg-open', 'tg-fulldim');
    cutEl.classList.remove('tg-live');
    charBox.innerHTML = '';
    var guideName = tour.guide || 'Princess';
    guideCanvas(guideName, function (cv) {
      if (!cv) { charBox.innerHTML = '<span class="tg-char-fallback"></span>'; return; }
      var k = window.innerHeight < 700 ? 0.25 : 0.3125;
      cv.style.width = Math.round(cv.width * k) + 'px'; cv.style.height = Math.round(cv.height * k) + 'px';
      cv.className = 'tg-sprite';
      charBox.appendChild(cv);
      scheduleLayout();
    });
    showStep();
    return true;
  }

  var pageTimer = null;
  function onPageEnter(page) {
    if (run && run.page !== page) finish(true);
    if (pageTimer) { clearTimeout(pageTimer); pageTimer = null; }
    if (!TOURS[page] || seen(page)) return;
    pageTimer = setTimeout(function () {
      pageTimer = null;
      var active = document.querySelector('.page.active');
      if (active && active.id === 'page-' + page) start(page, false);
    }, 700);
  }
  window.onPageEnter = onPageEnter;
  window.showPageHelp = function (page) {
    if (pageTimer) { clearTimeout(pageTimer); pageTimer = null; }
    if (page === 'map' && window.NavFP && NavFP.active) page = 'firstperson';
    start(page, true);
  };
  window.onFirstPersonEnter = function () {
    if (seen('firstperson')) return;
    setTimeout(function () {
      if (!window.NavFP || !NavFP.active || run) return;
      start('firstperson', false);
    }, 700);
  };
  window.onFirstPersonExit = function () {
    if (run && run.page === 'firstperson') finish(true);
  };

  function splashGone() {
    var splash = document.getElementById('splash-screen');
    return !splash || splash.style.display === 'none' || !document.body.contains(splash) || window.getComputedStyle(splash).display === 'none';
  }
  function currentPage() {
    var a = document.querySelector('.page.active');
    return a ? a.id.replace(/^page-/, '') : 'main';
  }
  function maybeAuto() {
    var tries = 0;
    (function wait() {
      if (splashGone()) { setTimeout(function () { onPageEnter(currentPage()); }, 500); return; }
      if (++tries < 60) setTimeout(wait, 500);
    })();
  }
  if (document.readyState === 'complete') maybeAuto();
  else window.addEventListener('load', maybeAuto);

  var menuEl = null;
  function closeMenu() { if (menuEl) menuEl.classList.remove('open'); }
  function buildMenu() {
    menuEl = document.createElement('div');
    menuEl.id = 'tg-menu';
    var html = '<div class="tg-menu-card" role="dialog" aria-modal="true" aria-label="How to use this app">' +
      '<div class="tg-menu-title">How to use this app</div>' +
      '<p class="tg-menu-sub">Pick a guide to replay.</p>' +
      '<button type="button" class="tg-menu-item tg-menu-install" data-act="install">Install the app on your phone</button>';
    ['main', 'map', 'firstperson', 'walkthrough', 'directory', 'devzones', 'about'].forEach(function (p) {
      html += '<button type="button" class="tg-menu-item" data-page="' + p + '">' + PAGE_NAMES[p] + '</button>';
    });
    html += '<button type="button" class="tg-menu-close" data-act="close">Close</button></div>';
    menuEl.innerHTML = html;
    document.body.appendChild(menuEl);
    menuEl.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (e.target === menuEl || (b && b.getAttribute('data-act') === 'close')) { closeMenu(); return; }
      if (!b) return;
      if (b.getAttribute('data-act') === 'install') { closeMenu(); window.showInstallHelp(); return; }
      var p = b.getAttribute('data-page');
      if (!p) return;
      closeMenu();
      var pg = p === 'firstperson' ? 'map' : p;
      if (typeof goTo === 'function' && currentPage() !== pg) goTo(pg);
      setTimeout(function () {
        if (p === 'firstperson' && window.NavFP && !NavFP.active) NavFP.enter();
        if (p === 'firstperson' && !(window.NavFP && NavFP.active)) { start('map', true); return; }
        start(p, true);
      }, currentPage() === pg ? 300 : 1100);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menuEl && menuEl.classList.contains('open')) closeMenu(); });
  }
  window.showTutorial = function () { if (!menuEl) buildMenu(); menuEl.classList.add('open'); };
  window.showInstallHelp = function () {
    var guide = { guide: TOURS[currentPage()] ? TOURS[currentPage()].guide : 'Princess', steps: [ { dynamic: installInfo, last: true } ] };
    start('install', true, guide);
  };
})();
