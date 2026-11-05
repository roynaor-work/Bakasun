/** Session diagnostic adapter over a frozen pre-recovery motor source.
 * This prototype utility reads the historical /tmp session baseline. The actual
 * delivered runtime source is ../preview.js; package-viewer.mjs rebuilds it
 * directly and does not need this diagnostic merger or any temporary baseline.
 */
import fs from'node:fs/promises';import path from'node:path';import{createRequire}from'node:module';import crypto from'node:crypto';
const root=path.resolve(new URL('..',import.meta.url).pathname),out=process.env.MOTION_RECOVERY_OUT||'/tmp/soccer-v7-recovery-combined';await fs.mkdir(out,{recursive:true});
const original=await fs.readFile('/tmp/soccer-v7-main-before-recovery.js','utf8');let source=original;
function replace(from,to){if(!source.includes(from))throw Error('Recovery merge anchor missing: '+from.slice(0,100));source=source.replace(from,to);}
replace("import {createLocomotionCurve} from './source/locomotion-curve.js';","import {createLocomotionCurve} from './source/locomotion-curve.js';\nimport {RecoveryState,solveRecoveryHand,RECOVERY_ARM_BONES} from './source/recovery-state.js';");
replace("import {RecoveryState,solveRecoveryHand,RECOVERY_ARM_BONES} from './source/recovery-state.js';","import {RecoveryState,solveRecoveryHand,RECOVERY_ARM_BONES} from './source/recovery-state.js';\nimport {createDribbleFootStyle} from './source/locomotion-dribble.js';\nlet nativeDribbleFootStyle=null;");
replace('const duration=poseFadeSeconds,world=motorWorldQuaternions(target,heading),epsilon=.0001;', 'const duration=poseFadeSeconds,world=motorWorldQuaternions(target,heading),epsilon=.0001,entryBones=fade.bones||motorStyleBones;');
replace('for(const name of motorStyleBones){\n      const current=', 'for(const name of entryBones){\n      const current=');
replace('for(const name of motorStyleBones){const residual=', 'for(const name of entryBones){const residual=');
replace('      for(const m of materials){',`      for(const m of materials){
        if(m.name==='EyesCornea')o.castShadow=false;`);
replace('function inertialPose(fade,target,clip,seconds,phaseRate){','function inertialPose(fade,target,clip,seconds,phaseRate,actor){');
replace('future=sample(clip,seconds+epsilon*phaseRate)','future=actor?.recoveryManaged?actor.recovery.pose(THREE,{aheadSeconds:epsilon*phaseRate}):sample(clip,seconds+epsilon*phaseRate)');
replace('inertialPose(fade,target,clip,seconds,phaseRate),','inertialPose(fade,target,clip,seconds,phaseRate,actor),');
replace('worldQuaternions(sample(clip,seconds+epsilon*phaseRate),actor,clip,seconds+epsilon*phaseRate)','worldQuaternions(actor.recoveryManaged?actor.recovery.pose(THREE,{aheadSeconds:epsilon*phaseRate}):sample(clip,seconds+epsilon*phaseRate),actor,clip,seconds+epsilon*phaseRate)');
replace("const name=bone.name;if(name==='Root')continue;const offset=fade.worldInertial", "const name=bone.name;if(name==='Root')continue;if(fade.scopeArms&&!RECOVERY_ARM_BONES.includes(name)){resultWorld[name]=worldTarget[name];rotations[name]=target.rotations[name].slice();continue;}const offset=fade.worldInertial");
replace('return{rotations,hipsOffsetMeters:local.hipsOffsetMeters};','return{rotations,hipsOffsetMeters:fade.scopeArms?target.hipsOffsetMeters:local.hipsOffsetMeters};');
replace('    this.createdView=view;','    this.createdView=view;\n    this.recovery=new RecoveryState({clips,sample:(clip,t)=>sample(clip,t)});this.recoveryManaged=false;this.recoveryTransitionSerial=0;this.activeClipID=null;');
const actorStart=source.indexOf('class Actor{'),actorEnd=source.indexOf('async function createActor(');let actor=source.slice(actorStart,actorEnd);
actor=actor.replaceAll('currentClip()','this.motionClip()').replaceAll('clipID','this.motionID()');
actor=actor.replaceAll('this.model.rotation.y','this.modelHeading()');
// The replacement is deliberately scoped to Actor; request intent stays global.
actor=actor.replace('requestedAction=this.motionID()', 'requestedAction=clipID');
actor=actor.replace('  capture(){',`  modelHeading(){return new THREE.Euler().setFromQuaternion(this.model.getWorldQuaternion(new THREE.Quaternion()),'YXZ').y;}
  rigidBootMinimumY(name){
    this.refreshFloorRows();let minimum=Infinity;
    for(const piece of this.floorMeshes){const index=piece.mesh.skeleton.bones.findIndex(b=>b.name===name),p=piece.positions,j=piece.joints,w=piece.weights,r=piece.rows;for(const i of piece.feet[name]){if(p[i*3+1]>=.18)continue;const base=i*4;let influence=0;for(let k=0;k<4;k++)if(j[base+k]===index)influence+=w[base+k];if(influence<.95)continue;let y=0;for(let k=0;k<4;k++){const row=j[base+k]*4;y+=w[base+k]*(r[row]*p[i*3]+r[row+1]*p[i*3+1]+r[row+2]*p[i*3+2]+r[row+3]);}minimum=Math.min(minimum,y);}}
    return minimum;
  }
  motionID(){return this.activeClipID||clipID;}
  motionClip(){return clipMap.get(this.motionID());}
  recoveryDescriptor({history=true}={}){
    const state=this.recovery.snapshot({history});
    if(!this.recoveryManaged)Object.assign(state,{clock:this.clock,phase:'standalone',activeBaseClip:this.motionID(),baseSeconds:this.sampleSeconds,overlayClip:null,overlaySeconds:0,request:null,pendingRequestID:null,episode:null,locomotionAllowed:!!this.locomotion,presentation:null,constraints:null,contributors:[{clipID:this.motionID(),sampleSeconds:this.sampleSeconds,playbackRate:this.phaseRate,weight:1,scope:'body',transform:'identity'}]});
    if(state.locomotionAllowed&&this.locomotion){const motor=this.locomotion.snapshot({includeHistory:false});state.contributors=motor.contributors.map(c=>({clipID:c.clip,sampleSeconds:c.time,playbackRate:1,weight:c.weight,scope:'body',transform:'physicalLocomotionSpace'}));state.physicalMotor={clock:motor.clock,actualSpeed:motor.actualSpeed,targetSpeed:motor.targetSpeed,unwrappedPhase:motor.unwrappedPhase,rootDistance:motor.rootDistance,requestID:motor.requestID,requestedClip:motor.requestedClip,lastPhaseReseed:structuredClone(motor.lastPhaseReseed),request:structuredClone(this.locomotion.requests.find(r=>r.id===motor.requestID))};state.modifiers=this.motorStyle?.weight>0?[{kind:'nativeUpperDelta',baseClipID:'run_2',styleClipID:'dribble',phase:motor.unwrappedPhase,weight:this.motorStyle.weight,bones:motorStyleBones.slice()},...(this.dribbleDetail||[]).map(detail=>({kind:'nativeFlightFootDelta',...structuredClone(detail)}))]:[];if(this.motorEntryFade)state.modifiers.push({kind:'worldOrientationEntry',elapsed:this.motorEntryFade.elapsed,duration:poseFadeSeconds,bones:(this.motorEntryFade.bones||motorStyleBones).slice(),scope:'orientationReferenceBeforePhysicalFootIK'});if(!this.recoveryManaged)state.motorAction=this.requestedAction||this.motionID();}
    return state;
  }
  syncRecovery(){
    const state=this.recovery.snapshot({history:false});if(state.transitionSerial===this.recoveryTransitionSerial)return;
    this.recoveryPoleCache={};this.recoveryPoleDiagnostics={};this.recoveryLegReferenceCache={};
    const previous=this.activeClipID,next=this.recovery.base.clipID;
    if(/^turn_/.test(previous)&&(previous!==next||this.sampleSeconds>this.recovery.base.seconds+.000001)){this.handoffHeading();if(this.worldRotations)this.worldRotations=Object.fromEntries(Object.entries(this.bones).map(([n,b])=>[n,b.getWorldQuaternion(new THREE.Quaternion()).normalize().toArray()]));}
    if(this.recovery.bridge){this.fade=null;this.rootBlend=null;this.locks.clear();this.landings.clear();this.contactTargets.clear();}
    else if(this.recovery.overlay&&previous===next){this.capture();if(this.fade)this.fade.scopeArms=true;}
    else if(!(state.locomotionAllowed&&this.locomotion)){
      this.capture();if(this.locomotion)this.clearLocomotion();this.activeClipID=next;this.entryPhaseRate=1;this.pathScale=1;this.phaseSynced=false;this.rebase(state.baseSeconds);
    }
    this.activeClipID=next;this.recoveryTransitionSerial=state.transitionSerial;
  }
  capture(){`);
actor=actor.replace('  update(seconds,dt=0,exact=false){',`  update(seconds,dt=0,exact=false){
    // A queued intent does not advance or replay the displayed recovery.
    // Re-running a stateful knee-plane solver at dt=0 can otherwise undo its
    // previous-frame convergence while the body clock has not changed.
    if(!exact&&dt===0&&this.recoveryManaged&&this.pose&&this.recoveryTransitionSerial===this.recovery.transitionSerial&&!this.recovery.snapshot({history:false}).locomotionAllowed){this.helper.visible=$('skeleton').checked;return;}
    if(!exact&&playing&&this.recoveryManaged){
      if(dt>0)this.recovery.step(dt,recoveryContext(this));this.syncRecovery();
      const recoveryState=this.recovery.snapshot({history:false});
      if(recoveryState.locomotionAllowed){this.updateLocomotion(seconds,dt,recoveryState.motorAction);const motor=this.locomotion.snapshot({includeHistory:false});motor.requests=this.locomotion.requests.filter(r=>r.id===this.locomotion.requestID||r.id===this.recovery.requestRecord?.motorRequestID);this.recovery.bindMotor(motor,{styleWeight:this.motorStyle?.weight||0,rendered:motor.targetSpeed===0&&this.recovery.requestRecord?.scope==='locomotion'?recoveryContext(this).measured:null});return;}
      seconds=this.recovery.base.seconds;
    }`);
actor=actor.replace('if(!exact&&playing&&motorClipFor(this.motionID()))','if(!exact&&playing&&!this.recoveryManaged&&motorClipFor(this.motionID()))');
actor=actor.replace('const phase=view===\'pitch\'&&c.loop?this.slot*.071:0;',"const phase=!this.recoveryManaged&&view==='pitch'&&c.loop?this.slot*.071:0;");
actor=actor.replace('const target=sample(c,this.sampleSeconds);','const target=this.recoveryManaged?this.recovery.pose(THREE):sample(c,this.sampleSeconds);');
actor=actor.replace('const sourceClip=clipMap.get(this.lastClipID)||this.motionClip(),phase=this.sampleSeconds/duration(sourceClip),actualSpeed=this.velocity.length();',"const sourceClip=clipMap.get(this.lastClipID)||this.motionClip(),seedClip=/^turn_/.test(sourceClip.id)?clipMap.get('idle'):sourceClip,phase=seedClip!==sourceClip?0:this.sampleSeconds/duration(sourceClip),actualSpeed=this.velocity.length();");
actor=actor.replace("idleSeconds:sourceClip.id==='idle'?this.sampleSeconds:0,sourceClip:sourceClip.id", "idleSeconds:sourceClip.id==='idle'?this.sampleSeconds:0,sourceClip:seedClip.id");
actor=actor.replace('dt:this.dt,elapsed:0}:null;', "dt:this.dt,elapsed:0,bones:['Hips',...motorStyleBones,'LeftUpLeg','LeftLeg','RightUpLeg','RightLeg']}:null;");
actor=actor.replace('const activeContacts=contactsAt(c,this.sampleSeconds);','const activeContacts=this.recoveryManaged?this.recovery.bridge?[]:this.recovery.contacts():contactsAt(c,this.sampleSeconds);');
actor=actor.replace('const envelope=','const envelope=(!this.recoveryManaged||(!this.recovery.overlay&&!this.recovery.bridge&&!this.recovery.base.mirror&&!this.recovery.bridgeConstraints()))&&');
actor=actor.replace('    // Validate the displayed geometry AFTER IK.','    if(this.recoveryManaged)applyRecoveryConstraints(this);\n    // Validate the displayed geometry AFTER IK.');
actor=actor.replace('this.applyLandings();this.updateMatrices();}\n    }\n    // The next interruption','this.applyLandings();if(this.recoveryManaged)applyRecoveryConstraints(this);this.updateMatrices();}\n    }\n    // The next interruption');
source=source.slice(0,actorStart)+actor+source.slice(actorEnd);
replace('    this.locomotionProjections=[];const inverseYaw=yawQ.clone().invert();',await fs.readFile('/tmp/soccer-v7-dribble-style/actor-hunk.js','utf8')+'    this.locomotionProjections=[];const inverseYaw=yawQ.clone().invert();');
// Keep physical motor request history attached to the independent recovery ledger.
replace('a.locomotion=prior.locomotion?.clone();','a.recovery=prior.recovery;a.recoveryManaged=prior.recoveryManaged;a.recoveryTransitionSerial=prior.recoveryTransitionSerial;a.activeClipID=prior.activeClipID;\n      a.locomotion=prior.locomotion?.clone();');
replace('a.motorOrigin=prior.motorOrigin?.clone();','a.dribbleDetail=prior.dribbleDetail&&structuredClone(prior.dribbleDetail);a.motorOrigin=prior.motorOrigin?.clone();');
replace('a.recovery=prior.recovery;','a.recoveryPoleCache=prior.recoveryPoleCache&&structuredClone(prior.recoveryPoleCache);a.recoveryPoleDiagnostics=prior.recoveryPoleDiagnostics&&structuredClone(prior.recoveryPoleDiagnostics);a.recovery=prior.recovery;');
replace('a.recoveryPoleCache=prior.recoveryPoleCache','a.recoveryLegReferenceCache=prior.recoveryLegReferenceCache&&structuredClone(prior.recoveryLegReferenceCache);a.recoveryPoleCache=prior.recoveryPoleCache');
replace('function setClip(id){','function setClipCanonical(id){');
replace('function seek(u){','function seekCanonical(u){');
replace("const actor=actors[0],presentation=actor?.locomotion?actor.motorPresentation():{clip:currentClip(),seconds:actor?.sampleSeconds??time};", "const actor=actors[0],recoveryPresentation=actor?.recoveryManaged?actor.recovery.snapshot({history:false}).presentation:null,presentation=recoveryPresentation?{clip:clipMap.get(recoveryPresentation.clipID),seconds:recoveryPresentation.seconds}:actor?.locomotion?actor.motorPresentation():{clip:actor?.motionClip()||currentClip(),seconds:actor?.sampleSeconds??time};");
replace('state:()=>({characterID,view,','state:()=>({recovery:actors[0]?.recoveryDescriptor()||null,characterID,view,');
replace('inspect:()=>({actors,scene,','inspect:()=>({recovery:actors[0]?.recoveryDescriptor()||null,actors,scene,');
replace('requestedAction:a.requestedAction||clipID,','requestedAction:a.recoveryManaged?a.recovery.requestRecord?.clipID||clipID:a.requestedAction||clipID,recovery:a.recoveryDescriptor(),activeBaseClip:a.recoveryManaged?a.recovery.base.clipID:a.motionID(),activeBaseSeconds:a.recoveryManaged?a.recovery.base.seconds:a.sampleSeconds,');
replace("  const c=currentClip(),motor=playing&&actors[0]?.locomotion,len=duration(c);",`  const actor=actors[0],c=currentClip(),motor=playing&&actor?.locomotion,len=duration(c),recovery=actor?.recoveryManaged?actor.recovery.snapshot({history:false}):null;
  const recoveryLabels={braking:'מאט לפני הפעולה', 'await-landing':'משלים נחיתה', 'await-upright-landing':'משלים נחיתה', 'await-turn-finish':'משלים פנייה', 'seated-bridge':'מתרומם', 'getting-up':'מתרומם'};
  if(recoveryLabels[recovery?.phase]){$('scrub').value=0;$('time').textContent=recoveryLabels[recovery.phase];return;}
  if(recovery?.presentation){const local=recovery.presentation.seconds;$('scrub').value=clamp(local/len,0,1);$('time').textContent=local.toFixed(2)+' / '+len.toFixed(2);return;}`);
replace("function syncUI(){for(const [id,value]", "function syncUI(){$('clip-label').textContent=currentClip().label||clipID;for(const [id,value]");
const helperSource=await fs.readFile(path.join(root,'source/motion-recovery-prototype.mjs'),'utf8');
let helpers=helperSource.slice(helperSource.indexOf('function recoveryContext(a){'),helperSource.indexOf('function syncRecoveryBase(){'));
helpers=helpers.replace('if(!a)return{};','if(!a)return{};const recovery=a.recovery;').replace('pose:clonePose(a.pose),','pose:clonePose(a.pose),locomotion:a.locomotion?.snapshot({includeHistory:false})||null,');
helpers=helpers.replaceAll('a.model.rotation.y','a.modelHeading()');
helpers=helpers.replace('minimumY:a.minY,','minimumY:a.minY,rigidBootMinimumY:Object.fromEntries([\'LeftFoot\',\'RightFoot\'].map(name=>[name,a.rigidBootMinimumY(name)])),');
helpers=helpers.replace('minimumY:a.minY,','minimumY:a.minY,rootSpeedMps:a.velocity.length(),');
helpers=helpers.replace('const result=a.solveSole(foot.bone,point(foot.target),orientation(foot.worldQuaternion),foot.pole?point(foot.pole):a.kneePole(foot.bone));',`const target=point(foot.target),q=orientation(foot.worldQuaternion),pole=foot.poleMode==='transport-limited'?recoveryKneePole(a,foot,target,q,heading):foot.pole?point(foot.pole):a.kneePole(foot.bone);if(foot.poleMode==='transport-limited')seedRecoveryLeg(a,foot);const result=a.solveSole(foot.bone,target,q,pole);`);
helpers+=`
function recoveryKneePole(a,foot,target,orientation,heading){
  a.recoveryPoleCache??={};a.recoveryPoleDiagnostics??={};
  const shown=a.displayedSoles?.[foot.bone],dt=Math.max(0,a.updateDelta||0);let state=a.recoveryPoleCache[foot.bone];
  if(!state||state.clock!==a.clock){state={clock:a.clock,sourcePole:(shown?.pole||a.kneePole(foot.bone)).toArray(),sourceAxis:(shown?.axis||a.legAxis(foot.bone)).toArray()};a.recoveryPoleCache[foot.bone]=state;}
  const side=foot.bone.replace(/Foot$/,''),hip=a.bones[side+'UpLeg'].getWorldPosition(new THREE.Vector3()),axis=target.clone().add(new THREE.Vector3(0,.08,0).applyQuaternion(orientation)).sub(hip).normalize();
  const project=p=>{p.addScaledVector(axis,-p.dot(axis));if(p.lengthSq()<1e-10){p.set(0,1,0).addScaledVector(axis,-axis.y);if(p.lengthSq()<1e-10)p.set(1,0,0).addScaledVector(axis,-axis.x);}return p.normalize();};
  const transported=project(new THREE.Vector3().fromArray(state.sourcePole).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3().fromArray(state.sourceAxis),axis))),forward=new THREE.Vector3().fromArray(foot.poleGuide||[0,0,1]).applyQuaternion(heading),projected=forward.clone().addScaledVector(axis,-forward.dot(axis));
  const desired=projected.lengthSq()<.0001?transported.clone():project(projected),angle=Math.atan2(axis.dot(new THREE.Vector3().crossVectors(transported,desired)),clamp(transported.dot(desired),-1,1)),limit=(foot.poleVelocityLimitRadiansPerSecond||8)*dt,turn=clamp(angle,-limit,limit),pole=transported.clone().applyAxisAngle(axis,turn).normalize();
  a.recoveryPoleDiagnostics[foot.bone]={clock:a.clock,sourcePole:state.sourcePole,sourceAxis:state.sourceAxis,axis:axis.toArray(),transportedPole:transported.toArray(),desiredPole:desired.toArray(),usedPole:pole.toArray(),remainingRadians:angle-turn,appliedRadians:turn,limitRadians:limit,limitRadiansPerSecond:foot.poleVelocityLimitRadiansPerSecond||8};return pole;
}
function seedRecoveryLeg(a,foot){
  const side=foot.bone.replace(/Foot$/,''),names=[side+'UpLeg',side+'Leg'];a.recoveryLegReferenceCache??={};let cache=a.recoveryLegReferenceCache[foot.bone];
  if(!cache||cache.clock!==a.clock){cache={clock:a.clock,goal:Object.fromEntries(names.map(name=>[name,a.bones[name].getWorldQuaternion(new THREE.Quaternion()).normalize().toArray()]))};a.recoveryLegReferenceCache[foot.bone]=cache;}
  for(const name of names){const bone=a.bones[name],source=a.worldRotations?.[name];if(!source)continue;const orientation=new THREE.Quaternion().fromArray(source).normalize(),goal=new THREE.Quaternion().fromArray(cache.goal[name]),angle=orientation.angleTo(goal);if(foot.nativeReferenceRelaxation&&angle>1e-10)orientation.slerp(goal,Math.min(1,8*Math.max(0,a.updateDelta||0)/angle));bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(orientation).normalize();bone.updateWorldMatrix(true,true);}
}
`;
helpers=helpers.replace('function applyRecoveryConstraints(a){','function applyRecoveryConstraints(a){\n  const recovery=a.recovery;').replace('function applyCatchEffectors(a){','function applyCatchEffectors(a){\n  const recovery=a.recovery;');
const controls=`
function setClip(id){
  if(!clipMap.has(id))throw Error('Unknown clip '+id);
  if(!playing){for(const a of actors){a.recoveryManaged=false;a.activeClipID=null;a.recovery.reset({clipID:id,seconds:0});}setClipCanonical(id);return;}
  clipID=id;
  for(const a of actors){
    if(!a.recoveryManaged){const sourceID=a.lastClipID||id;a.recovery.reset({clipID:sourceID,seconds:a.sampleSeconds,clock:a.clock});a.activeClipID=sourceID;a.recoveryTransitionSerial=a.recovery.transitionSerial;a.recoveryManaged=true;}
    a.recovery.request(id,recoveryContext(a));a.update(time,0);
  }
  syncUI();placeCamera();render();
}
function seek(u){for(const a of actors){a.recoveryManaged=false;a.activeClipID=null;a.recovery.reset({clipID,seconds:clamp(u,0,1)*duration()});}seekCanonical(u);}
`;
replace('function updateTime(){',helpers+controls+'\nfunction updateTime(){');
// Final nongait entry keeps the displayed pelvis continuous while physical feet
// and leg reach remain authoritative; the diagnostic snapshot carries all state.
replace("// Preserve displayed upper-body world orientation and velocity on a standing action's\n// handoff to the actual moving motor mixture. Lower-body planning stays physical.","// Preserve displayed world orientation and velocity on a nongait handoff to the\n// actual motor mixture. Physical root, foot targets and leg reach stay authoritative.");
replace('clearLocomotion(){this.locomotion=null;this.motorEntryFade=null;this.motorStyle=null;', 'clearLocomotion(){this.locomotion=null;this.motorEntryFade=null;this.motorPelvisEntry=false;this.motorHipEntry=null;this.motorStyle=null;');
replace('      this.fade=null;this.rootBlend=null;this.landings.clear();this.contactTargets.clear();\n      if(this.motorEntryFade)motorArmEntryPose', '      this.motorPelvisEntry=!!this.motorEntryFade;\n      this.fade=null;this.rootBlend=null;this.landings.clear();this.contactTargets.clear();\n      if(this.motorEntryFade)motorArmEntryPose');
replace('    const before=this.world.clone(),geometry=curve?', '    const previousHipY=this.bones.Hips.getWorldPosition(new THREE.Vector3()).y,before=this.world.clone(),geometry=curve?');
replace('    const targetFeet=Object.entries(state.feet).map', `    this.motorHipEntry=null;
    if(this.motorPelvisEntry){const targetY=this.bones.Hips.getWorldPosition(new THREE.Vector3()).y,maximumStep=dt,appliedY=clamp(targetY,previousHipY-maximumStep,previousHipY+maximumStep);this.bones.Hips.position.y+=appliedY-targetY;this.updateMatrices();this.motorPelvisEntry=Math.abs(targetY-appliedY)>1e-7;this.motorHipEntry={mode:'bounded-physical-pelvis-height',scope:'beforeReachAndFloorCorrection',previousY:previousHipY,targetY,appliedY,maximumStepMeters:maximumStep,maximumDesiredSpeedMps:1,remainingMeters:targetY-appliedY};}
    const targetFeet=Object.entries(state.feet).map`);
replace('maximumHip=Math.min(maximumHip,ankle.y+Math.sqrt(.777*.777-horizontal*horizontal));', 'maximumHip=Math.min(maximumHip,ankle.y+Math.sqrt(.777*.777-horizontal*horizontal)-(root.y-hip.y));');
replace('a.motorEntryFade=prior.motorEntryFade&&structuredClone(prior.motorEntryFade);a.lastClipID=prior.lastClipID;', 'a.motorEntryFade=prior.motorEntryFade&&structuredClone(prior.motorEntryFade);a.motorPelvisEntry=prior.motorPelvisEntry;a.motorHipEntry=prior.motorHipEntry&&structuredClone(prior.motorHipEntry);a.lastClipID=prior.lastClipID;');
replace("if(!this.recoveryManaged)state.motorAction=this.requestedAction||this.motionID();}","if(this.motorHipEntry)state.modifiers.push({...structuredClone(this.motorHipEntry),kind:'physicalPelvisEntry',continuing:this.motorPelvisEntry,displayedY:this.bones.Hips.getWorldPosition(new THREE.Vector3()).y});if(!this.recoveryManaged)state.motorAction=this.requestedAction||this.motionID();}");
await fs.writeFile(path.join(out,'preview.js'),source);
const require=createRequire('/tmp/soccer-v7-tools/package.json'),{build}=require('esbuild'),result=await build({stdin:{contents:source,resolveDir:root,sourcefile:'preview.js'},write:false,bundle:true,format:'iife',target:['es2020'],minify:true,legalComments:'eof',alias:{three:path.join(root,'vendor/three.module.js')},logLevel:'silent'});
await fs.writeFile(path.join(out,'runtime.js'),result.outputFiles[0].contents);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),frozenSources={};
for(const name of ['recovery-state','motion-runtime','locomotion-space','locomotion-curve','locomotion-dribble','props','scene']){
  const bytes=await fs.readFile(path.join(root,'source',name+'.js'));
  await fs.writeFile(path.join(out,'frozen-'+name+'.js'),bytes);
  frozenSources[name]=hash(bytes);
}
await fs.writeFile(path.join(out,'metadata.json'),JSON.stringify({sourceSha256:hash(original),previewSha256:hash(source),runtimeSha256:hash(result.outputFiles[0].contents),runtimeBytes:result.outputFiles[0].contents.length,frozenSources},null,2)+'\n');
console.log(await fs.readFile(path.join(out,'metadata.json'),'utf8'));
