/** The Codex shared athlete body (athlete-body-v1, 12/11/2026) for soccer and basketball (v22, "athlete body" session).
 *
 * Roy: "same players in the same graphics, not two different graphics". The previous shared body (athlete-body.mjs, MakeHuman, 11.6K triangles,
 * 31 bones, skin and kit shaders) needed a world-basis retarget of every clip. This body is built on the canonical 18-bone rig itself (same names,
 * order, parents and rest translations as every motion library of the project), so the clips of soccer v9..v12 and basketball tall / v8 / v11 play
 * on it with an identity map: no joint is re-aimed, nothing can twist.
 *
 * What is here (three.js only through the `T` argument, so the pure parts run in node tests):
 *  - four bodies: `soccer`, and the basketball roles `guard` (point guard), `wing`, `center`; six skin tones, eight hairstyles, nine colour regions;
 *  - ONE material for every player of a page (atlas + vertex colours, `athlete_shared`). Team colours, skin tone and hair colour are painted into each
 *    player's own COLOR_0 copy by region (`_REGION`), so there is no per-player shader and no per-player texture;
 *  - `athleteBodyV22Enabled`: on by default; `?athleteBodyV22=0` (or `?athleteBody=0`) returns both games to the previous bodies exactly. */
import {athleteRig} from './athlete-body.mjs';

export const V22_BASE = '../assets/athlete-body-v22/';
export const V22_ATLAS_BYTES = 474663;
/** Natural height (metres, soles to scalp, no hair), and the head-local scale of the hair cap, from body-manifest.json. */
export const V22_BODIES = Object.freeze({
  soccer: {height: 1.8, width: 1, depth: 1},
  guard: {height: 1.78, width: 0.97, depth: 0.98},
  wing: {height: 1.94, width: 1.045, depth: 1.035},
  center: {height: 2.08, width: 1.12, depth: 1.09},
});
export const V22_HAIR = Object.freeze(['buzz', 'crop', 'side-part', 'quiff', 'curls', 'afro', 'swept-back', 'bun']);
export const V22_SKIN = Object.freeze(['#f2c6a0', '#d9a17b', '#bd8058', '#9a6041', '#70422d', '#44291f']);
/** `_REGION` values of the vertices. */
export const V22_REGION = Object.freeze({skin: 0, shirt: 1, shorts: 2, trim: 3, shoeUpper: 4, shoeSole: 5, eyes: 6, hair: 7, sock: 8});
/** Hips and Root translations of the basketball packs are rest-relative and scaled by canonical / source mean leg length (motion-manifest.json). */
export const V22_LEG_RATIO = Object.freeze({guard: 0.824177, wing: 0.782552, center: 0.744929});
/** Sport morph of the body: soccer is every weight 0. */
export const V22_SPORT_MORPH = Object.freeze({soccer: null, basketball: 'basketball'});
const CANON18 = ['Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
/** canonical -> body bone: the body IS the canonical rig. */
export const V22_MAP = Object.freeze(Object.fromEntries(CANON18.map(n => [n, n])));
export const V22_BOOTS = Object.freeze({soccer: '#1b1d22', basketball: '#f6f6f3', sole: '#e7e6d8'});

/** On unless `?athleteBodyV22=0`. `?athleteBody=0` (the older flag: both games back to their previous bodies) switches it off too. */
export function athleteBodyV22Enabled(search = globalThis.location?.search || '') {
  const p = new URLSearchParams(search);
  return p.get('athleteBodyV22') !== '0' && p.get('athleteBody') !== '0';
}

/** Which of the four bodies a role wears. Basketball profiles are the tall packs' guard / wing / center. */
export function v22BodyFor(sport, role = 'field') {
  if (sport === 'basketball') return V22_BODIES[role] && role !== 'soccer' ? role : 'wing';
  return 'soccer';
}
export const v22Height = (sport, role, heightM = null) => Number.isFinite(heightM) && heightM > 1 ? heightM : V22_BODIES[v22BodyFor(sport, role)].height;

/** Nearest of the six skin tones to a '#rrggbb' (the profile tables hold free colours; the body ships six calibrated ones). */
export function v22SkinFor(hex) {
  if (Number.isInteger(hex) && hex >= 0) return V22_SKIN[hex % V22_SKIN.length];
  const rgb = h => [1, 3, 5].map(i => parseInt(String(h).slice(i, i + 2), 16) || 0);
  const a = rgb(hex);
  let best = 0, bestD = Infinity;
  V22_SKIN.forEach((s, i) => { const b = rgb(s), d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; if (d < bestD) { bestD = d; best = i; } });
  return V22_SKIN[best];
}
/** Deterministic hairstyle for a player: curly profiles get the curly cuts, the rest cycle through the short styles. */
export function v22HairFor(profile, n = 0) {
  const k = Math.abs(Math.trunc(n)) || 0, african = Number(profile?.shape?.african) || 0;
  if (african >= 0.7) return ['afro', 'curls', 'buzz'][k % 3];
  return ['crop', 'side-part', 'quiff', 'swept-back', 'buzz', 'curls', 'bun'][k % 7];
}

/** Region -> hex for one player. `kit` is the athleteKitFor shape ({primary, secondary, shorts, shortsTrim, socks, boots, bootAccent}); style 'soccer' | 'basketball'. */
export function v22Colors({skin, hair = '#1f1712', kit, style = 'soccer'}) {
  const k = kit || {};
  return {
    [V22_REGION.skin]: v22SkinFor(skin),
    [V22_REGION.shirt]: k.primary || '#2868ee',
    [V22_REGION.shorts]: k.shorts || k.primary || '#20242c',
    [V22_REGION.trim]: k.secondary || k.shortsTrim || '#ffffff',
    [V22_REGION.shoeUpper]: k.boots || V22_BOOTS[style] || V22_BOOTS.soccer,
    [V22_REGION.shoeSole]: V22_BOOTS.sole,
    [V22_REGION.hair]: hair,
    [V22_REGION.sock]: k.socks || '#f4f4f0',
  };
}

/** Pure: write the linear RGB of `palette` (region -> [r,g,b]) into `colors` (Float32Array, `stride` floats per vertex: 4 for the glTF VEC4 COLOR_0, alpha untouched) for the vertices whose region has an entry; others
 * keep `base`. `regions` holds one region per vertex (any typed array). `forceRegion` paints every vertex as that region (hair caps). Returns the count painted. */
export function paintRegions(colors, regions, base, palette, forceRegion = null, stride = 3) {
  let painted = 0;
  const n = regions.length;
  for (let i = 0; i < n; i++) {
    const c = palette[forceRegion ?? regions[i]], o = i * stride;
    if (c) { colors[o] = c[0]; colors[o + 1] = c[1]; colors[o + 2] = c[2]; painted++; }
    else if (base) { colors[o] = base[o]; colors[o + 1] = base[o + 1]; colors[o + 2] = base[o + 2]; }
  }
  return painted;
}
/** Region -> linear [r,g,b] from a region -> hex table (three.js colour management turns the sRGB hex into the linear value vertex colours hold). */
export function v22Palette(T, colors) {
  const out = {}, c = new T.Color();
  for (const [region, hex] of Object.entries(colors)) { c.set(hex); out[region] = [c.r, c.g, c.b]; }
  return out;
}

// ---- loading ------------------------------------------------------------------------------------------------------------------------
const cache = {bodies: new Map(), hair: new Map(), material: null};
const geometryOf = scene => { let g = null; scene.traverse(o => { if (!g && (o.isSkinnedMesh || o.isMesh)) g = o; }); return g; };
/** Forget the page cache (tests, reloads). The loaded scenes are never disposed: every player clones from them. */
export function resetAthleteV22() { cache.bodies.clear(); cache.hair.clear(); cache.material = null; }

/** The bodies and hairstyles once per page. `load(url)` is the GLTFLoader call; `bodies` the body ids wanted ('soccer' for football, the three
 * basketball roles for hoops); `hair` the hairstyle ids (default all eight, 123 KB in total). A failed file is forgotten so the next game retries.
 * Returns {bodies: {id: {scene, height, floor, rig, bones, info}}, hair: {id: scene}, material}. */
export async function loadAthleteV22(load, {T, bodies = ['soccer'], hair = V22_HAIR, base = new URL(V22_BASE, import.meta.url).href} = {}) {
  const wantBody = id => {
    if (!V22_BODIES[id]) throw Error('Athlete body v22: unknown body ' + id);
    if (!cache.bodies.has(id)) {
      const p = (async () => {
        const data = await load(base + 'models/' + id + '.glb'), scene = data.scene;
        scene.updateMatrixWorld(true);
        let minY = 0, height = V22_BODIES[id].height;
        if (T) { const box = new T.Box3().setFromObject(scene); if (Number.isFinite(box.max.y - box.min.y) && box.max.y > box.min.y) { minY = box.min.y; height = box.max.y - box.min.y; } }
        const boneMap = {}; scene.traverse(o => { if (o.isBone) boneMap[o.name] = o; });
        for (const name of CANON18) if (!boneMap[name]) throw Error('Athlete body v22 lacks bone ' + id + '/' + name);
        return {scene, height, floor: minY, rig: athleteRig(scene), bones: boneMap, info: V22_BODIES[id], id};
      })();
      p.catch(() => cache.bodies.delete(id));
      cache.bodies.set(id, p);
    }
    return cache.bodies.get(id);
  };
  const wantHair = id => {
    if (!cache.hair.has(id)) {
      const p = (async () => (await load(base + 'hair/' + id + '.glb')).scene)();
      p.catch(() => cache.hair.delete(id));
      cache.hair.set(id, p);
    }
    return cache.hair.get(id);
  };
  const [bodyList, hairList] = await Promise.all([Promise.all(bodies.map(wantBody)), Promise.all(hair.map(wantHair))]);
  const out = {bodies: {}, hair: {}, material: null};
  bodies.forEach((id, i) => { out.bodies[id] = bodyList[i]; });
  hair.forEach((id, i) => { out.hair[id] = hairList[i]; });
  if (T && !cache.material) {
    // one material for every player of every body: the atlas of the first body (all four reference the same file)
    const first = geometryOf(bodyList[0].scene), map = first?.material?.map || null;
    if (map) map.colorSpace = T.SRGBColorSpace;
    cache.material = new T.MeshStandardMaterial({name: 'athlete_shared', map, vertexColors: true, roughness: 0.88, metalness: 0});
  }
  out.material = cache.material;
  return out;
}

// ---- instances ------------------------------------------------------------------------------------------------------------------------
/** Own copy of a mesh's geometry that shares everything except the colour attribute (3,944 vertices x 3 floats for a body). */
function ownColors(T, mesh) {
  const src = mesh.geometry, g = new T.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, name === 'color' ? attr.clone() : attr);
  if (src.index) g.setIndex(src.index);
  for (const [name, list] of Object.entries(src.morphAttributes || {})) g.morphAttributes[name] = list;
  g.morphTargetsRelative = src.morphTargetsRelative;
  g.boundingBox = src.boundingBox; g.boundingSphere = src.boundingSphere;
  for (const grp of src.groups) g.addGroup(grp.start, grp.count, grp.materialIndex);
  mesh.geometry = g;
  mesh.userData.v22Base = src.attributes.color.array.slice();
  // `_REGION` is a byte attribute with a 4-byte stride in the files (an interleaved attribute once loaded): read it through getX, once per mesh
  const reg = src.attributes._region || src.attributes._REGION, regions = new Uint8Array(reg.count);
  for (let i = 0; i < regions.length; i++) regions[i] = reg.getX(i);
  mesh.userData.v22Regions = regions;
  return g;
}
/** One player. `cloneRig` clones a skinned hierarchy (soccer-rig cloneSoccerRig / SkeletonUtils clone). `appearance` = {skin: '#hex' | index, hair: '#hex',
 * hairStyle: id}; `kit` the athleteKitFor shape. The root is scaled to `height` metres with the soles on y = 0.
 * Returns {root, meshes: {full, low: []}, materials: {body}, bones, palms, paint(), setLod, lod, lodCount: 1, scale, height, hairStyle, dispose()}. */
export function createAthleteV22Instance(T, source, {bodyId, cloneRig, appearance = {}, kit, style = 'soccer', height = null, track = x => x}) {
  const body = source.bodies[bodyId];
  if (!body) throw Error('Athlete body v22: body not loaded ' + bodyId);
  const root = cloneRig(body.scene), info = body.info;
  root.name = 'athlete'; root.userData.athleteBody = true; root.userData.athleteBodyV22 = true; root.userData.kitStyle = style; root.userData.bodyId = bodyId;
  const scale = (height || info.height) / body.height;
  root.scale.setScalar(scale); root.position.y = -body.floor * scale;
  const meshes = [], bones = {};
  root.traverse(o => { if (o.isMesh) meshes.push(o); if (o.isBone) bones[o.name] = o; });
  const geometries = [];
  const material = source.material;
  for (const mesh of meshes) {
    geometries.push(track(ownColors(T, mesh)));
    mesh.material = material; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true;
    if (mesh.morphTargetInfluences) {
      mesh.morphTargetInfluences.fill(0);
      const morph = V22_SPORT_MORPH[style], at = morph && mesh.morphTargetDictionary?.[morph];
      if (at !== undefined && at !== null) mesh.morphTargetInfluences[at] = 1;
    }
  }
  // the hairstyle: a rigid cap on the Head joint, in the head-local scale of the body
  let hairMesh = null;
  const hairStyle = appearance.hairStyle && source.hair[appearance.hairStyle] ? appearance.hairStyle : null;
  if (hairStyle) {
    const hair = source.hair[hairStyle].clone(true);
    hair.name = 'hair-' + hairStyle; hair.scale.set(info.width, 1, info.depth);
    hair.traverse(o => { if (o.isMesh && !hairMesh) hairMesh = o; });
    geometries.push(track(ownColors(T, hairMesh)));
    hairMesh.material = material; hairMesh.frustumCulled = false; hairMesh.castShadow = hairMesh.receiveShadow = true;
    bones.Head.add(hair);
    meshes.push(hairMesh);
  }
  const current = {skin: appearance.skin, hair: appearance.hair || '#1f1712', kit, style};
  function paint(next = {}) {
    Object.assign(current, next);
    const palette = v22Palette(T, v22Colors(current));
    for (const mesh of meshes) {
      const c = mesh.geometry.attributes.color, regions = mesh.userData.v22Regions;
      if (!c || !regions) continue;
      paintRegions(c.array, regions, mesh.userData.v22Base, palette, mesh === hairMesh ? V22_REGION.hair : null, c.itemSize);
      c.needsUpdate = true;
    }
  }
  paint();
  // palm anchors for a held ball (the body has no finger bones): a little below the wrist along the hand, toward the palm
  const palms = {};
  for (const [side, key] of [['Left', 'l'], ['Right', 'r']]) {
    const hand = bones[side + 'Hand'], a = new T.Object3D(); a.name = side + 'Palm';
    a.position.set(side === 'Left' ? 0.03 : -0.03, -0.1, 0.03); hand.add(a); palms[key] = a; palms[key + 'Wrist'] = hand;
  }
  return {root, meshes: {full: meshes, low: []}, materials: {body: material}, bones, palms, paint, setLod: () => 0, get lod() { return 0; }, lodCount: 1, scale, height: height || info.height, style, bodyId, hairStyle,
    dispose() { for (const g of geometries) g.dispose(); root.traverse(o => o.skeleton?.dispose?.()); root.removeFromParent(); }};
}

/** Triangle count of an instance (full mesh, hair included). */
export function v22Triangles(inst) {
  return inst.meshes.full.reduce((n, o) => n + (o.geometry.index?.count || o.geometry.attributes.position.count) / 3, 0);
}
