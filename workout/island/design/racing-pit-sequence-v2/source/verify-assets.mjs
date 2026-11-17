// CC0-1.0. Pure JavaScript structural audit; deliberately uses no decoder or WASM.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(path.join(root, 'sequence.json'), 'utf8'));
const canonical = JSON.parse(await readFile(path.resolve(root, config.rig), 'utf8'));
const extensionsForbidden = ['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function glb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB v2');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length');
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'GLB JSON chunk');
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const offset = 20 + jsonLength;
  assert.equal(bytes.readUInt32LE(offset + 4), 0x004e4942, 'GLB BIN chunk');
  assert.equal(offset + 8 + bytes.readUInt32LE(offset), bytes.length, 'BIN length');
  return {json, bin:bytes.subarray(offset + 8)};
}

function accessor(asset, index) {
  const a = asset.json.accessors[index], bv = asset.json.bufferViews[a.bufferView];
  assert.equal(a.componentType, 5126, 'Animation accessor must be float32');
  const count = {SCALAR:1,VEC3:3,VEC4:4}[a.type];
  assert(count, 'Supported animation accessor shape');
  const stride = bv.byteStride ?? count * 4;
  const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  assert(start + Math.max(0, a.count - 1) * stride + count * 4 <= asset.bin.length, 'Accessor bounds');
  return Array.from({length:a.count}, (_, i) => Array.from({length:count}, (_, j) => {
    const value = asset.bin.readFloatLE(start + i * stride + j * 4);
    assert(Number.isFinite(value), 'Finite animation data'); return value;
  }));
}

const files = new Set([config.car.asset, ...config.actors.map(a => a.model),
  ...config.actors.flatMap(a => a.tracks.map(t => t.clipFile)),
  '../racing-pit-v1/models/pit_light_entry.glb']);
function collectAssets(value) {
  if(typeof value==='string'&&value.endsWith('.glb')) files.add(value);
  else if(value&&typeof value==='object') for(const child of Object.values(value)) collectAssets(child);
}
collectAssets(config.props);
for (const file of await readdir(path.join(root, 'clips'))) if (file.endsWith('.glb')) files.add('clips/' + file);
const assets = [];
for (const relative of [...files].sort()) {
  assert(!/^(https?:|data:|\/\/)/i.test(relative), 'Assets are local');
  const bytes = await readFile(path.resolve(root, relative)), asset = glb(bytes), {json} = asset;
  assert.equal(json.asset.version, '2.0');
  for (const ext of [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])]) {
    assert(!extensionsForbidden.includes(ext), 'No compressed extension: ' + ext);
  }
  assert((json.buffers ?? []).every(b => !b.uri), 'Self-contained buffers');
  assert((json.images ?? []).every(b => !b.uri), 'Self-contained images');
  let joints = 0;
  for (const skin of json.skins ?? []) {
    joints = skin.joints.length;
    assert.equal(joints, 18, 'Exactly 18 canonical joints');
    assert.deepEqual(skin.joints.map(i => json.nodes[i].name), canonical.bones.map(b => b.name), 'Canonical joint order');
    for (const bone of canonical.bones) {
      const index = json.nodes.findIndex(n => n.name === bone.name), node = json.nodes[index];
      assert(node, 'Missing canonical bone ' + bone.name);
      assert.deepEqual(node.translation ?? [0,0,0], bone.restTranslationMeters, 'Rest translation ' + bone.name);
      assert.deepEqual(node.rotation ?? [0,0,0,1], [0,0,0,1], 'Rest rotation ' + bone.name);
      const parent = json.nodes.find(n => n.children?.includes(index));
      if (bone.parent !== null) assert.equal(parent?.name, bone.parent, 'Hierarchy ' + bone.name);
    }
  }
  const animations = [];
  for (const animation of json.animations ?? []) {
    let duration = 0;
    for (const channel of animation.channels) {
      const sampler = animation.samplers[channel.sampler];
      const times = accessor(asset, sampler.input).map(v => v[0]);
      assert(times.length >= 2 && times[0] === 0, 'Animation starts at zero with at least two samples');
      assert(times.every((v,i) => !i || v > times[i - 1]), 'Strictly increasing timestamps');
      duration = Math.max(duration, times.at(-1));
      const values = accessor(asset, sampler.output);
      if (channel.target.path === 'rotation') for (const value of values) {
        assert(Math.abs(Math.hypot(...value) - 1) < 1e-5, 'Normalized quaternion');
      }
    }
    animations.push({name:animation.name, duration});
  }
  for (const actor of config.actors) for (const track of actor.tracks.filter(t => t.clipFile === relative)) {
    const animation = animations.find(a => a.name === track.clip);
    assert(animation, `${actor.id}: missing animation ${track.clip}`);
    assert(track.clipStart >= 0 && track.clipEnd <= animation.duration + 1e-5,
      `${actor.id}/${track.clip}: clip range exceeds delivered animation`);
  }
  assets.push({file:relative, bytes:bytes.length, sha256:sha(bytes), joints, animations});
}
const report = {schemaVersion:1, passed:true, method:'Pure JavaScript GLB structure, canonical rig and animation track audit; not the Khronos validator',
  constraints:{local:true, wasm:false, draco:false, meshopt:false, ktx2:false}, assets};
await mkdir(path.join(root, 'verification'), {recursive:true});
await writeFile(path.join(root, 'verification/assets.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`PASS: ${assets.length} local GLBs; exact canonical 18-joint rigs; all scheduled animation ranges exist.`);
