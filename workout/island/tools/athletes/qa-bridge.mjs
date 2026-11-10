/** Feeds canonical clips (athletes-core) to Codex's motion QA formulas (PR 371, design/motion-qa-v1/metrics.mjs) so that all sports are scored by
 * the same tool the soccer reference was scored with. The tool is not in main yet: point CODEX_QA at its metrics.mjs.
 *   CODEX_QA=/path/to/motion-qa-v1/metrics.mjs node workout/island/tools/athletes/qa-bridge.mjs */
import {CANON_BONES, CANON_NAMES, jointWorld, sampleCanonical, qrotate} from '../../minigames/athletes-core.mjs';
export async function loadAnalyze(path = process.env.CODEX_QA) {
  if (!path) throw Error('CODEX_QA is not set (path to motion-qa-v1/metrics.mjs)');
  return (await import(path)).analyzeClip;
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** Samples a canonical clip at 60 Hz into the analyzer's frame shape. `speed` (m/s) travels the reference root so body sliding is judged against the authored speed. */
export function framesFor(clip, {speed = clip.speed || 0, fps = 60, height = 1.88} = {}) {
  const n = Math.max(2, Math.ceil(clip.dur * fps)) + 1, frames = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(clip.dur, i / (n - 1) * clip.dur), w = jointWorld(sampleCanonical(clip, t)), joints = {}, rotations = {};
    for (const b of CANON_NAMES) { joints[b] = w[b].p; rotations[b] = w[b].q; }
    const ref = [0, 0, speed * t], f = {t, joints: Object.fromEntries(Object.entries(joints).map(([k, v]) => [k, add(v, ref)])), rotations, root: [0, 0, 0], referenceRoot: ref, ball: null};
    f.localJoints = joints; f.assetRoot = [0, 0, 0];
    f.soles = {}; f.palms = {}; f.contactPoints = {};
    for (const bone of ['LeftFoot', 'RightFoot']) { f.soles[bone] = add(f.joints[bone], qrotate(rotations[bone], [0, -.08, 0])); f.contactPoints[bone + ':sole'] = f.soles[bone]; }
    for (const bone of ['LeftHand', 'RightHand']) f.palms[bone] = add(f.joints[bone], qrotate(rotations[bone], [0, -.08, .025]));
    f.floorPoints = Object.entries(f.soles).map(([bone, position]) => ({bone, position}));
    frames.push(f);
  }
  return frames;
}
export function score(analyze, clip, opts = {}) {
  const loop = clip.loop, kind = /^(walk|jog|run|sprint)/.test(clip.name) ? 'locomotion' : 'other';
  const speed = opts.speed ?? clip.speed ?? 0;
  const metadata = {loop, role: 'field', kind, rootMotion: false, referenceTravelKnown: speed > 0, speed: speed || null, checkHingeDirection: true, soleLocal: [0, -.08, 0], unit: 'metres', timeUnit: 'seconds', supports: [], ballContacts: []};
  return analyze({frames: framesFor(clip, {speed}), duration: clip.dur, height: opts.height ?? 1.88, metadata, clipId: clip.name, sport: clip.lib});
}
