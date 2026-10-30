import * as THREE from '../../vendor/three.module.js';

const V = a => new THREE.Vector3().fromArray(a);
const Q = a => new THREE.Quaternion().fromArray(a).normalize();
const incomingBindEvidence = new WeakMap();

/** Source world rotation times a calibrated target basis, then parent inverse.
 * Segment translations/scales stay at target bind values. Root and Hips carry
 * the scaled positional channels and measured contact/floor corrections.
 * Contact IK is evaluated in world space AFTER retargeting and pose blending.
 */
export class Retargeter {
  constructor(scene, rig, skeleton, map) {
    this.scene = scene;
    this.rig = rig;
    this.source = skeleton.bones;
    this.map = map;
    this.bones = {};
    this.meshes = [];
    scene.traverse(o => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) { this.meshes.push(o); o.frustumCulled = false; }
    });
    this.scale = map.motionScale;
    this.bind = Object.fromEntries(rig.joints.map(j => [j.name, {p:V(j.translation),q:Q(j.rotation),s:V(j.scale)}]));
    // Compare incoming GLB values BEFORE resetting or applying any animation.
    this.bindProof=this.validateBind();
    // Changing the motion package may rebuild this adapter after a pose reset.
    // Keep the first untouched GLB's evidence instead of re-proving our reset.
    if(!incomingBindEvidence.has(scene)) incomingBindEvidence.set(scene,{...this.bindProof});
    const original=incomingBindEvidence.get(scene);
    for(const key of ['bindMaxTranslationErrorMeters','bindMaxRotationErrorRadians','bindMaxScaleError','inverseBindMaxError','bindMaxQuaternionNormError']) this.bindProof[key]=original[key];
    this.bindProof.bindEvidence='first incoming GLB values, before any reset or animation';
    if(!this.bindProof.mappingComplete || this.bindProof.calibrationMaxDirectionErrorRadians>1e-6 ||
       this.bindProof.calibrationMaxBasisErrorRadians>1e-6 || this.bindProof.motionScaleError>1e-9)
      throw Error('Incomplete or geometrically inconsistent retarget map');
    this.resetBind();
    const inverseScene=scene.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.bindWorld = Object.fromEntries(rig.joints.map(j => [j.name,inverseScene.clone().multiply(this.bones[j.name].getWorldQuaternion(new THREE.Quaternion()))]));
    this.sole = {};
    this.footVertices = {};
    for (const name of ['LeftFoot','RightFoot']) {
      const points = [];
      this.footVertices[name]=[];
      for (const mesh of this.meshes) {
        const index = mesh.skeleton.bones.findIndex(b => b.name === name);
        const a = mesh.geometry.attributes;
        for(let i=0;i<a.position.count;i++) {
          let w = 0;
          for(let k=0;k<4;k++) if(a.skinIndex.getComponent(i,k)===index) w+=a.skinWeight.getComponent(i,k);
          if(w>.5) {
            points.push(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
            this.footVertices[name].push({mesh,index:i});
          }
        }
      }
      if(!points.length) throw Error(`No foot geometry for ${name}`);
      const minY = Math.min(...points.map(p=>p.y));
      const low = points.filter(p=>p.y<=minY+.001);
      const centroid = low.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(1/low.length);
      this.sole[name] = this.bones[name].worldToLocal(centroid);
    }
    this.lastFloorCorrection=0;
    this.lastContacts=[];
    this.bindProof.soleLocalMeters=Object.fromEntries(Object.entries(this.sole).map(([k,v])=>[k,v.toArray()]));
  }

  resetBind() {
    for(const j of this.rig.joints) {
      const b=this.bones[j.name];
      if(!b) throw Error(`Target missing ${j.name}`);
      b.position.fromArray(j.translation); b.quaternion.fromArray(j.rotation); b.scale.fromArray(j.scale);
    }
    this.update();
  }

  update() {
    this.cachedSnapshot=null;this.cachedGeometry=null;
    this.scene.updateMatrixWorld(true);
    for(const mesh of this.meshes) mesh.skeleton.update();
  }

  validateBind() {
    let translation=0,rotation=0,inverse=0,scaleError=0,normError=0;
    for(const j of this.rig.joints) {
      const b=this.bones[j.name];
      translation=Math.max(translation,b.position.distanceTo(V(j.translation)));
      normError=Math.max(normError,Math.abs(b.quaternion.length()-1));
      rotation=Math.max(rotation,b.quaternion.clone().normalize().angleTo(Q(j.rotation)));
      scaleError=Math.max(scaleError,b.scale.distanceTo(V(j.scale)));
      const expected=new THREE.Matrix4().fromArray(j.inverseBindMatrix);
      for(const mesh of this.meshes) {
        const i=mesh.skeleton.bones.indexOf(b);
        if(i>=0) inverse=Math.max(inverse,...mesh.skeleton.boneInverses[i].elements.map((v,k)=>Math.abs(v-expected.elements[k])));
      }
    }
    let directionError=0,basisError=0;
    const byTarget=Object.fromEntries(this.rig.joints.map(j=>[j.name,j]));
    const bySource=Object.fromEntries(this.source.map(j=>[j.name,j]));
    // Recompute calibration from the two independent skeleton contracts rather
    // than trusting the map's own claimed residual or its calibrationChild field.
    const children={Hips:'Spine',Spine:'Chest',Chest:'Neck',Neck:'Head',LeftArm:'LeftForeArm',LeftForeArm:'LeftHand',RightArm:'RightForeArm',RightForeArm:'RightHand',LeftUpLeg:'LeftLeg',LeftLeg:'LeftFoot',RightUpLeg:'RightLeg',RightLeg:'RightFoot'};
    const bindWorld={},bindPositions={},correction={},expectedBasis={};
    for(const j of this.rig.joints) {
      const parent=j.parent?bindWorld[j.parent]:new THREE.Quaternion();
      bindWorld[j.name]=parent.clone().multiply(Q(j.rotation));
      bindPositions[j.name]=V(j.translation).applyQuaternion(parent).add(j.parent?bindPositions[j.parent]:new THREE.Vector3());
      const c=children[j.name];
      correction[j.name]=c?new THREE.Quaternion().setFromUnitVectors(bindPositions[j.name].clone().add(V(byTarget[c].translation).applyQuaternion(bindWorld[j.name])).sub(bindPositions[j.name]).normalize(),V(bySource[c].restTranslationMeters).normalize()):j.name.endsWith('Hand')?correction[j.parent].clone():new THREE.Quaternion();
      expectedBasis[j.name]=correction[j.name].clone().multiply(bindWorld[j.name]);
    }
    let policyValid=true;
    for(const entry of this.map.bones) {
      const known=byTarget[entry.target];
      const expectedSource=bySource[entry.target]?entry.target:null;
      if(!known || entry.source!==expectedSource || entry.targetParent!==known.parent ||
        (expectedSource===null && (entry.inheritSource!=='Chest'||!['LeftShoulder','RightShoulder'].includes(entry.target)))) policyValid=false;
      if(!expectedBasis[entry.target] || !Array.isArray(entry.targetBasisWorldQuaternion)||entry.targetBasisWorldQuaternion.length!==4||entry.targetBasisWorldQuaternion.some(v=>!Number.isFinite(v))) {basisError=Infinity;continue;}
      basisError=Math.max(basisError,Q(entry.targetBasisWorldQuaternion).angleTo(expectedBasis[entry.target]));
      const c=children[entry.target];
      if(c) {
        const target=V(byTarget[c].translation).applyQuaternion(Q(entry.targetBasisWorldQuaternion)).normalize();
        directionError=Math.max(directionError,target.angleTo(V(bySource[c].restTranslationMeters).normalize()));
      }
    }
    const targetLeg=side=>V(byTarget[`${side}Leg`].translation).length()+V(byTarget[`${side}Foot`].translation).length();
    const sourceLeg=side=>V(bySource[`${side}Leg`].restTranslationMeters).length()+V(bySource[`${side}Foot`].restTranslationMeters).length();
    const expectedScale=(targetLeg('Left')+targetLeg('Right'))/(sourceLeg('Left')+sourceLeg('Right'));
    const targets=this.map.bones.map(b=>b.target),sources=this.map.bones.filter(b=>b.source!==null).map(b=>b.source);
    return {sourceBoneCount:this.source.length,targetBoneCount:Object.keys(this.bones).length,
      mappedBoneCount:this.map.bones.filter(b=>b.source!==null).length,
      extraBones:this.map.bones.filter(b=>b.source===null).map(b=>b.target),
      bindMaxTranslationErrorMeters:translation,bindMaxRotationErrorRadians:rotation,bindMaxScaleError:scaleError,inverseBindMaxError:inverse,bindMaxQuaternionNormError:normError,
      calibrationMaxDirectionErrorRadians:directionError,calibrationMaxBasisErrorRadians:basisError,motionScale:this.scale,motionScaleError:Math.abs(this.scale-expectedScale),
      mappingComplete:this.source.every(b=>sources.includes(b.name))&&this.rig.joints.every(j=>targets.includes(j.name))&&
        new Set(sources).size===sources.length&&new Set(targets).size===targets.length&&sources.length===this.source.length&&targets.length===this.rig.joints.length&&policyValid};
  }

  proof() {return this.bindProof;}

  setWorldQuaternion(b,q) {
    const parent=b.parent.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.copy(parent.invert().multiply(q));
    b.updateMatrixWorld(true);
  }

  solePoint(name) {return this.bones[name].localToWorld(this.sole[name].clone());}

  footGoal(name,anchor,weight,{flatten=true,orientation=null}={}) {
    const goal=this.solePoint(name).lerp(anchor,weight);
    const footWorld=orientation?orientation.clone():this.bones[name].getWorldQuaternion(new THREE.Quaternion());
    if(flatten) footWorld.slerp(this.scene.getWorldQuaternion(new THREE.Quaternion()).multiply(this.bindWorld[name]),weight);
    return {sole:goal,orientation:footWorld,ankle:goal.clone().sub(this.sole[name].clone().applyQuaternion(footWorld))};
  }

  /** Analytic two-segment leg, knee pole inherited from the displayed pose. */
  solveFoot(name, anchor, weight, {flatten=true,orientation=null}={}) {
    const side=name.startsWith('Left')?'Left':'Right';
    const upper=this.bones[`${side}UpLeg`], lower=this.bones[`${side}Leg`], foot=this.bones[name];
    const goal=this.footGoal(name,anchor,weight,{flatten,orientation});
    const footWorld=goal.orientation,ankle=goal.ankle;
    const hip=upper.getWorldPosition(new THREE.Vector3());
    const knee=lower.getWorldPosition(new THREE.Vector3());
    const l1=lower.position.length(),l2=foot.position.length();
    const direction=ankle.clone().sub(hip);
    const distance=direction.length(); direction.normalize();
    const d=THREE.MathUtils.clamp(distance,Math.abs(l1-l2)+1e-7,l1+l2-1e-7);
    let pole=knee.clone().sub(hip).addScaledVector(direction,-knee.clone().sub(hip).dot(direction));
    if(pole.lengthSq()<1e-10) pole.set(0,0,1).addScaledVector(direction,-direction.z);
    pole.normalize();
    const along=(l1*l1-l2*l2+d*d)/(2*d);
    const newKnee=hip.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
    const qUpper=upper.getWorldQuaternion(new THREE.Quaternion());
    const swing=new THREE.Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(),newKnee.clone().sub(hip).normalize());
    this.setWorldQuaternion(upper,swing.multiply(qUpper));
    const currentAnkle=foot.getWorldPosition(new THREE.Vector3());
    const currentKnee=lower.getWorldPosition(new THREE.Vector3());
    const qLower=lower.getWorldQuaternion(new THREE.Quaternion());
    const reachable=hip.clone().addScaledVector(direction,d);
    const lowerSwing=new THREE.Quaternion().setFromUnitVectors(currentAnkle.sub(currentKnee).normalize(),reachable.sub(currentKnee).normalize());
    this.setWorldQuaternion(lower,lowerSwing.multiply(qLower));
    this.setWorldQuaternion(foot,footWorld);
  }

  minVertexY() {
    if(this.cachedGeometry)return this.cachedGeometry;
    let minY=Infinity,count=0;
    for(const mesh of this.meshes) {
      const p=new THREE.Vector3();
      for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
        mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);
        minY=Math.min(minY,p.y); count++;
      }
    }
    return this.cachedGeometry={minY,vertexCount:count};
  }

  footMinY(name) {
    let min=Infinity;const p=new THREE.Vector3();
    for(const {mesh,index} of this.footVertices[name]) min=Math.min(min,mesh.getVertexPosition(index,p).applyMatrix4(mesh.matrixWorld).y);
    return min;
  }

  apply(pose,{referenceRoot=pose.referenceRootTranslationMeters||[0,0,0],contacts=[],floor=true}={}) {
    const sourceWorld={};
    for(const b of this.source) sourceWorld[b.name]=(b.parent?sourceWorld[b.parent].clone():new THREE.Quaternion()).multiply(Q(pose.rotations[b.name]));
    for(const j of this.rig.joints) {
      this.bones[j.name].position.copy(this.bind[j.name].p);
      this.bones[j.name].scale.copy(this.bind[j.name].s);
    }
    const root=this.bones.Root;
    root.position.addScaledVector(V(referenceRoot),this.scale);
    this.bones.Hips.position.addScaledVector(V(pose.hipsOffsetMeters||[0,0,0]),this.scale);
    this.update();
    const characterWorld=this.scene.getWorldQuaternion(new THREE.Quaternion());
    for(const entry of this.map.bones) {
      const bone=this.bones[entry.target];
      const source=sourceWorld[entry.source||entry.inheritSource];
      const desired=characterWorld.clone().multiply(source).multiply(Q(entry.targetBasisWorldQuaternion));
      this.setWorldQuaternion(bone,desired);
    }
    this.update();
    this.lastContacts=contacts.map(c=>({...c,weight:c.weight??1,horizontalWeight:c.horizontalWeight??(c.mode==='ski-slide'?0:1),anchor:c.worldAnchorMeters?V(c.worldAnchorMeters):this.scene.localToWorld(V(c.anchorMeters).multiplyScalar(this.scale))}));
    const goals=[];
    for(const c of this.lastContacts) {
      if(!this.sole[c.bone]) continue;
      let anchor=c.anchor.clone();
      const current=this.solePoint(c.bone),h=c.horizontalWeight;
      anchor.x=current.x+(anchor.x-current.x)*h;anchor.z=current.z+(anchor.z-current.z)*h;
      goals.push({bone:c.bone,weight:c.weight,unlocked:new THREE.Vector3(1-c.weight*h,1-c.weight,1-c.weight*h),...this.footGoal(c.bone,anchor,c.weight)});
    }
    // Projection onto ankle reach spheres moves the pelvis minimally instead
    // of stretching bones or silently leaving a supporting foot off its anchor.
    // The unlocked fraction follows pelvis displacement. Thus a zero-weight
    // goal stays at its original reachable pose relative to the pelvis and
    // exerts no ghost constraint when it is removed at the end of a fade.
    const pelvisShift=new THREE.Vector3();
    for(let iteration=0;iteration<6;iteration++) for(const goal of goals) {
      const side=goal.bone.startsWith('Left')?'Left':'Right';
      const hip=this.bones[`${side}UpLeg`].getWorldPosition(new THREE.Vector3());
      const delta=goal.ankle.clone().add(pelvisShift.clone().multiply(goal.unlocked)).sub(hip),distance=delta.length();
      const reach=this.bones[`${side}Leg`].position.length()+this.bones[goal.bone].position.length()-1e-6;
      if(distance>reach) {
        delta.multiplyScalar((distance-reach)/distance);
        const hips=this.bones.Hips;
        hips.position.copy(hips.parent.worldToLocal(hips.getWorldPosition(new THREE.Vector3()).add(delta)));
        pelvisShift.add(delta);this.update();
      }
    }
    this.lastPelvisCorrection=pelvisShift.toArray();
    for(const goal of goals) {
      this.solveFoot(goal.bone,goal.sole.clone().add(pelvisShift.clone().multiply(goal.unlocked)),1,{flatten:false,orientation:goal.orientation});
    }
    this.update();
    // A released/swing foot can dip below ground during a blend. Correct that
    // limb locally before considering a whole-body lift, so the planted other
    // foot retains its measured world anchor. Preserve the swing foot's actual
    // orientation: max(0,-penetration) reaches zero continuously at first touch.
    this.lastSwingCorrections={LeftFoot:0,RightFoot:0};
    if(floor) for(let iteration=0;iteration<2;iteration++) for(const name of Object.keys(this.sole)) {
      const correction=Math.max(0,-this.footMinY(name));
      if(correction>1e-8) {
        const goal=this.solePoint(name);goal.y+=correction;
        this.solveFoot(name,goal,1,{flatten:false});this.update();
        this.lastSwingCorrections[name]+=correction;
      }
    }
    const before=this.minVertexY();
    this.lastFloorCorrection=floor?Math.max(0,-before.minY):0;
    if(this.lastFloorCorrection>0) {
      // This is a real rendered root correction, included in measured residuals.
      const delta=new THREE.Vector3(0,this.lastFloorCorrection,0);
      const local=root.parent.worldToLocal(root.getWorldPosition(new THREE.Vector3()).add(delta));
      root.position.copy(local); this.update();
    }
    return this.snapshot();
  }

  snapshot() {
    if(this.cachedSnapshot)return this.cachedSnapshot;
    const geometry=this.minVertexY();
    const feet=Object.fromEntries(Object.keys(this.sole).map(name=>[name,this.solePoint(name).toArray()]));
    let supportError=0;
    for(const c of this.lastContacts) if(c.weight>=.999&&feet[c.bone]) {
      const p=V(feet[c.bone]);
      supportError=Math.max(supportError,c.horizontalWeight>=.999?p.distanceTo(c.anchor):Math.abs(p.y-c.anchor.y));
    }
    return this.cachedSnapshot={bones:Object.fromEntries(Object.entries(this.bones).map(([name,b])=>[name,b.getWorldPosition(new THREE.Vector3()).toArray()])),
      rotations:Object.fromEntries(Object.entries(this.bones).map(([name,b])=>[name,b.getWorldQuaternion(new THREE.Quaternion()).toArray()])),
      feet,...geometry,floorCorrectionMeters:this.lastFloorCorrection,swingFloorCorrectionMeters:this.lastSwingCorrections,pelvisCorrectionMeters:this.lastPelvisCorrection,maxSupportErrorMeters:supportError};
  }
}
