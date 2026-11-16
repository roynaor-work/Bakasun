// SPDX-License-Identifier: CC0-1.0
// Independent action evidence from delivered GLB tracks and immutable catalog ball samples.
// This verifier never reads authored poses or imports the choreography/IK implementation.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unpack,readAccessor} from './glb.mjs';

const base=new URL('../',import.meta.url),rate=120,dt=1/rate;
const limits={groundSoleHeightMeters:.008,groundDriftMeters:.02,
  ballisticAccelerationErrorMps2:.05,releaseVelocityMismatchMps:.12,
  minimumImpactVelocityChangeMps:1,minimumOutgoingBallSpeedMps:2,
  ballContactSurfaceGapMeters:.015};
const sha=b=>createHash('sha256').update(b).digest('hex');
const catalogBytes=await readFile(new URL('catalog.json',base));
const catalog=JSON.parse(catalogBytes),records=[];
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const norm=a=>Math.hypot(...a),distance=(a,b)=>norm(sub(a,b));
const horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const normalize=q=>mul(q,1/norm(q)),round=x=>Number(x.toFixed(9));
function qm(a,b){const [x,y,z,w]=a,[X,Y,Z,W]=b;return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];}
function rotate(v,q){const p=qm(qm(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]);return p.slice(0,3);}
function slerp(a,b,u){a=normalize(a);b=normalize(b);let c=dot(a,b);if(c<0){b=mul(b,-1);c=-c;}if(c>.9999995)return normalize(a.map((v,i)=>v+(b[i]-v)*u));const angle=Math.acos(Math.max(-1,Math.min(1,c))),d=Math.sin(angle);return normalize(a.map((v,i)=>(v*Math.sin((1-u)*angle)+b[i]*Math.sin(u*angle))/d));}
function linearTrack(keys,t){
  if(!keys?.length)return {position:[0,0,0],yawRadians:0};
  const time=k=>k.time??k.t,position=k=>k.position??k.positionMeters;
  if(t<=time(keys[0]))return {position:[...position(keys[0])],yawRadians:keys[0].yawRadians??0};
  for(let i=1;i<keys.length;i++)if(t<=time(keys[i])){const a=keys[i-1],b=keys[i],u=(t-time(a))/(time(b)-time(a));return {position:position(a).map((v,j)=>v+(position(b)[j]-v)*u),yawRadians:(a.yawRadians??0)+((b.yawRadians??0)-(a.yawRadians??0))*u};}
  return {position:[...position(keys.at(-1))],yawRadians:keys.at(-1).yawRadians??0};
}
function actor(entry,t){const a=linearTrack(entry.referenceTravel?.samples??entry.referenceRootMotion?.samples??entry.travel,t);return {...a,rotation:[0,Math.sin(a.yawRadians/2),0,Math.cos(a.yawRadians/2)]};}
function worldPoint(entry,p,t){const a=actor(entry,t);return add(rotate(p,a.rotation),a.position);}
function nativeSampler(bytes,id){
  const glb=unpack(bytes),d=glb.document,animation=d.animations.find(a=>a.name===id);
  if(!animation)throw new Error(`Missing delivered animation ${id}.`);
  const parents=d.nodes.map((_,i)=>d.nodes.findIndex(n=>n.children?.includes(i)));
  const tracks=animation.channels.map(c=>{const s=animation.samplers[c.sampler];if(s.interpolation!=='LINEAR')throw new Error(`${id}: expected native LINEAR tracks.`);return {node:c.target.node,path:c.target.path,times:readAccessor(glb,s.input).values,data:readAccessor(glb,s.output)};});
  return t=>{
    const nodes=d.nodes.map(n=>({position:[...(n.translation??[0,0,0])],rotation:[...(n.rotation??[0,0,0,1])],scale:[...(n.scale??[1,1,1])]}));
    for(const c of tracks){let hi=1;while(hi<c.times.length&&c.times[hi]<t)hi++;hi=Math.min(c.times.length-1,hi);const lo=Math.max(0,hi-1),u=Math.max(0,Math.min(1,(t-c.times[lo])/(c.times[hi]-c.times[lo]||1)));const a=c.data.values.slice(lo*c.data.width,(lo+1)*c.data.width),b=c.data.values.slice(hi*c.data.width,(hi+1)*c.data.width);nodes[c.node][c.path==='translation'?'position':c.path]=c.path==='rotation'?slerp(a,b,u):a.map((v,i)=>v+(b[i]-v)*u);}
    const cache=[];
    function world(i){if(cache[i])return cache[i];const n=nodes[i],parent=parents[i]<0?null:world(parents[i]);return cache[i]=parent?{position:add(parent.position,rotate(n.position.map((v,j)=>v*parent.scale[j]),parent.rotation)),rotation:normalize(qm(parent.rotation,n.rotation)),scale:n.scale.map((v,j)=>v*parent.scale[j])}:n;}
    return Object.fromEntries(d.nodes.map((n,i)=>[n.name,world(i)]));
  };
}
const runs=(samples,predicate)=>{const groups=[];let active=[];for(const sample of samples){if(predicate(sample))active.push(sample);else if(active.length){groups.push(active);active=[];}}if(active.length)groups.push(active);return groups;};
function runEvidence(group){const first=group[0];return {start:round(first.t),end:round(group.at(-1).t),samples:group.length,
  maxHorizontalDriftMeters:round(Math.max(...group.map(f=>horizontal(f.position,first.position)))),
  minSoleHeightMeters:round(Math.min(...group.map(f=>f.position[1]))),maxSoleHeightMeters:round(Math.max(...group.map(f=>f.position[1])))};}
const datasets=new Map();
for(const entry of catalog.clips){
  const bytes=await readFile(new URL(entry.asset,base)),sample=nativeSampler(bytes,entry.id);
  const frames=Array.from({length:Math.round(entry.durationSeconds*rate)+1},(_,i)=>{const t=i/rate;return {t,nodes:sample(t)};});
  datasets.set(entry.id,{entry,frames,sample});
  const feet=[];
  for(const bone of ['LeftFoot','RightFoot']){
    const points=frames.map(f=>{const n=f.nodes[bone],local=[0,-.08,0].map((v,i)=>v*n.scale[i]),p=worldPoint(entry,add(n.position,rotate(local,n.rotation)),f.t);const declared=(entry.supports??[]).some(w=>w.bone===bone&&f.t>=(w.startSeconds??w.start)-1e-7&&f.t<=(w.endSeconds??w.end)+1e-7);return {t:f.t,position:p,declared};});
    const inferred=runs(points,f=>f.position[1]<=limits.groundSoleHeightMeters).map(runEvidence);
    const undeclared=runs(points,f=>f.position[1]<=limits.groundSoleHeightMeters&&!f.declared).map(runEvidence);
    feet.push({bone,inferredGroundRuns:inferred,undeclaredGroundRuns:undeclared,
      maxInferredGroundDriftMeters:Math.max(0,...inferred.map(r=>r.maxHorizontalDriftMeters)),
      maxUndeclaredGroundDriftMeters:Math.max(0,...undeclared.map(r=>r.maxHorizontalDriftMeters)),
      pass:inferred.length>0&&inferred.every(r=>r.maxHorizontalDriftMeters<=limits.groundDriftMeters)});
  }
  records.push({id:entry.id,asset:entry.asset,sha256:sha(bytes),sampleRate:rate,
    feet,pass:feet.every(f=>f.pass)});
}

function ballWorld(entry,t){const p=linearTrack(entry.ball.samples??entry.ball.keys,t).position;return entry.ball.space==='world'||entry.ball.coordinateSpace==='world'?p:worldPoint(entry,p,t);}
const derivative=(point,t,side)=>side==='before'?mul(add(add(mul(point(t),3),mul(point(t-dt),-4)),point(t-2*dt)),1/(2*dt)):mul(add(add(mul(point(t),-3),mul(point(t+dt),4)),mul(point(t+2*dt),-1)),1/(2*dt));
function accelerationEvidence(entry,start,end,expected){
  const point=t=>ballWorld(entry,t),observations=[];
  for(let i=Math.ceil((start+2*dt)*rate-1e-7);i<=Math.floor((end-2*dt)*rate+1e-7);i++){
    const t=i/rate,a=point(t-dt),b=point(t),c=point(t+dt);
    if(Math.min(a[1],b[1],c[1])<=(entry.ball.radius??.11)+1e-5)continue;
    const acceleration=mul(add(add(a,c),mul(b,-2)),1/(dt*dt));observations.push({t,acceleration,error:distance(acceleration,expected)});
  }
  const maxError=Math.max(0,...observations.map(o=>o.error));
  const mean=observations.length?[0,1,2].map(i=>observations.reduce((s,o)=>s+o.acceleration[i],0)/observations.length):null;
  return {start,end,samples:observations.length,expectedAccelerationMps2:expected,
    observedMeanAccelerationMps2:mean?.map(round),maxAccelerationErrorMps2:round(maxError),
    pass:observations.length>=5&&maxError<=limits.ballisticAccelerationErrorMps2};
}
const ballChecks=[];
for(const {entry,sample}of datasets.values()){
  if(!entry.ball)continue;
  const radius=entry.ball.radius??.11,point=t=>ballWorld(entry,t),checks=[];
  const contactTimes=(entry.events??[]).filter(e=>e.type==='contact'&&e.bone);
  const contactWindows=[...(entry.ballContacts??[]),...contactTimes.map(e=>({bone:e.bone,local:e.local,start:e.time,end:e.time}))];
  for(const w of contactWindows){const observations=[];const times=new Set([w.start,w.end]);for(let i=Math.ceil(w.start*rate);i<=Math.floor(w.end*rate);i++)times.add(i/rate);for(const t of [...times].sort((a,b)=>a-b)){const n=sample(t)[w.bone],contact=worldPoint(entry,add(n.position,rotate((w.local??[0,0,0]).map((v,i)=>v*n.scale[i]),n.rotation)),t);observations.push({t,gap:Math.abs(distance(contact,point(t))-radius)});}const gap=Math.max(...observations.map(o=>o.gap));checks.push({kind:'native-effector-to-independent-ball-surface',bone:w.bone,start:w.start,end:w.end,samples:observations.length,maxGapMeters:round(gap),pass:gap<=limits.ballContactSurfaceGapMeters});}
  if(entry.id==='keeper_punt'){
    const drop=entry.events.find(e=>e.type==='drop').time,hit=contactTimes[0].time;
    checks.push({kind:'unsupported-drop-obeys-gravity',...accelerationEvidence(entry,drop,hit,[0,-9.81,0])});
    const v=derivative(point,drop,'after');checks.push({kind:'drop-starts-from-rest',dropTime:drop,observedVelocityMps:v.map(round),pass:norm(v)<.02});
  }
  if(entry.id==='keeper_throw'){
    const release=entry.events.find(e=>e.type==='release').time,before=derivative(point,release,'before'),after=derivative(point,release,'after'),mismatch=distance(before,after);
    checks.push({kind:'release-has-continuous-ball-velocity',time:release,incomingVelocityMps:before.map(round),outgoingVelocityMps:after.map(round),mismatchMps:round(mismatch),pass:mismatch<=limits.releaseVelocityMismatchMps});
    checks.push({kind:'released-ball-obeys-gravity',...accelerationEvidence(entry,release,Math.min(entry.durationSeconds,release+.4),[0,-9.81,0])});
    const t=release+.12,w=entry.ballContacts.find(w=>w.bone==='RightHand'),n=sample(t).RightHand,palm=worldPoint(entry,add(n.position,rotate(w.local,n.rotation)),t),separation=distance(palm,point(t))-radius;
    checks.push({kind:'released-ball-separates-from-hand',time:t,surfaceSeparationMeters:round(separation),pass:separation>.1});
  }
  if(['keeper_dive_low','keeper_dive_high','keeper_punch','keeper_punt'].includes(entry.id)){
    const hit=contactTimes[0].time,before=derivative(point,hit,'before'),after=derivative(point,hit,'after'),change=distance(before,after);
    checks.push({kind:'impact-changes-ball-velocity',time:hit,incomingVelocityMps:before.map(round),outgoingVelocityMps:after.map(round),velocityChangeMps:round(change),outgoingSpeedMps:round(norm(after)),pass:change>=limits.minimumImpactVelocityChangeMps&&norm(after)>=limits.minimumOutgoingBallSpeedMps});
    checks.push({kind:'deflected-ball-obeys-world-gravity',...accelerationEvidence(entry,hit,Math.min(entry.durationSeconds,hit+.4),[0,-9.81,0])});
    if(entry.id!=='keeper_punt')checks.push({kind:'incoming-ball-is-independent-world-line',...accelerationEvidence(entry,0,hit,[0,0,0])});
  }
  ballChecks.push({id:entry.id,ballSampleCount:entry.ball.samples.length,checks,pass:checks.every(c=>c.pass)});
}
const authorBytes=await readFile(new URL('source/author.mjs',base));
const failures=[...records.filter(r=>!r.pass).flatMap(r=>r.feet.filter(f=>!f.pass).map(f=>`${r.id}/${f.bone}: ground-inferred drift ${f.maxInferredGroundDriftMeters} m`)),...ballChecks.flatMap(c=>c.checks.filter(k=>!k.pass).map(k=>`${c.id}: ${k.kind}`))];
const result={schemaVersion:1,method:'Decode actual delivered GLB accessors; native LINEAR translation and quaternion slerp; independent FK at120Hz. Infer all sole-near-floor runs regardless declared support metadata. Inspect catalog ball trajectories in world space using one-sided second-order velocity and central acceleration differences.',
  limits,catalogSha256:sha(catalogBytes),sourceReview:{path:'source/author.mjs',sha256:sha(authorBytes),
    conclusion:'Manual code review confirmed keeper_throw uses an explicit center guide, scalar Hermite release tangent and wrist IK toward the guide. No pre-release FK-derived ball trajectory remains. Artifact measurements below independently check actual hand contact, release separation and ball physics; outputs alone cannot prove authoring provenance.'},
  scope:'Skeletal sole and effector probes, declared actor travel and catalog ball paths; this is not a full skinned-mesh or rigid-body collision simulation. Ball physics is checked in the airborne windows before floor clamping.',
  summary:{clips:records.length,groundChecksPassed:records.filter(r=>r.pass).length,ballActions:ballChecks.length,
    ballChecksPassed:ballChecks.filter(c=>c.pass).length,
    maxGroundInferredDriftMeters:Math.max(...records.flatMap(r=>r.feet.map(f=>f.maxInferredGroundDriftMeters))),
    maxUndeclaredGroundDriftMeters:Math.max(...records.flatMap(r=>r.feet.map(f=>f.maxUndeclaredGroundDriftMeters))),allPassed:failures.length===0},
  groundChecks:records,ballChecks,failures};
await mkdir(new URL('verification/',base),{recursive:true});
await writeFile(new URL('verification/actions.json',base),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result.summary,failures},null,2));
if(failures.length)process.exitCode=1;
