/** SPDX-License-Identifier: CC0-1.0
 * Canonical basketball playback. All poses use absolute local Hips, metres,
 * seconds, xyzw unit quaternions. External actor travel/heading is simulation-owned.
 * The established canonical C1 bridge preserves both endpoint poses and velocities.
 * Reuses the existing CC0 soccer-header-v1 implementation without editing it.
 */
import {makeBridge,sampleMotion,poseVelocity} from '../../soccer-header-v1/runtime/player.mjs';
export {slerp,sampleMotion,poseVelocity,bridge,makeBridge} from '../../soccer-header-v1/runtime/player.mjs';

export function makeClipBridge({fromMotion,toMotion,fromTime=0,toTime=0,duration=.4,displayedPose,displayedVelocity}) {
  if(!fromMotion||!toMotion)throw Error('A bridge needs two motions.');
  if(displayedPose&&!displayedVelocity)throw Error('Supply displayed velocity when interrupting a blended pose.');
  return makeBridge({from:displayedPose?()=>displayedPose:t=>sampleMotion(fromMotion,t),to:t=>sampleMotion(toMotion,t),fromTime,toTime,duration,fromVelocity:displayedVelocity});
}
export function interruptBridge({active,elapsed,toMotion,toTime=0,duration=.4}) {
  if(!active?.sample||!Number.isFinite(elapsed)||elapsed<0||elapsed>active.duration)throw Error('Interrupt an active bridge at its displayed elapsed time.');
  return makeBridge({from:active.sample,fromTime:elapsed,fromVelocity:poseVelocity(active.sample,elapsed,{side:'left'}),to:t=>sampleMotion(toMotion,t),toTime,duration});
}

/** Half-open event dispatch. Keep an absolute cycle clock for loops; querying
 * the same endpoint twice cannot duplicate a release or bounce event. Bridges
 * do not advance the target clock, so they never fire action events early.
 */
export function eventsBetween(motion,previous,current) {
  if(!Number.isFinite(previous)||!Number.isFinite(current)||current<previous)throw Error('Expected an increasing playback clock.');
  const duration=motion.durationSeconds??motion.duration;
  const result=[],first=motion.loop?Math.max(0,Math.floor(previous/duration)):0,last=motion.loop?Math.floor(current/duration):0;
  for(let cycle=first;cycle<=last;cycle++)for(const e of motion.events??[]){
    const local=e.timeSeconds??e.atSeconds??e.time,at=cycle*duration+local;
    if(at>previous&&at<=current&&(!motion.loop||local<duration))result.push({...e,absoluteTime:at,cycle});
  }
  return result.sort((a,b)=>a.absoluteTime-b.absoluteTime);
}
