/** Independent native-pose contact diagnostic against real decoded skin triangles.
 * node verification/audit-ball-contact.mjs [output.md]
 * No arbitrary pass threshold: positive sphere penetration is measured, not hidden.
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../runtime/vendor/three.module.js';
import { clips } from '../runtime/catalog.mjs';
import { loadNativeGLTF, walkFiles } from './glb-reader.mjs';

export async function auditBallContacts() {
  const started = performance.now(), runtime = fileURLToPath(new URL('../runtime/', import.meta.url));
  const inputFiles = [...(await walkFiles(runtime)).map(file => file.path), fileURLToPath(import.meta.url), fileURLToPath(new URL('./glb-reader.mjs', import.meta.url))].sort();
  async function snapshot() {
    const hashes = [];
    for (const file of inputFiles) hashes.push({ path: file, hash: crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex') });
    return hashes;
  }
  const inputs = await snapshot(), inputHash = crypto.createHash('sha256').update(inputs.map(file => `${file.path.slice(runtime.length)}:${file.hash}`).join('\n')).digest('hex');
  const rows = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const triangle = new THREE.Triangle(a, b, c), closest = new THREE.Vector3(), scratch = new THREE.Vector3();
  function pathAt(keys, time) {
    const upper = keys.findIndex(key => key.time >= time);
    if (upper <= 0) return new THREE.Vector3().fromArray(keys[upper < 0 ? keys.length - 1 : 0].position);
    const low = keys[upper - 1], high = keys[upper];
    return new THREE.Vector3().fromArray(low.position).lerp(new THREE.Vector3().fromArray(high.position), (time - low.time) / (high.time - low.time));
  }
  function regionNames(bone) {
    // Stop before a shared pelvis/shoulder ancestor can admit an unrelated limb.
    if (bone.endsWith('Foot')) return [bone, bone.replace('Foot', 'Leg')];
    if (bone.endsWith('Hand')) return [bone, bone.replace('Hand', 'ForeArm')];
    if (bone === 'Chest') return ['Chest', 'Spine'];
    return [bone];
  }
  function regionWeight(mesh, vertex, names) {
    const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
    const ids = [indices.getX(vertex), indices.getY(vertex), indices.getZ(vertex), indices.getW(vertex)];
    const amounts = [weights.getX(vertex), weights.getY(vertex), weights.getZ(vertex), weights.getW(vertex)];
    return ids.reduce((sum, id, i) => sum + (names.has(mesh.skeleton.bones[id]?.name) ? amounts[i] : 0), 0);
  }
  function setFromFlat(out, positions, index) { return out.fromArray(positions, index * 3); }
  function nearestResult() { return { distance: Infinity, mesh: '', triangle: -1, point: null }; }
  function consider(result, point, mesh, triangleIndex) {
    triangle.closestPointToPoint(point, closest);
    const distance = closest.distanceTo(point);
    if (distance < result.distance) Object.assign(result, { distance, mesh: mesh.name, triangle: triangleIndex, point: closest.toArray() });
  }
  for (const role of ['field', 'keeper']) {
    const selected = clips.filter(clip => clip.role === role);
    const gltf = await loadNativeGLTF(fileURLToPath(new URL(`../runtime/${selected[0].asset}`, import.meta.url)));
    const actor = gltf.scene, meshes = [], bones = new Map();
    actor.traverse(node => { if (node.isSkinnedMesh) meshes.push(node); if (node.isBone) bones.set(node.name, node); });
    const mixer = new THREE.AnimationMixer(actor);
    for (const info of selected) {
      mixer.stopAllAction();
      const clip = gltf.animations.find(item => item.name === info.id);
      const action = mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce, 1).play();
      action.clampWhenFinished = true;
      for (const event of info.events.filter(cue => ['contact', 'release'].includes(cue.type))) {
        action.paused = false;
        action.time = event.time;
        mixer.update(0);
        actor.updateMatrixWorld(true);
        for (const mesh of meshes) mesh.skeleton.update();
        const contact = new THREE.Vector3().fromArray(event.position), center = pathAt(info.ball.keys, event.time);
        const region = new Set(regionNames(event.bone));
        const surface = nearestResult(), ball = nearestResult(), globalBall = nearestResult();
        let eligibleTriangles = 0, totalTriangles = 0;
        for (const mesh of meshes) {
          const count = mesh.geometry.attributes.position.count, positions = new Float64Array(count * 3), weights = new Float64Array(count);
          for (let i = 0; i < count; i++) {
            mesh.getVertexPosition(i, scratch).applyMatrix4(mesh.matrixWorld).toArray(positions, i * 3);
            weights[i] = regionWeight(mesh, i, region);
          }
          const indices = mesh.geometry.index, length = indices ? indices.count : count;
          for (let offset = 0; offset < length; offset += 3) {
            const ia = indices ? indices.getX(offset) : offset;
            const ib = indices ? indices.getX(offset + 1) : offset + 1;
            const ic = indices ? indices.getX(offset + 2) : offset + 2;
            setFromFlat(a, positions, ia); setFromFlat(b, positions, ib); setFromFlat(c, positions, ic);
            const triangleIndex = offset / 3;
            totalTriangles++;
            consider(globalBall, center, mesh, triangleIndex);
            // A majority-influenced corner or a quarter average includes blend seams
            // without admitting a nearby opposing hand/foot just because it is close.
            if (Math.max(weights[ia], weights[ib], weights[ic]) < .5 && (weights[ia] + weights[ib] + weights[ic]) / 3 < .25) continue;
            eligibleTriangles++;
            consider(surface, contact, mesh, triangleIndex);
            consider(ball, center, mesh, triangleIndex);
          }
        }
        if (!eligibleTriangles || !Number.isFinite(surface.distance + ball.distance)) throw new Error(`No finite effector triangles for ${info.id}/${event.bone}`);
        const fk = new THREE.Vector3().fromArray(event.local).applyMatrix4(bones.get(event.bone).matrixWorld);
        rows.push({ id: info.id, event: event.type, time: event.time, bone: event.bone, region: [...region], contact: contact.toArray(), center: center.toArray(), surface, ball, globalBall, radius: info.ball.radius,
          penetration: info.ball.radius - ball.distance, globalPenetration: info.ball.radius - globalBall.distance, fkError: fk.distanceTo(contact), eligibleTriangles, totalTriangles });
      }
      mixer.uncacheClip(clip);
    }
    mixer.uncacheRoot(actor);
  }
  const finalInputs = await snapshot();
  if (JSON.stringify(inputs) !== JSON.stringify(finalInputs)) throw new Error('Runtime inputs changed during contact audit; discard mixed snapshot');
  return { rows, inputs, inputHash, elapsedSeconds: (performance.now() - started) / 1000 };
}

export async function writeBallContactReport(output = fileURLToPath(new URL('./ball-contact-audit.md', import.meta.url))) {
  const { rows, inputs, inputHash, elapsedSeconds } = await auditBallContacts();
  const runtime = fileURLToPath(new URL('../runtime/', import.meta.url));
  const mm = value => (value * 1000).toFixed(3), fmtPoint = point => point.map(value => value.toFixed(5)).join(', ');
  const worst = [...rows].sort((left, right) => right.penetration - left.penetration)[0];
  const report = [
    '# Native ball / skinned-surface contact diagnostic', '',
    `Measured UTC: ${new Date().toISOString()}. Input SHA-256: \`${inputHash}\`. ${rows.length} contact/release cue rows; elapsed ${elapsedSeconds.toFixed(2)} s.`,
    'Actual local Draco-decoded triangle geometry is skinned by the shipped native AnimationClips at the exact cue seconds. Native poses only: no runtime IK, viewer correction, source evaluator, raster-image approximation or event-position substitution.', '',
    'Effector region uses the named bone plus its same-limb direct parent (Foot + Leg, Hand + ForeArm; Chest + Spine). A triangle qualifies if at least one corner has ≥0.5 combined region skin weight, or its average is ≥0.25. This includes weighted seams and excludes an unrelated nearby limb. All distances are exact closest points on these deformed triangles, not nearest vertices or bone centers. The unfiltered whole-body sphere distance is also reported to reveal other-body intersections.', '',
    'Sphere overlap = ball radius − nearest center-to-surface distance. Positive values mean some sampled surface lies inside the ball; negative values mean a gap to that surface. This is unsigned surface proximity, without a closed-volume inside/outside test. A zero result alone does not establish a plausible contact normal or prove an entire motion collision-free. Duplicate contact/release rows at the same cue intentionally share geometry.', '',
    `Largest effector-region overlap: ${mm(worst.penetration)} mm (${worst.id}, ${worst.event}, ${worst.time.toFixed(4)} s). Cue rows with region overlap above 20 mm: ${rows.filter(row => row.penetration > .02).length}/${rows.length}. This 20 mm count is a review flag, not an acceptance threshold or a physical guarantee.`, '',
    '| Clip | Cue / time (s) | Effector | Event point → region skin (mm) | Ball center → region skin (mm) | Region sphere overlap (mm) | Nearest region mesh / triangle | Whole-body sphere overlap (mm) | Whole-body mesh / triangle | Region / all triangles |',
    '| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- | ---: |',
    ...rows.map(row => `| ${row.id} | ${row.event} / ${row.time.toFixed(4)} | ${row.bone} | ${mm(row.surface.distance)} | ${mm(row.ball.distance)} | ${mm(row.penetration)} | ${row.ball.mesh}/${row.ball.triangle} | ${mm(row.globalPenetration)} | ${row.globalBall.mesh}/${row.globalBall.triangle} | ${row.eligibleTriangles}/${row.totalTriangles} |`), '',
    'Coordinates below permit inspection of the exact cue and nearest points. Every native FK/event-position residual measured here is below ' + mm(Math.max(...rows.map(row => row.fkError))) + ' mm.', '',
    '| Clip / cue / seconds | Authored point / ball center [m] | Region skin nearest event point [m] / mesh / triangle | Region skin nearest ball center [m] | Whole-body skin nearest ball center [m] |', '| --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row.id} / ${row.event} / ${row.time.toFixed(4)} | [${fmtPoint(row.contact)}] / [${fmtPoint(row.center)}] | [${fmtPoint(row.surface.point)}] / ${row.surface.mesh}/${row.surface.triangle} | [${fmtPoint(row.ball.point)}] | [${fmtPoint(row.globalBall.point)}] |`), '',
    'Input files are hashed before and after the measurement; any mutation aborts the report.', '', '| Runtime file / audit helper | SHA-256 |', '| --- | --- |',
    ...inputs.map(file => `| ${file.path.startsWith(runtime) ? file.path.slice(runtime.length) : file.path.split('/').slice(-2).join('/')} | \`${file.hash}\` |`), ''
  ].join('\n');
  await fs.writeFile(output, report);
  console.log(`Written ${output}; ${rows.length} cues, worst region overlap ${mm(worst.penetration)} mm (${worst.id}/${worst.event}).`);
  return { rows, inputs, inputHash };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await writeBallContactReport(process.argv[2]);
