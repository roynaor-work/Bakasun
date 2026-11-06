/** Bake controlled ball centers from the same float32, linearly interpolated
 * bone tracks written into the GLBs. A glove catch or foot cushion remains
 * attached to its actual effector between the calibrated contact and release.
 * These are reference trajectories; game-side ball physics can replace them. */
import * as THREE from '../runtime/vendor/three.module.js';
import {loadNativeGLTF} from '../verification/glb-reader.mjs';

const qa=new THREE.Quaternion(),qb=new THREE.Quaternion();
const pa=new THREE.Vector3(),pb=new THREE.Vector3();

function poseAt(motion,time,actor,bones){
 const frames=motion.frames;
 let hi=frames.findIndex(frame=>Math.fround(frame.time)>=time);
 if(hi<0)hi=frames.length-1;
 const lo=Math.max(0,hi-1),a=frames[lo],b=frames[hi];
 const t0=Math.fround(a.time),t1=Math.fround(b.time);
 const u=t1>t0?Math.max(0,Math.min(1,(time-t0)/(t1-t0))):0;
 for(const [name,bone] of bones){
  qa.fromArray(a.rotations[name].map(Math.fround));
  qb.fromArray(b.rotations[name].map(Math.fround));
  bone.quaternion.copy(qa).slerp(qb,u);
 }
 pa.fromArray(a.hips.map(Math.fround));
 pb.fromArray(b.hips.map(Math.fround));
 bones.get('Hips').position.copy(pa).lerp(pb,u);
 actor.updateMatrixWorld(true);
}

export async function bakeHeldPaths(motions,sourceFiles){
 let total=0;
 for(const role of ['field','keeper']){
  const chosen=motions.filter(m=>m.metadata.role===role&&(
   role==='keeper'&&m.metadata.id!=='keeper_ready'||m.metadata.id==='receive_foot'));
  if(!chosen.length)continue;
  const gltf=await loadNativeGLTF(sourceFiles[role]),bones=new Map();
  gltf.scene.traverse(node=>{if(node.isBone)bones.set(node.name,node);});
  for(const motion of chosen){
   const clip=motion.metadata;
   const contact=clip.events.find(event=>event.type==='contact'&&(
    clip.id!=='keeper_throw'||event.bone==='RightHand'));
   const release=clip.events.find(event=>event.type==='release');
   if(!contact||!release)continue;
   const effector=bones.get(contact.bone);
   poseAt(motion,contact.time,gltf.scene,bones);
   const offset0=new THREE.Vector3().fromArray(contact.sourceCenter)
    .applyMatrix4(effector.matrixWorld.clone().invert());
   poseAt(motion,release.time,gltf.scene,bones);
   const offset1=new THREE.Vector3().fromArray(release.sourceCenter)
    .applyMatrix4(effector.matrixWorld.clone().invert());
   const count=Math.ceil((release.time-contact.time)*120);
   const times=[...new Set([contact.time,release.time,
    ...Array.from({length:count},(_,i)=>contact.time+i/120)])]
    .filter(time=>time>=contact.time&&time<=release.time).sort((a,b)=>a-b);
   const keys=[];
   for(const time of times){
    poseAt(motion,time,gltf.scene,bones);
    const u=(time-contact.time)/(release.time-contact.time);
    const center=offset0.clone().lerp(offset1,u).applyMatrix4(effector.matrixWorld);
    if(center.y<clip.ball.radius-.00005)throw Error(`Held ball below floor: ${clip.id}/${time}`);
    keys.push({time,position:center.toArray()});
   }
   clip.ball.keys=[...clip.ball.keys.filter(key=>key.time<contact.time-1e-8),
    ...keys,...clip.ball.keys.filter(key=>key.time>release.time+1e-8)]
    .sort((a,b)=>a.time-b.time);
   total+=keys.length;
  }
 }
 console.log(`Baked ${total} controlled-ball samples from native hand/foot transforms`);
}
