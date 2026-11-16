// SPDX-License-Identifier: CC0-1.0
// Supplementary 480 Hz world-space audit of native GLB SLERP/LINEAR intervals.
// Original motion-qa-v1 scores and thresholds are never modified.
import {readFile,writeFile,mkdir,mkdtemp,symlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(base,'../../../..');
const pinned='5eb4f093bc22523ee417a7f2345c3b813bffba24';
const sourcePath='workout/island/design/motion-qa-v1/glb.mjs';
const workspace=await mkdtemp(path.join(tmpdir(),'soccer-dense-support-'));
const qaRoot=path.join(workspace,'motion-qa-v1');
await mkdir(qaRoot,{recursive:true});
const reader=execFileSync('git',['show',`${pinned}:${sourcePath}`],{cwd:repo,maxBuffer:4*1024*1024});
await writeFile(path.join(qaRoot,'glb.mjs'),reader);
await mkdir(path.join(workspace,'soccer-motion-v8/runtime'),{recursive:true});
await symlink(path.join(repo,'workout/island/design/soccer-motion-v8/runtime/vendor'),path.join(workspace,'soccer-motion-v8/runtime/vendor'),'dir');
process.env.SOCCER_RUN_CYCLES_QA_ROOT=qaRoot;
const {loadMotionAssets}=await import('../qa-sources.mjs');
const {clips,records}=await loadMotionAssets({fps:480});
const hash=b=>createHash('sha256').update(b).digest('hex');
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const rotate=(v,q)=>{const [x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];};
const point=(f,w)=>{const v=rotate(w.local??[0,-.08,0],f.rotations[w.bone]);return f.joints[w.bone].map((x,i)=>x+v[i]);};
const results=clips.map(clip=>{
 const supports=clip.metadata.supports.map(w=>{
  const frames=clip.frames.filter(f=>f.t>=w.start-1e-6&&f.t<=w.end+1e-6);
  const first=clip.frames.reduce((a,b)=>Math.abs(a.t-w.start)<Math.abs(b.t-w.start)?a:b);
  const anchor=point(first,w);let worst=null,maxSpatialDriftMeters=0,maxHorizontalDriftMeters=0;
  for(const f of frames){const sole=point(f,w),drift=distance(sole,anchor),horizontal=Math.hypot(sole[0]-anchor[0],sole[2]-anchor[2]);maxHorizontalDriftMeters=Math.max(maxHorizontalDriftMeters,horizontal);if(!worst||drift>maxSpatialDriftMeters){maxSpatialDriftMeters=drift;worst={time:f.t,sole,anchor};}}
  return {bone:w.bone,start:w.start,end:w.end,samples:frames.length,maxSpatialDriftMeters,maxHorizontalDriftMeters,worst,passed:frames.length>=2&&maxSpatialDriftMeters<.02};
 });
 return {id:clip.id,samples:clip.frames.length,supports,maxSpatialDriftMeters:Math.max(0,...supports.map(w=>w.maxSpatialDriftMeters)),maxHorizontalDriftMeters:Math.max(0,...supports.map(w=>w.maxHorizontalDriftMeters)),passed:supports.length>0&&supports.every(w=>w.passed)};
});
const output={schemaVersion:1,purpose:'Supplementary dense support audit of actual exported GLB interpolation between 120 Hz keys; original QA scores remain unchanged.',qaCommit:pinned,reader:{path:sourcePath,sha256:hash(reader)},adapterSha256:hash(await readFile(path.join(base,'qa-sources.mjs'))),measurementRateHz:480,nativeRateHz:120,intervalSubdivisions:4,coordinateSpace:'World sole point after native GLB interpolation plus declared simulation-owned trajectory, applied once.',soleProbeMeters:[0,-.08,0],limitMeters:.02,inputRecords:records,clips:results.length,totalSampledPoses:results.reduce((s,c)=>s+c.samples,0),maxSpatialDriftMeters:Math.max(...results.map(c=>c.maxSpatialDriftMeters)),maxHorizontalDriftMeters:Math.max(...results.map(c=>c.maxHorizontalDriftMeters)),results,passed:results.length===17&&results.every(c=>c.passed)};
await writeFile(path.join(base,'verification/dense-support.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({clips:output.clips,measurementRateHz:output.measurementRateHz,totalSampledPoses:output.totalSampledPoses,maxSpatialDriftMeters:output.maxSpatialDriftMeters,passed:output.passed}));
if(!output.passed)process.exitCode=1;
