// Tooling is installed outside the repository. Never ships node_modules.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const modules=process.argv[process.argv.indexOf('--modules')+1];
if(!process.argv.includes('--modules')||!modules)throw Error('--modules /absolute/tooling required');
const require=createRequire(path.resolve(modules,'package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {draco,dedup,prune}=require('@gltf-transform/functions');
const codec=require('draco3dgltf'),validator=require('gltf-validator');
const root=path.resolve(import.meta.dirname,'..');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder':await codec.createEncoderModule(),
  'draco3d.decoder':await codec.createDecoderModule()
});
const assets=[];
for(const name of ['arena','court','hoops','crowd','ball','uniforms']){
  const file=path.join(root,'models',name+'.glb');
  const doc=await io.read(file);
  // Atlas opacity uses an alpha cutoff so seats occlude properly without sorting.
  if(name==='crowd')for(const m of doc.getRoot().listMaterials())m.setAlphaMode('MASK').setAlphaCutoff(.38).setDoubleSided(true);
  await doc.transform(dedup(),prune(),draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:16,quantizeNormal:10,quantizeTexcoord:14}));
  await io.write(file,doc);
  const bytes=await fs.readFile(file);
  if(bytes.length>1_500_000)throw Error(name+' exceeds 1.5 MB: '+bytes.length);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  if(!json.extensionsRequired?.includes('KHR_draco_mesh_compression'))throw Error(name+' missing Draco');
  if(!json.meshes.every(m=>m.primitives.every(p=>p.extensions?.KHR_draco_mesh_compression)))throw Error(name+' contains an uncompressed primitive');
  const compressed=await validator.validateBytes(new Uint8Array(bytes),{uri:name+'.glb',maxIssues:1000});
  const decoded=await io.readBinary(new Uint8Array(bytes));
  for(const e of decoded.getRoot().listExtensionsUsed())if(e.extensionName==='KHR_draco_mesh_compression')e.dispose();
  const decodedReport=await validator.validateBytes(await io.writeBinary(decoded),{uri:name+'-decoded.glb',maxIssues:1000});
  let triangles=0,vertices=0,drawCalls=0;
  for(const n of decoded.getRoot().listNodes())if(n.getMesh())for(const p of n.getMesh().listPrimitives()){
    triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;
    vertices+=p.getAttribute('POSITION').getCount();drawCalls++;
  }
  const textures=decoded.getRoot().listTextures().map(t=>({name:t.getName(),mimeType:t.getMimeType(),size:t.getSize(),bytes:t.getImage().length}));
  for(const t of textures)if(!t.size||Math.max(...t.size)>1024||t.bytes>1_500_000)throw Error(name+' texture exceeds budget: '+t.name);
  const animationNames=decoded.getRoot().listAnimations().map(a=>a.getName());
  if(name==='crowd'&&!animationNames.length)throw Error('Crowd GLB lost its animation');
  if(name==='arena'){
    const byName=new Map(decoded.getRoot().listNodes().map(n=>[n.getName(),n]));
    const color=byName.get('seats').getMesh().listPrimitives()[0].getAttribute('COLOR_0').getElement(0,[]);
    if(Math.max(...color.slice(0,3))>.2||Math.max(...color.slice(0,3))<.01)throw Error('Arena seat palette was lost in export');
    const screen=byName.get('scoreboard-screen').getMesh().listPrimitives()[0];
    const pos=screen.getAttribute('POSITION'),uv=screen.getAttribute('TEXCOORD_0');
    for(let i=0;i<pos.getCount();i++){
      const p=pos.getElement(i,[]),t=uv.getElement(i,[]);
      if((p[1]>11.27&&t[1]>.05)||(p[1]<11.27&&t[1]<.95))throw Error('Scoreboard UV rows were corrupted');
    }
  }
  if(name==='crowd'){
    const primitive=decoded.getRoot().listMeshes()[0].listPrimitives()[0];
    if(primitive.listTargets().length!==2)throw Error('Crowd lost its portable morph targets');
    for(const target of primitive.listTargets()){
      const delta=target.getAttribute('POSITION').getArray(),amplitude=Math.max(...delta.map(Math.abs));
      if(amplitude<.02||amplitude>.08)throw Error('Crowd sway amplitude is outside its authored range');
    }
  }
  const report={compressed,decoded:decodedReport};
  await fs.writeFile(path.join(root,'verification',name+'-validator.json'),JSON.stringify(report,null,2)+'\n');
  if(compressed.issues.numErrors||decodedReport.issues.numErrors)throw Error(name+' failed glTF validation');
  assets.push({file:'models/'+name+'.glb',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),triangles,vertices,drawCalls,textures,animations:animationNames,
    compressedErrors:compressed.issues.numErrors,decodedErrors:decodedReport.issues.numErrors,
    compressedWarnings:compressed.issues.numWarnings,decodedWarnings:decodedReport.issues.numWarnings});
  console.log(name,bytes.length,'bytes',triangles,'triangles',drawCalls,'primitives');
}
const result={allPassed:true,maxFileBytes:1_500_000,maxTextureDimension:1024,validator:validator.version(),assets,
  totalModelBytes:assets.reduce((s,a)=>s+a.bytes,0),totalTriangles:assets.reduce((s,a)=>s+a.triangles,0)};
await fs.writeFile(path.join(root,'verification/assets.json'),JSON.stringify(result,null,2)+'\n');
