(function () {
  var SHEET = 'sprites/sprites_navmap/16x32%20Walk-Sheet.png';
  var CELL = 32, COLS = 4;
  var VOX = 0.6;
  var DEPTH = 5;
  var WALK_FPS = 7;
  var MOVE_START = 2.0, MOVE_STOP = 0.6;
  var SHADE = { front: 1, back: 0.8, side: 0.72, top: 0.95, bottom: 0.55 };

  var pix = null, loading = false, waiting = [];
  var geoCache = {};
  var _dir = null;

  var API = { ready: false };

  function loadSheet(cb) {
    if (pix) { cb(); return; }
    waiting.push(cb);
    if (loading) return;
    loading = true;
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        pix = ctx.getImageData(0, 0, c.width, c.height);
        API.ready = true;
        var w = waiting; waiting = [];
        w.forEach(function (f) { f(); });
      } catch (e) { console.warn('[gpschar] cannot read sprite sheet', e); }
    };
    img.onerror = function () { console.warn('[gpschar] sprite sheet not found:', SHEET); };
    img.src = SHEET;
  }

  function px(x, y) {
    var i = (y * pix.width + x) * 4, d = pix.data;
    return d[i + 3] > 128 ? [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255] : null;
  }

  function buildGeometry(row, col) {
    var key = row * COLS + col;
    if (geoCache[key]) return geoCache[key];
    var ox = col * CELL, oy = row * CELL;
    var solid = [];
    var x, y;
    for (y = 0; y < CELL; y++) {
      solid.push([]);
      for (x = 0; x < CELL; x++) solid[y].push(px(ox + x, oy + y));
    }
    function has(xx, yy) { return xx >= 0 && xx < CELL && yy >= 0 && yy < CELL && solid[yy][xx]; }

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
    geoCache[key] = g;
    return g;
  }

  API.create = function () {
    var group = new THREE.Group();
    var fallback = new THREE.Mesh(
      new THREE.SphereGeometry(4, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xe74c3c })
    );
    fallback.position.y = 4;
    group.add(fallback);

    var mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    var body = new THREE.Mesh(buildEmpty(), mat);
    body.visible = false;
    group.add(body);

    group.userData.gpsChar = { body: body, fallback: fallback, row: 0, flip: false, moving: false, t: 0, last: 0 };
    loadSheet(function () {
      body.geometry = buildGeometry(0, 0);
      body.visible = true;
      fallback.visible = false;
    });
    return group;
  };

  function buildEmpty() { return new THREE.BufferGeometry(); }

  API.update = function (group, dx, dz, dist) {
    var s = group.userData.gpsChar;
    if (!s || !pix || !s.body.visible || typeof camera === 'undefined' || !camera) return;
    var now = performance.now();
    var dt = s.last ? Math.min(0.1, (now - s.last) / 1000) : 0;
    s.last = now;

    if (!_dir) _dir = new THREE.Vector3();
    camera.getWorldDirection(_dir);
    var fl = Math.hypot(_dir.x, _dir.z) || 1;
    var fx = _dir.x / fl, fz = _dir.z / fl;
    s.body.rotation.order = 'YXZ';
    s.body.rotation.y = Math.atan2(-_dir.x, -_dir.z);
    var elev = Math.asin(Math.max(-1, Math.min(1, -_dir.y))) * 180 / Math.PI;
    s.body.rotation.x = -Math.max(0, elev * 0.8) * Math.PI / 180;
    s.body.scale.z = 0.6;

    if (!s.moving && dist > MOVE_START) s.moving = true;
    else if (s.moving && dist < MOVE_STOP) s.moving = false;

    if (s.moving) {
      var sx = dx * (-fz) + dz * fx;
      var sy = dx * fx + dz * fz;
      var a = Math.atan2(Math.abs(sx), -sy) * 180 / Math.PI;
      s.row = a < 22.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : a < 157.5 ? 3 : 4;
      s.flip = sx < 0;
      s.t += dt;
    } else {
      s.t = 0;
    }
    var col = s.moving ? Math.floor(s.t * WALK_FPS) % COLS : 0;
    s.body.geometry = buildGeometry(s.row, col);
    s.body.scale.x = s.flip ? -1 : 1;
  };

  window.GPSChar = API;
})();
