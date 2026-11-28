// SPDX-License-Identifier: CC0-1.0
// Author every clip, finalise (idle end blend, planted-foot re-solve), write runtime/motions.json.
import fs from 'node:fs/promises';
import {synth, smoothPass, loadIdle, yawPose, blend, SOLE, bones, solve, euler, qm, rotate, add, I, smooth, clamp} from './synth.mjs';
import {CLIPS} from './clips.mjs';
import {maxSlide, soleWorld} from './qa.mjs';

const base = new URL('../', import.meta.url);
const {idle} = await loadIdle();
const footQ = (pitch, yaw) => qm(euler(0, yaw, 0), euler(pitch, 0, 0));
const f32 = v => Math.fround(v);
const D2R = Math.PI / 180;

function finalize(def, spec, res) {
  const frames = res.frames, N = frames.length;
  smoothPass(frames, ['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'], def.armSmooth ?? 1);
  const blendEdge = (target, from, to, K) => {
    for (let i = from; i <= to; i++) {
      const u = K > 0 ? (def.edgeDir === 'start' ? (to - i + 1) / (K + 1) : (i - from + 1) / (K + 1)) : 1;
      const w = smooth(u);
      const f = frames[i], root = f.root;
      f.pose = {...blend(f.pose, target, w), reachError: 0};
      const exact = w >= .9999;
      if (exact) { f.pose = {hips: [...target.hips], rotations: structuredClone(target.rotations), reachError: 0}; continue; }
      for (const side of ['Left', 'Right']) {
        const ft = f.feet[side];
        if (!ft.stance) continue;
        const q = footQ(0, ft.yaw), off = rotate(q, [0, .08, 0]);
        const dir = rotate(euler(0, f.yaw, 0), [0, 0, 1]);
        solve(f.pose, side + 'UpLeg', side + 'Leg', side + 'Foot', [ft.xz[0] - root[0] + off[0], off[1], ft.xz[1] - root[1] + off[2]], dir, q);
      }
    }
  };
  if (def.endIdle !== false) {
    const K = def.endBlend ?? 5, tgt = yawPose(idle, spec.endYaw || 0);
    def.edgeDir = 'end';
    blendEdge(tgt, N - K - 1, N - 1, K);
  }
  if (def.startIdle) {
    const K = def.startBlend ?? 5;
    def.edgeDir = 'start';
    blendEdge(idle, 0, K, K);
  }
  if (def.loop) { frames[N - 1].pose = structuredClone(frames[0].pose); }
  // sub-frame refinement: the native LINEAR/slerp interpolation between two keyframes cuts the arc of a fast leg;
  // nudge the keyframe targets of every long planted run until the 240 Hz sole stays on its anchor (3-D, so height too)
  const refineIters = def.refine ?? 3;
  const exactFirst = !!def.startIdle, exactLast = def.endIdle !== false;
  if (refineIters) {
    const tmpOf = () => ({frames: frames.map(f => ({time: f.time, hips: f.pose.hips, rotations: Object.fromEntries(bones.map(b => { const q = f.pose.rotations[b.name], n = Math.hypot(...q); return [b.name, q.map(v => v / n)]; }))})), path: {samples: frames.map(f => f.root)}});
    const runs = [];
    for (const side of ['Left', 'Right']) {
      let a = -1;
      for (let i = 0; i <= N; i++) {
        const st = i < N && frames[i].feet[side].stance;
        if (st && a < 0) a = i;
        if (!st && a >= 0) { if (i - 1 - a >= 2) runs.push({side, a, b: i - 1}); a = -1; }
      }
    }
    const offs = runs.map(r => Array.from({length: r.b - r.a + 1}, () => [0, 0, 0]));
    const gain = def.refineGain ?? .5;
    const skip = i => (i === 0 && exactFirst) || (i === N - 1 && exactLast);
    const apply = () => runs.forEach((r, ri) => { for (let i = r.a; i <= r.b; i++) { if (skip(i)) continue; const ls = frames[i].legSolve[r.side], o = offs[ri][i - r.a]; solve(frames[i].pose, r.side + 'UpLeg', r.side + 'Leg', r.side + 'Foot', [ls.target[0] + o[0], Math.max(.035, ls.target[1] + o[1]), ls.target[2] + o[2]], ls.pole, ls.q); } });
    const residuals = () => {
      const tmp = tmpOf(); let worst = 0;
      const errs = runs.map(r => {
        const anchor = frames[r.a].feet[r.side].xz, e = [];
        for (let k = r.a; k < r.b; k++) {
          const m = [0, 0, 0];
          for (const u of [.25, .5, .75]) { const p = soleWorld(tmp, r.side + 'Foot', (k + u) / 30), v = [p[0] - anchor[0], p[1], p[2] - anchor[1]]; for (let c = 0; c < 3; c++) m[c] += v[c] / 3; worst = Math.max(worst, Math.hypot(v[0], v[1] * 1.5, v[2])); }
          const t = soleWorld(tmp, r.side + 'Foot', k / 30);
          if (k === r.a) { e.push([t[0] - anchor[0], t[1], t[2] - anchor[1]]); }
          e.push(m);
        }
        e.push([0, 0, 0]);
        return e;
      });
      return {errs, worst};
    };
    let best = Infinity, bestOffs = null;
    for (let pass = 0; pass <= refineIters; pass++) {
      const {errs, worst} = residuals();
      if (worst < best) { best = worst; bestOffs = structuredClone(offs); }
      if (pass === refineIters) break;
      runs.forEach((r, ri) => {
        const e = errs[ri];
        for (let i = r.a; i <= r.b; i++) {
          if (skip(i)) continue;
          const j = i - r.a, ea = e[j] || [0, 0, 0], eb = e[j + 1] || ea;
          for (let c = 0; c < 3; c++) offs[ri][j][c] -= gain * (ea[c] + eb[c]) / 2;
        }
      });
      apply();
    }
    for (let ri = 0; ri < runs.length; ri++) offs[ri] = bestOffs[ri];
    apply();
  }
  // supports: whole frames inside each contact
  const supports = [];
  for (const side of ['Left', 'Right']) for (const c of res.contacts[side]) {
    const a = Math.max(0, Math.ceil(c.td * 30 - 1e-6)), b = Math.min(N - 1, Math.floor(Math.min(c.to, spec.T) * 30 + 1e-6));
    if (b - a < 2) continue;
    // all of those frames must really be stance frames
    let ok = true; for (let i = a; i <= b; i++) if (!frames[i].feet[side].stance) ok = false;
    if (!ok) continue;
    const root0 = frames[a].root, anchor = c.a;
    supports.push({bone: side + 'Foot', start: +(a / 30).toFixed(6), end: +(b / 30).toFixed(6), local: SOLE, anchor: [+anchor[0].toFixed(5), 0, +anchor[1].toFixed(5)]});
  }
  const outFrames = frames.map(f => ({time: f.time, hips: f.pose.hips.map(f32), rotations: Object.fromEntries(bones.map(b => {
    let q = f.pose.rotations[b.name]; const n = Math.hypot(...q); return [b.name, q.map(v => f32(v / n))];
  }))}));
  const samples = frames.map(f => [+f.root[0].toFixed(6), +f.root[1].toFixed(6)]);
  const speeds = samples.map((s, i) => { const a = samples[Math.max(0, i - 1)], b = samples[Math.min(N - 1, i + 1)], dt = (Math.min(N - 1, i + 1) - Math.max(0, i - 1)) / 30; return +(Math.hypot(b[0] - a[0], b[1] - a[1]) / dt).toFixed(4); });
  return {frames: outFrames, supports, path: {frame: 'clip', unit: 'meters', rate: 30, samples, speeds, endYawDegrees: spec.endYaw || 0}, notes: res.notes, raw: frames};
}

const swapName = n => n.startsWith('Left') ? 'Right' + n.slice(4) : n.startsWith('Right') ? 'Left' + n.slice(5) : n;
/** Mirror about the sagittal plane (x -> -x): swap left/right bones, q -> (x,-y,-z,w), hips and path x negated. */
export function mirrorClip(clip, m) {
  const frames = clip.frames.map(f => ({time: f.time, hips: [-f.hips[0], f.hips[1], f.hips[2]].map(f32), rotations: Object.fromEntries(bones.map(b => { const q = f.rotations[swapName(b.name)]; return [b.name, [q[0], -q[1], -q[2], q[3]].map(f32)]; }))}));
  const path = {...clip.path, samples: clip.path.samples.map(s => [s[0] ? -s[0] : 0, s[1]]), endYawDegrees: -clip.path.endYawDegrees};
  const supports = clip.supports.map(s => ({...s, bone: swapName(s.bone), anchor: [s.anchor[0] ? -s.anchor[0] : 0, 0, s.anchor[2]]}));
  const exit = clip.exit && clip.exit.bodyYawDegrees ? {...clip.exit, bodyYawDegrees: -clip.exit.bodyYawDegrees} : clip.exit;
  const variant = {...clip.variant, direction: m.direction ?? (clip.variant.direction === 'left' ? 'right' : 'left')};
  return {...clip, id: m.id, label: m.label, glb: !!m.glb, nominal: !!m.glb, mirrorOf: clip.id, variant, path, supports, exit, frames, events: clip.events.map(e => { const t = e.type.replace(/left|right/, w => w === 'left' ? 'right' : 'left'); return {...e, type: t, event: t}; })};
}

export async function buildAll(only) {
  const out = [], diag = [];
  for (const def of CLIPS) {
    if (only && !only.includes(def.id)) continue;
    const spec = def.make();
    const res = synth(spec, idle);
    const fin = finalize(def, spec, res);
    const clip = {
      id: def.id, family: def.family, label: def.label, role: 'basketball', nominal: !!def.nominal, glb: !!(def.glb ?? def.nominal), mirrorOf: def.mirrorOf || null,
      variant: def.variant || {}, duration: +(spec.T).toFixed(6), durationSeconds: +(spec.T).toFixed(6), nativeRate: 30, frameCount: fin.frames.length, loop: !!def.loop,
      rootMotion: false, license: 'CC0-1.0', category: def.family, events: def.events(spec), coreRange: def.core ? {start: def.core[0], end: def.core[1], duration: def.core[1] - def.core[0]} : {start: 0, end: spec.T, duration: spec.T},
      notes: def.notes || '', supports: fin.supports, path: fin.path, entry: def.entry, exit: def.exit, synthNotes: fin.notes, meta: spec.meta || {}, frames: fin.frames,
    };
    out.push(clip);
    const m = maxSlide(clip);
    diag.push({id: def.id, ...m, ceiling: fin.notes.ceiling, clamped: fin.notes.clamped, maxYShift: +fin.notes.maxYShift.toFixed(3)});
    if (def.mirror) {
      const mc = mirrorClip(clip, def.mirror);
      out.push(mc);
      const mm = maxSlide(mc);
      diag.push({id: mc.id, ...mm, ceiling: 'mirror', clamped: '', maxYShift: ''});
    }
  }
  return {clips: out, diag};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const {clips, diag} = await buildAll(only);
  console.table(diag);
  if (!only) {
    const data = {version: 'hoops-stop-clips-v1', license: 'CC0-1.0', nativeRate: 30, rootMotion: false, skeleton: bones, axes: {up: '+Y', forward: '+Z', anatomicalLeft: '+X'}, clips};
    await fs.writeFile(new URL('runtime/motions.json', base), JSON.stringify(data) + '\n');
    console.log('wrote motions.json', clips.length, 'clips');
  }
}
