import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';

const items = [
  ['fire-extinguisher', 'מטף כיבוי', 'גוף אדום, צינור קצר ונחיר'],
  ['fire-blanket', 'שמיכת כיבוי', 'בד מקופל באפור כהה, פס אדום'],
  ['foam-hose', 'צינור קצף', 'צינור גמיש ומזנק רחב'],
  ['wall-hose-reel', 'גלגל צינור חירום', 'גלגל, צינור ותושבת על קיר'],
];
const loader = new GLTFLoader();
const gallery = document.querySelector('#gallery');
const views = [];
let rotate = false, showAnchors = false;
window.fireTools = { ready: false, models: [] };

async function createView([id, title, description], index) {
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `<div class="viewport"><span class="number">0${index + 1}</span></div><div class="caption"><h2><img src="icons/${id}.svg" alt="">${title}</h2><p>${description}</p></div>`;
  gallery.append(card);
  const host = card.querySelector('.viewport');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', title);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, .001, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x89978a, 2.2));
  const sun = new THREE.DirectionalLight(0xfff7e7, 3.1);
  sun.position.set(-2, 4, -3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -1.3, right: 1.3, top: 1.6, bottom: -1.3, near: .1, far: 12 });
  sun.shadow.bias = -.0002;
  sun.shadow.normalBias = .003;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xe4f0ff, 1.1);
  fill.position.set(3, 2, 1);
  scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: .16 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.001;
  floor.receiveShadow = true;
  scene.add(floor);
  const { scene: model } = await loader.loadAsync(`${id}.glb`);
  let triangles = 0;
  model.traverse(object => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      triangles += object.geometry.index.count / 3;
    }
  });
  scene.add(model);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const nozzle = model.getObjectByName('nozzle');
  const marker = new THREE.Group();
  marker.add(new THREE.Mesh(new THREE.SphereGeometry(.012, 10, 6), new THREE.MeshBasicMaterial({ color: 0x2499a6 })));
  marker.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), .13, 0x2499a6, .035, .02));
  nozzle.add(marker);
  marker.visible = false;
  window.fireTools.models.push({ id, nozzle: nozzle.position.toArray(), triangles, dimensions: size.toArray() });
  const view = { renderer, scene, camera, model, marker, host, size, center };
  views.push(view);
  const resize = () => {
    const width = host.clientWidth, height = host.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    const radius = Math.max(size.y, size.x, size.z) * .63;
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(16)) / Math.min(camera.aspect, 1);
    camera.position.copy(center).add(new THREE.Vector3(.70, .52, -1).normalize().multiplyScalar(distance));
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  new ResizeObserver(resize).observe(host);
  resize();
}

try {
  await Promise.all(items.map(createView));
  document.querySelector('#status').textContent = 'כל ארבעת הכלים נטענו בהצלחה.';
  window.fireTools.ready = true;
} catch (error) {
  document.querySelector('#status').textContent = 'טעינת התצוגה נכשלה. יש לפתוח דרך שרת מקומי.';
  window.fireTools.error = String(error);
  console.error(error);
}

document.querySelector('#rotate').addEventListener('click', event => {
  rotate = !rotate;
  event.currentTarget.setAttribute('aria-pressed', String(rotate));
  if (!rotate) views.forEach(view => { view.model.rotation.y = 0; });
  previous = performance.now();
  if (rotate) requestAnimationFrame(render);
  else renderAll();
});
document.querySelector('#anchors').addEventListener('click', event => {
  showAnchors = !showAnchors;
  event.currentTarget.setAttribute('aria-pressed', String(showAnchors));
  views.forEach(view => { view.marker.visible = showAnchors; });
  renderAll();
});
let previous = performance.now();
function renderAll() {
  views.forEach(view => view.renderer.render(view.scene, view.camera));
}
function render(now) {
  if (!rotate) return;
  const dt = Math.min((now - previous) / 1000, .1);
  previous = now;
  for (const view of views) {
    if (rotate) view.model.rotation.y += dt * .35;
    view.renderer.render(view.scene, view.camera);
  }
  requestAnimationFrame(render);
}
