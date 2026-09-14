// Campus Walkthrough page — early first-person prototype.
//
// Walks the camera over the reconstructed pathway mesh (LHS building to the
// Canteen), steered by a draggable joystick that appears wherever you touch
// the left half of the screen ("invisible wheel"); dragging the right half
// looks around. This is deliberately independent of js/main.js's map scene
// and js/ui.js's POV viewer -- its own THREE.Scene/camera/renderer, its own
// gesture handling -- so it can be lazily created only once this page is
// actually opened, and paused (not torn down) whenever the user navigates
// away.
//
// ---- Why there's a heightmap JSON instead of raycasting the mesh live ----
// The raw scan is ~400k triangles / 44MB. Raycasting that live, every frame,
// with three.js's default (non-BVH) Raycaster would be far too slow on a
// phone. Ground height instead comes from data/walkthroughPathHeightmap.json,
// a small precomputed grid built OFFLINE (Python + trimesh, one raycast per
// grid cell, median-filtered to reject stray reconstruction spikes, holes
// filled by nearest-neighbor averaging) -- see that file's own notes. At
// runtime this is just a cheap bilinear lookup, no raycasting at all.
//
// ---- Why part of the pathway is fenced off ----
// The reconstruction has a real discontinuity roughly where the LHS-side and
// Canteen-side scans should meet -- adjacent grid cells jump by 100+ units,
// meaning the two sides don't share a consistent elevation (not just a
// "hole" in the mesh). The heightmap JSON's `walkable` grid marks any cell
// on or next to a jump that steep as unwalkable, and movement here is
// blocked (with a one-time toast) rather than silently letting the camera
// fly through a cliff or fall into the gap -- staying honest about what's
// incomplete instead of hiding it.
(function () {
  var MODEL_URL = 'models/LHS2Canteendt.glb';
  var HEIGHTMAP_URL = 'data/walkthroughPathHeightmap.json';

  var stage, canvas, loadingEl, hintEl, toastEl, joyBaseEl, joyNubEl;
  var renderer, scene, camera;
  var hm = null; // parsed heightmap JSON
  var modelReady = false, hmReady = false;

  var pos = { x: 0, y: 0, z: 0 };
  var yaw = 0, pitch = 0;
  var MIN_PITCH = -0.9, MAX_PITCH = 0.75; // ~-52deg..43deg

  var eyeHeight = 2, moveSpeed = 3, cellSize = 1;
  var smoothedY = null;

  var loopRunning = false, rafId = null, lastTick = 0;

  // Movement joystick (left half of the stage) and look-drag (right half)
  // are two independent single-pointer interactions, tracked by pointerId so
  // a left-thumb + right-thumb combo (two simultaneous touches) both work.
  var joyPointerId = null, joyCenter = null, joyVec = { x: 0, y: 0 };
  var JOY_RADIUS = 48;
  var lookPointerId = null, lookLastX = 0, lookLastY = 0;

  var hintTimer = null, toastTimer = null, toastLastShown = 0;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function $(id) { return document.getElementById(id); }

  function ensureDom() {
    stage = $('wt-fp-stage');
    canvas = $('wt-fp-canvas');
    loadingEl = $('wt-fp-loading');
    hintEl = $('wt-fp-hint');
    toastEl = $('wt-fp-toast');
    joyBaseEl = $('wt-fp-joystick-base');
    joyNubEl = $('wt-fp-joystick-nub');
    return !!(stage && canvas);
  }

  function initThree() {
    scene = new THREE.Scene();
    var skyColor = 0xB9C6D6;
    scene.background = new THREE.Color(skyColor);

    camera = new THREE.PerspectiveCamera(64, 1, 0.1, 2000);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    var sun = new THREE.DirectionalLight(0xffffff, 0.45);
    sun.position.set(40, 80, 30);
    scene.add(sun);

    bindGestures();
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

    resize();
    loadAll();
  }

  function loadAll() {
    var loader = new THREE.GLTFLoader();
    loader.load(
      MODEL_URL,
      function (gltf) {
        // Loaded at its original coordinates on purpose -- the heightmap
        // grid was built from this same raw space, so recentering the model
        // here would desync it from the ground/collision data.
        scene.add(gltf.scene);
        modelReady = true;
        maybeFinishLoading();
      },
      undefined,
      function () {
        showLoadError('Preview model failed to load');
      }
    );

    fetch(HEIGHTMAP_URL)
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (json) {
        hm = json;
        eyeHeight = hm.eyeHeight || eyeHeight;
        moveSpeed = hm.moveSpeed || moveSpeed;
        cellSize = hm.cellSize || cellSize;
        camera.near = Math.max(0.05, cellSize * 0.3);
        camera.far = Math.max(200, (hm.maxX - hm.minX + hm.maxZ - hm.minZ) * 3);
        scene.fog = new THREE.Fog(scene.background.getHex(), cellSize * 25, camera.far * 0.85);
        camera.updateProjectionMatrix();

        pos.x = hm.spawn.x; pos.z = hm.spawn.z;
        pos.y = hm.spawn.y + eyeHeight;
        smoothedY = pos.y;
        // Face into the open walkable area (precomputed offline) with a
        // slight downward tilt, so the reconstructed scene is visible right
        // away instead of spawning while looking flat into the sky.
        yaw = hm.spawn.yaw || 0;
        pitch = -0.12;
        updateCameraFromState();

        hmReady = true;
        maybeFinishLoading();
      })
      .catch(function () {
        showLoadError('Pathway data failed to load');
      });
  }

  function showLoadError(msg) {
    if (loadingEl) {
      loadingEl.textContent = msg;
    }
  }

  function maybeFinishLoading() {
    if (!modelReady || !hmReady) return;
    if (loadingEl) loadingEl.classList.add('wt-hidden');
    if (hintEl) {
      hintEl.classList.remove('wt-hidden');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () { hintEl.classList.add('wt-hidden'); }, 4500);
    }
    renderOnce();
  }

  // ---- heightmap sampling: bilinear height, nearest-cell walkable check ----
  function gridCoords(x, z) {
    var fx = (x - hm.minX) / (hm.maxX - hm.minX) * (hm.cols - 1);
    var fz = (z - hm.minZ) / (hm.maxZ - hm.minZ) * (hm.rows - 1);
    return { fx: clamp(fx, 0, hm.cols - 1), fz: clamp(fz, 0, hm.rows - 1) };
  }

  function sampleHeight(x, z) {
    var g = gridCoords(x, z);
    var c0 = Math.floor(g.fx), c1 = Math.min(c0 + 1, hm.cols - 1);
    var r0 = Math.floor(g.fz), r1 = Math.min(r0 + 1, hm.rows - 1);
    var tx = g.fx - c0, tz = g.fz - r0;
    var h00 = hm.heights[r0][c0], h10 = hm.heights[r0][c1];
    var h01 = hm.heights[r1][c0], h11 = hm.heights[r1][c1];
    var h0 = h00 * (1 - tx) + h10 * tx;
    var h1 = h01 * (1 - tx) + h11 * tx;
    return h0 * (1 - tz) + h1 * tz;
  }

  function sampleWalkable(x, z) {
    var g = gridCoords(x, z);
    var c = clamp(Math.round(g.fx), 0, hm.cols - 1);
    var r = clamp(Math.round(g.fz), 0, hm.rows - 1);
    return hm.walkable[r][c];
  }

  function showFenceToast() {
    var now = performance.now();
    if (now - toastLastShown < 3000) return;
    toastLastShown = now;
    if (!toastEl) return;
    toastEl.classList.add('wt-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('wt-show'); }, 2600);
  }

  // ---- per-frame movement: joystick vector -> world delta, blocked against
  // the walkable mask with simple axis-sliding (try full move, then x-only,
  // then z-only) so hitting the fence feels like a wall, not a hard stop. ----
  function stepMovement(dt) {
    if (!hm || (joyVec.x === 0 && joyVec.y === 0)) return;
    var mag = Math.min(1, Math.hypot(joyVec.x, joyVec.y));
    if (mag < 0.05) return;
    var nx = joyVec.x / (Math.hypot(joyVec.x, joyVec.y) || 1) * mag;
    var ny = joyVec.y / (Math.hypot(joyVec.x, joyVec.y) || 1) * mag;

    var fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
    var rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);

    var dx = (fwdX * ny + rightX * nx) * moveSpeed * dt;
    var dz = (fwdZ * ny + rightZ * nx) * moveSpeed * dt;

    var tryX = pos.x + dx, tryZ = pos.z + dz;
    if (sampleWalkable(tryX, tryZ)) {
      pos.x = tryX; pos.z = tryZ;
    } else if (sampleWalkable(tryX, pos.z)) {
      pos.x = tryX;
    } else if (sampleWalkable(pos.x, tryZ)) {
      pos.z = tryZ;
    } else {
      showFenceToast();
    }

    var targetY = sampleHeight(pos.x, pos.z) + eyeHeight;
    smoothedY = smoothedY + (targetY - smoothedY) * Math.min(1, dt * 8);
    pos.y = smoothedY;
  }

  function updateCameraFromState() {
    camera.position.set(pos.x, pos.y, pos.z);
    var cp = Math.cos(pitch);
    var dir = {
      x: cp * Math.sin(yaw),
      y: Math.sin(pitch),
      z: cp * Math.cos(yaw)
    };
    camera.lookAt(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z);
  }

  function resize() {
    if (!stage || !renderer) return;
    var w = stage.clientWidth || 300;
    var h = stage.clientHeight || 220;
    if (w < 1 || h < 1) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderOnce();
  }

  function renderOnce() {
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  // ---- gestures ----
  function bindGestures() {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUpMaybe);
  }

  function isLeftHalf(clientX) {
    var r = stage.getBoundingClientRect();
    return (clientX - r.left) < r.width / 2;
  }

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    if (hintEl && !hintEl.classList.contains('wt-hidden')) {
      hintEl.classList.add('wt-hidden');
    }

    if (isLeftHalf(e.clientX) && joyPointerId === null) {
      joyPointerId = e.pointerId;
      joyCenter = { x: e.clientX, y: e.clientY };
      joyVec = { x: 0, y: 0 };
      positionJoystick(joyCenter.x, joyCenter.y);
      setJoystickNub(0, 0);
      if (joyBaseEl) joyBaseEl.classList.add('wt-active');
    } else if (!isLeftHalf(e.clientX) && lookPointerId === null) {
      lookPointerId = e.pointerId;
      lookLastX = e.clientX; lookLastY = e.clientY;
    }
  }

  function onPointerMove(e) {
    if (e.pointerId === joyPointerId && joyCenter) {
      var dx = e.clientX - joyCenter.x, dy = e.clientY - joyCenter.y;
      var dist = Math.hypot(dx, dy);
      var clamped = Math.min(dist, JOY_RADIUS);
      var ang = Math.atan2(dy, dx);
      var nx = Math.cos(ang) * clamped, ny = Math.sin(ang) * clamped;
      setJoystickNub(nx, ny);
      // screen +x = strafe right, screen -y (drag up) = move forward
      joyVec.x = nx / JOY_RADIUS;
      joyVec.y = -ny / JOY_RADIUS;
      e.preventDefault();
    } else if (e.pointerId === lookPointerId) {
      var ddx = e.clientX - lookLastX, ddy = e.clientY - lookLastY;
      lookLastX = e.clientX; lookLastY = e.clientY;
      yaw -= ddx * 0.006;
      pitch = clamp(pitch - ddy * 0.006, MIN_PITCH, MAX_PITCH);
      e.preventDefault();
    }
  }

  function endJoystick() {
    joyPointerId = null; joyCenter = null; joyVec = { x: 0, y: 0 };
    if (joyBaseEl) joyBaseEl.classList.remove('wt-active');
  }

  function onPointerUp(e) {
    if (e.pointerId === joyPointerId) endJoystick();
    if (e.pointerId === lookPointerId) lookPointerId = null;
  }

  // pointerleave shouldn't stop a drag that's still captured by the pointer
  // (capture keeps delivering move/up even off-canvas); only treat it as an
  // end when the browser actually released capture (no more move/up coming).
  function onPointerUpMaybe(e) {
    if (canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) return;
    onPointerUp(e);
  }

  function positionJoystick(clientX, clientY) {
    if (!joyBaseEl || !stage) return;
    var r = stage.getBoundingClientRect();
    joyBaseEl.style.left = (clientX - r.left) + 'px';
    joyBaseEl.style.top = (clientY - r.top) + 'px';
  }

  function setJoystickNub(dx, dy) {
    if (!joyNubEl) return;
    joyNubEl.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
  }

  function tick(now) {
    if (!loopRunning) return;
    var dt = lastTick ? Math.min((now - lastTick) / 1000, 0.1) : 0;
    lastTick = now;
    if (hmReady) {
      stepMovement(dt);
      updateCameraFromState();
    }
    renderOnce();
    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (loopRunning) return;
    loopRunning = true;
    lastTick = 0;
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    loopRunning = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    endJoystick();
    lookPointerId = null;
  }

  // Public API, called from script.js's goTo()/sidebarGoTo() hooks -- init
  // once, then just resume/pause the render loop on later visits so the
  // loaded model and heightmap stay in memory instead of reloading.
  window.CampusWalkthrough = {
    onEnter: function () {
      if (!renderer) {
        if (typeof THREE === 'undefined' || !ensureDom()) return;
        initThree();
      } else {
        resize();
      }
      startLoop();
    },
    onLeave: function () {
      stopLoop();
    }
  };
})();
