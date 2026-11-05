/** Measured canonical motion checks; no existing repository test is changed. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {ACTIONS,BONE_NAMES,createMotionController} from './motion.mjs';
import {checkControllerContinuity} from './motion-checks.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const inputFiles=['rig.json','model-authoring.json','source/motion.mjs','source/motion-checks.mjs','source/validate-motion.mjs'];
const hashes=()=>Promise.all(inputFiles.map(async file=>({file,sha256:createHash('sha256').update(await fs.readFile(path.join(ROOT,file))).digest('hex')})));
const inputs=await hashes();
const rig=JSON.parse(await fs.readFile(path.join(ROOT,'rig.json'),'utf8'));
const metadata=JSON.parse(await fs.readFile(path.join(ROOT,'model-authoring.json'),'utf8')).profiles||[];
const heights={pg:1.78,sg:1.88,sf:1.99,pf:2.09,c:2.20,referee:1.86};
const HZ=120,dt=1/HZ;
const limits={fullPalmContactMeters:.003,plantedAnkleTargetMeters:.002,loopBonePositionMeters:.001,loopBoneRotationRadians:.012,finiteQuaternionNormError:1e-5,maxJointStepRadians:.20,maxWorldJointStepRadians:.18,ballC0Meters:.001,ballC1MetersPerSecond:.30};
const results=[],transitions=[],continuity=[],failures=[];
function setup(id,transformed=false){
  const scene=new THREE.Group(),wrapper=new THREE.Group(),root=new THREE.Group(),joints={};scene.add(wrapper);wrapper.add(root);
  if(transformed){wrapper.rotation.set(.0,.83,0);wrapper.position.set(2.4,0,-1.7);}
  for(const j of rig.profiles[id].joints){const b=new THREE.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);(j.parent?joints[j.parent]:root).add(b);joints[j.name]=b;}
  const ball=new THREE.Object3D();scene.add(ball);
  const author=Array.isArray(metadata)?metadata.find(p=>p.id===id):metadata[id];
  const profile={...rig.profiles[id],heightMeters:author?.heightMeters||author?.height||heights[id]};
  return {root,joints,ball,controller:createMotionController(root,{ball,profile})};
}
function positions(joints){return Object.fromEntries(BONE_NAMES.map(n=>[n,joints[n].getWorldPosition(new THREE.Vector3()).toArray()]));}
function maxDifference(a,b){let p=0,q=0;for(const n of BONE_NAMES){p=Math.max(p,new THREE.Vector3(...a.bones[n].position).distanceTo(new THREE.Vector3(...b.bones[n].position)));q=Math.max(q,new THREE.Quaternion(...a.bones[n].quaternion).angleTo(new THREE.Quaternion(...b.bones[n].quaternion)));}return {position:p,rotation:q};}
for(const id of Object.keys(rig.profiles)){
  const {root,joints,controller}=setup(id);
  for(const action of ACTIONS){
    controller.setAction(action.id,{immediate:true});
    const count=Math.ceil(action.duration*HZ);let previous=null,previousWorld=null,maxPalm=0,maxPlant=0,maxAir=0,maxNorm=0,maxStep=0,maxWorldStep=0,worstBone=null,worstPhase=null,worstWorldBone=null,worstWorldPhase=null,finite=true,minAnkle=Infinity,contacts=0,fullSupports=0;
    for(let i=0;i<=count;i++){
      controller.seek(i/count);const d=controller.getDiagnostics(),s=controller.snapshot();
      maxPalm=Math.max(maxPalm,d.handContactErrorMeters);contacts+=d.contact.length;
      for(const foot of Object.values(d.footErrors)){if(foot.support){maxPlant=Math.max(maxPlant,foot.errorMeters);fullSupports++;}else maxAir=Math.max(maxAir,foot.errorMeters);minAnkle=Math.min(minAnkle,foot.position[1]);}
      const world={};for(const n of BONE_NAMES){const b=s.bones[n],all=[...b.position,...b.quaternion];finite&&=all.every(Number.isFinite);maxNorm=Math.max(maxNorm,Math.abs(Math.hypot(...b.quaternion)-1));world[n]=joints[n].getWorldQuaternion(new THREE.Quaternion());if(previous){const local= new THREE.Quaternion(...previous.bones[n].quaternion).angleTo(new THREE.Quaternion(...b.quaternion)),global=previousWorld[n].angleTo(world[n]);if(local>maxStep){maxStep=local;worstBone=n;worstPhase=i/count;}if(global>maxWorldStep){maxWorldStep=global;worstWorldBone=n;worstWorldPhase=i/count;}}}
      finite&&=d.ballPosition.every(Number.isFinite);previous=s;previousWorld=world;
    }
    controller.seek(0);const first=controller.snapshot();controller.seek(1);const last=controller.snapshot(),seam=maxDifference(first,last);
    controller.seek(1-1e-6);const approaching=controller.snapshot(),nearSeam=maxDifference(first,approaching);
    const ballNearSeam={positionMeters:new THREE.Vector3(...first.ballAnchor.position).distanceTo(new THREE.Vector3(...approaching.ballAnchor.position)),rotationRadians:new THREE.Quaternion(...first.ballAnchor.quaternion).angleTo(new THREE.Quaternion(...approaching.ballAnchor.quaternion))};
    const pass=finite&&maxPalm<=limits.fullPalmContactMeters&&maxPlant<=limits.plantedAnkleTargetMeters&&maxNorm<=limits.finiteQuaternionNormError&&maxStep<=limits.maxJointStepRadians&&maxWorldStep<=limits.maxWorldJointStepRadians&&(!action.loop||(seam.position<=limits.loopBonePositionMeters&&seam.rotation<=limits.loopBoneRotationRadians&&nearSeam.position<=limits.loopBonePositionMeters&&nearSeam.rotation<=limits.loopBoneRotationRadians&&ballNearSeam.positionMeters<=limits.loopBonePositionMeters&&ballNearSeam.rotationRadians<=limits.loopBoneRotationRadians));
    const row={profile:id,action:action.id,durationSeconds:action.duration,sampleCount:count+1,sampleHz:HZ,finite,maxPalmResidualMeters:maxPalm,maxPlantedAnkleTargetResidualMeters:maxPlant,maxAirborneAnkleTargetResidualMeters:maxAir,minAnkleY:minAnkle,maxQuaternionNormError:maxNorm,maxJointStepRadians:maxStep,worstBone,worstPhase,maxWorldJointStepRadians:maxWorldStep,worstWorldBone,worstWorldPhase,fullPalmContactSamples:contacts,plantedAnkleSamples:fullSupports,loop:action.loop,loopSeam:action.loop?seam:null,nearEndLoopSeam:action.loop?{epsilonNormalized:1e-6,bones:nearSeam,ball:ballNearSeam}:null,pass};
    results.push(row);if(!pass)failures.push({profile:id,action:action.id,reason:row});
  }
  // Check gather from every dribble with deliberately awkward request phases.
  for(const source of ACTIONS.filter(a=>a.category==='dribble'))for(const phase of [.08,.16,.35,.58,.81]){
    controller.setAction(source.id,{immediate:true});controller.seek(phase);controller.update(dt);
    const before=controller.snapshot(),p0=new THREE.Vector3(...before.ballPosition);controller.setAction('idle_hold');
    const requested=controller.snapshot(),c0=p0.distanceTo(new THREE.Vector3(...requested.ballPosition));
    let maxPalm=0,maxDisplacement=0,maxJointStep=0,previous=before,completed=false,finite=true;
    for(let k=0;k<240;k++){
      controller.update(dt);const s=controller.snapshot();maxPalm=Math.max(maxPalm,s.handContactErrorMeters);
      maxDisplacement=Math.max(maxDisplacement,new THREE.Vector3(...s.ballPosition).distanceTo(new THREE.Vector3(...previous.ballPosition)));maxJointStep=Math.max(maxJointStep,maxDifference(previous,s).rotation);
      finite&&=s.ballPosition.every(Number.isFinite);previous=s;if(s.action==='idle_hold'&&!s.transition){completed=true;break;}
    }
    // Interrupt a running blend twice; setAction itself must preserve C0.
    controller.setAction('dribble_right');for(let k=0;k<10;k++)controller.update(dt);const interruptA=controller.snapshot();controller.setAction('idle_hold');const interruptB=controller.snapshot();
    const interruptedC0=new THREE.Vector3(...interruptA.ballPosition).distanceTo(new THREE.Vector3(...interruptB.ballPosition));
    const pass=finite&&completed&&c0<=limits.ballC0Meters&&interruptedC0<=limits.ballC0Meters&&maxPalm<=limits.fullPalmContactMeters&&maxJointStep<limits.maxJointStepRadians;
    const row={profile:id,source:source.id,requestedPhase:phase,completed,c0Meters:c0,interruptedC0Meters:interruptedC0,maxPalmResidualMeters:maxPalm,maxFrameBallDisplacementMeters:maxDisplacement,maxJointStepRadians:maxJointStep,pass};transitions.push(row);if(!pass)failures.push({transition:row});
  }
  for(const source of ACTIONS.filter(a=>a.category==='dribble'))for(const phase of [.08,.16])for(const interruptAtSeconds of [null,.08,.16]){
    const row={profile:id,...checkControllerContinuity(controller,{source:source.id,phase,interruptAtSeconds})};
    row.pass=row.measured&&row.requestC0Meters<=limits.ballC0Meters&&(row.interruptC0Meters===null||row.interruptC0Meters<=limits.ballC0Meters)&&row.maxVelocityResidualMetersPerSecond<=limits.ballC1MetersPerSecond;
    continuity.push(row);if(!row.pass)failures.push({continuity:row});
  }
  for(const target of ACTIONS.filter(a=>a.category==='dribble'))for(const phase of [.08,.16]){
    const row={profile:id,...checkControllerContinuity(controller,{source:'idle_hold',target:target.id,phase})};
    row.pass=row.measured&&row.requestC0Meters<=limits.ballC0Meters&&row.maxVelocityResidualMetersPerSecond<=limits.ballC1MetersPerSecond;
    continuity.push(row);if(!row.pass)failures.push({continuity:row});
  }
  controller.dispose();
}
// World transforms and a ball parent different from the skeleton parent must
// preserve local contact. This catches a frequent rotated-lineup regression.
const transformed=[];
for(const id of Object.keys(rig.profiles)){
  const {controller}=setup(id,true);for(const action of ['idle_hold','dribble_right','shot_jump','rebound']){controller.setAction(action,{immediate:true});let max=0;for(let i=0;i<=60;i++){controller.seek(i/60);max=Math.max(max,controller.getDiagnostics().handContactErrorMeters);}const pass=max<=limits.fullPalmContactMeters;transformed.push({profile:id,action,maxPalmResidualMeters:max,pass});if(!pass)failures.push({transformed:{id,action,max}});}controller.dispose();
}
const after=await hashes(),changedDuringValidation=inputs.filter(a=>!after.some(b=>a.file===b.file&&a.sha256===b.sha256));
if(changedDuringValidation.length)failures.push({changedDuringValidation});
const report={schemaVersion:1,generatedAt:new Date().toISOString(),scope:'Canonical joint and measured palm marker checks at120Hz, plus independent second-order ball-velocity checks at1kHz on actual blend boundaries and interruptions. These do not establish mesh silhouette quality, physical collision, finger wrapping or hardware GPU performance.',inputs,changedDuringValidation,limits,actionCount:ACTIONS.length,profileCount:Object.keys(rig.profiles).length,totalSamples:results.reduce((n,r)=>n+r.sampleCount,0),results,transitions,continuity,transformed,failures,pass:failures.length===0};
await fs.mkdir(path.join(ROOT,'verification'),{recursive:true});await fs.writeFile(path.join(ROOT,'verification','motion-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,actions:report.actionCount,profiles:report.profileCount,samples:report.totalSamples,failures:report.failures.length,worstPalmMeters:Math.max(...results.map(r=>r.maxPalmResidualMeters)),worstPlantMeters:Math.max(...results.map(r=>r.maxPlantedAnkleTargetResidualMeters)),worstJointStepRadians:Math.max(...results.map(r=>r.maxJointStepRadians))},null,2));
for(const f of failures.slice(0,15))console.log(JSON.stringify(f));
if(!report.pass)process.exitCode=1;
