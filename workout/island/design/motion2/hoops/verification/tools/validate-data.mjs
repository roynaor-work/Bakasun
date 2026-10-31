#!/usr/bin/env node
// Independent validation of authored canonical data, before the viewer's IK/floor corrections.
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const assets=resolve(here,'../..');
const canonicalPath=resolve(assets,'../../motion/hoops.json');
const canonicalBytes=readFileSync(canonicalPath);
const canonical=JSON.parse(canonicalBytes);
const names=canonical.skeleton.bones.map(b=>b.name);
const identity=[0,0,0,1];
export const limits=Object.freeze({supportMeters:.02,floorMeters:.001,loopMeters:.000001,loopRadians:.00001,quaternionNorm:.00001,ballMeters:.000001,eventTime:.000000001});
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=v=>Math.hypot(...v);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const dist=(a,b)=>norm(sub(a,b));
const unit=v=>v.map(x=>x/norm(v));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const finiteVector=(v,length)=>Array.isArray(v)&&v.length===length&&v.every(Number.isFinite);
function multiply([x,y,z,w],[a,b,c,d]){return [w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];}
function rotate(q,v){return multiply(multiply(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]).slice(0,3);}
function slerp(a,b,t){let d=dot(a,b);if(d<0){b=b.map(x=>-x);d=-d;}if(d>.9995)return unit(mix(a,b,t));const a0=Math.acos(Math.min(1,d)),s=Math.sin(a0);return a.map((v,i)=>(v*Math.sin((1-t)*a0)+b[i]*Math.sin(t*a0))/s);}
function forward(pose,reference=false){const result={};for(const b of canonical.skeleton.bones){const parent=result[b.parent]??{position:[0,0,0],rotation:identity};const off=b.name==='Hips'?add(b.restTranslationMeters,pose.hipsOffsetMeters):b.restTranslationMeters;result[b.name]={position:add(parent.position,rotate(parent.rotation,off)),rotation:unit(multiply(parent.rotation,pose.rotations[b.name]))};}if(reference)for(const b of Object.values(result))b.position=add(b.position,pose.referenceRootTranslationMeters);return result;}
function point(world,bone,local){const w=world[bone];return add(w.position,rotate(w.rotation,local));}
function sample(clip,t){const keys=clip.keyframes;if(t<=0)return keys[0];if(t>=1)return keys.at(-1);const i=keys.findIndex(k=>k.time>=t),a=keys[i-1],b=keys[i],u=(t-a.time)/(b.time-a.time),w=u*u*(3-2*u);return {rotations:Object.fromEntries(names.map(n=>[n,slerp(a.rotations[n],b.rotations[n],w)])),hipsOffsetMeters:mix(a.hipsOffsetMeters,b.hipsOffsetMeters,w),referenceRootTranslationMeters:mix(a.referenceRootTranslationMeters,b.referenceRootTranslationMeters,w)};}
export function validateData(data,file='memory'){
 const results=[];
 for(const [name,c]of Object.entries(data.states??{})){
  const errors=[];const fail=m=>{if(errors.length<40)errors.push(m);};
  if(data.schemaVersion!==1||data.kind!=='authored-skeletal-motion'||data.game!=='hoops')fail('Invalid package schema');
  if(JSON.stringify(data.skeleton)!==JSON.stringify(canonical.skeleton))fail('Canonical skeleton changed');
  if(c.clip!==name||c.rootMotion!==false||!Number.isFinite(c.durationSeconds)||c.durationSeconds<=0)fail('Invalid clip contract');
  if(JSON.stringify(c.interpolation)!==JSON.stringify(canonical.states.idle.interpolation))fail('Interpolation changed');
  if(!Array.isArray(c.keyframes)||c.keyframes.length<2){fail('Missing keys');results.push({file,clip:name,pass:false,errors});continue;}
  if(c.keyframes[0].time!==0||c.keyframes.at(-1).time!==1)fail('Missing endpoint keys');
  let prev=-1,valid=true;
  for(const k of c.keyframes){
   if(!(Number.isFinite(k.time)&&k.time>prev&&k.time>=0&&k.time<=1)){fail('Key times not strictly increasing');valid=false;}prev=k.time;
   if(JSON.stringify(Object.keys(k.rotations??{}).sort())!==JSON.stringify([...names].sort())){fail('Missing rotations');valid=false;}
   for(const [n,q]of Object.entries(k.rotations??{}))if(!finiteVector(q,4)||Math.abs(norm(q)-1)>limits.quaternionNorm){fail('Invalid quaternion '+n);valid=false;}
   if(!finiteVector(k.hipsOffsetMeters,3)||!finiteVector(k.referenceRootTranslationMeters,3)){fail('Invalid translation');valid=false;}
   if(k.rotations?.Root&&dist(k.rotations.Root,identity)>limits.loopMeters)fail('Root rotation changed');
  }
  if(!Array.isArray(c.events)||!Array.isArray(c.ballContacts)||!Array.isArray(c.supportContacts)){fail('Missing contact/event arrays');valid=false;}
  if(!valid){results.push({file,clip:name,pass:false,errors});continue;}
  for(const e of c.events){
   if(!(e.time>=0&&e.time<=1)||Math.abs(e.atSeconds-e.time*c.durationSeconds)>limits.eventTime)fail('Marker seconds mismatch');
   if(!c.keyframes.some(k=>Math.abs(k.time-e.time)<limits.eventTime))fail('Marker without exact key');
   if(e.presentationOnly!==true)fail('Event is not presentation only');
  }
  if(c.ballContactStatus!==(c.ballContacts.length?'authored':'none'))fail('Invalid ball contact status');
  if(!Array.isArray(c.contactTimeline)||c.contactTimeline.length===0)fail('Missing contact timeline');
  else {
   for(const e of c.contactTimeline){
    if(!(Number.isFinite(e.time)&&e.time>=0&&e.time<=1)||!Number.isFinite(e.atSeconds)||Math.abs(e.atSeconds-e.time*c.durationSeconds)>limits.eventTime)fail('Invalid contact timeline time');
    if(e.endTime!==undefined&&(!(e.endTime>=e.time&&e.endTime<=1)||Math.abs(e.endAtSeconds-e.endTime*c.durationSeconds)>limits.eventTime))fail('Invalid contact timeline interval');
   }
   for(const b of c.ballContacts)if(!c.contactTimeline.some(e=>e.bone===b.bone&&Math.abs(e.time-b.time)<limits.eventTime&&(e.kind==='hand-ball'||e.kind==='hand')))fail('Ball contact missing from timeline');
   for(const s of c.supportContacts)for(const t of [s.startTime,s.endTime])if(!c.contactTimeline.some(e=>e.kind==='ground'&&e.bone===s.bone&&Math.abs(e.time-t)<limits.eventTime))fail('Support boundary missing from timeline');
  }
  if(!c.ballContacts.length&&!(typeof c.ballContactReason==='string'&&c.ballContactReason.length))fail('Missing no-ball reason');
  if(c.loop){const cycle=c.referenceLocomotion?.cycleAnchorTranslationMeters??[0,0,0];const delta=sub(c.keyframes.at(-1).referenceRootTranslationMeters,c.keyframes[0].referenceRootTranslationMeters);if(!finiteVector(cycle,3)||dist(cycle,delta)>limits.loopMeters)fail('Reference cycle delta mismatch');}
  let maxBallError=0;
  for(const b of c.ballContacts){
   if(!names.includes(b.bone)||!finiteVector(b.localPointMeters,3)||!finiteVector(b.pointMeters,3)||!finiteVector(b.ballCenterMeters,3)||b.ballRadiusMeters!==.12||!(b.time>=0&&b.time<=1)){fail('Invalid ball contact');continue;}
   if(!c.events.some(e=>e.name===b.event&&Math.abs(e.time-b.time)<limits.eventTime))fail('Ball contact without presentation marker');
   if(!c.keyframes.some(k=>Math.abs(k.time-b.time)<limits.eventTime))fail('Ball contact without exact key');
   const palm=point(forward(sample(c,b.time)),b.bone,b.localPointMeters);
   const error=Math.max(dist(palm,b.pointMeters),Math.abs(dist(b.pointMeters,b.ballCenterMeters)-b.ballRadiusMeters));
   maxBallError=Math.max(maxBallError,error);if(error>limits.ballMeters)fail('Ball contact mismatch '+error);
  }
  let validSupports=true;
  for(const s of c.supportContacts){
   if(!['LeftFoot','RightFoot'].includes(s.bone)||s.mode!=='plant'||!finiteVector(s.anchorMeters,3)||!finiteVector(s.effectorOffsetMeters,3)||!(s.startTime>=0&&s.endTime<=1&&s.startTime<s.endTime)){fail('Invalid support contact');validSupports=false;}
   for(const t of [s.startTime,s.endTime])if(!c.keyframes.some(k=>Math.abs(k.time-t)<limits.eventTime))fail('Support boundary without exact key');
  }
  const times=new Set(c.keyframes.map(k=>k.time));const count=Math.ceil(c.durationSeconds*240);
  for(let i=0;i<=count;i++)times.add(i/count);
  if(validSupports)for(const s of c.supportContacts){times.add(s.startTime);times.add(s.endTime);}
  let minY=Infinity,maxSupport=0,worstBone='',worstTime=0;
  for(const t of [...times].sort((a,b)=>a-b)){
   const p=sample(c,t),world=forward(p),referenced=forward(p,true);
   const probes=names.filter(n=>n!=='Root').map(n=>[n,world[n].position]);
   for(const n of ['LeftFoot','RightFoot'])probes.push([n+' sole',point(world,n,[0,-.08,0])]);
   for(const n of ['LeftHand','RightHand'])probes.push([n+' palm',point(world,n,[0,-.08,.025])]);
   for(const [n,v]of probes)if(v[1]<minY){minY=v[1];worstBone=n;worstTime=t;}
   if(validSupports)for(const s of c.supportContacts)if(t>=s.startTime-1e-10&&t<=s.endTime+1e-10)maxSupport=Math.max(maxSupport,dist(point(referenced,s.bone,s.effectorOffsetMeters),s.anchorMeters));
  }
  if(minY < -limits.floorMeters)fail(`Floor penetration ${minY} ${worstBone}@${worstTime}`);
  if(maxSupport>limits.supportMeters)fail('Support drift '+maxSupport);
  let loopPosition=0,loopRadians=0;
  if(c.loop){const a=c.keyframes[0],b=c.keyframes.at(-1),wa=forward(a),wb=forward(b);loopPosition=dist(a.hipsOffsetMeters,b.hipsOffsetMeters);for(const n of names){loopPosition=Math.max(loopPosition,dist(wa[n].position,wb[n].position));loopRadians=Math.max(loopRadians,2*Math.acos(Math.min(1,Math.abs(dot(a.rotations[n],b.rotations[n]))/(norm(a.rotations[n])*norm(b.rotations[n])))));}if(loopPosition>limits.loopMeters||loopRadians>limits.loopRadians)fail('Loop endpoints discontinuous');}
  results.push({file,clip:name,keyframes:c.keyframes.length,samples:times.size,minY,maxSupportErrorMeters:maxSupport,maxBallErrorMeters:maxBallError,loop:c.loop?{positionMeters:loopPosition,rotationRadians:loopRadians}:null,pass:errors.length===0,errors});
 }
 if(!results.length)results.push({file,pass:false,errors:['Package contains no states']});
 return results;
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function negativeControls(packages){
 const tests=[];
 const select=predicate=>{for(const p of packages)for(const [name,state]of Object.entries(p.data.states))if(predicate(state))return {data:structuredClone({...p.data,states:{[name]:state}}),name};throw Error('Negative control lacks a suitable clip');};
 const run=(name,predicate,mutate,expected)=>{const p=select(predicate);mutate(p.data.states[p.name]);const errors=validateData(p.data,'negative:'+name).flatMap(r=>r.errors);tests.push({name,detected:errors.some(e=>e.includes(expected)),expected,errors});};
 run('quaternion',()=>true,c=>{c.keyframes[0].rotations.Chest=[0,0,0,2];},'Invalid quaternion');
 run('support-anchor',c=>c.supportContacts.length,c=>{c.supportContacts[0].anchorMeters[0]+=.1;},'Support drift');
 run('floor',()=>true,c=>{for(const k of c.keyframes)k.hipsOffsetMeters[1]-=2;},'Floor penetration');
 run('ball-point',c=>c.ballContacts.length,c=>{c.ballContacts[0].pointMeters[0]+=.1;},'Ball contact mismatch');
 run('loop',c=>c.loop,c=>{c.keyframes.at(-1).hipsOffsetMeters[0]+=.1;},'Loop endpoints discontinuous');
 run('missing-marker-key',c=>c.events.some(e=>e.time>0&&e.time<1),c=>{const t=c.events.find(e=>e.time>0&&e.time<1).time;c.keyframes=c.keyframes.filter(k=>Math.abs(k.time-t)>=limits.eventTime);},'Marker without exact key');
 run('missing-contact-timeline',()=>true,c=>{c.contactTimeline=[];},'Missing contact timeline');
 return {pass:tests.every(t=>t.detected),cases:tests};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const packages=readdirSync(assets).filter(n=>n.endsWith('.json')).map(file=>{const bytes=readFileSync(resolve(assets,file));return {file,bytes,data:JSON.parse(bytes)};}).filter(p=>p.data.kind==='authored-skeletal-motion');
 const clips=packages.flatMap(p=>validateData(p.data,p.file));
 const controls=packages.length?negativeControls(packages):{pass:false,cases:[]};
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),scope:'Canonical FK before runtime IK and floor correction; soles, palms and joints. Browser report additionally scans all skinned vertices.',samplesPerSecond:240,limits,sourceSha256:{'../../motion/hoops.json':hash(canonicalBytes),...Object.fromEntries(packages.map(p=>[p.file,hash(p.bytes)]))},clips,negativeControls:controls,pass:clips.length>0&&clips.every(c=>c.pass)&&controls.pass};
 const target=process.argv[2]?resolve(process.argv[2]):resolve(assets,'verification/source-validation.json');mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(report,null,2)+'\n');
 for(const c of clips)console.log(`${c.pass?'PASS':'FAIL'} ${c.clip}: support=${c.maxSupportErrorMeters?.toFixed(7)}, floor=${c.minY?.toFixed(7)}${c.errors.length?' '+c.errors.join('; '):''}`);
 console.log(`${controls.pass?'PASS':'FAIL'} ${controls.cases.length} negative controls`);
 console.log(`${report.pass?'PASS':'FAIL'} ${clips.length} clips; ${target}`);process.exitCode=report.pass?0:1;
}
