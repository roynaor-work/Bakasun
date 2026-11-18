import * as T from 'three';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { box, firefighterScene, makeProp } from './preview-props.mjs';

const $ = id => document.getElementById(id);
const buttons = new Map();
const shortLabels = {
  'clear-path': 'ניקוי דרך',
  'force-door': 'פתיחת דלת',
  'cut-tool': 'חיתוך בכלי',
  'lift-child': 'הרמת ילד',
  'carry-shoulder': 'על הכתף',
  'carry-arms': 'נשיאה בידיים',
  'set-down': 'הנחה בטוחה',
  'wrap-blanket': 'עטיפה בשמיכה',
  'assist-walk': 'סיוע בהליכה',
  'pull-under-table': 'משיכה',
  'lift-cat': 'הרמת חתול',
  'open-cage': 'פתיחת כלוב',
  'signal-clear': 'סימון פנוי',
  'handoff-medic': 'מסירה לחובש',
};
const cameras = {
  'clear-path': { angle: 1.71, focus: [.16, .88, .25], distance: 3.85 },
  'force-door': { angle: -2.22, focus: [.06, .98, .37], distance: 4.48 },
  'cut-tool': { angle: .98, focus: [.09, .82, .25], distance: 3.82 },
  'lift-child': { angle: 1.17, focus: [0, .85, .20], distance: 3.92 },
  'carry-shoulder': { angle: .79, focus: [.08, .94, .08], distance: 4.15, follow: true },
  'carry-arms': { angle: .77, focus: [.10, .90, .16], distance: 4.15, follow: true },
  'set-down': { angle: 1.14, focus: [.09, .85, .34], distance: 3.96 },
  'wrap-blanket': { angle: -1.64, focus: [.15, .89, .30], distance: 4.15 },
  'assist-walk': { angle: -.68, focus: [.24, .88, .05], distance: 4.21, follow: true },
  'pull-under-table': { angle: 1.30, focus: [0, .79, .39], distance: 4.35 },
  'lift-cat': { angle: .75, focus: [.03, .86, .22], distance: 3.85 },
  'open-cage': { angle: 1.88, focus: [.12, .80, .30], distance: 4.0 },
  'signal-clear': { angle: .41, focus: [0, .94, .12], distance: 3.98 },
  'handoff-medic': { angle: 1.56, focus: [.08, .91, .39], distance: 4.11 },
};
const loader = new GLTFLoader();
const state = { selected: null, time: 0, playing: false, previousTick: null };
const propStage = new T.Group();
const scene = new T.Scene();
scene.background = new T.Color('#2b4045');
scene.fog = new T.Fog('#2b4045', 6.8, 14);
scene.add(propStage);
const camera = new T.PerspectiveCamera(35, 1, .04, 35);
const focus = new T.Vector3();
const followOffset = new T.Vector3();
let renderer;
let mixer;
let rescuerRoot;
let motionClips;
let sources;
let sampleRate;

function prepareScene() {
  renderer = new T.WebGLRenderer({
    canvas: $('viewport'),
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;

  scene.add(new T.HemisphereLight('#e1edf0', '#63564b', 2));
  const key = new T.DirectionalLight('#fff0d9', 2.9);
  key.position.set(-3.8, 5.3, 3.1);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3.8;
  key.shadow.camera.right = 3.8;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.camera.far = 12;
  key.shadow.normalBias = .018;
  key.shadow.bias = -.00015;
  scene.add(key);
  const rim = new T.DirectionalLight('#b7d8ea', 1.55);
  rim.position.set(4.5, 2.55, -4.1);
  scene.add(rim);

  const ground = box(scene, [14, .12, 14], [0, -.066, 0], '#49625f');
  ground.castShadow = false;
  const tileLines = new T.GridHelper(14, 28, '#718782', '#718782');
  tileLines.material.transparent = true;
  tileLines.material.opacity = .22;
  scene.add(tileLines);
  for (const x of [-1.33, 1.33]) {
    for (const z of [-.90, 1.94]) {
      const crossX = x - Math.sign(x) * .12;
      const crossZ = z + (z < 0 ? .12 : -.12);
      const xMarker = box(scene, [.257, .004, .017], [crossX, .002, z], '#c3b57d');
      const zMarker = box(scene, [.017, .004, .257], [x, .002, crossZ], '#c3b57d');
      xMarker.castShadow = false;
      zMarker.castShadow = false;
    }
  }

  const resize = () => {
    const { width, height } = $('scene').getBoundingClientRect();
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };
  new ResizeObserver(resize).observe($('scene'));
  resize();
}

function updateCamera() {
  const { angle, focus: target, distance, follow } = cameras[state.selected.data.id];
  focus.set(...target);
  if (follow) {
    rescuerRoot.getWorldPosition(followOffset);
    focus.x += followOffset.x;
    focus.z += followOffset.z;
  }
  const narrow = camera.aspect < 1.35 ? 1.13 : 1;
  camera.position.set(
    focus.x + Math.sin(angle) * distance * narrow,
    focus.y + 1.24,
    focus.z + Math.cos(angle) * distance * narrow,
  );
  camera.lookAt(focus);
}

function render() {
  if (!state.selected) return;
  updateCamera();
  renderer.render(scene, camera);
}

function sampleTrack(track, time) {
  const index = Math.min(track.length - 1, Math.max(0, time * sampleRate));
  const i = Math.floor(index);
  const start = track[i];
  const end = track[Math.min(i + 1, track.length - 1)];
  const w = index - i;
  return start.map((value, axis) => T.MathUtils.lerp(value, end[axis] ?? value, w));
}

function showProps(time) {
  const sampled = state.selected.props.map(item => ({ item, frame: sampleTrack(item.track, time) }));
  for (const { item, frame } of sampled) {
    item.object.position.set(frame[0], frame[1], frame[2]);
    item.object.rotation.set(
      T.MathUtils.degToRad(frame[3]),
      T.MathUtils.degToRad(frame[4]),
      T.MathUtils.degToRad(frame[5]),
      'XYZ',
    );
    item.object.visible = time >= (item.def.showFrom ?? 0) && time <= (item.def.hideAfter ?? Infinity);
  }
  const handoffChild = state.selected.data.id === 'handoff-medic'
    ? state.selected.props.find(item => item.def.id === 'child').object
    : null;
  for (const { item, frame } of sampled) {
    item.pose?.({ blend: frame[6] ?? 0, time, handoffChild });
  }
}

function updateControls() {
  const { selected, time, playing } = state;
  const { data } = selected;
  const remaining = Math.max(0, data.duration - time);
  $('remaining').textContent = remaining.toFixed(1);
  $('dial').setAttribute('stroke-dasharray', `${remaining / data.duration} 1`);
  $('elapsed').value = `${time.toFixed(2)} / ${data.duration.toFixed(2)}`;
  $('time').value = time;
  $('time').setAttribute('aria-valuetext', `${time.toFixed(2)} שניות`);
  const playName = playing ? 'השהיה' : remaining === 0 ? 'שוב' : 'הפעלה';
  if ($('play').textContent !== playName) $('play').textContent = playName;

  const complete = remaining === 0;
  const event = data.events.findLast(entry => entry.time <= time);
  const phase = complete ? 'הפעולה הושלמה' : event?.label ?? (playing ? 'הפעולה מתבצעת' : 'מוכן להפעלה');
  if ($('stage-status').textContent !== phase) $('stage-status').textContent = phase;
  $('stage-status').dataset.complete = String(complete);
  document.documentElement.dataset.playing = String(playing);
}

function seek(time) {
  const { data, animation } = state.selected;
  state.time = time >= data.duration - 1e-6 ? data.duration : Math.max(0, time);
  animation.paused = false;
  animation.enabled = true;
  mixer.setTime(Math.min(state.time, animation.getClip().duration));
  showProps(state.time);
  updateControls();
  render();
}

function stopPlayback() {
  state.playing = false;
  state.previousTick = null;
}

function tick(now) {
  if (!state.playing) return;
  const { duration } = state.selected.data;
  const next = state.time + (state.previousTick === null ? 0 : (now - state.previousTick) / 1000);
  state.previousTick = now;
  if (next >= duration) stopPlayback();
  seek(next);
  if (state.playing) state.frameRequest = requestAnimationFrame(tick);
}

function play() {
  cancelAnimationFrame(state.frameRequest);
  state.playing = true;
  state.previousTick = null;
  seek(state.time >= state.selected.data.duration ? 0 : state.time);
  state.frameRequest = requestAnimationFrame(tick);
}

function buildProp(def, track) {
  if (!track?.length) throw new Error('Missing attachment track ' + def.id);
  const item = makeProp(def.model, sources);
  propStage.add(item.object);
  return { ...item, def, track };
}

function select(data, autoplay = true) {
  stopPlayback();
  cancelAnimationFrame(state.frameRequest);
  mixer.stopAllAction();
  propStage.clear();
  const clip = motionClips.find(entry => entry.name === data.id);
  if (!clip) throw new Error('Missing motion ' + data.id);

  const props = data.props.map(def => buildProp(def, data.propTracks[def.id]));
  const animation = mixer.clipAction(clip).reset().setLoop(T.LoopOnce, 1);
  animation.clampWhenFinished = true;
  animation.play();

  for (const [id, button] of buttons) button.setAttribute('aria-pressed', String(id === data.id));
  $('action-title').textContent = data.label;
  $('action-description').textContent = data.description;
  $('time').max = data.duration;
  for (const id of ['time', 'play', 'reset']) $(id).disabled = false;

  state.selected = { data, animation, props };
  document.documentElement.dataset.action = data.id;
  seek(0);
  if (autoplay) play();
}

function createButton(data) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'action';
  button.dataset.action = data.id;
  button.title = data.label;
  button.setAttribute('aria-label', data.label);
  button.setAttribute('aria-pressed', 'false');
  const icon = document.createElement('img');
  icon.src = data.icon;
  icon.alt = '';
  icon.width = 96;
  icon.height = 96;
  const label = document.createElement('span');
  label.textContent = shortLabels[data.id] ?? data.label;
  button.append(icon, label);
  button.addEventListener('click', () => select(data));
  buttons.set(data.id, button);
  return button;
}

async function initialize() {
  prepareScene();
  const response = await fetch('./catalog.json');
  if (!response.ok) throw new Error('Could not load catalog');
  const catalog = await response.json();
  const [motion, firefighter, child, adult, cat] = await Promise.all([
    loader.loadAsync(catalog.asset),
    loader.loadAsync(catalog.character),
    loader.loadAsync(catalog.previewModels.child),
    loader.loadAsync(catalog.previewModels.adult),
    loader.loadAsync(catalog.previewModels.cat),
  ]);
  sources = { child, adult, cat };
  motionClips = motion.animations;
  sampleRate = catalog.sampleRateHz;
  const rescuer = firefighterScene(firefighter);
  rescuerRoot = rescuer.getObjectByName('Root');
  mixer = new T.AnimationMixer(rescuer);
  scene.add(rescuer);

  $('actions').append(...catalog.actions.map(createButton));
  $('play').addEventListener('click', () => {
    if (!state.playing) {
      play();
      return;
    }
    stopPlayback();
    updateControls();
  });
  $('reset').addEventListener('click', () => {
    stopPlayback();
    seek(0);
  });
  $('time').addEventListener('input', event => {
    stopPlayback();
    seek(Number(event.currentTarget.value));
  });

  select(catalog.actions[0], false);
  document.documentElement.dataset.previewState = 'ready';
}

initialize().catch(error => {
  console.error(error);
  document.documentElement.dataset.previewState = 'error';
  $('stage-status').textContent = 'טעינת התצוגה נכשלה';
  $('action-description').textContent = 'אפשר לפתוח את הדף דרך שרת מקומי מתיקיית המאגר.';
});
