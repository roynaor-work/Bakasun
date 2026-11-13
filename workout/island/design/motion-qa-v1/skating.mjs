// SPDX-License-Identifier: CC0-1.0
// Explicit blade contact model. Thresholds/weights remain those of the upstream metrics.
const EPS=1e-9;
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const norm=a=>Math.hypot(...a);
const unit=a=>a.map(v=>v/Math.max(EPS,norm(a)));
const finite=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
const round=v=>Number(v.toFixed(6));
const unavailable=(reason,evidence={})=>({available:false,reason,evidence});
function velocityAt(keys,t){
 if(t<=keys[0].timeSeconds)return keys[0].velocityMps;
 for(let i=1;i<keys.length;i++)if(t<=keys[i].timeSeconds){
  const a=keys[i-1],b=keys[i],u=(t-a.timeSeconds)/(b.timeSeconds-a.timeSeconds);
  return a.velocityMps.map((v,j)=>v+(b.velocityMps[j]-v)*u);
 }
 return keys.at(-1).velocityMps;
}
function validVelocity(keys,start,end){
 return Array.isArray(keys)&&keys.length>=2&&keys[0].timeSeconds<=start+EPS&&keys.at(-1).timeSeconds>=end-EPS&&keys.every((k,i)=>Number.isFinite(k.timeSeconds)&&finite(k.velocityMps)&&(!i||k.timeSeconds>keys[i-1].timeSeconds));
}
/** Longitudinal travel is legal. Plane error and unrequested lateral displacement are not. */
export function bladeContact(frames,metadata,height,supports,ops){
 if(supports.source!=='declared'||!supports.windows.length)return unavailable('Blade contact requires explicit, nonempty contact windows.');
 const uncovered=frames.filter(f=>!supports.windows.some(w=>f.t>=w.start-EPS&&f.t<=w.end+EPS));
 if(uncovered.length)return unavailable('Continuous skating must have at least one declared blade contact throughout the clip.',{uncoveredSamples:uncovered.length,firstUncoveredTime:uncovered[0].t});
 let maximum=0,maxHeight=0,maxNormal=0,maxLateral=0,maxPivot=0,samples=0,worst=null;
 const windows=[];
 for(const window of supports.windows){
  const segment=window.bladeSegmentLocalMeters??metadata.blade?.segmentLocalMeters??[[0,-.08,-.0865],[0,-.08,.1985]];
  const normalLocal=window.planeNormalLocal??metadata.blade?.normalLocal??[0,1,0];
  const normalWorld=[0,1,0];
  const mode=window.mode??'glide';
  const velocity=window.expectedVelocity??window.expectedLateralVelocitySamples;
  if(!['glide','brake','pivot'].includes(mode))return unavailable('Unknown blade contact mode.',{mode});
  if(!Array.isArray(segment)||segment.length!==2||!segment.every(finite)||!finite(normalLocal)||!finite(normalWorld)||norm(normalLocal)<EPS||norm(normalWorld)<EPS)return unavailable('Blade segment and plane normals must be finite and nonzero.');
  if(mode==='brake'&&!validVelocity(velocity,window.start,window.end))return unavailable('Braking requires an independent contact-velocity trajectory covering the complete window.',{bone:window.bone,start:window.start,end:window.end});
  const rows=ops.windowFrames(frames,window);
  if(rows.length<2)return unavailable('Blade contact window has fewer than two observations.',{window});
  const length=norm(sub(segment[1],segment[0]));
  const center=segment[0].map((v,i)=>(v+segment[1][i])/2);
  let lateralDrift=0,normalError=0,heightError=0,pivotDrift=0;
  const initial=ops.localPoint(rows[0],window.bone,window.local??metadata.soleLocal??center);
  if(!initial)return unavailable('Blade contact bone is missing.',{bone:window.bone});
  let previous=null;
  for(const frame of rows){
   if(!frame.rotations?.[window.bone])return unavailable('Blade orientation is missing.',{bone:window.bone,t:frame.t});
   const points=segment.map(p=>ops.localPoint(frame,window.bone,p));
   const position=ops.localPoint(frame,window.bone,window.local??metadata.soleLocal??center);
   const forward=unit(sub(points[1],points[0]));
   const normal=unit(ops.rotate(frame.rotations[window.bone],normalLocal));
   const alignment=Math.max(-1,Math.min(1,dot(normal,unit(normalWorld))));
   const normalMeters=length*Math.sqrt(2*(1-alignment));
   const h=Math.max(...points.map(p=>Math.abs(p[1]-(metadata.floorY??0))));
   heightError=Math.max(heightError,h);normalError=Math.max(normalError,normalMeters);
   if(mode==='pivot')pivotDrift=Math.max(pivotDrift,Math.hypot(position[0]-initial[0],position[2]-initial[2]));
   if(previous){
    const dt=frame.t-previous.t;
    // Midpoint heading makes exact circular travel invariant to sample rate.
    const tangent=unit([forward[0]+previous.forward[0],0,forward[2]+previous.forward[2]]);
    const lateral=[tangent[2],0,-tangent[0]];
    const displacement=sub(position,previous.position);
    const expected=mode==='brake'?velocityAt(velocity,(frame.t+previous.t)/2):[0,0,0];
    lateralDrift+=Math.abs(dot(displacement,lateral)-dot(expected,lateral)*dt);
   }
   previous={t:frame.t,position,forward};samples++;
   const error=Math.max(h,normalMeters,lateralDrift,pivotDrift);
   if(error>maximum){maximum=error;worst={bone:window.bone,t:round(frame.t),mode,errorMeters:round(error)};}
  }
  maxHeight=Math.max(maxHeight,heightError);maxNormal=Math.max(maxNormal,normalError);maxLateral=Math.max(maxLateral,lateralDrift);maxPivot=Math.max(maxPivot,pivotDrift);
  windows.push({bone:window.bone,start:window.start,end:window.end,mode,samples:rows.length,maxAbsHeightMeters:round(heightError),maxPlaneNormalErrorMeters:round(normalError),lateralResidualMeters:round(lateralDrift),pivotDriftMeters:round(pivotDrift),independentBrakeVelocity:mode==='brake'});
 }
 return {available:true,value:maximum/height,evidence:{model:'blade-contact-v2',supportSource:supports.source,coordinateSpace:metadata.coordinateSpace??'sampled world',windows:supports.windows.length,samples,maxDriftMeters:round(maximum),maxAbsHeightMeters:round(maxHeight),maxPlaneNormalErrorMeters:round(maxNormal),maxLateralResidualMeters:round(maxLateral),maxPivotDriftMeters:round(maxPivot),worst,contactWindows:windows,interpretation:'Blade endpoint height and sole-plane normal must match the ice. Longitudinal travel is permitted; lateral travel requires a declared braking velocity. Pivot anchor remains stationary.'}};
}
/** Compare independent reference and actual vector velocity, never planted-foot sweep. */
export function skatingTravel(frames,metadata,height,duration){
 if(!metadata.locomotion)return unavailable('stationary');
 if(metadata.referenceTravelKnown!==true||!frames.every(f=>finite(f.referenceRoot)))return unavailable('Skating requires a finite independent reference root trajectory at every sample.');
 let maximum=0,actualDistance=0,expectedDistance=0,samples=0,worst=null;
 for(let i=1;i<frames.length;i++){
  const a=frames[i-1],b=frames[i],dt=b.t-a.t;
  const actual=sub(b.root??b.joints.Root,a.root??a.joints.Root).map(v=>v/dt);
  const expected=sub(b.referenceRoot,a.referenceRoot).map(v=>v/dt);
  const av=Math.hypot(actual[0],actual[2]),ev=Math.hypot(expected[0],expected[2]);
  const error=Math.hypot(actual[0]-expected[0],actual[2]-expected[2])/Math.max(av,ev,.025*height);
  actualDistance+=av*dt;expectedDistance+=ev*dt;samples++;
  if(error>maximum){maximum=error;worst={t:round(b.t),actualVelocityMps:actual.map(round),referenceVelocityMps:expected.map(round),relativeError:round(error)};}
 }
 if(expectedDistance<.025*height*duration)return unavailable('A locomotion reference with negligible travel cannot certify skating.',{expectedDistanceMeters:round(expectedDistance)});
 return {available:true,value:maximum,evidence:{model:'skating-reference-velocity-v2',rootSource:'sampled actual root; separately authored reference trajectory',samples,rootSpeedMetersPerSecond:round(actualDistance/duration),referenceRootSpeedMetersPerSecond:round(expectedDistance/duration),maxVectorVelocityRelativeError:round(maximum),worst,interpretation:'Maximum vector-velocity mismatch, including direction, against an independent full-duration reference; no backward-foot-sweep assumption.'}};
}
