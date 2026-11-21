import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {alpineThemesEnabled, createThemeStage, loadThemePack, START_SIGN_M} from './alpine-runner-themes.mjs?v=island-v2-20261107-21';

const ASSETS = new URL('../assets/alpine-runner/', import.meta.url);
const SKIER = 'runner/characters/skier-coral.glb';
const TILE_LENGTH = 30;
const LANE_WIDTH = 2.4;
const TILE_SEQUENCE = ['forest', 'gentle_turn', 'bridge', 'ice_tunnel', 'slope', 'village', 'forest', 'summit'];
const MAX_VISIBLE_EVENTS = 144;
const TILE_COUNT = 6;
const PACK_WAIT_MS = 9000;
const THEMES = {
  '01-pine': {fog: '#d7e4d9', bank: '#dce8e2', light: '#fff1dc', sky: '#b8d1d4'},
  '02-ice': {fog: '#a8d4e3', bank: '#d0eaf4', light: '#deefff', sky: '#a8d4e3'},
  '03-volcano': {fog: '#b9aab8', bank: '#d1c9d5', light: '#ffdbc3', sky: '#b9aab8'},
  '04-aurora': {fog: '#758fa6', bank: '#a4bace', light: '#bfdaff', sky: '#758fa6'},
  '05-village': {fog: '#e9dfcd', bank: '#eae4d8', light: '#ffe8ca', sky: '#e9dfcd'},
  '06-summit': {fog: '#cbdde4', bank: '#dcebf0', light: '#eff4ff', sky: '#cbdde4'},
};
const PROP_MODELS = {
  block: 'content/models/boulder.glb',
  jump: 'runner/props/low_fence.glb',
  slide: 'runner/props/high_beam.glb',
  coin: 'runner/props/coin.glb',
  shield: 'runner/props/shield.glb',
  magnet: 'runner/props/magnet.glb',
  double: 'content/models/double-coin.glb',
};
const PICKUPS = new Set(['coin', 'shield', 'magnet', 'double']);

export const ALPINE_RUNNER_TRIANGLE_BUDGET = Object.freeze({low: 60_000, high: 100_000});

function tileType(index) {
  return index < 0 ? 'straight' : TILE_SEQUENCE[index % TILE_SEQUENCE.length];
}

function tileSurface(type, z) {
  // The two non-flat source tiles have C1 ports at the same position and grade.
  const angle = Math.PI * z / TILE_LENGTH;
  const wave = Math.sin(angle) ** 2;
  const slope = Math.PI / TILE_LENGTH * Math.sin(2 * angle);
  return {
    x: type === 'gentle_turn' ? 1.2 * wave : 0,
    y: type === 'slope' ? 1.5 * wave : 0,
    yaw: type === 'gentle_turn' ? Math.atan(1.2 * slope) : 0,
    pitch: type === 'slope' ? -Math.atan(1.5 * slope) : 0,
  };
}

function surfaceAt(distance) {
  const tile = Math.floor(distance / TILE_LENGTH);
  return tileSurface(tileType(tile), distance - tile * TILE_LENGTH);
}

function shoulderGeometry(type) {
  const positions = [], indices = [];
  const flank = [5.55, 7, 11, 21, 45];
  const profile = [.34, .58, 1.05, .4, -6];
  const columns = flank.length;
  const rows = 7;
  for (const side of [-1, 1]) {
    const start = positions.length / 3;
    for (let row = 0; row < rows; row++) {
      const z = row / (rows - 1) * TILE_LENGTH;
      const axis = tileSurface(type, z);
      const gap = type === 'bridge' ? 6 * Math.sin(Math.PI * z / TILE_LENGTH) : 0;
      flank.forEach((x, col) => {
        positions.push(axis.x + side * x, axis.y + profile[col] - gap, z);
      });
    }
    for (let row = 1; row < rows; row++) {
      for (let col = 1; col < columns; col++) {
        const d = start + row * columns + col;
        const a = d - columns - 1, b = d - columns, c = d - 1;
        if (side > 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function disposeModels(models) {
  const geometries = new Set();
  const materials = new Set();
  for (const {scene} of models) {
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        for (const material of [object.material].flat()) materials.add(material);
      }
      if (object.isSkinnedMesh) object.skeleton.dispose();
    });
  }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

async function loadAssets(isDisposed) {
  const modelLoader = new GLTFLoader(), textureLoader = new THREE.TextureLoader();
  const paths = [SKIER, ...Object.values(PROP_MODELS), ...new Set(['straight', ...TILE_SEQUENCE])].map(
    path => path.endsWith('.glb') ? path : `runner/tiles/${path}.glb`,
  );
  const loadTexture = async path => {
    const texture = await textureLoader.loadAsync(new URL(path, ASSETS).href);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  };
  const [models, textures] = await Promise.all([
    Promise.allSettled(paths.map(path => modelLoader.loadAsync(new URL(path, ASSETS).href))),
    Promise.allSettled([
      ...Object.keys(THEMES).map(theme => loadTexture(`themes/${theme}/textures/sky.png`)),
      loadTexture('content/effects/powder-particle.png'),
    ]),
  ]);
  const failure = models.find(result => result.status === 'rejected');
  if (failure || isDisposed()) {
    disposeModels(models.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
    textures.forEach(result => result.value?.dispose());
    throw failure?.reason ?? Object.assign(new Error('alpine.runner.disposed'), {disposed: true});
  }
  const skies = Object.fromEntries(Object.keys(THEMES).map((id, i) => [id, textures[i].value ?? null]));
  return {
    models: Object.fromEntries(paths.map((path, i) => [path, models[i].value])),
    skies,
    powder: textures.at(-1).value ?? null,
    missingTextures: textures.filter(result => result.status === 'rejected').length,
  };
}

function bakeScenery(model, material) {
  model.updateMatrixWorld(true);
  const geometries = [];
  model.traverse(object => {
    if (!object.isMesh) return;
    const source = object.geometry;
    const part = source.clone().applyMatrix4(object.matrixWorld);
    for (const attribute of Object.keys(part.attributes)) {
      if (attribute !== 'position' && attribute !== 'normal') part.deleteAttribute(attribute);
    }
    if (!part.index) part.setIndex(Array.from({length: part.attributes.position.count}, (_, i) => i));
    const color = object.material.color;
    const tint = object.material.emissive, strength = object.material.emissiveIntensity * .35;
    const colors = new Float32Array(part.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = color.r + tint.r * strength;
      colors[i + 1] = color.g + tint.g * strength;
      colors[i + 2] = color.b + tint.b * strength;
    }
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometries.push(part);
  });
  const combined = mergeGeometries(geometries);
  geometries.forEach(geometry => geometry.dispose());
  if (!combined) throw new Error('alpine.runner.scenery.geometry');
  return new THREE.Mesh(combined, material);
}

function createPropPool(scene, template) {
  const instances = new THREE.InstancedMesh(template.geometry, template.material, MAX_VISIBLE_EVENTS);
  instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  instances.count = 0;
  instances.frustumCulled = false;
  scene.add(instances);
  return {instances, count: 0};
}

function createRiderAnimation(gltf) {
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const root = gltf.scene.getObjectByName('Root');
  const actions = new Map(gltf.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
  let current, lane = 1, laneStart = -1, laneClip, previous = 0;
  return {
    render(snapshot) {
      const elapsed = snapshot.elapsed ?? 0;
      const delta = Math.max(0, Math.min(.1, elapsed - previous));
      if (elapsed < previous) {
        laneStart = -1;
        lane = snapshot.lane;
      }
      previous = elapsed;
      if (snapshot.lane !== lane) {
        laneClip = snapshot.lane < lane ? 'lane_left' : 'lane_right';
        laneStart = elapsed;
        lane = snapshot.lane;
      }
      let clip = 'glide', time = elapsed % 1.2;
      if (snapshot.status === 'crashed') {
        clip = 'fall_forward';
        time = .65;
      } else if (snapshot.stance === 'jump') {
        // Sample the authored poses in sequence. World height comes from the simulation.
        const t = snapshot.jumpProgress ?? 0;
        clip = t < .3 ? 'jump_rise' : t < .6 ? 'jump_apex' : 'jump_land';
        time = t < .3 ? t : t < .6 ? t - .3 : t - .6;
      } else if (snapshot.sliding) {
        clip = 'slide';
        // A slide becomes effective immediately. Sample the source clip's crouched hold.
        time = .2 + .4 * (snapshot.slideProgress ?? 0);
      } else if (elapsed < laneStart + .4) {
        clip = laneClip;
        time = elapsed - laneStart;
      }
      const next = actions.get(clip) ?? actions.get('glide');
      if (!next) return;
      if (current !== next) {
        current?.stop();
        current = next.reset().play();
        current.paused = true;
      }
      current.time = time;
      mixer.update(delta);
      if (snapshot.stance === 'jump' && root) root.position.y = 0;
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(gltf.scene);
    },
  };
}

export async function createAlpineRunnerView(host, {
  canvas, quality: initialQuality = 'high', theme: initialTheme = '01-pine', isDisposed = () => false,
  themes: themePacks = alpineThemesEnabled(), goal = 0,
} = {}) {
  if (!host || !canvas) throw new TypeError('alpine.runner.canvas');
  const {models, skies, powder, missingTextures} = await loadAssets(isDisposed);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance'});
  } catch (error) {
    disposeModels(Object.values(models));
    for (const texture of [...Object.values(skies), powder]) texture?.dispose();
    throw error;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.11;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(54, 1, .1, 185);
  const hemi = new THREE.HemisphereLight('#effcff', '#557c92', 2.4);
  const sun = new THREE.DirectionalLight('#fff1dc', 2.7);
  sun.position.set(-10, 18, -8);
  scene.add(hemi, sun);
  const fog = new THREE.Fog('#d7e4d9', 32, 112);
  scene.fog = fog;
  // Theme packs (alpine-runner-themes.mjs): a second light from the side, the backdrop quad and the weather canvas.
  const rim = new THREE.DirectionalLight('#bee2ed', 0);
  rim.position.set(-8, 4, 9);
  scene.add(rim);
  const themeStage = themePacks ? createThemeStage({THREE, scene, canvas}) : null;

  const owned = [];
  const own = object => (owned.push(object), object);
  const bankMaterial = own(new THREE.MeshLambertMaterial({color: '#dce8e2'}));
  const sceneryMaterial = own(new THREE.MeshLambertMaterial({vertexColors: true}));
  const baked = path => {
    const mesh = bakeScenery(models[path].scene, sceneryMaterial);
    own(mesh.geometry);
    return mesh;
  };
  const terrain = Object.fromEntries([...new Set(['straight', ...TILE_SEQUENCE])].map(type => {
    const template = baked(`runner/tiles/${type}.glb`);
    template.add(new THREE.Mesh(own(shoulderGeometry(type)), bankMaterial));
    return [type, template];
  }));
  const slots = Array.from({length: TILE_COUNT}, () => ({tile: null, model: null}));
  let ground = terrain, pack = null, themeRequest = 0, packFailures = 0;
  const signs = [];
  const props = Object.fromEntries(Object.entries(PROP_MODELS).map(([kind, path]) => [
    kind, createPropPool(scene, baked(path)),
  ]));
  const rider = models[SKIER];
  delete models[SKIER];
  disposeModels(Object.values(models));

  const player = new THREE.Group();
  player.add(rider.scene);
  scene.add(player);
  const animation = createRiderAnimation(rider);
  const shadow = new THREE.Mesh(
    own(new THREE.CircleGeometry(.77, 16)),
    own(new THREE.MeshBasicMaterial({color: '#3a6480', transparent: true, opacity: .24, depthWrite: false})),
  );
  scene.add(shadow);
  const shield = new THREE.Mesh(
    own(new THREE.SphereGeometry(1.08, 12, 8)),
    own(new THREE.MeshBasicMaterial({color: '#46e1e0', transparent: true, opacity: .17, wireframe: true, depthWrite: false})),
  );
  shield.position.y = .85;
  player.add(shield);

  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const sprayCount = 28;
  const sprayPositions = new Float32Array(sprayCount * 3);
  const sprayGeometry = own(new THREE.BufferGeometry());
  const sprayAttribute = new THREE.BufferAttribute(sprayPositions, 3).setUsage(THREE.DynamicDrawUsage);
  sprayGeometry.setAttribute('position', sprayAttribute);
  const spray = new THREE.Points(sprayGeometry, own(new THREE.PointsMaterial({
    map: powder, size: .38, transparent: true, opacity: .74, depthWrite: false,
  })));
  spray.frustumCulled = false;
  scene.add(spray);

  let quality = initialQuality;
  let theme = initialTheme;
  let width = 1, height = 1;
  let disposed = false, observer;
  let last = {triangles: 0, calls: 0, points: 0, tiles: 0, visibleEvents: 0};
  const mobile = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  const transform = new THREE.Object3D();
  const propPools = Object.values(props);

  function fitSky() {
    const texture = scene.background;
    if (!texture?.isTexture) return;
    const aspect = camera.aspect;
    const textureAspect = texture.image.width / texture.image.height;
    const x = Math.min(1, aspect / textureAspect), y = Math.min(1, textureAspect / aspect);
    texture.repeat.set(x, y);
    texture.offset.set((1 - x) / 2, (1 - y) / 2);
    texture.updateMatrix();
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    themeStage?.resize(width, height);
    camera.aspect = width / height;
    camera.fov = camera.aspect < .8 ? 60 : 51;
    camera.updateProjectionMatrix();
    fitSky();
  }

  function setQuality(value) {
    quality = value === 'low' ? 'low' : 'high';
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, quality === 'low' ? .8 : mobile ? 1.1 : 1.5));
    themeStage?.setQuality(quality);
    resize();
  }

  function resetTiles() {
    for (const slot of slots) {
      if (slot.model) scene.remove(slot.model);
      slot.tile = slot.model = null;
    }
  }

  /** The look the runner shipped with: base tiles with snow banks, one sky picture, three colours. */
  function baseLook() {
    const look = THEMES[theme];
    scene.background = skies[theme] ?? new THREE.Color(look.sky);
    fog.color.set(look.fog);
    bankMaterial.color.set(look.bank);
    hemi.color.set('#effcff');
    hemi.groundColor.set('#557c92');
    hemi.intensity = 2.4;
    sun.color.set(look.light);
    sun.intensity = theme === '04-aurora' ? 1.7 : 2.7;
    rim.intensity = 0;
    fitSky();
  }

  function usePack(next) {
    for (const sign of signs.splice(0)) scene.remove(sign);
    pack?.dispose();
    pack = next;
    themeStage?.setPack(pack);
    ground = pack ? pack.terrain : terrain;
    resetTiles();
    if (!pack) { baseLook(); return; }
    const night = pack.id === 'aurora', light = pack.lighting;
    scene.background = null;
    hemi.color.set(light.sky);
    hemi.groundColor.set(light.ground);
    hemi.intensity = night ? 1.48 : 2.03;
    sun.color.set(light.sun);
    sun.intensity = night ? 1.46 : 2.35;
    rim.color.set(light.rim);
    rim.intensity = night ? 1.06 : .73;
    fog.color.set(light.fog);
    for (const [key, at] of [['start', START_SIGN_M], ['finish', goal]]) {
      if (!(at > 0) || !pack.signs[key]) continue;
      const sign = pack.signs[key];
      sign.userData.at = at;
      sign.visible = false;
      scene.add(sign);
      signs.push(sign);
    }
  }

  /** Resolves when the theme is on screen. A pack that cannot load leaves the base look of that theme. */
  function setTheme(value) {
    const next = Object.hasOwn(THEMES, value) ? value : '01-pine';
    if (pack && next === theme && pack.runnerTheme === next) return Promise.resolve(true);
    theme = next;
    if (!themeStage) { baseLook(); return Promise.resolve(false); }
    const request = ++themeRequest;
    const failed = () => {
      if (disposed || request !== themeRequest) return false;
      themeRequest++;
      packFailures++;
      usePack(null);
      return false;
    };
    // A pack that is slow to arrive must not hold the game: after PACK_WAIT_MS the base look is used and the late pack is dropped.
    let waiting;
    const slow = new Promise(resolve => { waiting = setTimeout(() => resolve(failed()), PACK_WAIT_MS); });
    const load = loadThemePack({THREE, GLTFLoader, mergeGeometries, runnerTheme: theme, material: sceneryMaterial, isDisposed: () => disposed || isDisposed()}).then(loaded => {
      if (disposed || request !== themeRequest) { loaded.dispose(); return false; }
      loaded.runnerTheme = theme;
      usePack(loaded);
      return true;
    }, failed).finally(() => clearTimeout(waiting));
    return Promise.race([load, slow]);
  }

  function release() {
    observer?.disconnect();
    animation.dispose();
    for (const {instances} of propPools) instances.dispose();
    disposeModels([rider]);
    pack?.dispose();
    themeStage?.dispose();
    for (const resource of owned) resource.dispose();
    for (const texture of [...Object.values(skies), powder]) texture?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  setQuality(initialQuality);
  // The first theme is on screen before the menu enables "start", so a run never opens on the base look and then changes.
  await setTheme(initialTheme);
  if (isDisposed()) {
    disposed = true;
    release();
    throw Object.assign(new Error('alpine.runner.disposed'), {disposed: true});
  }
  observer = new ResizeObserver(resize);
  observer.observe(host);

  function syncTiles(distance) {
    const first = Math.floor(distance / TILE_LENGTH) - 1;
    for (let i = first; i < first + TILE_COUNT; i++) {
      const slot = slots[(i + TILE_COUNT) % TILE_COUNT];
      if (slot.tile !== i) {
        if (slot.model) scene.remove(slot.model);
        slot.tile = i;
        slot.model = ground[tileType(i)].clone(true);
        scene.add(slot.model);
      }
      slot.model.position.z = i * TILE_LENGTH - distance;
    }
  }

  function syncProps(events, distance, elapsed) {
    const reach = quality === 'low' ? 94 : 116;
    let rendered = 0;
    for (const pool of propPools) pool.count = 0;
    for (const event of events) {
      const z = event.distance - distance;
      const pool = props[event.kind];
      if (!pool || z < -3 || z > reach) continue;
      const ground = surfaceAt(event.distance);
      transform.position.set(ground.x + (1 - event.lane) * LANE_WIDTH, ground.y, z);
      transform.rotation.set(ground.pitch, ground.yaw, 0, 'YXZ');
      transform.scale.setScalar(1);
      if (event.kind === 'jump') transform.scale.y = .4;
      if (PICKUPS.has(event.kind)) {
        transform.position.y += .8 + .1 * Math.sin(elapsed * 3 + event.distance);
        transform.rotation.y += elapsed * 2.3 + event.distance * .09;
      }
      transform.updateMatrix();
      pool.instances.setMatrixAt(pool.count, transform.matrix);
      pool.count++;
      rendered++;
      if (rendered >= MAX_VISIBLE_EVENTS) break;
    }
    for (const {instances, count} of propPools) {
      instances.count = count;
      if (count > 0) instances.instanceMatrix.needsUpdate = true;
    }
    return rendered;
  }

  function syncSigns(distance) {
    let triangles = 0;
    for (const sign of signs) {
      const z = sign.userData.at - distance;
      // Hidden once it is behind the skier: the camera rides 6.5 m back (more in portrait) and must not look at its banner from inside.
      sign.visible = z > -3 && z < 118;
      if (!sign.visible) continue;
      const at = surfaceAt(sign.userData.at);
      sign.position.set(at.x, at.y + sign.userData.lift, z);
      sign.rotation.set(at.pitch, at.yaw, 0, 'YXZ');
      triangles += sign.geometry.index.count / 3;
    }
    return triangles;
  }

  function syncSpray(snapshot) {
    spray.visible = !reducedMotion && snapshot.status === 'running' && snapshot.speed > 0 && !snapshot.jumpHeight;
    if (!spray.visible) return;
    const n = quality === 'low' ? 14 : sprayCount;
    sprayGeometry.setDrawRange(0, n);
    for (let i = 0; i < n; i++) {
      const age = (snapshot.elapsed * 2.6 + i / n) % 1;
      const t = i * 12.27;
      const j = i * 3;
      sprayPositions[j] = player.position.x + Math.sin(t) * (.24 + age * .67);
      sprayPositions[j + 1] = player.position.y + .08 + age * .3;
      sprayPositions[j + 2] = -age * 3.3 - .45;
    }
    sprayAttribute.needsUpdate = true;
  }

  function render(snapshot) {
    if (disposed) return;
    const distance = snapshot.distance ?? 0;
    const ground = surfaceAt(distance);
    const laneX = (1 - (snapshot.lanePosition ?? 1)) * LANE_WIDTH;
    player.position.set(ground.x + laneX, ground.y + (snapshot.jumpHeight ?? 0), 0);
    player.rotation.set(ground.pitch, ground.yaw, 0, 'YXZ');
    animation.render(snapshot);
    shield.visible = Boolean(snapshot.powerups?.shield);
    shadow.position.set(player.position.x, ground.y + .026, 0);
    shadow.rotation.set(-Math.PI / 2 + ground.pitch, 0, -ground.yaw);
    shadow.material.opacity = .24 / (1 + (snapshot.jumpHeight ?? 0));
    syncTiles(distance);
    const visibleEvents = syncProps(snapshot.nextEvents ?? [], distance, snapshot.elapsed ?? 0);
    syncSigns(distance);
    syncSpray(snapshot);
    const portrait = camera.aspect < .8;
    const cameraDistance = portrait ? Math.max(9.2, 4.8 / camera.aspect) : 6.5;
    const ahead = surfaceAt(distance + 13);
    camera.position.set(ground.x + laneX * .23, ground.y + (portrait ? 4.2 : 3.5), -cameraDistance);
    camera.lookAt(ahead.x, ahead.y + .9, 13);
    if (pack) themeStage.update(distance, camera.position.x);
    renderer.render(scene, camera);
    const {triangles, calls, points} = renderer.info.render;
    last = {triangles, calls, points, tiles: TILE_COUNT, visibleEvents};
  }

  return {
    mode: 'webgl',
    render,
    setQuality,
    setTheme,
    metrics: () => ({
      ...last, quality, theme, width, height, pixelRatio: renderer.getPixelRatio(),
      triangleBudget: ALPINE_RUNNER_TRIANGLE_BUDGET[quality], missingTextures,
      themePack: pack?.id ?? null, themePackFailures: packFailures, ...(themeStage ? {themeStage: themeStage.metrics()} : {}),
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
    },
  };
}
