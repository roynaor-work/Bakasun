// SPDX-License-Identifier: CC0-1.0
// Canonical FK sampler; actual and reference travel are deliberately separate fields.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CANON_NAMES,normaliseSoccerClip,sampleCanonical,jointWorld,qrotate} from '../../minigames/athletes-core.mjs';
const add=(a,b)=>a.map((v,i)=>v+b[i]);
export function headingNeutralJoints(joints,rootQ){
 const forward=qrotate(rootQ,[0,0,1]),heading=Math.atan2(forward[0],forward[2]);
 const inverseYaw=[0,-Math.sin(heading/2),0,Math.cos(heading/2)];
 return Object.fromEntries(Object.entries(joints).map(([name,point])=>[name,qrotate(inverseYaw,point)]));
}
function positionAt(keys,t){
 if(!Array.isArray(keys)||!keys.length)return null;
 if(t<=keys[0].timeSeconds)return keys[0].translationMeters;
 for(let i=1;i<keys.length;i++)if(t<=keys[i].timeSeconds){const a=keys[i-1],b=keys[i],u=(t-a.timeSeconds)/(b.timeSeconds-a.timeSeconds||1);return a.translationMeters.map((v,j)=>v+(b.translationMeters[j]-v)*u);}
 return keys.at(-1).translationMeters;
}
function validReference(keys,D){return Array.isArray(keys)&&keys.length>=2&&keys[0].timeSeconds<=0&&keys.at(-1).timeSeconds>=D-1e-8&&keys.every((k,i)=>Number.isFinite(k.timeSeconds)&&Array.isArray(k.translationMeters)&&k.translationMeters.length===3&&k.translationMeters.every(Number.isFinite)&&(!i||k.timeSeconds>keys[i-1].timeSeconds));}
function supportSeconds(state){return(state.supports??[]).map(w=>({...w,start:w.startSeconds??w.start??w.startTime*state.durationSeconds,end:w.endSeconds??w.end??w.endTime*state.durationSeconds,local:w.local??w.localPointMeters??[0,-.08,0]}));}
export async function loadHockey(source,{fps=60,legacy=false}={}){
 const bytes=await readFile(new URL(`../${source.folder}/clips.json`,import.meta.url)),pack=JSON.parse(bytes);
 const clips=Object.entries(pack.states).map(([id,state])=>{
  const D=state.durationSeconds,supports=supportSeconds(state),skating=state.skating;
  const blade=!legacy&&skating?.contactModel==='blade';
  const canonical={...normaliseSoccerClip(id,state,source.id),loop:false};
  const times=[...new Set([...Array.from({length:Math.ceil(D*fps)+1},(_,i)=>Math.min(D,i/fps)),...state.keyframes.map(k=>k.time*D),...supports.flatMap(s=>[s.start,s.end]),...(state.events??[]).map(e=>e.timeSeconds??e.time)])].filter(t=>Number.isFinite(t)&&t>=0&&t<=D).sort((a,b)=>a-b).filter((t,i,a)=>!i||t-a[i-1]>1e-6);
  const independent=validReference(skating?.referenceRootMotion,D);
  const frames=times.map(t=>{
   const world=jointWorld(sampleCanonical(canonical,t));
   const authoredRoot=positionAt(state.referenceRootMotion,t)??(state.referenceVelocityMps??[0,0,state.speedMps??0]).map(v=>v*t);
   const actualRoot=add(authoredRoot,world.Root?.p??[0,0,0]);
   const referenceRoot=blade?positionAt(skating?.referenceRootMotion,t):authoredRoot;
   const joints=Object.fromEntries(CANON_NAMES.map(n=>[n,add(world[n].p,authoredRoot)]));
   const rotations=Object.fromEntries(CANON_NAMES.map(n=>[n,world[n].q]));
   // Heading is an external presentation transform. Root-relative body height, pose,
   // angular velocity and all limb errors remain in the endpoint comparison.
   const rootQ=world.Root?.q??[0,0,0,1];
   const rawJoints=Object.fromEntries(CANON_NAMES.map(n=>[n,world[n].p]));
   const localJoints=blade?headingNeutralJoints(rawJoints,rootQ):rawJoints;
   const soles=Object.fromEntries(['LeftFoot','RightFoot'].map(b=>[b,add(joints[b],qrotate(rotations[b],[0,-.08,0]))]));
   const endpoints=Object.entries(soles).map(([bone,position])=>({bone,position}));
   if(blade)for(const bone of ['LeftFoot','RightFoot'])for(const p of skating.bladeLocal?.heel&&skating.bladeLocal?.toe?[skating.bladeLocal.heel,skating.bladeLocal.toe]:[[0,-.08,-.0865],[0,-.08,.1985]])endpoints.push({bone,position:add(joints[bone],qrotate(rotations[bone],p))});
   return{t,joints,rotations,localJoints,assetRoot:[0,0,0],root:legacy?authoredRoot:actualRoot,referenceRoot:referenceRoot??[0,0,0],soles,floorPoints:endpoints,ball:null};
  });
  return{id,label:state.labelHe??state.label??id,duration:D,height:1.85,role:state.role??(/^goalie/.test(id)?'goalie':'skater'),metadata:{loop:state.loop,role:state.role??(/^goalie/.test(id)?'goalie':'skater'),locomotion:!!state.gaitKind,kind:state.gaitKind?'locomotion':'action',speed:state.speedMps??0,rootMotion:false,referenceTravelKnown:blade?independent:!!state.referenceVelocityMps||state.speedMps>0,referenceRootMotion:{samples:blade?skating.referenceRootMotion:state.referenceRootMotion??[]},supports,events:state.events??[],soleLocal:[0,-.08,0],floorY:0,checkHingeDirection:true,ballVisible:false,ballContacts:[],symmetryMode:state.loop&&state.gaitKind?'gait':'structural',coordinateSpace:blade?'authored actual world; independent skating reference trajectory':'authored reference world; in-place canonical poses plus declared reference trajectory',...(blade?{contactModel:'blade',blade:{segmentLocalMeters:skating.bladeLocal?.heel&&skating.bladeLocal?.toe?[skating.bladeLocal.heel,skating.bladeLocal.toe]:[[0,-.08,-.0865],[0,-.08,.1985]],normalLocal:skating.bladeLocal?.normal??[0,1,0]},continuityFrame:'root heading removed from body-relative markers; root height and all limb pose errors retained'}:{})},frames};
 });
 return{...source,source,clips,sources:[{path:`${source.path}/clips.json`,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}]};
}
