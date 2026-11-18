// CC0-1.0. Local review of the authored GLBs, using the v2 burn-state adapter.
import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { collectBurnables, setBurnState } from '../fire-multifloor-v2/runtime.mjs';
import { createInteriorEffects } from './effects.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const baseURL = new URL('.', import.meta.url);
const canvas = $('#scene');
const stage = $('.stage');
const spaceSelect = $('#space');
const objectSelect = $('#object');
const floodSlider = $('#flood');
const relativeNames = ['מערב', 'מרכז', 'מזרח'];
const stateNames = { intact: 'שלם', burning: 'בוער', burnt: 'מפויח' };
const doorAxis = new THREE.Vector3(0, 1, 0);

const scene = new THREE.Scene();
const building = new THREE.Group();
scene.add(building);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 210);
const sun = new THREE.DirectionalLight(0xffe6c7, 2.45);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.normalBias = .025;
sun.shadow.bias = -.00018;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xfff7e6, 0x657e86, 2.12));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .22 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = shadowCanvas.height = 64;
const context = shadowCanvas.getContext('2d');
const gradient = context.createRadialGradient(32, 32, 6, 32, 32, 32);
gradient.addColorStop(0, 'rgba(15, 24, 28, .30)');
gradient.addColorStop(.62, 'rgba(15, 24, 28, .14)');
gradient.addColorStop(1, 'rgba(15, 24, 28, 0)');
context.fillStyle = gradient;
context.fillRect(0, 0, 64, 64);
const baseShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
  map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false,
}));
baseShadow.rotation.x = -Math.PI / 2;
scene.add(baseShadow);

let renderer;
let manifest;
let effects;
let legacy;
let roof;
let view = 'room';
let floor = 7;
let space = 'f7_room_1';
let selectedObject = '';
let elevatorOpen = false;
let elevatorLocked = false;

const floors = new Map();
const scopes = new Map();
const roomTypes = new Map();
const viewBounds = new THREE.Box3();
const lookAt = new THREE.Vector3();
let yaw = 0;
let pitch = 0;
let zoom = 1;
let dirty = true;
let lastFrame = 0;

function mountModel(original, parent, name, translation) {
  const model = original.clone(true);
  model.name = name;
  model.position.fromArray(translation);
  model.traverse(node => {
    if (node.isMesh) node.castShadow = node.receiveShadow = true;
  });
  parent.add(model);
  return model;
}

function option(value, label) {
  return new Option(label, value);
}

function press(button, value) {
  button.setAttribute('aria-pressed', String(value));
}

function addButton(container, label, data, click) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  Object.assign(button.dataset, data);
  press(button, false);
  button.addEventListener('click', click);
  container.append(button);
  return button;
}

function addRoom(model, parent, record) {
  const node = mountModel(model, parent, record.id, record.translation);
  const scope = { id: record.id, node, record, info: roomTypes.get(record.type), smoke: 'off', flood: 0 };
  scope.items = collectBurnables(node);
  setBurnState(node, 'intact');
  for (const name of record.hideNodes ?? []) node.getObjectByName(name).userData.hiddenInAssembly = true;
  scopes.set(scope.id, scope);
  return scope;
}

function assemble(models) {
  legacy = new THREE.Group();
  legacy.name = 'fire_multifloor_v2';
  building.add(legacy);
  mountModel(models.get('building-shell'), legacy, 'legacy_shell', [0, 0, 0]);
  for (const n of manifest.base.floorNumbers) {
    mountModel(models.get(`building-floor-${n}`), legacy, `legacy_floor_${n}`, [0, (n - 1) * manifest.building.floorHeight, 0]);
  }
  legacy.traverse(node => {
    if (node.name.startsWith('cutaway_')) node.visible = false;
    if (node.name.startsWith('burnt_')) node.visible = false;
  });
  const stairs = manifest.building.stairs.stops;
  const stairTemplate = models.get('stairwell');
  const connection = stairs[0];
  const bridge = addRoom(stairTemplate, legacy, { ...connection, type: 'stairwell' });
  setCutaway(bridge.node, 'building');

  const upperShell = models.get(manifest.building.floorShellModel);
  for (const record of manifest.building.floors) {
    const group = new THREE.Group();
    group.name = `floor_${record.number}`;
    building.add(group);
    const shell = upperShell.getObjectByName(record.shellNode).clone(true);
    shell.traverse(node => {
      if (node.isMesh) node.castShadow = node.receiveShadow = true;
    });
    group.add(shell);
    const rooms = record.rooms.map(room => addRoom(models.get(room.model), group, room));
    const stair = stairs.find(stop => stop.id === record.stairwell);
    const stairwell = addRoom(stairTemplate, group, { ...stair, type: 'stairwell' });
    floors.set(record.number, { record, group, shell, rooms, stairwell, doorsOpen: true });
  }
  const roofSpec = manifest.building.roof;
  roof = mountModel(models.get(roofSpec.model), building, 'roof', roofSpec.translation);
  scene.updateMatrixWorld(true);
}

function setCutaway(node, mode) {
  node.traverse(child => {
    if (child.userData.hiddenInAssembly) {
      child.visible = false;
      return;
    }
    const name = child.name;
    if (name.startsWith('cutaway_front_room')) child.visible = mode === 'corridor';
    if (name.startsWith('cutaway_ceiling_room') || name.startsWith('cutaway_core_face')) child.visible = false;
    if (name === 'cutaway_side_right') child.visible = mode !== 'room';
    if (name === 'cutaway_side_left') child.visible = true;
    if (name === 'cutaway_stair_west' || name === 'cutaway_stair_east') child.visible = false;
    if (name === 'stair_top_landing') child.visible = mode === 'room';
  });
}

function applyVisibility() {
  legacy.visible = view === 'building';
  roof.visible = view === 'building' || view === 'roof';
  roof.getObjectByName('cutaway_roof_bulkhead').visible = view === 'building';
  for (const [number, entry] of floors) {
    const wholeFloor = (view === 'floor' || view === 'corridor') && number === floor;
    const all = view === 'building';
    const roofStairs = floor === number && view === 'roof';
    const roomMode = number === floor && view === 'room';
    const liftMode = number === floor && view === 'lift';
    entry.group.visible = all || roofStairs || roomMode || wholeFloor || liftMode;
    entry.shell.visible = all || wholeFloor || liftMode;
    entry.shell.traverse(node => {
      if (node.name.startsWith('cutaway_corridor')) node.visible = false;
      if (liftMode && (node.name.startsWith('corridor_') || node.name.startsWith('floor_number_'))) node.visible = false;
      if (!liftMode && (node.name.startsWith('corridor_') || node.name.startsWith('floor_number_'))) node.visible = true;
      if (node.name.startsWith('cutaway_elevator_outer_')) node.visible = !liftMode;
    });
    for (const room of entry.rooms) {
      room.node.visible = all || wholeFloor || (roomMode && room.id === space);
      setCutaway(room.node, view);
    }
    entry.stairwell.node.visible = all || wholeFloor || roofStairs || (roomMode && entry.stairwell.id === space);
    setCutaway(entry.stairwell.node, view);
  }
  scene.updateMatrixWorld(true);
}

function currentScope() {
  return view === 'room' || view === 'floor' ? scopes.get(space) : null;
}

function currentState(scope) {
  if (!scope) return null;
  const candidates = selectedObject ? scope.items.filter(item => item.id === selectedObject) : scope.items;
  const state = candidates[0].node.userData.fireState;
  return candidates.every(item => item.node.userData.fireState === state) ? state : null;
}

function populateSpace() {
  const entry = floors.get(floor);
  spaceSelect.replaceChildren(
    ...entry.rooms.map((room, i) => option(room.id, `${room.info.label} · ${relativeNames[i]}`)),
    option(entry.stairwell.id, entry.stairwell.info.label),
  );
  spaceSelect.value = space;
  populateObjects();
}

function populateObjects() {
  const scope = scopes.get(space);
  objectSelect.replaceChildren(
    option('', 'כל החפצים'),
    ...scope.items.map(item => option(item.id, item.node.userData.label)),
  );
  objectSelect.value = selectedObject;
}

function description() {
  const entry = floors.get(floor);
  const selected = scopes.get(space);
  if (view === 'building') return ['בניין הכיבוי', '10 קומות וגג'];
  if (view === 'roof') return ['גג', 'יציאה דרך חדר המדרגות'];
  if (view === 'corridor') return ['מסדרון', `קומה ${floor} · 3 דלתות לחדרים`];
  if (view === 'lift') return ['מעלית', `קומה ${floor}`];
  if (view === 'floor') return [`קומה ${floor}`, entry.record.label];
  if (selected.record.type === 'stairwell') {
    return ['חדר מדרגות', floor === 10 ? 'קומה 10 אל הגג' : `קומה ${floor} אל קומה ${floor + 1}`];
  }
  return [selected.info.label, `קומה ${floor} · ${relativeNames[entry.rooms.indexOf(selected)]}`];
}

function updateDetails() {
  const panel = $('#structure-details');
  const spec = {
    building: [['קומות חדשות', 'מ־4 עד 10'], ['גובה קומה', '3.20 מ׳'], ['יציאה עליונה', 'גג דרך המדרגות']],
    roof: [['מפלס הגג', '32 מ׳'], ['חיבור', '16 מדרגות מקומה 10'], ['מסלול על הגג', 'מהדלת אל רחבת הכינוס']],
    corridor: [['רוחב המסדרון', '2.20 מ׳'], ['גישה לחדרים', 'שלוש דלתות'], ['גישה לקומות', 'חדר המדרגות בקצה המסדרון']],
    lift: [['קומות שירות', 'מ־4 עד 10'], ['תא מעלית', 'חונה בקומה 4'], ['מסלול מילוט', 'חדר המדרגות']],
  }[view];
  panel.hidden = !spec;
  if (!spec) return;
  panel.replaceChildren(...spec.map(([label, value]) => {
    const row = document.createElement('div');
    const key = document.createElement('dt');
    const data = document.createElement('dd');
    key.textContent = label;
    data.textContent = value;
    row.append(key, data);
    return row;
  }));
}

function updateEffects() {
  const scope = currentScope();
  effects.attach(scope?.node ?? null, scope?.info);
  effects.configure({
    burning: scope ? scope.items.filter(item => item.node.userData.fireState === 'burning') : [],
    smoke: scope?.smoke ?? 'off',
    floodDepth: scope?.flood ?? 0,
  });
  dirty = true;
}

function updateLift() {
  elevatorLocked = [...scopes.values()].some(scope => scope.items.some(item => item.node.userData.fireState === 'burning'));
  if (elevatorLocked) elevatorOpen = false;
  const carFloor = manifest.building.elevator.parkedAt;
  const { shell, record } = floors.get(carFloor);
  const [left, right] = record.elevator.panels.map(name => shell.getObjectByName(name));
  left.position.x = elevatorOpen ? 12.352 : 12.931;
  right.position.set(elevatorOpen ? 12.349 : 13.489, 0, elevatorOpen ? -2.125 : -2.043);
  const liftStatus = $('#lift-status');
  liftStatus.hidden = view !== 'lift';
  if (view === 'lift') {
    liftStatus.textContent = elevatorLocked ? 'המעלית מושבתת בזמן שריפה' :
      floor === carFloor ? (elevatorOpen ? 'דלתות התא פתוחות' : 'תא המעלית חונה בקומה זו') : 'התא חונה בקומה 4';
  }
}

function updateControls() {
  const scope = currentScope();
  const entry = floors.get(floor);
  $('#room-selectors').hidden = $('#room-controls').hidden = !scope;
  const access = view !== 'roof' && view !== 'building';
  $('#access-controls').hidden = !access;
  const door = $('#doors');
  updateLift();
  if (view === 'lift') {
    door.disabled = elevatorLocked || floor !== manifest.building.elevator.parkedAt;
    door.textContent = elevatorOpen ? 'סגירת תא' : 'פתיחת תא';
    press(door, elevatorOpen);
  } else {
    door.disabled = false;
    door.textContent = entry.doorsOpen ? 'דלתות פתוחות' : 'דלתות סגורות';
    press(door, entry.doorsOpen);
  }
  $('#lift').textContent = view === 'lift' ? 'מסדרון' : 'מעלית';
  press($('#lift'), view === 'lift');
  $$('.views button').forEach(button => press(button, button.dataset.view === (view === 'lift' ? 'corridor' : view)));
  $$('#floors button').forEach(button => press(button, Number(button.dataset.floor) === floor && view !== 'roof'));
  const state = currentState(scope);
  $$('[data-state]').forEach(button => press(button, button.dataset.state === state));
  $$('[data-smoke]').forEach(button => press(button, button.dataset.smoke === scope?.smoke));
  floodSlider.value = Math.round((scope?.flood ?? 0) * 100);
  $('#depth').value = `${floodSlider.value} ס״מ`;
  const [title, context] = description();
  $('#view-title').textContent = title;
  $('#view-context').textContent = context;
  $('#status').textContent = scope ? `${scope.items.length} חפצים · ${state ? stateNames[state] : 'מצבים מעורבים'}` :
    view === 'lift' ? (elevatorLocked ? 'נעילת שריפה פעילה' : 'תא המעלית ומפלס הגישה') :
    view === 'roof' ? 'מדרגות · דלת יציאה · רחבת כינוס' : context;
  updateDetails();
  updateEffects();
}

function setView(next) {
  if (next === 'roof') {
    floor = 10;
    space = floors.get(floor).rooms[0].id;
    selectedObject = '';
    populateSpace();
  }
  if (view === 'lift' && next !== 'lift') elevatorOpen = false;
  view = next;
  applyVisibility();
  updateControls();
  resetCamera();
}

function changeFloor(next) {
  const oldType = scopes.get(space)?.record.type;
  floor = next;
  const entry = floors.get(floor);
  space = oldType === 'stairwell' ? entry.stairwell.id :
    (entry.rooms.find(scope => scope.record.type === oldType) ?? entry.rooms[0]).id;
  selectedObject = '';
  elevatorOpen = false;
  populateSpace();
  setView(view === 'building' || view === 'roof' ? 'floor' : view);
}

function box(min, max) {
  viewBounds.min.fromArray(min);
  viewBounds.max.fromArray(max);
}

function cameraBounds() {
  const y = floors.get(floor).record.elevation;
  if (view === 'room') {
    const { node, info } = scopes.get(space);
    box(...info.bounds);
    viewBounds.translate(node.getWorldPosition(new THREE.Vector3()));
  } else if (view === 'building') {
    box([-10.14, -.20, -4.11], [14.18, 34.73, 4.85]);
  } else if (view === 'roof') {
    box([-10.16, 28.63, -4.15], [14.17, 34.64, 3.27]);
  } else if (view === 'lift') {
    box([11.40, y - .17, -4.06], [14.02, y + 3.20, 1.46]);
  } else {
    box([-10.07, y - .18, -4.12], [14.10, y + 3.24, 3.25]);
  }
}

function resetCamera() {
  cameraBounds();
  [yaw, pitch] = {
    room: [.42, .45],
    floor: [.23, .58],
    corridor: [-.35, .41],
    building: [.36, .22],
    roof: [.20, .63],
    lift: [.41, .40],
  }[view];
  if (view === 'room' && currentScope().record.type === 'stairwell') [yaw, pitch] = [.68, .36];
  zoom = 1;
  viewBounds.getCenter(lookAt);
  const size = viewBounds.getSize(new THREE.Vector3());
  const span = size.length();
  sun.target.position.copy(lookAt);
  sun.position.copy(lookAt).addScaledVector(new THREE.Vector3(-.56, .90, .74), span);
  Object.assign(sun.shadow.camera, { left: -span * .59, right: span * .59, top: span * .59, bottom: -span * .59, far: span * 2.55 });
  sun.shadow.camera.updateProjectionMatrix();
  ground.position.y = viewBounds.min.y - .063;
  ground.visible = view !== 'building' && view !== 'lift';
  baseShadow.position.set(lookAt.x, ground.position.y - .009, lookAt.z);
  baseShadow.scale.set(size.x * 1.36, size.z * 1.65, 1);
  renderer.shadowMap.enabled = view !== 'building';
  dirty = true;
}

const direction = new THREE.Vector3();
const corner = new THREE.Vector3();

function frameCamera(width, height) {
  const aspect = width / height;
  direction.set(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
  camera.position.copy(lookAt).addScaledVector(direction, 69);
  camera.lookAt(lookAt);
  camera.updateMatrixWorld();
  let halfX = 0;
  let halfY = 0;
  for (const x of [viewBounds.min.x, viewBounds.max.x]) {
    for (const y of [viewBounds.min.y, viewBounds.max.y]) {
      for (const z of [viewBounds.min.z, viewBounds.max.z]) {
        corner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        halfX = Math.max(halfX, Math.abs(corner.x));
        halfY = Math.max(halfY, Math.abs(corner.y));
      }
    }
  }
  const verticalCoverage = view === 'building' ? .84 : .79;
  const halfHeight = Math.max(halfY / verticalCoverage, halfX / (aspect * .88)) / zoom;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  const verticalBias = view === 'building' ? .155 : .07;
  camera.top = halfHeight * (1 - verticalBias);
  camera.bottom = -halfHeight * (1 + verticalBias);
  camera.updateProjectionMatrix();
}

function render(now) {
  requestAnimationFrame(render);
  if (document.hidden) {
    lastFrame = 0;
    return;
  }
  if (!dirty && (!effects.animating || now - lastFrame < 28)) return;
  const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, .10) : 1 / 60;
  lastFrame = now;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  if (dirty) {
    renderer.setSize(width, height, false);
    frameCamera(width, height);
    const scope = currentScope();
    if (scope && view === 'room' && scope.record.type !== 'stairwell') {
      scope.node.getObjectByName('cutaway_side_right').visible = yaw < 0;
      scope.node.getObjectByName('cutaway_side_left').visible = yaw >= 0;
    }
  }
  effects.step(elapsed);
  renderer.render(scene, camera);
  dirty = false;
}

function orbit(dx, dy) {
  yaw = THREE.MathUtils.clamp(yaw + dx, -1.06, 1.06);
  pitch = THREE.MathUtils.clamp(pitch + dy, .13, 1.02);
  dirty = true;
}
function magnify(factor) {
  zoom = THREE.MathUtils.clamp(zoom * factor, .72, 1.9);
  dirty = true;
}

function toggleDoor() {
  if (view === 'lift') {
    if (elevatorLocked || floor !== manifest.building.elevator.parkedAt) return;
    elevatorOpen = !elevatorOpen;
  } else {
    const entry = floors.get(floor);
    entry.doorsOpen = !entry.doorsOpen;
    for (const scope of [...entry.rooms, entry.stairwell]) {
      const hinge = scope.items.find(item => item.node.userData.door)?.node;
      const angles = hinge.userData.door;
      hinge.quaternion.setFromAxisAngle(doorAxis, entry.doorsOpen ? angles.openRadians : angles.closedRadians);
    }
  }
  updateControls();
}

function bindInputs() {
  for (const n of manifest.building.upperFloorNumbers) {
    const button = addButton($('#floors'), String(n), { floor: n }, () => changeFloor(n));
    button.setAttribute('aria-label', `קומה ${n}`);
    button.title = floors.get(n).record.label;
  }
  for (const mode of manifest.effects.smoke.modes) {
    addButton($('#smoke-options'), mode.label, { smoke: mode.id }, () => {
      currentScope().smoke = mode.id;
      updateControls();
    });
  }
  $$('.views button').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  $$('[data-state]').forEach(button => button.addEventListener('click', () => {
    const scope = currentScope();
    const state = button.dataset.state;
    const wasBurning = scope.items.some(item => item.node.userData.fireState === 'burning');
    setBurnState(scope.node, state, selectedObject || null);
    if (state === 'burning' && !wasBurning && scope.smoke === 'off') scope.smoke = 'light';
    updateControls();
  }));
  spaceSelect.addEventListener('change', () => {
    space = spaceSelect.value;
    selectedObject = '';
    populateObjects();
    applyVisibility();
    updateControls();
    if (view === 'room') resetCamera();
  });
  objectSelect.addEventListener('change', () => {
    selectedObject = objectSelect.value;
    updateControls();
  });
  floodSlider.max = Math.round(manifest.effects.flood.maxDepthMeters * 100);
  floodSlider.addEventListener('input', () => {
    currentScope().flood = Number(floodSlider.value) / 100;
    updateControls();
  });
  $('#doors').addEventListener('click', toggleDoor);
  $('#lift').addEventListener('click', () => setView(view === 'lift' ? 'corridor' : 'lift'));
  $('#reset-camera').addEventListener('click', resetCamera);

  let pointer = null;
  canvas.addEventListener('pointerdown', event => {
    if (pointer || (event.pointerType === 'mouse' && event.button !== 0)) return;
    canvas.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    orbit((pointer.x - event.clientX) * .009, (event.clientY - pointer.y) * .007);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  canvas.addEventListener('lostpointercapture', event => {
    if (pointer?.id === event.pointerId) pointer = null;
  });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    magnify(Math.exp(-event.deltaY * .0013));
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    const commands = {
      ArrowRight: () => orbit(.12, 0), ArrowLeft: () => orbit(-.12, 0),
      ArrowUp: () => orbit(0, .09), ArrowDown: () => orbit(0, -.09),
      '+': () => magnify(1.12), '=': () => magnify(1.12), '-': () => magnify(1 / 1.12), Home: resetCamera,
    };
    const command = commands[event.key];
    if (command) {
      event.preventDefault();
      command();
    }
  });
}

function inspect() {
  const scope = currentScope();
  const entry = floors.get(floor);
  return {
    view, floor, space, selectedObject,
    roomType: scope?.record.type ?? null,
    states: scope?.items.map(({ id, node, intact, burnt }) => ({
      id, state: node.userData.fireState,
      intact: intact.visible && intact.scale.x > 0, burnt: burnt.visible && burnt.scale.x > 0,
    })) ?? [],
    smoke: scope?.smoke ?? null,
    effects: effects.status(),
    elevatorLocked, elevatorOpen,
    doorsOpen: entry.doorsOpen,
    doorAngles: [...entry.rooms, entry.stairwell].map(room => {
      const { y, w } = room.node.getObjectByName('burn_door').quaternion;
      return 2 * Math.atan2(y, w);
    }),
    elevatorPanels: entry.record.elevator.panels.map(name => entry.shell.getObjectByName(name).position.toArray()),
    floors: [...floors].filter(([, entry]) => entry.group.visible).map(([n]) => n),
    legacyVisible: legacy.visible, roofVisible: roof.visible,
    camera: camera.position.toArray(), zoom,
    rendered: renderer.info.render.triangles,
  };
}

async function init() {
  const response = await fetch(new URL('manifest.json', baseURL));
  if (!response.ok) throw new Error(`manifest.json: HTTP ${response.status}`);
  manifest = await response.json();
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  manifest.rooms.forEach(room => roomTypes.set(room.id, room));
  const loader = new GLTFLoader();
  const [entries, roomEffects] = await Promise.all([
    Promise.all([...manifest.assets, ...manifest.base.models].map(async asset =>
      [asset.id, (await loader.loadAsync(new URL(asset.path, baseURL).href)).scene])),
    createInteriorEffects(manifest.effects, baseURL, matchMedia('(prefers-reduced-motion: reduce)').matches),
  ]);
  effects = roomEffects;
  scene.add(effects.root);
  assemble(new Map(entries));
  populateSpace();
  bindInputs();
  setView('room');
  new ResizeObserver(() => { dirty = true; }).observe(stage);
  window.fireInteriorsPreview = { inspect };
  $('#loading').hidden = true;
  $('#app').setAttribute('aria-busy', 'false');
  requestAnimationFrame(render);
}

init().catch(error => {
  console.error(error);
  $('#loading').textContent = 'טעינת התצוגה נכשלה. יש לפתוח דרך שרת מקומי בדפדפן שתומך בתלת־ממד.';
  $('#status').textContent = 'תקלה בטעינת הנכסים';
  $('#app').setAttribute('aria-busy', 'false');
});
