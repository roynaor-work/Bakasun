// Original CC0 preview; existing Three.js / GLTFLoader remain MIT in ../../vendor/.
import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';

const definitions = [
  ['player-ship', 'חללית שחקן', 4000],
  ['police-car', 'ניידת משטרה', 3000],
  ['sports-car', 'רכב ספורט', 3000],
  ['pickup', 'טנדר בריחה', 3000],
  ['armored-boss', 'רכב הבוס המשוריין', 3000],
  ['roadblock', 'מחסום דרך', 3000],
  ['cone', 'קונוס בטיחות', 3000],
];
const canvas = document.querySelector('canvas');
const viewer = document.querySelector('.viewer');
const labels = document.querySelector('.labels');
const files = document.querySelector('#files');
const status = document.querySelector('#status');
const playButton = document.querySelector('#animate');
const overviewButton = document.querySelector('#overview');
const state = window.shipChasePreview = {
  ready: false, errors: [], assets: [], animationsEnabled: !matchMedia('(prefers-reduced-motion: reduce)').matches,
  time: 0, selection: null, setTime, select, render, snapshot,
};
window.previewReady = false;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfe8e9');
const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .05, 250);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.13;
} catch (error) {
  fail(error);
  throw error;
}
scene.add(new THREE.HemisphereLight('#f6fdff', '#8b9d92', 2));
const key = new THREE.DirectionalLight('#fff3d8', 2.7);
key.position.set(-10, 20, 12); scene.add(key);
const fill = new THREE.DirectionalLight('#b7dbf5', 1.05);
fill.position.set(10, 8, -14); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: '#dfe8e9', roughness: .95 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -.045; scene.add(floor);
const models = new Map();
Object.assign(state, { scene, camera, renderer, models });
const allBox = new THREE.Box3();
let yaw = viewer.clientWidth < 640 ? .12 : .34, pitch = .76, zoom = 1, lastTime, manualTime = false;
const center = new THREE.Vector3(), extent = new THREE.Vector3();
const clock = new THREE.Clock();
const pointerPositions = new Map();
let pinchDistance;
let previousMobileLayout = viewer.clientWidth < 640;

function snapshot() {
  scene.updateMatrixWorld(true);
  return {
    ready: state.ready, errors: [...state.errors], time: state.time,
    selection: state.selection, animationsEnabled: state.animationsEnabled,
    assets: state.assets.map(asset => ({
      ...asset,
      visible: models.get(asset.id).group.visible,
      nodes: asset.nodes.map(name => {
        const node = models.get(asset.id).model.getObjectByName(name);
        return { name, quaternion: node.quaternion.toArray(), position: node.position.toArray(),
          worldPosition: node.getWorldPosition(new THREE.Vector3()).toArray() };
      }),
    })),
    renderMetrics: { ...state.renderMetrics },
  };
}

function fail(error) {
  const message = String(error);
  state.errors.push(message);
  window.previewError = message;
  status.textContent = 'טעינה נכשלה';
  const alert = document.querySelector('#error');
  alert.hidden = false; alert.className = 'error';
  alert.textContent = `לא ניתן להציג את החבילה: ${message}`;
  console.error(error);
}

function setTime(seconds) {
  if (!Number.isFinite(seconds)) throw new TypeError('Time must be finite');
  manualTime = true;
  state.time = seconds;
  animateModels(seconds);
  render();
}
function animateModels(seconds) {
  for (const { model, pivots } of models.values()) {
    for (const pivot of pivots) {
      if (pivot.kind === 'wheel') pivot.object.quaternion.copy(pivot.rest).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), seconds * 2.2));
      else pivot.object.quaternion.copy(pivot.rest).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), seconds * 6.4));
    }
    model.updateMatrixWorld(true);
  }
}
function select(id = null) {
  if (id !== null && !models.has(id)) throw new Error(`Unknown model: ${id}`);
  state.selection = id;
  overviewButton.setAttribute('aria-pressed', String(id === null));
  for (const [name, entry] of models) {
    entry.group.visible = id === null || id === name;
    entry.label.hidden = !entry.group.visible;
    entry.row.classList.toggle('selected', id === name);
  }
  yaw = viewer.clientWidth < 640 && id === null ? .12 : .34; pitch = .76; zoom = 1;
  frameCamera(); render();
}
function updateLayout() {
  const mobile = viewer.clientWidth < 640;
  if (mobile !== previousMobileLayout && state.selection === null) yaw = mobile ? .12 : .34;
  previousMobileLayout = mobile;
  const positions = mobile
    ? [[-3.2, -10], [3.2, -10], [-3.2, -2.5], [3.2, -2.5], [-3.2, 5], [3.2, 5], [3.2, 11]]
    : [[-8, -4.7], [0, -4.7], [8, -4.7], [-8, 4.2], [0, 4.2], [7.2, 3], [10.1, 6.1]];
  let index = 0;
  for (const entry of models.values()) {
    const [x, z] = positions[index++];
    entry.group.position.set(x, 0, z);
    entry.group.updateMatrixWorld(true);
  }
  frameCamera();
}
function frameCamera() {
  const visible = [...models.values()].filter(entry => entry.group.visible);
  if (!visible.length) return;
  allBox.makeEmpty();
  // Use resting asset bounds: wheel and barrel animation cannot shift framing.
  for (const entry of visible) {
    allBox.union(entry.restBox.clone().translate(entry.group.position));
  }
  allBox.getCenter(center); allBox.getSize(extent);
  center.y = Math.max(.3, center.y - .2);
  const distance = Math.max(extent.length(), 5) * 2.8;
  const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center); camera.updateMatrixWorld();
  const aspect = Math.max(canvas.clientWidth, 1) / Math.max(canvas.clientHeight, 1);
  let maxX = 0, maxY = 0;
  for (const x of [allBox.min.x - .6, allBox.max.x + .6]) {
    for (const y of [allBox.min.y - .8, allBox.max.y + .3]) {
      for (const z of [allBox.min.z - .5, allBox.max.z + 1.2]) {
        const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        maxX = Math.max(maxX, Math.abs(point.x)); maxY = Math.max(maxY, Math.abs(point.y));
      }
    }
  }
  const half = Math.max(maxY, maxX / aspect) * 1.065 / zoom;
  camera.left = -half * aspect; camera.right = half * aspect;
  camera.top = half; camera.bottom = -half;
  camera.updateProjectionMatrix();
}
function render() {
  if (!renderer) return;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (width < 1 || height < 1) return;
  renderer.setSize(width, height, false);
  renderer.render(scene, camera);
  for (const entry of models.values()) {
    const anchor = new THREE.Vector3(entry.restBox.getCenter(new THREE.Vector3()).x, .02, entry.restBox.max.z + .65);
    anchor.add(entry.group.position).project(camera);
    entry.label.style.left = `${(anchor.x * .5 + .5) * width}px`;
    entry.label.style.top = `${(-anchor.y * .5 + .5) * height}px`;
  }
  state.renderMetrics = { triangles: renderer.info.render.triangles, drawCalls: renderer.info.render.calls, width, height };
}
function updatePlayButton() {
  playButton.setAttribute('aria-pressed', String(state.animationsEnabled));
  playButton.textContent = state.animationsEnabled ? 'השהיית תנועה' : 'הפעלת תנועה';
}
playButton.addEventListener('click', () => {
  state.animationsEnabled = !state.animationsEnabled;
  manualTime = false; lastTime = undefined; updatePlayButton();
});
overviewButton.addEventListener('click', () => select(null));
document.querySelector('#reset').addEventListener('click', () => {
  yaw = viewer.clientWidth < 640 && state.selection === null ? .12 : .34;
  pitch = .76; zoom = 1; frameCamera(); render();
});
canvas.addEventListener('pointerdown', event => {
  canvas.setPointerCapture(event.pointerId);
  pointerPositions.set(event.pointerId, [event.clientX, event.clientY]); pinchDistance = undefined;
});
const releasePointer = event => { pointerPositions.delete(event.pointerId); pinchDistance = undefined; };
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('pointermove', event => {
  if (!pointerPositions.has(event.pointerId)) return;
  const previous = pointerPositions.get(event.pointerId);
  pointerPositions.set(event.pointerId, [event.clientX, event.clientY]);
  if (pointerPositions.size === 2) {
    const [a, b] = [...pointerPositions.values()];
    const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinchDistance) zoom = Math.min(4, Math.max(.55, zoom * distance / pinchDistance));
    pinchDistance = distance;
  } else {
    yaw -= (event.clientX - previous[0]) * .006;
    pitch = Math.min(1.43, Math.max(.15, pitch + (event.clientY - previous[1]) * .004));
  }
  frameCamera(); render();
});
canvas.addEventListener('wheel', event => {
  event.preventDefault(); zoom = Math.min(4, Math.max(.55, zoom * Math.exp(-event.deltaY * .001)));
  frameCamera(); render();
}, { passive: false });
new ResizeObserver(() => { updateLayout(); render(); }).observe(viewer);
updatePlayButton();

const loader = new GLTFLoader();
async function load() {
  const settled = await Promise.allSettled(definitions.map(async ([id, title, budget]) => {
    const url = `runtime/${id}.glb`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    const gltf = await loader.parseAsync(buffer, new URL('./runtime/', location.href).href);
    return { id, title, budget, bytes: buffer.byteLength, model: gltf.scene };
  }));
  for (const [index, result] of settled.entries()) {
    if (result.status === 'rejected') { fail(`${definitions[index][0]}: ${result.reason}`); continue; }
    const { id, title, budget, bytes, model } = result.value;
    let triangles = 0;
    const nodes = [], pivots = [];
    model.traverse(object => {
      nodes.push(object.name);
      if (object.isMesh) {
        const count = object.geometry.index?.count ?? object.geometry.attributes.position.count;
        triangles += count / 3;
      }
      if (/^Wheel_(FL|FR|RL|RR)$/.test(object.name)) pivots.push({ object, kind: 'wheel', rest: object.quaternion.clone() });
      if (/^Barrel_[LR]$/.test(object.name)) pivots.push({ object, kind: 'barrel', rest: object.quaternion.clone() });
    });
    const bounds = new THREE.Box3().setFromObject(model);
    const dimensions = bounds.getSize(new THREE.Vector3()).toArray();
    const group = new THREE.Group();
    // Only showroom placement is adjusted; original file coordinates remain intact.
    model.position.y = -bounds.min.y + (id === 'player-ship' ? .25 : 0);
    group.add(model); scene.add(group);
    const restBox = new THREE.Box3().setFromObject(group);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: '#688281', transparent: true, opacity: .12, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -.02, 0);
    shadow.scale.set(Math.max(dimensions[0] * .51, .3), Math.max(dimensions[2] * .47, .3), 1);
    group.add(shadow);
    const label = document.createElement('div'); label.className = 'label';
    const number = document.createElement('b'); number.textContent = String(index + 1).padStart(2, '0');
    label.append(number, title); labels.append(label);
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    const inspect = document.createElement('button'); inspect.className = 'inspect'; inspect.textContent = title;
    inspect.addEventListener('click', () => select(id));
    const file = document.createElement('span'); file.className = 'file'; file.textContent = `${id}.glb`;
    nameCell.append(inspect, file); row.append(nameCell);
    for (const text of [triangles.toLocaleString('he-IL'), (bytes / 1000).toFixed(1), dimensions.map(value => value.toFixed(2)).join(' × ')]) {
      const cell = document.createElement('td'); cell.className = 'num'; cell.textContent = text; row.append(cell);
    }
    const valid = triangles <= budget && bytes <= 300000;
    const budgetCell = document.createElement('td'); budgetCell.className = valid ? 'pass' : 'fail';
    budgetCell.textContent = valid ? 'בתקציב' : 'חריגה'; row.append(budgetCell);
    const linkCell = document.createElement('td'), link = document.createElement('a');
    link.href = `runtime/${id}.glb`; link.download = `${id}.glb`; link.textContent = 'הורדה';
    linkCell.append(link); row.append(linkCell); files.append(row);
    models.set(id, { id, group, model, pivots, restBox, label, row });
    state.assets.push({ id, title, triangles, bytes, dimensions, nodes, budget, valid, animatedNodes: pivots.map(pivot => pivot.object.name) });
    document.querySelector('#loaded-count').textContent = `${state.assets.length} / 7`;
  }
  updateLayout(); animateModels(state.time); render();
  document.querySelector('#total-bytes').textContent = (state.assets.reduce((sum, item) => sum + item.bytes, 0) / 1000).toFixed(1);
  document.querySelector('#total-triangles').textContent = state.assets.reduce((sum, item) => sum + item.triangles, 0).toLocaleString('he-IL');
  state.ready = state.errors.length === 0 && models.size === definitions.length;
  window.previewReady = state.ready;
  if (state.ready) status.textContent = 'כל 7 המודלים נטענו';
  const initial = new URLSearchParams(location.search).get('asset');
  if (initial && models.has(initial)) select(initial);
}
load().catch(fail);
function tick() {
  const now = clock.getElapsedTime();
  const delta = lastTime === undefined ? 0 : Math.min(now - lastTime, .1);
  lastTime = now;
  if (state.animationsEnabled && !manualTime && state.ready) {
    state.time += delta; animateModels(state.time);
  }
  render(); requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
