import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { EXERCISES } from '../../../js/exercises.js';
import { previous } from './motion.mjs';
import { cycleMs } from '../../../js/figure.js';
import { MAX_BYTES, renderExercise, samplePose, samplesFor, selectExercises } from './motion.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const selected = selectExercises();
assert.equal(selected.length, 38);
assert.equal(new Set(selected.map(s => s.exercise.id)).size, 38);
assert.deepEqual(manifest.exercises.map(e => e.id), selected.map(s => s.exercise.id));
assert.equal(EXERCISES.length, 50);
assert.equal(new Set([...previous.exercises, ...manifest.exercises].map(e => e.id)).size, 50);
assert.deepEqual([...previous.exercises, ...manifest.exercises].map(e => e.id).sort(), EXERCISES.map(e => e.id).sort());
assert.ok(!manifest.exercises.some(e => previous.exercises.some(p => p.id === e.id)));
assert.equal(manifest.exercises.filter(e => e.batch === 1).length, 19);
assert.equal(manifest.exercises.filter(e => e.batch === 2).length, 19);
const results = [];
for (const [index, { exercise, batch }] of selected.entries()) {
  const item = manifest.exercises[index];
  const svg = await readFile(new URL(item.src, root), 'utf8');
  const poster = await readFile(new URL(item.poster, root), 'utf8');
  assert.equal(svg, renderExercise(exercise), `${item.id}: generated SVG is current`);
  assert.equal(poster, renderExercise(exercise, { animated: false }), `${item.id}: poster is current`);
  assert.equal(Buffer.byteLength(svg), item.bytes);
  assert.ok(item.bytes <= MAX_BYTES, `${item.id}: uncompressed size`);
  assert.equal(item.batch, batch);
  assert.ok(!/<(?:script|image|foreignObject|text)\b|\bon\w+=|(?:https?:\/\/|data:)(?!www\.w3\.org)/i.test(svg), `${item.id}: no executable or external content`);
  assert.ok(!/\b(?:NaN|Infinity)\b/.test(svg));
  assert.ok(!/<animate/.test(poster), `${item.id}: reduced-motion poster is static`);
  const { poses, segments, duration } = samplesFor(exercise);
  assert.deepEqual(poses[0], poses.at(-1), `${item.id}: exact closing pose`);
  for (const pose of poses) for (const foot of ['lf', 'rf']) assert.ok(pose[foot][1] <= 182, `${item.id}: no floor penetration`);
  const animations = [...svg.matchAll(/<(?:animate|animateTransform)\b([^>]+)\/>/g)];
  assert.ok(animations.length > 10);
  for (const [, attributes] of animations) {
    const values = attributes.match(/values="([^"]+)"/)[1].split(';');
    assert.equal(values.length, segments + 1, `${item.id}: synchronized sample counts`);
    if (attributes.includes('type="rotate"')) {
      const turns = (Number(values.at(-1)) - Number(values[0])) / 360;
      assert.ok(Math.abs(turns - Math.round(turns)) < .00001, `${item.id}: rotation closes modulo a full turn`);
    } else assert.equal(values[0], values.at(-1), `${item.id}: closed animated attribute`);
    assert.ok(attributes.includes(`dur="${duration}ms"`), `${item.id}: synchronized native duration`);
    assert.ok(!attributes.includes('type="matrix"'), 'animateTransform only supports native SVG transform types');
  }
  // Check the actual time curve, including all keyframe boundaries and the seam.
  let boundary = 0, maxVelocityError = 0;
  for (const [, milliseconds] of exercise.frames) {
    const epsilon = .001;
    const before = samplePose(exercise.frames, boundary - epsilon);
    const at = samplePose(exercise.frames, boundary);
    const after = samplePose(exercise.frames, boundary + epsilon);
    for (const joint of Object.keys(at).filter(key => Array.isArray(at[key]))) {
      for (let axis = 0; axis < 2; axis++) {
        const error = Math.abs((at[joint][axis] - before[joint][axis]) / epsilon - (after[joint][axis] - at[joint][axis]) / epsilon);
        maxVelocityError = Math.max(maxVelocityError, error);
      }
    }
    boundary += milliseconds;
  }
  assert.ok(maxVelocityError < .0001, `${item.id}: C1 motion continuity (${maxVelocityError})`);
  assert.equal(boundary, cycleMs(exercise.frames));
  results.push({ id: item.id, bytes: item.bytes, animations: animations.length, segments, exactLoop: true, maxVelocityError });
}
const report = { checks: ['38 remaining catalog exercises; exact disjoint union with PR 244', '60,000-byte raw limit', 'reproducible generated files', 'no scripts or external resources', 'static reduced-motion posters', 'exact attribute closure (rotation modulo full turns)', 'shared durations and sampling', 'C1 keyframe and seam velocities', 'interpolated soles stay above floor'], exercises: results };
await writeFile(new URL('verification/integrity.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(`PASS: ${results.length} loops, ${results.reduce((sum, r) => sum + r.animations, 0)} animated attributes; largest ${Math.max(...results.map(r => r.bytes))} / ${MAX_BYTES} bytes.`);
