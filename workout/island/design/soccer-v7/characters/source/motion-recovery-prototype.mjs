/** Build isolated recovery adapter; never writes the real viewer/data/models. */
import fs from'node:fs/promises';import path from'node:path';import crypto from'node:crypto';import{fileURLToPath}from'node:url';import{createRequire}from'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out='/tmp/soccer-v7-recovery-prototype';await fs.mkdir(out,{recursive:true});
const require=createRequire(process.env.SOCCER_V7_TOOLS||'/tmp/soccer-v7-tools/package.json'),{build}=require('esbuild'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const original=await fs.readFile(process.env.MOTION_RECOVERY_SOURCE||path.join(out,'production-source.js'),'utf8');let source=original;
source="import {RecoveryState,solveRecoveryHand,RECOVERY_ARM_BONES} from './source/recovery-state.js';\n"+source;
const marker='const clipMap=new Map(clips.map(c=>[c.id,c]));';if(!source.includes(marker))throw Error('Clip map anchor changed');
source=source.replace(marker,marker+"\nconst recovery=new RecoveryState({clips,sample:(clip,t)=>sample(clip,t)});let recoveryTransitionSerial=0,requestedClipID='idle';\n");
source=source.replace('function setClip(id){','function setClipNative(id,entrySecondsOverride){');
const phaseLine="  time=phaseSynced?phase*duration():(playing&&locomotion(currentClip())&&entryPlant?entryPlant.end*.5:0);";if(!source.includes(phaseLine))throw Error('Native entry anchor changed');source=source.replace(phaseLine,phaseLine+'\n  if(Number.isFinite(entrySecondsOverride))time=entrySecondsOverride;');
source=source.replace('function seek(u){','function seekNative(u){').replace('function step(dt=1/30){','function stepNative(dt=1/30){');
source=source.replace('const target=sample(c,this.sampleSeconds);','const target=recovery.pose(THREE);');
source=source.replace('future=sample(clip,seconds+epsilon*phaseRate)','future=recovery.pose(THREE,{aheadSeconds:epsilon*phaseRate})');
source=source.replace('worldQuaternions(sample(clip,seconds+epsilon*phaseRate),actor,clip,seconds+epsilon*phaseRate)','worldQuaternions(recovery.pose(THREE,{aheadSeconds:epsilon*phaseRate}),actor,clip,seconds+epsilon*phaseRate)');
source=source.replace("const name=bone.name;if(name==='Root')continue;const offset=fade.worldInertial","const name=bone.name;if(name==='Root')continue;if(fade.scopeArms&&!RECOVERY_ARM_BONES.includes(name)){resultWorld[name]=worldTarget[name];rotations[name]=target.rotations[name].slice();continue;}const offset=fade.worldInertial");
source=source.replace('return{rotations,hipsOffsetMeters:local.hipsOffsetMeters};','return{rotations,hipsOffsetMeters:fade.scopeArms?target.hipsOffsetMeters:local.hipsOffsetMeters};');
source=source.replace('const activeContacts=contactsAt(c,this.sampleSeconds);','const activeContacts=recovery.bridge?[]:recovery.contacts();');
source=source.replace('const envelope=','const envelope=(!recovery.bridge&&!recovery.overlay&&!recovery.base.mirror)&&');
const floorComment='    // Validate the displayed geometry AFTER IK.';if(!source.includes(floorComment))throw Error('Floor constraint anchor changed');source=source.replace(floorComment,'    applyRecoveryConstraints(this);\n'+floorComment);
source=source.replace('      if(pass<2){for(const lock of this.locks.values())this.contactResidual=Math.max(this.contactResidual,this.solvePlant(lock));this.applyLandings();this.updateMatrices();}','      if(pass<2){for(const lock of this.locks.values())this.contactResidual=Math.max(this.contactResidual,this.solvePlant(lock));this.applyLandings();applyRecoveryConstraints(this);this.updateMatrices();}');
const renderCall='props.update(actors[0],currentClip(),time,view);';source=source.replace(renderCall,"const presentation=recovery.snapshot({history:false}).presentation;props.update(actors[0],presentation?clipMap.get(presentation.clipID):currentClip(),presentation?presentation.seconds:time,view);");
source=source.replace('inspect:()=>({actors,scene,camera,renderer,environment,sample,clipMap,data,','inspect:()=>({recovery:recovery.snapshot(),actors,scene,camera,renderer,environment,sample,clipMap,data,');
source=source.replace('state:()=>({characterID,view,','state:()=>({recovery:recovery.snapshot(),requestedClipID,characterID,view,');
const functions=String.raw`
function recoveryContext(a){
  if(!a)return{};const heading=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),a.model.rotation.y),inverse=heading.clone().invert();
  const point=p=>p.applyQuaternion(inverse).toArray(),orientation=q=>inverse.clone().multiply(q).normalize().toArray(),soles={},footQuaternions={},kneePoles={},hands={};
  for(const name of['LeftFoot','RightFoot']){soles[name]=point(a.bones[name].localToWorld(new THREE.Vector3(0,-.08,0)));footQuaternions[name]=orientation(a.bones[name].getWorldQuaternion(new THREE.Quaternion()));kneePoles[name]=a.kneePole(name).applyQuaternion(inverse).toArray();}
  for(const name of['LeftHand','RightHand']){const side=name.replace(/Hand$/,''),upper=a.bones[side+'Arm'].getWorldPosition(new THREE.Vector3()),elbow=a.bones[side+'ForeArm'].getWorldPosition(new THREE.Vector3()),wrist=a.bones[name].getWorldPosition(new THREE.Vector3()),axis=wrist.clone().sub(upper).normalize(),pole=elbow.sub(upper).addScaledVector(axis,-elbow.dot(axis));hands[name]={position:point(wrist),orientation:orientation(a.bones[name].getWorldQuaternion(new THREE.Quaternion())),pole:pole.normalize().applyQuaternion(inverse).toArray()};}
  return{pose:clonePose(a.pose),frameHeadingQuaternion:heading.toArray(),originMeters:point(a.world.clone()),measured:{minimumY:a.minY,chestPosition:point(a.bones.Chest.getWorldPosition(new THREE.Vector3())),pelvisHeight:a.bones.Hips.getWorldPosition(new THREE.Vector3()).y,hipsUpDot:new THREE.Vector3(0,1,0).applyQuaternion(a.bones.Hips.getWorldQuaternion(new THREE.Quaternion())).y,soles,footQuaternions,kneePoles,hands}};
}
function applyRecoveryConstraints(a){
  const constraints=recovery.bridgeConstraints();
  if(recovery.overlay)applyCatchEffectors(a);
  if(!constraints)return;
  const heading=new THREE.Quaternion().fromArray(recovery.episode.origin.frameHeadingQuaternion),point=values=>new THREE.Vector3().fromArray(values).applyQuaternion(heading),orientation=values=>heading.clone().multiply(new THREE.Quaternion().fromArray(values)).normalize();
  a.recoveryConstraintResidual=0;a.recoveryFootResidual=0;a.recoveryHandResidual=0;
  for(const foot of constraints.feet){const result=a.solveSole(foot.bone,point(foot.target),orientation(foot.worldQuaternion),foot.pole?point(foot.pole):a.kneePole(foot.bone));a.recoveryConstraintResidual=Math.max(a.recoveryConstraintResidual,result);a.recoveryFootResidual=Math.max(a.recoveryFootResidual,result);a.updateMatrices();}
  if(a.recoveryHandCache?.clock!==a.clock)a.recoveryHandCache={clock:a.clock,rootY:a.model.position.y,hands:Object.fromEntries(constraints.hands.map(hand=>[hand.bone,{position:a.bones[hand.bone].getWorldPosition(new THREE.Vector3()),orientation:a.bones[hand.bone].getWorldQuaternion(new THREE.Quaternion())}]))};
  for(const hand of constraints.hands){const bone=a.bones[hand.bone],saved=a.recoveryHandCache.hands[hand.bone],current=saved.position.clone().add(new THREE.Vector3(0,a.model.position.y-a.recoveryHandCache.rootY,0)),target=current.lerp(point(hand.target),hand.weight),q=saved.orientation.clone().slerp(orientation(hand.worldQuaternion),hand.weight),pole=hand.pole?point(hand.pole):null;const result=solveRecoveryHand(THREE,a.bones,hand.bone,target,q,pole,a.worldRotations);a.recoveryConstraintResidual=Math.max(a.recoveryConstraintResidual,result);a.recoveryHandResidual=Math.max(a.recoveryHandResidual,result);a.updateMatrices();}
}
function applyCatchEffectors(a){
  const heading=new THREE.Quaternion().fromArray(recovery.episode.origin.frameHeadingQuaternion),inverse=heading.clone().invert(),chest=a.bones.Chest.getWorldPosition(new THREE.Vector3()).applyQuaternion(inverse).toArray();
  const targets=recovery.overlayTargets(THREE,chest);a.catchEffectorTargets=targets;a.catchEffectorResidual=0;
  for(const hand of targets){const target=new THREE.Vector3().fromArray(hand.target).applyQuaternion(heading),q=heading.clone().multiply(new THREE.Quaternion().fromArray(hand.worldQuaternion)).normalize(),pole=new THREE.Vector3().fromArray(hand.pole).applyQuaternion(heading);a.catchEffectorResidual=Math.max(a.catchEffectorResidual,solveRecoveryHand(THREE,a.bones,hand.bone,target,q,pole,a.worldRotations));a.updateMatrices();}
}
function syncRecoveryBase(){
  const state=recovery.snapshot({history:false});if(state.transitionSerial===recoveryTransitionSerial)return;
  if(state.activeBaseClip==='__seated_recovery_bridge'){for(const actor of actors){actor.fade=null;actor.locks.clear();actor.landings.clear();actor.contactTargets?.clear();}}
  else if(state.activeBaseClip!==clipID||state.phase==='getting-up'||state.phase==='requested-action')setClipNative(state.activeBaseClip,state.baseSeconds);
  else{for(const actor of actors){actor.capture();if(actor.fade)actor.fade.scopeArms=true;actor.update(time,0);}}
  recoveryTransitionSerial=state.transitionSerial;
}
function setClip(id){requestedClipID=id;if(!playing){recovery.reset({clipID:id,seconds:0});setClipNative(id);recoveryTransitionSerial=recovery.transitionSerial;return;}recovery.request(id,recoveryContext(actors[0]));syncRecoveryBase();syncUI();}
function seek(u){recovery.reset({clipID,seconds:clamp(u,0,1)*duration()});recoveryTransitionSerial=recovery.transitionSerial;seekNative(u);}
function step(dt=1/30){if(playing){recovery.step(dt*speed,recoveryContext(actors[0]));syncRecoveryBase();time=recovery.base.seconds;}for(const actor of actors)actor.update(time,playing?dt*speed:0);updateTime();placeCamera();render();}
`;
source=source.replace('function updateTime(){',functions+'\nfunction updateTime(){');
await fs.writeFile(path.join(out,'preview.js'),source);const result=await build({stdin:{contents:source,resolveDir:root,sourcefile:'preview.js'},write:false,bundle:true,format:'iife',target:['es2020'],minify:true,legalComments:'eof',alias:{three:path.join(root,'vendor/three.module.js')},logLevel:'silent'});await fs.writeFile(path.join(out,'runtime.js'),result.outputFiles[0].contents);
// The original native15 payloads remain frozen even while other agents prepare
// later assets. A new snapshot requires an explicit separate output directory.
const oldMetadata=JSON.parse(await fs.readFile(path.join(out,'metadata.json'),'utf8')),inputs={};for(const file of Object.keys(oldMetadata.inputs)){const bytes=await fs.readFile(path.join(out,'snapshot',file));inputs[file]={bytes:bytes.length,sha256:hash(bytes)};}
const metadata={schemaVersion:1,kind:'experimental-recovery-adapter',sourcePreviewSha256:hash(original),prototypePreviewSha256:hash(source),runtimeSha256:hash(result.outputFiles[0].contents),inputs,out,limits:['Temporary single-actor prototype. Root owner must merge with the continuous locomotion motor.','State/composition passes do not imply whole-mesh/speed/near-floor proof. All intermediate poses require actual adapter audit.']};await fs.writeFile(path.join(out,'metadata.json'),JSON.stringify(metadata,null,2)+'\n');console.log(JSON.stringify({out,runtimeBytes:result.outputFiles[0].contents.length,sourcePreviewSha256:metadata.sourcePreviewSha256,runtimeSha256:metadata.runtimeSha256}));
