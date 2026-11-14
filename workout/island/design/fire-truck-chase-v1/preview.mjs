import * as T from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

// A review scene only. This module does not import or change the live game's state.
const $ = id => document.getElementById(id);
const clamp = T.MathUtils.clamp;
const smooth = n => n * n * (3 - 2 * n);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.body.classList.toggle('low-motion', reduced);
const ASSETS = [
  ['fire-truck', 'משאית כיבוי', 'גלגלים עצמאיים, סולם מתקפל ומתארך, זרנוק ואורות נפרדים.'],
  ['road-straight', 'כביש ישר', 'אריח כביש מודולרי עם שני נתיבים, מדרכות וסימון.'],
  ['road-right', 'פנייה ימינה', 'פנייה מודולרית ברשת של שישה מטרים.'],
  ['road-left', 'פנייה שמאלה', 'פנייה מודולרית ברשת של שישה מטרים.'],
  ['road-cross', 'צומת', 'ארבעה חיבורים ומעברי חצייה.'],
  ['road-bridge', 'גשר', 'כביש עם מעקות, תומכות ותעלה פתוחה מתחת.'],
  ['road-tunnel', 'מנהרה', 'פתח מקומר, תאורה ונתיב נסיעה רציף.'],
  ['car-hatch', 'מכונית האצ׳בק', 'רכב אזרחי קטן שמפנה את הדרך למשאית.'],
  ['car-sedan', 'מכונית סדאן', 'צללית נפרדת, ארבעה גלגלים ואנימציית פינוי נתיב.'],
  ['car-van', 'מסחרית קטנה', 'מרכב גבוה ותנועת פינוי נתיב.'],
  ['car-compact', 'מכונית קומפקטית', 'רכב עירוני קטן ותנועת פינוי נתיב.'],
  ['cone', 'קונוס', 'ציוד סימון בגאומטריה פשוטה וקריאה ממבט עילי.'],
  ['street-lamp', 'עמוד תאורה', 'תאורת רחוב עם עדשה נפרדת.'],
  ['house-burning', 'הבית הבוער', 'חדר פנימי, עוגן כניסה ושלושה מצבי להבה הניתנים להחלפה.'],
];
const state = {
  phase: 'loading', time: 75, elapsed: 0, phaseTime: 0, distance: 0,
  x: .8, z: -2, lane: .8, speed: 0, steer: 0, spray: false,
  hits: 0, heat: [1, 1, 1], aimed: 0, paused: false, catalogue: false,
  loaded: false, muted: true, selected: 'fire-truck', slow: 0,
};
let renderer, scene, camera, world, truck, house, truckMixer, ladderAction;
let viewWidth = 844, viewHeight = 390, visualTime = 0, lastFrame = 0;
let catalogueRoot, catalogueAsset, catalogueMixer, catalogueClip, cataloguePad, catalogueAngle = .48;
const originals = new Map(), mixers = [], traffic = [], roadTiles = [];
const keys = new Set(), pointer = { x: 0, y: 0, active: false, down: false };
const fireWorld = [[-1.8, 1.15, 84.8], [1.7, 1.15, 85.2], [0, 1.15, 86.1]].map(p => new T.Vector3(...p));
const projectedTargets = fireWorld.map(() => ({ x: 0, y: 0 }));
const targetLabels = fireWorld.map((_, i) => {
  const el = document.createElement('div'); el.className = 'target-label hidden';
  el.textContent = `0${i + 1}`; $('target-labels').append(el); return el;
});
const audioBuffers = new Map(), loops = new Map();
let audioContext, master;
let hose, water, splash, nozzle, beacons = [], wheelNodes = [];
const waterPoints = new Float32Array(18 * 3), waterOrigin = new T.Vector3(0, 1.05, 81.5);
const waterTubePositions = new Float32Array(18 * 6 * 3);
const waterDirection = new T.Vector3(), waterRight = new T.Vector3(), waterUp = new T.Vector3();
const cameraAim = new T.Vector3(), cameraPos = new T.Vector3();
const temp = new T.Vector3(), tint = new T.Color();
const fogColor = '#aec0b5';

function showError(error) {
  console.error(error);
  state.phase = 'error'; $('loading').classList.add('hidden');
  $('error').classList.remove('hidden');
  $('error-message').textContent = 'יש לפתוח את preview.html דרך שרת HTTP מקומי, עם תיקיות models, audio ו־vendor לידו. ' + (error?.message || 'WebGL אינו זמין בדפדפן הזה.');
}

function material(color, roughness = .88) { return new T.MeshStandardMaterial({ color, roughness }); }
function box(w, h, d, color, x, y, z, parent = world) {
  const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material(color));
  mesh.position.set(x, y, z); mesh.receiveShadow = mesh.castShadow = true; parent.add(mesh); return mesh;
}
function cylinder(radius, height, color, x, y, z, parent = world, sides = 7) {
  const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, height, sides), material(color));
  mesh.position.set(x, y, z); mesh.receiveShadow = mesh.castShadow = true; parent.add(mesh); return mesh;
}

function setupRenderer() {
  renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  $('scene').append(renderer.domElement);
  scene = new T.Scene(); scene.background = new T.Color(fogColor); scene.fog = new T.Fog(fogColor, 52, 108);
  camera = new T.OrthographicCamera(-20, 20, 9.2, -9.2, .1, 220);
  scene.add(new T.HemisphereLight('#fff5dd', '#77886c', 2.0));
  const sun = new T.DirectionalLight('#ffe8bf', 3.4); sun.position.set(-15, 25, -14);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 30, bottom: -30, near: 1, far: 110 });
  sun.shadow.bias = -.0007; sun.shadow.normalBias = .025; scene.add(sun, sun.target);
  const rim = new T.DirectionalLight('#d5e9dd', .65); rim.position.set(8, 12, 30); scene.add(rim);
  world = new T.Group(); world.name = 'MissionPreview'; scene.add(world);
  const ground = box(92, .5, 150, '#9baa88', 0, -.53, 39);
  ground.receiveShadow = true;
  // Simple landscape shapes are background dressing; vehicles and street assets use delivered GLBs.
  for (let i = 0; i < 25; i++) {
    const z = i * 4.2 - 10, side = i % 2 ? 1 : -1;
    const x = side * (8.8 + (i * 7 % 5));
    cylinder(.14, 1.3, '#6a7660', x, .5, z);
    const crown = new T.Mesh(new T.IcosahedronGeometry(1.25 + (i % 3) * .16, 0), material(i % 3 ? '#6c8d73' : '#7d9777'));
    crown.position.set(x, 2.0, z); crown.scale.set(1, 1.2, 1); crown.castShadow = true; world.add(crown);
    if (i % 4 === 0) {
      const wall = box(4.3, 2.8, 4.2, i % 3 ? '#d9d1b9' : '#b3b9a1', side * 14.4, 1.2, z + 1.5);
      box(4.7, .36, 4.6, '#778777', wall.position.x, 2.8, z + 1.5);
      for (const dx of [-.9, .9]) box(.6, .8, .05, '#42696a', wall.position.x + dx, 1.7, z - .64);
    }
  }
  // The bridge has real underside geometry; the water and banks sit below its deck.
  box(18, .04, 5.7, '#6d9c9b', 0, -.58, 24);
  box(9, .1, 1, '#afbea0', -7, -.4, 20.8);
  box(9, .1, 1, '#afbea0', 7, -.4, 27.2);
  resize(); window.addEventListener('resize', resize);
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); pause(true); showError(new Error('הקשר הגרפי אבד. אפשר לטעון מחדש כדי לחזור לשלב.')); });
  renderer.domElement.addEventListener('pointermove', movePointer);
  renderer.domElement.addEventListener('pointerdown', event => {
    movePointer(event); pointer.down = true;
    if (state.phase === 'extinguish' && !state.paused && !state.catalogue) { state.spray = true; renderer.domElement.setPointerCapture(event.pointerId); }
  });
  renderer.domElement.addEventListener('pointerup', releasePointer);
  renderer.domElement.addEventListener('pointercancel', releasePointer);
  renderer.domElement.addEventListener('pointerleave', event => { if (!pointer.down) pointer.active = false; });
}

function resize() {
  viewWidth = $('app').clientWidth; viewHeight = $('app').clientHeight;
  renderer.setSize(viewWidth, viewHeight, false); updateCamera(true);
}
function movePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top; pointer.active = true;
  $('reticle').style.left = pointer.x + 'px'; $('reticle').style.top = pointer.y + 'px';
}
function releasePointer() { pointer.down = false; state.spray = false; }

async function loadAssets() {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(ASSETS.map(async ([id]) => {
    const gltf = await loader.loadAsync(`models/${id}.glb`);
    gltf.scene.traverse(node => {
      if (node.isMesh) { node.castShadow = node.receiveShadow = true; }
    });
    originals.set(id, gltf);
    done++;
    $('loading').lastChild.textContent = `טוענים ציוד · ${done}/${ASSETS.length}`;
  }));
  assembleWorld();
  state.loaded = true; state.phase = 'intro';
  $('start').disabled = false; $('start').innerHTML = 'יוצאים למשימה <span aria-hidden="true">←</span>';
  $('loading').classList.add('hidden');
  updateUI();
}

function cloneAsset(id) { return originals.get(id).scene.clone(true); }
function assembleWorld() {
  for (let i = -1; i < 14; i++) {
    const z = i * 6;
    const id = i === 4 ? 'road-bridge' : i === 8 ? 'road-tunnel' : i === 10 ? 'road-cross' : 'road-straight';
    const tile = cloneAsset(id); tile.position.z = z; world.add(tile); roadTiles.push(tile);
  }
  const right = cloneAsset('road-right'); right.position.set(-6, 0, 60); right.rotation.y = Math.PI / 2; world.add(right);
  const left = cloneAsset('road-left'); left.position.set(6, 0, 60); left.rotation.y = -Math.PI / 2; world.add(left);
  for (let i = 0; i < 8; i++) {
    const lamp = cloneAsset('street-lamp'); lamp.position.set((i % 2 ? -1 : 1) * 3.8, 0, 6 + i * 9);
    if (i % 2) lamp.rotation.y = Math.PI; world.add(lamp);
  }
  for (let i = 0; i < 6; i++) { const cone = cloneAsset('cone'); cone.position.set(3.3, 0, 69 + i * 1.6); world.add(cone); }
  house = cloneAsset('house-burning'); house.position.z = 84; world.add(house);
  setHouseFlames('High');
  truck = cloneAsset('fire-truck'); truck.scale.setScalar(.65); world.add(truck); truck.position.set(state.x, 0, state.z);
  truckMixer = new T.AnimationMixer(truck);
  const deploy = originals.get('fire-truck').animations.find(a => a.name === 'LadderDeploy');
  if (deploy) { ladderAction = truckMixer.clipAction(deploy); ladderAction.setLoop(T.LoopOnce, 1); ladderAction.clampWhenFinished = true; }
  wheelNodes = ['WheelFrontLeft', 'WheelFrontRight', 'WheelRearLeft', 'WheelRearRight'].map(name => truck.getObjectByName(name)).filter(Boolean);
  beacons = ['BeaconLeft', 'BeaconRight'].map(name => truck.getObjectByName(name)).filter(Boolean);
  beacons.forEach(parent => { parent.scale.setScalar(1); parent.traverse(node => { if (node.isMesh) node.material = node.material.clone(); }); });
  const carIds = ['car-hatch', 'car-sedan', 'car-van', 'car-compact'];
  for (let i = 0; i < 8; i++) {
    const wrapper = new T.Group(), id = carIds[i % carIds.length], model = cloneAsset(id);
    const mixer = new T.AnimationMixer(model), clip = originals.get(id).animations.find(a => a.name === 'YieldRight');
    const action = clip ? mixer.clipAction(clip) : null;
    if (action) { action.setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; }
    wrapper.add(model); world.add(wrapper);
    traffic.push({ wrapper, model, mixer, action, startZ: 8 + i * 8.1, z: 8 + i * 8.1, x: i % 2 ? .95 : -.95, yielded: false, hit: false, facing: i % 2 ? 1 : -1 });
    mixers.push(mixer);
  }
  const waterGeometry = new T.BufferGeometry(), waterIndices = [];
  waterGeometry.setAttribute('position', new T.BufferAttribute(waterTubePositions, 3).setUsage(T.DynamicDrawUsage));
  for (let i = 0; i < 17; i++) for (let j = 0; j < 6; j++) { const a = i * 6 + j, b = i * 6 + (j + 1) % 6; waterIndices.push(a, b, a + 6, b, b + 6, a + 6); }
  waterGeometry.setIndex(waterIndices);
  water = new T.Mesh(waterGeometry, new T.MeshBasicMaterial({ color: '#d1f3ed', transparent: true, opacity: .8, side: T.DoubleSide }));
  water.frustumCulled = false; world.add(water); water.visible = false;
  splash = new T.Group(); world.add(splash);
  const dropGeometry = new T.IcosahedronGeometry(.065, 0), dropMaterial = new T.MeshBasicMaterial({ color: '#d1f7ed', transparent: true, opacity: .8 });
  for (let i = 0; i < 22; i++) { const drop = new T.Mesh(dropGeometry, dropMaterial); splash.add(drop); }
  splash.visible = false;
  nozzle = cylinder(.09, .65, '#718b85', 0, 1.05, 81.25, world, 8); nozzle.rotation.x = Math.PI / 2; nozzle.visible = false;
  const nozzleMouth = cylinder(.12, .12, '#d2c8a7', 0, 1.05, 81.58, world, 8); nozzleMouth.rotation.x = Math.PI / 2; nozzle.add(nozzleMouth); nozzleMouth.position.set(0, .3, 0); nozzleMouth.rotation.x = 0;
  resetTraffic();
}

function resetTraffic() {
  traffic.forEach(car => {
    car.z = car.startZ; car.yielded = car.hit = false;
    car.wrapper.position.set(car.x, 0, car.z); car.wrapper.rotation.y = car.facing > 0 ? 0 : Math.PI;
    car.action?.stop(); car.mixer.setTime(0); car.model.position.set(0, 0, 0); car.model.quaternion.identity();
    const civilianRoot = car.model.getObjectByName('CivilianRoot');
    if (civilianRoot) { civilianRoot.position.set(0, 0, 0); civilianRoot.quaternion.identity(); }
  });
}

function setHouseFlames(level) {
  if (!house) return;
  for (const name of ['Low', 'Medium', 'High']) {
    const node = house.getObjectByName(`Flames${name}`);
    if (node) { node.visible = name === level; node.scale.setScalar(name === level ? 1 : 0); }
  }
}
function setCutaway(open) {
  if (!house) return;
  for (const name of ['CutawayFront', 'Roof']) { const node = house.getObjectByName(name); if (node) node.visible = !open; }
  house.traverse(node => { if (node.name.startsWith('ExteriorTarget')) node.visible = !open; });
}
function resetFireNodes(root = house) {
  root?.traverse(node => { if (/^Target[123](?:Low|Medium|High)/.test(node.name)) node.visible = true; });
}
function updateFire() {
  if (!house) return;
  const total = state.heat.reduce((a, b) => a + b, 0);
  const level = total > 1.85 ? 'High' : total > .7 ? 'Medium' : 'Low';
  setHouseFlames(level);
  house.traverse(node => {
    const match = /^Target([123])(Low|Medium|High)/.exec(node.name);
    if (match) {
      const heat = state.heat[Number(match[1]) - 1]; node.visible = heat > .02;
      // Children are scaled mildly; the authored three intensity states remain distinct.
      if (!reduced && heat > .02) node.scale.set(1 + .04 * Math.sin(visualTime * 7 + Number(match[1])), .88 + .13 * Math.sin(visualTime * 9 + Number(match[1])), 1);
    }
  });
}

function start() {
  if (!state.loaded) return;
  closeCatalogue(false);
  Object.assign(state, { phase: 'chase', time: 75, elapsed: 0, phaseTime: 0, distance: 0, x: .8, z: -2, lane: .8, speed: 0, steer: 0, spray: false, hits: 0, heat: [1, 1, 1], aimed: 0, paused: false, slow: 0 });
  keys.clear(); pointer.down = pointer.active = false;
  truck.position.set(state.x, 0, state.z); truck.rotation.set(0, 0, 0); truckMixer.stopAllAction();
  wheelNodes.forEach(node => node.rotation.x = 0);
  setCutaway(false); resetFireNodes(); setHouseFlames('High'); resetTraffic();
  nozzle.visible = water.visible = splash.visible = false;
  if (hose) { hose.geometry.dispose(); hose.material.dispose(); hose.removeFromParent(); hose = null; }
  $('intro').classList.add('hidden'); $('result').classList.add('hidden'); $('pause-panel').classList.add('hidden');
  $('controls').classList.remove('hidden'); $('design-stamp').classList.add('hidden'); $('pause').disabled = false;
  unlockAudio(); updateUI(); updateAudio(); updateCamera(true);
}

function changePhase(phase) {
  state.phase = phase; state.phaseTime = 0; state.spray = false;
  if (phase === 'arrival') { oneShot('brakes', .45); oneShot('arrival', .65); ladderAction?.reset().play(); makeHose(); }
  if (phase === 'entry') { state.lane = state.x; }
  if (phase === 'extinguish') { setCutaway(true); nozzle.visible = true; oneShot('firefighting-start', .65); pointer.active = false; }
  if (phase === 'success' || phase === 'failed') {
    state.spray = false; water.visible = splash.visible = nozzle.visible = false;
    $('controls').classList.add('hidden'); $('result').classList.remove('hidden'); $('pause').disabled = true;
    $('result-eyebrow').textContent = phase === 'success' ? 'המשימה הושלמה' : 'השעון נגמר';
    $('result-title').textContent = phase === 'success' ? 'הבית בטוח.' : 'חוזרים מוכנים יותר.';
    $('result-detail').textContent = phase === 'success' ? `שלושת מוקדי האש כובו · נותרו ${Math.ceil(state.time)} שניות` : 'פנו את הדרך וכבו כל מוקד עד שהטבעת מתמלאת.';
    if (phase === 'success') oneShot('arrival', .55);
  }
  updateUI(); updateAudio();
}

function makeHose() {
  const curve = new T.CatmullRomCurve3([
    new T.Vector3(-1.4, 1.2, state.z - .6), new T.Vector3(-2.1, .12, state.z + 1),
    new T.Vector3(-1.6, .12, 79.5), new T.Vector3(0, .18, 80.8), new T.Vector3(0, 1.05, 81.2),
  ]);
  hose = new T.Mesh(new T.TubeGeometry(curve, 32, .065, 6, false), material('#b9b68d'));
  hose.castShadow = true; world.add(hose);
}

function aimTarget() {
  if (!pointer.active || keys.has('Space')) return state.heat.findIndex(h => h > .02);
  let best = -1, distance = 64;
  projectedTargets.forEach((p, i) => {
    const d = Math.hypot(pointer.x - p.x, pointer.y - p.y);
    if (state.heat[i] > .02 && d < distance) { distance = d; best = i; }
  });
  return best;
}

function step(dt, advanceVisual = true) {
  if (state.paused || state.catalogue || !state.loaded) return;
  if (advanceVisual) visualTime += dt;
  const active = ['chase', 'arrival', 'entry', 'extinguish'].includes(state.phase);
  if (active) {
    state.time = Math.max(0, state.time - dt); state.elapsed += dt; state.phaseTime += dt;
    if (state.time <= 0) { changePhase('failed'); return; }
  }
  if (state.phase === 'chase') {
    const steer = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0) || state.steer;
    state.lane = clamp(state.lane + steer * dt * 2.15, -1.05, 1.05);
    state.x += (state.lane - state.x) * (1 - Math.exp(-dt * 5));
    state.slow = Math.max(0, state.slow - dt);
    const targetSpeed = state.slow > 0 ? 1.2 : state.z > 67 ? 2.8 : 4.7;
    state.speed += (targetSpeed - state.speed) * (1 - Math.exp(-dt * 2));
    const dz = state.speed * dt; state.z += dz; state.distance += dz;
    truck.position.set(state.x, 0, state.z); truck.rotation.y = (state.lane - state.x) * .2;
    truck.rotation.z = reduced ? 0 : -(state.lane - state.x) * .025;
    wheelNodes.forEach(node => node.rotation.x += dz / (.52 * .65));
    traffic.forEach(car => {
      const gap = car.z - state.z;
      // Civilians slow before the response area, leaving the house entrance clear.
      // Keep their original direction after yielding, including oncoming traffic.
      let trafficSpeed = (car.yielded ? .35 : 1.1) * car.facing;
      if (trafficSpeed > 0) trafficSpeed *= clamp((74 - car.z) / 3, 0, 1);
      car.z = Math.min(74, car.z + trafficSpeed * dt);
      if (!car.yielded && gap < 21 && gap > -5) { car.yielded = true; car.action?.reset().play(); }
      car.mixer.update(dt); car.wrapper.position.z = car.z;
      const civilianRoot = car.model.getObjectByName('CivilianRoot');
      const carX = car.wrapper.position.x + (civilianRoot?.position.x || 0) * car.facing;
      if (!car.hit && gap > -2.5 && gap < 3.2 && Math.abs(carX - state.x) < .98) {
        car.hit = true; state.slow = 1.1; state.hits++; state.time = Math.max(0, state.time - 2); oneShot('brakes', .3);
      }
      for (const name of ['WheelFrontLeft', 'WheelFrontRight', 'WheelRearLeft', 'WheelRearRight']) { const wheel = car.model.getObjectByName(name); if (wheel) wheel.rotation.x += dt * .9; }
    });
    if (state.z >= 74.1) { state.z = 74.1; state.speed = 0; changePhase('arrival'); }
  } else if (state.phase === 'arrival') {
    truckMixer.update(dt);
    if (state.phaseTime > 2.35) changePhase('entry');
  } else if (state.phase === 'entry') {
    truckMixer.update(dt);
    if (state.phaseTime > 1.0) setCutaway(true);
    if (state.phaseTime >= 2.8) changePhase('extinguish');
  } else if (state.phase === 'extinguish') {
    state.aimed = aimTarget();
    const spraying = state.spray || keys.has('Space');
    if (spraying && state.aimed >= 0) {
      state.heat[state.aimed] = Math.max(0, state.heat[state.aimed] - dt / 2.15);
      if (state.heat.every(h => h <= .02)) changePhase('success');
    }
  }
  updateFire(); updateVisualEffects(); updateUI(); updateAudio();
}

function updateVisualEffects() {
  if (!truck) return;
  const flashing = !reduced && !['success', 'failed'].includes(state.phase);
  beacons.forEach((parent, i) => parent.traverse(node => {
    if (node.isMesh && node.material.emissive) {
      const on = flashing ? Math.sin(visualTime * Math.PI * 3.2 + i * Math.PI) > 0 : true;
      node.material.emissiveIntensity = on ? 1.9 : .15;
    }
  }));
  const spraying = state.phase === 'extinguish' && (state.spray || keys.has('Space')) && !state.paused && !state.catalogue;
  water.visible = splash.visible = spraying && state.aimed >= 0;
  document.body.classList.toggle('water-active', spraying);
  if (water.visible) {
    const target = fireWorld[state.aimed];
    waterDirection.subVectors(target, waterOrigin).normalize(); waterRight.set(waterDirection.z, 0, -waterDirection.x).normalize(); waterUp.crossVectors(waterDirection, waterRight).normalize();
    for (let i = 0; i < 18; i++) {
      const a = i / 17; temp.lerpVectors(waterOrigin, target, a);
      temp.y += Math.sin(a * Math.PI) * .32;
      if (!reduced) { temp.x += Math.sin(visualTime * 35 - a * 12) * .025 * a; temp.y += Math.sin(visualTime * 26 - a * 20) * .025; }
      waterPoints.set([temp.x, temp.y, temp.z], i * 3);
      for (let j = 0; j < 6; j++) {
        const angle = j * Math.PI / 3, radius = .045 + a * .022;
        waterTubePositions.set([
          temp.x + (waterRight.x * Math.cos(angle) + waterUp.x * Math.sin(angle)) * radius,
          temp.y + (waterRight.y * Math.cos(angle) + waterUp.y * Math.sin(angle)) * radius,
          temp.z + (waterRight.z * Math.cos(angle) + waterUp.z * Math.sin(angle)) * radius,
        ], (i * 6 + j) * 3);
      }
    }
    water.geometry.attributes.position.needsUpdate = true;
    splash.position.copy(target);
    splash.children.forEach((drop, i) => {
      const t = reduced ? .3 : (visualTime * 1.7 + i / 22) % 1, angle = i * 2.4;
      drop.position.set(Math.sin(angle) * t * .9, -t * t + .35 * t, Math.cos(angle) * t * .65);
      drop.scale.setScalar((1 - t) * .8 + .25);
    });
  }
  // An overhead camera keeps the tunnel readable. Fade only its roof near the truck.
  roadTiles.forEach(tile => tile.traverse(node => {
    if (node.isMesh && /roof|canopy/i.test(node.name) && Math.abs(tile.position.z - state.z) < 5) {
      if (!node.userData.previewMaterial) { node.material = node.material.clone(); node.userData.previewMaterial = true; }
      node.material.transparent = true; node.material.opacity = .25; node.material.depthWrite = false;
    } else if (node.isMesh && node.userData.previewMaterial) { node.material.opacity = 1; node.material.transparent = false; node.material.depthWrite = true; }
  }));
}

function updateCamera(immediate = false) {
  if (!camera) return;
  let half = 9.2;
  if (state.catalogue && catalogueRoot) {
    const bounds = new T.Box3().setFromObject(catalogueAsset), size = bounds.getSize(temp), center = bounds.getCenter(cameraAim);
    const diameter = Math.max(size.x, size.y, size.z, .8);
    half = Math.max(diameter * .88, .9);
    if ($('overhead').checked) cameraPos.set(center.x + .001, diameter * 2.4, center.z + .001);
    else cameraPos.set(center.x + Math.sin(catalogueAngle) * diameter * 1.9, center.y + diameter * 1.35, center.z - Math.cos(catalogueAngle) * diameter * 1.9);
    if (viewWidth / viewHeight < 1.2) half *= 1.1;
  } else if (['extinguish', 'success', 'failed'].includes(state.phase)) {
    half = 5.4; cameraAim.set(0, .7, 84.2); cameraPos.set(8.3, 11.7, 74.8);
  } else if (state.phase === 'entry') {
    const raw = clamp(state.phaseTime / 2.8, 0, 1);
    if (reduced) { half = 5.4; cameraAim.set(0, .7, 84.2); cameraPos.set(8.3, 11.7, 74.8); }
    else if (raw < .55) {
      const p = smooth(raw / .55); half = T.MathUtils.lerp(9.2, 2.4, p);
      cameraAim.set(T.MathUtils.lerp(state.x, 0, p), T.MathUtils.lerp(.6, 1.1, p), T.MathUtils.lerp(state.z + 7.2, 85.4, p));
      cameraPos.set(T.MathUtils.lerp(state.x + 11.5, 0, p), T.MathUtils.lerp(16, 1.7, p), T.MathUtils.lerp(state.z - 11.5, 81.2, p));
    } else {
      const p = smooth((raw - .55) / .45); half = T.MathUtils.lerp(2.4, 5.4, p);
      cameraAim.set(0, T.MathUtils.lerp(1.1, .7, p), T.MathUtils.lerp(85.4, 84.2, p));
      cameraPos.set(T.MathUtils.lerp(0, 8.3, p), T.MathUtils.lerp(1.7, 11.7, p), T.MathUtils.lerp(81.2, 74.8, p));
    }
  } else {
    const start = state.phase === 'intro' || state.phase === 'loading';
    cameraAim.set(state.x + (start ? 2.1 : 0), .5, state.z + (start ? 4.6 : 7.2));
    cameraPos.set(state.x + (start ? 12.6 : 11.5), start ? 14 : 16, state.z - (start ? 10.4 : 11.5));
    if (start) half = 7.5;
  }
  if (viewWidth / viewHeight < 1.2) half *= 1.45;
  const aspect = viewWidth / viewHeight;
  camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
  camera.position.copy(cameraPos); camera.lookAt(cameraAim); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const labelsVisible = state.phase === 'extinguish' && !state.paused && !state.catalogue;
  targetLabels.forEach((el, i) => {
    el.classList.toggle('hidden', !labelsVisible);
    if (!labelsVisible) return;
    temp.copy(fireWorld[i]).project(camera);
    const p = projectedTargets[i]; p.x = (temp.x * .5 + .5) * viewWidth; p.y = (-temp.y * .5 + .5) * viewHeight;
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    el.classList.toggle('aimed', state.aimed === i && state.heat[i] > .02);
    el.classList.toggle('done', state.heat[i] <= .02);
    el.textContent = state.heat[i] <= .02 ? '✓' : `${Math.round((1 - state.heat[i]) * 100)}%`;
  });
  $('reticle').classList.toggle('hidden', !labelsVisible || !pointer.active || state.heat.every(h => h <= .02));
}

function updateUI() {
  const seconds = Math.ceil(state.time), clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('time').textContent = clock; $('time').parentElement.classList.toggle('urgent', seconds <= 15);
  const done = state.heat.filter(h => h <= .02).length;
  const info = {
    loading: ['הקריאה התקבלה · בית בקצה הרחוב', '', '', ''],
    intro: ['הקריאה התקבלה · בית בקצה הרחוב', '', '', ''],
    chase: [`${Math.max(0, Math.ceil(74.1 - state.z))} מטר לבית · התנועה מפנה דרך`, 'שמרו על נתיב פנוי', 'חצים להיגוי · H לצופר · P להשהיה', 'צופר'],
    arrival: ['הגענו לבית · פורסים ציוד', 'המשאית במקום. הציוד יוצא.', 'השעון ממשיך · מתכוננים לכניסה', 'פורסים…'],
    entry: ['נכנסים דרך הדלת הקדמית', 'פנימה. שלושה מוקדים מחכים.', 'המצלמה נכנסת לבית · אותו שעון ממשיך', 'נכנסים…'],
    extinguish: [`${done}/3 מוקדים כובו · כוונו והחזיקו מים`, 'מכוונים. מחזיקים. מכבים.', 'מגע על מוקד · רווח למוקד הבא · P להשהיה', 'מים'],
    success: ['כל המוקדים כובו · הבית בטוח', '', '', ''],
    failed: ['הזמן נגמר · אפשר לצאת שוב', '', '', ''],
  }[state.phase] || ['', '', '', ''];
  $('route-text').textContent = info[0]; $('instruction').textContent = info[1]; $('hint').textContent = info[2];
  $('action').innerHTML = `${info[3]} <span aria-hidden="true">${state.phase === 'extinguish' ? '◌' : '←'}</span>`;
  $('action').disabled = ['arrival', 'entry'].includes(state.phase);
  $('steering').classList.toggle('hidden', state.phase !== 'chase');
  const phaseStep = state.phase === 'chase' || state.phase === 'intro' ? 0 : state.phase === 'arrival' || state.phase === 'entry' ? 1 : 2;
  document.querySelectorAll('[data-step]').forEach((el, i) => { el.classList.toggle('active', i === phaseStep); el.classList.toggle('done', i < phaseStep); });
  const progress = phaseStep === 0 ? clamp((state.z + 2) / 76.1, 0, 1) : phaseStep === 1 ? clamp(state.phaseTime / 2.8, 0, 1) : 1 - state.heat.reduce((a, b) => a + b, 0) / 3;
  $('progress').style.width = `${progress * 100}%`;
}

function pause(force) {
  if (!['chase', 'arrival', 'entry', 'extinguish'].includes(state.phase)) return;
  state.paused = typeof force === 'boolean' ? force : !state.paused;
  if (state.paused) { state.spray = false; pointer.down = false; keys.clear(); }
  if (audioContext) { if (state.paused) audioContext.suspend(); else if (!state.muted) audioContext.resume(); }
  $('pause-panel').classList.toggle('hidden', !state.paused); $('pause').setAttribute('aria-label', state.paused ? 'המשך' : 'השהיה');
  updateAudio(); updateCamera(); updateVisualEffects();
}

async function unlockAudio() {
  if (state.muted) return;
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    master = audioContext.createGain(); master.gain.value = .65; master.connect(audioContext.destination);
  }
  if (audioContext.state === 'suspended') await audioContext.resume();
  const names = ['siren-two-tone-loop', 'engine-idle-loop', 'engine-cruise-loop', 'engine-high-loop', 'horn', 'brakes', 'hose-water-loop', 'arrival', 'firefighting-start'];
  await Promise.all(names.map(async name => {
    if (audioBuffers.has(name)) return;
    try { const response = await fetch(`audio/${name}.wav`); if (!response.ok) throw new Error(name); audioBuffers.set(name, await audioContext.decodeAudioData(await response.arrayBuffer())); }
    catch (error) { console.warn('Audio unavailable:', name); }
  }));
  updateAudio();
}
function loop(name, volume) {
  if (!audioContext || !master || !audioBuffers.has(name)) return;
  let item = loops.get(name);
  if (!item) {
    const source = audioContext.createBufferSource(), gain = audioContext.createGain();
    source.buffer = audioBuffers.get(name); source.loop = true;
    source.connect(gain); gain.connect(master); gain.gain.value = 0; source.start(); item = { source, gain }; loops.set(name, item);
  }
  item.gain.gain.setTargetAtTime(volume, audioContext.currentTime, .07);
}
function updateAudio() {
  if (!audioContext || !master) return;
  const active = !state.muted && !state.paused && !state.catalogue;
  master.gain.setTargetAtTime(active ? .65 : 0, audioContext.currentTime, .025);
  const chase = active && state.phase === 'chase', idle = active && ['arrival', 'entry'].includes(state.phase);
  loop('siren-two-tone-loop', chase ? .22 : 0);
  loop('engine-idle-loop', idle ? .2 : chase ? .025 : 0);
  loop('engine-cruise-loop', chase ? .13 * clamp(state.speed / 4.7, 0, 1) : 0);
  loop('engine-high-loop', chase && state.speed > 3 ? .07 : 0);
  loop('hose-water-loop', active && state.phase === 'extinguish' && (state.spray || keys.has('Space')) ? .35 : 0);
}
function oneShot(name, volume = .5) {
  if (state.muted || state.paused || !audioContext || !audioBuffers.has(name)) return;
  const source = audioContext.createBufferSource(), gain = audioContext.createGain();
  source.buffer = audioBuffers.get(name); gain.gain.value = volume; source.connect(gain); gain.connect(master); source.start();
}
function horn() { if (state.phase === 'chase' && !state.paused) oneShot('horn', .35); }

function openCatalogue() {
  if (!state.loaded) return;
  state.catalogue = true; world.visible = false; scene.fog = null; scene.background.set('#a7b9ad');
  $('intro').classList.add('hidden'); $('route').classList.add('hidden'); $('catalogue').classList.remove('hidden'); $('design-stamp').classList.add('hidden');
  selectAsset($('asset-select').value || 'fire-truck'); updateAudio();
}
function closeCatalogue(showIntro = true) {
  state.catalogue = false; world.visible = true; scene.fog = new T.Fog(fogColor, 52, 108); scene.background.set(fogColor);
  if (catalogueRoot) { catalogueRoot.removeFromParent(); catalogueRoot = catalogueAsset = null; catalogueMixer = null; cataloguePad?.geometry.dispose(); cataloguePad?.material.dispose(); cataloguePad = null; }
  $('catalogue').classList.add('hidden'); $('route').classList.remove('hidden');
  if (showIntro && state.phase === 'intro') { $('intro').classList.remove('hidden'); $('design-stamp').classList.remove('hidden'); }
  updateAudio(); updateCamera(true);
}
function selectAsset(id) {
  if (catalogueRoot) { catalogueRoot.removeFromParent(); cataloguePad?.geometry.dispose(); cataloguePad?.material.dispose(); }
  state.selected = id; const gltf = originals.get(id); if (!gltf) return;
  catalogueRoot = new T.Group(); catalogueRoot.name = 'AssetReview';
  const asset = cloneAsset(id); catalogueRoot.add(asset); scene.add(catalogueRoot);
  catalogueAsset = asset;
  const bounds = new T.Box3().setFromObject(asset), minimum = bounds.min.y;
  asset.position.y -= minimum;
  const size = bounds.getSize(new T.Vector3()), groundSize = Math.max(size.x, size.z, 3.5) + 1.2;
  const pad = new T.Mesh(new T.CylinderGeometry(groundSize * .7, groundSize * .72, .18, 48), material('#899f8e'));
  cataloguePad = pad;
  pad.position.y = -.13; pad.receiveShadow = true; catalogueRoot.add(pad);
  catalogueMixer = new T.AnimationMixer(asset);
  const preferred = id === 'fire-truck' ? 'LadderDeploy' : id.startsWith('car-') ? 'YieldRight' : null;
  catalogueClip = gltf.animations.find(a => a.name === preferred) || gltf.animations[0];
  $('clip-select').replaceChildren();
  const clipNames = { LadderDeploy: 'פתיחת הסולם', WheelRoll: 'סיבוב גלגלים', HoseAim: 'כיוון זרנוק', BeaconFlash: 'אורות מהבהבים', YieldRight: 'פינוי נתיב' };
  for (const clip of gltf.animations) { const option = document.createElement('option'); option.value = clip.name; option.textContent = clipNames[clip.name] || clip.name; $('clip-select').append(option); }
  if (catalogueClip) $('clip-select').value = catalogueClip.name;
  $('clip-select-label').classList.toggle('hidden', !catalogueClip);
  $('animate-asset').disabled = !catalogueClip;
  $('animate-asset').textContent = catalogueClip ? 'הפעלה' : 'נכס סטטי';
  const entry = ASSETS.find(a => a[0] === id); $('asset-title').textContent = entry[1]; $('asset-note').textContent = entry[2];
  $('flame-select-label').classList.toggle('hidden', id !== 'house-burning');
  if (id === 'house-burning') setCatalogueFlames();
  catalogueAngle = id === 'fire-truck' ? .65 : .52; updateCamera(true);
}
function animateAsset() {
  if (!catalogueMixer || !catalogueClip) return;
  catalogueMixer.stopAllAction();
  const action = catalogueMixer.clipAction(catalogueClip); action.reset().setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; action.play();
}
function setCatalogueFlames() {
  if (!catalogueRoot) return;
  for (const level of ['Low', 'Medium', 'High']) {
    const node = catalogueRoot.getObjectByName(`Flames${level}`); if (node) { node.visible = level === $('flame-select').value; node.scale.setScalar(node.visible ? 1 : 0); }
  }
}

function wireControls() {
  ASSETS.forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; $('asset-select').append(option); });
  $('start').addEventListener('click', start); $('retry').addEventListener('click', start); $('restart').addEventListener('click', start);
  $('pause').addEventListener('click', () => pause()); $('resume').addEventListener('click', () => pause(false));
  $('sound').addEventListener('click', async () => {
    state.muted = !state.muted;
    $('sound').setAttribute('aria-label', state.muted ? 'הפעלת צלילים' : 'השתקת צלילים'); $('sound').setAttribute('aria-pressed', String(!state.muted));
    $('sound').innerHTML = state.muted ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4ZM15 9l6 6m0-6-6 6"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4ZM15 8c3 2 3 6 0 8M18 5c5 4 5 10 0 14"/></svg>';
    if (!state.muted) await unlockAudio(); updateAudio();
  });
  $('catalogue-open').addEventListener('click', openCatalogue); $('catalogue-close').addEventListener('click', () => closeCatalogue());
  $('asset-select').addEventListener('change', event => selectAsset(event.target.value)); $('animate-asset').addEventListener('click', animateAsset);
  $('clip-select').addEventListener('change', event => { catalogueClip = originals.get(state.selected).animations.find(clip => clip.name === event.target.value); });
  $('flame-select').addEventListener('change', setCatalogueFlames); $('overhead').addEventListener('change', () => updateCamera(true));
  for (const [id, value] of [['left', -1], ['right', 1]]) {
    const button = $(id);
    button.addEventListener('pointerdown', event => { event.preventDefault(); state.steer = value; button.setPointerCapture(event.pointerId); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => state.steer = 0);
  }
  $('horn').addEventListener('click', horn);
  $('action').addEventListener('pointerdown', event => {
    if (state.phase === 'chase') horn();
    if (state.phase === 'extinguish' && !state.paused) { state.spray = true; pointer.active = false; $('action').setPointerCapture(event.pointerId); }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('action').addEventListener(type, () => state.spray = false);
  $('action').addEventListener('keydown', event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); if (state.phase === 'extinguish') { state.spray = true; pointer.active = false; } else horn(); } });
  $('action').addEventListener('keyup', event => { if (event.code === 'Space' || event.code === 'Enter') state.spray = false; });
  window.addEventListener('keydown', event => {
    if (event.target.matches('select,input')) return;
    if (['ArrowLeft', 'ArrowRight', 'Space', 'KeyA', 'KeyD', 'KeyH', 'KeyP', 'Escape'].includes(event.code)) event.preventDefault();
    if (event.code === 'KeyP' || event.code === 'Escape') { if (!event.repeat) { if (state.catalogue) closeCatalogue(); else pause(); } return; }
    if (event.code === 'KeyH' && !event.repeat) horn();
    if (!state.paused) keys.add(event.code);
  });
  window.addEventListener('keyup', event => { keys.delete(event.code); updateAudio(); });
  window.addEventListener('blur', () => { keys.clear(); state.steer = 0; state.spray = false; pointer.down = false; pause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
}

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000 || 0, .05); lastFrame = now;
  if (state.catalogue) {
    catalogueMixer?.update(dt); if (!reduced) catalogueAngle += dt * .055;
  } else if (!state.paused) {
    visualTime += dt;
    if (state.phase === 'intro') { updateFire(); updateVisualEffects(); }
    else step(dt, false);
  }
  updateCamera(); renderer.render(scene, camera); requestAnimationFrame(frame);
}

try {
  setupRenderer(); wireControls();
  window.fireChasePreview = {
    getState: () => ({ ...state, heat: [...state.heat], targets: projectedTargets.map(p => ({ ...p })), render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, width: viewWidth, height: viewHeight } }),
    // Runs the same fixed-step simulation and phase transitions as the live preview.
    advance(seconds) {
      const duration = clamp(Number(seconds) || 0, 0, 120);
      for (let t = 0; t < duration; t += 1 / 60) step(Math.min(1 / 60, duration - t));
      updateCamera(true); renderer.render(scene, camera); return this.getState();
    },
    assetIds: ASSETS.map(a => a[0]),
  };
  requestAnimationFrame(frame); await loadAssets();
} catch (error) { showError(error); }
