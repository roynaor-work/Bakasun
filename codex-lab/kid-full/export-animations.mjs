/** Deterministic, idempotent GLB augmentation. Never rebuild the character. */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readGLB, writeGLB, createMotionModel } from './glb-animation-io.mjs';
import { createExerciseClips } from './exercise-clips.mjs';
import { EXERCISE_ANIMATIONS } from './exercise-motion.mjs';

export async function exportAnimations(path = new URL('./kid-full.glb', import.meta.url)) {
  const { json, bin } = await readGLB(path);
  const base = json.asset.extras?.exerciseAnimationBase || {
    animations: json.animations.length, accessors: json.accessors.length,
    bufferViews: json.bufferViews.length, byteLength: json.buffers[0].byteLength,
    sourceSHA256: createHash('sha256').update(await readFile(path)).digest('hex'),
    binarySHA256: createHash('sha256').update(bin.subarray(0,json.buffers[0].byteLength)).digest('hex'),
  };
  json.animations.length = base.animations; json.accessors.length = base.accessors; json.bufferViews.length = base.bufferViews;
  const original = Buffer.from(bin.subarray(0, base.byteLength)), model = createMotionModel(json, original);
  const parts = [original]; let offset = original.length;
  const append = (values, type) => {
    const array = Float32Array.from(values), data = Buffer.from(array.buffer);
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    const index = json.accessors.length, bufferView = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
    const a = { bufferView, componentType: 5126, count: array.length / size, type };
    if (type === 'SCALAR') { a.min = [Math.min(...array)]; a.max = [Math.max(...array)]; }
    json.accessors.push(a); parts.push(data); offset += data.length; return index;
  };
  for (const clip of createExerciseClips(model)) {
    const samplers = [], channels = [];
    for (const track of clip.tracks) {
      const split = track.name.lastIndexOf('.'), name = track.name.slice(0, split), property = track.name.slice(split + 1);
      const node = json.nodes.findIndex(n => n.name === name);
      if (node < 0) throw Error('Missing track node: ' + name);
      const path = { quaternion: 'rotation', position: 'translation', scale: 'scale', morphTargetInfluences: 'weights' }[property];
      const type = path === 'rotation' ? 'VEC4' : path === 'weights' ? 'SCALAR' : 'VEC3';
      const sampler = samplers.length;
      samplers.push({ input: append(track.times, 'SCALAR'), output: append(track.values, type), interpolation: 'LINEAR' });
      channels.push({ sampler, target: { node, path } });
    }
    const definition = EXERCISE_ANIMATIONS.find(d => d.id === clip.name);
    json.animations.push({ name: clip.name, samplers, channels, extras: { loop: true, repetition: definition.repetition || 'one repetition', description: definition.description } });
  }
  json.asset.extras = { ...json.asset.extras, exerciseAnimationBase: base };
  json.buffers[0].byteLength = offset;
  const bytes = await writeGLB(path, json, Buffer.concat(parts));
  return { bytes, sha256: createHash('sha256').update(await readFile(path)).digest('hex'), clips: EXERCISE_ANIMATIONS.map(d => ({ id: d.id, duration: d.duration })) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await exportAnimations(process.argv[2] || new URL('./kid-full.glb', import.meta.url)), null, 2));
}
