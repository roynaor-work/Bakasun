/** Sphere / actual skinned triangle clearance, excluding grasping hand faces. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createIO, PACKAGE_ROOT } from './preview-model.mjs';
const require = createRequire(path.join(process.env.HOOPS_TOOLS_DIR || '/tmp/hoops-motion-v8-tools', 'package.json'));
const THREE = require('three');
const REGIONS = ['torso', 'legs', 'forearms', 'upperarms'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function auditBodyClearance({ authoredPose = false, ids = null } = {}) {
  const io = await createIO(), results = [];
  const files = (await fs.readdir(path.join(PACKAGE_ROOT, 'runtime/keyframes'))).filter(n => n.endsWith('.json.gz') && (!ids || ids.includes(n.slice(0, -8)))).sort();
  for (const file of files) {
    const keyBytes = await fs.readFile(path.join(PACKAGE_ROOT, 'runtime/keyframes', file));
    const authored = JSON.parse(gunzipSync(keyBytes));
    const bytes = await fs.readFile(path.join(PACKAGE_ROOT, 'runtime/clips', `${authored.id}.glb`));
    const document = await io.readBinary(bytes), root = document.getRoot(), skin = root.listSkins()[0], joints = skin.listJoints();
    const names = joints.map(j => j.getName()), rest = joints.map(j => new THREE.Vector3(...j.getWorldTranslation()));
    const vertices = [], triangles = [];
    for (const node of root.listNodes()) if (node.getSkin() === skin) for (const primitive of node.getMesh().listPrimitives()) {
      const p = primitive.getAttribute('POSITION'), j = primitive.getAttribute('JOINTS_0'), w = primitive.getAttribute('WEIGHTS_0'), offset = vertices.length;
      for (let i = 0; i < p.getCount(); i++) {
        const js = j.getElement(i, []), ws = w.getElement(i, []), region = { torso: 0, legs: 0, forearms: 0, upperarms: 0, hands: 0 };
        js.forEach((index, k) => {
          const name = names[index], weight = ws[k];
          if (/Hips|Spine|Chest|Neck|Head/.test(name)) region.torso += weight;
          if (/Leg|Foot/.test(name)) region.legs += weight;
          if (/ForeArm/.test(name)) region.forearms += weight;
          else if (/Arm/.test(name)) region.upperarms += weight;
          if (/Hand/.test(name)) region.hands += weight;
        });
        vertices.push({ p: new THREE.Vector3(...p.getElement(i, [])), js, ws, region, posed: new THREE.Vector3() });
      }
      const index = primitive.getIndices().getArray();
      for (let i = 0; i < index.length; i += 3) {
        const ids = [index[i] + offset, index[i + 1] + offset, index[i + 2] + offset];
        if (ids.reduce((s, i) => s + vertices[i].region.hands, 0) / 3 > .20) continue;
        let region, maximum = .5;
        for (const candidate of REGIONS) {
          const weight = ids.reduce((s, i) => s + vertices[i].region[candidate], 0) / 3;
          if (weight > maximum) { maximum = weight; region = candidate; }
        }
        if (region) triangles.push({ ids, region });
      }
    }
    const animation = root.listAnimations()[0], channels = animation.listChannels();
    const frameCount = authoredPose ? authored.keyframes.length : channels[0].getSampler().getInput().getCount();
    const bakedDuration = root.getExtras().durationSeconds || authored.durationSeconds;
    const worst = Object.fromEntries(REGIONS.map(region => [region, { penetrationMeters: -Infinity, time: 0 }]));
    const triangle = new THREE.Triangle(), closest = new THREE.Vector3();
    for (let index = 0; index < frameCount; index++) {
      const locals = Object.fromEntries(joints.map(j => [j.getName(), { p: new THREE.Vector3(...j.getTranslation()), q: new THREE.Quaternion(...j.getRotation()) }]));
      let time, ball;
      if (authoredPose) {
        const frame = authored.keyframes[index]; time = frame.time; ball = new THREE.Vector3(...frame.ballPositionMeters);
        for (const name of names) locals[name].q.fromArray(frame.rotations[name]);
        locals.Hips.p.add(new THREE.Vector3(...frame.hipsOffsetMeters));
      } else {
        time = channels[0].getSampler().getInput().getScalar(index) / bakedDuration;
        for (const channel of channels) {
          const name = channel.getTargetNode().getName(), value = channel.getSampler().getOutput().getElement(index, []), property = channel.getTargetPath();
          if (name === 'Ball') { if (property === 'translation') ball = new THREE.Vector3(...value); }
          else if (property === 'rotation') locals[name].q.fromArray(value);
          else if (property === 'translation') locals[name].p.fromArray(value);
        }
      }
      const world = {};
      for (const bone of authored.skeleton.bones) {
        const { p, q } = locals[bone.name];
        if (bone.parent) { p.applyQuaternion(world[bone.parent].q).add(world[bone.parent].p); q.premultiply(world[bone.parent].q); }
        world[bone.name] = { p, q };
      }
      for (const vertex of vertices) {
        vertex.posed.set(0, 0, 0);
        for (let k = 0; k < 4; k++) if (vertex.ws[k] > 0) {
          const joint = world[names[vertex.js[k]]];
          vertex.posed.addScaledVector(vertex.p.clone().sub(rest[vertex.js[k]]).applyQuaternion(joint.q).add(joint.p), vertex.ws[k]);
        }
      }
      for (const face of triangles) {
        triangle.set(...face.ids.map(i => vertices[i].posed)); triangle.closestPointToPoint(ball, closest);
        const penetrationMeters = .12 - ball.distanceTo(closest);
        if (penetrationMeters > worst[face.region].penetrationMeters) worst[face.region] = {
          penetrationMeters, time, ballMeters: ball.toArray(), closestTrianglePointMeters: closest.toArray(),
        };
      }
    }
    const passed = REGIONS.every(region => worst[region].penetrationMeters <= (region === 'forearms' ? .010 : .005));
    results.push({ id: authored.id, passed, poseSource: authoredPose ? 'authored canonical keys' : 'delivered GLB animation', glbSha256: hash(bytes), keyframeSha256: hash(keyBytes), frameCount, triangleCount: triangles.length, worst });
  }
  return results;
}

export function bodyClearanceMarkdown(results) {
  const lines = ['Ball surface against actual Draco-decoded skinned triangles. Positive values mean penetration; negative values mean clearance. Hand faces (average Hand weight > 0.20) are excluded. Torso/legs/upper arms pass at ≤5 mm; forearms pass at ≤10 mm.', '', '| Clip | Frames | Torso mm | Legs mm | Forearms mm | Upper arms mm | Status |', '| --- | ---: | ---: | ---: | ---: | ---: | --- |'];
  for (const result of results) lines.push(`| ${result.id} | ${result.frameCount} | ${REGIONS.map(region => (result.worst[region].penetrationMeters * 1000).toFixed(3)).join(' | ')} | ${result.passed ? 'PASS' : 'FAIL'} |`);
  for (const result of results) {
    lines.push('', `${result.id}: ${result.poseSource}; ${result.triangleCount} tested triangles; GLB SHA-256 ${result.glbSha256}; gzip SHA-256 ${result.keyframeSha256}.`);
    for (const region of REGIONS) {
      const value = result.worst[region];
      lines.push(`- ${region}: t=${value.time.toFixed(6)}, ball [${value.ballMeters.map(x => x.toFixed(6)).join(', ')}], closest point [${value.closestTrianglePointMeters.map(x => x.toFixed(6)).join(', ')}], penetration ${(value.penetrationMeters * 1000).toFixed(3)} mm.`);
    }
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), clipIndex = args.indexOf('--clip'), reportIndex = args.indexOf('--report');
  const result = await auditBodyClearance({ authoredPose: args.includes('--author'), ids: clipIndex >= 0 ? [args[clipIndex + 1]] : null });
  const markdown = bodyClearanceMarkdown(result);
  if (reportIndex >= 0) await fs.writeFile(path.resolve(args[reportIndex + 1]), markdown);
  else process.stdout.write(markdown);
  if (args.includes('--assert') && result.some(r => !r.passed)) process.exitCode = 1;
}
