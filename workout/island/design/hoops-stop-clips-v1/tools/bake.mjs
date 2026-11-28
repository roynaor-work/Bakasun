// SPDX-License-Identifier: CC0-1.0
// Bake nominal clips into uncompressed canonical-18 GLBs (mesh, skin and materials from the soccer idle reference) and write catalog.json.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unpack, compact} from './glb.mjs';

const base = new URL('../', import.meta.url), runtime = new URL('runtime/', base);
const source = await fs.readFile(new URL('motions.json', runtime)), data = JSON.parse(source);
const template = unpack(await fs.readFile(new URL('../../soccer-clips-v13/runtime/reference/idle_relaxed.glb', import.meta.url)));
const hash = b => createHash('sha256').update(b).digest('hex');
const entries = [];
await fs.mkdir(new URL('clips/', runtime), {recursive: true});
for (const f of await fs.readdir(new URL('clips/', runtime))) await fs.unlink(new URL('clips/' + f, runtime));
for (const motion of data.clips) {
  const {frames, ...entry} = motion;
  if (!motion.glb) { entries.push({...entry, asset: null, bytes: 0, sha256: null, data: 'motions.json'}); continue; }
  const document = structuredClone(template.document), parts = [template.binary];
  let length = template.binary.length;
  function accessor(values, width) {
    const a = new Float32Array(values), bytes = Buffer.from(a.buffer), padding = (4 - length % 4) % 4;
    if (padding) { parts.push(Buffer.alloc(padding)); length += padding; }
    const view = document.bufferViews.length; document.bufferViews.push({buffer: 0, byteOffset: length, byteLength: bytes.length}); parts.push(bytes); length += bytes.length;
    const record = {bufferView: view, componentType: 5126, count: values.length / width, type: width === 1 ? 'SCALAR' : width === 3 ? 'VEC3' : 'VEC4'};
    if (width === 1) { record.min = [Math.min(...values)]; record.max = [Math.max(...values)]; }
    document.accessors.push(record); return document.accessors.length - 1;
  }
  const input = accessor(frames.map(f => f.time), 1);
  const animation = {name: motion.id, samplers: [], channels: [], extras: {nativeRate: 30, canonicalSkeleton: 'motion2-18', license: 'CC0-1.0', rootMotion: false, loop: motion.loop, events: motion.events, coreRange: motion.coreRange, path: {frame: 'clip', unit: 'meters', rate: 30, samples: motion.path.samples}}};
  function channel(name, path, values, width) {
    const node = document.nodes.findIndex(n => n.name === name); if (node < 0) throw new Error(`Missing ${name}`);
    animation.channels.push({sampler: animation.samplers.length, target: {node, path}}); animation.samplers.push({input, output: accessor(values, width), interpolation: 'LINEAR'});
  }
  for (const {name} of data.skeleton) {
    let previous; const values = [];
    for (const f of frames) {
      let q = f.rotations[name]; const n = Math.hypot(...q); q = q.map(x => x / n);
      if (previous && q.reduce((s, x, i) => s + x * previous[i], 0) < 0) q = q.map(x => -x);
      values.push(...q); previous = q;
    }
    channel(name, 'rotation', values, 4);
  }
  channel('Hips', 'translation', frames.flatMap(f => f.hips), 3);
  document.animations = [animation]; document.buffers = [{byteLength: length}];
  document.asset.generator = 'Original CC0 hoops-stop-clips-v1, canonical18, 30Hz, no compression';
  document.asset.copyright = 'CC0-1.0 original motion; fictional CC0 v10/v8 geometry. See LICENSES.md.';
  document.extras = {library: data.version, id: motion.id, nativeRate: 30, canonicalBoneCount: 18, rootMotion: false, compression: 'none', events: motion.events, coreRange: motion.coreRange};
  const bytes = compact(document, Buffer.concat(parts));
  await fs.writeFile(new URL(`clips/${motion.id}.glb`, runtime), bytes);
  entries.push({...entry, asset: `clips/${motion.id}.glb`, bytes: bytes.length, sha256: hash(bytes), compression: 'none'});
}
await fs.writeFile(new URL('catalog.json', runtime), JSON.stringify({...data, clips: entries, sourceMotionSha256: hash(source)}, null, 2) + '\n');
console.log(`Baked ${entries.filter(e => e.asset).length} GLBs of ${entries.length} clips, ${entries.reduce((s, c) => s + c.bytes, 0)} bytes.`);
