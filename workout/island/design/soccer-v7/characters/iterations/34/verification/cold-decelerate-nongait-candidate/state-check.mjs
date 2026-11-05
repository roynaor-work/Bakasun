/** State/alias/prediction checks; no renderer, assets or motion data are changed. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '/workspace/Bakasun/workout/island/design/soccer-v7/characters/vendor/three.module.js';
import {sampleClip} from '/workspace/Bakasun/workout/island/design/soccer-v7/characters/source/motion-runtime.js';
import {LocomotionSpace} from '/tmp/soccer-v7-cold-nongait-v3/locomotion-space.js';
import {createLocomotionCurve} from '/workspace/Bakasun/workout/island/design/soccer-v7/characters/source/locomotion-curve.js';

const root='/workspace/Bakasun/workout/island/design/soccer-v7/characters';
const motionBytes=await fs.readFile(path.join(root,'animations.json'));
const motion=JSON.parse(motionBytes),clips=motion.clips;
const sample=(clip,seconds)=>sampleClip(THREE,clip,seconds);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const create=()=>new LocomotionSpace(THREE,clips,sample,motion.skeleton);
function seeded(id,phase){
  const motor=create(),clip=clips.find(c=>c.id===id);
  motor.seedSourceClip=clip;
  const feet=motor.sourceFK(phase);
  return motor.reset({speed:clip.speedMps||0,phase,sourceClip:id,feet,idleSeconds:phase*clip.duration});
}
function advanceUntil(motor,test,maximum=5){
  const limit=motor.clock+maximum;
  while(!test(motor)&&motor.clock<limit)motor.step(1/120);
  assert.ok(test(motor),'The requested state was not reached within the bound');
  return motor;
}
const cases=[];
cases.push(['idle',seeded('idle',.18)]);
cases.push(['inherited-swing',seeded('sprint',.85)]);
const running=seeded('run_3',.18);running.request('run_3');for(let i=0;i<60;i++)running.step(1/120);cases.push(['running',running]);
const stopping=seeded('sprint',.5);stopping.request('idle');advanceUntil(stopping,m=>Object.values(m.feet).some(f=>f.mode==='settle'));cases.push(['neutral-settle',stopping]);
const stopped=stopping.clone();advanceUntil(stopped,m=>m.speed===0&&Object.values(m.feet).every(f=>f.mode==='plant'&&Math.abs(f.anchor[2]-m.distance)<.012));cases.push(['settled-idle',stopped]);

const rows=[];let predictionCases=0,lightweightSnapshotChecks=0,maximumPredictionComponentError=0,maximumScalarError=0,linkedRecordChecks=0,infiniteEndChecks=0,geometryCloneChecks=0;
const body=running.pose();running.geometry={measuredAt:running.clock,hips:{LeftFoot:{x:.1,y:.86+body.hipsOffsetMeters[1],z:body.hipsOffsetMeters[2]},RightFoot:{x:-.1,y:.86+body.hipsOffsetMeters[1],z:body.hipsOffsetMeters[2]}}};
for(const [name,motor]of cases){
  const before=motor.exportState(),clone=motor.clone(),copy=create().copyFrom(motor),restored=create().restore(before);
  assert.deepEqual(clone.exportState(),before,name+': clone fidelity');
  assert.deepEqual(copy.exportState(),before,name+': copyFrom fidelity');
  assert.deepEqual(restored.exportState(),before,name+': restore fidelity');
  for(const [side,foot]of Object.entries(motor.feet)){
    if(foot.stanceEndPhase===Infinity){for(const sibling of [clone,copy,restored])assert.equal(sibling.feet[side].stanceEndPhase,Infinity);infiniteEndChecks++;}
    if(foot.record){
      for(const sibling of [clone,copy,restored]){
        assert.equal(sibling.feet[side].record,sibling.heelRecords.find(r=>r.id===foot.record.id),name+': record graph alias');
        assert.notEqual(sibling.feet[side].record,foot.record,name+': no cross-instance record alias');
        linkedRecordChecks++;
      }
    }
  }
  const mutable=Object.values(clone.feet).find(f=>f.record&&!f.record.release);
  if(mutable){const record=mutable.record;clone.takeoff(mutable,'clone-only-check');assert.equal(clone.heelRecords.find(r=>r.id===record.id),record);assert.equal(record.release.reason,'clone-only-check');}
  clone.feet.LeftFoot.position[0]+=1;copy.feet.RightFoot.anchor[2]-=1;if(clone.geometry?.hips){clone.geometry.hips.LeftFoot.x+=1;geometryCloneChecks++;}
  assert.deepEqual(motor.exportState(),before,name+': clone mutations do not leak');
  for(const dt of [0,.0001,1/240,1/120,1/30,.1]){
    const predicted=motor.predict(dt),future=motor.clone();future.step(dt);
    const lightweight=motor.clone(),lean=lightweight.step(dt,null,{includeHistory:false});
    assert.deepEqual(lightweight.exportState(),future.exportState(),name+': omitting returned history does not change physical state');
    assert.equal(lean.historyIncluded,false);assert.deepEqual(lean.heelRecords,[]);assert.deepEqual(lean.requests,[]);lightweightSnapshotChecks++;
    const actual=future.pose();predictionCases++;
    for(const [predictedValue,actualValue]of [[predicted.clock,future.clock],[predicted.actualSpeed,future.speed],[predicted.unwrappedPhase,future.phase],[predicted.rootDistance,future.distance]])maximumScalarError=Math.max(maximumScalarError,Math.abs(predictedValue-actualValue));
    for(const bone of Object.keys(actual.rotations))for(let k=0;k<4;k++)maximumPredictionComponentError=Math.max(maximumPredictionComponentError,Math.abs(predicted.pose.rotations[bone][k]-actual.rotations[bone][k]));
    for(let k=0;k<3;k++)maximumPredictionComponentError=Math.max(maximumPredictionComponentError,Math.abs(predicted.pose.hipsOffsetMeters[k]-actual.hipsOffsetMeters[k]));
    assert.deepEqual(motor.exportState(),before,name+': prediction is nonmutating');
    assert.deepEqual(motor.predictPose(dt),predicted.pose,name+': pose-only helper matches full prediction');
  }
  rows.push({name,footModes:Object.fromEntries(Object.entries(motor.feet).map(([side,foot])=>[side,foot.mode])),infiniteStanceEnds:Object.values(motor.feet).filter(f=>f.stanceEndPhase===Infinity).length,heelRecords:motor.heelRecords.length,pass:true});
}
assert.ok(maximumScalarError<1e-12,'Future scalar integration differs from a separately stepped clone');
assert.ok(maximumPredictionComponentError<1e-12,'Future body target differs from a separately stepped clone');
assert.ok(infiniteEndChecks>=4,'Idle and settled idle must retain both persistent stance ends');
assert.ok(linkedRecordChecks>0,'The check must exercise live heel record references');
let transientCallbackChecks=0;
const transient=()=>{throw Error('A cloned motor must never retain the old Actor callback');};
const ordinaryGeometry=structuredClone(running.geometry);running.geometry.predictWorldReach=transient;
for(const sibling of [running.clone(),create().copyFrom(running),create().restore(running.exportState())]){
  assert.deepEqual(sibling.geometry,ordinaryGeometry,'Clone retains numeric geometry but drops transient callbacks');
  assert.equal(sibling.geometry.predictWorldReach,undefined);transientCallbackChecks++;
}
assert.equal(running.geometry.predictWorldReach,transient,'Export does not alter the live Actor binding');
delete running.geometry.predictWorldReach;
const curved=seeded('idle',.18),curve=createLocomotionCurve({origin:[2,0,-1],yaw:Math.PI,radius:8});
const curveGeometry=()=>curve.geometryFromWorldHips({distance:curved.distance,measuredAt:curved.clock,hips:{LeftFoot:[1.9,.80,-1],RightFoot:[2.1,.80,-1]}});
curved.request('run_1');curved.step(1/120,curveGeometry());
assert.equal(curved.feet.LeftFoot.reachPrediction.worldPrediction.kind,'exact-circle-world-reach');
const curvedClone=curved.clone();assert.equal(curvedClone.geometry.predictWorldReach,undefined);
assert.throws(()=>curvedClone.step(1/120),/Rebind curved world geometry/);
assert.doesNotThrow(()=>curvedClone.predictPose(1/120),'Numeric body prediction does not step feet');
assert.doesNotThrow(()=>curvedClone.step(1/120,curveGeometry()),'A fresh world binding restores curved feet stepping');
const snapshot=curved.snapshot(),released=snapshot.heelRecords.find(r=>r.release);
if(released){released.release.reason='caller-only';assert.notEqual(curved.heelRecords.find(r=>r.id===released.id).release.reason,'caller-only');}
transientCallbackChecks+=3;
assert.equal(digest(await fs.readFile(path.join(root,'animations.json'))),digest(motionBytes),'Source motion remains unchanged');
const sourceBytes=await fs.readFile('/tmp/soccer-v7-cold-nongait-v3/locomotion-space.js');
const report={kind:'locomotion-state-and-prediction-fidelity',generatedAt:new Date().toISOString(),pass:true,method:'Compare structured-cloned export/restore/clone/copyFrom states, Infinity and intra-state heel aliases, cross-instance mutation isolation, callback exclusion/rebinding, optional returned-history omission, and nonmutating body predictions against independently advanced motor clones at six time offsets. No mesh, renderer, asset or straight numerical motion rule is changed.',source:{file:'source/locomotion-space.js',sha256:digest(sourceBytes)},motion:{file:'animations.json',sha256:digest(motionBytes)},cases:rows,predictionCases,lightweightSnapshotChecks,infiniteEndChecks,linkedRecordChecks,geometryCloneChecks,transientCallbackChecks,curvedCallbackMetricAndRebinding:true,maximumScalarError,maximumPredictionComponentError,limits:['This verifies state ownership and body-target prediction, not the final integrated viewer, all16 geometry or physical phone FPS.','The earlier69-case browser proof remains a historical pre-serialization-fix snapshot; final integrated audits must stamp this source.']};
await fs.writeFile('/tmp/soccer-v7-cold-nongait-v3/state-proof.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:true,cases:rows.length,predictionCases,lightweightSnapshotChecks,infiniteEndChecks,linkedRecordChecks,geometryCloneChecks,transientCallbackChecks,maximumScalarError,maximumPredictionComponentError}));
