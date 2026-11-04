// Read/decode final deliverables, check budgets, and run Khronos glTF Validator.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(process.env.STADIUM_TOOLS||'/tmp/stadium-v6-tools/package.json');
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const codec=require('draco3dgltf'),validator=require('gltf-validator'),sharp=require('sharp');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await codec.createDecoderModule()});
const root=path.resolve(import.meta.dirname,'..');
const report={pass:true,unit:'MB = 1,000,000 bytes',glbBudgetBytes:1500000,textureMaxDimension:1024,assets:[],textures:[]};
for(const name of(await fs.readdir(path.join(root,'assets'))).filter(n=>n.endsWith('.glb')).sort()){
  const bytes=await fs.readFile(path.join(root,'assets',name)),result=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:200});
  const d=await io.read(path.join(root,'assets',name));let triangles=0,primitives=0;
  for(const mesh of d.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
    triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;primitives++;
    for(const a of p.listAttributes())if(!a.getArray().every(Number.isFinite))throw Error(name+' nonfinite geometry');
  }
  const extensions=d.getRoot().listExtensionsRequired().map(e=>e.extensionName);
  const triangleBudget=name.includes('lod0')?8000:name.includes('lod1')?3000:null;
  const pass=bytes.length<=1500000&&result.issues.numErrors===0&&result.issues.numWarnings===0&&extensions.includes('KHR_draco_mesh_compression')&&(!triangleBudget||triangles<=triangleBudget);
  report.assets.push({path:'assets/'+name,bytes:bytes.length,MB:Number((bytes.length/1000000).toFixed(6)),triangles,primitives,triangleBudget,requiredExtensions:extensions,embeddedTextures:d.getRoot().listTextures().length,animations:d.getRoot().listAnimations().map(a=>a.getName()),validator:{errors:result.issues.numErrors,warnings:result.issues.numWarnings,infos:result.issues.numInfos,messages:result.issues.messages},sha256:createHash('sha256').update(bytes).digest('hex'),pass});
  report.pass&&=pass;
}
for(const name of(await fs.readdir(path.join(root,'textures'))).sort()){
  const p=path.join(root,'textures',name),b=await fs.readFile(p),m=await sharp(b).metadata();
  const pass=m.width<=1024&&m.height<=1024;report.pass&&=pass;
  report.textures.push({path:'textures/'+name,bytes:b.length,MB:Number((b.length/1000000).toFixed(6)),width:m.width,height:m.height,channels:m.channels,pass,sha256:createHash('sha256').update(b).digest('hex')});
}
const build=JSON.parse(await fs.readFile(path.join(root,'asset-report.json'),'utf8'));
report.crowd=build.crowd;
report.assetBytes=report.assets.reduce((s,a)=>s+a.bytes,0);
report.externalTextureBytes=report.textures.reduce((s,a)=>s+a.bytes,0);
report.pass&&=build.crowd.variants===6;
await fs.writeFile(path.join(root,'verification/assets.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,assets:report.assets.map(({path,bytes,triangles,validator})=>({path,bytes,triangles,errors:validator.errors,warnings:validator.warnings})),textures:report.textures.length,crowd:report.crowd},null,2));
if(!report.pass)process.exitCode=1;
