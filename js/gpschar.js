(function () {
  'use strict';

  var NAMES = ['Princess', 'Jonathan', 'Shane'];
  var SHEET_DIR = 'sprites/sprites_navmap/';
  var TEMPLATE = SHEET_DIR + 'Shane.png';
  var BAG_KEY = 'navmapCharBag';
  var PICK_KEY = 'navmapCharPick';
  var CELL = 32, COLS = 4, ROWS = 5;
  var VOX = 0.42;
  var DEPTH = 5;
  var Z_SQUASH = 0.6;
  var FOOT_Y = -3.8;
  var SHADE = { front: 1, back: 0.8, side: 0.72, top: 0.95, bottom: 0.55 };

  var MOVE_START = 0.6, MOVE_STOP = 0.25;
  var VEL_SMOOTH = 3;
  var MAX_SAMPLE_DT = 0.25;
  var MAX_SPEED = 40;
  var ROW_DWELL = 0.25;
  var FPS_MIN = 3.5, FPS_MAX = 10, FPS_PER_SPEED = 5;

  var sheets = {};
  var instances = [];
  var memState = null;
  var memPick = null;
  var _dir = null;

  var API = { ready: false, current: null, names: NAMES.slice() };

  function sheetFor(key, url) {
    if (!sheets[key]) sheets[key] = { url: url, pix: null, status: 'idle', waiting: [], geo: {} };
    return sheets[key];
  }

  function fetchSheet(rec, done) {
    var img = new Image();
    img.onload = function () {
      try {
        if (img.width < COLS * CELL || img.height < ROWS * CELL) { done(null, 'smaller than ' + COLS * CELL + 'x' + ROWS * CELL); return; }
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        done(ctx.getImageData(0, 0, c.width, c.height));
      } catch (e) { done(null, 'cannot read it (' + e + ')'); }
    };
    img.onerror = function () { done(null, 'not found'); };
    img.src = rec.url;
  }

  function ensureSheet(rec, cb, isTemplate) {
    if (rec.status === 'ok') { cb(true); return; }
    if (rec.status === 'failed') { cb(false); return; }
    rec.waiting.push(cb);
    if (rec.status === 'loading') return;
    rec.status = 'loading';
    function finish(ok) {
      rec.status = ok ? 'ok' : 'failed';
      var w = rec.waiting; rec.waiting = [];
      w.forEach(function (f) { try { f(ok); } catch (e) { console.warn('[gpschar]', e); } });
    }
    fetchSheet(rec, function (pix, why) {
      if (pix) { rec.pix = pix; finish(true); return; }
      console.warn('[gpschar] sprite sheet ' + rec.url + ': ' + why);
      if (isTemplate) { finish(false); return; }
      var tpl = sheetFor('__template', TEMPLATE);
      ensureSheet(tpl, function (ok) {
        if (ok) rec.pix = tpl.pix;
        finish(ok);
      }, true);
    });
  }

  function px(pix, x, y) {
    if (x < 0 || y < 0 || x >= pix.width || y >= pix.height) return null;
    var i = (y * pix.width + x) * 4, d = pix.data;
    return d[i + 3] > 128 ? [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255] : null;
  }

  function buildGeometry(rec, row, col) {
    var key = row * COLS + col;
    if (rec.geo[key]) return rec.geo[key];
    var pix = rec.pix;
    var ox = col * CELL, oy = row * CELL;
    var solid = [];
    var x, y;
    for (y = 0; y < CELL; y++) {
      solid.push([]);
      for (x = 0; x < CELL; x++) solid[y].push(px(pix, ox + x, oy + y));
    }
    function has(xx, yy) { return xx >= 0 && xx < CELL && yy >= 0 && yy < CELL && !!solid[yy][xx]; }

    var pos = [], col3 = [];
    function quad(a, b, c, d, rgb, s) {
      var r = rgb[0] * s, g = rgb[1] * s, bl = rgb[2] * s, i;
      var v = [a, b, c, a, c, d];
      for (i = 0; i < 6; i++) { pos.push(v[i][0], v[i][1], v[i][2]); col3.push(r, g, bl); }
    }
    var z0 = -DEPTH / 2 * VOX, z1 = DEPTH / 2 * VOX;
    for (y = 0; y < CELL; y++) {
      for (x = 0; x < CELL; x++) {
        var c = solid[y][x];
        if (!c) continue;
        var x0 = (x - CELL / 2) * VOX, x1 = x0 + VOX;
        var yTop = (CELL - y) * VOX, yBot = yTop - VOX;
        quad([x0, yBot, z1], [x1, yBot, z1], [x1, yTop, z1], [x0, yTop, z1], c, SHADE.front);
        quad([x1, yBot, z0], [x0, yBot, z0], [x0, yTop, z0], [x1, yTop, z0], c, SHADE.back);
        if (!has(x + 1, y)) quad([x1, yBot, z1], [x1, yBot, z0], [x1, yTop, z0], [x1, yTop, z1], c, SHADE.side);
        if (!has(x - 1, y)) quad([x0, yBot, z0], [x0, yBot, z1], [x0, yTop, z1], [x0, yTop, z0], c, SHADE.side);
        if (!has(x, y - 1)) quad([x0, yTop, z1], [x1, yTop, z1], [x1, yTop, z0], [x0, yTop, z0], c, SHADE.top);
        if (!has(x, y + 1)) quad([x0, yBot, z0], [x1, yBot, z0], [x1, yBot, z1], [x0, yBot, z1], c, SHADE.bottom);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col3, 3));
    rec.geo[key] = g;
    return g;
  }

  function useFallback(s, why, e) {
    if (s.failed) return;
    s.failed = true;
    API.ready = false;
    s.body.visible = false;
    s.fallback.visible = true;
    console.warn('[gpschar] ' + why, e || '');
  }

  function applyChar(s, name) {
    s.name = name;
    var rec = sheetFor(name, SHEET_DIR + name + '.png');
    ensureSheet(rec, function (ok) {
      if (s.name !== name || s.failed) return;
      if (!ok) { useFallback(s, 'no usable sprite sheet for ' + name + ', using the dot instead'); return; }
      var g = buildGeometry(rec, 0, 0);
      if (!g.attributes.position || g.attributes.position.count === 0) {
        useFallback(s, 'first sprite frame of ' + name + ' is empty, using the dot instead');
        return;
      }
      s.rec = rec;
      s.body.geometry = g;
      s.body.visible = true;
      s.fallback.visible = false;
      API.ready = true;
    });
  }

  function readBag() {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(BAG_KEY)); } catch (e) { o = memState; }
    if (!o) o = memState;
    var ok = o && Array.isArray(o.bag) && o.bag.length <= NAMES.length &&
      o.bag.every(function (n, i) { return NAMES.indexOf(n) >= 0 && o.bag.indexOf(n) === i; }) &&
      (o.last == null || NAMES.indexOf(o.last) >= 0);
    if (ok) return { bag: o.bag.slice(), last: o.last || null };
    return { bag: [], last: (o && NAMES.indexOf(o.last) >= 0) ? o.last : null };
  }

  function writeBag(st) {
    memState = st;
    try { localStorage.setItem(BAG_KEY, JSON.stringify(st)); } catch (e) {}
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pickNext(avoid) {
    var st = readBag();
    if (!st.bag.length) {
      var b = shuffle(NAMES.slice());
      if (st.last && b.length > 1 && b[0] === st.last) {
        var k = 1 + Math.floor(Math.random() * (b.length - 1));
        var t = b[0]; b[0] = b[k]; b[k] = t;
      }
      st.bag = b;
    }
    if (avoid && st.bag.length > 1 && st.bag[0] === avoid) {
      var k2 = 1 + Math.floor(Math.random() * (st.bag.length - 1));
      var t2 = st.bag[0]; st.bag[0] = st.bag[k2]; st.bag[k2] = t2;
    }
    var name = st.bag.shift();
    st.last = name;
    writeBag(st);
    return name;
  }

  function readPick() {
    var v = null;
    try { v = localStorage.getItem(PICK_KEY); } catch (e) { v = memPick; }
    if (v == null) v = memPick;
    return NAMES.indexOf(v) >= 0 ? v : null;
  }

  function writePick(v) {
    memPick = v;
    try {
      if (v) localStorage.setItem(PICK_KEY, v);
      else localStorage.removeItem(PICK_KEY);
    } catch (e) {}
  }

  function randomName() { return NAMES[Math.floor(Math.random() * NAMES.length)]; }

  function setCurrent(name) {
    API.current = name;
    instances.forEach(function (s) { applyChar(s, name); });
  }

  API.advance = function () {
    var name = readPick();
    if (!name) {
      try { name = pickNext(); } catch (e) { name = randomName(); }
    }
    setCurrent(name);
    try { document.dispatchEvent(new CustomEvent('navmapchar', { detail: { name: name } })); } catch (e) {}
    return name;
  };

  API.select = function (choice) {
    if (NAMES.indexOf(choice) >= 0) {
      writePick(choice);
      setCurrent(choice);
      return choice;
    }
    writePick(null);
    var name;
    try { name = pickNext(API.current); } catch (e) { name = randomName(); }
    setCurrent(name);
    return name;
  };

  API.getChoice = function () { return readPick() || 'random'; };

  API.drawPortrait = function (name, canvas, done) {
    function end(ok) { try { if (done) done(ok); } catch (e) {} }
    if (NAMES.indexOf(name) < 0 || !canvas) { end(false); return; }
    ensureSheet(sheetFor(name, SHEET_DIR + name + '.png'), function (ok) {
      var rec = sheets[name];
      if (!ok || !rec || !rec.pix) { end(false); return; }
      try {
        var pix = rec.pix, minX = CELL, minY = CELL, maxX = -1, maxY = -1, x, y;
        for (y = 0; y < CELL; y++) {
          for (x = 0; x < CELL; x++) {
            if (pix.data[(y * pix.width + x) * 4 + 3] > 128) {
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) { end(false); return; }
        var w = maxX - minX + 1, h = maxY - minY + 1;
        var tmp = document.createElement('canvas');
        tmp.width = w; tmp.height = h;
        var tc = tmp.getContext('2d'), id = tc.createImageData(w, h);
        for (y = 0; y < h; y++) {
          for (x = 0; x < w; x++) {
            var si = ((minY + y) * pix.width + (minX + x)) * 4, di = (y * w + x) * 4;
            id.data[di] = pix.data[si]; id.data[di + 1] = pix.data[si + 1];
            id.data[di + 2] = pix.data[si + 2]; id.data[di + 3] = pix.data[si + 3];
          }
        }
        tc.putImageData(id, 0, 0);
        var k = Math.max(1, Math.floor(Math.min(canvas.width / w, canvas.height / h)));
        var cx = canvas.getContext('2d');
        cx.clearRect(0, 0, canvas.width, canvas.height);
        cx.imageSmoothingEnabled = false;
        cx.drawImage(tmp, Math.floor((canvas.width - w * k) / 2), Math.floor((canvas.height - h * k) / 2), w * k, h * k);
        end(true);
      } catch (e) { end(false); }
    });
  };

  API.create = function () {
    var group = new THREE.Group();
    var fallback = new THREE.Mesh(
      new THREE.SphereGeometry(4, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xe74c3c })
    );
    fallback.position.y = 4;
    group.add(fallback);

    var mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    var body = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    body.position.y = FOOT_Y;
    body.visible = false;
    group.add(body);

    var s = {
      body: body, fallback: fallback, failed: false, name: null, rec: null,
      row: 0, flip: false, hasRow: false, rowT: 0,
      moving: false, phase: 0,
      last: 0, px: 0, pz: 0, vx: 0, vz: 0
    };
    group.userData.gpsChar = s;
    instances.push(s);
    if (!API.current) API.advance();
    else applyChar(s, API.current);
    return group;
  };

  API.update = function (group) {
    var s = group && group.userData && group.userData.gpsChar;
    if (!s || s.failed || !s.rec || !s.body.visible) return;
    if (typeof camera === 'undefined' || !camera) return;
    try {
      var now = performance.now();
      var rawDt = s.last ? (now - s.last) / 1000 : 0;
      s.last = now;
      var mx = group.position.x, mz = group.position.z;
      var dt = 0;

      if (!(rawDt > 0) || rawDt > MAX_SAMPLE_DT) {
        s.px = mx; s.pz = mz;
        if (rawDt > MAX_SAMPLE_DT) { s.vx = 0; s.vz = 0; s.moving = false; s.phase = 0; }
      } else {
        dt = rawDt;
        var vx = (mx - s.px) / dt, vz = (mz - s.pz) / dt;
        s.px = mx; s.pz = mz;
        if (!isFinite(vx) || !isFinite(vz) || Math.hypot(vx, vz) > MAX_SPEED) { vx = 0; vz = 0; }
        var a = Math.min(1, dt * VEL_SMOOTH);
        s.vx += (vx - s.vx) * a;
        s.vz += (vz - s.vz) * a;
      }
      var speed = Math.hypot(s.vx, s.vz);

      if (!_dir) _dir = new THREE.Vector3();
      camera.getWorldDirection(_dir);
      var fl = Math.hypot(_dir.x, _dir.z) || 1;
      var fx = _dir.x / fl, fz = _dir.z / fl;
      s.body.rotation.order = 'YXZ';
      s.body.rotation.y = Math.atan2(-_dir.x, -_dir.z);
      var elev = Math.asin(Math.max(-1, Math.min(1, -_dir.y))) * 180 / Math.PI;
      s.body.rotation.x = -Math.max(0, elev * 0.8) * Math.PI / 180;

      if (!s.moving && speed > MOVE_START) s.moving = true;
      else if (s.moving && speed < MOVE_STOP) s.moving = false;

      if (s.moving) {
        var sx = s.vx * (-fz) + s.vz * fx;
        var sy = s.vx * fx + s.vz * fz;
        var ang = Math.atan2(Math.abs(sx), -sy) * 180 / Math.PI;
        var row = ang < 22.5 ? 0 : ang < 67.5 ? 1 : ang < 112.5 ? 2 : ang < 157.5 ? 3 : 4;
        var flip = sx < 0;
        if (!s.hasRow) {
          s.row = row; s.flip = flip; s.hasRow = true; s.rowT = now;
        } else if ((row !== s.row || flip !== s.flip) && (now - s.rowT) / 1000 >= ROW_DWELL) {
          s.row = row; s.flip = flip; s.rowT = now;
        }
        var fps = Math.max(FPS_MIN, Math.min(FPS_MAX, speed * FPS_PER_SPEED));
        s.phase += fps * dt;
      } else {
        s.phase = 0;
      }

      var col = Math.floor(s.phase) % COLS;
      s.body.geometry = buildGeometry(s.rec, s.row, col);
      s.body.scale.set(s.flip ? -1 : 1, 1, Z_SQUASH);
    } catch (e) {
      useFallback(s, 'runtime error, using the dot instead', e);
    }
  };


  function hookNavmapOpen() {
    try {
      if (typeof window.goTo === 'function' && !window.goTo.__navmapChar) {
        var orig = window.goTo;
        var wrapped = function (p) {
          var before = (typeof current !== 'undefined') ? current : null;
          var r = orig.apply(this, arguments);
          try { if (p === 'map' && before !== 'map') API.advance(); } catch (e) { console.warn('[gpschar]', e); }
          return r;
        };
        wrapped.__navmapChar = true;
        window.goTo = wrapped;
      }
      var pg = document.getElementById('page-map');
      if (pg && pg.classList.contains('active')) API.advance();
    } catch (e) {
      console.warn('[gpschar] could not hook the Navmap page', e);
    }
  }

  window.GPSChar = API;
  hookNavmapOpen();
})();
