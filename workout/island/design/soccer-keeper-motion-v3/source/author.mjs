// SPDX-License-Identifier: CC0-1.0
// Original goalkeeper/field choreography. Positions are metres; +X anatomical left.
import fs from 'node:fs/promises';
import {bones,I,pose,fk,solve,euler,qm,qi,rotate,add,sub,mul,slerp} from './rig.mjs';
import {unpack,readAccessor} from './glb.mjs';
const base=new URL('../',import.meta.url),fps=30,tau=2*Math.PI;
const radius=.11,palm=[0,-.10,.05],surfaceZ=-Math.sqrt(radius**2-.075**2);
const S=x=>(x=Math.max(0,Math.min(1,x)),x*x*x*(10+x*(-15+6*x)));
const mix=(a,b,u)=>Array.isArray(a)?a.map((v,i)=>mix(v,b[i],u)):a+(b-a)*u;
function values(keys,t){if(t<=keys[0][0])return structuredClone(keys[0][1]);for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return mix(keys[i-1][1],keys[i][1],S((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));return structuredClone(keys.at(-1)[1]);}
const curve=(keys,t)=>values(keys,t);
function decodePose(file){const g=unpack(file),d=g.document,a=d.animations[0],p={hips:[],rotations:{}};for(const c of a.channels){const s=a.samplers[c.sampler],v=readAccessor(g,s.output).values,n=d.nodes[c.target.node].name;if(c.target.path==='rotation')p.rotations[n]=v.slice(0,4);else if(n==='Hips'&&c.target.path==='translation')p.hips=v.slice(0,3);}return p;}
const fieldIdle=decodePose(await fs.readFile(new URL('reference/idle_relaxed.glb',base)));
const readySpec={hips:[0,.72,0],hipPitch:5,spinePitch:3,chestPitch:2,head:-5,leftFoot:[.22,.084,0],rightFoot:[-.22,.084,0],leftHand:[.29,.99,.30],rightHand:[-.29,.99,.30],leftHandAim:I,rightHandAim:I};
const ready=()=>pose(readySpec);
const poseMix=(a,b,u)=>({hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(({name})=>[name,slerp(a.rotations[name],b.rotations[name],u)]))});
const support=(bone,start,end)=>({bone,start,end,local:[0,-.08,0]});
const planted=(duration,start=0,end=duration)=>['LeftFoot','RightFoot'].map(b=>support(b,start,end));
const clips=[];
function make(id,label,duration,fn,extra={}){
 const count=Math.round(duration*fps),frames=Array.from({length:count+1},(_,i)=>{const time=i/fps,p=fn(time);return {time,hips:p.hips,rotations:p.rotations};});
 const role=id.startsWith('keeper')?'goalkeeper':'field';
 clips.push({id,label,role,duration,durationSeconds:duration,nativeRate:fps,frameCount:count+1,loop:false,category:role==='goalkeeper'?'keeper':'reaction',locomotion:false,rootMotion:false,symmetryMode:'structural',events:[],supports:planted(duration),referenceTravel:{coordinateSpace:'simulation-owned world scenario; applied once, never a native Root track',samples:[{time:0,position:[0,0,0],yawRadians:0},{time:duration,position:[0,0,0],yawRadians:0}]},bridge:{runtime:'runtime/player.mjs',durationSeconds:.4,anchors:['reference/idle_relaxed.glb','reference/run.glb'],continuity:'C1 normalized quaternion Hermite; native sided endpoint velocities'},...extra,frames});
 return clips.at(-1);
}
function specMotion(keys,t){const spec={...readySpec};for(const [key,track]of Object.entries(keys))spec[key]=values(track,t);return pose(spec);}
const D=2.4;
make('keeper_ready','עמידה דרוכה',D,t=>{const b=.003*(1-Math.cos(tau*t/D));return pose({...readySpec,hips:[0,.72+b,0],head:-5+1.2*(1-Math.cos(tau*t/D))});},{loop:true,category:'ready'});

// A genuine planted push/close shuffle. The simulation owns net lateral travel.
{
 const duration=3.2,steps=[{side:'Left',a:.4,b:.8,from:.22,to:.62},{side:'Right',a:.9,b:1.3,from:-.22,to:.18},{side:'Left',a:1.6,b:2,from:.62,to:1.02},{side:'Right',a:2.1,b:2.5,from:.18,to:.58}];
 const travel=t=>curve([[0,0],[.3,0],[1.4,.4],[1.5,.4],[2.6,.8],[duration,.8]],t);
 const foot=(side,t)=>{let x=side==='Left'?.22:-.22,y=.084;for(const s of steps.filter(s=>s.side===side)){if(t>=s.b){x=s.to;continue;}if(t>s.a){const u=(t-s.a)/(s.b-s.a);x=s.from+(s.to-s.from)*S(u);y+=.09*Math.sin(Math.PI*u)**2;}break;}return [x-travel(t),y,0];};
 const supports=[];for(const side of ['Left','Right']){let a=0;for(const s of steps.filter(s=>s.side===side)){supports.push(support(side+'Foot',a,s.a));a=s.b;}supports.push(support(side+'Foot',a,duration));}
 make('keeper_shuffle','הזזה צידה · דחיפה וסגירה',duration,t=>pose({...readySpec,leftFoot:foot('Left',t),rightFoot:foot('Right',t),hips:[0,.72-.012*Math.sin(Math.PI*t/duration)**2,0]}),{category:'shuffle',locomotion:true,speedMps:.8/duration,supports,events:steps.flatMap(s=>[{type:'toeoff',bone:s.side+'Foot',time:s.a},{type:'footstrike',bone:s.side+'Foot',time:s.b}]),referenceTravel:{samples:Array.from({length:385},(_,i)=>({time:i/120,position:[travel(i/120),0,0],yawRadians:0}))}});
}

// Airborne lateral extension, padded side landing, hand/knee recovery, reset.
for(const high of [false,true]){
 const duration=5.2,land=high?2:1.7,reach=high?1.25:1.05;
 const xTravel=t=>curve([[0,0],[.65,0],[land,high?1.45:1.05],[duration,high?1.45:1.05]],t);
 const keys={
  hips:[[0,[0,.72,0]],[.35,[0,.72,0]],[.6,[0,.60,0]],[1.1,[0,high?1.25:.52,0]],[land,[0,.28,0]],[2.5,[0,.28,0]],[3.1,[0,.43,0]],[4,[0,.64,0]],[4.8,[0,.72,0]],[duration,[0,.72,0]]],
  roll:[[0,0],[.6,8],[1.1,high?-45:-65],[land,-78],[2.5,-78],[3.1,-34],[4,0],[duration,0]],
  leftFoot:[[0,[.22,.084,0]],[.6,[.22,.084,0]],[1.1,high?[-.34,.84,-.08]:[-.43,.24,-.08]],[land,[-.58,.105,-.09]],[2.5,[-.58,.105,-.09]],[2.8,[-.40,.20,.10]],[3.1,[-.21,.084,.17]],[3.2,[-.21,.084,.17]],[3.45,[.02,.22,.08]],[3.7,[.22,.084,0]],[duration,[.22,.084,0]]],
  rightFoot:[[0,[-.22,.084,0]],[.6,[-.22,.084,0]],[1.1,high?[-.53,1.11,-.20]:[-.57,.49,-.20]],[land,[-.63,.40,-.16]],[2.5,[-.63,.40,-.16]],[3.1,[-.30,.084,-.20]],[3.65,[-.30,.084,-.20]],[3.85,[-.26,.18,-.10]],[4.05,[-.22,.084,0]],[duration,[-.22,.084,0]]],
  leftHand:[[0,readySpec.leftHand],[.6,[.33,1,.26]],[1.1,high?[.65,1.88,.12]:[.72,.62,.20]],[land,[.86,.19,.18]],[2.5,[.86,.19,.18]],[3.1,[.35,.23,.37]],[4,readySpec.leftHand],[duration,readySpec.leftHand]],
  rightHand:[[0,readySpec.rightHand],[.6,[-.17,1.05,.25]],[1.1,high?[.56,1.88,.12]:[.64,.75,.20]],[land,[.76,.39,.18]],[2.5,[.76,.39,.18]],[3.1,[-.18,.54,.35]],[4,readySpec.rightHand],[duration,readySpec.rightHand]],
  hipPitch:[[0,5],[.6,8],[1.1,0],[land,0],[2.5,0],[3.1,14],[4,5],[duration,5]],
  spinePitch:[[0,3],[.6,4],[1.1,0],[land,0],[2.5,0],[3.1,10],[4,3],[duration,3]],
  chestPitch:[[0,2],[.6,3],[1.1,0],[land,0],[2.5,0],[3.1,8],[4,2],[duration,2]],
 };
 // Foot world anchors stay fixed through takeoff, while actor starts at rest.
 const clip=make(high?'keeper_dive_high':'keeper_dive_low',high?'זינוק גבוה · נחיתה והתאוששות':'זינוק נמוך · נחיתה והתאוששות',duration,t=>specMotion(keys,t),{category:'dive',supports:[...planted(duration,0,.6),support('LeftFoot',3.1,3.2),support('RightFoot',3.1,3.65),support('LeftFoot',3.7,duration),support('RightFoot',4.05,duration)],events:[{type:'takeoff',time:.65},{type:'save',time:1.1},{type:'body_land',time:land},{type:'recover',time:3.1},{type:'footstrike',bone:'LeftFoot',time:3.7},{type:'footstrike',bone:'RightFoot',time:4.05}],referenceTravel:{samples:Array.from({length:625},(_,i)=>({time:i/120,position:[xTravel(i/120),0,0],yawRadians:0}))},landing:{type:'lateral padded forearm/hip; feet free until recovery',time:land},direction:'+X; mirror actor-local pose for opposite side'});
 // Independent incoming/deflected ball calibrated once at the authored save key.
 const p=specMotion(keys,1.1),w=fk(p),local=palm,contact=add(w.LeftHand.position,rotate(w.LeftHand.rotation,local)),center=add(contact,[0,0,.11]);
 clip.events.push({type:'contact',bone:'LeftHand',local,time:1.1});
 const worldCenter=add(center,[xTravel(1.1),0,0]);
 clip.ball=impactBall(worldCenter,1.1,[0,-.3,-2.6],[1.7,.5,2.5],duration);
 for(const sample of clip.ball.samples)sample.position[0]-=xTravel(sample.time);
 clip.ballPhysics={coordinateSpace:'world; ball samples store world position minus actor travel',impactTime:1.1,impactPosition:worldCenter,incomingVelocityMps:[0,-.3,-2.6],outgoingVelocityMps:[1.7,.5,2.5],gravityMps2:9.81};
}

// Ball centers are authored separately; wrist IK reaches points on the sphere.
function catchPose(t,centerKeys,other={}){const center=curve(centerKeys,t),s={...readySpec,...other};for(const [side,sign]of [['left',1],['right',-1]])s[side+'Hand']=sub(add(center,[sign*.075,0,surfaceZ]),palm);return pose(s);}
function ballPath(keys,duration){return {radius,coordinateSpace:'actor-local; independent baked trajectory, never live attached',samples:Array.from({length:Math.round(duration*120)+1},(_,i)=>({time:i/120,position:curve(keys,i/120)}))};}
function impactBall(center,hit,incoming,outgoing,duration){return {radius,coordinateSpace:'actor-local independent incoming line and ballistic deflection',samples:Array.from({length:Math.round(duration*120)+1},(_,i)=>{const time=i/120,dt=time-hit;return {time,position:dt<=0?add(center,mul(incoming,dt)):[center[0]+outgoing[0]*dt,Math.max(radius,center[1]+outgoing[1]*dt-4.905*dt*dt),center[2]+outgoing[2]*dt]};})};}
{
 const duration=3.6,centers=[[0,[0,1.20,2.7]],[.8,[0,1.20,.49]],[1.25,[0,1.15,.34]],[2.1,[0,1.10,.32]],[2.7,[0,1.10,.32]],[duration,[0,1.10,.32]]];
 const handCenters=[[0,[0,1.08,.42]],[.8,[0,1.20,.49]],[1.25,[0,1.15,.34]],[2.1,[0,1.10,.32]],[2.7,[0,1.10,.32]],[duration,[0,1.10,.32]]];
 make('keeper_catch_two_hands','תפיסה בשתי ידיים · ספיגה לחזה',duration,t=>{const p=catchPose(t,handCenters);const a=S((t-.2)/.45),b=1-S((t-2.7)/.6);return poseMix(ready(),p,a*b);},{category:'catch',ball:ballPath(centers,duration),ballVisibleRange:[0,2.7],events:[{type:'catch',time:.8},{type:'secure',time:1.25},{type:'possession_transfer',time:2.7}],ballContacts:['Left','Right'].map(side=>({bone:side+'Hand',local:palm,start:.8,end:2.6}))});
}
{
 const duration=3.2,keys={hips:[[0,[0,.72,0]],[.45,[0,.64,0]],[1,[0,1.04,0]],[1.35,[0,.94,0]],[1.8,[0,.68,0]],[2.6,[0,.72,0]],[duration,[0,.72,0]]],leftFoot:[[0,[.22,.084,0]],[.55,[.22,.084,0]],[1,[.18,.40,0]],[1.8,[.22,.084,0]],[duration,[.22,.084,0]]],rightFoot:[[0,[-.22,.084,0]],[.55,[-.22,.084,0]],[1,[-.18,.40,0]],[1.8,[-.22,.084,0]],[duration,[-.22,.084,0]]],leftHand:[[0,readySpec.leftHand],[.5,[.20,1.25,.20]],[1,[.12,1.88,.27]],[1.3,[.16,1.67,.27]],[1.8,[.24,1.30,.30]],[2.6,readySpec.leftHand],[duration,readySpec.leftHand]],rightHand:[[0,readySpec.rightHand],[.5,[-.20,1.25,.20]],[1,[-.12,1.88,.27]],[1.3,[-.16,1.67,.27]],[1.8,[-.24,1.30,.30]],[2.6,readySpec.rightHand],[duration,readySpec.rightHand]]};
 const contact=add(fk(specMotion(keys,1)).LeftHand.position,palm),center=add(contact,[0,0,.11]);
 make('keeper_punch','אגרוף · ניתור והרחקה',duration,t=>specMotion(keys,t),{category:'punch',supports:[...planted(duration,0,.55),...planted(duration,1.8,duration)],events:[{type:'takeoff',time:.55},{type:'contact',bone:'LeftHand',local:palm,time:1},{type:'land',time:1.8}],ball:impactBall(center,1,[0,-.55,-2.6],[0,2.7,5],duration),ballPhysics:{impactTime:1,impactPosition:center,incomingVelocityMps:[0,-.55,-2.6],outgoingVelocityMps:[0,2.7,5],gravityMps2:9.81}});
}
{
 const duration=3.8,keys={hips:[[0,[0,.72,0]],[.6,[0,.74,0]],[1.15,[0,.76,0]],[1.6,[0,.74,0]],[3.3,[0,.72,0]],[duration,[0,.72,0]]],hipYaw:[[0,0],[1, -24],[1.6,18],[2.3,0],[duration,0]],twist:[[0,0],[1,-20],[1.6,12],[2.3,0],[duration,0]],rightHand:[[0,readySpec.rightHand],[.5,[-.16,1.05,.34]],[1,[-.29,1.45,-.21]],[1.4,[-.24,1.54,.29]],[1.7,[-.18,1.18,.53]],[3.2,readySpec.rightHand],[duration,readySpec.rightHand]],leftHand:[[0,readySpec.leftHand],[.5,[.16,1.05,.34]],[1,[.28,1.1,.30]],[1.6,[.33,1.13,.20]],[3.2,readySpec.leftHand],[duration,readySpec.leftHand]]};
 const release=1.4,start=[-.24,1.44,.45],velocity=[0,1.8,4];
 // Independent authored center guide. The wrist follows the sphere surface.
 // The last segment has the same tangent as the released ballistic flight.
 const guide=[[0,[-.29,.89,.46]],[.5,[-.16,.95,.50]],[1,[-.29,1.35,-.05]]];
 const heldBall=t=>{if(t<=1)return curve(guide,t);const u=Math.min(1,(t-1)/.4),a=guide.at(-1)[1];return a.map((v,i)=>(2*u**3-3*u*u+1)*v+(-2*u**3+3*u*u)*start[i]+(u**3-u*u)*.4*velocity[i]);};
 const motion=t=>{const p=specMotion(keys,t);if(t<=release)solve(p,'RightArm','RightForeArm','RightHand',sub(sub(heldBall(t),[0,0,radius]),palm),[-.4,-.7,-.6],I);return p;};
 const clip=make('keeper_throw','הוצאת כדור · הטלה מעל הכתף',duration,motion,{category:'distribution',events:[{type:'release',bone:'RightHand',local:palm,time:release},{type:'contact',bone:'RightHand',local:palm,time:release}],ballPhysics:{gravityMps2:9.81,releaseTime:release,releasePosition:start,releaseVelocityMps:velocity}});
 clip.ball={radius,samples:Array.from({length:457},(_,i)=>{const time=i/120,dt=Math.max(0,time-release);return {time,position:time<=release?heldBall(time):[start[0]+velocity[0]*dt,Math.max(radius,start[1]+velocity[1]*dt-4.905*dt*dt),start[2]+velocity[2]*dt]};})};clip.ballContacts=[{bone:'RightHand',local:palm,start:.45,end:release}];
}
{
 const duration=4.2,keys={hips:[[0,[0,.72,0]],[.6,[0,.75,0]],[1.3,[0,.78,0]],[1.7,[0,.78,0]],[2.2,[0,.74,0]],[3.6,[0,.72,0]],[duration,[0,.72,0]]],rightFoot:[[0,[-.22,.084,0]],[.8,[-.22,.084,0]],[1.25,[-.18,.26,-.31]],[1.6,[-.14,.43,.39]],[1.95,[-.13,.33,.48]],[2.6,[-.22,.084,0]],[duration,[-.22,.084,0]]],rightHand:[[0,readySpec.rightHand],[.5,[-.13,1.05,.38]],[1,[-.12,1.13,.45]],[1.3,[-.25,1.20,.3]],[1.7,[-.40,1.13,.16]],[3.4,readySpec.rightHand],[duration,readySpec.rightHand]],leftHand:[[0,readySpec.leftHand],[.5,[.13,1.05,.38]],[1,[.12,1.13,.45]],[1.3,[.25,1.20,.3]],[1.7,[.40,1.13,.16]],[3.4,readySpec.leftHand],[duration,readySpec.leftHand]],hipPitch:[[0,5],[1.25,-6],[1.8,8],[3,5],[duration,5]],chestPitch:[[0,2],[1.25,-5],[1.8,5],[3,2],[duration,2]]};
 const hit=1.6,drop=38/30,held=[0,1.04,.45],local=[0,-.015,.16],center=[0,held[1]-4.905*(hit-drop)**2,.45],outVelocity=[0,3.5,7];
 const wrist=sign=>sub(add(held,[sign*.075,0,surfaceZ]),palm);
 keys.leftHand=[[0,readySpec.leftHand],[.5,wrist(1)],[drop,wrist(1)],[1.7,[.40,1.13,.16]],[3.4,readySpec.leftHand],[duration,readySpec.leftHand]];
 keys.rightHand=[[0,readySpec.rightHand],[.5,wrist(-1)],[drop,wrist(-1)],[1.7,[-.40,1.13,.16]],[3.4,readySpec.rightHand],[duration,readySpec.rightHand]];
 keys.rightFoot[3]=[hit,sub(sub(center,[0,.06,.0921954446]),local)];
 const trajectory=t=>{if(t<=drop)return held;if(t<=hit)return [0,held[1]-4.905*(t-drop)**2,.45];const dt=t-hit;return [0,Math.max(radius,center[1]+outVelocity[1]*dt-4.905*dt*dt),center[2]+outVelocity[2]*dt];};
 make('keeper_punt','הוצאת כדור · שמיטה ובעיטת שוער',duration,t=>specMotion(keys,t),{category:'distribution',supports:[support('LeftFoot',0,duration),support('RightFoot',0,.8),support('RightFoot',2.6,duration)],events:[{type:'drop',time:drop},{type:'contact',bone:'RightFoot',local,time:hit}],ball:{radius,samples:Array.from({length:505},(_,i)=>({time:i/120,position:trajectory(i/120)}))},ballContacts:['Left','Right'].map(side=>({bone:side+'Hand',local:palm,start:.5,end:drop})),ballVisibleRange:[.5,duration],ballPhysics:{gravityMps2:9.81,dropTime:drop,dropPosition:held,kickTime:hit,kickPosition:center,kickVelocityMps:outVelocity}});
}
{
 const duration=3.8;make('keeper_celebrate','חגיגת שוער · שתי ידיים ואגרופים',duration,t=>specMotion({leftHand:[[0,readySpec.leftHand],[.5,[.26,1.35,.20]],[1.1,[.26,1.65,.06]],[1.5,[.21,1.62,.12]],[2,[.26,1.65,.06]],[3.3,readySpec.leftHand],[duration,readySpec.leftHand]],rightHand:[[0,readySpec.rightHand],[.5,[-.26,1.35,.20]],[1.1,[-.26,1.65,.06]],[1.5,[-.21,1.62,.12]],[2,[-.26,1.65,.06]],[3.3,readySpec.rightHand],[duration,readySpec.rightHand]],head:[[0,-5],[1.1,-16],[2,-12],[3.3,-5],[duration,-5]]},t),{category:'celebration',events:[{type:'fist_pump',time:1.1},{type:'fist_pump',time:2}]});
}
{
 const duration=3.6;make('keeper_disappointed','התאכזבות שוער · שקיעת כתפיים',duration,t=>specMotion({hips:[[0,[0,.72,0]],[1.2,[0,.69,0]],[2.2,[0,.69,0]],[3.2,[0,.72,0]],[duration,[0,.72,0]]],chestPitch:[[0,2],[1.2,15],[2.2,15],[3.2,2],[duration,2]],head:[[0,-5],[1.2,26],[2.2,26],[3.2,-5],[duration,-5]],leftHand:[[0,readySpec.leftHand],[1.2,[.23,.65,.16]],[2.2,[.23,.65,.16]],[3.2,readySpec.leftHand],[duration,readySpec.leftHand]],rightHand:[[0,readySpec.rightHand],[1.2,[-.23,.65,.16]],[2.2,[-.23,.65,.16]],[3.2,readySpec.rightHand],[duration,readySpec.rightHand]]},t),{category:'reaction',events:[{type:'head_drop',time:1.2}]});
}
// Field actions keep planted boot anchors while the torso and arms act.
function fieldAction(id,label,duration,keys,extra={}){return make(id,label,duration,t=>{const action=specMotion({...keys,leftFoot:[[0,[.108,.08,0]],[duration,[.108,.08,0]]],rightFoot:[[0,[-.108,.08,0]],[duration,[-.108,.08,0]]],hips:keys.hips??[[0,[0,.815,0]],[duration,[0,.815,0]]]},t),blend=S((t-.15)/.45)*(1-S((t-(duration-.8))/.55)),p=poseMix(fieldIdle,action,blend);for(const side of ['Left','Right'])solve(p,side+'UpLeg',side+'Leg',side+'Foot',[side==='Left'?.108:-.108,.08,0],[0,0,1],I);return p;},extra);}
fieldAction('field_miss','התאכזבות אחרי החטאה · ידיים לראש',3.8,{leftHand:[[0,[.25,1.04,.15]],[1.1,[.18,1.56,.12]],[2.3,[.18,1.56,.12]],[3.4,[.25,1.04,.15]],[3.8,[.25,1.04,.15]]],rightHand:[[0,[-.25,1.04,.15]],[1.1,[-.18,1.56,.12]],[2.3,[-.18,1.56,.12]],[3.4,[-.25,1.04,.15]],[3.8,[-.25,1.04,.15]]],head:[[0,0],[1.1,20],[2.3,20],[3.4,0],[3.8,0]],chestPitch:[[0,2],[1.1,9],[2.3,9],[3.4,2],[3.8,2]]},{events:[{type:'miss_reaction',time:1.1}]});
fieldAction('field_group_celebrate','חגיגת שער קבוצתית · הצטרפות והרמת ידיים',4.4,{leftHand:[[0,[.25,1.1,.20]],[1,[.40,1.65,.15]],[1.6,[.34,1.72,.1]],[2.1,[.40,1.65,.15]],[2.6,[.34,1.72,.1]],[3.9,[.25,1.1,.20]],[4.4,[.25,1.1,.20]]],rightHand:[[0,[-.25,1.1,.2]],[1,[-.40,1.65,.15]],[1.6,[-.34,1.72,.1]],[2.1,[-.40,1.65,.15]],[2.6,[-.34,1.72,.1]],[3.9,[-.25,1.1,.20]],[4.4,[-.25,1.1,.20]]],head:[[0,0],[1,-12],[2.6,-12],[3.9,0],[4.4,0]]},{category:'team',team:{count:3,offsets:[[0,0,0],[-.9,0,-.25],[.9,0,-.25]],phaseOffsetsSeconds:[0,.1,.2]},events:[{type:'team_join',time:1},{type:'goal_cheer',time:1.6},{type:'goal_cheer',time:2.6}]});

// Entry is real two-step travel with world-fixed stance anchors and arm swing.
{
 const duration=4,steps=[{side:'Left',a:.45,b:1.1,from:0,to:.6},{side:'Right',a:1.35,b:2,from:0,to:1.1},{side:'Left',a:2.2,b:2.9,from:.6,to:1.1}];
 const travel=t=>curve([[0,0],[.35,0],[1.15,.25],[2.05,.72],[3.05,1.1],[duration,1.1]],t);
 const foot=(side,t)=>{let z=0,y=.08;for(const s of steps.filter(s=>s.side===side)){if(t>=s.b){z=s.to;continue;}if(t>s.a){const u=(t-s.a)/(s.b-s.a);z=s.from+(s.to-s.from)*S(u);y+=.12*Math.sin(Math.PI*u)**2;}break;}return [side==='Left'?.108:-.108,y,z-travel(t)];};
 const supports=[];for(const side of ['Left','Right']){let a=0;for(const s of steps.filter(s=>s.side===side)){supports.push(support(side+'Foot',a,s.a));a=s.b;}supports.push(support(side+'Foot',a,duration));}
 make('field_enter','כניסה למגרש · צעדים ומבט קדימה',duration,t=>{const u=S((t-.1)/.4)*(1-S((t-3.15)/.55)),p=poseMix(fieldIdle,pose({...readySpec,hips:[0,.775,0],leftFoot:foot('Left',t),rightFoot:foot('Right',t),leftHand:[.22,1.03,.15+.13*Math.sin(tau*t/1.6)],rightHand:[-.22,1.03,.15-.13*Math.sin(tau*t/1.6)],head:-4}),u);for(const side of ['Left','Right'])solve(p,side+'UpLeg',side+'Leg',side+'Foot',foot(side,t),[0,0,1],I);return p;},{category:'entry',locomotion:true,speedMps:1.1/duration,supports,events:steps.map(s=>({type:'footstrike',bone:s.side+'Foot',time:s.b})),referenceTravel:{samples:Array.from({length:481},(_,i)=>({time:i/120,position:[0,0,travel(i/120)],yawRadians:0}))}});
}
{
 const duration=4,keys={leftHand:[],rightHand:[]};for(const [side,sign]of [['left',1],['right',-1]]){keys[side+'Hand']=[[0,[sign*.24,1.05,.18]],[.7,[sign*.21,1.21,.36]]];for(let i=0;i<3;i++)keys[side+'Hand'].push([1+i*.7,[sign*.035,1.21,.36]],[1.3+i*.7,[sign*.21,1.21,.36]]);keys[side+'Hand'].push([3.5,[sign*.24,1.05,.18]],[duration,[sign*.24,1.05,.18]]);}
 fieldAction('field_clap','מחיאת כפיים · שלוש מחיאות',duration,keys,{category:'applause',events:[1,1.7,2.4].map(time=>({type:'clap',time}))});
}
await fs.writeFile(new URL('motions.json',base),JSON.stringify({schemaVersion:1,version:'soccer-keeper-motion-v3',fps,units:'metres',up:'+Y',forward:'+Z',anatomicalLeft:'+X',rootMotion:false,hipsConvention:'absolute parent-local translation; canonical rest Hips Y=.86',skeleton:bones,clips})+'\n');
console.log(`Authored ${clips.length} original clips / ${clips.reduce((n,c)=>n+c.frames.length,0)} poses.`);
