// Theme packs for the three-lane ski runner (Codex pack alpine-runner-themes-v2, CC0, runtime copy in
// assets/alpine-runner-themes-v2): per theme eight course tiles with side props, three scrolling backdrop layers,
// weather, and the start and goal arches. Only the chosen theme is fetched (24 files, about 0.65 MB).
// ?alpineThemes=0 turns the packs off: the runner then draws the base tiles and sky it shipped with.
// A pack that fails to load leaves the base look in place; nothing here can stop a run from starting.
import {makeWeather, paintForeground, paintGlow} from './alpine-runner-weather.mjs?v=island-v2-20261107-23';

const PACK = new URL('../assets/alpine-runner-themes-v2/', import.meta.url);
/** Runner theme id -> pack theme id. */
export const THEME_PACKS = Object.freeze({
  '01-pine': 'forest', '02-ice': 'ice', '03-volcano': 'frozen-lava', '04-aurora': 'aurora', '05-village': 'village', '06-summit': 'summit',
});
const REFERENCE_WIDTH = 844;
/** The start arch stands a little ahead of the skier, so the first frame of a run shows it whole. */
export const START_SIGN_M = 12;

export {alpineThemesEnabled} from './alpine-runner-rules.mjs?v=island-v2-20261107-23';

/** Backdrop scroll of one layer in texture space: the picture is stretched to the full height and repeats sideways. */
export function layerWindow(layer, width, height, distance, cameraX) {
  const tileWidth = Math.max(Math.round(width * 1.17), Math.round(height * layer.width / layer.height));
  const offset = (tileWidth - width) / 2 + (distance * layer.pixelsPerMeter + cameraX * layer.cameraOffsetFactor) * width / REFERENCE_WIDTH;
  const start = offset / tileWidth;
  return {repeat: width / tileWidth, offset: start - Math.floor(start)};
}

let catalogue;
async function loadCatalogue() {
  catalogue ??= fetch(new URL('themes.json', PACK)).then(response => {
    if (!response.ok) throw new Error('alpine.runner.themes.' + response.status);
    return response.json();
  }).catch(error => { catalogue = undefined; throw error; });
  return catalogue;
}

/** One geometry with position, normal and colour for a loaded model; vertex colours are kept (the pack paints with them). */
function bakeParts(THREE, model, matrix, out) {
  model.updateMatrixWorld(true);
  model.traverse(object => {
    if (!object.isMesh) return;
    // The pack's models keep position, normal and colour interleaved in one buffer, which cannot be merged: copy them out.
    const source = object.geometry, {position, normal, color: paint} = source.attributes, count = position.count;
    const {color, emissive, emissiveIntensity = 1} = object.material;
    const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.getX(i); positions[i * 3 + 1] = position.getY(i); positions[i * 3 + 2] = position.getZ(i);
      if (normal) { normals[i * 3] = normal.getX(i); normals[i * 3 + 1] = normal.getY(i); normals[i * 3 + 2] = normal.getZ(i); }
      colors[i * 3] = (paint ? paint.getX(i) : 1) * color.r + (emissive?.r ?? 0) * emissiveIntensity;
      colors[i * 3 + 1] = (paint ? paint.getY(i) : 1) * color.g + (emissive?.g ?? 0) * emissiveIntensity;
      colors[i * 3 + 2] = (paint ? paint.getZ(i) : 1) * color.b + (emissive?.b ?? 0) * emissiveIntensity;
    }
    const part = new THREE.BufferGeometry();
    part.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    part.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    part.setIndex(source.index ? Array.from(source.index.array) : Array.from({length: count}, (_, i) => i));
    if (!normal) part.computeVertexNormals();
    part.applyMatrix4(object.matrixWorld);
    if (matrix) part.applyMatrix4(matrix);
    out.push(part);
  });
}

function releaseModel(gltf) {
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    for (const material of [object.material].flat()) material.dispose();
  });
}

/**
 * Loads one theme: `terrain` (tile id -> Mesh template with its props merged in, one draw call a tile), `signs`,
 * `layers` (backdrop textures) and the weather spec. Rejects when any file is missing, so a half theme is never shown.
 */
export async function loadThemePack({THREE, GLTFLoader, mergeGeometries, runnerTheme, material, isDisposed = () => false}) {
  const id = THEME_PACKS[runnerTheme];
  if (!id) throw new Error('alpine.runner.themes.unknown');
  const spec = (await loadCatalogue()).themes[id];
  if (!spec) throw new Error('alpine.runner.themes.missing');
  const models = new GLTFLoader(), textures = new THREE.TextureLoader();
  const paths = [...Object.values(spec.tiles), ...Object.values(spec.props), ...Object.values(spec.signs)].map(item => item.path);
  const [loadedModels, loadedLayers] = await Promise.all([
    Promise.allSettled(paths.map(path => models.loadAsync(new URL(path, PACK).href))),
    Promise.allSettled(spec.parallax.map(layer => textures.loadAsync(new URL(layer.path, PACK).href))),
  ]);
  const good = loadedModels.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const layerTextures = loadedLayers.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const failure = [...loadedModels, ...loadedLayers].find(result => result.status === 'rejected');
  if (failure || isDisposed()) {
    good.forEach(releaseModel);
    layerTextures.forEach(texture => texture.dispose());
    throw failure?.reason ?? Object.assign(new Error('alpine.runner.disposed'), {disposed: true});
  }
  const byPath = new Map(paths.map((path, i) => [path, loadedModels[i].value.scene]));
  const owned = [], transform = new THREE.Object3D();
  const merged = parts => {
    const geometry = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    if (!geometry) throw new Error('alpine.runner.themes.geometry');
    owned.push(geometry);
    return new THREE.Mesh(geometry, material);
  };
  let terrain, signs;
  try {
    terrain = Object.fromEntries(Object.entries(spec.tiles).map(([type, tile]) => {
      const parts = [];
      bakeParts(THREE, byPath.get(tile.path), null, parts);
      for (const [prop, x, y, z, yaw] of tile.placements) {
        transform.position.set(x, y, z);
        transform.rotation.set(0, yaw, 0);
        transform.updateMatrix();
        bakeParts(THREE, byPath.get(spec.props[prop].path), transform.matrix, parts);
      }
      return [type, merged(parts)];
    }));
    signs = Object.fromEntries(Object.entries(spec.signs).map(([key, sign]) => {
      const parts = [];
      bakeParts(THREE, byPath.get(sign.path), null, parts);
      const mesh = merged(parts);
      mesh.userData.lift = sign.y;
      return [key, mesh];
    }));
  } finally {
    good.forEach(releaseModel);
  }
  for (const texture of layerTextures) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
  }
  const triangles = Object.fromEntries(Object.entries(terrain).map(([type, mesh]) => [type, mesh.geometry.index.count / 3]));
  return {
    id, title: spec.title, lighting: spec.lighting, terrain, signs, triangles,
    layers: spec.parallax.map((layer, i) => ({...layer, texture: layerTextures[i]})),
    weather: makeWeather(spec.weather), weatherName: spec.weatherName,
    dispose() {
      owned.forEach(geometry => geometry.dispose());
      layerTextures.forEach(texture => texture.dispose());
    },
  };
}

const BACKDROP_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  // The far plane: only pixels the course left empty are shaded.
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;
const BACKDROP_FRAGMENT = `
uniform sampler2D tSky, tGlow, tRidges, tHills;
uniform vec2 uSky, uRidges, uHills;
uniform float uGlow;
varying vec2 vUv;
void main() {
  vec3 colour = texture2D(tSky, vec2(vUv.x * uSky.x + uSky.y, vUv.y)).rgb;
  vec4 glow = texture2D(tGlow, vUv);
  colour += glow.rgb * glow.a * uGlow;
  vec4 ridges = texture2D(tRidges, vec2(vUv.x * uRidges.x + uRidges.y, vUv.y));
  colour = mix(colour, ridges.rgb, ridges.a);
  vec4 hills = texture2D(tHills, vec2(vUv.x * uHills.x + uHills.y, vUv.y));
  colour = mix(colour, hills.rgb, hills.a);
  gl_FragColor = vec4(colour, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * The backdrop (sky, aurora, ridges and foothills, composed in one shader on one quad that is drawn behind the
 * course) and the weather canvas above the course. `host` is the game stage, `canvas` the WebGL canvas; the weather
 * canvas sits right above it. The backdrop costs one draw call, and only where the course leaves the sky open: three
 * blended full-screen layers halved the frame rate on a software renderer (60 -> 38 a second), this does not.
 */
export function createThemeStage({THREE, scene, canvas}) {
  const quad = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    tSky: {value: null}, tGlow: {value: null}, tRidges: {value: null}, tHills: {value: null},
    uSky: {value: new THREE.Vector2(1, 0)}, uRidges: {value: new THREE.Vector2(1, 0)}, uHills: {value: new THREE.Vector2(1, 0)}, uGlow: {value: 0},
  };
  const material = new THREE.ShaderMaterial({uniforms, vertexShader: BACKDROP_VERTEX, fragmentShader: BACKDROP_FRAGMENT,
    depthWrite: false, depthFunc: THREE.LessEqualDepth, fog: false, toneMapped: false});
  const backdrop = new THREE.Mesh(quad, material);
  backdrop.frustumCulled = false;
  // After every solid object of the course, before the see-through ones (shadow, shield, powder).
  backdrop.renderOrder = 1000;
  backdrop.visible = false;
  scene.add(backdrop);
  const slots = {sky: ['tSky', 'uSky'], ridges: ['tRidges', 'uRidges'], foothills: ['tHills', 'uHills']};
  const doc = canvas.ownerDocument;
  const glowCanvas = doc.createElement('canvas');
  glowCanvas.width = 256; glowCanvas.height = 96;
  const glowContext = glowCanvas.getContext('2d');
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  glowTexture.generateMipmaps = false;
  glowTexture.minFilter = THREE.LinearFilter;
  uniforms.tGlow.value = glowTexture;
  const overlay = doc.createElement('canvas');
  overlay.className = 'alpine-runner-weather';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  canvas.after(overlay);
  const overlayContext = overlay.getContext('2d');
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let pack = null, width = 1, height = 1, quality = 'high', clock = 0, lastAt, glowAt = -Infinity, overlayAt = -Infinity, painted = 0;

  function fitOverlay() {
    if (!overlayContext || !pack) return;
    // Mist is soft: a small canvas stretched by the browser costs a fraction of a full-size one.
    const scale = pack.weather.kind === 'fog' ? .3 : Math.min(globalThis.devicePixelRatio || 1, quality === 'low' ? .75 : 1.25);
    overlay.width = Math.max(1, Math.round(width * scale));
    overlay.height = Math.max(1, Math.round(height * scale));
    overlayContext.setTransform(overlay.width / width, 0, 0, overlay.height / height, 0, 0);
    overlayAt = -Infinity;
  }

  return {
    get active() { return Boolean(pack); },
    setPack(next) {
      pack = next;
      backdrop.visible = Boolean(pack);
      for (const layer of pack?.layers ?? []) uniforms[slots[layer.id][0]].value = layer.texture;
      uniforms.uGlow.value = pack?.weather.kind === 'glow' ? 1 : 0;
      overlay.hidden = !pack || pack.weather.kind === 'glow' || !overlayContext;
      glowAt = overlayAt = -Infinity;
      fitOverlay();
    },
    resize(w, h) { width = w; height = h; fitOverlay(); },
    setQuality(value) { quality = value; fitOverlay(); },
    /** Moves the backdrop and paints the weather for the frame the caller is about to render. */
    update(distance, cameraX, at = performance.now()) {
      if (!pack) return;
      if (!reducedMotion && lastAt !== undefined) clock += Math.max(0, Math.min(.1, (at - lastAt) / 1000));
      lastAt = at;
      for (const layer of pack.layers) {
        const view = layerWindow(layer, width, height, distance, cameraX);
        uniforms[slots[layer.id][1]].value.set(view.repeat, view.offset);
      }
      const weather = pack.weather;
      if (weather.kind === 'glow' && clock - glowAt >= (quality === 'low' ? .2 : .1)) {
        glowAt = clock;
        glowContext.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
        paintGlow(glowContext, glowCanvas.width, glowCanvas.height, weather, clock);
        glowTexture.needsUpdate = true;
      }
      if (!overlay.hidden && clock - overlayAt >= (weather.kind === 'fog' ? (quality === 'low' ? .1 : .066) : .033)) {
        overlayAt = clock;
        overlayContext.clearRect(0, 0, width, height);
        paintForeground(overlayContext, width, height, weather, clock);
        painted++;
      }
    },
    metrics: () => ({pack: pack?.id ?? null, weather: pack?.weather.kind ?? null, weatherFrames: painted, overlay: [overlay.width, overlay.height]}),
    dispose() {
      overlay.remove();
      scene.remove(backdrop);
      quad.dispose();
      glowTexture.dispose();
      material.dispose();
    },
  };
}
