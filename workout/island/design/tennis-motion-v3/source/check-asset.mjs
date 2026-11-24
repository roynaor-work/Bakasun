// SPDX-License-Identifier: CC0-1.0
// Run with Node.js. TENNIS_TOOLS_PACKAGE may point to a package.json with gltf-validator installed.
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {unpack, readAccessor} from '../../tennis-motion-v2/source/glb.mjs';
import '../../tennis-motion-v2/source/qa-register.mjs';
import {Quaternion, Vector3} from '../../tennis-motion-v2/vendor/three.module.js';
const {createRig, sampleGLB} = await import('../../tennis-motion-v2/vendor/motion-qa-v1/glb.mjs');

const library = new URL('../', import.meta.url);
const expectedIds = [
  'volley_low', 'volley_high', 'half_volley', 'lob', 'overhead_backward',
  'serve_return_aggressive', 'defensive_slice', 'lateral_crossover_run',
  'change_direction', 'slide_to_ball', 'court_fall', 'court_get_up', 'point_win',
  'childlike_joy', 'point_disappointment', 'match_handshake', 'coach_serve_demo', 'child_serve_rehearsal',
];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = list => [...list].sort();
const near = (a, b, tolerance = 2e-6) => Math.abs(a - b) <= tolerance;
const identity = [0, 0, 0, 1];
const transform = n => [n.matrix ?? null, n.translation ?? [0, 0, 0], n.rotation ?? identity, n.scale ?? [1, 1, 1]];
const forbiddenExtensions = new Set(['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_meshopt_compression', 'KHR_texture_basisu']);

function compressionDeclarations(document) {
  const found = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const id of [...Object.keys(value.extensions ?? {}), ...(value.extensionsUsed ?? []), ...(value.extensionsRequired ?? [])]) {
      if (forbiddenExtensions.has(id)) found.add(id);
    }
    for (const field of [value.uri, value.mimeType]) {
      if (typeof field === 'string' && /(?:\.(?:wasm|ktx2|drc)(?:$|[?#])|^(?:data:)?(?:application\/wasm|image\/ktx2))/i.test(field)) found.add(field);
    }
    Object.values(value).forEach(visit);
  }
  visit(document);
  return [...found];
}

// Keep every rigid mesh vertex in RightHand space. Projecting court-up into
// that space produces the exact lowest triangle height at each sampled pose.
function racketSurface(fixture) {
  const {nodes} = createRig(fixture);
  const worldToHand = nodes.find(node => node.name === 'RightHand').matrixWorld.clone().invert();
  const points = new Map();
  for (const [index, node] of fixture.json.nodes.entries()) {
    if (!/^racket_(?:handle|frame|accent|strings)$/.test(node.name)) continue;
    const toHand = worldToHand.clone().multiply(nodes[index].matrixWorld);
    for (const primitive of fixture.json.meshes[node.mesh].primitives) {
      const {values} = readAccessor(fixture, primitive.attributes.POSITION);
      for (let offset = 0; offset < values.length; offset += 3) {
        const point = new Vector3().fromArray(values, offset).applyMatrix4(toHand);
        points.set(point.toArray().join(','), point);
      }
    }
  }
  if (!points.size) throw new Error('No rigid racket surface in reference fixture');
  return [...points.values()];
}

function measureRacket(glb, animation, surface) {
  const {frames} = sampleGLB(glb, {animation: animation.name, fps: 120});
  let minCourtClearanceMeters = Infinity, maxWristBendDegrees = -Infinity;
  let minClearanceTimeSeconds, maxBendTimeSeconds;
  const hand = new Vector3(), forearm = new Vector3(), palm = new Vector3(), courtUp = new Vector3(), q = new Quaternion();
  for (const f of frames) {
    hand.fromArray(f.joints.RightHand);
    q.fromArray(f.rotations.RightHand);
    forearm.fromArray(f.joints.RightForeArm).sub(hand).negate().normalize();
    palm.set(0, -1, 0).applyQuaternion(q);
    const bend = forearm.angleTo(palm) * 180 / Math.PI;
    if (bend > maxWristBendDegrees) { maxWristBendDegrees = bend; maxBendTimeSeconds = f.t; }
    courtUp.set(0, 1, 0).applyQuaternion(q.invert());
    for (const p of surface) {
      const y = hand.y + courtUp.dot(p);
      if (y < minCourtClearanceMeters) { minCourtClearanceMeters = y; minClearanceTimeSeconds = f.t; }
    }
  }
  return {samples: frames.length, minCourtClearanceMeters, minClearanceTimeSeconds, maxWristBendDegrees, maxBendTimeSeconds};
}

/** Compare a self-contained v3 animation GLB to its independently read v2 reference. */
export async function verifyAsset(bytes, referenceBytes, catalog, fixtureBytes) {
  const tools = createRequire(process.env.TENNIS_TOOLS_PACKAGE ?? '/tmp/tennis-v3/tools/package.json');
  const validator = tools('gltf-validator');
  const validated = await validator.validateBytes(new Uint8Array(bytes), {uri: catalog.asset, maxIssues: 100});
  const candidate = unpack(bytes), reference = unpack(referenceBytes);
  const doc = candidate.document, ref = reference.document;
  const checks = {}, errors = [];
  function check(name, pass, detail = '') {
    checks[name] = (checks[name] ?? true) && Boolean(pass);
    if (!pass) errors.push(`${name}${detail ? ` (${detail})` : ''}`);
  }

  const ids = doc.animations.map(a => a.name), catalogIds = catalog.clips.map(c => c.id);
  const assetHash = digest(bytes), referenceHash = digest(referenceBytes);
  check('catalogAssetDigest', catalog.sha256 === assetHash && catalog.bytes === bytes.length);
  check('catalogReferenceDigest', catalog.provenance?.baseGLBSha256 === referenceHash);
  fixtureBytes ??= await fs.readFile(new URL('../tennis-motion-v2/source/reference/grip-player.glb', library));
  const fixtureHash = digest(fixtureBytes), surface = racketSurface(unpack(fixtureBytes));
  check('catalogGripFixtureDigest', catalog.provenance?.referenceAssetSha256 === fixtureHash);
  check('khronosGltf2', validated.issues.numErrors === 0);
  check('requestedInventory', equal(sorted(ids), sorted(expectedIds)) && equal(sorted(catalogIds), sorted(expectedIds)));
  check('native30HzDeclaration', (catalog.fps ?? catalog.nativeRate) === 30);
  const forbidden = compressionDeclarations(doc);
  check('noForbiddenCodecs', !forbidden.length, forbidden.join(', '));
  check('selfContained', doc.buffers.length === 1 && !doc.buffers[0].uri && (doc.images ?? []).every(image => image.bufferView !== undefined && !image.uri));
  const names = doc.nodes.map(node => node.name);
  check('uniqueNodeNames', new Set(names).size === names.length);
  const boneNames = ref.skins[0].joints.map(i => ref.nodes[i].name);
  const skin = doc.skins[0];
  check('canonical18', doc.skins.length === 1 && boneNames.length === 18 && equal(skin.joints.map(i => names[i]), boneNames));
  check('skinBinding', names[skin.skeleton] === ref.nodes[ref.skins[0].skeleton].name && doc.nodes.some(n => n.skin === 0 && n.mesh !== undefined));
  const binds = readAccessor(candidate, skin.inverseBindMatrices).values;
  const goldenBinds = readAccessor(reference, ref.skins[0].inverseBindMatrices).values;
  check('inverseBindMatrices', binds.length === 18 * 16 && equal(binds, goldenBinds));
  const rigid = ['grip_hand_R', 'grip_hand_L', 'racket_mount', 'racket', 'grip', 'head', 'racket_frame', 'racket_accent', 'racket_handle', 'racket_strings'];
  const parent = (doc, i) => doc.nodes.find(n => n.children?.includes(i))?.name ?? null;
  for (const name of [...boneNames, ...rigid]) {
    const a = names.indexOf(name), b = ref.nodes.findIndex(n => n.name === name);
    check('frozenRestAndHierarchy', a >= 0 && b >= 0 && equal(transform(doc.nodes[a]), transform(ref.nodes[b])) && parent(doc, a) === parent(ref, b), name);
  }
  check('mountInRightHand', parent(doc, names.indexOf('racket_mount')) === 'RightHand');
  const leftNode = doc.nodes[names.indexOf('grip_hand_L')];
  const leftMesh = doc.meshes[leftNode?.mesh];
  check('leftHandOpenMorphBinding', leftMesh?.extras?.targetNames?.includes('open') && leftMesh.primitives.every(p => p.targets?.length === 1));

  const accessorCache = new Map();
  function accessor(index) {
    if (!accessorCache.has(index)) accessorCache.set(index, readAccessor(candidate, index));
    return accessorCache.get(index);
  }
  const clips = [];
  const tracks = [...boneNames.map(n => `${n}/rotation`), 'Hips/translation', 'grip_hand_L/weights', 'Ball/translation', 'Ball/scale'];
  for (const animation of doc.animations) {
    const c = catalog.clips.find(entry => entry.id === animation.name);
    if (!c) continue;
    const duration = c.durationSeconds ?? c.duration, frameCount = c.frameCount;
    check('inclusiveNativeFrames', frameCount === Math.round(duration * 30) + 1 && near(duration, (frameCount - 1) / 30), c.id);
    const targetNames = animation.channels.map(ch => `${names[ch.target.node]}/${ch.target.path}`);
    check('onlyCanonicalTracks', equal(sorted(targetNames), sorted(tracks)), c.id);
    let maxQuaternionError = 0, maxKnotTangentMismatch = 0, maxRootDeviation = 0;
    let maxLoopValueMismatch = 0, maxLoopTangentMismatch = 0;
    for (const [index, ch] of animation.channels.entries()) {
      const target = targetNames[index], sampler = animation.samplers[ch.sampler];
      const sampleTimes = accessor(sampler.input), out = accessor(sampler.output);
      const cubic = !target.startsWith('Ball/');
      const width = ch.target.path === 'rotation' ? 4 : ch.target.path === 'weights' ? 1 : 3;
      const factor = cubic ? 3 : 1;
      check('interpolation', sampler.interpolation === (cubic ? 'CUBICSPLINE' : 'LINEAR'), `${c.id}/${target}`);
      check('sampleLayout', sampleTimes.accessor.type === 'SCALAR' && sampleTimes.accessor.componentType === 5126 && out.accessor.componentType === 5126 && out.width === width && out.accessor.count === factor * frameCount, `${c.id}/${target}`);
      check('nativeTimeGrid', sampleTimes.values.length === frameCount && sampleTimes.values.every((time, frame) => near(time, frame / 30)), `${c.id}/${target}`);
      const values = out.values;
      check('finiteOutput', values.every(Number.isFinite), `${c.id}/${target}`);
      if (target === 'Ball/scale') {
        const uniform = values.every((scale, i) => scale >= 0 && near(scale, values[i - i % 3]));
        check('visibleBallScale', uniform && values.some(scale => scale > 0) === c.ball, c.id);
      }
      if (!cubic || values.length !== frameCount * width * factor) continue;
      let previousQuaternion;
      for (let i = 0; i < frameCount; i++) {
        const row = i * width * factor;
        const value = values.slice(row + width, row + 2 * width);
        if (ch.target.path === 'rotation') {
          maxQuaternionError = Math.max(maxQuaternionError, Math.abs(Math.hypot(...value) - 1));
          if (previousQuaternion && value.reduce((d, x, k) => d + x * previousQuaternion[k], 0) < -1e-6) check('shortestQuaternionSigns', false, `${c.id}/${target}@${i}`);
          previousQuaternion = value;
        }
        for (let k = 0; k < width; k++) {
          if (i > 0 && i < frameCount - 1) maxKnotTangentMismatch = Math.max(maxKnotTangentMismatch, Math.abs(values[row + k] - values[row + 2 * width + k]));
          if (target === 'Root/rotation') maxRootDeviation = Math.max(maxRootDeviation, Math.abs(value[k] - identity[k]), Math.abs(values[row + k]), Math.abs(values[row + 2 * width + k]));
        }
        if (c.loop && i === frameCount - 1) {
          const sign = ch.target.path === 'rotation' && value.reduce((d, x, k) => d + x * values[width + k], 0) < 0 ? -1 : 1;
          for (let k = 0; k < width; k++) {
            maxLoopValueMismatch = Math.max(maxLoopValueMismatch, Math.abs(values[width + k] - sign * value[k]));
            maxLoopTangentMismatch = Math.max(maxLoopTangentMismatch, Math.abs(values[2 * width + k] - sign * values[row + k]));
          }
        }
      }
    }
    check('unitQuaternions', maxQuaternionError < 2e-6, c.id);
    check('fixedRoot', maxRootDeviation < 2e-6, c.id);
    check('sharedKnotTangents', maxKnotTangentMismatch < 5e-3, c.id);
    if (c.loop) check('nativeLoopSeams', maxLoopValueMismatch < 1e-4 && maxLoopTangentMismatch < 5e-3, c.id);
    const events = c.events ?? c.metadata?.events ?? [];
    check('eventTimeline', events.length > 0 && events.every(event => Number.isInteger(event.frame) && event.frame >= 0 && event.frame < frameCount && near(event.time, event.frame / 30) && event.type && event.label), c.id);
    check('embeddedCueMetadata', equal(c.metadata?.events, events) && equal(c.metadata?.supports, c.supports) && equal(c.metadata, animation.extras?.metadata), c.id);
    check('supportTimeline', c.supports?.length > 0 && c.supports.every(s => ['LeftFoot', 'RightFoot'].includes(s.bone) && s.start >= 0 && s.end <= duration && s.start < s.end && near(s.start, s.startFrame / 30) && near(s.end, s.endFrame / 30) && s.local?.length === 3 && s.local.every(Number.isFinite)), c.id);
    const racket = measureRacket(candidate, animation, surface);
    check('racketSurfaceAboveCourt', racket.minCourtClearanceMeters >= -1e-4, c.id);
    check('rightWristWithinV2Limit', racket.maxWristBendDegrees <= 62, c.id);
    clips.push({id: c.id, channels: targetNames.length, frames: frameCount, events: events.length, durationSeconds: duration, maxQuaternionError, maxRootDeviation, maxKnotTangentMismatch, racket, ...(c.loop && {maxLoopValueMismatch, maxLoopTangentMismatch})});
  }
  const {numErrors, numWarnings, numInfos, numHints, messages, truncated} = validated.issues;
  return {
    schemaVersion: 1, asset: catalog.asset, bytes: bytes.length, sha256: assetHash,
    reference: {asset: '../tennis-motion-v2/tennis-motion-v2.glb', sha256: referenceHash, joints: boneNames},
    racketMeasurement: {source: '../tennis-motion-v2/source/reference/grip-player.glb', sha256: fixtureHash, vertices: surface.length, sampleHz: 120, floorMeters: 0, toleranceMeters: .0001, rightWristLimitDegrees: 62},
    validator: {name: 'Khronos glTF Validator', version: validated.validatorVersion, numErrors, numWarnings, numInfos, numHints, messages, truncated},
    checks, clips, errors, pass: errors.length === 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog = JSON.parse(await fs.readFile(new URL('catalog.json', library)));
  const bytes = await fs.readFile(new URL(catalog.asset, library));
  const golden = await fs.readFile(new URL('../tennis-motion-v2/tennis-motion-v2.glb', library));
  const report = await verifyAsset(bytes, golden, catalog);
  await fs.writeFile(new URL('verification/assets.json', library), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({pass: report.pass, clips: report.clips.length, gltfErrors: report.validator.numErrors, gltfWarnings: report.validator.numWarnings, errors: report.errors}));
  if (!report.pass) process.exitCode = 1;
}
