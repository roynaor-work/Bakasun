import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClip, sampleClip } from '../runtime/library.mjs';

const direct = ['pass_chest', 'pass_overhead', 'pass_side', 'pass_jump'];
for (const id of [...direct, 'pass_bounce']) test(`${id}: the hand-matched pass reaches receiver waist/chest height`, async () => {
  const { data } = await loadClip(id);
  const release = data.events.find(event => event.name === 'release');
  assert.ok(release, 'Every pass needs an explicit release');
  const start = sampleClip(data, release.atSeconds).ballPositionMeters;
  const end = sampleClip(data, data.durationSeconds).ballPositionMeters;
  const travel = Math.hypot(end[0] - start[0], end[2] - start[2]);
  assert.ok(travel >= 2 && travel <= 6, `Reference range ${travel} m`);
  const minimum = id === 'pass_bounce' ? .95 : 1.0;
  assert.ok(end[1] >= minimum && end[1] <= 1.3, `Receiver height ${end[1]} m`);
  assert.deepEqual(data.ball.flightReference.targetAtClipEndMeters, data.keyframes.at(-1).ballPositionMeters);
  assert.equal(data.ball.flightReference.gravityMetersPerSecondSquared, 9.81);
  if (id === 'pass_bounce') {
    assert.ok(data.ball.flightReference.restitution >= .8 && data.ball.flightReference.restitution <= .92);
    assert.equal(data.events.filter(event => event.name === 'bounce').length, 1);
  }
});

test('direct passes follow a gravity arc after release, without easing away from the launch velocity', async () => {
  for (const id of direct) {
    const { data } = await loadClip(id);
    const release = data.events.find(event => event.name === 'release');
    const origin = sampleClip(data, release.atSeconds).ballPositionMeters;
    const frames = data.keyframes.filter(frame => frame.time * data.durationSeconds > release.atSeconds + .0001);
    const first = frames[0], firstTime = first.time * data.durationSeconds - release.atSeconds;
    const velocity = first.ballPositionMeters.map((position, axis) => (position - origin[axis] + (axis === 1 ? 4.905 * firstTime ** 2 : 0)) / firstTime);
    for (const frame of frames) {
      const t = frame.time * data.durationSeconds - release.atSeconds;
      const predicted = origin.map((position, axis) => position + velocity[axis] * t - (axis === 1 ? 4.905 * t ** 2 : 0));
      const error = Math.hypot(...frame.ballPositionMeters.map((position, axis) => position - predicted[axis]));
      assert.ok(error < .002, `${id}: gravity-arc error ${error} m at ${t}s`);
    }
  }
});
