// SPDX-License-Identifier: CC0-1.0
// Independent byte validation and full-vertex linear-blend skin floor audit.
// Reads delivered GLBs, native animation accessors and inverse bind matrices.
// No pose authoring functions, IK, viewer floor correction or sampled JSON poses.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {Matrix4, Quaternion, Vector3} from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {unpack,readAccessor} from './glb.mjs';

const base=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const validator=require(process.env.GLTF_VALIDATOR_MODULE ?? '/tmp/soccer-v3-validation/node_modules/gltf-validator');
const fps=Number(process.env.MESH_AUDIT_FPS ?? 120);
if(!Number.isFinite(fps)||fps<60)throw Error('MESH_AUDIT_FPS must be at least 60 Hz');
const hash=b=>createHash('sha256').update(b).digest('hex');
const write=async(name,value)=>fs.writeFile(path.join(base,'verification',name),JSON.stringify(value,null,2)+'\n');

function values(g,index){
 const a=readAccessor(g,index),v=a.values;
 if(!a.accessor.normalized)return v;
 const type=a.accessor.componentType,max={5120:127,5121:255,5122:32767,5123:65535}[type];
 if(!max)throw Error('Unsupported normalized component');
 return v.map(n=>Math.max(type===5120||type===5122?-1:0,n/max));
}
function prepare(g){
 const d=g.document,parent=Array(d.nodes.length).fill(-1);
 d.nodes.forEach((node,i)=>(node.children??[]).forEach(child=>{if(parent[child]!==-1)throw Error('Multiple parents');parent[child]=i;}));
 const meshes=[];
 d.nodes.forEach((node,nodeIndex)=>{
  if(node.mesh==null)return;
  if(node.weights?.some(w=>w!==0)||d.meshes[node.mesh].weights?.some(w=>w!==0))throw Error('Nonzero morph targets require explicit morph auditing');
  const skin=node.skin==null?null:d.skins[node.skin];
  const inverseBinds=skin?(skin.inverseBindMatrices==null?skin.joints.map(()=>new Matrix4()):
   Array.from({length:skin.joints.length},(_,i)=>new Matrix4().fromArray(values(g,skin.inverseBindMatrices),i*16))):[];
  for(const [primitiveIndex,p]of d.meshes[node.mesh].primitives.entries()){
   if(p.extensions?.KHR_draco_mesh_compression)throw Error('Compressed mesh unsupported in full-vertex audit');
   const position=values(g,p.attributes.POSITION),weights=[],joints=[];
   for(let set=0;p.attributes['WEIGHTS_'+set]!=null;set++){
    weights.push(values(g,p.attributes['WEIGHTS_'+set]));joints.push(values(g,p.attributes['JOINTS_'+set]));
   }
   if(skin&&!weights.length)throw Error('Skinned primitive has no weights');
   meshes.push({name:node.name??d.meshes[node.mesh].name??'mesh'+node.mesh,nodeIndex,primitiveIndex,skin,inverseBinds,position,weights,joints,vertices:position.length/3});
  }
 });
 const animation=d.animations?.[0];
 if(!animation)throw Error('Delivered clip must have animation');
 const channels=animation.channels.map(c=>{
  const s=animation.samplers[c.sampler],times=values(g,s.input),output=values(g,s.output);
  return {node:c.target.node,path:c.target.path,times,output,interpolation:s.interpolation??'LINEAR'};
 });
 const duration=Math.max(...channels.flatMap(c=>c.times));
 return {g,d,parent,meshes,channels,duration};
}
function animatedValue(c,t){
 const width=c.path==='rotation'?4:3,times=c.times;
 let left=0,right=times.length-1;
 if(t<=times[0])right=left;
 else if(t>=times.at(-1))left=right;
 else{while(right-left>1){const mid=(left+right)>>1;if(times[mid]<=t)left=mid;else right=mid;}}
 const u=left===right?0:(t-times[left])/(times[right]-times[left]);
 if(c.interpolation==='CUBICSPLINE'){
  const dt=left===right?0:times[right]-times[left],a=c.output.slice((left*3+1)*width,(left*3+2)*width),b=c.output.slice((right*3+1)*width,(right*3+2)*width);
  const av=c.output.slice((left*3+2)*width,(left*3+3)*width),bv=c.output.slice(right*3*width,(right*3+1)*width);
  const v=a.map((v,i)=>(2*u**3-3*u*u+1)*v+(u**3-2*u*u+u)*dt*av[i]+(-2*u**3+3*u*u)*b[i]+(u**3-u*u)*dt*bv[i]);
  return c.path==='rotation'?new Quaternion(...v).normalize().toArray():v;
 }
 const a=c.output.slice(left*width,(left+1)*width),b=c.output.slice(right*width,(right+1)*width);
 if(c.interpolation==='STEP'||left===right)return a;
 if(c.interpolation!=='LINEAR')throw Error('Unsupported interpolation '+c.interpolation);
 return c.path==='rotation'?new Quaternion(...a).slerp(new Quaternion(...b),u).normalize().toArray():a.map((v,i)=>v+(b[i]-v)*u);
}
function worldMatrices(p,t=null){
 const local=p.d.nodes.map(n=>({translation:n.translation??[0,0,0],rotation:n.rotation??[0,0,0,1],scale:n.scale??[1,1,1]}));
 if(t!==null)for(const c of p.channels){if(c.path==='weights')throw Error('Animated morph targets require explicit auditing');local[c.node][c.path]=animatedValue(c,t);}
 const world=[];
 const visit=i=>{
  if(world[i])return world[i];
  const n=p.d.nodes[i],a=local[i],m=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...a.translation),new Quaternion(...a.rotation),new Vector3(...a.scale));
  world[i]=p.parent[i]===-1?m:new Matrix4().multiplyMatrices(visit(p.parent[i]),m);return world[i];
 };
 p.d.nodes.forEach((_,i)=>visit(i));return world;
}
function floorAt(p,world){
 let minimum=Infinity,worst=null,feetMinimum=Infinity,otherMinimum=Infinity;
 const byMesh=[];
 for(const m of p.meshes){
  const skinMatrices=m.skin?m.skin.joints.map((joint,i)=>new Matrix4().multiplyMatrices(world[joint],m.inverseBinds[i]).elements):null;
  let min=Infinity,worstVertex=-1;
  for(let vertex=0;vertex<m.vertices;vertex++){
   const x=m.position[vertex*3],y=m.position[vertex*3+1],z=m.position[vertex*3+2];
   let py=0,footWeight=0,dominantWeight=0,dominantBone=null,totalWeight=0;
   if(skinMatrices){
    for(let set=0;set<m.weights.length;set++)for(let k=0;k<4;k++){
     const weight=m.weights[set][vertex*4+k];if(weight===0)continue;
     const joint=m.joints[set][vertex*4+k],e=skinMatrices[joint];if(!e)throw Error('Joint index outside skin');
     const bone=p.d.nodes[m.skin.joints[joint]].name;
     py+=weight*(e[1]*x+e[5]*y+e[9]*z+e[13]);totalWeight+=weight;
     if(/^(Left|Right)Foot$/.test(bone))footWeight+=weight;
     if(weight>dominantWeight){dominantWeight=weight;dominantBone=bone;}
    }
    if(Math.abs(totalWeight-1)>.0001)throw Error('Unnormalized vertex weights: '+totalWeight);
   }else{const e=world[m.nodeIndex].elements;py=e[1]*x+e[5]*y+e[9]*z+e[13];}
   if(!Number.isFinite(py))throw Error('Nonfinite skinned coordinate');
   if(footWeight>=.5)feetMinimum=Math.min(feetMinimum,py);else otherMinimum=Math.min(otherMinimum,py);
   if(py<min){min=py;worstVertex=vertex;}
   if(py<minimum){minimum=py;worst={mesh:m.name,primitive:m.primitiveIndex,vertex,positionY:py,bindPosition:[x,y,z],dominantBone,dominantWeight,footWeight};}
  }
  byMesh.push({mesh:m.name,primitive:m.primitiveIndex,minimumY:min,worstVertex});
 }
 const soles=['LeftFoot','RightFoot'].map(bone=>{
  const i=p.d.nodes.findIndex(n=>n.name===bone);if(i<0)throw Error('Missing sole bone');
  return {bone,y:new Vector3(0,-.08,0).applyMatrix4(world[i]).y};
 });
 return {minimum,worst,feetMinimum,otherMinimum,byMesh,soles};
}

await fs.mkdir(path.join(base,'verification'),{recursive:true});
const catalog=JSON.parse(await fs.readFile(path.join(base,'catalog.json'),'utf8'));
const validation=[],floors=[];
for(const entry of catalog.clips){
 const asset=entry.asset??entry.file,bytes=await fs.readFile(path.join(base,asset)),g=unpack(bytes),p=prepare(g);
 const result=await validator.validateBytes(new Uint8Array(bytes),{uri:asset,maxIssues:10000});
 validation.push({id:entry.id,asset,sha256:hash(bytes),bytes:bytes.length,validatorVersion:validator.version(),issues:result.issues});
 const rest=floorAt(p,worldMatrices(p)),times=[0,p.duration,...Array.from({length:Math.floor(p.duration*fps)+1},(_,i)=>i/fps),...p.channels.flatMap(c=>c.times)];
 const unique=[...new Set(times.map(t=>Math.min(p.duration,t)))].sort((a,b)=>a-b);
 let minimum=Infinity,worst=null,minimumSole=Infinity,footMinimum=Infinity,otherMinimum=Infinity,penetratingFrames=0;
 const perMesh=new Map();
 for(const t of unique){
  const r=floorAt(p,worldMatrices(p,t));
  if(r.minimum<minimum){minimum=r.minimum;worst={timeSeconds:t,...r.worst};}
  if(r.minimum<-.001)penetratingFrames++;
  minimumSole=Math.min(minimumSole,...r.soles.map(s=>s.y));footMinimum=Math.min(footMinimum,r.feetMinimum);otherMinimum=Math.min(otherMinimum,r.otherMinimum);
  for(const m of r.byMesh){const key=m.mesh+':'+m.primitive;if(!perMesh.has(key)||m.minimumY<perMesh.get(key).minimumY)perMesh.set(key,{timeSeconds:t,...m});}
 }
 const record={id:entry.id,asset,sha256:hash(bytes),durationSeconds:p.duration,samplingRateHz:fps,samples:unique.length,verticesPerSample:p.meshes.reduce((n,m)=>n+m.vertices,0),
  minimumMeshY:minimum,maximumMeshPenetrationMeters:Math.max(0,-minimum),minimumSoleProbeY:minimumSole,minimumFootDominantVertexY:footMinimum,minimumOtherVertexY:otherMinimum,
  framesBelowMinus1mm:penetratingFrames,worst,meshes:[...perMesh.values()],
  unanimatedBind:{minimumMeshY:rest.minimum,minimumSoleProbeY:Math.min(...rest.soles.map(s=>s.y)),worst:rest.worst},
  meetsMinus1mmMeshFloor:minimum>=-.001};
 floors.push(record);console.log(entry.id,'validator errors',result.issues.numErrors,'mesh min',minimum.toFixed(6),'sole min',minimumSole.toFixed(6));
}
await write('gltf.json',{generatedAt:new Date().toISOString(),validator:'Khronos glTF Validator',version:validator.version(),pass:validation.every(v=>v.issues.numErrors===0),
 errors:validation.reduce((n,v)=>n+v.issues.numErrors,0),warnings:validation.reduce((n,v)=>n+v.issues.numWarnings,0),assets:validation});
await write('mesh-floor.json',{generatedAt:new Date().toISOString(),method:'All POSITION vertices, native animation accessor sampling, quaternion slerp, joint world matrices times inverse bind matrices, normalized linear-blend weights. No viewer floor correction or IK. Each unique primitive vertex included; native times plus dense uniform sampling.',
 samplingRateHz:fps,floorY:0,meshFloorThresholdMeters:-.001,soleProbeLocalMeters:[0,-.08,0],
 pass:floors.every(f=>f.meetsMinus1mmMeshFloor),maximumMeshPenetrationMeters:Math.max(...floors.map(f=>f.maximumMeshPenetrationMeters)),
 note:'Canonical sole-point grounding and rendered mesh grounding are separate tests. The bind-pose baseline reveals inherited geometry below the canonical sole. Per-clip worst records identify any actual deformed-mesh penetration; no correction is applied by this audit.',clips:floors});
if(validation.some(v=>v.issues.numErrors))process.exitCode=1;
