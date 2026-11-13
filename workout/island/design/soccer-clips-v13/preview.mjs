/** Original soccer-clips-v13 preview. SPDX-License-Identifier: CC0-1.0.
 * Uses the existing local MIT Three.js runtime; native GLB animation only.
 */
import * as THREE from '../soccer-motion-v8/runtime/vendor/three.module.js';
import { GLTFLoader } from '../soccer-motion-v8/runtime/vendor/GLTFLoader.js';

const $ = id => document.getElementById(id);
const descriptions = {
  keeper_celebrate:['חגיגת שוער','אחרי עצירה · 1.8 שנ׳','שתי הנפות אגרופים, פתיחת החזה וחזרה לעמדת המתנה.'],
  goal_kick:['בעיטת שוער','מהקרקע · 1.6 שנ׳','הנחת הכדור, התקרבות קצרה, נטיעת הרגל התומכת ובעיטה ארוכה.'],
  keeper_throw:['זריקת שוער','ביד אחת · 1.2 שנ׳','משיכת היד לאחור מעל הכתף, זריקה קדימה והמשך התנועה.'],
  slide_tackle:['תיקול בגלישה','מגע וקימה · 1.0 שנ׳','הורדת האגן, שליחת הרגל קדימה, חלון מגע וקימה לעמידה.'],
  lob_pass:['מסירה גבוהה','כניסה מתחת לכדור','הרגל התומכת נטועה, והבועטת מרימה את הכדור בקשת.'],
  chest_control:['שליטה בחזה','קבלה וספיגה','פתיחת החזה, ריכוך הברכיים וספיגת מהירות הכדור.'],
  volley:['בעיטת יעף','מגע באוויר','הרגל נעה אל הכדור באוויר, והידיים והגו מאזנים את הבעיטה.'],
  throw_in:['זריקת חוץ','שתי ידיים מעל הראש','שתי הרגליים על הקרקע; שתי הידיים נעות מאחורי הראש ומשחררות יחד.'],
};
const eventNames = { contact:'מגע', release:'שחרור', receive:'קבלה', place:'הנחה', approach:'התקרבות', celebrate:'חגיגה', recover:'קימה', stand:'עמידה' };
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#142925');
scene.fog = new THREE.Fog('#142925', 6, 13);
const camera = new THREE.PerspectiveCamera(34, 1, .01, 35);
const views = { three: [3.5, 1.9, 4.2], front: [0, 1.55, 5], side: [5, 1.7, .2] };
function setView(name) {
  camera.position.fromArray(views[name]);
  camera.lookAt(0, .88, .18);
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === name));
}
setView('three');
scene.add(new THREE.HemisphereLight('#eaf4de', '#425e4d', 2.2));
const key = new THREE.DirectionalLight('#fff2d8', 3);
key.position.set(3, 5, 4); scene.add(key);
const rim = new THREE.DirectionalLight('#a3d4c6', 2);
rim.position.set(-3, 3, -2); scene.add(rim);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: '#1e3830', roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.012; scene.add(ground);
const grid = new THREE.GridHelper(12, 48, '#61735d', '#344d3e');
grid.position.y = -.008; grid.material.transparent = true; grid.material.opacity = .25; scene.add(grid);
const circle = new THREE.Mesh(new THREE.RingGeometry(.72, .725, 96), new THREE.MeshBasicMaterial({ color: '#70856a', transparent: true, opacity: .45, side: THREE.DoubleSide }));
circle.rotation.x = -Math.PI / 2; circle.position.y = -.005; scene.add(circle);
scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, .008, 1.05), .55, '#c2d9ac', .09, .05));
scene.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(.93, .008, 0), .34, '#739d8b', .07, .04));
const ball = new THREE.Mesh(new THREE.SphereGeometry(.11, 24, 16), new THREE.MeshStandardMaterial({ color: '#f4ead2', roughness: .6 }));
scene.add(ball);
const seam = new THREE.Mesh(new THREE.TorusGeometry(.1102, .0015, 4, 48), new THREE.MeshBasicMaterial({ color: '#556951' }));
ball.add(seam);
const seam2 = seam.clone(); seam2.rotation.y = Math.PI / 2; ball.add(seam2);
const soleMarkers = ['LeftFoot', 'RightFoot'].map(name => {
  const marker = new THREE.Mesh(new THREE.SphereGeometry(.018, 12, 8), new THREE.MeshBasicMaterial({ color: '#d8c375', depthTest: false, transparent: true, opacity: .8 }));
  marker.renderOrder = 10; scene.add(marker); return { name, marker };
});
let clips = [], current, model, mixer, action, skeleton, time = 0, playing = true, loadNumber = 0;
const loader = new GLTFLoader();
const position = new THREE.Vector3(), rotation = new THREE.Quaternion();
const durationOf = c => c.duration ?? c.durationSeconds ?? 1;
const eventTime = e => e.atSeconds ?? e.time ?? 0;
const eventType = e => e.type ?? e.name ?? e.event;
function eventsOf(c) { return (c.events || []).filter(e => eventNames[eventType(e)]); }
function rangeOf(c) {
  const r = c.coreRange;
  return Array.isArray(r) ? r : r ? [r.start ?? r.startSeconds ?? 0, r.end ?? r.endSeconds ?? durationOf(c)] : [0, durationOf(c)];
}
function ballKeys(c) { return c.ball?.samples ?? c.ball?.keys ?? c.ballSamples ?? []; }
function keyTime(k) { return k.time ?? k.atSeconds ?? k.t ?? 0; }
function keyPosition(k) { return k.position ?? k.positionMeters ?? k.center ?? k.ballCenterMeters; }
function placeBall() {
  const keys = ballKeys(current);
  ball.visible = $('ball').checked && keys.length > 0;
  if (!ball.visible) return;
  let high = keys.findIndex(k => keyTime(k) >= time);
  if (high < 0) high = keys.length - 1;
  const b = keys[high], a = keys[Math.max(0, high - 1)];
  const p = keyPosition(a), q = keyPosition(b);
  if (!p || !q) { ball.visible = false; return; }
  const dt = keyTime(b) - keyTime(a), u = dt > 0 ? Math.max(0, Math.min(1, (time - keyTime(a)) / dt)) : 0;
  ball.position.fromArray(p).lerp(new THREE.Vector3().fromArray(q), u);
}
function updatePose() {
  if (!current || !action) return;
  // AnimationMixer evaluates the actual GLB tracks and their native interpolation.
  action.time = Math.min(time, Math.max(0, action.getClip().duration - 1e-8));
  action.paused = true;
  mixer.update(0);
  model.updateMatrixWorld(true);
  skeleton.visible = $('skeleton').checked;
  for (const { name, marker } of soleMarkers) {
    const bone = model.getObjectByName(name);
    marker.visible = $('soles').checked && Boolean(bone);
    if (bone) {
      bone.getWorldPosition(position); bone.getWorldQuaternion(rotation);
      marker.position.copy(position).add(new THREE.Vector3(0, -.08, 0).applyQuaternion(rotation));
    }
  }
  placeBall();
  const d = durationOf(current), frame = Math.round(time * 30);
  $('scrub').value = String(frame);
  $('time').textContent = `${time.toFixed(2)} / ${d.toFixed(2)}`;
  $('frame').textContent = `פריים ${frame} / ${Math.round(d * 30)}`;
  const event = eventsOf(current).find(e => Math.abs(eventTime(e) - time) < .055);
  const [a, b] = rangeOf(current);
  $('phase').textContent = event ? eventNames[eventType(event)] : time < a ? 'הכנה' : time > b ? 'התאוששות' : 'טווח הליבה';
}
function setPlaying(value) {
  playing = value;
  $('play').innerHTML = playing ? 'השהיה <span aria-hidden="true">Ⅱ</span>' : 'ניגון <span aria-hidden="true">▶</span>';
  $('play').setAttribute('aria-label', playing ? 'השהיה' : 'ניגון');
}
function jumpTo(t) { time = Math.max(0, Math.min(durationOf(current), t)); setPlaying(false); updatePose(); }
function disposeModel() {
  if (!model) return;
  mixer.stopAllAction(); mixer.uncacheRoot(model);
  scene.remove(model); scene.remove(skeleton);
  model.traverse(o => {
    if (o.isMesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); }
  });
  skeleton.dispose(); model = undefined;
}
async function selectClip(c) {
  const sequence = ++loadNumber;
  current = c; time = 0; $('error').hidden = true; $('phase').textContent = 'טוען…';
  const detail = descriptions[c.id] || [c.label || c.id, '', c.notes || ''];
  $('title').textContent = detail[0]; $('description').textContent = detail[2];
  for (const b of document.querySelectorAll('.clip-button')) b.setAttribute('aria-pressed', String(b.dataset.clip === c.id));
  const d = durationOf(c); $('scrub').max = String(Math.round(d * 30));
  const [start, end] = rangeOf(c);
  $('core').style.left = `${100 * start / d}%`; $('core').style.width = `${100 * (end - start) / d}%`;
  $('markers').replaceChildren(); $('events').replaceChildren();
  for (const e of eventsOf(c)) {
    const label = eventNames[eventType(e)], at = eventTime(e);
    const marker = document.createElement('button');
    marker.type = 'button'; marker.className = 'marker'; marker.textContent = label;
    marker.style.left = `${100 * at / d}%`; marker.title = `${label} · ${at.toFixed(3)} שנ׳`;
    marker.addEventListener('click', () => jumpTo(at)); $('markers').append(marker);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'event-button';
    const name = document.createElement('span'); name.textContent = label;
    const timestamp = document.createElement('small'); timestamp.textContent = `${at.toFixed(3)} s`;
    button.append(name, timestamp); button.addEventListener('click', () => jumpTo(at)); $('events').append(button);
  }
  try {
    const path = c.file ?? c.path ?? c.url ?? `runtime/clips/${c.id}.glb`;
    const asset = await loader.loadAsync(new URL(path, import.meta.url).href);
    if (sequence !== loadNumber) return;
    if (!asset.animations.length) throw new Error('לקובץ אין ערוץ תנועה.');
    disposeModel(); model = asset.scene; scene.add(model);
    mixer = new THREE.AnimationMixer(model);
    action = mixer.clipAction(asset.animations.find(a => a.name === c.id) || asset.animations[0]);
    action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    skeleton = new THREE.SkeletonHelper(model); skeleton.material.depthTest = false; skeleton.material.transparent = true; skeleton.material.opacity = .65; skeleton.renderOrder = 5; scene.add(skeleton);
    updatePose();
  } catch (error) {
    if (sequence !== loadNumber) return;
    setPlaying(false); $('phase').textContent = 'הטעינה נכשלה'; $('error').hidden = false;
    $('error').textContent = `לא ניתן לטעון את הקליפ. ${error.message}`;
    console.error(error);
  }
}
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
$('play').addEventListener('click', () => setPlaying(!playing));
$('restart').addEventListener('click', () => { time = 0; updatePose(); });
$('scrub').addEventListener('input', () => jumpTo(Number($('scrub').value) / 30));
for (const id of ['ball', 'soles', 'skeleton']) $(id).addEventListener('change', updatePose);
function resize() {
  const { width, height } = canvas.getBoundingClientRect();
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas); resize();
let previous = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now;
  if (playing && current && action) {
    time += dt * Number($('speed').value);
    // Keep a short still pause after the completed recovery before replaying.
    if (time > durationOf(current) + .4) time = 0;
    const displayTime = time; time = Math.min(time, durationOf(current)); updatePose(); time = displayTime;
  }
  renderer.render(scene, camera);
});
try {
  const response = await fetch(new URL('./runtime/catalog.json', import.meta.url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const catalog = await response.json(); clips = Array.isArray(catalog) ? catalog : catalog.clips;
  if (!Array.isArray(clips) || !clips.length) throw new Error('ספריית התנועות ריקה.');
  clips.forEach((c, i) => {
    const detail = descriptions[c.id] || [c.label || c.id, '', ''];
    const button = document.createElement('button'); button.type = 'button'; button.className = 'clip-button'; button.dataset.clip = c.id; button.setAttribute('aria-pressed', 'false');
    const number = document.createElement('span'); number.className = 'clip-number'; number.textContent = String(i + 1).padStart(2, '0');
    const text = document.createElement('span'); const title = document.createElement('strong'); title.textContent = detail[0]; const sub = document.createElement('small'); sub.textContent = detail[1]; text.append(title, sub);
    const arrow = document.createElement('span'); arrow.className = 'clip-arrow'; arrow.textContent = '←'; arrow.setAttribute('aria-hidden', 'true');
    button.append(number, text, arrow); button.addEventListener('click', () => selectClip(c)); $('clips').append(button);
  });
  await selectClip(clips[0]);
} catch (error) {
  $('title').textContent = 'לא ניתן לטעון את הספרייה'; $('error').hidden = false;
  $('error').textContent = `פתחו את התצוגה דרך שרת HTTP מקומי. ${error.message}`; console.error(error);
}

window.soccerClips = {select: async id=>{await selectClip(clips.find(c=>c.id===id));setPlaying(false);},seek:jumpTo,view:setView,render:()=>renderer.render(scene,camera),ready:()=>!!model,pose:()=>({id:current?.id,time})};
