#!/usr/bin/env node
// Asset verification only. Stage copies; never overwrite the repository's files.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,cp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {Quaternion,Vector3} from '../../../vendor/three.module.js';
import {sample} from '../../viewer/animation.js';
const here=dirname(fileURLToPath(import.meta.url)),island=resolve(here,'../../..');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const bytes=await readFile(resolve(island,'design/motion/alpine.json'));
const base=JSON.parse(bytes),extra=await json(resolve(here,'alpine.json'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const blob=b=>createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
const manifest=await json(resolve(here,'manifest.json'));
for(const source of manifest.sources)assert.equal(sha(await readFile(resolve(island,'../..',source.path))),source.sha256,`${source.path}: reference source changed`);
assert.equal(extra.sourceContract.gitBlobSha,blob(bytes),'baseline Git blob changed');
assert.deepEqual(extra.skeleton,base.skeleton,'canonical skeleton must match exactly');
const names=base.skeleton.bones.map(b=>b.name).sort(),all={...base.states,...extra.states};
const targetRig=await json(resolve(island,'design/characters/rig.json'));
const retargetMap=await json(resolve(island,'design/viewer/retarget-map.json'));
const V=a=>new Vector3().fromArray(a),Q=a=>new Quaternion().fromArray(a);
function sourceWorld(pose){
 const world={};
 for(const b of extra.skeleton.bones){
  const parent=world[b.parent]||{position:new Vector3(),rotation:new Quaternion()};
  const offset=V(b.restTranslationMeters);
  if(b.name==='Hips')offset.add(V(pose.hipsOffsetMeters));
  world[b.name]={position:offset.applyQuaternion(parent.rotation).add(parent.position),rotation:parent.rotation.clone().multiply(Q(pose.rotations[b.name]))};
 }
 return world;
}
function targetWorld(pose){
 const source=sourceWorld(pose),world={};
 for(const b of targetRig.joints){
  const entry=retargetMap.bones.find(m=>m.target===b.name),offset=V(b.translation);
  if(b.name==='Hips')offset.addScaledVector(V(pose.hipsOffsetMeters),retargetMap.motionScale);
  world[b.name]={position:offset.applyQuaternion(world[b.parent]?.rotation||new Quaternion()).add(world[b.parent]?.position||new Vector3()),rotation:source[entry.source||entry.inheritSource].rotation.clone().multiply(Q(entry.targetBasisWorldQuaternion))};
 }
 return world;
}
const summary={schemaVersion:1,baseCommit:manifest.baseCommit,assetSha256:sha(await readFile(resolve(here,'alpine.json'))),clips:[],pass:false};
for(const [name,c] of Object.entries(extra.states)){
 assert(!base.states[name],`${name}: base collision`);assert.equal(c.clip,name);assert.equal(c.rootMotion,false);assert(c.durationSeconds>0);
 assert.deepEqual(c.interpolation,base.states.glide.interpolation);assert.equal(c.keyframes[0].time,0);assert.equal(c.keyframes.at(-1).time,1);
 let previous=-1;
 for(const k of c.keyframes){assert(k.time>previous,`${name}: time ordering`);previous=k.time;assert.deepEqual(Object.keys(k.rotations).sort(),names);assert.deepEqual(k.rotations.Root,[0,0,0,1]);
  for(const q of Object.values(k.rotations))assert(q.length===4&&q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-8,`${name}: quaternion`);
  for(const key of ['hipsOffsetMeters','referenceRootTranslationMeters'])assert(k[key].length===3&&k[key].every(Number.isFinite));
 }
 for(const e of c.events){assert(e.time>=0&&e.time<=1);assert(Math.abs(e.atSeconds-e.time*c.durationSeconds)<1e-8);assert.equal(e.channel,'presentation');assert.equal(e.authoritative,false);}
 for(const field of ['supportContacts','groundContacts','attachmentContacts'])for(const contact of c[field])assert(contact.startTime>=0&&contact.endTime<=1&&contact.startTime<contact.endTime,`${name}: ${field} interval`);
 for(const c0 of c.supportContacts){assert(['LeftFoot','RightFoot'].includes(c0.bone));assert.equal(c0.mode,'ski-slide');}
 for(const c0 of c.equipmentContacts)assert(c.events.some(e=>e.name===c0.event&&e.time===c0.time),`${name}: equipment marker missing`);
 if(c.loop){const [a,b]=[c.keyframes[0],c.keyframes.at(-1)];for(const n of names)assert(Math.abs(a.rotations[n].reduce((s,v,i)=>s+v*b.rotations[n][i],0))>1-1e-8,`${name}: loop rotation`);assert.deepEqual(a.hipsOffsetMeters,b.hipsOffsetMeters);}
 assert(extra.transitions.some(t=>t.target===name)&&extra.transitions.some(t=>t.source===name),`${name}: missing entry/exit recommendation`);
 summary.clips.push({clip:name,durationSeconds:c.durationSeconds,keyframes:c.keyframes.length,presentationEvents:c.events.length,supportContacts:c.supportContacts.length,equipmentContacts:c.equipmentContacts.length,groundContacts:c.groundContacts.length,pass:true});
}
for(const dir of ['forward','backward','side']){
 const a=extra.states['fall_'+dir].keyframes.at(-1),b=extra.states['recover_'+dir].keyframes[0];assert.deepEqual(a.rotations,b.rotations);assert.deepEqual(a.hipsOffsetMeters,b.hipsOffsetMeters);
}
for(const t of extra.transitions){assert(all[t.source]&&all[t.target],`unknown transition endpoint ${t.source}->${t.target}`);assert(t.visualBlendSeconds>=.12);assert.equal(t.blendCurve,'smoothstep');assert.equal(t.sourceContinuation,'velocity-extrapolation');}
summary.trickRotations={};
for(const [name,axis,expected] of [['air_spin_180','y',180],['air_spin_360','y',360],['air_easy_flip','x',360]]){
 const keys=extra.states[name].keyframes;let accumulated=0;
 for(let i=1;i<keys.length;i++){
  const delta=Q(keys[i-1].rotations.Hips).invert().multiply(Q(keys[i].rotations.Hips));
  if(delta.w<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w);
  const increment=2*Math.atan2(delta[axis],delta.w);assert(increment>=-1e-7&&increment<Math.PI/2,`${name}: reverse spin or ambiguous interpolation arc`);accumulated+=increment;
 }
 const degrees=accumulated*180/Math.PI;assert(Math.abs(degrees-expected)<1e-5,`${name}: incorrect accumulated rotation`);
 summary.trickRotations[name]={expectedDegrees:expected,measuredDegrees:degrees,pass:true};
}
const grip=extra.states.air_grab.equipmentContacts.find(c=>c.kind==='grab');
let sourceGripError=0,targetGripError=0;
for(let i=0;i<=50;i++){
 const time=grip.startTime+(grip.endTime-grip.startTime)*i/50;
 const pose=sample(extra.states.air_grab,time*extra.states.air_grab.durationSeconds,false),s=sourceWorld(pose),t=targetWorld(pose);
 sourceGripError=Math.max(sourceGripError,s.LeftHand.position.distanceTo(V(grip.targetLocalPointMeters).applyQuaternion(s.LeftFoot.rotation).add(s.LeftFoot.position)));
 targetGripError=Math.max(targetGripError,t.LeftHand.position.distanceTo(V(grip.referenceRigTargetLocalPointMeters).applyQuaternion(t.LeftFoot.rotation).add(t.LeftFoot.position)));
}
assert(sourceGripError<=.02&&targetGripError<=.02,'Grab must actually reach the ski throughout the hold on both rigs');
summary.grab={samples:51,sourceMaxErrorMeters:sourceGripError,skierMaxErrorMeters:targetGripError,toleranceMeters:.02,pass:true};
if(process.argv.includes('--assets-only')){console.log(JSON.stringify({clips:summary.clips.length,trickRotations:summary.trickRotations,grab:summary.grab,pass:true},null,2));process.exit(0);}
const stage=await mkdtemp(resolve(tmpdir(),'island-alpine-motion2-'));
const out=resolve(here,'verification');await mkdir(out,{recursive:true});
try{
 for(const dir of ['design/viewer','design/characters','design/motion','vendor'])await cp(resolve(island,dir),resolve(stage,dir),{recursive:true});
 const combined={...base,states:all,transitions:[...extra.transitions,...base.transitions],eventInputs:[...new Set([...base.eventInputs,...extra.eventInputs])]};
 await writeFile(resolve(stage,'design/motion/alpine.json'),JSON.stringify(combined));
 const evidence=['test-viewer.mjs','checks.js','animation.js','retarget.js','retarget-map.json','viewer.js','viewer.html'];
 summary.unchangedViewerSha256={};for(const f of evidence){const a=await readFile(resolve(island,'design/viewer',f)),b=await readFile(resolve(stage,'design/viewer',f));assert.equal(sha(a),sha(b));summary.unchangedViewerSha256[f]=sha(a);}
 summary.stagedCombinedSha256=sha(await readFile(resolve(stage,'design/motion/alpine.json')));
 const args=[resolve(stage,'design/viewer/test-viewer.mjs'),'--character','skier','--game','alpine','--out',out];
 if(process.env.PLAYWRIGHT_EXECUTABLE_PATH)args.push('--executable',process.env.PLAYWRIGHT_EXECUTABLE_PATH);
 console.log('Running unchanged design/viewer/test-viewer.mjs on every new clip plus baseline, two viewports.');
 const code=await new Promise((accept,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env});child.on('error',reject);child.on('exit',accept);});
 const report=await json(resolve(out,'report.json'));
 summary.viewerExitCode=code;summary.pass=code===0&&report.pass===true;
 for(const c of summary.clips){c.viewerCases=report.cases.map(v=>{const support=v.report?.checks?.support?.clips?.find(s=>s.clip===c.clip);return {viewport:v.viewport,support,transitionCases:v.report?.checks?.transition?.cases?.filter(t=>t.source===c.clip||t.target===c.clip).length||0,pass:v.pass===true&&support?.pass===true};});if(!c.viewerCases.every(v=>v.pass)){c.pass=false;summary.pass=false;}}
 await writeFile(resolve(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 if(process.argv.includes('--keep-stage'))console.log(`Stage retained: ${stage}`);
 else await rm(stage,{recursive:true,force:true});
 assert(summary.pass,'Viewer verification failed; inspect verification/report.json. Acceptance limits were not changed.');
 console.log(`PASS ${summary.clips.length} new clips in both viewports.`);
}catch(error){console.error(`Stage retained for diagnosis: ${stage}`);throw error;}
