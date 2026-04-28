// =============================================================
//  js/ui.js  —  PRMSU SM Digital Twin  (integrated with Jonathan's script.js)
//
//  Jonathan's script.js handles:  goTo, goBack, history, openSidebar,
//    closeSidebar, sidebarGoTo, sheetToggle, openVmq, closeVmq
//
//  This file handles:
//    - Building info panel (showBuildingInfo / hideBuildingInfo)
//    - Path info bar (showPathInfo / hidePathInfo / clearNavigation)
//    - GPS toggle button
//    - Building sheet list (populated from campus.json)
//    - Hook into goTo for Three.js canvas resize
// =============================================================


// ── State ────────────────────────────────────────────────────
let selectedBuilding = null;   // building object currently shown in panel
let gpsEnabled       = false;  // GPS on/off
let campusBuildings  = [];     // filled by onSceneReady() from main.js


// ── Hook into goTo for Three.js resize ───────────────────────
// When the user navigates TO the map page, the canvas needs a resize
// signal because it was hidden (zero-size) while inactive.
// script.js already wraps goTo once; we chain onto it here.
(function () {
  var _goTo = window.goTo;
  window.goTo = function (pageId) {
    _goTo(pageId);
    if (pageId === 'map') {
      // Give the DOM 1 frame to layout before firing resize
      setTimeout(function () {
        if (typeof onResize === 'function') onResize();
      }, 80);
    }
  };
})();


// ── Building Info Panel ───────────────────────────────────────

// Called by main.js when a building mesh is tapped
function showBuildingInfo(bldg) {
  selectedBuilding = bldg;

  setText('building-name',        bldg.name        || '—');
  setText('building-description', bldg.description || '');

  const badge = document.getElementById('building-category-badge');
  if (badge) {
    badge.textContent = bldg.category || 'facility';
    badge.className   = 'category-badge ' + (bldg.category || 'facility');
  }

  show('building-panel');
}

// Called by main.js when user taps empty space, or by closePanel()
function hideBuildingInfo() {
  selectedBuilding = null;
  hide('building-panel');
}

// Called by the ✕ button on the panel
function closePanel() {
  hideBuildingInfo();
}


// ── Navigation ───────────────────────────────────────────────

// Called by the "Navigate Here" button
function navigateToSelected() {
  if (!selectedBuilding) {
    console.warn('[ui] No building selected');
    return;
  }
  hideBuildingInfo();

  if (typeof navigateTo === 'function') {
    navigateTo(selectedBuilding.id);
  } else {
    console.warn('[ui] navigateTo() not found — is main.js loaded?');
  }
}

// Called by main.js after A* draws the path
// pathIds  : array of waypoint id strings
// targetBldg : building object (has .name)
function showPathInfo(pathIds, targetBldg) {
  const name  = targetBldg ? targetBldg.name : '—';
  const stops = Array.isArray(pathIds) ? pathIds.length : pathIds;
  setText('path-destination', name);
  setText('path-steps', stops + ' stops');
  show('path-bar');
}

// Called by main.js / clearPath() when path is removed
function hidePathInfo() {
  setText('path-destination', '—');
  setText('path-steps', '');
  hide('path-bar');
}

// Called by the ✕ Clear button on the path bar
function clearNavigation() {
  hidePathInfo();
  hideBuildingInfo();
  if (typeof clearPath === 'function') clearPath();
}


// ── GPS ──────────────────────────────────────────────────────

function toggleGPS() {
  gpsEnabled = !gpsEnabled;
  const btn = document.getElementById('gps-btn');
  if (btn) btn.classList.toggle('gps-active', gpsEnabled);
  if (typeof setGPSEnabled === 'function') setGPSEnabled(gpsEnabled);
  console.log('[ui] GPS', gpsEnabled ? 'ON' : 'OFF');
}


// ── Building Sheet List ───────────────────────────────────────

// Called by onSceneReady() with the full campus data object
// Populates the draggable bottom sheet with building items
function populateBuildingSheet(buildings) {
  const container = document.getElementById('building-sheet-list');
  if (!container) return;
  container.innerHTML = '';

  if (!buildings || buildings.length === 0) {
    container.innerHTML = '<div class="building-cat">No buildings found</div>';
    return;
  }

  // Group by category
  const groups = {};
  buildings.forEach(b => {
    const cat = b.category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(b);
  });

  // Category display names
  const catLabels = {
    academic:       'Academic Buildings',
    administration: 'Administration',
    facility:       'Facilities',
    court:          'Courts & Open Spaces',
  };

  Object.keys(groups).sort().forEach(cat => {
    // Category header
    const header = document.createElement('div');
    header.className = 'building-cat';
    header.textContent = catLabels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
    container.appendChild(header);

    // Building items
    groups[cat].forEach(b => {
      const item = document.createElement('div');
      item.className = 'building-item';
      item.innerHTML = `
        <div class="building-pin">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <div class="building-info">
          <div class="building-name">${b.name}</div>
          <div class="building-type">${b.description || ''}</div>
        </div>
        <div class="building-arrow">›</div>
      `;
      item.addEventListener('click', () => {
        // Close the sheet and show the building panel
        if (typeof sheetToggle === 'function') sheetToggle();
        showBuildingInfo(b);
        // Also highlight the mesh in Three.js
        if (typeof selectBuilding === 'function') selectBuilding(b);
      });
      container.appendChild(item);
    });
  });

  console.log('[ui] Building sheet populated —', buildings.length, 'buildings');
}


// ── Called by main.js after campus.json loads & scene is built ─

function onSceneReady(data) {
  campusBuildings = data.buildings;
  populateBuildingSheet(campusBuildings);
}


// ── Helpers ──────────────────────────────────────────────────

function show(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function hide(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}