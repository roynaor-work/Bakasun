/** Independent finite-sample ball/full-skin proximity audit.
 * node verification/audit-ball-path.mjs [output.md]
 * Uses the shipped GLB's native interpolation and all decoded body triangles.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from '../runtime/vendor/three.module.js';
import { clips } from '../runtime/catalog.mjs';
import { loadNativeGLTF, walkFiles } from './glb-reader.mjs';

function pathAt(keys, time, out) {
  const upper = keys.findIndex(key => key.time >= time);
  if (upper <= 0) return out.fromArray(keys[upper < 0 ? keys.length - 1 : 0].position);
  const left = keys[upper - 1], right = keys[upper], ratio = (time - left.time) / (right.time - left.time);
  return out.set(...left.position.map((value, i) => value + (right.position[i] - value) * ratio));
}
function sampledTimes(info, rate, cueStep, cueRadius) {
  const times = new Set([0, info.duration, ...info.ball.keys.map(key => key.time), ...info.events.map(cue => cue.time)]);
  for (let i = 0; i <= Math.ceil(info.duration * rate); i++) times.add(Math.min(info.duration, i / rate));
  for (const cue of info.events.filter(event => ['contact', 'release'].includes(event.type))) {
    for (let offset = -Math.ceil(cueRadius / cueStep); offset <= Math.ceil(cueRadius / cueStep); offset++) {
      times.add(Math.min(info.duration, Math.max(0, cue.time + offset * cueStep)));
    }
  }
  return [...times].sort((left, right) => left - right).filter((time, i, all) => !i || time - all[i - 1] > 1e-8);
}

export async function auditBallPaths({ rate = 60, cueStep = .005, cueRadius = .1 } = {}) {
  if (!(rate > 0 && cueStep > 0 && cueRadius >= 0)) throw new Error('Invalid ball-path sampling configuration');
  const started = performance.now(), runtime = fileURLToPath(new URL('../runtime/', import.meta.url));
  const files = [...(await walkFiles(runtime)).map(file => file.path), fileURLToPath(import.meta.url), fileURLToPath(new URL('./glb-reader.mjs', import.meta.url))].sort();
  async function snapshot() {
    return Promise.all(files.map(async file => ({ file: path.relative(runtime, file), hash: crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex') })));
  }
  const inputs = await snapshot(), inputHash = crypto.createHash('sha256').update(inputs.map(input => `${input.file}:${input.hash}`).join('\n')).digest('hex');
  const rows = [], center = new THREE.Vector3(), point = new THREE.Vector3();
  const triangle = new THREE.Triangle(), closest = new THREE.Vector3();
  let triangleTests = 0;
  for (const role of ['field', 'keeper']) {
    const selected = clips.filter(clip => clip.role === role);
    const gltf = await loadNativeGLTF(fileURLToPath(new URL(`../runtime/${selected[0].asset}`, import.meta.url)));
    const actor = gltf.scene, meshes = [];
    actor.traverse(node => {
      if (!node.isSkinnedMesh) return;
      const count = node.geometry.attributes.position.count, index = node.geometry.index;
      meshes.push({ node, positions: new Float64Array(count * 3), count, index, length: index?.count ?? count });
    });
    const mixer = new THREE.AnimationMixer(actor);
    for (const info of selected) {
      mixer.stopAllAction();
      const clip = gltf.animations.find(item => item.name === info.id);
      const action = mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce, 1).play();
      action.clampWhenFinished = true;
      const times = sampledTimes(info, rate, cueStep, cueRadius);
      const row = { id: info.id, samples: times.length, duration: info.duration, radius: info.ball.radius, worstOverlap: -Infinity,
        time: 0, mesh: '', triangle: -1, center: null, surface: null, distance: Infinity, violations: 0 };
      for (const time of times) {
        action.paused = false;
        action.time = time;
        mixer.update(0);
        actor.updateMatrixWorld(true);
        pathAt(info.ball.keys, time, center);
        if (![center.x, center.y, center.z].every(Number.isFinite)) throw new Error(`Non-finite ball path ${info.id}@${time}`);
        let nearestSquared = Infinity, nearestMesh, nearestTriangle, nearestPoint;
        for (const mesh of meshes) {
          mesh.node.skeleton.update();
          for (let vertex = 0; vertex < mesh.count; vertex++) {
            mesh.node.getVertexPosition(vertex, point).applyMatrix4(mesh.node.matrixWorld).toArray(mesh.positions, vertex * 3);
          }
          for (let offset = 0; offset < mesh.length; offset += 3) {
            const a = mesh.index ? mesh.index.getX(offset) : offset;
            const b = mesh.index ? mesh.index.getX(offset + 1) : offset + 1;
            const c = mesh.index ? mesh.index.getX(offset + 2) : offset + 2;
            triangle.a.fromArray(mesh.positions, a * 3); triangle.b.fromArray(mesh.positions, b * 3); triangle.c.fromArray(mesh.positions, c * 3);
            // A triangle's axis-aligned bounding box gives an exact lower bound
            // on its distance; pruning cannot hide a closer surface.
            let lowerBound = 0;
            for (const axis of ['x', 'y', 'z']) {
              const low = Math.min(triangle.a[axis], triangle.b[axis], triangle.c[axis]);
              const high = Math.max(triangle.a[axis], triangle.b[axis], triangle.c[axis]);
              const delta = Math.max(low - center[axis], center[axis] - high, 0);
              lowerBound += delta * delta;
            }
            if (lowerBound > nearestSquared) continue;
            triangleTests++;
            triangle.closestPointToPoint(center, closest);
            const distance = center.distanceToSquared(closest);
            if (distance < nearestSquared) { nearestSquared = distance; nearestMesh = mesh.node.name; nearestTriangle = offset / 3; nearestPoint = closest.toArray(); }
          }
        }
        if (!Number.isFinite(nearestSquared)) throw new Error(`No finite whole-body distance ${info.id}@${time}`);
        const distance = Math.sqrt(nearestSquared), overlap = info.ball.radius - distance;
        if (overlap > .005) row.violations++;
        if (overlap > row.worstOverlap) Object.assign(row, { worstOverlap: overlap, time, mesh: nearestMesh, triangle: nearestTriangle, center: center.toArray(), surface: nearestPoint, distance });
      }
      rows.push(row);
      mixer.uncacheClip(clip);
    }
    mixer.uncacheRoot(actor);
  }
  if (JSON.stringify(inputs) !== JSON.stringify(await snapshot())) throw new Error('Runtime inputs changed during ball-path audit; discard mixed snapshot');
  return { rows, inputs, inputHash, rate, cueStep, cueRadius, triangleTests, elapsedSeconds: (performance.now() - started) / 1000 };
}

export async function writeBallPathReport(output = fileURLToPath(new URL('./ball-path-audit.md', import.meta.url))) {
  const result = await auditBallPaths(), { rows, inputs, inputHash, rate, cueStep, cueRadius, triangleTests, elapsedSeconds } = result;
  const mm = value => (value * 1000).toFixed(3), coordinates = values => values.map(value => value.toFixed(5)).join(', ');
  const report = [
    '# Native ball path / whole-body skin proximity audit', '',
    `Measured UTC: ${new Date().toISOString()}. Input SHA-256: \`${inputHash}\`. ${rows.length} native clips, ${rows.reduce((sum, row) => sum + row.samples, 0)} poses, ${triangleTests.toLocaleString('en-US')} exact closest-triangle tests; elapsed ${elapsedSeconds.toFixed(2)} s.`,
    `All clips sampled at ${rate} Hz, all ball trajectory keys and event times, plus ${(cueStep * 1000).toFixed(1)} ms samples within ±${(cueRadius * 1000).toFixed(0)} ms of every contact/release. Geometry comes from actual local Draco decoding and shipped native AnimationClips; no source evaluator, viewer IK, proxy shape, region filter or texture substitution affects positions.`, '',
    'Overlap = ball radius − nearest whole-body skinned-triangle distance. Positive overlap means an actual surface point lies inside the sphere; a negative value is surface clearance. All body meshes participate, including the other hand, boots, clothing and head. Axis-aligned triangle-box distance only prunes triangles that cannot improve the nearest result. This unsigned finite-sample test does not prove closed-volume containment, self-collision freedom or collision freedom between sample instants. Reference travel translates body and ball together, so relative distance is unchanged.', '',
    `Clips with a sampled whole-body overlap above 5 mm: ${rows.filter(row => row.worstOverlap > .005).length}/${rows.length}. The 5 mm tolerance is the delivered geometry acceptance limit; native contact and release cues are checked separately against their intended effector surfaces.`, '',
    '| Clip | Poses | Maximum sphere overlap (mm) | Time (s) | Nearest mesh / triangle | Ball center [m] | Nearest surface point [m] | Samples above 5 mm |',
    '| --- | ---: | ---: | ---: | --- | --- | --- | ---: |',
    ...rows.map(row => `| ${row.id} | ${row.samples} | ${mm(row.worstOverlap)} | ${row.time.toFixed(6)} | ${row.mesh}/${row.triangle} | [${coordinates(row.center)}] | [${coordinates(row.surface)}] | ${row.violations} |`), '',
    'Runtime and audit inputs were hashed before and after sampling; any mutation aborts this report.', '', '| File | SHA-256 |', '| --- | --- |',
    ...inputs.map(input => `| ${input.file} | \`${input.hash}\` |`), ''
  ].join('\n');
  await fs.writeFile(output, report);
  console.log(`Written ${output}; ${rows.filter(row => row.worstOverlap > .005).length}/${rows.length} clips above 5 mm.`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await writeBallPathReport(process.argv[2]);
