/**
 * Original basketball presentation motion, authored for the canonical 18 joints.
 * Coordinates are metres, +Y up, +Z forward, +X anatomical left.
 * No gameplay, ownership, collision or score is inferred from animation time.
 * The same target-space solver is used for live playback and baked GLB clips.
 */
import * as THREE from '../vendor/three.module.js';
import {TECHNIQUES, techniquePose} from './technique-poses.mjs';

export const BONE_NAMES = Object.freeze(['Root','Hips','Spine','Chest','Neck','Head',
  'LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand',
  'LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']);

export const ACTIONS = Object.freeze([...TECHNIQUES,
{id:'ref_idle',label:'עמידת מוצא',labelEn:'Ready reference',duration:2,loop:false,category:'reference'},
{id:'ref_run',label:'ריצת מוצא',labelEn:'Running reference',duration:.8,loop:false,category:'reference'}]);
const CATALOG = Object.fromEntries(ACTIONS.map(a=>[a.id,a]));
const TAU = Math.PI*2, V = a=>new THREE.Vector3(...a), Q = ()=>new THREE.Quaternion();
const clamp = (x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const mix = (a,b,t)=>a+(b-a)*t;
const smooth = x=>{x=clamp(x);return x*x*(3-2*x);};
const ramp = (p,a,b)=>smooth((p-a)/(b-a));
const pulse = (p,a,b,c,d)=>ramp(p,a,b)*(1-ramp(p,c,d));
const lerp3 = (a,b,t)=>a.map((x,i)=>mix(x,b[i],t));
const add3 = (a,b)=>a.map((x,i)=>x+b[i]);
const normalized = a=>{const l=Math.hypot(...a)||1;return a.map(x=>x/l);};
function mixDirection(a,b,t){const va=V(normalized(a)),vb=V(normalized(b)),dot=clamp(va.dot(vb),-1,1);if(dot>.999)return va.lerp(vb,t).normalize().toArray();if(dot<-.999){const axis=Math.abs(va.x)<.8?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);axis.addScaledVector(va,-axis.dot(va)).normalize();return va.multiplyScalar(Math.cos(Math.PI*t)).addScaledVector(axis,Math.sin(Math.PI*t)).toArray();}const angle=Math.acos(dot),sin=Math.sin(angle);return va.multiplyScalar(Math.sin((1-t)*angle)/sin).addScaledVector(vb,Math.sin(t*angle)/sin).toArray();}
const copy = x=>Array.isArray(x)?x.map(copy):(x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,copy(v)])):x);
function blend(a,b,t){
  if(typeof a==='number')return mix(a,b,t);
  if(Array.isArray(a))return a.map((v,i)=>blend(v,b[i],t));
  if(a&&typeof a==='object')return Object.fromEntries(Object.keys(a).map(k=>[k,blend(a[k],b[k],t)]));
  return t<.5?a:b;
}
function arc(p,a,b,height){const t=clamp((p-a)/(b-a));return Math.sin(Math.PI*t)*height;}
const airSupport=(p,a,b)=>1-pulse(p,a-.03,a+.05,b-.05,b+.03);
function freeBallY(y,velocity,seconds,radius){const g=9.81,impact=(velocity+Math.sqrt(velocity*velocity+2*g*Math.max(0,y-radius)))/g;if(seconds<=impact)return y+velocity*seconds-.5*g*seconds*seconds;const t=seconds-impact,rebound=(g*impact-velocity)*.58;return Math.max(radius,radius+rebound*t-.5*g*t*t);}
function controlledBounce(top,radius,phase,period){
  const g=9.81,H=top-radius,T=period/2,push=Math.max(.08*period,T-Math.sqrt(2*H/g)),flight=T-push;
  // The hand supplies the extra downward acceleration during a short push;
  // the released ball then follows gravity. A slower protective dribble has
  // a brief top dwell instead of negative hand acceleration.
  const acceleration=Math.max(0,(H-.5*g*flight*flight)/(push*(T-.5*push))),t=Math.min(phase,1-phase)*period;
  const distance=t<=push?.5*acceleration*t*t:.5*acceleration*push*push+acceleration*push*(t-push)+.5*g*(t-push)*(t-push);
  return {y:Math.max(radius,top-distance),pushNormalized:push/period,handAccelerationMetersPerSecondSquared:acceleration};
}

export function sampleMotion(id,phase,measurements){
 if(!CATALOG[id])throw new Error('Unknown technique '+id);
 return techniquePose(id==='ref_idle'?'idle':id==='ref_run'?'run':id,clamp(phase),measurements);
}

function quaternionBasis(fingers,normal){
  const f=V(normalized(fingers)),n=V(normalized(normal));
  n.addScaledVector(f,-f.dot(n));if(n.lengthSq()<1e-8){n.set(Math.abs(f.x)<.8?1:0,Math.abs(f.x)<.8?0:1,0).addScaledVector(f,-(Math.abs(f.x)<.8?f.x:f.y));}
  n.normalize();const side=new THREE.Vector3().crossVectors(f,n).normalize();
  return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,f,n));
}
function handFrame(hand,root,profile,side,h){
  const key=side==='left'?'LeftHand':'RightHand';
  const supplied=profile?.palm?.[key]||profile?.palms?.[key]||profile?.palm?.[side]||profile?.palms?.[side];
  const center=V(supplied?.palmPoint||supplied?.center||supplied?.localCenter||[0,-.040*h,.012]),normal=V(supplied?.palmNormal||supplied?.normal||[0,0,1]).normalize();
  // Early authoring metadata selected the dorsal surface. A native relaxed
  // thumb opposes toward the palmar hemisphere; use that sign while older
  // intermediates are open, until the verified palmar chart replaces them.
  const dorsal=supplied?.palmarSurfaceVerified?false:supplied?.thumbDirection?normal.dot(V(supplied.thumbDirection))<0:!!supplied&&normal.y>0;
  if(dorsal){center.addScaledVector(normal,-.018);normal.negate();}
  return {
    center,
    normal,
    fingers:V(supplied?.fingers||supplied?.fingerDirection||[0,-1,0]).normalize(),
    worldBind:hand.getWorldQuaternion(Q()),
  };
}

/**
 * Construct one controller per character. Transform the model in an outer Group.
 * A supplied ball must share the model's parent, or can live elsewhere in scene;
 * the controller converts its centre/quaternion through that parent correctly.
 */
export function createMotionController(root,{ball=null,profile={},id='ref_idle',transitionSeconds=.42}={}){
  root.updateWorldMatrix(true,true);
  const inverseRootWorld=new THREE.Matrix4().copy(root.matrixWorld).invert();
  const bones=Object.fromEntries(BONE_NAMES.map(name=>[name,root.getObjectByName(name)]));
  const absent=BONE_NAMES.filter(n=>!bones[n]);if(absent.length)throw new Error('Missing canonical basketball joints: '+absent.join(', '));
  const bind=Object.fromEntries(BONE_NAMES.map(n=>[n,{position:bones[n].position.clone(),quaternion:bones[n].quaternion.clone(),scale:bones[n].scale.clone()}]));
  const toModel=o=>root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
  const restModel=Object.fromEntries(BONE_NAMES.map(n=>[n,toModel(bones[n])]));
  const suppliedHeight=Number(profile.heightMeters||profile.height);
  const h=suppliedHeight>1?suppliedHeight:Math.max(1.6,restModel.Head.y+.17);
  const m={h,hipsY:restModel.Hips.y,shoulderY:(restModel.LeftArm.y+restModel.RightArm.y)/2,
    rightShoulderX:restModel.RightArm.x,
    ankleY:(restModel.LeftFoot.y+restModel.RightFoot.y)/2,
    footX:(Math.abs(restModel.LeftFoot.x)+Math.abs(restModel.RightFoot.x))/2,
    armReach:restModel.RightArm.distanceTo(restModel.RightForeArm)+restModel.RightForeArm.distanceTo(restModel.RightHand),ballRadius:.12};
  const handFrames={left:handFrame(bones.LeftHand,root,profile,'left',h),right:handFrame(bones.RightHand,root,profile,'right',h)};
  m.handFrames=Object.fromEntries(Object.entries(handFrames).map(([k,v])=>[k,{center:v.center.toArray(),normal:v.normal.toArray(),fingers:v.fingers.toArray()}]));
  {
    const offset=V(normalized([-.08,-1,-.12])),f=handFrames.right,normal=offset.clone().negate(),finger=new THREE.Vector3(0,0,1).addScaledVector(normal,-normal.z).normalize(),rotation=quaternionBasis(finger.toArray(),normal.toArray()).multiply(quaternionBasis(f.fingers.toArray(),f.normal.toArray()).invert());
    m.rightShotWristDelta=offset.multiplyScalar(m.ballRadius).sub(f.center.clone().applyQuaternion(rotation)).toArray();
    const layupOffset=new THREE.Vector3(0,-1,0),layupRotation=quaternionBasis([0,0,1],[0,1,0]).multiply(quaternionBasis(f.fingers.toArray(),f.normal.toArray()).invert());
    m.rightLayupWristDelta=layupOffset.multiplyScalar(m.ballRadius).sub(f.center.clone().applyQuaternion(layupRotation)).toArray();
  }
  const morphMeshes=[];root.traverse(o=>{if(o.morphTargetDictionary&&o.morphTargetInfluences)morphMeshes.push(o);});
  const skinMeshes=[];root.traverse(o=>{if(o.isSkinnedMesh)skinMeshes.push(o);});
  // A small extremal set is selected from the actual decoded skin, once per
  // controller. Grounding then evaluates shoes rather than assuming an ankle
  // height equals the sole of every role and LOD. Loose official trousers need
  // every surface vertex during a fall: blended knee vertices can become the
  // lowest point even when they were interior to their bind-pose bone bin.
  const probes={leftFoot:[],rightFoot:[],leftHand:[],rightHand:[],body:[]};
  const directions=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)directions.push([x,y,z]);
  for(const mesh of skinMeshes){
    mesh.skeleton.update();const position=mesh.geometry.attributes.position,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight,bins={};
    if(!indices||!weights)continue;
    const denseFallGarment=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(material=>material?.name==='official_trousers');
    if(denseFallGarment)for(let index=0;index<position.count;index++)probes.body.push({mesh,index});
    const point=new THREE.Vector3();
    for(let i=0;i<position.count;i++){
      let dominant=0,max=-1;for(let k=0;k<4;k++){const w=weights.getComponent(i,k);if(w>max){max=w;dominant=indices.getComponent(i,k);}}
      const name=mesh.skeleton.bones[dominant]?.name;if(!name)continue;
      mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverseRootWorld);
      (bins[name]??=[]).push({index:i,point:point.toArray()});
    }
    for(const [name,vertices]of Object.entries(bins)){
      const selected=new Set();for(const d of directions){let best=-Infinity,index=-1;for(const v of vertices){const score=v.point[0]*d[0]+v.point[1]*d[1]+v.point[2]*d[2];if(score>best){best=score;index=v.index;}}if(index>=0)selected.add(index);}
      const key=name==='LeftFoot'?'leftFoot':name==='RightFoot'?'rightFoot':name==='LeftHand'?'leftHand':name==='RightHand'?'rightHand':'body';
      if(denseFallGarment&&key==='body')continue;
      probes[key].push(...[...selected].map(index=>({mesh,index})));
    }
  }
  const bindRootQ=root.getWorldQuaternion(Q()).invert();
  const restFootQ={left:bindRootQ.clone().multiply(bones.LeftFoot.getWorldQuaternion(Q())),right:bindRootQ.clone().multiply(bones.RightFoot.getWorldQuaternion(Q()))};
  const chainLengths={};for(const [key,names] of [['left',['LeftArm','LeftForeArm','LeftHand']],['right',['RightArm','RightForeArm','RightHand']],['leftLeg',['LeftUpLeg','LeftLeg','LeftFoot']],['rightLeg',['RightUpLeg','RightLeg','RightFoot']]])chainLengths[key]=restModel[names[0]].distanceTo(restModel[names[1]])+restModel[names[1]].distanceTo(restModel[names[2]]);
  const chainBindFrames={};
  for(const [key,names]of [['left',['LeftArm','LeftForeArm','LeftHand']],['right',['RightArm','RightForeArm','RightHand']],['leftLeg',['LeftUpLeg','LeftLeg','LeftFoot']],['rightLeg',['RightUpLeg','RightLeg','RightFoot']]]){
    const first=restModel[names[1]].clone().sub(restModel[names[0]]),second=restModel[names[2]].clone().sub(restModel[names[1]]),normal=new THREE.Vector3().crossVectors(first,second);
    if(normal.lengthSq()<1e-10)normal.set(1,0,0);normal.normalize();
    const rootInverse=root.getWorldQuaternion(Q()).invert();
    chainBindFrames[key]={upperFrame:quaternionBasis(first.toArray(),normal.toArray()).invert(),lowerFrame:quaternionBasis(second.toArray(),normal.toArray()).invert(),upperRotation:rootInverse.clone().multiply(bones[names[0]].getWorldQuaternion(Q())),lowerRotation:rootInverse.clone().multiply(bones[names[1]].getWorldQuaternion(Q()))};
  }
  let action=CATALOG[id]?id:'idle_hold',time=0,frame=0,transition=null,pending=null,displayed=sampleMotion(action,0,m),previousBall=V(displayed.ball),ballVelocity=new THREE.Vector3(),lastDt=0,lastDiagnostics={};
  const maxReach={left:0,right:0,leftLeg:0,rightLeg:0};
  function modelQ(){return root.getWorldQuaternion(Q());}
  function targetWorld(a){return root.localToWorld(V(a));}
  function setWorldQuaternion(bone,q){bone.parent.updateWorldMatrix(true,false);bone.quaternion.copy(bone.parent.getWorldQuaternion(Q()).invert().multiply(q));bone.updateWorldMatrix(false,true);}
  function rotation(name,euler){bones[name].quaternion.copy(bind[name].quaternion).multiply(Q().setFromEuler(new THREE.Euler(...euler,'XYZ')));bones[name].updateWorldMatrix(false,true);}
  function aim(bone,child,point){
    const origin=bone.getWorldPosition(new THREE.Vector3()),old=child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize(),next=point.clone().sub(origin).normalize();
    if(next.lengthSq()<.5)return;
    const world=Q().setFromUnitVectors(old,next).multiply(bone.getWorldQuaternion(Q()));setWorldQuaternion(bone,world);
  }
  function chain(upperName,lowerName,endName,target,pole,key){
    const upper=bones[upperName],lower=bones[lowerName],end=bones[endName],a=upper.getWorldPosition(new THREE.Vector3());
    const l1=a.distanceTo(lower.getWorldPosition(new THREE.Vector3())),l2=lower.getWorldPosition(new THREE.Vector3()).distanceTo(end.getWorldPosition(new THREE.Vector3()));
    const t=targetWorld(target),axis=t.clone().sub(a),requested=axis.length(),len=clamp(requested,.005,l1+l2-.00005);axis.normalize();
    const poleWorld=targetWorld(pole).sub(a),perp=poleWorld.addScaledVector(axis,-poleWorld.dot(axis));
    if(perp.lengthSq()<1e-8)perp.set(0,0,1).addScaledVector(axis,-axis.z);perp.normalize();
    const along=clamp((l1*l1-l2*l2+len*len)/(2*len),-l1,l1),height=Math.sqrt(Math.max(0,l1*l1-along*along));
    const elbow=a.clone().addScaledVector(axis,along).addScaledVector(perp,height),reachable=a.clone().addScaledVector(axis,len);
    // A rest-frame construction preserves limb twist through overhead motion.
    // Minimal fromUnitVectors swings have an antipodal singularity here and
    // can turn an upper arm almost180degrees between adjacent frames.
    const normal=new THREE.Vector3().crossVectors(perp,axis).normalize(),rest=chainBindFrames[key];
    const upperQ=quaternionBasis(elbow.clone().sub(a).toArray(),normal.toArray()).multiply(rest.upperFrame).multiply(rest.upperRotation);
    setWorldQuaternion(upper,upperQ);
    const lowerQ=quaternionBasis(reachable.clone().sub(elbow).toArray(),normal.toArray()).multiply(rest.lowerFrame).multiply(rest.lowerRotation);
    setWorldQuaternion(lower,lowerQ);
    maxReach[key]=Math.max(0,requested-(l1+l2));
  }
  function handTarget(key,p){
    const hand=p[key],f=handFrames[key],sign=key==='left'?1:-1,contact=clamp(hand.contact),offset=V(normalized(hand.offset));
    const desiredNormal=V(hand.normal).lerp(offset.clone().negate(),contact).normalize();
    const tangentFinger=V(hand.fingers).addScaledVector(desiredNormal,-V(hand.fingers).dot(desiredNormal));
    if(tangentFinger.lengthSq()<1e-8)tangentFinger.set(0,0,1).addScaledVector(desiredNormal,-desiredNormal.z);tangentFinger.normalize();
    const hasOverride=Math.hypot(...hand.rotation)>.5;
    const desiredQ=hasOverride?Q().fromArray(hand.rotation).normalize():quaternionBasis(tangentFinger.toArray(),desiredNormal.toArray()).multiply(quaternionBasis(f.fingers.toArray(),f.normal.toArray()).invert());
    if(hasOverride)offset.copy(f.normal).applyQuaternion(desiredQ).negate().normalize();
    const palmOffset=f.center.clone().applyQuaternion(desiredQ);
    const center=V(p.ball).addScaledVector(offset,m.ballRadius),contactWrist=center.sub(palmOffset);
    const wrist=V(hand.wrist).lerp(contactWrist,contact);
    return {wrist:wrist.toArray(),rotation:desiredQ,contact,offset:offset.toArray(),finger:hand.fingers,sign};
  }
  function probeMin(items){let min=Infinity;const point=new THREE.Vector3();for(const item of items){item.mesh.getVertexPosition(item.index,point).applyMatrix4(item.mesh.matrixWorld).applyMatrix4(inverseRootWorld);min=Math.min(min,point.y);}return min;}
  function refreshSkin(){root.updateWorldMatrix(true,true);for(const mesh of skinMeshes)mesh.skeleton.update();}
  function apply(p,groundIteration=0,groundReference=null){
    for(const name of BONE_NAMES){bones[name].position.copy(bind[name].position);bones[name].quaternion.copy(bind[name].quaternion);bones[name].scale.copy(bind[name].scale);}
    root.updateWorldMatrix(true,true);
    inverseRootWorld.copy(root.matrixWorld).invert();
    const setHips=()=>{const hipsTarget=targetWorld(add3(restModel.Hips.toArray(),p.hips));bones.Hips.position.copy(bones.Hips.parent.worldToLocal(hipsTarget));bones.Hips.updateWorldMatrix(false,true);};setHips();
    rotation('Hips',p.hipsRotation);rotation('Spine',p.spine);rotation('Chest',p.chest);rotation('Neck',p.neck);rotation('Head',p.head);
    // Reach adaptation uses the measured limb lengths of each position. Lower
    // the pelvis for a planted long step instead of stretching the shin or
    // allowing a supporting sole to rise. Airborne targets remain free.
    let lower=0;
    for(const [key,name]of [['left','LeftUpLeg'],['right','RightUpLeg']]){
      const hip=toModel(bones[name]),foot=V(p[key+'Foot']),dx=hip.x-foot.x,dz=hip.z-foot.z,L=chainLengths[key+'Leg']*.98;
      const available=Math.sqrt(Math.max(.0001,L*L-dx*dx-dz*dz)),landingPreparation=1-ramp(foot.y-m.ankleY,0,.06),support=Math.max(p[key+'Support'],landingPreparation);
      lower=Math.max(lower,(hip.y-foot.y-available)*support);
    }
    if(lower>0){p.hips[1]-=Math.min(lower,.18*h);setHips();}
    // A few millimetres of measured-proportion adaptation keep a small guard's
    // shooting pocket reachable, while the ball and both palms move together.
    for(let iteration=0;iteration<3;iteration++)for(const [key,name]of [['left','LeftArm'],['right','RightArm']])if(p[key].contact>.9999){
      const a=handTarget(key,p),shoulder=toModel(bones[name]),delta=V(a.wrist).sub(shoulder),distance=delta.length(),max=chainLengths[key]*.97;
      if(distance>max){const strength=smooth((p[key].contact-.5)*2);delta.multiplyScalar((distance-max)/distance*strength);p.ball=V(p.ball).sub(delta).toArray();}
    }
    const left=handTarget('left',p),right=handTarget('right',p);
    p.left.rotation=left.rotation.toArray();p.right.rotation=right.rotation.toArray();
    for(const [key,name]of [['left','LeftUpLeg'],['right','RightUpLeg']])if(p[key+'Support']<.99){
      const hip=toModel(bones[name]),delta=V(p[key+'Foot']).sub(hip),reach=chainLengths[key+'Leg']*.98;
      if(delta.length()>reach)p[key+'Foot']=hip.add(delta.setLength(reach)).toArray();
    }
    chain('LeftUpLeg','LeftLeg','LeftFoot',p.leftFoot,p.leftKneePole,'leftLeg');
    chain('RightUpLeg','RightLeg','RightFoot',p.rightFoot,p.rightKneePole,'rightLeg');
    const mq=modelQ();
    for(const [key,name] of [['left','LeftFoot'],['right','RightFoot']]){
      const angles=[...p[key+'FootRotation']],roll=1-p[key+'Support']*(1-p[key+'FootRoll']);angles[0]*=roll;angles[2]*=roll;
      const delta=Q().setFromEuler(new THREE.Euler(...angles,'XYZ'));
      setWorldQuaternion(bones[name],mq.clone().multiply(delta).multiply(restFootQ[key]));
    }
    for(const [key,a,names] of [['left',left,['LeftArm','LeftForeArm','LeftHand']],['right',right,['RightArm','RightForeArm','RightHand']]]){
      const shoulder=toModel(bones[names[0]]),pole=shoulder.clone().add(V(p[key].bend)).toArray();
      const delta=V(a.wrist).sub(shoulder),reach=chainLengths[key]*mix(p[key].reach,.97,smooth(a.contact));if(delta.length()>reach)a.wrist=shoulder.clone().add(delta.setLength(reach)).toArray();
      chain(...names,a.wrist,pole,key);setWorldQuaternion(bones[names[2]],mq.clone().multiply(a.rotation));
    }
    root.updateWorldMatrix(true,true);
    for(const mesh of morphMeshes){const d=mesh.morphTargetDictionary,v=mesh.morphTargetInfluences,L=mix(p.left.freeGrip,p.left.grip,smooth(p.left.contact)),R=mix(p.right.freeGrip,p.right.grip,smooth(p.right.contact));if(d.grip_left!==undefined)v[d.grip_left]=L;if(d.grip_right!==undefined)v[d.grip_right]=R;if(d.grip!==undefined)v[d.grip]=Math.max(L,R);}
    refreshSkin();
    const soleHeights={};
    const desiredSole=groundReference||{left:.003+Math.max(0,p.leftFoot[1]-m.ankleY),right:.003+Math.max(0,p.rightFoot[1]-m.ankleY)};
    for(let pass=0;pass<2;pass++)for(const [key,name]of [['left','LeftFoot'],['right','RightFoot']]){
      const minimum=probeMin(probes[key+'Foot']);soleHeights[key]=minimum;
      const correction=desiredSole[key]-minimum;
      if(!Number.isFinite(correction)||Math.abs(correction)<.0002)continue;
      p[key+'Foot'][1]+=correction;
      chain(key==='left'?'LeftUpLeg':'RightUpLeg',key==='left'?'LeftLeg':'RightLeg',name,p[key+'Foot'],p[key+'KneePole'],key+'Leg');
      const angles=[...p[key+'FootRotation']],roll=1-p[key+'Support']*(1-p[key+'FootRoll']);angles[0]*=roll;angles[2]*=roll;
      setWorldQuaternion(bones[name],mq.clone().multiply(Q().setFromEuler(new THREE.Euler(...angles,'XYZ'))).multiply(restFootQ[key]));refreshSkin();
    }
    if(action==='fall'&&groundIteration<3){
      for(const key of ['left','right']){const minimum=probeMin(probes[key+'Hand']);if(minimum<.002)p[key].wrist[1]+=.002-minimum;}
      const bodyY=probeMin(probes.body);if(bodyY<.002)p.hips[1]+=.002-bodyY;
      // A fixed number of full constraint projections avoids a pose jump when
      // a surface crosses the contact threshold and changes the pass count.
      // Every pass retains the same authored sole-height baseline.
      apply(p,groundIteration+1,desiredSole);return;
    }
    // Apply authored world travel after local mesh-aware IK; shoes then cancel stance travel.
    const travel=p.rootTravel||[0,0,0];
    bones.Root.position.add(V(travel));root.updateWorldMatrix(true,true);
    p.ball=add3(p.ball,travel);
    for(const side of ['left','right'])p[side+'Foot']=add3(p[side+'Foot'],travel);
    if(ball){
      ball.visible=p.ballVisible>.05;
      const world=targetWorld(p.ball);ball.position.copy(ball.parent?ball.parent.worldToLocal(world):world);
      const rotation=mq.clone().multiply(Q().setFromEuler(new THREE.Euler(...p.ballRotation,'XYZ')));
      ball.quaternion.copy(ball.parent?ball.parent.getWorldQuaternion(Q()).invert().multiply(rotation):rotation);
      ball.updateWorldMatrix(false,true);
    }
    const contacts=[];let error=0;
    for(const [key,name] of [['left','LeftHand'],['right','RightHand']]){
      if(p[key].contact<.9999)continue;
      const f=handFrames[key],palm=f.center.clone().applyMatrix4(bones[name].matrixWorld),center=targetWorld(p.ball),dist=palm.distanceTo(center),e=Math.abs(dist-m.ballRadius);
      error=Math.max(error,e);contacts.push({effector:name,palm:root.worldToLocal(palm).toArray(),errorMeters:e});
    }
    const feet={};for(const [key,name] of [['left','LeftFoot'],['right','RightFoot']]){
      const actual=toModel(bones[name]);feet[key]={support:p[key+'Support']>.99,target:p[key+'Foot'],position:actual.toArray(),errorMeters:actual.distanceTo(V(p[key+'Foot']))};
    }
    lastDiagnostics={action,time,phase:getPhase(),transition:transition?{from:transition.from,to:action,progress:clamp(transition.elapsed/transition.duration)}:pending?{from:action,to:pending.id,waitingForCatch:true}:null,
      contact:contacts,handContactErrorMeters:error,footErrors:feet,soleProbeHeights:soleHeights,groundProbeCount:Object.fromEntries(Object.entries(probes).map(([k,v])=>[k,v.length])),maxReach:{...maxReach},ballPosition:[...p.ball],ballVisible:p.ballVisible>.05,frame,rootMotion:!!p.rootTravel};
    lastDiagnostics.handTargets={left:left.wrist,right:right.wrist};lastDiagnostics.elbows={left:toModel(bones.LeftForeArm).toArray(),right:toModel(bones.RightForeArm).toArray()};
  }
  function getPhase(){const a=CATALOG[action];return a.loop?(time/a.duration)%1:clamp(time/a.duration);}
  function begin(next,duration){
    const before=copy(displayed),beforeVelocity=ballVelocity.toArray();
    const targetPhaseLocked=next.startsWith('dribble_')&&(action==='idle_hold'||!!transition);
    transition={from:action,source:before,velocity:beforeVelocity,wristFrom:copy(lastDiagnostics.handTargets),targetPhaseLocked,elapsed:0,duration};action=next;time=0;pending=null;
  }
  function render(dt=0){
    const target=sampleMotion(action,getPhase(),m);
    if(transition){
      const u=clamp(transition.elapsed/transition.duration),s=smooth(u),source=transition.source;
      displayed=blend(source,target,s);
      for(const key of ['left','right'])displayed[key].rotation=handTarget(key,source).rotation.slerp(handTarget(key,target).rotation,s).normalize().toArray();
      for(const key of ['left','right'])for(const field of ['normal','fingers','offset'])displayed[key][field]=mixDirection(source[key][field],target[key][field],s);
      if(transition.from==='dribble_between_legs'){
        const a=transition.wristFrom.left,b=handTarget('left',target).wrist,c=[Math.max(a[0],b[0])+.15*h,mix(a[1],b[1],.5),.18];
        displayed.left.wrist=a.map((v,i)=>(1-s)*(1-s)*v+2*(1-s)*s*c[i]+s*s*b[i]);
        displayed.left.contact=ramp(u,.72,.98);
      }
      // Hermite endpoint derivatives preserve the displayed ball velocity at
      // interrupted transitions; post-blend wrist IK keeps any full contact.
      const u2=u*u,u3=u2*u,dh=transition.duration;
      displayed.ball=source.ball.map((x,i)=>(2*u3-3*u2+1)*x+(u3-2*u2+u)*dh*transition.velocity[i]+(-2*u3+3*u2)*target.ball[i]);
      displayed.ball[1]=Math.max(m.ballRadius,displayed.ball[1]);
      if(u>=1)transition=null;
    }else displayed=target;
    frame++;apply(displayed);
    if(dt>1e-6){ballVelocity.copy(V(displayed.ball).sub(previousBall).multiplyScalar(1/dt));lastDt=dt;}
    previousBall.copy(V(displayed.ball));lastDiagnostics.ballVelocityMetersPerSecond=ballVelocity.toArray();
  }
  const controller={
    setAction(next,{immediate=false,blendSeconds=transitionSeconds}={}){
      if(!CATALOG[next])throw new Error('Unknown basketball motion: '+next);
      if(immediate){action=next;time=0;transition=pending=null;ballVelocity.set(0,0,0);render();return controller;}
      if(next===action&&!pending&&!transition)return controller;
      // A live dribble is gathered at the next upper catch. It cannot be
      // physically held while its centre is still at the floor.
      if(next==='idle_hold'&&action.startsWith('dribble_')&&!transition){pending={id:next,duration:Math.max(action==='dribble_between_legs'?.65:action==='dribble_power'?.62:.52,blendSeconds)};return controller;}
      begin(next,Math.max(.08,blendSeconds));return controller;
    },
    update(dt){
      dt=clamp(Number(dt)||0,0,.10);if(transition?.targetPhaseLocked)time=0;else time+=dt;
      if(pending){
        const a=CATALOG[action],phase=getPhase(),u=(action==='dribble_crossover'||action==='dribble_between_legs')?(phase*2)%1:phase;
        const safeCatch=action==='dribble_between_legs'?(phase>.9875||phase<.0125):(u>.975||u<.025);
        if(safeCatch)begin(pending.id,pending.duration);
      }
      if(transition)transition.elapsed+=dt;render(dt);return controller;
    },
    seek(phase){time=clamp(Number(phase)||0)*CATALOG[action].duration;transition=pending=null;ballVelocity.set(0,0,0);render();return controller;},
    getDiagnostics(){return copy(lastDiagnostics);},
    snapshot(){return {action,time,phase:getPhase(),measurements:{...m},pose:copy(displayed),bones:Object.fromEntries(BONE_NAMES.map(n=>[n,{position:bones[n].position.toArray(),quaternion:bones[n].quaternion.toArray(),scale:bones[n].scale.toArray()}])),morphs:morphMeshes.map(mesh=>({node:mesh.name,targetNames:{...mesh.morphTargetDictionary},weights:[...mesh.morphTargetInfluences]})),ballAnchor:{position:[...displayed.ball],quaternion:Q().setFromEuler(new THREE.Euler(...displayed.ballRotation,'XYZ')).toArray(),scale:displayed.ballVisible>.05?[1,1,1]:[0,0,0]},...controller.getDiagnostics()};},
    get action(){return action;},get duration(){return CATALOG[action].duration;},get measurements(){return {...m};},
    dispose(){for(const n of BONE_NAMES){bones[n].position.copy(bind[n].position);bones[n].quaternion.copy(bind[n].quaternion);bones[n].scale.copy(bind[n].scale);}root.updateWorldMatrix(true,true);},
  };
  render();return controller;
}
