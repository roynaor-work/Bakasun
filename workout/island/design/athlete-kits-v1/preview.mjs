// Original UV comparison viewer. SPDX-License-Identifier: CC0-1.0
// Existing local dependencies retain their own licenses; see LICENSES.md.
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {clone as cloneRig} from '../../vendor/SkeletonUtils.js';

const $ = selector => document.querySelector(selector);
const host = $('#models');
const state = {view: 'front', mode: 'material', palette: 'teal', lod: 0, details: true, normals: true, fit: true};
const palettes = {teal: ['#086f68', '#edbe65'], cobalt: ['#2756ae', '#f4eee0'], clay: ['#ae4936', '#f2ddaa']};
const angles = {front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2, 'three-quarter': Math.PI / 5};
const uniforms = [];
const studies = [];
let renderer, rotation = 0, pendingFrame = false;
window.previewReady = false;

function scheduleRender() {
  if (pendingFrame || !renderer) return;
  pendingFrame = true;
  requestAnimationFrame(() => { pendingFrame = false; render(); });
}

function render() {
  const box = host.getBoundingClientRect();
  const width = Math.round(box.width), height = Math.round(box.height);
  if (renderer.domElement.width !== Math.round(width * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(height * renderer.getPixelRatio())) renderer.setSize(width, height, false);
  renderer.setScissorTest(false);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const study of studies) {
    const r = study.stage.getBoundingClientRect();
    const x = r.left - box.left, y = box.bottom - r.bottom;
    renderer.setViewport(x, y, r.width, r.height);
    renderer.setScissor(x, y, r.width, r.height);
    const aspect = r.width / r.height;
    const halfHeight = Math.max(1.13, 0.71 / aspect);
    study.camera.left = -halfHeight * aspect; study.camera.right = halfHeight * aspect;
    study.camera.top = halfHeight; study.camera.bottom = -halfHeight;
    study.camera.updateProjectionMatrix();
    study.turntable.rotation.y = rotation;
    renderer.render(study.scene, study.camera);
  }
  renderer.setScissorTest(false);
}

function pressed(selector, key, value) {
  document.querySelectorAll(selector).forEach(button => button.setAttribute('aria-pressed', String(button.dataset[key] === String(value))));
}

function setView(view) {
  if (!(view in angles)) throw Error('Unknown view: ' + view);
  state.view = view; rotation = angles[view]; pressed('[data-view]', 'view', view); scheduleRender();
}
function setMode(mode) {
  if (!['material', 'mask'].includes(mode)) throw Error('Unknown mode: ' + mode);
  state.mode = mode; uniforms.forEach(u => {u.studyMaskMode.value = mode === 'mask' ? 1 : 0;});
  pressed('[data-mode]', 'mode', mode); scheduleRender();
}
function setPalette(name) {
  if (!(name in palettes)) throw Error('Unknown palette: ' + name);
  state.palette = name;
  uniforms.forEach(u => {u.studyPrimary.value.set(palettes[name][0]); u.studySecondary.value.set(palettes[name][1]);});
  pressed('[data-palette]', 'palette', name); scheduleRender();
}
function setLod(lod) {
  if (![0, 1].includes(Number(lod))) throw Error('Unknown LOD: ' + lod);
  state.lod = Number(lod);
  studies.forEach(s => s.root.traverse(o => {if (o.isMesh) o.visible = Number(/LOD1/.test(o.name + ' ' + o.parent?.name)) === state.lod;}));
  pressed('[data-lod]', 'lod', state.lod);
  $('#status').textContent = `טעון · ${state.lod ? 'LOD1' : 'LOD0'} · three.js r${T.REVISION}`;
  scheduleRender();
}
function setDetails(value) {state.details = Boolean(value); $('#details').checked = state.details; uniforms.forEach(u => {u.studyDetails.value = state.details ? 1 : 0;}); scheduleRender();}
function setNormals(value) {state.normals = Boolean(value); $('#normals').checked = state.normals; uniforms.forEach(u => {u.studyNormals.value = state.normals ? 1 : 0;}); scheduleRender();}
function setFit(value) {
  state.fit = Boolean(value); $('#fit').checked = state.fit;
  studies.filter(s => s.basketball).forEach(s => s.root.traverse(o => {
    if (!o.isMesh || !o.geometry.userData.sourcePositions) return;
    const geometry = o.geometry, p = geometry.attributes.position;
    p.array.set(state.fit ? geometry.userData.fittedPositions : geometry.userData.sourcePositions);
    geometry.attributes.normal.array.set(state.fit ? geometry.userData.fittedNormals : geometry.userData.sourceNormals);
    p.needsUpdate = true; geometry.attributes.normal.needsUpdate = true;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  }));
  scheduleRender();
}

// A reversible presentation fit on a cloned geometry only. No GLB is written.
// A data texture alone cannot move the soccer shorts hem from .769 m to .55 m.
function fitGeometry(mesh, maskImage) {
  if (mesh.material.name !== 'athlete-kit') return;
  const g = mesh.geometry = mesh.geometry.clone();
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const tags = g.attributes._region;
  g.userData.sourcePositions = p.array.slice();
  g.userData.sourceNormals = n.array.slice();
  const canvas = document.createElement('canvas'); canvas.width = maskImage.width; canvas.height = maskImage.height;
  const context = canvas.getContext('2d', {willReadFrequently: true}); context.drawImage(maskImage, 0, 0);
  const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < p.count; i++) {
    const tag = Math.round(tags.getX(i));
    if (tag === 2) {
      const y = p.getY(i), t = T.MathUtils.clamp((1.025 - y) / (1.025 - 0.76850957), 0, 1);
      p.setY(i, y - (0.76850957 - 0.55) * t ** 1.35);
    } else if (tag === 1 || tag === 3) {
      const px = T.MathUtils.clamp(Math.floor(uv.getX(i) * canvas.width), 0, canvas.width - 1);
      const py = T.MathUtils.clamp(Math.floor(uv.getY(i) * canvas.height), 0, canvas.height - 1);
      const coverage = bytes[(py * canvas.width + px) * 4 + 3] / 255;
      const inset = (tag === 1 ? 0.019 : 0) * (1 - coverage);
      p.setXYZ(i, p.getX(i) - n.getX(i) * inset, p.getY(i) - n.getY(i) * inset, p.getZ(i) - n.getZ(i) * inset);
    }
  }
  g.userData.fittedPositions = p.array.slice();
  g.computeVertexNormals();
  // Socks/boots did not move; retain their authored source smoothing.
  for (let i = 0; i < p.count; i++) {
    if (Math.round(tags.getX(i)) >= 3) {
      g.attributes.normal.setXYZ(i, ...g.userData.sourceNormals.slice(i * 3, i * 3 + 3));
    }
  }
  g.userData.fittedNormals = g.attributes.normal.array.slice();
}

const shaderHead = `
uniform sampler2D studyMask, studyDetail, studySkin, studySkinMask, studySkinOrm, studyKitNormal, studySkinNormal;
uniform vec3 studyPrimary, studySecondary;
uniform float studyMaskMode, studyDetails, studyNormals, studyBasketball, studyShell;
float studyCoverage = 0.0;
`;

// The old panel follows the existing mask/detail channel contract. The new panel
// adds A=coverage on both existing skin and kit surfaces, without editing the GLB.
const shaderBody = `
vec4 region = texture2D(studyMask, vMapUv);
vec3 detail = mix(vec3(0.79, 0.0, 0.0), texture2D(studyDetail, vMapUv).rgb, studyDetails);
vec3 skin = texture2D(studySkin, vMapUv).rgb;
skin = mix(skin / 12.92, pow((skin + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), skin));
vec3 skinRegion = texture2D(studySkinMask, vMapUv).rgb;
vec3 skinOrm = texture2D(studySkinOrm, vMapUv).rgb;
float eye = step(0.79, vMapUv.x) * step(vMapUv.y, 0.115);
vec3 hair = vec3(0.038, 0.025, 0.018) * (0.5 + 0.85 * skinOrm.b);
skin = mix(skin, hair, skinRegion.r * (1.0 - eye));
skin = mix(skin, hair * 0.7 + skin * 0.12, skinRegion.g * 0.18 * smoothstep(0.45, 0.95, skinOrm.b));
// Hidden skin texels were never authored as a visible surface in the source.
// Use its reference skin tone on the revealed shell, with slight atlas variation.
skin = mix(skin, vec3(0.52, 0.31, 0.235) * 0.96 + skin * 0.04, studyShell * studyBasketball);
float shoe = clamp(1.0 - region.r - region.g - region.b, 0.0, 1.0);
vec3 jersey = mix(studyPrimary, studySecondary, detail.g) * (1.0 - 0.16 * detail.b);
vec3 shorts = mix(studyPrimary * mix(0.18, 1.0, studyBasketball), studySecondary, detail.g);
vec3 socks = mix(vec3(0.87, 0.88, 0.84), studySecondary, detail.g);
vec3 boots = mix(vec3(0.055, 0.067, 0.063), studySecondary, detail.g);
vec3 cloth = (jersey * region.r + shorts * region.g + socks * region.b + boots * shoe) * (0.25 + 0.95 * detail.r);
studyCoverage = mix(studyShell, region.a, studyBasketball);
diffuseColor.rgb = mix(skin, cloth, studyCoverage);
if (studyMaskMode > 0.5) diffuseColor.rgb = mix(vec3(0.53), region.rgb, studyCoverage);
`;

function studyMaterial(source, maps, basketball, shell) {
  const mat = source.clone();
  // Supply UV attributes through map/normalMap while the fragment body samples
  // explicit linear data maps. Albedo is decoded from sRGB exactly once above.
  mat.map = maps.skin;
  mat.normalMap = maps.skinNormal;
  mat.emissiveMap = null; mat.emissive.set(0); mat.metalness = 0;
  mat.roughness = 0.91; mat.side = T.FrontSide;
  mat.roughnessMap = null; mat.metalnessMap = null; mat.aoMap = null;
  const u = {
    studyMask: {value: basketball ? maps.mask : maps.oldMask},
    studyDetail: {value: basketball ? maps.detail : maps.oldDetail},
    studySkin: {value: maps.skin}, studySkinMask: {value: maps.skinMask}, studySkinOrm: {value: maps.skinOrm},
    studyKitNormal: {value: basketball ? maps.normal : maps.oldNormal}, studySkinNormal: {value: maps.skinNormal},
    studyPrimary: {value: new T.Color(palettes.teal[0])}, studySecondary: {value: new T.Color(palettes.teal[1])},
    studyMaskMode: {value: 0}, studyDetails: {value: 1}, studyNormals: {value: 1},
    studyBasketball: {value: basketball ? 1 : 0}, studyShell: {value: shell ? 1 : 0},
  };
  uniforms.push(u);
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shaderHead + shader.fragmentShader.replace('#include <map_fragment>', shaderBody);
    const normalChunk = T.ShaderChunk.normal_fragment_maps.replaceAll(
      'texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0',
      'mix(vec3(0.0, 0.0, 1.0), mix(mix(texture2D(studySkinNormal, vNormalMapUv).xyz, vec3(0.5, 0.5, 1.0), studyShell * studyBasketball), texture2D(studyKitNormal, vNormalMapUv).xyz, studyCoverage) * 2.0 - 1.0, studyNormals)'
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', normalChunk);
    // Keep mask inspection independent of the studio lights and normal maps.
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'if (studyMaskMode > 0.5) outgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'basketball-uv-study-v1';
  return mat;
}

function makeStudy(source, maps, basketball) {
  const scene = new T.Scene(); scene.background = new T.Color('#f6f8f3');
  const camera = new T.OrthographicCamera(-1, 1, 1.13, -1.13, 0.1, 40);
  camera.position.set(0, 1.04, 6); camera.lookAt(0, 0.96, 0);
  const root = cloneRig(source);
  root.getObjectByName('Ball')?.removeFromParent();
  root.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(root), center = bounds.getCenter(new T.Vector3());
  root.position.x -= center.x; root.position.z -= center.z; root.position.y -= bounds.min.y;
  const materials = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const sourceMat = o.material;
    if (basketball) fitGeometry(o, maps.mask.image);
    if (!materials.has(sourceMat)) materials.set(sourceMat, studyMaterial(sourceMat, maps, basketball, sourceMat.name === 'athlete-kit'));
    o.material = materials.get(sourceMat); o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
  });
  const turntable = new T.Group(); turntable.add(root); scene.add(turntable);
  const floor = new T.Mesh(new T.PlaneGeometry(200, 200), new T.MeshStandardMaterial({color: '#f0f3ec', roughness: 1}));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.007; floor.receiveShadow = true; scene.add(floor);
  scene.add(new T.HemisphereLight('#ffffff', '#b0bdb0', 2.1));
  const key = new T.DirectionalLight('#fff8ed', 3.0); key.position.set(-2.8, 4.5, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -2; key.shadow.camera.right = 2; key.shadow.camera.top = 3; key.shadow.camera.bottom = -1;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.015; key.shadow.radius = 4; scene.add(key);
  const fill = new T.DirectionalLight('#e6efff', 1.3); fill.position.set(3, 2.5, 2); scene.add(fill);
  const rim = new T.DirectionalLight('#ffffff', 1.4); rim.position.set(0, 3, -3); scene.add(rim);
  studies.push({scene, camera, root, turntable, basketball, stage: $(`[data-stage="${basketball ? 'basketball' : 'original'}"]`)});
}

async function start() {
  renderer = new T.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', 'הדמיית תלת־ממד של הקיט המקורי ושל קיט הכדורסל');
  renderer.domElement.setAttribute('role', 'img'); host.append(renderer.domElement);
  const textureLoader = new T.TextureLoader();
  const files = {mask: 'kit-mask-basketball.png', detail: 'kit-detail-basketball.png', normal: 'kit-normal-basketball.jpg', oldMask: '../../assets/athlete/textures/kit-mask.png', oldDetail: '../../assets/athlete/textures/kit-detail.png', oldNormal: '../../assets/athlete/textures/kit-normal.jpg', skin: '../../assets/athlete/textures/skin-albedo.jpg', skinMask: '../../assets/athlete/textures/skin-mask.png', skinOrm: '../../assets/athlete/textures/skin-orm.jpg', skinNormal: '../../assets/athlete/textures/skin-normal.jpg'};
  const [gltf, pairs] = await Promise.all([
    new GLTFLoader().loadAsync('../../assets/athlete/athlete.glb'),
    Promise.all(Object.entries(files).map(async ([name, path]) => {
      const texture = await textureLoader.loadAsync(path); texture.flipY = false; texture.colorSpace = T.NoColorSpace;
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      return [name, texture];
    })),
  ]);
  const maps = Object.fromEntries(pairs);
  makeStudy(gltf.scene, maps, false); makeStudy(gltf.scene, maps, true);
  setLod(0); render(); $('#loading').hidden = true;
  window.kitPreview = {ready: true, state, setView, setMode, setPalette, setLod, setDetails, setNormals, setFit, render};
  window.previewState = state; window.previewReady = true;
  window.dispatchEvent(new Event('kit-preview-ready'));
}

document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
document.querySelectorAll('[data-palette]').forEach(b => b.addEventListener('click', () => setPalette(b.dataset.palette)));
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
document.querySelectorAll('[data-lod]').forEach(b => b.addEventListener('click', () => setLod(Number(b.dataset.lod))));
$('#details').addEventListener('change', event => setDetails(event.target.checked));
$('#normals').addEventListener('change', event => setNormals(event.target.checked));
$('#fit').addEventListener('change', event => setFit(event.target.checked));
new ResizeObserver(scheduleRender).observe(host);
let drag = null;
host.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !window.previewReady) return;
  drag = {x: event.clientX, rotation}; host.setPointerCapture(event.pointerId);
});
host.addEventListener('pointermove', event => {
  if (!drag) return;
  rotation = drag.rotation + (event.clientX - drag.x) * 0.008; state.view = 'custom';
  pressed('[data-view]', 'view', 'custom'); scheduleRender();
});
host.addEventListener('pointerup', () => {drag = null;});
host.addEventListener('pointercancel', () => {drag = null;});
start().catch(error => {
  console.error(error); $('#loading').hidden = true;
  $('#error').hidden = false; $('#error').textContent = 'הטעינה נכשלה: ' + error.message + '. יש לפתוח דרך שרת HTTP מקומי משורש המאגר.';
  $('#status').textContent = 'הטעינה נכשלה'; window.previewError = error.message;
});
