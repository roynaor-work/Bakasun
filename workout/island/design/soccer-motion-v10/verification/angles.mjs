/** CC0-1.0. Geometry-based arm and pelvis measurements from independent FK.
 * Inputs: [{time,p:{bone:[x,y,z]},q:{bone:[x,y,z,w]},local:{bone:[x,y,z,w]},hips?:[x,y,z]}].
 * No authoring rotations, target positions or IK functions are consulted.
 */
const DEG=180/Math.PI;
const clamp=x=>Math.max(-1,Math.min(1,x));
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const length=a=>Math.hypot(...a);
const distance=(a,b)=>length(sub(a,b));
const round=x=>Number.isFinite(x)?Number(x.toFixed(9)):null;
function rotate(v,q){
 const [x,y,z,w]=q,n=Math.hypot(x,y,z,w),qx=x/n,qy=y/n,qz=z/n,qw=w/n;
 const tx=2*(qy*v[2]-qz*v[1]),ty=2*(qz*v[0]-qx*v[2]),tz=2*(qx*v[1]-qy*v[0]);
 return [v[0]+qw*tx+qy*tz-qz*ty,v[1]+qw*ty+qz*tx-qx*tz,v[2]+qw*tz+qx*ty-qy*tx];
}
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
function summary(values){return {min:round(Math.min(...values)),max:round(Math.max(...values)),mean:round(values.reduce((s,x)=>s+x,0)/values.length)};}
function arm(frame,side){
 const shoulder=frame.p[side+'Arm'],elbow=frame.p[side+'ForeArm'],wrist=frame.p[side+'Hand'];
 if(!shoulder||!elbow||!wrist||!frame.q.Chest)throw Error('Incomplete FK arm data for '+side);
 const upper=sub(elbow,shoulder),fore=sub(wrist,elbow),local=rotate(upper,inverse(frame.q.Chest)),sign=side==='Left'?1:-1;
 if(length(upper)<1e-8||length(fore)<1e-8)throw Error('Degenerate arm segment for '+side);
 return {
  shoulderAbductionDeg:Math.atan2(Math.abs(local[0]),-local[1])*DEG,
  shoulderSignedAbductionDeg:Math.atan2(sign*local[0],-local[1])*DEG,
  shoulderFlexionDeg:Math.atan2(local[2],-local[1])*DEG,
  shoulderElevationDeg:Math.acos(clamp(-local[1]/length(local)))*DEG,
  // Upper and forearm axes point in the same direction when straight.
  elbowFlexDeg:Math.acos(clamp(dot(upper,fore)/(length(upper)*length(fore))))*DEG
 };
}
function hipsLocal(frame){
 if(frame.hips)return [...frame.hips];
 if(!frame.p.Hips||!frame.p.Root||!frame.q.Root)throw Error('Missing local hips or Root/Hips FK');
 return rotate(sub(frame.p.Hips,frame.p.Root),inverse(frame.q.Root));
}
export function measureAngles(frames){
 if(!frames?.length)throw Error('measureAngles requires nonempty FK frames');
 const samples=frames.map(frame=>({time:frame.time,hips:hipsLocal(frame),Left:arm(frame,'Left'),Right:arm(frame,'Right')}));
 const sides={};
 for(const side of ['Left','Right'])sides[side]=Object.fromEntries(Object.keys(samples[0][side]).map(key=>[key,summary(samples.map(s=>s[side][key]))]));
 const mean=[0,1,2].map(i=>samples.reduce((s,f)=>s+f.hips[i],0)/samples.length),ranges=[0,1,2].map(i=>summary(samples.map(s=>s.hips[i])));
 let diameter=0,horizontalDiameter=0;
 for(let i=0;i<samples.length;i++)for(let j=i+1;j<samples.length;j++){
  diameter=Math.max(diameter,distance(samples[i].hips,samples[j].hips));
  horizontalDiameter=Math.max(horizontalDiameter,Math.hypot(samples[i].hips[0]-samples[j].hips[0],samples[i].hips[2]-samples[j].hips[2]));
 }
 return {
  method:'FK geometry: arm direction in Chest coordinates; elbow angle between upper-arm and forearm axes; pelvis translation in Root coordinates.',
  sampleCount:samples.length,arms:sides,
  hips:{rangesMeters:{x:ranges[0],y:ranges[1],z:ranges[2]},peakToPeakMeters:ranges.map(r=>round(r.max-r.min)),maxExcursionMeters:round(diameter),horizontalExcursionMeters:round(horizontalDiameter),maxRadiusFromMeanMeters:round(Math.max(...samples.map(s=>distance(s.hips,mean)))),maxDistanceFromFirstMeters:round(Math.max(...samples.map(s=>distance(s.hips,samples[0].hips))))},
  samples:samples.map(s=>({time:s.time,hips:s.hips.map(round),Left:Object.fromEntries(Object.entries(s.Left).map(([k,v])=>[k,round(v)])),Right:Object.fromEntries(Object.entries(s.Right).map(([k,v])=>[k,round(v)]))}))
 };
}
/** Explicit targets supplied by caller; clip names do not select exceptions. */
export function assessAngles(measurement,targets={}){
 const failures=[];
 for(const side of ['Left','Right']){
  const a=measurement.arms[side];
  if(Number.isFinite(targets.shoulderAbductionDeg)){
   const tolerance=targets.shoulderToleranceDeg??3,r=a.shoulderSignedAbductionDeg;
   if(r.min<targets.shoulderAbductionDeg-tolerance||r.max>targets.shoulderAbductionDeg+tolerance)failures.push({code:'shoulder-abduction',side,target:targets.shoulderAbductionDeg,tolerance,actual:r});
  }
  if(Number.isFinite(targets.elbowFlexDeg)){
   const tolerance=targets.elbowToleranceDeg??3,r=a.elbowFlexDeg;
   if(r.min<targets.elbowFlexDeg-tolerance||r.max>targets.elbowFlexDeg+tolerance)failures.push({code:'elbow-flex',side,target:targets.elbowFlexDeg,tolerance,actual:r});
  }
  if(targets.elbowRangeDeg){
   const [minimum,maximum]=targets.elbowRangeDeg,tolerance=targets.elbowRangeToleranceDeg??2,r=a.elbowFlexDeg;
   if(r.min<minimum-tolerance||r.max>maximum+tolerance)failures.push({code:'elbow-flex-range',side,range:[minimum,maximum],tolerance,actual:r});
  }
 }
 if(Number.isFinite(targets.maxHipExcursionMeters)&&measurement.hips.maxExcursionMeters>targets.maxHipExcursionMeters+1e-6)failures.push({code:'hip-excursion',target:targets.maxHipExcursionMeters,actual:measurement.hips.maxExcursionMeters});
 return {targets,pass:failures.length===0,failures};
}
