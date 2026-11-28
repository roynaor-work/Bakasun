import {assertReleaseReference} from './helpers/island-release.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {athleteV3Enabled, v3NumberSegments, V3_BODIES, V3_HAIR, V3_MAP, V3_REGION, V3_HAND_SEG, decorateAthleteV3} from '../workout/island/minigames/athlete-body-v3.mjs';
import {CANON_REST, CANON18} from '../workout/island/minigames/athlete-body.mjs';

const island = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../workout/island');
const dir = path.join(island, 'assets/athlete-body-v3');
const read = file => readFile(path.join(island, file), 'utf8');
const manifest = JSON.parse(await read('offline-manifest.json'));
const bodyManifest = JSON.parse(await readFile(path.join(dir, 'body-manifest.json'), 'utf8'));
const TYPES = {5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4]};
const WIDTH = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16};
async function glb(file) {
  const b = await readFile(file), jl = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8')), bl = b.readUInt32LE(20 + jl);
  const bin = b.subarray(28 + jl, 28 + jl + bl);
  const accessor = i => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], [Type, size] = TYPES[a.componentType], n = WIDTH[a.type], stride = v.byteStride || size * n;
    const out = new Float64Array(a.count * n);
    for (let e = 0; e < a.count; e++) for (let c = 0; c < n; c++) {
      const at = (v.byteOffset || 0) + (a.byteOffset || 0) + e * stride + c * size;
      out[e * n + c] = new Type(bin.buffer.slice(bin.byteOffset + at, bin.byteOffset + at + size))[0];
    }
    return {data: out, n, a};
  };
  return {json, bin, bytes: b.length, accessor};
}
const SPORT_FILES = ['soccer', 'hoops'];
const triangles = j => j.meshes.flatMap(m => m.primitives).reduce((n, p) => n + j.accessors[p.indices].count / 3, 0);

test('the runtime folder holds two bodies and eight hair caps, no texture, no compression', async () => {
  assert.deepEqual((await readdir(path.join(dir, 'models'))).sort(), ['hoops.glb', 'soccer.glb']);
  assert.deepEqual((await readdir(path.join(dir, 'hair'))).sort(), V3_HAIR.map(h => h + '.glb').sort());
  assert.deepEqual((await readdir(dir)).sort(), ['body-manifest.json', 'hair', 'models']);
  for (const f of [...SPORT_FILES.map(s => 'models/' + s), ...V3_HAIR.map(h => 'hair/' + h)]) {
    const {json} = await glb(path.join(dir, f + '.glb'));
    assert.ok(!json.extensionsUsed && !json.extensionsRequired, f + ' uses no extension (no Draco, meshopt, KTX2, quantization)');
    assert.ok(!json.images && !json.textures, f + ' has no texture');
    assert.equal(json.asset.copyright.startsWith('CC0-1.0'), true);
  }
});

test('the manifest hashes match the files', async () => {
  for (const m of [...bodyManifest.models, ...bodyManifest.hair]) assert.equal(createHash('sha256').update(await readFile(path.join(dir, m.path))).digest('hex'), m.sha256, m.id);
  for (const m of bodyManifest.models) assert.equal((await stat(path.join(dir, m.path))).size, m.bytes, m.id);
  for (const h of bodyManifest.hair) assert.equal((await stat(path.join(dir, h.path))).size, h.bytes, h.id);
});

test('every body is the canonical 18-bone rig: same names, order, parents and rest translations as every motion library', async () => {
  for (const file of SPORT_FILES) {
    const {json} = await glb(path.join(dir, 'models', file + '.glb'));
    assert.equal(json.skins.length, 1);
    const joints = json.skins[0].joints.map(i => json.nodes[i]);
    assert.deepEqual(joints.map(n => n.name), CANON18, file + ' joint order');
    for (const bone of CANON_REST) {
      const node = joints.find(n => n.name === bone.name), parent = json.nodes.find(n => n.children?.includes(json.nodes.indexOf(node)));
      assert.equal(parent?.name ?? null, bone.parent ?? 'BodyScale', file + ' parent of ' + bone.name);
      for (let k = 0; k < 3; k++) assert.ok(Math.abs((node.translation?.[k] ?? 0) - bone.restTranslationMeters[k]) < 1e-6, `${file} ${bone.name}[${k}]`);
      assert.ok(!node.rotation || node.rotation.slice(0, 3).every(v => v === 0), file + ' rest rotation of ' + bone.name);
    }
    assert.deepEqual(V3_MAP, Object.fromEntries(CANON18.map(n => [n, n])), 'identity map');
  }
});

test('inverse bind matrices are those of the v22 body (so no clip needs a retarget)', async () => {
  const ref = await glb(path.join(island, 'assets/athlete-body-v22/models/soccer.glb'));
  const refIbm = ref.accessor(ref.json.skins[0].inverseBindMatrices).data;
  for (const file of SPORT_FILES) {
    const {json, accessor} = await glb(path.join(dir, 'models', file + '.glb'));
    const ibm = accessor(json.skins[0].inverseBindMatrices).data;
    for (let i = 0; i < refIbm.length; i++) assert.ok(Math.abs(ibm[i] - refIbm[i]) < 1e-6, file + ' ibm ' + i);
  }
});

test('triangle budget: a body with head and hands stays under 6,000, a hair cap under 750; stature and floor are the canonical ones', async () => {
  for (const file of SPORT_FILES) {
    const {json, accessor} = await glb(path.join(dir, 'models', file + '.glb'));
    assert.ok(triangles(json) <= 6000, file + ' ' + triangles(json));
    const p = json.meshes[0].primitives[0], pos = accessor(p.attributes.POSITION);
    let lo = Infinity, hi = -Infinity;
    for (let i = 1; i < pos.data.length; i += 3) { lo = Math.min(lo, pos.data[i]); hi = Math.max(hi, pos.data[i]); }
    assert.ok(Math.abs(lo - 0.0051) < 0.0006, file + ' soles on the canonical floor ' + lo);
    assert.ok(Math.abs(hi - lo - 1.7305) < 0.002, file + ' canonical height ' + (hi - lo));
    assert.equal(json.nodes[0].name, 'BodyScale');
    assert.ok(Math.abs(json.nodes[0].scale[0] * (hi - lo) - json.nodes[0].extras.statureMeters) < 0.002, file + ' stature');
  }
  for (const style of V3_HAIR) { const {json} = await glb(path.join(dir, 'hair', style + '.glb')); assert.ok(triangles(json) <= 750, style); }
});

test('vertex data: weights sum to one, joints are the 18 bones, regions and number segments are legal, the hands and the digits exist', async () => {
  for (const file of SPORT_FILES) {
    const {json, accessor} = await glb(path.join(dir, 'models', file + '.glb')), p = json.meshes[0].primitives[0];
    const J = accessor(p.attributes.JOINTS_0).data, W = accessor(p.attributes.WEIGHTS_0).data, R = accessor(p.attributes._REGION).data, S = accessor(p.attributes._SEG).data, C = accessor(p.attributes.COLOR_0).data;
    const n = R.length;
    assert.equal(accessor(p.attributes.POSITION).data.length, n * 3);
    for (let i = 0; i < n; i++) {
      let sum = 0; for (let k = 0; k < 4; k++) { sum += W[i * 4 + k]; if (W[i * 4 + k] > 0) assert.ok(J[i * 4 + k] < 18, 'joint index'); }
      assert.equal(sum, 255, 'weights of vertex ' + i);
      assert.ok(R[i] <= V3_REGION.laces, 'region');
      assert.ok(S[i] === 0 || (S[i] >= 1 && S[i] <= 42) || S[i] === V3_HAND_SEG, 'seg ' + S[i]);
    }
    for (const v of C) assert.ok(v >= 0 && v <= 1);
    const segs = new Set(S);
    assert.ok(segs.has(V3_HAND_SEG), 'hands are marked (keeper gloves)');
    const back = [...segs].filter(s => s >= 22 && s <= 42).length;
    assert.equal(back, 21, file + ' back digits: 3 slots x 7 segments');
    const chest = [...segs].filter(s => s >= 1 && s <= 21).length;
    assert.equal(chest, file === 'hoops' ? 21 : 0, file + ' chest digits only in basketball');
    for (const id of [V3_REGION.eyes, V3_REGION.iris, V3_REGION.pupil, V3_REGION.mouth, V3_REGION.sole ?? V3_REGION.shoeSole, V3_REGION.shoeUpper, V3_REGION.laces]) assert.ok(new Set(R).has(id), 'region ' + id + ' in ' + file);
    assert.ok(new Set(R).has(V3_REGION.sock) === (file === 'soccer'), 'socks only in football');
    assert.equal(Boolean(json.meshes[0].extras.targetNames?.includes('broad')), file === 'hoops');
  }
});

test('v3NumberSegments: 0..99, single digits centred, two digits side by side, nothing outside the range', () => {
  assert.deepEqual(v3NumberSegments(null), []); assert.deepEqual(v3NumberSegments(100), []); assert.deepEqual(v3NumberSegments(-1), []); assert.deepEqual(v3NumberSegments(2.5), []);
  const seen = new Set();
  for (let n = 0; n <= 99; n++) {
    const s = v3NumberSegments(n); assert.ok(s.length > 0, 'number ' + n);
    seen.add(s.slice().sort((a, b) => a - b).join());
    for (const id of s) assert.ok(id >= 1 && id <= 42);
    const slots = new Set(s.map(id => Math.floor(((id - 1) % 21) / 7)));
    assert.deepEqual([...slots].sort(), n < 10 ? [0] : [1, 2], 'slots of ' + n);
  }
  assert.equal(seen.size, 100, 'all hundred numbers differ');
  assert.equal(v3NumberSegments(8).length, 14, 'an 8 lights seven segments on the chest and seven on the back');
  assert.equal(v3NumberSegments(1).length, 4);
});

test('flag: off by default (first review: the basketball legs look like pipes), ?athleteV3=1 turns it on and the older switches still win', () => {
  assert.equal(athleteV3Enabled(''), false);
  assert.equal(athleteV3Enabled('?athleteV3=0'), false);
  assert.equal(athleteV3Enabled('?athleteBodyV22=0'), false);
  assert.equal(athleteV3Enabled('?athleteBody=0'), false);
  assert.equal(athleteV3Enabled('?athleteV3=1'), true);
  assert.equal(athleteV3Enabled('?athleteV3=1&athleteBodyV22=0'), false);
  assert.deepEqual(Object.keys(V3_BODIES), ['soccer', 'guard', 'wing', 'center']);
  assert.deepEqual([...V3_HAIR], ['buzz', 'crop', 'side-part', 'quiff', 'curls', 'afro', 'swept-back', 'bun']);
});

test('decorateAthleteV3 switches the number segments and the glove vertices on a per-player region copy', () => {
  const seg = Uint8Array.from([0, 1, 2, 22, 23, 100, 100, 30]);
  const regions = new Uint8Array(seg.length).fill(V3_REGION.shirt); regions[5] = regions[6] = V3_REGION.skin;
  let paints = 0;
  const mesh = {isSkinnedMesh: true, geometry: {attributes: {_seg: {count: seg.length, getX: i => seg[i]}}}, userData: {v22Regions: regions, lod: 0}};
  const inst = {meshes: {full: [mesh]}, paint() { paints++; }};
  const d = decorateAthleteV3(inst, {number: 8, gloves: true});
  assert.equal(d.number, 8); assert.equal(d.gloves, true);
  assert.equal(regions[1], V3_REGION.trim); assert.equal(regions[3], V3_REGION.trim); assert.equal(regions[5], V3_REGION.trim);
  d.setNumber(null); assert.equal(regions[1], V3_REGION.shirt); assert.equal(regions[3], V3_REGION.shirt);
  d.setGloves(false); assert.equal(regions[5], V3_REGION.skin);
  const before = paints; d.setNumber(null); d.setGloves(false); assert.equal(paints, before, 'no repaint when nothing changes');
  assert.throws(() => decorateAthleteV3({meshes: {full: []}}), /not a v3 body/);
});

test('wiring: both games try v3 first, keep the previous body on any failure, and release tags match', async () => {
  const soccer = await read('minigames/soccer-design-character.mjs'), hoops = await read('minigames/hoops-athlete.mjs');
  for (const s of [soccer, hoops]) { assertReleaseReference(s, 'athlete-body-v3.mjs'); assert.match(s, /athleteV3Enabled\(/); }
  assert.match(soccer, /loadAthleteV3\(.*\)\.catch\(error=>\{lastAthleteV3Error=.*return previous\(\);\}\)/);
  assert.match(hoops, /catch\(error\)\{v22=null;onFallback\?\.\('athlete-body-v3',error\);\}/);
  assert.match(hoops, /if\(!v22&&hoopsBodyV2Enabled\(search\)\)/, 'the v2 and v22 bodies stay as the fallbacks');
  assert.match(soccer, /config\.v249Look&&!athleteV3/, 'v3 has its own proportions: no joint-scale look');
  const mod = await read('minigames/athlete-body-v3.mjs');
  assertReleaseReference(mod, 'athlete-body-v22.mjs');
});

test('offline list: both games cache their v3 files, the shell list is up to date', async () => {
  const hairFiles = V3_HAIR.map(h => 'assets/athlete-body-v3/hair/' + h + '.glb');
  for (const [game, body] of [['soccer', 'soccer'], ['hoops', 'hoops']]) {
    for (const f of ['assets/athlete-body-v3/models/' + body + '.glb', ...hairFiles]) assert.ok(manifest.games[game].includes(f), game + ' ' + f);
  }
  assert.ok(!manifest.games.soccer.includes('assets/athlete-body-v3/models/hoops.glb') && !manifest.games.hoops.includes('assets/athlete-body-v3/models/soccer.glb'), 'each game downloads only its body');
  assert.ok(manifest.shell.includes('minigames/athlete-body-v3.mjs'));
  let bytes = 0; for (const f of [...hairFiles, 'assets/athlete-body-v3/models/soccer.glb', 'assets/athlete-body-v3/models/hoops.glb']) bytes += (await stat(path.join(island, f))).size;
  assert.ok(bytes < 700 * 1024, 'the whole v3 download is under 700 KB: ' + bytes);
});
