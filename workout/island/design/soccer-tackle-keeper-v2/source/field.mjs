// SPDX-License-Identifier: CC0-1.0
// Original phase-authored tackle and light reactions. Not motion capture.
import {readFile} from 'node:fs/promises';
import {bones,I,euler,qm,slerp,fk,rotate,add,solve} from './rig.mjs';

const reference=JSON.parse(await readFile(new URL('../../soccer-header-v1/runtime/motions.json',import.meta.url)));
export const neutral=structuredClone(reference.clips[0].frames[0]);
delete neutral.time;
const ease=t=>(t=Math.max(0,Math.min(1,t)),t*t*t*(10+t*(-15+6*t)));
const mix=(a,b,t)=>({hips:a.hips.map((v,i)=>v+(b.hips[i]-v)*t),rotations:Object.fromEntries(bones.map(bone=>[bone.name,slerp(a.rotations[bone.name],b.rotations[bone.name],t)]))});
export function bake(keys,duration){
  return Array.from({length:Math.round(duration*30)+1},(_,i)=>{
    const time=i/30;let k=1;while(k<keys.length-1&&time>keys[k][0])k++;
    const [ta,a]=keys[k-1],[tb,b]=keys[k],u=Math.max(0,Math.min(1,(time-ta)/(tb-ta)));
    return {time,...mix(a,b,duration<=.4?u*u*(3-2*u):ease(u))};
  });
}
function authored({height=.3,roll=0,pitch=0,spine=0,chest=0,head=0,legs=[[-65,65,0],[-20,100,0]],arms=[[-20,-60,40],[-20,-60,-40]],hipsX=0,hipsZ=0}){
  const p={hips:[hipsX,height,hipsZ],rotations:Object.fromEntries(bones.map(b=>[b.name,[...I]]))};
  p.rotations.Hips=euler(pitch,0,roll);p.rotations.Spine=euler(spine);p.rotations.Chest=euler(chest);p.rotations.Head=euler(head);
  for(const [i,s] of ['Left','Right'].entries()){
    const [thigh,knee,abduction]=legs[i];p.rotations[s+'UpLeg']=euler(thigh,0,abduction);p.rotations[s+'Leg']=euler(knee);p.rotations[s+'Foot']=euler(-Math.min(40,knee*.45));
    const [shoulder,elbow,spread]=arms[i];p.rotations[s+'Arm']=euler(shoulder,0,spread);p.rotations[s+'ForeArm']=euler(elbow);p.rotations[s+'Hand']=euler(10);
  }
  return clearance(p);
}
// Clearance is authored before serialization. No per-frame runtime floor lift.
// These are anatomical surface proxies; a separate skinned-vertex audit follows.
export function clearance(p){
  const w=fk(p),points=[];
  for(const b of bones){if(b.name==='Root')continue;const radius=b.name==='Head'?.135:/Hand/.test(b.name)?.055:/Foot/.test(b.name)?.045:/Hips|Spine|Chest/.test(b.name)?.105:.045;points.push(w[b.name].position[1]-radius);}
  for(const s of ['Left','Right'])for(const local of [[0,-.08,0],[0,-.06,.14]])points.push(add(w[s+'Foot'].position,rotate(w[s+'Foot'].rotation,local))[1]);
  const min=Math.min(...points);if(min<.002)p.hips[1]+=.002-min;
  return p;
}
const load=authored({height:.62,pitch:12,spine:4,legs:[[-48,85,3],[-36,70,-3]],arms:[[-28,-65,24],[-34,-60,-24]]});
// The lead leg points forwards; the other folds underneath, not backwards at the knee.
const slide=authored({height:.20,roll:-28,pitch:12,spine:8,head:-8,legs:[[-105,16,5],[-94,125,-9]],arms:[[-12,-38,12],[-30,-75,-32]]});
const slideSettle=authored({height:.20,roll:-38,pitch:14,spine:4,head:-6,legs:[[-108,20,5],[-94,125,-8]],arms:[[-10,-32,12],[-34,-82,-28]]});
// A compact side fall: hips and shoulder share load; the head never takes the landing.
const softSide=authored({height:.17,roll:-88,pitch:2,spine:7,head:-8,legs:[[-34,64,-8],[-54,92,-2]],arms:[[-50,-80,-5],[-38,-72,-22]]});
const braced=authored({height:.30,roll:-15,pitch:48,spine:10,head:-12,legs:[[-68,105,3],[-25,83,-5]],arms:[[-26,-68,18],[-42,-82,-20]]});
const crouch=authored({height:.56,pitch:12,spine:7,legs:[[-58,105,3],[-42,84,-3]],arms:[[-35,-75,22],[-40,-70,-22]]});
const foulTilt=authored({height:.64,roll:-25,pitch:-9,spine:3,head:4,legs:[[-47,80,7],[-22,65,-6]],arms:[[-12,-48,60],[-20,-58,-56]]});
const foulBrace=authored({height:.34,roll:-54,pitch:4,spine:12,head:-6,legs:[[-50,85,3],[-65,105,-3]],arms:[[-35,-64,35],[-30,-75,-32]]});
const swayA=structuredClone(neutral),swayB=structuredClone(neutral);
for(const [p,sign]of [[swayA,1],[swayB,-1]]){
  p.hips[0]=sign*.035;p.hips[1]-=.025;
  p.rotations.Hips=qm(euler(0,0,-sign*7),p.rotations.Hips);
  p.rotations.Chest=qm(euler(3,0,sign*5),p.rotations.Chest);
  p.rotations.LeftArm=euler(-14,0,46-sign*4);p.rotations.RightArm=euler(-14,0,-46-sign*4);
  p.rotations.LeftForeArm=euler(-38);p.rotations.RightForeArm=euler(-38);
}
const event=(type,time,bone)=>({type,time,...(bone?{bone}:{}),presentationOnly:true});
const feet=frames=>['Left','Right'].map(side=>({bone:side+'Foot',start:0,end:1/30,local:[0,-.08,0],anchor:add(fk(frames[0])[side+'Foot'].position,rotate(fk(frames[0])[side+'Foot'].rotation,[0,-.08,0]))}));
export async function fieldClips(){
  const definitions=[
    {id:'slide_tackle',label:'גליץ מלא',duration:1,next:'getup_fast',keys:[[0,neutral],[.20,load],[.50,slide],[.80,slideSettle],[1,slideSettle]],events:[event('support_release',.20),event('contact',.50,'LeftFoot'),event('side_land',.80),event('ready_for_getup',1)],notes:'Left leg leads with an open sole, right knee folds, trailing hand controls the side landing. Visual motion only; the game supplies travel.'},
    {id:'getup_fast',label:'קימה מהירה מהגליץ',duration:.6,preceding:'slide_tackle',keys:[[0,slideSettle],[.28,braced],[.6,neutral]],events:[event('hand_push',.20,'LeftHand'),event('feet_under_body',.28),event('recovered',.6)],notes:'Six-tenths of a second: supported roll to a compact crouch and standing. No lying delay is baked in.'},
    {id:'stumble_light',label:'מעידה קלה והמשך',duration:.5,keys:[[0,neutral],[.17,swayA],[.33,swayB],[.5,neutral]],events:[event('balance_lost',.10),event('balance_recovered',.4),event('continue',.5)],notes:'Small pelvis sway, open arms and a restrained counter-sway; stays on feet. The continuing run phase uses the C1 transition bridge.'},
    {id:'fall_soft',label:'נפילה קלה על הצד',duration:.3,next:'getup_soft',keys:[[0,neutral],[.3,softSide]],events:[event('balance_lost',0),event('side_land',.3)],notes:'Light side collapse, protected head and compact limbs; pair directly with getup_soft, total active motion .7 seconds.'},
    {id:'getup_soft',label:'קימה מנפילה קלה',duration:.4,preceding:'fall_soft',keys:[[0,softSide],[.4,neutral]],events:[event('hand_push',.10,'LeftHand'),event('recovered',.4)],notes:'Side-to-crouch-to-stand, no pause. fall_soft + getup_soft = .7 seconds.'},
    {id:'fall_foul',label:'נפילה בפאול',duration:1.2,next:'getup_foul',keys:[[0,neutral],[.30,foulTilt],[.65,foulBrace],[.95,softSide],[1.2,softSide]],events:[event('foul_reaction',0),event('side_land',.95),event('ready_for_getup',1.2)],notes:'More visible loss of balance and a controlled side landing; restrained head and arms, no flailing.'},
    {id:'getup_foul',label:'קימה אחרי פאול',duration:.8,preceding:'fall_foul',keys:[[0,softSide],[.28,braced],[.55,crouch],[.8,neutral]],events:[event('hand_push',.15,'LeftHand'),event('recovered',.8)],notes:'Optional supported recovery from fall_foul, supplied so the contextual seam is reproducible.'},
  ];
  return definitions.map(({keys,...d})=>{
    const frames=bake(keys,d.duration).map(f=>({...clearance(f),time:f.time}));
    if(d.id==='slide_tackle')for(const f of frames.filter(f=>f.time<=.2+1e-9))for(const side of ['Left','Right']){
      solve(f,side+'UpLeg',side+'Leg',side+'Foot',fk(neutral)[side+'Foot'].position,[0,0,1],I);
    }
    if(d.id==='stumble_light')for(const f of frames)for(const side of ['Left','Right']){
      const target=fk(neutral)[side+'Foot'].position;
      solve(f,side+'UpLeg',side+'Leg',side+'Foot',target,[0,0,1],I);
    }
    const plant=d.duration*(d.id==='getup_soft'?.80:.55);
    if(d.id.startsWith('getup'))for(const f of frames){
      // Acquire the final sole positions before transferring the weight up.
      // The planted part of the rise is solved from the pelvis at every sample.
      const weight=ease((f.time-.05)/(plant-.05));
      for(const side of ['Left','Right']){
        const solved=structuredClone(f),target=fk(neutral)[side+'Foot'].position;
        solve(solved,side+'UpLeg',side+'Leg',side+'Foot',target,[0,0,1],I);
        for(const bone of [side+'UpLeg',side+'Leg',side+'Foot'])f.rotations[bone]=slerp(f.rotations[bone],solved.rotations[bone],weight);
      }
      // The lower hand catches the body, then releases as both soles take load.
      const handWeight=ease(f.time/Math.min(.22,d.duration*.5))*(1-ease((f.time-plant)/(d.duration-plant)));
      if(handWeight>0){
        const start=fk(frames[0]).LeftHand.position,target=[start[0],.065,start[2]];
        const solved=structuredClone(f);solve(solved,'LeftArm','LeftForeArm','LeftHand',target,[0,0,-1],I);
        for(const bone of ['LeftArm','LeftForeArm','LeftHand'])f.rotations[bone]=slerp(f.rotations[bone],solved.rotations[bone],handWeight);
      }
    }
    const supports=d.id.startsWith('getup')?[]:feet(frames);if(d.id==='stumble_light')for(const s of supports)s.end=.5;
    if(d.id==='slide_tackle')for(const s of supports)s.end=.2;
    if(d.id.startsWith('getup'))for(const side of ['Left','Right'])supports.push({bone:side+'Foot',start:Math.ceil(plant*30)/30,end:d.duration,local:[0,-.08,0],anchor:add(fk(neutral)[side+'Foot'].position,[0,-.08,0])});
    return {...d,role:'field',fps:30,loop:false,rootMotion:false,frames,supports};
  });
}
