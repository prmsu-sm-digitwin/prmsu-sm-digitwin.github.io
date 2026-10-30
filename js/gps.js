// =============================================================
//  js/gps.js  —  GPS blue dot on the 3D map
//
//  Functions called by ui.js:
//    setGPSEnabled(bool)    — start/stop watching position
//
//  Functions called by main.js at startup:
//    initGPS(campusData)    — stores origin + bounds for conversion
//
//  Calls into main.js:
//    updateGPSMarker(x, z)  — moves the blue sphere in the scene
// =============================================================


// ── State ────────────────────────────────────────────────────
let _origin = null;   // { lat, lng }  — campus (0,0) point
let _bounds = null;   // { minX, maxX, minZ, maxZ }
let _watchId = null;  // navigator.geolocation watch handle
let _kf = null;       // smoothing filter state { x, z, p, t }
const GPS_MAX_ACC = 60;      // ignore fixes worse than this (meters), once we have a decent one
const GPS_MIN_ACC = 5;       // never trust a fix more than this precise (phones over-report)
const GPS_WALK_Q  = 4;       // process noise (m^2 per second) = how fast you may really move


// ── Init (called by main.js after campus.json loads) ─────────

function initGPS(campusData) {
  _origin = campusData.origin;
  _bounds = campusData.bounds;
  console.log('[gps] Initialized. Origin:', _origin);
}


// ── Enable / Disable ─────────────────────────────────────────

function setGPSEnabled(enabled) {
  if (enabled) {
    startWatching();
  } else {
    stopWatching();
    _kf = null;
    // Hide the marker by moving it off-screen
    if (typeof updateGPSMarker === 'function') {
      updateGPSMarker(null, null);
    }
  }
}

function startWatching() {
  if (!navigator.geolocation) {
    console.warn('[gps] Geolocation not supported on this device.');
    return;
  }
  if (_watchId !== null) return;   // already watching

  _watchId = navigator.geolocation.watchPosition(
    onPosition,
    onError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );

  console.log('[gps] Started watching. watchId:', _watchId);
}

function stopWatching() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
    console.log('[gps] Stopped watching.');
  }
}


// ── Position Handler ─────────────────────────────────────────

function onPosition(pos) {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;

  const acc = Math.max(GPS_MIN_ACC, pos.coords.accuracy || 20);
  const raw = latLngToXZ(lat, lng);

  // Drop very poor fixes once we already have a position (they cause the big jumps).
  if (_kf && acc > GPS_MAX_ACC) return;

  // Simple 1D Kalman filter per axis: trust accurate fixes more, wobble less when standing still.
  const now = pos.timestamp || Date.now();
  if (!_kf) {
    _kf = { x: raw.x, z: raw.z, p: acc * acc, t: now };
  } else {
    const dt = Math.max(0, Math.min(10, (now - _kf.t) / 1000));
    _kf.p += GPS_WALK_Q * dt;
    const k = _kf.p / (_kf.p + acc * acc);
    _kf.x += k * (raw.x - _kf.x);
    _kf.z += k * (raw.z - _kf.z);
    _kf.p *= (1 - k);
    _kf.t = now;
  }
  const x = _kf.x, z = _kf.z;

  console.log(`[gps] lat=${lat.toFixed(6)} lng=${lng.toFixed(6)} → x=${x.toFixed(1)} z=${z.toFixed(1)}`);

  // Check if user is actually inside campus before clamping
  const isOnCampus = x >= _bounds.minX && x <= _bounds.maxX &&
                     z >= _bounds.minZ && z <= _bounds.maxZ;

  // Always show blue dot — clamp so it stays visible even if user is outside campus
  const cx = clamp(x, _bounds.minX, _bounds.maxX);
  const cz = clamp(z, _bounds.minZ, _bounds.maxZ);

  if (typeof updateGPSMarker === 'function') {
    updateGPSMarker(cx, cz, isOnCampus);
  }
}


// ── GPS Toast ────────────────────────────────────────────────
// Shows a short-lived popup on the map page.

let _toastTimeout = null;

function showGPSToast(message) {
  let toast = document.getElementById('gps-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'gps-toast';
    toast.style.cssText = [
      'position:fixed',
      'bottom:120px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(30,30,30,0.92)',
      'color:#fff',
      'font-family:"DM Sans",sans-serif',
      'font-size:13px',
      'font-weight:500',
      'padding:10px 20px',
      'border-radius:24px',
      'z-index:9998',
      'pointer-events:none',
      'white-space:nowrap',
      'box-shadow:0 4px 16px rgba(0,0,0,0.3)',
      'transition:opacity 0.3s',
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.display = 'block';

  if (_toastTimeout) clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 320);
  }, 3000);
}

function onError(err) {
  // Common codes: 1=PERMISSION_DENIED, 2=UNAVAILABLE, 3=TIMEOUT
  const messages = {
    1: 'Location permission denied. Please allow location access.',
    2: 'Location unavailable.',
    3: 'Location request timed out.'
  };
  console.warn('[gps] Error', err.code, '—', messages[err.code] || err.message);
  if (err.code === 1) showGPSToast(messages[1]);          // timeouts are routine; only tell the user about permission
}


// ── Coordinate Conversion ────────────────────────────────────
// Equirectangular projection — same formula used to build campus.json positions
// x = east in meters from origin, z = north in meters (negative = north on map)

function latLngToXZ(lat, lng) {
  if (!_origin) {
    console.warn('[gps] latLngToXZ called before initGPS()');
    return { x: 0, z: 0 };
  }

  const R = 6371000;  // Earth radius in meters
  const dLat = (lat - _origin.lat) * (Math.PI / 180);
  const dLng = (lng - _origin.lng) * (Math.PI / 180);
  const avgLat = (_origin.lat * Math.PI) / 180;

  const x =  dLng * R * Math.cos(avgLat);  // east = positive x
  const z = -dLat * R;                      // north = negative z (Three.js convention)

  return { x, z };
}


// ── Utility ──────────────────────────────────────────────────

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}