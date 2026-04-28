const vmqData = {
  vision: {
    title: 'Vision',
    text: 'President Ramon Magsaysay State University envisions itself as a premier state university in the CALABARZON and Central Luzon regions, producing competent, innovative, and morally upright graduates who contribute to national development and global competitiveness.'
  },
  mission: {
    title: 'Mission',
    text: 'PRMSU is committed to provide quality higher education, advanced technology education, research, extension services and production activities to produce competent, disciplined and morally upright graduates who will serve the needs of the industry and the community.'
  },
  quality: {
    title: 'Quality Policy',
    text: 'PRMSU is committed to provide quality higher education and promote quality culture through continual improvement of its services anchored on good governance, relevant academic programs, research and extension activities, and linkages to satisfy stakeholders\' needs and comply with applicable requirements.'
  }
};

let history = ['main'];
let current = 'main';

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
}
function closeSidebar(e) {
  if (e.target === document.getElementById('sidebar-overlay')) {
    document.getElementById('sidebar-overlay').classList.remove('open');
  }
}
function closeSidebarBtn() {
  document.getElementById('sidebar-overlay').classList.remove('open');
}
function sidebarGoTo(pageId) {
  document.getElementById('sidebar-overlay').classList.remove('open');
  goTo(pageId);
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
  window.goTo = function(p) {
    _goTo(p);
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

function goTo(pageId) {
  const prev = document.getElementById('page-' + current);
  const next = document.getElementById('page-' + pageId);
  if (!next || pageId === current) return;

  prev.classList.remove('active');
  next.classList.add('active');

  if (pageId !== 'main') {
    history.push(pageId);
  } else {
    history = ['main'];
  }
  current = pageId;
  updateNav(pageId);
}

function goBack() {
  if (history.length > 1) {
    history.pop();
    const prev = history[history.length - 1];
    const prevEl = document.getElementById('page-' + current);
    const nextEl = document.getElementById('page-' + prev);
    prevEl.classList.remove('active');
    nextEl.classList.add('active');
    current = prev;
    updateNav(prev);
  }
}

function toggleMenu() {
  goTo('main');
}

function openVmq(key) {
  const data = vmqData[key];
  document.getElementById('vmq-modal-title').textContent = data.title;
  document.getElementById('vmq-modal-text').textContent = data.text;
  document.getElementById('vmq-overlay').classList.add('open');
}

function closeVmq(e) {
  if (e.target === document.getElementById('vmq-overlay')) {
    document.getElementById('vmq-overlay').classList.remove('open');
  }
}