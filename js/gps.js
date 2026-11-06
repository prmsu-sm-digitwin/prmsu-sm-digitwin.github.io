

let _origin = null;
let _bounds = null;
let _watchId = null;
let _kf = null;
let _simTimer = null;
const GPS_MAX_ACC = 60;
const GPS_MIN_ACC = 5;
const GPS_WALK_Q  = 4;



function initGPS(campusData) {
  _origin = campusData.origin;
  _bounds = campusData.bounds;
  console.log('[gps] Initialized. Origin:', _origin);
}



function setGPSEnabled(enabled) {
  if (enabled) {
    startWatching();
  } else {
    stopWatching();
    _kf = null;
    if (typeof updateGPSMarker === 'function') {
      updateGPSMarker(null, null);
    }
  }
}

function startWatching() {
  if (simGPSOn()) { startSim(); return; }
  if (!navigator.geolocation) {
    console.warn('[gps] Geolocation not supported on this device.');
    return;
  }
  if (_watchId !== null) return;

  _watchId = navigator.geolocation.watchPosition(
    onPosition,
    onError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );

  console.log('[gps] Started watching. watchId:', _watchId);
}

function stopWatching() {
  stopSim();
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
    console.log('[gps] Stopped watching.');
  }
}



function onPosition(pos) {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;

  const acc = Math.max(GPS_MIN_ACC, pos.coords.accuracy || 20);
  const raw = latLngToXZ(lat, lng);

  if (_kf && acc > GPS_MAX_ACC) return;

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

  const isOnCampus = x >= _bounds.minX && x <= _bounds.maxX &&
                     z >= _bounds.minZ && z <= _bounds.maxZ;

  const cx = clamp(x, _bounds.minX, _bounds.maxX);
  const cz = clamp(z, _bounds.minZ, _bounds.maxZ);

  if (typeof updateGPSMarker === 'function') {
    updateGPSMarker(cx, cz, isOnCampus);
  }
}



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
  const messages = {
    1: 'Location permission denied. Please allow location access.',
    2: 'Location unavailable.',
    3: 'Location request timed out.'
  };
  console.warn('[gps] Error', err.code, '—', messages[err.code] || err.message);
  if (err.code === 1) showGPSToast(messages[1]);
}



function latLngToXZ(lat, lng) {
  if (!_origin) {
    console.warn('[gps] latLngToXZ called before initGPS()');
    return { x: 0, z: 0 };
  }

  const R = 6371000;
  const dLat = (lat - _origin.lat) * (Math.PI / 180);
  const dLng = (lng - _origin.lng) * (Math.PI / 180);
  const avgLat = (_origin.lat * Math.PI) / 180;

  const x =  dLng * R * Math.cos(avgLat);
  const z = -dLat * R;

  return { x, z };
}



function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

(function () {
  try {
    var m = /[?&]simgps=([01])/.exec(location.search);
    if (m) { if (m[1] === '1') localStorage.setItem('simgps', '1'); else localStorage.removeItem('simgps'); }
  } catch (e) {}
})();

function simGPSOn() {
  try { return localStorage.getItem('simgps') === '1'; } catch (e) { return false; }
}

function stopSim() {
  if (_simTimer) { clearInterval(_simTimer); _simTimer = null; }
}

function startSim() {
  if (_simTimer) return;
  if (typeof waypointMap === 'undefined' || typeof findPath !== 'function') return;
  var ids = Object.keys(waypointMap);
  var ref = (typeof lookTarget !== 'undefined') ? lookTarget : { x: 0, z: 0 };
  var start = ids[0], bd = 1e9;
  ids.forEach(function (id) {
    var p = waypointMap[id].position, d = Math.hypot(p.x - ref.x, p.z - ref.z);
    if (d < bd) { bd = d; start = id; }
  });
  var route = null, tries = 0;
  var order = ids.slice().sort(function () { return Math.random() - 0.5; });
  for (var i = 0; i < order.length && !route; i++) {
    var g = order[i], gp = waypointMap[g].position, sp = waypointMap[start].position;
    var dist = Math.hypot(gp.x - sp.x, gp.z - sp.z);
    if (dist < 120 || dist > 400) continue;
    var r = findPath(waypointMap, start, g);
    if (r && r.length > 3) route = r;
  }
  if (!route) { console.warn('[gps] simulation: no route found'); return; }
  var pts = route.map(function (id) { return waypointMap[id].position; });
  pts = pts.concat(pts.slice(0, -1).reverse());
  var seg = 0, off = 0;
  var speed = window.SIMGPS_SPEED || 4;
  if (typeof showGPSToast === 'function') showGPSToast('GPS simulation on (test mode)');
  function tick() {
    var left = speed;
    while (left > 0) {
      var a = pts[seg], b = pts[(seg + 1) % pts.length];
      var len = Math.hypot(b.x - a.x, b.z - a.z) || 0.001;
      if (off + left < len) { off += left; left = 0; }
      else { left -= (len - off); off = 0; seg = (seg + 1) % (pts.length - 1 || 1); }
    }
    var a2 = pts[seg], b2 = pts[(seg + 1) % pts.length];
    var l2 = Math.hypot(b2.x - a2.x, b2.z - a2.z) || 0.001, t = off / l2;
    var x = a2.x + (b2.x - a2.x) * t, z = a2.z + (b2.z - a2.z) * t;
    if (typeof updateGPSMarker === 'function') updateGPSMarker(x, z, true);
  }
  tick();
  _simTimer = setInterval(tick, 1000);
}

window.simulateGPS = function (on) {
  try { if (on === false) localStorage.removeItem('simgps'); else localStorage.setItem('simgps', '1'); } catch (e) {}
  if (typeof gpsEnabled !== 'undefined' && gpsEnabled) { stopSim(); startSim(); }
};
