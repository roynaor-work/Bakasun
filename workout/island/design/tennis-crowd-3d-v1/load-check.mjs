/** Original CC0. Actual GLTFLoader + AnimationMixer check of every GLB. */
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
export async function checkModels() {
  const manifest=await fetch(new URL('assets.json',import.meta.url)).then(r=>r.json()), results=[];
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  for(const asset of manifest.assets){
    const gltf=await new GLTFLoader().loadAsync(new URL(asset.file,import.meta.url).href);
    const meshes=[];gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
    assert(meshes.length===1,`${asset.file}: expected one mesh`);
    const mesh=meshes[0],g=mesh.geometry;
    assert(g.index.count/3===asset.triangles&&asset.triangles<=220,'triangle budget');
    assert(g.attributes.color.normalized,'normalized vertex colors');
    assert(g.attributes._head.count===g.attributes.position.count,'head mask count');
    assert(mesh.userData.headPivot.length===3,'head pivot');
    assert(g.morphAttributes.position.length===1&&g.morphTargetsRelative,'relative arms-up morph');
    assert(mesh.material.isMeshBasicMaterial&&!mesh.material.map,'unlit, no texture');
    assert(gltf.animations.length===1,'native animation present');
    const mixer=new T.AnimationMixer(gltf.scene);
    const action=mixer.clipAction(gltf.animations[0]);action.play();mixer.setTime(1);
    assert(Math.abs(mesh.morphTargetInfluences[0]-1)<1e-6,'native arms-up animation endpoint');
    mixer.setTime(.5);assert(Math.abs(mesh.morphTargetInfluences[0]-.5)<1e-6,'native morph interpolation');
    mixer.setTime(0);assert(Math.abs(mesh.morphTargetInfluences[0])<1e-6,'native arms-down endpoint');
    const p=g.attributes.position,d=g.morphAttributes.position[0],head=g.attributes._head;
    let headVertices=0,movingVertices=0,raisedMaxY=0;
    for(let i=0;i<p.count;i++){
      const values=[p.getX(i),p.getY(i),p.getZ(i),d.getX(i),d.getY(i),d.getZ(i)];
      assert(values.every(Number.isFinite),'finite coordinates');
      if(Math.hypot(d.getX(i),d.getY(i),d.getZ(i))>.0001)movingVertices++;
      if(head.getX(i)>0){headVertices++;assert(Math.hypot(d.getX(i),d.getY(i),d.getZ(i))<1e-6,'head independent of arms');}
      raisedMaxY=Math.max(raisedMaxY,p.getY(i)+d.getY(i));
    }
    assert(headVertices>0&&movingVertices>0,'head and arms data present');
    results.push({file:asset.file,triangles:asset.triangles,vertices:p.count,headVertices,movingVertices,raisedMaxY,nativeMorphAnimation:true});
    mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);g.dispose();mesh.material.dispose();
  }
  return results;
}
