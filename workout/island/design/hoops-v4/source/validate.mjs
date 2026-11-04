#!/usr/bin/env node
// Independently decode the delivered GLBs: this does not trust builder statistics.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const root=path.resolve(import.meta.dirname,'..');
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const modules=option('--modules','/tmp/hoops-v4-tools');
const require=createRequire(path.resolve(modules,modules.endsWith('.json')?'':'package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf'),validator=require('gltf-validator');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const roles=[['pg',1.78],['sg',1.88],['sf',1.99],['pf',2.09],['c',2.20]];
const sha=b=>createHash('sha256').update(b).digest('hex');
const out=path.join(root,'verification');
await fs.mkdir(out,{recursive:true});
const records=[];
let expectedJoints;
function jsonOf(bytes){return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());}
function transform(p,m){const [x,y,z]=p;return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];}
function scan(doc){
 const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 let vertices=0,triangles=0,primitives=0,badValues=0,badIndices=0,badWeights=0,maxWeightError=0,skinVertices=0;
 for(const node of doc.getRoot().listNodes()){
  const mesh=node.getMesh();if(!mesh)continue;
  for(const p of mesh.listPrimitives()){
   primitives++;const pos=p.getAttribute('POSITION');if(!pos){badValues++;continue;}
   vertices+=pos.getCount();triangles+=(p.getIndices()?.getCount()??pos.getCount())/3;
   const matrix=node.getWorldMatrix();
   for(let i=0;i<pos.getCount();i++){const v=transform(pos.getElement(i,[]),matrix);for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],v[k]);bounds.max[k]=Math.max(bounds.max[k],v[k]);}}
   for(const semantic of p.listSemantics())for(const v of p.getAttribute(semantic).getArray())if(!Number.isFinite(v))badValues++;
   for(const v of p.getIndices()?.getArray()??[])if(v<0||v>=pos.getCount())badIndices++;
   const weights=p.getAttribute('WEIGHTS_0'),joints=p.getAttribute('JOINTS_0');
   if(node.getSkin()){
    if(!weights||!joints){badWeights++;continue;}
    skinVertices+=pos.getCount();const jointCount=node.getSkin().listJoints().length;
    for(let i=0;i<pos.getCount();i++){
     const w=weights.getElement(i,[]),j=joints.getElement(i,[]),e=Math.abs(w.reduce((a,b)=>a+b,0)-1);
     maxWeightError=Math.max(maxWeightError,e);
     if(e>0.002||w.some(v=>v<0||v>1.00001)||j.some((v,k)=>w[k]>0&&(v<0||v>=jointCount||!Number.isInteger(v))))badWeights++;
    }
   }
  }
 }
 bounds.size=bounds.max.map((v,i)=>v-bounds.min[i]);
 return {vertices,triangles,primitives,badValues,badIndices,badWeights,maxWeightError,skinVertices,bounds};
}
for(const file of [...roles.map(([role])=>`assets/players/${role}.glb`),'assets/arena.glb','assets/ball.glb','assets/hoop.glb']){
 const bytes=await fs.readFile(path.join(root,file));const json=jsonOf(bytes);
 const compressed=await validator.validateBytes(new Uint8Array(bytes),{uri:file,maxIssues:1000});delete compressed.validatedAt;
 const doc=await io.readBinary(new Uint8Array(bytes)),g=doc.getRoot(),stats=scan(doc);
 const checks={};const check=(name,pass,values={})=>checks[name]={pass,...values};
 check('validator',compressed.issues.numErrors===0,{errors:compressed.issues.numErrors,warnings:compressed.issues.numWarnings});
 const uniquePrimitives=(json.meshes??[]).flatMap(m=>m.primitives??[]),compressedPrimitives=uniquePrimitives.filter(p=>p.extensions?.KHR_draco_mesh_compression).length;
 check('draco',(json.extensionsRequired??[]).includes('KHR_draco_mesh_compression')&&compressedPrimitives===uniquePrimitives.length&&compressedPrimitives>0,{primitives:uniquePrimitives.length,compressedPrimitives,extensionRequired:(json.extensionsRequired??[]).includes('KHR_draco_mesh_compression')});
 check('fileBudget',bytes.length<=1500000,{bytes:bytes.length,maxBytes:1500000});
 check('selfContained',!(json.buffers??[]).some(v=>v.uri)&&!(json.images??[]).some(v=>v.uri));
 check('geometry',stats.vertices>0&&stats.triangles>0&&stats.badValues===0&&stats.badIndices===0,{...stats});
 const textures=g.listTextures().map(t=>({name:t.getName(),size:t.getSize(),mimeType:t.getMimeType(),bytes:t.getImage()?.length??0}));
 check('textures',textures.every(t=>t.size&&Math.max(...t.size)<=1024),{textures,maxDimension:1024});
 const player=roles.find(([role])=>file===`assets/players/${role}.glb`);
 const skins=g.listSkins(),jointNames=skins[0]?.listJoints().map(j=>j.getName())??[];
 const animation=g.listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().length,samplers:a.listSamplers().map(s=>{
  const input=s.getInput(),output=s.getOutput();let maxDelta=0;
  if(output)for(let i=1;i<output.getCount();i++){const v=output.getElement(i,[]),first=output.getElement(0,[]);maxDelta=Math.max(maxDelta,...v.map((n,k)=>Math.abs(n-first[k])));}
  return {frames:input?.getCount()??0,start:input?.getMin([])?.[0],end:input?.getMax([])?.[0],maxDelta,finite:Array.from(output?.getArray()??[]).every(Number.isFinite)};
 })}));
 if(player){
  expectedJoints??=jointNames;
  check('sharedSkeleton',skins.length>=1&&jointNames.length>=20&&JSON.stringify(jointNames)===JSON.stringify(expectedJoints),{skinCount:skins.length,jointNames});
  check('weights',stats.skinVertices>0&&stats.badWeights===0,{skinVertices:stats.skinVertices,badVertices:stats.badWeights,maxWeightError:stats.maxWeightError});
  check('height',Math.abs(stats.bounds.size[1]-player[1])<=.015,{expectedMeters:player[1],actualMeters:stats.bounds.size[1],toleranceMeters:.015});
  check('ground',Math.abs(stats.bounds.min[1])<=.015,{minimumY:stats.bounds.min[1],toleranceMeters:.015});
  check('fiveAnimatedClips',['dribble','shoot','steal','block','run'].every(n=>animation.some(a=>a.name===n&&a.channels>0&&a.samplers.every(s=>s.frames>=1&&s.end>=s.start&&s.finite)&&a.samplers.some(s=>s.frames>=2&&s.end>s.start&&s.maxDelta>.01))),{animation});
  check('uniformRegions',['team_primary','team_secondary','team_trim'].every(n=>g.listMaterials().some(m=>m.getName()===n)),{materialNames:g.listMaterials().map(m=>m.getName())});
 }
 // Validate a second, fully decoded in-memory copy as well as compressed bytes.
 for(const extension of [...g.listExtensionsUsed()])if(extension.extensionName==='KHR_draco_mesh_compression')extension.dispose();
 const decoded=await validator.validateBytes(await io.writeBinary(doc),{uri:file.replace('.glb','-decoded.glb'),maxIssues:1000});delete decoded.validatedAt;
 check('decodedValidator',decoded.issues.numErrors===0,{errors:decoded.issues.numErrors,warnings:decoded.issues.numWarnings});
 records.push({file,bytes:bytes.length,sha256:sha(bytes),pass:Object.values(checks).every(c=>c.pass),checks,validator:compressed,decodedValidator:decoded});
 console.log(`${file}: ${bytes.length} bytes; ${stats.vertices} vertices; ${stats.triangles} triangles; ${records.at(-1).pass?'PASS':'FAIL'}`);
}
const heights=records.slice(0,5).map(r=>r.checks.height.actualMeters);
const builds=records.slice(0,5).map(r=>({role:path.basename(r.file,'.glb'),height:r.checks.geometry.bounds.size[1],width:r.checks.geometry.bounds.size[0],depth:r.checks.geometry.bounds.size[2]}));
const actualBytes=records.reduce((n,r)=>n+r.bytes,0);
const packageChecks={increasingHeights:{pass:heights.every((v,i)=>i===0||v-heights[i-1]>.06),valuesMeters:heights},distinctBuilds:{pass:builds.every((v,i)=>i===0||Math.abs(v.depth-builds[i-1].depth)>.003||Math.abs(v.width/v.height-builds[i-1].width/builds[i-1].height)>.003),builds}};
const result={schemaVersion:1,scope:'Actual delivered GLB bytes decoded with glTF Transform; both compressed and decoded bytes checked by Khronos glTF Validator. Bounds use bind-pose mesh vertices and node world matrices, not animated envelopes.',validatorVersion:validator.version(),assets:records,checks:packageChecks,budget:{assetBytes:actualBytes,requiredPerGLBMaxBytes:1500000,allWithinRequiredBudget:records.every(r=>r.bytes<=1500000),legacyAdvisory:{targetTotalBytes:2000000,withinTarget:actualBytes<=2000000,perCharacterTargetBytes:150000,charactersWithinTarget:records.slice(0,5).every(r=>r.bytes<=150000)}},pass:records.every(r=>r.pass)&&Object.values(packageChecks).every(c=>c.pass)};
await fs.writeFile(path.join(out,'gltf-validation.json'),JSON.stringify(result,null,2)+'\n');
await fs.writeFile(path.join(root,'inventory.json'),JSON.stringify({schemaVersion:1,assets:records.map(({file,bytes,sha256})=>({file,bytes,sha256})),runtimeAssetBytes:actualBytes},null,2)+'\n');
if(!result.pass)process.exitCode=1;
