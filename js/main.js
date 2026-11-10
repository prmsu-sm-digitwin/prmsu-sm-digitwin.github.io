let scene, camera, renderer, raycaster, mouse;
let campusData = null;
let buildingMeshes = [];
let pathLine = null;
let waypointMap = {};
let gpsMarker = null;
let youHereOn = true;
let gpsTarget = null;
let currentGPSPosition = null;

window.addEventListener('DOMContentLoaded', () => {
  initScene();
  loadCampus();
  initControls();
  animate();
});

function initScene() {
  const canvas = document.getElementById('three-canvas');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7cb87a);

  const aspect = canvas.clientWidth / canvas.clientHeight || window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(45, aspect, 1, 5000);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));  // 2 made phones draw ~78% more pixels
  renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
  // Shadows are off: the sun's shadow camera only covered a ~10 unit patch of the
  // 1300 unit campus, so the extra shadow pass cost frame time and showed nothing.
  renderer.shadowMap.enabled = false;

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(300, 500, 200);
  sun.castShadow = false;
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

function loadCampus() {
  fetch('data/campus.json')
    .then(r => r.json())
    .then(data => {
      campusData = data;

      waypointMap = {};
      data.waypoints.forEach(wp => { waypointMap[wp.id] = wp; });

      buildGround(data.ground);
      buildRoads(data.waypoints);
      (data.ovals || []).forEach(buildOval);
      buildBuildings(data.buildings);
      if (window.NavFP) NavFP.onCampusLoaded(data);
      positionCamera(data.camera);

      if (typeof initGPS === 'function') initGPS(data);

      if (typeof onSceneReady === 'function') onSceneReady(data);
    })
    .catch(err => console.error('Failed to load campus.json:', err));
}

function buildOval(oval) {
  const { center, majorAxis, minorAxis, trackWidth, rotation } = oval;
  const radius = minorAxis / 2;
  const straight = Math.max(0, majorAxis - minorAxis);
  const halfStraight = straight / 2;

  function stadiumShape(halfLen, r) {
    const shape = new THREE.Shape();
    shape.moveTo(-halfLen, r);
    shape.lineTo(halfLen, r);
    shape.absarc(halfLen, 0, r, Math.PI / 2, -Math.PI / 2, true);
    shape.lineTo(-halfLen, -r);
    shape.absarc(-halfLen, 0, r, -Math.PI / 2, Math.PI / 2, true);
    return shape;
  }

  const group = new THREE.Group();

  const trackColor = parseInt((oval.trackColor || '#b5651d').replace('#', ''), 16);
  const trackMat = new THREE.MeshLambertMaterial({ color: trackColor });
  const trackMesh = new THREE.Mesh(
    new THREE.ShapeGeometry(stadiumShape(halfStraight, radius)),
    trackMat
  );
  trackMesh.rotation.x = -Math.PI / 2;
  trackMesh.position.y = 0.15;
  trackMesh.receiveShadow = true;
  group.add(trackMesh);

  const innerR = Math.max(0.1, radius - trackWidth);
  const innerHalfStraight = Math.max(0, halfStraight - trackWidth);
  const fieldColor = parseInt((oval.fieldColor || '#4caf50').replace('#', ''), 16);
  const fieldMat = new THREE.MeshLambertMaterial({ color: fieldColor });
  const fieldMesh = new THREE.Mesh(
    new THREE.ShapeGeometry(stadiumShape(innerHalfStraight, innerR)),
    fieldMat
  );
  fieldMesh.rotation.x = -Math.PI / 2;
  fieldMesh.position.y = 0.25;
  fieldMesh.receiveShadow = true;
  group.add(fieldMesh);

  group.position.set(center.x, 0, center.z);
  group.rotation.y = THREE.MathUtils.degToRad(rotation || 0);
  scene.add(group);
}

function buildGround(g) {
  let material;
  if (g.texture) {
    const tex = new THREE.TextureLoader().load(g.texture);
    if (g.textureTile) {
      // Tiled ground (e.g. the grass image): one tile every textureTile world units.
      // Mirrored repeat hides the seams between tiles.
      tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
      tex.repeat.set(g.width / g.textureTile, g.depth / g.textureTile);
      tex.anisotropy = 4;
    } else {
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    }
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

  const backing = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    new THREE.MeshLambertMaterial({ color: (g.texture && g.backingColor) ? g.backingColor : (g.color || 0x7cb87a) })
  );
  backing.rotation.x = -Math.PI / 2;
  backing.position.set(g.offsetX, -0.3, g.offsetZ);
  scene.add(backing);
}

const PATH_WIDTH = 5;
const PATH_Y     = 0.2;

function buildRoads(waypoints) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x9a9a9a });

  const drawn = new Set();
  waypoints.forEach(wp => {
    const [ax, az] = [wp.position.x, wp.position.z];
    wp.neighbors.forEach(nid => {
      const key = edgeKey(wp.id, nid);
      if (drawn.has(key)) return;
      drawn.add(key);
      const nb = waypointMap[nid];
      if (!nb) return;
      buildRoadStrip(ax, az, nb.position.x, nb.position.z, PATH_WIDTH, mat, PATH_Y);
    });
  });

  waypoints.forEach(wp => {
    if (wp.neighbors.length < 2) return;
    const joint = new THREE.Mesh(new THREE.CircleGeometry(PATH_WIDTH / 2, 16), mat);
    joint.rotation.x = -Math.PI / 2;
    joint.position.set(wp.position.x, PATH_Y + 0.2, wp.position.z);
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
  strip.rotation.y = -Math.atan2(dz, dx);
  strip.receiveShadow = true;
  scene.add(strip);
}

let placeBlockMeshes = [];

let placeGen = 0;

function spawnPlaceBox(p) {
  const { width, depth, height } = p.size;
  const color = parseInt((p.color || '#7f8c8d').replace('#', ''), 16);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.position.set(p.position.x, height / 2 + 0.5, p.position.z);
  mesh.rotation.y = THREE.MathUtils.degToRad(p.rotation || 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'place:' + (p.name || p.id);
  scene.add(mesh);
  placeBlockMeshes.push(mesh);
}

// >>> mergeStaticMeshes
// A model made of hundreds of small objects (pebbles, flowers, hedge pieces) costs one
// draw call per object, which makes phones stutter. After loading, this joins all meshes
// that share a material into one mesh. The picture is identical and the .glb stays small,
// because the file keeps its shared copies and only the in-memory copy is merged.
function mergeStaticMeshes(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  root.traverse(c => {
    if (!c.isMesh || c.isSkinnedMesh || c.isInstancedMesh || !c.geometry || !c.geometry.attributes.position) return;
    if (c.userData && c.userData.isNameTag) return;
    if (Array.isArray(c.material)) return;
    const key = c.material.uuid;
    if (!groups.has(key)) groups.set(key, { material: c.material, meshes: [] });
    groups.get(key).meshes.push(c);
  });

  const m4 = new THREE.Matrix4(), n3 = new THREE.Matrix3(), v = new THREE.Vector3();
  groups.forEach(g => {
    if (g.meshes.length < 2) return;
    const hasUV = g.meshes.every(m => m.geometry.attributes.uv);
    const hasColor = g.meshes.every(m => m.geometry.attributes.color && m.geometry.attributes.color.itemSize === 3);
    let vTotal = 0, iTotal = 0;
    g.meshes.forEach(m => {
      const geo = m.geometry, pc = geo.attributes.position.count;
      vTotal += pc; iTotal += geo.index ? geo.index.count : pc;
    });
    const pos = new Float32Array(vTotal * 3), nor = new Float32Array(vTotal * 3);
    const uv = hasUV ? new Float32Array(vTotal * 2) : null;
    const col = hasColor ? new Float32Array(vTotal * 3) : null;
    const idx = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);
    let vo = 0, io = 0;
    g.meshes.forEach(m => {
      const geo = m.geometry, pa = geo.attributes.position, na = geo.attributes.normal;
      m.updateMatrixWorld(true);
      m4.multiplyMatrices(inv, m.matrixWorld);
      n3.getNormalMatrix(m4);
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(m4);
        pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
        if (na) {
          v.fromBufferAttribute(na, i).applyMatrix3(n3).normalize();
          nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
        } else { nor[(vo + i) * 3 + 1] = 1; }
        if (uv) { uv[(vo + i) * 2] = geo.attributes.uv.getX(i); uv[(vo + i) * 2 + 1] = geo.attributes.uv.getY(i); }
        if (col) { const ca = geo.attributes.color; col[(vo + i) * 3] = ca.getX(i); col[(vo + i) * 3 + 1] = ca.getY(i); col[(vo + i) * 3 + 2] = ca.getZ(i); }
      }
      // A negative scale (mirrored copy) flips the triangle winding, so flip it back.
      const flip = m4.determinant() < 0;
      const n = geo.index ? geo.index.count : pa.count;
      for (let i = 0; i < n; i += 3) {
        const a = geo.index ? geo.index.getX(i)     : i;
        const b = geo.index ? geo.index.getX(i + 1) : i + 1;
        const c = geo.index ? geo.index.getX(i + 2) : i + 2;
        idx[io++] = vo + a;
        idx[io++] = vo + (flip ? c : b);
        idx[io++] = vo + (flip ? b : c);
      }
      vo += pa.count;
    });
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal',   new THREE.BufferAttribute(nor, 3));
    if (uv)  merged.setAttribute('uv',    new THREE.BufferAttribute(uv, 2));
    if (col) merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
    merged.setIndex(new THREE.BufferAttribute(idx, 1));
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, g.material);
    mesh.name = 'merged:' + (g.material.name || g.material.uuid.slice(0, 6));
    g.meshes.forEach(m => { if (m.parent) m.parent.remove(m); });
    root.add(mesh);
  });
}
// <<< mergeStaticMeshes

function preparePlaceModel(root, strip) {
  if (strip && strip.length) {
    const drop = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      const names = [o.name || '', (o.parent && o.parent.name) || ''];
      if (strip.some(x => names.some(n => n.startsWith(x)))) drop.push(o);
    });
    drop.forEach(o => o.parent && o.parent.remove(o));
  }
  mergeStaticMeshes(root);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  root.position.set(-c.x, -box.min.y, -c.z);
  wrapper.add(root);
  return { obj: wrapper, nativeSize: { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z } };
}

function spawnPlace(p) {
  if (!p.glbModel) { spawnPlaceBox(p); return; }
  const gen = placeGen;
  new THREE.GLTFLoader().load(
    p.glbModel,
    (gltf) => {
      if (gen !== placeGen) return;
      const { obj, nativeSize } = preparePlaceModel(gltf.scene, p.glbStrip);
      const extra = p.modelScale || 1;
      const sx = nativeSize.x > 1e-6 ? (p.size.width  / nativeSize.x) * extra : extra;
      const sy = nativeSize.y > 1e-6 ? (p.size.height / nativeSize.y) * extra : extra;
      const sz = nativeSize.z > 1e-6 ? (p.size.depth  / nativeSize.z) * extra : extra;
      obj.scale.set(sx, sy, sz);
      obj.position.set(p.position.x, 0.45 + (p.yOffset || 0), p.position.z);
      obj.rotation.y = THREE.MathUtils.degToRad(p.rotation || 0);
      obj.name = 'place:' + (p.name || p.id);
      obj.traverse(ch => { if (ch.isMesh) { ch.castShadow = true; ch.receiveShadow = true; } });
      scene.add(obj);
      placeBlockMeshes.push(obj);
    },
    undefined,
    (err) => {
      console.error(`Failed to load place model ${p.id} (${p.glbModel}):`, err);
      if (gen === placeGen) spawnPlaceBox(p);
    }
  );
}

function buildBuildings(buildings) {
  buildingMeshes = [];
  placeBlockMeshes.forEach(m => scene.remove(m));
  placeBlockMeshes = [];
  placeGen++;

  buildings.forEach(bldg => {
    if (bldg.category === 'place') { spawnPlace(bldg); return; }
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
  const loader = new THREE.GLTFLoader();

  loader.load(
    bldg.glbModel,
    (gltf) => {
      const model = gltf.scene;

      const nativeBox = new THREE.Box3().setFromObject(model);
      const nativeSize = {
        x: nativeBox.max.x - nativeBox.min.x,
        y: nativeBox.max.y - nativeBox.min.y,
        z: nativeBox.max.z - nativeBox.min.z,
      };

      model.position.set(bldg.position.x, bldg.yOffset || 0, bldg.position.z);
      model.rotation.y = THREE.MathUtils.degToRad(bldg.rotation || 0);
      const extra = bldg.modelScale || 1;
      const sx = nativeSize.x > 1e-6 ? (bldg.size.width / nativeSize.x) * extra : extra;
      const sy = nativeSize.y > 1e-6 ? (bldg.size.height / nativeSize.y) * extra : extra;
      const sz = nativeSize.z > 1e-6 ? (bldg.size.depth / nativeSize.z) * extra : extra;
      model.scale.set(sx, sy, sz);
      model.userData = { buildingId: bldg.id };

      const tintColor = bldg.glbTint ? parseInt((bldg.color || '#4a90d9').replace('#', ''), 16) : null;
      const tintMat = tintColor !== null ? new THREE.MeshLambertMaterial({ color: tintColor, side: THREE.DoubleSide }) : null;

      model.traverse(child => {
        if (child.isMesh) {
          if (tintMat) child.material = tintMat;
          child.castShadow = true;
          child.receiveShadow = true;
          child.userData.buildingId = bldg.id;
        }
      });

      mergeStaticMeshes(model);
      scene.add(model);
      buildingMeshes.push({ mesh: model, data: bldg });
      console.log(`GLB loaded: ${bldg.id} → ${bldg.glbModel}`);
    },
    undefined,
    (err) => {
      console.error(`Failed to load GLB for ${bldg.id} (${bldg.glbModel}):`, err);
      spawnBox(bldg);
    }
  );
}

function darkenColor(hex, factor) {
  const r = Math.round(((hex >> 16) & 0xff) * factor);
  const g = Math.round(((hex >>  8) & 0xff) * factor);
  const b = Math.round(( hex        & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

let camOffset = { x: -200, y: 220, z: 200 };

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

  buildingMeshes.forEach(b => {
    setEmissive(b.mesh, b.data.id === bldg.id ? 0x444444 : 0x000000);
  });

  if (typeof showBuildingInfo === 'function') showBuildingInfo(bldg);
}

function deselectBuilding() {
  selectedBuilding = null;
  buildingMeshes.forEach(b => {
    setEmissive(b.mesh, 0x000000);
  });
  if (typeof hideBuildingInfo === 'function') hideBuildingInfo();
}

let _linkedSet = null;
function connectedToMainNetwork() {
  if (_linkedSet) return _linkedSet;
  const seen = new Set(['main_gate']), stack = ['main_gate'];
  while (stack.length) {
    const wp = waypointMap[stack.pop()];
    if (!wp) continue;
    (wp.neighbors || []).forEach(n => { if (!seen.has(n) && waypointMap[n]) { seen.add(n); stack.push(n); } });
  }
  _linkedSet = seen;
  return seen;
}

function navigateTo(targetBuildingId) {
  if (!campusData) return;

  let originWpId = 'main_gate';
  if (currentGPSPosition) {
    let bestId = null, bestDist = Infinity;
    const linked = connectedToMainNetwork();
    Object.values(waypointMap).forEach(wp => {
      if (!linked.has(wp.id)) return;
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
  if (!pathIds || pathIds.length === 0) { if (typeof showGPSToast === 'function') showGPSToast('No route to this place yet.'); return; }

  drawPath(pathIds, currentGPSPosition);
  youHereOn = false;

  if (typeof showPathInfo === 'function') showPathInfo(pathIds, targetBldg);
}

let routeLineGroup = null, routeArrowGroup = null;
let activeRouteIds = null;

function setRouteStyle(firstPerson) {
  if (routeLineGroup)  routeLineGroup.visible  = !firstPerson;
  if (routeArrowGroup) routeArrowGroup.visible =  firstPerson;
}

const ARROW_GEO = (function () {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
     1.5, 0,  0,     -1.0, 0,  1.6,    -0.3, 0, 0,
     1.5, 0,  0,     -0.3, 0,  0,      -1.0, 0, -1.6
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();

function addArrowsAlong(group, ax, az, bx, bz, startOffset, spacing, arrowMat, haloMat) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.sqrt(dx * dx + dz * dz); 
  if (len < 0.1) return startOffset;
  const ang = -Math.atan2(dz, dx);
  let d = startOffset;
  while (d <= len) {
    const t = d / len;
    const x = ax + dx * t, z = az + dz * t;
    const halo = new THREE.Mesh(ARROW_GEO, haloMat);
    halo.position.set(x, 0.5, z); halo.rotation.y = ang; halo.scale.set(0.62, 1, 0.62);
    const arrow = new THREE.Mesh(ARROW_GEO, arrowMat);
    arrow.position.set(x, 0.55, z); arrow.rotation.y = ang; arrow.scale.set(0.46, 1, 0.46);
    group.add(halo); group.add(arrow);
    d += spacing;
  }
  return d - len;
}

function drawPath(waypointIds, fromPos) {
  clearPath();
  activeRouteIds = waypointIds.slice();

  routeLineGroup  = new THREE.Group(); routeLineGroup.userData.isPathDot  = true;
  routeArrowGroup = new THREE.Group(); routeArrowGroup.userData.isPathDot = true;

  const pathMat  = new THREE.MeshBasicMaterial({ color: 0xf39c12 });
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xf39c12, side: THREE.DoubleSide });
  const haloMat  = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const stripW   = 3.5;
  const SPACING  = 6;

  let carry = 0;

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
        routeLineGroup.add(connector);
        carry = addArrowsAlong(routeArrowGroup, fromPos.x, fromPos.z, firstWp.position.x, firstWp.position.z, 5, SPACING, arrowMat, haloMat);
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

    const strip = new THREE.Mesh(new THREE.BoxGeometry(length, 0.5, stripW), pathMat);
    strip.position.set((ax + bx) / 2, 0.6, (az + bz) / 2);
    strip.rotation.y = -Math.atan2(dz, dx);
    routeLineGroup.add(strip);

    const first = i === 0 && carry === 0 ? 6 : Math.max(0.5, SPACING - carry);
    carry = addArrowsAlong(routeArrowGroup, ax, az, bx, bz, first, SPACING, arrowMat, haloMat);
  }

  const dotMat = new THREE.MeshBasicMaterial({ color: 0xf39c12 });
  waypointIds.forEach(id => {
    const wp = waypointMap[id];
    if (!wp) return;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), dotMat);
    dot.position.set(wp.position.x, 0.8, wp.position.z);
    routeLineGroup.add(dot);
  });

  scene.add(routeLineGroup);
  scene.add(routeArrowGroup);
  setRouteStyle(!!(window.NavFP && NavFP.active));
}

function clearPath() {
  const toRemove = [];
  scene.traverse(obj => { if (obj.userData.isPathDot) toRemove.push(obj); });
  toRemove.forEach(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
    scene.remove(obj);
  });
  pathLine = null;
  routeLineGroup = null; routeArrowGroup = null; activeRouteIds = null;

  if (typeof hidePathInfo === 'function') hidePathInfo();
}

const GPS_DEAD_ZONE = 1.5;

function updateGPSMarker(x, z, isOnCampus) {
  if (x === null || z === null) {
    if (gpsMarker) gpsMarker.visible = false;
    currentGPSPosition = null;
    gpsTarget = null;
    return;
  }
  currentGPSPosition = isOnCampus ? { x, z } : null;
  if (!gpsMarker) {
    try { if (window.GPSChar) gpsMarker = GPSChar.create(); } catch (e) { console.warn('[gps] character failed, using dot', e); gpsMarker = null; }
    if (!gpsMarker) {
      gpsMarker = new THREE.Mesh(
        new THREE.SphereGeometry(4, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xe74c3c })
      );
    }
    gpsMarker.userData.isGPS = true;
    scene.add(gpsMarker);
  }
  if (!isOnCampus) {
    gpsMarker.visible = false;
    return;
  }
  gpsMarker.visible = !(window.NavFP && NavFP.active);
  var first = !gpsTarget;
  if (!first && Math.hypot(x - gpsTarget.x, z - gpsTarget.z) < GPS_DEAD_ZONE) return;
  gpsTarget = { x: x, z: z };
  if (first) gpsMarker.position.set(x, 4, z);
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
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerup', e => {
    panEnd();
    const dx = Math.abs(e.clientX - _tapX);
    const dy = Math.abs(e.clientY - _tapY);
    if (e.button !== 2 && dx < TAP_THRESHOLD && dy < TAP_THRESHOLD) {
      onPointerDown({ clientX: _tapX, clientY: _tapY });
    }
  });
  canvas.addEventListener('pointercancel', panEnd);

  canvas.addEventListener('touchstart',  onTouchStart, { passive: false });
  canvas.addEventListener('touchmove',   onTouchMove,  { passive: false });
  canvas.addEventListener('touchend',    onTouchEnd);

  canvas.addEventListener('wheel', onWheel, { passive: false });
}

const pan = { active: false, lastX: 0, lastY: 0, mode: 'pan' };
const lookTarget = { x: 700, y: 0, z: -80 };

function panStart(e) {
  if (window.NavFP && NavFP.active) { NavFP.pointerDown(e); return; }
  pan.active = true;
  pan.mode = (e.shiftKey || e.button === 2) ? 'rotate' : 'pan';
  pan.lastX = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
  pan.lastY = e.clientY ?? (e.touches?.[0]?.clientY ?? 0);
}

function panMove(e) {
  if (window.NavFP && NavFP.active) { NavFP.pointerMove(e); return; }
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

  const phi = Math.atan2(camOffset.z, camOffset.x);
  const speed = camOffset.y * 0.002;
  lookTarget.x -= (Math.sin(phi) * dx + Math.cos(phi) * dy * 0.6) * speed;
  lookTarget.z -= (-Math.cos(phi) * dx + Math.sin(phi) * dy * 0.6) * speed;

  updateCameraFromTarget();
}

function panEnd() { pan.active = false; if (window.NavFP) NavFP.pointerUp(); }

let pinchStartDist    = null;
let pinchStartY       = null;
let twoFingerLastX    = null;
let twoFingerLastY    = null;
let twoFingerLastDist = null;

function onTouchStart(e) {
  if (window.NavFP && NavFP.active) { if (e.touches.length === 2) e.preventDefault(); return; }
  if (e.touches.length === 2) {
    e.preventDefault();
    pinchStartDist = getTouchDist(e.touches);
    pinchStartY    = camera.position.y;
    const mid = getTouchMidpoint(e.touches);
    twoFingerLastX    = mid.x;
    twoFingerLastY    = mid.y;
    twoFingerLastDist = pinchStartDist;
    pan.active = false;
  }
}

function onTouchMove(e) {
  if (window.NavFP && NavFP.active) { if (e.touches.length === 2) e.preventDefault(); return; }
  if (e.touches.length === 2) {
    e.preventDefault();
    const dist = getTouchDist(e.touches);
    if (pinchStartDist && pinchStartY !== null) {
      const scale = pinchStartDist / dist;
      zoomCamera(pinchStartY * scale);
    }

    const mid = getTouchMidpoint(e.touches);
    if (twoFingerLastX !== null) {
      const dx = mid.x - twoFingerLastX;
      const dy = mid.y - twoFingerLastY;
      const midMove  = Math.sqrt(dx * dx + dy * dy);
      const distMove = Math.abs(dist - twoFingerLastDist);

      if (midMove > 4 && midMove > distMove * 1.5) {
        rotateCamera(-dx * ROTATE_SPEED, dy * TILT_SPEED);
      }
    }
    twoFingerLastX    = mid.x;
    twoFingerLastY    = mid.y;
    twoFingerLastDist = dist;
  }
}

function onTouchEnd() {
  pinchStartDist    = null;
  pinchStartY       = null;
  twoFingerLastX    = null;
  twoFingerLastY    = null;
  twoFingerLastDist = null;
}

function onWheel(e) {
  e.preventDefault();
  if (window.NavFP && NavFP.active) return;
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

const ZOOM_MIN = 70;
const ZOOM_MAX = 240;

function zoomCamera(newY) {
  const clampedY = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newY));
  const scale = clampedY / camOffset.y;
  camOffset.x *= scale;
  camOffset.y  = clampedY;
  camOffset.z *= scale;
  updateCameraFromTarget();
}

const MIN_ELEVATION = THREE.MathUtils.degToRad(25);
const MAX_ELEVATION = THREE.MathUtils.degToRad(85);
const ROTATE_SPEED = 0.006;
const TILT_SPEED   = 0.004;

function rotateCamera(deltaAzimuth, deltaElevation) {
  const r = Math.sqrt(camOffset.x ** 2 + camOffset.y ** 2 + camOffset.z ** 2);
  let theta = Math.asin(camOffset.y / r);
  let phi   = Math.atan2(camOffset.z, camOffset.x);

  phi   += deltaAzimuth;
  theta = Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, theta + deltaElevation));

  camOffset.x = r * Math.cos(theta) * Math.cos(phi);
  camOffset.y = r * Math.sin(theta);
  camOffset.z = r * Math.cos(theta) * Math.sin(phi);

  updateCameraFromTarget();
}

// Keep the view centre inside the campus. Two limits work together:
// 1) the campus rectangle, pulled in the further zoomed out you are, and
// 2) the outline of the real campus (a hull around all buildings and roads),
//    so you cannot pan out to the empty corners on either side of the strip.
const PAN_INSET_FACTOR = 0.45;
const HULL_MARGIN      = 30;   // how far past the outline you can pan when zoomed in
let _campusHull = null;

function buildCampusHull() {
  const pts = [];
  (campusData.buildings || []).forEach(b => { if (b.position) pts.push([b.position.x, b.position.z]); });
  (campusData.waypoints || []).forEach(w => { if (w.position) pts.push([w.position.x, w.position.z]); });
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lower = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop();
  return lower.concat(upper);   // counter-clockwise
}

function clampLookTarget() {
  if (!campusData || !campusData.bounds) return;
  const b = campusData.bounds;
  const over = Math.max(0, camOffset.y - ZOOM_MIN);
  const inset = over * PAN_INSET_FACTOR;
  const maxIn = Math.min((b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2) - 1;
  const k = Math.min(inset, maxIn);
  lookTarget.x = Math.max(b.minX + k, Math.min(b.maxX - k, lookTarget.x));
  lookTarget.z = Math.max(b.minZ + k, Math.min(b.maxZ - k, lookTarget.z));

  if (!_campusHull) _campusHull = buildCampusHull();
  const hull = _campusHull;
  if (hull.length < 3) return;
  const margin = Math.max(-20, HULL_MARGIN - over * 0.2);
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], c = hull[(i + 1) % hull.length];
      const ex = c[0] - a[0], ez = c[1] - a[1];
      const len = Math.hypot(ex, ez) || 1;
      const d = (ex * (lookTarget.z - a[1]) - ez * (lookTarget.x - a[0])) / len;  // >0 = inside
      if (d < -margin) {
        const push = -margin - d;
        lookTarget.x += (-ez / len) * push;
        lookTarget.z += ( ex / len) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function updateCameraFromTarget() {
  clampLookTarget();
  camera.position.set(
    lookTarget.x + camOffset.x,
    lookTarget.y + camOffset.y,
    lookTarget.z + camOffset.z
  );
  camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
}

function animate() {
  requestAnimationFrame(animate);
  const mapPage = document.getElementById('page-map');
  if (mapPage && mapPage.classList.contains('active')) {
    if (window.NavFP) NavFP.frame();
    if (gpsMarker && gpsTarget && gpsMarker.visible) {
      var gdx = gpsTarget.x - gpsMarker.position.x, gdz = gpsTarget.z - gpsMarker.position.z;
      var gd = Math.hypot(gdx, gdz);
      if (gd > 80) gpsMarker.position.set(gpsTarget.x, 4, gpsTarget.z);
      else if (gd > 0.05) gpsMarker.position.set(gpsMarker.position.x + gdx * 0.08, 4, gpsMarker.position.z + gdz * 0.08);
      if (window.GPSChar && gpsMarker.userData.gpsChar) GPSChar.update(gpsMarker);
    }
    renderer.render(scene, camera);
    layoutYouHere();
  } else {
    var yh0 = document.getElementById('you-are-here'); if (yh0) yh0.style.display = 'none';
  }
}

let _yhEl = null, _yhV = null;
function layoutYouHere() {
  if (!_yhEl) _yhEl = document.getElementById('you-are-here');
  if (!_yhEl) return;
  const spot = currentGPSPosition || (waypointMap.main_gate && waypointMap.main_gate.position);
  if ((!youHereOn && !currentGPSPosition) || !spot || (window.NavFP && NavFP.active)) { _yhEl.style.display = 'none'; return; }
  if (!_yhV) _yhV = new THREE.Vector3();
  _yhV.set(spot.x, currentGPSPosition ? ((window.GPSChar && GPSChar.ready) ? 16 : 10) : 4, spot.z).project(camera);
  const el = renderer.domElement, W = el.clientWidth, H = el.clientHeight;
  const sx = (_yhV.x + 1) / 2 * W, sy = (1 - _yhV.y) / 2 * H;
  if (_yhV.z > 1 || sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) { _yhEl.style.display = 'none'; return; }
  _yhEl.style.display = 'block';
  _yhEl.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px) translate(-50%,-100%)';
}

function zoomIn()  { zoomCamera(camera ? camera.position.y - 40 : 220); }
function zoomOut() { zoomCamera(camera ? camera.position.y + 40 : 220); }

