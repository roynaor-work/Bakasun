/** Dense, independent audit of the actual decoded skin and native clip tracks.
 * Run after building: node verification/audit-motion.mjs [output.md]
 * Measures every skinned vertex at 120 Hz plus all contact/support boundaries.
 */
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from '../runtime/vendor/three.module.js';
import { loadNativeGLTF } from './glb-reader.mjs';
import { clips } from '../runtime/catalog.mjs';

const started = performance.now(), rows = [], ballRows = [];
const vector = new THREE.Vector3(), sole = new THREE.Vector3(0, -.08, 0);
function pathAt(keys, time) {
  if (!keys?.length) return new THREE.Vector3();
  const upper = keys.findIndex(key => key.time >= time);
  if (upper <= 0) return new THREE.Vector3().fromArray(keys[upper < 0 ? keys.length - 1 : 0].position);
  const a = keys[upper - 1], b = keys[upper];
  return new THREE.Vector3().fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), (time - a.time) / (b.time - a.time));
}
for (const role of ['field', 'keeper']) {
  const selected = clips.filter(clip => clip.role === role);
  const gltf = await loadNativeGLTF(fileURLToPath(new URL(`../runtime/${selected[0].asset}`, import.meta.url)));
  const actor = gltf.scene, meshes = [], bones = new Map();
  actor.traverse(node => { if (node.isSkinnedMesh) meshes.push(node); if (node.isBone) bones.set(node.name, node); });
  const mixer = new THREE.AnimationMixer(actor);
  for (const info of selected) {
    mixer.stopAllAction();
    const clip = gltf.animations.find(clip => clip.name === info.id);
    const action = mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce, 1).play();
    action.clampWhenFinished = true;
    const times = [...new Set([0, info.duration, ...Array.from({ length: Math.ceil(info.duration * 120) }, (_, i) => i / 120),
      ...info.events.map(event => event.time), ...info.supports.flatMap(support => [support.start, support.end])])].sort((a, b) => a - b);
    let minY = Infinity, minAt = 0, minMesh, minVertex, supportError = 0, supportAt = 0;
    let maxOmega = 0, omegaBone, omegaAt, previous, count = 0;
    const seek = seconds => {
      action.paused = false;
      action.time = Math.min(seconds, clip.duration);
      mixer.update(0);
      actor.updateMatrixWorld(true);
      for (const mesh of meshes) mesh.skeleton.update();
    };
    for (const time of times) {
      seek(time);
      const current = [...bones].map(([name, bone]) => [name, bone.quaternion.clone()]);
      if (previous && time - previous.time > 1e-7) {
        for (let i = 0; i < current.length; i++) {
          const omega = current[i][1].angleTo(previous.rotations[i][1]) / (time - previous.time);
          if (omega > maxOmega) { maxOmega = omega; omegaBone = current[i][0]; omegaAt = time; }
        }
      }
      previous = { time, rotations: current };
      for (const mesh of meshes) for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, vector).applyMatrix4(mesh.matrixWorld);
        count++;
        if (vector.y < minY) { minY = vector.y; minAt = time; minMesh = mesh.name; minVertex = i; }
      }
      for (const support of info.supports) if (time >= support.start - 1e-8 && time <= support.end + 1e-8) {
        const actual = sole.clone().applyMatrix4(bones.get(support.bone).matrixWorld).add(pathAt(info.travel, time));
        const error = actual.distanceTo(new THREE.Vector3().fromArray(support.anchor));
        if (error > supportError) { supportError = error; supportAt = time; }
      }
    }
    for (const event of info.events.filter(event => ['contact', 'release'].includes(event.type))) {
      seek(event.time);
      const point = new THREE.Vector3().fromArray(event.local).applyMatrix4(bones.get(event.bone).matrixWorld);
      const center = pathAt(info.ball.keys, event.time);
      ballRows.push({ id: info.id, type: event.type, time: event.time, fkError: point.distanceTo(new THREE.Vector3().fromArray(event.position)), radiusError: Math.abs(point.distanceTo(center) - info.ball.radius) });
    }
    rows.push({ id: info.id, minY, minAt, minMesh, minVertex, supportError, supportAt, maxOmega, omegaBone, omegaAt, count });
    process.stdout.write(`${info.id}: floor ${(minY * 1000).toFixed(2)} mm; sole ${(supportError * 1000).toFixed(2)} mm; max local rotation ${maxOmega.toFixed(2)} rad/s (${omegaBone})\n`);
    mixer.uncacheClip(clip);
  }
  mixer.uncacheRoot(actor);
}
const output = process.argv[2] ?? fileURLToPath(new URL('./motion-audit.md', import.meta.url));
const report = [
  '# Native skin audit', '', `Measured UTC: ${new Date().toISOString()}. Actual shipped GLB decoded using local Draco/r160.`,
  `All skin vertices at 120 Hz plus event/support endpoints: ${rows.reduce((sum, row) => sum + row.count, 0).toLocaleString('en-US')} vertex samples; elapsed ${((performance.now() - started) / 1000).toFixed(2)} s.`,
  'Native animation only. No viewer IK, floor lift, metadata substitutions, raster textures or screenshot framing corrections affect these measurements. Optional travel is included when evaluating a declared support anchor.', '',
  '| Clip | Minimum skin y (mm) | At (s) | Worst mesh/vertex | Support residual (mm) | At (s) | Maximum bone angular speed (rad/s) | Bone / time |',
  '| --- | ---: | ---: | --- | ---: | ---: | ---: | --- |',
  ...rows.map(row => `| ${row.id} | ${(row.minY * 1000).toFixed(3)} | ${row.minAt.toFixed(4)} | ${row.minMesh}/${row.minVertex} | ${(row.supportError * 1000).toFixed(3)} | ${row.supportAt.toFixed(4)} | ${row.maxOmega.toFixed(3)} | ${row.omegaBone} / ${row.omegaAt.toFixed(4)} |`),
  '', 'Angular speed detects twist and sample discontinuities; it is not a universal biomechanical limit. Event-local FK and sphere surface distances are checked independently below.', '',
  '| Clip | Cue | Seconds | Native FK vs metadata (mm) | Radius residual (mm) |', '| --- | --- | ---: | ---: | ---: |',
  ...ballRows.map(row => `| ${row.id} | ${row.type} | ${row.time.toFixed(4)} | ${(row.fkError * 1000).toFixed(4)} | ${(row.radiusError * 1000).toFixed(4)} |`), '',
  'These finite samples constrain the delivered model and its native interpolation. They do not prove collision-free cloth or physical phone performance.', ''
].join('\n');
await fs.writeFile(output, report);
console.log(`Written ${output}`);
