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

/** Per-region surface response for one Blinn-Phong athlete material (broadcast look, 01/11):
 * a `gloss` vertex attribute (x = specular strength, y = shininess, z = rim strength) lets sweaty
 * skin, matte mesh jerseys and glossy sneakers share one draw call, and a view-dependent rim term
 * lifts the silhouette off the floor the way arena back-lighting does. No extra passes, no
 * environment sampling: two varyings and a few fragment operations on top of the stock shader. */
export const GLOSS_BY_REGION=Object.freeze({
 skin:[.3,34,.3],hair:[.2,28,.16],shirt:[.08,12,.2],shorts:[.08,12,.2],socks:[.05,10,.12],
 shoes:[.5,64,.24],soles:[.25,24,.1],accent:[.4,40,.18],preserve:[.16,24,.18]
});
export function glossAttribute(regions){
 const out=new Float32Array(regions.length*3);
 for(let i=0;i<regions.length;i++){const g=GLOSS_BY_REGION[regions[i]]||GLOSS_BY_REGION.preserve;out[i*3]=g[0];out[i*3+1]=g[1];out[i*3+2]=g[2];}
 return new THREE.BufferAttribute(out,3);
}
export const REGION_GLOSS_PARS_VERTEX='attribute vec3 gloss;varying vec3 vGloss;';
export const REGION_GLOSS_VERTEX='vGloss = gloss;';
export const REGION_GLOSS_PARS_FRAGMENT='varying vec3 vGloss;uniform vec3 rimColor;uniform float rimPower;';
export const REGION_GLOSS_FRAGMENT=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular * vGloss.x;
material.specularShininess = max( 1.0, vGloss.y );
material.specularStrength = specularStrength;`;
export const REGION_RIM_FRAGMENT=`#include <aomap_fragment>
{
 float rimNV = 1.0 - saturate( dot( normal, geometryViewDir ) );
 float rim = pow( rimNV, rimPower ) * vGloss.z;
 reflectedLight.indirectDiffuse += rimColor * rim;
}`;
export function applyRegionGloss(material,{rimColor=0x9fb8ff,rimPower=3.2}={}){
 if(material.userData.hoopsRegionGloss)return material;
 const originalCompile=material.onBeforeCompile,originalKey=material.customProgramCacheKey,uniforms={rimColor:{value:new THREE.Color(rimColor)},rimPower:{value:rimPower}};
 material.onBeforeCompile=function(shader,renderer){
  originalCompile?.call(this,shader,renderer);
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+REGION_GLOSS_PARS_VERTEX).replace('#include <color_vertex>','#include <color_vertex>\n'+REGION_GLOSS_VERTEX);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+REGION_GLOSS_PARS_FRAGMENT).replace('#include <lights_phong_fragment>',REGION_GLOSS_FRAGMENT).replace('#include <aomap_fragment>',REGION_RIM_FRAGMENT);
 };
 material.customProgramCacheKey=function(){return originalKey.call(this)+'|hoops-region-gloss-v1';};
 material.userData.hoopsRegionGloss=uniforms;material.needsUpdate=true;return material;
}
