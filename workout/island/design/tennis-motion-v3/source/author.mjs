// SPDX-License-Identifier: CC0-1.0
import * as THREE from '../../tennis-motion-v2/vendor/three.module.js';
import {ATTACH, LEFT_ATTACH, HANDLE_CENTER, HEAD_LOCAL, GRIP_Y, curve, racketFrame} from '../../tennis-motion-v2/source/author.mjs';
import {add, clamp, dot, euler, fk, mix, mul, pose, qi, qm, rotate, slerp, solve, sub, unit} from '../../tennis-motion-v2/source/rig.mjs';

export const RATE = 30;
const radius = .0335;
const gravity = 9.81;
const ready = {
  hips: [0, .735, 0],
  rightHand: [-.145, 1.035, .29], leftHand: [.23, 1.015, .22],
  leftFoot: [.18, .08, .035], rightFoot: [-.18, .08, -.035],
  shaft: [-.12, .98, .15], normal: [0, 0, 1],
  yaw: 0, hipYaw: 0, twist: 0, lean: 6, roll: 0, head: 0, headYaw: 0,
  rightElbow: [-1, -.48, -.30], leftElbow: [1, -.48, -.30],
  leftFootPitch: 0, rightFootPitch: 0, leftFootYaw: 0, rightFootYaw: 0,
  leftOpen: 1, leftHandAngles: [-25, 0, -12],
};
const square = value => value * value;
const preparation = new WeakMap();

function prepare(definition) {
  if (preparation.has(definition)) return preparation.get(definition);
  const tracks = {};
  for (const [frame, values] of definition.keys) {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) continue;
      (tracks[name] ??= []).push([frame, value]);
    }
  }
  for (const [name, keys] of Object.entries(tracks)) {
    if (keys.some(([frame], index) => index && frame <= keys[index - 1][0])) {
      throw new Error(`${definition.id}: unordered ${name} keys`);
    }
  }
  preparation.set(definition, tracks);
  return tracks;
}

// Constrain the hand relative to its solved forearm. The rigid racket mount
// remains unchanged, including through overheads and floor transitions.
function wristFrame(racket, forearm) {
  const shaft = new THREE.Vector3(...rotate(racket, [0, 1, 0]));
  const along = new THREE.Vector3(...forearm);
  const angle = shaft.angleTo(along) * 180 / Math.PI;
  let desired = racket;
  if (angle > 116) {
    const turn = new THREE.Quaternion().setFromUnitVectors(shaft, along);
    turn.slerp(new THREE.Quaternion(), 116 / angle);
    desired = new THREE.Quaternion(...racket).premultiply(turn).toArray();
  }
  const wristAngle = q => Math.acos(clamp(dot(forearm, rotate(qm(q, qi(ATTACH)), [0, -1, 0])), -1, 1)) * 180 / Math.PI;
  if (wristAngle(desired) <= 58) return desired;

  const y = new THREE.Vector3(...rotate(desired, [0, 1, 0]));
  const x = along.clone().addScaledVector(y, -along.dot(y));
  if (x.lengthSq() < 1e-6) return desired;
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  const natural = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).toArray();
  const limit = Math.max(58, wristAngle(natural) + .25);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (wristAngle(slerp(desired, natural, mid)) > limit) lo = mid;
    else hi = mid;
  }
  return slerp(desired, natural, hi);
}

export function sample(definition, time) {
  const frame = clamp(time * RATE, 0, definition.durationFrames);
  const controls = {...ready};
  for (const [name, keys] of Object.entries(prepare(definition))) controls[name] = curve(keys, frame);
  const racket = racketFrame(controls.shaft, controls.normal);
  controls.rightHandAim = qm(racket, qi(ATTACH));
  controls.leftHandAim = euler(...controls.leftHandAngles);
  if (controls.leftPalmDown !== undefined) controls.leftHandAim = slerp(controls.leftHandAim, euler(-90, 0, 0), controls.leftPalmDown);

  const result = pose(controls);
  const world = fk(result);
  const forearm = unit(sub(world.RightHand.position, world.RightForeArm.position));
  const racketRotation = wristFrame(racket, forearm);
  const handRotation = qm(racketRotation, qi(ATTACH));
  result.rotations.RightHand = qm(qi(world.RightForeArm.rotation), handRotation);
  const leftOpen = clamp(controls.leftOpen);
  if (leftOpen < 1) {
    const gripRotation = qm(racketRotation, qi(LEFT_ATTACH));
    const handle = add(world.RightHand.position, rotate(handRotation, HANDLE_CENTER));
    const upperHandle = add(handle, rotate(racketRotation, [0, .153 - GRIP_Y, 0]));
    const supportHand = sub(upperHandle, rotate(gripRotation, HANDLE_CENTER));
    solve(result, 'LeftArm', 'LeftForeArm', 'LeftHand',
      mix(supportHand, controls.leftHand, leftOpen), controls.leftElbow,
      slerp(gripRotation, controls.leftHandAim, leftOpen));
  }
  return {...result, time, leftOpen: clamp(controls.handOpenness ?? leftOpen), racketRotation};
}

function arc(point, velocity, t) {
  return add(add(point, mul(velocity, t)), [0, -.5 * gravity * square(t), 0]);
}

function velocityBetween(from, to, elapsed) {
  return mul(add(sub(to, from), [0, .5 * gravity * square(elapsed), 0]), 1 / elapsed);
}

// Follow free flight and damped court rebounds. Values are sampled on the
// native timeline; Ball uses linear interpolation across the collision keys.
function flight(position, velocity, time, reverse = false) {
  let point = position;
  let direction = velocity;
  let elapsed = time;
  const vertical = reverse ? 1 / .73 : .62;
  const planar = reverse ? 1 / .87 : .78;
  for (let bounce = 0; bounce < 5; bounce++) {
    const impact = (direction[1] + Math.sqrt(square(direction[1]) + 2 * gravity * Math.max(0, point[1] - radius))) / gravity;
    if (elapsed <= impact) return arc(point, direction, elapsed);
    point = arc(point, direction, impact);
    point[1] = radius;
    const lifted = (gravity * impact - direction[1]) * vertical;
    elapsed -= impact;
    if (lifted < .3) break;
    direction = [direction[0] * planar, lifted, direction[2] * planar];
  }
  return point;
}

function ballPath(definition, frames, events) {
  if (!definition.ball) return () => ({ball: [0, radius, 0], ballScale: 0});
  const contact = events.find(event => event.type === 'contact');
  if (!contact) throw new Error(`${definition.id}: ball has no contact event`);
  contact.bone = 'RightHand';
  contact.local = HEAD_LOCAL;
  const hit = frames[contact.frame];
  const hand = fk(hit).RightHand;
  const strings = add(hand.position, rotate(hand.rotation, HEAD_LOCAL));
  const {incoming, outgoing, toss} = definition.ball;
  const face = rotate(hit.racketRotation, [0, 0, 1]);
  const sign = dot(outgoing, face) >= 0 ? 1 : -1;
  const center = add(strings, mul(face, sign * radius));
  contact.position = strings;
  const bounce = events.find(event => event.type === 'bounce');
  const release = events.find(event => event.type === 'release');
  let incomingPath;
  if (toss && release) {
    const palmBall = frame => {
      const palm = fk(frame).LeftHand;
      return add(palm.position, rotate(palm.rotation, [0, -.075, .027]));
    };
    const start = palmBall(frames[release.frame]);
    release.bone = 'LeftHand';
    release.local = [0, -.075, .027 - radius];
    release.position = start;
    const velocity = velocityBetween(start, center, contact.time - release.time);
    incomingPath = frame => frame.time <= release.time ? palmBall(frame) : arc(start, velocity, frame.time - release.time);
  } else if (bounce) {
    const elapsed = contact.time - bounce.time;
    const point = [center[0] - incoming[0] * elapsed, radius, center[2] - incoming[2] * elapsed];
    bounce.position = point;
    const rebound = velocityBetween(point, center, elapsed);
    const impact = [rebound[0] / .87, -rebound[1] / .73, rebound[2] / .87];
    incomingPath = frame => frame.time >= bounce.time
      ? arc(point, rebound, frame.time - bounce.time)
      : flight(point, mul(impact, -1), bounce.time - frame.time, true);
  } else {
    incomingPath = frame => flight(center, mul(incoming, -1), contact.time - frame.time, true);
  }
  return frame => {
    const position = frame.time < contact.time ? incomingPath(frame) : flight(center, outgoing, frame.time - contact.time);
    position[1] = Math.max(radius, position[1]);
    return {ball: position, ballScale: 1};
  };
}

export function author(definition) {
  const duration = definition.durationFrames / RATE;
  const frames = Array.from({length: definition.durationFrames + 1}, (_, index) => sample(definition, index / RATE));
  const events = definition.events.map(event => ({...event, time: event.frame / RATE}));
  const supports = definition.supports.map(({bone, startFrame, endFrame, local = [0, -.08, 0]}) => ({
    bone, startFrame, endFrame, start: startFrame / RATE, end: endFrame / RATE, local,
  }));
  const groundContacts = (definition.groundContacts ?? []).map(window => ({
    ...window, start: window.startFrame / RATE, end: window.endFrame / RATE,
  }));
  const getBall = ballPath(definition, frames, events);
  for (const frame of frames) Object.assign(frame, getBall(frame));

  const {id, label, category, description, related, distinction, partner, continuityReferences, locomotion} = definition;
  const contact = events.find(event => event.type === 'contact');
  const release = events.find(event => event.type === 'release' && event.bone);
  const ball = Boolean(definition.ball);
  const metadata = {
    label, loop: false, role: 'tennis', floorY: 0, soleLocal: [0, -.08, 0],
    checkHingeDirection: true, locomotion: locomotion ?? ['lateral_crossover_run', 'change_direction'].includes(id),
    ballVisible: ball, ballContactExpected: Boolean(contact), ball: {radius},
    events, supports, groundContacts, symmetryMode: 'structural', continuityReferences,
    ...(release && {ballContacts: [{bone: release.bone, local: release.local, start: 0, end: release.time}]}),
    coordinateSpace: 'clip space; Hips carries authored translation and Root remains fixed',
  };
  return {
    frames,
    clip: {
      id, label, category, description, related, distinction, partner,
      duration, durationSeconds: duration, frameCount: frames.length, loop: false,
      nativeRate: RATE, rootMotion: false, ball, contactTime: contact?.time ?? null,
      events, supports, sheet: `sheets/${id}.webp`, metadata,
    },
  };
}
