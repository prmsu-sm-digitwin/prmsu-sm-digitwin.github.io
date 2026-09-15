// Campus Walkthrough page — early first-person prototype.
//
// Walks the camera over the reconstructed pathway mesh (LHS building to the
// Canteen), steered by a joystick fixed at the bottom-middle of the screen;
// dragging anywhere else on the stage looks around. The joystick's visual
// stays put, but you don't have to land your thumb exactly on it -- starting
// a touch anywhere in the bottom third of the stage grabs it, and the nub
// then clamps toward wherever you drag from that fixed center. This is
// deliberately independent of js/main.js's map scene and js/ui.js's POV
// viewer -- its own THREE.Scene/camera/renderer, its own gesture handling --
// so it can be lazily created only once this page is actually opened, and
// paused (not torn down) whenever the user navigates away.
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
// ---- Why movement is anchored to a centerline instead of free 2D roaming ----
// Earlier versions let the joystick move the camera freely in world X/Z,
// height-followed via a bilinear lookup into the heightmap's `heights` grid
// and blocked from leaving `walkable` cells. That mostly worked, but the
// `walkable` mask is a per-cell threshold test on a somewhat noisy raycast
// grid -- it can OK a cell that's technically part of the coherent surface
// but visually sits at a bad angle or past where the path bends, so an
// unsteered straight walk could drift off the actual gray path and read as
// the camera "flying" or clipping into the mesh's messier parts. Fixed here
// by precomputing a single-file centerline polyline (`centerline` +
// `centerlineCumDist` in the heightmap JSON -- one averaged, smoothed point
// per grid row, arc-length-parameterized) that follows the real path down
// the middle of the scanned corridor. The joystick's forward/back component
// now just advances/retreats a distance along that line; left/right strafe
// is ignored entirely. Position is read directly off the line every frame
// (no smoothing lag to overshoot), so the camera can only ever be exactly on
// the path, at the path's real height, moving in a straight line along it --
// never sideways into the mesh, never floating above or below it.
(function () {
  var MODEL_URL = 'models/GATE2LHSdt.glb';
  var HEIGHTMAP_URL = 'data/walkthroughPathHeightmap.json';
  // GATE2LHSdt.glb's raw scan axes aren't gravity-aligned -- confirmed via a
  // third-party viewer (glb.ee) that auto-corrects it with a ~+80deg rotation
  // about X on import. Without this, straight-down raycasting slices through
  // the corridor sideways instead of from above, which is what made earlier
  // heightmap attempts on this file (and LHS2Canteendt.glb) look catastrophically
  // warped. The heightmap JSON below was rebuilt AFTER applying this same
  // rotation, so both must travel together -- don't change one without the other.
  var MODEL_ROTATE_X_DEG = 80;

  var stage, canvas, loadingEl, hintEl, toastEl, joyBaseEl, joyNubEl;
  var renderer, scene, camera;
  var hm = null; // parsed heightmap JSON
  var modelReady = false, hmReady = false;

  var pos = { x: 0, y: 0, z: 0 };
  var yaw = 0, pitch = 0;
  // Capped well below level (rather than the ~90deg a real look-up would
  // allow) on purpose: the raw scan's tree canopy overhead is one of the
  // roughest/most fragmented parts of the reconstruction, so letting the
  // camera tilt up into it would show the worst-looking geometry in the
  // whole model. Looking down is unrestricted-ish since the ground/path is
  // the reliable part of the reconstruction.
  var MIN_PITCH = -0.75, MAX_PITCH = 0; // ~-43deg..0deg -- never above dead level

  var eyeHeight = 2, moveSpeed = 3, cellSize = 1;
  var pathDist = 0; // distance walked along hm.centerline, clamped to its length

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
    // Without these two lines the GLTF's real photo textures render dark and
    // washed-out (three.js r128 defaults to linear output, but the baked
    // textures are sRGB) -- this is what makes the raw scan look far rougher
    // in-app than the same file looks in a proper glTF viewer.
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
    }

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
        // here would desync it from the ground/collision data. The rotation
        // below corrects the scan's tilted axes (see MODEL_ROTATE_X_DEG note
        // above) -- the heightmap is built in this SAME rotated space.
        if (MODEL_ROTATE_X_DEG) {
          gltf.scene.rotation.x = MODEL_ROTATE_X_DEG * Math.PI / 180;
        }
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

        // Spawn at the start of the centerline (Point A) and derive facing
        // from its first segment's real direction (toward Point B), rather
        // than the old separately-eyeballed hm.spawn -- keeps the visible
        // starting view and the walkable line it's describing in sync by
        // construction, instead of by two numbers happening to agree.
        pathDist = 0;
        var p0 = sampleCenterline(0);
        pos.x = p0.x; pos.z = p0.z; pos.y = p0.y + eyeHeight;
        var p1 = sampleCenterline(Math.min(1, hm.centerlineCumDist[hm.centerlineCumDist.length - 1]));
        yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);
        // Nearly level -- with eye height back up around normal standing
        // height, a bigger downward tilt just points straight at the gravel
        // a couple feet ahead instead of showing the path stretching out
        // and the canopy arching overhead.
        pitch = -0.04;
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

  // ---- centerline sampling: given a distance along the precomputed path,
  // find which segment it falls in and lerp x/y/z within it. Only ~45
  // points, so a linear scan is plenty fast -- no need for anything fancier. ----
  function sampleCenterline(dist) {
    var cl = hm.centerline, cum = hm.centerlineCumDist;
    var n = cl.length;
    var last = cum[n - 1];
    if (dist <= 0) return { x: cl[0][0], y: cl[0][1], z: cl[0][2] };
    if (dist >= last) return { x: cl[n - 1][0], y: cl[n - 1][1], z: cl[n - 1][2] };
    for (var i = 1; i < n; i++) {
      if (cum[i] >= dist) {
        var segLen = cum[i] - cum[i - 1];
        var t = segLen > 0 ? (dist - cum[i - 1]) / segLen : 0;
        var a = cl[i - 1], b = cl[i];
        return {
          x: a[0] + (b[0] - a[0]) * t,
          y: a[1] + (b[1] - a[1]) * t,
          z: a[2] + (b[2] - a[2]) * t
        };
      }
    }
    return { x: cl[n - 1][0], y: cl[n - 1][1], z: cl[n - 1][2] };
  }

  // Local direction the path is running at a given distance along it (unit
  // XZ vector), used to figure out which way "forward" on the joystick
  // should actually move you -- see stepMovement below.
  function pathTangentAt(dist) {
    var maxDist = hm.centerlineCumDist[hm.centerlineCumDist.length - 1];
    var eps = 0.05;
    var a = sampleCenterline(clamp(dist - eps, 0, maxDist));
    var b = sampleCenterline(clamp(dist + eps, 0, maxDist));
    var dx = b.x - a.x, dz = b.z - a.z;
    var len = Math.hypot(dx, dz) || 1;
    return { x: dx / len, z: dz / len };
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

  // ---- per-frame movement: joystick forward/back only, advancing/retreating
  // a distance along the precomputed centerline. Left/right strafe is read
  // by the joystick but intentionally ignored here -- see the header comment
  // for why free 2D movement got dropped. Position is read straight off the
  // line each frame (it's already smoothed offline), so there's no runtime
  // lag to overshoot into a "floating" look, and no way to end up beside the
  // path instead of on it.
  //
  // "Forward" is relative to where you're currently LOOKING, not a fixed
  // walk direction -- turn around and pushing up on the joystick walks you
  // back the way you came (in view terms), same as any normal FPS control,
  // even though under the hood it's still just one number (distance along
  // the path) moving up or down. Which way that is gets figured out each
  // frame by comparing the camera's facing direction to the path's own
  // local direction at the current spot. ----
  function stepMovement(dt) {
    if (!hm) return;
    var joyAmount = clamp(joyVec.y, -1, 1);
    if (Math.abs(joyAmount) < 0.05) return;

    var fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
    var tangent = pathTangentAt(pathDist);
    var alignment = fwdX * tangent.x + fwdZ * tangent.z; // facing with the path (+1) or against it (-1)
    var dirSign = alignment >= 0 ? 1 : -1;

    var maxDist = hm.centerlineCumDist[hm.centerlineCumDist.length - 1];
    var newDist = clamp(pathDist + dirSign * joyAmount * moveSpeed * dt, 0, maxDist);
    if (newDist === pathDist) showFenceToast(); // hit either end of the path
    pathDist = newDist;

    var p = sampleCenterline(pathDist);
    pos.x = p.x; pos.z = p.z;
    pos.y = p.y + eyeHeight;
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
  // The joystick's visual is fixed (via CSS) at the bottom-middle of the
  // stage and never moves. Its touch CATCHMENT is more generous than its
  // graphic though: starting a touch anywhere in the bottom JOY_ZONE_FRAC of
  // the stage grabs it, so you don't need to land your thumb precisely on a
  // 96px circle -- the nub then clamps toward your drag position measured
  // from the fixed base center. Everywhere above that band is look-drag.
  var JOY_ZONE_FRAC = 0.34;

  function bindGestures() {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUpMaybe);
  }

  function isInJoystickZone(clientY) {
    var r = stage.getBoundingClientRect();
    return (clientY - r.top) > r.height * (1 - JOY_ZONE_FRAC);
  }

  function fixedJoyCenter() {
    if (!joyBaseEl) return { x: 0, y: 0 };
    var r = joyBaseEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    if (hintEl && !hintEl.classList.contains('wt-hidden')) {
      hintEl.classList.add('wt-hidden');
    }

    if (isInJoystickZone(e.clientY) && joyPointerId === null) {
      joyPointerId = e.pointerId;
      joyCenter = fixedJoyCenter();
      joyVec = { x: 0, y: 0 };
      if (joyBaseEl) joyBaseEl.classList.add('wt-active');
      onPointerMove(e); // apply the initial touch-down offset immediately
    } else if (!isInJoystickZone(e.clientY) && lookPointerId === null) {
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
      yaw -= ddx * 0.005;
      pitch = clamp(pitch - ddy * 0.005, MIN_PITCH, MAX_PITCH);
      e.preventDefault();
    }
  }

  function endJoystick() {
    joyPointerId = null; joyCenter = null; joyVec = { x: 0, y: 0 };
    setJoystickNub(0, 0);
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
