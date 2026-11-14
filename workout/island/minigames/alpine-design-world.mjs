import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {AlpineDracoLoader as DRACOLoader} from './alpine-draco.mjs';
import {mergeGeometries, mergeVertices} from '../vendor/BufferGeometryUtils.js';
import {surfaceHeight} from './alpine-track.mjs';

const asset = path => new URL(path, import.meta.url).href;
const MODELS = ['fir-a', 'fir-b', 'fir-c', 'rock', 'slalom-gate', 'ski-slope', 'fence'];
// GPT/Codex alpine-world pack (design/alpine-world). Every file is optional: a missing or broken one only means the
// earlier procedural/authored look stays for that element, it never fails the world.
const PACK = ['rock-small', 'rock-large', 'snow-sign', 'mogul', 'ice-wall', 'start-gate', 'finish-gate'];

/** One decode per model, one merged geometry per prop. All geometry is authored
 * design data; this adapter changes placement only and never creates colliders. */
export async function loadAlpineWorld({isDisposed = () => false, skipBackgrounds = false, assets = null} = {}) {
  const decoder = new DRACOLoader().setDecoderPath(asset('../vendor/draco/')).setDecoderConfig({type: 'wasm'}).setWorkerLimit(2);
  const loader = new GLTFLoader().setDRACOLoader(decoder), textureLoader = new T.TextureLoader();
  // Ski league v23: a theme may name other files for the same ids (minigames/alpine-league-theme.mjs, ALPINE_THEME_ASSETS, paths from the
  // island root; an entry is a path or {path, ...fit}). An override that fails falls back to the shipped file; without `assets` every path
  // is the shipped one, as before. A model that came from the theme is marked (gltf.themeAsset): it has no vertex colours, so its
  // material colours (and glow) are baked into the merged geometry, and fits named in its entry apply to it only.
  const pathOf = entry => typeof entry === 'string' ? entry : entry?.path || null;
  const pick = (group, id, fallback) => { const p = pathOf(assets?.[group]?.[id]); return p && '../' + p !== fallback ? '../' + p : null; };
  const themed = gltf => Object.assign(gltf, {themeAsset: true});
  const loadModel = (group, id, fallback) => { const o = pick(group, id, fallback); return o ? loader.loadAsync(asset(o)).then(themed).catch(() => loader.loadAsync(asset(fallback))) : loader.loadAsync(asset(fallback)); };
  const loadTex = (id, fallback) => { const o = pick('track', id, fallback); return o ? textureLoader.loadAsync(asset(o)).catch(() => textureLoader.loadAsync(asset(fallback))) : textureLoader.loadAsync(asset(fallback)); };
  const geometries = new Set(), materials = new Set(), textures = new Set(), models = {}, worlds = new Set(), powders = new Set();
  let disposed = false;
  const ownGeometry = g => (geometries.add(g), g);
  function free() {
    if (disposed) return; disposed = true;
    for (const w of [...worlds]) w.dispose(); for (const p of [...powders]) p.dispose();
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
    powderGltf?.scene.traverse(n => { n.geometry?.dispose(); for (const m of [].concat(n.material || [])) { m.map?.dispose(); m.dispose(); } }); powderGltf = null;
    decoder.dispose();
  }
  function check() { if (disposed || isDisposed()) { free(); throw Object.assign(Error('alpine.disposed'), {disposed: true}); } }
  // Normalize attribute layouts when merging Draco primitives: colors may be
  // normalized Uint8 or float, but all are converted through BufferAttribute.
  /** Colour of a mesh without vertex colours: its material colour; with `glow` (theme models) the emissive colour is added, so the
   * pack's glowing inclusions stay bright under the shared palette material. */
  const fillOf = (node, glow) => {
    const m = [].concat(node.material || [])[0], base = m?.color, e = glow && m?.emissive;
    return base ? [base.r, base.g, base.b].map((v, k) => Math.min(1, v + (e ? [e.r, e.g, e.b][k] * (m.emissiveIntensity ?? 1) : 0))) : [1, 1, 1];
  };
  /** One world-space part of every mesh: position, normal and a colour attribute (kept: uv when `keepUv`). */
  function partsOf(root, {name = null, glow = false, keepUv = false} = {}) {
    root.updateMatrixWorld(true); const parts = [];
    root.traverse(node => {
      if (!node.isMesh || (name && !(Array.isArray(name) ? name.includes(node.name) : node.name === name))) return;
      const g = node.geometry.clone().applyMatrix4(node.matrixWorld), count = g.attributes.position.count, color = g.attributes.color, rgb = new Float32Array(count * 3), fill = fillOf(node, glow);
      for (let i = 0; i < count; i++) rgb.set(color ? [color.getX(i), color.getY(i), color.getZ(i)] : fill, i * 3);
      for (const key of Object.keys(g.attributes)) if (!['position', 'normal', ...(keepUv ? ['uv'] : [])].includes(key)) g.deleteAttribute(key);
      if (!g.attributes.normal) g.computeVertexNormals(); g.setAttribute('color', new T.BufferAttribute(rgb, 3)); g.clearGroups(); parts.push(g);
    });
    return parts;
  }
  function merge(parts, label) {
    if (!parts.length) throw Error(`alpine.world.geometry:${label}`);
    const merged = mergeGeometries(parts, false); for (const p of parts) p.dispose();
    if (!merged) throw Error('alpine.world.merge'); merged.computeBoundingBox(); merged.computeBoundingSphere(); return ownGeometry(merged);
  }
  function geometryOf(root, name = null, {glow = false} = {}) { return merge(partsOf(root, {name, glow}), name || 'root'); }
  let snowTexture, landscape, portrait;
  // Optional track pack (design/alpine-track): grooming textures, a real kicker and a flag rope. Missing files only
  // mean the older procedural look stays; they never fail the world.
  const trackTextures = {}, trackGeometries = {}, pack = {}, themeGates = [], landmarks = [];
  let powderGltf = null;
  const release = gltf => gltf.scene.traverse(n => { n.geometry?.dispose(); for (const m of [].concat(n.material || [])) m.dispose(); });
  /** A theme ramp in the shipped kicker's frame: optionally turned half a revolution (the pack's ramp rises toward -Z), then scaled to
   * `box` [width, height, length] with its base at y 0 and its approach at z 0, so the view places it exactly like the shipped kicker. */
  function fitBox(g, {flip = false, box}) {
    if (flip) g.rotateY(Math.PI); g.computeBoundingBox(); const b = g.boundingBox;
    g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -b.min.z); g.scale(box[0] / (b.max.x - b.min.x), box[1] / (b.max.y - b.min.y), box[2] / (b.max.z - b.min.z));
    g.computeBoundingBox(); return g;
  }
  async function trackGeometry(id) {
    const gltf = await loadModel('track', id, `../design/alpine-track/models/${id}.glb`), entry = assets?.track?.[id];
    try {
      if (gltf.themeAsset && entry?.box) {
        const parts = partsOf(gltf.scene, {glow: true, keepUv: true}), g = parts.length ? mergeGeometries(parts, false) : null; for (const p of parts) p.dispose();
        if (!g) throw Error(`alpine.track.geometry:${id}`); fitBox(g, entry); g.computeBoundingSphere(); return ownGeometry(g);
      }
      gltf.scene.updateMatrixWorld(true); const parts = [];
      gltf.scene.traverse(n => { if (n.isMesh) parts.push(n.geometry.clone().applyMatrix4(n.matrixWorld)); });
      if (!parts.length) throw Error(`alpine.track.geometry:${id}`);
      const g = parts.length === 1 ? parts[0] : mergeGeometries(parts, false); if (!g.attributes.normal) g.computeVertexNormals(); g.computeBoundingSphere(); return ownGeometry(g);
    } finally { release(gltf); }
  }
  /** A theme slalom gate (one file = both poles with their flags), split into the parts standing on the snow (poles, feet) and the
   * flags (everything starting above 0.5 m); prop('gate') fits them to the course's gate width. */
  async function themeGate(entry) {
    const gltf = await loader.loadAsync(asset('../' + pathOf(entry)));
    try {
      const parts = partsOf(gltf.scene, {glow: true}).map(g => { g.computeBoundingBox(); return {geometry: ownGeometry(g), flag: g.boundingBox.min.y > .5}; });
      if (!parts.some(p => p.flag) || !parts.some(p => !p.flag)) throw Error('alpine.theme.gate');
      return {parts, poleHalf: entry.poleHalf ?? 3.2};
    } finally { release(gltf); }
  }
  /** Scenery of a theme layer (alpine-league-look.mjs), loaded with the world so a missing file never fails the stage. */
  async function landmark(entry) {
    const gltf = await loader.loadAsync(asset('../' + pathOf(entry)));
    try { const g = geometryOf(gltf.scene, null, {glow: true}); return {geometry: g, entry}; } finally { release(gltf); }
  }
  try {
    const loaded = await Promise.allSettled([
      ...MODELS.map(async id => {
        const gltf = await loadModel('models', id, `../design/models/${id}.glb`);
        if (isDisposed()) { gltf.scene.traverse(n => { n.geometry?.dispose(); for (const m of [].concat(n.material || [])) m.dispose(); }); throw Object.assign(Error('alpine.disposed'), {disposed: true}); }
        try { models[id] = geometryOf(gltf.scene, null, {glow: !!gltf.themeAsset}); if (id === 'ski-slope') models.surface = geometryOf(gltf.scene, 'slope_surface'); if (id === 'slalom-gate') { models.gatePoles = geometryOf(gltf.scene, ['gate_poles', 'gate_feet']); models.gateBanner = geometryOf(gltf.scene, ['gate_banner', 'banner_stripes']); } }
        finally { release(gltf); }
      }),
      // Theme gates and landmarks: optional, each failure only keeps the shipped gate / skips that scenery.
      ...(assets?.gates || []).map(async (entry, i) => { try { themeGates[i] = await themeGate(entry); } catch {} }),
      ...(assets?.landmarks || []).map(async (entry, i) => { try { landmarks[i] = await landmark(entry); } catch {} }),
      ...[['groomed', 'groomed-snow.webp', true], ['groomedN', 'groomed-normal.webp', false], ['ripples', 'snow-ripples.webp', true]].map(async ([id, file, color]) => {
        try {
          const t = await loadTex(id, `../design/alpine-track/textures/${file}`); textures.add(t);
          t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; trackTextures[id] = t;
        } catch {}
      }),
      ...['kicker', 'flag-rope'].map(async id => { try { trackGeometries[id] = await trackGeometry(id); } catch {} }),
      ...PACK.map(async id => {
        try {
          const gltf = await loadModel('pack', id, `../design/alpine-world/models/${id}.glb`);
          try { pack[id] = geometryOf(gltf.scene, null, {glow: !!gltf.themeAsset}); } finally { release(gltf); }
        } catch {}
      }),
      (async () => { try { powderGltf = await loader.loadAsync(asset('../design/alpine-world/models/snow-powder.glb')); } catch {} })(),
      // With an alpine-v5 environment active the earlier mountain backdrops are not downloaded at all.
      ...[['snow', '../design/environment/textures/snow.webp'], ['landscape', '../design/environment/backgrounds/ski-mountains-landscape.webp'], ['portrait', '../design/environment/backgrounds/ski-mountains-portrait.webp']].filter(([id]) => id === 'snow' || !skipBackgrounds).map(async ([id, path]) => {
        const t = await textureLoader.loadAsync(asset(path)); textures.add(t); t.colorSpace = T.SRGBColorSpace;
        if (id === 'snow') { snowTexture = t; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; }
        else { t.generateMipmaps = false; t.minFilter = t.magFilter = T.LinearFilter; if (id === 'landscape') landscape = t; else portrait = t; }
      }),
    ]);
    const failed = loaded.find(result => result.status === 'rejected'); if (failed) throw failed.reason;
    check();
  } catch (error) { free(); throw error; }
  finally { decoder.dispose(); }
  const palette = new T.MeshStandardMaterial({color: '#ffffff', vertexColors: true, roughness: .9, metalness: 0, envMapIntensity: .2, side: T.DoubleSide}); materials.add(palette);
  const iceMaterial = new T.MeshStandardMaterial({color: '#ffffff', vertexColors: true, roughness: .38, metalness: 0, envMapIntensity: .6}); materials.add(iceMaterial);
  const propGeometries = new Map();
  let propRocks = 0;
  // A collision rock keeps the old 1.4 m footprint limit and is never lower than `minHeight`, so a flat theme boulder still reads as an
  // obstacle at speed (the shipped pack rocks are 1.28 m and 0.96 m high, above both limits, so they are unchanged).
  const fitRock = (source, width, minHeight = 0) => {
    const g = source.clone(), box = g.boundingBox, size = new T.Vector3(); box.getSize(size);
    g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    const f = width / Math.max(size.x, size.z); g.scale(f, Math.max(f, minHeight / size.y), f); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  };
  /** A theme gate fitted to the course: each pole moves (unscaled) to the collision post at +-halfWidth, and its flag is mirrored to hang
   * outside it, so the whole passage between the posts is open and nothing stands where the engine has no collider (the pack's flags
   * hang inward from poles 6.4 m apart). Mirrored flags get their triangles turned back to face the camera. */
  function fitThemeGate({parts, poleHalf}, halfWidth) {
    const out = parts.map(({geometry, flag}) => {
      const g = geometry.clone(), p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), side = Math.sign(x) || 1;
        if (flag) { p.setX(i, side * (halfWidth + poleHalf - Math.abs(x))); n.setX(i, -n.getX(i)); } else p.setX(i, x - side * (poleHalf - halfWidth));
      }
      if (flag && g.index) { const ix = g.index; for (let i = 0; i < ix.count; i += 3) { const b = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, b); } }
      return g;
    });
    const g = mergeGeometries(out, false); for (const o of out) o.dispose(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  }
  // Both colours or none: a theme whose gate file failed keeps the shipped gate everywhere.
  const themeGatesReady = () => (assets?.gates?.length ?? 0) > 1 && themeGates.filter(Boolean).length === assets.gates.length;
  function prop(type, physics = {}, variant = 0) {
    check(); if (!['gate', 'rock'].includes(type)) return null;
    // Collision rocks alternate between the pack's two rocks; both keep the old 1.4m footprint limit.
    const rockVariant = type === 'rock' && pack['rock-large'] && pack['rock-small'] ? (propRocks++ % 2 ? 'small' : 'large') : null;
    const themeGate = type === 'gate' && themeGatesReady() ? themeGates[variant % themeGates.length] : null;
    const key = type === 'gate' ? `gate:${physics.gateHalfWidth}:${physics.gatePostHeight}${themeGate ? ':theme' + variant % themeGates.length : ''}` : rockVariant ? `rock:${rockVariant}` : 'rock';
    let g = propGeometries.get(key);
    if (!g && themeGate) { try { g = fitThemeGate(themeGate, physics.gateHalfWidth ?? 1.5); ownGeometry(g); propGeometries.set(key, g); } catch { g = null; } }
    if (!g) {
      if (type === 'gate') {
        const top = physics.gatePostHeight ?? 2.35, sx = (physics.gateHalfWidth ?? 1.5) / 1.5;
        const poles = models.gatePoles.clone().scale(sx, (top + .5) / 2.35, 1), banner = models.gateBanner.clone();
        // The engine tests the poles only. Keep the full central passage clear
        // below that same collision height, with the authored banner above it.
        banner.scale(sx, .5 / .78, 1); banner.translate(0, top + .25 - 1.68 * .5 / .78, 0);
        g = mergeGeometries([poles, banner], false); poles.dispose(); banner.dispose();
      } else if (rockVariant) {
        g = fitRock(pack[`rock-${rockVariant}`], rockVariant === 'large' ? 1.4 : 1.05, rockVariant === 'large' ? 1.1 : .85);
      } else {
        g = models.rock.clone();
        const box = g.boundingBox, size = new T.Vector3(); box.getSize(size);
        g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        g.scale(1.4 / size.x, .86 / size.y, 1.4 / size.z);
      }
      ownGeometry(g); propGeometries.set(key, g);
    }
    const mesh = new T.Mesh(g, palette); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.designModel = themeGate ? `theme-gate-${variant % themeGates.length}` : type === 'gate' ? 'slalom-gate' : rockVariant ? `rock-${rockVariant}` : 'rock'; return mesh;
  }
  /** Re-tessellate the real authored surface and project it onto the existing
   * halfpipe. Its 6m wedge is not added to the course elevation a second time.
   * The rideable surface and track physics therefore stay in the same frame. */
  function slopeSurface(s0, s1, {pipe, worldPoint, deckEdge = pipe.lip + 3} = {}) {
    check(); const source = models.surface, p = source.attributes.position, colors = source.attributes.color, out = new T.Vector3();
    // Preserve the delivered model's longitudinal rows, merging only Draco's
    // sub-centimetre quantization noise. Insert one midpoint per authored row
    // interval so curved course segments remain short enough for smooth joins.
    const authoredRows = [...new Set(Array.from({length: p.count}, (_, i) => Math.round(p.getZ(i) * 100) / 100))].sort((a, b) => a - b);
    const z0 = authoredRows[0], span = authoredRows.at(-1) - z0, rows = [];
    for (let i = 0; i < authoredRows.length; i++) { if (i) rows.push((authoredRows[i - 1] + authoredRows[i]) / 2); rows.push(authoredRows[i]); }
    // Uniform x subdivisions crossed the lip discontinuity, leaving long chords
    // up to 43cm above the collider. Include the exact floor/lip/deck breaks and
    // sample each circular wall by angle, independently of the source grid.
    const right = [0, pipe.F / 2, pipe.F];
    for (let i = 1; i <= 48; i++) right.push(i === 48 ? pipe.lip : pipe.F + pipe.R * Math.sin(pipe.angle * i / 48));
    if (deckEdge > pipe.lip) right.push(deckEdge);
    const profile = [...right.slice(1).reverse().map(x => -x), ...right], count = rows.length * profile.length;
    const positions = new Float32Array(count * 3), uv = new Float32Array(count * 2), rgb = new Float32Array(count * 3), index = [];
    // Retain the surface palette from the delivered asset. Color is available
    // for vertex-color materials; the snow map can also be used on its own.
    const color = new T.Vector3();
    if (colors) { for (let i = 0; i < colors.count; i++) { color.x += colors.getX(i); color.y += colors.getY(i); color.z += colors.getZ(i); } color.divideScalar(colors.count); }
    else color.set(1, 1, 1);
    for (let j = 0; j < rows.length; j++) {
      const s = s0 + (rows[j] - z0) / span * (s1 - s0);
      for (let k = 0; k < profile.length; k++) {
        const x = profile[k], vertex = j * profile.length + k;
        worldPoint(s, x, surfaceHeight(x, pipe), out); out.toArray(positions, vertex * 3); color.toArray(rgb, vertex * 3); uv[vertex * 2] = x / 5; uv[vertex * 2 + 1] = s / 6;
        if (j && k) { const d = vertex, b = d - profile.length, a = b - 1, c = d - 1; index.push(a, b, c, b, d, c); }
      }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(positions, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setAttribute('color', new T.BufferAttribute(rgb, 3)); g.setIndex(index); g.computeVertexNormals();
    let normalY = 0; for (let i = 0; i < g.attributes.normal.count; i++) normalY += g.attributes.normal.getY(i);
    if (normalY < 0) { const ix = g.index; for (let i = 0; i < ix.count; i += 3) { const b = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, b); } g.computeVertexNormals(); }
    g.computeBoundingSphere(); g.userData.designModel = 'ski-slope/slope_surface'; g.userData.authoredRows = authoredRows.length; g.userData.adaptedRows = rows.length; g.userData.wallSegments = 48; return ownGeometry(g);
  }
  function createArtWorld(scene, {course, deckEdge, terrainY, place, frameAt, mobile = false, density = 1, env = null} = {}) {
    check(); const objects = [], pools = [], trees = [], rocks = [], fences = [], dummy = new T.Object3D(), frame = {};
    let seed = 82317, quality = 'high', lastWindow = '', treeCount = 0, shadowTrees = 0, nearTrees = 0, farTrees = 0, distantTrees = 0, rockCount = 0, fenceCount = 0, clearance = Infinity, dead = false;
    const rnd = () => ((seed = Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    function pool(geo, capacity, tag, shadow = false) {
      const mesh = new T.InstancedMesh(geo, palette, capacity); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.userData.perf = tag;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(mesh); objects.push(mesh); const p = {mesh, count: 0, capacity}; pools.push(p); return p;
    }
    const treePools = [];
    for (let tier = 0; tier < 4; tier++) for (let variant = 0; variant < 3; variant++) treePools.push(pool(models[`fir-${'abc'[variant]}`], 240, tier < 2 ? 'treesNear' : tier === 2 ? 'treesFar' : 'treesDistant', tier === 0));
    // Rock variants: [large near (shadow), large far, small near (shadow), small far]. Without the pack all four use the old rock.
    const unit = g => { const b = g.boundingBox, c = g.clone(); c.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); c.scale(1 / (b.max.x - b.min.x), 1 / (b.max.y - b.min.y), 1 / (b.max.z - b.min.z)); c.computeBoundingBox(); c.computeBoundingSphere(); return ownGeometry(c); };
    const rockGeo = [pack['rock-large'] ? unit(pack['rock-large']) : models.rock, pack['rock-small'] ? unit(pack['rock-small']) : models.rock];
    const rockPools = [pool(rockGeo[0], 40, 'rocks', true), pool(rockGeo[0], 80, 'rocks'), pool(rockGeo[1], 40, 'rocks', true), pool(rockGeo[1], 80, 'rocks')], fencePool = pool(env?.fenceGeometry || models.fence, 112, 'fence');
    const signPool = pack['snow-sign'] ? pool(pack['snow-sign'], 40, 'signs') : null, mogulPool = pack.mogul ? pool(pack.mogul, 160, 'moguls') : null;
    const icePool = pack['ice-wall'] ? pool(pack['ice-wall'], 90, 'iceWall') : null; if (icePool) icePool.mesh.material = iceMaterial;
    const signs = [], moguls = [], iceWalls = [];
    function matrixAt(s, x, y, scale, yaw) {
      frameAt(s, frame); place(dummy, s, x, y, 0, yaw, Math.atan(frame.grade)); dummy.scale.copy(scale); dummy.updateMatrix(); return dummy.matrix.clone();
    }
    const scale = new T.Vector3();
    for (let s = -35; s < course.length + 90; s += density > 1.5 ? 3.25 : 4.15) for (const side of [-1, 1]) for (let band = 0; band < 2; band++) {
      if (rnd() > (band ? .64 : .90)) continue;
      const variant = Math.floor(rnd() * 3), k = (band ? 1.4 : 1.1) + rnd() * .7, width = .84 + rnd() * .25, box = models[`fir-${'abc'[variant]}`].boundingBox;
      const radius = Math.hypot(Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), Math.max(Math.abs(box.min.z), Math.abs(box.max.z))) * k * width;
      const x = side * Math.max(deckEdge + radius + .7, deckEdge + (band ? 14 : 2) + rnd() * (band ? 23 : 9)), ss = s + rnd() * 3.2;
      trees.push({s: ss, x, variant, index: trees.length, matrix: matrixAt(ss, x, terrainY(ss, Math.abs(x), side) - .04, scale.set(k * width, k, k * width), rnd() * Math.PI * 2)});
      clearance = Math.min(clearance, Math.abs(x) - deckEdge - radius);
    }
    trees.sort((a, b) => a.s - b.s);
    for (let s = -20, i = 0; s < course.length + 90; s += 24, i++) {
      const side = i % 2 ? 1 : -1, wx = 3 + rnd() * 4, wz = 4 + rnd() * 5, x = side * (deckEdge + Math.max(wx, wz) + 5 + rnd() * 7);
      rocks.push({s, x, small: i % 3 === 2, matrix: matrixAt(s, x, terrainY(s, Math.abs(x), side) - .1, scale.set(wx, 2.5 + rnd() * 4, wz), rnd() * Math.PI * 2)});
    }
    // Pack scenery. All of it stands outside the fence line, so it can never touch the rideable surface or collisions.
    if (signPool) for (let s = 30, i = 0; s < course.length + 60; s += 85, i++) {
      const side = i % 2 ? 1 : -1, x = side * (deckEdge + 1.7), yaw = -side * .45;
      signs.push({s, matrix: matrixAt(s, x, terrainY(s, Math.abs(x), side) - .03, scale.set(1.5, 1.5, 1.5), yaw)});
    }
    if (mogulPool) for (let s = 12, i = 0; s < course.length + 70; s += 31, i++) for (let k = 0; k < 2; k++) {
      const side = (i + k) % 2 ? 1 : -1, x = side * (deckEdge + 3.6 + rnd() * 5.5), sc = 1.1 + rnd() * .9, ss = s + k * 6 + rnd() * 5;
      moguls.push({s: ss, matrix: matrixAt(ss, x, terrainY(ss, Math.abs(x), side) - .06, scale.set(sc, sc * (.9 + rnd() * .5), sc), rnd() * Math.PI * 2)});
    }
    if (icePool) for (let s = -30; s < course.length + 80; s += 9.4) for (const side of [-1, 1]) {
      const x = side * (deckEdge + 40 + rnd() * 3), ss = s + rnd() * .6;
      iceWalls.push({s: ss, matrix: matrixAt(ss, x, terrainY(ss, Math.abs(x), side) - .02, scale.set(1, 1.35, 1), side > 0 ? Math.PI / 2 : -Math.PI / 2)});
    }
    // alpine-v5 fence: 6 m modules at scale 1; the earlier fence is a 3 m module stretched over 9 m.
    for (let s = -20; s < course.length + 80; s += env ? 6 : 9) for (const side of [-1, 1]) {
      const x = side * (deckEdge + .75); fences.push({s, matrix: matrixAt(s, x, terrainY(s, Math.abs(x), side) - .03, env ? scale.set(1, 1, 1) : scale.set(3, 1, 1), Math.PI / 2)});
    }
    function add(p, matrix) { if (p.count < p.capacity) p.mesh.setMatrixAt(p.count++, matrix); }
    function background(camera) {
      const t = env ? env.backgroundFor(camera.aspect) : camera.aspect < 1 ? portrait : landscape; if (!t) return; const image = t.image, sourceAspect = image.width / image.height, aspect = Math.max(.1, camera.aspect);
      const rx = sourceAspect > aspect ? aspect / sourceAspect : 1, ry = sourceAspect > aspect ? 1 : sourceAspect / aspect;
      t.repeat.set(rx, ry); t.offset.set((1 - rx) / 2, (1 - ry) / 2); t.updateMatrix(); scene.background = t;
    }
    const world = {
      update(ps, far, camera, preset = quality) {
        if (dead) return; quality = preset === 'low' ? 'low' : 'high'; if (camera) background(camera);
        const limit = Math.min(far, quality === 'low' ? 110 : 285), windowKey = `${Math.floor(ps / 2)}:${quality}:${limit}`;
        if (windowKey === lastWindow) return; lastWindow = windowKey; for (const p of pools) p.count = 0;
        treeCount = shadowTrees = nearTrees = farTrees = distantTrees = rockCount = fenceCount = 0;
        const near = mobile ? 48 : 95, distant = mobile ? 110 : 170;
        for (const tree of trees) {
          if (tree.s < ps - 35 || tree.s > ps + limit || (quality === 'low' && tree.index % 2)) continue;
          const ds = tree.s - ps, distance = Math.abs(ds), tier = quality === 'low' ? 2 : distance > distant ? 3 : distance > near ? 2 : ds < -12 || ds > 32 || Math.abs(tree.x) > deckEdge + 13 ? 1 : 0;
          add(treePools[tier * 3 + tree.variant], tree.matrix); treeCount++; if (tier === 0) shadowTrees++; if (tier < 2) nearTrees++; else if (tier === 2) farTrees++; else distantTrees++;
        }
        for (const rock of rocks) if (rock.s > ps - 45 && rock.s < ps + limit) { add(rockPools[(rock.small ? 2 : 0) + (quality !== 'low' && rock.s > ps - 12 && rock.s < ps + 32 ? 0 : 1)], rock.matrix); rockCount++; }
        if (signPool) for (const sign of signs) if (sign.s > ps - 20 && sign.s < ps + Math.min(limit, 200)) add(signPool, sign.matrix);
        if (mogulPool) for (const mogul of moguls) if (mogul.s > ps - 20 && mogul.s < ps + Math.min(limit, quality === 'low' ? 80 : 160)) add(mogulPool, mogul.matrix);
        if (icePool && quality !== 'low') for (const wall of iceWalls) if (wall.s > ps - 30 && wall.s < ps + Math.min(limit, 200)) add(icePool, wall.matrix);
        const fenceReach = env ? (quality === 'low' ? 90 : 150) : 220;
        for (const fence of fences) if (fence.s > ps - 20 && fence.s < ps + Math.min(limit, fenceReach)) { add(fencePool, fence.matrix); fenceCount++; }
        for (const p of pools) { const m = p.mesh; m.count = p.count; m.visible = p.count > 0; m.instanceMatrix.clearUpdateRanges(); if (p.count) { m.instanceMatrix.addUpdateRange(0, p.count * 16); m.instanceMatrix.needsUpdate = true; } }
      },
      setQuality(value) { quality = value === 'low' ? 'low' : 'high'; lastWindow = ''; },
      metrics() { return {trees: treeCount, nearTrees, farTrees, distantTrees, shadowTrees, treeVariants: 3, treeDeckClearance: Number(clearance.toFixed(3)), rocks: rockCount, fences: fenceCount, designWorld: true, pack: {signs: signPool?.count ?? 0, moguls: mogulPool?.count ?? 0, iceWalls: icePool?.count ?? 0, rockVariants: pack['rock-large'] && pack['rock-small'] ? 2 : 1}, designModels: MODELS.length, designSurface: 'ski-slope', background: env ? (env.metrics().backgrounds[0] || 'none') : scene.background === portrait ? 'portrait' : 'landscape', environment: env?.id ?? null}; },
      dispose() { if (dead) return; dead = true; for (const o of objects) { scene.remove(o); o.dispose(); } if (scene.background && (scene.background === landscape || scene.background === portrait || scene.background.isTexture)) scene.background = null; worlds.delete(world); },
    };
    worlds.add(world); return world;
  }
  /** A pack gate (start-gate / finish-gate) as a ready mesh, or null if the file did not load. */
  function gate(id) {
    check(); const g = pack[id]; if (!g) return null;
    const mesh = new T.Mesh(g, palette); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.designModel = id; return mesh;
  }
  /** Animated snow powder (snow_puff, 0.8s): a few reusable one-shot puffs. emit() restarts the oldest idle one. */
  function createPowder(scene, count = 4) {
    check(); if (!powderGltf?.animations?.length) return null;
    const clip = powderGltf.animations[0], puffs = [];
    powderGltf.scene.traverse(n => { if (n.material) { for (const m of [].concat(n.material)) { m.transparent = true; m.depthWrite = false; m.side = T.DoubleSide; } } });
    for (let i = 0; i < count; i++) {
      const root = powderGltf.scene.clone(true); root.visible = false; scene.add(root);
      const mixer = new T.AnimationMixer(root), action = mixer.clipAction(clip); action.setLoop(T.LoopOnce, 1); action.clampWhenFinished = true;
      root.traverse(n => { n.frustumCulled = false; n.userData.perf = 'effects'; });
      puffs.push({root, mixer, action, age: Infinity});
    }
    let dead = false;
    const api = {
      count, duration: clip.duration,
      emit(point, size = 1, yaw = Math.random() * Math.PI * 2) {
        if (dead) return false;
        const p = puffs.reduce((a, b) => (b.age > a.age ? b : a));
        p.root.position.copy(point); p.root.scale.setScalar(size); p.root.rotation.y = yaw;
        p.action.reset().play(); p.mixer.setTime(0); p.age = 0; p.root.visible = true; return true;
      },
      update(dt) { for (const p of puffs) { if (p.age >= clip.duration) continue; p.age += dt; p.mixer.update(dt); if (p.age >= clip.duration) { p.root.visible = false; p.action.stop(); } } },
      active: () => puffs.filter(p => p.age < clip.duration).length,
      dispose() { if (dead) return; dead = true; for (const p of puffs) { p.action.stop(); p.mixer.stopAllAction(); p.root.removeFromParent(); } powders.delete(api); }
    };
    powders.add(api); return api;
  }
  return {snowTexture, trackTextures, gate, createPowder, trackGeometry: id => trackGeometries[id] || null, createArtWorld, prop, slopeSurface, dispose: free,
    /** A loaded pack geometry (shared, owned here: never dispose it) for theme scenery, or null. */
    packGeometry: id => pack[id] || null, palette,
    /** Theme scenery i of assets.landmarks: {geometry (shared, owned here), entry}, or null when the file did not load. */
    landmark: i => landmarks[i] || null,
    /** 2 when the theme's two gate colours loaded (the view alternates them along the course), else 1. */
    gateVariants: () => themeGatesReady() ? themeGates.length : 1,
    metrics: () => ({loaded: !disposed, models: MODELS.length, textures: textures.size, pack: Object.keys(pack).sort(), powder: !!powderGltf, themeGates: themeGates.filter(Boolean).length, landmarks: landmarks.filter(Boolean).length})};
}
