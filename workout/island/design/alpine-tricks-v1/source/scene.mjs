// SPDX-License-Identifier: CC0-1.0
// Read-only source: alpine-v7/tools/motion-bake.mjs documentScene.
import * as THREE from "../../../vendor/three.module.js";
import {BONE_NAMES} from "./poses.mjs";
/** Construct an image-free authoring proxy from the decoded glTF document.
 * Same skin, local transforms and inverse binds as GLTFLoader, without a DOM.
 */
export function documentScene(doc){
  const root=doc.getRoot(),scene=new THREE.Group(),nodeMap=new Map(),byName={};
  for(const node of root.listNodes()){
    const obj=BONE_NAMES.includes(node.getName())?new THREE.Bone():new THREE.Group();
    obj.name=node.getName();obj.position.fromArray(node.getTranslation());obj.quaternion.fromArray(node.getRotation());obj.scale.fromArray(node.getScale());
    nodeMap.set(node,obj);if(obj.name)byName[obj.name]=obj;
  }
  for(const node of root.listNodes())for(const child of node.listChildren())nodeMap.get(node).add(nodeMap.get(child));
  const gltfScene=root.getDefaultScene()||root.listScenes()[0];
  for(const child of gltfScene.listChildren())scene.add(nodeMap.get(child));
  scene.updateMatrixWorld(true);
  const material=new THREE.MeshBasicMaterial();
  for(const node of root.listNodes())if(node.getMesh())for(const prim of node.getMesh().listPrimitives()){
    const geo=new THREE.BufferGeometry();
    for(const [semantic,key]of [['POSITION','position'],['NORMAL','normal'],['JOINTS_0','skinIndex'],['WEIGHTS_0','skinWeight']]){
      const a=prim.getAttribute(semantic);if(a)geo.setAttribute(key,new THREE.BufferAttribute(a.getArray().slice(),a.getElementSize(),a.getNormalized()));
    }
    if(prim.getIndices())geo.setIndex(new THREE.BufferAttribute(prim.getIndices().getArray().slice(),1));
    const mesh=node.getSkin()?new THREE.SkinnedMesh(geo,material):new THREE.Mesh(geo,material);
    mesh.name=node.getMesh().getName();nodeMap.get(node).add(mesh);
    if(node.getSkin()){
      const skin=node.getSkin(),joints=skin.listJoints(),inverse=skin.getInverseBindMatrices().getArray();
      const skeleton=new THREE.Skeleton(joints.map(j=>nodeMap.get(j)),joints.map((_,i)=>new THREE.Matrix4().fromArray(inverse,i*16)));
      scene.updateMatrixWorld(true);mesh.bind(skeleton,new THREE.Matrix4());
    }
  }
  scene.updateMatrixWorld(true);
  return {scene,nodeMap,byName};
}
