// Validate compressed and independently decoded delivery, including measured geometry.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const args=process.argv.slice(2),i=args.indexOf('--modules');
if(i<0||!args[i+1])throw Error('--modules /absolute/tooling required');
const require=createRequire(path.resolve(args[i+1],'package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const codec=require('draco3dgltf'),validator=require('gltf-validator');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await codec.createDecoderModule()});
const root=path.resolve(import.meta.dirname,'../assets');
const results=[];
for(const filename of ['arena.glb','ball.glb','hoop.glb']){
 const file=path.join(root,filename),bytes=await fs.readFile(file);
 const native=await validator.validateBytes(bytes,{uri:filename,maxIssues:100});
 const doc=await io.read(file),droot=doc.getRoot();
 const ext=droot.listExtensionsUsed().find(e=>e.extensionName==='KHR_draco_mesh_compression');
 const dracoRequired=!!ext&&ext.isRequired();
 const meshes=droot.listMeshes();
 const triangles=meshes.reduce((sum,m)=>sum+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
 const nodes=droot.listNodes();
 const positions=meshes.flatMap(m=>m.listPrimitives().map(p=>p.getAttribute('POSITION').getArray()));
 let finite=true; for(const array of positions)for(const n of array)if(!Number.isFinite(n))finite=false;
 const textures=droot.listTextures().length;
 const anchors=Object.fromEntries(nodes.filter(n=>n.getName().startsWith('anchor_')).map(n=>[n.getName(),n.getWorldTranslation()]));
 ext?.dispose(); const decodedBytes=await io.writeBinary(doc);
 const decoded=await validator.validateBytes(decodedBytes,{uri:'decoded-'+filename,maxIssues:100});
 const result={filename,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),dracoRequired,meshes:meshes.length,triangles,textures,finiteGeometry:finite,anchors,
  compressedValidation:{errors:native.issues.numErrors,warnings:native.issues.numWarnings,messages:native.issues.messages},
  decodedValidation:{errors:decoded.issues.numErrors,warnings:decoded.issues.numWarnings,messages:decoded.issues.messages}};
 result.passed=dracoRequired&&finite&&textures===0&&native.issues.numErrors===0&&decoded.issues.numErrors===0;
 results.push(result);console.log(filename,result.bytes,'triangles',triangles,'errors',native.issues.numErrors,decoded.issues.numErrors);
}
const report={tool:'glTF Validator + glTF Transform independent Draco decode',results,allPassed:results.every(x=>x.passed)};
await fs.writeFile(path.join(root,'arena-validation.json'),JSON.stringify(report,null,2)+'\n');
if(!report.allPassed)process.exitCode=1;
