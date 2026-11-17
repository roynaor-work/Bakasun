#!/usr/bin/env node
/**
 * Reproduce src/data/clips.mjs from pinned git objects. No checkout, npm, or network.
 * Run: node tools/extract-clips.mjs [--repo=/path/to/Bakasun]
 * Runtime consumers need only the generated data; this tool uses Node built-ins.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repository = process.argv.find(a => a.startsWith('--repo='))?.slice(7) || resolve(here, '../../../../../..');
const destination = resolve(here, '../src/data');
const canonicalNames = ['Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
const sources = [
  ['soccer-locomotion-v2', 'ec6c73949fb5820826b4c082972f5d4f1136641f', 'runtime/catalog.json'],
  ['soccer-kicks-v2', 'd4a27a94dd63127dd9f38fc641db414bd09bac35', 'runtime/catalog.json'],
  ['soccer-tackle-keeper-v2', '1bd4ccb5d53a8ff21bb03930ad3b26e7c4815e17', 'runtime/catalog.json'],
  ['soccer-volley-scissor-v1', '8277a659f43315036eed250bda2f53f44f8613bb', 'catalog.json'],
  ['soccer-run-cycles-v3', '88f60952c60b495033be14fb9983861e9d74b9c5', 'catalog.json'],
  ['soccer-keeper-motion-v3', 'b31011b65144f9c6cc2eefddd0150a6f92707e4b', 'catalog.json'],
];
const git = (...args) => execFileSync('git', args, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value);
const read = (commit, path) => git('show', `${commit}:${path}`);

/** Minimal uncompressed GLB v2 reader with checked, strided glTF accessor reads. */
export function decodeGLB(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB header');
  let gltf, binary;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + length > bytes.length) throw Error('Truncated GLB chunk');
    const part = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) gltf = JSON.parse(part.toString('utf8'));
    if (type === 0x004e4942) binary = part;
    offset += 8 + length;
  }
  if (!gltf || !binary) throw Error('Missing JSON/BIN chunk');
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const readers = { 5120: ['readInt8', 1], 5121: ['readUInt8', 1], 5122: ['readInt16LE', 2], 5123: ['readUInt16LE', 2], 5125: ['readUInt32LE', 4], 5126: ['readFloatLE', 4] };
  function accessor(index) {
    const a = gltf.accessors[index], dimensions = components[a.type], reader = readers[a.componentType];
    if (!a || !dimensions || !reader) throw Error(`Unsupported accessor ${index}`);
    if (a.sparse || a.normalized) throw Error('Sparse/normalized animation accessors are not supported');
    const view = gltf.bufferViews[a.bufferView];
    if (view.buffer !== 0 || view.extensions) throw Error('External/compressed accessor is not supported');
    const packed = reader[1] * dimensions, stride = view.byteStride || packed;
    if (stride < packed) throw Error('Invalid accessor stride');
    const start = (view.byteOffset || 0) + (a.byteOffset || 0);
    const end = start + (a.count - 1) * stride + packed;
    if (start < (view.byteOffset || 0) || end > (view.byteOffset || 0) + view.byteLength || end > binary.length) throw Error('Accessor exceeds buffer view');
    const values = [];
    for (let row = 0; row < a.count; row++) for (let column = 0; column < dimensions; column++) {
      const value = binary[reader[0]](start + row * stride + column * reader[1]);
      if (!Number.isFinite(value)) throw Error('Non-finite accessor value');
      values.push(value);
    }
    return values;
  }
  return { gltf, accessor };
}

const clips = [], inventory = { schemaVersion: 1, method: 'Pinned git blobs; exact GLB float32 animation accessor extraction; no regenerated or synthetic poses', sources: [], excludedGLBs: [], clipCount: 0 };
const timeArrays = [], timeLookup = new Map();
for (const [sourcePackage, commit, relativeCatalog] of sources) {
  const branch = `origin/codex/${sourcePackage}`, prefix = `workout/island/design/${sourcePackage}/`;
  const catalogPath = prefix + relativeCatalog, catalogBytes = read(commit, catalogPath), catalog = JSON.parse(catalogBytes);
  const base = catalogPath.slice(0, catalogPath.lastIndexOf('/') + 1), included = new Set();
  inventory.sources.push({ sourcePackage, branch, commit, catalogPath, catalogSha256: sha256(catalogBytes), authoredClipCount: catalog.clips.length });
  for (const descriptor of catalog.clips) {
    const path = base + descriptor.asset, bytes = read(commit, path), { gltf, accessor } = decodeGLB(bytes);
    if (gltf.animations?.length !== 1) throw Error(`${path}: expected one authored animation`);
    included.add(path);
    const animation = gltf.animations[0], nodeParents = new Map();
    gltf.nodes.forEach((node, parent) => (node.children || []).forEach(child => nodeParents.set(child, parent)));
    const boneNodes = gltf.skins?.[0]?.joints || canonicalNames.map(name => gltf.nodes.findIndex(node => node.name === name));
    if (boneNodes.length !== 18) throw Error(`${path}: expected canonical 18-joint skeleton`);
    const toBone = new Map(boneNodes.map((node, bone) => [node, bone]));
    const skeleton = boneNodes.map(node => {
      const n = gltf.nodes[node];
      if (n.matrix) throw Error(`${path}: matrix node requires TRS decomposition`);
      return { name: n.name, parent: toBone.get(nodeParents.get(node)) ?? -1, translation: n.translation || [0, 0, 0], rotation: n.rotation || [0, 0, 0, 1], scale: n.scale || [1, 1, 1] };
    });
    const tracks = animation.channels.map(channel => {
      const sampler = animation.samplers[channel.sampler], bone = toBone.get(channel.target.node);
      if (bone === undefined || !['rotation', 'translation', 'scale'].includes(channel.target.path)) throw Error(`${path}: unsupported animated target`);
      const times = accessor(sampler.input), values = accessor(sampler.output), interpolation = sampler.interpolation || 'LINEAR';
      if (!['LINEAR', 'STEP', 'CUBICSPLINE'].includes(interpolation)) throw Error('Unknown interpolation');
      if (!times.every((t, i) => i === 0 || t > times[i - 1])) throw Error(`${path}: unordered key times`);
      const dimensions = channel.target.path === 'rotation' ? 4 : 3;
      if (values.length !== times.length * dimensions * (interpolation === 'CUBICSPLINE' ? 3 : 1)) throw Error(`${path}: invalid animation accessor dimensions`);
      const key = json(times); let timeIndex = timeLookup.get(key);
      if (timeIndex === undefined) { timeIndex = timeArrays.length; timeLookup.set(key, timeIndex); timeArrays.push(times); }
      return { bone, path: channel.target.path, interpolation, times, values, timeIndex };
    });
    const exactDuration = Math.max(...tracks.map(track => track.times.at(-1)));
    if (Math.abs(exactDuration - (descriptor.duration ?? descriptor.durationSeconds)) > 1e-5) throw Error(`${path}: catalog and GLB duration differ`);
    const { frames: ignoredFrames, ball, ...rawMetadata } = descriptor;
    if (ball) { const { samples: ignoredBallSamples, ...ballMetadata } = ball; rawMetadata.ball = ballMetadata; }
    const clip = {
      id: `${sourcePackage}:${descriptor.id}`, sourceId: descriptor.id, sourcePackage,
      provenance: { branch, commit, path, gitBlob: git('rev-parse', `${commit}:${path}`).toString().trim(), sha256: sha256(bytes), bytes: bytes.length, catalogPath, catalogSha256: sha256(catalogBytes), animationName: animation.name },
      duration: descriptor.duration ?? descriptor.durationSeconds, glbDuration: exactDuration,
      loop: descriptor.loop === true, nativeRate: descriptor.nativeRate ?? catalog.nativeRate ?? catalog.fps ?? null,
      speedMps: descriptor.speedMps ?? 0, category: descriptor.category ?? null, role: descriptor.role ?? null,
      locomotion: descriptor.locomotion === true, rootMotion: descriptor.rootMotion === true,
      events: descriptor.events || [], supports: descriptor.supports || [], referenceTravel: descriptor.referenceTravel || null,
      rawMetadata, skeleton, tracks,
    };
    clips.push(clip);
  }
  const paths = git('ls-tree', '-r', '--name-only', commit, prefix).toString().trim().split('\n').filter(p => p.endsWith('.glb'));
  for (const path of paths) if (!included.has(path)) {
    const bytes = read(commit, path), { gltf } = decodeGLB(bytes);
    inventory.excludedGLBs.push({ sourcePackage, branch, commit, path, sha256: sha256(bytes), gitBlob: git('rev-parse', `${commit}:${path}`).toString().trim(), bytes: bytes.length, animationNames: (gltf.animations || []).map(a => a.name || ''), reason: 'Reference or mesh template outside the authored catalog; provenance retained without adding a duplicate graph action' });
  }
}
inventory.clipCount = clips.length;
const skeletons = [], skeletonLookup = new Map();
for (const c of clips) {
  const key = json(c.skeleton); let index = skeletonLookup.get(key);
  if (index === undefined) { index = skeletons.length; skeletonLookup.set(key, index); skeletons.push(c.skeleton); }
  c.skeletonIndex = index;
}
let output = '// Generated by tools/extract-clips.mjs from pinned source GLBs. Do not hand-edit.\n';
output += '// Values are original binary float32 values represented losslessly as JavaScript numbers.\n';
output += timeArrays.map((times, i) => `const T${i}=${json(times)};`).join('\n') + '\n';
output += skeletons.map((skeleton, i) => `const S${i}=${json(skeleton)};`).join('\n') + '\n';
output += 'export const CLIP_DATA=[\n';
for (const clip of clips) {
  const { tracks, skeleton, skeletonIndex, ...metadata } = clip;
  const trackText = tracks.map(({ timeIndex, times, ...track }) => `${json(track).slice(0, -1)},"times":T${timeIndex}}`).join(',');
  output += `${json(metadata).slice(0, -1)},"skeleton":S${skeletonIndex},"tracks":[${trackText}]},\n`;
}
output += '];\n';
inventory.dataSha256 = sha256(output);
inventory.dataBytes = Buffer.byteLength(output);
inventory.timeArrayCount = timeArrays.length;
inventory.skeletonCount = skeletons.length;
writeFileSync(resolve(destination, 'clips.mjs'), output);
writeFileSync(resolve(here, '../data/inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
writeFileSync(resolve(destination, 'inventory.mjs'), '// Generated provenance inventory.\nexport const INVENTORY=' + JSON.stringify(inventory) + ';\n');
console.log(JSON.stringify({ clips: clips.length, excludedGLBs: inventory.excludedGLBs.length, bytes: inventory.dataBytes, sha256: inventory.dataSha256 }));
