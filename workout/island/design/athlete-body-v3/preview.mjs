/** CC0-1.0. Review page of athlete-body-v3: one scene, one player, eight cameras (front, three-quarter, side, back, face, hand, foot, torso).
 * Window API for the measurement scripts: window.v3Preview. */
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {clone} from '../../vendor/SkeletonUtils.js';
import {loadAthleteV3, createAthleteV3Instance, V3_HAIR, V3_BODIES} from '../../minigames/athlete-body-v3.mjs?v=island-v2-20261107-26';
import {loadAthleteV22, createAthleteV22Instance} from '../../minigames/athlete-body-v22.mjs?v=island-v2-20261107-26';
import {loadMotionCatalog} from '../athlete-body-v2/runtime/motion.mjs';

const $ = id => document.getElementById(id);
const VIEWS = [
  {id: 'front', title: 'מלפנים', dir: [0.05, 0.06, 1], span: 1.0, at: 'body'},
  {id: 'three', title: 'שלושה רבעים', dir: [0.7, 0.1, 1], span: 1.0, at: 'body'},
  {id: 'side', title: 'מהצד', dir: [1, 0.05, 0.02], span: 1.0, at: 'body'},
  {id: 'back', title: 'מאחור', dir: [-0.08, 0.06, -1], span: 1.0, at: 'body'},
  {id: 'face', title: 'פנים', dir: [0.3, 0.04, 1], span: 0.36, at: 'head', tall: true},
  {id: 'hands', title: 'יד', dir: [0.9, 0.2, 0.7], span: 0.36, at: 'hand', tall: true},
  {id: 'feet', title: 'רגל ונעל', dir: [0.7, 0.25, 1], span: 0.52, at: 'foot', tall: true},
  {id: 'torso', title: 'גו ומספר', dir: [0.25, 0.05, 1], span: 0.78, at: 'chest', tall: true},
];
const grid = $('grid'), panels = VIEWS.map(v => {
  const el = document.createElement('div'); el.className = 'view' + (v.tall ? ' tall' : ''); el.dataset.view = v.id;
  const tag = document.createElement('span'); tag.textContent = v.title; el.append(tag); grid.append(el); return {...v, el};
});
for (const id of V3_HAIR) { const o = document.createElement('option'); o.value = id; o.textContent = id; $('hair').append(o); }

const canvas = $('stage'), renderer = new T.WebGLRenderer({canvas, antialias: true, alpha: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = T.SRGBColorSpace;
const scene = new T.Scene(); scene.background = null;
scene.add(new T.HemisphereLight(0xffffff, 0x5b6c66, 1.7));
const sun = new T.DirectionalLight(0xfff1d7, 2.3); sun.position.set(3, 5, 4); scene.add(sun);
const fill = new T.DirectionalLight(0xc8e3ff, 1.1); fill.position.set(-3, 2, -4); scene.add(fill);
const floor = new T.Mesh(new T.CircleGeometry(1.4, 48).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({color: 0x3c4d46, roughness: 1})); scene.add(floor);

const loader = new GLTFLoader();
let clips, clip, playing = true, time = 0, last = performance.now(), player = null, source = null, current = 'soccer', mixer = null, action = null, dirty = true;
const load = url => loader.loadAsync(url);
const kitOf = () => ({primary: $('primary').value, secondary: $('trim').value, shorts: $('shorts').value, shortsTrim: $('trim').value, socks: $('primary').value, socksTrim: $('trim').value,
  boots: current === 'soccer' ? '#1b1d22' : $('primary').value, bootAccent: $('trim').value});
const old = new URLSearchParams(location.search).get('v22') === '1';   // ?v22=1 shows the previous body in the same panels (comparison)
const SKIN = ['#f2c6a0', '#d9a17b', '#bd8058', '#9a6041', '#70422d', '#44291f'];

async function build(body) {
  current = body;
  if (!source) source = old ? await loadAthleteV22(load, {T, bodies: Object.keys(V3_BODIES)}) : await loadAthleteV3(load, {T, bodies: Object.keys(V3_BODIES)});
  if (player) { mixer?.stopAllAction(); player.dispose(); }
  const style = body === 'soccer' ? 'soccer' : 'basketball';
  player = (old ? createAthleteV22Instance : createAthleteV3Instance)(T, source, {bodyId: body, height: V3_BODIES[body].height, cloneRig: clone, appearance: {skin: SKIN[+$('skin').value], hair: $('hairColor').value, hairStyle: $('hair').value}, kit: kitOf(), style,
    number: Number($('number').value), gloves: $('keeper').checked});
  scene.add(player.root);
  mixer = new T.AnimationMixer(player.root);
  setClip(clip?.name || (body === 'soccer' ? 'soccer-v9/run' : 'hoops-tall-v12/' + body + '/idle'));
  $('status').textContent = 'מוכן · ' + clips.size + ' קליפים'; dirty = true;
}
function look() {
  if (!player) return;
  const style = current === 'soccer' ? 'soccer' : 'basketball';
  player.paint({skin: SKIN[+$('skin').value], hair: $('hairColor').value, kit: kitOf(), style});
  player.v3?.setNumber(Number($('number').value)); player.v3?.setGloves($('keeper').checked); dirty = true;
}
let building = Promise.resolve();
function setClip(id) {
  clip = clips.get(id) || [...clips.values()].find(c => c.name.includes('idle')) || clips.values().next().value; $('clip').value = clip.name;
  mixer.stopAllAction(); action = mixer.clipAction(clip); action.setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; action.play(); time = 0; dirty = true;
}
const tmp = new T.Vector3();
function target(kind) {
  const b = player.bones, s = player.scale;
  if (kind === 'head') { b.Head.getWorldPosition(tmp); tmp.y += 0.13 * s; }
  else if (kind === 'hand') { b.LeftHand.getWorldPosition(tmp); tmp.y -= 0.05 * s; }
  else if (kind === 'foot') { b.LeftFoot.getWorldPosition(tmp); tmp.y -= 0.02; }
  else if (kind === 'chest') { b.Chest.getWorldPosition(tmp); tmp.y -= 0.02; }
  else { b.Hips.getWorldPosition(tmp); tmp.y += 0.02 * s + player.height * 0.06; }
  return tmp.clone();
}
const cams = new Map();
function frame(v, w, h) {
  let cam = cams.get(v.id); if (!cam) { cam = new T.PerspectiveCamera(26, 1, 0.02, 40); cams.set(v.id, cam); }
  const t = target(v.at), span = v.at === 'body' ? player.height * 1.3 * v.span : v.span * player.height / 1.8;
  const dir = new T.Vector3(...v.dir).normalize();
  cam.aspect = w / h; const d = span / (2 * Math.tan(T.MathUtils.degToRad(cam.fov / 2))) * Math.max(1, 1 / cam.aspect);
  cam.position.copy(t).addScaledVector(dir, d); cam.lookAt(t); cam.updateProjectionMatrix(); return cam;
}
function render(at = time) {
  if (!player) return;
  action.time = Math.min(at, clip.duration); mixer.update(0); player.root.updateMatrixWorld(true);
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false);
  renderer.setScissorTest(false); renderer.setClearColor(0x16211f, 1); renderer.clear(); renderer.setScissorTest(true);
  for (const p of panels) {
    const r = p.el.getBoundingClientRect(); if (r.bottom < 0 || r.top > h) continue;
    renderer.setViewport(r.left, h - r.bottom, r.width, r.height); renderer.setScissor(r.left, h - r.bottom, r.width, r.height);
    renderer.setClearColor(0x2a3a37, 1); renderer.clear(true, true, false);
    renderer.render(scene, frame(p, r.width, r.height));
  }
  $('time').value = clip ? at / clip.duration : 0; dirty = false;
}
try {
  clips = await loadMotionCatalog(T);
  const groups = new Map(); $('clip').replaceChildren();
  for (const id of clips.keys()) {
    const g = id.split('/')[0]; let grp = groups.get(g); if (!grp) { grp = document.createElement('optgroup'); grp.label = g; $('clip').append(grp); groups.set(g, grp); }
    const o = document.createElement('option'); o.value = id; o.textContent = id.slice(g.length + 1); grp.append(o);
  }
  const q = new URLSearchParams(location.search);
  for (const k of ['number', 'primary', 'trim', 'shorts', 'skin', 'hair', 'hairColor']) if (q.get(k)) $(k).value = q.get(k);
  if (q.get('keeper')) $('keeper').checked = q.get('keeper') === '1';
  $('body').value = q.get('body') || 'soccer';
  await build($('body').value);
  if (q.get('clip')) setClip(q.get('clip'));
  window.v3Preview = {get player() { return player; }, get source() { return source; }, clips, renderer, render, build: b => (building = building.then(() => { $('body').value = b; return build(b); })), setClip, look,
    setTime(t) { playing = false; time = t; render(t); }, THREE: T, get clip() { return clip; }, panels, scene};
  window.previewReady = true;
} catch (error) { $('status').textContent = 'התצוגה לא נטענה: ' + error.message; console.error(error); }
$('body').addEventListener('change', () => { building = building.then(() => build($('body').value)); });
$('clip').addEventListener('change', () => setClip($('clip').value));
for (const id of ['primary', 'trim', 'shorts', 'skin', 'hairColor', 'keeper', 'number']) $(id).addEventListener('input', look);
$('hair').addEventListener('change', () => { building = building.then(() => build(current)); });
$('play').addEventListener('click', () => { playing = !playing; $('play').textContent = playing ? 'עצירה' : 'ניגון'; });
$('time').addEventListener('input', () => { playing = false; $('play').textContent = 'ניגון'; time = Number($('time').value) * clip.duration; dirty = true; });
addEventListener('scroll', () => { dirty = true; }, {passive: true}); addEventListener('resize', () => { dirty = true; });
function tick(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (clip && player) { if (playing) time = (time + dt) % clip.duration; if (playing || dirty) render(); } requestAnimationFrame(tick); }
requestAnimationFrame(tick);
