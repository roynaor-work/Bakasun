import * as T from './vendor/three.module.js';

// BufferGeometry.applyMatrix4 transforms only base attributes in Three r160.
// Relative position targets use the linear part; normal deltas use the same
// inverse transpose as the base normal, divided by its pre-normalization length.
export function transformGeometry(geometry,matrix){
 const baseNormals=geometry.attributes.normal?.clone();
 const linear=new T.Matrix3().setFromMatrix4(matrix),normalMatrix=new T.Matrix3().getNormalMatrix(matrix),v=new T.Vector3(),n=new T.Vector3();
 geometry.applyMatrix4(matrix);
 for(const target of geometry.morphAttributes.position||[]){
  for(let i=0;i<target.count;i++){
   v.fromBufferAttribute(target,i);
   if(geometry.morphTargetsRelative)v.applyMatrix3(linear);else v.applyMatrix4(matrix);
   target.setXYZ(i,v.x,v.y,v.z);
  }
 }
 for(const target of geometry.morphAttributes.normal||[]){
  for(let i=0;i<target.count;i++){
   v.fromBufferAttribute(target,i).applyMatrix3(normalMatrix);
   if(geometry.morphTargetsRelative&&baseNormals){
    const length=n.fromBufferAttribute(baseNormals,i).applyMatrix3(normalMatrix).length();
    v.divideScalar(length||1);
   }else v.normalize();
   target.setXYZ(i,v.x,v.y,v.z);
  }
 }
 geometry.boundingBox=null;geometry.boundingSphere=null;
 return geometry;
}
export function nameMorphs(geometry,names){
 geometry.morphTargetsRelative=true;
 for(const attributes of Object.values(geometry.morphAttributes))attributes.forEach((attribute,i)=>attribute.name=names[i]);
 return geometry;
}
