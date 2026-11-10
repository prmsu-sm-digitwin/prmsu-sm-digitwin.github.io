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

window.history.replaceState({ page: 'main', sidebar: false, vmq: false, root: true }, '', '#main');
window.history.pushState({ page: 'main', sidebar: false, vmq: false }, '', '#main');

let leavingApp = false;

let suppressPop = false;
let pendingPush = null;

function updateNav(pageId) {
  const isMain = pageId === 'main';
  document.querySelector('.nav-btn.nav-home').style.color =
    isMain ? 'var(--gold-light)' : 'rgba(255,255,255,0.55)';
}

let sidebarContext = 'map';
function openSidebar(fromPage) {
  sidebarContext = fromPage;

  ['main','map','walkthrough','directory','devzones','about'].forEach(id => {
    const el = document.getElementById('s-' + id);
    if (el) el.classList.toggle('active-item', id === fromPage);
  });
  document.getElementById('sidebar-overlay').classList.add('open');
  sidebarOverlayOpen = true;
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

  const openedFromInner = sidebarContext !== 'main';

  const prevEl = document.getElementById('page-' + current);
  const nextEl = document.getElementById('page-' + pageId);
  if (nextEl && pageId !== current) {
    const leavingWalkthrough = current === 'walkthrough';
    prevEl.classList.remove('active');
    nextEl.classList.add('active');
    current = pageId;
    updateNav(pageId);

    if (window.CampusWalkthrough) {
      if (pageId === 'walkthrough') window.CampusWalkthrough.onEnter();
      else if (leavingWalkthrough) window.CampusWalkthrough.onLeave();
    }

    if (typeof window.onPageEntered === 'function') window.onPageEntered(pageId);
    if (pageId === 'map' && typeof window.__reinitSheet === 'function') window.__reinitSheet();
  }

  if (openedFromInner) {
    suppressPop = true;
    pendingPush = (pageId === 'main') ? null : { page: pageId, sidebar: false, vmq: false };
    window.history.go(-2);
    return;
  }

  window.history.replaceState({ page: pageId, sidebar: false, vmq: false }, '', '#' + pageId);
}

(function () {
  var panel, handle, dragging, startY, startH, maxH;

  var SNAP_COLLAPSED = 0;
  var SNAP_MID, SNAP_FULL;
  var currentSnap = 'collapsed';

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
    if (name === 'collapsed' && typeof window.onSheetCollapsed === 'function') window.onSheetCollapsed();
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
    var dy = startY - getY(e);
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

  window.sheetCollapse = function() {
    if (currentSnap !== 'collapsed') snapTo('collapsed');
  };

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

  function reinitSheet() {
    setTimeout(function() {
      var el = document.getElementById('sheet-panel');
      if (el) { el._ready = false; }
      initSheet();
    }, 60);
  }
  window.__reinitSheet = reinitSheet;

  var _goTo = window.goTo;
  window.goTo = function(p, fromPopState) {
    _goTo(p, fromPopState);
    if (p === 'map') reinitSheet();
  };

  window.addEventListener('load', function() {
    if (document.getElementById('page-map') &&
        document.getElementById('page-map').classList.contains('active')) {
      setTimeout(initSheet, 60);
    }
  });
})();

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

  if (!_fromPopState) {
    window.history.pushState({ page: pageId, sidebar: false, vmq: false }, '', '#' + pageId);
  }
  if (window.onPageEnter) { try { window.onPageEnter(pageId); } catch (e) {} }
}

function goBack() {
  window.history.back();
}

window.addEventListener('popstate', function (e) {
  if (suppressPop) {
    suppressPop = false;
    if (pendingPush) {
      window.history.pushState(pendingPush, '', '#' + pendingPush.page);
      pendingPush = null;
    }
    return;
  }

  if (!e.state || e.state.root) {
    if (current !== 'main') {
      goTo('main', true);
      window.history.pushState({ page: 'main', sidebar: false, vmq: false }, '', '#main');
      return;
    }
    if (e.state && e.state.root && !leavingApp) {
      leavingApp = true;
      window.history.back();
    }
    return;
  }

  const state = e.state;

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

(function () {
  var _goTo3 = window.goTo;
  window.goTo = function (p, fromPopState) {
    var leavingWalkthrough = current === 'walkthrough' && p !== 'walkthrough';
    _goTo3(p, fromPopState);
    if (window.CampusWalkthrough) {
      if (p === 'walkthrough') window.CampusWalkthrough.onEnter();
      else if (leavingWalkthrough) window.CampusWalkthrough.onLeave();
    }
  };
})();

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