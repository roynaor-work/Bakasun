#!/usr/bin/env node
/** Portable per-groom hair-side patch after actual phone-side ablation. No geometry decode. */
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=path.resolve(root,process.argv[2]||'source/character-candidates23-final');const output=path.resolve(root,process.argv[3]||'source/character-candidates24-final');
if(input===output||![input,output].every(p=>p.startsWith(root+path.sep)))throw Error('Two distinct isolated package folders required');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');const manifest=JSON.parse(await fs.readFile(path.join(input,'asset-manifest.json'),'utf8'));if(manifest.characters.length!==8)throw Error('Complete eight-identity stage required');
const records=[];
for(const c of manifest.characters)for(const k of c.kits){
 for(const file of Object.values(k.textures)){const dest=path.join(output,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(input,file),dest);}
 for(const lod of ['lod0','lod1']){
  const file=k[lod],before=await fs.readFile(path.join(input,file));if(digest(before)!==k[lod+'Sha256'])throw Error('Stage hash mismatch');const length=before.readUInt32LE(12);const doc=JSON.parse(before.subarray(20,20+length).toString());const binary=before.subarray(28+length);const invariant=JSON.stringify([doc.nodes,doc.skins,doc.meshes,doc.accessors,doc.bufferViews,doc.buffers,doc.images,doc.textures,doc.extensionsUsed,doc.extensionsRequired]);
  const material=doc.materials.find(m=>m.name==='HairCards');if(!material||material.alphaMode!=='MASK')throw Error('Expected alpha-mask hair');const doubleSided=c.design?.hair==='coils';material.doubleSided=doubleSided;
  if(invariant!==JSON.stringify([doc.nodes,doc.skins,doc.meshes,doc.accessors,doc.bufferViews,doc.buffers,doc.images,doc.textures,doc.extensionsUsed,doc.extensionsRequired]))throw Error('Nonmaterial JSON changed');
  const raw=Buffer.from(JSON.stringify(doc));const json=Buffer.concat([raw,Buffer.alloc((-raw.length)&3,32)]);const head=Buffer.alloc(20);head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(28+json.length+binary.length,8);head.writeUInt32LE(json.length,12);head.writeUInt32LE(0x4e4f534a,16);const binhead=Buffer.alloc(8);binhead.writeUInt32LE(binary.length,0);binhead.writeUInt32LE(0x004e4942,4);const after=Buffer.concat([head,json,binhead,binary]);if(after.length>1130000)throw Error('Insufficient 370KB native animation reserve');const destination=path.join(output,file);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,after);k[lod+'Sha256']=digest(after);k[lod+'Bytes']=after.length;
  records.push({file,beforeSha256:digest(before),afterSha256:digest(after),bytes:after.length,triangles:k[lod+'Triangles'],compressedBINPreserved:true,compressedBINSha256:digest(binary),rigMeshImageAccessorJSONPreserved:true,hairStyle:c.design?.hair,onlyMaterialChange:'HairCards.doubleSided='+doubleSided});
 }
}
manifest.authoring={...manifest.authoring,hairSidedness:'front-straight-double-coils',hairSideVisualProof:'iterations/23/preflight/hair-side-probes/ and hair-side-hero/'};
await fs.writeFile(path.join(output,'asset-manifest.json'),JSON.stringify(manifest,null,2)+'\n');await fs.writeFile(path.join(output,'material-proof.json'),JSON.stringify({kind:'phone-validated-single-sided-hair-material-patch',generatedAt:new Date().toISOString(),input:path.relative(root,input),output:path.relative(root,output),records},null,2)+'\n');console.log(JSON.stringify({models:records.length,largest:Math.max(...records.map(r=>r.bytes)),geometryAndEncodedImagesPreserved:true}));
