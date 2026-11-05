const fixturePath=require('node:path'),fixturePackageRoot=fixturePath.resolve(__dirname,'../../../..');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const root=fixturePackageRoot,source=root+'/source/audit-action-observer.cjs',digest=x=>crypto.createHash('sha256').update(x).digest('hex'),sourceHash=digest(fs.readFileSync(source));
 const THREE=await import('data:text/javascript;base64,'+fs.readFileSync(root+'/vendor/three.module.js').toString('base64'));
 const {createActionObserver}=require(source),clips=new Map(require(root+'/animations.json').clips.map(c=>[c.id,c])),clip=clips.get('get_up'),names=Object.keys(clip.frames[0].rotations),quaternion=array=>new THREE.Quaternion().fromArray(array).normalize();
 function run({offBone='LeftArm',proofs=[{bone:'LeftHand',key:'actual-support-key',clipID:'get_up'}],modifierKey='actual-support-key',modifySupport=()=>{},modifyModifier=()=>{}}={}){
  const request={id:1,clipID:'get_up',scope:'body',requestedAt:0,activatedAt:0,entrySeconds:0,playbackRate:1,completionDeadline:clip.duration+.35,status:'active'};
  const descriptor={clock:0,activeBaseClip:'get_up',baseSeconds:0,contributors:[{clipID:'get_up',sampleSeconds:0,weight:1,playbackRate:1,scope:'body',transform:'identity'}],request,requests:[request],modifiers:[],palmSupports:[]};
  const actor={clock:0,world:new THREE.Vector3(),bones:Object.fromEntries(names.map(name=>[name,{quaternion:new THREE.Quaternion()}])),locks:new Map(),recoveryDescriptor:()=>descriptor};
  const api={inspect:()=>({clipMap:clips,sample:c=>c.frames.at(-1),scene:{getObjectByName:()=>null}})};
  const pose=frame=>({world:[0,0,0],soles:{LeftFoot:[.1,0,0],RightFoot:[-.1,0,0]},bones:Object.fromEntries(names.map(name=>[name,{q:quaternion(frame.rotations[name]),worldQ:quaternion(frame.rotations[name]),position:[0,name==='Hips'?1:0,0]}]))});
  const observer=createActionObserver({api,actor}),before=pose(clip.frames[0]);observer.noteRequest('get_up',0,before);observer.sample({pose:before,previous:before,clock:0,sampleDt:0,physicalPalmSupports:[]});
  descriptor.clock=actor.clock=descriptor.baseSeconds=clip.duration;descriptor.contributors[0].sampleSeconds=clip.duration;request.status='completed';request.completedAt=clip.duration;
  const modifier={kind:'nativePalmSurfaceIK',contactKey:modifierKey,phase:'plant',weight:1,solverIterations:1,bones:['LeftArm','LeftForeArm','LeftHand']};modifyModifier(modifier);descriptor.modifiers=[modifier];
  const support={bone:'LeftHand',key:'actual-support-key',clipID:'get_up',phase:'plant',weight:1,solverName:'nativePalmSurfaceIK',solverIterations:1,solveCount:3,lastSolveClock:actor.clock};modifySupport(support,actor.clock);descriptor.palmSupports=[support];
  const terminal=pose(clip.frames.at(-1));terminal.bones[offBone].q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.2));terminal.bones[offBone].worldQ.copy(terminal.bones[offBone].q);
  observer.sample({pose:terminal,previous:before,clock:clip.duration,sampleDt:clip.duration,physicalPalmSupports:proofs});observer.needsDrain(clip.duration);
  descriptor.clock=actor.clock=clip.duration+.2;support.lastSolveClock=actor.clock;modifySupport(support,actor.clock);
  observer.sample({pose:terminal,previous:terminal,clock:clip.duration+.2,sampleDt:.2,physicalPalmSupports:proofs});return observer.report();
 }
 const checks={
  matchingValidatedLeftArmExceptionAccepted:run().pass,
  matchingValidatedLeftForeArmExceptionAccepted:run({offBone:'LeftForeArm'}).pass,
  matchingValidatedLeftHandExceptionAccepted:run({offBone:'LeftHand'}).pass,
  forgedModifierContactKeyRejected:!run({modifierKey:'forged-key'}).pass,
  wrongProofContactKeyRejected:!run({proofs:[{bone:'LeftHand',key:'forged-key',clipID:'get_up'}]}).pass,
  wrongProofClipRejected:!run({proofs:[{bone:'LeftHand',key:'actual-support-key',clipID:'short_pass'}]}).pass,
  missingValidatedHandRejected:!run({proofs:[]}).pass,
  unrelatedRightArmRemainsStrict:!run({offBone:'RightArm'}).pass,
  unrelatedChestRemainsStrict:!run({offBone:'Chest'}).pass,
  unrelatedSpineRemainsStrict:!run({offBone:'Spine'}).pass,
  zeroActualSolveCountRejected:!run({modifySupport:s=>{s.solveCount=0;}}).pass,
  staleCurrentSolveClockRejected:!run({modifySupport:(s,clock)=>{s.lastSolveClock=clock-.1;}}).pass,
  nonplantModifierCannotExemptArm:!run({modifyModifier:m=>{m.phase='release';}}).pass,
  zeroWeightModifierCannotExemptArm:!run({modifyModifier:m=>{m.weight=0;}}).pass
 };
 for(const[name,pass]of Object.entries(checks))assert.equal(pass,true,name);
 assert.equal(digest(fs.readFileSync(source)),sourceHash,'observer changed during fixture');
 const result={kind:'controlled-terminal-palm-source-exclusion-fixture',pass:true,checks,observerSource:{file:'source/audit-action-observer.cjs',sha256:sourceHash},fixtureSource:{sha256:digest(fs.readFileSync(__filename))},limitations:'Actual local Three r160 math and actual source-terminal comparison logic; physicalPalmSupports are controlled proof records. This verifies dispatch/exclusion only and does not replace independent decoded anatomical triangle, actual positive solver, browser or production-geometry witnesses.'};
 fs.writeFileSync(fixturePath.join(__dirname,'terminal-palm-exclusion-fixture.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})();
