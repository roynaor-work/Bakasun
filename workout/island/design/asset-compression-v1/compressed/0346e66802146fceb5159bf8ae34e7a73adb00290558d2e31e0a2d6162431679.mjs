/** Island Pro Basketball — lacquered-floor reflection (01/11, broadcast look). The players, the
 * ball and the baskets are rendered once more from a camera mirrored in the floor plane into a
 * small render target, and the parquet material mixes that picture in with a Fresnel weight.
 * Only objects on REFLECTION_LAYER are drawn in the extra pass (no arena, no crowd, no shadow
 * re-render), the target is a fraction of the screen, and nothing here touches the simulation. */
import * as THREE from '../vendor/three.module.js';

export const REFLECTION_LAYER=1;
const BIAS=new THREE.Matrix4().set(0.5,0,0,0.5,0,0.5,0,0.5,0,0,0.5,0.5,0,0,0,1);

/** Mirror `camera` in the horizontal plane y = planeY into `out` (position, orientation, lens).
 * The mirrored camera is a rigid transform (reflected position, reflected look target and a
 * reflected up vector), so the extra pass keeps normal face winding; the mirror image comes from
 * projecting the floor through it. Returns the texture matrix mapping world points to its UVs. */
export function reflectCamera(camera,planeY,out,textureMatrix=new THREE.Matrix4()){
 camera.updateMatrixWorld();
 const e=camera.matrixWorld.elements,px=e[12],py=e[13],pz=e[14];
 // forward = -Z column, up = +Y column of the world matrix
 const fx=-e[8],fy=-e[9],fz=-e[10],ux=e[4],uy=e[5],uz=e[6];
 out.position.set(px,2*planeY-py,pz);
 out.up.set(ux,-uy,uz);
 out.lookAt(px+fx,2*planeY-(py+fy),pz+fz);
 out.fov=camera.fov;out.aspect=camera.aspect;out.near=camera.near;out.far=camera.far;out.updateProjectionMatrix();
 out.updateMatrixWorld();
 textureMatrix.copy(BIAS).multiply(out.projectionMatrix).multiply(out.matrixWorldInverse);
 return textureMatrix;
}

/** Patch one floor material so it samples the reflection; returns the uniforms it reads. */
export function applyFloorReflection(material,{strength=0.42}={}){
 const uniforms={reflMap:{value:null},reflMatrix:{value:new THREE.Matrix4()},reflStrength:{value:strength}};
 const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey;
 material.onBeforeCompile=function(shader,renderer){
  previous?.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 reflMatrix;varying vec4 vReflUv;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\n{vec4 reflWorld=modelMatrix*vec4(transformed,1.0);vReflUv=reflMatrix*reflWorld;}');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D reflMap;uniform float reflStrength;varying vec4 vReflUv;')
   .replace('#include <opaque_fragment>',`{
 vec4 refl=texture2DProj(reflMap,vReflUv);
 float fresnel=pow(1.0-saturate(dot(normal,geometryViewDir)),2.0);
 float k=refl.a*reflStrength*(0.45+0.55*fresnel)*(1.0-roughnessFactor*0.6);
 outgoingLight=mix(outgoingLight,refl.rgb,k);
}
#include <opaque_fragment>`);
 };
 material.customProgramCacheKey=function(){return (previousKey?previousKey.call(this):'')+'|hoops-floor-reflection-v1';};
 material.userData.hoopsFloorReflection=uniforms;material.needsUpdate=true;
 return uniforms;
}

export function createFloorReflection(renderer,scene,floor,{planeY=0.008,scale=0.4,maxWidth=640,strength=0.42}={}){
 const target=new THREE.WebGLRenderTarget(64,64,{depthBuffer:true,stencilBuffer:false,type:THREE.UnsignedByteType});
 target.texture.minFilter=THREE.LinearFilter;target.texture.magFilter=THREE.LinearFilter;target.texture.generateMipmaps=false;target.texture.colorSpace=THREE.SRGBColorSpace;
 const uniforms=applyFloorReflection(floor.material,{strength});uniforms.reflMap.value=target.texture;
 const virtualCamera=new THREE.PerspectiveCamera();virtualCamera.layers.set(REFLECTION_LAYER);
 let disposed=false,width=0,height=0;
 function resize(w,h){width=Math.max(16,Math.round(Math.min(w*scale,maxWidth)));height=Math.max(16,Math.round(width*h/Math.max(1,w)));target.setSize(width,height);}
 function update(camera){
  if(disposed||!width)return;
  reflectCamera(camera,planeY,virtualCamera,uniforms.reflMatrix.value);
  const background=scene.background,fog=scene.fog,previousTarget=renderer.getRenderTarget(),alpha=renderer.getClearAlpha(),color=renderer.getClearColor(new THREE.Color());
  const shadows=renderer.shadowMap.autoUpdate;
  scene.background=null;scene.fog=null;
  renderer.setRenderTarget(target);renderer.setClearColor(0x000000,0);renderer.clear();
  renderer.render(scene,virtualCamera);
  renderer.setRenderTarget(previousTarget);renderer.setClearColor(color,alpha);renderer.shadowMap.autoUpdate=shadows;
  scene.background=background;scene.fog=fog;
 }
 return {update,resize,dispose(){if(disposed)return;disposed=true;target.dispose();},get target(){return target;},get camera(){return virtualCamera;},get size(){return {width,height};}};
}
