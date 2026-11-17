/** Shared-mesh batching and named cutaways. No live application dependency. */
import * as THREE from 'three';
import {GLTFLoader} from './vendor/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from './vendor/addons/utils/BufferGeometryUtils.js';

export async function loadArena(url=new URL('./assets/arena.glb',import.meta.url)) {
  const gltf=await new GLTFLoader().loadAsync(String(url));
  const root=gltf.scene;
  root.updateMatrixWorld(true);
  const buckets=new Map();
  const seats=[];
  root.traverse(node=>{
    if(!node.userData.seat)return;
    seats.push(node);
    const side=node.parent.name.split('_')[1];
    node.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const key=`${side}:${mesh.geometry.uuid}:${mesh.material.uuid}`;
      if(!buckets.has(key))buckets.set(key,{side,geometry:mesh.geometry,material:mesh.material,matrices:[]});
      buckets.get(key).matrices.push(mesh.matrixWorld.clone());
    });
  });
  for(const seat of seats)seat.removeFromParent();
  for(const bucket of buckets.values()){
    const mesh=new THREE.InstancedMesh(bucket.geometry,bucket.material,bucket.matrices.length);
    mesh.name=`Seats_${bucket.side}_${bucket.material.name}`;
    bucket.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.computeBoundingBox();mesh.computeBoundingSphere();
    mesh.userData.side=bucket.side;
    root.add(mesh);
  }
  // Join the static terrace pieces by side and material. All four sides stay
  // independently removable; shared seats remain instances instead of copies.
  const terraces=new Map();
  const originals=[];
  root.traverse(node=>{
    if(!node.isMesh||node.isInstancedMesh||!node.parent.name.startsWith('Stands_'))return;
    const side=node.parent.name.split('_')[1];
    const key=`${side}:${node.material.uuid}`;
    if(!terraces.has(key))terraces.set(key,{side,material:node.material,geometries:[]});
    const geometry=node.geometry.clone();
    // KHR_mesh_quantization stores normalized integers. Expand only the CPU
    // attributes being transformed; writing world metres back into a normalized
    // Int16 attribute would wrap positions outside [-1,1]. GPU seats stay compact.
    for(const name of ['position','normal']){
      const attribute=geometry.getAttribute(name);
      if(attribute.array instanceof Float32Array)continue;
      const values=new Float32Array(attribute.count*3);
      for(let i=0;i<attribute.count;i++){
        values[i*3]=attribute.getX(i);values[i*3+1]=attribute.getY(i);values[i*3+2]=attribute.getZ(i);
      }
      geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,3));
    }
    terraces.get(key).geometries.push(geometry.applyMatrix4(node.matrixWorld));
    originals.push(node);
  });
  for(const bucket of terraces.values()){
    const geometry=mergeGeometries(bucket.geometries,false);
    const mesh=new THREE.Mesh(geometry,bucket.material);
    mesh.name=`Stands_${bucket.side}_Merged_${bucket.material.name}`;
    root.add(mesh);
    bucket.geometries.forEach(g=>g.dispose());
  }
  for(const original of originals){original.removeFromParent();original.geometry.dispose();}
  const replacedMaterials=new Set();
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    // Millimetre-high painted lines must not self-shadow onto the lacquer.
    mesh.castShadow=!mesh.material.transparent&&!mesh.name.startsWith('Court');
    mesh.receiveShadow=true;
    mesh.material.envMapIntensity=.72;
    if(mesh.material.name==='rail')mesh.material.envMapIntensity=.32;
    if(mesh.material.map)mesh.material.map.anisotropy=8;
    if(mesh.material.name==='maple'){
      const physical=new THREE.MeshPhysicalMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(physical,mesh.material);
      replacedMaterials.add(mesh.material);
      physical.clearcoat=.12;physical.clearcoatRoughness=.40;
      physical.specularIntensity=.28;
      physical.envMapIntensity=.25;mesh.material=physical;
    }
    if(mesh.material.name==='paint'){
      const physical=new THREE.MeshPhysicalMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(physical,mesh.material);
      replacedMaterials.add(mesh.material);
      physical.roughness=.43;physical.clearcoat=.10;
      physical.clearcoatRoughness=.45;physical.specularIntensity=.3;
      physical.envMapIntensity=.18;mesh.material=physical;
    }
    if(mesh.material.emissive?.getHex())mesh.material.emissiveIntensity=1.6;
    if(mesh.material.name==='glass'){mesh.castShadow=false;mesh.material.depthWrite=false;}
  });
  replacedMaterials.forEach(material=>material.dispose());
  return {
    root,
    seats:seats.length,
    setCutaway(enabled){
      for(const node of root.children){
        const name=node.name;
        const hidden=/^(Stands_Near|Wall_Near|Corner_Near|Roof_Near|Seats_Near|Wall_East)/.test(name);
        if(hidden)node.visible=!enabled;
      }
    },
    dispose(){
      const geometries=new Set(),materials=new Set(),textures=new Set();
      root.traverse(n=>{if(n.isMesh){geometries.add(n.geometry);materials.add(n.material);}});
      for(const material of materials){
        for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
        material.dispose();
      }
      for(const geometry of geometries)geometry.dispose();
      for(const texture of textures)texture.dispose();
      root.removeFromParent();
    }
  };
}
