import * as THREE from '../vendor/three.module.js';

/** Canonical 18-bone skin on one instanced draw, shared pose for a distant crew.
 * The original skinned GLB is also supplied for individual motion2 retargeting. */
export function createCrew(scene,gltf,atlas){
 let skin;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)skin=o;});
 if(!skin)throw new Error('Canonical crew skin missing');
 const geo=skin.geometry.clone();const capacity=48;
 const material=new THREE.MeshStandardMaterial({map:atlas,roughness:.9,metalness:0});
 const poses=skin.skeleton.bones.map(b=>b.quaternion.clone());
 const bind=skin.bindMatrix.clone(),inverse=skin.bindMatrixInverse.clone();
 const uniforms={uCrewBones:{value:skin.skeleton.boneMatrices},uCrewBind:{value:bind},uCrewBindInverse:{value:inverse}};
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
   attribute vec4 skinIndex;attribute vec4 skinWeight;
   uniform mat4 uCrewBones[18];uniform mat4 uCrewBind;uniform mat4 uCrewBindInverse;
   mat4 crewSkin(){return skinWeight.x*uCrewBones[int(skinIndex.x)]+skinWeight.y*uCrewBones[int(skinIndex.y)]+skinWeight.z*uCrewBones[int(skinIndex.z)]+skinWeight.w*uCrewBones[int(skinIndex.w)];}`)
   .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
    objectNormal=mat3(uCrewBindInverse*crewSkin()*uCrewBind)*objectNormal;`)
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    transformed=(uCrewBindInverse*crewSkin()*uCrewBind*vec4(transformed,1.)).xyz;`);
 };
 material.customProgramCacheKey=()=> 'naval-canonical-instanced-18-v1';
 const mesh=new THREE.InstancedMesh(geo,material,capacity);mesh.frustumCulled=false;mesh.count=0;scene.add(mesh);
 const dummy=new THREE.Object3D(),rotation=new THREE.Quaternion(),axis=new THREE.Vector3(0,0,1);
 const boneMap=new Map(skin.skeleton.bones.map((b,i)=>[b.name,{bone:b,index:i}]));
 function place(vessels){
  let n=0;
  for(const v of vessels){
   if(!v.root.visible||v.lod>0)continue;
   const c=v.config;
   for(let i=0;i<(v.kind==='carrier'?8:6)&&n<capacity;i++){
    const side=i%2?1:-1;const x=side*c.beam*.31,z=(Math.floor(i/2)-1)*3.2-c.length*.21;
    dummy.position.set(x,c.deck+.16,z);dummy.rotation.set(0,side*Math.PI*.45,0);dummy.scale.setScalar(1);
    dummy.updateMatrix();dummy.matrix.premultiply(v.root.matrixWorld);mesh.setMatrixAt(n++,dummy.matrix);
   }
  }
  mesh.count=n;mesh.instanceMatrix.needsUpdate=true;
 }
 return{mesh,place,update(time){
  skin.skeleton.bones.forEach((b,i)=>b.quaternion.copy(poses[i]));
  for(const [name,z]of [['RightArm',-1.25+Math.sin(time*1.6)*.18],['RightForeArm',-.55],['LeftArm',.12]]){
   const q=boneMap.get(name);if(q){rotation.setFromAxisAngle(axis,z);q.bone.quaternion.multiply(rotation);}
  }
  gltf.scene.updateMatrixWorld(true);skin.skeleton.update();
 },dispose(){geo.dispose();material.dispose();}};
}
