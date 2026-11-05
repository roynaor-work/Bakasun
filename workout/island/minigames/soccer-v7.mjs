import * as T from '../vendor/three.module.js';
import {nearDetailPlayers} from './soccer-presentation.mjs';

/** GPT soccer-v7 characters: three identities (team A outfield, team B outfield,
 * keeper), each with a near mesh (~12K triangles, textured atlas: GPT LOD0 simplified,
 * because 35K does not fit the 130K scene budget) and GPT's LOD1 (~5.8K, no textures of
 * its own) under assets/soccer-v7, built by tools/soccer-v7-build.mjs (embedded clips
 * removed). At load the five primitives are joined into one draw call per mesh.
 * The v7 bind pose IS the canonical source rest pose (identity local rotations,
 * hips 0.86 m), so the retarget map is the identity and motionScale is 1. */
export const SOCCER_V7_FILES={outfield:['player-01','player-04'],keeper:'goalkeeper'};
export const soccerV7Url=(name,lod)=>new URL(`../assets/soccer-v7/${name}-${lod?'far':'near'}.glb`,import.meta.url).href;
export const soccerV7ClipsUrl=()=>new URL('../assets/soccer-v7/clips.json',import.meta.url).href;
/** Most players that may show the near mesh at once: 3 x 12K + 9 x 5.8K + world (~37K) stays below config.view.maxTriangles (130K). */
export const SOCCER_V7_FULL_DETAIL=3;
const SOURCE_BONES=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];

/** Identity world-basis map for the 18 v7 joints (see above). */
export function soccerV7Map(map){
  const sources=new Map(map.bones.filter(b=>b.source).map(b=>[b.source,b]));
  return {...map,motionScale:1,bones:SOURCE_BONES.map(name=>{
    const entry=sources.get(name);if(!entry)throw Error('Soccer v7 map: no source bone '+name);
    return {...entry,source:name,target:name,inheritSource:null,targetBasisWorldQuaternion:[0,0,0,1]};
  }),targetBoneCount:SOURCE_BONES.length};
}

/** A rig description read from the loaded skeleton, in the shape compileSoccerDesignClips expects. */
export function soccerV7Rig(scene){
  let mesh=null;scene.traverse(o=>{if(!mesh&&o.isSkinnedMesh)mesh=o;});
  if(!mesh)throw Error('Soccer v7 GLB has no skinned mesh');
  const bones=mesh.skeleton.bones;
  return {joints:bones.map((bone,i)=>({name:bone.name,parent:bone.parent?.isBone?bone.parent.name:null,translation:bone.position.toArray(),rotation:bone.quaternion.toArray(),scale:bone.scale.toArray(),inverseBindMatrix:mesh.skeleton.boneInverses[i].toArray()}))};
}

/** The v7 invariant the identity retarget depends on: every bind rotation is identity and every bind
 * translation equals the canonical source rest translation. Throws a named error otherwise. */
export function validateSoccerV7Bind(scene,sourceBones,tolerance=1e-4){
  const rest=new Map(sourceBones.map(b=>[b.name,b.restTranslationMeters]));
  let mesh=null,meshes=0;scene.traverse(o=>{if(o.isSkinnedMesh){meshes++;mesh=mesh||o;}});
  if(meshes!==1)throw Error(`Soccer v7 GLB must be one skinned mesh, found ${meshes}`);
  const bones=mesh.skeleton.bones;
  if(bones.length!==SOURCE_BONES.length||bones.some((b,i)=>b.name!==SOURCE_BONES[i]))throw Error('Soccer v7 skeleton order mismatch');
  for(const bone of bones){
    const r=rest.get(bone.name);
    if(!r||bone.position.distanceTo(new T.Vector3().fromArray(r))>tolerance||Math.abs(bone.quaternion.w)<1-tolerance)throw Error('Soccer v7 bind mismatch: '+bone.name);
  }
}

/** Small per-actor variation so a team is not twelve clones: height within +-3%, a faint warm/cool tint.
 * Free in cost (a root scale and a material colour). */
export function soccerV7Variation(id){
  const h=((id*7)%5-2)*.015,t=((id*3)%5-2)*.018;
  return {scale:1+h,tint:[1+t,1,1-t]};
}

/** Which actors get the LOD0 mesh this frame. Priority actors (focus, controlled, ball owner, anyone mid action)
 * first, then the players nearest the camera focus (sticky near the boundary); never more than `cap`. */
export function soccerV7FullDetail(players,focus,priority,cap=SOCCER_V7_FULL_DETAIL,previous=null){
  const full=new Set();
  for(const id of priority){if(full.size>=cap)break;if(id!==null&&id!==undefined&&players.some(p=>p.id===id))full.add(id);}
  if(full.size<cap){
    const rest=players.filter(p=>!full.has(p.id)),near=nearDetailPlayers(rest,focus,cap-full.size,previous);
    for(const id of near){if(full.size>=cap)break;full.add(id);}
  }
  return full;
}

const JOIN_ATTRIBUTES=[['position',Float32Array,3],['normal',Float32Array,3],['uv',Float32Array,2],['skinIndex',Uint16Array,4],['skinWeight',Float32Array,4]];
/** Concatenate indexed skinned geometries (Draco decoding hands back different integer widths per primitive,
 * and morph targets are not wanted). Only the attributes the game uses are kept. */
export function concatSkinnedGeometries(geometries){
  const out=new T.BufferGeometry(),vertices=geometries.reduce((n,g)=>n+g.attributes.position.count,0),indices=geometries.reduce((n,g)=>n+g.index.count,0);
  for(const [name,Type,size] of JOIN_ATTRIBUTES){
    const array=new Type(vertices*size);let at=0;
    for(const g of geometries){const a=g.attributes[name];if(!a||a.itemSize!==size)throw Error('Soccer v7 primitive lacks '+name);for(let i=0;i<a.count;i++)for(let k=0;k<size;k++)array[at++]=a.getComponent(i,k);}
    out.setAttribute(name,new T.BufferAttribute(array,size));
  }
  const index=vertices>65535?new Uint32Array(indices):new Uint16Array(indices);let at=0,base=0;
  for(const g of geometries){for(let i=0;i<g.index.count;i++)index[at++]=g.index.getX(i)+base;base+=g.attributes.position.count;}
  out.setIndex(new T.BufferAttribute(index,1));
  return out;
}

/** The five GPT primitives (skin, cloth, eyes, hair cards, cornea) all sample the same three atlas
 * textures, so they are joined into ONE skinned mesh with the skin material, alpha-masked at the
 * hair-card cutoff: one draw call per character instead of five (the game budget is 90 calls with
 * twelve players plus shadows). The cornea clearcoat layer goes with it. Mutates the scene. */
export function joinSoccerV7Meshes(scene,{doubleSided=null}={}){
  const meshes=[];scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
  if(!meshes.length)throw Error('Soccer v7 GLB has no skinned mesh');
  const [host,...rest]=meshes,material=Array.isArray(host.material)?host.material[0]:host.material;
  host.geometry=meshes.length>1?concatSkinnedGeometries(meshes.map(m=>m.geometry)):host.geometry;
  if(!host.geometry)throw Error('Soccer v7 primitives do not share one attribute set');
  for(const m of rest){m.removeFromParent();m.geometry.dispose();}
  host.geometry.computeBoundingBox();host.geometry.computeBoundingSphere();
  material.alphaTest=.25;material.transparent=false;material.side=(doubleSided??meshes.some(m=>(Array.isArray(m.material)?m.material[0]:m.material).side===T.DoubleSide))?T.DoubleSide:T.FrontSide;
  material.roughness=1;material.metalness=0;
  host.material=material;host.name=host.name.replace(/-lod\d$/,'')||host.name;
  return host;
}
