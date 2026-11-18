// SPDX-License-Identifier: CC0-1.0. Original authored keeper reactions, metres/seconds/xyzw.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {restPose,forward,lockFoot,qmul,qinv,unit,cross,dot,vsub,vadd,vmul} from './rig-ops.mjs';
import {animationGLB} from './glb-writer.mjs';
const root=new URL('../',import.meta.url),rig=JSON.parse(await readFile(new URL('source/rig.json',root)));
const I=[0,0,0,1],rx=d=>[Math.sin(d*Math.PI/360),0,0,Math.cos(d*Math.PI/360)];
const ease=u=>{u=Math.max(0,Math.min(1,u));return u*u*u*(10+u*(-15+6*u));};
function curve(keys,t){let i=1;while(i<keys.length&&keys[i][0]<t)i++;if(i===keys.length)return keys.at(-1)[1];if(t<=keys[0][0])return keys[0][1];const[a,x]=keys[i-1],[b,y]=keys[i],u=ease((t-a)/(b-a));return Array.isArray(x)?x.map((v,j)=>v+(y[j]-v)*u):x+(y-x)*u;}
// A continuous elbow plane fixes axial roll even when the forearm passes above the shoulder.
function basisQ(x,y){const z=unit(cross(x,y)),m=[x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]],tr=m[0]+m[4]+m[8];let q;
 if(tr>0){const s=2*Math.sqrt(tr+1);q=[(m[7]-m[5])/s,(m[2]-m[6])/s,(m[3]-m[1])/s,s/4];}
 else if(m[0]>m[4]&&m[0]>m[8]){const s=2*Math.sqrt(1+m[0]-m[4]-m[8]);q=[s/4,(m[1]+m[3])/s,(m[2]+m[6])/s,(m[7]-m[5])/s];}
 else if(m[4]>m[8]){const s=2*Math.sqrt(1+m[4]-m[0]-m[8]);q=[(m[1]+m[3])/s,s/4,(m[5]+m[7])/s,(m[2]-m[6])/s];}
 else{const s=2*Math.sqrt(1+m[8]-m[0]-m[4]);q=[(m[2]+m[6])/s,(m[5]+m[7])/s,s/4,(m[3]-m[1])/s];}return q;
}
function solveArm(p,bone,target,side){const stem=bone.replace('Hand',''),fk=forward(rig,p),a=fk.joints[stem+'Arm'],delta=vsub(target,a),raw=Math.hypot(...delta),d=Math.max(.031,Math.min(.50999,raw)),axis=unit(delta),pole=[side,0,-1],bend=unit(vsub(pole,vmul(axis,dot(pole,axis)))),x=(.27**2-.24**2+d*d)/(2*d),h=Math.sqrt(Math.max(0,.27**2-x*x)),b=vadd(a,vadd(vmul(axis,x),vmul(bend,h))),c=vadd(a,vmul(axis,d)),normal=unit(cross(vsub(b,a),vsub(c,b))),upper=basisQ(normal,vmul(unit(vsub(b,a)),-1)),lower=basisQ(normal,vmul(unit(vsub(c,b)),-1));p.rotations[stem+'Arm']=qmul(qinv(fk.rotations.Chest),upper);p.rotations[stem+'ForeArm']=qmul(qinv(upper),lower);p.rotations[bone]=qinv(lower);}
const neutral={hip:.80,lean:2,neck:0,head:0,left:[.245,.845,.10],right:[-.245,.845,.10],lift:0};
const event=(time,type,bone,local)=>({time,type,...(bone?{bone}:{}),...(local?{local}:{} )});
const feet=(start,end)=>['LeftFoot','RightFoot'].map((bone,i)=>({bone,start,end,anchor:[i?-.18:.18,0,0],local:[0,-.08,0]}));
const definitions=[
 {id:'keeper_after_goal',label:'אחרי ספיגת שער',duration:2.5,loop:false,
  curves:{hip:[[0,.80],[.35,.75],[.9,.27],[1.2,.27],[2.30,.79],[2.5,.80]],lean:[[0,2],[.35,18],[.9,58],[1.2,58],[2.3,4],[2.5,2]],head:[[0,0],[.35,28],[.9,26],[1.3,20],[2.35,0],[2.5,0]],right:[[0,neutral.right],[.35,[-.25,.73,.19]],[.9,[-.29,.08,.39]],[1.2,[-.29,.08,.39]],[1.95,[-.28,.65,.26]],[2.5,neutral.right]],left:[[0,neutral.left],[.9,[.32,.54,.40]],[1.2,[.32,.54,.40]],[2.5,neutral.left]]},
  events:[event(0,'plant','LeftFoot',[0,-.08,0]),event(0,'plant','RightFoot',[0,-.08,0]),event(.35,'head_lowered','Head'),event(.9,'ground_contact','RightHand',[0,-.08,0]),event(1.2,'ground_release','RightHand',[0,-.08,0]),event(2.5,'recovered')],
  supports:[...feet(0,2.5),{bone:'RightHand',start:.9,end:1.2,anchor:[-.29,0,.39],local:[0,-.08,0]}],notes:'Head drops first; a planted right glove supports a low crouch, then the keeper rises slowly. Both soles stay planted.'},
 {id:'disappointed',label:'אכזבה בעמידה',duration:2,loop:true,
  curves:{hip:[[0,.80],[.3,.785],[1.7,.785],[2,.80]],lean:[[0,2],[.3,9],[1.7,9],[2,2]],head:[[0,0],[.35,12],[.85,20],[1.10,12],[1.35,20],[1.7,10],[2,0]],right:[[0,neutral.right],[.3,[-.52,1.14,.24]],[.7,[-.04,1.62,.24]],[1.3,[-.04,1.62,.24]],[1.7,[-.52,1.14,.24]],[2,neutral.right]],left:[[0,neutral.left],[.3,[.255,.79,.12]],[1.7,[.255,.79,.12]],[2,neutral.left]]},
  events:[event(0,'plant','LeftFoot',[0,-.08,0]),event(0,'plant','RightFoot',[0,-.08,0]),event(.3,'shoulders_drop'),event(.7,'head_touch','RightHand'),event(.85,'nod','Head'),event(1.35,'nod','Head')],supports:feet(0,2),notes:'Standing shoulder slump, right glove to the side of the head and two small nods. Identical endpoint poses and zero endpoint velocity form a seamless loop.'},
 {id:'keeper_celebrate',label:'חגיגה אחרי עצירה',duration:1.8,loop:false,
  curves:{hip:[[0,.80],[.3,.69],[.55,.80],[.85,.80],[1.05,.70],[1.8,.80]],lean:[[0,2],[.3,7],[.55,-3],[.85,-3],[1.1,5],[1.8,2]],head:[[0,0],[.55,-8],[.9,-8],[1.8,0]],right:[[0,neutral.right],[.3,[-.54,1.12,.28]],[.7,[-.30,1.68,.08]],[1,[-.30,1.60,.08]],[1.35,[-.54,1.12,.28]],[1.8,neutral.right]],left:[[0,neutral.left],[.3,[.28,.96,.22]],[.65,[.32,1.12,.21]],[1,[.31,.99,.24]],[1.8,neutral.left]]},
  events:[event(0,'plant','LeftFoot',[0,-.08,0]),event(0,'plant','RightFoot',[0,-.08,0]),event(.5,'takeoff'),event(.7,'fist_peak','RightHand'),event(.9,'land','LeftFoot',[0,-.08,0]),event(.9,'land','RightFoot',[0,-.08,0]),event(1.8,'recovered')],supports:[...feet(0,.5),...feet(.9,1.8)],notes:'Dominant right glove is modeled as a closed fist in the bundled canonical keeper. Small 10 cm hop, a soft two-foot landing and a return to the shared neutral stance. The same 18 bind bones are retained.'}
];
// Two short quiet handles make the serialized loop join stationary at both ends.
// Re-map semantic events along with their authored control times.
for(const def of definitions)if(def.id==='disappointed'){
 for(const[k,keys]of Object.entries(def.curves))def.curves[k]=[[0,keys[0][1]],...keys.map(([t,v])=>[.1+.9*t,v]),[2,keys.at(-1)[1]]];
 def.events=def.events.map(e=>e.type==='plant'?e:{...e,time:.1+.9*e.time});
}
function poseAt(def,t){
 const a={...neutral};for(const[k,keys]of Object.entries(def.curves??{}))a[k]=curve(keys,t);
 if(def.id==='keeper_celebrate'&&t>.5&&t<.9)a.lift=.10*Math.sin(Math.PI*(t-.5)/.4)**2;
 const p=restPose(rig,t);p.translations.Root=[0,a.lift,0];p.translations.Hips=[0,a.hip,0];
 p.rotations.Hips=rx(a.lean*.75);p.rotations.Spine=rx(a.lean*.15);p.rotations.Chest=rx(a.lean*.10);p.rotations.Neck=rx(a.neck);p.rotations.Head=rx(a.head);
 // Fixed bind lengths, positive knee hinge and level soles. The jump is baked once in Root.
 for(const[bone,x]of [['LeftFoot',.18],['RightFoot',-.18]])lockFoot(rig,p,{bone,anchor:[x,a.lift,0],worldRotation:I,hingeAngle:0});
 for(const[bone,target,side]of [['LeftHand',a.left,1],['RightHand',a.right,-1]])solveArm(p,bone,[target[0],target[1]+a.lift,target[2]],side);
 return p;
}
await Promise.all(['runtime/clips','runtime/keyframes'].map(p=>mkdir(new URL(p+'/',root),{recursive:true})));
const catalog={schemaVersion:1,version:'soccer-keeper-crowd-v1',fps:30,units:'metres',quaternionOrder:'xyzw',rigFingerprint:'9b90eef9de1951c98362aec1408c4a61e348f2398e6de8ff696e15d8e9ff2f02',models:[{id:'canonical-keeper',path:'runtime/keeper.glb',profile:'canonical18',role:'keeper'}],clips:[]};
for(const def of [...definitions,{id:'keeper_ready_reference',label:'עמידת ייחוס',duration:2,loop:true,curves:{},supports:feet(0,2),events:[]}]){
 const poses=Array.from({length:Math.round(def.duration*30)+1},(_,i)=>poseAt(def,i/30));
 const metadata={id:def.id,label:def.label,role:'keeper',kind:'reaction',duration:def.duration,loop:def.loop,fps:30,events:def.events,supports:def.supports,ball:{visible:false},ballVisible:false,ballContacts:[],rootMotion:def.id==='keeper_celebrate',rootMotionApplied:true,referenceTravelKnown:false,coordinateSpace:'native GLB world; Root lift applied once',soleLocal:[0,-.08,0],checkHingeDirection:true,notes:def.notes??'Shared quiet stance used only for endpoint measurement.',coreRange:{start:0,end:def.duration,duration:def.duration},originalLoop:def.loop,timeScale:1};
 const file=`runtime/clips/${def.id}.glb`,bytes=animationGLB({rig,poses,name:def.id,extras:{version:catalog.version,fps:30,...metadata}});
 await writeFile(new URL(file,root),bytes);
 await writeFile(new URL(`runtime/keyframes/${def.id}.json`,root),JSON.stringify({schemaVersion:1,version:catalog.version,duration:def.duration,fps:30,metadata,poses})+'\n');
 const entry={key:`soccer-keeper-crowd-v1/${def.id}`,id:def.id,library:'soccer-keeper-crowd-v1',status:'original',version:catalog.version,animation:file,animationName:def.id,characters:[{id:'canonical-keeper',model:'runtime/keeper.glb'}],duration:def.duration,frameCount:poses.length,height:1.69,metadata,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 if(def.id==='keeper_ready_reference')catalog.idleReference=entry;else catalog.clips.push(entry);
}
await writeFile(new URL('runtime/catalog.json',root),JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify(catalog.clips.map(c=>({id:c.id,frames:c.frameCount,bytes:c.bytes}))));
