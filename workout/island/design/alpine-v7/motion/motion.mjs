/* Original alpine motion, metres, Y up, Z forward. No network or runtime build.
 * Exactly the existing motion2 canonical18 joints; equipment nodes are not joints.
 * The authoring adapter solves limbs in world space and bakes ordinary glTF tracks.
 */
import * as THREE from '../../../vendor/three.module.js';

const D=Math.PI/180, TAU=Math.PI*2;
const V=a=>new THREE.Vector3().fromArray(a), Q=a=>new THREE.Quaternion().fromArray(a).normalize();
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=x=>(x=clamp(x))*x*(3-2*x);
const lerp=(a,b,t)=>a+(b-a)*t;
const euler=(x=0,y=0,z=0)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z,'YXZ'));
const curve=(u,keys)=>{
  if(u<=keys[0][0])return keys[0][1];
  for(let i=1;i<keys.length;i++)if(u<=keys[i][0])return lerp(keys[i-1][1],keys[i][1],smooth((u-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));
  return keys.at(-1)[1];
};
const window=(u,a,b,c,d)=>smooth((u-a)/(b-a))*(1-smooth((u-c)/(d-c)));

export const BONE_NAMES=Object.freeze(['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']);
export const CLIPS=Object.freeze([
  {name:'glide',label:'גלישה',duration:2.4,loop:true,category:'ground'},
  {name:'carve_left',label:'קארווינג שמאלה',duration:3.2,loop:true,category:'carve',turn:1},
  {name:'carve_right',label:'קארווינג ימינה',duration:3.2,loop:true,category:'carve',turn:-1},
  {name:'crouch',label:'כריעה',duration:2.4,loop:true,category:'ground'},
  {name:'accelerate',label:'האצה',duration:2.6,loop:false,category:'ground'},
  {name:'ramp_jump',label:'רמפה · גרב · אוויר · נחיתה',duration:3.2,loop:false,category:'air'},
  {name:'trick_180',label:'סיבוב 180',duration:3.2,loop:false,category:'air'},
  {name:'trick_360',label:'סיבוב 360',duration:3.6,loop:false,category:'air'},
  {name:'trick_shifty',label:'שיפטי',duration:3.2,loop:false,category:'air'},
  {name:'trick_tail_grab',label:'גרב אחורי',duration:3.4,loop:false,category:'air'},
  {name:'trick_backflip',label:'סלטה לאחור',duration:3.8,loop:false,category:'air'},
  {name:'fall_roll',label:'נפילה מתגלגלת',duration:4.0,loop:false,category:'fall'},
  {name:'get_up',label:'קימה',duration:3.8,loop:false,category:'recover'},
  {name:'celebrate',label:'חגיגה',duration:3.0,loop:true,category:'ground'}
].map(c=>Object.freeze({...c,durationSeconds:c.duration,events:c.category==='air'?[{name:'takeoff',time:c.duration*.23},...(['ramp_jump','trick_tail_grab'].includes(c.name)?[{name:'grab-start',time:c.duration*.38},{name:'grab-release',time:c.duration*.64}]:[]),{name:'landing',time:c.duration*.77}]:c.category==='fall'?[{name:'balance-lost',time:.32},{name:'shoulder-contact',time:1.15},{name:'roll-contact',time:2.15},{name:'settled',time:3.8}]:[]})));
const BY_NAME=Object.fromEntries(CLIPS.map(c=>[c.name,c]));
const ALIASES={fall:'fall_roll',boost:'accelerate',turn_left:'carve_left',turn_right:'carve_right',jump:'ramp_jump'};

/** Optional standard-Three playback of the self-contained JSON alternative.
 * Supply already-parsed local JSON; this function never fetches anything.
 * The GLBs already contain equivalent ordinary AnimationClips.
 */
export function createClipsFromJSON(pack){
  if(pack?.kind!=='alpine-v7-baked-local-motion'||pack.skeleton?.bones?.length!==18)throw new Error('Expected an alpine-v7 canonical18 motion JSON pack');
  return pack.clips.map(clip=>{
    const tracks=clip.tracks.map(track=>{
      if(!BONE_NAMES.includes(track.node)&&!['Snowboard','LeftPole','RightPole'].includes(track.node))throw new Error(`Unexpected motion target ${track.node}`);
      if(track.path==='rotation')return new THREE.QuaternionKeyframeTrack(`${track.node}.quaternion`,track.times,track.values,THREE.InterpolateLinear);
      if(track.path==='translation')return new THREE.VectorKeyframeTrack(`${track.node}.position`,track.times,track.values,THREE.InterpolateLinear);
      throw new Error(`Unexpected motion channel ${track.path}`);
    });
    const result=new THREE.AnimationClip(clip.name,clip.durationSeconds,tracks);
    result.userData={label:clip.label,loop:clip.loop,events:clip.events};return result;
  });
}

/** A compact, reproducible authoring description. Angles are radians.
 * Root paths are presentation paths in place; host locomotion is separate.
 */
export function sampleParameters(clipName,seconds,sport='ski',{wrap=true}={}){
  const name=ALIASES[clipName]||clipName, clip=BY_NAME[name];
  if(!clip)throw new Error(`Unknown alpine-v7 motion: ${clipName}`);
  const u=clip.loop&&wrap?((seconds%clip.duration)+clip.duration)%clip.duration/clip.duration:clamp(seconds/clip.duration);
  const wave=Math.sin(TAU*u), board=sport==='snowboard';
  const p={name,u,sport,pelvisY:.473,pelvisX:0,pelvisZ:.013,hipsPitch:.17,hipsRoll:0,hipsYaw:0,spinePitch:.13,chestPitch:-.035,chestRoll:0,chestYaw:0,headPitch:-.10,
    rootYaw:0,rootPitch:0,rootRoll:0,rootX:0,rootZ:0,airHeight:0,edge:0,equipmentYaw:0,equipmentPitch:0,footLift:0,stance:board?.180:.127,handY:.720,handZ:.205,handSpread:.305,armPhase:0,grab:0,celebrate:0,fall:0,recover:0,worldPelvisY:null};
  if(name==='glide'){
    p.pelvisY+=.004*wave;p.hipsPitch+=.014*Math.sin(TAU*u+.4);p.armPhase=.012*wave;
  }else if(clip.category==='carve'){
    // A visible loaded apex, rather than a rigid tilt of the complete actor.
    const load=window(u,.03,.29,.70,.97), sign=clip.turn;
    p.edge=sign*(board?.46:.49)*load;
    p.pelvisX=sign*(board?.103:.145)*load;
    p.pelvisY-=.040*load;
    p.hipsRoll=-sign*(board?.24:.27)*load;
    p.chestRoll=sign*.065*load;
    p.hipsYaw=sign*(board?.07:.035)*load;
    p.chestYaw=-sign*.09*load;
    p.hipsPitch+=.08*load;
    p.rootYaw=sign*.12*Math.sin(Math.PI*u)*load;
    p.rootX=sign*.055*Math.sin(Math.PI*u)*load;
    p.handSpread+=.035*load;p.handY+=.015*load;
    if(board){
      // Toe/heel pressure is across the board width (+/-Z here). Both knees
      // share the edge; ski-style left/right loading would twist the bindings.
      p.pelvisX=0;p.pelvisZ=.013+sign*.130*load;p.pelvisY=.473-.008*load;
      p.rootX=0;p.rootZ=sign*.055*Math.sin(Math.PI*u)*load;
      p.hipsRoll=0;p.chestRoll=0;p.hipsYaw=0;p.chestYaw=-sign*.03*load;
      p.hipsPitch=lerp(.17,sign*.42,load);p.handZ+=sign*.08*load;
    }
  }else if(name==='crouch'){
    p.pelvisY= .360+.003*wave;p.pelvisZ=-.050;p.hipsPitch=.43;p.spinePitch=.20;p.chestPitch=.03;p.handY=.555;p.handZ=.245;p.handSpread=.20;p.headPitch=-.18;
  }else if(name==='accelerate'){
    const tuck=smooth((u-.12)/.65),push=window(u,0,.18,.30,.55);
    p.pelvisY=lerp(.473,.360,tuck)-.018*push;p.pelvisZ=lerp(.013,-.050,tuck);p.hipsPitch=lerp(.17,.43,tuck);p.spinePitch=lerp(.13,.20,tuck);p.handY=lerp(.72,.56,tuck)-.10*push;p.handZ=lerp(.205,.25,tuck)-.25*push;p.handSpread=lerp(.305,.205,tuck);p.headPitch=-.16;
  }else if(clip.category==='air'){
    const a=clamp((u-.23)/.54), flying=window(u,.23,.29,.68,.77),land=window(u,.75,.82,.86,1);
    p.airHeight=4*(name==='trick_backflip'?1.15:.86)*a*(1-a);
    p.pelvisY=curve(u,[[0,.473],[.15,.345],[.23,.478],[.40,.385],[.64,.385],[.77,.473],[.83,.325],[1,.473]]);
    p.pelvisZ=-.018*flying;p.hipsPitch=.17+.29*flying+.20*land;p.spinePitch=.13+.12*flying;p.handY=.72-.05*flying;p.handZ=.20+.04*flying;p.handSpread=.305+.03*flying;
    p.footLift=.10*flying;p.headPitch=-.13;
    if(name==='trick_180')p.rootYaw=Math.PI*smooth(a);
    if(name==='trick_360')p.rootYaw=TAU*smooth(a);
    if(name==='trick_shifty'){
      const shifty=Math.sin(TAU*a)*flying;
      p.equipmentYaw=.60*shifty;p.hipsYaw=-.18*shifty;p.chestYaw=-.26*shifty;p.handSpread=.36;
    }
    if(name==='trick_backflip'){
      p.rootPitch=-TAU*smooth(a);p.footLift=.15*flying;p.pelvisY-=.035*flying;p.hipsPitch=.38*flying+.17;p.handSpread=.24;p.handY=.65;
    }
    if(name==='trick_tail_grab'||name==='ramp_jump'){
      p.grab=window(u,.32,.43,.61,.70);
      p.footLift+=(board?.070:.045)*p.grab;p.pelvisX=(board?.010:.015)*p.grab;
      p.hipsRoll=(board?-.75:-.30)*p.grab;p.chestRoll=(board?-.15:-.10)*p.grab;
      p.hipsPitch=lerp(p.hipsPitch,board?.05:-.12,p.grab);
      p.spinePitch=lerp(p.spinePitch,board?0:.02,p.grab);
      p.pelvisY+=(board?.040:.010)*p.grab;
      if(!board)p.equipmentPitch=.52*p.grab;
    }
  }else if(name==='fall_roll'){
    const roll=curve(u,[[0,0],[.12,.16],[.27,1.25],[.47,4.15],[.70,6.95],[.88,Math.PI*2.5],[1,Math.PI*2.5]]);
    const f=smooth(u/.22);p.fall=f;p.rootRoll=board?0:roll;p.rootPitch=board?roll:.08*Math.sin(Math.PI*u);p.pelvisY=lerp(.473,.325,f);p.worldPelvisY=lerp(.473,.235,f);p.hipsPitch=lerp(.17,.30,f);p.spinePitch=lerp(.13,.22,f);p.footLift=.075*f;p.handY=lerp(.72,.67,f);p.handSpread=lerp(.305,.27,f);p.handZ=lerp(.205,.04,f);p.headPitch=-.03;
  }else if(name==='get_up'){
    const rise=smooth((u-.12)/.77),unroll=smooth((u-.12)/.52);p.fall=1-rise;p.recover=1-rise;p.rootRoll=board?0:Math.PI/2*(1-unroll);p.rootPitch=board?Math.PI/2*(1-unroll):0;p.pelvisY=lerp(.325,.473,rise);p.worldPelvisY=lerp(.235,.473,rise);p.hipsPitch=lerp(.30,.17,rise);p.spinePitch=lerp(.22,.13,rise);p.footLift=.075*(1-rise);p.handY=lerp(.67,.72,rise);p.handSpread=lerp(.27,.305,rise);p.handZ=lerp(.04,.205,rise);p.headPitch=lerp(-.03,-.10,rise);
  }else if(name==='celebrate'){
    p.celebrate=.85+.12*Math.sin(TAU*u);p.pelvisY=.473+.012*Math.sin(TAU*u*2);p.hipsRoll=.025*wave;p.spinePitch=.05;p.handSpread=.29;p.handY=1.21+.035*wave;p.handZ=.03;p.headPitch=-.08;
  }
  return p;
}

/** Target-bind adapter. The source GLB's bind transforms and inverse binds stay
 * unchanged. Limb segment lengths are never stretched to reach a goal.
 */
export function createMotionAnimator(scene,options){return new MotionAnimator(scene,options);}
export class MotionAnimator{
  constructor(scene,{sport='ski',rig,geometryFloor=true}={}){
    if(!rig?.joints)throw new Error('Canonical rig metadata required');
    if(rig.joints.length!==18||rig.joints.some((j,i)=>j.name!==BONE_NAMES[i]))throw new Error('Expected unchanged motion2 canonical18 joint order');
    this.scene=scene;this.sport=sport;this.rig=rig;this.geometryFloor=geometryFloor;this.nodes={};this.meshes=[];
    scene.traverse(o=>{if(o.name)this.nodes[o.name]=o;if(o.isSkinnedMesh){this.meshes.push(o);o.frustumCulled=false;}});
    for(const name of BONE_NAMES)if(!this.nodes[name])throw new Error(`Missing joint ${name}`);
    this.bones=Object.fromEntries(BONE_NAMES.map(n=>[n,this.nodes[n]]));
    this.bind=Object.fromEntries(rig.joints.map(j=>[j.name,{p:V(j.translation),q:Q(j.rotation),s:V(j.scale)}]));
    this.equipment=Object.fromEntries(['Snowboard','LeftPole','RightPole'].filter(n=>this.nodes[n]).map(n=>[n,{p:this.nodes[n].position.clone(),q:this.nodes[n].quaternion.clone(),s:this.nodes[n].scale.clone()}]));
    this.reset();
    const sceneInverse=scene.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.bindWorld=Object.fromEntries(BONE_NAMES.map(n=>[n,sceneInverse.clone().multiply(this.bones[n].getWorldQuaternion(new THREE.Quaternion()))]));
    this.bindPositions=Object.fromEntries(BONE_NAMES.map(n=>[n,scene.worldToLocal(this.bones[n].getWorldPosition(new THREE.Vector3()))]));
    this.footPoints={LeftFoot:[],RightFoot:[]};this.handPoints={LeftHand:[],RightHand:[]};this.bodyPoints=[];this.polePoints={};
    for(const mesh of this.meshes){
      const a=mesh.geometry.attributes;
      for(let i=0;i<a.position.count;i++){
        const point=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        let major=0,majorWeight=-1;
        for(let k=0;k<4;k++){const weight=a.skinWeight.getComponent(i,k);if(weight>majorWeight){majorWeight=weight;major=a.skinIndex.getComponent(i,k);}}
        const bone=mesh.skeleton.bones[major], local=bone.worldToLocal(point.clone());
        this.bodyPoints.push({bone,local});
        if(this.footPoints[bone.name]&&majorWeight>.55)this.footPoints[bone.name].push(local);
        if(this.handPoints[bone.name]&&majorWeight>.55)this.handPoints[bone.name].push(local);
      }
    }
    this.handPalms=Object.fromEntries(Object.entries(this.handPoints).map(([name,points])=>[name,points.length?points.reduce((a,v)=>a.add(v),new THREE.Vector3()).multiplyScalar(1/points.length):new THREE.Vector3(0,.025,0)]));
    this.soles={};this.restSole={};
    for(const name of ['LeftFoot','RightFoot']){
      const points=this.footPoints[name];if(!points.length)throw new Error(`No dominant foot vertices for ${name}`);
      const q=this.bindWorld[name],world=points.map(v=>v.clone().applyQuaternion(q).add(this.bindPositions[name]));
      const min=Math.min(...world.map(v=>v.y)),low=world.filter(v=>v.y<min+.0015);
      this.restSole[name]=low.reduce((a,v)=>a.add(v),new THREE.Vector3()).multiplyScalar(1/low.length);
      this.soles[name]=this.bones[name].worldToLocal(scene.localToWorld(this.restSole[name].clone()));
    }
    this.skiGrabLocal=this.bones.LeftFoot.worldToLocal(scene.localToWorld(new THREE.Vector3(this.restSole.LeftFoot.x+.022,this.restSole.LeftFoot.y+.018,-.305)));
    this.boardPoints=[];
    if(this.nodes.Snowboard)this.nodes.Snowboard.traverse(o=>{
      if(o.isMesh&&o.geometry?.attributes.position){const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++)this.boardPoints.push(this.nodes.Snowboard.worldToLocal(o.localToWorld(new THREE.Vector3().fromBufferAttribute(a,i))));}
    });
    for(const name of ['LeftPole','RightPole'])if(this.nodes[name]){
      const points=[];this.nodes[name].traverse(o=>{if(o.isMesh){const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++)points.push(this.nodes[name].worldToLocal(o.localToWorld(new THREE.Vector3().fromBufferAttribute(a,i))));}});this.polePoints[name]=points;
    }
    this.last={};
  }
  update(){this.scene.updateMatrixWorld(true);for(const mesh of this.meshes)mesh.skeleton.update();}
  reset(){
    for(const n of BONE_NAMES){const b=this.bones[n],v=this.bind[n];b.position.copy(v.p);b.quaternion.copy(v.q);b.scale.copy(v.s);}
    for(const [n,v]of Object.entries(this.equipment)){this.nodes[n].position.copy(v.p);this.nodes[n].quaternion.copy(v.q);this.nodes[n].scale.copy(v.s);}
    this.update();
  }
  worldQuaternion(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q).normalize());b.updateMatrixWorld(true);}
  worldPoint(local){return this.bones.Root.localToWorld(local.clone());}
  rootWorldQuaternion(){return this.bones.Root.getWorldQuaternion(new THREE.Quaternion());}
  /** Analytic two-bone IK, with an explicit anatomical bend plane. */
  solveLimb(upperName,lowerName,endName,goal,pole){
    const upper=this.bones[upperName],lower=this.bones[lowerName],end=this.bones[endName];
    const a=upper.getWorldPosition(new THREE.Vector3()),b=lower.getWorldPosition(new THREE.Vector3()),c=end.getWorldPosition(new THREE.Vector3());
    const l1=lower.position.length(),l2=end.position.length(),delta=goal.clone().sub(a),distance=delta.length(),direction=delta.normalize();
    const d=clamp(distance,Math.abs(l1-l2)+1e-6,l1+l2-1e-6);
    const bend=pole.clone().sub(a).addScaledVector(direction,-pole.clone().sub(a).dot(direction));
    if(bend.lengthSq()<1e-10)bend.set(0,0,1).addScaledVector(direction,-direction.z);bend.normalize();
    const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
    const knee=a.clone().addScaledVector(direction,along).addScaledVector(bend,height);
    const target=a.clone().addScaledVector(direction,d);
    const swing=new THREE.Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(),knee.clone().sub(a).normalize());
    this.worldQuaternion(upper,swing.multiply(upper.getWorldQuaternion(new THREE.Quaternion())));
    const nowB=lower.getWorldPosition(new THREE.Vector3()),nowC=end.getWorldPosition(new THREE.Vector3());
    const lowerSwing=new THREE.Quaternion().setFromUnitVectors(nowC.sub(nowB).normalize(),target.clone().sub(nowB).normalize());
    this.worldQuaternion(lower,lowerSwing.multiply(lower.getWorldQuaternion(new THREE.Quaternion())));
    return Math.max(0,distance-d);
  }
  apply(name,time,{wrap=true}={}){
    this.reset();const p=sampleParameters(name,time,this.sport,{wrap}),root=this.bones.Root,hips=this.bones.Hips;
    const rootQ=euler(p.rootPitch,p.rootYaw,p.rootRoll),pelvisLocal=new THREE.Vector3(p.pelvisX,p.pelvisY,p.pelvisZ);
    const pelvisWorld=new THREE.Vector3(p.pelvisX+p.rootX,(p.worldPelvisY??p.pelvisY)+p.airHeight,p.pelvisZ+p.rootZ);
    root.quaternion.copy(rootQ);root.position.copy(pelvisWorld.sub(pelvisLocal.clone().applyQuaternion(rootQ)));
    hips.position.copy(pelvisLocal);hips.quaternion.copy(this.bind.Hips.q).multiply(euler(p.hipsPitch,p.hipsYaw,p.hipsRoll));
    this.bones.Spine.quaternion.copy(this.bind.Spine.q).multiply(euler(p.spinePitch,0,0));
    this.bones.Chest.quaternion.copy(this.bind.Chest.q).multiply(euler(p.chestPitch,p.chestYaw,p.chestRoll));
    this.bones.Neck.quaternion.copy(this.bind.Neck.q).multiply(euler(p.headPitch*.45,0,0));
    this.bones.Head.quaternion.copy(this.bind.Head.q).multiply(euler(p.headPitch*.55,0,0));this.update();
    const rootWQ=this.rootWorldQuaternion(),board=this.sport==='snowboard';
    const equipmentQ=board?euler(p.edge,p.equipmentYaw,0):euler(p.equipmentPitch,p.equipmentYaw,-p.edge);
    let boardPosition=new THREE.Vector3(0,p.footLift,0),boardMin=Infinity;
    if(board&&this.nodes.Snowboard){
      const node=this.nodes.Snowboard,bind=this.equipment.Snowboard;
      node.quaternion.copy(equipmentQ).multiply(bind.q);
      for(const v of this.boardPoints)boardMin=Math.min(boardMin,v.clone().applyQuaternion(node.quaternion).y);
      const lift=Number.isFinite(boardMin)?Math.max(0,.004-boardMin):Math.abs(Math.sin(p.edge))*.105;
      boardPosition.copy(bind.p).add(new THREE.Vector3(0,p.footLift+lift,0));node.position.copy(boardPosition);this.update();
    }
    const footGoals={},footErrors={};
    for(const [side,sign]of [['Left',1],['Right',-1]]){
      const name=side+'Foot',foot=this.bones[name];
      const qLocal=equipmentQ.clone();
      if(board)qLocal.multiply(euler(0,sign*12*D,0));
      qLocal.multiply(this.bindWorld[name]);
      let sole=board?new THREE.Vector3(sign*p.stance,.020,this.restSole[name].z).applyQuaternion(equipmentQ).add(boardPosition):new THREE.Vector3(sign*p.stance,p.footLift,this.restSole[name].z);
      const ankle=sole.clone().sub(this.soles[name].clone().applyQuaternion(qLocal));
      if(!board){
        let min=Infinity;for(const v of this.footPoints[name])min=Math.min(min,v.clone().applyQuaternion(qLocal).y+ankle.y);
        ankle.y+=p.footLift-min;
      }
      const worldGoal=this.worldPoint(ankle),pole=this.worldPoint(new THREE.Vector3(sign*(p.stance+.035)+p.pelvisX*.30,p.pelvisY*.57,.26+p.pelvisZ));
      footErrors[name]=this.solveLimb(side+'UpLeg',side+'Leg',name,worldGoal,pole);
      this.worldQuaternion(foot,rootWQ.clone().multiply(qLocal));footGoals[name]=worldGoal;this.update();
    }
    let grabTarget=null;const armErrors={};
    const handSupport=board?(p.name==='fall_roll'?smooth((p.u-.78)/.10):p.name==='get_up'?1-smooth((p.u-.17)/.20):0):0;
    let torsoMinimum=Infinity;
    if(handSupport)for(const {bone,local}of this.bodyPoints)if(['Hips','Spine','Chest','Neck','Head'].includes(bone.name))torsoMinimum=Math.min(torsoMinimum,local.clone().applyMatrix4(bone.matrixWorld).y);
    for(const [side,sign]of [['Left',1],['Right',-1]]){
      const shoulder=this.bones[side+'Arm'].getWorldPosition(new THREE.Vector3());
      const shoulderLocal=this.bones.Root.worldToLocal(shoulder.clone());
      const follow=p.grab||(board&&p.name.startsWith('carve_')?1:0);
      let handLocal=new THREE.Vector3(sign*p.handSpread+shoulderLocal.x-sign*.1426,p.handY,p.handZ+sign*p.armPhase+follow*(shoulderLocal.z-.10));
      const handQ=rootWQ.clone().multiply(euler(.10*p.grab,0,sign*.08)).multiply(this.bindWorld[side+'Hand']);
      let goal=this.worldPoint(handLocal);
      if(p.grab&&side==='Left'){
        grabTarget=board?new THREE.Vector3(.425,.020,.090).applyQuaternion(equipmentQ).add(boardPosition):this.bones.Root.worldToLocal(this.bones.LeftFoot.localToWorld(this.skiGrabLocal.clone()));
        const targetWorld=this.worldPoint(grabTarget),palm=this.handPalms.LeftHand;
        const desiredDirection=targetWorld.clone().sub(shoulder).normalize();
        const direction=palm.clone().applyQuaternion(handQ).normalize();
        const gripQ=new THREE.Quaternion().setFromUnitVectors(direction,desiredDirection).multiply(handQ);
        handQ.slerp(gripQ,p.grab);
        // Target the glove palm, not the wrist bone, to meet the equipment edge.
        goal.lerp(targetWorld.sub(palm.clone().applyQuaternion(handQ)),p.grab);
      }
      if(p.grab&&side==='Right'){handLocal.add(new THREE.Vector3(-.03,.10*p.grab,-.10*p.grab));goal=this.worldPoint(handLocal);}
      if(handSupport){
        // Catch the end of the tumble on the palms, then release as the centre
        // of mass moves over the boots. A shared endpoint keeps fall/rise joined.
        const support=shoulder.clone().add(new THREE.Vector3(sign*.04,0,.04));
        support.y=torsoMinimum-.035;goal.lerp(support,handSupport);
      }
      const pole=this.worldPoint(new THREE.Vector3(sign*(p.handSpread+.09),p.handY+.025,.015));
      armErrors[side+'Hand']=this.solveLimb(side+'Arm',side+'ForeArm',side+'Hand',goal,pole);
      // Preserve calibrated hand twist and add a small wrist bend toward the grip.
      this.worldQuaternion(this.bones[side+'Hand'],handQ);this.update();
    }
    // Shafts remain attached to the palm; cant backward as their grips lower.
    for(const [side,sign]of [['Left',1],['Right',-1]])if(this.nodes[side+'Pole']){
      const pole=this.nodes[side+'Pole'],grip=pole.getWorldPosition(new THREE.Vector3());
      const down=clamp((grip.y-.035)/.75,.05,.88),lateral=sign*.12;
      const direction=new THREE.Vector3(lateral,-down,-Math.sqrt(Math.max(0,1-down*down-lateral*lateral))).normalize();
      if(!p.fall&&!p.recover)direction.applyQuaternion(rootWQ);
      const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0),direction);
      this.worldQuaternion(pole,q);
    }
    this.update();
    let floorLift=0;
    if(this.geometryFloor&&(p.fall>0||p.recover>0)){
      let min=Infinity;
      for(const {bone,local}of this.bodyPoints)min=Math.min(min,local.clone().applyMatrix4(bone.matrixWorld).y);
      for(const [n,points]of Object.entries(this.polePoints))for(const v of points)min=Math.min(min,v.clone().applyMatrix4(this.nodes[n].matrixWorld).y);
      if(this.nodes.Snowboard)for(const v of this.boardPoints)min=Math.min(min,v.clone().applyMatrix4(this.nodes.Snowboard.matrixWorld).y);
      floorLift=Math.max(0,.004-min);root.position.y+=floorLift;this.update();
    }
    this.last={parameters:p,footGoals,footErrors,armErrors,grabTarget:grabTarget?this.worldPoint(grabTarget):null,floorLift};
    return this.snapshot();
  }
  snapshot(){
    const jointPositions=Object.fromEntries(BONE_NAMES.map(n=>[n,this.bones[n].getWorldPosition(new THREE.Vector3()).toArray()]));
    const kneeFlex={};for(const side of ['Left','Right']){
      const a=V(jointPositions[side+'UpLeg']),b=V(jointPositions[side+'Leg']),c=V(jointPositions[side+'Foot']);
      kneeFlex[side]=180-a.sub(b).angleTo(c.sub(b))/D;
    }
    const feetMinimumY={};for(const n of ['LeftFoot','RightFoot']){let min=Infinity;for(const v of this.footPoints[n])min=Math.min(min,v.clone().applyMatrix4(this.bones[n].matrixWorld).y);feetMinimumY[n]=min;}
    let boardMinimumY=null;if(this.nodes.Snowboard){boardMinimumY=Infinity;for(const v of this.boardPoints)boardMinimumY=Math.min(boardMinimumY,v.clone().applyMatrix4(this.nodes.Snowboard.matrixWorld).y);}
    const torso=V(jointPositions.Neck).sub(V(jointPositions.Hips));
    const hand=this.bones.LeftHand.localToWorld(this.handPalms.LeftHand.clone());
    return {jointPositions,kneeFlexDegrees:kneeFlex,feetMinimumY,boardMinimumY,torsoInclinationDegrees:torso.angleTo(new THREE.Vector3(0,1,0))/D,
      grabErrorMeters:this.last.grabTarget?hand.distanceTo(this.last.grabTarget):null,footReachErrorMeters:{...this.last.footErrors},armReachErrorMeters:{...this.last.armErrors},floorLiftMeters:this.last.floorLift??0,
      edgeDegrees:(this.last.parameters?.edge??0)/D,parameters:this.last.parameters};
  }
  dispose(){this.reset();}
}
