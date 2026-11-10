(function () {
  'use strict';

  var EYE_HEIGHT   = 5;
  var FOV_FP       = 72;
  var AUTO_TURN    = 1.5;
  var LOOK_SPEED   = 2;
  var WALK_SPEED   = 25;
  var HALF_WIDTH   = 1;
  var LABEL_RANGE_FP = 170;
  var CELL         = 0.5;
  var BAND_BOT     = 0.35;
  var BAND_TOP     = 2.0;
  var PLAYER_R     = 0.6;
  var SKY          = 0xa9d4f0;
  var GROUND       = 0x7cb87a;

  var NavFP = {
    active: false,
    onCampusLoaded: onCampusLoaded,
    toggle: toggle, enter: enter, exit: exit,
    pointerDown: pointerDown, pointerMove: pointerMove, pointerUp: pointerUp,
    frame: frame,
    _collision: function () {
      return { stats: bakeStats, pending: jobs.length, owners: owners.slice(), solidAt: solidAt, blockedRing: blockedRing,
               solidCells: (function () { var n = 0; if (grid) for (var i = 0; i < grid.length; i++) if (grid[i]) n++; return n; })() };
    },
    toggleTeleport: function () { toggleTeleport(); },
    closeTeleport: function () { setTeleport(false); },
    openSearch: function () { setSearch(true); },
    closeSearch: function () { setSearch(false); },
    teleportTo: function (id) { return teleportTo(id); },
    _state: function () { return { x: pos.x, z: pos.z, yaw: yaw, pitch: pitch }; },
    _set: function (x, z, y, p) { pos.x = x; pos.z = z; yaw = y; pitch = p; }
  };
  window.NavFP = NavFP;

  var segs = [];
  var pos = { x: 0, z: 0 }, yaw = 0, pitch = -0.04;
  var saved = null;
  var lastT = 0;
  var joy = { id: null, x: 0, y: 0 };
  var look = { id: null, x: 0, y: 0 };
  var labels = [];

  function onCampusLoaded(data) {
    segs = [];
    var seen = {};
    Object.keys(waypointMap).forEach(function (id) {
      var wp = waypointMap[id];
      wp.neighbors.forEach(function (nid) {
        var k = [id, nid].sort().join('|');
        if (seen[k]) return; seen[k] = true;
        var nb = waypointMap[nid]; if (!nb) return;
        segs.push([wp.position.x, wp.position.z, nb.position.x, nb.position.z]);
      });
    });
    buildLabels(data.buildings || []);
    resetCollision(data);
    wireUi();
  }

  var CAT_COLOR = { academic: '#2f6fb5', facility: '#d49a12', court: '#6d7480', housing: '#2a9d8f' };
  var CAT_PRIO  = { academic: 0, facility: 1, court: 2, housing: 4 };

  function buildLabels(buildings) {
    labels.forEach(function (l) { scene.remove(l.sprite); });
    labels = [];
    buildings.forEach(function (b) {
      if (b.labelHidden) return;
      var off = b.labelOffset || {};
      var text = (b.labelText && String(b.labelText).trim()) || b.name || b.label || b.id;
      var color = CAT_COLOR[b.category] || '#6d7480';
      var made = makeTag(text, color);
      var mat = new THREE.SpriteMaterial({ map: made.tex, transparent: true, depthTest: false, depthWrite: false });
      var sp = new THREE.Sprite(mat);
      sp.center.set(0.5, 0);
      sp.renderOrder = 20;
      sp.userData.isNameTag = true;
      scene.add(sp);
      labels.push({
        sprite: sp, lw: made.lw, lh: made.lh,
        x: b.position.x + (+off.x || 0), z: b.position.z + (+off.z || 0),
        y: ((b.size && b.size.height) || 8) + 1.5 + (+off.y || 0),
        prio: CAT_PRIO[b.category] !== undefined ? CAT_PRIO[b.category] : 3
      });
    });
  }

  function makeTag(text, accent) {
    var S = 2, fs = 12, lineH = 15, padX = 9, padY = 5, maxW = 130;
    var font = '600 ' + fs + 'px "DM Sans", system-ui, sans-serif';
    var meas = document.createElement('canvas').getContext('2d');
    meas.font = font;
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (meas.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    var tw = 0; lines.forEach(function (l) { tw = Math.max(tw, meas.measureText(l).width); });
    var lw = Math.ceil(tw + padX * 2), lh = lines.length * lineH + padY * 2 + 6;
    var c = document.createElement('canvas');
    c.width = lw * S; c.height = lh * S;
    var g = c.getContext('2d');
    g.scale(S, S);
    var bodyH = lh - 6;
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
    roundRect(g, 0.5, 0.5, lw - 1, bodyH - 1, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(lw / 2 - 5, bodyH - 0.5); g.lineTo(lw / 2, lh - 0.5); g.lineTo(lw / 2 + 5, bodyH - 0.5); g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.fill();
    g.font = font; g.fillStyle = '#2b1a1a'; g.textBaseline = 'middle'; g.textAlign = 'left';
    lines.forEach(function (l, i) { g.fillText(l, padX, padY + lineH * i + lineH / 2 + 1); });
    var tex = new THREE.CanvasTexture(c);
    tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    return { tex: tex, lw: lw, lh: lh };
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }

  var _v = null;
  function layoutLabels() {
    if (!labels.length || !camera || !renderer) return;
    if (!_v) _v = new THREE.Vector3();
    var el = renderer.domElement;
    var W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    camera.updateMatrixWorld();
    var tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    var fp = NavFP.active;

    var items = [];
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i];
      _v.set(L.x, L.y, L.z).applyMatrix4(camera.matrixWorldInverse);
      var depth = -_v.z;
      if (depth < 0.5 || (fp && depth > LABEL_RANGE_FP)) { L.sprite.visible = false; continue; }
      var wH = L.lh * (2 * depth * tanHalf) / H;
      _v.set(L.x, L.y, L.z).project(camera);
      var sx = (_v.x + 1) / 2 * W, sy = (1 - _v.y) / 2 * H;
      if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + 80) { L.sprite.visible = false; continue; }
      items.push({ L: L, sx: sx, sy: sy, depth: depth, wH: wH });
    }
    items.sort(function (a, b) { return a.L.prio - b.L.prio || a.depth - b.depth; });
    var placed = [];
    items.forEach(function (it) {
      var L = it.L;
      var x0 = it.sx - L.lw / 2 - 2, x1 = it.sx + L.lw / 2 + 2, y0 = it.sy - L.lh - 2, y1 = it.sy + 2;
      var hit = false;
      for (var k = 0; k < placed.length; k++) {
        var p = placed[k];
        if (x0 < p[2] && x1 > p[0] && y0 < p[3] && y1 > p[1]) { hit = true; break; }
      }
      if (hit) { L.sprite.visible = false; return; }
      placed.push([x0, y0, x1, y1]);
      L.sprite.visible = true;
      L.sprite.scale.set(it.wH * L.lw / L.lh, it.wH, 1);
      L.sprite.position.set(L.x, L.y, L.z);
    });
  }


  var grid = null, gx0 = 0, gz0 = 0, gw = 0, gh = 0;
  var owners = [];
  var queued = {};
  var jobs = [];
  var scanTick = 0;
  var bakeStats = { tris: 0, ms: 0, models: 0 };

  function resetCollision(data) {
    var b = (data && data.bounds) || { minX: -20, maxX: 1200, minZ: -600, maxZ: 130 };
    var m = 12;
    gx0 = b.minX - m; gz0 = b.minZ - m;
    gw = Math.ceil((b.maxX - b.minX + 2 * m) / CELL);
    gh = Math.ceil((b.maxZ - b.minZ + 2 * m) / CELL);
    grid = new Uint8Array(gw * gh);
    owners = []; queued = {}; jobs = [];
    bakeStats = { tris: 0, ms: 0, models: 0 };
  }

  function scanForNewModels() {
    if (typeof buildingMeshes === 'undefined' || !grid) return;
    for (var i = 0; i < buildingMeshes.length; i++) {
      var bm = buildingMeshes[i], obj = bm.mesh;
      if (!obj || queued[obj.uuid]) continue;
      queued[obj.uuid] = true;
      var d = bm.data || {};
      if (d.noCollision) continue;
      obj.updateMatrixWorld(true);
      var meshes = [];
      obj.traverse(function (c) { if (c.isMesh && c.geometry && c.geometry.attributes.position && !c.userData.isNameTag) meshes.push(c); });
      var oi = owners.indexOf(d.id); if (oi < 0) { owners.push(d.id); oi = owners.length - 1; }
      jobs.push({ obj: obj, meshes: meshes, mi: 0, ti: 0, verts: null, owner: (oi % 250) + 1 });
    }
  }

  function mark(x, z, owner) {
    var ix = Math.floor((x - gx0) / CELL), iz = Math.floor((z - gz0) / CELL);
    if (ix >= 0 && ix < gw && iz >= 0 && iz < gh) grid[iz * gw + ix] = owner;
  }
  function markLine(x0, z0, x1, z1, owner) {
    var len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / (CELL * 0.5)));
    for (var i = 0; i <= n; i++) { var t = i / n; mark(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, owner); }
  }
  function markTri(ax, az, bx, bz, cx, cz, owner) {
    var minx = Math.min(ax, bx, cx), maxx = Math.max(ax, bx, cx), minz = Math.min(az, bz, cz), maxz = Math.max(az, bz, cz);
    var ix0 = Math.max(0, Math.floor((minx - gx0) / CELL)), ix1 = Math.min(gw - 1, Math.floor((maxx - gx0) / CELL));
    var iz0 = Math.max(0, Math.floor((minz - gz0) / CELL)), iz1 = Math.min(gh - 1, Math.floor((maxz - gz0) / CELL));
    var den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(den) < 1e-9) return;
    for (var iz = iz0; iz <= iz1; iz++) {
      var pz = gz0 + (iz + 0.5) * CELL;
      for (var ix = ix0; ix <= ix1; ix++) {
        var px = gx0 + (ix + 0.5) * CELL;
        var w1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den;
        var w2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den;
        if (w1 >= 0 && w2 >= 0 && w1 + w2 <= 1) grid[iz * gw + ix] = owner;
      }
    }
  }
  function clipY(poly, level, keep) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var da = (a[1] - level) * keep, db = (b[1] - level) * keep;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) {
        var t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, level, a[2] + (b[2] - a[2]) * t]);
      }
    }
    return out;
  }
  function bakeTri(v, o, owner) {
    var ay = v[o + 1], by = v[o + 4], cy = v[o + 7];
    if (Math.min(ay, by, cy) >= BAND_TOP || Math.max(ay, by, cy) <= BAND_BOT) return;
    var ux = v[o + 3] - v[o], uy = by - ay, uz = v[o + 5] - v[o + 2];
    var wx = v[o + 6] - v[o], wy = cy - ay, wz = v[o + 8] - v[o + 2];
    var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nl < 1e-12 || Math.abs(ny) / nl > 0.8) return;
    var poly = [[v[o], ay, v[o + 2]], [v[o + 3], by, v[o + 5]], [v[o + 6], cy, v[o + 8]]];
    poly = clipY(poly, BAND_BOT, 1);
    if (poly.length) poly = clipY(poly, BAND_TOP, -1);
    if (poly.length < 2) return;
    var area = 0;
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length];
      markLine(p[0], p[2], q[0], q[2], owner);
      area += p[0] * q[2] - q[0] * p[2];
    }
    if (poly.length >= 3 && Math.abs(area) * 0.5 > CELL * CELL * 0.5) {
      for (var k = 1; k < poly.length - 1; k++) markTri(poly[0][0], poly[0][2], poly[k][0], poly[k][2], poly[k + 1][0], poly[k + 1][2], owner);
    }
  }


  function fillInterior(obj, owner) {
    if (!grid) return;
    var box = new THREE.Box3().setFromObject(obj);
    var ix0 = Math.max(0, Math.floor((box.min.x - gx0) / CELL) - 3), ix1 = Math.min(gw - 1, Math.floor((box.max.x - gx0) / CELL) + 3);
    var iz0 = Math.max(0, Math.floor((box.min.z - gz0) / CELL) - 3), iz1 = Math.min(gh - 1, Math.floor((box.max.z - gz0) / CELL) + 3);
    var W = ix1 - ix0 + 1, H = iz1 - iz0 + 1;
    if (W < 3 || H < 3 || W * H > 600000) return;
    var solid = new Uint8Array(W * H), wall = new Uint8Array(W * H), seen = new Uint8Array(W * H);
    var x, z, i, dx, dz;
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) if (grid[(iz0 + z) * gw + (ix0 + x)]) solid[z * W + x] = 1;
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) if (solid[z * W + x]) {
      for (dz = -1; dz <= 1; dz++) for (dx = -1; dx <= 1; dx++) {
        var nx = x + dx, nz = z + dz;
        if (nx >= 0 && nx < W && nz >= 0 && nz < H) wall[nz * W + nx] = 1;
      }
    }
    var stack = [];
    function push(px, pz) { var k = pz * W + px; if (!wall[k] && !seen[k]) { seen[k] = 1; stack.push(k); } }
    for (x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (z = 0; z < H; z++) { push(0, z); push(W - 1, z); }
    while (stack.length) {
      var k = stack.pop(), px = k % W, pz = (k - px) / W;
      if (px > 0) push(px - 1, pz); if (px < W - 1) push(px + 1, pz);
      if (pz > 0) push(px, pz - 1); if (pz < H - 1) push(px, pz + 1);
    }
    var added = 0;
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      i = z * W + x;
      if (seen[i] || solid[i]) continue;
      var touchesOutside = false;
      for (dz = -1; dz <= 1 && !touchesOutside; dz++) for (dx = -1; dx <= 1; dx++) {
        var qx = x + dx, qz = z + dz;
        if (qx >= 0 && qx < W && qz >= 0 && qz < H && seen[qz * W + qx]) { touchesOutside = true; break; }
      }
      if (touchesOutside) continue;
      var gi = (iz0 + z) * gw + (ix0 + x);
      if (!grid[gi]) { grid[gi] = owner; added++; }
    }
    bakeStats.filled = (bakeStats.filled || 0) + added;
  }

  function pumpBake(budgetMs) {
    var t0 = performance.now();
    while (jobs.length) {
      var j = jobs[0];
      if (j.mi >= j.meshes.length) { fillInterior(j.obj, j.owner); jobs.shift(); bakeStats.models++; carveDirty = true; continue; }
      var mesh = j.meshes[j.mi], g = mesh.geometry;
      if (!j.verts) {
        var pos = g.attributes.position, n = pos.count, m = mesh.matrixWorld.elements;
        var vs = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) {
          var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          vs[i * 3]     = m[0] * x + m[4] * y + m[8]  * z + m[12];
          vs[i * 3 + 1] = m[1] * x + m[5] * y + m[9]  * z + m[13];
          vs[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        }
        j.verts = vs; j.ti = 0;
        j.tris = g.index ? g.index.count / 3 : n / 3;
      }
      var vs2 = j.verts, idx = g.index, tmp = new Float32Array(9);
      while (j.ti < j.tris) {
        for (var c = 0; c < 3; c++) {
          var vi = idx ? idx.getX(j.ti * 3 + c) : j.ti * 3 + c;
          tmp[c * 3] = vs2[vi * 3]; tmp[c * 3 + 1] = vs2[vi * 3 + 1]; tmp[c * 3 + 2] = vs2[vi * 3 + 2];
        }
        bakeTri(tmp, 0, j.owner);
        j.ti++; bakeStats.tris++;
        if ((j.ti & 511) === 0 && performance.now() - t0 > budgetMs) { bakeStats.ms += performance.now() - t0; return true; }
      }
      j.mi++; j.verts = null;
    }
    if (carveDirty) { carveDirty = false; carvePathways(); }
    bakeStats.ms += performance.now() - t0;
    return false;
  }


  var OPEN_PATHWAY_LANES = false;
  var LANE_HALF = 0.9, LANE_PAD = 2.5;
  var carveDirty = false;
  function carvePathways() {
    if (!grid || !OPEN_PATHWAY_LANES) return;
    segs.forEach(function (s) {
      var dx = s[2] - s[0], dz = s[3] - s[1], L = Math.hypot(dx, dz);
      if (L < 0.1) return;
      var n = Math.ceil(L / (CELL * 0.5)), hit = [];
      for (var i = 0; i <= n; i++) hit.push(!!solidAt(s[0] + dx * i / n, s[1] + dz * i / n));
      if (hit.indexOf(true) < 0) return;
      var pad = Math.ceil(LANE_PAD / (L / n));
      var nxn = -dz / L, nzn = dx / L;
      for (var j = 0; j <= n; j++) {
        var near = false;
        for (var k = Math.max(0, j - pad); k <= Math.min(n, j + pad); k++) if (hit[k]) { near = true; break; }
        if (!near) continue;
        var cx = s[0] + dx * j / n, cz = s[1] + dz * j / n;
        for (var o = -LANE_HALF; o <= LANE_HALF + 1e-6; o += CELL * 0.5) {
          var qx = cx + nxn * o, qz = cz + nzn * o;
          var ix = Math.floor((qx - gx0) / CELL), iz = Math.floor((qz - gz0) / CELL);
          if (ix >= 0 && ix < gw && iz >= 0 && iz < gh) grid[iz * gw + ix] = 0;
        }
      }
    });
  }

  function solidAt(x, z) {
    if (!grid) return 0;
    var ix = Math.floor((x - gx0) / CELL), iz = Math.floor((z - gz0) / CELL);
    if (ix < 0 || ix >= gw || iz < 0 || iz >= gh) return 0;
    return grid[iz * gw + ix];
  }
  var RING = [];
  for (var _k = 0; _k < 8; _k++) RING.push([Math.cos(_k * Math.PI / 4), Math.sin(_k * Math.PI / 4)]);
  function blockedRing(x, z) {
    if (solidAt(x, z)) return true;
    for (var k = 0; k < 8; k++) if (solidAt(x + RING[k][0] * PLAYER_R, z + RING[k][1] * PLAYER_R)) return true;
    return false;
  }

  function freeSpotNear(x, z) {
    if (!blockedRing(x, z)) return { x: x, z: z };
    for (var r = CELL; r <= 40; r += CELL) {
      var n = Math.max(8, Math.round(r * 4));
      for (var k = 0; k < n; k++) {
        var a = k / n * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (!blockedRing(px, pz)) return { x: px, z: pz };
      }
    }
    return { x: x, z: z };
  }

  function resolveMove(ox, oz, nx, nz) {
    if (!blockedRing(nx, nz)) return { x: nx, z: nz };
    if (!blockedRing(ox, oz)) {
      if (!blockedRing(nx, oz)) return { x: nx, z: oz };
      if (!blockedRing(ox, nz)) return { x: ox, z: nz };
      return { x: ox, z: oz };
    }
    if (!solidAt(nx, nz)) return { x: nx, z: nz };
    if (!solidAt(nx, oz)) return { x: nx, z: oz };
    if (!solidAt(ox, nz)) return { x: ox, z: nz };
    return { x: ox, z: oz };
  }

  function nearestOnPath(x, z) {
    var best = null;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], dx = s[2] - s[0], dz = s[3] - s[1];
      var l2 = dx * dx + dz * dz, t = l2 > 0 ? ((x - s[0]) * dx + (z - s[1]) * dz) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      var px = s[0] + dx * t, pz = s[1] + dz * t;
      var d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { x: px, z: pz, d: d, dx: dx, dz: dz };
    }
    return best;
  }
  // Nearest point ON a path that is also free of buildings. Where a path runs under or into a
  // building, the plain nearest point is inside the building footprint; spawning there pushes the
  // player out beside the building, off the path, and the path clamp then pins them there (stuck).
  function freeSpotOnPath(x, z) {
    var best = null;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], dx = s[2] - s[0], dz = s[3] - s[1], L = Math.hypot(dx, dz);
      if (L < 0.1) continue;
      var n = Math.max(1, Math.ceil(L / CELL));
      for (var j = 0; j <= n; j++) {
        var t = j / n, px = s[0] + dx * t, pz = s[1] + dz * t;
        var d = Math.hypot(x - px, z - pz);
        if (best && d >= best.d) continue;
        if (blockedRing(px, pz)) continue;
        best = { x: px, z: pz, d: d, dx: dx, dz: dz };
      }
    }
    return best;
  }
  function clampToPath(x, z) {
    var n = nearestOnPath(x, z);
    if (!n || n.d <= HALF_WIDTH) return { x: x, z: z };
    var k = HALF_WIDTH / n.d;
    return { x: n.x + (x - n.x) * k, z: n.z + (z - n.z) * k };
  }
  function yawFromDir(dx, dz) { return Math.atan2(-dx, -dz); }

  function toggle() { if (NavFP.active) exit(); else enter(); }

  /* ---------- jump to a building (first-person) ---------- */
  var TP_ORDER = { academic: 0, facility: 1, court: 2 };
  var tpBuilt = false, tpOpen = false;

  function tpBuildings() {
    var list = ((typeof campusData !== 'undefined' && campusData && campusData.buildings) || []).filter(function (b) {
      return b.category !== 'housing' && b.category !== 'place' && b.entryWaypoint && waypointMap[b.entryWaypoint];
    });
    list.sort(function (a, b) {
      var oa = TP_ORDER[a.category], ob = TP_ORDER[b.category];
      return (oa === undefined ? 9 : oa) - (ob === undefined ? 9 : ob) || String(a.name).localeCompare(String(b.name));
    });
    return list;
  }
  function buildTpList() {
    var host = document.getElementById('fp-tp-list');
    if (!host || tpBuilt) return;
    tpBuilt = true;
    host.innerHTML = '';
    tpBuildings().forEach(function (b) {
      var it = document.createElement('button');
      it.type = 'button'; it.className = 'fp-tp-item';
      var dot = document.createElement('span');
      dot.className = 'fp-tp-dot'; dot.style.background = CAT_COLOR[b.category] || '#6d7480';
      var label = document.createElement('span');
      label.textContent = b.name;
      it.appendChild(dot); it.appendChild(label);
      it.addEventListener('click', function (e) { e.stopPropagation(); teleportTo(b.id); setTeleport(false); });
      host.appendChild(it);
    });
  }
  function setTeleport(on) {
    tpOpen = !!on && NavFP.active;
    var panel = document.getElementById('fp-tp-panel');
    var btn = document.getElementById('char-btn');
    if (panel) {
      if (tpOpen) { buildTpList(); var l = document.getElementById('fp-tp-list'); if (l) l.scrollTop = 0; }
      panel.classList.toggle('hidden', !tpOpen);
    }
    if (btn) btn.classList.toggle('char-active', tpOpen);
  }
  function toggleTeleport() { setTeleport(!tpOpen); }

  // Is the target building the first thing seen when looking from (px,pz) toward its centre?
  function seesBuilding(px, pz, cx, cz, owner) {
    var L = Math.hypot(cx - px, cz - pz), n = Math.max(1, Math.ceil(L / CELL));
    for (var i = 1; i <= n; i++) {
      var v = solidAt(px + (cx - px) * i / n, pz + (cz - pz) * i / n);
      if (v) return v === owner;
    }
    return true;
  }
  // A free spot ON a path, about 22 units back from the building's footprint, close to its entrance and
  // with a clear view of it. Only path points that are not inside any model are used, so the camera
  // never ends up inside a building.
  function tpSpot(b) {
    if (jobs.length) pumpBake(2000);
    var cx = b.position.x, cz = b.position.z, sz = b.size || {};
    var hw = (+sz.width || 10) / 2, hd = (+sz.depth || 10) / 2, want = 22;
    var th = (+b.rotation || 0) * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th);
    // distance from a point to the building's footprint (a rotated rectangle), not to its centre
    function edgeDist(px, pz) {
      var ddx = px - cx, ddz = pz - cz;
      var lx = ddx * ct - ddz * st, lz = ddx * st + ddz * ct;
      return Math.hypot(Math.max(Math.abs(lx) - hw, 0), Math.max(Math.abs(lz) - hd, 0));
    }
    var ent = b.entryWaypoint && waypointMap[b.entryWaypoint] ? waypointMap[b.entryWaypoint].position : null;
    var oi = owners.indexOf(b.id), own = oi < 0 ? -1 : (oi % 250) + 1;
    var best = null;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], dx = s[2] - s[0], dz = s[3] - s[1], L = Math.hypot(dx, dz);
      if (L < 0.1) continue;
      var n = Math.max(1, Math.ceil(L / CELL));
      for (var j = 0; j <= n; j++) {
        var t = j / n, px = s[0] + dx * t, pz = s[1] + dz * t;
        var d = edgeDist(px, pz);
        if (d > want + 40) continue;
        if (blockedRing(px, pz)) continue;
        var score = Math.abs(d - want) + (ent ? 0.2 * Math.hypot(px - ent.x, pz - ent.z) : 0) + (seesBuilding(px, pz, cx, cz, own) ? 0 : 40);
        if (!best || score < best.score) best = { x: px, z: pz, score: score };
      }
    }
    return best;
  }
  function teleportTo(id) {
    if (!NavFP.active) return false;
    var list = (campusData && campusData.buildings) || [], b = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { b = list[i]; break; }
    if (!b) return false;
    var spot = tpSpot(b);
    if (!spot) {
      var e = b.entryWaypoint && waypointMap[b.entryWaypoint] ? waypointMap[b.entryWaypoint].position : b.position;
      spot = freeSpotOnPath(e.x, e.z);
    }
    if (!spot) return false;
    pos.x = spot.x; pos.z = spot.z;
    yaw = yawFromDir(b.position.x - spot.x, b.position.z - spot.z);
    pitch = -0.04;
    joy.id = null; joy.x = joy.y = 0; look.id = null;
    var nub = document.getElementById('fp-joy-nub'); if (nub) nub.style.transform = 'translate(0,0)';
    hideHint();
    applyCamera();
    return true;
  }

  function enter() {
    if (typeof campusData === 'undefined' || !campusData || !segs.length) return;
    saved = {
      fov: camera.fov, near: camera.near,
      lookTarget: { x: lookTarget.x, y: lookTarget.y, z: lookTarget.z },
      camOffset: { x: camOffset.x, y: camOffset.y, z: camOffset.z },
      bg: scene.background
    };
    if (typeof pickStartFor !== 'undefined' && pickStartFor && typeof cancelPickStart === 'function') cancelPickStart();
    var sx, sz, face = null;
    if (activeRouteIds && activeRouteIds.length > 1 && waypointMap[activeRouteIds[0]]) {
      var a = waypointMap[activeRouteIds[0]].position, b = waypointMap[activeRouteIds[1]].position;
      sx = a.x; sz = a.z; face = yawFromDir(b.x - a.x, b.z - a.z);
    } else {
      var from = currentGPSPosition || lookTarget;
      var n = nearestOnPath(from.x, from.z);
      sx = n.x; sz = n.z;
      var dx = n.dx, dz = n.dz;
      if (dx < 0 || (dx === 0 && dz < 0)) { dx = -dx; dz = -dz; }
      face = yawFromDir(dx, dz);
    }
    if (jobs.length) pumpBake(2000);
    var free = freeSpotOnPath(sx, sz);
    if (free) {
      if (!(activeRouteIds && activeRouteIds.length > 1)) {
        var fdx = free.dx, fdz = free.dz;
        if (fdx < 0 || (fdx === 0 && fdz < 0)) { fdx = -fdx; fdz = -fdz; }
        face = yawFromDir(fdx, fdz);
      }
    } else {
      free = freeSpotNear(sx, sz);
    }
    pos.x = free.x; pos.z = free.z; yaw = face; pitch = -0.04;

    camera.fov = FOV_FP; camera.near = 0.3; camera.updateProjectionMatrix();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 260, 1500);
    NavFP.active = true;
    if (typeof gpsMarker !== 'undefined' && gpsMarker) gpsMarker.visible = false;
    if (typeof setRouteStyle === 'function') setRouteStyle(true);
    setUi(true);
    applyCamera();
    if (typeof window.onFirstPersonEnter === 'function') window.onFirstPersonEnter();
  }

  function exit() {
    if (!NavFP.active) return;
    NavFP.active = false;
    camera.fov = saved.fov; camera.near = saved.near; camera.updateProjectionMatrix();
    scene.background = saved.bg;
    scene.fog = null;
    camOffset.x = saved.camOffset.x; camOffset.y = saved.camOffset.y; camOffset.z = saved.camOffset.z;
    lookTarget.x = pos.x; lookTarget.y = 0; lookTarget.z = pos.z;
    if (typeof updateCameraFromTarget === 'function') updateCameraFromTarget();
    if (typeof gpsMarker !== 'undefined' && gpsMarker && currentGPSPosition) gpsMarker.visible = true;
    if (typeof setRouteStyle === 'function') setRouteStyle(false);
    joy.id = null; joy.x = joy.y = 0; look.id = null;
    setTeleport(false);
    setUi(false);
    if (typeof window.onFirstPersonExit === 'function') window.onFirstPersonExit();
  }

  function applyCamera() {
    camera.position.set(pos.x, EYE_HEIGHT, pos.z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  function pointerDown(e) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; hideHint(); }
  function pointerMove(e) {
    if (look.id === null || e.pointerId !== look.id) return;
    var dx = e.clientX - look.x, dy = e.clientY - look.y;
    look.x = e.clientX; look.y = e.clientY;
    var sens = LOOK_SPEED * THREE.MathUtils.degToRad(camera.fov) / Math.max(300, renderer.domElement.clientHeight);
    yaw   += dx * sens;
    pitch += dy * sens;
    pitch = Math.max(-0.9, Math.min(0.9, pitch));
  }
  function pointerUp() { look.id = null; }

  function frame() {
    var now = performance.now();
    var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.016;
    lastT = now;
    if ((scanTick++ % 30) === 0) scanForNewModels();
    if (jobs.length) pumpBake(NavFP.active ? 3 : 6);
    if (NavFP.active) {
      var jx = joy.x, jy = joy.y;
      if (jx && look.id === null) {
        yaw -= jx * AUTO_TURN * dt;
        jx *= 0.6;
      }
      if (jx || jy) {
        var fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        var rx =  Math.cos(yaw), rz = -Math.sin(yaw);
        var vx = fx * jy + rx * jx, vz = fz * jy + rz * jx;
        var mx = vx * WALK_SPEED * dt, mz = vz * WALK_SPEED * dt;
        var steps = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.25));
        for (var si = 0; si < steps; si++) {
          var c = clampToPath(pos.x + mx / steps, pos.z + mz / steps);
          var r = resolveMove(pos.x, pos.z, c.x, c.z);
          pos.x = r.x; pos.z = r.z;
        }
      }
      applyCamera();
    }
    layoutLabels();
  }

  var wired = false;
  function wireUi() {
    if (wired) return; wired = true;
    var btn = document.getElementById('fp-btn');
    if (btn) btn.addEventListener('click', toggle);
    document.addEventListener('pointerdown', function (e) {
      if (!tpOpen) return;
      var panel = document.getElementById('fp-tp-panel'), cb = document.getElementById('char-btn');
      if ((panel && panel.contains(e.target)) || (cb && cb.contains(e.target))) return;
      setTeleport(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (tpOpen) setTeleport(false);
      else if (searchOpen) setSearch(false);
    });
    var sbtn = document.getElementById('fp-search-btn');
    if (sbtn) sbtn.addEventListener('click', function () { setSearch(!searchOpen); });
    var slist = document.getElementById('building-sheet-list');
    if (slist) slist.addEventListener('click', function (e) {
      if (searchOpen && e.target.closest && e.target.closest('.building-item')) setTimeout(function () { setSearch(false); }, 0);
    });
    document.addEventListener('pointerdown', function (e) {
      if (!searchOpen) return;
      var sheet = document.getElementById('map-sheet'), sb = document.getElementById('fp-search-btn');
      if ((sheet && sheet.contains(e.target)) || (sb && sb.contains(e.target))) return;
      setSearch(false);
    });

    var base = document.getElementById('fp-joy');
    var nub  = document.getElementById('fp-joy-nub');
    if (!base || !nub) return;
    var R = 40;
    function setVec(e) {
      var r = base.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      nub.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      joy.x = dx / R; joy.y = -dy / R;
    }
    base.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      joy.id = e.pointerId;
      try { base.setPointerCapture(e.pointerId); } catch (err) {}
      base.classList.add('active'); hideHint(); setVec(e);
    });
    base.addEventListener('pointermove', function (e) { if (e.pointerId === joy.id) { e.preventDefault(); setVec(e); } });
    function end(e) {
      if (e.pointerId !== joy.id) return;
      joy.id = null; joy.x = joy.y = 0;
      nub.style.transform = 'translate(0,0)'; base.classList.remove('active');
    }
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
  }

  var searchOpen = false;
  function setSearch(on) {
    on = !!on && NavFP.active;
    if (on === searchOpen) return;
    searchOpen = on;
    var vp = document.querySelector('#page-map .map-viewport');
    if (vp) vp.classList.toggle('fp-search-open', on);
    var sb = document.getElementById('fp-search-btn');
    if (sb) sb.classList.toggle('active', on);
    var inp = document.getElementById('building-search-input');
    if (on) {
      setTeleport(false);
      if (typeof sheetEnsureOpen === 'function') sheetEnsureOpen();
      if (inp) setTimeout(function () { if (searchOpen) inp.focus(); }, 60);
    } else {
      if (inp) inp.blur();
      if (typeof sheetCollapse === 'function') sheetCollapse();
    }
  }

  function setUi(on) {
    var vp = document.querySelector('#page-map .map-viewport');
    if (vp) vp.classList.toggle('fp-on', on);
    var btn = document.getElementById('fp-btn');
    if (btn) btn.classList.toggle('fp-active', on);
    var cbtn = document.getElementById('char-btn');
    if (cbtn) {
      cbtn.title = on ? 'Jump to a building' : 'Choose character';
      cbtn.setAttribute('aria-label', on ? 'Jump to a building' : 'Choose character');
    }
    var hint = document.getElementById('fp-hint');
    if (hint) hint.classList.toggle('fp-hint-hidden', !on);
  }
  function hideHint() {
    var h = document.getElementById('fp-hint');
    if (h) h.classList.add('fp-hint-hidden');
  }
})();
