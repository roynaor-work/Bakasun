/** Local, mathematically equivalent sparse skinning for basketball materials.
 * v2 vertices commonly have one nonzero influence. Avoid fetching unused bone
 * matrices while retaining every position, normal, weight and material detail. */
import * as THREE from '../vendor/three.module.js';

export const SPARSE_SKINBASE_VERTEX=`#ifdef USE_SKINNING
 mat4 boneMatX = getBoneMatrix( skinIndex.x );
 mat4 boneMatY = mat4( 0.0 );
 mat4 boneMatZ = mat4( 0.0 );
 mat4 boneMatW = mat4( 0.0 );
 if ( skinWeight.y != 0.0 ) boneMatY = getBoneMatrix( skinIndex.y );
 if ( skinWeight.z != 0.0 ) boneMatZ = getBoneMatrix( skinIndex.z );
 if ( skinWeight.w != 0.0 ) boneMatW = getBoneMatrix( skinIndex.w );
#endif`;

export function applySparseSkinning(material){
 if(material.userData.hoopsSparseSkinning)return material;
 const originalCompile=material.onBeforeCompile,originalKey=material.customProgramCacheKey;
 material.onBeforeCompile=function(shader,renderer){
  originalCompile?.call(this,shader,renderer);
  shader.vertexShader=shader.vertexShader.replace('#include <skinbase_vertex>',SPARSE_SKINBASE_VERTEX);
 };
 material.customProgramCacheKey=function(){return originalKey.call(this)+'|hoops-sparse-skin-v1';};
 material.userData.hoopsSparseSkinning=true;material.needsUpdate=true;return material;
}

/** Custom depth pass needs the same optimization as the visible skin pass. */
export function createSparseDepthMaterial(){
 return applySparseSkinning(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.FrontSide}));
}
