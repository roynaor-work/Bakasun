// SPDX-License-Identifier: CC0-1.0
// Original numerical defect fixtures, independent of authored clip data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeClip,METRICS} from '../metrics.mjs';

const copy=value=>structuredClone(value);
function standing() {
  const joints={Root:[0,0,0],Hips:[0,1,0],Spine:[0,1.2,0],Chest:[0,1.4,0],Neck:[0,1.5,0],Head:[0,1.7,0]};
  for(const [side,sign] of [['Left',1],['Right',-1]]) {
    Object.assign(joints,{[side+'Arm']:[sign*.2,1.4,0],[side+'ForeArm']:[sign*.25,1.1,.05],
      [side+'Hand']:[sign*.3,.85,.1],[side+'UpLeg']:[sign*.1,.95,0],
      [side+'Leg']:[sign*.1,.52,.01],[side+'Foot']:[sign*.1,.08,0]});
  }
  return Array.from({length:61},(_,i)=>({t:i/60,joints:copy(joints),root:[0,0,0],
    rotations:Object.fromEntries(Object.keys(joints).map(name=>[name,[0,0,0,1]])),
    floorPoints:[{bone:'LeftFoot',position:[.1,0,0]},{bone:'RightFoot',position:[-.1,0,0]}],
    ball:[.42,.85,.1]}));
}
const metadata={rootMotion:false,soleOffset:.08,
  supports:['LeftFoot','RightFoot'].map(bone=>({bone,start:0,end:1,local:[0,-.08,0]})),
  ball:{radius:.12},events:[{type:'contact',time:.5,bone:'LeftHand',local:[0,0,0]}]};
function measure(frames=standing(),extra={}) {
  return analyzeClip({frames,duration:1,height:1.7,metadata:copy(metadata),idleFrames:standing(),clipId:'synthetic',sport:'hoops',...extra});
}
const increased=(before,after,id)=>{
  assert.ok(Number.isFinite(before.metrics[id].value),`${id} baseline must be measurable`);
  assert.ok(after.metrics[id].value>before.metrics[id].value,`${id}: ${after.metrics[id].value} should exceed ${before.metrics[id].value}`);
};

test('all requested metrics expose reproducible thresholds and bounded score',()=>{
  assert.deepEqual(Object.keys(METRICS).sort(),['anatomy','ballContact','bodySliding','continuity','floorPenetration','footSliding','posePops','symmetry'].sort());
  for(const definition of Object.values(METRICS)) {
    assert.ok(Number.isFinite(definition.green)&&Number.isFinite(definition.yellow));
    assert.ok(definition.yellow>definition.green);
    assert.ok(definition.description&&definition.unit);
  }
  const result=measure();
  assert.ok(result.score>=0&&result.score<=100);
  assert.equal(result.metrics.bodySliding.status,'not-applicable');
});

test('supported foot drift is measured rather than hidden by static root',()=>{
  const frames=standing();
  for(const frame of frames) frame.joints.LeftFoot[0]+=.5*frame.t;
  increased(measure(),measure(frames),'footSliding');
  assert.equal(measure(frames).metrics.footSliding.status,'red');
});

test('floor intrusion uses supplied sole surface points',()=>{
  const frames=standing();
  frames[30].floorPoints[0].position[1]=-.15;
  increased(measure(),measure(frames),'floorPenetration');
  assert.equal(measure(frames).metrics.floorPenetration.status,'red');
});

test('isolated adjacent-frame jump produces a pose-pop warning',()=>{
  const frames=standing();
  frames[30].joints.Head[0]+=.5;
  increased(measure(),measure(frames),'posePops');
  assert.equal(measure(frames).metrics.posePops.status,'red');
});

test('impossible folded elbows produce anatomical violations',()=>{
  const frames=standing();
  for(const frame of frames) frame.joints.LeftHand=[.2,1.39,0];
  increased(measure(),measure(frames),'anatomy');
});

test('ball metric measures radius-adjusted gap at declared contact time',()=>{
  const frames=standing();
  for(const frame of frames)frame.ball[0]+=1;
  increased(measure(),measure(frames),'ballContact');
  assert.equal(measure(frames).metrics.ballContact.status,'red');
});

test('entry and exit mismatch against idle degrades continuity',()=>{
  const frames=standing();
  for(const frame of frames)frame.joints.Head[0]+=.4;
  increased(measure(),measure(frames),'continuity');
});

test('body travel without stance sweep flags body sliding',()=>{
  const frames=standing();
  for(const frame of frames) {
    frame.root[2]=frame.t;
    for(const position of Object.values(frame.joints))position[2]+=frame.t;
  }
  const result=measure(frames,{metadata:{...copy(metadata),rootMotion:true,locomotion:true}});
  assert.equal(result.metrics.bodySliding.status,'red');
  assert.ok(result.metrics.bodySliding.value>0);
});

test('unequal bilateral limb lengths flag structural asymmetry',()=>{
  const frames=standing();
  for(const frame of frames) {
    frame.joints.RightForeArm=[-.21,1.34,.01];
    frame.joints.RightHand=[-.22,1.29,.02];
  }
  increased(measure(),measure(frames),'symmetry');
  assert.equal(measure(frames).metrics.symmetry.status,'red');
});

test('missing contact and idle data remain explicitly unmeasured',()=>{
  const result=measure(standing(),{metadata:{rootMotion:false},idleFrames:undefined});
  assert.ok(['not-applicable','insufficient-data'].includes(result.metrics.ballContact.status));
  assert.equal(result.metrics.continuity.status,'insufficient-data');
  assert.equal(result.metrics.continuity.value,null);
  assert.ok(result.coverage<1);
  assert.ok(result.score<measure().score,'Missing applicable data must not improve ranking');
});

test('contact offsets rotate with the sampled world bone quaternion',()=>{
  const frames=standing();
  for(const frame of frames) {
    frame.rotations.LeftHand=[0,0,Math.SQRT1_2,Math.SQRT1_2];
    frame.ball=[.3,1.07,.1];
  }
  const meta={...copy(metadata),events:[{type:'contact',time:.505,bone:'LeftHand',local:[.1,0,0]}]};
  const result=measure(frames,{metadata:meta});
  assert.ok(result.metrics.ballContact.value<1e-6);
  assert.equal(result.metrics.ballContact.status,'green');
});

test('held contact windows detect gaps between their endpoints',()=>{
  const meta={...copy(metadata),events:[],ballContacts:[{bone:'LeftHand',start:.2,end:.8,local:[0,0,0]}]};
  const frames=standing();frames[36].ball[0]+=.5;
  increased(measure(standing(),{metadata:meta}),measure(frames,{metadata:meta}),'ballContact');
  assert.equal(measure(frames,{metadata:meta}).metrics.ballContact.status,'red');
});

test('calibrated knee hinge direction catches reverse bend below flexion limit',()=>{
  const frames=standing();
  for(const frame of frames)frame.joints.LeftFoot[2]=.4;
  const result=measure(frames,{metadata:{...copy(metadata),checkHingeDirection:true}});
  assert.equal(result.metrics.anatomy.status,'red');
  assert.ok(result.metrics.anatomy.evidence.violations.some(item=>item.kind==='reverse-knee'));
});

test('gait symmetry detects one-sided motion even when limb lengths stay equal',()=>{
  const meta={...copy(metadata),loop:true};
  const frames=standing();
  for(const frame of frames)for(const name of ['LeftUpLeg','LeftLeg','LeftFoot'])frame.joints[name][1]+=.6*Math.sin(frame.t*Math.PI*2);
  const baseline=measure(standing(),{metadata:meta,clipId:'run'});
  const result=measure(frames,{metadata:meta,clipId:'run'});
  increased(baseline,result,'symmetry');
  assert.equal(result.metrics.symmetry.evidence.mode,'gait');
  assert.ok(result.metrics.symmetry.evidence.motionRmsHeight>0);
});

test('invalid nonfinite poses, duplicate times, and zero quaternions fail visibly',()=>{
  for(const mutate of [frames=>{frames[1].t=frames[0].t;},frames=>{frames[1].joints.Head[0]=NaN;},
    frames=>{frames[1].rotations.Head=[0,0,0,0];}]) {
    const frames=standing();mutate(frames);assert.throws(()=>measure(frames));
  }
});

test('metric grading remains invariant under uniform character scale',()=>{
  const frames=standing();
  frames[30].floorPoints[0].position[1]=-.03;
  const small=measure(frames);
  const large=copy(frames);
  for(const frame of large) {
    for(const p of Object.values(frame.joints))for(let i=0;i<3;i++)p[i]*=2;
    for(const point of frame.floorPoints)for(let i=0;i<3;i++)point.position[i]*=2;
    for(let i=0;i<3;i++)frame.ball[i]*=2;
  }
  const largeMetadata=copy(metadata);
  largeMetadata.soleOffset*=2;
  largeMetadata.ball.radius*=2;
  for(const support of largeMetadata.supports)support.local=support.local.map(v=>2*v);
  const big=measure(large,{height:3.4,metadata:largeMetadata,idleFrames:large});
  assert.equal(small.metrics.floorPenetration.status,big.metrics.floorPenetration.status);
  assert.ok(Math.abs(small.metrics.floorPenetration.value-big.metrics.floorPenetration.value)<1e-6);
});

// Generic presentation contact may mean a plant rather than a ball touch.
test('ball-less action contact cue is not a missing ball measurement',()=>{
 const result=measure(standing(),{metadata:{ballVisible:false,events:[{type:'contact',time:.5}]}});
 assert.equal(result.metrics.ballContact.status,'not-applicable');
});
test('non-foot joint intrusion remains visible alongside valid sole probes',()=>{
 const frames=standing();frames[30].joints.LeftHand[1]=-.2;
 const result=measure(frames);
 assert.equal(result.metrics.floorPenetration.status,'red');
 assert.equal(result.metrics.floorPenetration.evidence.worst.bone,'LeftHand');
});
