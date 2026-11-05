/** Independent numeric checks of the delivered dribble presentation curves. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {ACTIONS,createMotionController} from './motion.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rig=JSON.parse(await fs.readFile(path.join(root,'rig.json'),'utf8'));
const authoring=JSON.parse(await fs.readFile(path.join(root,'model-authoring.json'),'utf8'));
const hash=async file=>({file,sha256:createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')});
const files=['source/motion.mjs','rig.json','model-authoring.json'];const inputs=await Promise.all(files.map(hash));
const dt=.0002,limits={positionMeters:1e-6,freeGravityMetersPerSecondSquared:.0001,pushBoundaryVelocityMetersPerSecond:.002};
const records=[];
for(const [id,profile]of Object.entries(rig.profiles)){
  const metadata=Array.isArray(authoring.profiles)?authoring.profiles.find(p=>p.id===id):authoring.profiles[id];
  const height=metadata.heightMeters||metadata.height,actor=new THREE.Group(),joints={};
  for(const j of profile.joints){const b=new THREE.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);(j.parent?joints[j.parent]:actor).add(b);joints[j.name]=b;}
  const controller=createMotionController(actor,{profile:{...profile,heightMeters:height}});
  for(const action of ACTIONS.filter(a=>a.category==='dribble')){
    controller.setAction(action.id,{immediate:true});
    const transfer=['dribble_crossover','dribble_between_legs'].includes(action.id),P=action.duration/(transfer?2:1),top=height*(action.id==='dribble_power'?.43:action.id==='dribble_between_legs'?.42:.51),radius=.12,H=top-radius,T=P/2,Tp=Math.max(.08*P,T-Math.sqrt(2*H/9.81)),U=Tp/P;
    const y=phase=>{controller.seek(phase);return controller.getDiagnostics().ballPosition[1];};
    const tops=transfer?[0,.5]:[0],floors=transfer?[.25,.75]:[.5];
    const topError=Math.max(...tops.map(t=>Math.abs(y(t)-top))),floorError=Math.max(...floors.map(t=>Math.abs(y(t)-radius)));
    let maxGravityError=0,maxVelocityError=0;
    for(const bounce of transfer?[0,1]:[0]){
      for(const u of [.25,.75]){
        const phase=(bounce+u)/(transfer?2:1),epsilon=dt/action.duration,acceleration=(y(phase+epsilon)-2*y(phase)+y(phase-epsilon))/(dt*dt);
        maxGravityError=Math.max(maxGravityError,Math.abs(acceleration+9.81));
      }
      for(const u of [U,1-U]){
        const phase=(bounce+u)/(transfer?2:1),e=dt/action.duration,p0=y(phase),left=(3*p0-4*y(phase-e)+y(phase-2*e))/(2*dt),right=(-3*p0+4*y(phase+e)-y(phase+2*e))/(2*dt);
        maxVelocityError=Math.max(maxVelocityError,Math.abs(left-right));
      }
    }
    const pass=topError<=limits.positionMeters&&floorError<=limits.positionMeters&&maxGravityError<=limits.freeGravityMetersPerSecondSquared&&maxVelocityError<=limits.pushBoundaryVelocityMetersPerSecond;
    records.push({profile:id,action:action.id,periodSeconds:P,pushEndNormalizedWithinBounce:U,topMeters:top,topErrorMeters:topError,floorErrorMeters:floorError,maxFreeGravityErrorMetersPerSecondSquared:maxGravityError,maxPushBoundaryVelocityResidualMetersPerSecond:maxVelocityError,pass});
  }
  controller.dispose();
}
const after=await Promise.all(files.map(hash)),changed=inputs.filter(a=>!after.some(b=>a.file===b.file&&a.sha256===b.sha256));
const report={schemaVersion:1,generatedAtUtc:new Date().toISOString(),inputs,changedDuringValidation:changed,limits,records,scope:'Displayed canonical ball centre in metres. Finite differences measure free-flight gravity and C1 at the authored hand-push/brake boundaries; exact top/floor timing is checked for all five styles and six measured profiles. This is not rigid-body collision or gameplay ownership validation.',pass:records.every(r=>r.pass)&&changed.length===0};
await fs.writeFile(path.join(root,'verification/dribble-physics.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,cases:records.length,maxGravityError:Math.max(...records.map(r=>r.maxFreeGravityErrorMetersPerSecondSquared)),maxBoundaryC1:Math.max(...records.map(r=>r.maxPushBoundaryVelocityResidualMetersPerSecond)),changed}));
if(!report.pass){console.log(JSON.stringify(records.filter(r=>!r.pass)));process.exitCode=1;}
