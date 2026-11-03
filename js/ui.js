


let selectedBuilding = null;
let gpsEnabled       = false;
let campusBuildings  = [];


(function () {
  window.onPageEntered = function (pageId) {
    var canvas = document.getElementById('three-canvas');
    if (canvas) canvas.style.display = pageId === 'map' ? 'block' : 'none';
    if (pageId === 'map') {
      setTimeout(function () {
        if (typeof onResize === 'function') onResize();
      }, 80);
    }
    if (pageId === 'devzones') {
      setTimeout(function () {
        if (typeof fitDevzonesMap === 'function') fitDevzonesMap();
      }, 80);
    }
  };

  var _goTo = window.goTo;
  window.goTo = function (pageId, fromPopState) {
    _goTo(pageId, fromPopState);
    window.onPageEntered(pageId);
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

  if (bldg.entryWaypoint) {
    show('navigate-btn');
  } else {
    hide('navigate-btn');
  }

  show('building-panel');
}

function hideBuildingInfo() {
  selectedBuilding = null;
  hide('building-panel');
}

function closePanel() {
  hideBuildingInfo();
}


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

function showPathInfo(pathIds, targetBldg) {
  setText('path-destination', (targetBldg && targetBldg.name) ? targetBldg.name : 'Destination');
  setText('path-steps', '');
  show('path-bar');
}

function hidePathInfo() {
  setText('path-destination', '—');
  setText('path-steps', '');
  hide('path-bar');
}

function clearNavigation() {
  if (typeof youHereOn !== 'undefined') youHereOn = true;
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


let legendOpen = false;
function toggleLegend() {
  legendOpen = !legendOpen;
  const btn   = document.getElementById('legend-btn');
  const panel = document.getElementById('legend-panel');
  if (panel) panel.classList.toggle('hidden', !legendOpen);
  if (btn)   btn.classList.toggle('legend-active', legendOpen);
  if (legendOpen) resetLegendView();
}

const legendView = { scale: 1, minScale: 1, maxScale: 4, tx: 0, ty: 0 };
const legendPointers = new Map();
let legendPinch = null;
let legendDragLast = null;
let legendLastTap = null;

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

  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const p = legendLocalPoint(wrap, e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    legendZoomAt(wrap, p.x, p.y, legendView.scale * factor);
    applyLegendTransform(false);
  }, { passive: false });

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


const devzonesView = { scale: 1, baseScale: 1, minScale: 1, maxScale: 6, tx: 0, ty: 0, imgW: 0, imgH: 0 };
const devzonesPointers = new Map();
let devzonesPinch = null;
let devzonesDragLast = null;
let devzonesLastTap = null;

function fitDevzonesMap() {
  const wrap = document.getElementById('devzones-map-wrap');
  const img = document.getElementById('devzones-map-img');
  if (!wrap || !img || !img.naturalWidth) return;

  devzonesView.imgW = img.naturalWidth;
  devzonesView.imgH = img.naturalHeight;

  const wrapW = wrap.clientWidth, wrapH = wrap.clientHeight;
  if (!wrapW || !wrapH) return;

  const fit = Math.max(wrapW / devzonesView.imgW, wrapH / devzonesView.imgH);
  devzonesView.baseScale = fit;
  devzonesView.minScale = Math.min(wrapW / devzonesView.imgW, wrapH / devzonesView.imgH);
  devzonesView.maxScale = fit * 6;
  wrap.style.setProperty('--dz-bg', 'url("' + img.getAttribute('src') + '")');
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
  if (markers) {
    markers.style.transform = t;
    const invScale = 1 / devzonesView.scale;
    Array.prototype.forEach.call(markers.children, function (pin) {
      pin.style.transform = 'translate(-50%, -100%) scale(' + invScale + ')';
    });
    layoutDevzonesLabels();
  }
}

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
  const imgX = (localX - devzonesView.tx) / devzonesView.scale;
  const imgY = (localY - devzonesView.ty) / devzonesView.scale;
  devzonesView.scale = newScale;
  devzonesView.tx = localX - imgX * newScale;
  devzonesView.ty = localY - imgY * newScale;
  devzonesClampToBounds();
}

let DEVZONES_DATA = [
  { id: 'mango_greenhouse', label: 'Mango Greenhouse Farm', photo: 'images/devzones/mangogreenhouse_dz.jpg', x: 711.5, y: 272.2 },
  { id: 'stadium',          label: 'Stadium',                photo: 'images/devzones/oval_dz.jpg',              x: 1042.5, y: 248.1 },
  { id: 'bangar',           label: 'Bangar',                  photo: 'images/devzones/bangar_dz.jpg',            x: 702.5, y: 423.1 }
];
let devzonesLoaded = false;

function loadDevzonesData() {
  if (devzonesLoaded) return Promise.resolve();
  return fetch('data/devzones.json')
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (d) {
      if (d && Array.isArray(d.zones) && d.zones.length) DEVZONES_DATA = d.zones;
      const img = document.getElementById('devzones-map-img');
      if (img && d && d.map && d.map.image && img.getAttribute('src') !== d.map.image) img.src = d.map.image;
      devzonesLoaded = true;
    })
    .catch(function (e) { console.warn('devzones.json not loaded, using built-in list:', e); devzonesLoaded = true; });
}

function buildDevzonesMarkers() {
  const host = document.getElementById('devzones-markers');
  if (!host || host._built) return;
  host._built = true;
  host.innerHTML = '';

  DEVZONES_DATA.forEach(function (zone) {
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'devzones-marker';
    pin.style.left = zone.x + 'px';
    pin.style.top = zone.y + 'px';
    pin.setAttribute('aria-label', zone.label);
    pin.title = zone.label;
    pin.innerHTML =
      '<span class="devzones-marker-label"></span>' +
      '<svg viewBox="0 0 24 24" fill="currentColor">' +
      '<path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/>' +
      '</svg>';
    pin.firstChild.textContent = zone.label;
    pin.addEventListener('click', function (e) {
      e.stopPropagation();
      openDevzonePOV(zone);
    });
    host.appendChild(pin);
  });
  devzonesLabelScale = -1;
  applyDevzonesTransform(false);
}

let devzonesLabelScale = -1;
function layoutDevzonesLabels() {
  const host = document.getElementById('devzones-markers');
  if (!host || devzonesLabelScale === devzonesView.scale) return;
  devzonesLabelScale = devzonesView.scale;
  const labels = host.querySelectorAll('.devzones-marker-label');
  labels.forEach(function (l) { l.classList.remove('is-hidden'); });
  const taken = [];
  labels.forEach(function (l) {
    const r = l.getBoundingClientRect();
    if (!r.width) return;
    const hit = taken.some(function (t) {
      return !(r.right + 3 < t.left || r.left - 3 > t.right || r.bottom + 2 < t.top || r.top - 2 > t.bottom);
    });
    if (hit) l.classList.add('is-hidden'); else taken.push(r);
  });
}

const povView = { scale: 1, baseScale: 1, minScale: 1, maxScale: 6, tx: 0, ty: 0, imgW: 0, imgH: 0, tiltX: 0, tiltY: 0 };
const povPointers = new Map();
let povPinch = null;
let povDragLast = null;
let povLastTap = null;
let povViewerInited = false;

const POV_PERSPECTIVE_PX = 850;

function povTiltCoverScale(deg, half) {
  var theta = Math.abs(deg) * Math.PI / 180;
  if (theta < 0.0001 || half <= 0) return 1;
  var denom = Math.cos(theta) * POV_PERSPECTIVE_PX - half * Math.sin(theta);
  if (denom <= 0) return 3;
  var s = POV_PERSPECTIVE_PX / denom;
  return Math.min(s * 1.08, 3);
}

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
  const stage = document.getElementById('devzones-pov-stage');
  if (!img) return;
  img.classList.toggle('animated', !!animated);
  img.style.width = povView.imgW + 'px';
  img.style.height = povView.imgH + 'px';
  img.style.transform = 'translate(' + povView.tx + 'px, ' + povView.ty + 'px) scale(' + povView.scale + ')';

  if (tilt) {
    var maxTiltDeg = 14;
    var rotY = -povView.tiltX * maxTiltDeg;
    var rotX = povView.tiltY * maxTiltDeg;

    var stageW = stage ? stage.clientWidth : 0;
    var stageH = stage ? stage.clientHeight : 0;
    var coverScale = Math.max(
      povTiltCoverScale(rotY, stageW / 2),
      povTiltCoverScale(rotX, stageH / 2),
      1
    );

    tilt.style.transform =
      'rotateY(' + rotY.toFixed(2) + 'deg) rotateX(' + rotX.toFixed(2) + 'deg) scale(' + coverScale.toFixed(4) + ')';
  }
}

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

  povPointers.clear();
  povPinch = null;
  povDragLast = null;
  povLastTap = null;

  label.textContent = zone.label;
  pov.classList.add('is-open');

  const tilt = document.getElementById('devzones-pov-tilt');
  img.classList.remove('animated');
  img.style.opacity = '0';
  if (tilt) tilt.style.transition = 'none';
  const reveal = function () {
    fitPovImage();
    if (tilt) { void tilt.offsetWidth; tilt.style.transition = ''; }
    requestAnimationFrame(function () { img.style.opacity = '1'; });
  };
  img.onload = reveal;
  img.src = zone.photo;
  if (img.complete && img.naturalWidth) reveal();
}

function closeDevzonePOV() {
  const pov = document.getElementById('devzones-pov');
  if (pov) pov.classList.remove('is-open');
}

function initDevzonesViewer() {
  const wrap = document.getElementById('devzones-map-wrap');
  const img = document.getElementById('devzones-map-img');
  if (!wrap || !img) return;

  loadDevzonesData().then(buildDevzonesMarkers);

  if (img.complete && img.naturalWidth) {
    fitDevzonesMap();
  } else {
    img.addEventListener('load', function () { fitDevzonesMap(); });
  }
  window.addEventListener('resize', function () {
    var page = document.getElementById('page-devzones');
    if (page && page.classList.contains('active')) fitDevzonesMap();
  });

  wrap.addEventListener('pointerdown', e => {
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

  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const p = devzonesLocalPoint(wrap, e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    devzonesZoomAt(wrap, p.x, p.y, devzonesView.scale * factor);
    applyDevzonesTransform(false);
  }, { passive: false });

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


function filterBuildingSheet(query) {
  if (!campusData || !campusData.buildings) return;
  const q = query.trim().toLowerCase();
  const searchable = campusData.buildings.filter(b => b.category !== 'housing' && b.category !== 'place');
  const filtered = !q
    ? searchable
    : searchable.filter(b => (b.name || '').toLowerCase().includes(q));
  populateBuildingSheet(filtered);
}

function populateBuildingSheet(buildings) {
  const container = document.getElementById('building-sheet-list');
  if (!container) return;
  container.innerHTML = '';

  if (!buildings || buildings.length === 0) {
    container.innerHTML = '<div class="building-cat">No buildings found</div>';
    return;
  }

  const groups = {};
  buildings.forEach(b => {
    const cat = b.category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(b);
  });

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
        if (typeof sheetToggle === 'function') sheetToggle();
        showBuildingInfo(b);
        if (typeof selectBuilding === 'function') selectBuilding(b);
      });
      container.appendChild(item);
    });
  });

  console.log('[ui] Building sheet populated —', buildings.length, 'buildings');
}



function onSceneReady(data) {
  campusBuildings = data.buildings.filter(b => b.category !== 'housing' && b.category !== 'place');
  populateBuildingSheet(campusBuildings);

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