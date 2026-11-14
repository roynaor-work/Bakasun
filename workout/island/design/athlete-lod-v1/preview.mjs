import * as T from 'three';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {BONE_NAMES, CLIPS, MOTION_PATHS, buildClips} from './motion.mjs';

const $ = id => document.getElementById(id);
const loader = new GLTFLoader();
const renderer = new T.WebGLRenderer({canvas: $('canvas'), antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.setScissorTest(true);
const camera = new T.PerspectiveCamera(42, 1, .01, 30);
const texture = await new T.TextureLoader().loadAsync('./textures/number-23-mask.png');
texture.flipY = false;
texture.colorSpace = T.SRGBColorSpace;
texture.wrapS = texture.wrapT = T.ClampToEdgeWrapping;
let actors = [], motion, activeClip, playing = true, time = 0, yaw = .12, loadGeneration = 0;
let sources;
const v = new T.Vector3();

for (const {id, label} of CLIPS) $('clip').add(new Option(label, id));

function addNumber(source) {
  let body;
  source.traverse(o => { if (o.isSkinnedMesh && !body) body = o; });
  const g = body.geometry, p = g.attributes.position, normal = g.attributes.normal;
  const regions = g.attributes._region, index = g.index, faces = [];
  for (let i = 0; i < index.count; i += 3) {
    const f = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const xs = f.map(j => p.getX(j)), ys = f.map(j => p.getY(j));
    if (Math.min(...xs) < .078 && Math.max(...xs) > -.078 && Math.min(...ys) < 1.31 && Math.max(...ys) > 1.115
      && f.reduce((s, j) => s + p.getZ(j), 0) / 3 < -.045
      && f.reduce((s, j) => s + normal.getZ(j), 0) / 3 < -.45
      && f.every(j => [1, 3].includes(regions.getX(j)))) faces.push(...f);
  }
  const geometry = g.clone(), positions = p.clone(), uv = new Float32Array(p.count * 2);
  const color = new Float32Array(p.count * 4), region = new Uint8Array(p.count);
  const trim = new T.Color('#e7dbb9');
  for (let i = 0; i < p.count; i++) {
    positions.setXYZ(i, p.getX(i) + normal.getX(i) * .0007,
      p.getY(i) + normal.getY(i) * .0007, p.getZ(i) + normal.getZ(i) * .0007);
    uv.set([(.078 - p.getX(i)) / .156, (1.31 - p.getY(i)) / .195], i * 2);
    color.set([trim.r, trim.g, trim.b, 1], i * 4); region[i] = 3;
  }
  geometry.setAttribute('position', positions);
  geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
  geometry.setAttribute('color', new T.BufferAttribute(color, 4));
  geometry.setAttribute('_region', new T.BufferAttribute(region, 1));
  geometry.setIndex(faces);
  const material = new T.MeshStandardMaterial({name: 'back_number_mask', map: texture, vertexColors: true,
    alphaTest: .5, roughness: .88, metalness: 0});
  const patch = new T.SkinnedMesh(geometry, material);
  patch.name = 'back_number_mask';
  patch.bind(body.skeleton, body.bindMatrix);
  patch.morphTargetInfluences?.fill(0);
  body.parent.add(patch);
}

function makeActor(gltf, lod) {
  const scene = new T.Scene();
  scene.background = new T.Color('#17252a');
  scene.add(new T.HemisphereLight('#dbf4f1', '#526974', 2.3));
  const key = new T.DirectionalLight('#fff1df', 3.4); key.position.set(3, 5, 4); scene.add(key);
  const rim = new T.DirectionalLight('#a9d6e5', 2); rim.position.set(-3, 3, -4); scene.add(rim);
  const ground = new T.Mesh(new T.CircleGeometry(.57, 48), new T.MeshBasicMaterial({color: '#263c43'}));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.006; scene.add(ground);
  const holder = new T.Group(); scene.add(holder); holder.add(gltf.scene);
  const meshes = [], bones = {};
  gltf.scene.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) {
      o.frustumCulled = false;
      const basketball = $('profile').value !== 'soccer';
      o.morphTargetInfluences?.fill(0);
      if (basketball && o.morphTargetDictionary?.basketball !== undefined)
        o.morphTargetInfluences[o.morphTargetDictionary.basketball] = 1;
      meshes.push(o);
    }
  });
  if (BONE_NAMES.some(name => !bones[name]) || Object.keys(bones).length !== 18) throw Error('נדרש שלד קנוני בן 18 עצמות');
  const skeleton = new T.SkeletonHelper(gltf.scene); skeleton.visible = $('skeleton').checked; scene.add(skeleton);
  const mixer = new T.AnimationMixer(gltf.scene);
  const count = meshes.reduce((s, o) => s + o.geometry.index.count / 3, 0);
  $(`stats${lod}`).innerHTML = `<strong>${count.toLocaleString('he-IL')}</strong> משולשים<small>${(count * 22).toLocaleString('he-IL')} ל־22 שחקנים</small>`;
  return {scene, root: gltf.scene, holder, meshes, bones, skeleton, mixer, count,
    sourceVertexIndices: gltf.parser.json.meshes[0].extras?.sourceVertexIndices};
}

function recolor() {
  const palette = {1: new T.Color($('primary').value), 2: new T.Color($('secondary').value), 3: new T.Color($('trim').value)};
  for (const actor of actors) for (const mesh of actor.meshes) {
    const color = mesh.geometry.attributes.color, regions = mesh.geometry.attributes._region;
    for (let i = 0; i < regions.count; i++) {
      const c = palette[regions.getX(i)];
      if (c) color.setXYZ(i, c.r, c.g, c.b);
    }
    color.needsUpdate = true;
  }
}

function changeClip() {
  activeClip = motion[$('clip').value]; time = 0;
  for (const a of actors) { a.mixer.stopAllAction(); a.mixer.clipAction(activeClip).play(); }
  renderPose(0);
}

function disposeActor(actor) {
  actor.mixer.stopAllAction(); actor.mixer.uncacheRoot(actor.root);
  actor.skeleton.geometry.dispose(); actor.skeleton.material.dispose();
  actor.scene.traverse(o => {
    if (o.isMesh) { o.geometry.dispose(); for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.dispose(); }
  });
}

async function loadProfile() {
  const generation = ++loadGeneration, profile = $('profile').value;
  $('status').textContent = 'טוען שלוש רמות פירוט…';
  try {
    const models = await Promise.all([
      loader.loadAsync(`../../assets/athlete-body-v22/models/${profile}.glb`),
      loader.loadAsync(`./models/${profile}-lod1.glb`), loader.loadAsync(`./models/${profile}-lod2.glb`),
    ]);
    if (generation !== loadGeneration) return;
    addNumber(models[0].scene);
    actors.forEach(disposeActor);
    actors = models.map(makeActor);
    motion = buildClips(T, ...sources, profile);
    recolor(); changeClip(); applyWireframe();
    $('status').textContent = 'מוכן · 18 עצמות זהות בכל רמה · מסכת המספר כלולה בספירה';
    $('budget').textContent = `22 שחקנים: ${actors.map(a => (a.count * 22).toLocaleString('he-IL')).join(' ← ')} משולשים`;
  } catch (error) {
    $('status').textContent = 'הטעינה נכשלה: ' + error.message;
    console.error(error);
  }
}

function renderPose(at) {
  if (!activeClip || !actors.length) return;
  for (const actor of actors) {
    actor.holder.position.y = 0; actor.holder.rotation.y = yaw;
    actor.mixer.setTime(at); actor.scene.updateMatrixWorld(true);
    actor.meshes.forEach(mesh => mesh.skeleton.update());
  }
  // Apply one shared floor correction from the exact reference surface.
  let minY = Infinity;
  const reference = actors[0].meshes[0];
  for (let i = 0; i < reference.geometry.attributes.position.count; i++) {
    reference.getVertexPosition(i, v); v.applyMatrix4(reference.matrixWorld); minY = Math.min(minY, v.y);
  }
  for (const actor of actors) {
    actor.holder.position.y = Math.max(0, -minY); actor.scene.updateMatrixWorld(true);
    actor.meshes.forEach(mesh => mesh.skeleton.update());
  }
  $('time').value = at / activeClip.duration;
  $('seconds').textContent = at.toFixed(2) + ' שנ׳';
}

function applyWireframe() {
  for (const a of actors) for (const mesh of a.meshes) mesh.material.wireframe = $('wireframe').checked;
}
function draw() {
  const rect = $('comparison').getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  const width = rect.width / 3;
  camera.aspect = width / rect.height;
  // Preserve useful framing in narrow mobile columns by widening vertical FOV.
  camera.fov = camera.aspect < .6 ? 55 : 42;
  camera.position.set(0, 1.2, +$('zoom').value); camera.lookAt(0, 1.2, 0); camera.updateProjectionMatrix();
  actors.forEach((a, i) => {
    renderer.setViewport(i * width, 0, width, rect.height);
    renderer.setScissor(i * width, 0, width, rect.height);
    renderer.render(a.scene, camera);
  });
}

$('profile').addEventListener('change', loadProfile);
$('clip').addEventListener('change', changeClip);
$('play').addEventListener('click', () => { playing = !playing; $('play').textContent = playing ? 'השהיה' : 'ניגון'; });
$('time').addEventListener('input', () => { playing = false; $('play').textContent = 'ניגון'; time = +$('time').value * activeClip.duration; renderPose(time); });
for (const id of ['primary', 'secondary', 'trim']) $(id).addEventListener('input', recolor);
$('wireframe').addEventListener('change', applyWireframe);
$('skeleton').addEventListener('change', () => actors.forEach(a => { a.skeleton.visible = $('skeleton').checked; }));
document.querySelectorAll('[data-yaw]').forEach(button => button.addEventListener('click', () => { yaw = +button.dataset.yaw; renderPose(time); }));
let pointerX;
$('canvas').addEventListener('pointerdown', event => { pointerX = event.clientX; $('canvas').setPointerCapture(event.pointerId); });
$('canvas').addEventListener('pointermove', event => { if (pointerX !== undefined) { yaw += (event.clientX - pointerX) * .012; pointerX = event.clientX; renderPose(time); } });
for (const name of ['pointerup', 'pointercancel']) $('canvas').addEventListener(name, () => { pointerX = undefined; });

// Read-only inspection API used for the delivered browser evidence.
window.athleteLodPreview = {get actors() { return actors; }, get clips() { return motion; },
  get ready() { return actors.length === 3 && !!motion; },
  pose(clip, phase) { $('clip').value = clip; changeClip(); playing = false; $('play').textContent = 'ניגון'; time = activeClip.duration * phase; renderPose(time); draw(); },
  get renderer() { return renderer; }};

try {
  sources = await Promise.all(MOTION_PATHS.map(async path => {
    const response = await fetch(path); if (!response.ok) throw Error(`${path}: ${response.status}`); return response.json();
  }));
  await loadProfile();
} catch (error) { $('status').textContent = 'הטעינה נכשלה: ' + error.message; console.error(error); }
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, .05); last = now;
  if (playing && activeClip) { time = (time + dt) % activeClip.duration; renderPose(time); }
  draw();
});
