let scene, camera, renderer, raycaster, mouse;
let campusData = null;
let buildingMeshes = [];       // { mesh, data }
let pathLine = null;
let waypointMap = {};          // id → waypoint object (for pathfinding + gps)
let gpsMarker = null;
let currentGPSPosition = null;   // { x, z } in Three.js scene coords — updated by gps.js

window.addEventListener('DOMContentLoaded', () => {
  initScene();
  loadCampus();
  initControls();
  animate();
});

// Three.js scene setup
function initScene() {
  const canvas = document.getElementById('three-canvas');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB); // sky blue

  // Camera: tilted top-down (the OSM-style view)
  const aspect = canvas.clientWidth / canvas.clientHeight || window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(45, aspect, 1, 5000);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
  renderer.shadowMap.enabled = true;

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(300, 500, 200);
  sun.castShadow = true;
  scene.add(sun);

  window.addEventListener('resize', onResize);
}

function onResize() {
  const canvas = document.getElementById('three-canvas');
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

//load campus.json and build scene
function loadCampus() {
  fetch('data/campus.json')
    .then(r => r.json())
    .then(data => {
      campusData = data;

      // Build waypoint lookup map (used by pathfinding.js + gps.js)
      waypointMap = {};
      data.waypoints.forEach(wp => { waypointMap[wp.id] = wp; });

      buildGround(data.ground);
      buildRoads(data.waypoints);
      buildBuildings(data.buildings);
      positionCamera(data.camera);

      // GPS blue dot (gps.js)
      if (typeof initGPS === 'function') initGPS(data);

      // Notify ui.js that the scene is ready
      if (typeof onSceneReady === 'function') onSceneReady(data);
    })
    .catch(err => console.error('Failed to load campus.json:', err));
}

function buildGround(g) {
  let material;
  if (g.texture) {
    const tex = new THREE.TextureLoader().load(g.texture);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    material = new THREE.MeshLambertMaterial({ map: tex });
  } else {
    material = new THREE.MeshLambertMaterial({ color: g.color });
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(g.width, g.depth),
    material
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(g.offsetX, 0, g.offsetZ);
  ground.receiveShadow = true;
  scene.add(ground);
}

function buildRoads(waypoints) {
  // Determine which edges belong to each zone (for width/color)
  const zone1Chain = [
    'main_gate','inner_gate','z1_int1','z1_int2','z1_int3',
    'z1_int4','z1_int5','z1_int6','z1_int7','z1_int8',
    'z1_int9','z1_int10','z1_int11','z1_int12'
  ];
  const zone2Chain = [
    'z2_start','z2_wp1','z2_wp2','z2_wp3','z2_wp4',
    'z2_wp5','z2_wp6','z2_wp7','z2_end'
  ];

  const mainEdges  = new Set();
  const addChain = (chain) => {
    for (let i = 0; i < chain.length - 1; i++) {
      mainEdges.add(edgeKey(chain[i], chain[i+1]));
    }
  };
  addChain(zone1Chain);
  addChain(zone2Chain);

  // Materials
  const matMain  = new THREE.MeshLambertMaterial({ color: 0x9a9a9a }); // gray tarmac
  const matPath  = new THREE.MeshLambertMaterial({ color: 0xc0b090 }); // beige path

  // The unpaved path sits below the main road's height so wherever they cross,
  // the main road renders on top instead of the two fighting for the same
  // z-height (which looked like the path clipping/cutting through the road).
  const ROAD_Y_MAIN = 0.15;
  const ROAD_Y_PATH = 0.00;

  // Track drawn edges so we don't double-draw
  const drawn = new Set();

  waypoints.forEach(wp => {
    const [ax, az] = [wp.position.x, wp.position.z];
    wp.neighbors.forEach(nid => {
      const key = edgeKey(wp.id, nid);
      if (drawn.has(key)) return;
      drawn.add(key);

      const nb = waypointMap[nid];
      if (!nb) return;
      const [bx, bz] = [nb.position.x, nb.position.z];

      const isMain = mainEdges.has(key);
      const roadWidth = isMain ? 7 : 3.5;
      const mat = isMain ? matMain : matPath;
      const roadY = isMain ? ROAD_Y_MAIN : ROAD_Y_PATH;

      buildRoadStrip(ax, az, bx, bz, roadWidth, mat, roadY);

      if (isMain) {
        buildCenterLine(ax, az, bx, bz);
      }
    });
  });

  // Plug the seams: each edge above is its own flat rectangle with a flat end,
  // so anywhere 2+ edges meet at an angle (a bend or a fork) the ends don't
  // line up — you get a gap or an overlapping notch. A small flat circle at
  // every junction covers that seam regardless of the angle between edges.
  waypoints.forEach(wp => {
    if (wp.neighbors.length < 2) return; // dead end — nothing to seam here

    const hasMainEdge = wp.neighbors.some(nid => mainEdges.has(edgeKey(wp.id, nid)));
    const width = hasMainEdge ? 7 : 3.5;
    const mat = hasMainEdge ? matMain : matPath;
    const jointY = hasMainEdge ? ROAD_Y_MAIN : ROAD_Y_PATH;

    const joint = new THREE.Mesh(
      new THREE.CircleGeometry(width / 2, 16),
      mat
    );
    joint.rotation.x = -Math.PI / 2;
    joint.position.set(wp.position.x, jointY, wp.position.z);
    joint.receiveShadow = true;
    scene.add(joint);
  });
}

function edgeKey(a, b) {
  return [a, b].sort().join('|');
}

function buildRoadStrip(ax, az, bx, bz, width, mat, y) {
  const dx = bx - ax, dz = bz - az;
  const length = Math.sqrt(dx*dx + dz*dz);
  if (length < 0.1) return;

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.3, width),
    mat
  );
  strip.position.set((ax+bx)/2, y, (az+bz)/2);
  // Three.js Z is forward, X is right
  strip.rotation.y = -Math.atan2(dz, dx);
  strip.receiveShadow = true;
  scene.add(strip);
}

function buildCenterLine(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const length = Math.sqrt(dx*dx + dz*dz);
  const angle = -Math.atan2(dz, dx);
  const dashLen = 3, gapLen = 4, total = dashLen + gapLen;
  const count = Math.floor(length / total);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.5 });

  for (let i = 0; i < count; i++) {
    const t = (i * total + dashLen / 2) / length;
    const cx = ax + dx * t;
    const cz = az + dz * t;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(dashLen, 0.32, 0.4), mat);
    dash.position.set(cx, 0.16, cz);
    dash.rotation.y = angle;
    scene.add(dash);
  }
}

function buildBuildings(buildings) {
  buildingMeshes = [];

  buildings.forEach(bldg => {
    // If a real mesh file exists, load the GLB. Otherwise spawn a box.
    if (bldg.glbModel) {
      loadGLB(bldg);
    } else {
      spawnBox(bldg);
    }
  });
}

function spawnBox(bldg) {
  const { width, depth, height } = bldg.size;
  const color = parseInt(bldg.color.replace('#',''), 16);

  // Box body
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    mat
  );
  mesh.position.set(bldg.position.x, height / 2, bldg.position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { buildingId: bldg.id };
  scene.add(mesh);

  const roofColor = darkenColor(color, 0.75);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.5, 0.5, depth + 0.5),
    new THREE.MeshLambertMaterial({ color: roofColor })
  );
  roof.position.set(bldg.position.x, height + 0.25, bldg.position.z);
  scene.add(roof);

  buildingMeshes.push({ mesh, data: bldg });
}

function loadGLB(bldg) {
  // GLTFLoader is loaded via js/vendor/GLTFLoader.js (matches r128 core).
  // Loads Jonathan/Shane's Agisoft Metashape GLB exports.
  const loader = new THREE.GLTFLoader();

  loader.load(
    bldg.glbModel,
    (gltf) => {
      const model = gltf.scene;
      model.position.set(bldg.position.x, 0, bldg.position.z);
      model.rotation.y = THREE.MathUtils.degToRad(bldg.rotation || 0);
      model.userData = { buildingId: bldg.id };

      model.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.userData.buildingId = bldg.id;
        }
      });

      scene.add(model);
      buildingMeshes.push({ mesh: model, data: bldg });
      console.log(`GLB loaded: ${bldg.id} → ${bldg.glbModel}`);
    },
    undefined,
    (err) => {
      console.error(`Failed to load GLB for ${bldg.id} (${bldg.glbModel}):`, err);
      spawnBox(bldg); // fall back to graybox if the model fails to load
    }
  );
}

function darkenColor(hex, factor) {
  const r = Math.round(((hex >> 16) & 0xff) * factor);
  const g = Math.round(((hex >>  8) & 0xff) * factor);
  const b = Math.round(( hex        & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

// camOffset = camera.position - camera.lookAt, stored on first load.
// Every pan/zoom preserves this offset so the tilt angle never resets.
let camOffset = { x: -200, y: 220, z: 200 }; // safe default; overwritten by positionCamera

function positionCamera(cam) {
  camera.position.set(cam.position.x, cam.position.y, cam.position.z);
  camera.lookAt(cam.lookAt.x, cam.lookAt.y, cam.lookAt.z);
  lookTarget.x = cam.lookAt.x;
  lookTarget.y = cam.lookAt.y;
  lookTarget.z = cam.lookAt.z;
  camOffset.x = cam.position.x - cam.lookAt.x;
  camOffset.y = cam.position.y - cam.lookAt.y;
  camOffset.z = cam.position.z - cam.lookAt.z;
}

function onPointerDown(e) {
  if (!campusData) return;

  const canvas = document.getElementById('three-canvas');
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  mouse.x =  ((clientX - rect.left) / rect.width)  * 2 - 1;
  mouse.y = -((clientY - rect.top)  / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const meshes = buildingMeshes.map(b => b.mesh);
  // recursive: true so hits register on meshes inside a loaded GLTF group, not just single boxes
  const hits = raycaster.intersectObjects(meshes, true);

  if (hits.length > 0) {
    let hit = hits[0].object;
    while (hit && !hit.userData?.buildingId && hit.parent) hit = hit.parent;
    const bId = hit?.userData?.buildingId;
    const bObj = buildingMeshes.find(b => b.data.id === bId);
    if (bObj) selectBuilding(bObj.data);
    else deselectBuilding();
  } else {
    deselectBuilding();
  }
}

// Sets emissive highlight on a mesh, or every emissive-capable mesh inside a GLTF group
function setEmissive(meshObj, hex) {
  if (meshObj.isMesh && meshObj.material && meshObj.material.emissive !== undefined) {
    meshObj.material.emissive.setHex(hex);
  } else if (meshObj.traverse) {
    meshObj.traverse(child => {
      if (child.isMesh && child.material && child.material.emissive !== undefined) {
        child.material.emissive.setHex(hex);
      }
    });
  }
}

function selectBuilding(bldg) {
  selectedBuilding = bldg;

  // Highlight selected building (slight emissive) — works for boxes and loaded GLB models
  buildingMeshes.forEach(b => {
    setEmissive(b.mesh, b.data.id === bldg.id ? 0x444444 : 0x000000);
  });

  // Tell ui.js to show the info panel
  if (typeof showBuildingInfo === 'function') showBuildingInfo(bldg);
}

function deselectBuilding() {
  selectedBuilding = null;
  buildingMeshes.forEach(b => {
    setEmissive(b.mesh, 0x000000);
  });
  if (typeof hideBuildingInfo === 'function') hideBuildingInfo();
  //  Do NOT clearPath() here — path must persist while user pans the map
}

function navigateTo(targetBuildingId) {
  if (!campusData) return;

  // Origin: nearest waypoint to user's GPS position or main_gate as fallback
  let originWpId = 'main_gate';
  if (currentGPSPosition) {
    let bestId = null, bestDist = Infinity;
    Object.values(waypointMap).forEach(wp => {
      const dx = wp.position.x - currentGPSPosition.x;
      const dz = wp.position.z - currentGPSPosition.z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) { bestDist = d; bestId = wp.id; }
    });
    if (bestId) originWpId = bestId;
  }
  const targetBldg = campusData.buildings.find(b => b.id === targetBuildingId);
  if (!targetBldg) return;
  const targetWpId = targetBldg.entryWaypoint;

  if (typeof findPath !== 'function') return;

  const pathIds = findPath(waypointMap, originWpId, targetWpId);
  if (!pathIds || pathIds.length === 0) return;

  drawPath(pathIds, currentGPSPosition);

  if (typeof showPathInfo === 'function') showPathInfo(pathIds, targetBldg);
}

function drawPath(waypointIds, fromPos) {
  clearPath();

  // Use flat box strips instead of THREE.Line — linewidth is ignored on iOS/WebGL.
  // Same technique as buildRoadStrip but raised higher and orange-colored.
  const pathMat  = new THREE.MeshBasicMaterial({ color: 0xf39c12 }); // orange
  const stripW   = 3.5; // width of path strip in scene units

  // If user is on campus, draw a connector from the GPS blue dot to the first waypoint
  if (fromPos && waypointIds.length > 0) {
    const firstWp = waypointMap[waypointIds[0]];
    if (firstWp) {
      const dx = firstWp.position.x - fromPos.x;
      const dz = firstWp.position.z - fromPos.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      if (length > 0.5) {
        const connector = new THREE.Mesh(new THREE.BoxGeometry(length, 0.5, stripW), pathMat);
        connector.position.set((fromPos.x + firstWp.position.x) / 2, 0.6, (fromPos.z + firstWp.position.z) / 2);
        connector.rotation.y = -Math.atan2(dz, dx);
        connector.userData.isPathDot = true;
        scene.add(connector);
      }
    }
  }

  for (let i = 0; i < waypointIds.length - 1; i++) {
    const a = waypointMap[waypointIds[i]];
    const b = waypointMap[waypointIds[i + 1]];
    if (!a || !b) continue;
    const ax = a.position.x, az = a.position.z;
    const bx = b.position.x, bz = b.position.z;
    const dx = bx - ax, dz = bz - az;
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length < 0.1) continue;

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.5, stripW),
      pathMat
    );
    strip.position.set((ax + bx) / 2, 0.6, (az + bz) / 2);
    strip.rotation.y = -Math.atan2(dz, dx);
    strip.userData.isPathDot = true;
    scene.add(strip);
  }

  const dotMat = new THREE.MeshBasicMaterial({ color: 0xf39c12 });
  waypointIds.forEach(id => {
    const wp = waypointMap[id];
    if (!wp) return;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), dotMat);
    dot.position.set(wp.position.x, 0.8, wp.position.z);
    dot.userData.isPathDot = true;
    scene.add(dot);
  });

  // Destination marker tall red pin so it's easy to spot
  const lastWp = waypointMap[waypointIds[waypointIds.length - 1]];
  if (lastWp) {
    const pinMat = new THREE.MeshBasicMaterial({ color: 0xe74c3c });
    const pinSphere = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 12), pinMat);
    pinSphere.position.set(lastWp.position.x, 8, lastWp.position.z);
    pinSphere.userData.isPathDot = true;
    scene.add(pinSphere);
    const pinStick = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 8, 8), pinMat);
    pinStick.position.set(lastWp.position.x, 4, lastWp.position.z);
    pinStick.userData.isPathDot = true;
    scene.add(pinStick);
  }
}

function clearPath() {
  // Remove all path meshes (strips, dots, pin)
  const toRemove = [];
  scene.traverse(obj => { if (obj.userData.isPathDot) toRemove.push(obj); });
  toRemove.forEach(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
    scene.remove(obj);
  });
  pathLine = null; 

  if (typeof hidePathInfo === 'function') hidePathInfo();
}

// GPS blue dot (called from gps.js)
function updateGPSMarker(x, z, isOnCampus) {
  // null means GPS was turned off — just hide the marker
  if (x === null || z === null) {
    if (gpsMarker) gpsMarker.visible = false;
    currentGPSPosition = null;
    return;
  }
  // Only use as nav origin when actually inside campus bounds (not clamped)
  currentGPSPosition = isOnCampus ? { x, z } : null;
  if (!gpsMarker) {
    // Blue sphere
    gpsMarker = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x3498db })
    );
    gpsMarker.userData.isGPS = true;
    scene.add(gpsMarker);
  }
  // Off campus: hide it instead of showing it clamped to the bounding-box edge —
  // the ground is an irregular quad, not a rectangle, so a clamped position can
  // land outside the visible green area and look like it's floating off the map.
  if (!isOnCampus) {
    gpsMarker.visible = false;
    return;
  }
  gpsMarker.visible = true;
  gpsMarker.position.set(x, 2.5, z);
}

const TAP_THRESHOLD = 12;
let _tapX = 0, _tapY = 0;

function initControls() {
  const canvas = document.getElementById('three-canvas');

  canvas.addEventListener('pointerdown', e => {
    _tapX = e.clientX;
    _tapY = e.clientY;
    panStart(e);
  });
  canvas.addEventListener('pointermove', panMove);
  canvas.addEventListener('pointerup', e => {
    panEnd();
    // Only do building hit-test on a real tap (not the end of a drag)
    const dx = Math.abs(e.clientX - _tapX);
    const dy = Math.abs(e.clientY - _tapY);
    if (dx < TAP_THRESHOLD && dy < TAP_THRESHOLD) {
      onPointerDown({ clientX: _tapX, clientY: _tapY });
    }
  });
  canvas.addEventListener('pointercancel', panEnd);

  // Touch events for mobile pinch-zoom
  canvas.addEventListener('touchstart',  onTouchStart, { passive: false });
  canvas.addEventListener('touchmove',   onTouchMove,  { passive: false });
  canvas.addEventListener('touchend',    onTouchEnd);

  // Mouse wheel zoom
  canvas.addEventListener('wheel', onWheel, { passive: false });
}

// Pan state
const pan = { active: false, lastX: 0, lastY: 0, mode: 'pan' };
// what the camera orbits around / pans over
const lookTarget = { x: 700, y: 0, z: -80 };

function panStart(e) {
  pan.active = true;
  // Shift+drag rotates instead of panning — a one-pointer stand-in for the
  // two-finger rotate gesture below, so rotation is also testable with a mouse.
  pan.mode = e.shiftKey ? 'rotate' : 'pan';
  pan.lastX = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
  pan.lastY = e.clientY ?? (e.touches?.[0]?.clientY ?? 0);
}

function panMove(e) {
  if (!pan.active || !campusData) return;
  const cx = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
  const cy = e.clientY ?? (e.touches?.[0]?.clientY ?? 0);
  const dx = cx - pan.lastX;
  const dy = cy - pan.lastY;
  pan.lastX = cx;
  pan.lastY = cy;

  if (pan.mode === 'rotate') {
    rotateCamera(-dx * ROTATE_SPEED, dy * TILT_SPEED);
    return;
  }

  const speed = camOffset.y * 0.002;
  lookTarget.x -= dx * speed;
  lookTarget.z -= dy * speed * 0.6;

  // Clamp to campus bounds
  const b = campusData.bounds;
  lookTarget.x = Math.max(b.minX, Math.min(b.maxX, lookTarget.x));
  lookTarget.z = Math.max(b.minZ, Math.min(b.maxZ, lookTarget.z));

  updateCameraFromTarget();
}

function panEnd() { pan.active = false; }

// Zoom + rotate state (two-finger gesture does both at once, like most map apps)
let pinchStartDist  = null;
let pinchStartY     = null;
let twoFingerLastX  = null;
let twoFingerLastY  = null;

function onTouchStart(e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    pinchStartDist = getTouchDist(e.touches);
    pinchStartY    = camera.position.y;
    const mid = getTouchMidpoint(e.touches);
    twoFingerLastX = mid.x;
    twoFingerLastY = mid.y;
    pan.active = false; // cancel single-finger pan during a two-finger gesture
  }
}

function onTouchMove(e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dist = getTouchDist(e.touches);
    if (pinchStartDist && pinchStartY !== null) {
      const scale = pinchStartDist / dist;
      zoomCamera(pinchStartY * scale);
    }

    // Dragging both fingers together (not apart/together, which is the pinch above)
    // rotates the view: sideways = spin around lookTarget, up/down = tilt the angle.
    const mid = getTouchMidpoint(e.touches);
    if (twoFingerLastX !== null) {
      const dx = mid.x - twoFingerLastX;
      const dy = mid.y - twoFingerLastY;
      rotateCamera(-dx * ROTATE_SPEED, dy * TILT_SPEED);
    }
    twoFingerLastX = mid.x;
    twoFingerLastY = mid.y;
  }
}

function onTouchEnd() {
  pinchStartDist = null;
  pinchStartY    = null;
  twoFingerLastX = null;
  twoFingerLastY = null;
}

function onWheel(e) {
  e.preventDefault();
  zoomCamera(camera.position.y + e.deltaY * 0.3);
}

function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx*dx + dy*dy);
}

function getTouchMidpoint(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

function zoomCamera(newY) {
  const clampedY = Math.max(50, Math.min(500, newY));
  // Scale the whole offset so the tilt angle is preserved at every zoom level
  const scale = clampedY / camOffset.y;
  camOffset.x *= scale;
  camOffset.y  = clampedY;
  camOffset.z *= scale;
  updateCameraFromTarget();
}

// Requested by the thesis coordinator (2026-08-29): Navigate Now's camera can now
// orbit around lookTarget instead of being locked to one fixed top-down angle.
// camOffset is treated as a spherical vector (radius r, elevation theta, azimuth phi)
// so rotating only ever changes direction, never magnitude — zoom (above) still
// controls distance/height independently.
const MIN_ELEVATION = THREE.MathUtils.degToRad(25); // floor: camera can never graze/dip into the ground plane
const MAX_ELEVATION = THREE.MathUtils.degToRad(85); // ceiling: never flips to a straight-down, disorienting view
const ROTATE_SPEED = 0.006;  // radians per pixel of horizontal drag
const TILT_SPEED   = 0.004;  // radians per pixel of vertical drag

function rotateCamera(deltaAzimuth, deltaElevation) {
  const r = Math.sqrt(camOffset.x ** 2 + camOffset.y ** 2 + camOffset.z ** 2);
  let theta = Math.asin(camOffset.y / r);              // elevation above the horizontal plane
  let phi   = Math.atan2(camOffset.z, camOffset.x);    // azimuth around the vertical (Y) axis

  phi   += deltaAzimuth;
  theta = Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, theta + deltaElevation));

  camOffset.x = r * Math.cos(theta) * Math.cos(phi);
  camOffset.y = r * Math.sin(theta);
  camOffset.z = r * Math.cos(theta) * Math.sin(phi);

  updateCameraFromTarget();
}

function updateCameraFromTarget() {
  // tilt angle never changes
  camera.position.set(
    lookTarget.x + camOffset.x,
    lookTarget.y + camOffset.y,
    lookTarget.z + camOffset.z
  );
  camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
}

// Only render when map page is visible  prevents sky-blue canvas bleeding
// through on other pages (iOS treats opacity:0 layers differently from display:none)
function animate() {
  requestAnimationFrame(animate);
  const mapPage = document.getElementById('page-map');
  if (mapPage && mapPage.classList.contains('active')) {
    renderer.render(scene, camera);
  }
}

function zoomIn()  { zoomCamera(camera ? camera.position.y - 40 : 220); }
function zoomOut() { zoomCamera(camera ? camera.position.y + 40 : 220); }

// public API (called by ui.js / pathfinding.js / gps.js) 
// navigateTo(buildingId)   — draw A* path to building
// clearPath()              — remove path line
// updateGPSMarker(x, z)   — move blue dot
// selectBuilding(bldg)     — highlight + show info
// deselectBuilding()       — clear selection
// zoomIn() / zoomOut()     — called by map-ctrl-btn buttons