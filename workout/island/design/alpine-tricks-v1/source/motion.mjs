// SPDX-License-Identifier: CC0-1.0
// Calibrated IK adapted from alpine-v7/motion/motion.mjs; source remains untouched.
import * as THREE from '../../../vendor/three.module.js';
import {sampleParameters, BONE_NAMES} from './poses.mjs';
const D=Math.PI/180;
const V=a=>new THREE.Vector3().fromArray(a), Q=a=>new THREE.Quaternion().fromArray(a).normalize();
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=x=>(x=clamp(x))*x*(3-2*x);
const euler=(x=0,y=0,z=0)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z,'YXZ'));
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
  apply(name,time,{wrap=true,heading=0}={}){
    const p=sampleParameters(name,time,this.sport,{wrap});p.rootYaw+=heading;return this.applyParameters(p);
  }
  applyParameters(p){
    this.reset();const root=this.bones.Root,hips=this.bones.Hips;
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
    const footGoals={},footErrors={},footQuaternions={};
    for(const [side,sign]of [['Left',1],['Right',-1]]){
      const name=side+'Foot',foot=this.bones[name];
      const qLocal=equipmentQ.clone().multiply(euler(0,sign*(p.brakeYaw??0),0));
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
      this.worldQuaternion(foot,rootWQ.clone().multiply(qLocal));footGoals[name]=worldGoal;footQuaternions[name]=rootWQ.clone().multiply(qLocal);this.update();
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
      const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0),direction);
      if(!p.fall&&!p.recover)q.premultiply(rootWQ);
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
    this.last={parameters:p,footGoals,footQuaternions,footErrors,armErrors,grabTarget:grabTarget?this.worldPoint(grabTarget):null,floorLift};
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
