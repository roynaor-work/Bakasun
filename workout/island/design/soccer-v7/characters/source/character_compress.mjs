#!/usr/bin/env node
/** Offline Draco packaging. Tooling installs in /tmp; runtime has no npm/build dependency. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
const require=createRequire(process.env.SOCCER_ASSET_TOOLS||'/tmp/soccer-v7-tools/package.json');
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {draco,compactPrimitive,prune}=require('@gltf-transform/functions');
const codec=require('draco3dgltf');
const packageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=process.env.SOCCER_CHARACTER_OUTPUT?path.resolve(process.env.SOCCER_CHARACTER_OUTPUT):packageRoot;
const inputRoot=process.env.SOCCER_CHARACTER_INPUT?path.resolve(process.env.SOCCER_CHARACTER_INPUT):root;
const runtimeRoot=process.env.SOCCER_CHARACTER_RUNTIME_OUTPUT?path.resolve(process.env.SOCCER_CHARACTER_RUNTIME_OUTPUT):root;
const allowed=p=>p===packageRoot||p.startsWith(packageRoot+path.sep)||p.startsWith('/tmp'+path.sep);
if(!allowed(root)||!allowed(inputRoot)||!allowed(runtimeRoot))throw Error('Character files must stay inside the new character package or temporary authoring workspace');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
 'draco3d.decoder':await codec.createDecoderModule(),
 'draco3d.encoder':await codec.createEncoderModule(),
});
const manifestName=process.argv[2]||'asset-manifest.json';
const manifestPath=path.join(root,manifestName);
const manifest=JSON.parse(await fs.readFile(path.join(inputRoot,manifestName),'utf8'));
if(inputRoot!==root){
 for(const person of manifest.characters)for(const kit of person.kits)for(const file of Object.values(kit.textures||{})){
  const destination=path.join(root,file);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(path.join(inputRoot,file),destination);
 }
}
for(const person of manifest.characters)for(const kit of person.kits)for(const lod of ['lod0','lod1']){
 const file=path.join(root,kit[lod]);const doc=await io.read(path.join(inputRoot,kit[lod]));await fs.mkdir(path.dirname(file),{recursive:true});
 const runtimeFile=path.join(runtimeRoot,kit[lod]);
 doc.getRoot().setExtras({...doc.getRoot().getExtras(),canonicalSkeleton:path.relative(path.dirname(runtimeFile),path.resolve(packageRoot,'../../motion2/soccer.json')).split(path.sep).join('/'),canonicalRigPath:path.relative(path.dirname(runtimeFile),path.join(packageRoot,'rig.json')).split(path.sep).join('/'),fictional:true,atlasLayout:'one 1024 UV layout, shared by color/normal/ORM'});
 for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
  // Each material owns only the vertices it renders: avoids four full-body skins per athlete.
  compactPrimitive(primitive);
  const weights=primitive.getAttribute('WEIGHTS_0');
  if(weights){const values=weights.getArray();for(let i=0;i<values.length;i+=4){const sum=values[i]+values[i+1]+values[i+2]+values[i+3];for(let j=0;j<4;j++)values[i+j]/=sum;}}
 }
 await doc.transform(prune({keepAttributes:true,keepIndices:true}));
 await doc.transform(draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:15,quantizeNormal:12,quantizeTexcoord:13,quantizeGeneric:0}));
 await io.write(file,doc);
 const decoded=await io.read(file);
 let actualTriangles=0;for(const m of decoded.getRoot().listMeshes())for(const p of m.listPrimitives())actualTriangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
 kit[lod+'Triangles']=actualTriangles;
 const bytes=await fs.readFile(file);kit[lod+'Bytes']=bytes.length;kit[lod+'Sha256']=crypto.createHash('sha256').update(bytes).digest('hex');
 if(bytes.length>1500000)throw Error(file+' exceeds 1.5 MB');
 console.log(kit[lod],kit[lod+'Triangles']+' triangles',bytes.length+' bytes');
}
manifest.compression={extension:'KHR_draco_mesh_compression',method:'edgebreaker',positionBits:15,normalBits:12,uvBits:13,genericBits:0};
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
