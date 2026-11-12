import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const labels = { rest: 'מנוחה', fly: 'טיסה קלה', bank: 'הטיה', down: 'ירידה · 1.6 שניות' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { clip: 'rest', view: 'three-quarter', paused: reducedMotion, spin: !reducedMotion, spinTime: 0, models: [], errors: [], ready: false };
const status = document.querySelector('#animation-status');
const spinInput = document.querySelector('#spin');
spinInput.checked = state.spin;

function updateButtons(selector, attribute, selected) {
  document.querySelectorAll(selector).forEach(button => button.setAttribute('aria-pressed', String(button.getAttribute(attribute) === selected)));
}
function restoreBindPose(viewer) {
  viewer.bindPose.forEach(({ object, position, quaternion, scale }) => {
    object.position.copy(position); object.quaternion.copy(quaternion); object.scale.copy(scale);
  });
  viewer.model.updateMatrixWorld(true);
}
function startClip(viewer, name) {
  viewer.mixer.stopAllAction();
  restoreBindPose(viewer);
  viewer.mixer.time = 0;
  viewer.action = null;
  if (name === 'rest') return;
  const clip = THREE.AnimationClip.findByName(viewer.gltf.animations, name);
  if (!clip) throw new Error(`Missing animation: ${name}`);
  const action = viewer.mixer.clipAction(clip);
  action.reset().setLoop(name === 'down' ? THREE.LoopOnce : THREE.LoopRepeat, name === 'down' ? 1 : Infinity);
  action.clampWhenFinished = name === 'down';
  action.play();
  viewer.action = action;
  viewer.mixer.update(0);
}
function setClip(name) {
  if (!Object.hasOwn(labels, name)) throw new Error(`Unknown clip: ${name}`);
  state.clip = name;
  state.spinTime = 0;
  state.models.forEach(viewer => {
    viewer.ground.position.y = name === 'down' ? -5.2 : -2.6;
    startClip(viewer, name);
  });
  updateButtons('[data-clip]', 'data-clip', name);
  document.querySelectorAll('.clip-badge').forEach(el => { el.textContent = labels[name]; });
  status.textContent = name === 'rest' ? 'תנוחת מנוחה. אפשר לבחור תנועה בשורת הבקרים.' : name === 'down' ? 'נטייה על האף וסיבוב. הקליפ נעצר בסיום; לחצו שוב להפעלה חוזרת.' : `${labels[name]} בלולאה.`;
  render();
}
function setPaused(value) {
  state.paused = Boolean(value);
  const button = document.querySelector('#pause');
  button.textContent = state.paused ? 'הפעל' : 'השהה';
  button.setAttribute('aria-pressed', String(state.paused));
  return state.paused;
}
function setSpin(value) {
  state.spin = Boolean(value); spinInput.checked = state.spin;
  if (!state.spin) state.models.forEach(viewer => viewer.spinners.forEach(({ node, bind }) => node.quaternion.copy(bind)));
  render();
}
function applyCamera(viewer) {
  const { yaw, pitch, radius } = viewer.orbit;
  viewer.camera.position.set(Math.sin(yaw) * Math.cos(pitch) * radius, Math.sin(pitch) * radius, Math.cos(yaw) * Math.cos(pitch) * radius);
  viewer.camera.lookAt(0, 0, 0);
  viewer.camera.updateMatrixWorld();
}
function setView(name) {
  const views = { 'three-quarter': [0.72, 0.5], top: [0, Math.PI / 2 - 0.001], side: [Math.PI / 2, 0.06], front: [0, 0.1] };
  if (!views[name]) throw new Error(`Unknown view: ${name}`);
  state.view = name;
  state.models.forEach(viewer => {
    [viewer.orbit.yaw, viewer.orbit.pitch] = views[name];
    viewer.orbit.radius = viewer.defaultRadius;
    applyCamera(viewer);
  });
  updateButtons('[data-view]', 'data-view', name); render();
}
function spin(viewer, time) {
  viewer.spinners.forEach(({ node, axis, speed, bind }) => {
    node.quaternion.copy(bind);
    if (state.spin) node.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis, speed * time));
  });
}
function render() {
  state.models.forEach(viewer => {
    spin(viewer, state.spinTime);
    viewer.renderer.render(viewer.scene, viewer.camera);
  });
}
// Deterministic screenshot API. This freezes playback, resets the bind pose,
// evaluates the embedded clip, and samples blade rotation at the supplied time.
function renderAt(clip, time = 0) {
  setPaused(true); setClip(clip);
  const sample = Math.max(0, Number(time) || 0);
  state.spinTime = sample;
  state.models.forEach(viewer => {
    if (viewer.action) viewer.mixer.setTime(clip === 'down' ? Math.min(sample, viewer.action.getClip().duration) : sample);
  });
  render();
  return state.models.map(viewer => ({ id: viewer.id, clip: state.clip, time: viewer.action?.time ?? 0 }));
}
function bindCamera(viewer) {
  const canvas = viewer.renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-description', 'גררו לסיבוב, השתמשו בגלגלת לקירוב, או בחרו מבט בכפתורים שמעל הדגמים.');
  let drag = null;
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    viewer.orbit.yaw -= (event.clientX - drag.x) * 0.007;
    viewer.orbit.pitch = THREE.MathUtils.clamp(viewer.orbit.pitch + (event.clientY - drag.y) * 0.006, -1.35, 1.56);
    drag.x = event.clientX; drag.y = event.clientY;
    applyCamera(viewer); render();
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag); canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    viewer.orbit.radius = THREE.MathUtils.clamp(viewer.orbit.radius * Math.exp(event.deltaY * 0.001), 7, 32);
    applyCamera(viewer); render();
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') viewer.orbit.yaw -= 0.12;
    if (event.key === 'ArrowRight') viewer.orbit.yaw += 0.12;
    if (event.key === 'ArrowUp') viewer.orbit.pitch = Math.min(1.56, viewer.orbit.pitch + 0.12);
    if (event.key === 'ArrowDown') viewer.orbit.pitch = Math.max(-1.35, viewer.orbit.pitch - 0.12);
    if (event.key === '+' || event.key === '=') viewer.orbit.radius = Math.max(7, viewer.orbit.radius - 0.8);
    if (event.key === '-') viewer.orbit.radius = Math.min(32, viewer.orbit.radius + 0.8);
    if (event.key === 'Home') { viewer.orbit = { yaw: 0.72, pitch: 0.5, radius: viewer.defaultRadius }; }
    applyCamera(viewer); render();
  });
}
async function loadModel(id, index) {
  const viewport = document.querySelector(`#${id}-viewport`);
  const loading = viewport.querySelector('.loading');
  const canvas = viewport.querySelector('canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#dceaf0');
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const ambient = new THREE.HemisphereLight('#eefaff', '#97b0b5', 2.1); scene.add(ambient);
    const key = new THREE.DirectionalLight('#fff5de', 3.5); key.position.set(-5, 9, 8); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 35; key.shadow.normalBias = 0.025; key.shadow.bias = -0.0002; scene.add(key);
    const fill = new THREE.DirectionalLight('#c5e6ff', 1.5); fill.position.set(5, 3, -5); scene.add(fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#dceaf0', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -2.6; ground.receiveShadow = true; scene.add(ground);
    const axes = new THREE.AxesHelper(2.5); axes.visible = false; scene.add(axes);
    const gltf = await new GLTFLoader().loadAsync(`./${id}.glb`);
    const model = gltf.scene;
    let triangles = 0; const materials = new Set(); const materialObjects = new Set();
    model.traverse(object => {
      if (!object.isMesh) return;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => { materials.add(material.uuid); materialObjects.add(material); });
      object.castShadow = true; object.receiveShadow = false;
    });
    const box = new THREE.Box3().setFromObject(model); const size = box.getSize(new THREE.Vector3());
    const bindPose = [];
    model.traverse(object => bindPose.push({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() }));
    const spinners = [ ['rotor', new THREE.Vector3(0, 1, 0), 12], ['tailRotor', new THREE.Vector3(1, 0, 0), 18], ['propeller', new THREE.Vector3(0, 0, 1), 16] ]
      .map(([name, axis, speed]) => { const node = model.getObjectByName(name); return node ? { node, axis, speed, bind: node.quaternion.clone() } : null; }).filter(Boolean);
    const viewer = { id, gltf, scene, model, mixer: new THREE.AnimationMixer(model), renderer, camera, axes, ground, bindPose, spinners, materialObjects, triangles, materialCount: materials.size, bounds: { min: box.min.toArray(), max: box.max.toArray(), size: size.toArray() }, defaultRadius: id === 'plane' ? 17.5 : 15.5, orbit: { yaw: 0.72, pitch: 0.5, radius: id === 'plane' ? 17.5 : 15.5 }, action: null };
    scene.add(model);
    state.models[index] = viewer;
    const format = value => Number(value.toFixed(2));
    const values = [ ['משולשים', triangles.toLocaleString('en-US')], ['חומרים', String(materials.size)], ['מעטפת במנוחה (X / Y / Z)', size.toArray().map(format).join(' / ')], ['צמתים מסתובבים', spinners.map(item => item.node.name).join(', ')], ['קליפים', gltf.animations.map(clip => `${clip.name} (${format(clip.duration)}s)`).join(' · ')], ['three.js מקומי', `r${THREE.REVISION}`] ];
    const stats = document.querySelector(`#${id}-stats`); stats.replaceChildren();
    values.forEach(([term, value]) => { const dt = document.createElement('dt'); dt.textContent = term; const dd = document.createElement('dd'); dd.dir = 'ltr'; dd.textContent = value; stats.append(dt, dd); });
    const resize = () => {
      const { width, height } = viewport.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); applyCamera(viewer); renderer.render(scene, camera);
    };
    viewer.resizeObserver = new ResizeObserver(resize); viewer.resizeObserver.observe(viewport);
    bindCamera(viewer); resize(); loading.hidden = true;
    if (state.clip !== 'rest') startClip(viewer, state.clip);
    return viewer;
  } catch (error) {
    renderer?.dispose(); state.errors.push(`${id}: ${error.message}`);
    loading.classList.add('error'); loading.textContent = 'לא ניתן להציג את הדגם. הפעילו שרת HTTP מקומי, ובדקו ש־WebGL זמין ושהקבצים נמצאים באותה תיקייה.';
    console.error(`Could not load ${id}`, error); throw error;
  }
}

const api = { get ready() { return state.ready; }, get models() { return state.models; }, get errors() { return state.errors; }, get state() { return { clip: state.clip, paused: state.paused, spin: state.spin, view: state.view, spinTime: state.spinTime }; }, setClip, setView, setPaused, setSpin, renderAt, render };
window.navalPreview = api;
document.querySelectorAll('[data-clip]').forEach(button => button.addEventListener('click', () => { setClip(button.dataset.clip); if (button.dataset.clip !== 'rest') setPaused(false); }));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelector('#pause').addEventListener('click', () => setPaused(!state.paused));
spinInput.addEventListener('change', () => setSpin(spinInput.checked));
document.querySelector('#wireframe').addEventListener('change', event => { state.models.forEach(viewer => viewer.materialObjects.forEach(material => { material.wireframe = event.target.checked; })); render(); });
document.querySelector('#axes').addEventListener('change', event => { state.models.forEach(viewer => { viewer.axes.visible = event.target.checked; }); render(); });
setPaused(state.paused);
Promise.allSettled([loadModel('plane', 0), loadModel('helicopter', 1)]).then(results => {
  state.ready = results.every(result => result.status === 'fulfilled');
  if (state.ready) { document.body.dataset.ready = 'true'; render(); }
});
let last = performance.now();
function frame(now) {
  const delta = Math.min((now - last) / 1000, 0.05); last = now;
  if (!document.hidden && !state.paused) {
    state.spinTime += delta;
    state.models.forEach(viewer => viewer.mixer.update(delta));
  }
  if (!document.hidden) render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
