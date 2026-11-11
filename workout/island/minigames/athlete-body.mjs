/** The one athlete body for every sports game (11/11/2026, "sports-deep-fable" M1).
 *
 * Why: Roy asked for the players of soccer and basketball to look the same, at the level of FIFA / NBA Live. Until now soccer played the
 * GPT v7 bodies (baked atlas, no team colours) and basketball the Codex "tall" bodies (flat vertex colours, one face). The realistic
 * athlete of `assets/athlete/athlete.glb` (MakeHuman CC0, 11.6K triangles, LOD1 5.3K, 31-bone CMU rig, skin shader with tone / hair /
 * stubble, kit shader with team colours, crest, back number, boots) is the only body that can be dressed per team, so it becomes the body of
 * both games. Every motion library of the project (soccer v7..v12, basketball tall / v8 / v11, the Codex QA) is on the canonical 18-bone rig;
 * this module retargets canonical clips onto the athlete skeleton (the world-basis method `compileAthleteRestartClips` proved on the restarts).
 *
 * What is here (no DOM; three.js only through the `T` argument where it is needed, so the pure parts run in node tests):
 *  - ATHLETE_MAP: canonical bone -> athlete bone. athleteRetargetMap(): the world-basis map for the design clip compiler of soccer
 *    (`compileSoccerDesignClips`) and for `retargetCanonicalClips` below (same algorithm, usable by basketball without the soccer module).
 *  - loadAthleteSource(): the GLB once per page (scene + the 13 CMU clips + the textures).
 *  - createAthleteInstance(): one player: cloned rig, its own materials (skin tone, hair, kit), face shape, LOD, scale to a height in metres,
 *    palm anchors for a held ball, bone aliases for the procedural layers (Chest -> Spine1).
 *  - kit styles: 'soccer' (jersey with sleeves, socks, boots) and 'basketball' (sleeveless jersey: the sleeve vertices of the kit mesh are
 *    discarded in the shader and the skin of the arms shows, white sneakers with a team accent).
 *  - `?athleteBody=0` returns both games to their previous bodies. */
export const ATHLETE_URL = '../assets/athlete/athlete.glb';
export const ATHLETE_SOURCE_HEIGHT_HINT = 1.87;
export const CANON18 = Object.freeze(['Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']);
/** Canonical bone -> athlete (CMU) bone. The GLB has no Root bone; loadAthleteSource inserts one above Hips so the libraries' Root tracks bind. */
export const ATHLETE_MAP = Object.freeze({Root: 'Root', Hips: 'Hips', Spine: 'Spine', Chest: 'Spine1', Neck: 'Neck', Head: 'Head', LeftArm: 'LeftArm', LeftForeArm: 'LeftForeArm', LeftHand: 'LeftHand', RightArm: 'RightArm', RightForeArm: 'RightForeArm', RightHand: 'RightHand', LeftUpLeg: 'LeftUpLeg', LeftLeg: 'LeftLeg', LeftFoot: 'LeftFoot', RightUpLeg: 'RightUpLeg', RightLeg: 'RightLeg', RightFoot: 'RightFoot'});
/** Athlete bones the procedural layers (arm swing, stand pose) address by canonical name. */
export const ATHLETE_ALIASES = Object.freeze({Chest: 'Spine1'});
/** Canonical rest translations (metres) of the 18-bone rig, used when a clip pack carries no skeleton of its own (basketball tall pack). */
export const CANON_REST = Object.freeze([
  {name: 'Root', parent: null, restTranslationMeters: [0, 0, 0]}, {name: 'Hips', parent: 'Root', restTranslationMeters: [0, 0.86, 0]},
  {name: 'Spine', parent: 'Hips', restTranslationMeters: [0, 0.2, 0]}, {name: 'Chest', parent: 'Spine', restTranslationMeters: [0, 0.18, 0]},
  {name: 'Neck', parent: 'Chest', restTranslationMeters: [0, 0.1, 0]}, {name: 'Head', parent: 'Neck', restTranslationMeters: [0, 0.13, 0]},
  {name: 'LeftArm', parent: 'Chest', restTranslationMeters: [0.16, 0.06, 0]}, {name: 'LeftForeArm', parent: 'LeftArm', restTranslationMeters: [0, -0.27, 0]}, {name: 'LeftHand', parent: 'LeftForeArm', restTranslationMeters: [0, -0.24, 0]},
  {name: 'RightArm', parent: 'Chest', restTranslationMeters: [-0.16, 0.06, 0]}, {name: 'RightForeArm', parent: 'RightArm', restTranslationMeters: [0, -0.27, 0]}, {name: 'RightHand', parent: 'RightForeArm', restTranslationMeters: [0, -0.24, 0]},
  {name: 'LeftUpLeg', parent: 'Hips', restTranslationMeters: [0.1, 0, 0]}, {name: 'LeftLeg', parent: 'LeftUpLeg', restTranslationMeters: [0, -0.41, 0]}, {name: 'LeftFoot', parent: 'LeftLeg', restTranslationMeters: [0, -0.37, 0]},
  {name: 'RightUpLeg', parent: 'Hips', restTranslationMeters: [-0.1, 0, 0]}, {name: 'RightLeg', parent: 'RightUpLeg', restTranslationMeters: [0, -0.41, 0]}, {name: 'RightFoot', parent: 'RightLeg', restTranslationMeters: [0, -0.37, 0]},
]);
/** Heights per sport and role (metres). Basketball keeps the Codex tall profiles (guard / wing / center). */
export const ATHLETE_HEIGHTS = Object.freeze({soccer: {field: 1.8, keeper: 1.86}, basketball: {guard: 1.88, wing: 1.98, center: 2.08}});
/** Width scale per basketball profile (x and z of the root): the MakeHuman athlete is a footballer, centres carry more frame. */
export const ATHLETE_BULK = Object.freeze({guard: 1.02, wing: 1.05, center: 1.09});
export const KIT_STYLES = Object.freeze(['soccer', 'basketball']);

/** `?athleteBody=0` keeps the previous bodies in both games; anything else (including no flag) uses the shared athlete. */
export function athleteBodyEnabled(search = globalThis.location?.search || '') {
  return new URLSearchParams(search).get('athleteBody') !== '0';
}

// ---- pure quaternion helpers (node tests) -------------------------------------------------------------------------------------------
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qinv = q => [-q[0], -q[1], -q[2], q[3]];
const qnorm = q => { const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };
const vnorm = v => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
/** Shortest rotation taking unit vector a to unit vector b (three.js setFromUnitVectors). */
export function qFromUnitVectors(a, b) {
  let r = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + 1;
  if (r < 1e-6) { r = 0; return qnorm(Math.abs(a[0]) > Math.abs(a[2]) ? [-a[1], a[0], 0, r] : [0, -a[2], a[1], r]); }
  return qnorm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], r]);
}

/** A rig description of the loaded athlete skeleton in the shape the design clip compiler expects ({joints:[{name,parent,translation}]}).
 * `scene` is the glTF scene (or any object holding the skinned meshes). */
export function athleteRig(scene) {
  let mesh = null; scene.traverse(o => { if (!mesh && o.isSkinnedMesh) mesh = o; });
  if (!mesh) throw Error('Athlete GLB has no skinned mesh');
  const bones = mesh.skeleton.bones;
  const joints = bones.map((bone, i) => ({name: bone.name, parent: bone.parent?.isBone ? bone.parent.name : null, translation: bone.position.toArray(), rotation: bone.quaternion.toArray(), scale: bone.scale.toArray(), inverseBindMatrix: mesh.skeleton.boneInverses[i].toArray()}));
  // the synthetic Root bone above Hips (see loadAthleteSource) is not a skin joint but every library has a Root track
  const top = bones[0]?.parent;
  if (top?.isBone && !bones.includes(top)) joints.unshift({name: top.name, parent: null, translation: top.position.toArray(), rotation: top.quaternion.toArray(), scale: top.scale.toArray(), inverseBindMatrix: null});
  return {joints};
}

/** The world-basis retarget map canonical -> athlete, from the bind pose of a rig description (`athleteRig`) and the canonical source bones
 * (`[{name, parent, restTranslationMeters}]`, the motion library's skeleton). Pure: works on the plain description, so tests need no three.js.
 *
 * For a mapped bone with a canonical child the basis is the shortest rotation from the athlete's own child direction to the canonical child
 * direction (the athlete binds its limbs diagonally, the canonical rig straight down); world = sourceWorld * basis then points the limb where
 * the clip points it. End bones (hands, feet, head) keep their bind orientation relative to the source bone. Athlete bones the canonical rig
 * lacks (LowerBack, shoulders, fingers, toes) ride on the nearest mapped ancestor with their bind local rotation folded into the basis, which
 * is what `compileAthleteRestartClips` did bone by bone. motionScale = athlete hips height / canonical hips height (0.86). */
export function athleteRetargetMap(rig, sourceBones = CANON_REST, map = ATHLETE_MAP) {
  const joints = new Map(rig.joints.map(j => [j.name, j])), reverse = {};
  for (const [src, tgt] of Object.entries(map)) if (tgt) reverse[tgt] = src;
  const srcByName = new Map(sourceBones.map(b => [b.name, b]));
  const childOf = name => sourceBones.find(b => b.parent === name);
  const basis = {}, entries = [];
  const resolve = joint => {
    if (basis[joint.name]) return basis[joint.name];
    const src = reverse[joint.name];
    if (src && srcByName.has(src)) {
      const child = childOf(src), targetChild = child && map[child.name] && joints.get(map[child.name]);
      const q = child && targetChild ? qFromUnitVectors(vnorm(targetChild.translation), vnorm(child.restTranslationMeters)) : qnorm(joint.rotation || [0, 0, 0, 1]);
      basis[joint.name] = {source: src, q}; return basis[joint.name];
    }
    const parent = joint.parent && joints.get(joint.parent);
    if (!parent) throw Error('Athlete retarget: no mapped ancestor for ' + joint.name);
    const p = resolve(parent);
    basis[joint.name] = {source: p.source, inherit: true, q: qmul(p.q, qnorm(joint.rotation || [0, 0, 0, 1]))}; return basis[joint.name];
  };
  for (const joint of rig.joints) {
    const b = resolve(joint);
    entries.push(b.inherit ? {source: null, inheritSource: b.source, target: joint.name, targetBasisWorldQuaternion: b.q} : {source: b.source, target: joint.name, inheritSource: null, targetBasisWorldQuaternion: b.q});
  }
  const hipsY = joints.get(map.Hips)?.translation[1] || 0.86, srcHipsY = srcByName.get('Hips')?.restTranslationMeters[1] || 0.86;
  return {bones: entries, motionScale: hipsY / srcHipsY, targetBoneCount: rig.joints.length, canonical: Object.keys(map)};
}

/** Retarget canonical clip states ({name:{durationSeconds, loop, keyframes:[{time (0..1), rotations:{bone:[x,y,z,w]}, hipsOffsetMeters}]}})
 * onto a rig through a map from `athleteRetargetMap` (the algorithm of soccer's compileSoccerDesignClips, usable by every game).
 * Returns three.js AnimationClips (Hips.position in metres of the rig, Root.position zero: the game places the player). */
export function retargetCanonicalClips(T, states, sourceBones, rig, map) {
  const targets = new Map(map.bones.map(b => [b.target, b])), Q = a => new T.Quaternion().fromArray(a).normalize();
  const hipsJoint = rig.joints.find(j => j.name === (map.hipsTarget || 'Hips'));
  if (!hipsJoint) throw Error('Athlete retarget: rig has no Hips');
  const clips = [];
  for (const [name, state] of Object.entries(states)) {
    const times = state.keyframes.map(k => k.time * state.durationSeconds), values = Object.fromEntries(rig.joints.map(j => [j.name, []])), hips = [], root = [];
    for (const frame of state.keyframes) {
      const source = {}, world = {};
      for (const b of sourceBones) source[b.name] = (b.parent ? source[b.parent].clone() : new T.Quaternion()).multiply(Q(frame.rotations[b.name] || [0, 0, 0, 1]));
      for (const joint of rig.joints) {
        const entry = targets.get(joint.name), from = entry && source[entry.source || entry.inheritSource];
        if (!from) throw Error('Athlete retarget: missing target ' + joint.name);
        world[joint.name] = from.clone().multiply(Q(entry.targetBasisWorldQuaternion));
        const local = joint.parent ? world[joint.parent].clone().invert().multiply(world[joint.name]) : world[joint.name].clone();
        const prev = values[joint.name], n = prev.length;
        if (n && local.x * prev[n - 4] + local.y * prev[n - 3] + local.z * prev[n - 2] + local.w * prev[n - 1] < 0) local.set(-local.x, -local.y, -local.z, -local.w);
        prev.push(local.x, local.y, local.z, local.w);
      }
      const off = frame.hipsOffsetMeters || [0, 0, 0];
      hips.push(hipsJoint.translation[0] + off[0] * map.motionScale, hipsJoint.translation[1] + off[1] * map.motionScale, hipsJoint.translation[2] + off[2] * map.motionScale);
      root.push(0, 0, 0);
    }
    const tracks = rig.joints.map(j => new T.QuaternionKeyframeTrack(`${j.name}.quaternion`, times, values[j.name]));
    tracks.push(new T.VectorKeyframeTrack(`${hipsJoint.name}.position`, times, hips));
    if (rig.joints.some(j => j.name === 'Root')) tracks.push(new T.VectorKeyframeTrack('Root.position', times, root));
    const clip = new T.AnimationClip(name, state.durationSeconds, tracks); clip.userData = {loop: !!state.loop, canonical: true}; clips.push(clip);
  }
  return clips;
}

// ---- loading and instances ----------------------------------------------------------------------------------------------------------
let sourcePromise = null;
/** The athlete GLB once per page: {scene, animations, height (metres of the bind pose), rig, bones}. `load(url)` is the loader call
 * (GLTFLoader.loadAsync). The sources are never disposed: every player clones its rig from them. A failed load is forgotten so the next
 * game retries. */
export function loadAthleteSource(load, {url = new URL(ATHLETE_URL, import.meta.url).href, T = null, prepare = null} = {}) {
  if (sourcePromise) return sourcePromise;
  sourcePromise = (async () => {
    try {
      const data = await load(url), scene = data.scene;
      const ball = scene.getObjectByName('Ball'); if (ball) ball.removeFromParent();
      scene.updateMatrixWorld(true);
      let minY = Infinity, maxY = -Infinity;
      if (T) { const box = new T.Box3().setFromObject(scene); minY = box.min.y; maxY = box.max.y; }
      const height = Number.isFinite(maxY - minY) && maxY > minY ? maxY - minY : ATHLETE_SOURCE_HEIGHT_HINT;
      const bones = {}; scene.traverse(o => { if (o.isBone) bones[o.name] = o; });
      if (!bones.Root && T && bones[ATHLETE_MAP.Hips]) { const hips = bones[ATHLETE_MAP.Hips], parent = hips.parent, rootBone = new T.Bone(); rootBone.name = 'Root'; parent.add(rootBone); rootBone.add(hips); bones.Root = rootBone; scene.updateMatrixWorld(true); }
      for (const name of Object.values(ATHLETE_MAP)) if (name && !bones[name]) throw Error('Athlete GLB lacks bone ' + name);
      return {scene, animations: data.animations || [], ball, height, floor: Number.isFinite(minY) ? minY : 0, rig: athleteRig(scene), bones, materials: prepare ? prepare(scene) : null};
    } catch (error) { sourcePromise = null; throw error; }
  })();
  return sourcePromise;
}
/** Tests and page reloads: forget the cached source. */
export function resetAthleteSource() { sourcePromise = null; }

/** Which kit mesh vertices are the sleeves: the share of skin weight on the arm bones. A tank top (basketball) discards them in the shader so
 * the skin of the upper arm shows. Threshold 0.34: the shoulder cap of the jersey (weighted to Spine1 / Shoulder) stays, the sleeve (LeftArm)
 * goes. Pure: works on plain typed arrays (skinIndex / skinWeight, 4 influences) and a bone-name list in skeleton order. */
export function sleeveWeights(skinIndex, skinWeight, boneNames, threshold = 0.34) {
  const arms = new Set(['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'].map(n => boneNames.indexOf(n)));
  const count = skinIndex.length / 4, out = new Float32Array(count);
  let sleeves = 0;
  // continuous: the shader cuts at 0.5 of the interpolated value, so the armhole follows the skin-weight falloff instead of triangle edges
  for (let i = 0; i < count; i++) {
    let w = 0; for (let k = 0; k < 4; k++) if (arms.has(skinIndex[i * 4 + k])) w += skinWeight[i * 4 + k];
    out[i] = Math.min(1, Math.max(0, 0.5 + (w - threshold) * 2.2)); if (w >= threshold) sleeves++;
  }
  return {weights: out, sleeves, count};
}

/** Team colours -> a kit in the shape the kit shader takes. `style` 'soccer' or 'basketball'; `keeper` gives the contrasting keeper kit. */
export function athleteKitFor(style, colors, {keeper = false, keeperColor = '#cf9d2e', selected = null, accent = null} = {}) {
  if (selected) return {...selected, style};
  const [primary, secondary = '#ffffff'] = colors || ['#2868ee', '#ffcf69'];
  if (style === 'basketball') {
    const trim = accent || secondary;
    return {style, primary, secondary: trim, shorts: primary, shortsTrim: trim, socks: '#f4f4f0', socksTrim: trim, boots: '#f6f6f3', bootAccent: trim};
  }
  if (keeper) return {style, primary: keeperColor, secondary: '#1d2430', shorts: '#1d2430', shortsTrim: keeperColor, socks: keeperColor, socksTrim: '#1d2430'};
  return {style, primary, secondary, shorts: secondary === '#ffcf69' ? '#f2f2ee' : '#20242c', shortsTrim: primary, socks: primary, socksTrim: secondary};
}

/** The height an athlete gets: `heightM` wins, otherwise the sport / role table. */
export function athleteHeight(sport, role, heightM = null) {
  if (Number.isFinite(heightM) && heightM > 1) return heightM;
  const table = ATHLETE_HEIGHTS[sport] || ATHLETE_HEIGHTS.soccer;
  return table[role] ?? Object.values(table)[0];
}

/** One player on the shared body. `createMaterials` is soccer-athlete's createAthleteMaterials (passed in, so this module has no soccer import
 * and the hoops bundle loads it the same way); `cloneRig` clones a skinned hierarchy (soccer-rig cloneSoccerRig / SkeletonUtils clone).
 * Returns {root, meshes, materials, bones (by athlete name, plus canonical aliases), palms {l, r} (anchors on the hands for a held ball),
 * setLod(level) -> level, lodCount, scale, height, dispose()}. The root is scaled to `height` metres and lifted so the soles sit on y=0. */
export function createAthleteInstance(T, source, {createMaterials, cloneRig, profile, kit, number = 0, numbers = null, track = x => x, style = 'soccer', height = 1.8, sleeveGeometry = null, bulk = 1}) {
  const root = cloneRig(source.scene);
  root.name = 'athlete'; root.userData.athleteBody = true; root.userData.kitStyle = style;
  const scale = height / source.height; root.scale.set(scale * bulk, scale, scale * bulk); root.position.y = -source.floor * scale;
  const mats = createMaterials(T, source.materials, {profile, kit, numbers, cell: number, track, sleeveless: style === 'basketball'});
  const full = [], low = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = o.receiveShadow = true;
    const name = o.material?.name;
    if (name === 'athlete-skin') o.material = mats.skin; else if (name === 'athlete-kit') { o.material = mats.kit; if (sleeveGeometry) o.geometry = sleeveGeometry.get(o.geometry) || o.geometry; }
    if (o.morphTargetDictionary) for (const [key, value] of Object.entries(profile?.shape || {})) if (o.morphTargetDictionary[key] !== undefined) o.morphTargetInfluences[o.morphTargetDictionary[key]] = value;
    (/LOD1/.test(o.name) || /LOD1/.test(o.parent?.name || '') ? low : full).push(o);
  });
  let lod = 0;
  const setLod = level => { const next = level > 0 && low.length ? 1 : 0; if (next !== lod) { lod = next; full.forEach(o => o.visible = lod === 0); low.forEach(o => o.visible = lod === 1); } return lod; };
  setLod(0);
  const bones = {}; root.traverse(o => { if (o.isBone) bones[o.name] = o; });
  for (const [alias, name] of Object.entries(ATHLETE_ALIASES)) if (!bones[alias] && bones[name]) bones[alias] = bones[name];
  // palm anchors: between the wrist and the finger base, a little toward the palm side (the model's palms face inward at rest)
  const palms = {};
  for (const [side, key] of [['Left', 'l'], ['Right', 'r']]) {
    const hand = bones[side + 'Hand'], fingers = bones[side + 'FingerBase'] || bones[side + 'HandFinger1'];
    const a = new T.Object3D(); a.name = side + 'Palm';
    if (fingers) a.position.copy(fingers.position).multiplyScalar(0.75); else a.position.set(0, -0.08, 0);
    hand.add(a); palms[key] = a; palms[key + 'Wrist'] = hand;
  }
  return {root, meshes: {full, low}, materials: mats, bones, palms, setLod, get lod() { return lod; }, lodCount: low.length ? 2 : 1, scale, height, style,
    dispose() { for (const m of [mats.skin, mats.kit]) m.dispose(); root.traverse(o => o.skeleton?.dispose?.()); root.removeFromParent(); }};
}

/** Per-style shared kit geometry: the basketball variant carries the `_sleeve` attribute. Built once per source and cached on it. */
export function athleteKitGeometry(T, source, style) {
  if (style !== 'basketball') return null;
  source.sleeveGeometry ||= new Map();
  if (source.sleeveGeometry.size) return source.sleeveGeometry;
  let skeletonNames = null;
  source.scene.traverse(o => {
    if (!o.isSkinnedMesh || o.material?.name !== 'athlete-kit') return;
    skeletonNames ||= o.skeleton.bones.map(b => b.name);
    const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const idx = new Uint16Array(si.count * 4), w = new Float32Array(sw.count * 4);
    for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) { idx[i * 4 + k] = k === 0 ? si.getX(i) : k === 1 ? si.getY(i) : k === 2 ? si.getZ(i) : si.getW(i); w[i * 4 + k] = k === 0 ? sw.getX(i) : k === 1 ? sw.getY(i) : k === 2 ? sw.getZ(i) : sw.getW(i); }
    const {weights} = sleeveWeights(idx, w, skeletonNames);
    const copy = g.clone(); copy.setAttribute('_sleeve', new T.BufferAttribute(weights, 1)); source.sleeveGeometry.set(g, copy);
  });
  return source.sleeveGeometry;
}
