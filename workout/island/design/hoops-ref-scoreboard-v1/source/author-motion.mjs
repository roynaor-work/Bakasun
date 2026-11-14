// SPDX-License-Identifier: CC0-1.0
// Original referee choreography. Analytic two-bone IK is baked into native glTF channels.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from '../../soccer-motion-v8/runtime/vendor/three.module.js';

const bundle=new URL('../',import.meta.url), out=new URL('motion/',bundle);
const reference=new URL('../../motion2/hoops.json',import.meta.url);
const referenceBytes=await readFile(reference), skeleton=JSON.parse(referenceBytes).skeleton;
const bones=skeleton.bones, names=bones.map(b=>b.name), ix=Object.fromEntries(names.map((n,i)=>[n,i]));
const qid=()=>new T.Quaternion(), vec=a=>new T.Vector3(...a), down=vec([0,-1,0]);
const smoother=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(x*(x*6-15)+10);};
const lerp=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
// Travel around the shoulder instead of through it: avoids an artificial fully folded elbow mid-raise.
function arc(a,b,center,u){const av=vec(a).sub(vec(center)),bv=vec(b).sub(vec(center)),al=av.length(),bl=bv.length();av.normalize();bv.normalize();const theta=Math.acos(Math.max(-1,Math.min(1,av.dot(bv))));if(theta<1e-5)return lerp(a,b,u);return av.multiplyScalar(Math.sin((1-u)*theta)/Math.sin(theta)).addScaledVector(bv,Math.sin(u*theta)/Math.sin(theta)).multiplyScalar(al+(bl-al)*u).add(vec(center)).toArray();}
const durations={idle:2.4,run:.8,whistle:2.4,foul:2.8,three_points:3.2,direction:2.8};
function envelope(t,d){const enter=d*.27,leave=d*.7;return t<enter?smoother(t/enter):t<leave?1:1-smoother((t-leave)/(d-leave));}
function poseBase(){return {rotations:Object.fromEntries(names.map(n=>[n,qid()])),translations:{Root:[0,0,0],Hips:[0,.84,0]}};}
function fk(pose){
 const positions={},world={};
 for(const b of bones){const q=pose.rotations[b.name], local=vec(pose.translations[b.name]??b.restTranslationMeters);
  if(b.parent){positions[b.name]=local.applyQuaternion(world[b.parent]).add(positions[b.parent]);world[b.name]=world[b.parent].clone().multiply(q);}
  else{positions[b.name]=local;world[b.name]=q.clone();}
 }
 return {positions,world};
}
function solve(pose,upper,lower,end,target,pole,terminal=qid()){
 const f=fk(pose), parent=bones[ix[upper]].parent, origin=f.positions[upper], goal=vec(target), delta=goal.clone().sub(origin);
 const L1=Math.hypot(...bones[ix[lower]].restTranslationMeters),L2=Math.hypot(...bones[ix[end]].restTranslationMeters);
 const distance=Math.max(.035,Math.min(L1+L2-.0005,delta.length())),axis=delta.normalize();
 const along=(L1*L1-L2*L2+distance*distance)/(2*distance), height=Math.sqrt(Math.max(0,L1*L1-along*along));
 const toward=vec(pole).addScaledVector(axis,-vec(pole).dot(axis)).normalize();
 const middle=origin.clone().addScaledVector(axis,along).addScaledVector(toward,height),actual=origin.clone().addScaledVector(axis,distance);
 const upperWorld=qid().setFromUnitVectors(down,middle.clone().sub(origin).normalize());
 // Solve the hinge in its parent's frame. Independently aligning each segment in world
 // space introduces artificial axial spins when an overhead forearm crosses +Y.
 const lowerLocal=qid().setFromUnitVectors(down,actual.clone().sub(middle).normalize().applyQuaternion(upperWorld.clone().invert()));
 const lowerWorld=upperWorld.clone().multiply(lowerLocal);
 pose.rotations[upper]=f.world[parent].clone().invert().multiply(upperWorld);
 pose.rotations[lower]=lowerLocal;
 pose.rotations[end]=lowerWorld.clone().invert().multiply(terminal);
}
function gaitFoot(p,d=.8,speed=1.6){
 const stance=.42,half=speed*d*stance/2, time=p*d;
 if(p<=stance)return {z:half-speed*time,y:.08,stance:true};
 const u=(p-stance)/(1-stance),span=d*(1-stance),m=-speed*span;
 const z=(2*u**3-3*u*u+1)*(-half)+(u**3-2*u*u+u)*m+(-2*u**3+3*u*u)*half+(u**3-u*u)*m;
 return {z,y:.08+.19*Math.sin(Math.PI*u)**2,stance:false};
}
function authored(id,t){
 const pose=poseBase(),d=durations[id],w=envelope(t,d),run=id==='run';
 let left=[.205,.82,.055],right=[-.205,.82,.055];
 let lp=[1,-.25,.3],rp=[-1,-.25,.3];
 let leftWrist=qid(),rightWrist=qid();
 if(run){
  const phase=(t/d)%1,cycle=2*Math.PI*phase;
  pose.translations.Root=[0,0,1.6*t];pose.translations.Hips=[0,.76+.02*Math.cos(2*cycle),0];
  pose.rotations.Spine.setFromAxisAngle(vec([1,0,0]),.11);pose.rotations.Chest.setFromAxisAngle(vec([0,1,0]),.045*Math.sin(cycle));
  const roots=pose.translations.Root;
  for(const [side,offset] of [['Left',0],['Right',.5]]){
   const foot=gaitFoot((phase+offset)%1);solve(pose,side+'UpLeg',side+'Leg',side+'Foot',[side==='Left'?.105:-.105,foot.y,roots[2]+foot.z],[0,0,1]);
  }
  const body=fk(pose),ls=body.positions.LeftArm,rs=body.positions.RightArm;
  const swing=.16*Math.sin(cycle+.14);
  left=[ls.x+.045,ls.y-.35,ls.z+.21-swing];right=[rs.x-.045,rs.y-.35,rs.z+.21+swing];
  lp=[.7,-.4,-.25];rp=[-.7,-.4,-.25];
 }else{
  const breath=id==='idle'?.0025*(1-Math.cos(t/d*2*Math.PI)):0;
  pose.rotations.Spine.setFromAxisAngle(vec([1,0,0]),-.015*breath/.0025);
  pose.rotations.Head.setFromAxisAngle(vec([0,1,0]),id==='direction'?-.24*w:id==='idle'?.035*Math.sin(2*Math.PI*t/d)**3:0);
  for(const side of ['Left','Right'])solve(pose,side+'UpLeg',side+'Leg',side+'Foot',[side==='Left'?.11:-.11,.08,0],[0,0,1]);
  if(id==='whistle'){
   // Lip landmark measured on the source face atlas, Head-local[-.0023,.0357,.1198].
   // At this neutral torso pose Head=(0,1.45,0); hand-held mouthpiece offset=(0,-.025,.010).
   right=arc(right,[-.0023,1.5107,.1098],[-.16,1.28,0],w);rp=lerp(rp,[-.6,-1,.2],w);
  }else if(id==='foul'){
   right=arc(right,[-.22,1.775,.055],[-.16,1.28,0],w);rp=lerp(rp,[-1,0,.28],w);
   left=lerp(left,[.23,.9,.095],w);
   rightWrist.setFromAxisAngle(vec([0,0,1]),-Math.PI*w);
  }else if(id==='three_points'){
   right=arc(right,[-.25,1.77,.06],[-.16,1.28,0],w);left=arc(left,[.25,1.77,.06],[.16,1.28,0],w);lp=lerp(lp,[1,0,.26],w);rp=lerp(rp,[-1,0,.26],w);
   rightWrist.setFromAxisAngle(vec([0,0,1]),-Math.PI*w);leftWrist.setFromAxisAngle(vec([0,0,1]),Math.PI*w);
  }else if(id==='direction'){
   right=arc(right,[-.65,1.30,.035],[-.16,1.28,0],w);rp=lerp(rp,[-.2,-1,.2],w);
   left=lerp(left,[.19,.87,.075],w);
   rightWrist.setFromAxisAngle(vec([0,0,1]),-Math.PI/2*w);
  }
 }
 solve(pose,'LeftArm','LeftForeArm','LeftHand',left,lp,leftWrist);
 solve(pose,'RightArm','RightForeArm','RightHand',right,rp,rightWrist);
 return {time:t,translations:pose.translations,rotations:Object.fromEntries(Object.entries(pose.rotations).map(([n,q])=>[n,q.normalize().toArray()])),joints:Object.fromEntries(Object.entries(fk(pose).positions).map(([n,p])=>[n,p.toArray()]))};
}
function encode(id,frames){
 const chunks=[],views=[],accessors=[];let offset=0;
 function accessor(values,type){const data=Buffer.from(new Float32Array(values).buffer),width={SCALAR:1,VEC3:3,VEC4:4}[type],view=views.length;
  chunks.push(data);views.push({buffer:0,byteOffset:offset,byteLength:data.length});offset+=data.length;
  const a={bufferView:view,componentType:5126,count:values.length/width,type};if(type==='SCALAR'){a.min=[Math.min(...values)];a.max=[Math.max(...values)];}
  accessors.push(a);return accessors.length-1;
 }
 const times=accessor(frames.map(f=>f.time),'SCALAR'),samplers=[],channels=[];
 function channel(node,path,type,values){const output=accessor(values,type);samplers.push({input:times,output,interpolation:'LINEAR'});channels.push({sampler:samplers.length-1,target:{node,path}});}
 for(const [i,b] of bones.entries()){
  let previous=null;const quaternions=[];
  for(const f of frames){let q=f.rotations[b.name];if(previous&&q.reduce((s,v,j)=>s+v*previous[j],0)<0)q=q.map(v=>-v);quaternions.push(...q);previous=q;}
  channel(i,'rotation','VEC4',quaternions);
 }
 for(const name of ['Root','Hips'])channel(ix[name],'translation','VEC3',frames.flatMap(f=>f.translations[name]));
 const nodes=bones.map(b=>({name:b.name,translation:b.restTranslationMeters,children:bones.map((child,i)=>child.parent===b.name?i:-1).filter(i=>i>=0)}));
 const json={asset:{version:'2.0',generator:'Bakasun original referee choreography v1',extras:{license:'CC0-1.0',fps:30,canonical18:true}},scene:0,scenes:[{nodes:[0]}],nodes,animations:[{name:id,samplers,channels,extras:{fps:30,loop:['idle','run'].includes(id),rootMotion:id==='run',cycleDisplacementMeters:id==='run'?[0,0,1.28]:[0,0,0]}}],buffers:[{byteLength:offset}],bufferViews:views,accessors};
 let jb=Buffer.from(JSON.stringify(json));jb=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,32)]);let binary=Buffer.concat(chunks);binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
 const head=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(28+jb.length+binary.length,8);jh.writeUInt32LE(jb.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([head,jh,jb,bh,binary]);
}
const labels={idle:'עמידה דרוכה',run:'ריצה לאורך קו המגרש',whistle:'שריקה',foul:'עצירת משחק — עבירה',three_points:'אישור סל לשלוש נקודות',direction:'כיוון הוצאת חוץ'};
const notes={idle:'Small breathing and glance; both soles planted.',run:'Alternating flight and planted support, contralateral bent-arm swing, forward torso lean. Native Root travels +Z at 1.6m/s; extract cycle displacement for looping integration.',whistle:'Right hand carries whistle to the lips, holds the signal, and returns.',foul:'Single right arm raised vertically in a stop-clock foul signal; left arm stays low.',three_points:'Both arms rise overhead for a successful three-point signal; return to neutral.',direction:'Right arm extends sideways toward the awarded possession direction; head follows.'};
await mkdir(out,{recursive:true});const clips=[];
for(const [id,duration]of Object.entries(durations)){
 const frames=Array.from({length:Math.round(duration*30)+1},(_,i)=>authored(id,i/30)),bytes=encode(id,frames);
 await writeFile(new URL(id+'.glb',out),bytes);
 const supports=id==='run'?[{bone:'LeftFoot',start:0,end:.336,local:[0,-.08,0]},{bone:'RightFoot',start:.4,end:.736,local:[0,-.08,0]}]:['LeftFoot','RightFoot'].map(bone=>({bone,start:0,end:duration,local:[0,-.08,0]}));
 const events=id==='run'?[{time:0,type:'plant',bone:'LeftFoot'},{time:.336,type:'release',bone:'LeftFoot'},{time:.4,type:'plant',bone:'RightFoot'},{time:.736,type:'release',bone:'RightFoot'}]:id==='idle'?[]:[{time:duration*.27,type:'signal_start'},{time:duration*.7,type:'signal_end'}];
 clips.push({id,label:labels[id],asset:'motion/'+id+'.glb',duration,frameCount:frames.length,fps:30,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),rootMotion:id==='run',cycleDisplacementMeters:id==='run'?[0,0,1.28]:[0,0,0],metadata:{label:labels[id],kind:id==='run'?'locomotion':'officiating',role:'referee',duration,loop:['idle','run'].includes(id),fps:30,locomotion:id==='run',symmetryMode:id==='run'?'gait':'structural',rootMotion:id==='run',rootMotionApplied:true,ballVisible:false,ballContacts:[],supports,events,soleLocal:[0,-.08,0],checkHingeDirection:true,floorY:0,coordinateSpace:'native exported GLB world in canonical metres; no reference travel injected',notes:notes[id]}});
}
await writeFile(new URL('skeleton.json',out),JSON.stringify(skeleton,null,2)+'\n');
await writeFile(new URL('motions.json',out),JSON.stringify({schemaVersion:1,id:'hoops-ref-scoreboard-v1',fps:30,authorship:{license:'CC0-1.0',method:'Original analytic IK choreography, baked to native GLB at 30Hz; no third-party motion clips.'},sourceSkeleton:{path:'workout/island/design/motion2/hoops.json',sha256:createHash('sha256').update(referenceBytes).digest('hex')},skeleton,clips},null,2)+'\n');
console.log(JSON.stringify(clips.map(c=>({id:c.id,frames:c.frameCount,bytes:c.bytes}))));
