// =============================================================
//  js/ui.js  —  All UI logic for PRMSU SM Digital Twin PWA
//
//  Designed around the Figma blueprint:
//  - Bottom nav: hamburger (≡) | home (⌂) | back (<)
//  - Hamburger opens dropdown: Home, 3D Map, Legend, About
//  - 3D Map has a search bar to pick a building
//  - About has Vision / Mission / Quality Policy tabs
//
//  Defensive: all getElementById calls are null-checked so
//  this works even before Jonathan's final HTML is in place.
// =============================================================


// ── Page History (for the Back button) ───────────────────────
let pageHistory    = ['page-main'];   // stack of visited page IDs
let selectedBuilding = null;          // building currently shown in panel
let gpsEnabled       = false;
let campusBuildings  = [];            // filled by onSceneReady()
let hamOpen          = false;         // hamburger dropdown state


// ── Page Switching ───────────────────────────────────────────

function showPage(pageId, addToHistory = true) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Show target page
  const target = document.getElementById(pageId);
  if (target) {
    target.classList.add('active');
  } else {
    console.warn('[ui] showPage: element not found —', pageId);
    return;
  }

  // Track history for back button (avoid duplicate stacking)
  if (addToHistory && pageHistory[pageHistory.length - 1] !== pageId) {
    pageHistory.push(pageId);
  }

  // Close hamburger menu if open
  closeHamburger();

  // Three.js needs a resize signal when its canvas becomes visible
  if (pageId === 'page-3dmap' && typeof onMapPageShown === 'function') {
    onMapPageShown();
  }

  console.log('[ui] Page →', pageId, '| history:', pageHistory);
}

// Called by the ⌂ home button
function goHome() {
  pageHistory = ['page-main'];
  showPage('page-main', false);
}

// Called by the < back button
function goBack() {
  if (pageHistory.length > 1) {
    pageHistory.pop();                               // remove current
    const prev = pageHistory[pageHistory.length - 1];
    showPage(prev, false);
  } else {
    showPage('page-main', false);
  }
}


// ── Hamburger Menu ───────────────────────────────────────────

function toggleHamburger() {
  hamOpen = !hamOpen;
  const menu = document.getElementById('ham-dropdown');
  if (!menu) return;
  menu.classList.toggle('hidden', !hamOpen);
}

function closeHamburger() {
  hamOpen = false;
  const menu = document.getElementById('ham-dropdown');
  if (menu) menu.classList.add('hidden');
}

// Close hamburger when tapping anywhere outside it
document.addEventListener('click', function (e) {
  const btn  = document.getElementById('btn-hamburger');
  const menu = document.getElementById('ham-dropdown');
  if (!menu || !btn) return;
  if (!menu.contains(e.target) && !btn.contains(e.target)) {
    closeHamburger();
  }
});


// ── Building Search Bar (3D Map page) ────────────────────────

// Called by onSceneReady() — populates the search dropdown list
function populateBuildingSearch(buildings) {
  const list = document.getElementById('search-results');
  if (!list) return;

  list.innerHTML = '';
  buildings.forEach(b => {
    const item = document.createElement('div');
    item.className   = 'search-item';
    item.textContent = b.name;
    item.addEventListener('click', () => {
      closeBuildingSearch();
      showBuildingInfo(b);
    });
    list.appendChild(item);
  });
}

// Called when user types in the search bar
function onSearchInput(e) {
  const query   = e.target.value.trim().toLowerCase();
  const results = document.getElementById('search-results');
  if (!results) return;

  if (query === '') {
    results.classList.add('hidden');
    return;
  }

  // Filter buildings by name
  const items = results.querySelectorAll('.search-item');
  let anyVisible = false;
  items.forEach(item => {
    const match = item.textContent.toLowerCase().includes(query);
    item.classList.toggle('hidden', !match);
    if (match) anyVisible = true;
  });

  results.classList.toggle('hidden', !anyVisible);
}

// Called when search bar gains focus — show full list
function onSearchFocus() {
  const results = document.getElementById('search-results');
  if (results) results.classList.remove('hidden');
}

function closeBuildingSearch() {
  const bar     = document.getElementById('search-bar');
  const results = document.getElementById('search-results');
  if (bar)     bar.value = '';
  if (results) results.classList.add('hidden');
}


// ── Building Panel ───────────────────────────────────────────

// Called by main.js when a building box is tapped
function showBuildingInfo(bldg) {
  selectedBuilding = bldg;
  closeBuildingSearch();

  setText('building-name',        bldg.name);
  setText('building-description', bldg.description);

  const badge = document.getElementById('building-category-badge');
  if (badge) {
    badge.textContent = bldg.category;
    badge.className   = 'category-badge ' + bldg.category;
  }

  show('building-panel');
}

// Called by main.js when user taps empty space
function hideBuildingInfo() {
  selectedBuilding = null;
  hide('building-panel');
}

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
function showPathInfo(destinationName, stepCount) {
  setText('path-destination', destinationName);
  setText('path-steps', stepCount + ' stops');
  show('path-bar');
}

// Called by main.js when path is cleared
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


// ── About Page Tabs ──────────────────────────────────────────

function showAboutTab(tabId) {
  // Hide all tab panels
  document.querySelectorAll('.about-tab-panel').forEach(p => p.classList.remove('active'));
  // Deactivate all tab buttons
  document.querySelectorAll('.about-tab-btn').forEach(b => b.classList.remove('active'));

  // Show selected tab
  const panel = document.getElementById('tab-' + tabId);
  const btn   = document.getElementById('tabBtn-' + tabId);
  if (panel) panel.classList.add('active');
  if (btn)   btn.classList.add('active');
}


// ── Called by main.js after campus.json loads ─────────────────

function onSceneReady(data) {
  campusBuildings = data.buildings;
  populateBuildingSearch(campusBuildings);
  console.log('[ui] Scene ready —', data.buildings.length, 'buildings loaded into search.');
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