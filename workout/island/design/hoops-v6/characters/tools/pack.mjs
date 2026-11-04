/** Pack atlas-skinned basketball GLBs with Draco, retaining one PBR material.
 * Production source: Blender raw GLBs under /tmp/hoops-v6-raw.
 * Offline viewer has no build step. Tool dependencies live outside repository.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {fixKitFit} from './fix_fit.mjs';
const require=createRequire('/tmp/hoops-v6-tools/package.json');
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS,EXTTextureWebP}=require('@gltf-transform/extensions');
const {dedup,prune,resample,draco}=require('@gltf-transform/functions');
const dm=require('draco3dgltf'),sharp=require('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.encoder':await dm.createEncoderModule(),'draco3d.decoder':await dm.createDecoderModule()});
const meta=JSON.parse(await fs.readFile(path.join(root,'asset-metadata.json'),'utf8'));
for(const player of meta.players){
 if(process.argv.includes('--role')&&player.id!==process.argv[process.argv.indexOf('--role')+1])continue;
 for(const lod of ['lod0','lod1']){
  const id=player.id+'-'+lod;
  const doc=await io.read('/tmp/hoops-v6-raw/'+id+'.glb');
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const garmentFit=fixKitFit(doc);
  player.garmentFit??={};player.garmentFit[lod]=garmentFit;
  doc.getRoot().getAsset().generator='Hoops V6 / Blender4.3 + glTF Transform Draco';
  doc.getRoot().getAsset().copyright='MakeHuman-derived CC0 core anatomy; CMU motion usage terms. See LICENSES.md.';
  // Atlas set: lossless normal/ORM and photographic RGBA basecolor WebP.
  for(const tex of doc.getRoot().listTextures()){
   const isBase=/basecolor/i.test(tex.getName());
   const encoded=await sharp(tex.getImage()).webp(isBase?{quality:88,alphaQuality:100,effort:6}:{lossless:true,effort:6}).toBuffer();
   tex.setImage(new Uint8Array(encoded)).setMimeType('image/webp');
  }
  for(const mat of doc.getRoot().listMaterials()){
   mat.setAlphaMode('MASK').setAlphaCutoff(.45).setDoubleSided(true);
   mat.setMetallicFactor(0).setRoughnessFactor(1);
  }
  // Quantize normalized skin weights with exact per-vertex sum, no zero sum.
  for(const mesh of doc.getRoot().listMeshes())for(const prim of mesh.listPrimitives()){
   const weights=prim.getAttribute('WEIGHTS_0');
   if(weights){const result=[];for(let i=0;i<weights.getCount();i++){
    const a=weights.getElement(i,[]),sum=a.reduce((x,y)=>x+y,0);const scaled=a.map(v=>v/sum*65535),q=scaled.map(Math.floor);
    const order=[0,1,2,3].sort((x,y)=>(scaled[y]-q[y])-(scaled[x]-q[x]));const remain=65535-q.reduce((x,y)=>x+y,0);for(let k=0;k<remain;k++)q[order[k%4]]++;result.push(...q);
   }weights.setArray(new Uint16Array(result)).setNormalized(true);}
  }
  await doc.transform(dedup(),resample({tolerance:.00003}),prune(),draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:16,quantizeNormal:11,quantizeTexcoord:14,quantizeGeneric:16}));
  const out=path.join(root,player.models[lod]);await io.write(out,doc);
  const st=await fs.stat(out);if(st.size>1500000)throw new Error(id+' exceeds1.5MB: '+st.size);
  player.bytes??={};player.bytes[lod]=st.size;
  player.drawCalls=doc.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().length,0);
  player.animationNames=doc.getRoot().listAnimations().map(a=>a.getName());
  console.log(id,st.size,player.triangles[lod],player.animationNames.length+' clips');
 }
}
await fs.writeFile(path.join(root,'asset-metadata.json'),JSON.stringify(meta,null,2)+'\n');
