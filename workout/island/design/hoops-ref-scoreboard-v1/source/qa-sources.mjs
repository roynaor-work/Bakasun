// SPDX-License-Identifier: CC0-1.0
// Native asset adapter only: poses, travel, feet and rotations are decoded from each delivered GLB.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const {sampleGLB}=await import(new URL('./glb.mjs',process.env.HOOPS_REF_QA_CLI).href);
export const SOURCES=[{id:'hoops-ref-scoreboard-v1',sport:'hoops',version:1,ref:'codex/hoops-ref-scoreboard-v1',commit:process.env.HOOPS_REF_SOURCE_COMMIT??'working-tree',path:'workout/island/design/hoops-ref-scoreboard-v1',kind:'original-native-GLB'}];
export async function loadLibraries({fps=60}={}){
 const motions=JSON.parse(await readFile(new URL('motion/motions.json',root))),sources=[],clips=[];
 const finalAsset='models/referee.glb', finalBytes=await readFile(new URL(finalAsset,root));
 sources.push({path:SOURCES[0].path+'/'+finalAsset,sha256:createHash('sha256').update(finalBytes).digest('hex'),bytes:finalBytes.length,provenance:'final shipped skinned referee GLB; each named animation is decoded directly'});
 for(const entry of motions.clips){
  const extraTimes=[...entry.metadata.events.map(e=>e.time),...entry.metadata.supports.flatMap(s=>[s.start,s.end])];
  const native=sampleGLB(finalBytes,{animation:entry.id,fps,extraTimes});
  for(const f of native.frames){f.soles=Object.fromEntries(f.floorPoints.map(p=>[p.bone,p.position]));f.localJoints=structuredClone(f.joints);f.assetRoot=[...f.root];}
  clips.push({id:entry.id,motionId:entry.id,label:entry.label,role:'referee',duration:native.duration,height:native.height,metadata:{...entry.metadata,sourceAsset:finalAsset,animationName:entry.id},frames:native.frames});
 }
 return [{...SOURCES[0],source:SOURCES[0],sources,clips}];
}
