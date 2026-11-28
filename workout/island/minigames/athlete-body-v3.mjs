/** Athlete body v3 (28/11/2026): Roy, "השחקנים נראים מוזר ורע". The shared body of v22 / v2 is a football body (socks, studs, no face, mitten hands), so
 * in basketball it looked wrong. v3 is a new body on the SAME canonical 18-bone rig (names, order, parents and rest translations of every motion
 * library), so all clips of soccer v9..v12 and basketball tall / v8 / v11 / v13 play on it through the same identity map:
 *  - `soccer`: short-sleeve shirt with trim collar and cuffs, shorts, socks to under the knee, boots with studs, a shield-shaped team mark;
 *  - `hoops` (guard / wing / centre share the file; `broad` morph 0..1 widens limbs and torso): sleeveless jersey with trim edges, long shorts,
 *    high-top sneakers, bare shins (no socks);
 *  - both: a modelled face (nose, brows, eye sockets, chin, ears) with eyes, irises, brows, mouth and nostrils as thin decals on the head, hands with
 *    four fingers and a thumb, original eight hair caps on the Head joint, the player's number on the back (and the chest in basketball) as seven-segment
 *    geometry painted per player. No texture and no shader: one material, per-player vertex colours by region, like v22.
 * `?athleteV3=0` returns the previous bodies exactly (v2 / v22). Pure parts run in node tests; three.js only through `T`. */
import {athleteBodyV22Enabled, createAthleteV22Instance, V22_HAIR} from './athlete-body-v22.mjs?v=island-v2-20261107-25';
import {athleteRig} from './athlete-body.mjs';

export const V3_BASE = '../assets/athlete-body-v3/';
/** Natural stature (metres), width / depth factors for the hair cap (the v3 head is the same on every body), the file and the `broad` morph weight. */
export const V3_BODIES = Object.freeze({
  soccer: Object.freeze({height: 1.8, width: 1, depth: 1, file: 'soccer', broad: 0}),
  guard: Object.freeze({height: 1.78, width: 1, depth: 1, file: 'hoops', broad: 0}),
  wing: Object.freeze({height: 1.94, width: 1, depth: 1, file: 'hoops', broad: 0.5}),
  center: Object.freeze({height: 2.08, width: 1, depth: 1, file: 'hoops', broad: 1}),
});
export const V3_HAIR = V22_HAIR;
export const V3_REGION = Object.freeze({skin: 0, shirt: 1, shorts: 2, trim: 3, shoeUpper: 4, shoeSole: 5, eyes: 6, hair: 7, sock: 8, iris: 9, mouth: 10, pupil: 11, light: 12, laces: 13});
const CANON18 = ['Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
export const V3_MAP = Object.freeze(Object.fromEntries(CANON18.map(n => [n, n])));

/** On unless `?athleteV3=0`; `?athleteBody=0` / `?athleteBodyV22=0` (the older switches: previous bodies) switch it off too. */
export function athleteV3Enabled(search = globalThis.location?.search || '') {
  return athleteBodyV22Enabled(search) && new URLSearchParams(search).get('athleteV3') !== '0';
}

// ---- numbers ----------------------------------------------------------------------------------------------------------------------------
const DIGITS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
/** `_SEG` ids of the segments that show `number`: placement (0 chest, 1 back) * 21 + slot (0 single digit, 1 tens, 2 ones) * 7 + segment (a..g) + 1.
 * No number (null, out of 0..99, not an integer) = nothing shown. */
export function v3NumberSegments(number) {
  if (!Number.isInteger(number) || number < 0 || number > 99) return [];
  const out = [], put = (slot, d) => { for (const ch of DIGITS[d]) for (const placement of [0, 1]) out.push(placement * 21 + slot * 7 + 'abcdefg'.indexOf(ch) + 1); };
  if (number < 10) put(0, number); else { put(1, Math.floor(number / 10)); put(2, number % 10); }
  return out;
}
export const V3_HAND_SEG = 100;

// ---- loading -----------------------------------------------------------------------------------------------------------------------------
const cache = {files: new Map(), hair: new Map(), material: null};
export function resetAthleteV3() { cache.files.clear(); cache.hair.clear(); cache.material = null; }

/** The bodies and hairstyles once per page; `load(url)` is the GLTFLoader call. `bodies`: ids wanted ('soccer'; or 'guard' / 'wing' / 'center'). Returns the
 * loadAthleteV22 shape ({bodies:{id:{scene, height, floor, rig, bones, info, id}}, hair, material}) plus v3: true, so createAthleteV22Instance takes it as it is. */
export async function loadAthleteV3(load, {T, bodies = ['soccer'], hair = V3_HAIR, base = new URL(V3_BASE, import.meta.url).href} = {}) {
  const wantFile = file => {
    if (!cache.files.has(file)) {
      const p = (async () => (await load(base + 'models/' + file + '.glb')).scene)();
      p.catch(() => cache.files.delete(file));
      cache.files.set(file, p);
    }
    return cache.files.get(file);
  };
  const wantHair = id => {
    if (!cache.hair.has(id)) {
      const p = (async () => (await load(base + 'hair/' + id + '.glb')).scene)();
      p.catch(() => cache.hair.delete(id));
      cache.hair.set(id, p);
    }
    return cache.hair.get(id);
  };
  for (const id of bodies) if (!V3_BODIES[id]) throw Error('Athlete body v3: unknown body ' + id);
  const files = [...new Set(bodies.map(id => V3_BODIES[id].file))];
  const [sceneList, hairList] = await Promise.all([Promise.all(files.map(wantFile)), Promise.all(hair.map(wantHair))]);
  const byFile = Object.fromEntries(files.map((f, i) => [f, sceneList[i]]));
  const out = {bodies: {}, hair: {}, material: null, v3: true};
  for (const id of bodies) {
    const info = V3_BODIES[id], scene = byFile[info.file];
    scene.updateMatrixWorld(true);
    let minY = 0, height = info.height;
    if (T) { const box = new T.Box3().setFromObject(scene); if (Number.isFinite(box.max.y - box.min.y) && box.max.y > box.min.y) { minY = box.min.y; height = box.max.y - box.min.y; } }
    const bones = {}; scene.traverse(o => { if (o.isBone) bones[o.name] = o; });
    for (const name of CANON18) if (!bones[name]) throw Error('Athlete body v3 lacks bone ' + id + '/' + name);
    let mesh = null; scene.traverse(o => { if (!mesh && o.isSkinnedMesh) mesh = o; });
    if (!mesh?.geometry.attributes._seg) throw Error('Athlete body v3: ' + id + ' has no number segments');
    // the stature of a role is its own: the shared file holds the natural body at the guard's size, the root scale of the instance does the rest
    out.bodies[id] = {scene, height, floor: minY, rig: athleteRig(scene), bones, info, id, v3: true};
  }
  hair.forEach((id, i) => { out.hair[id] = hairList[i]; });
  if (T && !cache.material) cache.material = new T.MeshStandardMaterial({name: 'athlete_shared', vertexColors: true, roughness: 0.86, metalness: 0});
  out.material = cache.material;
  return out;
}

// ---- instances -----------------------------------------------------------------------------------------------------------------------------
/** One player: createAthleteV22Instance on the v3 body (same colour regions, same hair caps, same palm anchors) plus the number, the keeper's gloves and the
 * `broad` morph of the role. Returns the v22 instance with `v3` (the decoration controller: setNumber, setGloves, number, gloves). */
export function createAthleteV3Instance(T, source, opts) {
  const {bodyId, number = null, gloves = false} = opts;
  const inst = createAthleteV22Instance(T, source, opts);
  const info = source.bodies[bodyId].info;
  for (const mesh of inst.meshes.full) {
    const at = mesh.morphTargetDictionary?.broad;
    if (at !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[at] = info.broad || 0;
  }
  inst.v3 = decorateAthleteV3(inst, {number, gloves});
  return inst;
}

/** Number segments and keeper gloves on one instance: changes the per-player copy of the region of those vertices (the body is one mesh and one material). */
export function decorateAthleteV3(inst, {number = null, gloves = false} = {}) {
  const targets = [];
  for (const mesh of inst.meshes.full) {
    const attr = mesh.geometry?.attributes?._seg;
    if (!attr || mesh.userData.v22Hair || !mesh.userData.v22Regions) continue;
    const seg = new Uint8Array(attr.count);
    for (let i = 0; i < seg.length; i++) seg[i] = attr.getX(i);
    targets.push({mesh, seg, lod: mesh.userData.lod ?? 0});
  }
  if (!targets.length) throw Error('Athlete body v3: not a v3 body');
  let shown = null, wearing = null;
  const apply = () => {
    const on = new Set(v3NumberSegments(shown));
    for (const {mesh, seg, lod} of targets) {
      const regions = mesh.userData.v22Regions;
      for (let i = 0; i < seg.length; i++) {
        const s = seg[i];
        if (s >= 1 && s <= 42) { if (lod === 0) regions[i] = on.has(s) ? V3_REGION.trim : V3_REGION.shirt; }
        else if (s === V3_HAND_SEG) regions[i] = wearing ? V3_REGION.trim : V3_REGION.skin;
      }
    }
    inst.paint();
  };
  const ctl = {
    setNumber(n) { const value = Number.isInteger(n) && n >= 0 && n <= 99 ? n : null; if (value === shown) return; shown = value; apply(); },
    setGloves(on) { const value = Boolean(on); if (value === wearing) return; wearing = value; apply(); },
    get number() { return shown; },
    get gloves() { return Boolean(wearing); },
    dispose() { targets.length = 0; },
  };
  ctl.setGloves(gloves); ctl.setNumber(number);
  return ctl;
}
