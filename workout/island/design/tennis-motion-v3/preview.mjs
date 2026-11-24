// SPDX-License-Identifier: CC0-1.0
import * as T from '../tennis-motion-v2/vendor/three.module.js';
import {GLTFLoader} from '../tennis-motion-v2/vendor/GLTFLoader.js';
import {buildCourt} from './court.mjs';

const el = id => document.getElementById(id);
const stage = el('stage');
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(31, 1, .03, 100);
const angles = {three: -.74, front: 0, side: -Math.PI / 2, back: Math.PI};
const vector = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
let renderer, catalog, library, primary, companion, coachKit, practiceKit, current;
let view = 'three', yaw = angles.three, pitch = .14, zoom = 1;
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let time = 0, lastTick = 0, speed = 1;
const clipBounds = new Map();
const visibleActors = () => companion?.group.visible ? [primary, companion] : [primary];

// Keep both sides of a paired drill identifiable. Only the fixture's teal
// shirt and sleeves change colour. Shorts and skin retain their atlas values.
function changeKit(model) {
  const materials = new Set();
  model.traverse(node => { if (node.isMesh) materials.add(node.material); });
  for (const material of materials) {
    if (material.name === 'Original tennis sleeve') material.color.set('#e6d2a2');
    if (material.name !== 'Cloth') continue;
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #include <map_fragment>
        float teal = smoothstep(.042, .080, diffuseColor.g - diffuseColor.r)
                   * smoothstep(.03, .07, diffuseColor.b - diffuseColor.r);
        vec3 warmCloth = diffuseColor.g * vec3(4.7, 3.9, 2.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, warmCloth, teal);
      `);
    };
  }
}

function createPlayer(model) {
  const group = new T.Group();
  group.add(model);
  scene.add(group);
  model.traverse(node => {
    if (node.isMesh) {
      node.frustumCulled = false;
      node.castShadow = true;
    }
  });
  const landmarkNames = ['Hips', 'Chest', 'Head', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm',
    'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'head'];
  const landmarks = landmarkNames.map(name => model.getObjectByName(name));
  return {model, group, landmarks, ball: model.getObjectByName('Ball'), mixer: new T.AnimationMixer(model)};
}

function activate(player, animationId) {
  player.mixer.stopAllAction();
  const clip = library.get(animationId);
  if (!clip) throw Error('Missing GLB animation ' + animationId);
  player.action = player.mixer.clipAction(clip);
  player.action.reset().setLoop(T.LoopOnce, 1).play();
  player.action.clampWhenFinished = true;
}

function poseAt(seconds) {
  for (const player of visibleActors()) {
    player.action.time = Math.min(seconds, player.action.getClip().duration);
    player.action.paused = false;
    player.mixer.update(0);
    player.group.updateMatrixWorld(true);
  }
}

// Fit to the full gesture once so the camera stays still during playback.
// A ball in open flight can travel the length of the court and leave this shot.
function measureClip() {
  if (clipBounds.has(current.id)) return;
  const points = [];
  const frames = new Set([0, current.frameCount - 1, ...current.events.map(event => event.frame)]);
  for (let frame = 0; frame < current.frameCount; frame += 4) frames.add(frame);
  for (const frame of frames) {
    poseAt(frame / catalog.fps);
    for (const player of visibleActors()) {
      const scale = player.group.scale.x;
      for (const node of player.landmarks) {
        const p = node.getWorldPosition(vector());
        const radius = node.name === 'head' ? .225 : .105;
        const extent = vector(radius, node.name === 'Head' ? .23 : radius, radius).multiplyScalar(scale);
        points.push(p.clone().sub(extent), p.clone().add(extent));
      }
      const ball = player.ball;
      if (ball.scale.x > .01) {
        const p = ball.getWorldPosition(vector());
        const nearGesture = ['Head', 'LeftHand', 'head'].some(name =>
          p.distanceTo(player.model.getObjectByName(name).getWorldPosition(vector())) < .65 * scale
        );
        if (nearGesture) points.push(p);
      }
    }
  }
  clipBounds.set(current.id, points);
}

function fitCamera() {
  if (!current) return;
  const points = clipBounds.get(current.id);
  if (!points?.length) return;
  const outward = vector(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const right = vector(0, 1, 0).cross(outward).normalize();
  const up = outward.clone().cross(right);
  const bounds = new T.Box3();
  const projected = points.map(p => vector(right.dot(p), up.dot(p), outward.dot(p)));
  for (const p of projected) bounds.expandByPoint(p);
  const center = bounds.getCenter(vector());
  const target = right.clone().multiplyScalar(center.x).addScaledVector(up, center.y).addScaledVector(outward, center.z);
  const slopeY = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
  const slopeX = slopeY * camera.aspect;
  let distance = 1;
  for (const p of projected) {
    const dx = Math.abs(p.x - center.x) / slopeX;
    const dy = Math.abs(p.y - center.y) / slopeY;
    distance = Math.max(distance, p.z - center.z + Math.max(dx, dy) * 1.13);
  }
  camera.position.copy(target).addScaledVector(outward, distance * zoom);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

function resize() {
  if (!renderer) return;
  const width = stage.clientWidth, height = stage.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  fitCamera();
  render();
}

function render() {
  if (renderer && current) renderer.render(scene, camera);
}

function displayTime(seconds) {
  time = T.MathUtils.clamp(seconds, 0, current.duration);
  const frame = Math.round(time * catalog.fps);
  poseAt(time);
  el('time').value = frame;
  el('time').setAttribute('aria-valuetext', 'פריים ' + frame + ' מתוך ' + (current.frameCount - 1));
  el('timestamp').textContent = time.toFixed(2) + ' / ' + current.duration.toFixed(2) + ' s';
  render();
}

function setPlaying(state) {
  playing = state;
  lastTick = performance.now();
  el('play').dataset.paused = String(!state);
  el('play').setAttribute('aria-label', state ? 'השהיה' : 'ניגון');
}

function seekFrame(frame) {
  if (!current || !Number.isFinite(frame)) return;
  setPlaying(false);
  displayTime(Math.round(frame) / catalog.fps);
}

function select(id) {
  const clip = catalog.clips.find(c => c.id === id);
  if (!clip) throw Error('Unknown clip ' + id);
  current = clip;
  // The child keeps the demonstration's wardrobe and size in solo practice.
  const pairedRole = catalog.clips.find(c => c.partner?.animation === id && c.id !== id)?.partner;
  primary = pairedRole ? practiceKit : coachKit;
  companion = pairedRole ? coachKit : practiceKit;
  primary.group.visible = true;
  primary.group.position.set(0, 0, 0);
  primary.group.rotation.y = 0;
  primary.group.scale.setScalar(pairedRole?.scale ?? 1);
  if (view === 'three') yaw = clip.id === 'match_handshake' ? -1.48 : angles.three;
  activate(primary, clip.id);
  companion.group.visible = Boolean(clip.partner);
  if (clip.partner) {
    const partner = clip.partner;
    companion.group.position.fromArray(partner.translation);
    companion.group.rotation.y = partner.rotationY ?? 0;
    companion.group.scale.setScalar(partner.scale ?? 1);
    activate(companion, partner.animation);
  }
  measureClip();
  fitCamera();
  displayTime(0);
  lastTick = performance.now();

  el('clip-title').textContent = clip.label;
  el('clip-id').textContent = clip.id.replaceAll('_', ' ');
  el('clip-title').title = clip.description;
  el('sheet').href = clip.sheet;
  el('sheet').hidden = false;
  el('time').max = clip.frameCount - 1;
  for (const button of el('clips').children) button.setAttribute('aria-pressed', String(button.dataset.id === clip.id));
  el('events').replaceChildren(...clip.events.map(event => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = event.label;
    button.title = event.label + ' · F' + event.frame;
    button.onclick = () => seekFrame(event.frame);
    return button;
  }));
}

function setView(value) {
  if (!(value in angles)) return;
  view = value;
  yaw = view === 'three' && current?.id === 'match_handshake' ? -1.48 : angles[view];
  pitch = .14;
  zoom = 1;
  el('view').value = view;
  fitCamera();
  render();
}

function populateLibrary() {
  el('count').textContent = catalog.clips.length + ' קליפים';
  el('rate').textContent = catalog.fps + ' FPS';
  for (const [index, clip] of catalog.clips.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.id = clip.id;
    const number = document.createElement('span');
    number.className = 'clip-index';
    number.setAttribute('aria-hidden', 'true');
    number.textContent = String(index + 1).padStart(2, '0');
    const label = document.createElement('span');
    label.textContent = clip.label;
    button.append(number, label);
    button.onclick = () => select(clip.id);
    el('clips').append(button);
  }
}

function connectControls() {
  el('play').onclick = () => setPlaying(!playing);
  el('view').onchange = e => setView(e.target.value);
  el('speed').onchange = e => { speed = Number(e.target.value); };
  el('time').oninput = e => seekFrame(Number(e.target.value));
  stage.onkeydown = e => {
    if (e.code === 'Space') {
      e.preventDefault();
      setPlaying(!playing);
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      seekFrame(Math.round(time * catalog.fps) + (e.code === 'ArrowRight' ? 1 : -1));
    }
  };
  let pointer = null;
  stage.onpointerdown = e => {
    pointer = {id:e.pointerId, x:e.clientX, y:e.clientY};
    stage.setPointerCapture(e.pointerId);
  };
  stage.onpointermove = e => {
    if (pointer?.id !== e.pointerId) return;
    yaw -= (e.clientX - pointer.x) * .008;
    pitch = T.MathUtils.clamp(pitch + (e.clientY - pointer.y) * .004, -.06, .9);
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    fitCamera();
    render();
  };
  stage.onlostpointercapture = () => { pointer = null; };
  stage.onwheel = e => {
    e.preventDefault();
    zoom = T.MathUtils.clamp(zoom * Math.exp(e.deltaY * .001), .5, 1.9);
    fitCamera();
    render();
  };
  new ResizeObserver(resize).observe(stage);
}

function capture(width, height, {backgroundOnly = false, subjectOnly = false} = {}) {
  const size = renderer.getSize(new T.Vector2());
  const ratio = renderer.getPixelRatio();
  const players = visibleActors();
  const shadowLights = scene.children.filter(node => node.isLight && node.castShadow);
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    fitCamera();
    if (backgroundOnly) for (const player of players) player.group.visible = false;
    if (subjectOnly) {
      for (const player of players) player.ball.visible = false;
      for (const light of shadowLights) light.castShadow = false;
    }
    render();
    return stage.toDataURL('image/png');
  } finally {
    for (const player of players) {
      player.group.visible = true;
      player.ball.visible = true;
    }
    for (const light of shadowLights) light.castShadow = true;
    renderer.setPixelRatio(ratio);
    renderer.setSize(size.x, size.y, false);
    camera.aspect = size.x / size.y;
    camera.updateProjectionMatrix();
    fitCamera();
    render();
  }
}

async function start() {
  renderer = new T.WebGLRenderer({canvas: stage, antialias: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  buildCourt(scene);

  const response = await fetch('catalog.json');
  if (!response.ok) throw Error('catalog.json HTTP ' + response.status);
  catalog = await response.json();
  const loader = new GLTFLoader();
  const [motion, fixtureBytes] = await Promise.all([
    loader.loadAsync(catalog.asset),
    fetch(catalog.referenceAsset).then(response => {
      if (!response.ok) throw Error(catalog.referenceAsset + ' HTTP ' + response.status);
      return response.arrayBuffer();
    })
  ]);
  // Independent skeletons for paired demonstrations. Textures remain embedded
  // in the fixture and its original animations never drive this catalogue.
  const [a, b] = await Promise.all([loader.parseAsync(fixtureBytes, ''), loader.parseAsync(fixtureBytes, '')]);
  coachKit = createPlayer(a.scene);
  changeKit(b.scene);
  practiceKit = createPlayer(b.scene);
  library = new Map(motion.animations.map(clip => [clip.name, clip]));
  populateLibrary();
  const initialId = new URLSearchParams(location.search).get('clip');
  const initialClip = catalog.clips.find(clip => clip.id === initialId) ?? catalog.clips[0];
  select(initialClip.id);
  connectControls();
  resize();
  setPlaying(playing);
  renderer.setAnimationLoop(now => {
    const dt = Math.max(0, (now - lastTick) / 1000);
    lastTick = now;
    if (playing) displayTime((time + Math.min(dt, .12) * speed) % current.duration);
  });
}

window.tennisPreview = {
  stage, scene, camera, get renderer() { return renderer; }, get actor() { return primary?.model; },
  get partner() { return companion?.group.visible ? companion.model : null; },
  select, seekFrame, setView, pause: () => setPlaying(false), play: () => setPlaying(true),
  capture, renderFrame: capture,
  snapshot() { return {clip: current?.id, duration: current?.duration, frame: Math.round(time * catalog.fps), playing, view}; },
  ready: start().catch(error => {
    el('error').hidden = false;
    el('error').textContent = 'טעינת התצוגה נכשלה. ' + error.message;
    throw error;
  }),
};
