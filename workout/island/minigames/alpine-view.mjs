import * as THREE from '../vendor/three.module.js?v=island-alpine-20261026-1';
import {GLTFLoader} from '../vendor/GLTFLoader.js?v=island-alpine-20261026-1';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js?v=island-alpine-20261026-1';

/** Alpine Rush presentation (Codex design package view.mjs, adapted for the island).
 * Renders a SkiFrame only: world positions, collisions and results belong to the engine.
 * Changes from the package: uses the island canvas, vendor and kid-full.glb; scenery is
 * instanced/merged to keep draw calls low on phones; bounded obstacle pool by id; a
 * finish arch; air/landing/hit poses; idempotent dispose; metrics for tests. */
export async function createSkiView(host, {canvas, modelUrl = new URL('../assets/kid-full.glb?v=island-alpine-20261026-1', import.meta.url).href, quality: initialQuality = 'high', maxDpr = 1.7, lowDpr = 1, isDisposed = () => false} = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'high-performance'});
  let quality = initialQuality, disposed = false;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, quality === 'low' ? lowDpr : maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = quality !== 'low'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (!canvas) host.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#a9dcf2'); scene.fog = new THREE.Fog('#c5e4ef', 65, 240);
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 500);
  const hemi = new THREE.HemisphereLight('#e2f8ff', '#8094a8', 2.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3db', 3.5); sun.position.set(-22, 36, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left: -45, right: 45, top: 55, bottom: -90, near: 1, far: 130}); sun.shadow.bias = -.0004; scene.add(sun); scene.add(sun.target); sun.target.position.set(0, 0, -30);
  const mat = (c, roughness = .8) => new THREE.MeshStandardMaterial({color: c, roughness});
  const snow = mat('#effaff'), ice = mat('#88d7f1', .3), navy = mat('#123d59'), orange = mat('#ff643b'), white = mat('#ffffff'), stone = mat('#7590a1'), green = mat('#254e60');
  function mesh(geo, material, parent, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  const box = (w, h, d, m, p, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, p, x, y, z);
  const placed = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, s = 1) => geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(s, s, s)));

  const ground = mesh(new THREE.PlaneGeometry(700, 700), snow, scene, 0, -.08, -120); ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  const piste = new THREE.Group(); scene.add(piste);
  box(19, .08, 600, mat('#d4eef9', .48), piste, 0, -.02, -200).castShadow = false;
  for (const x of [-10, 10]) { box(.65, .28, 600, ice, piste, x, .08, -200); box(1, .44, 600, snow, piste, x * 1.06, .05, -200); }

  // Mountains: one merged mesh per material (the package used 56 separate meshes).
  const ridge = {stone: [], a: [], b: [], c: [], cap: []};
  for (let i = 0; i < 28; i++) {
    const side = i % 2 ? -1 : 1, dist = 45 + (i % 7) * 15, h = 13 + (i * 17 % 27), z = 15 - i * 11;
    ridge[i % 3 === 0 ? 'stone' : ['a', 'b', 'c'][i % 3]].push(placed(new THREE.ConeGeometry(h * .83, h, 5, 1), side * dist, h * .5 - 2, z, 0, i * .7));
    ridge.cap.push(placed(new THREE.ConeGeometry(h * .419, h * .5, 5, 1), side * dist, h * .75 - 1.98, z, 0, i * .7));
  }
  const ridgeMats = {stone, a: mat('#d4e7ee'), b: mat('#9ebaca'), c: mat('#bed4df'), cap: snow};
  for (const [key, list] of Object.entries(ridge)) if (list.length) { const m = mesh(mergeGeometries(list), ridgeMats[key], scene); m.castShadow = false; for (const g of list) g.dispose(); }

  // Pines: original package geometry, merged per material and instanced (3 draw calls for 64 trees).
  const trunkParts = [placed(new THREE.BoxGeometry(.16, 1, .16), 0, .5, 0)], needleParts = [], snowParts = [];
  for (let k = 0; k < 4; k++) { const h = 1.1 - k * .12, y = .9 + k * .52, r = .88 - k * .16; needleParts.push(placed(new THREE.ConeGeometry(r, h, 7), 0, y, 0)); snowParts.push(placed(new THREE.ConeGeometry(r * .96, h * .7, 7), 0, y + .19, 0)); }
  const TREE_COUNT = 64, trees = [];
  const treeMeshes = [[trunkParts, stone], [needleParts, green], [snowParts, snow]].map(([parts, material]) => {
    const geo = mergeGeometries(parts); for (const g of parts) g.dispose();
    const m = new THREE.InstancedMesh(geo, material, TREE_COUNT); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m;
  });
  for (let i = 0; i < TREE_COUNT; i++) { const side = i % 2 ? 1 : -1; trees.push({x: side * (13 + (i * 7 % 17)), z: -(i * 7 % 225), s: 1 + (i * 13 % 12) / 10, range: 240}); }
  function textTexture(label, bg = '#ff643b', fg = '#ffffff') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512; const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 512); ctx.fillStyle = fg; ctx.font = '900 43px Arial'; ctx.textAlign = 'center';
    ctx.save(); ctx.translate(128, 310); ctx.rotate(-Math.PI / 2); ctx.fillText(label, 0, 0); ctx.restore(); ctx.font = '900 110px Arial'; ctx.fillText('A', 128, 110);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }
  const flagMaterial = new THREE.MeshStandardMaterial({map: textTexture('ALPINE / 01'), side: THREE.DoubleSide, roughness: .8});
  const FLAG_COUNT = 18, flags = [];
  const flagPole = new THREE.InstancedMesh(placed(new THREE.BoxGeometry(.07, 5, .07), 0, 2.5, 0), white, FLAG_COUNT);
  const flagCloth = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 3, .025), flagMaterial, FLAG_COUNT);
  for (const m of [flagPole, flagCloth]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
  for (let i = 0; i < FLAG_COUNT; i++) { const side = i % 2 ? -1 : 1; flags.push({x: side * 11.4, side, z: -i * 15, range: 270}); }
  const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), vec = new THREE.Vector3(), scl = new THREE.Vector3();
  function scroll(item, d) { return ((item.z + d * .75 + 240) % item.range) - item.range + 12; }
  function placeScenery(d) {
    trees.forEach((t, i) => { matrix.compose(vec.set(t.x, 0, scroll(t, d)), quat.identity(), scl.setScalar(t.s)); for (const m of treeMeshes) m.setMatrixAt(i, matrix); });
    for (const m of treeMeshes) m.instanceMatrix.needsUpdate = true;
    flags.forEach((f, i) => { const z = scroll(f, d); matrix.compose(vec.set(f.x, 0, z), quat.identity(), scl.setScalar(1)); flagPole.setMatrixAt(i, matrix); matrix.compose(vec.set(f.x + f.side * .48, 3.4, z), quat.identity(), scl.setScalar(1)); flagCloth.setMatrixAt(i, matrix); });
    flagPole.instanceMatrix.needsUpdate = flagCloth.instanceMatrix.needsUpdate = true;
  }
  // Soft etched corduroy lines, merged into a single mesh.
  const lineParts = []; for (let x = -9; x < 9; x += .36) lineParts.push(placed(new THREE.PlaneGeometry(.016, 280), x, .032, -115, -Math.PI / 2));
  const lines = new THREE.Mesh(mergeGeometries(lineParts), new THREE.MeshBasicMaterial({color: '#c2e4f3', transparent: true, opacity: .35})); for (const g of lineParts) g.dispose(); scene.add(lines);

  const boostMat = new THREE.MeshStandardMaterial({color: '#26d8e5', emissive: '#06c8dc', emissiveIntensity: .6, roughness: .3});
  function pad() { const g = new THREE.Group(); box(3.3, .08, 5.5, ice, g, 0, .07, 0); for (let i = 0; i < 3; i++) for (const side of [-1, 1]) { const a = box(1.22, .04, .25, boostMat, g, side * .39, .14, i * 1.25 - 1.5); a.rotation.y = side * .6; } return g; }
  function ramp() { const g = new THREE.Group(), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-2, 0, 3, 2, 0, 3, -2, 1.2, -3, 2, 0, 3, 2, 1.2, -3, -2, 1.2, -3], 3)); geo.computeVertexNormals(); mesh(geo, ice, g); for (const x of [-2, 2]) { const edge = box(.12, .08, 6.12, orange, g, x, .6, 0); edge.rotation.x = .197; } return g; }
  function finishArch() {
    const g = new THREE.Group(); for (const x of [-10.2, 10.2]) box(.5, 6, .5, navy, g, x, 3, 0);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(20.9, 1.2, .2), new THREE.MeshStandardMaterial({map: textTexture('FINISH', '#123d59', '#ffffff'), roughness: .7}));
    banner.position.set(0, 5.6, 0); g.add(banner);
    for (let i = 0; i < 19; i++) { const t = box(1, .02, .6, i % 2 ? navy : white, g, -9 + i, .05, 0); t.castShadow = false; }
    return g;
  }
  const props = new Map();
  function obstacle(o) {
    let g = new THREE.Group();
    if (o.type === 'boost') g = pad(); else if (o.type === 'ramp') g = ramp(); else if (o.type === 'finish') g = finishArch();
    else if (o.type === 'gate') { for (const x of [-2.2, 2.2]) box(.18, 2.2, .2, orange, g, x, 1.1, 0); box(4.6, .55, .2, navy, g, 0, 2.2, 0); }
    else { const rock = mesh(new THREE.DodecahedronGeometry(o.radius ?? .7, 0), stone, g, 0, .4, 0); rock.scale.set(1, .65, 1); mesh(new THREE.SphereGeometry((o.radius ?? .7) * .85, 8, 5), snow, g, 0, .68, 0).scale.y = .35; }
    scene.add(g); props.set(o.id, g); return g;
  }

  // A failed character load keeps the race playable with simple primitive riders.
  let gltf = null, modelError = null;
  try { gltf = await new GLTFLoader().loadAsync(modelUrl); } catch (error) { modelError = String(error?.message || error); }
  if (isDisposed()) { disposeAll(); throw Object.assign(new Error('alpine.disposed'), {disposed: true}); }
  function primitiveBody(color) {
    const g = new THREE.Group(), coat = mat(color, .6);
    for (const x of [-.18, .18]) mesh(new THREE.CapsuleGeometry(.12, .5, 4, 8), navy, g, x, .45, 0);
    mesh(new THREE.CapsuleGeometry(.26, .45, 4, 10), coat, g, 0, 1.1, 0);
    const head = mesh(new THREE.SphereGeometry(.3, 16, 12), mat('#f1c7a5', .7), g, 0, 1.62, 0); head.name = 'Head';
    return g;
  }
  const riders = new Map();
  // Clone skeletons without importing an additional runtime dependency.
  function cloneSkinned(source) { const clone = source.clone(true), orig = [], copies = [], boneMap = new Map(); source.traverse(n => orig.push(n)); clone.traverse(n => copies.push(n)); for (let i = 0; i < orig.length; i++) if (orig[i].isBone) boneMap.set(orig[i], copies[i]); for (let i = 0; i < orig.length; i++) if (orig[i].isSkinnedMesh) { copies[i].skeleton = orig[i].skeleton.clone(); copies[i].skeleton.bones = orig[i].skeleton.bones.map(b => boneMap.get(b)); copies[i].bindMatrix.copy(orig[i].bindMatrix); } return clone; }
  const POSE = {upperLeg: -.33, lowerLeg: .68, foot: -.35, upperArm: .65, lowerArm: -.5};
  function rider(id, color) {
    const root = new THREE.Group(), body = gltf ? cloneSkinned(gltf.scene) : primitiveBody(color); root.add(body); body.rotation.y = Math.PI / 2; body.position.y = .14;
    body.traverse(n => { if (n.isMesh) { n.castShadow = true; n.frustumCulled = false; if (n.name === 'Ball' || n.name === 'Skin_2') n.visible = false;
      if ((n.name === 'Skin_1' || n.name.startsWith('ShoeSurface')) && n.geometry.attributes.color) { n.geometry = n.geometry.clone(); const pos = n.geometry.attributes.position, cols = n.geometry.attributes.color, coat = new THREE.Color(color), pants = new THREE.Color('#1a344b'); for (let i = 0; i < cols.count; i++) { const shade = THREE.MathUtils.clamp((cols.getX(i) + cols.getY(i) + cols.getZ(i)) * .9, .6, 1); const c = n.name === 'Skin_1' && pos.getY(i) > .85 && Math.abs(pos.getX(i)) < .48 ? coat : pants; cols.setXYZ(i, c.r * shade, c.g * shade, c.b * shade); } cols.needsUpdate = true; }
    } });
    const bones = {}; body.traverse(n => { if (n.isBone) bones[n.name] = n; });
    const headAnchor = gltf ? null : body.getObjectByName('Head');
    const hipsY = bones.Hips ? bones.Hips.position.y - .06 : 0;
    const head = bones.Head || headAnchor || root, k = gltf ? 1 : .6, hy = gltf ? 0 : -.3;
    const helmet = mesh(new THREE.SphereGeometry(.55 * k, 24, 16, 0, Math.PI * 2, 0, Math.PI * .6), mat(color, .35), head, 0, .53 * k + hy * .2, -.01); helmet.scale.set(1, 1, .99);
    const goggles = mesh(new THREE.SphereGeometry(.48 * k, 20, 10, 0, Math.PI), mat('#193b54', .13), head, 0, .4 * k + hy * .2, .18 * k); goggles.scale.set(.97, .28, .91);
    box(1.03 * k, .095, .22 * k, navy, head, 0, .4 * k + hy * .2, -.03).rotation.y = .04;
    const board = mesh(new THREE.CapsuleGeometry(.21, 1.45, 6, 12), navy, root, 0, .14, 0); board.rotation.z = Math.PI / 2; board.scale.z = .25; board.rotation.y = .12;
    box(1.5, .025, .29, mat(color, .4), root, 0, .195, 0).rotation.y = .12;
    for (const x of [-.35, .35]) box(.18, .1, .28, navy, root, x, .25, 0);
    const scarf = new THREE.Group(); root.add(scarf); scarf.position.set(.1, 1.48, .12);
    const sf = mesh(new THREE.PlaneGeometry(.18, 1.3, 1, 10), new THREE.MeshStandardMaterial({color: '#ff593d', side: THREE.DoubleSide}), scarf); sf.rotation.x = -Math.PI / 2; sf.position.z = .6;
    const shadow = mesh(new THREE.CircleGeometry(.8, 24), new THREE.MeshBasicMaterial({color: '#386483', transparent: true, opacity: .17, depthWrite: false}), scene); shadow.rotation.x = -Math.PI / 2; shadow.scale.set(.8, 1.5, 1); shadow.castShadow = false;
    scene.add(root); const r = {root, body, bones, hipsY, scarf, sf, shadow, air: 0, squash: 0}; riders.set(id, r); applyPose(r, 0, 0); return r;
  }
  /** Knees bend deeper on landing, arms lift in the air. */
  function applyPose(r, air, squash) {
    const b = r.bones; if (!b.Hips) return;
    for (const side of ['L', 'R']) {
      if (b['UpperLeg_' + side]) b['UpperLeg_' + side].rotation.x = POSE.upperLeg - squash * .35 - air * .25;
      if (b['LowerLeg_' + side]) b['LowerLeg_' + side].rotation.x = POSE.lowerLeg + squash * .6 + air * .45;
      if (b['Foot_' + side]) b['Foot_' + side].rotation.x = POSE.foot - squash * .2 - air * .15;
      if (b['UpperArm_' + side]) b['UpperArm_' + side].rotation.z = (side === 'L' ? -1 : 1) * (POSE.upperArm + air * .55);
      if (b['LowerArm_' + side]) b['LowerArm_' + side].rotation.x = POSE.lowerArm;
    }
    b.Hips.position.y = r.hipsY - squash * .1 + air * .05; if (b.Spine) b.Spine.rotation.x = .18 + squash * .12;
  }
  for (const [id, color] of [['player', '#ff6b3d'], ['rival-1', '#ffc540'], ['rival-2', '#59cad5'], ['rival-3', '#ab8cdb'], ['rival-4', '#df5368'], ['rival-5', '#a7d54d']]) rider(id, color);
  // A few airborne snow flecks catch the sunlight without hiding the track.
  const pointGeo = new THREE.BufferGeometry(), points = new Float32Array(210 * 3); for (let i = 0; i < 210; i++) { points[i * 3] = Math.sin(i * 92.1) * 35; points[i * 3 + 1] = 1 + (i * 17 % 65) * .2; points[i * 3 + 2] = -(i * 37 % 130); }
  pointGeo.setAttribute('position', new THREE.BufferAttribute(points, 3)); const flakes = new THREE.Points(pointGeo, new THREE.PointsMaterial({color: '#ffffff', size: .055, transparent: true, opacity: .75})); scene.add(flakes);
  const trailGeo = new THREE.BufferGeometry(), trailPositions = new Float32Array(140 * 3); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  const spray = new THREE.Points(trailGeo, new THREE.PointsMaterial({color: '#ffffff', size: .13, transparent: true, opacity: .8, depthWrite: false})); spray.frustumCulled = false; scene.add(spray);
  const target = new THREE.Vector3();
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion:reduce)').matches ?? false;
  function resize() { if (disposed) return; const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; ro?.observe(host); resize();
  let lastT = 0, fov = 48;
  function render(state) {
    if (disposed) return;
    const t = state.timeMs / 1000, d = state.distanceM, playing = state.phase !== 'menu', portrait = camera.aspect < .9, dt = Math.min(.1, Math.max(0, t - lastT)); lastT = t;
    placeScenery(d);
    for (const [id, r] of riders) {
      const s = id === 'player' ? state.player : state.rivals?.find(x => x.id === id), z = id === 'player' ? 0 : s?.z ?? 0;
      // Riders behind the player sit between the chase camera and the player; they are hidden so they never fill the screen.
      const blocking = id !== 'player' && !!s && (z > 1.2 || (z > .4 && Math.abs(s.x - state.player.x) < 2.4));
      const visible = !!s && z > -245 && z < 30 && !blocking; r.root.visible = r.shadow.visible = visible; if (!visible) continue;
      const height = s.height ?? 0, lean = s.lean ?? 0;
      r.air += ((s.airborne ? 1 : 0) - r.air) * Math.min(1, dt * 9); r.squash += ((s.landing ? 1 : 0) - r.squash) * Math.min(1, dt * 14);
      applyPose(r, reduced ? r.air * .6 : r.air, r.squash);
      r.root.position.set(s.x, .03 + height, z); r.root.rotation.z = -lean * .25; r.root.rotation.y = lean * .24;
      r.root.rotation.x = s.hit && !reduced ? Math.sin(t * 40) * .12 : -r.air * .08;
      r.body.position.y = .14 + Math.sin(t * 5 + (id === 'player' ? 0 : 3)) * .018;
      r.shadow.position.set(s.x, .04, z); r.shadow.material.opacity = .17 / (1 + height); r.shadow.scale.set(.8 / (1 + height * .2), 1.5 / (1 + height * .2), 1);
      const a = r.sf.geometry.attributes.position; for (let i = 0; i < a.count; i++) a.setZ(i, Math.sin(i * .9 + t * 10) * .05 * (i % 11 / 10)); a.needsUpdate = true;
    }
    for (const p of props.values()) p.visible = false;
    for (const o of state.obstacles ?? []) { const p = props.get(o.id) ?? obstacle(o); p.visible = true; p.position.set(o.x, 0, o.z); }
    const px = state.player.x, boost = !!state.player.boosting;
    const wantFov = 48 + (boost && !reduced ? 5 : 0); fov += (wantFov - fov) * Math.min(1, dt * 4 || 1); camera.fov = fov; camera.updateProjectionMatrix();
    // Narrow (portrait) screens follow the rider further sideways so the board stays in view at the track edges.
    const follow = Math.max(.25, Math.min(.82, 1 - camera.aspect * .5));
    if (playing) { camera.position.set(px * follow, portrait ? 3.65 : 3.8, (portrait ? 9 : 9.8) + (boost && !reduced ? .5 : 0)); target.set(px * Math.min(.92, follow + .25), .9, -15); }
    else { camera.position.set(portrait ? 4 : 8.5, portrait ? 3 : 3.4, portrait ? 8 : 8.2); target.set(portrait ? 0 : -4, .7, -8); }
    if (state.player.hit && !reduced) camera.position.x += Math.sin(t * 65) * .07;
    camera.lookAt(target);
    if (playing && !reduced) camera.rotateZ(-(state.player.lean ?? 0) * .025);
    const pr = riders.get('player'); if (!playing) { pr.root.position.set(portrait ? 1.8 : 3.8, 0, portrait ? -4 : -.4); pr.root.rotation.set(0, -.38, 0); pr.shadow.position.set(pr.root.position.x, .04, pr.root.position.z); }
    for (let i = 0; i < 140; i++) { const life = ((t * 1.8 + i / 140) % 1); trailPositions[i * 3] = px + Math.sin(i * 3.7) * life * .5; trailPositions[i * 3 + 1] = .1 + Math.sin(life * Math.PI) * .4; trailPositions[i * 3 + 2] = .3 + life * 4; }
    trailGeo.attributes.position.needsUpdate = true; spray.visible = quality !== 'low' && playing && !state.player.airborne && (Math.abs(state.player.lean ?? 0) > .12 || boost);
    flakes.rotation.y = Math.sin(t * .1) * .02;
    renderer.render(scene, camera);
  }
  function setQuality(value) { if (disposed) return; quality = value === 'low' ? 'low' : 'high'; renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, quality === 'low' ? lowDpr : maxDpr)); renderer.shadowMap.enabled = quality !== 'low'; flakes.visible = quality !== 'low'; scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; }); resize(); }
  function disposeAll() {
    if (disposed) return; disposed = true; ro?.disconnect();
    const materials = new Set(), geometries = new Set();
    scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) for (const m of [].concat(o.material)) materials.add(m); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); });
    for (const m of [...treeMeshes, flagPole, flagCloth]) m.dispose?.();
    sun.shadow.map?.dispose(); renderer.renderLists.dispose(); renderer.dispose();
    if (!canvas) renderer.domElement.remove();
  }
  return {
    render, setQuality, dispose: disposeAll, canvas: renderer.domElement,
    get quality() { return quality; },
    get modelError() { return modelError; },
    mode: gltf ? 'model' : 'primitive',
    metrics() { return {calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, props: props.size, quality, disposed, mode: gltf ? 'model' : 'primitive'}; },
  };
}
