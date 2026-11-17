import * as T from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

const surface=new T.MeshStandardMaterial({vertexColors:true,roughness:.9});
// All authored building pieces are static. Baking their transforms and colors
// makes one draw call per building, instead of one per window, roof or crop.
export function batchMeshes(root) {
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),geometries=[],meshes=[];
  root.traverse(mesh=>{
    if(!mesh.isMesh||Array.isArray(mesh.material)||mesh.isInstancedMesh)return;
    let geometry=mesh.geometry.clone();if(geometry.index){const expanded=geometry.toNonIndexed();geometry.dispose();geometry=expanded;}
    geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));
    const count=geometry.attributes.position.count,colors=new Float32Array(count*3),color=mesh.material.color||new T.Color('#ffffff');
    for(let i=0;i<count;i++){colors[i*3]=color.r;colors[i*3+1]=color.g;colors[i*3+2]=color.b;}
    for(const key of Object.keys(geometry.attributes))if(!['position','normal'].includes(key))geometry.deleteAttribute(key);
    geometry.setAttribute('color',new T.BufferAttribute(colors,3));geometries.push(geometry);meshes.push(mesh);
  });
  if(!geometries.length)return root;
  const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
  for(const mesh of meshes){mesh.parent.remove(mesh);if(mesh.userData.ownedGeometry)mesh.geometry.dispose();if(mesh.userData.ownedMaterial)mesh.material.dispose();}
  const mesh=new T.Mesh(merged,surface);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.ownedGeometry=true;root.add(mesh);return root;
}
