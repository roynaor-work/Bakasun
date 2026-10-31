// Validate delivered Draco bytes and an independently decoded in-memory GLB.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const modules=process.argv[process.argv.indexOf('--modules')+1];
if(!modules||!process.argv.includes('--modules'))throw Error('--modules /absolute/tooling required');
const require=createRequire(path.resolve(modules,'package.json'));
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf'),validator=require('gltf-validator');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const expected=['basketball-arena','soccer-stadium','ski-slope','fir-a','fir-b','fir-c','fir-sparse','fir-medium','fir-dense','rock-small','rock','rock-large','fence','slalom-gate','start-gate','finish-gate','snow-sign','lift-tower'].sort();
const names=(await fs.readdir(root)).filter(x=>x.endsWith('.glb')).map(x=>x.slice(0,-4)).sort();
if(JSON.stringify(names)!==JSON.stringify(expected))throw Error('Unexpected delivery inventory');
const records=[];
async function report(bytes,uri){const r=await validator.validateBytes(new Uint8Array(bytes),{uri,maxIssues:0});delete r.validatedAt;return r;}
function assert(condition,message){if(!condition)throw Error(message);}
for(const name of names){
 const bytes=await fs.readFile(path.join(root,name+'.glb'));
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 assert(bytes.length<=400000,`${name}: file budget exceeded`);
 assert(json.extensionsRequired?.includes('KHR_draco_mesh_compression'),`${name}: missing required Draco`);
 assert(!json.images?.length&&!json.textures?.length,`${name}: unexpected texture`);
 assert(json.meshes.every(m=>m.primitives.every(p=>p.extensions?.KHR_draco_mesh_compression)),`${name}: uncompressed primitive`);
 const compressed=await report(bytes,name+'.glb');
 const doc=await io.readBinary(new Uint8Array(bytes));
 const nodes=doc.getRoot().listNodes(),byName=new Map(nodes.map(n=>[n.getName(),n]));
 const anchor=byName.get('asset_root');
 assert(anchor&&JSON.stringify(Array.from(anchor.getTranslation()))==='[0,0,0]',`${name}: root translation`);
 assert(Array.from(anchor.getScale()).every(x=>x===1),`${name}: root scale`);
 assert(Array.from(anchor.getRotation()).every((x,i)=>x===(i===3?1:0)),`${name}: root rotation`);
 const meta=JSON.parse(await fs.readFile(path.join(root,name+'.authoring.json'),'utf8'));
 for(const [node,p]of Object.entries(meta.anchors)){
   const n=byName.get(node);assert(n,`${name}: missing ${node}`);
   assert(n.getWorldTranslation().every((x,i)=>Math.abs(x-p[i])<2e-5),`${name}: wrong ${node}`);
 }
 try{
   const baseline=JSON.parse(await fs.readFile(path.join(root,'../models',name+'.authoring.json'),'utf8'));
   for(const node of baseline.objects)assert(byName.has(node),`${name}: lost component ${node}`);
   for(const [node,p]of Object.entries(baseline.anchors)){
     const n=byName.get(node);assert(n&&n.getWorldTranslation().every((x,i)=>Math.abs(x-p[i])<2e-5),`${name}: incompatible anchor ${node}`);
   }
 }catch(e){if(e.code!=='ENOENT')throw e;}
 let triangles=0,drawCalls=0,vertices=0;
 for(const n of nodes)if(n.getMesh())for(const p of n.getMesh().listPrimitives()){
   assert(p.getMode()===4,`${name}: unexpected topology`);
   triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;
   vertices+=p.getAttribute('POSITION').getCount();drawCalls++;
   assert(p.getAttribute('COLOR_0'),`${name}: missing baked palette`);
 }
 for(const e of [...doc.getRoot().listExtensionsUsed()])if(e.extensionName==='KHR_draco_mesh_compression')e.dispose();
 const decoded=await report(await io.writeBinary(doc),name+'-decoded.glb');
 for(const [kind,r]of Object.entries({compressed,decoded})){
   await fs.mkdir(path.join(root,'validation',kind),{recursive:true});
   await fs.writeFile(path.join(root,'validation',kind,name+'.json'),JSON.stringify(r,null,2)+'\n');
   assert(r.issues.numErrors===0,`${name}: ${kind} Validator errors`);
 }
 records.push({asset:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),triangles,vertices,drawCallsEstimate:drawCalls,textures:0,compatibility:'all v1 nodes and world anchors retained where a v1 counterpart exists',compressedErrors:compressed.issues.numErrors,decodedErrors:decoded.issues.numErrors,compressedWarnings:compressed.issues.numWarnings,decodedWarnings:decoded.issues.numWarnings});
}
const result={allPassed:true,baseCommit:'3853d282b6dd7719db49a864fec4286dc7b63cb0',validator:validator.version(),assets:records,glbBytes:records.reduce((a,b)=>a+b.bytes,0)};
await fs.writeFile(path.join(root,'validation.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
