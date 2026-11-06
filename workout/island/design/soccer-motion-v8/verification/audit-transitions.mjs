/** Independent native/controller transition audit; no source-motion evaluator.
 * node verification/audit-transitions.mjs [output.md]
 * Every legal edge, three legal source clocks, every skinned vertex at 60 Hz
 * through the full blend and the following 50 ms. Node bypasses image decode.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from '../runtime/vendor/three.module.js';
import { clips, bones, transitions } from '../runtime/catalog.mjs';
import { loadLibrary, createController } from '../runtime/controller.mjs';
import { loadNativeGLTF, walkFiles } from './glb-reader.mjs';

const started = performance.now(), base = fileURLToPath(new URL('../', import.meta.url));
const byID = new Map(clips.map(clip => [clip.id, clip])), dt = 1 / 60;
const sha = input => createHash('sha256').update(input).digest('hex');
const inputs = [];
for (const file of [...await walkFiles(path.join(base, 'runtime')),
  { path: fileURLToPath(import.meta.url) }, { path: fileURLToPath(new URL('./glb-reader.mjs', import.meta.url)) }]) {
  const bytes = await fs.readFile(file.path);
  inputs.push({ name: path.relative(base, file.path), bytes: bytes.length, hash: sha(bytes) });
}
inputs.sort((a, b) => a.name.localeCompare(b.name));
const inputHash = sha(Buffer.from(inputs.map(input => `${input.hash}  ${input.name}\n`).join('')));
const library = await loadLibrary({ loader: { loadAsync: url => loadNativeGLTF(new URL(url)) } });
const point = new THREE.Vector3(), rows = [], caseRows = [];
let vertices = 0;

function poses(controller) {
  controller.root.updateMatrixWorld(true);
  return bones.map(({ name }) => {
    const node = controller.root.getObjectByName(name);
    return { name, position: node.getWorldPosition(new THREE.Vector3()), quaternion: node.getWorldQuaternion(new THREE.Quaternion()).normalize() };
  });
}
function legalClocks(edge, clip) {
  const low = edge.earliest ?? 0;
  if (clip.loop && edge.latest === undefined) {
    const nextPhase = phase => {
      let time = phase * clip.duration;
      while (time < low + 1e-5) time += clip.duration;
      return time;
    };
    return [low + .005, nextPhase(.25), nextPhase(.75)];
  }
  const high = Math.min(edge.latest ?? clip.duration, clip.duration);
  return [low + Math.min(.005, (high - low) / 4), (low + high) / 2, Math.max(low, high - 1e-5)];
}
function supportAt(clip, time) {
  const phase = clip.loop ? time % clip.duration : time;
  return clip.supports.filter(support => support.start <= phase + 1e-8 && support.end >= phase - 1e-8);
}
function comparePose(before, after, result) {
  for (let i = 0; i < before.length; i++) {
    const translation = before[i].position.distanceTo(after[i].position);
    const angle = before[i].quaternion.angleTo(after[i].quaternion);
    result.popPosition = Math.max(result.popPosition, translation);
    result.popAngle = Math.max(result.popAngle, angle);
  }
}

try {
  for (const edge of transitions) {
    const source = byID.get(edge.from), destination = byID.get(edge.to), results = [];
    if (!source || !destination || source.role !== destination.role) throw new Error(`Invalid edge ${edge.from} → ${edge.to}`);
    for (const sourceTime of legalClocks(edge, source)) {
      const controller = createController(library, { role: source.role, start: source.id, autoReturn: false, applyTravel: true });
      try {
        // A real positive update immediately before the request supplies the
        // runtime with the displayed source velocity. seek alone would zero it.
        const previousTime = Math.max(0, sourceTime - dt);
        controller.seek(previousTime).update(sourceTime - previousTime);
        const before = poses(controller), shared = new Map();
        for (const support of supportAt(source, controller.time)) {
          const target = supportAt(destination, 0).find(candidate => candidate.bone === support.bone);
          if (!target) continue;
          const node = controller.root.getObjectByName(support.bone);
          shared.set(support.bone, { point: node.localToWorld(new THREE.Vector3(0, -.08, 0)), until: target.end });
        }
        const meshes = [];
        controller.root.traverse(node => { if (node.isSkinnedMesh) meshes.push(node); });
        const result = {
          from: edge.from, to: edge.to, trigger: edge.trigger, sourceTime,
          minY: Infinity, floorAt: 0, witness: '', drift: 0, driftAt: 0, driftBone: '',
          popPosition: 0, popAngle: 0, speed: 0, omega: 0, finite: true,
          shared: [...shared.keys()].join(', ') || 'none', samples: 0,
        };
        if (!controller.request(edge.trigger)) throw new Error(`Legal request rejected at ${sourceTime}: ${edge.from}/${edge.trigger}`);
        comparePose(before, poses(controller), result);
        const finalTime = edge.blend + .05;
        const boundaries = destination.supports.flatMap(support => [support.start, support.end])
          .flatMap(time => [time - 1e-6, time, time + 1e-6]);
        const times = [...new Set([0, edge.blend, finalTime,
          ...destination.events.map(event => event.time), ...boundaries,
          ...Array.from({ length: Math.ceil(finalTime * 60) }, (_, i) => i / 60)])]
          .filter(time => time >= 0 && time <= finalTime).sort((a, b) => a - b);
        let previous = poses(controller), elapsed = 0;
        for (const time of times) {
          if (time > elapsed) controller.update(time - elapsed);
          const pose = poses(controller);
          for (let i = 0; i < pose.length; i++) {
            result.finite &&= pose[i].position.toArray().every(Number.isFinite) && pose[i].quaternion.toArray().every(Number.isFinite);
            if (time > elapsed) {
              result.speed = Math.max(result.speed, pose[i].position.distanceTo(previous[i].position) / (time - elapsed));
              result.omega = Math.max(result.omega, pose[i].quaternion.angleTo(previous[i].quaternion) / (time - elapsed));
            }
          }
          for (const mesh of meshes) {
            mesh.skeleton.update();
            for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
              mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
              result.samples++; vertices++;
              result.finite &&= point.toArray().every(Number.isFinite);
              if (point.y < result.minY) { result.minY = point.y; result.floorAt = time; result.witness = `${mesh.name}/${i}`; }
            }
          }
          for (const [bone, support] of shared) if (time <= support.until + 1e-8) {
            const actual = controller.root.getObjectByName(bone).localToWorld(new THREE.Vector3(0, -.08, 0));
            const drift = actual.distanceTo(support.point);
            if (drift > result.drift) { result.drift = drift; result.driftAt = time; result.driftBone = bone; }
          }
          previous = pose; elapsed = time;
        }
        results.push(result); caseRows.push(result);
      } finally { controller.dispose(); }
    }
    const worst = results.reduce((a, b) => a.minY < b.minY ? a : b);
    const drift = results.reduce((a, b) => a.drift > b.drift ? a : b);
    const aggregate = {
      ...worst, drift: drift.drift, driftBone: drift.driftBone, driftAt: drift.driftAt, driftSource: drift.sourceTime,
      popPosition: Math.max(...results.map(result => result.popPosition)),
      popAngle: Math.max(...results.map(result => result.popAngle)),
      speed: Math.max(...results.map(result => result.speed)), omega: Math.max(...results.map(result => result.omega)),
      finite: results.every(result => result.finite),
    };
    rows.push(aggregate);
    process.stdout.write(`${edge.from} → ${edge.to}: floor ${(aggregate.minY * 1000).toFixed(2)} mm; shared-foot drift ${(aggregate.drift * 1000).toFixed(2)} mm; C0 ${(aggregate.popPosition * 1000).toFixed(4)} mm\n`);
  }
} finally { library.dispose(); }

for (const input of inputs) {
  const bytes = await fs.readFile(path.join(base, input.name));
  if (sha(bytes) !== input.hash) throw new Error(`Audit input changed while running: ${input.name}`);
}
const output = process.argv[2] ?? fileURLToPath(new URL('./transition-audit.md', import.meta.url));
const floorFailures = rows.filter(row => row.minY < -.005), popFailures = rows.filter(row => row.popPosition > 1e-6 || row.popAngle > 1e-6);
const supportFailures = rows.filter(row => row.drift > .005);
const report = [
  '# Actual-skin transition audit', '',
  `Measured UTC: ${new Date().toISOString()}. Input SHA-256: \`${inputHash}\`.`,
  `${transitions.length} legal edges × three legal source clocks = ${caseRows.length} cases. Every skinned vertex sampled at 60 Hz, exact handoff and blend end, through blend + 50 ms: ${vertices.toLocaleString('en-US')} vertex samples; elapsed ${((performance.now() - started) / 1000).toFixed(2)} s.`,
  'Sources receive a genuine positive update for their final 1/60 s before each request. Infinite loop windows use the earliest legal instant plus the next 0.25 and 0.75 cycle phases. Non-loop windows use near-earliest, middle and near-latest clocks. Controller auto-return is disabled to isolate the chosen edge. Optional reference travel is enabled; the game-owned root stays untouched.',
  'Actual Draco geometry, native tracks, runtime blend, real skinning. No source-pose evaluator, proxy capsules, viewer floor correction or raster textures. Foot drift measures the canonical sole marker from its displayed world anchor only when the same foot is declared planted at source exit and destination entry, while the destination support window remains active. It does not prove skin sole contact.', '',
  `Edges below −5 mm skin tolerance: ${floorFailures.length}/${rows.length}. Handoffs exceeding 1 µm or 1 µrad: ${popFailures.length}/${rows.length}. Non-finite cases: ${caseRows.filter(row => !row.finite).length}.`,
  `Shared support drifts above 5 mm before the destination support release: ${supportFailures.length}/${rows.length}. Exact support boundaries and ±1 µs neighbours are included.`,
  'Velocity maxima are diagnostic, not a universal biomechanical pass threshold. A finite source sampler and a passing static clip audit do not guarantee collision-free blends or fixed support feet.', '',
  '| Source → destination | Trigger | Worst floor (mm) | Source time / blend time (s) | Mesh / vertex | Shared-foot max drift (mm) | Foot / source / blend time (s) | C0 position (mm) / angle (mrad) | Max joint speed (m/s) / angular speed (rad/s) |',
  '| --- | --- | ---: | --- | --- | ---: | --- | --- | --- |',
  ...rows.map(row => `| ${row.from} → ${row.to} | ${row.trigger} | ${(row.minY * 1000).toFixed(3)} | ${row.sourceTime.toFixed(4)} / ${row.floorAt.toFixed(4)} | ${row.witness} | ${(row.drift * 1000).toFixed(3)} | ${row.driftBone || 'none'} / ${row.driftSource.toFixed(4)} / ${row.driftAt.toFixed(4)} | ${(row.popPosition * 1000).toFixed(6)} / ${(row.popAngle * 1000).toFixed(6)} | ${row.speed.toFixed(3)} / ${row.omega.toFixed(3)} |`),
  '', '## Exact inputs', '', '| File | Bytes | SHA-256 |', '| --- | ---: | --- |',
  ...inputs.map(input => `| ${input.name} | ${input.bytes} | ${input.hash} |`), '',
].join('\n');
await fs.writeFile(output, report);
console.log(`Written ${output}`);
