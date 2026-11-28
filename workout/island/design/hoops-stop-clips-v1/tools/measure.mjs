// SPDX-License-Identifier: CC0-1.0
// Evidence for the delivery: planted-sole slide at 240 Hz on the motion data AND on the serialized GLB channels, bridge continuity
// against the soccer idle/run references, anatomy ranges. Writes verification/measurements.json (REPORT.md is generated from it).
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unpack, readAccessor} from './glb.mjs';
import {measureSupports, soleWorld} from './qa.mjs';
import {anatomy, anatomyVerdict, limits} from './anatomy.mjs';
import {makeBridge, sampleMotion, poseVelocity} from '../runtime/player.mjs';

const base = new URL('../', import.meta.url);
const read = p => fs.readFile(new URL(p, base));
const hash = b => createHash('sha256').update(b).digest('hex');
const data = JSON.parse(await read('runtime/motions.json')), catalog = JSON.parse(await read('runtime/catalog.json'));
const dot = (a, b) => a.reduce((v, x, i) => v + x * b[i], 0);
const angDeg = (a, b) => 2 * Math.acos(Math.min(1, Math.max(-1, Math.abs(dot(a, b)) / (Math.hypot(...a) * Math.hypot(...b))))) * 180 / Math.PI;
const poseDiff = (a, b) => ({hips: Math.hypot(...a.hips.map((v, i) => v - b.hips[i])), deg: Math.max(...Object.keys(a.rotations).map(n => angDeg(a.rotations[n], b.rotations[n])))});

function decode(bytes, id) {
  const glb = unpack(bytes), doc = glb.document, anim = doc.animations[0], tracks = [];
  for (const c of anim.channels) {
    const s = anim.samplers[c.sampler]; if ((s.interpolation ?? 'LINEAR') !== 'LINEAR') throw new Error('non-linear');
    const times = readAccessor(glb, s.input).values, out = readAccessor(glb, s.output);
    tracks.push({name: doc.nodes[c.target.node].name, path: c.target.path, times, width: out.width, values: out.values});
  }
  const rot = tracks.filter(t => t.path === 'rotation'); if (rot.length !== 18) throw new Error('not canonical18');
  const tr = tracks.find(t => t.name === 'Hips' && t.path === 'translation'), times = tr.times;
  return {id: anim.name, duration: times.at(-1), frames: times.map((time, i) => ({time, hips: tr.values.slice(i * 3, i * 3 + 3), rotations: Object.fromEntries(rot.map(t => [t.name, t.values.slice(i * 4, i * 4 + 4)]))})), glb, bytes, extras: anim.extras};
}

const refs = {};
for (const id of ['idle_relaxed', 'run']) refs[id] = decode(await fs.readFile(new URL(`../../soccer-clips-v13/runtime/reference/${id}.glb`, import.meta.url)), id);

for (const e of catalog.clips.filter(c => c.asset)) refs[e.id] = decode(await read('runtime/' + e.asset), e.id);
const out = {version: data.version, method: {rate: 240, sole: 'foot bone local [0,-0.08,0] plus declared root path', slideLimitCm: 2, bridgeLimitDegrees: 3, anatomyLimits: limits}, clips: [], bridges: [], glbEquivalence: []};
for (const clip of data.clips) {
  const entry = catalog.clips.find(c => c.id === clip.id);
  const m = measureSupports(clip);
  const a = anatomy(clip);
  const row = {id: clip.id, family: clip.family, glb: !!entry.asset, durationSeconds: clip.duration, frames: clip.frames.length, entrySpeedMps: clip.variant.entrySpeedMps ?? clip.variant.referenceSpeedMps ?? null, windows: m.length,
    slideCmMax: Math.max(0, ...m.map(x => x.slideCm)), anchorDevCmMax: Math.max(0, ...m.map(x => x.anchorDevCm)), floorDevCmMax: Math.max(0, ...m.map(x => x.floorCm)), supports: m, anatomy: a, anatomyFail: anatomyVerdict(a)};
  out.clips.push(row);
  if (entry.asset) {
    // the serialized GLB channels must reproduce the motion data and the slide numbers
    const bytes = await read('runtime/' + entry.asset), g = decode(bytes, clip.id);
    const withPath = {...g, path: clip.path, supports: clip.supports, loop: clip.loop};
    const sup = measureSupports(withPath);
    let maxDeg = 0, maxHips = 0;
    g.frames.forEach((f, i) => { const d = poseDiff(f, clip.frames[i]); maxDeg = Math.max(maxDeg, d.deg); maxHips = Math.max(maxHips, d.hips); });
    out.glbEquivalence.push({id: clip.id, asset: entry.asset, bytes: bytes.length, sha256: hash(bytes), sha256Catalog: entry.sha256, shaMatches: hash(bytes) === entry.sha256, maxRotationDegVsMotions: +maxDeg.toFixed(6), maxHipsMetersVsMotions: +maxHips.toExponential(2), glbSlideCmMax: Math.max(0, ...sup.map(x => x.slideCm)), glbFloorCmMax: Math.max(0, ...sup.map(x => x.floorCm)), draco: /KHR_draco|EXT_meshopt/.test(JSON.stringify(g.glb.document.extensionsUsed || [])), rootIdentity: g.frames.every(f => f.rotations.Root.every((v, j) => v === [0, 0, 0, 1][j]))});
    // bridges on the GLB channels: entry from the reference (run or idle) into frame 0, exit from the last frame to the reference
    const kinds = [];
    for (const side of ['entry', 'exit']) {
      const spec = clip[side];
      if (!spec) continue;
      const refId = refs[spec.reference] ? spec.reference : spec.reference === 'idle_relaxed' ? 'idle_relaxed' : 'run';
      kinds.push([side, refId, spec.reference]);
    }
    for (const [side, refId, declared] of kinds) for (const phaseKind of ['catalog-zero', 'interior']) {
      const ref = refs[refId], phase = phaseKind === 'catalog-zero' ? 0 : ref.duration * (refId === 'run' ? .371 : .231), duration = refId === 'run' ? .3 : refId === 'idle_relaxed' ? .2 : .15;
      const yaw = side === 'exit' ? (clip.exit?.bodyYawDegrees || 0) : 0;
      const hs = t => sampleMotion(g, t, {loop: false}), rs0 = t => sampleMotion(ref, t, {loop: true});
      const rs = yaw ? (t => yawed(rs0(t), yaw)) : rs0;
      const from = side === 'entry' ? rs : hs, to = side === 'entry' ? hs : rs, fromTime = side === 'entry' ? phase : g.duration, toTime = side === 'entry' ? 0 : phase;
      const br = makeBridge({from, to, fromTime, toTime, duration});
      const s0 = br.sample(0), s1 = br.sample(duration), c0 = {start: poseDiff(s0, from(fromTime)), end: poseDiff(s1, to(toTime))};
      let prev = br.sample(0), maxStep = 0, maxHipsStep = 0; const n = Math.ceil(duration * 240);
      for (let i = 1; i <= n; i++) { const cur = br.sample(Math.min(duration, i / 240)), d = poseDiff(prev, cur); maxStep = Math.max(maxStep, d.deg); maxHipsStep = Math.max(maxHipsStep, d.hips); prev = cur; }
      // natural step of the two endpoints at 240 Hz, for context
      const nat = f => { let m = 0; for (let i = 0; i < 60; i++) { const t0 = Math.min(g.duration - 1 / 240, i / 240), d = poseDiff(f(t0), f(t0 + 1 / 240)); m = Math.max(m, d.deg); } return m; };
      out.bridges.push({id: clip.id, direction: side, reference: refId, declaredReference: declared, phaseKind, durationSeconds: duration, referenceYawDegrees: yaw, endpointStartDeg: +c0.start.deg.toFixed(6), endpointEndDeg: +c0.end.deg.toFixed(6), endpointHipsMeters: Math.max(c0.start.hips, c0.end.hips), maxStep240Deg: +maxStep.toFixed(3), maxHipsStep240Meters: +maxHipsStep.toFixed(4), pass: Math.max(c0.start.deg, c0.end.deg) <= 3});
    }
  }
}
function yawed(p, deg) { // rigid yaw of a whole pose about Root Y (hips translation and hips rotation)
  const h = deg * Math.PI / 360, q = [0, Math.sin(h), 0, Math.cos(h)];
  const mul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
  return {hips: [p.hips[0] * c + p.hips[2] * s, p.hips[1], -p.hips[0] * s + p.hips[2] * c], rotations: {...p.rotations, Hips: mul(q, p.rotations.Hips)}};
}
out.summary = {
  clips: out.clips.length, glbs: out.glbEquivalence.length, maxSlideCm: Math.max(...out.clips.map(c => c.slideCmMax)), maxSlideCmGlb: Math.max(...out.glbEquivalence.map(c => c.glbSlideCmMax)),
  bridges: out.bridges.length, bridgesPassed: out.bridges.filter(b => b.pass).length, maxBridgeEndpointDeg: Math.max(...out.bridges.map(b => Math.max(b.endpointStartDeg, b.endpointEndDeg))),
  maxBridgeStep240Deg: Math.max(...out.bridges.map(b => b.maxStep240Deg)), anatomyFailures: out.clips.filter(c => c.anatomyFail.length).map(c => [c.id, c.anatomyFail]),
};
await fs.mkdir(new URL('verification/', base), {recursive: true});
await fs.writeFile(new URL('verification/measurements.json', base), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out.summary, null, 1));
