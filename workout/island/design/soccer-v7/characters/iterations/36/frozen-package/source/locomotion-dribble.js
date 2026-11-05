/** Native late-swing dribble detail layered onto the physical foot planner.
 * This helper never owns phase, roots, support anchors or request state.
 */
export function createDribbleFootStyle(THREE,skeleton,runClip,dribbleClip,sample,bootBounds){
  const sides=['LeftFoot','RightFoot'],count=240,rows={LeftFoot:[],RightFoot:[]};
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  function feet(clip,phase){
    const pose=sample(clip,phase*clip.duration),world={};
    for(const bone of skeleton.bones){const p=new THREE.Vector3().fromArray(bone.restTranslationMeters),q=new THREE.Quaternion().fromArray(pose.rotations[bone.name]).normalize();if(bone.name==='Hips')p.add(new THREE.Vector3().fromArray(pose.hipsOffsetMeters));if(bone.parent){p.applyQuaternion(world[bone.parent].q).add(world[bone.parent].p);q.premultiply(world[bone.parent].q);}world[bone.name]={p,q};}
    return Object.fromEntries(sides.map(name=>{const f=world[name];return[name,{position:f.p.clone().add(new THREE.Vector3(0,-.08,0).applyQuaternion(f.q)),orientation:f.q}];}));
  }
  for(let i=0;i<=count;i++){
    const phase=i/count,a=feet(runClip,phase),b=feet(dribbleClip,phase);
    for(const name of sides){const delta=b[name].position.clone().sub(a[name].position);if(delta.length()>.08)throw Error('Unexpected native dribble delta');rows[name].push({position:delta.toArray(),orientation:a[name].orientation.clone().invert().multiply(b[name].orientation).normalize().toArray()});}
  }
  function at(name,unwrappedPhase){const p=((unwrappedPhase%1)+1)%1,index=p*count,a=Math.floor(index),b=Math.min(count,a+1),w=index-a;return{position:new THREE.Vector3().fromArray(rows[name][a].position).lerp(new THREE.Vector3().fromArray(rows[name][b].position),w),orientation:new THREE.Quaternion().fromArray(rows[name][a].orientation).slerp(new THREE.Quaternion().fromArray(rows[name][b].orientation),w)};}
  function minimum(name,target,orientation){
    const points=bootBounds?.feet?.[name]?.vertices;if(!points?.length)throw Error('Dribble detail requires the bound exact boot hull');
    const {x,y,z,w}=orientation,r0=2*(x*y+z*w),r1=1-2*(x*x+z*z),r2=2*(y*z-x*w),ankleY=target.y+r1*.08;let min=Infinity;
    for(const p of points)min=Math.min(min,ankleY+r0*p[0]+r1*p[1]+r2*p[2]);
    return min-(bootBounds.paddingMeters||0);
  }
  function apply({name,unwrappedPhase,mode,target,orientation,heading,styleWeight,speed}){
    const native=at(name,unwrappedPhase),before=target.clone(),beforeOrientation=orientation.clone(),clearance=minimum(name,target,orientation);
    // Native detail is for run2 speed. Suppress it during distant sprint/idle
    // handoffs, and finish horizontal detail before the near-ground interval.
    const speedWeight=smooth(1-Math.abs(speed-runClip.speedMps)/1.6),clearanceWeight=smooth((clearance-.015)/.040),weight=mode==='flight'?Math.max(0,Math.min(1,styleWeight))*speedWeight*clearanceWeight:0;
    const delta=native.position.clone().multiplyScalar(weight).applyAxisAngle(new THREE.Vector3(0,1,0),heading);
    target.add(delta);orientation.multiply(new THREE.Quaternion().slerp(native.orientation,weight)).normalize();
    const styledMinimum=minimum(name,target,orientation),floorCorrection=Math.max(0,Math.min(.001,clearance)-styledMinimum);if(weight>0)target.y+=floorCorrection;
    return{side:name,mode,phase:((unwrappedPhase%1)+1)%1,nativeDelta:native.position.toArray(),nativeOrientation:native.orientation.toArray(),weight,speedWeight,clearanceWeight,minimumBefore:clearance,minimumAfter:minimum(name,target,orientation),floorCorrection,appliedDelta:target.clone().sub(before).toArray(),appliedOrientationRadians:beforeOrientation.angleTo(orientation)};
  }
  return{at,minimum,apply,source:{runClip:runClip.id,dribbleClip:dribbleClip.id,samplesPerCycle:count,nativeMaximumPositionDeltaMeters:Math.max(...sides.flatMap(name=>rows[name].map(row=>Math.hypot(...row.position))))}};
}
