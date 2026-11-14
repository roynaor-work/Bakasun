// SPDX-License-Identifier: CC0-1.0
// Full glTF schema validation and skin clearance from serialized delivery assets.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {loadAssets} from './verify.mjs';
import {unpack} from './glb.mjs';
import {skinGeometry,lowestSkinY} from './mesh-floor.mjs';

const require=createRequire(import.meta.url);
const validator=require(process.env.GLTF_VALIDATOR_MODULE||'gltf-validator');
const base=new URL('../',import.meta.url);
const {catalog,clips}=await loadAssets({fps:120});
const rows=[];
for(const clip of clips){
 const bytes=await readFile(new URL(clip.asset,base));
 const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:clip.asset,maxIssues:1000});
 const geometry=skinGeometry(unpack(bytes));
 let lowest={minimum:Infinity},atTime=0;
 for(const frame of clip.nativeFrames){
  const probe=lowestSkinY({hips:frame.joints.Hips,rotations:frame.localRotations},geometry);
  if(probe.minimum<lowest.minimum){lowest=probe;atTime=frame.t;}
 }
 const events=clip.metadata.events.filter(e=>e.type==='contact').map(event=>{
  const source=catalog.clips.find(c=>c.id===clip.id);
  const bounds=source.ballHeightRangeMeters??source.heightRangeMeters??source.contactGeometry?.heightRangeMeters;
  const f=clip.frames.reduce((a,b)=>Math.abs(b.t-event.time)<Math.abs(a.t-event.time)?b:a);
  return {time:event.time,frame:event.frame,ballCenterHeightMeters:f.ball?.[1]??null,declaredHeightRangeMeters:bounds??null};
 });
 rows.push({id:clip.id,asset:clip.asset,sha256:createHash('sha256').update(bytes).digest('hex'),
  validation:{errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos,messages:validation.issues.messages},
  skin:{fps:120,frames:clip.nativeFrames.length,vertexCount:geometry.length,minimumYMeters:lowest.minimum,atTimeSeconds:atTime,lowestVertex:lowest.vertex,influences:lowest.influences},events,
  passed:validation.issues.numErrors===0&&validation.issues.numWarnings===0&&lowest.minimum>=-.005});
}
const report={schemaVersion:1,validator:{name:'Khronos glTF Validator',version:validator.version()},
 method:'Validate the final GLB bytes. Evaluate all mesh vertices with their exact inverse bind matrices and exported parent-local rotations at 120Hz, plus event/support boundaries. Floor tolerance 5mm accounts for skin seams; no root correction is applied.',
 summary:{clips:rows.length,errors:rows.reduce((n,r)=>n+r.validation.errors,0),warnings:rows.reduce((n,r)=>n+r.validation.warnings,0),minimumSkinYMeters:Math.min(...rows.map(r=>r.skin.minimumYMeters)),passed:rows.every(r=>r.passed)},clips:rows};
await mkdir(new URL('verification/',base),{recursive:true});
await writeFile(new URL('verification/assets.json',base),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary,null,2));
if(!report.summary.passed)process.exitCode=1;
