// SPDX-License-Identifier: CC0-1.0
/**
 * Reuse the repository's original CC0 canonical-pose sampler and C1 bridge,
 * then project below-floor feet through the canonical two-bone leg solver.
 * Dependency: soccer-header-v1/runtime/player.mjs, retained without changes.
 *
 * sampleMotion accepts {frames:[{time, hips, rotations}]} in canonical metres,
 * seconds and parent-local xyzw rotations. makeBridge snapshots the displayed
 * source pose and velocity and joins a selected destination pose and velocity.
 * Keep the destination phase fixed during the bridge, then resume its playback
 * at bridge.resumeTargetTime. Supply fromVelocity for interrupted blends.
 *
 * Floor projection preserves the displayed world foot orientation and current
 * knee plane. A smooth 10% endpoint ramp has zero value and slope at each end,
 * preserving the original C1 endpoint derivatives. Tiny penetrations acquire
 * the correction smoothly over 1mm. Grounding is measured at 240Hz alongside
 * C0/C1. This is local floor clearance, not actor/world anchor locking; a moving
 * consumer still carries support anchors through its full actor transform.
 * The helper dispatches no events and applies no actor translation.
 */
import {makeBridge as makeHermiteBridge, bridge as hermiteBridge, slerp}
  from './source/hermite.mjs';
import {fk, point, solve, add, sub, smooth}
  from './source/rig.mjs';
export {slerp, sampleMotion, poseVelocity}
  from './source/hermite.mjs';

const sole = [0,-.08,0];
const clonePose = p => ({hips:[...p.hips],rotations:Object.fromEntries(Object.entries(p.rotations).map(([name,q]) => [name,[...q]]))});

/** Return a fresh canonical pose with a smoothly acquired floor projection. */
export function groundPose(pose,time,duration,{floorY=0,rampFraction=.1,activationMeters=.001,clearanceMeters=.0005}={}) {
  if (!(duration>0 && rampFraction>0 && rampFraction<=.5 && activationMeters>0 && clearanceMeters>=0)) throw new Error('Invalid bridge grounding configuration.');
  const u = Math.min(1,Math.max(0,time/duration));
  if (u===0 || u===1) return clonePose(pose);
  const envelope = smooth(u/rampFraction)*smooth((1-u)/rampFraction);
  const result = clonePose(pose);
  for (const side of ['Left','Right']) {
    const bone = side+'Foot', depth = floorY-point(pose,bone,sole)[1];
    if (!(depth>0)) continue;
    const world = fk(pose), upper = side+'UpLeg', lower = side+'Leg';
    const corrected = clonePose(pose);
    // Using the displayed knee as pole retains its actual bend plane. Foot
    // orientation is held in canonical world space while the ankle rises.
    const kneePole = sub(world[lower].position,world[upper].position);
    solve(corrected,upper,lower,bone,add(world[bone].position,[0,depth+clearanceMeters,0]),kneePole,world[bone].rotation);
    const weight = envelope*smooth(depth/activationMeters);
    for (const name of [upper,lower,bone]) result.rotations[name] = slerp(pose.rotations[name],corrected.rotations[name],weight);
  }
  return result;
}

/** Direct C1 interpolation with the same floor projection as makeBridge. */
export function bridge(fromPose,fromVelocity,toPose,toVelocity,time,duration,grounding={}) {
  const pose = hermiteBridge(fromPose,fromVelocity,toPose,toVelocity,time,duration);
  return grounding===false ? pose : groundPose(pose,time,duration,grounding);
}

/** Use grounding:false only to inspect the raw Hermite interpolation. */
export function makeBridge({grounding={},...options}) {
  const raw = makeHermiteBridge(options);
  return {...raw,grounding:grounding===false ? false : {method:'two-bone local floor projection',floorY:0,rampFraction:.1,activationMeters:.001,clearanceMeters:.0005,...grounding},
    sample:time => grounding===false ? raw.sample(time) : groundPose(raw.sample(time),time,raw.duration,grounding)};
}
