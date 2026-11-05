#!/usr/bin/env node
/** Install an explicitly reviewed staged roster without decoding its Draco BIN. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stage=path.resolve(root,process.argv[2]||'source/character-candidates24-final');
if(!stage.startsWith(root+path.sep))throw Error('Stage must be inside the new character package');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await fs.readFile(path.join(stage,'asset-manifest.json'),'utf8'));
const ids=['player-01','player-02','player-03','player-04','player-05','player-06','goalkeeper','referee'];
if(JSON.stringify(manifest.characters.map(c=>c.id).sort())!==JSON.stringify([...ids].sort()))throw Error('Expected complete eight-identity roster');
const roles=manifest.characters.map(c=>c.role);if(roles.filter(r=>r==='field').length!==6||roles.filter(r=>r==='goalkeeper').length!==1||roles.filter(r=>r==='referee').length!==1)throw Error('Role inventory mismatch');
const files=new Map(),records=[];
for(const person of manifest.characters)for(const kit of person.kits){
 for(const lod of ['lod0','lod1']){
  const relative=kit[lod];if(relative!==`models/${person.id}-${lod}.glb`)throw Error('Unexpected model path');
  const b=await fs.readFile(path.join(stage,relative));if(b.length>1500000||sha(b)!==kit[lod+'Sha256']||b.length!==kit[lod+'Bytes'])throw Error('Stage integrity/budget mismatch '+relative);
  if(b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(8)!==b.length)throw Error('Invalid GLB container');
  const doc=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  if(!doc.extensionsRequired?.includes('KHR_draco_mesh_compression'))throw Error('Expected Draco GLB');
  const modelDir=path.dirname(path.join(root,relative));
  if(path.resolve(modelDir,doc.extras.canonicalRigPath)!==path.join(root,'rig.json')||path.resolve(modelDir,doc.extras.canonicalSkeleton)!==path.resolve(root,'../../motion2/soccer.json'))throw Error('Canonical extras are not pre-encoded for the final installation path');
  files.set(relative,b);records.push({file:relative,bytes:b.length,sha256:sha(b),triangles:kit[lod+'Triangles']});
 }
 for(const relative of Object.values(kit.textures)){if(!relative.startsWith('textures/')||relative.includes('..'))throw Error('Unexpected texture path');files.set(relative,await fs.readFile(path.join(stage,relative)));}
}
if(records.length!==16||files.size!==40)throw Error('Expected 16 unique GLBs and 24 shared images');
// Everything above is read-only. The install starts only after the full batch validates.
for(const [relative,b]of files){const dest=path.join(root,relative);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,b);}
manifest.authoring={...manifest.authoring,promotedFrom:path.relative(root,stage).split(path.sep).join('/'),promotionPreservedStagedGlbBytes:true};
await fs.writeFile(path.join(root,'asset-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(root,'source/character-promotion-report.json'),JSON.stringify({kind:'reviewed-staged-roster-byte-preserving-install',generatedAt:new Date().toISOString(),stage:path.relative(root,stage),filesInstalled:files.size,models:records,stagedCompressedBytesPreserved:true,notes:'No geometry decode/re-encode, material edit, runtime bundle write or native embedding. Native clips, model-bound boot/floor proofs and final runtime audits must follow the install.'},null,2)+'\n');
console.log(JSON.stringify({installed:records.length,images:files.size-records.length,largest:Math.max(...records.map(r=>r.bytes)),nativeEmbeddingRequired:true}));
