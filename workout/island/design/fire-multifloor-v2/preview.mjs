import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { collectBurnables, setBurnState, spriteFrame } from './runtime.mjs';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const viewport = $('#viewport');
const canvas = $('#scene');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(37, 1, .03, 250);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (error) {
  $('#loading').classList.add('error');
  $('#loading').textContent = 'תצוגת התלת־ממד דורשת WebGL. הנכסים זמינים בתיקיית models.';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
scene.add(new THREE.HemisphereLight(0xe7f4ff, 0x667b6c, 2.8));
const key = new THREE.DirectionalLight(0xffecd0, 3.6);
key.position.set(-9, 20, 12); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: .1, far: 80 });
key.shadow.normalBias = .035; key.shadow.bias = -.00015; scene.add(key);
const fill = new THREE.DirectionalLight(0xc8efff, 1.2); fill.position.set(10, 8, -8); scene.add(fill);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x394e53, roughness: .93 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.035; ground.receiveShadow = true; scene.add(ground);
const content = new THREE.Group(); scene.add(content);
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const cache = new Map(), mixers = new Map(), atlases = new Map();
let manifest, view = 'truck', floor = 'all', state = 'burning', selectedTool = 'extinguisher-powder';
let paused = false, elapsed = 0, smoke = .35, toolStart = -100, currentAction = null;
let target = new THREE.Vector3(), distance = 12, yaw = .75, pitch = .32, baseY = 0, lastTime = performance.now();
const flames = [], smokePuffs = [], floorGroups = [];
let truck, shell, equipmentRoot, burnables = [], equipment = [];
let toolEffect;
const captions = { truck: ['01 / רכב חילוץ', 'מוכנים לקריאה.', 'כבאית אחת. סולם טלסקופי בעל שלוש חוליות וציוד מובנה.', 'RESCUE / 01', 'כבאית חילוץ'], building: ['02 / בניין מגורים', 'שלוש קומות. תשעה חדרים.', 'מדרגות, מסדרונות וחדרים מרוהטים. כל פריט דליק עובר בין שלם, בוער ומפוחם.', 'INTERIOR / 03', 'בניין מגורים · מבט חתך'], equipment: ['03 / ציוד כיבוי', 'לכל מוקד, הכלי שלו.', 'חמישה כלים עם קליפ שימוש. אפקט נפרד לאבקה, קצף, מים ושמיכה.', 'EQUIPMENT / 05', 'ציוד כיבוי'] };
const toolLabels = { 'extinguisher-powder': ['מטף אבקה', 'powder'], 'extinguisher-foam': ['מטף קצף', 'foam'], 'wall-hose': ['זרנוק קיר', 'water'], hydrant: ['ברז כיבוי', 'water'], 'fire-blanket': ['שמיכת כיבוי', 'blanket'] };

async function loadModel(path) {
  const gltf = await loader.loadAsync(path);
  gltf.scene.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  cache.set(path, gltf); mixers.set(gltf.scene, new THREE.AnimationMixer(gltf.scene));
  return gltf;
}
async function loadAtlas(name) {
  const texture = await textureLoader.loadAsync(`effects/${name}.png`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  atlases.set(name, texture);
  return texture;
}
function makeSprite(name, width, height, opacity) {
  const texture = atlases.get(name).clone();
  texture.repeat.set(1 / 8, 1); texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(material); sprite.scale.set(width, height, 1);
  return sprite;
}
function createAtmosphere() {
  for (const [index, item] of burnables.entries()) {
    // A camera-facing flame stays readable while inspecting the cutaway.
    const flame = makeSprite('fire', .55, .88, .95);
    flame.position.y = .25; item.fire.add(flame);
    flames.push({ sprite: flame, index, item });
  }
  floorGroups.forEach((group, i) => {
    for (let r = 0; r < 3; r++) for (let n = 0; n < 7; n++) {
      const sprite = makeSprite('smoke', 2.7, 1.25, .2);
      const base = new THREE.Vector3([-6.64, 0, 6.64][r] + ((n % 3) - 1) * 1.32, 2.65 - Math.floor(n / 3) * .55, -2.15 + (n % 2) * 1.65);
      sprite.position.copy(base); group.add(sprite);
      smokePuffs.push({ sprite, base, layer: Math.floor(n / 3), index: n + r * 7 + i * 21 });
    }
  });
}
function fitObject(object, mode = 'truck') {
  scene.updateMatrixWorld(true);
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  object.traverse(n => {
    if (!n.isMesh) return;
    for (let p = n; p; p = p.parent) if (!p.visible || p.scale.toArray().some(v => Math.abs(v) < 1e-8)) return;
    n.geometry.computeBoundingBox();
    box.union(n.geometry.boundingBox.clone().applyMatrix4(n.matrixWorld));
  });
  target.copy(box.getCenter(new THREE.Vector3()));
  if (mode === 'truck') { yaw = -.78; pitch = .28; target.y = Math.max(target.y, .9); }
  else if (mode === 'building') { yaw = .28; pitch = floor === 'all' ? .32 : .55; }
  else { yaw = -.45; pitch = selectedTool === 'fire-blanket' ? .58 : .23; }
  // Fit the eight projected corners, including depth, at this exact camera angle.
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const direction = new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
  const right = new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const up = new THREE.Vector3(-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch));
  distance = 0;
  for (let i = 0; i < 8; i++) {
    const delta = new THREE.Vector3(i&1 ? box.max.x : box.min.x,i&2 ? box.max.y : box.min.y,i&4 ? box.max.z : box.min.z).sub(target);
    distance = Math.max(distance, delta.dot(direction) + Math.abs(delta.dot(right))/(tangent*camera.aspect), delta.dot(direction) + Math.abs(delta.dot(up))/tangent);
  }
  distance *= mode === 'equipment' ? 1.4 : 1.19;
  baseY = target.y;
  updateCamera();
}
function updateCamera() {
  camera.position.set(target.x + distance * Math.sin(yaw) * Math.cos(pitch), target.y + distance * Math.sin(pitch), target.z + distance * Math.cos(yaw) * Math.cos(pitch));
  camera.lookAt(target);
}
function resetCamera() {
  if (view === 'truck') fitObject(truck.scene, view);
  else if (view === 'equipment') fitObject(equipmentRoot.scene, view);
  else fitObject(buildingGroup, view);
}
function resize() {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
}
const buildingGroup = new THREE.Group();
function updateBuilding() {
  floorGroups.forEach((g, i) => { g.visible = floor === 'all' || Number(floor) === i + 1; });
  shell.scene.visible = true;
  shell.scene.traverse(n => {
    if (n.name.startsWith('shell_floor_')) n.visible = floor === 'all' || n.name === `shell_floor_${floor}`;
    if (n.name === 'entry_landing') n.visible = floor === 'all' || floor === '1';
  });
  shell.scene.traverse(n => { if (n.name.startsWith('cutaway_front_') || n.name.startsWith('cutaway_ceiling_')) n.visible = false; });
  setBurnState(buildingGroup, state);
  $$('[data-floor]').forEach(b => b.setAttribute('aria-pressed', b.dataset.floor === floor));
  $$('[data-state]').forEach(b => b.setAttribute('aria-pressed', b.dataset.state === state));
}
function setView(next) {
  view = next; currentAction = null; toolStart = -100;
  cache.forEach(gltf => mixers.get(gltf.scene).stopAllAction());
  content.clear();
  if (next === 'truck') content.add(truck.scene);
  if (next === 'building') { content.add(buildingGroup); updateBuilding(); }
  if (next === 'equipment') selectTool(selectedTool, false);
  const c = captions[next];
  ['section-label','heading','description','stage-tag','asset-caption'].forEach((id, i) => { $(`#${id}`).textContent = c[i]; });
  $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === next));
  $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== next; });
  $('#effect-preview').hidden = true; $('#play-status').textContent = '';
  if (next === 'equipment') $('#asset-caption').textContent = toolLabels[selectedTool][0];
  resetCamera();
}
function playClip(gltf, name) {
  const clip = gltf.animations.find(c => c.name === name);
  if (!clip) throw new Error(`Missing animation ${name}`);
  const mixer = mixers.get(gltf.scene); mixer.stopAllAction();
  const action = mixer.clipAction(clip); action.reset();
  action.setLoop(['drive','lights'].includes(name) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = true; action.play(); currentAction = name;
  $('#play-status').textContent = { drive: 'נסיעה · גלגלים בתנועה', lights: 'אורות מהבהבים', ladder_extend: 'הסולם נפתח', ladder_retract: 'הסולם נסגר', use: 'הפעלת כלי' }[name];
  if (name.startsWith('ladder_')) {
    // Sample the endpoint to frame the real extended geometry, then start the clip.
    action.time = name === 'ladder_extend' ? clip.duration : 0;
    mixer.update(0); fitObject(gltf.scene, 'truck'); action.time = 0; mixer.update(0);
  }
}
function selectTool(id, refit = true) {
  if (toolEffect) { toolEffect.removeFromParent(); toolEffect.material.map.dispose(); toolEffect.material.dispose(); toolEffect = null; }
  selectedTool = id; equipmentRoot = equipment.find(e => e.id === id).gltf;
  content.clear(); content.add(equipmentRoot.scene);
  $('#asset-caption').textContent = toolLabels[id][0];
  $('#effect-label').textContent = { powder: 'אבקה', foam: 'קצף', water: 'מים', blanket: 'שמיכה' }[toolLabels[id][1]];
  $$('#tools button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === id));
  $('#effect-preview').hidden = true; toolStart = -100; $('#play-status').textContent = '';
  if (refit) fitObject(equipmentRoot.scene, 'equipment');
}
function useTool() {
  playClip(equipmentRoot, 'use');
  const action = mixers.get(equipmentRoot.scene).clipAction(equipmentRoot.animations.find(a => a.name === 'use'));
  action.time = action.getClip().duration; mixers.get(equipmentRoot.scene).update(0); fitObject(equipmentRoot.scene, 'equipment');
  action.time = 0; mixers.get(equipmentRoot.scene).update(0);
  toolStart = elapsed; $('#effect-preview').hidden = false;
  if (toolEffect) { toolEffect.removeFromParent(); toolEffect.material.map.dispose(); toolEffect.material.dispose(); }
  const effect = toolLabels[selectedTool][1];
  toolEffect = makeSprite(effect, selectedTool === 'wall-hose' ? 1.2 : .75, selectedTool === 'wall-hose' ? 1.2 : .75, .9);
  toolEffect.center.set(.1, .43);
  const anchor = equipmentRoot.scene.getObjectByName('spray_origin') || equipmentRoot.scene.getObjectByName('hose_outlet') || equipmentRoot.scene.getObjectByName('cover_origin');
  (anchor || equipmentRoot.scene).add(toolEffect);
  if (effect === 'blanket') toolEffect.visible = false; // The GLB cloth performs the actual covering motion.
}

let dragging = null;
canvas.addEventListener('pointerdown', e => { dragging = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  yaw -= (e.clientX - dragging.x) * .009;
  pitch = THREE.MathUtils.clamp(pitch + (e.clientY - dragging.y) * .006, -.12, 1.25);
  dragging = { x: e.clientX, y: e.clientY }; updateCamera();
});
canvas.addEventListener('pointerup', () => { dragging = null; });
canvas.addEventListener('pointercancel', () => { dragging = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); distance = THREE.MathUtils.clamp(distance * Math.exp(e.deltaY * .001), .35, 100); updateCamera(); }, { passive: false });
canvas.addEventListener('keydown', e => {
  const changes = { ArrowLeft: [-.12,0], ArrowRight: [.12,0], ArrowUp:[0,.08], ArrowDown:[0,-.08] };
  if (changes[e.key]) { e.preventDefault(); yaw += changes[e.key][0]; pitch = THREE.MathUtils.clamp(pitch + changes[e.key][1], -.12, 1.25); updateCamera(); }
  if (e.key === 'Home') resetCamera();
});
new ResizeObserver(resize).observe(viewport);

try {
  manifest = await fetch('manifest.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const modelTasks = [loadModel('models/fire-truck.glb'), loadModel('models/building-shell.glb'), ...[1,2,3].map(n => loadModel(`models/building-floor-${n}.glb`)), ...Object.keys(toolLabels).map(id => loadModel(`models/${id}.glb`))];
  const result = await Promise.all(modelTasks);
  [truck, shell] = result;
  result.slice(1,5).forEach(gltf => gltf.scene.traverse(n => {
    if (n.name.startsWith('cutaway_front_') || n.name.startsWith('cutaway_ceiling_')) n.visible = false;
  }));
  buildingGroup.add(shell.scene);
  for (let i = 0; i < 3; i++) { const group = result[2 + i].scene; group.position.y = i * 3.2; floorGroups.push(group); buildingGroup.add(group); }
  equipment = Object.keys(toolLabels).map((id, i) => ({ id, gltf: result[5 + i] }));
  await Promise.all(['fire','smoke','powder','foam','water','blanket'].map(loadAtlas));
  burnables = collectBurnables(buildingGroup); createAtmosphere();
  const truckAsset = manifest.assets.find(a => a.id === 'fire-truck');
  $('#truck-tris').textContent = `${truckAsset.triangles.toLocaleString()} משולשים`;
  for (const [id, [label]] of Object.entries(toolLabels)) {
    const button = document.createElement('button'); button.dataset.tool = id;
    button.title = label; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', id === selectedTool);
    const icon = document.createElement('img'); icon.src = `icons/${id}.svg`; icon.alt = ''; button.append(icon);
    button.addEventListener('click', () => { mixers.get(equipmentRoot.scene).stopAllAction(); selectTool(id); }); $('#tools').append(button);
  }
  $$('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $$('[data-clip]').forEach(b => b.addEventListener('click', () => playClip(truck, b.dataset.clip)));
  $$('[data-floor]').forEach(b => b.addEventListener('click', () => { floor = b.dataset.floor; updateBuilding(); resetCamera(); }));
  $$('[data-state]').forEach(b => b.addEventListener('click', () => { state = b.dataset.state; updateBuilding(); }));
  $('#smoke').addEventListener('input', e => { smoke = Number(e.target.value) / 100; $('#smoke-value').textContent = `${e.target.value}%`; });
  $('#use-tool').addEventListener('click', useTool);
  $('#reset-camera').addEventListener('click', resetCamera);
  $('#pause').addEventListener('click', () => { paused = !paused; $('#pause').textContent = paused ? 'המשך' : 'השהיה'; $('#pause').setAttribute('aria-pressed', paused); });
  resize(); setView('truck'); $('#loading').hidden = true;
  window.firePreview = { inspect: () => ({ scene, camera, mixers: [...mixers.values()] }), setView, playClip: name => playClip(truck, name), setBurnState: s => { state = s; updateBuilding(); }, setFloor: f => { floor = String(f); updateBuilding(); resetCamera(); }, selectTool, useTool, resetCamera, getState: () => ({ view, floor, state, smoke, paused, currentAction, burnables: burnables.length, visibleBurnt: burnables.filter(b => b.burnt.visible && b.burnt.scale.x > 0).length, visibleIntact: burnables.filter(b => b.intact.visible && b.intact.scale.x > 0).length, tools: equipment.length, frame: renderer.info.render.frame, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, truckAnimations: truck.animations.map(a => a.name), smokeCount: smokePuffs.filter(p => p.sprite.visible).length, sceneModels: content.children.length, camera: camera.position.toArray(), target: target.toArray(), baseY }), ready: true };
} catch (error) {
  console.error(error); $('#loading').hidden = false; $('#loading').classList.add('error');
  $('#loading').textContent = `טעינת החבילה נכשלה. יש לפתוח דרך שרת HTTP מקומי. ${error.message}`;
}

const effectCanvas = $('#effect-canvas'), ctx = effectCanvas.getContext('2d');
let metricTime = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, .08); lastTime = now;
  if (!paused && !document.hidden) {
    elapsed += dt;
    if (view === 'building' && state === 'burning') smoke = Math.min(1, smoke + dt * .014);
    if (view === 'building' && state === 'burnt') smoke = Math.max(0, smoke - dt * .006);
    if (view === 'truck' && truck) mixers.get(truck.scene).update(dt);
    if (view === 'equipment' && equipmentRoot) mixers.get(equipmentRoot.scene).update(dt);
  }
  flames.forEach(({ sprite, index, item }) => {
    sprite.visible = state === 'burning';
    sprite.material.map.offset.x = spriteFrame(elapsed + index * .087, 12) / 8;
    sprite.scale.y = .85 + Math.sin(elapsed * 5 + index) * .07;
    sprite.material.opacity = state === 'burning' && item.node.userData.fireState === 'burning' ? .95 : 0;
  });
  smokePuffs.forEach(({ sprite, base, layer, index }) => {
    const layerFill = THREE.MathUtils.clamp((smoke - layer * .29) * 2.4, 0, 1);
    sprite.visible = layerFill > 0 && state !== 'intact';
    sprite.material.opacity = layerFill * (state === 'burnt' ? .34 : .55);
    sprite.material.map.offset.x = spriteFrame(elapsed + index * .15, 8) / 8;
    sprite.position.set(base.x + Math.sin(elapsed * .35 + index) * .13, base.y + smoke * .17, base.z);
    sprite.scale.set(2.3 + smoke * .8, .75 + smoke * 1.1, 1);
  });
  if (view === 'equipment' && elapsed - toolStart < 2.4) {
    const image = atlases.get(toolLabels[selectedTool][1])?.image;
    if (image) { const w = image.width / 8; ctx.clearRect(0,0,160,160); ctx.drawImage(image, spriteFrame(elapsed - toolStart, 12) * w, 0, w, image.height, 0,0,160,160); }
    if (toolEffect) toolEffect.material.map.offset.x = spriteFrame(elapsed - toolStart, 12) / 8;
  } else { $('#effect-preview').hidden = true; if (toolEffect) toolEffect.visible = false; }
  renderer.render(scene, camera);
  if (now - metricTime > 750) {
    $('#metrics').textContent = `${renderer.info.render.triangles.toLocaleString()} TRI · ${renderer.info.render.calls} DRAWS`;
    if (view === 'building') { $('#smoke').value = Math.round(smoke * 100); $('#smoke-value').textContent = `${Math.round(smoke * 100)}%`; }
    metricTime = now;
  }
}
requestAnimationFrame(animate);
