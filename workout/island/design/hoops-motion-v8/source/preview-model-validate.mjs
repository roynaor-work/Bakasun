/** Actual delivered Draco geometry + delivered animation vertex checks. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createIO, PACKAGE_ROOT } from './preview-model.mjs';
const require = createRequire(path.join(process.env.HOOPS_TOOLS_DIR || '/tmp/hoops-motion-v8-tools', 'package.json'));
const THREE = require('three');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function validatePreviewSkin() {
  const io = await createIO(), results = [];
  const previewModelSha256 = sha256(await fs.readFile(path.join(PACKAGE_ROOT, 'source/preview-model.glb')));
  const files = (await fs.readdir(path.join(PACKAGE_ROOT, 'runtime/keyframes'))).filter(p => p.endsWith('.json.gz')).sort();
  for (const file of files) {
    const keyframeBytes = await fs.readFile(path.join(PACKAGE_ROOT, 'runtime/keyframes', file));
    const authored = JSON.parse(gunzipSync(keyframeBytes));
    const glbBytes = await fs.readFile(path.join(PACKAGE_ROOT, 'runtime/clips', `${authored.id}.glb`));
    const document = await io.readBinary(glbBytes);
    const root = document.getRoot(), skin = root.listSkins()[0], joints = skin.listJoints();
    const names = joints.map(j => j.getName()), rest = joints.map(j => new THREE.Vector3(...j.getWorldTranslation()));
    const vertices = [];
    for (const node of root.listNodes()) if (node.getSkin() === skin) for (const primitive of node.getMesh().listPrimitives()) {
      const p = primitive.getAttribute('POSITION'), j = primitive.getAttribute('JOINTS_0'), w = primitive.getAttribute('WEIGHTS_0');
      for (let i = 0; i < p.getCount(); i++) vertices.push({ p: new THREE.Vector3(...p.getElement(i, [])), j: j.getElement(i, []), w: w.getElement(i, []) });
    }
    const animation = root.listAnimations()[0], channels = animation.listChannels();
    const frames = channels[0].getSampler().getInput().getCount();
    let minimumFloorMeters = Infinity, maximumContactGapMeters = 0, maximumHandPenetrationMeters = 0;
    let contactSamples = 0, worstContactTime = 0;
    for (let index = 0; index < frames; index++) {
      const seconds = channels[0].getSampler().getInput().getScalar(index), time = seconds / authored.durationSeconds;
      const locals = Object.fromEntries(joints.map(j => [j.getName(), { p: new THREE.Vector3(...j.getTranslation()), q: new THREE.Quaternion(...j.getRotation()) }]));
      let ball;
      for (const channel of channels) {
        const name = channel.getTargetNode().getName(), value = channel.getSampler().getOutput().getElement(index, []);
        if (name === 'Ball') {
          if (channel.getTargetPath() === 'translation') ball = new THREE.Vector3(...value);
        }
        else if (channel.getTargetPath() === 'rotation') locals[name].q.fromArray(value);
        else if (channel.getTargetPath() === 'translation') locals[name].p.fromArray(value);
      }
      const world = {};
      for (const bone of authored.skeleton.bones) {
        const { p, q } = locals[bone.name];
        if (bone.parent) { p.applyQuaternion(world[bone.parent].q).add(world[bone.parent].p); q.premultiply(world[bone.parent].q); }
        world[bone.name] = { p, q };
      }
      const contacts = authored.ballContactWindows.filter(c => time >= c.startTime - 1e-6 && time <= c.endTime + 1e-6);
      const measures = Object.fromEntries(contacts.map(c => [c.effector, { gap: Infinity, distance: Infinity }]));
      for (const vertex of vertices) {
        const p = new THREE.Vector3();
        for (let k = 0; k < 4; k++) if (vertex.w[k] > 0) {
          const joint = world[names[vertex.j[k]]];
          p.addScaledVector(vertex.p.clone().sub(rest[vertex.j[k]]).applyQuaternion(joint.q).add(joint.p), vertex.w[k]);
        }
        minimumFloorMeters = Math.min(minimumFloorMeters, p.y);
        for (const [effector, measure] of Object.entries(measures)) {
          let handWeight = 0;
          for (let k = 0; k < 4; k++) if (names[vertex.j[k]] === effector) handWeight += vertex.w[k];
          if (handWeight < .45) continue;
          const distance = p.distanceTo(ball);
          measure.distance = Math.min(measure.distance, distance);
          measure.gap = Math.min(measure.gap, Math.abs(distance - .12));
        }
      }
      for (const measure of Object.values(measures)) {
        contactSamples++;
        if (measure.gap > maximumContactGapMeters) { maximumContactGapMeters = measure.gap; worstContactTime = time; }
        maximumHandPenetrationMeters = Math.max(maximumHandPenetrationMeters, .12 - measure.distance);
      }
    }
    results.push({ id: authored.id, frames, contactSamples, minimumFloorMeters, maximumContactGapMeters, maximumHandPenetrationMeters, worstContactTime,
      glbSha256: sha256(glbBytes), keyframeSha256: sha256(keyframeBytes), previewModelSha256 });
  }
  return results;
}

export function skinValidationMarkdown(results) {
  const lines = ['Actual delivered Draco-decoded skinned vertices and GLB animation, sampled at every dense key in each declared contact window. Nearest-surface gap uses vertices with Hand weight ≥0.45; finger penetration allows a natural wrap around the ball. Gates: gap ≤10 mm, finger penetration ≤20 mm, floor ≥−1 mm. This is a sampled vertex test; the separate BODY report tests non-hand triangles.', '', '| Clip | Keys | Contact samples | Floor min mm | Hand surface gap mm | Finger penetration mm | Status |', '| --- | ---: | ---: | ---: | ---: | ---: | --- |'];
  for (const result of results) {
    const passed = result.maximumContactGapMeters <= .010 && result.maximumHandPenetrationMeters <= .020 && result.minimumFloorMeters >= -.001;
    lines.push(`| ${result.id} | ${result.frames} | ${result.contactSamples} | ${(result.minimumFloorMeters * 1000).toFixed(3)} | ${(result.maximumContactGapMeters * 1000).toFixed(3)} | ${(result.maximumHandPenetrationMeters * 1000).toFixed(3)} | ${passed ? 'PASS' : 'FAIL'} |`);
  }
  lines.push('', `Preview model SHA-256: ${results[0]?.previewModelSha256 || 'no clips'}.`);
  for (const result of results) lines.push('', `${result.id}: GLB SHA-256 ${result.glbSha256}; gzip SHA-256 ${result.keyframeSha256}.`);
  return lines.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await validatePreviewSkin();
  const reportIndex = process.argv.indexOf('--report'), markdown = skinValidationMarkdown(results);
  if (reportIndex >= 0) await fs.writeFile(path.resolve(process.argv[reportIndex + 1]), markdown);
  else process.stdout.write(markdown);
  if (process.argv.includes('--assert') && results.some(r => r.maximumContactGapMeters > .010 || r.maximumHandPenetrationMeters > .020 || r.minimumFloorMeters < -.001)) process.exitCode = 1;
}
