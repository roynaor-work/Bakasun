#!/usr/bin/env node
// Reproducible asset contract checks; does not write any existing package.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..');
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const require=createRequire(resolve(option('--modules','/tmp/island-characters2-tools/package.json')));
const module=async name=>import(pathToFileURL(require.resolve(name)).href);
const [{NodeIO},{ALL_EXTENSIONS},draco,validatorModule]=await Promise.all(['@gltf-transform/core','@gltf-transform/extensions','draco3dgltf','gltf-validator'].map(module));
const validator=validatorModule.default??validatorModule;
const codec=draco.default??draco;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await codec.createDecoderModule()});
const rig=JSON.parse(await readFile(resolve(root,'../characters/rig.json'),'utf8'));
const expectedNames=rig.joints.map(j=>j.name);
const sha256=b=>createHash('sha256').update(b).digest('hex');
const delta=(a,b)=>Math.max(0,...a.map((v,i)=>Math.abs(v-b[i])));
const all=[];
for(const model of ['soccer-player','goalkeeper','basketball-player','skier']){
 const bytes=await readFile(resolve(root,`${model}.glb`));
 const report=await validator.validateBytes(new Uint8Array(bytes),{uri:`${model}.glb`,maxIssues:10000});
 const doc=await io.readBinary(new Uint8Array(bytes)),g=doc.getRoot();
 const checks={};
 const assert=(name,pass,detail)=>checks[name]={pass,...detail};
 const skins=g.listSkins(),nodes=g.listNodes(),materials=g.listMaterials(),textures=g.listTextures(),meshes=g.listMeshes();
 const joints=skins[0]?.listJoints()??[];
 let translation=0,rotation=0,scale=0,inverse=0,parentMatch=true;
 if(joints.length===20){
  const inverseArray=skins[0].getInverseBindMatrices()?.getArray();
  for(let i=0;i<20;i++){
   const spec=rig.joints[i],node=joints[i];
   translation=Math.max(translation,delta(node.getTranslation(),spec.translation));
   rotation=Math.max(rotation,delta(node.getRotation(),spec.rotation));
   scale=Math.max(scale,delta(node.getScale(),spec.scale));
   if(inverseArray)inverse=Math.max(inverse,delta([...inverseArray.slice(i*16,i*16+16)],spec.inverseBindMatrix));else inverse=Infinity;
   const parents=nodes.filter(p=>p.listChildren().includes(node));
   const boneParent=parents.find(p=>expectedNames.includes(p.getName()));
   parentMatch&&=(boneParent?.getName()??null)===spec.parent;
  }
 }
 assert('validator',report.issues.numErrors===0,{errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos});
 assert('budget',bytes.length<=300000,{bytes:bytes.length,maxBytes:300000});
 assert('rig',skins.length===1&&joints.length===20&&joints.every((j,i)=>j.getName()===expectedNames[i])&&parentMatch&&translation<1e-7&&rotation<1e-7&&scale<1e-7&&inverse<1e-7,{skinCount:skins.length,jointNames:joints.map(j=>j.getName()),parentMatch,maxTranslationError:translation,maxQuaternionComponentError:rotation,maxScaleError:scale,maxInverseBindError:inverse});
 let vertices=0,triangles=0,badWeights=0,badIndices=0,badValues=0,weightError=0,normalError=0,maxInfluences=0,dracoPrimitives=0,primitives=0,degenerateTriangles=0;
 const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 for(const m of json.meshes??[])for(const p of m.primitives??[])if(p.extensions?.KHR_draco_mesh_compression)dracoPrimitives++;
 for(const mesh of meshes)for(const prim of mesh.listPrimitives()){
  primitives++;
  const pos=prim.getAttribute('POSITION'),norm=prim.getAttribute('NORMAL'),color=prim.getAttribute('COLOR_0'),ji=prim.getAttribute('JOINTS_0'),w=prim.getAttribute('WEIGHTS_0'),idx=prim.getIndices();
  if(!pos||!norm||!color||!ji||!w||!idx){badValues++;continue;}
  const count=pos.getCount();vertices+=count;triangles+=idx.getCount()/3;
  for(const attribute of [pos,norm,color,ji,w])for(const v of attribute.getArray())if(!Number.isFinite(v))badValues++;
  for(let i=0;i<count;i++){
   const n=norm.getElement(i,[]),weights=w.getElement(i,[]),indices=ji.getElement(i,[]);
   normalError=Math.max(normalError,Math.abs(Math.hypot(...n)-1));
   const error=Math.abs(weights.reduce((s,v)=>s+v,0)-1);weightError=Math.max(weightError,error);
   const influences=weights.filter(v=>v>1e-7).length;maxInfluences=Math.max(maxInfluences,influences);
   if(error>2e-5||weights.some(v=>v<0||v>1)||indices.some(v=>v<0||v>=20||!Number.isInteger(v)))badWeights++;
  }
  const positions=pos.getArray(),indices=idx.getArray();
  for(const i of indices)if(i<0||i>=count)badIndices++;
  for(let i=0;i<indices.length;i+=3){
   const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
   const u=[0,1,2].map(k=>positions[b+k]-positions[a+k]),v=[0,1,2].map(k=>positions[c+k]-positions[a+k]);
   if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-12)degenerateTriangles++;
  }
 }
 assert('draco',dracoPrimitives===primitives&&primitives>0&&(json.extensionsRequired??[]).includes('KHR_draco_mesh_compression'),{primitives,compressedPrimitives:dracoPrimitives});
 assert('geometry',vertices>0&&triangles>0&&badValues===0&&badIndices===0&&normalError<.002&&degenerateTriangles===0,{vertices,triangles,badValues,badIndices,maxNormalLengthError:normalError,degenerateTriangles});
 assert('weights',badWeights===0&&maxInfluences<=4,{badVertices:badWeights,maxWeightSumError:weightError,maxInfluences});
 const textureSizes=textures.map(t=>t.getSize());
 assert('texture',textures.length<=1&&textureSizes.every(s=>s&&s[0]<=512&&s[1]<=512),{count:textures.length,sizes:textureSizes});
 const external=(json.buffers??[]).some(b=>b.uri)||(json.images??[]).some(im=>im.uri);
 assert('selfContained',!external,{externalResources:Boolean(external),materialCount:materials.length});
 all.push({model,sha256:sha256(bytes),pass:Object.values(checks).every(c=>c.pass),checks,validator:report});
 console.log(`${model}: ${bytes.length} bytes; ${vertices} vertices, ${triangles} triangles; validator ${report.issues.numErrors} errors; ${all.at(-1).pass?'PASS':'FAIL'}`);
}
const result={schemaVersion:1,rigSha256:sha256(await readFile(resolve(root,'../characters/rig.json'))),scope:'Actual final Draco GLB bytes, decoded independently with glTF Transform and checked against unchanged characters/rig.json',models:all,pass:all.every(r=>r.pass)};
await mkdir(resolve(root,'verification'),{recursive:true});
await writeFile(resolve(root,'verification/gltf-validation.json'),JSON.stringify(result,null,2)+'\n');
if(!result.pass)process.exitCode=1;
