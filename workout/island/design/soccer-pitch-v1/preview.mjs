/* Original work, CC0-1.0. Uses the repository's unchanged MIT Three.js. */
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';

const $ = id => document.getElementById(id);
const stage = $('stage');
const scene = new T.Scene();
scene.background = new T.Color('#dae4d6');
const camera = new T.PerspectiveCamera(42, 1, .1, 240);
const renderer = new T.WebGLRenderer({antialias:true, alpha:false, logarithmicDepthBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.domElement.setAttribute('aria-label', 'מגרש כדורגל, שער ושחקן בגובה 1.75 מטרים');
stage.append(renderer.domElement);
scene.add(new T.HemisphereLight('#f9ffe8', '#7b8a5d', 2.1));
const sun = new T.DirectionalLight('#fff4dc', 2.6);
sun.position.set(-30, 55, 40);
scene.add(sun);
const kit = new T.Group();
kit.name = 'full_pitch_kit';
scene.add(kit);
const reference = new T.Group();
reference.name = 'scale_reference';
scene.add(reference);
// The preview apron is outside the delivered pitch and adds just two triangles.
const apron = new T.Mesh(new T.PlaneGeometry(122, 84), new T.MeshStandardMaterial({color:'#7a8b60', roughness:1}));
apron.rotation.x = -Math.PI/2;
apron.position.y = -.04;
scene.add(apron);

let manifest, player, ball, sharedAtlas, currentView = 'game';
const models = new Map();
const nets = [];
const format = n => n.toLocaleString('en-US');
const triangleCount = root => {
  let n = 0;
  root.traverse(o => {
    if (!o.isMesh) return;
    n += (o.geometry.index?.count ?? o.geometry.attributes.position.count)/3 * (o.isInstancedMesh ? o.count : 1);
  });
  return n;
};

function instance(file, position, rotationY = 0) {
  const object = models.get(file).clone(true);
  object.position.fromArray(position);
  object.rotation.y = rotationY;
  object.traverse(o => {
    if (o.name === 'net') nets.push(o);
  });
  kit.add(object);
  return object;
}

function countScene() {
  const triangles = triangleCount(kit);
  const total = triangleCount(scene);
  $('triangle-count').textContent = format(triangles);
  $('compact-count').textContent = format(triangles);
  $('unique-count').textContent = format(manifest.uniqueTriangles);
  $('scene-count').textContent = format(total);
  $('budget-fill').style.width = `${triangles/4000*100}%`;
  return {kit:triangles, fullPreview:total, unique:manifest.uniqueTriangles, limit:4000};
}

function setView(view) {
  currentView = view;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  const portrait = camera.aspect < 1;
  const c = manifest.camera;
  const elevation = portrait ? c.portraitElevation : c.landscapeElevation;
  const distance = portrait ? c.portraitDistance : c.landscapeDistance;
  camera.fov = c.fov;
  camera.up.set(0, 1, 0);
  if (view === 'game') {
    const target = new T.Vector3(portrait ? 51.5 : 49.8, 0, 0);
    const angle = elevation*Math.PI/180;
    camera.position.copy(target).add(new T.Vector3(0, distance*Math.sin(angle), distance*Math.cos(angle)));
    camera.lookAt(target);
    $('view-name').textContent = 'מצלמת המשחק';
    $('camera-note').textContent = `42° FOV · ${elevation}° · ${distance} m`;
  } else if (view === 'overview') {
    // Fit all four pitch corners, flags and goals with the same 42 degree lens.
    const target = new T.Vector3(0, 0, 0);
    const direction = new T.Vector3(45, 92, 66).normalize();
    const vertical = 50 / Math.tan(T.MathUtils.degToRad(camera.fov/2));
    const horizontal = 74 / (Math.tan(T.MathUtils.degToRad(camera.fov/2))*camera.aspect);
    camera.position.copy(direction.multiplyScalar(Math.max(vertical, horizontal)+20));
    // A long overview distance is isolated from the game's 240 m far plane.
    camera.far = 700;
    camera.near = 1;
    camera.lookAt(target);
    $('view-name').textContent = 'המגרש כולו';
    $('camera-note').textContent = '105 × 68 m · 1:1';
  } else if (view === 'goal') {
    const target = new T.Vector3(52.1, 1.1, 0);
    camera.position.copy(target).add(new T.Vector3(-11.2, 3.3, 7).multiplyScalar(Math.max(1, 1.1/camera.aspect)));
    camera.lookAt(target);
    $('view-name').textContent = 'השער והשחקן';
    $('camera-note').textContent = '7.32 × 2.44 m · player 1.75 m';
  } else {
    const target = ball.position.clone();
    camera.position.copy(target).add(new T.Vector3(-.48, .29, .47));
    camera.near = .01;
    camera.lookAt(target);
    $('view-name').textContent = 'הכדור';
    $('camera-note').textContent = 'Ø 0.22 m · atlas 248 × 124 px';
  }
  if (view !== 'overview') camera.far = c.far;
  if (view !== 'ball') camera.near = c.near;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  render();
}

function labelPlayer() {
  if (!player) return;
  const point = new T.Vector3(48.7, 1.95, .7).project(camera);
  const inside = point.z > -1 && point.z < 1 && Math.abs(point.x) < .93 && Math.abs(point.y) < .9;
  const label = $('player-label');
  label.hidden = !inside || currentView === 'ball' || currentView === 'overview';
  label.style.left = `${(point.x+1)*stage.clientWidth/2}px`;
  label.style.top = `${(1-point.y)*stage.clientHeight/2}px`;
}

function render() {
  renderer.render(scene, camera);
  labelPlayer();
}

function resize() {
  const {width, height} = stage.getBoundingClientRect();
  renderer.setSize(width, height);
  camera.aspect = width/height;
  if (manifest && player) setView(currentView);
}
new ResizeObserver(resize).observe(stage);
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$('show-net').addEventListener('change', e => {
  nets.forEach(net => {net.visible = e.target.checked;});
  render();
});
$('wireframe').addEventListener('change', e => {
  scene.traverse(o => {
    if (!o.isMesh || o === apron) return;
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) material.wireframe = e.target.checked;
  });
  render();
});

async function start() {
  const response = await fetch('./manifest.json');
  if (!response.ok) throw Error(`manifest.json: HTTP ${response.status}`);
  manifest = await response.json();
  sharedAtlas = await new T.TextureLoader().loadAsync('./atlas.png');
  sharedAtlas.flipY = false;
  sharedAtlas.colorSpace = T.SRGBColorSpace;
  sharedAtlas.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  const loader = new GLTFLoader();
  const files = [...manifest.assets.map(asset => asset.file), 'reference_player.glb'];
  await Promise.all(files.map(async file => {
    const data = await loader.loadAsync(`./${file}`);
    // One shared GPU atlas too, rather than one texture upload per GLB.
    data.scene.traverse(o => {
      if (!o.isMesh) return;
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        if (material.map) {
          material.map.dispose();
          material.map = sharedAtlas;
        }
      }
    });
    models.set(file, data.scene);
  }));
  instance('pitch.glb', [0,0,0]);
  for (const goal of manifest.placement.goals) instance('goal.glb', goal.position, goal.rotationY);
  for (const [i, position] of manifest.placement.flags.entries()) instance('corner_flag.glb', position, i%2 ? Math.PI : 0);
  instance('bench.glb', [-7,0,-38]);
  instance('bench.glb', [7,0,-38]);
  for (const x of [-36,-12,12,36]) {
    instance('ad_board.glb', [x,0,-36.5]);
    instance('ad_board.glb', [x,0,36.5], Math.PI);
  }
  ball = instance('ball.glb', [47.6,.113,1.2]);
  player = models.get('reference_player.glb').clone(true);
  player.position.set(48.7,.003,.7);
  player.rotation.y = .24;
  reference.add(player);
  const playerBounds = new T.Box3().setFromObject(player);
  const triangles = countScene();
  const pitchBounds = new T.Box3().setFromObject(kit.children[0]);
  if (Math.abs(playerBounds.max.y-playerBounds.min.y-1.75) > .0001) throw Error('Reference player must be exactly 1.75 m');
  if (triangles.kit !== manifest.fullSceneTriangles || triangles.fullPreview > 4000) throw Error('Triangle budget mismatch');
  $('loading').hidden = true;
  resize();
  // Read-only measurements for the handoff and browser inspection.
  window.soccerPitchPreview = {
    ready:true,
    triangles,
    playerHeight:playerBounds.max.y-playerBounds.min.y,
    pitchBounds:{min:pitchBounds.min.toArray(),max:pitchBounds.max.toArray()},
    atlas:[sharedAtlas.image.width,sharedAtlas.image.height],
    get view() {return currentView;},
    get camera() {return {fov:camera.fov,position:camera.position.toArray(),near:camera.near,far:camera.far};},
    get netVisible() {return nets.every(net => net.visible);},
    get renderTriangles() {return renderer.info.render.triangles;},
    get textureCount() {return renderer.info.memory.textures;},
  };
}

start().catch(error => {
  console.error(error);
  $('loading').hidden = false;
  $('loading').textContent = `לא ניתן לטעון את הערכה. ${error.message}. יש לפתוח דרך שרת HTTP מהמאגר.`;
});
