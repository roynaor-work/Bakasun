// SPDX-License-Identifier: CC0-1.0
// Original soccer headers. All times are seconds; canonical metres, +Z forward.
import fs from 'node:fs/promises';
import {bones,pose,fk,point,solve,curve,euler,rotate,add,mul,slerp,mix,I} from './rig.mjs';
import {unpack,readAccessor} from './glb.mjs';

const base=new URL('../',import.meta.url);
const reference=unpack(await fs.readFile(new URL('runtime/reference/idle_relaxed.glb',base)));
function firstPose(glb){
  const p={hips:[0,.785,0],rotations:Object.fromEntries(bones.map(b=>[b.name,[...I]]))};
  for(const c of glb.document.animations[0].channels){
    const s=glb.document.animations[0].samplers[c.sampler],v=readAccessor(glb,s.output).values;
    const n=glb.document.nodes[c.target.node].name;
    if(c.target.path==='rotation')p.rotations[n]=v.slice(0,4);
    if(n==='Hips'&&c.target.path==='translation')p.hips=v.slice(0,3);
  }
  return p;
}
const idle=firstPose(reference),idleWorld=fk(idle);
const targets={leftFoot:idleWorld.LeftFoot.position,rightFoot:idleWorld.RightFoot.position,leftHand:idleWorld.LeftHand.position,rightHand:idleWorld.RightHand.position};
const sole=[0,-.08,0];
const forehead=JSON.parse(await fs.readFile(new URL('verification/contact-surface.json',base))).localPointMeters;
const at=(keys,t)=>curve(keys,t);
const C=(t,keys)=>at(keys,t);
const blend=(a,b,w)=>({hips:mix(a.hips,b.hips,w),rotations:Object.fromEntries(bones.map(({name})=>[name,slerp(a.rotations[name],b.rotations[name],w)]))});
const foot=(side,y=.08,z=0)=>[side==='left'?.13:-.13,y,(side==='left'?.025:-.025)+z];
const labels={header_stand_goal:'נגיחה בעמידה לשער',header_jump_goal:'נגיחה בקפיצה לשער',header_jump_left:'נגיחה בקפיצה שמאלה',header_jump_right:'נגיחה בקפיצה ימינה',header_clear:'נגיחת הרחקה להגנה',header_dive:'נגיחה בצלילה נמוכה'};

function standing(t,clear=false){
  const load=C(t,[[0,0],[.2,0],[.4,1],[.6,.55],[.8,0],[1.3,0],[1.6,0]]);
  const hit=C(t,[[0,0],[.4,0],[.6666666666666666,1],[.8,.85],[1.2,0],[1.6,0]]);
  const yaw=clear?C(t,[[0,0],[.3,0],[.6666666666666666,1],[.9,1],[1.3,0],[1.6,0]]):0;
  return pose({...targets,hips:[0,.785-.045*load,.035*hit],
    hipPitch:clear?-4*hit:2-5*load+7*hit,
    spinePitch:clear?-5*hit:1-5*load+7*hit,
    chestPitch:clear?-4*hit:.75-6*load+9*hit,
    hipYaw:18*yaw,twist:32*yaw,headYaw:60*yaw,head:clear?-8*hit:10*hit-9*load,
    leftHand:add(targets.leftHand,[.06*hit,.06*load,-.12*load]),
    rightHand:add(targets.rightHand,[-.06*hit,.06*load,-.12*load])});
}

function jumping(t,sign=0){
  const hipsY=C(t,[[0,.785],[.2,.785],[1/3,.69],[.5,.83],[.7333333333333333,1.12],[1,.80],[1.1,.69],[1.4,.785],[1.6,.785]]);
  const up=C(t,[[0,0],[.5,0],[.7,.31],[.8,.31],[1,0],[1.6,0]]);
  const tuck=C(t,[[0,0],[.5,0],[.6666666666666666,1],[.8,1],[1,0],[1.6,0]]);
  const load=C(t,[[0,0],[.2,0],[1/3,1],[.5,0],[1.6,0]]);
  const hit=C(t,[[0,0],[.5,0],[.7333333333333333,1],[.8666666666666667,.7],[1.1,0],[1.6,0]]);
  const hands=C(t,[[0,0],[.3333333333333333,-.3],[.6,1],[.8,.85],[1.1333333333333333,.2],[1.4,0],[1.6,0]]);
  const yaw=sign*C(t,[[0,0],[.5333333333333333,0],[.7333333333333333,1],[.8666666666666667,1],[1.2,0],[1.6,0]]);
  const p=pose({hips:[0,hipsY,.025*hit],hipPitch:2+6*load+8*hit,spinePitch:1-5*load+6*hit,chestPitch:.75-8*load+9*hit,
    hipYaw:8*yaw,twist:12*yaw,headYaw:33*yaw,head:-10*load+8*hit,
    leftFoot:foot('left',.08+up,-.09*tuck),rightFoot:foot('right',.08+up,-.09*tuck),
    leftFootPitch:10*tuck,rightFootPitch:10*tuck,
    leftHand:add(targets.leftHand,[.14*hands,.25*hands,-.10*load]),
    rightHand:add(targets.rightHand,[-.14*hands,.25*hands,-.10*load])});
  return p;
}

function diving(t){
  const keys=(a)=>C(t,a);
  const hy=keys([[0,.785],[.2,.785],[.4,.69],[.5333333333333333,.84],[.7333333333333333,1.02],[.9,.90],[1.2,.38],[1.4,.36],[1.7,.37],[2,.57],[2.4,.68],[2.8,.785],[3.2,.785]]);
  const hz=keys([[0,0],[.4,0],[.7333333333333333,.16],[1.2,.22],[1.7,.20],[2.4,.07],[2.8,0],[3.2,0]]);
  const pitch=keys([[0,2],[.4,10],[.7333333333333333,55],[1.2,78],[1.6,75],[2,50],[2.4,18],[2.8,2],[3.2,2]]);
  const spine=keys([[0,1],[.4,2],[.7333333333333333,6],[1.2,3],[1.6,3],[2.4,2],[2.8,1],[3.2,1]]);
  const chest=keys([[0,.75],[.4,-2],[.7333333333333333,2],[1.2,0],[1.6,0],[2.4,1],[2.8,.75],[3.2,.75]]);
  const head=keys([[0,0],[.4,-8],[.7333333333333333,-35],[1.2,-25],[1.6,-20],[2.4,-8],[2.8,0],[3.2,0]]);
  const fy=keys([[0,.08],[.5333333333333333,.08],[.7333333333333333,.42],[.9,.40],[1.2,.15],[1.4,.08],[3.2,.08]]);
  const fz=keys([[0,0],[.5333333333333333,0],[.7333333333333333,-.23],[1.2,-.40],[1.7,-.40],[2.2,-.12],[2.8,0],[3.2,0]]);
  const handY=keys([[0,targets.leftHand[1]],[.4,.95],[.7333333333333333,1.03],[.9,.7],[1.2,.025],[1.7,.025],[2.2,.5],[2.8,targets.leftHand[1]],[3.2,targets.leftHand[1]]]);
  const handZ=keys([[0,targets.leftHand[2]],[.4,.08],[.7333333333333333,.62],[1.2,.65],[1.7,.65],[2.2,.38],[2.8,targets.leftHand[2]],[3.2,targets.leftHand[2]]]);
  return pose({hips:[0,hy,hz],hipPitch:pitch,spinePitch:spine,chestPitch:chest,head,
    leftFoot:foot('left',fy,fz),rightFoot:foot('right',fy,fz),
    leftHand:[.25,handY,handZ],rightHand:[-.25,handY,handZ],
    leftHandAim:euler(keys([[0,0],[.9,-45],[1.2,-90],[1.7,-90],[2.4,0],[3.2,0]])),
    rightHandAim:euler(keys([[0,0],[.9,-45],[1.2,-90],[1.7,-90],[2.4,0],[3.2,0]]))});
}

function author(id){
  const jump=id.includes('jump'),dive=id==='header_dive',duration=dive?3.2:1.6;
  const contact=jump||dive?22/30:20/30,takeoff=dive?16/30:.5,land=dive?1.2:1;
  const supports=[];
  for(const side of ['Left','Right']){
    const bone=side+'Foot',anchor=point(idle,bone,sole);
    if(!jump&&!dive)supports.push({bone,start:0,end:duration,local:sole,anchor});
    else{
      supports.push({bone,start:0,end:takeoff,local:sole,anchor});
      if(jump)supports.push({bone,start:land,end:duration,local:sole,anchor});
      // Dive hand landing is followed by a toe-supported recovery. The feet
      // explicitly release before stepping back under the pelvis.
      else supports.push({bone,start:1.4,end:1.7,local:sole,anchor:[side==='Left'?.13:-.13,0,(side==='Left'?.025:-.025)-.40]},
        {bone,start:2.8,end:duration,local:sole,anchor});
    }
  }
  if(dive)for(const side of ['Left','Right'])supports.push({bone:side+'Hand',start:1.2,end:1.7,local:[0,-.07,-.025],anchor:[side==='Left'?.25:-.25,0,.72],surface:'palm'});
  const frames=[];
  for(let frame=0;frame<=Math.round(duration*30);frame++){
    const time=frame/30;
    let p=dive?diving(time):jump?jumping(time,id.endsWith('left')?1:id.endsWith('right')?-1:0):standing(time,id==='header_clear');
    // Match the actual v10 idle pose at both boundaries, including arm roll.
    // Smoothstep has zero endpoint slope. IK after this envelope preserves
    // the complete support window rather than just its native keyframes.
    const envelope=Math.min(1,C(time,[[0,0],[.2,1],[duration-.2,1],[duration,0]]));
    p=blend(idle,p,envelope);
    for(const w of supports)if(w.bone.endsWith('Foot')&&time>=w.start-1e-8&&time<=w.end+1e-8){
      const side=w.bone.startsWith('Left')?'Left':'Right';
      solve(p,side+'UpLeg',side+'Leg',side+'Foot',add(w.anchor,[0,.08,0]),[0,0,1],I);
    }
    frames.push({time,hips:p.hips,rotations:p.rotations});
  }
  const p=frames[Math.round(contact*30)],world=fk(p),contactPoint=point(p,'Head',forehead);
  const direction=rotate(world.Head.rotation,[0,0,1]),center=add(contactPoint,mul(direction,.11));
  const incoming=[-.2,-.32,-2.8],outgoing=id==='header_clear'?[2.8,1.8,-1.1]:id==='header_jump_left'?[4,.4,2.8]:id==='header_jump_right'?[-4,.4,2.8]:dive?[0,-.15,5]:[0,-.3,5.5];
  const ball={radius:.11,trajectory:'independent piecewise ballistic path calibrated once at the forehead event; never constrained to the head during playback',samples:frames.map(({time})=>{
    const dt=time-contact,v=dt<=0?incoming:outgoing;
    return {time,position:center.map((x,i)=>x+v[i]*dt+(i===1&&dt>0?-1.3*dt*dt:0))};
  })};
  const events=[];
  if(jump||dive)events.push({type:'takeoff',event:'takeoff',frame:Math.round(takeoff*30),time:takeoff,bones:['LeftFoot','RightFoot']});
  events.push({type:'contact',event:'contact',frame:Math.round(contact*30),time:contact,bone:'Head',local:forehead,position:contactPoint});
  if(jump||dive)events.push({type:'land',event:'land',frame:Math.round(land*30),time:land,bones:dive?['LeftHand','RightHand']:['LeftFoot','RightFoot'],surface:dive?'palms':'soles'});
  const coreRange={start:dive?.4:1/3,end:dive?1.2:17/15,duration:dive?.8:.8};
  return {id,label:labels[id],category:'header',role:'field',duration,durationSeconds:duration,frameCount:frames.length,nativeRate:30,loop:false,rootMotion:false,
    events,event:events.find(e=>e.type==='contact'),contactFrame:Math.round(contact*30),supports,ball,coreRange,
    timing:{nativeRate:30,contactFrame:Math.round(contact*30),durationSeconds:duration},
    entry:{reference:'idle_relaxed',phase:0,blendSeconds:.2,alternatives:[{reference:'run',phase:0,blendSeconds:.3}],sourcePose:'current-displayed',sourceContinuation:'velocity-extrapolation',curve:'cubic-hermite-C1',footLock:'carry-until-release'},
    exit:{reference:'idle_relaxed',phase:0,blendSeconds:.2,alternatives:[{reference:'run',phase:0,blendSeconds:.3}],curve:'cubic-hermite-C1',footLock:'carry-until-release'},
    contactGeometry:{foreheadLocalMeters:forehead,ballCenterMeters:center,foreheadHeightMeters:contactPoint[1],ballHeightMeters:center[1],shoulderHeightMeters:Math.max(world.LeftArm.position[1],world.RightArm.position[1])},
    notes:dive?'Low forward dive: contact before horizontal extension, two-palm landing, toe support, deliberate recovery. Horizontal Hips offset returns to zero; Root remains fixed.':id==='header_clear'?'Look beyond the left shoulder and head the ball up and backwards/sideways; feet remain planted.':'Original full-body header with preparation, torso/head action, recovery and exact idle boundary poses.',
    license:'CC0-1.0',frames};
}

const clips=Object.keys(labels).map(author);
for(const c of clips){
  const g=c.contactGeometry;
  if(g.ballHeightMeters<1.2||g.ballHeightMeters>2||g.ballHeightMeters<g.shoulderHeightMeters)throw new Error(`${c.id}: contact height outside specification ${JSON.stringify(g)}`);
}
const data={version:'soccer-header-v1',license:'CC0-1.0',skeleton:bones,nativeRate:30,rootMotion:false,axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},clips};
await fs.writeFile(new URL('runtime/motions.json',base),JSON.stringify(data)+'\n');
console.log(clips.map(c=>({id:c.id,frames:c.frames.length,contact:c.contactGeometry.ballHeightMeters,shoulders:c.contactGeometry.shoulderHeightMeters})));
