(function () {
  var root = document.documentElement;
  function applyZ() {
    var z = 1;
    if (window.innerWidth >= 900) z = Math.max(1, Math.min(window.innerWidth / 1500, window.innerHeight / 850, 3));
    z = Math.round(z * 100) / 100;
    root.style.setProperty('--z', String(z));
    try {
      if (typeof layoutDevzonesLabels === 'function') { devzonesLabelScale = -1; layoutDevzonesLabels(); }
    } catch (e) {}
  }
  applyZ();
  window.addEventListener('resize', applyZ);
})();

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
window.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  var tg = document.getElementById('tg-root');
  if (tg && tg.classList.contains('tg-open')) return;
  var kh = document.getElementById('kb-help-overlay');
  if (kh && kh.classList.contains('open')) { closeKbHelp(); e.preventDefault(); return; }
  function isOpen(id, cls) { var el = document.getElementById(id); return !!el && el.classList.contains(cls); }
  if (vmqOverlayOpen || sidebarOverlayOpen) { window.history.back(); e.preventDefault(); return; }
  if (isOpen('devzones-pov', 'is-open')) { closeDevzonePOV(); e.preventDefault(); return; }
  if (typeof legendOpen !== 'undefined' && legendOpen) { toggleLegend(); e.preventDefault(); return; }
  var bp = document.getElementById('building-panel');
  if (bp && !bp.classList.contains('hidden') && typeof closePanel === 'function') { closePanel(); e.preventDefault(); return; }
  var sp = document.getElementById('sheet-panel');
  if (sp && sp.offsetHeight > 0 && typeof window.sheetCollapse === 'function') {
    var ae = document.activeElement;
    if (ae && ae.tagName === 'INPUT') ae.blur();
    window.sheetCollapse(); e.preventDefault();
    return;
  }
  var pb = document.getElementById('path-bar'), mpg = document.getElementById('page-map');
  if (pb && !pb.classList.contains('hidden') && mpg && mpg.classList.contains('active') && typeof clearNavigation === 'function') {
    clearNavigation(); e.preventDefault();
  }
});

window.addEventListener('keydown', function (e) {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  var t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  var tg = document.getElementById('tg-root');
  if (tg && tg.classList.contains('tg-open')) return;
  var mp = document.getElementById('page-map');
  var inp = document.getElementById('building-search-input');
  if (!mp || !mp.classList.contains('active') || !inp) return;
  e.preventDefault();
  if (window.NavFP && NavFP.active && NavFP.openSearch) { NavFP.openSearch(); return; }
  if (typeof window.sheetEnsureOpen === 'function') window.sheetEnsureOpen();
  inp.focus();
});

document.addEventListener('keydown', function (e) {
  var inp = document.getElementById('building-search-input');
  if (!inp) return;
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
  var onInput = e.target === inp;
  if (!onInput) {
    var tt = e.target;
    if (tt && (tt.tagName === 'INPUT' || tt.tagName === 'TEXTAREA' || tt.tagName === 'SELECT' || tt.tagName === 'BUTTON' || tt.tagName === 'A' || tt.isContentEditable)) return;
    var tgo = document.getElementById('tg-root');
    if (tgo && tgo.classList.contains('tg-open')) return;
    var kho = document.getElementById('kb-help-overlay');
    if (kho && kho.classList.contains('open')) return;
    var bpo = document.getElementById('building-panel');
    if (bpo && !bpo.classList.contains('hidden')) return;
    var mpo = document.getElementById('page-map');
    var spo = document.getElementById('sheet-panel');
    if (!mpo || !mpo.classList.contains('active') || !spo || spo.offsetHeight <= 0) return;
  }
  var items = Array.prototype.slice.call(document.querySelectorAll('#building-sheet-list .building-item'));
  if (!items.length) return;
  var cur = -1;
  items.forEach(function (it, i) { if (it.classList.contains('kb-active')) cur = i; });
  if (!onInput && e.key === 'Enter' && cur < 0) return;
  e.preventDefault();
  if (!onInput) e.stopImmediatePropagation();
  if (e.key === 'Enter') {
    var pick = items[cur >= 0 ? cur : 0];
    inp.blur();
    pick.click();
    return;
  }
  var n = e.key === 'ArrowDown' ? Math.min(items.length - 1, cur + 1) : Math.max(0, cur <= 0 ? 0 : cur - 1);
  items.forEach(function (it) { it.classList.remove('kb-active'); });
  items[n].classList.add('kb-active');
  items[n].scrollIntoView({ block: 'nearest' });
});

function kbHelpSections() {
  var fp = window.NavFP && NavFP.active;
  var out = [];
  if (current === 'map' && fp) {
    out.push({ t: 'First person view', r: [
      [['W', 'A', 'S', 'D'], 'Walk (the arrow keys work too)'],
      [['Shift'], 'Hold to run'],
      [['/'], 'Search for a building'],
      [['F'], 'Back to the map'] ] });
  } else if (current === 'map') {
    out.push({ t: 'Navigation Map', r: [
      [['Arrows', 'W', 'A', 'S', 'D'], 'Move the map'],
      [['Q', 'E'], 'Rotate the map'],
      [['+', '-'], 'Zoom in and out'],
      [['F'], 'Walk in first person'],
      [['/'], 'Search for a building'],
      [['Up', 'Down', 'Enter'], 'Choose in the search list or the building panel'] ] });
  } else if (current === 'walkthrough') {
    out.push({ t: 'Campus Walkthrough', r: [
      [['Up', 'W', 'Space'], 'Walk forward'],
      [['Down', 'S'], 'Go back'],
      [['Left', 'Right'], 'Turn the view'],
      [['+', '-'], 'Zoom in and out'] ] });
  }
  return out;
}

function buildKbHelp() {
  var ov = document.getElementById('kb-help-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'kb-help-overlay';
    ov.className = 'kb-help-overlay';
    ov.addEventListener('click', function (e) { if (e.target === ov) closeKbHelp(); });
    document.body.appendChild(ov);
  }
  var html = '<div class="kb-help-card" role="dialog" aria-label="Keyboard shortcuts"><h2 class="kb-help-title">Keyboard shortcuts</h2>';
  kbHelpSections().forEach(function (s) {
    html += '<div class="kb-help-group">' + s.t + '</div>';
    s.r.forEach(function (row) {
      html += '<div class="kb-help-row2"><span class="kb-help-keys">' + row[0].map(function (k) { return '<kbd>' + k + '</kbd>'; }).join('') + '</span><span>' + row[1] + '</span></div>';
    });
  });
  html += '<button type="button" class="kb-help-close" onclick="closeKbHelp()">Close</button></div>';
  ov.innerHTML = html;
  return ov;
}
function showKbHelp() { buildKbHelp().classList.add('open'); }
function closeKbHelp() { var ov = document.getElementById('kb-help-overlay'); if (ov) ov.classList.remove('open'); }

document.addEventListener('keydown', function (e) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter') return;
  if (document.documentElement.getAttribute('data-device') !== 'desktop') return;
  var t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.tagName === 'A' || t.isContentEditable)) return;
  var tg = document.getElementById('tg-root');
  if (tg && tg.classList.contains('tg-open')) return;
  var ov = document.getElementById('kb-help-overlay');
  if (ov && ov.classList.contains('open')) return;
  var bp = document.getElementById('building-panel');
  if (!bp || bp.classList.contains('hidden')) return;
  var btns = ['navigate-btn', 'start-from-btn'].map(function (id) { return document.getElementById(id); })
    .filter(function (b) { return b && !b.classList.contains('hidden'); });
  if (!btns.length) return;
  var cur = -1;
  btns.forEach(function (b, i) { if (b.classList.contains('kb-active')) cur = i; });
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.key === 'Enter') {
    var pick = btns[cur >= 0 ? cur : 0];
    btns.forEach(function (b) { b.classList.remove('kb-active'); });
    pick.click();
    return;
  }
  var n = e.key === 'ArrowDown' ? Math.min(btns.length - 1, cur + 1) : Math.max(0, cur <= 0 ? 0 : cur - 1);
  btns.forEach(function (b) { b.classList.remove('kb-active'); });
  btns[n].classList.add('kb-active');
});
