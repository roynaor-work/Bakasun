// SPDX-License-Identifier: CC0-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyzeClip,METRICS} from './metrics.mjs';
import {analyzeClip as upstreamAnalyze,METRICS as upstreamDefinitions} from './legacy-metrics.mjs';
import {loadLibraries} from './sources.mjs';
import {headingNeutralJoints} from './hockey-source.mjs';
import {qrotate} from '../../minigames/athletes-core.mjs';

const I=[0,0,0,1],clone=v=>structuredClone(v);
function fixture({speed=2,referenceSpeed=speed,sideSpeed=0,lift=0,roll=0,mode='glide',brake=false}={}){
 const frames=Array.from({length:61},(_,i)=>{
  const t=i/60,z=brake?2*t-t*t:speed*t,referenceZ=brake?z:referenceSpeed*t;
  const root=[sideSpeed*t,0,z];
  const joints={Root:root,LeftFoot:[-.2+sideSpeed*t,.08+lift,z],RightFoot:[.2+sideSpeed*t,.08+lift,z]};
  return{t,root,joints,rotations:{Root:I,LeftFoot:[0,0,Math.sin(roll/2),Math.cos(roll/2)],RightFoot:I},referenceRoot:[0,0,referenceZ],localJoints:{Root:[0,0,0],LeftFoot:[-.2,.08,0],RightFoot:[.2,.08,0]},assetRoot:[0,0,0]};
 });
 const supports=['LeftFoot','RightFoot'].map(bone=>({bone,start:0,end:1,local:[0,-.08,0],mode,...(mode==='brake'?{expectedVelocity:[{timeSeconds:0,velocityMps:[0,0,2]},{timeSeconds:1,velocityMps:[0,0,0]}]}:{})}));
 return{frames,duration:1,height:1.85,metadata:{locomotion:true,contactModel:'blade',supports,referenceTravelKnown:true,soleLocal:[0,-.08,0],floorY:0,ballVisible:false},idleFrames:frames,clipId:'skate_fixture',sport:'hockey'};
}

test('upstream thresholds, weights and planted metric results are unchanged',async()=>{
 assert.deepEqual(METRICS,upstreamDefinitions);
 const libraries=await loadLibraries({only:['hockey-v1']});
 for(const clip of libraries[0].clips){
  const idle=libraries[0].clips.find(c=>/ready|stance/.test(c.id)&&c.role===clip.role&&c.id!==clip.id)??libraries[0].clips.find(c=>/ready|stance/.test(c.id)&&c.role===clip.role);
  const args={frames:clip.frames,duration:clip.duration,height:clip.height,metadata:clip.metadata,idleFrames:idle?.frames,clipId:clip.id,sport:'hockey'};
  assert.deepEqual(analyzeClip(args),upstreamAnalyze(args),clip.id);
 }
});
test('legal longitudinal glide passes blade contact and independent velocity',()=>{
 const result=analyzeClip(fixture());
 assert.equal(result.metrics.footSliding.status,'green');
 assert.equal(result.metrics.bodySliding.status,'green');
 assert.equal(result.metrics.footSliding.evidence.maxLateralResidualMeters,0);
 assert.equal(result.metrics.footSliding.evidence.windows,2);
});
test('legacy planted metric still rejects the same legal glide',()=>{
 const f=fixture();delete f.metadata.contactModel;
 assert.equal(analyzeClip(f).metrics.footSliding.status,'red');
 assert.equal(analyzeClip(f).metrics.bodySliding.status,'red');
});
test('a tilted sole plane fails even when the contact center stays on the ice',()=>{
 assert.equal(analyzeClip(fixture({roll:Math.PI/6})).metrics.footSliding.status,'red');
});
test('a lifted blade falsely declared in contact fails',()=>{
 assert.equal(analyzeClip(fixture({lift:.12})).metrics.footSliding.status,'red');
});
test('illegal lateral skating is not forgiven as longitudinal glide',()=>{
 assert.equal(analyzeClip(fixture({sideSpeed:1})).metrics.footSliding.status,'red');
});
test('actual/reference speed and direction mismatch both fail',()=>{
 assert.equal(analyzeClip(fixture({referenceSpeed:5})).metrics.bodySliding.status,'red');
 const f=fixture();for(const frame of f.frames)frame.referenceRoot=[0,0,-2*frame.t];
 assert.equal(analyzeClip(f).metrics.bodySliding.status,'red');
});
test('missing and zero reference travel cannot earn a locomotion pass',()=>{
 const missing=fixture();missing.metadata.referenceTravelKnown=false;
 assert.equal(analyzeClip(missing).metrics.bodySliding.status,'insufficient-data');
 assert.equal(analyzeClip(fixture({referenceSpeed:0})).metrics.bodySliding.status,'insufficient-data');
});
test('shortened contact windows cannot hide all contact observations',()=>{
 const f=fixture();for(const window of f.metadata.supports)window.end=.03;
 assert.equal(analyzeClip(f).metrics.footSliding.status,'insufficient-data');
});
test('declared braking permits its independently requested lateral velocity only',()=>{
 const f=fixture({brake:true,mode:'brake'});
 for(const frame of f.frames){frame.rotations.LeftFoot=[0,Math.SQRT1_2,0,Math.SQRT1_2];frame.rotations.RightFoot=frame.rotations.LeftFoot;}
 assert.equal(analyzeClip(f).metrics.footSliding.status,'green');
 for(const window of f.metadata.supports)for(const key of window.expectedVelocity)key.velocityMps=[0,0,0];
 assert.equal(analyzeClip(f).metrics.footSliding.status,'red');
});
test('braking cannot silently omit the independent expected-velocity track',()=>{
 const f=fixture({mode:'brake'});for(const w of f.metadata.supports)delete w.expectedVelocity;
 assert.equal(analyzeClip(f).metrics.footSliding.status,'insufficient-data');
});
test('a pivot contact must keep its declared anchor stationary',()=>{
 assert.equal(analyzeClip(fixture({mode:'pivot'})).metrics.footSliding.status,'red');
});
test('heading normalization removes yaw while preserving body height and pitch errors',()=>{
 const joints={Root:[0,0,0],Hips:[0,.9,0],LeftHand:[.4,1.2,.3]},q=[0,Math.sin(.7),0,Math.cos(.7)];
 const yawed=Object.fromEntries(Object.entries(joints).map(([n,p])=>[n,qrotate(q,p)]));
 const neutral=headingNeutralJoints(yawed,q);
 for(const name of Object.keys(joints))for(let i=0;i<3;i++)assert.ok(Math.abs(neutral[name][i]-joints[name][i])<1e-9);
 yawed.LeftHand[1]+=.3;
 assert.ok(Math.abs(headingNeutralJoints(yawed,q).LeftHand[1]-joints.LeftHand[1]-.3)<1e-9);
 const pitch=[Math.sin(.4),0,0,Math.cos(.4)],pitched=Object.fromEntries(Object.entries(joints).map(([n,p])=>[n,qrotate(pitch,p)]));
 assert.ok(Math.abs(headingNeutralJoints(pitched,pitch).Hips[2]-joints.Hips[2])>.5);
});
test('turn continuity still rejects a wrong endpoint limb pose',async()=>{
 const library=(await loadLibraries({only:['hockey-v2']}))[0];
 const turn=library.clips.find(c=>c.id==='skate_turn_180'),idle=library.clips.find(c=>c.id==='ready_1');
 const args={frames:turn.frames,duration:turn.duration,height:turn.height,metadata:turn.metadata,idleFrames:idle.frames,clipId:turn.id,sport:'hockey'};
 assert.notEqual(analyzeClip(args).metrics.continuity.status,'red');
 const broken=clone(args);broken.frames.at(-1).localJoints.LeftHand[1]+=1.85;
 assert.equal(analyzeClip(broken).metrics.continuity.status,'red');
});
test('legacy CLI sampler reproduces all v1 published metric values',async()=>{
 const libraries=await loadLibraries({only:['hockey-v1'],legacy:true});
 const published=JSON.parse(await readFile(new URL('../hockey-v1-fix/evidence/after/codex-qa/report.json',import.meta.url),'utf8')).libraries[0].clips;
 const clips=libraries[0].clips,idles=clips.filter(c=>/ready|stance/.test(c.id));
 for(const clip of clips){
  const idle=idles.find(c=>c.role===clip.role&&c.id!==clip.id)??idles.find(c=>c.role===clip.role);
  const mirrorId=clip.id.includes('_left')?clip.id.replace('_left','_right'):clip.id.includes('_right')?clip.id.replace('_right','_left'):null;
  const mirror=clips.find(c=>c.id===mirrorId);
  const metadata=mirror?{...clip.metadata,mirrorFrames:mirror.frames}:clip.metadata;
  const result=analyzeClip({frames:clip.frames,duration:clip.duration,height:clip.height,metadata,idleFrames:idle?.frames,clipId:clip.id,sport:'hockey'});
  const prior=published.find(c=>c.id===clip.id);
  assert.equal(result.score,prior.score,clip.id+' score');
  for(const [id,metric]of Object.entries(result.metrics)){assert.equal(metric.value,prior.metrics[id].value,clip.id+' '+id);assert.equal(metric.status,prior.metrics[id].status,clip.id+' '+id+' status');}
 }
});
