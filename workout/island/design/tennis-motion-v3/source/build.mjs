// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compact, unpack} from '../../tennis-motion-v2/source/glb.mjs';
import {bones, dot, mul} from '../../tennis-motion-v2/source/rig.mjs';
import {author, RATE, sample} from './author.mjs';
import rally from './rally.mjs';
import scenes from './scenes.mjs';

const definitions = [...rally, ...scenes];
const directory = new URL('../', import.meta.url);
const previous = new URL('../tennis-motion-v2/', directory);
const asset = 'tennis-motion-v3.glb';
const referenceAsset = '../tennis-motion-v2/source/reference/grip-player.glb';
const baseCommit = '993d242155bac0917e77883416452366abd0ff81';
const sha = value => createHash('sha256').update(value).digest('hex');
const previousCatalog = JSON.parse(await fs.readFile(new URL('catalog.json', previous)));
const previousBytes = await fs.readFile(new URL(previousCatalog.asset, previous));
const referenceBytes = await fs.readFile(new URL(referenceAsset, directory));

const previousIDs = new Set(previousCatalog.clips.map(clip => clip.id));
const ids = new Set(definitions.map(definition => definition.id));
if (definitions.length !== 18 || ids.size !== 18 || definitions.some(definition => previousIDs.has(definition.id))) {
  throw new Error('The v3 library requires 18 distinct IDs absent from v2.');
}
for (const definition of definitions) {
  const {id, keys, events, supports, durationFrames, related} = definition;
  if (!Number.isInteger(durationFrames) || durationFrames <= 0 ||
      keys[0][0] !== 0 || keys.at(-1)[0] !== durationFrames ||
      keys.some(([at], index) => !Number.isInteger(at) || index && at <= keys[index - 1][0])) {
    throw new Error(`${id}: invalid authored frame bounds`);
  }
  if (events.some(event => !Number.isInteger(event.frame) || event.frame < 0 || event.frame > durationFrames) ||
      supports.some(window => !Number.isInteger(window.startFrame) || !Number.isInteger(window.endFrame) ||
        window.startFrame < 0 || window.endFrame > durationFrames || window.startFrame >= window.endFrame ||
        !['LeftFoot', 'RightFoot'].includes(window.bone))) {
    throw new Error(`${id}: invalid event or foot-support window`);
  }
  if (!related?.every(clipID => previousIDs.has(clipID))) throw new Error(`${id}: unknown v2 comparison clip`);
}

// V2 already contains the invisible skin and morph bindings plus their inverse
// binds. Keep those bytes and replace only its animation streams.
const {document, binary} = unpack(previousBytes);
document.animations = [];
document.asset = {version: '2.0', generator: 'Bakasun tennis-motion-v3 · analytic IK · 30Hz', copyright: 'CC0-1.0'};
document.extras = {
  library: 'tennis-motion-v3', kind: 'skeletal-animation-library', nativeRate: RATE,
  referenceAsset, units: 'meters', boneCount: bones.length, rootMotion: false,
};
const buffers = [binary];
let offset = binary.length;
function accessor(values, width, timeInput = false) {
  const components = Float32Array.from(values);
  const bytes = Buffer.from(components.buffer);
  const bufferView = document.bufferViews.length;
  document.bufferViews.push({buffer: 0, byteOffset: offset, byteLength: bytes.length});
  buffers.push(bytes);
  offset += bytes.length;
  const index = document.accessors.length;
  const type = {1: 'SCALAR', 3: 'VEC3', 4: 'VEC4'}[width];
  const range = timeInput ? {min: [components[0]], max: [components.at(-1)]} : {};
  document.accessors.push({bufferView, componentType: 5126, count: values.length / width, type, ...range});
  return index;
}

const nodeIndices = new Map(document.nodes.map(({name}, index) => [name, index]));
const epsilon = 1e-5;
const clips = [];
for (const definition of definitions) {
  const {frames, clip} = author(definition);
  clips.push(clip);
  const input = accessor(frames.map(frame => frame.time), 1, true);
  const neighbors = frames.map(frame => [
    sample(definition, frame.time - epsilon), sample(definition, frame.time + epsilon),
  ]);
  const animation = {
    name: clip.id, samplers: [], channels: [],
    extras: {nativeRate: RATE, loop: false, rootMotion: false, contactTime: clip.contactTime, metadata: clip.metadata},
  };
  function channel(name, path, width, read, cubic = true) {
    const output = [];
    let previousValue = null;
    const rotation = path === 'rotation';
    for (const [index, frame] of frames.entries()) {
      let value = read(frame);
      if (!cubic) {
        output.push(...value);
        continue;
      }
      let [before, after] = neighbors[index].map(read);
      if (rotation) {
        value = mul(value, 1 / Math.hypot(...value));
        if (previousValue && dot(previousValue, value) < 0) value = mul(value, -1);
        if (dot(before, value) < 0) before = mul(before, -1);
        if (dot(after, value) < 0) after = mul(after, -1);
      }
      let tangent = after.map((component, axis) => (component - before[axis]) / (2 * epsilon));
      if (rotation) {
        const radial = dot(tangent, value);
        tangent = tangent.map((component, axis) => component - radial * value[axis]);
      }
      output.push(...tangent, ...value, ...tangent);
      previousValue = value;
    }
    animation.channels.push({sampler: animation.samplers.length, target: {node: nodeIndices.get(name), path}});
    animation.samplers.push({input, output: accessor(output, width), interpolation: cubic ? 'CUBICSPLINE' : 'LINEAR'});
  }
  for (const {name} of bones) channel(name, 'rotation', 4, frame => frame.rotations[name]);
  channel('Hips', 'translation', 3, frame => frame.hips);
  channel('grip_hand_L', 'weights', 1, frame => [frame.leftOpen]);
  channel('Ball', 'translation', 3, frame => frame.ball, false);
  channel('Ball', 'scale', 3, frame => Array(3).fill(frame.ballScale), false);
  document.animations.push(animation);
}

const bytes = compact(document, Buffer.concat(buffers));
if (bytes.length > 2_000_000) throw new Error(`GLB exceeds the repository's 2 MB budget: ${bytes.length}`);
const catalog = {
  schemaVersion: 3, library: 'tennis-motion-v3', asset, referenceAsset,
  bytes: bytes.length, sha256: sha(bytes),
  assetKind: 'skeletal-animation-library', fps: RATE, nativeRate: RATE, logicalClipCount: clips.length,
  units: 'meters', coordinateSystem: {up: '+Y', forward: '+Z', left: '+X'},
  rootMotion: false, motionTranslation: 'Hips stores the complete authored path in clip space, including lateral and backward travel.',
  nativeAdjacent: [{from: 'court_fall', to: 'court_get_up'}],
  skeleton: previousCatalog.skeleton, grip: previousCatalog.grip,
  provenance: {
    baseCommit, gripCommit: previousCatalog.provenance.gripCommit, qaCommit: previousCatalog.provenance.qaCommit,
    baseGLBSha256: sha(previousBytes), referenceAssetSha256: sha(referenceBytes),
  },
  authorship: {method: 'Original keyed choreography, analytic IK, and ballistic tennis-ball paths', license: 'CC0-1.0'},
  clips,
};
await fs.writeFile(new URL(asset, directory), bytes);
await fs.writeFile(new URL('catalog.json', directory), JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({asset, clips: clips.length, frames: clips.reduce((n, clip) => n + clip.frameCount, 0), bytes: bytes.length}));
