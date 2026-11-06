/** Bake physical event points from the actual Draco-decoded skinned surfaces.
 * All positions are actor-local metres; this authoring step never runs in-game.
 */
import * as THREE from '../runtime/vendor/three.module.js';
import {loadNativeGLTF} from '../verification/glb-reader.mjs';
const R=.11;
const scratch=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),candidate=new THREE.Vector3();
const triangle=new THREE.Triangle(a,b,c);
const regionNames=bone=>new Set(bone.endsWith('Foot')?[bone,bone.replace('Foot','Leg')]:bone==='Chest'?['Chest','Spine']:[bone,bone.replace('Hand','ForeArm')]);
function cacheSurface(meshes,names){
 const result=[];
 for(const mesh of meshes){
  mesh.skeleton.update();const g=mesh.geometry,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,pos=[];
  for(let i=0;i<g.attributes.position.count;i++){mesh.getVertexPosition(i,scratch).applyMatrix4(mesh.matrixWorld);let w=0;for(let k=0;k<4;k++)if(names.has(mesh.skeleton.bones[si.getComponent(i,k)]?.name))w+=sw.getComponent(i,k);pos.push({p:scratch.toArray(),w});}
  const length=g.index?g.index.count:pos.length;
  for(let i=0;i<length;i+=3){const ids=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k),vertices=ids.map(i=>pos[i]),weights=vertices.map(v=>v.w);result.push({points:vertices.map(v=>v.p),region:Math.max(...weights)>=.5||weights.reduce((a,b)=>a+b)/3>=.25,mesh:mesh.name,triangle:i/3});}
 }
 return result;
}
function nearest(center,surface,onlyRegion=false){let d=Infinity,point,hit;
 for(const entry of surface){if(onlyRegion&&!entry.region)continue;a.fromArray(entry.points[0]);b.fromArray(entry.points[1]);c.fromArray(entry.points[2]);triangle.closestPointToPoint(center,candidate);const q=candidate.distanceToSquared(center);if(q<d){d=q;point=candidate.clone();hit=entry;}}
 return {distance:Math.sqrt(d),point,hit};
}
export async function calibrateContacts(motions,sourceFiles){
 const diagnostics=[];
 for(const role of ['field','keeper']){
  const gltf=await loadNativeGLTF(sourceFiles[role]),actor=gltf.scene,bones=new Map(),meshes=[];
  actor.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh)meshes.push(n);});
  for(const motion of motions.filter(m=>m.metadata.role===role))for(const event of motion.metadata.events.filter(e=>e.type==='contact'||e.type==='release')){
   const frame=motion.frames.find(f=>Math.abs(f.time-event.time)<2e-7);if(!frame)throw Error(`No exact native cue frame ${motion.metadata.id}/${event.time}`);
   for(const[name,bone]of bones)if(frame.rotations[name])bone.quaternion.fromArray(frame.rotations[name].map(Math.fround));bones.get('Hips').position.fromArray(frame.hips.map(Math.fround));actor.updateMatrixWorld(true);
   const surface=cacheSurface(meshes,regionNames(event.bone));
   if(role==='keeper'){
    const ballKeys=motion.metadata.ball.keys,upper=ballKeys.findIndex(k=>k.time>=event.time);let center;
    if(upper<=0)center=new THREE.Vector3().fromArray(ballKeys[upper<0?ballKeys.length-1:0].position);
    else{const lo=ballKeys[upper-1],hi=ballKeys[upper];center=new THREE.Vector3().fromArray(lo.position).lerp(new THREE.Vector3().fromArray(hi.position),(event.time-lo.time)/(hi.time-lo.time));}
    const regional=nearest(center,surface,true),global=nearest(center,surface);
    if(R-global.distance>.002)throw Error(`Physical whole-body overlap exceeds 2mm for ${motion.metadata.id}/${event.type}: ${R-global.distance}`);
    if(regional.distance>R+.0001)throw Error(`Keeper glove misses physical sphere ${motion.metadata.id}: ${regional.distance}`);
    let bestPoint,bestDistance=Infinity;
    // A soft glove can compress by under 2mm. Select the exact intersection
    // of its real triangle and the ball surface, rather than an interior point.
    for(const entry of surface){if(!entry.region)continue;a.fromArray(entry.points[0]);b.fromArray(entry.points[1]);c.fromArray(entry.points[2]);triangle.closestPointToPoint(center,candidate);if(candidate.distanceTo(center)>R)continue;
     const outer=entry.points.map(p=>new THREE.Vector3().fromArray(p)).sort((a,b)=>b.distanceToSquared(center)-a.distanceToSquared(center))[0];if(outer.distanceTo(center)<R)continue;
     const inner=candidate.clone();let lo=0,hi=1;for(let i=0;i<36;i++){const mid=(lo+hi)/2;if(inner.clone().lerp(outer,mid).distanceTo(center)<R)lo=mid;else hi=mid;}const actual=inner.lerp(outer,(lo+hi)/2),distance=actual.distanceToSquared(regional.point);if(distance<bestDistance){bestDistance=distance;bestPoint=actual;}
    }
    if(!bestPoint)throw Error(`No physical glove/sphere intersection for ${motion.metadata.id}`);
    const local=bestPoint.clone().applyMatrix4(bones.get(event.bone).matrixWorld.clone().invert());Object.assign(event,{local:local.toArray(),position:bestPoint.toArray(),normal:center.clone().sub(bestPoint).normalize().toArray(),sourceCenter:center.toArray()});
    diagnostics.push({id:motion.metadata.id,type:event.type,time:event.time,bone:event.bone,center:center.toArray(),point:bestPoint.toArray(),compression:R-regional.distance});continue;
   }
   const oldCenter=new THREE.Vector3().fromArray(event.sourceCenter??event.position.map((v,i)=>v+(i===2?R:0)));oldCenter.y=Math.max(R,oldCenter.y);
   // Approach from a known exterior point and retain the last collision on
   // the intended exit ray. This avoids selecting a back wall from inside.
   const direction=new THREE.Vector3(...(motion.metadata.id==='cut'?[.78,0,.63]:[0,0,1])).normalize();
   let outside=.8;while(nearest(oldCenter.clone().addScaledVector(direction,outside),surface).distance<R&&outside<1.6)outside+=.1;
   let low=outside-.02;while(low>-.5&&nearest(oldCenter.clone().addScaledVector(direction,low),surface).distance>=R)low-=.02;
   if(low<=-.5)throw Error(`No effector collision on exit ray for ${motion.metadata.id}`);
   outside=low+.02;
   for(let i=0;i<35;i++){const mid=(low+outside)/2,probe=oldCenter.clone().addScaledVector(direction,mid);if(nearest(probe,surface).distance<R)low=mid;else outside=mid;}
   const center=oldCenter.clone().addScaledVector(direction,outside),closest=nearest(center,surface),regional=nearest(center,surface,true);
   if(!closest.hit.region)throw Error(`Physical contact belongs to the wrong limb for ${motion.metadata.id}`);
   if(Math.abs(regional.distance-R)>.003)throw Error(`Contact escaped ${event.bone} region for ${motion.metadata.id}: ${regional.distance}`);
   const local=closest.point.clone().applyMatrix4(bones.get(event.bone).matrixWorld.clone().invert()),normal=center.clone().sub(closest.point).normalize();
   Object.assign(event,{local:local.toArray(),position:closest.point.toArray(),normal:normal.toArray(),sourceCenter:center.toArray()});
   diagnostics.push({id:motion.metadata.id,type:event.type,time:event.time,bone:event.bone,center:center.toArray(),point:closest.point.toArray(),mesh:closest.hit.mesh,triangle:closest.hit.triangle,error:Math.abs(closest.distance-R)});
  }
 }
 return diagnostics;
}
