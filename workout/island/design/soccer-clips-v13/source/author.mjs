// SPDX-License-Identifier: CC0-1.0
// Original canonical-18 soccer performances. Metres, seconds, +Y up, +Z forward.
import fs from 'node:fs/promises';
import {bones, pose, fk, point, solve, curve, euler, rotate, add, sub, mul, mix, slerp, qi, I} from './rig.mjs';
import {unpack, readAccessor} from './glb.mjs';

const base = new URL('../', import.meta.url);
const reference = unpack(await fs.readFile(new URL('runtime/reference/idle_relaxed.glb', base)));
const idle = {hips: [0,.785,0], rotations: Object.fromEntries(bones.map(b=>[b.name,[...I]]))};
for (const c of reference.document.animations[0].channels) {
  const s=reference.document.animations[0].samplers[c.sampler], v=readAccessor(reference,s.output).values;
  const name=reference.document.nodes[c.target.node].name;
  if(c.target.path==='rotation') idle.rotations[name]=v.slice(0,4);
  if(c.target.path==='translation' && name==='Hips') idle.hips=v.slice(0,3);
}
const world=fk(idle);
const targets=Object.fromEntries(['LeftFoot','RightFoot','LeftHand','RightHand'].map(name=>[name[0].toLowerCase()+name.slice(1),world[name].position]));
const sole=[0,-.08,0], radius=.11;
const C=(t,keys)=>curve(keys,t);
const blend=(a,b,u)=>({hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(({name})=>[name,slerp(a.rotations[name],b.rotations[name],u)]))});
const event=(type,time,bone,local=[0,0,0],extra={})=>({type,event:type,time,frame:Math.round(time*30),...(bone?{bone,local}:{}),...extra});
const specs=[
  {id:'keeper_celebrate',label:'חגיגת שוער אחרי עצירה',duration:1.8,role:'keeper',core:[.2,1.5],events:[event('celebrate',.8)],notes:'Grounded save celebration: two clenched fist pumps, proud chest and a small knee dip; settles back to ready.'},
  {id:'goal_kick',label:'בעיטת שוער מהקרקע',duration:1.6,role:'keeper',core:[.1,1.3],events:[event('place',.3),event('approach',.5),event('contact',1,'RightFoot',[0,.015,.125])],notes:'Place ball on turf, straighten, take a short in-place approach step, plant left sole, swing right instep through grounded ball, recover. No punt.'},
  {id:'keeper_throw',label:'זריקת שוער ביד',duration:1.2,role:'keeper',core:[.1,1],events:[event('release',.7,'RightHand',[0,-.065,.015])],notes:'Right-hand overarm distribution: cradle, cock behind shoulder, weight transfer, release above shoulder and follow through.'},
  {id:'slide_tackle',label:'תיקול בגלישה וקימה',duration:1,role:'field',core:[.1,.9],events:[event('contact',.4,'RightFoot',[0,-.025,.125]),event('recover',.6),event('stand',.9)],notes:'One-second compact slide and rise. Low pelvis, right leg extends, left knee folds, left palm braces. Root is fixed; simulation supplies world travel.'},
  {id:'lob_pass',label:'מסירה גבוהה',duration:1.2,role:'field',core:[.1,1],events:[event('contact',.6,'RightFoot',[0,.025,.125])],notes:'Left sole plants; right forefoot approaches below the ball centre and scoops upward, followed by a restrained high follow-through.'},
  {id:'chest_control',label:'עצירת כדור בחזה',duration:1.2,role:'field',core:[.1,1],events:[event('receive',.6,'Chest',[0,.055,.095])],notes:'Open chest and spread arms, receive on the upper sternum, soften knees and withdraw chest so the ball drops in front.'},
  {id:'volley',label:'בעיטת יעף',duration:1.2,role:'field',core:[.1,1],events:[event('contact',.6,'RightFoot',[0,-.025,.125])],notes:'Left leg bears weight while the right leg sweeps into a waist-high airborne ball. Torso counter-rotates; kicking foot remains airborne at impact.'},
  {id:'throw_in',label:'זריקת חוץ בשתי ידיים',duration:1.4,role:'field',core:[.1,1.2],events:[event('release',.8,'LeftHand',[0,-.065,.015],{bones:['LeftHand','RightHand']})],notes:'Both feet stay planted; both hands take the ball behind and above the head, then travel forward together and release overhead.'},
];

function celebrate(t){
  const pump=C(t,[[0,0],[.2,.35],[.5,1],[.72,.6],[.95,1],[1.2,.6],[1.5,0],[1.8,0]]);
  const lift=C(t,[[0,0],[.2,0],[.5,1],[.75,.8],[1,1],[1.35,.2],[1.6,0],[1.8,0]]);
  return pose({...targets,hips:[0,.785-.035*pump,0],hipPitch:-3*lift,chestPitch:-7*lift,head:-5*lift,
    leftHand:add(targets.leftHand,[.035*lift,.47*pump,-.025*lift]),rightHand:add(targets.rightHand,[-.035*lift,.47*pump,-.025*lift])});
}
function goalKick(t){
  const crouch=C(t,[[0,0],[.3,1],[.57,0],[1.6,0]]);
  const power=C(t,[[0,0],[.67,0],[.85,-.7],[1,1],[1.17,1.2],[1.4,0],[1.6,0]]);
  const foot=C(t,[[0,targets.rightFoot],[.57,targets.rightFoot],[.73,[-.13,.12,-.23]],[.87,[-.13,.16,-.26]],[1,[-.13,.08,.27]],[1.13,[-.13,.40,.46]],[1.37,targets.rightFoot],[1.6,targets.rightFoot]]);
  const left=C(t,[[0,targets.leftFoot],[.5,targets.leftFoot],[.6,[.13,.13,.04]],[.7,[.13,.08,.065]],[1.27,[.13,.08,.065]],[1.4,targets.leftFoot],[1.6,targets.leftFoot]]);
  const hand=C(t,[[0,targets.leftHand],[.3,[-.02,.22,.39]],[.6,targets.leftHand],[1,[.39,1,.01]],[1.4,targets.leftHand],[1.6,targets.leftHand]]);
  const rightHand=C(t,[[0,targets.rightHand],[.3,[-.24,.22,.39]],[.6,targets.rightHand],[1,[-.39,1,.01]],[1.4,targets.rightHand],[1.6,targets.rightHand]]);
  return pose({...targets,hips:[0,.785-.285*crouch,.025*power],hipPitch:53*crouch+8*power,spinePitch:14*crouch,chestPitch:10*crouch,head:-10*crouch,
    leftFoot:left,rightFoot:foot,rightFootPitch:C(t,[[0,0],[.87,15],[1,-7],[1.13,-16],[1.4,0],[1.6,0]]),
    leftHand:hand,rightHand,leftElbow:[.5,-.2,.5],rightElbow:[-.5,-.2,.5]});
}
function keeperThrow(t){
  const action=C(t,[[0,0],[.17,0],[.47,-1],[.7,1],[.87,1],[1.1,0],[1.2,0]]);
  return pose({...targets,hips:[0,.785-.025*Math.abs(action),.025*action],hipYaw:7*action,twist:15*action,hipPitch:4*action,chestPitch:8*action,
    rightHand:C(t,[[0,targets.rightHand],[.17,[-.17,1,.2]],[.42,[-.28,1.48,-.22]],[.54,[-.27,1.62,-.08]],[.7,[-.22,1.55,.36]],[.9,[-.2,1.05,.41]],[1.1,targets.rightHand],[1.2,targets.rightHand]]),
    leftHand:C(t,[[0,targets.leftHand],[.17,[.12,1,.2]],[.45,[.32,1.15,.27]],[.7,[.3,1,.2]],[1.1,targets.leftHand],[1.2,targets.leftHand]]),
    rightElbow:[-.7,-.15,-.5]});
}
function slidePole(t){const k=C(t,[[0,0],[.1,0],[.3,1],[.6,1],[.9,0],[1,0]]);return [k,k,1-.8*k];}
function slide(t){
  const low=C(t,[[0,0],[.1,.08],[.3,1],[.5,1],[.6,.9],[.9,0],[1,0]]);
  const extend=C(t,[[0,0],[.1,0],[.33,1],[.5,1],[.7,.35],[.9,0],[1,0]]);
  const hy=.785-.535*low;
  return pose({...targets,hips:[.015*low,hy,-.015*low],hipPitch:-24*low,chestPitch:9*low,spinePitch:7*low,head:12*low,
    rightFoot:[-.13,.08+.04*extend,-.025+.64*extend],leftFoot:[.13,.08,.025-.25*low],
    leftKnee:slidePole(t),rightKnee:[0,0,1],rightFootPitch:-9*extend,
    leftHand:C(t,[[0,targets.leftHand],[.33,[.33,.14,.02]],[.53,[.33,.14,.02]],[.73,[.3,.53,.19]],[.9,targets.leftHand],[1,targets.leftHand]]),
    rightHand:add(targets.rightHand,[-.14*low,.01*low,.18*low])});
}
function kick(t,type){
  const volley=type==='volley';
  const a=C(t,[[0,0],[.17,0],[.37,-.65],[.6,1],[.77,1.1],[1.03,0],[1.2,0]]);
  const rf=C(t,[[0,targets.rightFoot],[.17,targets.rightFoot],[.37,[-.14,.20,-.25]],[.6,volley?[-.14,.68,.48]:[-.13,.08,.25]],[.77,volley?[-.13,.60,.48]:[-.13,.42,.47]],[1.03,targets.rightFoot],[1.2,targets.rightFoot]]);
  return pose({...targets,hips:[.015*a,.785-.025*Math.abs(a),0],hipYaw:-6*a,twist:-13*a,hipPitch:volley?-10*a:3*a,chestPitch:volley?-9*a:2*a,
    rightFoot:rf,rightFootPitch:C(t,[[0,0],[.37,16],[.6,volley?18:-22],[.77,-15],[1.03,0],[1.2,0]]),
    leftHand:add(targets.leftHand,[.13*Math.abs(a),.17*Math.abs(a),-.12*a]),rightHand:add(targets.rightHand,[-.12*Math.abs(a),.13*Math.abs(a),.16*a])});
}
function chest(t){
  const open=C(t,[[0,0],[.17,0],[.43,1],[.6,.8],[.8,-.45],[1.03,0],[1.2,0]]);
  const absorb=C(t,[[0,0],[.5,0],[.77,1],[1.03,0],[1.2,0]]);
  return pose({...targets,hips:[0,.785-.055*absorb,-.03*absorb],hipPitch:-3*open,spinePitch:-6*open,chestPitch:-9*open,head:8*open,
    leftHand:add(targets.leftHand,[.17*Math.max(0,open),.24*Math.abs(open),-.055*open]),rightHand:add(targets.rightHand,[-.17*Math.max(0,open),.24*Math.abs(open),-.055*open])});
}
function throwIn(t){
  const cock=C(t,[[0,0],[.2,0],[.53,1],[.8,-.25],[1.17,0],[1.4,0]]);
  const hand=C(t,[[0,[.175,.86,.2]],[.2,[.175,1.17,.22]],[.47,[.175,1.69,-.18]],[.6,[.175,1.72,-.17]],[.8,[.175,1.65,.34]],[1,[.24,1.11,.39]],[1.2,targets.leftHand],[1.4,targets.leftHand]]);
  return pose({...targets,hips:[0,.785-.02*Math.abs(cock),-.02*cock],hipPitch:-5*cock,spinePitch:-7*cock,chestPitch:-8*cock,head:6*cock,
    leftHand:hand,rightHand:hand.map((v,i)=>i===0?-v:v),leftElbow:[.8,0,.2],rightElbow:[-.8,0,.2],
    leftHandAim:euler(0,0,-90),rightHandAim:euler(0,0,90)});
}
const motionFor={keeper_celebrate:celebrate,goal_kick:goalKick,keeper_throw:keeperThrow,slide_tackle:slide,lob_pass:t=>kick(t,'lob'),chest_control:chest,volley:t=>kick(t,'volley'),throw_in:throwIn};
function flight(center,velocity,dt){
  let y=center[1],v=velocity[1],remaining=dt;
  for(let bounce=0;bounce<6;bounce++){
    const impact=(v+Math.sqrt(v*v+19.62*Math.max(0,y-radius)))/9.81;
    if(remaining<=impact+1e-9){y+=v*remaining-4.905*remaining*remaining;break;}
    remaining-=impact;v=(9.81*impact-v)*.38;y=radius;
    if(v<.06){y=radius;break;}
  }
  return [center[0]+velocity[0]*dt,Math.max(radius,y),center[2]+velocity[2]*dt];
}
function supportsFor(s){
  const windows=[];
  for(const side of ['Left','Right']){
    const bone=side+'Foot',anchor=point(idle,bone,sole);
    let ranges=[[0,s.duration]];
    if(s.id==='goal_kick') ranges=side==='Left'?[[0,.5],[.7,1.27],[1.4,1.6]]:[[0,.57],[1.37,1.6]];
    if(['lob_pass','volley'].includes(s.id)&&side==='Right') ranges=[[0,.17],[1.03,1.2]];
    if(s.id==='slide_tackle') ranges=side==='Left'?[[0,.1],[.33,.53],[.9,1]]:[[0,.1],[.9,1]];
    for(const [start,end] of ranges){
      let a=anchor;
      if(s.id==='goal_kick'&&side==='Left'&&start===.7)a=[.13,0,.065];
      if(s.id==='slide_tackle'&&side==='Left'&&start===.33)a=[.13,0,-.225];
      windows.push({bone,start,end,local:sole,anchor:a});
    }
  }
  return windows;
}
function author(s){
  const supports=supportsFor(s),frames=[];
  for(let i=0;i<=Math.round(s.duration*30);i++){
    const time=i/30;
    let p=motionFor[s.id](time);
    // Boundary pose/velocity handles. Exact idle poses are retained for the
    // first and last native interval. IK locks every declared sole window.
    const envelope=C(time,[[0,0],[1/30,0],[.17,1],[s.duration-.17,1],[s.duration-1/30,0],[s.duration,0]]);
    p=blend(idle,p,envelope);
    for(const w of supports)if(time>=w.start-1e-8&&time<=w.end+1e-8){
      const side=w.bone.startsWith('Left')?'Left':'Right';
      solve(p,side+'UpLeg',side+'Leg',side+'Foot',add(w.anchor,[0,.08,0]),s.id==='slide_tackle'&&side==='Left'?slidePole(time):[0,0,1],I);
    }
    frames.push({time,hips:p.hips,rotations:p.rotations});
  }
  // Filter the actual arm rotations (not QA markers). This removes shoulder
  // pole acceleration while leaving timed foot strikes and locked soles intact.
  for(let pass=0;pass<2;pass++){
    const previous=structuredClone(frames);
    for(let i=2;i<frames.length-2;i++)for(const {name} of bones.filter(b=>/Arm|Hand/.test(b.name))){
      frames[i].rotations[name]=slerp(slerp(previous[i-1].rotations[name],previous[i+1].rotations[name],.5),previous[i].rotations[name],.5);
    }
  }
  const sample=t=>{
    const a=frames[Math.min(frames.length-1,Math.floor(t*30))],b=frames[Math.min(frames.length-1,Math.ceil(t*30))];
    return blend(a,b,b.time>a.time?(t-a.time)/(b.time-a.time):0);
  };
  const hit=s.events.find(e=>['contact','release','receive'].includes(e.type));
  let ball=null,ballContactWindows=[];
  if(hit){
    const hp=sample(hit.time),cp=point(hp,hit.bone,hit.local);
    let normal=[0,0,1];
    if(s.id==='lob_pass')normal=[0,.8,.6];
    if(s.id==='throw_in')normal=[-1,0,0];
    const center=add(cp,mul(normal,radius));
    hit.position=cp;
    const incoming=s.id==='chest_control'?[0,-.35,-2.4]:s.id==='volley'?[0,-.65,-2.5]:[0,0,0];
    const outgoing=s.id==='goal_kick'?[0,6.2,12]:s.id==='lob_pass'?[0,4.3,4]:s.id==='keeper_throw'?[0,3.2,8]:s.id==='throw_in'?[0,2.8,5]:s.id==='chest_control'?[0,-.5,.5]:s.id==='slide_tackle'?[.4,.3,3]:[0,2.2,10];
    ball={radius,attachment: s.id.includes('throw')?'Hand-held before release; independent ballistic flight afterwards.':'Independent demonstration path, calibrated once to event geometry.',samples:frames.map(f=>{
      const dt=f.time-hit.time;
      let position=dt>0?flight(center,outgoing,dt):center.map((v,i)=>v+incoming[i]*dt);
      if(s.id==='goal_kick'&&dt<=0)position=[...center];
      if(s.id==='goal_kick'&&f.time<=.3){
        const placing=sample(.3),grip=rotate(qi(fk(placing).RightHand.rotation),sub(center,point(placing,'RightHand',[0,0,0])));
        position=point(sample(f.time),'RightHand',grip);
      }
      if(s.id==='keeper_throw'&&dt<=0){const p=sample(f.time);position=add(point(p,hit.bone,hit.local),mul(normal,radius));}
      if(s.id==='throw_in'&&dt<=0){const p=sample(f.time);position=add(point(p,hit.bone,hit.local),mul(normal,radius));}
      return {time:f.time,position};
    })};
    if(s.id==='throw_in'){
      const local=[0,-.065,.015],p=point(hp,'RightHand',local);
      ballContactWindows.push({bone:'RightHand',start:hit.time,end:hit.time,local});
      hit.secondHandPosition=p;
    }
    if(s.id==='slide_tackle'){
      // The extended instep remains in the ball's lane during the challenge.
      // This interval is evaluated between baked frames, not just at the cue.
      ballContactWindows.push({bone:'RightFoot',start:11/30,end:14/30,local:hit.local});
      for(const f of ball.samples)if(f.time>=11/30-1e-8&&f.time<=14/30+1e-8){
        // A short, stationary ball scenario while the tackle foot is extended.
        f.position=[...center];
      }
      for(const f of ball.samples)if(f.time>14/30)f.position=flight(center,outgoing,f.time-14/30);
    }
  }
  return {...s,durationSeconds:s.duration,nativeRate:30,frameCount:frames.length,loop:false,rootMotion:false,license:'CC0-1.0',category:s.id,
    coreRange:{start:s.core[0],end:s.core[1],duration:s.core[1]-s.core[0]},supports,ball,ballContactWindows,
    entry:{reference:'idle_relaxed',phase:0,blendSeconds:.2,alternatives:[{reference:'run',phase:0,blendSeconds:.3}],curve:'cubic-hermite-C1'},
    exit:{reference:'idle_relaxed',phase:0,blendSeconds:.2,alternatives:[{reference:'run',phase:0,blendSeconds:.3}],curve:'cubic-hermite-C1'},frames};
}
const clips=specs.map(author);
const data={version:'soccer-clips-v13',license:'CC0-1.0',nativeRate:30,rootMotion:false,skeleton:bones,axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},clips};
await fs.writeFile(new URL('runtime/motions.json',base),JSON.stringify(data)+'\n');
console.log(clips.map(c=>({id:c.id,duration:c.duration,frames:c.frameCount,events:c.events.map(e=>[e.type,e.time])})));
