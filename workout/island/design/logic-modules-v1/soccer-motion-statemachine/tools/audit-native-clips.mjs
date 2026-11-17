#!/usr/bin/env node
/** Independent native-track sampling audit. Runtime diagnostics cover graph edges. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CLIP_DATA } from '../src/data/clips.mjs';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const normalize = q => { const n = Math.hypot(...q); return q.map(x => x / n); };
const multiply = (a, b) => [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0], a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const rotate = (q, v) => {
  const r = multiply(multiply(q, [...v, 0]), [-q[0], -q[1], -q[2], q[3]]);
  return r.slice(0, 3);
};
function slerp(a, b, t) {
  let dot = a.reduce((s, x, i) => s + x * b[i], 0);
  if (dot < 0) { b = b.map(x => -x); dot = -dot; }
  if (dot > .9995) return normalize(lerp(a, b, t));
  const angle = Math.acos(clamp(dot, -1, 1)), d = Math.sin(angle);
  return a.map((x, i) => (x * Math.sin((1-t)*angle) + b[i] * Math.sin(t*angle)) / d);
}
function sample(clip, seconds) {
  const locals = clip.skeleton.map(b => ({ translation: b.translation, rotation: b.rotation, scale: b.scale }));
  for (const track of clip.tracks) {
    if (track.interpolation === 'CUBICSPLINE') throw Error('Implement cubic interpolation before auditing cubic source data');
    const n = track.path === 'rotation' ? 4 : 3, times = track.times;
    let lo = 0, hi = times.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= seconds) lo = mid; else hi = mid; }
    if (seconds >= times.at(-1)) lo = hi = times.length - 1;
    const t = hi === lo ? 0 : clamp((seconds - times[lo]) / (times[hi] - times[lo]), 0, 1);
    const a = track.values.slice(lo*n, (lo+1)*n), b = track.values.slice(hi*n, (hi+1)*n);
    locals[track.bone][track.path] = track.interpolation === 'STEP' ? a : track.path === 'rotation' ? slerp(a, b, t) : lerp(a, b, t);
  }
  const world = [];
  for (let i = 0; i < locals.length; i++) {
    const local = locals[i], parent = clip.skeleton[i].parent;
    if (parent < 0) world.push(local);
    else {
      const p = world[parent], offset = rotate(p.rotation, local.translation.map((x, j) => x*p.scale[j]));
      world.push({ translation: p.translation.map((x, j) => x+offset[j]), rotation: normalize(multiply(p.rotation, local.rotation)), scale: p.scale.map((x, j) => x*local.scale[j]) });
    }
  }
  return world;
}

const report = {
  schemaVersion: 1,
  method: 'Independent tool: exact float32 GLB animation tracks, LINEAR shortest-path quaternion slerp, full parent-local FK, each native key plus 120 Hz uniform samples and exact endpoint',
  floorY: 0,
  thresholdMeters: 0.02,
  probes: [
    { name: 'all-joint-origins', description: 'Every canonical joint origin, not a mesh surface' },
    { name: 'left-sole-center', bone: 'LeftFoot', local: [0, -0.08, 0] },
    { name: 'right-sole-center', bone: 'RightFoot', local: [0, -0.08, 0] },
  ],
  limits: [
    'Skeletal probe floor check only. Mesh vertices, skin deformation, shoe shape and garment surfaces are excluded.',
    'Sampling at 120 Hz plus original keys can miss extrema between samples; no continuous-time certification.',
    'Baked local translations are used once. Demonstration referenceTravel is not applied, as its Y component may describe a separate host scenario.',
    'This measures native clips only. Transition windows and blended pose checks are covered separately by runtime graph diagnostics.',
    'No assertion that a positive probe height means stable contact, realistic foot sliding, collision-free posture, or visually acceptable animation.',
  ],
  clips: [],
};
for (const clip of CLIP_DATA) {
  const ticks = new Set([0, clip.glbDuration]);
  for (let i = 0; i <= Math.ceil(clip.duration*120); i++) ticks.add(Math.min(i/120, clip.glbDuration));
  for (const track of clip.tracks) for (const t of track.times) ticks.add(t);
  let minimum = { height: Infinity }, maxQuaternionNormError = 0;
  for (const t of [...ticks].sort((a, b) => a-b)) {
    const world = sample(clip, t);
    world.forEach((transform, i) => {
      const bone = clip.skeleton[i].name;
      // Root is an intentionally floor-level coordinate frame, not anatomy.
      if (bone !== 'Root' && transform.translation[1] < minimum.height) minimum = { height: transform.translation[1], time: t, probe: bone, local: [0, 0, 0] };
      if (bone === 'LeftFoot' || bone === 'RightFoot') {
        const offset = rotate(transform.rotation, [0, -0.08*transform.scale[1], 0]);
        const height = transform.translation[1] + offset[1];
        if (height < minimum.height) minimum = { height, time: t, probe: bone+'-sole-center', local: [0, -0.08, 0] };
      }
    });
  }
  for (const track of clip.tracks) if (track.path === 'rotation') for (let i = 0; i < track.values.length; i+=4) maxQuaternionNormError = Math.max(maxQuaternionNormError, Math.abs(Math.hypot(...track.values.slice(i, i+4))-1));
  report.clips.push({ id: clip.id, samples: ticks.size, minFloorHeightMeters: minimum.height, minimum, nativeFloorViolation: minimum.height < -report.thresholdMeters, maxQuaternionNormError });
}
report.summary = { clipCount: report.clips.length, sampledPoses: report.clips.reduce((s, c) => s+c.samples, 0), nativeFloorViolations: report.clips.filter(c => c.nativeFloorViolation).length, worst: [...report.clips].sort((a, b) => a.minFloorHeightMeters-b.minFloorHeightMeters)[0] };
writeFileSync(fileURLToPath(new URL('../data/native-audit.json', import.meta.url)), JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify(report.summary));
