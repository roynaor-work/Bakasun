// SPDX-License-Identifier: CC0-1.0
import { readFileSync } from 'node:fs';
import { Euler, Quaternion, Vector3 } from '../../../vendor/three.module.js';

export const sampleRateHz = 30;
export const skeleton = JSON.parse(readFileSync(new URL('../../fire-rescue-people-v2/skeleton.json', import.meta.url)));
const footOffset = [0, -.08, 0];
const down = new Vector3(0, -1, 0);
const up = new Vector3(0, 1, 0);
const forward = new Vector3(0, 0, 1);
const toRadians = Math.PI / 180;
const vector = values => new Vector3(...values);
const rotation = angles => new Quaternion().setFromEuler(new Euler(...angles.map(value => value * toRadians), 'XYZ'));
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const ease = value => {
  const x = clamp(value);
  return x * x * x * (10 - x * (15 - 6 * x));
};
const defaultFeet = { L: [.14, .025], R: [-.14, -.035] };
const sides = { L: 'Left', R: 'Right' };
const zero = [0, 0, 0];

// Monotone cubic interpolation preserves each authored extreme and gives holds zero velocity.
function curve(keys) {
  const times = keys.map(([t]) => t);
  const values = keys.map(([, values]) => values);
  const slopes = values.map((value, i) => value.map((v, axis) => {
    if (i === 0 || i === keys.length - 1) return 0;
    const before = times[i] - times[i - 1];
    const after = times[i + 1] - times[i];
    const previousSpeed = (v - values[i - 1][axis]) / before;
    const nextSpeed = (values[i + 1][axis] - v) / after;
    if (previousSpeed * nextSpeed <= 0) return 0;
    const a = 2 * after + before;
    const b = after + 2 * before;
    return (a + b) / (a / previousSpeed + b / nextSpeed);
  }));
  return t => {
    const right = times.findIndex(time => time > t);
    if (right < 0) return values.at(-1);
    if (right === 0) return values[0];
    const left = right - 1;
    const span = times[right] - times[left];
    const u = (t - times[left]) / span;
    const u2 = u * u;
    const u3 = u2 * u;
    return values[left].map((v, axis) => (2 * u3 - 3 * u2 + 1) * v
      + (u3 - 2 * u2 + u) * span * slopes[left][axis]
      + (-2 * u3 + 3 * u2) * values[right][axis]
      + (u3 - u2) * span * slopes[right][axis]);
  };
}

function footTrack(action, side) {
  const [initialX, initialZ] = action.feet?.[side] ?? defaultFeet[side];
  const steps = action.steps?.[side] ?? [];
  const supports = [];
  let plantedSince = 0;
  for (const [start, end] of steps) {
    if (start > plantedSince) supports.push({ bone: sides[side] + 'Foot', start: plantedSince, end: start, local: footOffset });
    plantedSince = end;
  }
  if (action.duration > plantedSince) {
    supports.push({ bone: sides[side] + 'Foot', start: plantedSince, end: action.duration, local: footOffset });
  }
  const at = time => {
    let [x, z] = [initialX, initialZ];
    for (const [start, end, [nextX, nextZ], lift = .075] of steps) {
      if (time <= start) break;
      if (time < end) {
        const progress = (time - start) / (end - start);
        const travel = ease(progress);
        const height = lift * Math.sin(Math.PI * progress) ** 2;
        return [x + (nextX - x) * travel, .08 + height, z + (nextZ - z) * travel];
      }
      [x, z] = [nextX, nextZ];
    }
    return [x, .08, z];
  };
  return { at, supports };
}

function solveHinge(base, target, poleDirection, a, b) {
  const reach = target.clone().sub(base);
  const range = clamp(reach.length(), .09, a + b - .0002);
  const along = reach.normalize();
  const bend = poleDirection.clone().addScaledVector(along, -poleDirection.dot(along)).normalize();
  const mid = (a * a - b * b + range * range) / (2 * range);
  const elbow = base.clone().addScaledVector(along, mid).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - mid * mid)));
  const end = base.clone().addScaledVector(along, range);
  const firstDirection = elbow.clone().sub(base).normalize();
  const secondDirection = end.clone().sub(elbow).normalize();
  const upper = new Quaternion().setFromUnitVectors(down, firstDirection);
  const lower = new Quaternion().setFromUnitVectors(down, secondDirection);
  return { upper, lower, end };
}

export function bake(action) {
  const { duration, keys } = action;
  const lastFrame = Math.round(duration * sampleRateHz);
  if (lastFrame < 45 || lastFrame > 90 || Math.abs(lastFrame / sampleRateHz - duration) > 1e-8
    || keys[0]?.t !== 0 || keys.at(-1)?.t !== duration
    || keys.some(({ t }, i) => i > 0 && t <= keys[i - 1].t)) throw Error('Invalid timeline: ' + action.id);
  const field = (name, fallback) => curve([[0, fallback], ...keys.filter(key => key[name]).map(key => [key.t, key[name]])]
    .filter((entry, index, entries) => entry[0] !== entries[index + 1]?.[0]));
  const rootAt = field('root', zero);
  const hipAt = field('hip', [0, .83, 0]);
  const spineAt = field('spine', zero);
  const chestAt = field('chest', zero);
  const headAt = field('head', zero);
  const feet = { L: footTrack(action, 'L'), R: footTrack(action, 'R') };
  const hands = { L: field('L', [.25, .91, .09]), R: field('R', [-.25, .91, .09]) };
  const wrists = { L: field('wristL', zero), R: field('wristR', zero) };
  const posedWrist = {
    L: keys.some(key => key.wristL),
    R: keys.some(key => key.wristR),
  };
  const propTracks = Object.fromEntries((action.props ?? []).map(({ id }) => [id, []]));
  const propAt = Object.fromEntries(Object.keys(propTracks).map(id => {
    const points = keys.filter(key => key.props?.[id]).map(key => [key.t, key.props[id]]);
    if (points[0]?.[0] !== 0 || points.at(-1)?.[0] !== duration) throw Error('Missing prop endpoints: ' + action.id + '/' + id);
    const width = Math.max(...points.map(([, point]) => point.length));
    return [id, curve(points.map(([t, point]) => [t, Array.from({ length: width }, (_, axis) => point[axis] ?? 0)]))];
  }));
  const grips = action.grips ?? [];
  const maxGripError = Object.create(null);
  const frames = [];
  for (let i = 0; i <= lastFrame; i++) {
    const t = i / sampleRateHz;
    const root = vector(rootAt(t));
    const hip = vector(hipAt(t));
    const q = Object.fromEntries(skeleton.bones.map(({ name }) => [name, new Quaternion()]));
    q.Spine = rotation(spineAt(t));
    q.Chest = rotation(chestAt(t));
    q.Neck = rotation(headAt(t).map(value => value * .42));
    q.Head = rotation(headAt(t).map(value => value * .58));
    const chest = hip.clone().addScaledVector(up, .2).add(vector([0, .18, 0]).applyQuaternion(q.Spine));
    const chestWorld = q.Spine.clone().multiply(q.Chest);
    const propTransforms = Object.fromEntries(Object.entries(propAt).map(([id, at]) => {
      const values = at(t);
      propTracks[id].push(values.map(value => Number(value.toFixed(5))));
      return [id, { position: vector(values.slice(0, 3)), rotation: rotation(values.slice(3, 6)) }];
    }));
    for (const [key, side] of Object.entries(sides)) {
      const sign = key === 'L' ? 1 : -1;
      const foot = vector(feet[key].at(t));
      const leg = solveHinge(hip.clone().add(vector([sign * .1, 0, 0])), foot, forward, .41, .37);
      q[side + 'UpLeg'] = leg.upper;
      q[side + 'Leg'] = leg.upper.clone().invert().multiply(leg.lower);
      q[side + 'Foot'] = leg.lower.clone().invert();
      const shoulder = vector([sign * .16, .06, 0]).applyQuaternion(chestWorld).add(chest);
      const target = vector(hands[key](t));
      const active = grips.find(grip => grip.hand === key && t >= grip.start && t <= grip.end);
      let gripWeight = 0;
      if (active) {
        const { position, rotation } = propTransforms[active.prop];
        const contact = vector(active.offset).applyQuaternion(rotation).add(position);
        const ramp = active.ramp ?? .12;
        gripWeight = ramp > 0 ? ease((t - active.start) / ramp) * ease((active.end - t) / ramp) : 1;
        target.lerp(contact, gripWeight);
      }
      const arm = solveHinge(shoulder, target, vector([sign * .9, -.43, -.41]), .27, .24);
      q[side + 'Arm'] = chestWorld.clone().invert().multiply(arm.upper);
      q[side + 'ForeArm'] = arm.upper.clone().invert().multiply(arm.lower);
      if (posedWrist[key]) q[side + 'Hand'] = arm.lower.clone().invert().multiply(rotation(wrists[key](t)));
      if (active && gripWeight > .999) {
        const id = key + '/' + active.prop;
        maxGripError[id] = Math.max(maxGripError[id] ?? 0, arm.end.distanceTo(target));
      }
    }
    frames.push({
      t,
      root: root.toArray(),
      hips: hip.sub(root).toArray(),
      rotations: skeleton.bones.map(({ name }, index) => {
        const quaternion = q[name].normalize();
        const previous = frames.at(-1)?.rotations[index];
        const components = quaternion.toArray();
        return previous && components.reduce((sum, v, axis) => sum + v * previous[axis], 0) < 0
          ? components.map(v => -v) : components;
      }),
    });
  }
  const attachments = grips.map(({ hand, prop, offset, start, end, ramp = .12 }) => ({
    bone: sides[hand] + 'Hand', prop, space: 'prop-local', offset, start, end, blendSeconds: ramp,
  }));
  const qa = {
    loop: false, locomotion: !!action.steps, checkHingeDirection: true, floorY: 0, soleLocal: footOffset,
    supports: [...feet.L.supports, ...feet.R.supports], ...action.qa,
  };
  return { frames, attachments, qa, propTracks, maxGripError };
}
