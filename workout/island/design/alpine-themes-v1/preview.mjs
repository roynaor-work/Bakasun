/* Original preview and minimal uncompressed GLB reader, CC0-1.0.
 * The existing repository Three.js r160 module is reused; no vendored copies.
 */
import * as THREE from '../../../3d/lib/three.module.min.js';

const $ = id => document.getElementById(id);
const number = value => new Intl.NumberFormat('he-IL').format(value);
const manifest = await fetchJSON('manifest.json');
const league = await fetchJSON(manifest.levels);
const cache = new Map();
const textureCache = new Map();
const loader = new THREE.TextureLoader();
const state = { theme: 0, stage: 0, mode: 'course', motion: false, generation: 0, loaded: false, errors: [] };
let renderer;
let scene;
let camera;
let particles;
let modelRoot;
let observedSize = [0, 0];
let frame = 0;
let disposed = false;
const canvas = $('scene');
const viewport = $('viewport');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.json();
}

// Reader deliberately supports only this package's uncompressed, one-mesh GLBs.
// Loaders for arbitrary third-party models are outside the scope of this viewer.
async function glb(path) {
  if (cache.has(path)) return cache.get(path);
  const promise = (async () => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${response.status}: ${path}`);
    const bytes = await response.arrayBuffer();
    const view = new DataView(bytes);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error(`Invalid GLB: ${path}`);
    const jsonLength = view.getUint32(12, true);
    const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)));
    if (doc.extensionsRequired?.length) throw new Error(`Unsupported extension: ${path}`);
    const binStart = 28 + jsonLength;
    const group = new THREE.Group();
    let triangles = 0;
    for (const primitive of doc.meshes[0].primitives) {
      const geometry = new THREE.BufferGeometry();
      for (const [semantic, accessorIndex] of Object.entries(primitive.attributes)) {
        const accessor = doc.accessors[accessorIndex];
        const bufferView = doc.bufferViews[accessor.bufferView];
        const width = accessor.type === 'VEC2' ? 2 : 3;
        const offset = binStart + (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
        const data = new Float32Array(bytes.slice(offset, offset + accessor.count * width * 4));
        geometry.setAttribute({ POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv' }[semantic], new THREE.BufferAttribute(data, width));
      }
      const source = doc.materials[primitive.material];
      const [r, g, b] = source.pbrMetallicRoughness.baseColorFactor;
      const material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(r, g, b), roughness: .93, metalness: 0, side: THREE.DoubleSide });
      if (source.emissiveFactor) {
        material.emissive.setRGB(...source.emissiveFactor);
        material.emissiveIntensity = .55;
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      triangles += geometry.attributes.position.count / 3;
    }
    group.userData.triangles = triangles;
    group.userData.path = path;
    return group;
  })();
  cache.set(path, promise);
  return promise;
}

async function texture(path, repeat = 1) {
  const key = `${path}:${repeat}`;
  if (!textureCache.has(key)) textureCache.set(key, loader.loadAsync(path).then(image => {
    image.colorSpace = THREE.SRGBColorSpace;
    if (repeat !== 1) {
      image.wrapS = image.wrapT = THREE.RepeatWrapping;
      image.repeat.set(repeat, repeat * 5.4);
    }
    image.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return image;
  }));
  return textureCache.get(key);
}

function instance(base, placement = {}) {
  const result = base.clone(true);
  result.position.fromArray(placement.position || [0, 0, 0]);
  result.rotation.y = placement.yaw || 0;
  result.scale.setScalar(placement.scale || 1);
  return result;
}

function freeScene(previous) {
  // GLB geometry/materials and textures are shared and cached. Only scene-owned
  // ground, sprite materials and lighting shadow targets need disposal here.
  previous?.traverse(object => {
    if (object.userData.owned) {
      if (!object.isSprite) object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material?.dispose());
    }
    if (object.isLight) object.shadow?.map?.dispose();
  });
}

function lights(target, theme) {
  const night = theme.id === '04-aurora';
  target.add(new THREE.HemisphereLight(night ? '#d1dfec' : '#fff2d7', '#81949a', night ? 2.2 : 2.5));
  const sun = new THREE.DirectionalLight('#ffe0b4', night ? 1.2 : 2.5);
  sun.position.set(-18, 30, 8);
  sun.target.position.set(0, 0, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 42, bottom: -44, near: 1, far: 120 });
  sun.shadow.bias = -.0004;
  sun.shadow.normalBias = .04;
  target.add(sun, sun.target);
}

function ownMesh(geometry, material) {
  const object = new THREE.Mesh(geometry, material);
  object.userData.owned = true;
  return object;
}

async function buildCourse(target, theme, models, level) {
  const snow = await texture(theme.textures.snow.path, 6);
  const ground = ownMesh(new THREE.PlaneGeometry(640, 1000), new THREE.MeshStandardMaterial({ map: snow, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -.012, -350);
  ground.receiveShadow = true;
  target.add(ground);
  const shoulderMap = await texture(theme.textures['ground-b'].path, 3);
  for (const x of [-36, 36]) {
    const shoulder = ownMesh(new THREE.PlaneGeometry(56, 500), new THREE.MeshStandardMaterial({ map: shoulderMap, roughness: 1 }));
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.set(x, -.007, -200);
    shoulder.receiveShadow = true;
    target.add(shoulder);
  }
  for (const item of [...level.props, ...level.gates, ...level.ramps, ...level.arrows]) target.add(instance(models[item.asset], item));
  target.add(instance(await glb(manifest.referenceSkier), { position: [0, 0, 2.3] }));
  // Pale ski trails provide a sense of direction without text or symbols.
  for (const x of [-.23, .23]) {
    const trail = ownMesh(new THREE.PlaneGeometry(.065, 16), new THREE.MeshBasicMaterial({ color: '#b8cfd2', transparent: true, opacity: .30, depthWrite: false }));
    trail.rotation.x = -Math.PI / 2;
    trail.position.set(x, .005, 11.1);
    target.add(trail);
  }
  const effects = await fetchJSON(theme.effects);
  const flake = await texture(theme.textures.snowflake.path);
  const spark = await texture(theme.textures.sparkle.path);
  const particleGroup = new THREE.Group();
  particleGroup.userData.effects = effects;
  for (let i = 0; i < 32; i++) {
    const sparkle = i % 4 === 0;
    const material = new THREE.SpriteMaterial({ map: sparkle ? spark : flake, color: sparkle ? effects.palette.sparkle : effects.palette.powder, transparent: true, opacity: sparkle ? .42 : .35, depthWrite: false, blending: sparkle ? THREE.AdditiveBlending : THREE.NormalBlending });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(Math.sin(i * 5.71) * 11, .8 + ((i * 1.79) % 7), -4 - ((i * 6.37) % 65));
    sprite.scale.setScalar(sparkle ? .18 : .13);
    sprite.userData.owned = true;
    sprite.userData.phase = i * 2.73;
    particleGroup.add(sprite);
  }
  target.add(particleGroup);
  return particleGroup;
}

async function rebuild() {
  const generation = ++state.generation;
  state.loaded = false;
  $('loading').hidden = false;
  $('loading').textContent = 'מכינים את השלג…';
  $('status').textContent = 'טוענים נכסים מקומיים';
  const theme = manifest.themes[state.theme];
  const level = league.levels[state.theme * 5 + state.stage];
  updateUI(theme, level);
  let next;
  try {
    const entries = await Promise.all(Object.entries(theme.models).map(async ([name, info]) => [name, await glb(info.path)]));
    const models = Object.fromEntries(entries);
    next = new THREE.Scene();
    next.background = await texture(theme.textures.sky.path);
    next.fog = new THREE.Fog(theme.palette.fog, 45, 195);
    lights(next, theme);
    let nextParticles;
    let nextModel;
    const nextCamera = new THREE.PerspectiveCamera(level.camera.fov, 1, .05, 420);
    if (state.mode === 'course') {
      nextParticles = await buildCourse(next, theme, models, level);
      nextCamera.position.fromArray(level.camera.position);
      nextCamera.lookAt(...level.camera.lookAt);
    } else {
      const name = $('asset-select').value || theme.environment[0];
      nextModel = instance(models[name]);
      const box = new THREE.Box3().setFromObject(nextModel);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z) * .85;
      nextModel.position.sub(center);
      next.add(nextModel);
      nextCamera.position.set(radius * 1.4, radius * .85, radius * 2);
      nextCamera.lookAt(0, 0, 0);
      const base = ownMesh(new THREE.CylinderGeometry(radius * 1.05, radius * 1.1, .16, 24), new THREE.MeshStandardMaterial({ color: theme.palette.snow, roughness: 1 }));
      base.position.y = -size.y / 2 - .09;
      base.receiveShadow = true;
      next.add(base);
      const info = theme.models[name];
      $('asset-download').href = info.path;
      $('asset-stats').textContent = `${number(models[name].userData.triangles)} triangles · ${number(info.bytes)} bytes`;
    }
    if (generation !== state.generation) { freeScene(next); return; }
    const old = scene;
    scene = next;
    camera = nextCamera;
    particles = nextParticles;
    modelRoot = nextModel;
    freeScene(old);
    let triangles = 0;
    scene.traverse(object => {
      if (object.isMesh) triangles += object.geometry.index ? object.geometry.index.count / 3 : object.geometry.attributes.position.count / 3;
      if (object.isSprite) triangles += 2;
    });
    $('scene-tris').textContent = number(triangles);
    $('max-tris').textContent = number(Math.max(manifest.referenceSkierInfo.triangles, ...Object.values(models).map(model => model.userData.triangles)));
    $('model-count').textContent = Object.keys(models).length;
    $('status').textContent = 'כל הנכסים נטענו · גאומטריה מקורית';
    state.loaded = true;
    $('loading').hidden = true;
    render();
  } catch (error) {
    if (generation !== state.generation) { freeScene(next); return; }
    freeScene(next);
    state.errors.push(String(error));
    $('loading').textContent = 'טעינת הנכסים נכשלה. יש לפתוח דרך שרת מקומי משורש המאגר.';
    $('status').textContent = String(error);
    console.error(error);
  }
}

function updateUI(theme, level) {
  $('world-title').textContent = theme.name;
  $('world-subtitle').textContent = theme.subtitle;
  $('world-range').textContent = `שלבים ${theme.levelRange[0]}–${theme.levelRange[1]}`;
  $('scene-number').textContent = String(level.id).padStart(2, '0');
  $('view-note').textContent = state.mode === 'course' ? 'מבט מאחורי הגולש' : 'בדיקת מודל · מבט תלת ממדי';
  document.querySelectorAll('[data-theme]').forEach(element => element.setAttribute('aria-pressed', String(+element.dataset.theme === state.theme)));
  $('palette').replaceChildren(...[theme.palette.snow, theme.palette.ground, theme.palette.rock, theme.palette.accent, '#e4856d', '#499c9c'].map(color => {
    const dot = document.createElement('span');
    dot.style.background = color;
    dot.title = color;
    return dot;
  }));
  $('stage-nav').replaceChildren(...Array.from({ length: 5 }, (_, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = theme.levelRange[0] + i;
    button.setAttribute('aria-label', `שלב ${button.textContent}`);
    button.setAttribute('aria-pressed', String(i === state.stage));
    button.addEventListener('click', () => { state.stage = i; rebuild(); });
    return button;
  }));
  const selected = $('asset-select').value;
  $('asset-select').replaceChildren(...Object.entries(theme.models).map(([name, info]) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = `${name} · ${info.triangles} △`;
    return option;
  }));
  if (theme.models[selected]) $('asset-select').value = selected;
  $('swatches').replaceChildren(...[['snow', 'שלג'], ['ground-a', 'קרקע א׳'], ['ground-b', 'קרקע ב׳'], ['snowflake', 'פתית שלג'], ['sparkle', 'נצנוץ'], ['particles', 'אטלס חלקיקים']].map(([key, title]) => {
    const info = theme.textures[key];
    const figure = document.createElement('figure');
    figure.className = 'swatch';
    const anchor = document.createElement('a');
    anchor.href = info.path;
    anchor.download = '';
    const img = document.createElement('img');
    img.src = info.path;
    img.alt = title;
    if (key === 'particles') img.className = 'atlas';
    anchor.append(img);
    const caption = document.createElement('figcaption');
    caption.textContent = title;
    const size = document.createElement('small');
    size.textContent = info.size.join('×');
    caption.append(size);
    figure.append(anchor, caption);
    return figure;
  }));
}

function buildNavigation() {
  manifest.themes.forEach((theme, i) => {
    const choose = () => { state.theme = i; state.stage = 0; rebuild(); };
    const tab = document.createElement('button');
    tab.className = 'theme-tab';
    tab.type = 'button';
    tab.dataset.theme = i;
    const index = document.createElement('span');
    index.className = 'index';
    index.textContent = String(i + 1).padStart(2, '0');
    tab.append(index, document.createTextNode(theme.name));
    tab.addEventListener('click', choose);
    $('theme-nav').append(tab);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.theme = i;
    const picture = document.createElement('div');
    picture.className = 'card-image';
    const img = document.createElement('img');
    img.src = theme.preview;
    img.alt = theme.subtitle;
    img.loading = 'lazy';
    img.addEventListener('error', () => { if (!img.dataset.fallback) { img.dataset.fallback = 'true'; img.src = theme.textures.sky.path; } });
    const range = document.createElement('span');
    range.textContent = `שלבים ${theme.levelRange[0]}–${theme.levelRange[1]}`;
    picture.append(img, range);
    const desc = document.createElement('div');
    desc.className = 'card-description';
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = theme.name;
    const subtitle = document.createElement('small');
    subtitle.textContent = theme.subtitle;
    text.append(title, subtitle);
    const num = document.createElement('b');
    num.textContent = String(i + 1).padStart(2, '0');
    desc.append(text, num);
    card.append(picture, desc);
    card.addEventListener('click', () => { choose(); if (!reducedMotion) viewport.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    $('cards').append(card);
  });
}

function render(time = 0) {
  if (!scene || !camera || disposed) return;
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  if (width !== observedSize[0] || height !== observedSize[1]) {
    renderer.setSize(width, height, false);
    observedSize = [width, height];
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  } else if (camera.aspect !== width / height) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  // Cover the viewport without stretching the sun, clouds or mountain faces.
  const sky = scene.background;
  if (sky?.isTexture && sky.image) {
    const textureAspect = sky.image.width / sky.image.height;
    const screenAspect = width / height;
    const repeatX = Math.min(1, screenAspect / textureAspect);
    const repeatY = Math.min(1, textureAspect / screenAspect);
    sky.repeat.set(repeatX, repeatY);
    sky.offset.set((1 - repeatX) / 2, (1 - repeatY) / 2);
    sky.updateMatrix();
  }
  if (state.motion && particles) particles.children.forEach((sprite, i) => {
    sprite.position.y = .6 + ((7 + i * 1.79 - time * .00022) % 7 + 7) % 7;
    sprite.position.x = Math.sin(i * 5.71) * 11 + Math.sin(time * .00035 + i) * .32;
  });
  if (modelRoot && state.motion) modelRoot.rotation.y = time * .00016;
  renderer.render(scene, camera);
}

function animate(time) {
  if (disposed) return;
  if (state.motion && !document.hidden) render(time);
  frame = requestAnimationFrame(animate);
}

buildNavigation();
$('motion').addEventListener('click', () => {
  state.motion = !state.motion;
  $('motion').setAttribute('aria-pressed', String(state.motion));
  $('motion').textContent = state.motion ? 'השהיית תנועה' : 'הפעלת חלקיקים';
  render();
});
$('mode').addEventListener('click', () => {
  state.mode = state.mode === 'course' ? 'model' : 'course';
  $('mode').setAttribute('aria-pressed', String(state.mode === 'model'));
  $('mode').textContent = state.mode === 'model' ? 'חזרה למסלול' : 'בדיקת מודל';
  $('inspector').hidden = state.mode !== 'model';
  rebuild();
});
$('asset-select').addEventListener('change', rebuild);
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  new ResizeObserver(() => render()).observe(viewport);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    state.loaded = false;
    $('loading').hidden = false;
    $('loading').textContent = 'תצוגת התלת ממד הושהתה. יש לרענן את הדף.';
  });
  await rebuild();
  frame = requestAnimationFrame(animate);
} catch (error) {
  state.errors.push(String(error));
  $('loading').textContent = 'תלת ממד אינו זמין בדפדפן. אפשר לצפות בששת העולמות ובטקסטורות בהמשך הדף.';
  $('status').textContent = 'WebGL אינו זמין';
}
// Read-only diagnostics plus deterministic capture hooks for design review.
window.alpinePreview = {
  get ready() { return state.loaded; },
  get diagnostics() { return { theme: manifest.themes[state.theme].id, stage: state.stage + 1, mode: state.mode, errors: [...state.errors], triangles: Number($('scene-tris').textContent.replace(/\D/g, '')), glbCacheEntries: cache.size }; },
  async select(themeIndex, stageIndex = 0) {
    if (!Number.isInteger(themeIndex) || themeIndex < 0 || themeIndex >= 6 || !Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= 5) throw new RangeError('Theme: 0–5, stage: 0–4');
    state.theme = themeIndex; state.stage = stageIndex; state.mode = 'course';
    $('inspector').hidden = true;
    $('mode').setAttribute('aria-pressed', 'false');
    $('mode').textContent = 'בדיקת מודל';
    await rebuild();
  },
  capture() { render(); return canvas.toDataURL('image/png'); },
};
window.addEventListener('pagehide', event => {
  if (event.persisted) return; // Keep the preview usable after browser Back.
  disposed = true;
  cancelAnimationFrame(frame);
  renderer?.dispose();
});
