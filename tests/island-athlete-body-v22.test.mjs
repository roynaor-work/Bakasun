import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {athleteBodyV22Enabled, paintRegions, v22SkinFor, v22HairFor, v22BodyFor, v22Height, v22Colors, V22_BODIES, V22_HAIR, V22_SKIN, V22_REGION, V22_MAP, V22_LEG_RATIO} from '../workout/island/minigames/athlete-body-v22.mjs';
import {CANON_REST, CANON18, athleteRetargetMap} from '../workout/island/minigames/athlete-body.mjs';
import {buildShell} from '../workout/island/tools/offline-shell.mjs';

const island = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../workout/island');
const dir = path.join(island, 'assets/athlete-body-v22');
const read = file => readFile(path.join(island, file), 'utf8');
const manifest = JSON.parse(await read('offline-manifest.json'));
const bodyManifest = JSON.parse(await readFile(path.join(dir, 'body-manifest.json'), 'utf8'));
/** The JSON chunk and the binary chunk of a GLB (no three.js: the files are checked as bytes). */
async function glb(file) {
  const b = await readFile(file), jl = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bl = b.readUInt32LE(20 + jl);
  return {json, bin: b.subarray(28 + jl, 28 + jl + bl), bytes: b.length};
}
const triangles = j => j.meshes.flatMap(m => m.primitives).reduce((n, p) => n + j.accessors[p.indices].count / 3, 0);
const HAIR_TRIANGLES = {buzz: 456, crop: 456, 'side-part': 456, quiff: 456, curls: 656, afro: 456, 'swept-back': 456, bun: 368};

test('the Codex files are in the runtime folder: four bodies, eight hairstyles, one shared atlas', async () => {
  for (const id of Object.keys(V22_BODIES)) assert.ok((await stat(path.join(dir, 'models', id + '.glb'))).size > 100000, id);
  for (const id of V22_HAIR) assert.ok((await stat(path.join(dir, 'hair', id + '.glb'))).size > 1000, id);
  assert.equal((await stat(path.join(dir, 'textures/athlete-atlas.png'))).size, 474663);
  assert.deepEqual((await readdir(path.join(dir, 'models'))).sort(), ['center.glb', 'guard.glb', 'soccer.glb', 'wing.glb']);
  assert.equal((await readdir(path.join(dir, 'hair'))).length, 8);
});

test('the copies are byte-identical to the Codex files (the manifest hashes match)', async () => {
  for (const m of bodyManifest.models) {
    const sha = createHash('sha256').update(await readFile(path.join(dir, 'models', m.id + '.glb'))).digest('hex');
    assert.equal(sha, m.sha256, m.id);
  }
  for (const h of bodyManifest.hair) {
    const sha = createHash('sha256').update(await readFile(path.join(dir, 'hair', h.id + '.glb'))).digest('hex');
    assert.equal(sha, h.sha256, h.id);
  }
});

test('every body is the canonical 18-bone rig: same names, order, parents and rest translations as every motion library', async () => {
  for (const id of Object.keys(V22_BODIES)) {
    const {json} = await glb(path.join(dir, 'models', id + '.glb'));
    assert.equal(json.skins.length, 1);
    const joints = json.skins[0].joints.map(i => json.nodes[i]);
    assert.deepEqual(joints.map(n => n.name), CANON18, id + ' joint order');
    assert.equal(joints.length, 18);
    for (const bone of CANON_REST) {
      const node = joints.find(n => n.name === bone.name), parent = json.nodes.find(n => n.children?.includes(json.nodes.indexOf(node)));
      assert.equal(parent?.name ?? null, bone.parent ?? 'BodyScale', id + ' parent of ' + bone.name);
      for (let k = 0; k < 3; k++) assert.ok(Math.abs((node.translation?.[k] ?? 0) - bone.restTranslationMeters[k]) < 1e-6, `${id} ${bone.name}[${k}]`);
      assert.ok(!node.rotation || node.rotation.slice(0, 3).every(v => v === 0), id + ' rest rotation of ' + bone.name + ' is identity');
    }
    assert.equal(json.skins[0].joints.length, 18);
  }
});

test('the identity map retargets canonical clips without re-aiming a joint', () => {
  const rig = {joints: CANON_REST.map(b => ({name: b.name, parent: b.parent, translation: b.restTranslationMeters, rotation: [0, 0, 0, 1]}))};
  const map = athleteRetargetMap(rig, CANON_REST, V22_MAP, {tweaks: {}});
  assert.equal(map.bones.length, 18);
  assert.ok(Math.abs(map.motionScale - 1) < 1e-9);
  for (const b of map.bones) { const q = b.targetBasisWorldQuaternion; assert.ok(Math.abs(Math.abs(q[3]) - 1) < 1e-9 && Math.abs(q[0]) + Math.abs(q[1]) + Math.abs(q[2]) < 1e-9, b.target + ' basis is identity'); assert.equal(b.source, b.target); }
});

test('no decoder is needed: no Draco, no meshopt, no extension at all; one primitive, one material, the shared atlas', async () => {
  const files = [...Object.keys(V22_BODIES).map(id => 'models/' + id + '.glb'), ...V22_HAIR.map(id => 'hair/' + id + '.glb')];
  for (const f of files) {
    const {json} = await glb(path.join(dir, f));
    assert.ok(!json.extensionsUsed?.length && !json.extensionsRequired?.length, f + ' extensions');
    assert.ok(!/draco|meshopt/i.test(JSON.stringify(json)), f);
    assert.equal(json.materials.length, 1); assert.equal(json.materials[0].name, 'athlete_shared');
    assert.equal(json.images.length, 1); assert.equal(json.images[0].uri.endsWith('textures/athlete-atlas.png'), true);
    assert.equal(json.meshes.length, 1); assert.equal(json.meshes[0].primitives.length, 1);
  }
});

test('triangle budget: at most 5,736 per player (body + one hairstyle), below the previous athlete (11,614 full, 5,336 economy + the same number of draw calls)', async () => {
  let worst = 0;
  for (const id of Object.keys(V22_BODIES)) {
    const {json} = await glb(path.join(dir, 'models', id + '.glb'));
    const t = triangles(json), declared = bodyManifest.models.find(m => m.id === id).triangles;
    assert.equal(t, declared, id);
    assert.equal(json.meshes[0].primitives[0].targets.length, 3, id + ' sport morphs add no triangles');
    for (const h of V22_HAIR) { const ht = triangles((await glb(path.join(dir, 'hair', h + '.glb'))).json); assert.equal(ht, HAIR_TRIANGLES[h], h); worst = Math.max(worst, t + ht); }
  }
  assert.equal(worst, 5736);
  assert.ok(worst < 11614 / 2, 'about half of the previous full mesh');
});

test('the bodies table and the leg ratios match the Codex manifests', async () => {
  for (const m of bodyManifest.models) {
    assert.equal(V22_BODIES[m.id].height, m.height, m.id + ' height');
    assert.equal(V22_BODIES[m.id].width, m.bodyShape.width, m.id + ' width');
    assert.equal(V22_BODIES[m.id].depth, m.bodyShape.depth, m.id + ' depth');
  }
  assert.deepEqual([...V22_HAIR].sort(), bodyManifest.hair.map(h => h.id).sort());
  assert.deepEqual([...V22_SKIN], bodyManifest.skinTones);
  for (const [id, r] of Object.entries(V22_LEG_RATIO)) assert.ok(r > 0.7 && r < 0.9, id);
  assert.ok(V22_LEG_RATIO.guard > V22_LEG_RATIO.wing && V22_LEG_RATIO.wing > V22_LEG_RATIO.center, 'a taller body has the longer legs: smaller canonical / source ratio');
});

test('the flag: on by default, ?athleteBodyV22=0 (and the older ?athleteBody=0) return both games to the previous bodies', () => {
  assert.equal(athleteBodyV22Enabled(''), true);
  assert.equal(athleteBodyV22Enabled('?dev=1&athleteBodyV22=1'), true);
  assert.equal(athleteBodyV22Enabled('?athleteBodyV22=0'), false);
  assert.equal(athleteBodyV22Enabled('?x=1&athleteBodyV22=0&y=2'), false);
  assert.equal(athleteBodyV22Enabled('?athleteBody=0'), false);
});

test('flag wiring: soccer and basketball ask the flag before the Codex body, and keep the previous athlete as the fallback', async () => {
  const soccer = await read('minigames/soccer-design-character.mjs'), hoops = await read('minigames/hoops-athlete.mjs');
  // soccer: the previous athlete path is still there, reached when the flag is off or the Codex files fail
  assert.match(soccer, /if\(athleteBodyV22Enabled\(\)\)\{try\{return await prepareAthleteV22\(loader\);\}catch\(error\)\{lastAthleteV22Error=/);
  assert.match(soccer, /try\{return await prepareAthlete\(loader\);\}/);
  assert.match(soccer, /if\(set==='athlete'&&athleteV22\)/);
  assert.match(soccer, /athleteV22\?1:set==='v7'\|\|set==='athlete'\?2:3/);
  // basketball: same
  assert.match(hoops, /if\(athleteBodyV22Enabled\(/);
  assert.match(hoops, /catch\(error\)\{v22=null;onFallback\?\.\('athlete-body-v22',error\);\}/);
  assert.match(hoops, /await loadAthleteSource\(url=>loadHoopsGLTF\(loader,url\)/);
  // no pre-existing branch lost its code: the MakeHuman bodyFactory and the sleeve geometry are still built when v22 is off
  assert.match(hoops, /const sleeves=v22\?null:athleteKitGeometry\(THREE,source,'basketball'\)/);
  // both games import the module with the current release tag
  for (const s of [soccer, hoops]) assert.match(s, /athlete-body-v22\.mjs\?v=island-v2-20261107-12/);
});

test('roles: soccer is one body, basketball guard / wing / center are their own', () => {
  assert.equal(v22BodyFor('soccer', 'field'), 'soccer'); assert.equal(v22BodyFor('soccer', 'keeper'), 'soccer');
  for (const r of ['guard', 'wing', 'center']) assert.equal(v22BodyFor('basketball', r), r);
  assert.equal(v22BodyFor('basketball', 'unknown'), 'wing');
  assert.equal(v22Height('basketball', 'guard'), 1.78); assert.equal(v22Height('soccer', 'keeper', 1.86), 1.86);
  assert.ok(V22_BODIES.guard.height < V22_BODIES.wing.height && V22_BODIES.wing.height < V22_BODIES.center.height);
});

test('appearance: nearest of six skin tones, curly profiles get curly cuts, colours by region', () => {
  assert.equal(v22SkinFor('#8a5a40'), '#9a6041'); assert.equal(v22SkinFor('#ddb090'), '#d9a17b'); assert.equal(v22SkinFor('#5e3b2a'), '#70422d'); assert.equal(v22SkinFor(0), V22_SKIN[0]);
  for (let n = 0; n < 12; n++) { assert.ok(V22_HAIR.includes(v22HairFor({shape: {african: 1}}, n))); assert.ok(['afro', 'curls', 'buzz'].includes(v22HairFor({shape: {african: 1}}, n))); assert.ok(V22_HAIR.includes(v22HairFor({}, n))); }
  const c = v22Colors({skin: '#c08a68', hair: '#1f1712', kit: {primary: '#2868ee', secondary: '#ffcf69', shorts: '#f2f2ee', socks: '#2868ee'}, style: 'soccer'});
  assert.equal(c[V22_REGION.shirt], '#2868ee'); assert.equal(c[V22_REGION.shorts], '#f2f2ee'); assert.equal(c[V22_REGION.trim], '#ffcf69'); assert.equal(c[V22_REGION.sock], '#2868ee'); assert.equal(c[V22_REGION.hair], '#1f1712');
  const b = v22Colors({skin: '#c08a68', kit: {primary: '#5b38c9'}, style: 'basketball'});
  assert.equal(b[V22_REGION.shoeUpper], '#f6f6f3', 'basketball sneakers are white'); assert.equal(v22Colors({skin: 0, style: 'soccer'})[V22_REGION.shoeUpper], '#1b1d22');
});

test('paintRegions replaces only the regions in the palette, keeps alpha, and leaves the rest as authored (vec4 vertex colours)', () => {
  const regions = Uint8Array.from([0, 1, 2, 6, 7]), base = new Float32Array(5 * 4).fill(0.5), colors = new Float32Array(5 * 4).fill(1);
  for (let i = 0; i < 5; i++) colors[i * 4 + 3] = 1;
  const n = paintRegions(colors, regions, base, {0: [0.1, 0.2, 0.3], 1: [0.9, 0, 0], 2: [0, 0.9, 0]}, null, 4);
  assert.equal(n, 3);
  assert.deepEqual([...colors.slice(0, 3)].map(v => +v.toFixed(2)), [0.1, 0.2, 0.3]);
  assert.deepEqual([...colors.slice(4, 7)].map(v => +v.toFixed(2)), [0.9, 0, 0]);
  assert.deepEqual([...colors.slice(12, 15)], [0.5, 0.5, 0.5], 'eyes (region 6) keep the atlas colour');
  assert.equal(colors[3], 1); assert.equal(colors[19], 1);
  const hair = new Float32Array(3 * 4), n2 = paintRegions(hair, new Uint8Array(3), null, {7: [0.2, 0.1, 0.05]}, V22_REGION.hair, 4);
  assert.equal(n2, 3); assert.ok(Math.abs(hair[10] - 0.05) < 1e-6);
});

test('offline list: the Codex files are cached for soccer and basketball, and the shell list is up to date', async () => {
  const soccer = manifest.games.soccer, hoops = manifest.games.hoops;
  const pre = 'assets/athlete-body-v22/';
  for (const list of [soccer, hoops]) { assert.ok(list.includes(pre + 'textures/athlete-atlas.png')); for (const h of V22_HAIR) assert.ok(list.includes(pre + 'hair/' + h + '.glb'), h); assert.ok(list.includes('assets/athlete/athlete.glb'), 'the previous athlete stays cached for the flag'); }
  assert.ok(soccer.includes(pre + 'models/soccer.glb'));
  for (const b of ['guard', 'wing', 'center']) assert.ok(hoops.includes(pre + `models/${b}.glb`));
  assert.ok(!hoops.includes(pre + 'models/soccer.glb') && !soccer.includes(pre + 'models/guard.glb'), 'each game downloads only its bodies');
  for (const list of [soccer, hoops]) for (const p of list.filter(p => p.startsWith(pre))) assert.ok((await stat(path.join(island, p))).size > 0, p);
  assert.ok(manifest.shell.includes('minigames/athlete-body-v22.mjs'));
  assert.deepEqual(manifest.shell, await buildShell(), 'shell list is stale: run node workout/island/tools/offline-shell.mjs');
});

test('the module is pure to import (no DOM, no WebGL at load) and does not touch the release', async () => {
  const src = await read('minigames/athlete-body-v22.mjs');
  assert.ok(!/\bdocument\./.test(src)); assert.ok(!/from ['"][^'"]*three[^'"]*['"]/.test(src), 'three.js comes in through the T argument');
  assert.ok(!/Draco|meshopt/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
});
