const vmqData = {
  vision: {
    title: 'Vision',
    text: 'PRMSU shall be a premier learner-centered and proactive university in a digital and global society.'
  },
  mission: {
    title: 'Mission',
    text: 'The PRMSU shall primarily provide advance and higher professional, technical, and special instructions in various disciplines; undertake research, extension and income generation programs for the sustainable development of Zambales, the region and the country.'
  },
  quality: {
    title: 'Quality Policy',
    text: 'The President Ramon Magsaysay State University is committed to continually strive for excellence in instruction, research, extension and production to strengthen global competitiveness adhering to quality standards for the utmost satisfaction of its valued customers.'
  }
};

let current = 'main';
let sidebarOverlayOpen = false;
let vmqOverlayOpen = false;

// The Android hardware/gesture back button (and, further down, a custom
// iOS edge-swipe gesture) both act on window.history -- not on a variable
// we invent ourselves. The old code named its own page stack `history`,
// which shadowed window.history and could never have been wired to the
// real back button. Every page/overlay change below pushes a real state,
// and the popstate listener re-renders the UI to match wherever the user
// lands -- so backing out of a page/sidebar/modal just works, and the app
// only exits when there's genuinely nothing left to go back to.
window.history.replaceState({ page: 'main', sidebar: false, vmq: false }, '', '#main');

function updateNav(pageId) {
  const isMain = pageId === 'main';
  document.querySelector('.nav-btn.nav-home').style.color =
    isMain ? 'var(--gold-light)' : 'rgba(255,255,255,0.55)';
}

let sidebarContext = 'map';
function openSidebar(fromPage) {
  sidebarContext = fromPage;

  ['main','map','legend','about'].forEach(id => {
    const el = document.getElementById('s-' + id);
    if (el) el.classList.toggle('active-item', id === fromPage);
  });
  document.getElementById('sidebar-overlay').classList.add('open');
  sidebarOverlayOpen = true;
  // Opening the drawer is its own history entry, so one back press (or one
  // hardware/gesture back) closes it instead of quitting the app outright.
  window.history.pushState({ page: current, sidebar: true, vmq: false }, '', '#sidebar');
}
function closeSidebar(e) {
  if (e.target === document.getElementById('sidebar-overlay')) {
    window.history.back();
  }
}
function closeSidebarBtn() {
  window.history.back();
}
function sidebarGoTo(pageId) {
  document.getElementById('sidebar-overlay').classList.remove('open');
  sidebarOverlayOpen = false;
  const prevEl = document.getElementById('page-' + current);
  const nextEl = document.getElementById('page-' + pageId);
  if (nextEl && pageId !== current) {
    prevEl.classList.remove('active');
    nextEl.classList.add('active');
    current = pageId;
    updateNav(pageId);
  }
  // Replace the "sidebar open" entry with the destination page rather than
  // pushing a new one, so back from here goes to wherever you were before
  // opening the drawer instead of popping the drawer back open.
  window.history.replaceState({ page: pageId, sidebar: false, vmq: false }, '', '#' + pageId);
}

(function () {
  var panel, handle, dragging, startY, startH, maxH;

  var SNAP_COLLAPSED = 0;
  var SNAP_MID, SNAP_FULL;
  var currentSnap = 'collapsed';

  function getContainer() {
    var pg = document.getElementById('page-map');
    return pg ? pg.querySelector('.pages') || pg.parentElement : null;
  }

  function getAvailH() {

    var pg = document.getElementById('page-map');
    if (!pg) return 400;
    return pg.offsetHeight;
  }

  function initSnaps() {
    var avail = getAvailH();
    SNAP_COLLAPSED = 0;
    SNAP_MID       = Math.round(avail * 0.42);
    SNAP_FULL      = Math.round(avail * 0.78);
  }

  function setHeight(h, animate) {
    panel = document.getElementById('sheet-panel');
    if (!panel) return;
    if (animate) {
      panel.classList.remove('no-anim');
    } else {
      panel.classList.add('no-anim');
    }
    panel.style.height = h + 'px';
  }

  function snapTo(name, animate) {
    animate = (animate === undefined) ? true : animate;
    initSnaps();
    currentSnap = name;
    var h = name === 'full' ? SNAP_FULL : name === 'mid' ? SNAP_MID : SNAP_COLLAPSED;
    setHeight(h, animate);
  }

  function nearestSnap(h) {
    initSnaps();
    var dC = Math.abs(h - SNAP_COLLAPSED);
    var dM = Math.abs(h - SNAP_MID);
    var dF = Math.abs(h - SNAP_FULL);
    if (dC <= dM && dC <= dF) return 'collapsed';
    if (dM <= dF) return 'mid';
    return 'full';
  }

  function getY(e) {
    return e.touches ? e.touches[0].clientY : e.clientY;
  }

  function onStart(e) {
    panel = document.getElementById('sheet-panel');
    if (!panel) return;
    dragging = true;
    startY = getY(e);
    startH = panel.offsetHeight;
    panel.classList.add('no-anim');
  }

  function onMove(e) {
    if (!dragging || !panel) return;
    initSnaps();
    var dy = startY - getY(e); // positive = drag up = expand
    var newH = Math.max(0, Math.min(SNAP_FULL, startH + dy));
    panel.style.height = newH + 'px';
    if (e.cancelable) e.preventDefault();
  }

  function onEnd() {
    if (!dragging || !panel) return;
    dragging = false;
    var h = panel.offsetHeight;
    snapTo(nearestSnap(h), true);
  }

  window.sheetToggle = function() {
    if (currentSnap === 'collapsed') snapTo('mid');
    else snapTo('collapsed');
  };

  // Used by the search input's focus handler: open the sheet if it's
  // collapsed, but (unlike sheetToggle) never closes an already-open one —
  // tapping back into the input to keep typing shouldn't collapse the
  // results list out from under the keyboard.
  window.sheetEnsureOpen = function() {
    if (currentSnap === 'collapsed') snapTo('mid');
  };

  function initSheet() {
    panel  = document.getElementById('sheet-panel');
    handle = document.getElementById('sheet-handle');
    if (!panel || panel._ready) return;
    panel._ready = true;

    snapTo('collapsed', false);

    var dragZone = handle || panel;
    dragZone.addEventListener('touchstart', onStart, { passive: true });
    dragZone.addEventListener('mousedown',  onStart);

    window.addEventListener('touchmove',  onMove,  { passive: false });
    window.addEventListener('mousemove',  onMove);
    window.addEventListener('touchend',   onEnd);
    window.addEventListener('mouseup',    onEnd);
  }

  var _goTo = window.goTo;
  window.goTo = function(p, fromPopState) {
    _goTo(p, fromPopState);
    if (p === 'map') {
      setTimeout(function() {
        var el = document.getElementById('sheet-panel');
        if (el) { el._ready = false; }
        initSheet();
      }, 60);
    }
  };

  window.addEventListener('load', function() {
    if (document.getElementById('page-map') &&
        document.getElementById('page-map').classList.contains('active')) {
      setTimeout(initSheet, 60);
    }
  });
})();

// Homepage nav buttons (Navigation Map / Legend / About) use a JS-driven
// `.is-pressed` class instead of CSS `:active` for their pressed look (see
// style.css). Reason: tapping one of these calls goTo() synchronously,
// which hides the button's page immediately -- so on some mobile Chrome
// builds the matching touchend/mouseup never gets delivered while it's
// hidden, and `:active` stays permanently matched. The next time that page
// is shown again (e.g. via the hardware/gesture back button), the button
// looks stuck "pressed" (pale gold fill) even though nothing is touching
// it. `.is-pressed` is fully JS-controlled so it can't get stuck: it's
// cleared on every touchend/touchcancel/mouseup/mouseleave, on every
// popstate, and defensively at the top of every goTo() call too.
function clearMainNavPress() {
  document.querySelectorAll('.main-nav-btn.is-pressed').forEach(function (b) {
    b.classList.remove('is-pressed');
  });
}
(function () {
  function press(e) {
    var btn = e.target.closest && e.target.closest('.main-nav-btn');
    if (btn) btn.classList.add('is-pressed');
  }
  document.addEventListener('touchstart', press, { passive: true });
  document.addEventListener('mousedown', press);
  document.addEventListener('touchend', clearMainNavPress);
  document.addEventListener('touchcancel', clearMainNavPress);
  document.addEventListener('mouseup', clearMainNavPress);
  document.addEventListener('mouseleave', clearMainNavPress);
})();

function goTo(pageId, _fromPopState) {
  clearMainNavPress();
  const prev = document.getElementById('page-' + current);
  const next = document.getElementById('page-' + pageId);
  if (!next || pageId === current) return;

  prev.classList.remove('active');
  next.classList.add('active');
  current = pageId;
  updateNav(pageId);

  // Only push a new history entry for a real forward navigation. When this
  // call is the popstate handler replaying a back/forward move, the browser
  // has already moved -- pushing again here would double up the stack.
  if (!_fromPopState) {
    window.history.pushState({ page: pageId, sidebar: false, vmq: false }, '', '#' + pageId);
  }
}

// Kept for anything that still wants to call "go back" programmatically --
// just defers to the real back button so the popstate handler below is the
// one and only place that decides what "back" renders.
function goBack() {
  window.history.back();
}

// Single source of truth for "what should the screen look like right now",
// driven by whatever state the browser's history says we're on. This is what
// makes the Android hardware/gesture back button step back through pages and
// overlays instead of quitting the app -- and it's also what the iOS
// edge-swipe gesture further down calls into via window.history.back().
window.addEventListener('popstate', function (e) {
  const state = e.state || { page: 'main', sidebar: false, vmq: false };

  const sidebarEl = document.getElementById('sidebar-overlay');
  const vmqEl = document.getElementById('vmq-overlay');

  clearMainNavPress();
  sidebarOverlayOpen = !!state.sidebar;
  vmqOverlayOpen = !!state.vmq;
  sidebarEl.classList.toggle('open', sidebarOverlayOpen);
  vmqEl.classList.toggle('open', vmqOverlayOpen);

  if (state.page && state.page !== current) {
    goTo(state.page, true);
  }
});

function toggleMenu() {
  goTo('main');
}

function openVmq(key) {
  const data = vmqData[key];
  document.getElementById('vmq-modal-title').textContent = data.title;
  document.getElementById('vmq-modal-text').textContent = data.text;
  document.getElementById('vmq-overlay').classList.add('open');
  vmqOverlayOpen = true;
  window.history.pushState({ page: current, sidebar: false, vmq: true }, '', '#vmq');
}

function closeVmq(e) {
  if (e.target === document.getElementById('vmq-overlay')) {
    window.history.back();
  }
}