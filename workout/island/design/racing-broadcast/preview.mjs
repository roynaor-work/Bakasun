// Original CC0 preview code. The existing Three.js r160 files remain under MIT.
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';

const status = document.querySelector('#load-status');
const lampContainer = document.querySelector('#lamps');
const sequence = document.querySelector('#sequence');
const reset = document.querySelector('#reset');
sequence.disabled = reset.disabled = true;
const lamps = [], buttons = [], timers = new Set();
let renderer, scene, camera, frameCount = 0;
const render = () => { if (renderer) { renderer.render(scene, camera); frameCount++; } };

function setLamp(index, enabled) {
  if (!lamps[index]) return;
  lamps[index].emissiveIntensity = enabled ? 1 : 0;
  buttons[index].setAttribute('aria-pressed', String(enabled));
  render();
}
function cancelSequence() {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
}
function resetLamps() {
  cancelSequence();
  lamps.forEach((_, i) => setLamp(i, false));
}
function runSequence() {
  resetLamps();
  for (let i = 0; i < 5; i++) {
    const timer = setTimeout(() => {timers.delete(timer); setLamp(i, true);}, i*650);
    timers.add(timer);
  }
  const timer = setTimeout(() => {timers.delete(timer); lamps.forEach((_, i) => setLamp(i, false));}, 3900);
  timers.add(timer);
}
sequence.addEventListener('click', runSequence);
reset.addEventListener('click', resetLamps);
addEventListener('pagehide', () => {cancelSequence(); renderer?.dispose();}, {once:true});

async function imageReady(path) {
  const image = new Image();
  image.src = path;
  await image.decode();
  return {path, width:image.naturalWidth, height:image.naturalHeight};
}

async function init() {
  const response = await fetch('manifest.json');
  if (!response.ok) throw new Error('Manifest HTTP '+response.status);
  const manifest = await response.json();
  const grid = document.querySelector('#teams');
  const board = document.querySelector('#leaderboard');
  for (const [i, team] of manifest.teams.entries()) {
    const link = document.createElement('a');
    link.href = team.path;
    link.className = 'team';
    const icon = document.createElement('img');
    icon.src = team.path; icon.width = icon.height = 64; icon.alt = '';
    const label = document.createElement('span'); label.textContent = team.name;
    link.append(icon, label); grid.append(link);
    if (i < 4) {
      const row = document.createElement('li');
      row.style.setProperty('--team-color', team.color);
      const rank = document.createElement('b'); rank.textContent = String(i+1);
      const name = document.createElement('span'); name.className = 'team-name'; name.textContent = team.name;
      const gap = document.createElement('span'); gap.className = 'gap'; gap.textContent = i ? '+'+(i*1.268).toFixed(3) : '1:24.086';
      row.append(rank, icon.cloneNode(), name, gap); board.append(row);
    }
  }
  document.querySelector('#palette-note').textContent = 'צבעי הקבוצות נבחרו לפי שמותיהן באישור רועי. המיפוי המלא מתועד בהוראות ובמיפוי הנכסים.';

  const canvas = document.querySelector('#gantry');
  renderer = new T.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.65;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(28, 1, .1, 150);
  camera.position.set(5.5, 6.5, 18.2);
  camera.lookAt(0, 2.8, 0);
  scene.add(new T.HemisphereLight(0xd8f1f2, 0x142333, 2.2));
  const key = new T.DirectionalLight(0xffe5be, 3.5); key.position.set(-8, 12, 10); scene.add(key);
  const fill = new T.DirectionalLight(0x80e7db, 2); fill.position.set(9, 6, -5); scene.add(fill);
  // The road and checker line belong to the preview only, not to the GLB.
  const road = new T.Mesh(new T.BoxGeometry(17, .06, 7), new T.MeshStandardMaterial({color:0x1b303a,roughness:.9}));
  road.position.y = -.04; scene.add(road);
  const pale = new T.MeshStandardMaterial({color:0xc9d8cc,roughness:.9});
  const dark = new T.MeshStandardMaterial({color:0x0b1a23,roughness:.9});
  const square = new T.BoxGeometry(.42, .014, .42);
  for (let row=0; row<2; row++) for (let col=0; col<28; col++) {
    const tile = new T.Mesh(square, (row+col)%2 ? dark : pale);
    tile.position.set((col-13.5)*.42, .005, (row-.5)*.42); scene.add(tile);
  }
  const resize = () => {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    renderer.setSize(width, height, false); camera.aspect = width/height;
    camera.updateProjectionMatrix(); render();
  };
  new ResizeObserver(resize).observe(canvas);
  const [gltf, images] = await Promise.all([
    new GLTFLoader().loadAsync(manifest.gantry.path),
    Promise.all([...manifest.panels, ...manifest.teams].map(asset => imageReady(asset.path)))
  ]);
  const materials = new Map();
  let triangles = 0;
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    triangles += object.geometry.index ? object.geometry.index.count/3 : object.geometry.attributes.position.count/3;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.set(material.name, material);
  });
  for (const [i, name] of manifest.gantry.lamps.entries()) {
    const material = materials.get(name);
    if (!material || material.emissive.getHex() === 0) throw new Error('Missing emissive material: '+name);
    lamps.push(material);
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = String(i+1); button.setAttribute('aria-label', 'נורה '+(i+1));
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {cancelSequence(); setLamp(i, material.emissiveIntensity === 0);});
    buttons.push(button); lampContainer.append(button);
  }
  scene.add(gltf.scene);
  resetLamps();
  // A fixed initial example; no background animation or continuous render loop.
  [0,1,2].forEach(i => setLamp(i, true));
  resize();
  sequence.disabled = reset.disabled = false;
  document.querySelector('#geometry').textContent = triangles.toLocaleString('en-US')+' משולשים';
  document.querySelector('#model-status').textContent = 'הגשר נטען; כל חמש הנורות ניתנות לשליטה';
  status.textContent = '16 נכסים נטענו בהצלחה'; status.dataset.state = 'ready';
  // Read-only inspection handle for browser verification; no application state.
  window.racingBroadcast = {
    ready:true, triangles, images,
    get lamps() {return lamps.map(material => ({name:material.name,intensity:material.emissiveIntensity,emissive:material.emissive.toArray()}));},
    get renders() {return frameCount;},
    bounds:new T.Box3().setFromObject(gltf.scene).getSize(new T.Vector3()).toArray()
  };
}

init().catch(error => {
  console.error(error);
  cancelSequence();
  status.textContent = 'הטעינה נכשלה: '+error.message; status.dataset.state = 'error';
  document.querySelector('#model-status').textContent = status.textContent;
});
