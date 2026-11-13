// SPDX-License-Identifier: CC0-1.0
// Independent delivery checks: geometry is measured from FK, never from claimed QA values.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CANON_NAMES, normaliseSoccerClip, sampleCanonical, jointWorld, qrotate, gaitMetrics, checkGait} from '../../../minigames/athletes-core.mjs';

const root = new URL('../', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const bytes = readFileSync(new URL('clips.json', root));
const hash = createHash('sha256').update(bytes).digest('hex');
const pack = JSON.parse(bytes), original = read('../hockey-v1/clips.json');
const baseline = read('../hockey-v1/evidence/codex-qa/report.json').libraries[0].clips;
const targeted = baseline.filter(c => c.score < 88).map(c => c.id);
const errors = [], assert = (ok, message) => { if (!ok) errors.push(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
assert(Object.keys(pack.states).length === 30, 'Exactly 30 states required');
assert(targeted.length === 15, 'Exactly 15 original failed states required');
const preserved = baseline.filter(c => c.score >= 88).map(c => {
  const identical = same(pack.states[c.id], original.states[c.id]);
  assert(identical, c.id + ': previously passing state changed');
  return {id: c.id, identical};
});
const blade = [[0, -.08, -.0865], [0, -.08, .1985]];
const add = (a, b) => a.map((x, i) => x + b[i]);
const angle = (a, b, c) => {
  const x = a.map((v, i) => v - b[i]), y = c.map((v, i) => v - b[i]);
  return Math.acos(Math.max(-1, Math.min(1, x.reduce((s, v, i) => s + v * y[i], 0) / (Math.hypot(...x) * Math.hypot(...y))))) * 180 / Math.PI;
};
const states = [];
for (const id of targeted) {
  const s = pack.states[id], clip = {...normaliseSoccerClip(id, s, 'hockey-v2'), loop: false};
  assert(s.durationSeconds === original.states[id].durationSeconds, id + ': duration changed');
  assert(s.keyframes.length >= Math.ceil(s.durationSeconds * 60), id + ': rebuild must sample full trajectory');
  assert(!same(s.keyframes, original.states[id].keyframes), id + ': not rebuilt');
  assert(s.keyframes[0].time === 0 && s.keyframes.at(-1).time === 1, id + ': incomplete keyframe coverage');
  for (let k = 0; k < s.keyframes.length; k++) {
    const f = s.keyframes[k];
    assert(k === 0 || f.time > s.keyframes[k-1].time, id + ': unordered keys');
    assert(same(Object.keys(f.rotations), CANON_NAMES), id + ': missing bone');
    assert(f.hipsOffsetMeters.length === 3 && f.hipsOffsetMeters.every(Number.isFinite), id + ': nonfinite hips');
    assert(Object.values(f.rotations).every(q => q.length === 4 && q.every(Number.isFinite) && Math.abs(Math.hypot(...q) - 1) < 1e-5), id + ': invalid quaternion');
  }
  const support = s.supports || [];
  assert(support.length > 0, id + ': missing blade contact windows');
  for (const w of support) {
    assert(['LeftFoot', 'RightFoot'].includes(w.bone) && w.contact === 'blade', id + ': invalid contact');
    assert(Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start && w.start >= 0 && w.end <= s.durationSeconds + 1e-6, id + ': invalid contact time');
  }
  const n = Math.ceil(s.durationSeconds * 240);
  let maxPlaneError = 0, maxNormalTilt = 0, elbowMin = Infinity, elbowMax = -Infinity, minBladeSeparation = Infinity;
  let maxUncoveredContactSeconds = 0;
  const unlabelled = {LeftFoot: 0, RightFoot: 0};
  let contactSamples = 0;
  for (let i = 0; i <= n; i++) {
    const t = i * s.durationSeconds / n, w = jointWorld(sampleCanonical(clip, t));
    const centers = [];
    for (const bone of ['LeftFoot', 'RightFoot']) {
      const points = blade.map(p => add(w[bone].p, qrotate(w[bone].q, p)));
      const declared = support.some(c => c.bone === bone && t >= c.start - 1e-7 && t <= c.end + 1e-7);
      const y = Math.max(...points.map(p => Math.abs(p[1])));
      if (declared) {
        contactSamples++;
        maxPlaneError = Math.max(maxPlaneError, y);
        const up = qrotate(w[bone].q, [0, 1, 0]);
        maxNormalTilt = Math.max(maxNormalTilt, Math.acos(Math.max(-1, Math.min(1, up[1]))) * 180 / Math.PI);
      }
      // Count sustained omitted contact, not the isolated zero-height lift/landing instant.
      unlabelled[bone] = !declared && y < .001 ? unlabelled[bone] + s.durationSeconds/n : 0;
      maxUncoveredContactSeconds = Math.max(maxUncoveredContactSeconds, unlabelled[bone]);
      centers.push(add(w[bone].p, qrotate(w[bone].q, [0,-.04,.055])));
    }
    minBladeSeparation = Math.min(minBladeSeparation, Math.hypot(...centers[0].map((v,j) => v-centers[1][j])));
    for (const side of ['Left', 'Right']) {
      const a = angle(w[side+'Arm'].p, w[side+'ForeArm'].p, w[side+'Hand'].p);
      elbowMin = Math.min(elbowMin, a); elbowMax = Math.max(elbowMax, a);
    }
  }
  assert(contactSamples > 0 && maxPlaneError <= .005, id + ': blade plane error >5mm');
  assert(maxNormalTilt <= 1, id + ': contact sole plane tilted >1 degree');
  assert(maxUncoveredContactSeconds < .06, id + ': omitted sustained blade contact');
  const metrics = gaitMetrics(clip, 120), athleteFails = s.gaitKind ? checkGait(metrics, s.gaitKind) : [];
  assert(athleteFails.length === 0, id + ': athlete standard: ' + athleteFails.join(', '));
  if (s.gaitKind) assert(elbowMin >= 40 - .001 && elbowMax <= 100 + .001, id + ': elbow outside 40–100 degrees');
  const travel = s.referenceRootMotion;
  assert(Array.isArray(travel) && travel.length >= 2 && travel[0].timeSeconds === 0 && Math.abs(travel.at(-1).timeSeconds - s.durationSeconds) < 1e-5, id + ': incomplete world trajectory');
  let distance = 0;
  for (let i = 1; i < (travel?.length || 0); i++) distance += Math.hypot(...travel[i].translationMeters.map((x,j) => x-travel[i-1].translationMeters[j]));
  // Celebration was deliberately changed to a stationary pivot in v1; other travel must remain substantial.
  if (id !== 'celebrate_3') {
    const old = original.states[id].referenceRootMotion;
    let oldDistance = 0;
    for (let i=1;i<old.length;i++) oldDistance += Math.hypot(...old[i].translationMeters.map((x,j)=>x-old[i-1].translationMeters[j]));
    assert(distance >= .9 * oldDistance, id + ': travel reduced by more than 10%');
  }
  states.push({id, samples240Hz:n+1, keyframes:s.keyframes.length, contactSamples, maxPlaneErrorMeters:maxPlaneError, maxNormalTiltDegrees:maxNormalTilt,
    maxUncoveredContactSeconds, minBladeCenterSeparationMeters:minBladeSeparation, elbowMin, elbowMax, athleteMetrics:metrics, athleteFails, pathLengthMeters:distance});
}
const qa = read('evidence/qa/report.json');
const measured = qa.libraries.find(l => l.id === 'hockey-v2') || qa.libraries[0];
assert(measured.sources.some(s => s.path.endsWith('hockey-v2/clips.json') && s.sha256 === hash), 'QA input hash mismatch');
assert(measured.clips.every(c => c.coverage === 1), 'Missing applicable QA measurements');
const legacy = read('evidence/legacy/report.json').libraries[0];
assert(legacy.sources.some(s => s.path.endsWith('hockey-v2/clips.json') && s.sha256 === hash), 'Legacy QA input hash mismatch');
for (const c of preserved) {
  const before = baseline.find(x => x.id === c.id), after = measured.clips.find(x => x.id === c.id);
  assert(after && same(before.metrics, after.metrics) && before.score === after.score, c.id + ': passing metrics changed');
}
const targetedScores = measured.clips.filter(c => targeted.includes(c.id)).map(c => ({id:c.id, score:c.score, redMetrics:Object.entries(c.metrics).filter(([,m]) => m.status === 'red').map(([name])=>name)}));
assert(targetedScores.length === 15, 'QA must measure all 15 targets');
const notReady = targetedScores.filter(c => c.score < 88 || c.redMetrics.length);
// Readiness is recorded separately: a failed readiness target still produces a useful evidence report.
const mesh = read('evidence/mesh-contact.json');
assert(mesh.inputs.clipsSha256 === hash, 'Mesh audit input hash mismatch');
assert(mesh.summary.allBodyAboveTolerance && mesh.summary.allStickAboveTolerance, 'Skinned mesh or stick penetrates ice >5mm');
const browser = read('preview/browser-evidence.json');
assert(browser.errors.length === 0 && browser.sheets.length === 45, 'Browser rendering error or missing sheets');
assert(browser.inputs.some(i => i.path.endsWith('hockey-v2/clips.json') && i.sha256 === hash), 'Browser input hash mismatch');
const result = {schemaVersion:1, license:'CC0-1.0', source:'source/validate.mjs', clipsSha256:hash, valid:errors.length===0, ready:errors.length===0 && notReady.length===0,
  errors, targetedScores, notReady, preserved, states, meshSummary:mesh.summary};
mkdirSync(new URL('evidence/',root),{recursive:true});
writeFileSync(new URL('evidence/validation.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({valid:result.valid,ready:result.ready,errors,notReady,targetedScores}));
if (!result.ready) process.exitCode = 1;
