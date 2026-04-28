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
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
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

  const { x, z } = latLngToXZ(lat, lng);

  // Clamp to campus bounds so the dot never flies off the map
  const cx = clamp(x, _bounds.minX, _bounds.maxX);
  const cz = clamp(z, _bounds.minZ, _bounds.maxZ);

  console.log(`[gps] lat=${lat.toFixed(6)} lng=${lng.toFixed(6)} → x=${cx.toFixed(1)} z=${cz.toFixed(1)}`);

  if (typeof updateGPSMarker === 'function') {
    updateGPSMarker(cx, cz);
  }
}

function onError(err) {
  // Common codes: 1=PERMISSION_DENIED, 2=UNAVAILABLE, 3=TIMEOUT
  const messages = {
    1: 'Location permission denied. Please allow location access.',
    2: 'Location unavailable.',
    3: 'Location request timed out.'
  };
  console.warn('[gps] Error', err.code, '—', messages[err.code] || err.message);
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