// SPDX-License-Identifier: CC0-1.0
// Compact, continuous canonical-18 pit choreography. All source assets are local.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Quaternion, Vector3, Euler, Matrix4 } from '../../racing-v7/vendor/three.module.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rig=JSON.parse(await readFile(path.join(root,'../racing-pit-v1/rig.json'),'utf8'));
const names=rig.bones.map(b=>b.name), parents=rig.bones.map(b=>names.indexOf(b.parent));
const rest=rig.bones.map(b=>b.restTranslationMeters);
const v=a=>new Vector3(...a), q=a=>new Quaternion(...a), arr=x=>x.toArray();
const euler=(x=0,y=0,z=0)=>new Quaternion().setFromEuler(new Euler(x,y,z,'XYZ'));
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const mix=(a,b,u)=>a.map((x,i)=>x+(b[i]-x)*u);
function fk(R,T){
 const P=[],Q=[];
 for(let i=0;i<18;i++){
  const p=parents[i];
  P[i]=v(T[i]);Q[i]=R[i].clone();
  if(p>=0){P[i].applyQuaternion(Q[p]).add(P[p]);Q[i].premultiply(Q[p]);}
 }
 return {P,Q};
}
function direction(a){return new Quaternion().setFromUnitVectors(new Vector3(0,-1,0),a.clone().normalize());}
function hingeDirection(segment,hinge){
 const x=hinge.clone().normalize(),y=segment.clone().normalize().negate(),z=new Vector3().crossVectors(x,y).normalize();
 return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z));
}
function arm(side,target,R,T){
 const i=side==='Left'?6:9,sign=side==='Left'?1:-1,{P,Q}=fk(R,T),S=P[i],delta=v(target).sub(S);
 const d=Math.min(.509,Math.max(.055,delta.length())),dir=delta.normalize();
 const pole=v([sign*.8,-.15,-.55]);pole.addScaledVector(dir,-pole.dot(dir)).normalize();
 const along=(.27**2-.24**2+d*d)/(2*d),elbow=S.clone().addScaledVector(dir,along).addScaledVector(pole,Math.sqrt(Math.max(0,.27**2-along**2)));
 const hand=S.clone().addScaledVector(dir,d),upper=direction(elbow.clone().sub(S)),lower=direction(hand.clone().sub(elbow));
 R[i]=Q[3].clone().invert().multiply(upper);R[i+1]=upper.clone().invert().multiply(lower);
 // Gloves have a reproducible global orientation; attachments use wrist transforms.
 R[i+2]=lower.clone().invert();
}
function leg(i,target,R,T){
 const {P,Q}=fk(R,T),hip=P[i],delta=v(target).sub(hip),len=Math.min(.77999999,Math.max(.05,delta.length())),dir=delta.normalize();
 const pole=v([0,0,1]).applyQuaternion(Q[1]);pole.addScaledVector(dir,-pole.dot(dir)).normalize();
 const along=(.41**2-.37**2+len*len)/(2*len),knee=hip.clone().addScaledVector(dir,along).addScaledVector(pole,Math.sqrt(Math.max(0,.41**2-along**2)));
 const upperVector=knee.clone().sub(hip),lowerVector=v(target).sub(knee),hinge=new Vector3().crossVectors(upperVector,lowerVector).normalize();
 const upper=hingeDirection(upperVector,hinge),lower=hingeDirection(lowerVector,hinge);
 R[i]=Q[1].clone().invert().multiply(upper);R[i+1]=upper.clone().invert().multiply(lower);R[i+2]=lower.clone().invert();
}
const work={hip:[0,.40,-.10],lean:.32,left:[.26,.50,.38],right:[-.26,.50,.38]};
const clear={...work,left:[.24,.66,.05],right:[-.24,.66,.05]};
const jack={hip:[0,.62,-.06],lean:.2,left:[.14,.78,.28],right:[-.14,.78,.28]};
const jackPressed={...jack,left:[.14,.68,.32],right:[-.14,.68,.32]};
const signal={...jack,left:[.22,1.45,.16],right:[-.14,.78,.28]};
const interp=(a,b,u)=>({hip:mix(a.hip,b.hip,u),lean:a.lean+(b.lean-a.lean)*u,left:mix(a.left,b.left,u),right:mix(a.right,b.right,u)});
function poseDescription(name,u){
 const s=smooth(u);
 if(name==='idle_work')return work;
 if(name==='idle_clear')return clear;
 if(name==='ready_jack')return jack;
 if(name==='held_jack')return jackPressed;
 if(name==='signal_hold')return signal;
 if(name==='idle_signal')return signal;
 if(name==='jack_up')return interp(jack,jackPressed,s);
 if(name==='jack_down')return interp(jackPressed,jack,s);
 if(name==='signal')return interp(jack,signal,s);
 if(name==='withdraw')return interp(work,clear,s);
 if(name==='loosen'||name==='tighten'){
  // Left hand stabilizes tire while right operates a short coaxial wheel gun.
  const wobble=.008*Math.sin(u*Math.PI*8)*Math.sin(Math.PI*u)**2;
  const duration=name==='loosen'?.22:.26,sec=u*duration;
  const ramp=x=>{x=clamp(x);return x*x*(3-2*x);};
  const w=ramp(sec/.08)*ramp((duration-sec)/.08);
  return interp(work,{...work,right:[-.18+wobble,.52,.22],left:[.26,.50,.38]},w);
 }
 if(name==='remove_old'){
  // A short axial pull clears the central splines before the old tire leaves hand.
  const c=mix([0,.50,.38],[.08,.50,.17],smooth(u/.555555556));
  const target={...work,left:[c[0]+.26,c[1],c[2]],right:[c[0]-.26,c[1],c[2]]};
  // Release at 0.20s, then step sideways and reach the separate new-tire tray.
  return interp(target,{...work,left:[-.26,.85,.07],right:[-.78,.85,.07]},smooth((u-.555555556)/.444444444));
 }
 if(name==='mount_new'){
  const c=mix([-.52,.85,.07],[0,.50,.38],smooth((u-.052631579)/.894736842));
  return {...work,left:[c[0]+.26,c[1],c[2]],right:[c[0]-.26,c[1],c[2]]};
 }
 throw Error(name);
}
function solvePose(d,rootX=0,feetX=[.1,-.1],feetY=[.08,.08],rootYaw=0,rootZ=0,feetZ=[0,0]){
 const R=names.map(()=>new Quaternion()),T=rest.map(a=>[...a]);T[0]=[rootX,0,rootZ];R[0]=euler(0,rootYaw);
 T[1]=[...d.hip];R[2]=euler(d.lean*.6);R[3]=euler(d.lean*.4);R[4]=euler(-d.lean*.3);
 const left=arr(v(d.left).applyQuaternion(R[0]).add(v(T[0]))),right=arr(v(d.right).applyQuaternion(R[0]).add(v(T[0])));
 arm('Left',left,R,T);arm('Right',right,R,T);
 leg(12,[feetX[0],feetY[0],feetZ[0]],R,T);leg(15,[feetX[1],feetY[1],feetZ[1]],R,T);
 return {R:R.map(arr),T,...fk(R,T)};
}
function pose(name,u){
 if(name==='work_sequence'){
  const t=u*1.22;return t<.22?pose('loosen',t/.22):t<.58?pose('remove_old',(t-.22)/.36):t<.96?pose('mount_new',(t-.58)/.38):pose('tighten',(t-.96)/.26);
 }
 if(name==='jack_cycle'){
  const t=u*1.84;return t<.2?pose('jack_up',t/.2):t<1.5?solvePose(jackPressed):t<1.64?pose('jack_down',(t-1.5)/.14):pose('signal',(t-1.64)/.20);
 }
 if(name==='signal'||name==='withdraw'){
  // Slerp actual authored joint poses: an overhead hand arc avoids IK pole flips.
  const a=solvePose(name==='signal'?jack:work),b=solvePose(name==='signal'?signal:clear),R=a.R.map((x,i)=>q(x).slerp(q(b.R[i]),u)),T=a.T;
  return {R:R.map(arr),T,...fk(R,T)};
 }
 let rootX=0,rootZ=0,rootYaw=0,feetX=[.1,-.1],feetY=[.08,.08],feetZ=[0,0];
 if(name==='remove_old'){
  const t=u*.36,p=smooth((t-.20)/.16),l=clamp((t-.08)/.28);rootX=-.35*p;rootZ=-.28*smooth(l);
  feetX=[.1-.35*smooth(l),-.1];feetY=[.08+.065*Math.sin(Math.PI*l)**2,.08];feetZ=[-.28*smooth(l),0];
 }else if(name==='mount_new'){
  const t=u*.38,l=clamp(t/.36);rootX=-.35+.35*smooth(l);rootZ=-.28+.28*smooth(l);
  feetX=[-.25+.35*smooth(l),-.1];feetY=[.08+.065*Math.sin(Math.PI*l)**2,.08];feetZ=[-.28+.28*smooth(l),0];
 }
 const d=poseDescription(name,u);
 if(name==='remove_old'||name==='mount_new'){
  // Tire targets are in original actor space; subtract baked Root travel once.
  d.left=d.left.map((x,i)=>x-([rootX,0,rootZ][i]));d.right=d.right.map((x,i)=>x-([rootX,0,rootZ][i]));
 }
 const result=solvePose(d,rootX,feetX,feetY,rootYaw,rootZ,feetZ);
 if(name==='remove_old'&&u*.36>.20000001){
  // Once the old wheel is released, follow a steady joint-space reach to the
  // new tray. This empty-hand movement has no wheel/socket contact constraint.
  const startZ=-.28*smooth((.20-.08)/.28);
  const a=solvePose({...work,left:[.34,.50,.17-startZ],right:[-.18,.50,.17-startZ]},0,[.1-.35*smooth((.20-.08)/.28),-.1],[.08+.065*Math.sin(Math.PI*(.20-.08)/.28)**2,.08],0,startZ,[-.28*smooth((.20-.08)/.28),0]);
  const b=solvePose({...work,left:[.09,.85,.35],right:[-.43,.85,.35]},-.35,[-.25,-.1],[.08,.08],0,-.28,[-.28,0]);
  const alpha=clamp((u*.36-.20)/.16),R=result.R.map(q);
  for(const i of [6,7,8,9,10,11])R[i]=q(a.R[i]).slerp(q(b.R[i]),alpha);
  return {R:R.map(arr),T:result.T,...fk(R,result.T)};
 }
 return result;
}
const definitions=[
 ['idle_work',.3,'wheel_mechanic'],['idle_clear',.3,'wheel_mechanic'],
 ['ready_jack',.3,'jack_operator'],['idle_signal',.3,'jack_operator'],['held_jack',.3,'jack_operator'],['signal_hold',.3,'jack_operator'],
 ['jack_up',.2,'jack_operator'],['loosen',.22,'wheel_mechanic'],
 ['remove_old',.36,'wheel_mechanic'],['mount_new',.38,'wheel_mechanic'],
 ['tighten',.26,'wheel_mechanic'],['withdraw',.22,'wheel_mechanic'],
 ['jack_down',.14,'jack_operator'],['signal',.20,'jack_operator'],
 ['work_sequence',1.22,'wheel_mechanic'],['jack_cycle',1.84,'jack_operator']
];
const events={
 loosen:[['nutLoose',.08]],
 remove_old:[['detach',.02],['wheel_clear_hub',.10],['oldReleased',.20],['oldRacked',.36]],
 mount_new:[['newGripped',0],['secondaryGripReleased',.26],['mounted',.36]],
 tighten:[['nutSeated',.19],['torqued',.26]],
 jack_up:[['jacks_raised',.20]],
 jack_down:[['car_grounded',.14],['jacks_clear',.14]],
 signal:[['hand_signal_complete',.20]],withdraw:[['crew_clear',.22]],
 work_sequence:[['nutLoose',.08],['remove_start',.22],['detach',.24],['wheel_clear_hub',.32],['oldReleased',.42],['oldRacked',.58],['mount_start',.58],['newGripped',.58],['secondaryGripReleased',.84],['mounted',.94],['tighten_start',.96],['nutSeated',1.15],['torqued',1.22]],
 jack_cycle:[['jacks_raised',.20],['lower_start',1.50],['car_grounded',1.64],['jacks_clear',1.64],['hand_signal_complete',1.84]]
};
const source=await readFile(path.join(root,'../racing-pit-v1/models/wheel_front_left.glb'));
const jl=source.readUInt32LE(12),base=JSON.parse(source.subarray(20,20+jl).toString()),oldBin=source.subarray(28+jl);
const doc=structuredClone(base);doc.animations=[];doc.accessors=[];doc.bufferViews=[];
doc.asset={version:'2.0',generator:'Bakasun local JavaScript canonical18 compact pit choreography',copyright:'CC0-1.0'};
const chunks=[],viewMap=new Map(),accessorMap=new Map();let size=0;
function addBytes(bytes){const pad=(4-size%4)%4;if(pad){chunks.push(Buffer.alloc(pad));size+=pad;}const off=size;chunks.push(bytes);size+=bytes.length;return off;}
function copyAccessor(index){
 if(accessorMap.has(index))return accessorMap.get(index);
 const ac=structuredClone(base.accessors[index]),view=base.bufferViews[ac.bufferView];
 if(!viewMap.has(ac.bufferView)){
  const nv={...view,buffer:0,byteOffset:addBytes(Buffer.from(oldBin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength)))};
  viewMap.set(ac.bufferView,doc.bufferViews.push(nv)-1);
 }
 ac.bufferView=viewMap.get(ac.bufferView);const ni=doc.accessors.push(ac)-1;accessorMap.set(index,ni);return ni;
}
for(const mesh of doc.meshes)for(const p of mesh.primitives){for(const key of Object.keys(p.attributes))p.attributes[key]=copyAccessor(p.attributes[key]);if(p.indices!==undefined)p.indices=copyAccessor(p.indices);}
for(const skin of doc.skins)skin.inverseBindMatrices=copyAccessor(skin.inverseBindMatrices);
function accessor(values,type){
 const width={SCALAR:1,VEC3:3,VEC4:4}[type],flat=values.flat(),bytes=Buffer.alloc(flat.length*4);flat.forEach((x,i)=>bytes.writeFloatLE(x,i*4));
 const bv=doc.bufferViews.push({buffer:0,byteOffset:addBytes(bytes),byteLength:bytes.length})-1;
 const ac={bufferView:bv,componentType:5126,count:flat.length/width,type};
 if(type==='SCALAR'){ac.min=[Math.min(...flat)];ac.max=[Math.max(...flat)];}
 return doc.accessors.push(ac)-1;
}
const contracts={schemaVersion:1,kind:'compact-canonical18-pit-clips',asset:'pit-actions.glb',units:'meters',axes:{forward:'+Z',up:'+Y'},rig:'../../racing-pit-v1/rig.json',sampleHz:120,rootMotion:'remove_old bakes a diagonal backward-left step to Root[-0.35,0,-0.28]; mount_new returns to Root zero. No Root yaw. Apply Root exactly once, no external additive shift.',newTrayCenterOriginalActorSpace:[-.52,.85,.07],originalGeometry:'../../racing-pit-v1/models/wheel_front_left.glb',sharedWorkPose:{hips:work.hip,leanRadians:work.lean,handGrips:{LeftHand:work.left,RightHand:work.right}},clips:{},attachmentRules:{wheel:'preserve world transform at handoff; LeftHand primary parent; RightHand secondary grip; offsets solved from decoded wrist transforms',gun:'RightHand during loosen/tighten; Hips belt holster during two-hand tire work; socket targets hub',jack:'floor-local Base, animated LiftArm and LiftPad; both car lift pads must support before nut release',oldTire:'Pull axially then release at remove_old +0.20s into catch tray, continuously integrate drop/roll',newTire:'Starts in separate raised tray; grip at mount_new +0.00s; RightHand secondary grip releases at +0.26s; LeftHand seats at +0.36s; do not reuse old tire identity'},qaNotes:{compositeWork:'Stationary service interspersed with a stance adjustment, not a continuous gait. Composite foot support is measured throughout. remove_old and mount_new individually declare locomotion=true and measure body/step agreement.'}};
function supportsFor(name,duration){
 const windows=name==='remove_old'?[[0,.08],[0,.36]]:name==='mount_new'?[[.36,.38],[0,.38]]:name==='work_sequence'?[[0,.30],[.94,1.22],[0,1.22]]:null;
 if(!windows)return ['LeftFoot','RightFoot'].map(bone=>({bone,start:0,end:duration,local:[0,-.08,0]}));
 const leftCount=name==='work_sequence'?2:1;
 return windows.map(([start,end],i)=>({bone:i<leftCount?'LeftFoot':'RightFoot',start,end,local:[0,-.08,0]}));
}
for(const [name,duration,role]of definitions){
 const times=Array.from({length:Math.ceil(duration*120)+1},(_,i)=>Math.min(duration,i/120));
 if(times.at(-1)!==duration)times.push(duration);
 for(const[,t]of events[name]??[])times.push(t);
 const unique=[...new Set(times.map(x=>Number(x.toFixed(8))))].sort((a,b)=>a-b),poses=unique.map(t=>pose(name,t/duration));
 const timeAccessor=accessor(unique,'SCALAR'),samplers=[],channels=[];
 for(let i=0;i<18;i++){
  const node=doc.nodes.findIndex(n=>n.name===names[i]);
  for(const [key,values,type]of [['rotation',poses.map(p=>p.R[i]),'VEC4'],['translation',poses.map(p=>p.T[i]),'VEC3']]){
   if(key==='rotation')for(let j=1;j<values.length;j++)if(values[j].reduce((s,x,k)=>s+x*values[j-1][k],0)<0)values[j]=values[j].map(x=>-x);
   const sampler=samplers.push({input:timeAccessor,output:accessor(values,type),interpolation:'LINEAR'})-1;
   channels.push({sampler,target:{node,path:key}});
  }
 }
 const stepping=['remove_old','mount_new'].includes(name);
 const extras={role,profile:'canonical18',loop:/^idle|^ready|^held|_hold$/.test(name),locomotion:stepping,floorY:0,soleLocal:[0,-.08,0],supports:supportsFor(name,duration),ballVisible:false,checkHingeDirection:true,symmetryMode:'structural',events:(events[name]??[]).map(([type,time])=>({type,time})),rootMotion:stepping||name==='work_sequence'?'baked diagonal stance step, no yaw; consume once':'none',rootDeltaMeters:name==='remove_old'?[-.35,0,-.28]:name==='mount_new'?[.35,0,.28]:[0,0,0],intent:'Prepositioned crew, shared service crouch; compact explicit game-time actions with planted supports'};
 doc.animations.push({name,samplers,channels,extras});
 const samples=[0,.25,.5,.75,1].map(u=>{const p=pose(name,u);return {time:Number((u*duration).toFixed(6)),Root:p.T[0],LeftHand:arr(p.P[8]),RightHand:arr(p.P[11]),LeftFoot:arr(p.P[14]),RightFoot:arr(p.P[17])};});
 contracts.clips[name]={duration,role,loop:extras.loop,events:extras.events,handSamples:samples};
}
const bin=Buffer.concat(chunks),pad=(4-bin.length%4)%4,binPadded=Buffer.concat([bin,Buffer.alloc(pad)]);doc.buffers=[{byteLength:binPadded.length}];
const json0=Buffer.from(JSON.stringify(doc)),json=Buffer.concat([json0,Buffer.alloc((4-json0.length%4)%4,32)]),header=Buffer.alloc(20),bh=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binPadded.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(binPadded.length,0);bh.writeUInt32LE(0x004e4942,4);
const output=Buffer.concat([header,json,bh,binPadded]);await writeFile(path.join(root,'clips/pit-actions.glb'),output);await writeFile(path.join(root,'clips/contracts.json'),JSON.stringify(contracts,null,2)+'\n');
console.log(JSON.stringify({file:'clips/pit-actions.glb',bytes:output.length,bones:names.length,clips:definitions.map(([name,duration])=>({name,duration}))},null,2));
