import assert from 'node:assert/strict';
import * as T from '../../../vendor/three.module.js';
import {carvePose,travelYaw} from '../../../minigames/alpine-steer.mjs';
// Actual scene basis: alpine-view.mjs:91/93 gives downhill -Z on a straight;
// alpine-character.mjs:509/510 rotates the delivered +Z-facing skier by PI.
const rows=[];
for(const speed of [20,11]){
 const lean=1,tilt=1,lateralSpeed=8.5,vx=lean*lateralSpeed,velocity=new T.Vector3(vx,0,-speed).normalize();
 const actualForward=yaw=>new T.Vector3(0,0,1).applyEuler(new T.Euler(0,Math.PI,0)).applyEuler(new T.Euler(0,yaw,0));
 const oldYaw=carvePose(tilt,speed*3.6/90).yaw,newYaw=travelYaw(tilt,{lean},speed,lateralSpeed);
 const oldForward=actualForward(oldYaw),newForward=actualForward(newYaw),oldGap=oldForward.angleTo(velocity)*180/Math.PI,newGap=newForward.angleTo(velocity)*180/Math.PI;
 assert.ok(newForward.x<0&&velocity.x>0,'v24.1 points left while travelling right');
 assert.ok(newGap>oldGap,'v24.1 widens the world-space heading error');
 const corrected=actualForward(-newYaw);assert.ok(corrected.angleTo(velocity)<1e-6);
 rows.push({speed,vx,oldYaw,newYaw,velocity:velocity.toArray(),v241Forward:newForward.toArray(),oldGapDeg:oldGap,newGapDeg:newGap,negatedYawGapDeg:corrected.angleTo(velocity)*180/Math.PI});
}
console.log(JSON.stringify({finding:'v241_yaw_turns_against_world_velocity',rows},null,2));
