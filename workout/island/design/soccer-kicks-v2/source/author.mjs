// SPDX-License-Identifier: CC0-1.0
// Original canonical-18 soccer choreography. Metres, seconds, +Y up, +Z forward.
import fs from 'node:fs/promises';
import {bones,pose,fk,point,solve,curve,euler,rotate,add,mul,slerp,mix,I,clamp} from '../../soccer-header-v1/source/rig.mjs';
import {unpack,readAccessor} from '../../soccer-header-v1/source/glb.mjs';
import {sampleMotion} from '../../soccer-header-v1/runtime/player.mjs';

const base=new URL('../',import.meta.url),sole=[0,-.08,0];
async function decode(id){
 const g=unpack(await fs.readFile(new URL(`runtime/reference/${id}.glb`,base))),d=g.document,a=d.animations[0];
 const tracks=a.channels.map(c=>({name:d.nodes[c.target.node].name,path:c.target.path,s:a.samplers[c.sampler]}));
 const times=readAccessor(g,tracks[0].s.input).values;
 const frames=times.map(time=>({time,hips:[0,.785,0],rotations:Object.fromEntries(bones.map(b=>[b.name,[...I]]))}));
 for(const tr of tracks){const v=readAccessor(g,tr.s.output);for(let i=0;i<times.length;i++){
  if(tr.path==='rotation')frames[i].rotations[tr.name]=v.values.slice(i*4,i*4+4);
  if(tr.name==='Hips'&&tr.path==='translation')frames[i].hips=v.values.slice(i*3,i*3+3);
 }}return {id,frames,duration:times.at(-1),loop:true};
}
const idleMotion=await decode('idle_relaxed'),run=await decode('run'),idle=idleMotion.frames[0];
const idleAnkle=Object.fromEntries(['Left','Right'].map(s=>[s,point(idle,s+'Foot')]));
const idleSole=Object.fromEntries(['Left','Right'].map(s=>[s,point(idle,s+'Foot',sole)]));
const blend=(a,b,w)=>({hips:mix(a.hips,b.hips,w),rotations:Object.fromEntries(bones.map(({name})=>[name,slerp(a.rotations[name],b.rotations[name],w)]))});
const C=(t,keys)=>curve(keys,t),rad=Math.PI/180;
// A C1 spatial cubic through backswing/contact/follow, with a moving contact
// tangent. This rounds the kicking arc instead of easing along straight chords.
function ankleArc(t,keys){
 if(t<=keys[0][0])return [...keys[0][1]];
 const tangents=keys.map(()=>[0,0,0]);
 const hit=3,dt=keys[hit+1][0]-keys[hit-1][0];
 tangents[hit]=keys[hit+1][1].map((v,j)=>(v-keys[hit-1][1][j])/dt*1.35);
 for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){
  const [a,p]=keys[i-1],[b,q]=keys[i],u=(t-a)/(b-a),u2=u*u,u3=u2*u;
  return p.map((v,j)=>(2*u3-3*u2+1)*v+(u3-2*u2+u)*(b-a)*tangents[i-1][j]+(-2*u3+3*u2)*q[j]+(u3-u2)*(b-a)*tangents[i][j]);
 }return [...keys.at(-1)[1]];
}
// Every row describes a different 3D ankle path and pelvis/chest timing.
// back, impact and follow are ankle positions, never a straight-line foot drive.
const specs=[
 {id:'power_landing',label:'בעיטה חזקה בנחיתה',duration:3.2,contact:1.3,back:.8,follow:1.65,settle:2.1,
  load:[-.18,.33,-.34],hit:[-.14,.13,.47],finish:[.12,.59,.46],yaw:[-25,18,25],twist:[-18,15,22],lean:[-9,17,22],power:1,hop:true,
  footYaw:[-12,0,16],pitch:[18,12,-8],out:[.2,2.3,16],description:'Small approach hop lands on the left plant; pelvis unwinds towards goal and the instep carries across the midline.'},
 {id:'inside_curve',label:'בעיטת קשת מבפנים',duration:3.2,contact:1.3,back:.8,follow:1.7,settle:2.2,
  load:[-.39,.25,-.30],hit:[-.21,.13,.38],finish:[.30,.38,.38],yaw:[-34,26,40],twist:[-24,25,28],lean:[-4,11,17],power:.8,
  footYaw:[-25,-58,-75],pitch:[13,2,-9],surface:'inside',out:[-4,2.4,12],bend:3.4,description:'Open hip, inside surface and a broad right-to-left wrap; shoulders lag behind the pelvis then twist through.'},
 {id:'outside_kick',label:'בעיטה מבחוץ',duration:3.0,contact:1.2,back:.7,follow:1.6,settle:2.05,
  load:[.03,.25,-.27],hit:[-.24,.13,.39],finish:[-.50,.34,.36],yaw:[12,-24,-36],twist:[19,-17,-24],lean:[-3,13,9],power:.7,
  footYaw:[18,32,54],pitch:[19,7,-5],surface:'outside',out:[3.5,1.5,12],bend:-3.1,description:'The leg cuts outward across the ball with the toe turned in; pelvis and shoulder recoil oppose the inside curve.'},
 {id:'placed_kick',label:'בעיטה בהנחה',duration:2.8,contact:1.2,back:.8,follow:1.55,settle:1.95,
  load:[-.22,.18,-.18],hit:[-.15,.12,.32],finish:[.03,.22,.45],yaw:[-12,12,17],twist:[-8,9,13],lean:[0,12,9],power:.4,
  footYaw:[-30,-63,-60],pitch:[8,0,-3],surface:'inside',out:[-2,.3,9],description:'Compact open-foot pendulum, head over the ball and a held, low controlled follow-through.'},
 {id:'weak_foot',label:'בעיטה ברגל חלשה',duration:3.1,contact:1.3,back:.8,follow:1.7,settle:2.15,
  load:[.29,.25,-.24],hit:[.17,.13,.37],finish:[-.06,.39,.37],yaw:[21,-13,-21],twist:[10,-18,-22],lean:[-6,14,13],power:.55,left:true,
  footYaw:[18,10,-18],pitch:[14,7,-7],out:[2,1.0,11],description:'Left-foot strike with a shorter cocking phase, right support and asymmetric balance-arm compensation; independently authored, not a mirrored power clip.'},
 {id:'volley',label:'בעיטת יעף · volley',duration:3.2,contact:1.4,back:.9,follow:1.8,settle:2.3,
  load:[-.23,.45,-.30],hit:[-.20,.66,.44],finish:[.24,.72,.34],yaw:[-26,28,40],twist:[-20,18,24],lean:[-12,-5,11],power:.9,
  footYaw:[-8,-4,22],pitch:[27,14,-13],out:[.6,2.2,15],incoming:[.15,-1.6,-3.8],description:'High folded backswing opens into a waist-height instep volley, with an elevated across-body follow and grounded left support.'},
 {id:'chip',label:'הקפצה מעל היריב · chip',duration:2.9,contact:1.2,back:.8,follow:1.6,settle:2.05,
  load:[-.17,.15,-.14],hit:[-.14,.095,.32],finish:[-.10,.51,.44],yaw:[-8,9,15],twist:[-12,12,15],lean:[-6,-10,-4],power:.45,
  footYaw:[-7,-9,-5],pitch:[-8,-20,-32],surface:'toe',out:[-.5,5.5,6.2],description:'Short undercut with the toe up and torso leaning back; the ankle rises steeply after lifting the ball.'},
 {id:'short_inside_pass',label:'מסירה קצרה בפנים הרגל',duration:2.4,contact:1.0,back:.65,follow:1.35,settle:1.7,
  load:[-.27,.13,-.11],hit:[-.18,.115,.24],finish:[.02,.17,.29],yaw:[-16,13,16],twist:[-9,8,11],lean:[0,8,6],power:.25,
  footYaw:[-45,-70,-76],pitch:[3,0,-2],surface:'inside',out:[-1.2,.12,5.5],description:'Inside-foot push with a shallow lateral crescent, an open knee and restrained arm motion.'},
 {id:'long_pass',label:'מסירה ארוכה',duration:3.3,contact:1.4,back:.9,follow:1.8,settle:2.3,
  load:[-.30,.39,-.30],hit:[-.14,.12,.42],finish:[.17,.64,.40],yaw:[-30,23,37],twist:[-21,20,25],lean:[-12,3,17],power:.85,
  footYaw:[-17,-15,12],pitch:[12,-7,-19],out:[-1,5.2,13],description:'Long diagonal laces pass, deeper thigh loading and high sweeping follow; the chest opens to give the ball distance.'},
 {id:'through_pass',label:'מסירת עומק',duration:2.7,contact:1.1,back:.7,follow:1.45,settle:1.9,
  load:[-.30,.18,-.17],hit:[-.10,.115,.37],finish:[.18,.22,.37],yaw:[-23,19,28],twist:[12,-8,9],lean:[2,14,11],power:.5,
  footYaw:[-34,-49,-68],pitch:[9,0,-3],surface:'inside',out:[2.5,.25,10],description:'Disguised shoulder look away, then late pelvis opening and a diagonal inside-foot push into the channel.'},
 {id:'lift_pass',label:'מסירה גבוהה · lift_pass',duration:3.0,contact:1.3,back:.85,follow:1.7,settle:2.15,
  load:[-.32,.19,-.23],hit:[-.20,.10,.34],finish:[.04,.52,.42],yaw:[-22,17,25],twist:[-16,14,21],lean:[-9,-7,4],power:.6,
  footYaw:[-25,-43,-53],pitch:[-5,-17,-25],surface:'inside',out:[-2.3,4.8,8],description:'Open inside-foot scoop with a rising diagonal arc; less backswing than long_pass and a steeper ball lift.'},
 {id:'wing_cross',label:'הגבהה מהאגף',duration:3.5,contact:1.5,back:.95,follow:1.95,settle:2.5,
  load:[-.45,.33,-.26],hit:[-.25,.13,.40],finish:[.43,.55,.15],yaw:[-42,36,52],twist:[-25,25,32],lean:[-9,-2,17],power:.95,
  footYaw:[-23,-52,-83],pitch:[9,-8,-18],surface:'inside',out:[-7,5.1,10],bend:2,description:'Wide approach stance and largest hip/chest unwind; the leg wraps across towards the penalty area with a lofted curling cross.'},
];

function arms(p,t,s){
 const load=C(t,[[0,0],[.3,0],[s.back,1],[s.contact,0],[s.follow,0],[s.duration,0]]);
 const hit=C(t,[[0,0],[s.back,0],[s.contact,1],[s.follow,.8],[s.settle,0],[s.duration,0]]),k=s.power??.7,sign=s.left?-1:1;
 const envelope=C(t,[[0,0],[.3,1],[s.duration-.35,1],[s.duration,0]]);
 const q={LeftArm:euler(-8-24*k*load+17*k*hit,sign*(8*load-12*hit),18+22*k*load+12*k*hit),RightArm:euler(-8+17*k*load-32*k*hit,sign*(-8*load+11*hit),-18-12*k*load-20*k*hit),LeftForeArm:euler(-28-18*load-12*hit),RightForeArm:euler(-28-12*load-25*hit)};
 for(const [b,v] of Object.entries(q))p.rotations[b]=slerp(idle.rotations[b],v,envelope);
 return p;
}

function ground(s){
 const D=s.duration,T=s.contact,B=s.back,F=s.follow,S=s.settle,kick=s.left?'Left':'Right',plant=s.left?'Right':'Left';
 const supports=[{bone:plant+'Foot',start:s.hop?.6:0,end:D,local:sole,anchor:idleSole[plant]},
  {bone:kick+'Foot',start:0,end:s.hop?.2:.3,local:sole,anchor:idleSole[kick]},
  {bone:kick+'Foot',start:S,end:D,local:sole,anchor:idleSole[kick]}];
 if(s.hop)supports.push({bone:plant+'Foot',start:0,end:.2,local:sole,anchor:idleSole[plant]});
 const frames=[];
 for(let i=0;i<=Math.round(D*30);i++){
  const t=i/30,loading=C(t,[[0,0],[.3,0],[B,1],[T,.35],[F,0],[D,0]]),hitting=C(t,[[0,0],[B,0],[T,1],[F,.65],[S,0],[D,0]]);
  const yaw=C(t,[[0,0],[.3,0],[B,s.yaw[0]],[T,s.yaw[1]],[F,s.yaw[2]],[S,5],[D-.3,0],[D,0]]);
  const twist=C(t,[[0,0],[.3,0],[B,s.twist[0]],[T,s.twist[1]],[F,s.twist[2]],[S,0],[D,0]]);
  const lean=C(t,[[0,2],[.3,2],[B,s.lean[0]],[T,s.lean[1]],[F,s.lean[2]],[S,2],[D,2]]);
  const qPitch=C(t,[[0,0],[.3,0],[B,s.pitch[0]],[T,s.pitch[1]],[F,s.pitch[2]],[S,0],[D,0]]);
  const qYaw=C(t,[[0,0],[.3,0],[B,s.footYaw[0]],[T,s.footYaw[1]],[F,s.footYaw[2]],[S,0],[D,0]]),q=euler(qPitch,qYaw,0);
  const foot=ankleArc(t,[[0,idleAnkle[kick]],[.3,idleAnkle[kick]],[B,s.load],[T,s.hit],[F,s.finish],[S,idleAnkle[kick]],[D,idleAnkle[kick]]]);
  foot[1]=Math.max(.08*Math.cos(qPitch*rad),foot[1]);
  const hop=s.hop?C(t,[[0,0],[.2,0],[.4,.13],[.6,0],[D,0]]):0;
  const p=pose({hips:[(s.left?-.045:.045)*loading,.785-.052*loading-.013*hitting+hop,.025*hitting],hipYaw:yaw,twist,lean,
   leftFoot:kick==='Left'?foot:add(idleAnkle.Left,[0,hop,0]),rightFoot:kick==='Right'?foot:add(idleAnkle.Right,[0,hop,0]),
   leftKnee:rotate(euler(0,s.left?qYaw*.5:10,0),[0,0,1]),rightKnee:rotate(euler(0,s.left?-10:qYaw*.5,0),[0,0,1]),
   leftFootYaw:s.left?qYaw:0,rightFootYaw:s.left?0:qYaw,leftFootPitch:s.left?qPitch:0,rightFootPitch:s.left?0:qPitch,
   headYaw:s.id==='through_pass'?C(t,[[0,0],[B,-24],[T,12],[S,0],[D,0]]):-yaw*.4,head:-lean*.3});
  let result=blend(idle,arms(p,t,s),C(t,[[0,0],[.3,1],[D-.3,1],[D,0]]));
  for(const w of supports)if(t>=w.start-1e-8&&t<=w.end+1e-8){const side=w.bone.slice(0,-4);solve(result,side+'UpLeg',side+'Leg',w.bone,add(w.anchor,[0,.08,0]),[0,0,1],I);}
  frames.push({time:t,hips:result.hips,rotations:result.rotations});
 }
 return finish(s,frames,supports,kick);
}

function finish(s,frames,supports,kick='Right'){
 const contact=frames[Math.round(s.contact*30)],bone=kick+'Foot',surface=s.surface??'instep';
 const local=surface==='inside'?[kick==='Right'?.055:-.055,-.018,.075]:surface==='outside'?[-.055,-.018,.075]:surface==='toe'?[0,-.025,.155]:[0,.015,.13];
 const contactPoint=point(contact,bone,local),normal=surface==='inside'?[kick==='Right'?1:-1,0,0]:surface==='outside'?[-1,0,0]:[0,0,1];
 let n=rotate(fk(contact)[bone].rotation,normal);n[1]=Math.max(-.25,n[1]);const norm=Math.hypot(...n);n=mul(n,1/norm);
 const center=add(contactPoint,mul(n,.11));
 // Keep the ball above the ground while preserving an exact radius at the
 // declared surface point; calibrate the horizontal component once as well.
 if(center[1]<.11){
  center[1]=.11;const dy=center[1]-contactPoint[1],horizontal=Math.hypot(n[0],n[2]);
  const length=Math.sqrt(Math.max(0,.11*.11-dy*dy));
  center[0]=contactPoint[0]+n[0]/horizontal*length;center[2]=contactPoint[2]+n[2]/horizontal*length;
 }
 const ball={radius:.11,coordinateSpace:'native',trajectory:'Independent ball path calibrated once at contact; unbound during playback.',samples:frames.map(({time})=>{
  const dt=time-s.contact;
  let position;
  if(dt<=0)position=s.incoming?center.map((v,i)=>v+s.incoming[i]*dt):[...center];
  else position=center.map((v,i)=>v+s.out[i]*dt+(i===0?(s.bend??0)*dt*dt:i===1?-4.905*dt*dt:0));
  position[1]=Math.max(.11,position[1]);return {time,position};
 })};
 // back is the maximum cocked backswing before the accelerating contact stroke.
 const events=[{type:'back',event:'back',frame:Math.round(s.back*30),time:s.back,bone},
  {type:'contact',event:'contact',frame:Math.round(s.contact*30),time:s.contact,bone,local,position:contactPoint},
  {type:'follow',event:'follow',frame:Math.round(s.follow*30),time:s.follow,bone}];
 if(s.hop)events.push({type:'takeoff',time:.2,frame:6,bones:['LeftFoot','RightFoot']},{type:'land',time:.6,frame:18,bones:['LeftFoot']});
 if(s.id==='scissors')events.push({type:'takeoff',time:.6,frame:18,bones:['LeftFoot','RightFoot']},{type:'land',time:2.2,frame:66,bones:['LeftHand','RightHand'],surface:'palms'});
 events.sort((a,b)=>a.time-b.time);
 const running=s.id==='running_kick';
 return {id:s.id,label:s.label,category:s.id.includes('pass')||s.id==='wing_cross'?'pass':'kick',role:'field',duration:s.duration,durationSeconds:s.duration,
  frameCount:frames.length,nativeRate:30,loop:false,rootMotion:false,locomotion:running,events,event:events.find(e=>e.type==='contact'),contactFrame:Math.round(s.contact*30),supports,ball,
  coreRange:{start:s.back,end:s.follow,duration:s.follow-s.back},timing:{nativeRate:30,contactFrame:Math.round(s.contact*30),durationSeconds:s.duration},
  entry:{reference:running?'run':'idle_relaxed',phase:0,blendSeconds:.3,alternatives:[{reference:running?'idle_relaxed':'run',phase:0,blendSeconds:.3}],sourcePose:'current-displayed',curve:'cubic-hermite-C1'},
  exit:{reference:running?'run':'idle_relaxed',phase:0,blendSeconds:.3,alternatives:[{reference:running?'idle_relaxed':'run',phase:0,blendSeconds:.3}],curve:'cubic-hermite-C1'},
  contactGeometry:{surface,localPointMeters:local,pointMeters:contactPoint,ballCenterMeters:center},notes:s.description,license:'CC0-1.0',frames};
}

function scissors(){
 const s={id:'scissors',label:'בעיטת מספריים',duration:4.4,contact:1.4,back:1.0,follow:1.8,out:[.5,2.4,14],incoming:[0,-1.1,-3],description:'Airborne side scissors: trunk reclines and rolls, right striking leg rises while left leg counter-swings, two palms cushion descent before the get-up.'};
 const supports=[];for(const side of ['Left','Right'])supports.push({bone:side+'Foot',start:0,end:.6,local:sole,anchor:idleSole[side]},
  {bone:side+'Foot',start:3.6,end:4.4,local:sole,anchor:idleSole[side]});
 for(const side of ['Left','Right'])supports.push({bone:side+'Hand',start:2.2,end:2.6,local:[0,-.07,-.025],anchor:[side==='Left'?.25:-.25,0,.72],surface:'palm'});
 const frames=[];
 for(let i=0;i<=132;i++){
  const t=i/30;
  const hips=C(t,[[0,[0,.785,0]],[.3,[0,.76,0]],[.6,[0,.75,0]],[1.0,[0,1.01,.05]],[1.4,[0,1.05,.13]],[1.8,[0,.83,.18]],[2.2,[0,.38,.20]],[2.6,[0,.38,.20]],[3,[0,.60,.10]],[3.6,[0,.785,0]],[4.4,[0,.785,0]]]);
  const pitch=C(t,[[0,2],[.6,-8],[1,-32],[1.4,-64],[1.8,-25],[2.2,78],[2.6,78],[3,30],[3.6,2],[4.4,2]]),roll=C(t,[[0,0],[.6,0],[1,-13],[1.4,-27],[1.8,-19],[2.2,0],[4.4,0]]);
  const lf=C(t,[[0,idleAnkle.Left],[.6,idleAnkle.Left],[1,[.18,.88,.44]],[1.4,[.22,.50,-.20]],[1.8,[.23,.28,-.38]],[2.2,[.13,.10,-.37]],[2.6,[.13,.08,-.37]],[3,[.13,.11,-.15]],[3.6,idleAnkle.Left],[4.4,idleAnkle.Left]]);
  const rf=C(t,[[0,idleAnkle.Right],[.6,idleAnkle.Right],[1,[-.25,.68,-.30]],[1.4,[-.17,1.50,.69]],[1.8,[-.24,.97,.61]],[2.0,[-.52,.38,0]],[2.2,[-.13,.10,-.37]],[2.6,[-.13,.08,-.37]],[3,[-.13,.11,-.15]],[3.6,idleAnkle.Right],[4.4,idleAnkle.Right]]);
  let p=pose({hips,hipPitch:pitch,spinePitch:pitch<0?-7:3,chestPitch:0,roll,hipYaw:C(t,[[0,0],[.6,0],[1,-13],[1.4,14],[1.8,25],[2.2,0],[4.4,0]]),head:-pitch*.3,
   leftFoot:lf,rightFoot:rf,leftFootPitch:0,rightFootPitch:C(t,[[0,0],[1,12],[1.4,20],[1.8,-12],[2.2,0],[4.4,0]]),leftKnee:[.1,0,1],rightKnee:[0,0,1],
   leftHand:[.25,C(t,[[0,.78],[.6,.95],[1,1.20],[1.4,1.15],[1.8,.55],[2.2,.025],[2.6,.025],[3,.55],[3.6,.78],[4.4,.78]]),C(t,[[0,.15],[.6,.1],[1,.12],[1.4,.05],[1.8,.45],[2.2,.65],[2.6,.65],[3,.38],[3.6,.15],[4.4,.15]])],
   rightHand:[-.25,C(t,[[0,.78],[.6,.95],[1,1.1],[1.4,.96],[1.8,.55],[2.2,.025],[2.6,.025],[3,.55],[3.6,.78],[4.4,.78]]),C(t,[[0,.15],[.6,.1],[1,.12],[1.4,.05],[1.8,.45],[2.2,.65],[2.6,.65],[3,.38],[3.6,.15],[4.4,.15]])],
   leftHandAim:euler(C(t,[[0,0],[1.8,-40],[2.2,-90],[2.6,-90],[3.6,0],[4.4,0]])),rightHandAim:euler(C(t,[[0,0],[1.8,-40],[2.2,-90],[2.6,-90],[3.6,0],[4.4,0]]))});
  p=blend(idle,p,C(t,[[0,0],[.3,1],[4.1,1],[4.4,0]]));
  for(const w of supports)if(w.bone.endsWith('Foot')&&t>=w.start-1e-8&&t<=w.end+1e-8){const side=w.bone.slice(0,-4);solve(p,side+'UpLeg',side+'Leg',w.bone,add(w.anchor,[0,.08,0]),[0,0,1],I);}
  frames.push({time:t,hips:p.hips,rotations:p.rotations});
 }return finish(s,frames,supports);
}

function running(){
 const s={id:'running_kick',label:'בעיטה בריצה ללא עצירה',duration:1.6,back:.5,contact:.7,follow:.8,out:[.5,1.2,13],description:'Continuous 4.5 m/s running stride; right-leg swing becomes an instep strike while left stance sweeps backwards in native actor space. No stop or idle hold.'};
 const frames=[],supports=[],speed=4.5;
 for(const [side,offset] of [['Left',0],['Right',.3]])for(let cycle=0;cycle<3;cycle++){
  const start=cycle*.6+offset,end=Math.min(s.duration,start+4/30);if(start>=s.duration)continue;
  supports.push({bone:side+'Foot',start,end,local:sole,anchor:[side==='Left'?.12:-.12,0,.3+speed*start]});
 }
 for(let i=0;i<=48;i++){
  const t=i/30,r=sampleMotion(run,t,{loop:true}),world=fk(r),envelope=C(t,[[0,0],[.4,0],[.5,.4],[.7,1],[.8,.4],[.9,0],[1.8,0]]);
  const p={hips:[...r.hips],rotations:structuredClone(r.rotations)};
  p.rotations.Hips=euler(6,-12*C(t,[[0,0],[.4,0],[.5,1],[.7,-1.5],[.9,0],[1.8,0]]));
  p.rotations.Spine=euler(6,8*envelope);p.rotations.Chest=euler(4,12*envelope);
  const right=C(t,[[0,world.RightFoot.position],[.43333333333333335,world.RightFoot.position],[.5,[-.19,.30,-.26]],[.7,[-.15,.14,.36]],[.8,[.07,.30,.34]],[.9,[-.12,.08,.30]],[1.8,world.RightFoot.position]]);
  const target=mix(world.RightFoot.position,right,envelope),footQ=slerp(world.RightFoot.rotation,euler(10,-8,0),envelope);
  solve(p,'LeftUpLeg','LeftLeg','LeftFoot',world.LeftFoot.position,[0,0,1],world.LeftFoot.rotation);
  solve(p,'RightUpLeg','RightLeg','RightFoot',target,[0,0,1],footQ);
  // Exact native run at the boundaries and outside the striking stride.
  const result=t<.4||t>.9?r:p;
  frames.push({time:t,hips:result.hips,rotations:result.rotations});
 }
 const clip=finish(s,frames,supports);clip.referenceRootMotion={speedMetersPerSecond:speed,coordinateSpace:'world',samples:frames.map(f=>({time:f.time,position:[0,0,speed*f.time]}))};
 // A stationary world ball is approached by the moving actor. After impact
 // the declared outgoing velocity is world velocity, not velocity plus run.
 for(const sample of clip.ball.samples)sample.position[2]+=speed*(s.contact-sample.time);
 clip.ball.trajectory='World-stationary ground ball before contact, independent ballistic flight after impact; actor travel removed from native-local samples.';
 clip.exit.phase=.4;return clip;
}

for(const s of specs)for(const field of ['back','contact','follow','settle','duration'])s[field]=Math.round(s[field]*30)/30;
const clips=[...specs.slice(0,6).map(ground),scissors(),ground(specs[6]),running(),...specs.slice(7).map(ground)];
for(const c of clips){for(const e of c.events)if(Math.abs(e.time*30-Math.round(e.time*30))>1e-7)throw new Error(`${c.id} event ${e.type} is off the 30Hz grid`);}
const data={version:'soccer-kicks-v2',license:'CC0-1.0',skeleton:bones,nativeRate:30,rootMotion:false,axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},clips};
await fs.writeFile(new URL('runtime/motions.json',base),JSON.stringify(data)+'\n');
console.log(clips.map(c=>({id:c.id,frames:c.frames.length,back:c.events.find(e=>e.type==='back').time,contact:c.contactFrame/30})));
