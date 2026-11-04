#!/usr/bin/env node
/** Compress rebuilt GLBs with Draco and measure the delivered files. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
const require=createRequire(process.env.SOCCER_ASSET_TOOLS||'/tmp/soccer-v6-tools/package.json');
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {draco}=require('@gltf-transform/functions');
const codec=require('draco3dgltf');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder':await codec.createDecoderModule(),
  'draco3d.encoder':await codec.createEncoderModule(),
});
const manifest=JSON.parse(await fs.readFile(path.join(root,'asset-manifest.json'),'utf8'));
for (const person of manifest.characters) for (const kit of person.kits) for (const lod of ['lod0','lod1']) {
  const file=path.join(root,kit[lod]);
  const doc=await io.read(file);
  doc.getRoot().setExtras({...doc.getRoot().getExtras(),canonicalSkeleton:'../../../motion/soccer.json',canonicalRigPath:'../rig.json'});
  for(const mesh of doc.getRoot().listMeshes()) for(const primitive of mesh.listPrimitives()) {
    const weights=primitive.getAttribute('WEIGHTS_0');
    if(!weights)continue;
    const values=weights.getArray();
    for(let i=0;i<values.length;i+=4){
      const sum=values[i]+values[i+1]+values[i+2]+values[i+3];
      for(let j=0;j<4;j++)values[i+j]/=sum;
    }
  }
  // Generic quantization is disabled: skin-weight sums must remain normalized
  // after decompression (Khronos validates decoded float32 weights too).
  await doc.transform(draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:14,quantizeNormal:10,quantizeTexcoord:12,quantizeGeneric:0}));
  await io.write(file,doc);
  const bytes=await fs.readFile(file);
  kit[lod+'Bytes']=bytes.length;
  kit[lod+'Sha256']=crypto.createHash('sha256').update(bytes).digest('hex');
  if(bytes.length>1500000)throw new Error(`${kit[lod]} exceeds 1.5MB`);
  console.log(`${kit[lod]}: ${kit[lod+'Triangles']} triangles, ${bytes.length} bytes`);
}
manifest.compression={extension:'KHR_draco_mesh_compression',method:'edgebreaker',positionBits:14,normalBits:10,uvBits:12,genericBits:0};
await fs.writeFile(path.join(root,'asset-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
