import * as THREE from './vendor/three.module.js';

export const CAMERA_VIEWS=Object.freeze(['main','close','opening']);

/** Broadcast presets cover both orientations. azimuth is a full 360° rotation
 * in radians, including reverse touchline and behind either goal. */
export function frameBroadcastCamera(camera,{aspect=1,view='main',azimuth=0}={}) {
  if(!CAMERA_VIEWS.includes(view))throw new RangeError('Unknown broadcast view');
  if(!(aspect>0&&Number.isFinite(aspect)))throw new RangeError('Aspect must be positive');
  const portrait=aspect<1;
  let position,target,fov;
  if(view==='main'){
    position=portrait?[72,65,6]:[6,24,52];target=portrait?[8,0,0]:[0,4,0];fov=portrait?64:60;
  }else if(view==='close'){
    position=portrait?[63,7,8]:[64,10,18];target=[52,1,0];fov=portrait?52:50;
  }else{
    position=portrait?[-52,10,9]:[-37,8,27];target=portrait?[3,6,-6]:[5,8,-11];fov=portrait?56:62;
  }
  const rotate=([x,y,z])=>new THREE.Vector3(x*Math.cos(azimuth)-z*Math.sin(azimuth),y,x*Math.sin(azimuth)+z*Math.cos(azimuth));
  camera.position.copy(rotate(position));camera.up.set(0,1,0);camera.lookAt(rotate(target));
  camera.aspect=aspect;camera.fov=fov;camera.near=.15;camera.far=2200;camera.updateProjectionMatrix();camera.updateMatrixWorld();
  return camera;
}
