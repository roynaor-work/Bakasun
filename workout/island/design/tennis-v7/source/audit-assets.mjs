// Independent inspection of decoded delivered GLBs, not authoring intermediates.
import fs from 'node:fs/promises';
import path from 'node:path';
import {root,json,writeJSON,io,sha,require,THREE as T} from './common.mjs';
const validator=require('gltf-validator');
const manifest=await json('manifest.json'),canonical=(await json('../motion2/soccer.json')).skeleton.bones;
await fs.mkdir(root+'/verification',{recursive:true});
function size(bytes,mime){
 const b=Buffer.from(bytes);
 if(mime==='image/png')return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
 if(mime==='image/jpeg'){
  for(let p=2;p<b.length;){if(b[p]!==255){p++;continue;}let mark=b[p+1];p+=2;if(mark===216||mark===217)continue;const len=b.readUInt16BE(p);
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(mark))return {width:b.readUInt16BE(p+5),height:b.readUInt16BE(p+3)};p+=len;}
 }
 throw Error('Unsupported embedded texture');
}
function rawJSON(bytes){const b=Buffer.from(bytes),len=b.readUInt32LE(12);return JSON.parse(b.subarray(20,20+len).toString());}
const records=[],failures=[];let textureGPUBytes=0;
for(const asset of manifest.assets){
 const bytes=await fs.readFile(root+'/'+asset.file),raw=rawJSON(bytes),doc=await io.readBinary(bytes),problems=[];
 if(bytes.length>1500000)problems.push('GLB over 1,500,000 bytes');
 if(sha(bytes)!==asset.sha256)problems.push('Manifest SHA mismatch');
 if(!raw.extensionsRequired?.includes('KHR_draco_mesh_compression'))problems.push('Draco must be required');
 const rawPrimitives=raw.meshes.flatMap(m=>m.primitives);
 if(!rawPrimitives.every(p=>p.extensions?.KHR_draco_mesh_compression))problems.push('Uncompressed primitive');
 const images=doc.getRoot().listTextures().map(t=>{const image=t.getImage(),dims=size(image,t.getMimeType());textureGPUBytes+=dims.width*dims.height*4*4/3;return {name:t.getName(),mime:t.getMimeType(),bytes:image.length,...dims,sha256:sha(image)};});
 if(images.some(t=>t.width>1024||t.height>1024))problems.push('Texture dimension over 1024');
 let triangles=0,vertices=0;const meshes=[];
 for(const node of doc.getRoot().listNodes())if(node.getMesh()){
  let count=0;for(const p of node.getMesh().listPrimitives()){
   const positions=p.getAttribute('POSITION');vertices+=positions.getCount();count+=(p.getIndices()?.getCount()??positions.getCount())/3;
   for(const semantic of p.listSemantics())if([...p.getAttribute(semantic).getArray()].some(v=>!Number.isFinite(v)))problems.push('Non-finite '+semantic);
   if(p.getAttribute('WEIGHTS_0')){
    const w=p.getAttribute('WEIGHTS_0'),j=p.getAttribute('JOINTS_0'),values=[];
    for(let i=0;i<w.getCount();i++){
     w.getElement(i,values);if(Math.abs(values.reduce((s,v)=>s+v,0)-1)>.00008)problems.push('Weight normalization');
     j.getElement(i,values);if(values.some(v=>v<0||v>=18))problems.push('Joint index outside canonical 18');
    }
   }
  }
  triangles+=count;meshes.push({name:node.getName(),triangles:count});
 }
 const clips=doc.getRoot().listAnimations().map(a=>({id:a.getName(),channels:a.listChannels().length,extras:a.getExtras()}));
 if(asset.kind==='character'){
  const skins=doc.getRoot().listSkins();if(skins.length!==1)problems.push('Expected one skin');
  const joints=skins[0].listJoints();
  if(joints.length!==18||joints.some((n,i)=>n.getName()!==canonical[i].name))problems.push('Canonical order/names mismatch');
  for(let i=0;i<joints.length;i++)if(joints[i].getParentNode()?.getName()!==(canonical[i].parent??undefined))problems.push('Canonical parent mismatch: '+joints[i].getName());
  if(images.length!==1)problems.push('Expected exactly one character atlas');
  if(clips.length!==9)problems.push('Expected nine embedded clips');
  const required=['idle','run','serve','forehand','backhand','volley','smash','slide','celebrate'];
  if(required.some(id=>!clips.some(c=>c.id===id)))problems.push('Missing motion');
  for(const a of doc.getRoot().listAnimations()){
   for(const channel of a.listChannels())if(channel.getTargetPath()==='rotation'){
    const data=channel.getSampler().getOutput().getArray();for(let i=0;i<data.length;i+=4){const n=Math.hypot(...data.slice(i,i+4));if(Math.abs(n-1)>.0001)problems.push('Non-unit quaternion');}
   }
   if(a.getName()==='serve'&&a.getExtras().events.length!==4)problems.push('Serve requires four event stages');
  }
 }
 const compressed=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:10000});
 // Decode and strip compression, then validate actual accessor contents too.
 for(const ext of [...doc.getRoot().listExtensionsUsed()])if(ext.extensionName==='KHR_draco_mesh_compression')ext.dispose();
 const decoded=await validator.validateBytes(await io.writeBinary(doc),{maxIssues:10000});
 if(compressed.issues.numErrors||decoded.issues.numErrors)problems.push('glTF validation errors');
 const fileName=path.basename(asset.file,'.glb');
 await writeJSON('verification/'+fileName+'-validator.json',{compressed:compressed.issues,decoded:decoded.issues});
 const record={file:asset.file,bytes:bytes.length,MB:bytes.length/1e6,sha256:sha(bytes),triangles,vertices,meshes,images,clips,
  validator:{compressedErrors:compressed.issues.numErrors,compressedWarnings:compressed.issues.numWarnings,decodedErrors:decoded.issues.numErrors,decodedWarnings:decoded.issues.numWarnings},problems:[...new Set(problems)]};
 records.push(record);if(problems.length)failures.push({file:asset.file,problems:record.problems});
 console.log(asset.file,bytes.length,'bytes',triangles,'tris',record.validator,record.problems);
}
await writeJSON('verification/assets.json',{generated:new Date().toISOString(),pass:failures.length===0,totalGLBBytes:records.reduce((s,r)=>s+r.bytes,0),estimatedAllTextureGPUBytesWithMipmaps:Math.round(textureGPUBytes),failures,assets:records});
if(failures.length)process.exitCode=1;
