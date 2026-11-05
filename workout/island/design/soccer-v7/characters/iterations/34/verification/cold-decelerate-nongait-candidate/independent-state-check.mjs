import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '/workspace/Bakasun/workout/island/design/soccer-v7/characters/vendor/three.module.js';
import {sampleClip} from '/workspace/Bakasun/workout/island/design/soccer-v7/characters/source/motion-runtime.js';
import {LocomotionSpace} from '/tmp/soccer-v7-cold-nongait-v3/locomotion-space.js';
const motion=JSON.parse(await fs.readFile('/workspace/Bakasun/workout/island/design/soccer-v7/characters/animations.json','utf8'));
const create=()=>new LocomotionSpace(THREE,motion.clips,(clip,time)=>sampleClip(THREE,clip,time),motion.skeleton);
const rows=[];let cloneCases=0,footChecks=0,coverageSteps=0,maximumResetFootError=0;
for(const id of ['decelerate','run_1','sprint','dribble']){
  const clip=motion.clips.find(c=>c.id===id);
  for(const phase of [0,.033333,.1,.18,.3,.5,.7,.85,.999]){
    const motor=create();motor.seedSourceClip=clip;const feet=motor.sourceFK(phase);
    const speed=id==='decelerate'?6*(1-phase)**2:clip.speedMps;
    motor.reset({speed,phase,sourceClip:id,feet});const initial=motor.snapshot();
    const groundedSourceSupports=[];
    for(const name of ['LeftFoot','RightFoot']){
      const f=motor.feet[name],s=feet[name],authored=clip.contacts.some(c=>c.bone===name&&c.mode==='plant'&&phase*clip.duration>=c.start-1e-8&&phase*clip.duration<=c.end+1e-8),grounded=s.position[1]<=.003;
      maximumResetFootError=Math.max(maximumResetFootError,Math.hypot(...f.position.map((x,i)=>x-s.position[i])));
      if(id==='decelerate'){
        assert.notEqual(f.mode,'inherited');
        if(speed>.01)assert.equal(f.mode==='plant',grounded&&authored,'Only actual authored support may be planted');
        if(grounded&&authored)groundedSourceSupports.push({name,phase,heelPhase:f.heelPhase,stanceEndPhase:f.stanceEndPhase,expiredAtSeed:f.stanceEndPhase<=phase});
      }
      footChecks++;
    }
    const supportRecords=motor.heelRecords.filter(r=>r.reason==='nongait-inherited-support');for(const r of supportRecords){assert.ok(r.stanceEndPhase>phase);assert.equal(r.heelPhase,phase);assert.equal(r.sourceSupport.sourceClip,id);assert.equal(r.sourceSupport.authoredPlant,true);assert.equal(r.sourceSupport.grounded,true);assert.ok(r.sourceSupport.sourceSeconds>=r.sourceSupport.contactStart-1e-8&&r.sourceSupport.sourceSeconds<=r.sourceSupport.contactEnd+1e-8);const view=motor.snapshot();view.heelRecords.find(v=>v.id===r.id).sourceSupport.sourceClip='caller-only';assert.equal(r.sourceSupport.sourceClip,id);}const frozenSupport=supportRecords.map(r=>({id:r.id,sourceSupport:structuredClone(r.sourceSupport)}));
    const exported=motor.exportState(),clone=motor.clone(),copy=create().copyFrom(motor);assert.deepEqual(clone.exportState(),exported);assert.deepEqual(copy.exportState(),exported);cloneCases+=2;
    const beforePhase=motor.phase;motor.request('idle');if(speed>=.01)assert.equal(motor.phase,beforePhase);
    const states=[];
    for(let i=0;i<360;i++){
      const previous=motor.phase;const snap=motor.step(1/120);
      assert.ok(snap.unwrappedPhase>=previous);assert.ok(Number.isFinite(snap.rootDistance));assert.ok(Number.isFinite(snap.actualSpeed));
      for(const f of Object.values(snap.feet)){
        assert.ok(['plant','inherited','flight','settle','free'].includes(f.mode));assert.ok(f.position.every(Number.isFinite));assert.ok(f.orientation.every(Number.isFinite));
      }
      coverageSteps++;
    }
    for(const r of frozenSupport)assert.deepEqual(motor.heelRecords.find(v=>v.id===r.id).sourceSupport,r.sourceSupport);
    rows.push({id,phase,speed,initialModes:Object.fromEntries(Object.entries(initial.feet).map(([n,f])=>[n,f.mode])),groundedSourceSupports,finalSpeed:motor.speed,finalModes:Object.fromEntries(Object.entries(motor.feet).map(([n,f])=>[n,f.mode])),seedCommitUntil:initial.seedCommitUntil});
  }
}
assert.equal(maximumResetFootError,0);
const report={kind:'read-only-nongait-seed-guard-state-proof',pass:true,rows,cloneCases,footChecks,coverageSteps,maximumResetFootError,findings:['Canonical moving gait and dribble inheritance remains available. Nongait decelerate never enters cyclic inherited FK.','For positive speed, nongait plant admission requires both a displayed sole at≤3mm and authored source contact.','Admitted nongait support is explicitly distinguished from cyclic heel crossing; its frozen physical stance begins at admission and source clip/time/contact metadata survives all stepping unchanged.'],limits:['CPU state/coverage proof only; no actual mesh or angular/near-ground-drift validation.']};
await fs.writeFile('/tmp/soccer-v7-cold-nongait-v3-independent.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:true,rows:rows.length,cloneCases,footChecks,coverageSteps,maximumResetFootError,expiredDecelerateSupports:rows.filter(r=>r.id==='decelerate').flatMap(r=>r.groundedSourceSupports).filter(r=>r.expiredAtSeed)}));
