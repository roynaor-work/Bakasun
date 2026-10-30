import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {DRACOLoader} from '../vendor/DRACOLoader.js';
import {mergeGeometries, mergeVertices} from '../vendor/BufferGeometryUtils.js';
import {surfaceHeight} from './alpine-track.mjs';

const asset = path => new URL(path, import.meta.url).href;
const MODELS = ['fir-a', 'fir-b', 'fir-c', 'rock', 'slalom-gate', 'ski-slope', 'fence'];

/** One decode per model, one merged geometry per prop. All geometry is authored
 * design data; this adapter changes placement only and never creates colliders. */
export async function loadAlpineWorld({isDisposed = () => false} = {}) {
  const decoder = new DRACOLoader().setDecoderPath(asset('../vendor/draco/')).setDecoderConfig({type: 'wasm'}).setWorkerLimit(2);
  const loader = new GLTFLoader().setDRACOLoader(decoder), textureLoader = new T.TextureLoader();
  const geometries = new Set(), materials = new Set(), textures = new Set(), models = {}, worlds = new Set();
  let disposed = false;
  const ownGeometry = g => (geometries.add(g), g);
  function free() {
    if (disposed) return; disposed = true;
    for (const w of [...worlds]) w.dispose();
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
    decoder.dispose();
  }
  function check() { if (disposed || isDisposed()) { free(); throw Object.assign(Error('alpine.disposed'), {disposed: true}); } }
  // Normalize attribute layouts when merging Draco primitives: colors may be
  // normalized Uint8 or float, but all are converted through BufferAttribute.
  function geometryOf(root, name = null) {
    root.updateMatrixWorld(true); const parts = [];
    root.traverse(node => {
      if (!node.isMesh || (name && !(Array.isArray(name) ? name.includes(node.name) : node.name === name))) return;
      const g = node.geometry.clone().applyMatrix4(node.matrixWorld), count = g.attributes.position.count, color = g.attributes.color, rgb = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) rgb.set(color ? [color.getX(i), color.getY(i), color.getZ(i)] : [1, 1, 1], i * 3);
      for (const key of Object.keys(g.attributes)) if (!['position', 'normal'].includes(key)) g.deleteAttribute(key);
      if (!g.attributes.normal) g.computeVertexNormals(); g.setAttribute('color', new T.BufferAttribute(rgb, 3)); g.clearGroups(); parts.push(g);
    });
    if (!parts.length) throw Error(`alpine.world.geometry:${name || 'root'}`);
    const merged = mergeGeometries(parts, false); for (const p of parts) p.dispose();
    if (!merged) throw Error('alpine.world.merge'); merged.computeBoundingBox(); merged.computeBoundingSphere(); return ownGeometry(merged);
  }
  let snowTexture, landscape, portrait;
  try {
    const loaded = await Promise.allSettled([
      ...MODELS.map(async id => {
        const gltf = await loader.loadAsync(asset(`../design/models/${id}.glb`));
        if (isDisposed()) { gltf.scene.traverse(n => { n.geometry?.dispose(); for (const m of [].concat(n.material || [])) m.dispose(); }); throw Object.assign(Error('alpine.disposed'), {disposed: true}); }
        try { models[id] = geometryOf(gltf.scene); if (id === 'ski-slope') models.surface = geometryOf(gltf.scene, 'slope_surface'); if (id === 'slalom-gate') { models.gatePoles = geometryOf(gltf.scene, ['gate_poles', 'gate_feet']); models.gateBanner = geometryOf(gltf.scene, ['gate_banner', 'banner_stripes']); } }
        finally { gltf.scene.traverse(n => { n.geometry?.dispose(); for (const m of [].concat(n.material || [])) m.dispose(); }); }
      }),
      ...[['snow', '../design/environment/textures/snow.webp'], ['landscape', '../design/environment/backgrounds/ski-mountains-landscape.webp'], ['portrait', '../design/environment/backgrounds/ski-mountains-portrait.webp']].map(async ([id, path]) => {
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
  const propGeometries = new Map();
  function prop(type, physics = {}) {
    check(); if (!['gate', 'rock'].includes(type)) return null;
    const key = type === 'gate' ? `gate:${physics.gateHalfWidth}:${physics.gatePostHeight}` : 'rock';
    let g = propGeometries.get(key);
    if (!g) {
      if (type === 'gate') {
        const top = physics.gatePostHeight ?? 2.35, sx = (physics.gateHalfWidth ?? 1.5) / 1.5;
        const poles = models.gatePoles.clone().scale(sx, (top + .5) / 2.35, 1), banner = models.gateBanner.clone();
        // The engine tests the poles only. Keep the full central passage clear
        // below that same collision height, with the authored banner above it.
        banner.scale(sx, .5 / .78, 1); banner.translate(0, top + .25 - 1.68 * .5 / .78, 0);
        g = mergeGeometries([poles, banner], false); poles.dispose(); banner.dispose();
      } else {
        g = models.rock.clone();
        const box = g.boundingBox, size = new T.Vector3(); box.getSize(size);
        g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        g.scale(1.4 / size.x, .86 / size.y, 1.4 / size.z);
      }
      ownGeometry(g); propGeometries.set(key, g);
    }
    const mesh = new T.Mesh(g, palette); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.designModel = type === 'gate' ? 'slalom-gate' : 'rock'; return mesh;
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
  function createArtWorld(scene, {course, deckEdge, terrainY, place, frameAt, mobile = false, density = 1} = {}) {
    check(); const objects = [], pools = [], trees = [], rocks = [], fences = [], dummy = new T.Object3D(), frame = {};
    let seed = 82317, quality = 'high', lastWindow = '', treeCount = 0, shadowTrees = 0, nearTrees = 0, farTrees = 0, distantTrees = 0, rockCount = 0, fenceCount = 0, clearance = Infinity, dead = false;
    const rnd = () => ((seed = Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    function pool(geo, capacity, tag, shadow = false) {
      const mesh = new T.InstancedMesh(geo, palette, capacity); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.userData.perf = tag;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(mesh); objects.push(mesh); const p = {mesh, count: 0, capacity}; pools.push(p); return p;
    }
    const treePools = [];
    for (let tier = 0; tier < 4; tier++) for (let variant = 0; variant < 3; variant++) treePools.push(pool(models[`fir-${'abc'[variant]}`], 240, tier < 2 ? 'treesNear' : tier === 2 ? 'treesFar' : 'treesDistant', tier === 0));
    const rockPools = [pool(models.rock, 64, 'rocks', true), pool(models.rock, 128, 'rocks')], fencePool = pool(models.fence, 112, 'fence');
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
      rocks.push({s, x, matrix: matrixAt(s, x, terrainY(s, Math.abs(x), side) - .1, scale.set(wx, 2.5 + rnd() * 4, wz), rnd() * Math.PI * 2)});
    }
    for (let s = -20; s < course.length + 80; s += 9) for (const side of [-1, 1]) {
      const x = side * (deckEdge + .75); fences.push({s, matrix: matrixAt(s, x, terrainY(s, Math.abs(x), side) - .03, scale.set(3, 1, 1), Math.PI / 2)});
    }
    function add(p, matrix) { if (p.count < p.capacity) p.mesh.setMatrixAt(p.count++, matrix); }
    function background(camera) {
      const t = camera.aspect < 1 ? portrait : landscape, image = t.image, sourceAspect = image.width / image.height, aspect = Math.max(.1, camera.aspect);
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
        for (const rock of rocks) if (rock.s > ps - 45 && rock.s < ps + limit) { add(rockPools[quality !== 'low' && rock.s > ps - 12 && rock.s < ps + 32 ? 0 : 1], rock.matrix); rockCount++; }
        for (const fence of fences) if (fence.s > ps - 20 && fence.s < ps + Math.min(limit, 220)) { add(fencePool, fence.matrix); fenceCount++; }
        for (const p of pools) { const m = p.mesh; m.count = p.count; m.visible = p.count > 0; m.instanceMatrix.clearUpdateRanges(); if (p.count) { m.instanceMatrix.addUpdateRange(0, p.count * 16); m.instanceMatrix.needsUpdate = true; } }
      },
      setQuality(value) { quality = value === 'low' ? 'low' : 'high'; lastWindow = ''; },
      metrics() { return {trees: treeCount, nearTrees, farTrees, distantTrees, shadowTrees, treeVariants: 3, treeDeckClearance: Number(clearance.toFixed(3)), rocks: rockCount, fences: fenceCount, designWorld: true, designModels: MODELS.length, designSurface: 'ski-slope', background: scene.background === portrait ? 'portrait' : 'landscape'}; },
      dispose() { if (dead) return; dead = true; for (const o of objects) { scene.remove(o); o.dispose(); } if (scene.background === landscape || scene.background === portrait) scene.background = null; worlds.delete(world); },
    };
    worlds.add(world); return world;
  }
  return {snowTexture, createArtWorld, prop, slopeSurface, dispose: free, metrics: () => ({loaded: !disposed, models: MODELS.length, textures: textures.size})};
}
