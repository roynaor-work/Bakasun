import * as T from '../vendor/three.module.js';

/** One sun/shadow pass. Only the original players, ball and goal cast shadows.
 * This is deliberately independent of gameplay and of the city's lighting. */
export function createSoccerLighting(scene,renderer,config){
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 const ambient=new T.HemisphereLight('#dae9ff','#4f6344',1.35);
 const sun=new T.DirectionalLight('#fff0d4',2.75);sun.position.set(-14,26,-17);sun.target.position.set(0,0,0);sun.castShadow=true;
 const extent=Math.hypot(config.pitch.length,config.pitch.width)/2+3,camera=sun.shadow.camera;
 Object.assign(camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:1,far:75});camera.updateProjectionMatrix();
 sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0002;sun.shadow.normalBias=.025;sun.shadow.radius=2;
 const fill=new T.DirectionalLight('#b9d6f1',.45);fill.position.set(16,10,14);
 scene.add(ambient,sun,sun.target,fill);let quality=0,disposed=false;
 function setQuality(level){
  quality=Math.max(0,Math.min(3,Math.floor(level)));sun.castShadow=quality<2;renderer.shadowMap.enabled=quality<2;
  // Release the existing render targets when the tier changes. In particular,
  // render targets do not stay resident after shadows have been disabled.
  const size=quality===0?2048:1024;
  if(sun.shadow.map&&(sun.shadow.mapSize.x!==size||quality>=2)){sun.shadow.map.dispose();sun.shadow.map=null;sun.shadow.mapPass?.dispose();sun.shadow.mapPass=null;}
  sun.shadow.mapSize.set(size,size);sun.shadow.needsUpdate=true;
 }
 return {setQuality,metrics:()=>({sunShadows:sun.castShadow,shadowSize:sun.castShadow?sun.shadow.mapSize.x:0,quality}),dispose(){if(disposed)return;disposed=true;sun.shadow.map?.dispose();sun.shadow.mapPass?.dispose();sun.shadow.map=null;sun.shadow.mapPass=null;for(const light of [ambient,sun,sun.target,fill])scene.remove(light);}};
}
