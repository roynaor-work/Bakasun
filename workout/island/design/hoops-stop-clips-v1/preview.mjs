/** hoops-stop-clips-v1 preview. SPDX-License-Identifier: CC0-1.0. Adapted from soccer-clips-v13/preview.mjs.
 * Plays the native GLB animation and moves the actor along the clip's declared root path; grey discs are the planted-foot anchors.
 */
import * as THREE from '../soccer-motion-v8/runtime/vendor/three.module.js';
import { GLTFLoader } from '../soccer-motion-v8/runtime/vendor/GLTFLoader.js';

const $ = id => document.getElementById(id);
const eventNames = { brake: 'בלימה', land: 'נחיתה', stop: 'עצירה', stand: 'עמידה', plant: 'נעיצה', push: 'דחיפה', start: 'יציאה', turn: 'סיבוב', pivot: 'פיבוט', recover: 'התאוששות', step: 'צעד' };
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b2b3a');
scene.fog = new THREE.Fog('#1b2b3a', 8, 20);
const camera = new THREE.PerspectiveCamera(34, 1, .01, 60);
const views = { three: [3.2, 1.8, 4.0], front: [0, 1.5, 5], side: [5, 1.5, 0], back: [-3.2, 1.8, -4.0] };
let viewName = 'three', zoom = 1;
const target = new THREE.Vector3(0, .88, 0);
function setView(name) {
  viewName = name;
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === name));
  updateCamera();
}
function updateCamera() { camera.position.set(target.x + views[viewName][0] * zoom, .3 + (views[viewName][1] - .3) * zoom, target.z + views[viewName][2] * zoom); camera.lookAt(target); }
scene.add(new THREE.HemisphereLight('#eaf0ff', '#3a4a5e', 2.2));
const key = new THREE.DirectionalLight('#fff2d8', 3); key.position.set(3, 5, 4); scene.add(key);
const rim = new THREE.DirectionalLight('#9fc3e6', 2); rim.position.set(-3, 3, -2); scene.add(rim);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#2a3a4c', roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.012; scene.add(ground);
const grid = new THREE.GridHelper(40, 80, '#8aa0b8', '#4a6078'); grid.position.y = -.008; grid.material.transparent = true; grid.material.opacity = .4; scene.add(grid);
const anchorGroup = new THREE.Group(); scene.add(anchorGroup);
const soleMarkers = ['LeftFoot', 'RightFoot'].map(name => {
  const marker = new THREE.Mesh(new THREE.SphereGeometry(.02, 12, 8), new THREE.MeshBasicMaterial({ color: name === 'LeftFoot' ? '#ffd35c' : '#7fe0ff', depthTest: false, transparent: true, opacity: .9 }));
  marker.renderOrder = 10; scene.add(marker); return { name, marker };
});
let clips = [], current, model, mixer, action, skeleton, time = 0, playing = true, loadNumber = 0;
const loader = new GLTFLoader();
const position = new THREE.Vector3(), rotation = new THREE.Quaternion();
const durationOf = c => c.duration ?? 1;
function rootAt(c, t) {
  const s = c.path.samples, f = Math.max(0, Math.min(s.length - 1, t * 30)), i = Math.min(s.length - 2, Math.floor(f)), u = f - i;
  return [s[i][0] + (s[i + 1][0] - s[i][0]) * u, s[i][1] + (s[i + 1][1] - s[i][1]) * u];
}
function updatePose() {
  if (!current || !action) return;
  action.time = Math.min(time, Math.max(0, action.getClip().duration - 1e-8));
  action.paused = true;
  const r = rootAt(current, Math.min(time, durationOf(current)));
  model.position.set(r[0], 0, r[1]);
  mixer.update(0);
  model.updateMatrixWorld(true);
  target.set(r[0], .88, r[1]);
  updateCamera();
  skeleton.visible = $('skeleton').checked;
  anchorGroup.visible = $('ball').checked;
  for (const { name, marker } of soleMarkers) {
    const bone = model.getObjectByName(name);
    marker.visible = $('soles').checked && Boolean(bone);
    if (bone) { bone.getWorldPosition(position); bone.getWorldQuaternion(rotation); marker.position.copy(position).add(new THREE.Vector3(0, -.08, 0).applyQuaternion(rotation)); }
  }
  const d = durationOf(current), frame = Math.round(time * 30);
  $('scrub').value = String(frame);
  $('time').textContent = `${time.toFixed(2)} / ${d.toFixed(2)}`;
  $('frame').textContent = `פריים ${frame} / ${Math.round(d * 30)}`;
  const speed = current.path.speeds[Math.min(current.path.speeds.length - 1, frame)];
  const event = (current.events || []).filter(e => eventNames[e.type]).find(e => Math.abs(e.time - time) < .055);
  $('phase').textContent = `${speed.toFixed(1)} מ׳/שנ׳${event ? ' · ' + eventNames[event.type] : ''}`;
}
function setPlaying(value) {
  playing = value;
  $('play').innerHTML = playing ? 'השהיה <span aria-hidden="true">Ⅱ</span>' : 'ניגון <span aria-hidden="true">▶</span>';
  $('play').setAttribute('aria-label', playing ? 'השהיה' : 'ניגון');
}
function jumpTo(t) { time = Math.max(0, Math.min(durationOf(current), t)); setPlaying(false); updatePose(); }
function disposeModel() {
  if (!model) return;
  mixer.stopAllAction(); mixer.uncacheRoot(model); scene.remove(model); scene.remove(skeleton);
  model.traverse(o => { if (o.isMesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } });
  skeleton.dispose(); model = undefined;
}
function buildAnchors(c) {
  anchorGroup.clear();
  for (const s of c.supports) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(.07, 20), new THREE.MeshBasicMaterial({ color: s.bone === 'LeftFoot' ? '#c9a23f' : '#4aa3c4', transparent: true, opacity: .55, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(s.anchor[0], .004, s.anchor[2]); anchorGroup.add(disc);
  }
}
async function selectClip(c) {
  const sequence = ++loadNumber;
  current = c; time = 0; $('error').hidden = true; $('phase').textContent = 'טוען…';
  $('title').textContent = c.label; $('description').textContent = c.notes || '';
  for (const b of document.querySelectorAll('.clip-button')) b.setAttribute('aria-pressed', String(b.dataset.clip === c.id));
  const d = durationOf(c); $('scrub').max = String(Math.round(d * 30));
  const cr = c.coreRange || { start: 0, end: d };
  $('core').style.left = `${100 * cr.start / d}%`; $('core').style.width = `${100 * (cr.end - cr.start) / d}%`;
  $('markers').replaceChildren(); $('events').replaceChildren();
  for (const e of (c.events || []).filter(e => eventNames[e.type])) {
    const label = eventNames[e.type], at = e.time;
    const marker = document.createElement('button'); marker.type = 'button'; marker.className = 'marker'; marker.textContent = label; marker.style.left = `${100 * at / d}%`; marker.title = `${label} · ${at.toFixed(3)} שנ׳`;
    marker.addEventListener('click', () => jumpTo(at)); $('markers').append(marker);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'event-button';
    const name = document.createElement('span'); name.textContent = label; const ts = document.createElement('small'); ts.textContent = `${at.toFixed(3)} s`;
    button.append(name, ts); button.addEventListener('click', () => jumpTo(at)); $('events').append(button);
  }
  buildAnchors(c);
  try {
    const asset = await loader.loadAsync(new URL(c.asset, new URL('./runtime/', import.meta.url)).href);
    if (sequence !== loadNumber) return;
    if (!asset.animations.length) throw new Error('לקובץ אין ערוץ תנועה.');
    disposeModel(); model = asset.scene; scene.add(model);
    mixer = new THREE.AnimationMixer(model);
    action = mixer.clipAction(asset.animations.find(a => a.name === c.id) || asset.animations[0]);
    action.setLoop(c.loop ? THREE.LoopRepeat : THREE.LoopOnce, c.loop ? Infinity : 1); action.clampWhenFinished = true; action.play();
    skeleton = new THREE.SkeletonHelper(model); skeleton.material.depthTest = false; skeleton.material.transparent = true; skeleton.material.opacity = .65; skeleton.renderOrder = 5; scene.add(skeleton);
    updatePose();
  } catch (error) {
    if (sequence !== loadNumber) return;
    setPlaying(false); $('phase').textContent = 'הטעינה נכשלה'; $('error').hidden = false; $('error').textContent = `לא ניתן לטעון את הקליפ. ${error.message}`; console.error(error);
  }
}
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
$('play').addEventListener('click', () => setPlaying(!playing));
$('restart').addEventListener('click', () => { time = 0; updatePose(); });
$('scrub').addEventListener('input', () => jumpTo(Number($('scrub').value) / 30));
for (const id of ['ball', 'soles', 'skeleton']) $(id).addEventListener('change', updatePose);
function resize() { const { width, height } = canvas.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(canvas); resize();
let previous = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now;
  if (playing && current && action) {
    time += dt * Number($('speed').value);
    if (time > durationOf(current) + .4) time = 0;
    const displayTime = time; time = Math.min(time, durationOf(current)); updatePose(); time = displayTime;
  }
  renderer.render(scene, camera);
});
try {
  const response = await fetch(new URL('./runtime/catalog.json', import.meta.url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const catalog = await response.json(); clips = catalog.clips.filter(c => c.asset);
  if (!clips.length) throw new Error('ספריית התנועות ריקה.');
  $('count').textContent = `01 — ${String(clips.length).padStart(2, '0')}`;
  clips.forEach((c, i) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'clip-button'; button.dataset.clip = c.id; button.setAttribute('aria-pressed', 'false');
    const number = document.createElement('span'); number.className = 'clip-number'; number.textContent = String(i + 1).padStart(2, '0');
    const text = document.createElement('span'); const title = document.createElement('strong'); title.textContent = c.label; const sub = document.createElement('small'); sub.textContent = `${c.id} · ${c.duration.toFixed(1)} שנ׳`; text.append(title, sub);
    const arrow = document.createElement('span'); arrow.className = 'clip-arrow'; arrow.textContent = '←'; arrow.setAttribute('aria-hidden', 'true');
    button.append(number, text, arrow); button.addEventListener('click', () => selectClip(c)); $('clips').append(button);
  });
  setView('three');
  await selectClip(clips[0]);
} catch (error) {
  $('title').textContent = 'לא ניתן לטעון את הספרייה'; $('error').hidden = false; $('error').textContent = `פתחו את התצוגה דרך שרת HTTP מקומי. ${error.message}`; console.error(error);
}
window.hoopsClips = { zoom: z => { zoom = z; updateCamera(); }, clips: () => clips, select: async id => { await selectClip(clips.find(c => c.id === id)); setPlaying(false); }, seek: jumpTo, view: setView, render: () => renderer.render(scene, camera), ready: () => !!model, pose: () => ({ id: current?.id, time }) };
