// SPDX-License-Identifier: CC0-1.0
// Only the library reader is adapted; the official sampler and metric code are unchanged.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url));
const source={id:'firefighter-v1',sport:'rescue',version:'firefighter-v1',ref:'codex/firefighter-v1',
  commit:process.env.FIREFIGHTER_SOURCE_COMMIT??'working-tree',path:'workout/island/design/firefighter-v1'};
export const SOURCES=Object.freeze([source]);
export async function loadLibraries({fps=120}={}){
  const qa=process.env.FIREFIGHTER_QA_ROOT;
  if(!qa)throw Error('Use measure.mjs to prepare the pinned original QA tool.');
  const {sampleGLB}=await import(pathToFileURL(path.join(qa,'glb.mjs')).href);
  const manifest=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'));
  const bytes=await readFile(path.join(base,manifest.motions.path));
  const clips=[];
  for(const entry of manifest.motions.clips){
    const native=sampleGLB(bytes,{animation:entry.animation,fps,extraTimes:[...entry.events.map(e=>e.time),...entry.supports.flatMap(w=>[w.start,w.end])]});
    for(const f of native.frames){
      // Preserve the genuine in-place pose for continuity, pops and symmetry.
      // Apply the declared game travel to world probes for full-stance foot drift.
      f.localJoints=structuredClone(f.joints);f.assetRoot=[...f.root];
      f.referenceRoot=[0,0,entry.locomotion?entry.speed*f.t:0];
      for(const p of Object.values(f.joints))p[2]+=f.referenceRoot[2];
      for(const p of f.floorPoints)p.position[2]+=f.referenceRoot[2];
      f.root=[...f.joints.Root];
    }
    clips.push({id:entry.id,motionId:entry.id,label:entry.label,duration:native.duration,height:native.height,role:entry.role,
      metadata:{...entry,ballVisible:false,ballContacts:[],sourceAsset:manifest.motions.path,coordinateSpace:'Native canonical metres + explicit constant-speed locomotion reference; raw in-place poses retained.'},frames:native.frames});
  }
  const records=[{path:source.path+'/'+manifest.motions.path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}];
  return [{...source,source,clips,sources:records}];
}
