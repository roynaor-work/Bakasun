// Inspect the actual Draco-compressed delivery, canonical skin and all budgets.
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{createRequire}from'node:module';import{createHash}from'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire('/tmp/fire-v7-tools/package.json');
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),draco=require('draco3dgltf'),validator=require('gltf-validator');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const canonical=JSON.parse(await fs.readFile(path.join(root,'../motion2/soccer.json'),'utf8')).skeleton;
const result={generatedAt:new Date().toISOString(),limits:{glbBytes:1500000,textureSide:1024,joints:18},assets:[],failures:[]};
function check(ok,message,details){if(!ok)result.failures.push({message,...details});}
for(const a of manifest.assets){
 const bytes=await fs.readFile(path.join(root,a.file)),jsonLength=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 const val=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:50});
 const doc=await io.readBinary(bytes),r=doc.getRoot(),record={id:a.id,bytes:bytes.length,triangles:0,
   validatorErrors:val.issues.numErrors,validatorWarnings:val.issues.numWarnings,validatorMessages:val.issues.messages,
   skins:r.listSkins().length,textures:r.listTextures().map(t=>({name:t.getName(),dimensions:t.getSize(),bytes:t.getImage().length})),animations:r.listAnimations().map(c=>c.getName()),
   dracoRequired:j.extensionsRequired?.includes('KHR_draco_mesh_compression')||false,degenerateTriangles:0,nonFiniteValues:0,invalidWeights:0};
 check(bytes.length<=1500000,'GLB exceeds 1.5 MB',{id:a.id});check(record.dracoRequired,'Draco is not required',{id:a.id});check(val.issues.numErrors===0,'glTF validator error',{id:a.id});
 check(createHash('sha256').update(bytes).digest('hex')===a.sha256,'Manifest checksum mismatch',{id:a.id});
 for(const t of record.textures)check(Math.max(...t.dimensions)<=1024,'Texture exceeds 1024',{id:a.id});
 for(const mesh of r.listMeshes())for(const p of mesh.listPrimitives()){
   const pos=p.getAttribute('POSITION').getArray(),idx=p.getIndices().getArray();record.triangles+=idx.length/3;
   for(const accessor of p.listAttributes())for(const v of accessor.getArray())if(!Number.isFinite(v))record.nonFiniteValues++;
   for(let i=0;i<idx.length;i+=3){
     const x=[...pos.subarray(idx[i]*3,idx[i]*3+3)],y=[...pos.subarray(idx[i+1]*3,idx[i+1]*3+3)],z=[...pos.subarray(idx[i+2]*3,idx[i+2]*3+3)];
     const u=y.map((v,k)=>v-x[k]),v=z.map((v,k)=>v-x[k]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
     if(Math.hypot(...cross)<1e-10)record.degenerateTriangles++;
   }
   if(p.getAttribute('WEIGHTS_0')){
     const w=p.getAttribute('WEIGHTS_0'),array=w.getArray(),joints=p.getAttribute('JOINTS_0').getArray();
     for(let i=0;i<array.length;i+=4){const sum=array[i]+array[i+1]+array[i+2]+array[i+3];if(Math.abs(sum-(w.getNormalized()?65535:1))>.001||[...joints.subarray(i,i+4)].some(j=>j>=18))record.invalidWeights++;}
   }
 }
 check(record.triangles===a.triangles,'Triangle inventory mismatch',{id:a.id});check(record.nonFiniteValues===0,'Non-finite geometry',{id:a.id});
 check(record.degenerateTriangles===0,'Degenerate decoded triangles',{id:a.id,count:record.degenerateTriangles});check(record.invalidWeights===0,'Invalid skin weights',{id:a.id});
 if(a.category==='crew'){
   const skin=r.listSkins()[0],joints=skin.listJoints();
   check(joints.length===18,'Canonical joint count',{id:a.id});check(r.listTextures().length===1,'Crew must use one atlas',{id:a.id});
   for(let i=0;i<canonical.bones.length;i++){
     const b=canonical.bones[i],node=joints[i];check(node.getName()===b.name,'Canonical joint name/order',{id:a.id,bone:b.name});
     check(node.getParentNode()?.getName()===(b.parent||undefined),'Canonical joint parent',{id:a.id,bone:b.name});
     check(node.getTranslation().every((v,k)=>Math.abs(v-b.restTranslationMeters[k])<1e-6),'Canonical rest translation',{id:a.id,bone:b.name});
   }
   check(['idle','hose','tool','command','walk'].every(c=>record.animations.includes(c)),'Missing motion clip',{id:a.id});
 }
 result.assets.push(record);console.log(a.id,record.triangles,'tri',val.issues.numErrors,'errors',record.degenerateTriangles,'degenerate');
}
result.passed=result.failures.length===0;await fs.writeFile(path.join(root,'verification/assets.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,assets:result.assets.length,failures:result.failures}));if(!result.passed)process.exitCode=1;
