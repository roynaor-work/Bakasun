// SPDX-License-Identifier: CC0-1.0. Native GLB input adapter for the unmodified motion-qa-v1 CLI.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),qa=new URL('./glb.mjs',process.env.KEEPER_QA_CLI);
const {sampleGLB}=await import(qa.href);
export const SOURCES=[{id:'soccer-keeper-crowd-v1',sport:'soccer',version:1,ref:'codex/motion-fix-v12 (bind rig only); original reactions in this bundle',commit:'5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad',path:'workout/island/design/motion-fix-v12',kind:'local-native-GLB'}];
export async function loadLibraries({fps=60}={}){
 const catalog=JSON.parse(await readFile(new URL('runtime/catalog.json',root))),sources=[],clips=[];
 for(const entry of [catalog.idleReference,...catalog.clips]){
  const bytes=await readFile(new URL(entry.animation,root));
  const extraTimes=[...entry.metadata.events.map(e=>e.time),...entry.metadata.supports.flatMap(s=>[s.start,s.end])];
  const native=sampleGLB(bytes,{animation:entry.id,fps,extraTimes});
  // The original reader returns actual world-space soles; retain them for support QA.
  for(const f of native.frames){f.soles=Object.fromEntries(f.floorPoints.map(p=>[p.bone,p.position]));f.localJoints=structuredClone(f.joints);f.assetRoot=[...f.root];}
  sources.push({path:`workout/island/design/soccer-keeper-crowd-v1/${entry.animation}`,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,provenance:'original authored clip; exact asset measured below'});
  clips.push({id:entry.id,motionId:entry.id,label:entry.metadata.label,role:'keeper',duration:entry.duration,height:native.height,metadata:{...entry.metadata,sourceAsset:entry.animation},frames:native.frames});
 }
 return [{id:SOURCES[0].id,sport:'soccer',version:1,source:SOURCES[0],sources,clips}];
}
