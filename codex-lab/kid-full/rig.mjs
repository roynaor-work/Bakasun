import * as T from './vendor/three.module.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { buildKidBody } from './parts/body.mjs';
import { buildHead } from './parts/head.mjs';
import { createHand, createHandSkinFields } from './parts/hand.mjs';
import { createShoe } from './parts/shoe.mjs';
import { bakeStudio } from './studio-bake.mjs';
import { transformGeometry,nameMorphs } from './geometry-morphs.mjs';
import { EXPRESSION_IDS,applyExpression,blendExpression,setExpressionWeights,getExpressionWeights as expressionWeights } from './parts/expressions.mjs';
export { applyExpression,blendExpression,setExpressionWeights,expressionWeights };
export const POSE_EXPRESSIONS={stand:'neutral',run:'effort',runOpposite:'effort',kick:'victory'};

const smooth=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);
export const DETAILS=['dense','balanced','mobile'];
export const BODY_Y_SCALE=.93;
export const POSES={
 stand:{},
 run:{Spine:[-.10,0,0],Chest:[0,-.12,0],Head:[.08,.10,0],
  UpperLeg_L:[.52,0,0],LowerLeg_L:[.85,0,0],Foot_L:[-.22,0,0],
  UpperLeg_R:[-.78,0,0],LowerLeg_R:[1.25,0,0],Foot_R:[-.38,0,0],
  UpperArm_L:[-.72,0,-.10],LowerArm_L:[-1.05,0,0],
  UpperArm_R:[.60,0,.10],LowerArm_R:[-.95,0,0]},
 kick:{Spine:[.06,0,0],Chest:[-.10,-.12,0],Head:[.07,.12,0],
  UpperLeg_L:[.10,0,0],LowerLeg_L:[.16,0,0],Foot_L:[-.15,0,0],
  UpperLeg_R:[-1.15,0,0],LowerLeg_R:[.22,0,0],Foot_R:[.16,0,0],
  UpperArm_L:[-.65,0,-.25],LowerArm_L:[-.65,0,0],
  UpperArm_R:[.55,0,.26],LowerArm_R:[-.45,0,0]},
};

function skeleton(root){
 const bones=[],byName={},rest={};
 const add=(name,parent,p)=>{
  const b=new T.Bone();b.name=name;byName[name]=b;rest[name]=new T.Vector3(p[0],p[1]*BODY_Y_SCALE,p[2]);
  if(parent){byName[parent].add(b);b.position.copy(rest[name]).sub(rest[parent]);}
  else {root.add(b);b.position.copy(rest[name]);}bones.push(b);return b;
 };
 add('Hips',null,[0,.88,0]);add('Spine','Hips',[0,1.04,0]);
 add('Chest','Spine',[0,1.36,0]);add('Neck','Chest',[0,1.53,0]);add('Head','Neck',[0,1.64,0]);
 for(const [side,s] of [['L',-1],['R',1]]){
  add('Shoulder_'+side,'Chest',[s*.225,1.40,0]);
  add('UpperArm_'+side,'Shoulder_'+side,[s*.29,1.37,0]);
  add('LowerArm_'+side,'UpperArm_'+side,[s*.423,1.07,0]);
  add('Hand_'+side,'LowerArm_'+side,[s*.4712,.84,.010]);
  // Exact digit pivots are supplied by each centered, mirrored source hand.
  for(let i=0;i<5;i++) add(`Finger${i}_${side}`,'Hand_'+side,[s*.4712,.84,.010]);
  add('UpperLeg_'+side,'Hips',[s*.165,.83,0]);
  add('LowerLeg_'+side,'UpperLeg_'+side,[s*.181,.52,.001]);
  add('Foot_'+side,'LowerLeg_'+side,[s*.198,.10,-.008]);
  add('Toe_'+side,'Foot_'+side,[s*.198,.01,.235]);
 }
 root.updateMatrixWorld(true);return {skeleton:new T.Skeleton(bones),bones,byName,rest};
}

export function buildCharacter({detail='mobile',experiment='final'}={}){
 const start=performance.now(),root=new T.Group();root.name='Kid';
 const rig=skeleton(root),groups=new Map(),sourceParts={},groundProbes=[],rigidHead=[],rigidShoes=new Map();
 const ix=n=>rig.bones.indexOf(rig.byName[n]);
 // Each vertex carries at most four normalized influences. Garment and skin
 // share weight equations; smoothstep has zero slope at either boundary.
 const torso=(y)=>y<1.08?[[ix('Hips'),1-smooth(.87,1.08,y)],[ix('Spine'),smooth(.87,1.08,y)]]
  :[[ix('Spine'),1-smooth(1.13,1.38,y)],[ix('Chest'),smooth(1.13,1.38,y)]];
 function weights(name,p,category){
  p=p.clone();p.y/=BODY_Y_SCALE;
  const side=name.includes('left')?'L':'R';
  if(category==='head')return [[ix('Head'),1]];
  if(category==='shoe')return [[ix('Foot_'+side),1]];
  if(category==='hand')return [[ix('Hand_'+side),1]]; // Exact local digit fields are remapped in collect.
  if(name==='neck'){
   const t=smooth(1.49,1.63,p.y),head=smooth(1.55,1.60,p.y);
   return [[ix('Chest'),(1-t)*(1-head)],[ix('Neck'),t*(1-head)],[ix('Head'),head]];
  }
  if(name==='jersey-unified'||name.startsWith('sleeve-cuff')){
   const side=p.x<0?'L':'R',arm=smooth(.22,.36,Math.abs(p.x));
   const elbow=smooth(1.01,1.14,p.y),shoulder=smooth(1.28,1.47,p.y);
   const contributions=new Map(torso(p.y).map(([joint,weight])=>[joint,weight*(1-arm)]));
   for(const [joint,weight]of [[ix('LowerArm_'+side),1-elbow],[ix('UpperArm_'+side),elbow*(1-shoulder)],[ix('Chest'),elbow*shoulder]])contributions.set(joint,(contributions.get(joint)||0)+weight*arm);
   return [...contributions].sort((a,b)=>b[1]-a[1]).slice(0,4);
  }
  if(/arm|wrist|sleeve/.test(name)){
   const elbow=smooth(1.01,1.14,p.y),shoulder=smooth(1.28,1.47,p.y);
   return [[ix('LowerArm_'+side),1-elbow],[ix('UpperArm_'+side),elbow*(1-shoulder)],[ix('Chest'),elbow*shoulder]];
  }
  if(/shorts|leg-|sock|ankle/.test(name)){
   const hip=smooth(.72,.90,p.y),knee=smooth(.46,.60,p.y),ankle=1-smooth(.10,.22,p.y);
   return [[ix('Hips'),hip],[ix('UpperLeg_'+side),(1-hip)*knee],
    [ix('LowerLeg_'+side),(1-hip)*(1-knee)*(1-ankle)],[ix('Foot_'+side),(1-hip)*(1-knee)*ankle]];
  }
  return torso(p.y);
 }
 function collect(part,category,handBinding=null){
  part.updateMatrixWorld(true);
  const objects=[];part.traverse(m=>{if(m.isMesh)objects.push(m);});
  for(const mesh of objects){
   if(mesh.name==='torso')continue; // hidden under the closed shirt
   const original=transformGeometry(mesh.geometry.clone(),mesh.matrixWorld),pos=original.attributes.position;
   if(category==='shoe'){
    const bone=rig.byName['Foot_'+(mesh.name.includes('left')?'L':'R')],local=[];
    for(let direction=0;direction<32;direction++){
     const a=direction/32*Math.PI*2,n=new T.Vector3(0,Math.cos(a),Math.sin(a));let best=-Infinity,v=new T.Vector3();
     for(let j=0;j<pos.count;j++){const p=new T.Vector3().fromBufferAttribute(pos,j),d=p.dot(n);if(d>best){best=d;v.copy(p);}}
     local.push(v.sub(rig.rest[bone.name]).toArray());
    }
    groundProbes.push({bone:bone.name,points:local});
   }
   // Mirroring the right source hand reverses triangle winding; preserve its
   // outward normals and one continuous, closed surface after the bake.
   if(category==='hand'&&mesh.matrixWorld.determinant()<0){
    const index=original.index.array;for(let j=0;j<index.length;j+=3)[index[j+1],index[j+2]]=[index[j+2],index[j+1]];
   }
   const skinIndex=[],skinWeight=[];
   for(let j=0;j<pos.count;j++){
    const p=new T.Vector3().fromBufferAttribute(pos,j);
    let w=handBinding?Array.from({length:4},(_,slot)=>[
     handBinding.joints[handBinding.fields.indices[j*4+slot]],handBinding.fields.weights[j*4+slot]
    ]):weights(mesh.name,p,category);
    if(handBinding){
     const forearm=smooth(.81,.88,p.y/BODY_Y_SCALE);
     w=w.map(([joint,weight])=>[joint,weight*(1-forearm)]);
     w.push([handBinding.forearm,forearm]);
     w.sort((a,b)=>b[1]-a[1]);w=w.slice(0,4);
    }
    if(experiment==='rigid') w=[[w.reduce((a,b)=>a[1]>b[1]?a:b)[0],1]];
    const total=w.reduce((a,b)=>a+b[1],0);while(w.length<4)w.push([0,0]);
    skinIndex.push(...w.map(v=>v[1]>0?v[0]:0));skinWeight.push(...w.map(v=>v[1]/total));
   }
   original.setAttribute('skinIndex',new T.Uint16BufferAttribute(skinIndex,4));
   original.setAttribute('skinWeight',new T.Float32BufferAttribute(skinWeight,4));
   if(!original.attributes.uv) original.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(pos.count*2),2));
   const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   const slices=Array.isArray(mesh.material)?original.groups:[{start:0,count:original.index?.count??pos.count,materialIndex:0}];
   for(const slice of slices){
    const g=original.clone();if(original.index)g.setIndex(Array.from(original.index.array.slice(slice.start,slice.start+slice.count)));g.clearGroups();
    const sourceMat=mats[slice.materialIndex];
    const mat=experiment==='pbr'?sourceMat:bakeStudio(g,sourceMat);
    if(experiment!=='pbr'){
     const normals=g.attributes.normal;
     for(let i=0;i<normals.count;i++){
      const n=new T.Vector3().fromBufferAttribute(normals,i);if(n.lengthSq()<1e-12)n.set(0,1,0);else n.normalize();
      normals.setXYZ(i,n.x,n.y,n.z);
     }
    }
    if(experiment!=='pbr')mat.side=experiment==='doubleSide'?T.DoubleSide:T.FrontSide;
    // The head never deforms within its own surface. A direct bone attachment
    // gives the identical rigid pose without four skin-matrix fetches per
    // vertex in the phone shader. The neck still blends into that head bone.
    if(category==='head'&&detail==='mobile'&&experiment!=='pbr'){
     g.deleteAttribute('skinIndex');g.deleteAttribute('skinWeight');rigidHead.push({geometry:g,material:mat});continue;
    }
    // Every shoe vertex has exactly one Foot influence. A standard rigid
    // bone child preserves that transform and exports without skin fetches.
    if(category==='shoe'&&detail==='mobile'&&experiment!=='pbr'){
     const bone='Foot_'+(mesh.name.includes('left')?'L':'R');
     g.deleteAttribute('skinIndex');g.deleteAttribute('skinWeight');
     if(!rigidShoes.has(bone))rigidShoes.set(bone,[]);
     rigidShoes.get(bone).push({geometry:g,material:mat});continue;
    }
    const key=JSON.stringify([mat.color.getHex(),mat.roughness,mat.metalness,mat.map?.uuid,mat.side,mat.transparent,mat.alphaTest,!!g.morphAttributes.position?.length]);
    if(!groups.has(key))groups.set(key,{material:mat,geometries:[],parts:[]});
    groups.get(key).geometries.push(g);groups.get(key).parts.push(mesh.name);
   } original.dispose();
  }
 }
 const body=buildKidBody({detail});body.group.scale.y=BODY_Y_SCALE;sourceParts.body=body.stats.triangles;collect(body.group,'body');
 const head=buildHead({detail});applyExpression(head,'neutral');const headBox=new T.Box3().setFromObject(head,true),height=headBox.max.y-headBox.min.y;
 const headScale=1/height;head.scale.setScalar(headScale);
 head.position.set(0,1.60*BODY_Y_SCALE-headBox.min.y*headScale,.025);sourceParts.head=head.userData.stats?.triangles;collect(head,'head');
 for(const [label,s] of [['left',-1],['right',1]]){
  const hand=createHand('open',{detail}),pivot=new T.Vector3(...hand.userData.wristPivot);
  // Sample exact authored digit fields before reshaping only the closed wrist.
  const fields=createHandSkinFields(hand),side=label==='left'?'L':'R';
  const handGeometry=hand.children[0].geometry,center=handGeometry.userData.centerOffset;
  const hp=handGeometry.attributes.position,hn=handGeometry.attributes.normal;
  for(let i=0;i<hp.count;i++){
   const sourceY=hp.getY(i)+center[1],x=hp.getX(i)+center[0],z=hp.getZ(i)+center[2]+.015;
   const t=T.MathUtils.clamp((sourceY+1.05)/.65,0,1),fade=t*t*(3-2*t),f=1+.7*(1-fade);
   const derivative=sourceY>-1.05&&sourceY<-.40?-.7*6*t*(1-t)/.65:0;
   // A fuller palm in profile tapers back into the authored wrist pivot.
   const depth=1.15+.45*fade,fz=f*depth;
   const depthDerivative=sourceY>-1.05&&sourceY<-.40?.45*6*t*(1-t)/.65:0;
   const zDerivative=derivative*depth+f*depthDerivative;
   hp.setX(i,x*f-center[0]);hp.setZ(i,z*fz-.015-center[2]);
   // Inverse transpose of the radial deformation Jacobian keeps the smooth
   // SDF normals accurate, including the taper from the cuff into the palm.
   const nx=hn.getX(i)/f,nz=hn.getZ(i)/fz,ny=hn.getY(i)-derivative*x*nx-zDerivative*z*nz,length=Math.hypot(nx,ny,nz);
   hn.setXYZ(i,nx/length,ny/length,nz/length);
  }
  handGeometry.computeBoundingBox();handGeometry.computeBoundingSphere();
  handGeometry.userData.wristReshape={radialFactor:1.7,depthWrist:1.15,depthPalm:1.60,fullBelowY:-1.05,fadeToY:-.40,axisZ:-.015};
  // Digit rest joints must follow the same palm depth change as their vertices.
  fields.jointPoints=fields.jointPoints.map(([x,y,z])=>{
   const t=T.MathUtils.clamp((y+center[1]+1.05)/.65,0,1),fade=t*t*(3-2*t),f=1+.7*(1-fade);
   return [(x+center[0])*f-center[0],y,(z+center[2]+.015)*f*(1.15+.45*fade)-.015-center[2]];
  });
  const handScale=.113;const rot=new T.Quaternion().setFromEuler(new T.Euler(0,0,Math.PI+s*.075));
  // With fingertips down, mirror source X on the +X hand so both thumbs
  // point toward the torso. Skin fields remain in the authored source space.
  hand.scale.set(s>0?-handScale:handScale,handScale,handScale);hand.quaternion.copy(rot);
  hand.position.copy(new T.Vector3(s*.4712,.84*BODY_Y_SCALE,.010).sub(pivot.multiply(hand.scale).applyQuaternion(rot)));
  hand.updateMatrixWorld(true);
  const joints=[ix('Hand_'+side),...Array.from({length:5},(_,i)=>ix(`Finger${i}_${side}`))];
  for(let i=0;i<5;i++){
   const name=`Finger${i}_${side}`,point=new T.Vector3(...fields.jointPoints[i+1]).applyMatrix4(hand.matrixWorld);
   rig.rest[name].copy(point);rig.byName[name].position.copy(point).sub(rig.rest['Hand_'+side]);
  }
  hand.traverse(m=>{if(m.isMesh){m.name='hand-'+label;m.material.color.set('#edac78');}});collect(hand,'hand',{fields,joints,forearm:ix('LowerArm_'+side)});
  const shoe=createShoe({detail}),ankle=new T.Vector3(...shoe.userData.anklePivot),shoeScale=.19;
  shoe.scale.set(shoeScale*1.25,shoeScale,shoeScale);shoe.rotation.y=s*.05;
  shoe.position.copy(new T.Vector3(s*.198,.10*BODY_Y_SCALE,-.008).sub(ankle.multiply(shoe.scale).applyAxisAngle(new T.Vector3(0,1,0),s*.05)));
  shoe.traverse(m=>{if(m.isMesh)m.name='shoe-'+label+'-'+m.name;});collect(shoe,'shoe');
 }
 // Many directions select the same support vertex, often across shoe parts.
 // Keep every distinct candidate exactly: the minimum is unchanged for every
 // foot transform, with fewer matrix transforms during animation/benchmark.
 const supportByBone=new Map();
 for(const probe of groundProbes){
  if(!supportByBone.has(probe.bone))supportByBone.set(probe.bone,new Map());
  const points=supportByBone.get(probe.bone);
  for(const point of probe.points)points.set(point.join(','),point);
 }
 groundProbes.splice(0,groundProbes.length,...Array.from(supportByBone,([bone,points])=>({bone,points:[...points.values()]})));
 // Digit rest pivots changed after the original skeleton construction.
 root.updateMatrixWorld(true);rig.skeleton.calculateInverses();
 for(const batch of groups.values()){
  const geometry=mergeGeometries(batch.geometries,false);batch.geometries.forEach(g=>g.dispose());
  if(!batch.material.map)geometry.deleteAttribute('uv');
  if(geometry.morphAttributes.position?.length)nameMorphs(geometry,EXPRESSION_IDS);
  const mesh=new T.SkinnedMesh(geometry,batch.material);mesh.name='Skin_'+root.children.length;
  mesh.userData.parts=[...new Set(batch.parts)];mesh.frustumCulled=false;root.add(mesh);mesh.bind(rig.skeleton);
 }
 for(const animated of [false,true]){
  const surfaces=rigidHead.filter(s=>!!s.geometry.morphAttributes.position?.length===animated);
  if(!surfaces.length)continue;
  const geometry=mergeGeometries(surfaces.map(s=>s.geometry),false);surfaces.forEach(s=>s.geometry.dispose());
  geometry.deleteAttribute('uv');
  if(animated)nameMorphs(geometry,EXPRESSION_IDS);
  transformGeometry(geometry,rig.byName.Head.matrixWorld.clone().invert());
  const mesh=new T.Mesh(geometry,surfaces[0].material);mesh.name=animated?'HeadExpressions':'HeadSurface';mesh.userData.rigidBone='Head';mesh.frustumCulled=false;
  rig.byName.Head.add(mesh);
 }
 for(const [bone,surfaces] of rigidShoes){
  const geometry=mergeGeometries(surfaces.map(s=>s.geometry),false);surfaces.forEach(s=>s.geometry.dispose());
  geometry.deleteAttribute('uv');geometry.applyMatrix4(rig.byName[bone].matrixWorld.clone().invert());
  const mesh=new T.Mesh(geometry,surfaces[0].material);mesh.name='ShoeSurface_'+bone;
  mesh.userData.rigidBone=bone;mesh.frustumCulled=false;rig.byName[bone].add(mesh);
 }
 const ballGeometry=new T.IcosahedronGeometry(.14,detail==='dense'?3:detail==='balanced'?2:1),ballMaterial=new T.MeshStandardMaterial({color:'#f4f0dd',roughness:.72});
 const ball=new T.Mesh(ballGeometry,experiment==='pbr'?ballMaterial:bakeStudio(ballGeometry,ballMaterial));
 ball.name='Ball';ball.position.set(.20,.15,.70);root.add(ball);
 // Separate dark panels on the same low-poly ball; no network texture.
 const panelGeom=new T.CircleGeometry(.034,5),panelMat=new T.MeshStandardMaterial({color:'#233954',roughness:.8,side:T.DoubleSide});
 for(let i=0;i<12;i++){
  const y=1-2*(i+.5)/12,r=Math.sqrt(1-y*y),a=i*Math.PI*(3-Math.sqrt(5));
  const n=new T.Vector3(r*Math.cos(a),y,r*Math.sin(a));const panel=new T.Mesh(panelGeom,panelMat);panel.position.copy(n).multiplyScalar(.1402);panel.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),n);ball.add(panel);
 }
 if(experiment!=='pbr'){
  const surfaces=[ball.geometry.index?ball.geometry.toNonIndexed():ball.geometry.clone()];
  for(const panel of [...ball.children]){
   panel.updateMatrix();let geometry=panel.geometry.clone().applyMatrix4(panel.matrix);
   if(geometry.index)geometry=geometry.toNonIndexed();
   bakeStudio(geometry,panel.material).dispose();surfaces.push(geometry);ball.remove(panel);
  }
  const merged=mergeGeometries(surfaces,false);surfaces.forEach(g=>g.dispose());ball.geometry.dispose();
  merged.deleteAttribute('uv');
  ball.geometry=merged;ball.material.side=T.DoubleSide;
 }
 root.userData={detail,experiment,headHeight:1,sourceParts,headScale,bodyYScale:BODY_Y_SCALE,groundProbes,buildMs:performance.now()-start};
 const model={root,...rig,ball,detail,getExpressionWeights(){return expressionWeights(root);},setExpressionWeights(weights){return setExpressionWeights(root,weights);},get expressionMeshes(){const meshes=[];root.traverse(m=>{if(m.morphTargetInfluences)meshes.push(m);});return meshes;},setExpression(id){applyExpression(root,id);},setExpressionBlend(from,to,t){blendExpression(root,from,to,t);},applyPose(id){applyPose(model,id);},blend(from,to,t){applyBlend(model,from,to,t);}};
 applyPose(model,'stand');return model;
}

function poseState(id){if(!POSES[id])throw new Error('Unknown pose: '+id);return POSES[id];}
export function applyBlend(model,from,to,t){
 const a=poseState(from),b=poseState(to),blend=T.MathUtils.clamp(t,0,1);
 blendExpression(model.root,POSE_EXPRESSIONS[from]||'happy',POSE_EXPRESSIONS[to]||'happy',blend);
 for(const [name,bone] of Object.entries(model.byName)){
  const qa=new T.Quaternion().setFromEuler(new T.Euler(...(a[name]??[0,0,0])));
  const qb=new T.Quaternion().setFromEuler(new T.Euler(...(b[name]??[0,0,0])));
  if(name.startsWith('Finger')){
   const aa=from==='stand'?.04:.35,bb=to==='stand'?.04:.35;
   qa.setFromEuler(new T.Euler(-aa,0,0));qb.setFromEuler(new T.Euler(-bb,0,0));
  }
  bone.quaternion.copy(qa).slerp(qb,blend);
 }
 model.byName.Hips.position.y=.88*BODY_Y_SCALE;
 const ballScale=T.MathUtils.lerp(from==='kick'?1:0,to==='kick'?1:0,blend);model.ball.scale.setScalar(ballScale);
 groundModel(model);
}
export function groundModel(model){
 model.root.updateMatrixWorld(true);model.skeleton.update();
 // Support samples from actual shoe vertices are baked once in foot-local
 // coordinates. This avoids CPU skinning the entire character every frame.
 const meta=model.root.userData.groundProbes?model.root.userData:model.root.getObjectByName('Kid')?.userData;
 let min=Infinity;const p=new T.Vector3();for(const probe of meta.groundProbes){
  const bone=model.byName[probe.bone];for(const v of probe.points){p.fromArray(v).applyMatrix4(bone.matrixWorld);min=Math.min(min,p.y);}
 }
 model.byName.Hips.position.y-=min;model.root.updateMatrixWorld(true);model.skeleton.update();
 const foot=model.byName.Foot_R,contact=model.root.worldToLocal(new T.Vector3(0,-.06,.55).applyMatrix4(foot.matrixWorld));
 model.ball.position.copy(contact);model.ball.position.y=Math.max(.145,model.ball.position.y);
}
export function applyPose(model,id){applyBlend(model,id,id,0);}
export function countModel(root){let triangles=0,vertices=0,meshes=0;root.traverse(m=>{if(m.isMesh){triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;vertices+=m.geometry.attributes.position.count;meshes++;}});return {modelTriangles:triangles,vertices,meshes};}

export function animationClips(model){
 const clips=[];
 for(const id of ['stand','run','kick']){
  const duration=id==='kick'?1.35:1;
  const times=id==='stand'?[0,1]:Array.from({length:61},(_,i)=>duration*i/60);
  const samples=[];
  for(let i=0;i<times.length;i++){
   if(id==='stand')applyPose(model,'stand');
   else if(id==='kick')applyBlend(model,'stand','kick',Math.sin(Math.PI*times[i]/duration)**2);
   else{
    POSES.runOpposite={...POSES.run};for(const stem of ['UpperLeg','LowerLeg','Foot','UpperArm','LowerArm']){
     POSES.runOpposite[stem+'_L']=POSES.run[stem+'_R'];POSES.runOpposite[stem+'_R']=POSES.run[stem+'_L'];
    }
    applyBlend(model,'run','runOpposite',.5-.5*Math.cos(times[i]*Math.PI*2));
   }
   samples.push({q:Object.fromEntries(model.bones.map(b=>[b.name,b.quaternion.toArray()])),hip:model.byName.Hips.position.toArray(),ball:model.ball.scale.toArray(),ballPosition:model.ball.position.toArray(),expression:expressionWeights(model.root)});
  }
  const tracks=model.bones.map(b=>new T.QuaternionKeyframeTrack(b.name+'.quaternion',times,samples.flatMap(s=>s.q[b.name])));
  tracks.push(new T.VectorKeyframeTrack('Hips.position',times,samples.flatMap(s=>s.hip)),new T.VectorKeyframeTrack('Ball.scale',times,samples.flatMap(s=>s.ball)),new T.VectorKeyframeTrack('Ball.position',times,samples.flatMap(s=>s.ballPosition)));
  model.root.traverse(mesh=>{if(mesh.morphTargetInfluences?.length)tracks.push(new T.NumberKeyframeTrack(mesh.name+'.morphTargetInfluences',times,samples.flatMap(s=>EXPRESSION_IDS.map(id=>s.expression[id]))));});
  clips.push(new T.AnimationClip(id,times.at(-1),tracks));
 }
 applyPose(model,'stand');return clips;
}

export function numericalSnapshot(model){
 model.root.updateMatrixWorld(true);model.skeleton.update();const result=[];
 model.root.traverse(m=>{if(!m.isMesh||(!m.isSkinnedMesh&&!m.userData.rigidBone&&!m.morphTargetInfluences))return;const p=new T.Vector3(),a=m.geometry.attributes.position;
  for(let i=0;i<a.count;i++){m.getVertexPosition(i,p);p.applyMatrix4(m.matrixWorld);result.push(p.x,p.y,p.z);}
 });return result;
}
