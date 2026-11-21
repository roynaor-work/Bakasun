import test from 'node:test';
import assert from 'node:assert/strict';
import { twoSideHolds } from '../fixtures/strength.mjs';
import { catalog, clips, clipById, jumpNearMisses, matches, policies, replay, variants } from './replay.mjs';

test('every catalog ID has its own movement policy and annotated synthetic clip', () => {
  assert.equal(catalog.length, 50);
  const ids = catalog.map(ex => ex.id).sort();
  assert.deepEqual(clips.map(spec => spec.id).sort(), ids);
  assert.deepEqual(Object.keys(policies).sort(), ids);
  for (const exercise of catalog) {
    const label = clipById[exercise.id].expected;
    assert.ok(exercise.type === 'reps' ? label.count > 0 : label.activeMs?.[0] > 0, exercise.id);
  }
});

for (const spec of clips) {
  test(`${spec.id} at the expected projected view`, () => {
    const output = replay(spec);
    assert.ok(matches(output, spec.expected), JSON.stringify({ expected: spec.expected, output }));
  });
  test(`${spec.id} grants no progress for its distractor`, () => {
    const output = replay(spec, variants.wrong);
    assert.equal(output.count, 0, JSON.stringify(output));
    assert.equal(output.activeMs, 0, JSON.stringify(output));
  });
}

for (const spec of jumpNearMisses) {
  test(`${spec.id} rejects ${spec.tags[0]}`, () => {
    const output = replay(spec);
    assert.ok(matches(output, spec.expected), JSON.stringify({ expected: spec.expected, output }));
  });
}

for (const id of ['jumping-jacks', 'push-ups', 'plank']) {
  for (const [name, code] of [['dark', 'dark'], ['backlit', 'backlit'], ['multiple', 'multiple'], ['multipleSwap', 'multiple'], ['absent', 'missing']]) {
    test(`${id} waits through ${name} even when the movement would qualify`, () => {
      const output = replay(clipById[id], variants[name]);
      assert.equal(output.count, 0, JSON.stringify(output));
      assert.equal(output.activeMs, 0, JSON.stringify(output));
      assert.ok(output.trackingStatuses[code] > 0, JSON.stringify(output.trackingStatuses));
    });
  }
}

test('scale, crop aspect and low-amplitude noise preserve selected rep and time readings', () => {
  for (const id of ['jumping-jacks', 'squats', 'push-ups', 'glute-bridge', 'plank']) {
    for (const options of [variants.portrait, variants.landscape]) {
      const spec = clipById[id];
      assert.ok(matches(replay(spec, options), spec.expected), id);
    }
  }
});

test('the running movement cannot satisfy a reaction sprint before the cue', () => {
  const output = replay(clipById['reaction-sprint'], { noSignal: true });
  assert.equal(output.count, 0, JSON.stringify(output));
});

test('tracking loss during the first squat cannot bridge its descent and return', () => {
  const spec = clipById.squats;
  const restart = { ...spec, phases: spec.phases.map((phase, i) => i === 1
    ? [spec.rest, 1250, phase[2]]
    : phase) };
  const output = replay(restart, {
    disturbances: ({ active, movementMs }) => active && movementMs >= 650 && movementMs < 1200
      ? { absent: true }
      : {},
  });
  assert.ok(output.trackingStatuses.missing > 0);
  assert.equal(output.count, 1, JSON.stringify(output));
});

test('calibration offers a demonstration and asks to reframe a close or cropped subject', () => {
  const spec = clipById['jumping-jacks'];
  assert.ok(replay(spec).hints.demo > 0);
  const tooClose = replay(spec, { scale: 1.65 });
  assert.ok(tooClose.hints['move-back'] > 0, JSON.stringify(tooClose.hints));
  const tooHigh = replay(spec, { dy: -.185 });
  assert.ok(tooHigh.hints['raise-phone'] > 0, JSON.stringify(tooHigh.hints));
});

test('push-up feedback points to the hips and gives a body-position adjustment', () => {
  const output = replay(clipById['push-ups'], variants.wrong);
  assert.equal(output.count, 0);
  assert.ok(Object.keys(output.hints).some(hint => hint.includes('אגן') && hint.includes('כתפיים')), JSON.stringify(output.hints));
});

test('only half the target can be earned on either side of a two-sided hold', () => {
  for (const spec of twoSideHolds) {
    const output = replay(spec, { goal: 6 });
    assert.equal(output.activeMs, 6000, JSON.stringify({ id: spec.id, output }));
    assert.deepEqual(output.sideMs, [3000, 3000], spec.id);
  }
});
