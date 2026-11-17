#!/usr/bin/env node
/** Validate final GLBs, not pre-export authoring data. No network access. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {Matrix4,Vector3,Quaternion} from '../vendor/engine.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const modules=process.argv[process.argv.indexOf('--modules')+1];
if(!process.argv.includes('--modules')||!modules)throw new Error('Use --modules /absolute/tooling-directory');
const require=createRequire(path.join(path.resolve(modules),'package.json'));
const validator=require('gltf-validator');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const states=['intact','damaged','crushed'];
const results=[];
let checks=0;
function check(value,message){checks++;assert.ok(value,message);}
const hash=b=>createHash('sha256').update(b).digest('hex');
check(manifest.assets.length===14,'14 vehicles');
check(manifest.assets.filter(a=>a.team==='police').length===6,'6 police');
check(manifest.assets.filter(a=>a.team==='fugitive').length===8,'8 fugitives');
check(new Set(manifest.assets.map(a=>a.id)).size===14,'Unique IDs');

for(const meta of manifest.assets){
 const bytes=await fs.readFile(path.join(root,meta.path));
 check(hash(bytes)===meta.sha256,meta.id+' SHA256');
 check(bytes.length===meta.bytes,meta.id+' bytes');
 check(bytes.readUInt32LE(0)===0x46546c67 && bytes.readUInt32LE(4)===2 && bytes.readUInt32LE(8)===bytes.length,'GLB header');
 const jsonLength=bytes.readUInt32LE(12);
 const doc=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 const blob=bytes.subarray(jsonLength+28);
 check(doc.scenes.length===3 && doc.scene===0,'3 native scenes, intact default');
 check(!doc.extensionsRequired?.length && !doc.extensionsUsed?.length,'Core glTF only');
 check(!doc.images?.length && !doc.textures?.length,'No image or text textures');
 check(!doc.buffers.some(b=>b.uri),'Standalone GLB');
 check(new Set(doc.nodes.map(n=>n.name)).size===doc.nodes.length,'Globally unique node names');
 function read(index){
  const a=doc.accessors[index],view=doc.bufferViews[a.bufferView];
  check(a.componentType===5126,'Float32 accessor');
  const width={SCALAR:1,VEC3:3,VEC4:4}[a.type];
  const out=[];
  for(let i=0;i<a.count;i++){
   const row=[];
   for(let k=0;k<width;k++)row.push(blob.readFloatLE((view.byteOffset||0)+(a.byteOffset||0)+i*(view.byteStride||width*4)+k*4));
   out.push(row);
  }
  return out;
 }
 let meshTriangles=0;
 for(const mesh of doc.meshes)for(const primitive of mesh.primitives){
  const count=doc.accessors[primitive.attributes.POSITION].count;
  check(primitive.mode===4&&count%3===0,'Triangle list');
  meshTriangles+=count/3;
 }
 check(meshTriangles===meta.storedMeshTriangles,'Stored triangle total');
 const sceneStats=[];
 const wheelContacts=[];
 const allSpins=[];
 for(const state of states){
  const nativeScene=doc.scenes[meta.scenes[state]];
  check(nativeScene.name===state,'Scene index map');
  let triangles=0,spins=0,beacons=0,smoke=0,partCount=0,headlights=0,taillights=0;
  let deformationSum=0,vertexCount=0;
  const box={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  const semantics=new Set();
  function walk(index,parent){
   const node=doc.nodes[index],info=node.extras||{};
   const matrix=new Matrix4().compose(new Vector3(...(node.translation||[0,0,0])),
    new Quaternion(...(node.rotation||[0,0,0,1])),new Vector3(...(node.scale||[1,1,1])));
   matrix.premultiply(parent);
   if(info.partId){check(!semantics.has(info.partId),'Unique semantic part within state');semantics.add(info.partId);}
   if(info.role==='wheel_spin'){
    spins++;allSpins.push(index);
    check(info.axis==='+X'&&node.children.length===2,'Separate wheel spin pivot');
   }
   if(info.role==='wheel_steer'){
    check(info.axis==='+Y'&&node.children.length===1,'Separate steering pivot');
    const wheel=meta.wheels.find(w=>w.id===info.wheel);
    check(node.translation.every((v,i)=>Math.abs(v-wheel.position[i])<1e-7),'Wheel centre matches manifest');
   }
   if(info.role==='beacon')beacons++;
   if(info.role==='head_lamp')headlights++;
   if(info.role==='tail_lamp')taillights++;
   if(info.role==='engine_smoke_emitter')smoke++;
   if(info.role==='body_part')partCount++;
   if(node.mesh!==undefined){
    const mesh=doc.meshes[node.mesh];
    let localMinY=Infinity;
    for(const primitive of mesh.primitives){
     const points=read(primitive.attributes.POSITION),weights=node.weights||[];
     const targets=(primitive.targets||[]).map(t=>read(t.POSITION));
     if(info.role==='body_part'||info.role==='beacon'||info.role==='head_lamp'||info.role==='tail_lamp')check(targets.length===2,'Two real damage targets on body part');
     if(info.role==='tire'&&info.wheel!=='spare')check(targets.length===1,'Per-wheel puncture target');
     triangles+=points.length/3;
     for(let i=0;i<points.length;i++){
      const source=points[i],q=[...source];
      for(let t=0;t<targets.length;t++)for(let k=0;k<3;k++)q[k]+=(weights[t]||0)*targets[t][i][k];
      deformationSum+=Math.hypot(...q.map((v,k)=>v-source[k]));vertexCount++;
      const v=new Vector3(...q).applyMatrix4(matrix);
      localMinY=Math.min(localMinY,v.y);
      for(let k=0;k<3;k++){box.min[k]=Math.min(box.min[k],v.getComponent(k));box.max[k]=Math.max(box.max[k],v.getComponent(k));}
     }
    }
    if(state==='intact'&&info.role==='tire'&&info.wheel!=='spare'){
     check(Math.abs(localMinY)<1e-5,'Tyre ground contact');
     wheelContacts.push({wheel:info.wheel,minY:localMinY});
    }
   }
   for(const child of node.children||[])walk(child,matrix);
  }
  for(const node of nativeScene.nodes)walk(node,new Matrix4());
  check(triangles>=500&&triangles<=1200,'Active vehicle triangle budget');
  check(triangles===meta.triangles[state],'Triangle manifest matches native scene');
  check(spins===meta.wheels.filter(w=>!w.spare).length,'Independent wheel rig count');
  check(beacons===(meta.team==='police'?2:0),'Police red/blue beacon pair');
  check(smoke===1,'One named engine smoke anchor');
  check(headlights>=1&&taillights>=1,'Separate front and rear emissive lamps');
  check(partCount>=7,'At least seven independent body parts');
  sceneStats.push({state,triangles,spins,beacons,partCount,bounds:box,meanDeformation:deformationSum/vertexCount});
 }
 check(sceneStats[0].meanDeformation===0,'Intact shape is original');
 check(sceneStats[1].meanDeformation>.006,'Damaged shape is visibly distinct');
 check(sceneStats[2].meanDeformation>sceneStats[1].meanDeformation*1.7,'Crushed shape is more deformed');
 const roll=doc.animations.find(a=>a.name==='wheels_roll');
 check(roll.channels.length===allSpins.length,'Native roll clip covers every state');
 for(const channel of roll.channels)check(allSpins.includes(channel.target.node)&&channel.target.path==='rotation','Roll target is spin pivot');
 const punctures=doc.animations.filter(a=>a.name.startsWith('tire_burst_'));
 check(punctures.length===meta.wheels.filter(w=>!w.spare).length,'Native puncture clip per wheel');
 for(const clip of punctures)check(clip.channels.length===3,'Puncture clip covers all states');
 const beaconClip=doc.animations.find(a=>a.name==='beacons_flash');
 check(Boolean(beaconClip)===(meta.team==='police'),'Native police flash clip');
 if(beaconClip)check(beaconClip.channels.length===6&&beaconClip.samplers.every(s=>s.interpolation==='STEP'),'Double flash in all native states');
 const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:meta.path,maxIssues:1000});
 check(Object.values(validation.issues).filter(v=>typeof v==='number').every(n=>n===0),'Completely clean Khronos output');
 await fs.mkdir(path.join(root,'verification','khronos'),{recursive:true});
 await fs.writeFile(path.join(root,'verification','khronos',meta.id+'.json'),JSON.stringify(validation,null,2)+'\n');
 results.push({id:meta.id,bytes:bytes.length,sha256:hash(bytes),storedMeshTriangles:meshTriangles,scenes:sceneStats,wheelContacts,khronos:validation.issues});
}
async function inventory(dir){
 const entries=await fs.readdir(dir,{withFileTypes:true});
 const all=[];
 for(const entry of entries){
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())all.push(...await inventory(full));
  else all.push({path:path.relative(root,full),bytes:(await fs.stat(full)).size});
 }
 return all;
}
const files=await inventory(root);
const packageBytes=files.reduce((sum,f)=>sum+f.bytes,0);
check(packageBytes<=manifest.budgetBytes,'Entire new folder <= 6 MB, including sources and evidence');
const summary={validatorVersion:validator.version(),checks,vehicles:results.length,errors:0,warnings:0,infos:0,hints:0,
 packageBytesAtValidation:packageBytes,budgetBytes:manifest.budgetBytes,triangleRange:[Math.min(...results.map(r=>r.scenes[0].triangles)),Math.max(...results.map(r=>r.scenes[0].triangles))],assets:results};
await fs.writeFile(path.join(root,'verification','assets.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({checks,vehicles:results.length,packageBytes,triangleRange:summary.triangleRange,khronos:'0 errors / 0 warnings / 0 infos / 0 hints'}));
