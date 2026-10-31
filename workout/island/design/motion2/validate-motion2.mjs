#!/usr/bin/env node
// Asset contract validation only. The unchanged viewer performs rendered checks.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url));
const games=['soccer','hoops','alpine'];
// Required asset coverage is independent of the generator and its state table.
const requiredClips={
 soccer:['short_pass','long_pass','kick_charge','slide_tackle','header','dribble','chest_trap','keeper_dive_side_left','keeper_dive_corner_left','keeper_dive_side_right','keeper_dive_corner_right','keeper_punt'],
 hoops:['dribble','dribble_fast','run_with_ball','layup','dunk','block','rebound','jump_shot','chest_pass'],
 alpine:['tuck','turn_left_light','turn_left_medium','turn_left_hard','turn_right_light','turn_right_medium','turn_right_hard','small_hop','trick_jump','bad_landing','fall_side'],
};
const add=(a,b)=>a.map((v,i)=>v+b[i]), mix=(a,b,w)=>a.map((v,i)=>v+(b[i]-v)*w);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),length=a=>Math.hypot(...a),distance=(a,b)=>length(a.map((v,i)=>v-b[i]));
const unit=a=>a.map(v=>v/length(a));
const multiply=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const rotate=(q,v)=>multiply(multiply(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]).slice(0,3);
function slerp(a,b,w){let c=dot(a,b);if(c<0){b=b.map(v=>-v);c=-c;}if(c>.9995)return unit(mix(a,b,w));let angle=Math.acos(Math.min(1,c));return a.map((v,i)=>(v*Math.sin((1-w)*angle)+b[i]*Math.sin(w*angle))/Math.sin(angle));}
function sample(clip,t){const k=clip.keyframes;let i=k.findIndex(p=>p.time>=t);if(i<=0)return k[0];const a=k[i-1],b=k[i],u=(t-a.time)/(b.time-a.time),w=u*u*(3-2*u);return {rotations:Object.fromEntries(Object.keys(a.rotations).map(n=>[n,slerp(a.rotations[n],b.rotations[n],w)])),hipsOffsetMeters:mix(a.hipsOffsetMeters,b.hipsOffsetMeters,w),referenceRootTranslationMeters:mix(a.referenceRootTranslationMeters,b.referenceRootTranslationMeters,w)};}
function forward(bones,p){let world={};for(const b of bones){const par=world[b.parent]||{position:[0,0,0],rotation:[0,0,0,1]};world[b.name]={position:add(par.position,rotate(par.rotation,b.name==='Hips'?add(b.restTranslationMeters,p.hipsOffsetMeters):b.restTranslationMeters)),rotation:unit(multiply(par.rotation,p.rotations[b.name]))};}return world;}
const point=(world,b,local)=>add(world[b].position,rotate(world[b].rotation,local));
const vec=(v,n=3)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
const normalized=t=>Number.isFinite(t)&&t>=0&&t<=1;
function contactTiming(record,duration,context,{pointRequired=false,windowRequired=false}={}){
 const hasPoint='time'in record||'atSeconds'in record;
 const hasWindow=['startTime','endTime','startSeconds','endSeconds'].some(k=>k in record);
 assert(hasPoint||hasWindow,`${context}: missing contact time`);
 assert(!pointRequired||hasPoint,`${context}: missing timed contact marker`);
 assert(!windowRequired||hasWindow,`${context}: missing contact window`);
 if(hasPoint){assert(normalized(record.time),`${context}: normalized contact time`);assert(Number.isFinite(record.atSeconds)&&Math.abs(record.atSeconds-record.time*duration)<1e-6,`${context}: contact seconds`);}
 if(hasWindow){
  assert(normalized(record.startTime)&&normalized(record.endTime)&&record.startTime<=record.endTime,`${context}: normalized contact window`);
  for(const end of ['start','end'])assert(Number.isFinite(record[end+'Seconds'])&&Math.abs(record[end+'Seconds']-record[end+'Time']*duration)<1e-6,`${context}: ${end} seconds`);
  if(hasPoint)assert(record.time>=record.startTime&&record.time<=record.endTime,`${context}: marker outside contact window`);
 }
}
export async function validate(){
 const report={schemaVersion:1,kind:'motion2-canonical-contract-report',limits:{supportMeters:.02,loopTranslationMeters:.001,loopRotationRadians:.01,floorMeters:.001,ballPointMeters:.0001},games:[],pass:false};
 for(const game of games){
  const data=JSON.parse(await readFile(resolve(here,game+'.json'),'utf8')),base=JSON.parse(await readFile(resolve(here,'../motion',game+'.json'),'utf8'));
  assert.equal(data.schemaVersion,base.schemaVersion);assert.equal(data.kind,base.kind);assert.equal(data.game,game);assert.deepEqual(data.skeleton,base.skeleton);
  const names=base.skeleton.bones.map(b=>b.name);assert.equal(names.length,18);assert.equal(data.sourceContract.gitBlobSha,base.sourceContract.gitBlobSha);assert.equal(data.sourceContract.path,base.sourceContract.path);
  assert.deepEqual(Object.keys(data.states).sort(),[...requiredClips[game]].sort(),`${game}: exact requested clip coverage`);
  assert(Array.isArray(data.eventInputs)&&data.eventInputs.every(e=>typeof e==='string'&&e.length>0));
  for(const input of base.eventInputs)assert(data.eventInputs.includes(input),`${game}: missing existing event input ${input}`);
  const clips=[];
  for(const [name,c] of Object.entries(data.states)){
   assert(!base.states[name],`${game}/${name} shadows an existing state`);assert.equal(c.clip,name);assert.equal(c.rootMotion,false);assert(Number.isFinite(c.durationSeconds)&&c.durationSeconds>0);assert.equal(typeof c.loop,'boolean');assert.deepEqual(c.interpolation,base.states.idle.interpolation);
   let previous=-1;assert.equal(c.keyframes[0].time,0);assert.equal(c.keyframes.at(-1).time,1);
   for(const k of c.keyframes){assert(k.time>previous&&k.time<=1);previous=k.time;assert.deepEqual(Object.keys(k.rotations).sort(),[...names].sort());for(const q of Object.values(k.rotations))assert(vec(q,4)&&Math.abs(length(q)-1)<1e-5);assert(distance(k.rotations.Root,[0,0,0,1])<1e-6);assert(vec(k.hipsOffsetMeters)&&vec(k.referenceRootTranslationMeters));}
   for(const e of c.events){assert(e.domain==='presentation');contactTiming(e,c.durationSeconds,`${game}/${name}: presentation event`,{pointRequired:true});assert(c.keyframes.some(k=>Math.abs(k.time-e.time)<1e-8));}
   assert(Array.isArray(c.ballContacts)&&Array.isArray(c.supportContacts)&&Array.isArray(c.equipmentContacts)&&Array.isArray(c.groundContacts));
   assert.equal(c.ballContactStatus,c.ballContacts.length?'authored':'none');if(game==='alpine')assert.equal(c.ballContacts.length,0);
   for(const b of c.ballContacts){contactTiming(b,c.durationSeconds,`${game}/${name}: ball contact`,{pointRequired:true});assert(names.includes(b.bone));assert(vec(b.localPointMeters)&&vec(b.pointMeters)&&vec(b.ballCenterMeters)&&Number.isFinite(b.ballRadiusMeters)&&b.ballRadiusMeters>0);assert(b.ballCenterMeters[1]-b.ballRadiusMeters>=-report.limits.floorMeters,`${game}/${name}: ball sphere penetrates floor`);assert(c.events.some(e=>e.name===b.event&&Math.abs(e.time-b.time)<1e-8));let world=forward(data.skeleton.bones,sample(c,b.time));assert(distance(point(world,b.bone,b.localPointMeters),b.pointMeters)<.0001,`${game}/${name}: ball FK`);assert(Math.abs(distance(b.pointMeters,b.ballCenterMeters)-b.ballRadiusMeters)<.0001);}
   for(const e of c.equipmentContacts){contactTiming(e,c.durationSeconds,`${game}/${name}: equipment contact`,{pointRequired:true});assert(c.events.some(p=>p.name===e.event&&Math.abs(p.time-e.time)<1e-8),`${game}/${name}: equipment marker`);}
   for(const g of c.groundContacts){contactTiming(g,c.durationSeconds,`${game}/${name}: ground contact`);if(g.event!==undefined)assert(c.events.some(e=>e.name===g.event&&Math.abs(e.time-g.time)<1e-8),`${game}/${name}: ground marker`);}
   for(const w of c.ballContactWindows||[]){contactTiming(w,c.durationSeconds,`${game}/${name}: ball contact window`,{windowRequired:true});assert(Array.isArray(w.bones)&&w.bones.length>0&&w.bones.every(b=>names.includes(b)));}
   for(const s of c.supportContacts){contactTiming(s,c.durationSeconds,`${game}/${name}: support contact`,{windowRequired:true});assert(['LeftFoot','RightFoot'].includes(s.bone));assert(['plant','ski-slide'].includes(s.mode));assert(s.mode!=='ski-slide'||game==='alpine');assert(s.startTime<s.endTime);assert(vec(s.anchorMeters)&&vec(s.effectorOffsetMeters));}
   let support=0,min=Infinity;
   const times=new Set([...c.keyframes.map(k=>k.time),...c.supportContacts.flatMap(s=>[s.startTime,s.endTime])]);let count=Math.ceil(c.durationSeconds*120);for(let i=0;i<=count;i++)times.add(i/count);
   for(const t of times){const p=sample(c,t),w=forward(data.skeleton.bones,p);min=Math.min(min,...names.filter(n=>n!=='Root').map(n=>w[n].position[1]),...['LeftFoot','RightFoot'].map(n=>point(w,n,[0,-.08,0])[1]));for(const s of c.supportContacts){if(t<s.startTime||t>s.endTime)continue;const v=add(point(w,s.bone,s.effectorOffsetMeters),p.referenceRootTranslationMeters);support=Math.max(support,s.mode==='ski-slide'?Math.abs(v[1]-s.anchorMeters[1]):distance(v,s.anchorMeters));}}
   assert(support<=.02,`${game}/${name}: canonical support ${support}`);assert(min>=-.001,`${game}/${name}: canonical joint/sole floor ${min}`);
   let loop=null;if(c.loop){const a=c.keyframes[0],b=c.keyframes.at(-1);loop={meters:distance(a.hipsOffsetMeters,b.hipsOffsetMeters),radians:Math.max(...names.map(n=>2*Math.acos(Math.min(1,Math.abs(dot(unit(a.rotations[n]),unit(b.rotations[n])))))))};assert(loop.meters<=.001&&loop.radians<=.01);}
   assert(data.transitions.some(t=>t.target===name),`${name}: missing entry recommendation`);assert(data.transitions.some(t=>t.source===name&&base.states[t.target]),`${name}: missing existing-state exit`);
   clips.push({clip:name,keyframes:c.keyframes.length,samples:times.size,support:{pass:true,maxAnchorErrorMeters:support},floor:{pass:true,minJointOrSoleY:min},loop:loop?{pass:true,...loop}:{pass:true,applicable:false},ballContacts:c.ballContacts.length});
  }
  for(const t of data.transitions){assert(t.source==='*'||data.states[t.source]||base.states[t.source]);assert(data.states[t.target]||base.states[t.target]);assert(data.eventInputs.includes(t.on),`${game}: transition event ${t.on} missing from inputs`);assert(t.visualBlendSeconds>0);assert.equal(t.blendCurve,'smoothstep');assert.equal(t.sourcePose,'current-displayed');assert.equal(t.sourceContinuation,'velocity-extrapolation');assert.equal(t.footLock,'carry-until-release');}
  report.games.push({game,clips,assetSha256:createHash('sha256').update(await readFile(resolve(here,game+'.json'))).digest('hex')});
 }
 report.pass=true;return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const r=await validate();console.log(JSON.stringify(r,null,2));}catch(e){console.error(e.stack);process.exitCode=1;}}
