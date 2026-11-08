/**
 * Original animation-only glTF exporter, CC0-1.0.
 *
 * Every GLB is a complete 30 Hz skeletal animation for one tall bind profile.
 * Geometry is deliberately shared through runtime/models/*.glb. Motion is the
 * sole world-motion node; Root remains identity. No binary decoder is needed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const require = createRequire(path.join(process.env.HOOPS_TOOLS_DIR || '/tmp/hoops-v11-tools', 'package.json'));
const {Accessor, Document, NodeIO} = require('@gltf-transform/core');
export const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url));
const readJSON = async url => JSON.parse(await fs.readFile(url, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const finiteArray = (values, size, label) => {
  if (!Array.isArray(values) || values.length !== size || values.some(x => !Number.isFinite(x))) {
    throw new TypeError(`${label}: expected ${size} finite values`);
  }
  return values;
};

/** Convert dense boolean contact markers to inclusive normalized intervals. */
function contactIntervals(frames, name) {
  const intervals = [];
  let start = null;
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index], contact = frame.contacts?.[name];
    if (contact?.planted && start === null) start = index;
    if (start !== null && (!contact?.planted || index === frames.length - 1)) {
      const end = contact?.planted ? index : index - 1;
      const first = frames[start];
      const interval = {
        startTime: first.time,
        endTime: frames[end].time,
        startFrame: start,
        endFrame: end,
      };
      if (Array.isArray(first.contacts?.[name]?.anchorWorldMeters)) {
        interval.anchorWorldMeters = first.contacts[name].anchorWorldMeters;
      }
      intervals.push(interval);
      start = null;
    }
  }
  return intervals;
}

/**
 * Export all profile/clip pairs in the catalog. No source file is changed.
 * Optional ids and profiles restrict regeneration without changing the catalog.
 */
export async function exportClips({packageRoot = PACKAGE_ROOT, ids = null, profiles = null} = {}) {
  const catalog = await readJSON(path.join(packageRoot, 'runtime/catalog.json'));
  const io = new NodeIO();
  const output = [];
  if (catalog.fps !== 30) throw Error(`Expected 30 Hz catalog, received ${catalog.fps}`);
  for (const profile of catalog.profiles) {
    if (profiles && !profiles.includes(profile.id)) continue;
    const joints = profile.joints;
    if (!Array.isArray(joints) || joints.length !== 18) throw Error(`${profile.id}: expected exactly 18 canonical joints`);
    const directory = path.join(packageRoot, 'runtime/clips', profile.id);
    await fs.mkdir(directory, {recursive: true});
    for (const meta of catalog.clips) {
      if (ids && !ids.includes(meta.id)) continue;
      const source = path.join(packageRoot, 'runtime/keyframes', profile.id, `${meta.id}.json`);
      const sourceBytes = await fs.readFile(source);
      const clip = JSON.parse(sourceBytes), frames = clip.keyframes;
      if (clip.id !== meta.id) throw Error(`${source}: clip id mismatch`);
      if (clip.profileId !== profile.id) throw Error(`${source}: profile mismatch`);
      if (clip.fps !== 30 || !Array.isArray(frames) || frames.length < 2) throw Error(`${source}: missing 30 Hz frames`);
      const duration = clip.durationSeconds;
      if (!(duration > 0)) throw Error(`${source}: invalid duration`);
      for (let i = 0; i < frames.length; i++) {
        const seconds = frames[i].time * duration;
        if (!Number.isFinite(seconds) || Math.abs(seconds - i / 30) > 1e-6) {
          throw Error(`${source}: frame ${i} is not on the 30 Hz grid (${seconds}s)`);
        }
      }
      if (Math.abs(frames.at(-1).time - 1) > 1e-8) throw Error(`${source}: final frame must be normalized time 1`);
      const document = new Document();
      document.getRoot().getAsset().generator = 'Bakasun hoops-motion-v11 original CC0 exporter';
      document.getRoot().getAsset().copyright = 'CC0-1.0';
      const buffer = document.createBuffer(`${meta.id}-buffer`);
      const scene = document.createScene(`${profile.id}-${meta.id}`);
      const motion = document.createNode('Motion');
      scene.addChild(motion);
      const nodes = Object.fromEntries(joints.map(joint => [joint.name,
        document.createNode(joint.name).setTranslation(finiteArray(joint.translation, 3, `${profile.id}/${joint.name} bind`))]));
      for (const joint of joints) {
        if (joint.parent) {
          if (!nodes[joint.parent]) throw Error(`${profile.id}/${joint.name}: missing parent`);
          nodes[joint.parent].addChild(nodes[joint.name]);
        } else motion.addChild(nodes[joint.name]);
      }
      const ball = document.createNode('Ball');
      motion.addChild(ball);
      const times = document.createAccessor('seconds').setBuffer(buffer).setType(Accessor.Type.SCALAR)
        .setArray(new Float32Array(frames.map(frame => frame.time * duration)));
      const animation = document.createAnimation(meta.id).setExtras({id:meta.id, profileId:profile.id, fps:30, loop:!!meta.loop, durationSeconds:duration});
      const track = (node, property, width, values) => {
        const accessor = document.createAccessor(`${node.getName()}-${property}`).setBuffer(buffer)
          .setType(width === 4 ? Accessor.Type.VEC4 : Accessor.Type.VEC3).setArray(new Float32Array(values));
        const sampler = document.createAnimationSampler().setInput(times).setOutput(accessor).setInterpolation('LINEAR');
        const channel = document.createAnimationChannel().setTargetNode(node).setTargetPath(property).setSampler(sampler);
        animation.addSampler(sampler).addChannel(channel);
      };
      const quaternionValues = (getValue, label) => {
        let previous = null;
        return frames.flatMap((frame, i) => {
          let quaternion = [...finiteArray(getValue(frame), 4, `${label}/${i}`)];
          if (Math.abs(Math.hypot(...quaternion) - 1) > 1e-5) throw Error(`${label}/${i}: quaternion is not normalized`);
          if (previous && previous.reduce((sum, x, j) => sum + x * quaternion[j], 0) < 0) quaternion = quaternion.map(x => -x);
          previous = quaternion;
          return quaternion;
        });
      };
      for (const joint of joints) {
        const values = quaternionValues(frame => frame.rotations[joint.name], `${meta.id}/${joint.name}`);
        if (joint.name === 'Root' && values.some((x, i) => Math.abs(x - (i % 4 === 3 ? 1 : 0)) > 1e-7)) {
          throw Error(`${source}: Root must stay identity; world motion belongs to Motion`);
        }
        track(nodes[joint.name], 'rotation', 4, values);
      }
      const hipsRest = joints.find(joint => joint.name === 'Hips').translation;
      track(nodes.Hips, 'translation', 3, frames.flatMap((frame, i) => {
        const offset = finiteArray(frame.hipsOffsetMeters, 3, `${meta.id}/Hips/${i}`);
        return hipsRest.map((value, component) => value + offset[component]);
      }));
      track(motion, 'translation', 3, frames.flatMap((frame, i) => finiteArray(frame.referenceRootTranslationMeters, 3, `${meta.id}/Motion/${i}`)));
      track(motion, 'rotation', 4, quaternionValues(frame => frame.rootRotationQuaternion, `${meta.id}/Motion`));
      track(ball, 'translation', 3, frames.flatMap((frame, i) => finiteArray(frame.ballPositionMeters, 3, `${meta.id}/Ball/${i}`)));
      const contacts = Object.fromEntries(['LeftFoot', 'RightFoot'].map(name => [name, contactIntervals(frames, name)]));
      const extras = {
        schemaVersion:1,
        license:'CC0-1.0',
        source:'Original hoops-motion-v11 performance, authored for hoops-tall-v1 canonical18 proportions.',
        id:meta.id, profileId:profile.id, fps:30, durationSeconds:duration, loop:!!meta.loop,
        keyframeSha256:hash(sourceBytes),
        geometry:`runtime/models/${profile.id}.glb`,
        animationRepresentation:'Absolute parent-local canonical18 quaternions; target-rest Hips translation; external Motion translation and quaternion.',
        rootMotion:{node:'Motion', units:'meters', axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'}, rootBoneIdentity:true},
        contacts,
        ballPhases:frames.map(frame => frame.ballPhase ?? null),
        events:clip.events || [],
        courtTarget:clip.courtTarget || null,
      };
      document.getRoot().setExtras(extras);
      const bytes = await io.writeBinary(document);
      const destination = path.join(directory, `${meta.id}.glb`);
      await fs.writeFile(destination, bytes);
      output.push({profileId:profile.id, id:meta.id, bytes:bytes.length, frames:frames.length, channels:animation.listChannels().length, sha256:hash(bytes)});
    }
  }
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await exportClips();
  console.log(JSON.stringify({clips:results.length,bytes:results.reduce((sum, row) => sum + row.bytes, 0),results}, null, 2));
}
