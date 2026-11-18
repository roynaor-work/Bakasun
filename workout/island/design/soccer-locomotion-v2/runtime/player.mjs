/**
 * Original locomotion playback helpers. SPDX-License-Identifier: CC0-1.0.
 * Reuses soccer-header-v1's CC0 canonical sampler and normalized Hermite bridge.
 * Poses use absolute local Hips positions, metres, seconds and xyzw quaternions.
 *
 * The actor's world position and heading, including referenceTravel turn yaw,
 * belong to the simulation. Both bridge endpoints must be in the same current
 * actor-local frame. Root stays at the origin with an identity rotation.
 * A bridge preserves pose and its first derivative; it does not dispatch clip
 * events or promise planted-foot locking while the actor moves in the world.
 */
import {
  makeBridge, sampleMotion, poseVelocity,
} from '../../soccer-header-v1/runtime/player.mjs';

export {
  slerp, sampleMotion, poseVelocity, bridge, makeBridge,
} from '../../soccer-header-v1/runtime/player.mjs';

/**
 * Bridge from the displayed phase of one native clip to a chosen target phase.
 * Target playback holds at toTime during the bridge, then resumes from toTime.
 * Supply the displayed pose AND velocity when the source is already blended.
 */
export function makeClipBridge({
  fromMotion, toMotion, fromTime = 0, toTime = 0, duration = .4,
  displayedPose, displayedVelocity,
}) {
  if (!fromMotion || !toMotion) throw new Error('A clip bridge needs source and target motions.');
  if (displayedPose && !displayedVelocity) throw new Error('An already displayed pose needs its displayed velocity.');
  return makeBridge({
    from: displayedPose ? () => displayedPose : t => sampleMotion(fromMotion, t),
    to: t => sampleMotion(toMotion, t),
    fromTime, toTime, duration, fromVelocity: displayedVelocity,
  });
}

/**
 * Interrupt an existing helper bridge without resetting its pose or velocity.
 * The destination phase remains frozen until the new bridge has completed.
 * Heading/translation and support contacts continue to be simulation-owned.
 */
export function interruptBridge({ active, elapsed, toMotion, toTime = 0, duration = .4 }) {
  if (!active || typeof active.sample !== 'function') throw new Error('An interruption needs an active bridge.');
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > active.duration) throw new Error('Interrupt while the active bridge is playing.');
  if (!toMotion) throw new Error('An interruption needs a target motion.');
  return makeBridge({
    from: active.sample,
    fromTime: elapsed,
    fromVelocity: poseVelocity(active.sample, elapsed, { side: 'left' }),
    to: t => sampleMotion(toMotion, t),
    toTime, duration,
  });
}
