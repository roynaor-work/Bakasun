/** Exact circular embedding of the motor's +Z arc coordinate.
 * The inner radius R-x must remain positive. All coordinates are metres.
 * Pure numeric helpers: no Three dependency, Actor references or mutable rig.
 */
export function createLocomotionCurve({origin=[0,0,0],yaw=0,radius=8}={}){
  origin=Array.from(origin);
  if(origin.length!==3||!origin.every(Number.isFinite)||!Number.isFinite(yaw)||!Number.isFinite(radius)||radius<=0)throw Error('Invalid locomotion circle');
  const c=Math.cos(yaw),s=Math.sin(yaw),tau=2*Math.PI;
  const rotate=(v,angle)=>{const c=Math.cos(angle),s=Math.sin(angle);return[c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]];};
  const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const headingAt=distance=>yaw+distance/radius;
  const rootPoint=distance=>mapPoint([0,0,distance]);
  function mapPoint([x,y,z]){
    if(![x,y,z].every(Number.isFinite)||x>=radius)throw Error('Circle point must be finite and x < radius');
    const theta=z/radius,ct=Math.cos(theta),st=Math.sin(theta),X=x*ct+radius*(1-ct),Z=(radius-x)*st;
    return[origin[0]+c*X+s*Z,origin[1]+y,origin[2]-s*X+c*Z];
  }
  function inversePoint(world,nearDistance=0){
    const d=sub(world,origin),X=c*d[0]-s*d[2],Z=s*d[0]+c*d[2],r=Math.hypot(radius-X,Z);
    if(!world.every(Number.isFinite)||!Number.isFinite(nearDistance)||r<1e-12)throw Error('Circle inverse is undefined at its centre');
    let theta=Math.atan2(Z,radius-X);theta+=tau*Math.round((nearDistance/radius-theta)/tau);
    return[radius-r,d[1],radius*theta];
  }
  function mapOrientation(q,z){
    const h=headingAt(z)/2,sh=Math.sin(h),ch=Math.cos(h),[x,y,zq,w]=q;
    return[ch*x+sh*zq,ch*y+sh*w,ch*zq-sh*x,ch*w-sh*y];
  }
  function inverseOrientation(q,z){
    const h=-headingAt(z)/2,sh=Math.sin(h),ch=Math.cos(h),[x,y,zq,w]=q;
    return[ch*x+sh*zq,ch*y+sh*w,ch*zq-sh*x,ch*w-sh*y];
  }
  /** Capture measured world hips in the current root's tangent frame.
   * Call once per rendered physics frame, after the previous exact pose exists.
   * Rebind after LOD/Actor rebuild; motor exports intentionally omit callbacks.
   */
  function geometryFromWorldHips({distance,measuredAt,hips}){
    const measurementRoot=rootPoint(distance),measurementHeading=headingAt(distance);
    const measuredHips=Object.fromEntries(Object.entries(hips).map(([name,p])=>[name,Array.from(p)]));
    const offsets=Object.fromEntries(Object.entries(measuredHips).map(([name,p])=>[name,rotate(sub(p,measurementRoot),-measurementHeading)]));
    const numeric={measuredAt,curve:{kind:'circle',radius,origin:origin.slice(),yaw,measurementDistance:distance,measurementRoot,measurementHeading,measuredHips,hipOffsets:offsets},hips:Object.fromEntries(Object.entries(offsets).map(([name,p])=>[name,{x:p[0],y:measurementRoot[1]+p[1],z:p[2]}]))};
    const predictWorldReach=({name,anchor,rootDistance,futureRootDistance,anticipatedLift,ankleOffset=.08,geometryMeasuredAt=measuredAt})=>{
      const offset=offsets[name];if(!offset)throw Error('Missing measured hip for '+name);
      const root=rootPoint(rootDistance),futureRoot=rootPoint(futureRootDistance),heading=headingAt(rootDistance),futureHeading=headingAt(futureRootDistance);
      const hip=add(root,rotate(offset,heading)),futureHip=add(futureRoot,rotate(offset,futureHeading)),anchorWorld=mapPoint(anchor);
      const ankle=add(anchorWorld,[0,ankleOffset,0]),futureAnkle=add(ankle,[0,anticipatedLift,0]),forward=[Math.sin(heading),0,Math.cos(heading)];
      const rearVector=sub(hip,anchorWorld),rearwardDistance=rearVector.reduce((sum,x,i)=>sum+x*forward[i],0);
      const currentReach=Math.hypot(...sub(hip,ankle)),predictedReach=Math.hypot(...sub(futureHip,futureAnkle));
      return{currentReach,predictedReach,isRearward:rearwardDistance>0,worldPrediction:{kind:'exact-circle-world-reach',radius,origin:origin.slice(),yaw,geometryMeasuredAt,measurementDistance:distance,measurementRoot:measurementRoot.slice(),measurementHeading,measuredHip:measuredHips[name].slice(),hipOffset:offset.slice(),rootDistance,futureRootDistance,rootWorld:root,futureRootWorld:futureRoot,heading,futureHeading,hipWorld:hip,futureHipWorld:futureHip,anchor:anchor.slice(),anchorWorld,ankleWorld:ankle,futureAnkleWorld:futureAnkle,ankleOffset,anticipatedLift,forward,rearwardDistance,currentReach,predictedReach}};
    };
    return{...numeric,predictWorldReach};
  }
  return Object.freeze({kind:'circle',radius,origin:Object.freeze(origin),yaw,mapPoint,inversePoint,rootPoint,headingAt,mapOrientation,inverseOrientation,geometryFromWorldHips});
}
