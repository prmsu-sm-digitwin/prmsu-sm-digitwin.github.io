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



let selectedBuilding = null;   // building object currently shown in panel
let gpsEnabled       = false;  // GPS on/off
let campusBuildings  = [];     // filled by onSceneReady() from main.js


// When the user navigates TO the map page, the canvas needs a resize
// signal because it was hidden (zero-size) while inactive
// script.js already wraps goTo once we chain onto it here.
(function () {
  var _goTo = window.goTo;
  window.goTo = function (pageId) {
    _goTo(pageId);
  
    var canvas = document.getElementById('three-canvas');
    if (canvas) canvas.style.display = pageId === 'map' ? 'block' : 'none';
    if (pageId === 'map') {
      // Give the DOM 1 frame to layout before firing resize
      setTimeout(function () {
        if (typeof onResize === 'function') onResize();
      }, 80);
    }
    if (pageId === 'devzones') {
      // Same idea: the page was hidden (zero-size) until now, so the "fit
      // whole map to screen" math needs a frame to see real dimensions.
      setTimeout(function () {
        if (typeof fitDevzonesMap === 'function') fitDevzonesMap();
      }, 80);
    }
  };
})();


function showBuildingInfo(bldg) {
  selectedBuilding = bldg;

  setText('building-name',        bldg.name        || '—');
  setText('building-description', bldg.description || '');

  const badge = document.getElementById('building-category-badge');
  if (badge) {
    badge.textContent = bldg.category || 'facility';
    badge.className   = 'category-badge ' + (bldg.category || 'facility');
  }

  // Buildings with no entryWaypoint (housing / other unconnected "model
  // only" buildings) have no route into the pathway graph, so the
  // Navigate Here button is hidden rather than offered and failing silently.
  if (bldg.entryWaypoint) {
    show('navigate-btn');
  } else {
    hide('navigate-btn');
  }

  show('building-panel');
}

// Called by main.js when user taps empty space  or by closePanel()
function hideBuildingInfo() {
  selectedBuilding = null;
  hide('building-panel');
}

// Called by the ✕ button on the panel
function closePanel() {
  hideBuildingInfo();
}


// Called by the "Navigate Here" button
function navigateToSelected() {
  if (!selectedBuilding) {
    console.warn('[ui] No building selected');
    return;
  }

  const targetId = selectedBuilding.id;
  hideBuildingInfo();

  if (typeof navigateTo === 'function') {
    navigateTo(targetId);
  } else {
    console.warn('[ui] navigateTo() not found — is main.js loaded?');
  }
}

// Called by main.js after A* draws the path
function showPathInfo(pathIds, targetBldg) {
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



function toggleGPS() {
  gpsEnabled = !gpsEnabled;
  const btn = document.getElementById('gps-btn');
  if (btn) btn.classList.toggle('gps-active', gpsEnabled);
  if (typeof setGPSEnabled === 'function') setGPSEnabled(gpsEnabled);
  console.log('[ui] GPS', gpsEnabled ? 'ON' : 'OFF');
}


// Map legend overlay — a large centered modal showing the full LegendMap.png,
// toggled by the legend button. Closed by default. The image inside can be
// panned/pinch-zoomed independently of the 3D map: gestures are captured on
// #legend-img-wrap (touch-action:none, its own pointer handlers below), which
// sits above the map canvas in a completely separate part of the DOM, so
// nothing here ever reaches the map's own pan/zoom listeners on #three-canvas.
let legendOpen = false;
function toggleLegend() {
  legendOpen = !legendOpen;
  const btn   = document.getElementById('legend-btn');
  const panel = document.getElementById('legend-panel');
  if (panel) panel.classList.toggle('hidden', !legendOpen);
  if (btn)   btn.classList.toggle('legend-active', legendOpen);
  if (legendOpen) resetLegendView();
}

// ── Legend image pan / pinch-zoom (isolated from the 3D map) ──
const legendView = { scale: 1, minScale: 1, maxScale: 4, tx: 0, ty: 0 };
const legendPointers = new Map();   // pointerId -> {x, y} in wrap-local coords
let legendPinch = null;             // {startDist, startScale, anchorX, anchorY}
let legendDragLast = null;          // {x, y} for single-pointer pan
let legendLastTap = null;           // {t, x, y} for double-tap-to-zoom

function resetLegendView() {
  legendView.scale = 1;
  legendView.tx = 0;
  legendView.ty = 0;
  applyLegendTransform(false);
}

function applyLegendTransform(animated) {
  const img = document.getElementById('legend-img');
  if (!img) return;
  img.classList.toggle('animated', !!animated);
  img.style.transform = `translate(${legendView.tx}px, ${legendView.ty}px) scale(${legendView.scale})`;
}

function legendClampToBounds() {
  const wrap = document.getElementById('legend-img-wrap');
  if (!wrap) return;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const scaledW = w * legendView.scale, scaledH = h * legendView.scale;
  const minTx = Math.min(0, w - scaledW), maxTx = 0;
  const minTy = Math.min(0, h - scaledH), maxTy = 0;
  legendView.tx = Math.min(maxTx, Math.max(minTx, legendView.tx));
  legendView.ty = Math.min(maxTy, Math.max(minTy, legendView.ty));
}

function legendLocalPoint(wrap, clientX, clientY) {
  const r = wrap.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

function legendZoomAt(wrap, localX, localY, newScale) {
  newScale = Math.min(legendView.maxScale, Math.max(legendView.minScale, newScale));
  // Keep the image point under (localX, localY) fixed while the scale changes.
  const imgX = (localX - legendView.tx) / legendView.scale;
  const imgY = (localY - legendView.ty) / legendView.scale;
  legendView.scale = newScale;
  legendView.tx = localX - imgX * newScale;
  legendView.ty = localY - imgY * newScale;
  legendClampToBounds();
}

function initLegendViewer() {
  const wrap = document.getElementById('legend-img-wrap');
  if (!wrap) return;

  wrap.addEventListener('pointerdown', e => {
    wrap.setPointerCapture(e.pointerId);
    const p = legendLocalPoint(wrap, e.clientX, e.clientY);
    legendPointers.set(e.pointerId, p);
    wrap.classList.add('dragging');

    if (legendPointers.size === 1) {
      legendDragLast = p;
      legendPinch = null;
    } else if (legendPointers.size === 2) {
      legendDragLast = null;
      const pts = [...legendPointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      legendPinch = {
        startDist: dist || 1,
        startScale: legendView.scale,
        anchorX: (mid.x - legendView.tx) / legendView.scale,
        anchorY: (mid.y - legendView.ty) / legendView.scale,
      };
    }
    e.preventDefault();
  });

  wrap.addEventListener('pointermove', e => {
    if (!legendPointers.has(e.pointerId)) return;
    const p = legendLocalPoint(wrap, e.clientX, e.clientY);
    legendPointers.set(e.pointerId, p);

    if (legendPointers.size === 1 && legendDragLast) {
      legendView.tx += p.x - legendDragLast.x;
      legendView.ty += p.y - legendDragLast.y;
      legendDragLast = p;
      legendClampToBounds();
      applyLegendTransform(false);
    } else if (legendPointers.size === 2 && legendPinch) {
      const pts = [...legendPointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const newScale = legendPinch.startScale * (dist / legendPinch.startDist);
      legendView.scale = Math.min(legendView.maxScale, Math.max(legendView.minScale, newScale));
      legendView.tx = mid.x - legendPinch.anchorX * legendView.scale;
      legendView.ty = mid.y - legendPinch.anchorY * legendView.scale;
      legendClampToBounds();
      applyLegendTransform(false);
    }
    e.preventDefault();
  });

  function endPointer(e) {
    legendPointers.delete(e.pointerId);
    if (wrap.hasPointerCapture && wrap.hasPointerCapture(e.pointerId)) {
      wrap.releasePointerCapture(e.pointerId);
    }
    if (legendPointers.size === 0) wrap.classList.remove('dragging');

    if (legendPointers.size === 1) {
      // Dropped from a pinch to a single finger — re-baseline so it doesn't jump.
      const [remaining] = [...legendPointers.values()];
      legendDragLast = remaining;
      legendPinch = null;
    } else if (legendPointers.size === 0) {
      legendDragLast = null;
      legendPinch = null;
    }
  }
  wrap.addEventListener('pointerup', endPointer);
  wrap.addEventListener('pointercancel', endPointer);

  // Desktop convenience: wheel to zoom, anchored at the cursor.
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const p = legendLocalPoint(wrap, e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    legendZoomAt(wrap, p.x, p.y, legendView.scale * factor);
    applyLegendTransform(false);
  }, { passive: false });

  // Double-click / double-tap to toggle between fit and ~2.4x zoom.
  wrap.addEventListener('pointerup', e => {
    const now = Date.now();
    const p = legendLocalPoint(wrap, e.clientX, e.clientY);
    const isDoubleTap = legendLastTap
      && (now - legendLastTap.t) < 320
      && Math.hypot(p.x - legendLastTap.x, p.y - legendLastTap.y) < 24;
    legendLastTap = { t: now, x: p.x, y: p.y };
    if (!isDoubleTap) return;
    legendLastTap = null;
    if (legendView.scale > legendView.minScale + 0.01) {
      resetLegendView();
      applyLegendTransform(true);
    } else {
      legendZoomAt(wrap, p.x, p.y, 2.4);
      applyLegendTransform(true);
    }
  });
}
initLegendViewer();


// ── Development Zones — full-bleed pannable/pinch-zoomable satellite map ──
// Same gesture handling as the legend viewer above (pointer-based pan, pinch
// to zoom, wheel to zoom, double-tap to toggle zoom), but this map fills the
// whole page instead of a fixed modal box, so instead of always resetting to
// scale=1 at the top-left, the "resting" state is "zoomed/cropped to fill the
// screen, centered" (baseScale below, see fitDevzonesMap) — the equivalent of
// object-fit:cover, except driven by JS so it can be panned/zoomed from
// there. Markers get layered on top of this in a later pass; #devzones-markers
// already exists in the DOM (see index.html) so that pass doesn't need to
// touch this file's structure.
const devzonesView = { scale: 1, baseScale: 1, minScale: 1, maxScale: 6, tx: 0, ty: 0, imgW: 0, imgH: 0 };
const devzonesPointers = new Map();
let devzonesPinch = null;
let devzonesDragLast = null;
let devzonesLastTap = null;

// Recomputes the starting view and resets to it. Called once the image has
// its real pixel size (onload) and again whenever the page becomes
// visible/resizes, since the wrap has zero size while its page is hidden and
// the fit math needs real dimensions.
//
// This is "cover", not "contain": the satellite photo is landscape (wide)
// but phones are portrait, so showing the *whole* image would leave black
// bars above and below it. Google Maps never opens showing blank margins —
// it opens already zoomed in, filling the screen edge to edge. Math.max
// (instead of Math.min) picks the larger of the two ratios, so the map
// scales up until it fills the taller dimension completely, cropping
// whatever's left over on the sides — same as CSS object-fit:cover.
function fitDevzonesMap() {
  const wrap = document.getElementById('devzones-map-wrap');
  const img = document.getElementById('devzones-map-img');
  if (!wrap || !img || !img.naturalWidth) return;

  devzonesView.imgW = img.naturalWidth;
  devzonesView.imgH = img.naturalHeight;

  const wrapW = wrap.clientWidth, wrapH = wrap.clientHeight;
  if (!wrapW || !wrapH) return; // still hidden — try again once it's shown

  const fit = Math.max(wrapW / devzonesView.imgW, wrapH / devzonesView.imgH);
  devzonesView.baseScale = fit;
  devzonesView.minScale = fit;
  devzonesView.maxScale = fit * 6;
  devzonesView.scale = fit;
  devzonesView.tx = (wrapW - devzonesView.imgW * fit) / 2;
  devzonesView.ty = (wrapH - devzonesView.imgH * fit) / 2;
  applyDevzonesTransform(false);
}

function applyDevzonesTransform(animated) {
  const img = document.getElementById('devzones-map-img');
  const markers = document.getElementById('devzones-markers');
  if (!img) return;
  img.classList.toggle('animated', !!animated);
  img.style.width = devzonesView.imgW + 'px';
  img.style.height = devzonesView.imgH + 'px';
  const t = 'translate(' + devzonesView.tx + 'px, ' + devzonesView.ty + 'px) scale(' + devzonesView.scale + ')';
  img.style.transform = t;
  // Markers live in image-pixel coordinates too, so they ride along with
  // exactly the same transform and stay pinned to the spot on the map they
  // mark, at any pan/zoom level.
  if (markers) {
    markers.style.transform = t;
    // ...but the pins themselves should look the same size no matter how
    // zoomed-in the map is, not grow with it. Each pin gets its own inverse
    // scale to cancel out the container's — same trick map apps use for
    // markers on a zoomable tile layer.
    const invScale = 1 / devzonesView.scale;
    Array.prototype.forEach.call(markers.children, function (pin) {
      pin.style.transform = 'translate(-50%, -100%) scale(' + invScale + ')';
    });
  }
}

// Keeps the map from being panned past its own edges — but only on axes
// where it's actually bigger than the viewport at the current zoom. On an
// axis where the (possibly letterboxed) image is smaller than the wrap, it
// stays centered instead of pinned to an edge — same idea as object-fit,
// just applied per-axis so a non-matching aspect ratio still looks right.
function devzonesClampToBounds() {
  const wrap = document.getElementById('devzones-map-wrap');
  if (!wrap) return;
  const wrapW = wrap.clientWidth, wrapH = wrap.clientHeight;
  const scaledW = devzonesView.imgW * devzonesView.scale;
  const scaledH = devzonesView.imgH * devzonesView.scale;

  if (scaledW <= wrapW) {
    devzonesView.tx = (wrapW - scaledW) / 2;
  } else {
    const minTx = wrapW - scaledW, maxTx = 0;
    devzonesView.tx = Math.min(maxTx, Math.max(minTx, devzonesView.tx));
  }
  if (scaledH <= wrapH) {
    devzonesView.ty = (wrapH - scaledH) / 2;
  } else {
    const minTy = wrapH - scaledH, maxTy = 0;
    devzonesView.ty = Math.min(maxTy, Math.max(minTy, devzonesView.ty));
  }
}

function devzonesLocalPoint(wrap, clientX, clientY) {
  const r = wrap.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

function devzonesZoomAt(wrap, localX, localY, newScale) {
  newScale = Math.min(devzonesView.maxScale, Math.max(devzonesView.minScale, newScale));
  // Keep the map point under (localX, localY) fixed while the scale changes.
  const imgX = (localX - devzonesView.tx) / devzonesView.scale;
  const imgY = (localY - devzonesView.ty) / devzonesView.scale;
  devzonesView.scale = newScale;
  devzonesView.tx = localX - imgX * newScale;
  devzonesView.ty = localY - imgY * newScale;
  devzonesClampToBounds();
}

// Each zone's x/y is a pixel position in the *original* DEV_ZONES_SATMAP.jpg
// (1327×703) — the same pixel space #devzones-markers is transformed in, so
// a marker just needs its left/top set once and it rides along with every
// pan/zoom for free (see the transform block in applyDevzonesTransform).
const DEVZONES_DATA = [
  { id: 'mango_greenhouse', label: 'Mango Greenhouse Farm', photo: 'images/Mango_Greenhouse_FarmDZ.jpg', x: 711.5, y: 272.2 },
  { id: 'stadium',          label: 'Stadium',                photo: 'images/StadiumDZ.jpg',                x: 1042.5, y: 248.1 },
  { id: 'bangar',           label: 'Bangar',                  photo: 'images/BangarDZ.jpg',                 x: 702.5, y: 423.1 }
];

// Builds the marker pins once (guarded by _built, same pattern as the
// directory carousel) — DEVZONES_DATA never changes at runtime so there's
// nothing to re-render later.
function buildDevzonesMarkers() {
  const host = document.getElementById('devzones-markers');
  if (!host || host._built) return;
  host._built = true;

  DEVZONES_DATA.forEach(function (zone) {
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'devzones-marker';
    pin.style.left = zone.x + 'px';
    pin.style.top = zone.y + 'px';
    pin.setAttribute('aria-label', zone.label);
    pin.title = zone.label;
    pin.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor">' +
      '<path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/>' +
      '</svg>';
    pin.addEventListener('click', function (e) {
      e.stopPropagation();
      openDevzonePOV(zone);
    });
    host.appendChild(pin);
  });
}

// ── Full-screen POV photo — pannable/zoomable, with a cheap "looking
// around" 3D tilt ──
// Just the zone's photo for now; the plan is to swap the <img> for an
// actual 3D model preview once those exist, without needing to touch this
// open/close/pan/zoom logic. The photo starts "cover"-fit (fills the
// screen, same idea as the satellite map) and can be dragged/pinched from
// there — same gesture engine as devzonesView above, duplicated with a
// "pov" prefix instead of shared, since the two run on different elements
// and don't need to interact.
//
// The 3D-ish part: .devzones-pov-tilt (a separate layer wrapping the image,
// see index.html/style.css) gets a small rotateX/rotateY based on how far
// off-center the pan currently is — panned to the left edge of the photo
// tilts one way, the right edge the other, snapping back to flat when
// centered. It's not a real look-around (that needs an actual panorama or
// 3D model), just a flat photo with a perspective lean, but it reads as
// "leaning into the scene" rather than a static crop.
const povView = { scale: 1, baseScale: 1, minScale: 1, maxScale: 6, tx: 0, ty: 0, imgW: 0, imgH: 0, tiltX: 0, tiltY: 0 };
const povPointers = new Map();
let povPinch = null;
let povDragLast = null;
let povLastTap = null;
let povViewerInited = false;

function fitPovImage() {
  const stage = document.getElementById('devzones-pov-stage');
  const img = document.getElementById('devzones-pov-img');
  if (!stage || !img || !img.naturalWidth) return;

  povView.imgW = img.naturalWidth;
  povView.imgH = img.naturalHeight;

  const stageW = stage.clientWidth, stageH = stage.clientHeight;
  if (!stageW || !stageH) return;

  const fit = Math.max(stageW / povView.imgW, stageH / povView.imgH);
  povView.baseScale = fit;
  povView.minScale = fit;
  povView.maxScale = fit * 4;
  povView.scale = fit;
  povView.tx = (stageW - povView.imgW * fit) / 2;
  povView.ty = (stageH - povView.imgH * fit) / 2;
  povClampToBounds();
  applyPovTransform(false);
}

function applyPovTransform(animated) {
  const img = document.getElementById('devzones-pov-img');
  const tilt = document.getElementById('devzones-pov-tilt');
  if (!img) return;
  img.classList.toggle('animated', !!animated);
  img.style.width = povView.imgW + 'px';
  img.style.height = povView.imgH + 'px';
  img.style.transform = 'translate(' + povView.tx + 'px, ' + povView.ty + 'px) scale(' + povView.scale + ')';

  if (tilt) {
    var maxTiltDeg = 14; // noticeable lean, still short of a fairground ride
    var rotY = -povView.tiltX * maxTiltDeg;
    var rotX = povView.tiltY * maxTiltDeg;
    tilt.style.transform = 'rotateY(' + rotY.toFixed(2) + 'deg) rotateX(' + rotX.toFixed(2) + 'deg)';
  }
}

// Same per-axis "clamp to edges, or center if it doesn't need panning" idea
// as devzonesClampToBounds — plus, while it's at it, works out tiltX/tiltY
// (-1..1, 0 = centered) from exactly the same bounds, since that's already
// the "how far can this axis pan, and where are we in that range" math.
function povClampToBounds() {
  const stage = document.getElementById('devzones-pov-stage');
  if (!stage) return;
  const stageW = stage.clientWidth, stageH = stage.clientHeight;
  const scaledW = povView.imgW * povView.scale;
  const scaledH = povView.imgH * povView.scale;

  var minTx, maxTx, minTy, maxTy;
  if (scaledW <= stageW) {
    minTx = maxTx = (stageW - scaledW) / 2;
    povView.tx = minTx;
  } else {
    minTx = stageW - scaledW; maxTx = 0;
    povView.tx = Math.min(maxTx, Math.max(minTx, povView.tx));
  }
  if (scaledH <= stageH) {
    minTy = maxTy = (stageH - scaledH) / 2;
    povView.ty = minTy;
  } else {
    minTy = stageH - scaledH; maxTy = 0;
    povView.ty = Math.min(maxTy, Math.max(minTy, povView.ty));
  }

  povView.tiltX = maxTx > minTx ? ((povView.tx - minTx) / (maxTx - minTx)) * 2 - 1 : 0;
  povView.tiltY = maxTy > minTy ? ((povView.ty - minTy) / (maxTy - minTy)) * 2 - 1 : 0;
}

function povLocalPoint(stage, clientX, clientY) {
  const r = stage.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

function povZoomAt(stage, localX, localY, newScale) {
  newScale = Math.min(povView.maxScale, Math.max(povView.minScale, newScale));
  const imgX = (localX - povView.tx) / povView.scale;
  const imgY = (localY - povView.ty) / povView.scale;
  povView.scale = newScale;
  povView.tx = localX - imgX * newScale;
  povView.ty = localY - imgY * newScale;
  povClampToBounds();
}

// Bound once — the stage element itself never changes, only which photo is
// loaded into it, so there's nothing to re-bind on each openDevzonePOV call.
function initPovViewer() {
  if (povViewerInited) return;
  povViewerInited = true;
  const stage = document.getElementById('devzones-pov-stage');
  if (!stage) return;

  window.addEventListener('resize', function () {
    const pov = document.getElementById('devzones-pov');
    if (pov && pov.classList.contains('is-open')) fitPovImage();
  });

  stage.addEventListener('pointerdown', e => {
    stage.setPointerCapture(e.pointerId);
    const p = povLocalPoint(stage, e.clientX, e.clientY);
    povPointers.set(e.pointerId, p);
    stage.classList.add('dragging');

    if (povPointers.size === 1) {
      povDragLast = p;
      povPinch = null;
    } else if (povPointers.size === 2) {
      povDragLast = null;
      const pts = [...povPointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      povPinch = {
        startDist: dist || 1,
        startScale: povView.scale,
        anchorX: (mid.x - povView.tx) / povView.scale,
        anchorY: (mid.y - povView.ty) / povView.scale,
      };
    }
    e.preventDefault();
  });

  stage.addEventListener('pointermove', e => {
    if (!povPointers.has(e.pointerId)) return;
    const p = povLocalPoint(stage, e.clientX, e.clientY);
    povPointers.set(e.pointerId, p);

    if (povPointers.size === 1 && povDragLast) {
      povView.tx += p.x - povDragLast.x;
      povView.ty += p.y - povDragLast.y;
      povDragLast = p;
      povClampToBounds();
      applyPovTransform(false);
    } else if (povPointers.size === 2 && povPinch) {
      const pts = [...povPointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const newScale = povPinch.startScale * (dist / povPinch.startDist);
      povView.scale = Math.min(povView.maxScale, Math.max(povView.minScale, newScale));
      povView.tx = mid.x - povPinch.anchorX * povView.scale;
      povView.ty = mid.y - povPinch.anchorY * povView.scale;
      povClampToBounds();
      applyPovTransform(false);
    }
    e.preventDefault();
  });

  function endPointer(e) {
    povPointers.delete(e.pointerId);
    if (stage.hasPointerCapture && stage.hasPointerCapture(e.pointerId)) {
      stage.releasePointerCapture(e.pointerId);
    }
    if (povPointers.size === 0) stage.classList.remove('dragging');

    if (povPointers.size === 1) {
      const [remaining] = [...povPointers.values()];
      povDragLast = remaining;
      povPinch = null;
    } else if (povPointers.size === 0) {
      povDragLast = null;
      povPinch = null;
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const p = povLocalPoint(stage, e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    povZoomAt(stage, p.x, p.y, povView.scale * factor);
    applyPovTransform(false);
  }, { passive: false });

  // Double-click / double-tap to toggle between fit and ~2.4x the fit scale.
  stage.addEventListener('pointerup', e => {
    const now = Date.now();
    const p = povLocalPoint(stage, e.clientX, e.clientY);
    const isDoubleTap = povLastTap
      && (now - povLastTap.t) < 320
      && Math.hypot(p.x - povLastTap.x, p.y - povLastTap.y) < 24;
    povLastTap = { t: now, x: p.x, y: p.y };
    if (!isDoubleTap) return;
    povLastTap = null;
    if (povView.scale > povView.baseScale + 0.01) {
      povView.scale = povView.baseScale;
      povView.tx = (stage.clientWidth - povView.imgW * povView.scale) / 2;
      povView.ty = (stage.clientHeight - povView.imgH * povView.scale) / 2;
      povClampToBounds();
      applyPovTransform(true);
    } else {
      povZoomAt(stage, p.x, p.y, povView.baseScale * 2.4);
      applyPovTransform(true);
    }
  });
}

function openDevzonePOV(zone) {
  const pov = document.getElementById('devzones-pov');
  const img = document.getElementById('devzones-pov-img');
  const label = document.getElementById('devzones-pov-label');
  if (!pov || !img || !label) return;

  initPovViewer();

  // Fresh gesture state for the new photo — stray pointers from whatever
  // was happening on the satellite map shouldn't leak in here.
  povPointers.clear();
  povPinch = null;
  povDragLast = null;
  povLastTap = null;

  label.textContent = zone.label;
  pov.classList.add('is-open');

  // Setting .src resets img.complete immediately, so this "already loaded"
  // check right after is safe — it only fires true for a cached repeat view
  // of the same photo. Otherwise the load listener picks it up once it's in.
  img.classList.remove('animated');
  img.onload = function () { fitPovImage(); };
  img.src = zone.photo;
  if (img.complete && img.naturalWidth) fitPovImage();
}

function closeDevzonePOV() {
  const pov = document.getElementById('devzones-pov');
  if (pov) pov.classList.remove('is-open');
}

function initDevzonesViewer() {
  const wrap = document.getElementById('devzones-map-wrap');
  const img = document.getElementById('devzones-map-img');
  if (!wrap || !img) return;

  buildDevzonesMarkers();

  if (img.complete && img.naturalWidth) {
    fitDevzonesMap();
  } else {
    img.addEventListener('load', function () { fitDevzonesMap(); });
  }
  window.addEventListener('resize', function () {
    // Only refit while the page is actually visible — refitting a hidden
    // (zero-size) page would just zero out the view.
    var page = document.getElementById('page-devzones');
    if (page && page.classList.contains('active')) fitDevzonesMap();
  });

  wrap.addEventListener('pointerdown', e => {
    // A tap on a marker pin should open its POV photo, not start a pan —
    // if we captured the pointer here regardless of target, the marker's
    // own click event would never fire (the wrap would swallow the
    // matching pointerup). Bail out before touching gesture state so the
    // button gets a normal, uninterrupted click.
    if (e.target.closest && e.target.closest('.devzones-marker')) return;

    wrap.setPointerCapture(e.pointerId);
    const p = devzonesLocalPoint(wrap, e.clientX, e.clientY);
    devzonesPointers.set(e.pointerId, p);
    wrap.classList.add('dragging');

    if (devzonesPointers.size === 1) {
      devzonesDragLast = p;
      devzonesPinch = null;
    } else if (devzonesPointers.size === 2) {
      devzonesDragLast = null;
      const pts = [...devzonesPointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      devzonesPinch = {
        startDist: dist || 1,
        startScale: devzonesView.scale,
        anchorX: (mid.x - devzonesView.tx) / devzonesView.scale,
        anchorY: (mid.y - devzonesView.ty) / devzonesView.scale,
      };
    }
    e.preventDefault();
  });

  wrap.addEventListener('pointermove', e => {
    if (!devzonesPointers.has(e.pointerId)) return;
    const p = devzonesLocalPoint(wrap, e.clientX, e.clientY);
    devzonesPointers.set(e.pointerId, p);

    if (devzonesPointers.size === 1 && devzonesDragLast) {
      devzonesView.tx += p.x - devzonesDragLast.x;
      devzonesView.ty += p.y - devzonesDragLast.y;
      devzonesDragLast = p;
      devzonesClampToBounds();
      applyDevzonesTransform(false);
    } else if (devzonesPointers.size === 2 && devzonesPinch) {
      const pts = [...devzonesPointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const newScale = devzonesPinch.startScale * (dist / devzonesPinch.startDist);
      devzonesView.scale = Math.min(devzonesView.maxScale, Math.max(devzonesView.minScale, newScale));
      devzonesView.tx = mid.x - devzonesPinch.anchorX * devzonesView.scale;
      devzonesView.ty = mid.y - devzonesPinch.anchorY * devzonesView.scale;
      devzonesClampToBounds();
      applyDevzonesTransform(false);
    }
    e.preventDefault();
  });

  function endPointer(e) {
    devzonesPointers.delete(e.pointerId);
    if (wrap.hasPointerCapture && wrap.hasPointerCapture(e.pointerId)) {
      wrap.releasePointerCapture(e.pointerId);
    }
    if (devzonesPointers.size === 0) wrap.classList.remove('dragging');

    if (devzonesPointers.size === 1) {
      const [remaining] = [...devzonesPointers.values()];
      devzonesDragLast = remaining;
      devzonesPinch = null;
    } else if (devzonesPointers.size === 0) {
      devzonesDragLast = null;
      devzonesPinch = null;
    }
  }
  wrap.addEventListener('pointerup', endPointer);
  wrap.addEventListener('pointercancel', endPointer);

  // Desktop convenience: wheel to zoom, anchored at the cursor.
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const p = devzonesLocalPoint(wrap, e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    devzonesZoomAt(wrap, p.x, p.y, devzonesView.scale * factor);
    applyDevzonesTransform(false);
  }, { passive: false });

  // Double-click / double-tap to toggle between fit and ~2.4x the fit scale.
  wrap.addEventListener('pointerup', e => {
    const now = Date.now();
    const p = devzonesLocalPoint(wrap, e.clientX, e.clientY);
    const isDoubleTap = devzonesLastTap
      && (now - devzonesLastTap.t) < 320
      && Math.hypot(p.x - devzonesLastTap.x, p.y - devzonesLastTap.y) < 24;
    devzonesLastTap = { t: now, x: p.x, y: p.y };
    if (!isDoubleTap) return;
    devzonesLastTap = null;
    if (devzonesView.scale > devzonesView.baseScale + 0.01) {
      devzonesView.scale = devzonesView.baseScale;
      devzonesView.tx = (wrap.clientWidth - devzonesView.imgW * devzonesView.scale) / 2;
      devzonesView.ty = (wrap.clientHeight - devzonesView.imgH * devzonesView.scale) / 2;
      devzonesClampToBounds();
      applyDevzonesTransform(true);
    } else {
      devzonesZoomAt(wrap, p.x, p.y, devzonesView.baseScale * 2.4);
      applyDevzonesTransform(true);
    }
  });
}
initDevzonesViewer();


// Live-filters the building sheet as the user types in the search bar.
// Reuses the same renderer populateBuildingSheet() already uses for the
// full list — an empty query just re-shows everything.
function filterBuildingSheet(query) {
  if (!campusData || !campusData.buildings) return;
  const q = query.trim().toLowerCase();
  const searchable = campusData.buildings.filter(b => b.category !== 'housing');
  const filtered = !q
    ? searchable
    : searchable.filter(b => (b.name || '').toLowerCase().includes(q));
  populateBuildingSheet(filtered);
}

// Called by onSceneReady() with the full campus data object
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
  
    const header = document.createElement('div');
    header.className = 'building-cat';
    header.textContent = catLabels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
    container.appendChild(header);


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
        //  highlight the mesh in Three.js
        if (typeof selectBuilding === 'function') selectBuilding(b);
      });
      container.appendChild(item);
    });
  });

  console.log('[ui] Building sheet populated —', buildings.length, 'buildings');
}


// Called by main.js after campus.json loads at scene is built 

function onSceneReady(data) {
  // Housing buildings are intentionally excluded from the search / building
  // sheet list — they are unconnected private-property markers, tappable in
  // the 3D view only (see showBuildingInfo via raycast pick in main.js).
  campusBuildings = data.buildings.filter(b => b.category !== 'housing');
  populateBuildingSheet(campusBuildings);

  // Auto-start GPS so the blue dot appears immediately without pressing the button
  gpsEnabled = true;
  const btn = document.getElementById('gps-btn');
  if (btn) btn.classList.add('gps-active');
  if (typeof setGPSEnabled === 'function') setGPSEnabled(true);
  console.log('[ui] GPS auto-started on scene ready');
}


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