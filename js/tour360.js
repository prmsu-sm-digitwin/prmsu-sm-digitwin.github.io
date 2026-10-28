// =============================================================
//  js/tour360.js  —  Interim 360° campus tour (Street-View style)
//
//  Lives inside the existing Campus Walkthrough page. A small mode bar
//  switches between:
//    • 360° Tour       (this file, default)  — equirectangular photos
//                      wrapped on the inside of a sphere; tap the arrows
//                      to step to the next / previous photo.
//    • 3D Prototype    (js/walkthrough.js)   — the photogrammetry mesh.
//
//  Data:   data/tour360.json  (stops in walking order, per-stop title and
//          "fwd" = where in the photo the next stop lies, 0..1 across the
//          width).  Photos: images/360/<RouteFolder>/pNN.jpg (listed in data/tour360.json).
//
//  Not Street View / not photogrammetry: you jump between fixed photo
//  spots.  Kept separate from walkthrough.js so the 3D prototype can be
//  switched back in with no changes.
// =============================================================
(function () {
  'use strict';

  var DATA_URL = 'data/tour360.json';
  var SPHERE_R = 500;
  var TAU = Math.PI * 2;

  // Where a point at horizontal photo position u (0..1) sits, as a yaw angle.
  // (Calibrated against the sphere mapping used below: u=0.75 faces yaw 0.)
  function uToYaw(u) { return Math.PI / 2 + u * TAU; }

  var data = null, stops = [];
  var idx = 0;
  var yaw = 0, pitch = -0.08, fov = 75;
  var velYaw = 0, velPitch = 0;

  var stage, canvas, renderer, scene, camera, sphere, mat;
  var btnBack, fadeEl, toastEl, loadingEl;
  var arrowFwd, arrowBack, raycaster;
  var texCache = {};            // file -> THREE.Texture
  var texOrder = [];            // LRU of cached files
  var loadToken = 0;
  var running = false, rafId = null, dirty = true;
  var inited = false, autoTimer = null, toastTimer = null;
  var stepBusy = false, holdTimer = null, holdIv = null, holdFired = false;
  var pointers = {}, lastPinch = 0, dragMoved = 0, downX = 0, downY = 0, downTime = 0;

  // ── Public hooks (wrapped around CampusWalkthrough below) ──
  function tourEnter() {
    if (typeof THREE === 'undefined') return;
    if (!inited) init();
    if (!inited) return;
    running = true;
    resize();
    loop();
  }
  function tourLeave() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    stopAuto();
  }

  // ── Setup ──
  function init() {
    stage = document.getElementById('tour-stage');
    if (!stage) return;
    stage.innerHTML =
      '<canvas id="tour-canvas"></canvas>' +
      '<div class="tour-loading" id="tour-loading">Loading 360° tour…</div>' +
      '<div class="tour-fade" id="tour-fade"></div>' +
      '<div class="tour-hint" id="tour-hint">Drag to look around · tap or hold the arrows to walk</div>' +
      '<div class="tour-toast" id="tour-toast"></div>' +
      '<button class="tour-back" id="tour-back" type="button" aria-label="Back to home" title="Back">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>';

    canvas   = document.getElementById('tour-canvas');
    btnBack  = document.getElementById('tour-back');
    fadeEl   = document.getElementById('tour-fade');
    toastEl  = document.getElementById('tour-toast');
    loadingEl = document.getElementById('tour-loading');

    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
    } catch (e) {
      loadingEl.textContent = '360° view needs WebGL, which this browser could not start.';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1200);
    camera.rotation.order = 'YXZ';

    var geo = new THREE.SphereGeometry(SPHERE_R, 64, 48);
    geo.scale(-1, 1, 1);                       // view the texture from inside
    mat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    sphere = new THREE.Mesh(geo, mat);
    scene.add(sphere);

    raycaster = new THREE.Raycaster();
    arrowFwd  = makeArrow(1.0);
    arrowBack = makeArrow(0.6);
    scene.add(arrowFwd.group); scene.add(arrowBack.group);

    bindEvents();
    inited = true;

    fetch(DATA_URL)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        data = d; stops = d.stops || [];
        resolveLinks();
        loadingEl.classList.add('tour-hidden');
        showStop(0, 'init');
      })
      .catch(function () { loadingEl.textContent = 'Could not load the tour data.'; });
  }

  // ── Route graph (Street-View style) ──
  // Stops are walked in list order, but a stop can also:
  //   "end": true        -> the documented path stops here: no forward arrow
  //   "id": "name"       -> a name other stops can point to
  //   "prev": "name"     -> where the Back arrow goes (default: the stop before it in the list)
  //   "links": [{"to": "name", "u": 0.3}]  -> an extra forward arrow (a fork), pointing at
  //                         horizontal photo position u (0..1) and leading to stop "name"
  var idToIdx = {};
  var linkArrows = [];                       // pooled arrow meshes for fork links
  function resolveLinks() {
    idToIdx = {};
    stops.forEach(function (s, i) { if (s.id) idToIdx[s.id] = i; });
  }
  function nextIdx(i) {
    var s = stops[i];
    if (!s || s.end || i >= stops.length - 1) return -1;
    return i + 1;
  }
  function prevIdx(i) {
    var s = stops[i];
    if (!s) return -1;
    if (s.prev != null && idToIdx[s.prev] != null) return idToIdx[s.prev];
    return i > 0 ? i - 1 : -1;
  }
  function linksOf(i) {
    var s = stops[i], out = [];
    ((s && s.links) || []).forEach(function (l) {
      if (idToIdx[l.to] != null) out.push({ to: idToIdx[l.to], u: l.u || 0 });
    });
    return out;
  }

  // Flat chevron lying on the ground, rotated by a parent group.
  function makeArrow(opacity) {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.38)';
    g.beginPath(); g.arc(128, 128, 118, 0, TAU); g.fill();
    g.lineWidth = 26; g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#ffffff';
    g.beginPath(); g.moveTo(64, 150); g.lineTo(128, 82); g.lineTo(192, 150); g.stroke();
    g.beginPath(); g.moveTo(64, 205); g.lineTo(128, 137); g.lineTo(192, 205); g.stroke();
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    var m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: opacity, depthTest: false, depthWrite: false });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, -5.5, -11);
    mesh.renderOrder = 5;
    var group = new THREE.Group();
    group.add(mesh);
    return { group: group, mesh: mesh };
  }

  // ── Texture cache (keep a handful in memory) ──
  // Why steps used to feel slow: every photo is 4096x2048, so each step meant
  // decoding a ~1.5 MB JPEG on the main thread AND uploading a 32 MB texture to
  // the GPU at the moment you arrived. Now (a) phones get a 3072-wide copy that is
  // decoded off the main thread (createImageBitmap), (b) the next few stops are
  // fetched ahead, and (c) each is uploaded to the GPU as soon as it arrives, so
  // showing a stop is just a swap.
  var SMALL_DEVICE = (function () {
    try { return matchMedia('(pointer: coarse)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 4); }
    catch (e) { return false; }
  })();
  var TEX_W = SMALL_DEVICE ? 3072 : 4096;
  var MAX_KEEP = 6;
  var pending = {};             // file -> in-flight Promise (so a photo is never fetched twice)

  function finishTex(t, file) {
    t.encoding = THREE.sRGBEncoding;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }
  function bitmapTex(file) {
    if (!window.createImageBitmap || !window.fetch) return Promise.reject(new Error('no bitmap'));
    var w = TEX_W;
    try { if (renderer) w = Math.min(w, renderer.capabilities.maxTextureSize || w); } catch (e) {}
    return fetch(file).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.blob();
    }).then(function (blob) {
      return createImageBitmap(blob, { imageOrientation: 'flipY', resizeWidth: w, resizeHeight: Math.round(w / 2), resizeQuality: 'medium' });
    }).then(function (bmp) {
      var t = new THREE.Texture(bmp);
      t.flipY = false;                       // the bitmap is already flipped
      return t;
    });
  }
  function loaderTex(file) {                 // fallback for browsers without the bitmap path
    return new Promise(function (resolve, reject) {
      new THREE.TextureLoader().load(file, resolve, undefined, function () { reject(new Error('load ' + file)); });
    });
  }
  function loadTex(file) {
    if (texCache[file]) { touch(file); return Promise.resolve(texCache[file]); }
    if (pending[file]) return pending[file];
    var p = bitmapTex(file).catch(function () { return loaderTex(file); }).then(function (t) {
      finishTex(t, file);
      texCache[file] = t; touch(file);
      delete pending[file];
      trim();
      return t;
    }, function (err) { delete pending[file]; throw err; });
    pending[file] = p;
    return p;
  }
  function touch(file) {
    var i = texOrder.indexOf(file); if (i >= 0) texOrder.splice(i, 1);
    texOrder.push(file);
  }
  function trim() {
    var guard = texOrder.length;
    while (texOrder.length > MAX_KEEP && guard-- > 0) {
      var f = texOrder.shift();
      var t = texCache[f];
      if (t && mat && mat.map === t) texOrder.push(f);          // on screen — keep
      else if (t) { t.dispose(); delete texCache[f]; }
    }
  }
  function preload(i) {
    if (i < 0 || i >= stops.length) return;
    loadTex(stops[i].file).then(function (t) {
      // Upload to the GPU now (while idle), not at the moment you step onto it.
      try { if (renderer && renderer.initTexture) renderer.initTexture(t); } catch (e) {}
    }).catch(function () {});
  }

  // ── Warm the route ahead of you in the background ──
  // Once a stop is on screen, quietly download the photos around it (a few behind,
  // plenty ahead), a couple at a time and only while nothing you asked for is
  // loading. The service worker keeps them, so walking the route never waits on the
  // network, and they stay available offline. A moving window (not the whole route)
  // keeps data use sensible now that the tour has hundreds of stops. Skipped on "Data Saver".
  var WARM_BEHIND = 6, WARM_AHEAD = 40;
  var warmQueue = [], warmSeen = {}, warmActive = 0, warmFails = 0, warmTimer = null;
  function warmRoute() {
    if (!stops.length || !window.fetch || !window.caches) return;
    try { if (navigator.connection && navigator.connection.saveData) return; } catch (e) {}
    var lo = Math.max(0, idx - WARM_BEHIND), hi = Math.min(stops.length - 1, idx + WARM_AHEAD);
    var add = [];
    for (var i = idx; i <= hi; i++) add.push(i);                       // ahead of you first
    for (var j = idx - 1; j >= lo; j--) add.push(j);
    warmQueue = add.map(function (n) { return stops[n].file; }).filter(function (f) { return !warmSeen[f]; });
    if (!warmTimer) warmTimer = setTimeout(warmPump, 800);
  }
  function warmOne(file) {              // own function so each download keeps ITS file name
    caches.match(file).then(function (hit) {
      if (hit) return;
      return fetch(file).then(function (r) { if (!r.ok) throw new Error('http'); return r.arrayBuffer(); });
    }).then(function () { warmFails = 0; }, function () { warmFails++; })
      .then(function () { warmActive--; if (!warmTimer) warmTimer = setTimeout(warmPump, 60); });
  }
  function warmPump() {
    warmTimer = null;
    if (warmFails >= 3) return;                                        // offline / blocked: stop trying
    while (warmActive < 2 && warmQueue.length) {
      if (Object.keys(pending).length) { warmTimer = setTimeout(warmPump, 500); return; }   // your photo first
      var file = warmQueue.shift();
      if (warmSeen[file]) continue;
      warmSeen[file] = true; warmActive++;
      warmOne(file);
    }
  }

  // ── Navigation ──
  function showStop(i, how) {
    if (!stops.length) return;
    i = Math.max(0, Math.min(stops.length - 1, i));
    var token = ++loadToken;
    stepBusy = true;
    fadeEl.classList.add('on');
    loadTex(stops[i].file).then(function (tex) {
      if (token !== loadToken) return;
      mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true;
      idx = i;
      var fy = uToYaw(stops[i].fwd || 0);
      // Face the way you're travelling.
      yaw = (how === 'back') ? fy + Math.PI : fy;
      if (how === 'init') pitch = -0.05;
      velYaw = velPitch = 0;
      updateHud(); updateArrows();
      if (how === 'fwd' && stops[i].end) toast('This is as far as the path has been photographed.');
      fadeEl.classList.remove('on');
      stepBusy = false;
      dirty = true;
      preload(i + 1); preload(i + 2); preload(i - 1); preload(i + 3);
      linksOf(i).forEach(function (l) { preload(l.to); });
      preload(prevIdx(i));
      warmRoute();
    }).catch(function () {
      if (token !== loadToken) return;
      fadeEl.classList.remove('on');
      stepBusy = false; stopHold();
      toast('Could not load this photo (offline and not cached yet?)');
      stopAuto();
    });
  }
  function next() { var n = nextIdx(idx); if (n >= 0) showStop(n, 'fwd'); }
  function prev() { var p = prevIdx(idx); if (p >= 0) showStop(p, 'back'); }

  function updateHud() {
  }
  function updateArrows() {
    var s = stops[idx], fy = uToYaw(s.fwd || 0);
    var hasNext = nextIdx(idx) >= 0, hasPrev = prevIdx(idx) >= 0;
    arrowFwd.group.rotation.y  = -fy;
    arrowBack.group.rotation.y = -(s.back != null ? uToYaw(s.back) : fy + Math.PI);   // optional "back": u for forks
    arrowFwd.group.visible  = hasNext;          // no arrow at the end of the documented path
    arrowBack.group.visible = hasPrev;
    var links = linksOf(idx);
    while (linkArrows.length < links.length) { var a = makeArrow(1.0); linkArrows.push(a); scene.add(a.group); }
    linkArrows.forEach(function (a, k) {
      var l = links[k];
      a.group.visible = !!l;
      if (l) { a.group.rotation.y = -uToYaw(l.u); a.target = l.to; }
    });
  }

  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }

  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('tour-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('tour-show'); }, 3200);
  }

  // ── Input: drag to look, pinch / wheel to zoom, tap an arrow to move ──
  function bindEvents() {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); setFov(fov + e.deltaY * 0.04); }, { passive: false });
    // Leaves the walkthrough (same as the phone's back button) -> back to where you came from, i.e. home.
    btnBack.addEventListener('click', function () { stopAuto(); if (typeof goBack === 'function') goBack(); else if (typeof goTo === 'function') goTo('main'); });
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  }
  function onDown(e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var n = Object.keys(pointers).length;
    if (n === 1) { downX = e.clientX; downY = e.clientY; downTime = Date.now(); dragMoved = 0; velYaw = velPitch = 0; startHoldIfArrow(e.clientX, e.clientY); }
    else stopHold();
    if (n === 2) lastPinch = pinchDist();
    hideHint();
  }
  function onMove(e) {
    var p = pointers[e.pointerId]; if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    var n = Object.keys(pointers).length;
    if (n >= 2) {
      var d = pinchDist();
      if (lastPinch) setFov(fov * (lastPinch / d));
      lastPinch = d; dragMoved = 99;
      return;
    }
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (dragMoved > 14) stopHold();
    var sens = (fov * Math.PI / 180) / Math.max(200, stage.clientHeight);
    yaw   -= dx * sens;
    pitch += dy * sens;
    clampPitch();
    velYaw = -dx * sens; velPitch = dy * sens;
    dirty = true;
  }
  function onUp(e) {
    var wasOne = Object.keys(pointers).length === 1;
    delete pointers[e.pointerId];
    var wasHold = holdFired; stopHold();
    if (wasHold) { dragMoved = 99; }
    if (Object.keys(pointers).length < 2) lastPinch = 0;
    if (wasOne && dragMoved < 8 && Date.now() - downTime < 500) onTap(e.clientX, e.clientY);
  }
  function pinchDist() {
    var k = Object.keys(pointers); if (k.length < 2) return 0;
    var a = pointers[k[0]], b = pointers[k[1]];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }
  function setFov(v) { fov = Math.max(35, Math.min(95, v)); camera.fov = fov; camera.updateProjectionMatrix(); dirty = true; }
  function clampPitch() { pitch = Math.max(-1.25, Math.min(1.3, pitch)); }
  function hideHint() { var h = document.getElementById('tour-hint'); if (h) h.classList.add('tour-hidden'); }

  // Hold an arrow to keep walking in that direction (tap still moves one step).
  function stopHold() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (holdIv) { clearInterval(holdIv); holdIv = null; }
    holdFired = false;
  }
  function startHoldIfArrow(cx, cy) {
    stopHold();
    var hit = arrowHit(cx, cy); if (!hit) return;
    var dir = (hit.object === arrowBack.mesh) ? 'back' : 'fwd';
    holdTimer = setTimeout(function () {
      holdTimer = null; holdFired = true; stopAuto();
      var first = true;
      holdIv = setInterval(function () {
        if (stepBusy) return;
        if (dir === 'back') { if (prevIdx(idx) < 0) return stopHold(); prev(); }
        else {
          if (first && hit.object !== arrowFwd.mesh) {
            first = false;
            for (var k = 0; k < linkArrows.length; k++) if (linkArrows[k].mesh === hit.object) { showStop(linkArrows[k].target, 'fwd'); return; }
          }
          first = false;
          if (nextIdx(idx) < 0) return stopHold(); next();
        }
      }, 60);
    }, 320);
  }
  function arrowHit(cx, cy) {
    var r = canvas.getBoundingClientRect();
    var m = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(m, camera);
    var targets = [];
    if (arrowFwd.group.visible) targets.push(arrowFwd.mesh);
    if (arrowBack.group.visible) targets.push(arrowBack.mesh);
    linkArrows.forEach(function (a) { if (a.group.visible) targets.push(a.mesh); });
    return raycaster.intersectObjects(targets, false)[0] || null;
  }

  function onTap(cx, cy) {
    var r = canvas.getBoundingClientRect();
    var m = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(m, camera);
    var targets = [];
    if (arrowFwd.group.visible) targets.push(arrowFwd.mesh);
    if (arrowBack.group.visible) targets.push(arrowBack.mesh);
    linkArrows.forEach(function (a) { if (a.group.visible) targets.push(a.mesh); });
    var hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) return;
    stopAuto();
    if (hit.object === arrowFwd.mesh) next();
    else if (hit.object === arrowBack.mesh) prev();
    else {
      for (var k = 0; k < linkArrows.length; k++) if (linkArrows[k].mesh === hit.object) { showStop(linkArrows[k].target, 'fwd'); break; }
    }
  }

  // ── Render loop ──
  function resize() {
    if (!renderer || !stage) return;
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    dirty = true;
  }
  function loop() {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (Math.abs(velYaw) > 0.00005 || Math.abs(velPitch) > 0.00005) {
      if (!Object.keys(pointers).length) {
        yaw += velYaw; pitch += velPitch; clampPitch();
        velYaw *= 0.92; velPitch *= 0.92; dirty = true;
      }
    }
    if (!dirty) return;
    dirty = false;
    camera.rotation.set(pitch, -yaw, 0, 'YXZ');
    renderer.render(scene, camera);
  }

  // ── Debug / test hook (harmless in production) ──
  window.Tour360 = {
    _state: function () { return { idx: idx, yaw: yaw, pitch: pitch, stops: stops.length }; },
    _set: function (y, p, f) { yaw = y; pitch = p; velYaw = velPitch = 0; if (f) setFov(f); dirty = true; },
    next: next, prev: prev, go: function (i) { showStop(i, 'jump'); }
  };

  // ── Mode switch inside the Campus Walkthrough page ──
  var orig = window.CampusWalkthrough;     // photogrammetry prototype's hooks
  var mode = 'tour';
  var origActive = false;

  function applyMode(m) {
    mode = m;
    var fp = document.getElementById('wt-fp-stage');
    var ts = document.getElementById('tour-stage');
    var bT = document.getElementById('wt-mode-tour');
    var b3 = document.getElementById('wt-mode-3d');
    if (bT) bT.classList.toggle('active', m === 'tour');
    if (b3) b3.classList.toggle('active', m === '3d');
    if (fp) fp.classList.toggle('wt-stage-off', m === 'tour');
    if (ts) ts.classList.toggle('wt-stage-off', m !== 'tour');
    if (m === 'tour') {
      if (origActive && orig) { try { orig.onLeave(); } catch (e) {} origActive = false; }
      tourEnter();
    } else {
      tourLeave();
      if (orig) { try { orig.onEnter(); origActive = true; } catch (e) {} }
    }
  }

  window.CampusWalkthrough = {
    onEnter: function () {
      wireModeButtons();
      applyMode(mode);
    },
    onLeave: function () {
      tourLeave();
      if (origActive && orig) { try { orig.onLeave(); } catch (e) {} origActive = false; }
    }
  };

  var wired = false;
  function wireModeButtons() {
    if (wired) return;
    var bT = document.getElementById('wt-mode-tour');
    var b3 = document.getElementById('wt-mode-3d');
    if (!bT || !b3) return;
    bT.addEventListener('click', function () { applyMode('tour'); });
    b3.addEventListener('click', function () { applyMode('3d'); });
    wired = true;
  }
})();
