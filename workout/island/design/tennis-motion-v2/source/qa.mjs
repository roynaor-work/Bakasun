// SPDX-License-Identifier: CC0-1.0
// Tennis adapter around the byte-identical motion-qa-v1 reader and scoring maths.
// Measurements come from the published GLB, independently of the authoring IK.
import './qa-register.mjs';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {analyzeClip, METRICS} from '../vendor/motion-qa-v1/metrics.mjs';
const {sampleGLB, parseGLB, readAccessor} = await import('../vendor/motion-qa-v1/glb.mjs');

const root = new URL('../', import.meta.url);
const SHA = data => createHash('sha256').update(data).digest('hex');
const round = value => Number(value.toFixed(8));
const norm = value => Math.hypot(...value);
const distance = (a, b) => norm(a.map((v, i) => v - b[i]));
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, k) => a.map(v => v * k);
const unit = q => scale(q, 1 / norm(q));
const rotationDerivative = (q, derivative) => {
  const length = norm(q), normalized = unit(q);
  return scale(add(derivative, scale(normalized, -dot(normalized, derivative))), 1 / length);
};
const CORE = /^(Root|Hips|Spine|Chest|Neck|Head|(?:Left|Right)(?:Arm|ForeArm|Hand|UpLeg|Leg|Foot))$/;
const TOLERANCE = {positionMeters: 0.0001, quaternionComponents: 0.0001, velocityPerSecond: 0.005};
const errors = [];
const requireThat = (condition, message) => { if (!condition) errors.push(message); };

async function checkProvenance() {
  const provenance = JSON.parse(await fs.readFile(new URL('verification/qa-provenance.json', root)));
  for (const entry of provenance.files) {
    const data = await fs.readFile(new URL(entry.path, root));
    requireThat(SHA(data) === entry.sha256 && data.length === entry.bytes, `Pinned QA source changed: ${entry.path}`);
  }
  return provenance;
}

function channels(glb, animation) {
  return animation.channels.map(channel => {
    const sampler = animation.samplers[channel.sampler];
    const accessor = glb.json.accessors[sampler.output];
    const width = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}[accessor.type];
    if (!width || channel.target.path === 'weights') return null;
    const times = Array.from(readAccessor(glb, sampler.input));
    const values = Array.from(readAccessor(glb, sampler.output));
    const cubic = sampler.interpolation === 'CUBICSPLINE';
    const row = (i, component = 1) => values.slice((i * (cubic ? 3 : 1) + (cubic ? component : 0)) * width, (i * (cubic ? 3 : 1) + (cubic ? component : 0) + 1) * width);
    return {node: channel.target.node, name: glb.json.nodes[channel.target.node].name, path: channel.target.path, interpolation: sampler.interpolation ?? 'LINEAR', width, times, row};
  }).filter(Boolean);
}

function evaluate(channel, time) {
  const {times, row, path: targetPath} = channel;
  const i = time <= times[0] ? 0 : time >= times.at(-1) ? times.length - 1 : times.findIndex(t => t >= time);
  if (i === 0 || time >= times.at(-1)) {
    const value = row(i), derivative = channel.interpolation === 'CUBICSPLINE' ? row(i, i === 0 ? 2 : 0) : Array(value.length).fill(0);
    return {value: targetPath === 'rotation' ? unit(value) : value, derivative: targetPath === 'rotation' ? rotationDerivative(value, derivative) : derivative};
  }
  const a = row(i - 1), b = row(i), dt = times[i] - times[i - 1], u = (time - times[i - 1]) / dt;
  if (channel.interpolation !== 'CUBICSPLINE') return {value: a.map((v, k) => v + u * (b[k] - v)), derivative: a.map((v, k) => (b[k] - v) / dt)};
  const da = row(i - 1, 2), db = row(i, 0), u2 = u * u, u3 = u2 * u;
  const value = a.map((v, k) => (2 * u3 - 3 * u2 + 1) * v + (u3 - 2 * u2 + u) * dt * da[k] + (-2 * u3 + 3 * u2) * b[k] + (u3 - u2) * dt * db[k]);
  const derivative = a.map((v, k) => ((6 * u2 - 6 * u) * v + (3 * u2 - 4 * u + 1) * dt * da[k] + (-6 * u2 + 6 * u) * b[k] + (3 * u2 - 2 * u) * dt * db[k]) / dt);
  return {value: targetPath === 'rotation' ? unit(value) : value, derivative: targetPath === 'rotation' ? rotationDerivative(value, derivative) : derivative};
}

function endpoint(channel, end) {
  return evaluate(channel, end ? channel.times.at(-1) : channel.times[0]);
}
function compareChannel(a, b, aEnd = true, bEnd = false) {
  const left = endpoint(a, aEnd), right = endpoint(b, bEnd);
  const sign = a.path === 'rotation' && dot(left.value, right.value) < 0 ? -1 : 1;
  return {valueError: distance(left.value, scale(right.value, sign)), derivativeError: distance(left.derivative, scale(right.derivative, sign))};
}

function checkNativeC1(glb, entries) {
  const byName = new Map(glb.json.animations.map(animation => [animation.name, channels(glb, animation)]));
  const reports = [];
  for (const entry of entries) {
    const tracks = byName.get(entry.id);
    requireThat(!!tracks, `${entry.id}: missing native animation`);
    if (!tracks) continue;
    let maximumKnotDerivativeError = 0, maximumLoopPoseError = 0, maximumLoopDerivativeError = 0, checked = 0;
    for (const channel of tracks.filter(c => CORE.test(c.name) && ['rotation', 'translation'].includes(c.path))) {
      requireThat(channel.interpolation === 'CUBICSPLINE', `${entry.id}/${channel.name}/${channel.path}: expected CUBICSPLINE for C1 motion`);
      if (channel.interpolation !== 'CUBICSPLINE') continue;
      requireThat(channel.times.length === Math.round((entry.durationSeconds ?? entry.duration) * 30) + 1, `${entry.id}/${channel.name}: expected inclusive 30Hz key count`);
      for (let i = 0; i < channel.times.length; i++) {
        requireThat(Math.abs(channel.times[i] - i / 30) < 0.000002, `${entry.id}/${channel.name}: time ${i} off 30Hz grid`);
        if (i > 0 && i < channel.times.length - 1) {
          const q = channel.row(i), incoming = channel.row(i, 0), outgoing = channel.row(i, 2);
          const error = channel.path === 'rotation' ? distance(rotationDerivative(q, incoming), rotationDerivative(q, outgoing)) : distance(incoming, outgoing);
          maximumKnotDerivativeError = Math.max(maximumKnotDerivativeError, error); checked++;
        }
      }
      if (entry.loop) {
        const error = compareChannel(channel, channel);
        maximumLoopPoseError = Math.max(maximumLoopPoseError, error.valueError);
        maximumLoopDerivativeError = Math.max(maximumLoopDerivativeError, error.derivativeError);
      }
    }
    const pass = maximumKnotDerivativeError < TOLERANCE.velocityPerSecond && maximumLoopPoseError < TOLERANCE.positionMeters && maximumLoopDerivativeError < TOLERANCE.velocityPerSecond;
    requireThat(pass, `${entry.id}: native C1 knot or loop seam mismatch`);
    reports.push({id: entry.id, pass, checkedKnots: checked, maximumKnotDerivativeError: round(maximumKnotDerivativeError), maximumLoopPoseError: round(maximumLoopPoseError), maximumLoopDerivativeError: round(maximumLoopDerivativeError)});
  }
  const joins = [];
  for (const [from, to] of [['serve_toss', 'serve_whip'], ['serve_whip', 'serve_land']]) {
    if (!byName.has(from) || !byName.has(to)) continue;
    const target = new Map(byName.get(to).map(c => [`${c.name}/${c.path}`, c]));
    let poseError = 0, derivativeError = 0, testedChannels = 0;
    for (const a of byName.get(from).filter(c => CORE.test(c.name))) {
      const b = target.get(`${a.name}/${a.path}`); if (!b) continue;
      const error = compareChannel(a, b);
      poseError = Math.max(poseError, error.valueError); derivativeError = Math.max(derivativeError, error.derivativeError); testedChannels++;
    }
    const pass = testedChannels >= 18 && poseError < TOLERANCE.positionMeters && derivativeError < TOLERANCE.velocityPerSecond;
    requireThat(pass, `${from} → ${to}: shared serve C1 boundary mismatch`);
    joins.push({from, to, pass, testedChannels, poseError: round(poseError), derivativeError: round(derivativeError)});
  }
  return {clips: reports, serveJoins: joins, tolerances: TOLERANCE, intentionalExceptions: ['Ball flight velocity may change at string impact and is excluded from skeletal C1 checks.']};
}

function checkFrozenGrip(glb, reference, catalog) {
  const node = glb.json.nodes.findIndex(n => n.name === 'racket_mount');
  const original = reference.json.nodes.findIndex(n => n.name === 'racket_mount');
  const mount = glb.json.nodes[node], golden = reference.json.nodes[original];
  const rightHand = glb.json.nodes.findIndex(n => n.name === 'RightHand');
  const goldenHand = reference.json.nodes.findIndex(n => n.name === 'RightHand');
  const children = index => glb.json.nodes[index].children ?? [];
  const pose = n => JSON.stringify({translation: n?.translation ?? [0, 0, 0], rotation: n?.rotation ?? [0, 0, 0, 1], scale: n?.scale ?? [1, 1, 1]});
  const unchanged = node >= 0 && original >= 0 && pose(mount) === pose(golden);
  const directlyParented = rightHand >= 0 && children(rightHand).includes(node) && (reference.json.nodes[goldenHand]?.children ?? []).includes(original);
  const mountAnimated = glb.json.animations.some(a => a.channels.some(c => c.target.node === node));
  requireThat(unchanged && directlyParented && !mountAnimated, 'Racket mount differs from the frozen tennis-grip-v1 RightHand attachment');
  const canonical = catalog.skeleton?.bones ?? catalog.skeleton;
  const skin = glb.json.skins[0];
  const names = skin.joints.map(index => glb.json.nodes[index].name);
  requireThat(names.length === 18 && new Set(names).size === 18, 'Skin must retain exactly 18 canonical bones');
  if (canonical) for (const bone of canonical) {
    const index = glb.json.nodes.findIndex(n => n.name === bone.name);
    const n = glb.json.nodes[index];
    requireThat(!!n && distance(n.translation ?? [0, 0, 0], bone.restTranslationMeters ?? bone.rest ?? bone.translation ?? [0, 0, 0]) < 0.000001, `Canonical rest translation mismatch: ${bone.name}`);
    const parent = glb.json.nodes.find(p => (p.children ?? []).includes(index));
    requireThat(bone.parent ? parent?.name === bone.parent : !parent || parent.name === 'Scene', `Canonical parent mismatch: ${bone.name}`);
  }
  return {pass: unchanged && directlyParented && !mountAnimated, source: 'source/reference/grip-player.glb', sourceCommit: 'a096e507b11389fc10272c38101f968820e89f7e', parent: 'RightHand', node: 'racket_mount', transform: {translation: mount?.translation, rotation: mount?.rotation, scale: mount?.scale ?? [1, 1, 1]}, animatedMountChannels: mountAnimated ? 1 : 0, canonicalSkinBones: names};
}

function presentFrame(frame, metadata) {
  frame.localJoints = structuredClone(frame.joints);
  frame.assetRoot = [...frame.root];
  frame.rawRotations = structuredClone(frame.rotations);
  if (metadata.referenceTravel) {
    const {speed, direction} = metadata.referenceTravel;
    const travel = direction.map(v => v * speed * frame.t);
    frame.referenceRoot = travel;
    frame.root = add(frame.root, travel);
    frame.joints = Object.fromEntries(Object.entries(frame.joints).map(([name, point]) => [name, add(point, travel)]));
    frame.floorPoints = frame.floorPoints.map(p => ({...p, position: add(p.position, travel)}));
    if (frame.ball) frame.ball = add(frame.ball, travel);
  }
  return frame;
}

function referenceFrames(reference, all, fallback) {
  if (!reference) return fallback;
  const target = all.get(reference.clip);
  if (!target) throw new Error(`Unknown continuity reference: ${reference.clip}`);
  const time = reference.time ?? 0;
  // Use real neighboring sampled poses, retaining their measured one-sided velocity.
  const index = target.frames.reduce((best, frame, i, a) => Math.abs(frame.t - time) < Math.abs(a[best].t - time) ? i : best, 0);
  return target.frames.slice(Math.max(0, index - 1), Math.min(target.frames.length, index + 2));
}

function bridgePose(tracks, time) {
  const rotations = {}, rotationDerivatives = {};
  let hips = [0, .86, 0], hipsVelocity = [0, 0, 0];
  for (const channel of tracks) {
    if (!CORE.test(channel.name)) continue;
    const sample = evaluate(channel, time);
    if (channel.path === 'rotation') { rotations[channel.name] = sample.value; rotationDerivatives[channel.name] = sample.derivative; }
    if (channel.name === 'Hips' && channel.path === 'translation') { hips = sample.value; hipsVelocity = sample.derivative; }
  }
  return {hips, rotations, hipsVelocity, rotationDerivatives, leftOpen: 0, leftOpenVelocity: 0};
}

async function checkRuntimeBridges(glb, entries) {
  const {createBridge, sampleBridge} = await import(new URL('runtime.mjs', root));
  const all = new Map(glb.json.animations.map(animation => [animation.name, channels(glb, animation)]));
  let maximumPositionError = 0, maximumQuaternionError = 0, maximumVelocityError = 0, tests = 0;
  const failures = [];
  for (const from of entries) for (const to of entries) for (const scenario of ['end-to-start', 'moving-interruption']) {
    const fromDuration = from.durationSeconds ?? from.duration, toDuration = to.durationSeconds ?? to.duration;
    const fromTime = scenario === 'end-to-start' ? fromDuration : fromDuration * .43;
    const toTime = scenario === 'end-to-start' ? 0 : toDuration * .17;
    const fromPose = bridgePose(all.get(from.id), fromTime), toPose = bridgePose(all.get(to.id), toTime);
    const duration = .3, bridge = createBridge({from: fromPose, to: toPose, duration});
    for (const [time, expected] of [[0, fromPose], [duration, toPose]]) {
      const sample = sampleBridge(bridge, time);
      const p = distance(sample.hips, expected.hips), v = distance(sample.hipsVelocity, expected.hipsVelocity);
      maximumPositionError = Math.max(maximumPositionError, p); maximumVelocityError = Math.max(maximumVelocityError, v);
      if (p > 0.00001 || v > 0.00001) failures.push(`${from.id}→${to.id}@${time}: hips`);
      for (const name of Object.keys(expected.rotations)) {
        const sign = dot(sample.rotations[name], expected.rotations[name]) < 0 ? -1 : 1;
        const q = distance(sample.rotations[name], scale(expected.rotations[name], sign));
        const d = distance(sample.rotationDerivatives[name], scale(expected.rotationDerivatives[name], sign));
        maximumQuaternionError = Math.max(maximumQuaternionError, q); maximumVelocityError = Math.max(maximumVelocityError, d);
        if (q > 0.00001 || d > 0.00001) failures.push(`${from.id}→${to.id}@${time}: ${name}`);
      }
    }
    for (const time of [.075, .15, .225]) {
      const sample = sampleBridge(bridge, time);
      for (const q of Object.values(sample.rotations)) if (Math.abs(norm(q) - 1) > .000001) failures.push(`${from.id}→${to.id}: nonunit bridge quaternion`);
    }
    tests++;
  }
  requireThat(failures.length === 0, `Runtime C1 bridge failures: ${failures.slice(0, 8).join('; ')}`);
  return {pass: failures.length === 0, pairs: tests, scenarios: ['end-to-start', 'moving-interruption at 43% source / 17% target with measured nonzero derivatives'], durationSeconds: .3, maximumPositionError: round(maximumPositionError), maximumQuaternionError: round(maximumQuaternionError), maximumVelocityError: round(maximumVelocityError), failures};
}

async function analyzeAsset(asset, entries, label, {runtimeBridges = false, reference, catalog} = {}) {
  const bytes = await fs.readFile(new URL(asset, root)), glb = parseGLB(bytes);
  const declaredAsset = catalog?.variants?.[label];
  if (declaredAsset) requireThat(SHA(bytes) === declaredAsset.sha256 && bytes.length === declaredAsset.bytes, `${label}: catalog GLB hash/size mismatch`);
  entries = entries.map(entry => {
    const extras = glb.json.animations.find(a => a.name === entry.id)?.extras ?? {};
    return {...entry, contactTime: extras.contactTime ?? entry.contactTime, metadata: structuredClone(extras.metadata ?? entry.metadata ?? {})};
  });
  const all = new Map();
  for (const entry of entries) {
    const metadata = structuredClone(entry.metadata ?? {});
    const extraTimes = [...(metadata.events ?? []).map(e => e.time), ...(metadata.supports ?? []).flatMap(w => [w.start, w.end]), ...(metadata.ballContacts ?? []).flatMap(w => [w.start, w.end])];
    const native = sampleGLB(glb, {animation: entry.id, fps: 120, extraTimes});
    native.frames.forEach(frame => presentFrame(frame, metadata));
    all.set(entry.id, {entry, metadata, ...native});
  }
  const idle = all.get('ready') ?? all.get('ready_stance') ?? all.get('receive_ready') ?? [...all.values()].find(x => /ready|idle/.test(x.entry.id));
  const clips = [];
  for (const [id, native] of all) {
    const {entry, metadata, frames, duration, height} = native;
    const references = metadata.continuityReferences;
    const idleFrames = references ? {entry: referenceFrames(references.entry, all, idle?.frames), exit: referenceFrames(references.exit, all, idle?.frames)} : idle?.frames;
    const result = analyzeClip({frames, duration, height, metadata, idleFrames, clipId: id, sport: 'tennis'});
    requireThat(result.score > 88, `${label}/${id}: motion-qa score ${result.score} must be strictly above 88`);
    requireThat(result.coverage === 1, `${label}/${id}: applicable measurement coverage ${result.coverage} must be 1`);
    const declaredHeight = (metadata.contactHeights ?? entry.contactHeightVariants ?? []).find(h => h.height === label);
    let contactHeightVerification = null;
    if (declaredHeight) {
      const contact = result.metrics.ballContact.evidence.contacts?.find(c => c.bone === 'RightHand' && Math.abs(c.t - entry.contactTime) < .00001);
      const pointError = contact ? distance(contact.contactPoint, declaredHeight.contactPoint) : Infinity;
      requireThat(pointError < .001, `${label}/${id}: decoded racket contact differs from catalog height target by ${pointError}m`);
      contactHeightVerification = {pass: pointError < .001, category: label, declaredHeightMeters: declaredHeight.heightMeters, measuredHeightMeters: contact?.contactPoint[1], pointErrorMeters: Number.isFinite(pointError) ? round(pointError) : null};
    }
    const report = {id, label: entry.label, nativeFrameCount: entry.frameCount, measuredSamples: frames.length, durationSeconds: round(duration), statureProxyMeters: round(height), continuityReferences: references ?? {entry: idle?.entry.id, exit: idle?.entry.id}, contactHeightVerification, ...result};
    clips.push(report);
    console.log(`${label}/${id}: ${result.score} (${result.coverage * 100}% coverage)`);
  }
  const c1 = checkNativeC1(glb, entries);
  if (runtimeBridges) c1.runtimeBridges = await checkRuntimeBridges(glb, entries);
  const grip = reference ? checkFrozenGrip(glb, reference, catalog) : null;
  return {id: label, asset, bytes: bytes.length, sha256: SHA(bytes), clips, c1, grip, minScore: Math.min(...clips.map(c => c.score)), averageScore: round(clips.reduce((n, c) => n + c.score, 0) / clips.length)};
}

export async function runQA() {
  errors.length = 0;
  const provenance = await checkProvenance();
  const catalog = JSON.parse(await fs.readFile(new URL('catalog.json', root)));
  const reference = parseGLB(await fs.readFile(new URL('source/reference/grip-player.glb', root)));
  requireThat(catalog.clips.length === 24, 'Expected exactly 24 logical tennis motion clips');
  requireThat((catalog.fps ?? catalog.nativeRate) === 30, 'Expected 30Hz native motion');
  for (const entry of catalog.clips) if (entry.contactHeightVariants?.length) {
    const heights = ['low', 'medium', 'high'].map(name => entry.contactHeightVariants.find(v => v.height === name)?.heightMeters);
    requireThat(heights.every(Number.isFinite) && heights[0] < heights[1] && heights[1] < heights[2], `${entry.id}: contact height variants must supply distinct ordered low/medium/high positions`);
  }
  const libraries = [await analyzeAsset(catalog.asset ?? 'tennis-motion-v2.glb', catalog.clips, 'medium', {runtimeBridges: true, reference, catalog})];
  for (const [id, variant] of Object.entries(catalog.variants ?? {})) if (id !== 'medium') libraries.push(await analyzeAsset(variant.asset, catalog.clips, id, {reference, catalog}));
  const report = {schemaVersion: 1, tool: 'motion-qa-v1', toolCommit: provenance.commit, generatedAt: new Date().toISOString(), nativeRateHz: 30, measurementRateHz: 120, minimumExclusiveScore: 88, pass: errors.length === 0, provenance: 'verification/qa-provenance.json', scoreDefinition: 'Unmodified motion-qa-v1 weighted diagnostic screening score; missing applicable metadata earns zero.', metricDefinitions: METRICS, libraries, minimumScore: Math.min(...libraries.map(l => l.minScore)), errors, limitations: ['Diagnostic skeletal probes do not measure deformed mesh collision or subjective human motion quality.', 'Locomotion applies the explicit external travel scenario once; it does not modify the native in-place Root animation.', 'Shared serve phases use the actual neighboring phase endpoint as continuity reference; ordinary actions use the receiving stance.', 'Ball velocity changes at racket impact are intentional and excluded from skeletal C1 checks.']};
  await fs.writeFile(new URL('verification/motion-qa.json', root), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({pass: report.pass, minimumScore: report.minimumScore, measuredClips: libraries.reduce((n, l) => n + l.clips.length, 0), errors}));
  if (!report.pass) process.exitCode = 1;
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runQA();
