// =============================================================
//  js/navfp.js  —  NavMap extras (thesis adviser, Oct 2026)
//
//   1. Building NAME TAGS  — a floating label over every building, so users
//      don't have to tap a model to see what it is. Tags stay a constant,
//      readable size on screen; when they'd overlap, the more important one
//      wins and the other waits until you zoom in.
//   2. FIRST-PERSON view   — the camera button on the map. Walk the Pathways
//      with the joystick, drag to look around. The route is drawn as flat
//      arrowheads here (and as the orange line in the normal top view).
//
//  Depends on main.js globals: scene, camera, renderer, campusData,
//  waypointMap, lookTarget, camOffset, currentGPSPosition, gpsMarker,
//  activeRouteIds, setRouteStyle(), updateCameraFromTarget().
// =============================================================
(function () {
  'use strict';

  // ── Tunables ──
  var EYE_HEIGHT   = 5;       // metres above the pathway
  var FOV_FP       = 72;
  var WALK_SPEED   = 30;      // scene units (metres) per second at full joystick
  var HALF_WIDTH   = 2.4;     // how far from a pathway's centreline you can stray
  var LABEL_RANGE_FP = 170;   // name tags farther than this are hidden in first-person
  // collision against the building models (walls block you; archways / gaps are walkable)
  var CELL         = 0.5;     // collision grid resolution (metres)
  var BAND_BOT     = 0.35;    // only geometry between these heights can stop you...
  var BAND_TOP     = 2.0;     // ...(so roofs overhead and floors underfoot don't count)
  var PLAYER_R     = 0.6;     // personal space kept from a wall
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
    _state: function () { return { x: pos.x, z: pos.z, yaw: yaw, pitch: pitch }; },
    _set: function (x, z, y, p) { pos.x = x; pos.z = z; yaw = y; pitch = p; }
  };
  window.NavFP = NavFP;

  var segs = [];                       // pathway centrelines [ax,az,bx,bz]
  var pos = { x: 0, z: 0 }, yaw = 0, pitch = -0.04;
  var saved = null;
  var lastT = 0;
  var joy = { id: null, x: 0, y: 0 };          // joystick vector, each -1..1 (y up = forward)
  var look = { id: null, x: 0, y: 0 };
  var labels = [];                              // { sprite, lw, lh, x, y, z, prio }

  // ─────────────────────────────────────────────────────────────
  //  Campus data hook
  // ─────────────────────────────────────────────────────────────
  function onCampusLoaded(data) {
    // pathway centrelines for first-person collision
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

  // ─────────────────────────────────────────────────────────────
  //  Building name tags
  // ─────────────────────────────────────────────────────────────
  var CAT_COLOR = { academic: '#2f6fb5', facility: '#d49a12', court: '#6d7480', housing: '#2a9d8f' };
  var CAT_PRIO  = { academic: 0, facility: 1, court: 2, housing: 4 };

  function buildLabels(buildings) {
    labels.forEach(function (l) { scene.remove(l.sprite); });
    labels = [];
    buildings.forEach(function (b) {
      if (b.labelHidden) return;           // campus editor: "Hide this tag"
      var off = b.labelOffset || {};       // campus editor: tag dragged to a new spot (metres)
      var text = (b.labelText && String(b.labelText).trim()) || b.name || b.label || b.id;
      var color = CAT_COLOR[b.category] || '#6d7480';
      var made = makeTag(text, color);
      var mat = new THREE.SpriteMaterial({ map: made.tex, transparent: true, depthTest: false, depthWrite: false });
      var sp = new THREE.Sprite(mat);
      sp.center.set(0.5, 0);               // anchor = bottom-centre, sits on the roof
      sp.renderOrder = 20;
      sp.userData.isNameTag = true;        // not in buildingMeshes -> never tappable
      scene.add(sp);
      labels.push({
        sprite: sp, lw: made.lw, lh: made.lh,
        x: b.position.x + (+off.x || 0), z: b.position.z + (+off.z || 0),
        y: ((b.size && b.size.height) || 8) + 1.5 + (+off.y || 0),
        prio: CAT_PRIO[b.category] !== undefined ? CAT_PRIO[b.category] : 3
      });
    });
  }

  // Draws the tag onto a canvas at 2x for crispness. lw/lh = logical screen px.
  function makeTag(text, accent) {
    var S = 2, fs = 12, lineH = 15, padX = 9, padY = 5, maxW = 130;
    var font = '600 ' + fs + 'px "DM Sans", system-ui, sans-serif';
    var meas = document.createElement('canvas').getContext('2d');
    meas.font = font;
    // wrap on words
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (meas.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    var tw = 0; lines.forEach(function (l) { tw = Math.max(tw, meas.measureText(l).width); });
    var lw = Math.ceil(tw + padX * 2), lh = lines.length * lineH + padY * 2 + 6;  // +6: pointer
    var c = document.createElement('canvas');
    c.width = lw * S; c.height = lh * S;
    var g = c.getContext('2d');
    g.scale(S, S);
    var bodyH = lh - 6;
    // body
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
    roundRect(g, 0.5, 0.5, lw - 1, bodyH - 1, 7); g.fill(); g.stroke();
    // pointer
    g.beginPath(); g.moveTo(lw / 2 - 5, bodyH - 0.5); g.lineTo(lw / 2, lh - 0.5); g.lineTo(lw / 2 + 5, bodyH - 0.5); g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.fill();
    // text
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

    // project every tag
    var items = [];
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i];
      _v.set(L.x, L.y, L.z).applyMatrix4(camera.matrixWorldInverse);
      var depth = -_v.z;
      if (depth < 0.5 || (fp && depth > LABEL_RANGE_FP)) { L.sprite.visible = false; continue; }
      var wH = L.lh * (2 * depth * tanHalf) / H;          // world height that is lh px tall
      _v.set(L.x, L.y, L.z).project(camera);
      var sx = (_v.x + 1) / 2 * W, sy = (1 - _v.y) / 2 * H;
      if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + 80) { L.sprite.visible = false; continue; }
      items.push({ L: L, sx: sx, sy: sy, depth: depth, wH: wH });
    }
    // important first, then nearer first
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


  // ─────────────────────────────────────────────────────────────
  //  Collision with the GLB building models
  //
  //  Each model is "baked" once into a flat top-down grid: any wall-like
  //  triangle that sits at walking height (BAND_BOT..BAND_TOP) marks the grid
  //  cells under it as solid. Walking is then a cheap grid lookup, however
  //  heavy the model is. Because only walking-height geometry counts, a
  //  pathway that goes through an archway / under a raised part of a model
  //  stays walkable, while the solid walls beside it still stop you.
  //  Baking happens in small time slices in the background (no freeze).
  //
  //  campus.json: set  "noCollision": true  on a building to let people walk
  //  straight through it (e.g. a covered walkway modelled as a solid block).
  // ─────────────────────────────────────────────────────────────
  var grid = null, gx0 = 0, gz0 = 0, gw = 0, gh = 0;
  var owners = [];                 // grid value k>0  ->  owners[k-1] = building id
  var queued = {};                 // mesh uuid -> true (already queued / baked)
  var jobs = [];                   // { obj, id, meshes, mi, ti, verts, owner }
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
  // clip a polygon (array of [x,y,z]) to  y >= lo  (keep = +1)  or  y <= hi  (keep = -1)
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
    if (nl < 1e-12 || Math.abs(ny) / nl > 0.8) return;            // floors / flat roofs are not walls
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


  // Photogrammetry shells can have small holes in a wall. Make each model SOLID inside:
  // anything enclosed by its walls (after closing gaps up to ~1 m) is filled, so you can't
  // slip in through a hole. Real openings (archways, a gap wider than ~1 m) connect to the
  // outside, so they stay open.
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
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) if (solid[z * W + x]) {           // dilate by 1 cell
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
      if (seen[i] || solid[i]) continue;                       // outside, or already a wall
      // enclosed. Skip the 1-cell dilation skin that touches the outside (it isn't interior)
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

  // bake for up to `budgetMs`; returns true while work remains
  function pumpBake(budgetMs) {
    var t0 = performance.now();
    while (jobs.length) {
      var j = jobs[0];
      if (j.mi >= j.meshes.length) { fillInterior(j.obj, j.owner); jobs.shift(); bakeStats.models++; carveDirty = true; continue; }
      var mesh = j.meshes[j.mi], g = mesh.geometry;
      if (!j.verts) {
        // world-space positions, computed once per mesh
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
    if (carveDirty) { carveDirty = false; carvePathways(); }      // all queued models baked -> open the pathway lanes
    bakeStats.ms += performance.now() - t0;
    return false;
  }


  // OPTIONAL (off): a pathway drawn THROUGH a model could be given a narrow walkable
  // lane. Off by default: the camera must never pass through a model, even where the
  // pathway line itself runs under it. Per-building opt-out is "noCollision": true.
  var OPEN_PATHWAY_LANES = false;   // false = models block you EVERYWHERE, even where a Pathway was drawn through/under one
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

  // if a start point sits inside / against a model (a door waypoint is usually inside its building's
  // footprint), step out to the nearest open spot so you never start stuck in a wall
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

  // try to move (ox,oz) -> (nx,nz); slide along walls instead of stopping dead
  function resolveMove(ox, oz, nx, nz) {
    if (!blockedRing(nx, nz)) return { x: nx, z: nz };
    if (!blockedRing(ox, oz)) {
      if (!blockedRing(nx, oz)) return { x: nx, z: oz };
      if (!blockedRing(ox, nz)) return { x: ox, z: nz };
      return { x: ox, z: oz };
    }
    // already hugging a wall (e.g. a route starts right at a door): only forbid stepping INTO a solid cell
    if (!solidAt(nx, nz)) return { x: nx, z: nz };
    if (!solidAt(nx, oz)) return { x: nx, z: oz };
    if (!solidAt(ox, nz)) return { x: ox, z: nz };
    return { x: ox, z: oz };
  }

  // ─────────────────────────────────────────────────────────────
  //  First-person
  // ─────────────────────────────────────────────────────────────
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
  function clampToPath(x, z) {
    var n = nearestOnPath(x, z);
    if (!n || n.d <= HALF_WIDTH) return { x: x, z: z };
    var k = HALF_WIDTH / n.d;
    return { x: n.x + (x - n.x) * k, z: n.z + (z - n.z) * k };
  }
  function yawFromDir(dx, dz) { return Math.atan2(-dx, -dz); }   // forward = (-sin yaw, -cos yaw)

  function toggle() { if (NavFP.active) exit(); else enter(); }

  function enter() {
    if (typeof campusData === 'undefined' || !campusData || !segs.length) return;
    saved = {
      fov: camera.fov, near: camera.near,
      lookTarget: { x: lookTarget.x, y: lookTarget.y, z: lookTarget.z },
      camOffset: { x: camOffset.x, y: camOffset.y, z: camOffset.z },
      bg: scene.background
    };
    // start: the route's first waypoint (facing along the route), else your GPS spot, else
    // the pathway nearest what the map is centred on
    var sx, sz, face = null;
    if (activeRouteIds && activeRouteIds.length > 1 && waypointMap[activeRouteIds[0]]) {
      var a = waypointMap[activeRouteIds[0]].position, b = waypointMap[activeRouteIds[1]].position;
      sx = a.x; sz = a.z; face = yawFromDir(b.x - a.x, b.z - a.z);
    } else {
      var from = currentGPSPosition || lookTarget;
      var n = nearestOnPath(from.x, from.z);
      sx = n.x; sz = n.z;
      var dx = n.dx, dz = n.dz;
      if (dx < 0 || (dx === 0 && dz < 0)) { dx = -dx; dz = -dz; }   // default: walk east / away from main gate
      face = yawFromDir(dx, dz);
    }
    if (jobs.length) pumpBake(2000);                       // make sure collision is ready before the first step
    var free = freeSpotNear(sx, sz);
    pos.x = free.x; pos.z = free.z; yaw = face; pitch = -0.04;

    camera.fov = FOV_FP; camera.near = 0.3; camera.updateProjectionMatrix();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 260, 1500);
    NavFP.active = true;
    if (typeof gpsMarker !== 'undefined' && gpsMarker) gpsMarker.visible = false;
    if (typeof setRouteStyle === 'function') setRouteStyle(true);
    setUi(true);
    applyCamera();
  }

  function exit() {
    if (!NavFP.active) return;
    NavFP.active = false;
    camera.fov = saved.fov; camera.near = saved.near; camera.updateProjectionMatrix();
    scene.background = saved.bg;
    scene.fog = null;
    camOffset.x = saved.camOffset.x; camOffset.y = saved.camOffset.y; camOffset.z = saved.camOffset.z;
    lookTarget.x = pos.x; lookTarget.y = 0; lookTarget.z = pos.z;     // map recentres where you stopped
    if (typeof updateCameraFromTarget === 'function') updateCameraFromTarget();
    if (typeof gpsMarker !== 'undefined' && gpsMarker && currentGPSPosition) gpsMarker.visible = true;
    if (typeof setRouteStyle === 'function') setRouteStyle(false);
    joy.id = null; joy.x = joy.y = 0; look.id = null;
    setUi(false);
  }

  function applyCamera() {
    camera.position.set(pos.x, EYE_HEIGHT, pos.z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  // drag anywhere that isn't the joystick = look around (wired from main.js's pointer handlers)
  function pointerDown(e) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; hideHint(); }
  function pointerMove(e) {
    if (look.id === null || e.pointerId !== look.id) return;
    var dx = e.clientX - look.x, dy = e.clientY - look.y;
    look.x = e.clientX; look.y = e.clientY;
    var sens = THREE.MathUtils.degToRad(camera.fov) / Math.max(300, renderer.domElement.clientHeight);
    yaw   += dx * sens;
    pitch += dy * sens;
    pitch = Math.max(-0.9, Math.min(0.9, pitch));
  }
  function pointerUp() { look.id = null; }

  function frame() {
    var now = performance.now();
    var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.016;
    lastT = now;
    if ((scanTick++ % 30) === 0) scanForNewModels();      // picks up models as they finish loading
    if (jobs.length) pumpBake(NavFP.active ? 3 : 6);      // background baking, a few ms per frame
    if (NavFP.active) {
      var jx = joy.x, jy = joy.y;
      if (jx || jy) {
        var fx = -Math.sin(yaw), fz = -Math.cos(yaw);       // forward
        var rx =  Math.cos(yaw), rz = -Math.sin(yaw);       // right
        var vx = fx * jy + rx * jx, vz = fz * jy + rz * jx;
        var mx = vx * WALK_SPEED * dt, mz = vz * WALK_SPEED * dt;
        var steps = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.25));     // small steps: never tunnel through a thin wall
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

  // ─────────────────────────────────────────────────────────────
  //  UI: camera button, joystick, hint
  // ─────────────────────────────────────────────────────────────
  var wired = false;
  function wireUi() {
    if (wired) return; wired = true;
    var btn = document.getElementById('fp-btn');
    if (btn) btn.addEventListener('click', toggle);

    var base = document.getElementById('fp-joy');
    var nub  = document.getElementById('fp-joy-nub');
    if (!base || !nub) return;
    var R = 46;
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

  function setUi(on) {
    var vp = document.querySelector('#page-map .map-viewport');
    if (vp) vp.classList.toggle('fp-on', on);
    var btn = document.getElementById('fp-btn');
    if (btn) btn.classList.toggle('fp-active', on);
    var hint = document.getElementById('fp-hint');
    if (hint) hint.classList.toggle('fp-hint-hidden', !on);
  }
  function hideHint() {
    var h = document.getElementById('fp-hint');
    if (h) h.classList.add('fp-hint-hidden');
  }
})();
