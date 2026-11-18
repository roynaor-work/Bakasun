// SPDX-License-Identifier: CC0-1.0
// Measure the actual embedded glTF channels, never the authoring targets.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const {sampleGLB}=await import(new URL('./glb.mjs',pathToFileURL(process.env.TENNIS_QA_CLI)).href);
const root=new URL('../',import.meta.url);
export const SOURCES=[{id:'tennis-grip-v1',sport:'tennis',version:1,ref:'codex/tennis-grip-v1',kind:'local-native-GLB',path:'workout/island/design/tennis-grip-v1/runtime/player.glb',license:'CC0-1.0'}];
export async function loadLibraries({fps=120}={}){
 const catalog=JSON.parse(await fs.readFile(new URL('runtime/catalog.json',root))),bytes=await fs.readFile(new URL('runtime/player.glb',root));
 const clips=catalog.clips.map(entry=>{
  const extraTimes=[...entry.metadata.events.map(e=>e.time),...entry.metadata.supports.flatMap(s=>[s.start,s.end])];
  const native=sampleGLB(bytes,{animation:entry.id,fps,extraTimes});
  // The file is in place. Only run_side is presented in an explicitly declared,
  // external constant-speed scenario, as a host would translate the character.
  // Raw coordinates remain available for pops, anatomy and transition checks.
  for(const f of native.frames){
   f.localJoints=structuredClone(f.joints);f.assetRoot=[...f.root];
   if(entry.metadata.referenceTravel){
    const {speed,direction}=entry.metadata.referenceTravel,travel=direction.map(v=>v*speed*f.t);
    f.referenceRoot=travel;f.root=travel;
    f.joints=Object.fromEntries(Object.entries(f.joints).map(([name,p])=>[name,p.map((v,i)=>v+travel[i])]));
    f.floorPoints=f.floorPoints.map(p=>({...p,position:p.position.map((v,i)=>v+travel[i])}));
   }
  }
  return {id:entry.id,motionId:entry.id,label:entry.label,role:'tennis',duration:native.duration,height:native.height,metadata:structuredClone(entry.metadata),frames:native.frames};
 });
 return [{...SOURCES[0],source:SOURCES[0],sources:[{path:SOURCES[0].path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),provenance:'Native GLB: original tennis motion, original rigid racket and hands, reused licensed CC0 body.'}],clips}];
}
