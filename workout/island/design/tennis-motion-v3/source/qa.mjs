// SPDX-License-Identifier: CC0-1.0
// Independent measurements from the exported GLB. No authoring or IK module is imported.
import '../../tennis-motion-v2/source/qa-register.mjs';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Quaternion, Vector3} from '../../tennis-motion-v2/vendor/three.module.js';
import {analyzeClip, METRICS} from '../../tennis-motion-v2/vendor/motion-qa-v1/metrics.mjs';
const {parseGLB, sampleGLB} = await import('../../tennis-motion-v2/vendor/motion-qa-v1/glb.mjs');

const root = new URL('../', import.meta.url);
const v2 = new URL('../tennis-motion-v2/', root);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rounded = (value, digits = 6) => Number(value.toFixed(digits));
const distance = (a, b) => Math.hypot(...a.map((x, k) => x - b[k]));
const v1Commit = '5eb4f093bc22523ee417a7f2345c3b813bffba24';
const sampleRate = 120;
const phaseSteps = 32;
const reportFile = name => new URL(`verification/${name}.json`, root);
const writeReport = (name, data) => fs.writeFile(reportFile(name), JSON.stringify(data, null, 2) + '\n');

async function engineProvenance() {
  const manifest = await fs.readFile(new URL('verification/qa-provenance.json', v2));
  const expectedManifest = 'bbbd80ccc933404fbe1218896244d5f62dd76955244f284929f9fa9dd2fe2dd9';
  if (sha(manifest) !== expectedManifest) throw new Error('Unrecognized v2 QA provenance manifest');
  const source = JSON.parse(manifest);
  const files = [];
  for (const file of source.files) {
    const bytes = await fs.readFile(new URL(file.path, v2));
    if (file.commit !== v1Commit || bytes.length !== file.bytes || sha(bytes) !== file.sha256) {
      throw new Error(`Pinned QA input changed: ${file.path}`);
    }
    files.push({...file, path: `../tennis-motion-v2/${file.path}`});
  }
  const testFiles = source.files.filter(file => file.path.endsWith('.test.mjs'));
  const args = ['--import', './source/qa-register.mjs', '--test', '--test-reporter=tap', ...testFiles.map(f => f.path)];
  const tap = execFileSync(process.execPath, args, {cwd: v2, encoding: 'utf8'});
  const count = key => Number(tap.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1]);
  const engineTests = {total: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped')};
  if (!(engineTests.total > 0 && engineTests.passed === engineTests.total && engineTests.failed === 0 && engineTests.skipped === 0)) {
    throw new Error('Pinned engine tests did not all pass');
  }
  const provenance = {
    tool: 'motion-qa-v1', commit: v1Commit,
    sourceManifest: '../tennis-motion-v2/verification/qa-provenance.json',
    sourceManifestSha256: expectedManifest, files, engineTests,
  };
  await writeReport('qa-provenance', provenance);
  return provenance;
}

function phaseTimes(duration) {
  return Array.from({length: phaseSteps + 1}, (_, index) => duration * index / phaseSteps);
}

function nearestIndex(frames, time) {
  let low = 0, high = frames.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (frames[middle].t < time) low = middle + 1;
    else high = middle;
  }
  if (low > 0 && Math.abs(frames[low - 1].t - time) < Math.abs(frames[low].t - time)) return low - 1;
  return low;
}

// Both root-relative metrics and continuity need the actor's position. Here the
// authored movement is carried by Hips, immediately below the fixed scene Root.
// The adapter supplies that XZ origin only. World-space joints, feet, ball and
// joint heights are untouched. The structural check independently tests Root.
function present(frames) {
  for (const frame of frames) frame.root = [frame.joints.Hips[0], 0, frame.joints.Hips[2]];
}

function sampleAsset(glb, entry) {
  const metadata = entry.metadata;
  const extraTimes = [...phaseTimes(entry.duration), ...metadata.events.map(e => e.time)];
  for (const w of [...metadata.supports, ...(metadata.groundContacts ?? []), ...(metadata.ballContacts ?? [])]) extraTimes.push(w.start, w.end);
  const data = sampleGLB(glb, {animation: entry.id, fps: sampleRate, extraTimes});
  present(data.frames);
  return {...data, entry};
}

function phaseSignature(sampled) {
  const times = phaseTimes(sampled.duration);
  return times.map(t => {
    const frame = sampled.frames[nearestIndex(sampled.frames, t)];
    const center = frame.joints.Hips;
    return Object.keys(frame.joints).filter(bone => bone !== 'Root').map(bone => ({
      position: frame.joints[bone].map((v, i) => i === 1 ? v : v - center[i]),
      rotation: frame.localRotations[bone],
    }));
  });
}

function rotationDistanceDegrees(a, b) {
  const dot = a.reduce((sum, component, i) => sum + component * b[i], 0);
  return 2 * Math.acos(Math.min(1, Math.abs(dot))) * 180 / Math.PI;
}

function signatureDistance(a, b) {
  let squareDistance = 0, squareAngle = 0, count = 0;
  for (let phase = 0; phase < a.length; phase++) for (let j = 0; j < a[phase].length; j++) {
    const left = a[phase][j], right = b[phase][j];
    squareDistance += distance(left.position, right.position) ** 2;
    squareAngle += rotationDistanceDegrees(left.rotation, right.rotation) ** 2;
    count++;
  }
  return {rmsMarkerMeters: rounded(Math.sqrt(squareDistance / count)), rmsLocalRotationDegrees: rounded(Math.sqrt(squareAngle / count))};
}

function nearestMotion(id, signature, library) {
  const candidates = [...library].filter(([other]) => other !== id).map(([other, target]) => ({id: other, ...signatureDistance(signature, target)}));
  candidates.sort((a, b) => a.rmsMarkerMeters - b.rmsMarkerMeters || a.rmsLocalRotationDegrees - b.rmsLocalRotationDegrees);
  return {nearest: candidates[0], nearDuplicates: candidates.filter(c => c.rmsMarkerMeters < .001 && c.rmsLocalRotationDegrees < .5).map(c => c.id)};
}

function samplesAtReference(reference, all) {
  const target = all.get(reference.clip);
  if (!target) throw new Error(`Unknown native continuity reference: ${reference.clip}`);
  const t = reference.time === 'end' ? target.duration : reference.time;
  if (!(Number.isFinite(t) && t >= 0 && t <= target.duration + 1e-6)) throw new Error(`Out of bounds continuity reference: ${reference.clip} @ ${t}`);
  const index = nearestIndex(target.frames, t);
  return target.frames.slice(Math.max(0, index - 1), Math.min(target.frames.length, index + 2));
}

function continuityFor(entry) {
  const rally = ['volley_low', 'volley_high', 'half_volley', 'lob', 'overhead_backward',
    'serve_return_aggressive', 'defensive_slice', 'lateral_crossover_run', 'change_direction'];
  // The rally ready stance holds the handle with two hands. The court/social
  // neutral frees the left hand for a brace, handshake, gesture or ball toss.
  const candidates = rally.includes(entry.id) ? ['volley_low', 'volley_high'] : ['point_disappointment', 'point_win'];
  const neutral = {clip: candidates.find(id => id !== entry.id), time: 0};
  // The fall finishes seated and get-up starts from that same grounded pose.
  const references = {entry: neutral, exit: neutral, ...entry.metadata.continuityReferences};
  if (entry.id === 'court_fall') references.exit = {clip: 'court_get_up', time: 0};
  if (entry.id === 'court_get_up') references.entry = {clip: 'court_fall', time: 'end'};
  return references;
}

function floorTransition(all) {
  const fall = all.get('court_fall').frames.at(-1);
  const rise = all.get('court_get_up').frames[0];
  const bones = Object.keys(fall.joints);
  const maxMarkerDifferenceMeters = Math.max(...bones.map(b => distance(fall.joints[b], rise.joints[b])));
  const maxLocalRotationDegrees = Math.max(...bones.map(b => rotationDistanceDegrees(fall.localRotations[b], rise.localRotations[b])));
  return {
    from: 'court_fall', to: 'court_get_up', joints: bones.length,
    maxMarkerDifferenceMeters: rounded(maxMarkerDifferenceMeters), maxLocalRotationDegrees: rounded(maxLocalRotationDegrees),
    seatedHipHeightMeters: rounded(fall.joints.Hips[1]), bracedLeftWristHeightMeters: rounded(fall.joints.LeftHand[1]),
    pass: maxMarkerDifferenceMeters < .001 && maxLocalRotationDegrees < .1,
  };
}

function contactPoint(frame, bone, local) {
  return new Vector3(...local).applyQuaternion(new Quaternion(...frame.rotations[bone]))
    .add(new Vector3(...frame.joints[bone])).toArray();
}

// Verify every authored ground-support window, including the non-foot contacts
// that the vendor's foot-sliding metric intentionally does not classify.
function supportMeasurements(frames, metadata) {
  const windows = metadata.supports.map(w => ({kind: 'plant', ...w}));
  for (const window of metadata.groundContacts ?? []) {
    const bones = window.footBones ?? [window.bone];
    for (const bone of bones) windows.push({...window, bone});
  }
  return windows.map(window => {
    const {bone, start, end, kind, local = bone.endsWith('Foot') ? metadata.soleLocal : [0, 0, 0]} = window;
    const samples = frames.filter(f => f.t >= start - 1e-6 && f.t <= end + 1e-6);
    if (!samples.length) throw new Error(`Empty support interval: ${bone} [${start}, ${end}]`);
    const points = samples.map(f => contactPoint(f, bone, local));
    const heights = points.map(p => p[1]);
    const horizontalDrift = points.map(p => Math.hypot(p[0] - points[0][0], p[2] - points[0][2]));
    return {
      kind, bone, start, end, local, samples: points.length, minHeightMeters: rounded(Math.min(...heights)),
      maxHeightMeters: rounded(Math.max(...heights)), maxHorizontalDriftMeters: rounded(Math.max(...horizontalDrift)),
    };
  });
}

export async function runQA() {
  const provenance = await engineProvenance();
  const catalog = JSON.parse(await fs.readFile(new URL('catalog.json', root)));
  const asset = await fs.readFile(new URL(catalog.asset, root));
  const glb = parseGLB(asset);
  const all = new Map(catalog.clips.map(entry => [entry.id, sampleAsset(glb, entry)]));
  const v2Asset = await fs.readFile(new URL('tennis-motion-v2.glb', v2));
  const reference = parseGLB(v2Asset);
  const v2Catalog = JSON.parse(await fs.readFile(new URL('catalog.json', v2)));
  const v2Motions = new Map(v2Catalog.clips.map(entry => {
    const sampled = sampleGLB(reference, {animation: entry.id, fps: 30, extraTimes: phaseTimes(entry.duration)});
    return [entry.id, phaseSignature(sampled)];
  }));
  const v3Motions = new Map(catalog.clips.map(c => [c.id, phaseSignature(all.get(c.id))]));
  const differences = [], errors = [], clips = [];
  for (const entry of catalog.clips) {
    const {id, metadata} = entry;
    const {duration, height, frames} = all.get(id);
    const refs = continuityFor(entry);
    const idleFrames = Object.fromEntries(Object.entries(refs).map(([end, ref]) => [end, samplesAtReference(ref, all)]));
    const result = analyzeClip({frames, duration, height, metadata, idleFrames, clipId: id, sport: 'tennis'});
    const support = supportMeasurements(frames, metadata);
    if (result.score <= 88 || result.coverage !== 1) errors.push(`${id}: score ${result.score}, coverage ${result.coverage}`);
    if (result.metrics.ballContact.status === 'not-applicable' && metadata.ballContactExpected) errors.push(`${id}: missing expected ball contact measurement`);
    // Declaring an airborne foot as support can falsely award a low slide score.
    for (const w of support.filter(w => w.kind === 'plant' && w.bone.endsWith('Foot'))) {
      if (Math.max(Math.abs(w.minHeightMeters), Math.abs(w.maxHeightMeters)) > .03) errors.push(`${id}: declared ${w.bone} plant is over 3 cm from the court`);
    }
    const signature = v3Motions.get(id);
    const neighboring = nearestMotion(id, signature, v3Motions);
    const previous = nearestMotion(null, signature, v2Motions);
    if (neighboring.nearDuplicates.length || previous.nearDuplicates.length) errors.push(`${id}: near-duplicate native motion detected`);
    differences.push({id, nearestV2: previous.nearest, nearestOtherV3: neighboring.nearest, nearDuplicatesV2: previous.nearDuplicates, nearDuplicatesV3: neighboring.nearDuplicates});
    clips.push({id, nativeFrameCount: entry.frameCount, measuredSamples: frames.length, durationSeconds: rounded(duration), statureProxyMeters: rounded(height), continuityReferences: refs, support, ...result});
    console.log(`${id}: ${result.score} (${result.coverage * 100}% applicable coverage)`);
  }
  const seatedTransition = floorTransition(all);
  if (!seatedTransition.pass) errors.push('Native court_fall endpoint differs from court_get_up entrance');
  const pass = errors.length === 0;
  await writeReport('motion-distances', {
    phaseCount: phaseSteps + 1, comparedToAllV2Clips: v2Motions.size, comparedToOtherV3Clips: v3Motions.size - 1,
    method: '33 normalized phase samples of the 17 joint centers and local quaternions below Root. Horizontal pelvis translation is removed, so relocating a clip does not make a new motion. Nearest means minimum RMS marker position distance. Near duplicates must satisfy both tolerances.',
    nearDuplicateTolerance: {rmsMarkerMeters: .001, rmsLocalRotationDegrees: .5},
    referenceSha256: sha(v2Asset), assetSha256: sha(asset), clips: differences,
  });
  const report = {
    schemaVersion: 1, tool: 'motion-qa-v1', toolCommit: provenance.commit, provenance: 'verification/qa-provenance.json',
    asset: catalog.asset, assetSha256: sha(asset), nativeRateHz: 30, measurementRateHz: sampleRate,
    minimumExclusiveScore: 88, minimumScore: Math.min(...clips.map(c => c.score)),
    averageScore: rounded(clips.reduce((sum, c) => sum + c.score, 0) / clips.length, 2),
    pass, errors, seatedTransition, metricDefinitions: METRICS,
    measurement: [
      'Decoded published GLB, sampled at 120 Hz plus native keys, authored contacts, support boundaries and normalized fingerprint phases.',
      'The fixed Root is validated against v2 separately. Motion QA receives world-space joint, ball and sole positions and the horizontal Hips marker as the presented actor origin. The vendor compares measured support and net travel along one axis across a locomotion clip; braking and reversal contribute to the recorded score.',
      'Rally endpoints use an independent two-handed ready take. Court and social endpoints use an independent open-hand ready take. The seated fall exit and get-up entrance use each other. Each reference retains neighboring samples for the vendor velocity check.',
      'The weighted score screens marker motion. Floor probes test soles and skeletal centers; support evidence includes every declared ground-contact interval. Neither full deformed surface collision nor human visual preference is measured.',
    ], clips,
  };
  await writeReport('motion-qa', report);
  console.log(JSON.stringify({minimumScore: report.minimumScore, averageScore: report.averageScore, pass, errors}));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!(await runQA()).pass) process.exitCode = 1;
}
