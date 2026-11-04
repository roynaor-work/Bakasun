// Reusable optional three.js art treatment. The GLB itself stays standard PBR.
// The hull uses the same skeleton and morph influences as its source mesh.
import * as THREE from '../../vendor/three.module.js';
function contourGeometry(mesh){
  const source=mesh.geometry,index=source.index.array,skin=source.attributes.skinIndex,weight=source.attributes.skinWeight;
  const head=mesh.skeleton.bones.findIndex(b=>b.name==='Head'),position=source.attributes.position;
  const adjacency=Array.from({length:position.count},()=>[]);
  for(let i=0;i<index.length;i+=3){const a=index[i],b=index[i+1],c=index[i+2];adjacency[a].push(b,c);adjacency[b].push(a,c);adjacency[c].push(a,b);}
  const visited=new Uint8Array(position.count),keep=new Uint8Array(position.count);
  for(let first=0;first<position.count;first++)if(!visited[first]){
    const stack=[first],component=[],box=new THREE.Box3();let headVertices=0;visited[first]=1;
    while(stack.length){
      const v=stack.pop();component.push(v);box.expandByPoint(new THREE.Vector3().fromBufferAttribute(position,v));
      for(let k=0;k<4;k++)if(skin.getComponent(v,k)===head&&weight.getComponent(v,k)>.9){headVertices++;break;}
      for(const n of adjacency[v])if(!visited[n]){visited[n]=1;stack.push(n);}
    }
    const size=box.getSize(new THREE.Vector3());
    // Outline the skull and groom silhouettes. Small eyelid, lip and nose
    // surfaces already have modeled lines; separate hulls made them too heavy.
    if(headVertices<component.length*.9||size.x>.105&&size.y>.075)for(const v of component)keep[v]=1;
  }
  const filtered=[];for(let i=0;i<index.length;i+=3)if(keep[index[i]])filtered.push(index[i],index[i+1],index[i+2]);
  const result=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(source.attributes))result.setAttribute(name,attribute);
  result.morphAttributes=source.morphAttributes;result.morphTargetsRelative=source.morphTargetsRelative;result.setIndex(filtered);
  return result;
}
export function applyToon(scene,{outline=true,width=.00145}={}){
  const gradient=new THREE.DataTexture(new Uint8Array([92,158,218,255]),4,1,THREE.RedFormat);
  gradient.minFilter=gradient.magFilter=THREE.NearestFilter;gradient.needsUpdate=true;
  const originals=[],outlines=[],materials=[];
  scene.traverse(o=>{if(o.isMesh)originals.push(o);});
  for(const mesh of originals){
    const old=mesh.material;
    mesh.material=new THREE.MeshToonMaterial({color:old.color,vertexColors:!!mesh.geometry.attributes.color,map:old.map,gradientMap:gradient});
    materials.push(mesh.material);old.dispose();mesh.frustumCulled=false;
    if(!outline||!mesh.isSkinnedMesh)continue;
    const material=new THREE.MeshBasicMaterial({color:0x112d3a,side:THREE.BackSide});
    material.onBeforeCompile=shader=>{
      shader.uniforms.outlineWidth={value:width};
      shader.vertexShader='uniform float outlineWidth;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','transformed += normalize(objectNormal) * outlineWidth;\n#include <project_vertex>');
    };
    material.customProgramCacheKey=()=>`soccer-v5-hull-${width}`;
    const hull=new THREE.SkinnedMesh(contourGeometry(mesh),material);
    hull.name='Outline';hull.skeleton=mesh.skeleton;hull.bindMatrix.copy(mesh.bindMatrix);hull.bindMatrixInverse.copy(mesh.bindMatrixInverse);
    hull.position.copy(mesh.position);hull.quaternion.copy(mesh.quaternion);hull.scale.copy(mesh.scale);
    hull.morphTargetInfluences=mesh.morphTargetInfluences;hull.morphTargetDictionary=mesh.morphTargetDictionary;
    hull.frustumCulled=false;hull.userData.outline=true;mesh.parent.add(hull);outlines.push(hull);materials.push(material);
  }
  return {outlines,sync(){for(let i=0;i<outlines.length;i++)outlines[i].morphTargetInfluences=originals.filter(m=>m.isSkinnedMesh)[i].morphTargetInfluences;},dispose(){for(const h of outlines){h.removeFromParent();h.geometry.dispose();}for(const m of materials)m.dispose();gradient.dispose();}};
}
