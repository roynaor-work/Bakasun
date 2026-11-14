// SPDX-License-Identifier: CC0-1.0
// Original compact, anatomically hinged keeper saves. Root is never animated.
// Airborne travel belongs to the game; only local pelvis height/pose is authored.
import {readFile} from 'node:fs/promises';
import {bones,I,euler,qm,qi,slerp,rotate,add,fk,point,solve} from './rig.mjs';

const copy = value => structuredClone(value);
const ease = value => { const u=Math.max(0,Math.min(1,value)); return u*u*u*(10+u*(-15+6*u)); };
const mix = (a,b,u) => a.map((v,i)=>v+(b[i]-v)*u);
const identityPose = hips => ({hips:[...hips],rotations:Object.fromEntries(bones.map(b=>[b.name,[...I]]))});
const margins={Hips:.115,Spine:.105,Chest:.12,Neck:.065,Head:.135,
  LeftArm:.065,RightArm:.065,LeftForeArm:.055,RightForeArm:.055,
  LeftHand:.055,RightHand:.055,LeftUpLeg:.075,RightUpLeg:.075,
  LeftLeg:.055,RightLeg:.055,LeftFoot:.065,RightFoot:.065};

/** A small conservative body envelope protects the head, shoulder and elbows.
 * The correction is baked into Hips, never applied discontinuously at runtime.
 * Each sampled pose is still checked against the exported mesh by the package.
 */
function clearFloor(p){
  const world=fk(p);let minimum=Infinity;
  for(const [name,radius] of Object.entries(margins))minimum=Math.min(minimum,world[name].position[1]-radius);
  for(const side of ['Left','Right'])minimum=Math.min(minimum,point(p,side+'Foot',[0,-.08,.10])[1]);
  if(minimum<.004)p.hips[1]+=.004-minimum;
  return p;
}

function armsTo(p,targets,poles){
  const world=fk(p),body=world.Hips.rotation;
  for(const [side,i] of [['Left',0],['Right',1]]){
    const target=add(p.hips,rotate(body,targets[i]));
    const pole=rotate(body,poles?.[i]??[i?-.25:.25,-.8,.5]);
    solve(p,side+'Arm',side+'ForeArm',side+'Hand',target,pole,body);
  }
  return p;
}

/** Joint angles are local and fixed-length: knees +X, elbows -X. */
function body({y=.78,pitch=0,roll=0,spine=0,head=0,left=[-12,45,0],right=[-12,45,0],feet=false,arms='ready',sign=1}={}){
  const p=identityPose([0,y,0]);
  p.rotations.Hips=euler(pitch,0,roll);
  p.rotations.Spine=euler(spine*.55);
  p.rotations.Chest=euler(spine*.45);
  p.rotations.Neck=euler(-head*.2);
  p.rotations.Head=euler(head);
  for(const [side,[hip,knee,splay]] of [['Left',left],['Right',right]]){
    p.rotations[side+'UpLeg']=euler(hip,0,splay);
    p.rotations[side+'Leg']=euler(knee);
    p.rotations[side+'Foot']=euler(-hip-knee-pitch-spine*.1);
    if(feet)solve(p,side+'UpLeg',side+'Leg',side+'Foot',[side==='Left'?.12:-.12,.08,side==='Left'?.02:-.02],[0,0,1],I);
  }
  // Explicit shoulder arcs use one continuous anatomical plane. In particular,
  // reaching above the brow must not choose a new IK elbow plane or roll a wrist
  // through 180 degrees just because the hands cross shoulder height.
  for(const [side,s] of [['Left',1],['Right',-1]]){
    const [pitch,splay,flex]=arms==='reach'?[-158,-s*10,18]:
      arms==='lowreach'?[-130,-s*9,30]:arms==='cradle'?[-48,-s*8,95]:
      arms==='brace'?[-25,-s*5,70]:[0,s*12,40];
    p.rotations[side+'Arm']=euler(pitch,0,splay);
    p.rotations[side+'ForeArm']=euler(-flex);
    p.rotations[side+'Hand']=[...I];
  }
  return clearFloor(p);
}

/** Shared left/right contact endpoint for every save and its .8s recovery.
 * The head stays above the lower shoulder, both elbows cover the gathered ball,
 * and the flexed top leg is staggered rather than opening into a comic split.
 */
export function sideLanding(sign=1){
  return body({y:.17,pitch:6,roll:-sign*82,spine:4,head:-3,
    // Lower leg adducts eight degrees so the calf clears the floor without
    // lifting the trunk. The lower hip/forearm, rather than a foot, bears weight.
    left:sign>0?[-6,42,-8]:[-22,61,3],right:sign>0?[-22,61,-3]:[-6,42,8],
    arms:'cradle',sign});
}

function blendPose(a,b,u){
  return {hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(bone=>[bone.name,bone.name==='Root'?[...I]:slerp(a.rotations[bone.name],b.rotations[bone.name],u)]))};
}
function sampleKeys(keys,t){
  if(t<=keys[0][0])return copy(keys[0][1]);
  if(t>=keys.at(-1)[0])return copy(keys.at(-1)[1]);
  for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return clearFloor(blendPose(keys[i-1][1],keys[i][1],ease((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0]))));
  return copy(keys.at(-1)[1]);
}
const time = frame => frame/30;
function makeClip(id,label,duration,keys,{events=[],next,notes='',supports=[]}={}){
  const frames=Array.from({length:Math.round(duration*30)+1},(_,i)=>({time:time(i),...sampleKeys(keys,time(i))}));
  return {id,label,duration,role:'keeper',loop:false,fps:30,rootMotion:false,frames,events,supports,next,
    notes,groundContactMode:'side-body',coordinateSpace:'canonical parent-local absolute xyzw; visual pelvis only; fixed Root'};
}
function stationarySupport(p,bone,start,end,local=[0,0,0]){
  return {bone,start,end,local,anchor:point(p,bone,local)};
}

export async function keeperClips(){
  const reference=JSON.parse(await readFile(new URL('../../soccer-header-v1/runtime/motions.json',import.meta.url)));
  const neutral=copy(reference.clips[0].frames[0]);delete neutral.time;
  const clips=[];
  const sides=[[1,'left','שמאלה'],[-1,'right','ימינה']];
  for(const [sign,name,he] of sides){
    const land=sideLanding(sign),hand=sign>0?'LeftHand':'RightHand';
    for(const [height,heHeight,duration,loadFrame,flightFrame,contactFrame,landFrame] of [
      ['','אמצע',1.10,5,12,16,28],
      ['low_','נמוך',1.00,3,11,15,25],
      ['high_','גבוה',1.30,6,15,20,34],
    ]){
      const high=height==='high_',low=height==='low_';
      const load=body({y:low?.65:.66,pitch:12,roll:-sign*9,spine:4,feet:true,arms:'brace',sign});
      const air=body({y:low?.34:high?1.10:.76,pitch:low?10:4,roll:-sign*(low?70:high?44:58),
        left:sign>0?[-12,36,low?-8:3]:[-24,65,4],right:sign>0?[-24,65,-4]:[-12,36,low?8:-3],arms:low?'lowreach':'reach',sign});
      // A low save lies almost parallel to the pitch at contact. Merely
      // lowering the hips with a tilted, straight lower leg raises the whole
      // body again during floor clearance and leaves the glove at chest height.
      // Adduct that leg, roll onto the side and gather at actual ankle height.
      const contact=body({y:low?.24:high?.98:.65,pitch:7,roll:-sign*(low?82:high?62:72),
        left:sign>0?[-9,32,low?-8:3]:[-25,65,3],right:sign>0?[-25,65,-3]:[-9,32,low?8:-3],arms:low?'lowreach':'reach',sign});
      const absorb=body({y:low?.18:.20,pitch:7,roll:-sign*(low?81:77),spine:3,head:-4,
        left:sign>0?[-8,43,low?-8:3]:[-23,61,3],right:sign>0?[-23,61,-3]:[-8,43,low?8:-3],arms:'cradle',sign});
      const id=`dive_${height}${name}`,finish=Math.round(duration*30);
      const authored=makeClip(id,`זינוק ${he} · ${heHeight}`,duration,[[0,neutral],[time(loadFrame),load],
        [time(flightFrame),air],[time(contactFrame),contact],[time(landFrame-3),absorb],[time(landFrame),land],[time(finish),land]],{
        events:[{type:'takeoff',time:time(loadFrame)},{type:'contact',time:time(contactFrame),bone:hand,local:[0,-.045,.065]},
          {type:'land',time:time(landFrame-3),bone:sign>0?'LeftArm':'RightArm'},
          {type:'settled',time:time(landFrame),bone:'Hips'}],
        supports:[...['LeftFoot','RightFoot'].map(b=>stationarySupport(neutral,b,0,time(1),[0,-.08,0])),
          stationarySupport(land,'Hips',time(landFrame),duration)],next:`getup_keeper_${name}`,
        notes:'Loaded outside leg, coordinated hip/shoulder roll, soft forearm/side absorption, protected head and compact cradle. Game applies lateral travel; no animated Root.'
      });
      if(low)for(const frame of authored.frames){
        // Protect both the centre sole probe used by QA and the toe-side probe
        // during the almost-horizontal collapse; neither is a mesh projection.
        const minimum=Math.min(...['LeftFoot','RightFoot'].map(b=>point(frame,b,[0,-.08,0])[1]));
        if(minimum<.002)frame.hips[1]+=.002-minimum;
      }
      clips.push(authored);
    }
    const kneel=body({y:.40,pitch:26,roll:-sign*24,spine:8,head:-6,
      left:sign>0?[-42,104,3]:[-19,94,4],right:sign>0?[-19,94,-4]:[-42,104,-3],arms:'brace',sign});
    const lowerSide=sign>0?'Left':'Right',landWorld=fk(land);
    const handAnchor=[sign*.30,landWorld[lowerSide+'Hand'].position[1],.30];
    const handOrientation=landWorld[lowerSide+'Hand'].rotation;
    const elbowPole=landWorld[lowerSide+'ForeArm'].position.map((v,i)=>v-landWorld[lowerSide+'Arm'].position[i]);
    // First roll onto the lower forearm and place that glove beside the hip.
    // The folded legs let the trunk stay low enough for a real supported push;
    // an upright kneel at this stage would put the ground beyond arm reach.
    const push=body({y:.28,pitch:20,roll:-sign*52,spine:10,head:-5,
      left:sign>0?[-70,145,-8]:[-60,130,3],right:sign>0?[-60,130,-3]:[-70,145,8],arms:'brace',sign});
    solve(push,lowerSide+'Arm',lowerSide+'ForeArm',lowerSide+'Hand',handAnchor,elbowPole,handOrientation);
    const crouch=body({y:.60,pitch:16,roll:-sign*5,spine:8,feet:true,arms:'brace',sign});
    const rise=body({y:.75,pitch:3,spine:2,feet:true,arms:'ready',sign});
    const recovery=makeClip(`getup_keeper_${name}`,`קימה משכיבה ${he}`, .8,[[0,land],[time(7),push],[time(12),kneel],
      [time(17),crouch],[time(21),rise],[.8,neutral]],{
      events:[{type:'ground_plant',time:time(3),bone:lowerSide+'Hand'},
        {type:'ground_release',time:time(7),bone:lowerSide+'Hand'},
        {type:'ground_release',time:time(7),bone:'Hips'},{type:'plant',time:time(17),bone:'LeftFoot',local:[0,-.08,0]},
        {type:'plant',time:time(17),bone:'RightFoot',local:[0,-.08,0]},{type:'recovered',time:.8}],
      supports:[{bone:lowerSide+'Hand',start:time(3),end:time(7),local:[0,0,0],anchor:handAnchor},
        ...['LeftFoot','RightFoot'].map(b=>stationarySupport(neutral,b,time(17),.8,[0,-.08,0]))],
      notes:'Roll from the side onto the lower forearm, place the same glove beside the hip and push from the ground before releasing into a kneel. Feet then plant under the pelvis for the final rise. Exact .8s; matches every same-side save endpoint.'
    });
    // Preserve the displayed elbow plane while the lower glove bears weight.
    // The shoulder travels over a real stationary hand; it does not float up
    // while both hands stay in the ball cradle. Placement occurs before 0.1s.
    const initialHand=landWorld[lowerSide+'Hand'].position;
    for(const frame of recovery.frames)if(frame.time>0&&frame.time<=time(7)){
      const target=mix(initialHand,handAnchor,ease(frame.time/time(3)));
      solve(frame,lowerSide+'Arm',lowerSide+'ForeArm',lowerSide+'Hand',target,elbowPole,handOrientation);
    }
    // Rotations interpolated between two planted poses do not keep a sole
    // planted. Solve the actual fixed-length leg chain at every native sample
    // once each foot has returned under the body; preserve the endpoint exactly.
    const footReference=fk(neutral);
    for(const frame of recovery.frames)if(frame.time>=time(17)&&frame.time<.8){
      for(const side of ['Left','Right'])solve(frame,side+'UpLeg',side+'Leg',side+'Foot',
        footReference[side+'Foot'].position,[0,0,1],footReference[side+'Foot'].rotation);
    }
    clips.push(recovery);
  }

  const left=sideLanding(1),right=sideLanding(-1);
  const chest=body({y:.69,pitch:11,roll:-5,spine:3,feet:true,arms:'cradle'});
  const chestLower=body({y:.45,pitch:19,roll:-43,spine:5,arms:'cradle',left:[-20,70,3],right:[-30,80,-3]});
  clips.push(makeClip('catch_chest','קליטת חזה ונפילת איסוף',1.1,[[0,neutral],[time(8),chest],[time(12),chest],
    [time(22),chestLower],[time(30),left],[1.1,left]],{
    events:[{type:'contact',time:time(9),bone:'LeftHand',local:[0,-.045,.065]},
      {type:'secure',time:time(9),bone:'RightHand'},
      {type:'land',time:time(27),bone:'LeftArm'},{type:'settled',time:1,bone:'Hips'}],
    supports:[...['LeftFoot','RightFoot'].map(b=>stationarySupport(neutral,b,0,time(1),[0,-.08,0])),stationarySupport(left,'Hips',1,1.1)],
    next:'getup_keeper_left',notes:'Both gloves gather at the sternum. A compact controlled side fall protects the gathered ball; no exaggerated backward flop.'
  }));
  const highLoad=body({y:.65,pitch:8,feet:true,arms:'brace'});
  const highCatch=body({y:1.02,pitch:0,roll:-8,left:[-13,35,2],right:[-13,35,-2],arms:'reach'});
  const highSide=body({y:.76,pitch:5,roll:-52,left:[-9,38,3],right:[-24,64,-3],arms:'cradle'});
  clips.push(makeClip('catch_high','קליטה גבוהה ונחיתת צד',1.3,[[0,neutral],[time(6),highLoad],[time(15),highCatch],
    [time(20),highCatch],[time(29),highSide],[time(36),left],[1.3,left]],{
    events:[{type:'takeoff',time:time(6)},{type:'contact',time:time(17),bone:'LeftHand',local:[0,-.045,.065]},
      {type:'secure',time:time(17),bone:'RightHand'},
      {type:'land',time:time(33),bone:'LeftArm'},{type:'settled',time:1.2,bone:'Hips'}],
    supports:[...['LeftFoot','RightFoot'].map(b=>stationarySupport(neutral,b,0,time(1),[0,-.08,0])),stationarySupport(left,'Hips',1.2,1.3)],
    next:'getup_keeper_left',notes:'Small loaded hop, two gloves above the forehead, ball brought to chest before side/forearm absorption.'
  }));
  const punchLoad=body({y:.66,pitch:9,roll:5,feet:true,arms:'brace',sign:-1});
  const punchReach=body({y:.99,pitch:2,roll:28,left:[-20,57,3],right:[-11,34,-3],arms:'reach',sign:-1});
  // Dominant right fist extends; the opposite glove stays in front of the chest.
  punchReach.rotations.LeftArm=euler(-48,0,-8);
  punchReach.rotations.LeftForeArm=euler(-95);
  punchReach.rotations.LeftHand=[...I];
  clearFloor(punchReach);
  const punchSide=body({y:.73,pitch:7,roll:58,left:[-23,62,3],right:[-9,37,-3],arms:'cradle',sign:-1});
  clips.push(makeClip('punch','אגרוף לכדור ונחיתה נשלטת',1.3,[[0,neutral],[time(6),punchLoad],[time(17),punchReach],
    [time(27),punchSide],[time(36),right],[1.3,right]],{
    events:[{type:'takeoff',time:time(6)},{type:'contact',time:time(17),bone:'RightHand',local:[0,-.06,.06]},
      {type:'land',time:time(33),bone:'RightArm'},{type:'settled',time:1.2,bone:'Hips'}],
    supports:[...['LeftFoot','RightFoot'].map(b=>stationarySupport(neutral,b,0,time(1),[0,-.08,0])),stationarySupport(right,'Hips',1.2,1.3)],
    next:'getup_keeper_right',notes:'Dominant right fist meets the ball above the brow; the other glove guards the chest. Retract before landing on the right side.'
  }));
  const footLoad=body({y:.62,pitch:13,roll:8,feet:true,arms:'brace',sign:-1});
  const footBlock=body({y:.46,pitch:11,roll:32,left:[-34,86,4],right:[-61,21,-5],arms:'brace',sign:-1});
  const footSide=body({y:.27,pitch:8,roll:65,left:[-25,67,3],right:[-27,45,-3],arms:'cradle',sign:-1});
  clips.push(makeClip('save_with_foot','הצלה בכף רגל ומעבר לצד',1.1,[[0,neutral],[time(5),footLoad],[time(13),footBlock],
    [time(21),footSide],[1,right],[1.1,right]],{
    events:[{type:'support_release',time:time(5),bone:'RightFoot'},
      {type:'contact',time:time(13),bone:'RightFoot',local:[0,-.03,.14]},
      {type:'land',time:time(27),bone:'RightArm'},{type:'settled',time:1,bone:'Hips'}],
    supports:[...['LeftFoot','RightFoot'].map(b=>stationarySupport(neutral,b,0,time(1),[0,-.08,0])),stationarySupport(right,'Hips',1,1.1)],
    next:'getup_keeper_right',notes:'Compact seated block with the right sole and a folded support leg, then controlled right hip/forearm contact. No acrobatic split or joint snapping.'
  }));
  // Audit the entire loaded stance, not just its quiet entry handle. Both soles
  // stay at the exact reference ankles until the declared physical release.
  // Solve after native pose interpolation; blending two planted leg rotations
  // alone would move the soles even if the endpoint poses were both correct.
  const neutralWorld=fk(neutral);
  for(const clip of clips){
    if(/^getup/.test(clip.id))continue;
    const release=clip.id==='catch_chest'?.4:
      clip.events.find(e=>e.type==='takeoff'||e.type==='support_release')?.time;
    if(!Number.isFinite(release))throw new Error(`${clip.id}: missing loaded-stance release`);
    clip.supports=clip.supports.filter(w=>!(w.start===0&&/^(Left|Right)Foot$/.test(w.bone)));
    clip.supports.push(...['LeftFoot','RightFoot'].map(b=>stationarySupport(neutral,b,0,release,[0,-.08,0])));
    if(clip.id==='catch_chest')clip.events.push({type:'support_release',time:release});
    for(const frame of clip.frames)if(frame.time<=release){
      for(const side of ['Left','Right'])solve(frame,side+'UpLeg',side+'Leg',side+'Foot',
        neutralWorld[side+'Foot'].position,[0,0,1],neutralWorld[side+'Foot'].rotation);
    }
    clip.loadedStance={start:0,end:release,reference:'idle_relaxed FK ankle positions and world foot orientation',
      method:'Two-bone fixed-length leg IK at every native 30Hz sample, after authored pose interpolation.'};
  }
  return clips;
}
