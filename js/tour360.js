(function () {
  'use strict';

  var DATA_URL = 'data/tour360.json';
  var SPHERE_R = 500;
  var TAU = Math.PI * 2;

  function uToYaw(u) { return Math.PI / 2 + u * TAU; }

  var data = null, stops = [];
  function fwdOf(st) {
    var u = st.fwd || 0;
    if (data) {
      u += data.fwdOffset || 0;
      var fo = data.folderOffsets;
      if (fo) { var m = /\/360\/([^\/]+)\//.exec(st.file || ''); if (m && fo[m[1]]) u += fo[m[1]]; }
    }
    return u;
  }

  var idx = 0;
  var yaw = 0, pitch = -0.08, fov = 75;
  var velYaw = 0, velPitch = 0;

  var stage, canvas, renderer, scene, camera, sphere, mat;
  var btnBack, fadeEl, toastEl, loadingEl;
  var arrowFwd, arrowBack, raycaster;
  var texCache = {};
  var texOrder = [];
  var loadToken = 0, fadeTimer = null, travelDir = 1;
  var running = false, rafId = null, dirty = true;
  var inited = false, autoTimer = null, toastTimer = null;
  var stepBusy = false, holdTimer = null, holdIv = null, holdFired = false;
  var pointers = {}, lastPinch = 0, dragMoved = 0, downX = 0, downY = 0, downTime = 0;

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

  function init() {
    stage = document.getElementById('tour-stage');
    if (!stage) return;
    stage.innerHTML =
      '<canvas id="tour-canvas"></canvas>' +
      '<div class="tour-loading" id="tour-loading">Loading 360° tour…</div>' +
      '<div class="tour-fade" id="tour-fade"></div>' +
      '<div class="tour-toast" id="tour-toast"></div>' +
      '<div class="tour-topleft">' +
        '<div class="tour-hud" id="tour-hud" title="Tap for details"></div>' +
        '<button class="tour-places-btn" id="tour-places-btn" type="button" aria-label="Places" title="Places">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="3.6" cy="6" r="1" fill="currentColor"/><circle cx="3.6" cy="12" r="1" fill="currentColor"/><circle cx="3.6" cy="18" r="1" fill="currentColor"/></svg></button>' +
      '</div>' +
      '<div class="tour-places" id="tour-places"><div class="tour-places-title">Go to</div><div class="tour-places-list" id="tour-places-list"></div></div>' +
      '<button class="tour-back" id="tour-back" type="button" aria-label="Back to home" title="Back">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<button class="tour-help-btn" id="help-btn-walkthrough" type="button" aria-label="Show the guide for this page" title="Guide" onclick="showPageHelp(\'walkthrough\')">?</button>';

    canvas   = document.getElementById('tour-canvas');
    btnBack  = document.getElementById('tour-back');
    document.getElementById('tour-hud').addEventListener('click', function () { hudDetail = !hudDetail; updateHud(); });
    if (!hudEnabled()) document.getElementById('tour-hud').style.display = 'none';
    document.getElementById('tour-places-btn').addEventListener('click', function (e) { e.stopPropagation(); togglePlaces(); });
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
    geo.scale(-1, 1, 1);
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
        buildPlaces(d.places || []);
        try { buildOffline(); } catch (err) { console.warn('[tour] offline panel unavailable', err); }
        loadingEl.classList.add('tour-hidden');
        showStop(0, 'init');
      })
      .catch(function () { loadingEl.textContent = 'Could not load the tour data.'; });
  }

  var idToIdx = {};
  var linkArrows = [];
  function resolveLinks() {
    idToIdx = {};
    stops.forEach(function (s, i) { if (s.id) idToIdx[s.id] = i; });
  }
  var placesEl = null;
  function buildPlaces(list) {
    var box = document.getElementById('tour-places-list');
    var btn = document.getElementById('tour-places-btn');
    placesEl = document.getElementById('tour-places');
    if (!box) return;
    box.innerHTML = '';
    var any = false;
    list.forEach(function (p) {
      if (idToIdx[p.to] == null) return;
      any = true;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'tour-place'; b.textContent = p.name;
      b.addEventListener('click', function (e) {
        e.stopPropagation(); closePlaces(); stopAuto();
        showStop(idToIdx[p.to], 'tp', p.face);
      });
      box.appendChild(b);
    });
    if (btn) btn.style.display = any ? '' : 'none';
    placesEl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  }
  function togglePlaces() { if (placesEl) { closeOffline(); placesEl.classList.toggle('open'); } }
  function closePlaces() { if (placesEl) placesEl.classList.remove('open'); }


  var PHOTO_CACHE_NAME = 'prmsu-photos-v6';
  var AVG_PHOTO_MB = 0.42;
  var OFFLINE_ASKED_KEY = 'tour360-offline-asked';
  var offlineEl = null, offlineSavedSet = {}, offlineBusy = false, offlineCancel = false, wakeLock = null;

  function photoUrls() {
    var seen = {}, out = [];
    stops.forEach(function (s) {
      if (s.file && !seen[s.file]) { seen[s.file] = 1; out.push(new URL(s.file, location.href).href); }
    });
    return out;
  }
  function mb(n) { return n >= 1000 ? (n / 1024).toFixed(1) + ' GB' : Math.round(n) + ' MB'; }

  function buildOffline() {
    if (!('caches' in window) || !stage) return;
    var top = stage.querySelector('.tour-topleft');
    if (top && !document.getElementById('tour-offline-btn')) {
      var b = document.createElement('button');
      b.type = 'button'; b.id = 'tour-offline-btn'; b.className = 'tour-places-btn';
      b.setAttribute('aria-label', 'Download for offline'); b.title = 'Download for offline';
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>';
      b.addEventListener('click', function (e) { e.stopPropagation(); toggleOffline(); });
      top.appendChild(b);
    }
    offlineEl = document.createElement('div');
    offlineEl.className = 'tour-offline'; offlineEl.id = 'tour-offline';
    offlineEl.innerHTML =
      '<div class="tour-places-title">Offline mode</div>' +
      '<div class="tour-offline-body">' +
        '<p class="tour-offline-text" id="tour-offline-text"></p>' +
        '<div class="tour-offline-bar"><div class="tour-offline-fill" id="tour-offline-fill"></div></div>' +
        '<div class="tour-offline-status" id="tour-offline-status"></div>' +
        '<div class="tour-offline-actions">' +
          '<button type="button" class="tour-offline-go" id="tour-offline-go">Download all</button>' +
          '<button type="button" class="tour-offline-alt" id="tour-offline-alt">Later</button>' +
        '</div>' +
        '<button type="button" class="tour-offline-remove" id="tour-offline-remove">Remove downloaded photos</button>' +
      '</div>';
    stage.appendChild(offlineEl);
    offlineEl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    document.getElementById('tour-offline-go').addEventListener('click', function (e) { e.stopPropagation(); startOfflineDownload(); });
    document.getElementById('tour-offline-alt').addEventListener('click', function (e) {
      e.stopPropagation();
      if (offlineBusy) { offlineCancel = true; } else closeOffline();
    });
    document.getElementById('tour-offline-remove').addEventListener('click', function (e) { e.stopPropagation(); removeOffline(); });

    var asked = false;
    try { asked = !!localStorage.getItem(OFFLINE_ASKED_KEY); } catch (err) {}
    refreshOffline().then(function (state) {
      if (!asked && state.saved < state.total) {
        setTimeout(function () { if (running) openOffline(); }, 2500);
      }
    });
  }

  function refreshOffline() {
    var urls = photoUrls();
    return caches.open(PHOTO_CACHE_NAME).then(function (c) { return c.keys(); }).then(function (keys) {
      offlineSavedSet = {};
      keys.forEach(function (r) { offlineSavedSet[r.url] = 1; });
      var saved = urls.filter(function (u) { return offlineSavedSet[u]; }).length;
      var state = { saved: saved, total: urls.length, urls: urls };
      renderOffline(state);
      return state;
    }).catch(function () { return { saved: 0, total: urls.length, urls: urls }; });
  }

  function renderOffline(st) {
    if (!offlineEl) return;
    var text = document.getElementById('tour-offline-text');
    var fill = document.getElementById('tour-offline-fill');
    var go = document.getElementById('tour-offline-go');
    var alt = document.getElementById('tour-offline-alt');
    var rem = document.getElementById('tour-offline-remove');
    var left = st.total - st.saved;
    fill.style.width = (st.total ? Math.round(st.saved / st.total * 100) : 0) + '%';
    rem.style.display = st.saved > 0 && !offlineBusy ? '' : 'none';
    if (left <= 0) {
      text.textContent = 'All ' + st.total + ' photos are saved on this device. The whole campus walkthrough works with no internet.';
      go.style.display = 'none'; alt.textContent = 'Close'; alt.style.display = '';
    } else {
      text.textContent = 'Save the whole walkthrough on this phone so it works with no internet. About ' + mb(left * AVG_PHOTO_MB) +
        ' still to download (' + st.saved + ' of ' + st.total + ' saved). Wi-Fi is recommended.';
      go.style.display = offlineBusy ? 'none' : ''; go.textContent = st.saved > 0 ? 'Download the rest' : 'Download all';
      alt.textContent = offlineBusy ? 'Pause' : 'Later'; alt.style.display = '';
    }
  }

  function setOfflineStatus(t) { var el = document.getElementById('tour-offline-status'); if (el) el.textContent = t || ''; }
  function openOffline() { if (!offlineEl) return; closePlaces(); offlineEl.classList.add('open'); refreshOffline(); }
  function closeOffline() {
    if (!offlineEl) return;
    offlineEl.classList.remove('open');
    try { localStorage.setItem(OFFLINE_ASKED_KEY, '1'); } catch (e) {}
  }
  function toggleOffline() { if (offlineEl && offlineEl.classList.contains('open')) closeOffline(); else openOffline(); }

  function startOfflineDownload() {
    if (offlineBusy) return;
    try { localStorage.setItem(OFFLINE_ASKED_KEY, '1'); } catch (e) {}
    refreshOffline().then(function (st) {
      var todo = st.urls.filter(function (u) { return !offlineSavedSet[u]; });
      if (!todo.length) { setOfflineStatus(''); return; }
      var needMB = todo.length * AVG_PHOTO_MB;
      var est = navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null);
      if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
      est.then(function (e) {
        if (e && e.quota) {
          var freeMB = (e.quota - (e.usage || 0)) / 1048576;
          if (freeMB < needMB * 1.15) {
            setOfflineStatus('Not enough free space: about ' + mb(needMB) + ' needed, only ' + mb(Math.max(0, freeMB)) + ' available. Free up some storage and try again.');
            return;
          }
        }
        runOfflineDownload(todo, st.total, st.saved);
      });
    });
  }

  function runOfflineDownload(todo, total, savedAtStart) {
    offlineBusy = true; offlineCancel = false;
    var done = 0, failed = 0, idx = 0, active = 0;
    if (navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
    }
    renderOffline({ saved: savedAtStart, total: total });
    caches.open(PHOTO_CACHE_NAME).then(function (cache) {
      function progress() {
        var saved = savedAtStart + done;
        document.getElementById('tour-offline-fill').style.width = Math.round(saved / total * 100) + '%';
        setOfflineStatus('Downloading… ' + saved + ' / ' + total + ' photos. Keep this screen open.');
      }
      function finish() {
        offlineBusy = false;
        if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
        refreshOffline().then(function (st) {
          if (st.saved >= st.total) setOfflineStatus('Done. You can now use the walkthrough offline.');
          else if (offlineCancel) setOfflineStatus('Paused. Tap "Download the rest" to continue where you stopped.');
          else setOfflineStatus('Stopped (connection problem or full storage). Tap "Download the rest" to try again.');
        });
      }
      function pump() {
        if (offlineCancel || failed >= 6) { if (active === 0) finish(); return; }
        if (idx >= todo.length) { if (active === 0) finish(); return; }
        var url = todo[idx++]; active++;
        fetchWithRetry(url, 2).then(function (resp) {
          return cache.put(new Request(url), resp);
        }).then(function () { done++; }, function () { failed++; }).then(function () {
          active--; progress(); pump();
        });
      }
      progress();
      for (var k = 0; k < 4; k++) pump();
    });
  }

  function fetchWithRetry(url, tries) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    }).catch(function (err) {
      if (tries > 0 && !offlineCancel) return fetchWithRetry(url, tries - 1);
      throw err;
    });
  }

  function removeOffline() {
    if (offlineBusy) return;
    caches.open(PHOTO_CACHE_NAME).then(function (cache) {
      return cache.keys().then(function (keys) {
        return Promise.all(keys.filter(function (r) { return /\/images\/360\//.test(r.url); }).map(function (r) { return cache.delete(r); }));
      });
    }).then(function () { setOfflineStatus('Downloaded photos removed.'); return refreshOffline(); });
  }

  function nextIdx(i) {
    var s = stops[i];
    if (!s || s.end) return -1;
    if (s.next != null && idToIdx[s.next] != null) return idToIdx[s.next];
    if (i >= stops.length - 1) return -1;
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
      if (idToIdx[l.to] != null) out.push({ to: idToIdx[l.to], u: l.u || 0, face: l.face });
    });
    return out;
  }

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
    mesh.renderOrder = 5;
    var pivot = new THREE.Group();
    pivot.position.set(0, -5.5, -11);
    pivot.add(mesh);
    var group = new THREE.Group();
    group.add(pivot);
    return { group: group, mesh: mesh, pivot: pivot };
  }

  var SMALL_DEVICE = (function () {
    try { return matchMedia('(pointer: coarse)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 4); }
    catch (e) { return false; }
  })();
  var TEX_W = SMALL_DEVICE ? 2560 : 3072;
  var MAX_KEEP = SMALL_DEVICE ? 7 : 10;
  var pending = {};

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
      t.flipY = false;
      return t;
    });
  }
  function loaderTex(file) {
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
      if (t && mat && mat.map === t) texOrder.push(f);
      else if (t) { t.dispose(); delete texCache[f]; }
    }
  }
  function preload(i) {
    if (i < 0 || i >= stops.length) return;
    loadTex(stops[i].file).then(function (t) {
      try { if (renderer && renderer.initTexture) renderer.initTexture(t); } catch (e) {}
    }).catch(function () {});
  }

  var WARM_BEHIND = 6, WARM_AHEAD = 40;
  var warmQueue = [], warmSeen = {}, warmActive = 0, warmFails = 0, warmTimer = null;
  function warmRoute() {
    if (!stops.length || !window.fetch || !window.caches) return;
    try { if (navigator.connection && navigator.connection.saveData) return; } catch (e) {}
    var lo = Math.max(0, idx - WARM_BEHIND), hi = Math.min(stops.length - 1, idx + WARM_AHEAD);
    var add = [];
    for (var i = idx; i <= hi; i++) add.push(i);
    for (var j = idx - 1; j >= lo; j--) add.push(j);
    warmQueue = add.map(function (n) { return stops[n].file; }).filter(function (f) { return !warmSeen[f]; });
    if (!warmTimer) warmTimer = setTimeout(warmPump, 800);
  }
  function warmOne(file) {
    caches.match(file).then(function (hit) {
      if (hit) return;
      return fetch(file).then(function (r) { if (!r.ok) throw new Error('http'); return r.arrayBuffer(); });
    }).then(function () { warmFails = 0; }, function () { warmFails++; })
      .then(function () { warmActive--; if (!warmTimer) warmTimer = setTimeout(warmPump, 60); });
  }
  function warmPump() {
    warmTimer = null;
    if (warmFails >= 3) return;
    while (warmActive < 2 && warmQueue.length) {
      if (Object.keys(pending).length) { warmTimer = setTimeout(warmPump, 500); return; }
      var file = warmQueue.shift();
      if (warmSeen[file]) continue;
      warmSeen[file] = true; warmActive++;
      warmOne(file);
    }
  }

  function showStop(i, how, faceU) {
    if (!stops.length) return;
    i = Math.max(0, Math.min(stops.length - 1, i));
    var token = ++loadToken;
    stepBusy = true;
    travelDir = (how === 'back') ? -1 : 1;
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () { fadeEl.classList.add('on'); }, 450);
    loadTex(stops[i].file).then(function (tex) {
      if (token !== loadToken) return;
      mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true;
      idx = i;
      var fy = uToYaw(fwdOf(stops[i]));
      yaw = (how === 'back') ? (stops[i].back != null ? uToYaw(stops[i].back) : fy + Math.PI) : (faceU != null ? uToYaw(faceU + (fwdOf(stops[i]) - (stops[i].fwd || 0))) : fy);
      if (how === 'init') pitch = -0.05;
      if (how === 'tp') pitch = -0.03;
      velYaw = velPitch = 0;
      updateHud(); updateArrows();
      clearTimeout(fadeTimer); fadeEl.classList.remove('on');
      stepBusy = false;
      dirty = true;
      var d = travelDir;
      preload(i + d); preload(i + 2 * d); preload(i + 3 * d); preload(i + 4 * d); preload(i - d);
      linksOf(i).forEach(function (l) { preload(l.to); });
      preload(prevIdx(i));
      warmRoute();
    }).catch(function () {
      if (token !== loadToken) return;
      clearTimeout(fadeTimer); fadeEl.classList.remove('on');
      stepBusy = false; stopHold();
      toast('Could not load this photo (offline and not cached yet?)');
      stopAuto();
    });
  }
  function next() { var n = nextIdx(idx); if (n >= 0) showStop(n, 'fwd'); }
  function prev() { var p = prevIdx(idx); if (p >= 0) showStop(p, (p === idx - 1 || (stops[p].next != null && idToIdx[stops[p].next] === idx)) ? 'back' : 'jump'); }

  var hudDetail = false;
  /* The "Stop N / total" counter is a developer tool (it shows which stop has a wrong arrow).
     It is hidden for normal users. Open the app once with ?hud=1 to show it on that device,
     and ?hud=0 to hide it again. */
  function hudEnabled() {
    try {
      var q = /[?&]hud=([01])/.exec(window.location.search);
      if (q) { if (q[1] === '1') localStorage.setItem('prmsuDevHud', '1'); else localStorage.removeItem('prmsuDevHud'); }
      return localStorage.getItem('prmsuDevHud') === '1';
    } catch (e) { return false; }
  }
  function updateHud() {
    var el = document.getElementById('tour-hud');
    if (!el || !stops.length) return;
    if (!hudEnabled()) { el.style.display = 'none'; return; }
    el.style.display = '';
    var s = stops[idx];
    var line = 'Stop ' + (idx + 1) + ' / ' + stops.length;
    if (hudDetail) {
      var f = String(s.file || '').replace(/^images\/360\//, '');
      line += '<small>' + f + '<br>fwd ' + (s.fwd != null ? s.fwd : 0) + (fwdOf(s) !== (s.fwd || 0) ? ' (+' + Math.round((fwdOf(s) - (s.fwd || 0)) * 1000) / 1000 + ' offset)' : '') + (s.title ? ' · ' + s.title : '') + (s.aim != null ? ' · aim ' + s.aim : '') + '</small>';
    }
    el.innerHTML = line;
    el.classList.toggle('tour-hud-open', hudDetail);
  }
  function updateArrows() {
    var s = stops[idx], fy = uToYaw(fwdOf(s));
    var hasNext = nextIdx(idx) >= 0, hasPrev = prevIdx(idx) >= 0;
    arrowFwd.group.rotation.y  = -fy;
    arrowFwd.pivot.position.z = -(s.fdist || 11);
    arrowFwd.pivot.rotation.y = (s.aim != null) ? -(uToYaw(s.aim + (fwdOf(s) - (s.fwd || 0))) - fy) : 0;
    arrowBack.group.rotation.y = -(s.back != null ? uToYaw(s.back) : fy + Math.PI);
    arrowFwd.group.visible  = hasNext;
    arrowBack.group.visible = hasPrev && !s.noback;
    var links = linksOf(idx);
    while (linkArrows.length < links.length) { var a = makeArrow(1.0); linkArrows.push(a); scene.add(a.group); }
    linkArrows.forEach(function (a, k) {
      var l = links[k];
      a.group.visible = !!l;
      if (l) { a.group.rotation.y = -uToYaw(l.u); a.target = l.to; a.face = l.face; }
    });
  }

  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }

  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('tour-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('tour-show'); }, 3200);
  }

  function bindEvents() {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); setFov(fov + e.deltaY * 0.04); }, { passive: false });
    btnBack.addEventListener('click', function () { stopAuto(); if (typeof goBack === 'function') goBack(); else if (typeof goTo === 'function') goTo('main'); });
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  }
  function onDown(e) {
    closePlaces();
    if (offlineEl && !offlineBusy && offlineEl.classList.contains('open')) closeOffline();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var n = Object.keys(pointers).length;
    if (n === 1) { downX = e.clientX; downY = e.clientY; downTime = Date.now(); dragMoved = 0; velYaw = velPitch = 0; startHoldIfArrow(e.clientX, e.clientY); }
    else stopHold();
    if (n === 2) lastPinch = pinchDist();
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
    var sens = 1.5 * (fov * Math.PI / 180) / Math.max(200, stage.clientHeight);
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
            for (var k = 0; k < linkArrows.length; k++) if (linkArrows[k].mesh === hit.object) { showStop(linkArrows[k].target, 'fwd', linkArrows[k].face); return; }
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
      for (var k = 0; k < linkArrows.length; k++) if (linkArrows[k].mesh === hit.object) { showStop(linkArrows[k].target, 'fwd', linkArrows[k].face); break; }
    }
  }

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

  window.CampusWalkthrough = {
    onEnter: tourEnter,
    onLeave: tourLeave
  };
})();
