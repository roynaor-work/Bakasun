/**
 * Bake the canonical keyframe representation into standalone per-action GLBs.
 * Run after motion-author.mjs. No package manager files are written into the repo.
 * Both representations use dense 120Hz keys and LINEAR interpolation: glTF's
 * quaternion LINEAR is slerp, matching sampleCanonical in the runtime library.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createIO, buildPreviewModel, PACKAGE_ROOT } from './preview-model.mjs';

const require = createRequire(path.join(process.env.HOOPS_TOOLS_DIR || '/tmp/hoops-motion-v8-tools', 'package.json'));
const { Accessor } = require('@gltf-transform/core');
const { draco } = require('@gltf-transform/functions');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function exportClips({ rebuildModel = false, ids = null, modelBytes = null, outputDirectory = path.join(PACKAGE_ROOT, 'runtime/clips') } = {}) {
  const io = await createIO();
  const modelPath = path.join(PACKAGE_ROOT, 'source/preview-model.glb');
  if (rebuildModel) await buildPreviewModel();
  const model = modelBytes || await fs.readFile(modelPath);
  const keyframeDir = path.join(PACKAGE_ROOT, 'runtime/keyframes');
  const paths = (await fs.readdir(keyframeDir)).filter(n => n.endsWith('.json.gz') && (!ids || ids.includes(n.slice(0, -8)))).sort();
  if (!paths.length) throw Error('No canonical keyframes found: run source/motion-author.mjs first');
  await fs.mkdir(outputDirectory, { recursive: true });
  const results = [];
  for (const name of paths) {
    const keyframeBytes = await fs.readFile(path.join(keyframeDir, name));
    const clip = JSON.parse(gunzipSync(keyframeBytes));
    const id = clip.id || clip.clip || name.slice(0, -8);
    const document = await io.readBinary(model), root = document.getRoot(), buffer = root.listBuffers()[0];
    const nodes = Object.fromEntries(root.listNodes().map(n => [n.getName(), n]));
    const frames = clip.keyframes;
    if (!Array.isArray(frames) || frames.length < 2) throw Error(`${id}: missing dense keys`);
    const duration = clip.durationSeconds;
    if (!(duration > 0)) throw Error(`${id}: invalid duration`);
    const bones = clip.skeleton?.bones || root.listSkins()[0].listJoints().map(n => ({ name: n.getName(), restTranslationMeters: n.getTranslation() }));
    const times = document.createAccessor(`${id}-seconds`).setBuffer(buffer).setType(Accessor.Type.SCALAR)
      .setArray(new Float32Array(frames.map(f => f.time * duration)));
    const animation = document.createAnimation(id).setExtras({ loop: !!clip.loop, durationSeconds: duration, timeDomain: 'seconds' });
    function track(node, property, values, width) {
      const output = document.createAccessor(`${id}-${node.getName()}-${property}`).setBuffer(buffer)
        .setType(width === 4 ? Accessor.Type.VEC4 : Accessor.Type.VEC3).setArray(new Float32Array(values));
      const sampler = document.createAnimationSampler().setInput(times).setOutput(output).setInterpolation('LINEAR');
      const channel = document.createAnimationChannel().setTargetNode(node).setTargetPath(property).setSampler(sampler);
      animation.addSampler(sampler).addChannel(channel);
    }
    for (const bone of bones) {
      if (!nodes[bone.name]) throw Error(`${id}: missing canonical joint ${bone.name}`);
      const values = []; let previous = null;
      for (const frame of frames) {
        let q = frame.rotations[bone.name];
        if (!q || q.length !== 4 || Math.abs(Math.hypot(...q) - 1) > .00001) throw Error(`${id}/${bone.name}: invalid quaternion`);
        q = [...q];
        if (previous && previous.reduce((sum, v, k) => sum + v * q[k], 0) < 0) q = q.map(v => -v);
        values.push(...q); previous = q;
      }
      track(nodes[bone.name], 'rotation', values, 4);
    }
    const hipsRest = nodes.Hips.getTranslation();
    track(nodes.Hips, 'translation', frames.flatMap(f => hipsRest.map((x, i) => x + f.hipsOffsetMeters[i])), 3);
    track(nodes.Ball, 'translation', frames.flatMap(f => f.ballPositionMeters), 3);
    const ballQuaternionCount = frames.filter(f => Array.isArray(f.ballRotationQuaternion)).length;
    if (ballQuaternionCount && ballQuaternionCount !== frames.length) throw Error(`${id}/Ball: incomplete rotation keys`);
    if (ballQuaternionCount) {
      const values = []; let previous = null;
      for (const frame of frames) {
        let q = [...frame.ballRotationQuaternion];
        if (q.length !== 4 || Math.abs(Math.hypot(...q) - 1) > .00001) throw Error(`${id}/Ball: invalid quaternion`);
        if (previous && previous.reduce((sum, v, k) => sum + v * q[k], 0) < 0) q = q.map(v => -v);
        values.push(...q); previous = q;
      }
      track(nodes.Ball, 'rotation', values, 4);
    }
    root.setExtras({ ...root.getExtras(), clip: id, loop: !!clip.loop, durationSeconds: duration, ballRadiusMeters: .12,
      keyframeSha256: sha256(keyframeBytes), previewModelSha256: sha256(model),
      animationRepresentation: 'canonical absolute parent-local rotations; Hips rest plus offset; independent Ball translation',
      rootMotion: false, geometryIdenticalAcrossClips: true,
    });
    await document.transform(draco({ method: 'edgebreaker', encodeSpeed: 4, decodeSpeed: 5, quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeGeneric: 16 }));
    const bytes = await io.writeBinary(document);
    if (bytes.length >= 1500000) throw Error(`${id}: GLB ${bytes.length} exceeds 1.5 MB`);
    const output = path.join(outputDirectory, `${id}.glb`);
    await fs.writeFile(output, bytes);
    const result = { id, bytes: bytes.length, keys: frames.length, channels: animation.listChannels().length };
    results.push(result); console.log(`${id}: ${bytes.length} bytes, ${frames.length} keys, ${result.channels} channels`);
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ids = process.argv.slice(2).filter(x => !x.startsWith('--'));
  await exportClips({ rebuildModel: process.argv.includes('--rebuild-model'), ids: ids.length ? ids : null });
}
