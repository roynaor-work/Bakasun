// Original CC0 asset viewer. Dependencies reuse the repository's local MIT vendor.
import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';

const grid = document.querySelector('#rooms');
const status = document.querySelector('#global-status');
const views = [];
const number = new Intl.NumberFormat('en-US');
let anchorsVisible = false;
let wireframe = false;
let requestedState = 'intact';
const sharedTexture = new THREE.TextureLoader().load('./palette-1024.png', () => views.forEach(render));
sharedTexture.colorSpace = THREE.SRGBColorSpace;
sharedTexture.flipY = false;
sharedTexture.minFilter = THREE.NearestFilter;
sharedTexture.magFilter = THREE.NearestFilter;
sharedTexture.generateMipmaps = false;

function triangles(node) {
  let total = 0;
  node.traverse(child => {
    if (child.isMesh) total += (child.geometry.index?.count ?? child.geometry.attributes.position.count) / 3;
  });
  return total;
}

function visibleTriangles(node, visible = true) {
  visible &&= node.visible && node.scale.x !== 0 && node.scale.y !== 0 && node.scale.z !== 0;
  if (!visible) return 0;
  return (node.isMesh ? (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3 : 0)
    + node.children.reduce((sum, child) => sum + visibleTriangles(child, visible), 0);
}

function marker(color, radius = 0.065) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), material);
  sphere.renderOrder = 10;
  group.add(sphere);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.24, 5), material);
  stem.position.y = -0.12;
  stem.renderOrder = 10;
  group.add(stem);
  return group;
}

function setState(view, name, state) {
  const item = view.burnables.get(name);
  if (!item) return;
  item.state = state;
  item.intact.visible = state === 'intact';
  item.burnt.visible = state === 'burnt';
  item.burnt.scale.set(1, 1, 1);
  item.button?.setAttribute('aria-pressed', String(state === 'burnt'));
  if (item.button) item.button.title = `${item.node.userData.label}: ${state === 'burnt' ? 'מפויח' : 'שלם'}`;
}

function render(view) {
  if (!view.ready) return;
  view.renderer.render(view.scene, view.camera);
  view.active.textContent = number.format(visibleTriangles(view.model));
  view.card.dataset.activeTriangles = String(visibleTriangles(view.model));
  view.card.dataset.renderedTriangles = String(view.renderer.info.render.triangles);
}

function setRoomState(view, state) {
  for (const name of view.burnables.keys()) setState(view, name, state);
  render(view);
}

function nodeList(view, object, parent) {
  const li = document.createElement('li');
  const item = view.burnables.get(object.name);
  const label = document.createElement(item ? 'button' : 'span');
  label.className = 'node-name';
  label.textContent = object.name || '(scene)';
  if (item) {
    label.type = 'button';
    label.setAttribute('aria-pressed', 'false');
    label.addEventListener('click', () => {
      setState(view, object.name, item.state === 'intact' ? 'burnt' : 'intact');
      render(view);
    });
    item.button = label;
  }
  li.append(label);
  const type = document.createElement('span');
  type.className = 'node-type';
  type.textContent = object.isMesh ? `${number.format(triangles(object))} tri` : object.isCamera ? 'camera' : object.children.length ? 'group' : 'empty';
  li.append(type);
  parent.append(li);
  if (object.children.length) {
    const children = document.createElement('ul');
    li.append(children);
    for (const child of object.children) nodeList(view, child, children);
  }
}

async function roomView(entry, index) {
  const card = document.querySelector('#room-template').content.firstElementChild.cloneNode(true);
  card.dataset.room = entry.id;
  card.querySelector('h2').textContent = entry.label;
  card.querySelector('.room-number').textContent = String(index + 1).padStart(2, '0');
  card.querySelector('canvas').setAttribute('aria-label', `${entry.label} — מצלמת המשחק הקבועה`);
  card.querySelector('.total-triangles').textContent = number.format(entry.totalTriangles);
  card.querySelector('.burn-count').textContent = entry.burnableCount;
  card.querySelector('.node-count').textContent = `(${entry.nodeCount})`;
  const download = card.querySelector('.download');
  download.href = './' + entry.file;
  grid.append(card);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: card.querySelector('canvas'), antialias: true, alpha: false });
  } catch (error) {
    card.querySelector('.load-state').textContent = 'WebGL אינו זמין בדפדפן הזה.';
    throw error;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e6ebe0');
  scene.add(new THREE.HemisphereLight('#fff2db', '#c6b39e', 2.2));
  const sun = new THREE.DirectionalLight('#fff0d4', 2.5);
  sun.position.set(-3.5, 7.5, 5);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.1, far: 20 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#d3e6e0', 0.65);
  fill.position.set(4, 4, 2);
  scene.add(fill);
  const view = { id: entry.id, card, renderer, scene, camera: null, model: null,
    burnables: new Map(), markers: new THREE.Group(), ready: false,
    active: card.querySelector('.active-triangles') };
  views.push(view);
  card.querySelector('.expand').addEventListener('click', event => {
    const expanded = card.classList.toggle('expanded');
    event.currentTarget.textContent = expanded ? 'הקטנה' : 'הגדלה';
    event.currentTarget.setAttribute('aria-expanded', String(expanded));
  });
  card.querySelector('.room-intact').addEventListener('click', () => setRoomState(view, 'intact'));
  card.querySelector('.room-burnt').addEventListener('click', () => setRoomState(view, 'burnt'));
  const resize = new ResizeObserver(() => {
    const box = card.querySelector('.viewport').getBoundingClientRect();
    renderer.setSize(Math.max(1, box.width), Math.max(1, box.height), false);
    render(view);
  });
  resize.observe(card.querySelector('.viewport'));
  view.resize = resize;
  try {
    const gltf = await new GLTFLoader().loadAsync('./' + entry.file);
    view.model = gltf.scene;
    view.camera = gltf.cameras[0];
    if (!view.camera?.isOrthographicCamera) throw new Error('Missing fixed game camera');
    // A 4:3 viewport preserves the GLB camera exactly, including on phones.
    scene.add(view.model);
    view.model.updateMatrixWorld(true);
    const oldTextures = new Set();
    view.model.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        if (object.material.map) oldTextures.add(object.material.map);
        object.material.map = sharedTexture;
        object.material.wireframe = wireframe;
      }
      if (object.name.startsWith('burn_')) {
        const intact = object.getObjectByName(object.userData.intactNode);
        const burnt = object.getObjectByName(object.userData.burntNode);
        if (!intact || !burnt) throw new Error(`Missing state for ${object.name}`);
        view.burnables.set(object.name, { node: object, intact, burnt, state: 'intact' });
      }
      if (object.name.startsWith('fire_') || ['rescue_spot', 'door_exit'].includes(object.name)) {
        const isFire = object.name.startsWith('fire_');
        const dot = marker(isFire ? '#ed7844' : object.name === 'rescue_spot' ? '#399cba' : '#4a9e77', isFire ? 0.055 : 0.09);
        object.getWorldPosition(dot.position);
        if (!isFire) dot.position.y += 0.18;
        dot.name = 'helper_' + object.name;
        view.markers.add(dot);
      }
    });
    for (const texture of oldTextures) if (texture !== sharedTexture) texture.dispose();
    const total = triangles(view.model);
    if (total !== entry.totalTriangles || total > 6000) throw new Error(`Triangle budget mismatch: ${total}`);
    const root = view.model.children[0];
    nodeList(view, root, card.querySelector('.node-tree'));
    view.markers.visible = anchorsVisible;
    scene.add(view.markers);
    view.ready = true;
    card.dataset.totalTriangles = String(total);
    card.querySelector('.load-state').hidden = true;
    setRoomState(view, requestedState);
    card.dataset.loaded = 'true';
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    card.querySelector('canvas').addEventListener('click', event => {
      const rect = event.currentTarget.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
      raycaster.setFromCamera(pointer, view.camera);
      const hit = raycaster.intersectObject(view.model, true).find(hit => {
        let node = hit.object;
        while (node) {
          if (!node.visible || node.scale.x === 0) return false;
          node = node.parent;
        }
        return true;
      });
      let object = hit?.object;
      while (object && !view.burnables.has(object.name)) object = object.parent;
      if (object) {
        const item = view.burnables.get(object.name);
        setState(view, object.name, item.state === 'intact' ? 'burnt' : 'intact');
        render(view);
      }
    });
    return view;
  } catch (error) {
    card.querySelector('.load-state').hidden = false;
    card.querySelector('.load-state').textContent = 'טעינת החדר נכשלה. יש לפתוח דרך שרת HTTP מקומי.';
    card.dataset.error = String(error);
    throw error;
  }
}

document.querySelector('#all-intact').addEventListener('click', () => {
  requestedState = 'intact';
  for (const view of views) setRoomState(view, requestedState);
});
document.querySelector('#all-burnt').addEventListener('click', () => {
  requestedState = 'burnt';
  for (const view of views) setRoomState(view, requestedState);
});
document.querySelector('#anchors').addEventListener('change', event => {
  anchorsVisible = event.target.checked;
  for (const view of views) { view.markers.visible = anchorsVisible; render(view); }
});
document.querySelector('#wireframe').addEventListener('change', event => {
  wireframe = event.target.checked;
  for (const view of views) {
    view.model?.traverse(node => { if (node.isMesh) node.material.wireframe = wireframe; });
    render(view);
  }
});
try {
  const response = await fetch('./manifest.json');
  if (!response.ok) throw new Error(`Manifest: HTTP ${response.status}`);
  const manifest = await response.json();
  const results = await Promise.allSettled(manifest.rooms.map((entry, index) => roomView(entry, index)));
  const failed = results.filter(result => result.status === 'rejected');
  if (failed.length) throw new AggregateError(failed.map(result => result.reason), 'Room loading failed');
  status.textContent = 'שלושת החדרים נטענו · מצלמת המשחק קבועה · כל המצבים זמינים';
  document.body.dataset.ready = 'true';
} catch (error) {
  status.textContent = 'התצוגה לא נטענה במלואה. פרטי השגיאה מופיעים במסוף הדפדפן.';
  status.classList.add('error');
  console.error(error);
}

// Rendering is demand-driven: no animation loop, orbit controls or background simulation.
window.addEventListener('pagehide', () => {
  const geometries = new Set(), materials = new Set();
  for (const view of views) {
    view.resize.disconnect();
    view.scene.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) materials.add(node.material);
    });
    view.renderer.dispose();
  }
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  sharedTexture.dispose();
}, { once: true });
