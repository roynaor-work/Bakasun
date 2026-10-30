/** Design basketball avatar: one local Draco GLB, one mesh and one shared cached clip set. */
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {HoopsDRACOLoader as DRACOLoader} from './hoops-draco.mjs';
import {clone as cloneSkinned} from '../vendor/SkeletonUtils.js';
import {bakeHoopsMotion,createMotionMachine} from './hoops-motion.mjs';

export async function loadPlayerAssets(cfg,base,onProgress){
 const decoder=new DRACOLoader().setDecoderPath(new URL('vendor/draco/',base).href).setDecoderConfig({type:'wasm'});decoder.setWorkerLimit(1);
 const loader=new GLTFLoader().setDRACOLoader(decoder);
 const json=async path=>{const r=await fetch(new URL(path,base));if(!r.ok)throw Error('Hoops asset '+path+': '+r.status);return r.json();};
 let body;
 try{
  const loaded=await Promise.allSettled([loader.loadAsync(new URL('design/characters/basketball-player.glb',base).href),json('design/characters/rig.json'),json('design/motion/hoops.json'),json('design/viewer/retarget-map.json')]);
  body=loaded[0].status==='fulfilled'?loaded[0].value:null;const failed=loaded.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  const [,rig,motion,map]=loaded.map(r=>r.value);
  onProgress?.(.25);
  const baked=await bakeHoopsMotion(body.scene,rig,motion,map);onProgress?.(1);
  return {...baked,body,rig,base,dispose(){body.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}};
 }catch(error){body?.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});throw error;}finally{decoder.dispose();}
}
function bone(root,name){return root.getObjectByName(name)||null;}
export function createAvatar(assets,card,teamLook){
 const root=cloneSkinned(assets.body.scene);root.name='player-'+card.id;
 const mats=[];root.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
  o.material=o.material.clone();o.material.roughness=.75;mats.push(o.material);
  // Original purple/amber garment vertex colours become each club's colours. Skin stays intact.
  const geometry=o.geometry.clone(),src=geometry.getAttribute('color');o.geometry=geometry;
  const primary=new THREE.Color(teamLook.primary),trim=new THREE.Color(teamLook.trim||teamLook.secondary);
  if(src)for(let i=0;i<src.count;i++){const r=src.getX(i),g=src.getY(i),b=src.getZ(i);if(b>.12&&b>r*1.25&&b>g*1.3)src.setXYZ(i,primary.r,primary.g,primary.b);else if(r>.4&&g>.12&&b<g*.65)src.setXYZ(i,trim.r,trim.g,trim.b);}
 });
 root.scale.setScalar((card.ratings?.height||200)/160);
 const machine=createMotionMachine(root,assets);
 const hands={r:bone(root,'RightHand'),l:bone(root,'LeftHand')};
 return {root,hands,mixer:machine.mixer,actions:machine.actions,mats,kind:'design',pose(p,ctx,dt){machine.step(p,ctx,dt);},event:machine.event,
  get motionState(){return machine.state;},dispose(){machine.dispose();root.traverse(o=>{if(o.isMesh)o.geometry.dispose();if(o.isSkinnedMesh)o.skeleton.dispose();});for(const m of mats)m.dispose();}};
}
export {bone};
