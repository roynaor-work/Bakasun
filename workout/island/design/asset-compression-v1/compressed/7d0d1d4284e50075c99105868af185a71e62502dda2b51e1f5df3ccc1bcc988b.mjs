import {decalCorners} from './alpine-arrows.mjs';
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

/** Alpine Rush environments from design/alpine-v5: sunset, fog and floodlit night.
 * Everything here is optional dressing. loadAlpineEnv() resolves to null when the environment, its first background,
 * fence or marker cannot be loaded, and the caller then keeps the earlier look unchanged. Optional layers (effects,
 * decals, towers, fog) that fail are skipped one by one. Nothing here touches physics, colliders or scoring. */
export const ENV_IDS = Object.freeze(['sunset', 'fog', 'night-floodlit']);
const asset = path => new URL('../design/alpine-v5/' + path, import.meta.url).href;

/** The track config names the environment (`visual.environment`). `?env=<id>` forces one, `?env=off` turns the pack off.
 * Unknown ids resolve to null (earlier look). */
export function resolveEnvironmentId(visual = {}, search = globalThis.location?.search || '') {
  let forced = null; try { forced = new URLSearchParams(search).get('env'); } catch {}
  if (forced === 'off') return null;
  const id = forced || visual.environment;
  return ENV_IDS.includes(id) ? id : null;
}

const fetchJson = async path => { const r = await fetch(asset(path)); if (!r.ok) throw Error(`alpine.env.fetch:${path}`); return r.json(); };
const texLoader = new T.TextureLoader();
const loadTexture = path => texLoader.loadAsync(asset(path));

/** Parts of a GLB as {geometry (baked to world), material}; each keeps its authored material. */
function partsOf(root) {
  root.updateMatrixWorld(true); const parts = [];
  root.traverse(n => { if (n.isMesh) { const g = n.geometry.clone().applyMatrix4(n.matrixWorld); if (!g.attributes.normal) g.computeVertexNormals(); g.computeBoundingSphere(); parts.push({geometry: g, material: [].concat(n.material)[0]}); } });
  root.traverse(n => { n.geometry?.dispose(); });
  return parts;
}
/** One merged geometry with the authored colours baked into vertex colours, for the shared palette material. */
function mergeColored(parts) {
  const geos = parts.map(({geometry, material}) => {
    const g = geometry.clone(), count = g.attributes.position.count, rgb = new Float32Array(count * 3), c = material?.color || new T.Color(1, 1, 1);
    for (let i = 0; i < count; i++) rgb.set([c.r, c.g, c.b], i * 3);
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal'].includes(key)) g.deleteAttribute(key);
    g.setAttribute('color', new T.BufferAttribute(rgb, 3)); g.clearGroups(); return g;
  });
  const merged = mergeGeometries(geos, false); for (const g of geos) g.dispose();
  if (!merged) throw Error('alpine.env.merge'); merged.computeBoundingBox(); merged.computeBoundingSphere(); return merged;
}

export async function loadAlpineEnv(id, {isDisposed = () => false, portrait = false} = {}) {
  if (!ENV_IDS.includes(id)) return null;
  const gltfLoader = new GLTFLoader(), owned = {geometries: new Set(), materials: new Set(), textures: new Set()};
  const keepTexture = t => (owned.textures.add(t), t);
  const disposeOwned = () => { for (const g of owned.geometries) g.dispose(); for (const m of owned.materials) m.dispose(); for (const t of owned.textures) t.dispose(); owned.geometries.clear(); owned.materials.clear(); owned.textures.clear(); };
  const glb = async path => partsOf((await gltfLoader.loadAsync(asset(path))).scene);
  const backgrounds = {landscape: null, portrait: null}, loading = new Set();
  async function loadBackground(kind) {
    if (backgrounds[kind] || loading.has(kind)) return; loading.add(kind);
    try {
      const t = keepTexture(await loadTexture(`backgrounds/${id}-${kind}.webp`));
      t.colorSpace = T.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = T.LinearFilter; backgrounds[kind] = t;
    } catch {} finally { loading.delete(kind); }
  }
  let json, fenceGeometry, marker;
  try {
    json = await fetchJson(`environments/${id}.json`);
    const first = portrait ? 'portrait' : 'landscape';
    const [, fenceParts, markerParts] = await Promise.all([loadBackground(first), glb(`models/safety-fence-${id}.glb`), glb(`models/route-marker-${id}.glb`)]);
    if (!backgrounds[first]) throw Error('alpine.env.background');
    fenceGeometry = mergeColored(fenceParts); owned.geometries.add(fenceGeometry); for (const p of fenceParts) p.geometry.dispose();
    marker = markerParts; for (const p of marker) { owned.geometries.add(p.geometry); owned.materials.add(p.material); }
  } catch { disposeOwned(); return null; }
  if (isDisposed()) { disposeOwned(); return null; }
  const atlases = {}, fx = {}; let snowNormal = null, snowRough = null, decals = null, towerParts = null;
  const atlasJob = name => Promise.all([fetchJson(`atlases/${name}.json`), loadTexture(`atlases/${name}.png`)]).then(([meta, tex]) => { keepTexture(tex); tex.colorSpace = T.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = tex.magFilter = T.LinearFilter; atlases[name] = {meta, tex}; });
  const fxJob = name => loadTexture(`effects/${name}.png`).then(t => { keepTexture(t); t.colorSpace = T.SRGBColorSpace; fx[name] = t; });
  const optional = [
    loadTexture('textures/snow-normal.webp').then(t => { keepTexture(t); t.colorSpace = T.NoColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; snowNormal = t; }),
    loadTexture('textures/snow-roughness.webp').then(t => { keepTexture(t); t.colorSpace = T.NoColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; snowRough = t; }),
    atlasJob('powder-spray'), atlasJob('landing-cloud'), atlasJob('snow-flecks'),
    Promise.all([fetchJson('decals/route-and-snow.json'), loadTexture('decals/route-and-snow.png')]).then(([meta, tex]) => { keepTexture(tex); tex.colorSpace = T.SRGBColorSpace; decals = {meta, tex}; }),
  ];
  if (id === 'night-floodlit') optional.push(fxJob('light-cone'), fxJob('light-pool'), glb('models/floodlight-tower.glb').then(parts => { towerParts = parts; for (const p of parts) { owned.geometries.add(p.geometry); owned.materials.add(p.material); } }));
  if (id === 'fog') optional.push(fxJob('fog-ribbon'));
  await Promise.allSettled(optional);
  if (isDisposed()) { disposeOwned(); return null; }
  let disposed = false;
  const env = {
    id, json, fenceGeometry, marker, atlases, decals, fx, towerParts, snowNormal, snowRough,
    /** Fog and light values for the view. The game keeps its own sun direction and shadow setup. */
    look: {fog: json.fog.color, fogNear: json.fog.nearMeters, fogFar: json.fog.farMeters},
    /** Cover-fit background for the aspect; the other orientation loads on rotate and the old one is dropped. */
    backgroundFor(aspect) {
      if (disposed) return null; const want = aspect < 1 ? 'portrait' : 'landscape', other = want === 'portrait' ? 'landscape' : 'portrait';
      if (backgrounds[want]) { if (backgrounds[other]) { owned.textures.delete(backgrounds[other]); backgrounds[other].dispose(); backgrounds[other] = null; } return backgrounds[want]; }
      loadBackground(want); return backgrounds[other];
    },
    metrics: () => ({id, backgrounds: Object.entries(backgrounds).filter(([, t]) => t).map(([k]) => k), atlases: Object.keys(atlases), decals: !!decals, tower: !!towerParts, snowNormal: !!snowNormal}),
    dispose() { if (disposed) return; disposed = true; disposeOwned(); },
  };
  return env;
}

/** Scene dressing: route markers, decals, floodlights, fog ribbons, landing/powder sprites and ambient flecks.
 * All of it is placed outside or flat on the rideable surface and is removed in dispose(). */
export function createEnvRig(scene, env, {course, deckEdge, terrainY, place, worldPoint, frameAt, mobile = false, reduced = false}) {
  const objects = [], ownGeometry = new Set(), ownMaterial = new Set(), dummy = new T.Object3D(), tmp = new T.Vector3(), camPos = new T.Vector3(), fr = {};
  const json = env.json, length = course.length, quality = {value: 'high'};
  const register = (o, perf) => { o.userData.perf = perf; scene.add(o); objects.push(o); return o; };
  const own = (geometry, material) => { if (geometry) ownGeometry.add(geometry); if (material) ownMaterial.add(material); };
  const matrixAt = (s, x, y, scale = 1, yaw = 0) => { place(dummy, s, x, y, 0, yaw, 0); dummy.scale.setScalar(scale); dummy.updateMatrix(); return dummy.matrix.clone(); };
  const rig = {}; let markerCount = 0, decalQuads = 0, spots = [], lastWindow = '';

  // Route markers: every 70 m, alternating sides, just outside the fence, turned toward the rider.
  {
    const matrices = []; let i = 0;
    for (let s = 60; s < length + 40; s += 70, i++) { const side = i % 2 ? 1 : -1, x = side * (deckEdge + 1.7); matrices.push(matrixAt(s, x, terrainY(s, Math.abs(x), side) - .03, 1.15, Math.PI)); }
    for (const part of env.marker) {
      const mesh = new T.InstancedMesh(part.geometry, part.material, matrices.length); matrices.forEach((m, k) => mesh.setMatrixAt(k, m));
      mesh.frustumCulled = false; mesh.receiveShadow = true; register(mesh, 'markers');
    }
    markerCount = matrices.length;
  }

  // Decals: a downhill arrow after the start and a turn warning ahead of every real turn, flat on the snow.
  if (env.decals) {
    const frames = new Map(env.decals.meta.frames.map(f => [f.id, f])), quads = [], path = course.path;
    const add = (id, s, x, size) => { const f = frames.get(id); if (f) quads.push({f, s, x, size}); };
    add('downhill-arrow', 34, 0, 3);
    let inTurn = false;
    for (let s = 140; s < length - 40 && quads.length < 22; s++) { const k = path.kappa[s], strong = Math.abs(k) > .0035; if (strong && !inTurn) add(k > 0 ? 'turn-right' : 'turn-left', s - 26, 0, 2.8); inTurn = strong; }
    if (quads.length) {
      const pos = new Float32Array(quads.length * 12), uv = new Float32Array(quads.length * 8), index = [], out = new T.Vector3();
      quads.forEach((q, n) => {
        decalCorners({s: q.s, x: q.x, size: q.size, uv: q.f.uv}).forEach((c, k) => {
          worldPoint(c.s, c.x, .035, out); out.toArray(pos, (n * 4 + k) * 3); uv[(n * 4 + k) * 2] = c.u; uv[(n * 4 + k) * 2 + 1] = c.v;
        });
        const b = n * 4; index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      });
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setIndex(index); g.computeVertexNormals();
      const mat = new T.MeshBasicMaterial({map: env.decals.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: env.id === 'night-floodlit' ? '#9fb4d8' : '#ffffff', opacity: .9});
      own(g, mat); const mesh = new T.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 2; register(mesh, 'decals'); decalQuads = quads.length;
    }
  }

  // Floodlit night: towers every 72 m, a light pool and a cone for the nearest ones, and up to two real spot lights.
  const fl = json.floodlights, towers = [];
  if (fl && env.towerParts) {
    let i = 0;
    for (let s = 24; s < length + 60; s += 72, i++) {
      const side = i % 2 ? 1 : -1, x = side * (deckEdge + 13), y = terrainY(s, Math.abs(x), side) - .02;
      towers.push({s, side, x, y, matrix: matrixAt(s, x, y, 1, side > 0 ? -Math.PI / 2 : Math.PI / 2), pool: null, cone: null});
    }
    rig.towerMeshes = env.towerParts.map(part => { const m = new T.InstancedMesh(part.geometry, part.material, 8); m.count = 0; m.frustumCulled = false; return register(m, 'towers'); });
    if (env.fx['light-pool']) for (const tw of towers) {
      const mat = new T.MeshBasicMaterial({map: env.fx['light-pool'], color: fl.color, transparent: true, opacity: .62, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: false}), geo = new T.PlaneGeometry(1, 1);
      own(geo, mat); const mesh = new T.Mesh(geo, mat); mesh.rotation.order = 'YXZ'; mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 3; register(mesh, 'effects'); tw.pool = mesh;
      worldPoint(tw.s + 9, -tw.side * 3, .06, mesh.position); frameAt(tw.s, fr); mesh.rotation.set(-Math.PI / 2 - Math.atan(fr.grade), -fr.theta, 0); mesh.scale.setScalar(19);
    }
    if (env.fx['light-cone'] && !mobile) for (const tw of towers) {
      const mat = new T.MeshBasicMaterial({map: env.fx['light-cone'], color: fl.color, transparent: true, opacity: .34, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false}), geo = new T.PlaneGeometry(6, 12);
      own(geo, mat); const mesh = new T.Mesh(geo, mat); mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 3; register(mesh, 'effects'); tw.cone = mesh;
    }
    // Light count must not change at runtime (it recompiles shaders): real spots exist from the start or never.
    if (!mobile) for (let k = 0; k < Math.min(2, fl.maxLiveLights || 2); k++) { const light = new T.SpotLight(fl.color, 0, fl.distanceMeters, fl.angleRadians, fl.penumbra, fl.decay); light.castShadow = false; scene.add(light, light.target); objects.push(light, light.target); spots.push(light); }
  }

  // Fog: a few drifting ribbons on both sides of the course (off in reduced motion).
  const ribbons = [];
  if (env.id === 'fog' && env.fx['fog-ribbon'] && !reduced) {
    for (let k = 0; k < (mobile ? 3 : 5); k++) {
      const mat = new T.MeshBasicMaterial({map: env.fx['fog-ribbon'], transparent: true, opacity: .5, depthWrite: false, side: T.DoubleSide, fog: false}), geo = new T.PlaneGeometry(46, 9);
      own(geo, mat); const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 1; register(mesh, 'effects'); ribbons.push({mesh, s: 40 + k * 55, side: k % 2 ? 1 : -1, drift: (.25 + k * .07) * (k % 2 ? 1 : -1)});
    }
  }

  // Sprite effects from the atlases: landing cloud (2 at once) and powder spray (3 at once). Reduced motion: one static frame.
  function spriteEffect(atlas, max) {
    if (!atlas) return null; const {meta, tex} = atlas, sprites = [], duration = reduced ? .15 : meta.durationSeconds, base = meta.sizeMeters?.[0] ?? 1.5;
    for (let i = 0; i < max; i++) {
      const map = tex.clone(); map.needsUpdate = true; const material = new T.SpriteMaterial({map, transparent: true, depthWrite: false, depthTest: true}), sprite = new T.Sprite(material);
      sprite.center.set(meta.pivot?.[0] ?? .5, 1 - (meta.pivot?.[1] ?? .8)); sprite.visible = false; sprite.frustumCulled = false; register(sprite, 'effects'); sprites.push({sprite, material, map, age: Infinity});
    }
    const setFrame = (p, index) => { const [u0, v0, u1, v1] = meta.frames[Math.max(0, Math.min(meta.frames.length - 1, index))].uv; p.map.repeat.set(u1 - u0, v1 - v0); p.map.offset.set(u0, v0); };
    return {
      emit(point, size = 1) {
        const p = sprites.reduce((a, b) => (b.age > a.age ? b : a)); p.sprite.position.copy(point); p.sprite.scale.setScalar(base * size); p.age = 0; p.sprite.visible = true;
        p.material.opacity = reduced ? .35 : 1; setFrame(p, reduced ? (meta.reducedMotion?.frame ?? 5) : 0); return true;
      },
      update(dt) { for (const p of sprites) { if (p.age >= duration) continue; p.age += dt; if (p.age >= duration) { p.sprite.visible = false; continue; } if (!reduced) setFrame(p, Math.floor(p.age * meta.fps)); } },
      active: () => sprites.filter(p => p.age < duration).length,
      dispose() { for (const p of sprites) { p.map.dispose(); p.material.dispose(); } },
    };
  }
  const landing = spriteEffect(env.atlases['landing-cloud'], json.effects?.maxConcurrentLanding ?? 2), powder = spriteEffect(env.atlases['powder-spray'], json.effects?.maxConcurrentPowder ?? 3);

  // Ambient flecks: up to 48 static variants falling in front of the camera (off in reduced motion).
  let flecks = null;
  if (env.atlases['snow-flecks'] && !reduced) {
    const meta = env.atlases['snow-flecks'].meta, cols = meta.columns, cells = cols * meta.rows, max = Math.min(48, json.effects?.maxAmbientParticles ?? 48);
    const pos = new Float32Array(max * 3), cell = new Float32Array(max), size = new Float32Array(max), seed = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) { cell[i] = (i * 7) % cells; size[i] = 3 + ((i * 13) % 6); seed.set([((i * 37) % 19) - 9, (i * 11) % 10, 2 + (i * 5) % 16], i * 3); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('cell', new T.BufferAttribute(cell, 1)); g.setAttribute('psize', new T.BufferAttribute(size, 1));
    const m = new T.ShaderMaterial({transparent: true, depthWrite: false, uniforms: {atlas: {value: env.atlases['snow-flecks'].tex}, tint: {value: new T.Color(json.powderTint || '#ffffff')}},
      vertexShader: 'attribute float cell; attribute float psize; varying float vCell; void main(){ vCell=cell; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=min(psize*(60./max(.5,-mv.z)),12.); gl_Position=projectionMatrix*mv; }',
      fragmentShader: `uniform sampler2D atlas; uniform vec3 tint; varying float vCell; void main(){ float cx=mod(vCell,${cols}.); float cy=floor(vCell/${cols}.); vec2 uv=vec2(cx+gl_PointCoord.x, ${cols}.-1.-cy+(1.-gl_PointCoord.y))/${cols}.; vec4 c=texture2D(atlas,uv); gl_FragColor=vec4(c.rgb*tint,c.a*.85); }`});
    own(g, m); const points = new T.Points(g, m); points.frustumCulled = false; register(points, 'effects'); flecks = {points, pos, seed, max, t: 0};
  }

  Object.assign(rig, {
    setQuality(value) {
      quality.value = value === 'low' ? 'low' : 'high'; lastWindow = '';
      if (flecks) flecks.points.geometry.setDrawRange(0, quality.value === 'low' ? flecks.max >> 1 : flecks.max);
    },
    landing: (point, size) => landing?.emit(point, size) ?? false,
    powder: (point, size) => powder?.emit(point, size) ?? false,
    update(ps, camera, dt) {
      camera.getWorldPosition(camPos); landing?.update(dt); powder?.update(dt);
      if (towers.length) {
        const key = `${Math.floor(ps / 8)}:${quality.value}`;
        if (key !== lastWindow) {
          lastWindow = key; const near = towers.filter(t => t.s > ps - 40 && t.s < ps + (quality.value === 'low' ? 120 : 200)).slice(0, 8);
          rig.towerMeshes.forEach(m => { near.forEach((t, k) => m.setMatrixAt(k, t.matrix)); m.count = near.length; m.instanceMatrix.needsUpdate = true; });
          const shown = new Set(near.slice(0, 4)); for (const t of towers) { const on = shown.has(t); if (t.pool) t.pool.visible = on; if (t.cone) t.cone.visible = on && quality.value !== 'low'; }
          const lit = near.filter(t => t.s > ps - 6).slice(0, spots.length);
          spots.forEach((light, k) => { const t = lit[k]; if (!t || quality.value === 'low') { light.intensity = 0; return; } light.intensity = fl.intensityCandela; worldPoint(t.s, t.x, t.y + 11.7, light.position); worldPoint(t.s + 10, -t.side * 2, 0, light.target.position); light.target.updateMatrixWorld(); });
        }
        for (const t of towers) if (t.cone?.visible) { worldPoint(t.s, t.x - t.side * 1.8, t.y + 6, t.cone.position); t.cone.rotation.set(0, Math.atan2(camPos.x - t.cone.position.x, camPos.z - t.cone.position.z), 0); }
      }
      for (const r of ribbons) {
        if (r.s < ps - 30) r.s += 260; r.s += r.drift * dt; const x = r.side * (deckEdge + 8 + (Math.floor(r.s) % 7)); worldPoint(r.s, x, terrainY(r.s, Math.abs(x), r.side) + 3.2, r.mesh.position);
        r.mesh.rotation.set(0, Math.atan2(camPos.x - r.mesh.position.x, camPos.z - r.mesh.position.z), 0);
      }
      if (flecks) {
        flecks.t += dt; const {pos, seed, max} = flecks; camera.getWorldDirection(tmp);
        for (let i = 0; i < max; i++) {
          const y = (((seed[i * 3 + 1] - flecks.t * (.5 + (i % 5) * .12)) % 10) + 10) % 10;
          pos[i * 3] = camPos.x + tmp.x * seed[i * 3 + 2] + seed[i * 3] * .6 + Math.sin(flecks.t * .6 + i) * .4; pos[i * 3 + 1] = camPos.y - 2.5 + y; pos[i * 3 + 2] = camPos.z + tmp.z * seed[i * 3 + 2] + Math.cos(flecks.t * .5 + i * 1.7) * .4;
        }
        flecks.points.geometry.attributes.position.needsUpdate = true;
      }
    },
    metrics: () => ({...env.metrics(), markers: markerCount, towers: towers.length, decalQuads, ribbons: ribbons.length, flecks: flecks?.max ?? 0, spotLights: spots.length, landingActive: landing?.active() ?? 0, powderActive: powder?.active() ?? 0}),
    dispose() {
      landing?.dispose(); powder?.dispose();
      for (const o of objects) { scene.remove(o); if (o.isInstancedMesh) o.dispose(); }
      for (const g of ownGeometry) g.dispose(); for (const m of ownMaterial) m.dispose(); objects.length = 0; spots = [];
    },
  });
  return rig;
}
