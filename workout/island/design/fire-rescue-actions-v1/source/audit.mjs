// SPDX-License-Identifier: CC0-1.0
// Measure the delivered GLB with the pinned motion-qa-v1 reader and metrics.
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const pack = new URL('../', import.meta.url);
const design = new URL('../', pack);
const buildDir = mkdtempSync(path.join(tmpdir(), 'fire-rescue-motion-qa-'));
process.on('exit', () => rmSync(buildDir, { recursive: true, force: true }));

const qaCommit = '5eb4f093bc22523ee417a7f2345c3b813bffba24';
const glbReader = 'motion-qa-v1/glb.mjs';
const metricModule = 'motion-qa-v1/metrics.mjs';
const threeModule = 'soccer-motion-v8/runtime/vendor/three.module.js';
const qaVendor = 'fire-rescue-people-v2/source/qa-vendor/';
const localQaSources = {
  [glbReader]: {
    local: qaVendor + 'glb.mjs',
    sha256: '0e5763ad87754a94522e631036fa8c20c881bb9ff00e676087905f82c07400cc',
  },
  [metricModule]: {
    local: qaVendor + 'metrics.mjs',
    sha256: 'bff64c9ff97798b466b4193962594d1554f684f3f19fa931d310d7432260fed7',
  },
  [threeModule]: {
    local: threeModule,
    sha256: '3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6',
  },
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const toolHashes = {};
for (const [file, { local, sha256 }] of Object.entries(localQaSources)) {
  const target = path.join(buildDir, file);
  const source = readFileSync(new URL(local, design));
  // Restore the pinned import in the temporary copy. People v2 changed only this path.
  const bytes = file === glbReader
    ? Buffer.from(source.toString('utf8').replace('../../../defense-v7/vendor/three.module.js',
      '../soccer-motion-v8/runtime/vendor/three.module.js'))
    : source;
  const actual = hash(bytes);
  if (actual !== sha256) throw Error('Pinned QA checksum mismatch: ' + file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  toolHashes[file] = actual;
}
writeFileSync(path.join(buildDir, 'package.json'), '{"type":"module"}\n');
const importTool = file => import(pathToFileURL(path.join(buildDir, file)));
const { parseGLB, readAccessor, sampleGLB } = await importTool(glbReader);
const { analyzeClip } = await importTool(metricModule);
const { Euler, Vector3 } = await importTool(threeModule);

const read = (base, file) => readFileSync(new URL(file, base));
const json = (base, file) => JSON.parse(read(base, file));
const catalog = json(pack, 'catalog.json');
const bytes = read(pack, catalog.asset);
const glb = parseGLB(bytes);
const { bones } = json(design, 'fire-rescue-people-v2/skeleton.json');
const names = new Set(bones.map(({ name }) => name));
const nodes = glb.json.nodes;
const animations = glb.json.animations;
const nativeHz = 30;
const sampleRates = [60, 120];
const minimumExclusive = 88;
const near = (a, b) => Math.abs(a - b) <= 2e-6;
const checks = [];
const check = (name, pass) => checks.push({ name, pass: !!pass });
const forbidden = /draco|meshopt|ktx2|basisu/i;
check('The declared GLB SHA-256 matches', hash(bytes) === catalog.assetSha256);
check('The asset has no compression extensions or external resources',
  ![...(glb.json.extensionsUsed ?? []), ...(glb.json.extensionsRequired ?? [])].some(value => forbidden.test(value))
  && !(glb.json.images ?? []).some(image => image.uri || image.mimeType === 'image/ktx2'));
check('The catalog matches all 14 unique exported clips at 30 Hz',
  catalog.sampleRateHz === nativeHz && catalog.actions.length === 14 && animations.length === 14
  && new Set(catalog.actions.map(entry => entry.id)).size === 14);
check('The motion asset contains exactly the 18 canonical nodes', nodes.length === 18 && bones.length === 18);
for (const { name, parent, restTranslationMeters } of bones) {
  const index = nodes.findIndex(node => node.name === name);
  const node = nodes[index];
  const actualParent = nodes.find(candidate => candidate.children?.includes(index));
  check('Canonical bind ' + name, nodes.filter(candidate => candidate.name === name).length === 1
    && (actualParent?.name ?? null) === parent
    && (node.translation ?? [0, 0, 0]).every((value, axis) => near(value, restTranslationMeters[axis]))
    && (node.rotation ?? [0, 0, 0, 1]).every((value, axis) => near(value, axis === 3 ? 1 : 0)));
}

const firefighterMotions = 'firefighter-v1/motions/firefighter-clips.glb';
const ready = 'fire-rescue-people-v2/models/young-firefighter.glb';
const referenceStances = {
  ready: { asset: ready, clip: 'idle', scale: 1.03 },
  cradle: { asset: firefighterMotions, clip: 'rescued_handoff', interval: [0, .12] },
  'shoulder-loaded': { asset: 'fire-rescue-people-v2/models/female-firefighter.glb', clip: 'rescue_carry', interval: [1.55, 3.95] },
  'cat-loaded': { asset: firefighterMotions, clip: 'carry_cat' },
};
const referenceFrames = new Map();
function reference(stance, fps) {
  const key = stance + '@' + fps;
  if (referenceFrames.has(key)) return referenceFrames.get(key);
  const { asset, clip, interval, scale = 1 } = referenceStances[stance];
  let { frames } = sampleGLB(read(design, asset), { animation: clip, fps, extraTimes: interval });
  if (interval) frames = frames.filter(({ t }) => t >= interval[0] - 1e-6 && t <= interval[1] + 1e-6);
  // The preview actor has a uniform 1.03 presentation scale. Compare with the canonical animation in meters.
  if (scale !== 1) {
    for (const frame of frames) {
      if (!frame.scales.Root.every(value => near(value, scale))) throw Error('Reference scale does not match metadata');
      frame.joints = Object.fromEntries(Object.entries(frame.joints).map(([bone, coordinates]) =>
        [bone, coordinates.map(value => value / scale)]));
      frame.root = frame.joints.Root;
    }
  }
  referenceFrames.set(key, frames);
  return frames;
}

function measureEngagedGrips(entry, frames) {
  return entry.attachments.filter(attachment => attachment.space === 'prop-local' && attachment.bone.endsWith('Hand'))
    .map(({ bone, prop, offset, start, end, blendSeconds = 0 }) => {
      const offsetVector = new Vector3(...offset);
      const track = entry.propTracks[prop];
      let sampleCount = 0;
      let worst = null;
      for (const frame of frames) {
        const index = Math.round(frame.t * nativeHz);
        if (!near(frame.t, index / nativeHz) || frame.t < start + blendSeconds - 1e-6
          || frame.t > end - blendSeconds + 1e-6) continue;
        const [x, y, z, rx, ry, rz] = track[index];
        const rotation = new Euler(...[rx, ry, rz].map(value => value * Math.PI / 180), 'XYZ');
        const marker = offsetVector.clone().applyEuler(rotation).add(new Vector3(x, y, z));
        const errorMeters = marker.distanceTo(new Vector3(...frame.joints[bone]));
        if (!worst || errorMeters > worst.errorMeters) worst = { time: frame.t, errorMeters };
        sampleCount++;
      }
      return { bone, prop, sampleCount, worst };
    });
}

const clips = [];
for (const entry of catalog.actions) {
  const animation = animations.find(candidate => candidate.name === entry.id);
  if (!animation) throw Error('Missing animation ' + entry.id);
  const tracks = animation.channels.filter(({ target }) => target.path === 'rotation' && names.has(nodes[target.node].name));
  const targets = tracks.map(({ target }) => target.node);
  check(entry.id + ' has all 18 rotation tracks', targets.length === 18 && new Set(targets).size === 18);
  const normalized = tracks.every(({ sampler }) => {
    const values = readAccessor(glb, animation.samplers[sampler].output);
    for (let i = 0; i < values.length; i += 4) {
      if (!near(Math.hypot(...values.slice(i, i + 4)), 1)) return false;
    }
    return true;
  });
  check(entry.id + ' has normalized quaternions', normalized);
  const expectedFrames = Math.round(entry.duration * nativeHz) + 1;
  const timed = animation.samplers.every(({ input, interpolation = 'LINEAR' }) => {
    const times = readAccessor(glb, input);
    return interpolation === 'LINEAR' && times.length === expectedFrames
      && times.every((time, index) => near(time, index / nativeHz))
      && near(times.at(-1), entry.duration);
  });
  check(entry.id + ' has a 1.5–3 s catalog-matching 30 Hz timeline', expectedFrames === entry.frameCount
    && entry.duration >= 1.5 && entry.duration <= 3 && timed
    && entry.timer.mode === 'countdown' && near(entry.timer.durationSeconds, entry.duration)
    && entry.timer.completesAtFrame === expectedFrames - 1);
  const validInterval = (start, end) => start >= 0 && start <= end && end <= entry.duration + 2e-6;
  check(entry.id + ' has local accessory tracks and in-range attachment timing',
    entry.props.length > 0 && entry.attachments.length > 0
    && entry.props.every(({ id }) => entry.propTracks[id]?.length === expectedFrames)
    && entry.attachments.every(({ bone, prop, start, end }) => names.has(bone)
      && entry.props.some(candidate => candidate.id === prop) && validInterval(start, end))
    && entry.events.every(({ time }) => validInterval(time, time)));
  const icon = read(pack, entry.icon).toString('utf8');
  check(entry.id + ' has a local 96×96 SVG', /<svg\b/.test(icon)
    && /\bwidth="96"/.test(icon) && /\bheight="96"/.test(icon) && /viewBox="0 0 96 96"/.test(icon));
  const { entryStance, exitStance } = entry;
  const qa = entry.qa;
  const metadata = { ...qa, ballVisible: false };
  const measures = {};
  let grips;
  for (const fps of sampleRates) {
    const sampled = sampleGLB(glb, {
      animation: entry.id, fps,
      extraTimes: [...qa.supports.flatMap(({ start, end }) => [start, end]), ...entry.events.map(({ time }) => time)],
    });
    const idleFrames = { entry: reference(entryStance, fps), exit: reference(exitStance, fps) };
    const { score, coverage, metrics } = analyzeClip({
      ...sampled, metadata, idleFrames, clipId: entry.id, sport: 'fire-rescue',
    });
    const statuses = Object.fromEntries(Object.entries(metrics).map(([name, { status, value }]) => [name, { status, value }]));
    const reds = Object.values(statuses).filter(({ status }) => status === 'red').length;
    check(entry.id + ' passes motion-qa-v1 at ' + fps + ' Hz', score > minimumExclusive && coverage === 1 && reds === 0);
    measures[fps] = {
      score, coverage, sampleCount: sampled.frames.length, redMetrics: reds,
      metrics: statuses, footDriftMeters: metrics.footSliding.evidence.maxDriftMeters,
      soleOrJointFloorDepthMeters: metrics.floorPenetration.evidence.maxDepthMeters,
      floorProbeWorst: metrics.floorPenetration.evidence.worst,
    };
    if (fps === 120) grips = measureEngagedGrips(entry, sampled.frames);
  }
  clips.push({ id: entry.id, duration: entry.duration, nativeFrames: expectedFrames, entryStance, exitStance, measures, grips });
}
const scores = clips.map(clip => clip.measures[120].score);
const peakGripErrors = clips.flatMap(clip => clip.grips).map(grip => grip.worst?.errorMeters ?? 0);
const report = {
  tool: 'motion-qa-v1', qaCommit, toolHashes, assetSha256: hash(bytes),
  nativeHz, sampleRates, minimumExclusive, referenceStances,
  allChecksPassed: checks.every(({ pass }) => pass),
  passedChecks: checks.filter(({ pass }) => pass).length,
  minimumScore: Math.min(...scores),
  meanScore: Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)),
  maximumSoleDriftMeters: Math.max(...clips.map(clip => clip.measures[120].footDriftMeters)),
  maximumSoleOrJointFloorDepthMeters: Math.max(...clips.map(clip => clip.measures[120].soleOrJointFloorDepthMeters)),
  maximumEngagedGripErrorMeters: Math.max(...peakGripErrors),
  failedChecks: checks.filter(({ pass }) => !pass).map(({ name }) => name),
  clips,
};
mkdirSync(new URL('verification/', pack), { recursive: true });
writeFileSync(new URL('verification/motion-qa.json', pack), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  passed: report.allChecksPassed, scoreMinimum: report.minimumScore,
  mean: report.meanScore, maxGripErrorMeters: report.maximumEngagedGripErrorMeters, failedChecks: report.failedChecks,
}, null, 2));
if (!report.allChecksPassed) process.exitCode = 1;
