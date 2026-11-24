// SPDX-License-Identifier: CC0-1.0
// Replaces only animation streams of the pinned, self-contained grip-v1 fixture.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unpack,compact} from './glb.mjs';
import {author,definitions,sample,RATE} from './author.mjs';
import {bones} from './rig.mjs';

const base=new URL('../',import.meta.url);
const sha=b=>createHash('sha256').update(b).digest('hex');
const original=await fs.readFile(new URL('source/reference/grip-player.glb',base));
const reference=unpack(original);
const epsilon=1e-5;
function signed(a,b){return a.reduce((s,x,i)=>s+x*b[i],0)<0?b.map(x=>-x):b;}
function normalized(q){const n=Math.hypot(...q);return q.map(x=>x/n);}
function derivative(samples,key,width,referenceValue){
 const [a,p,b]=samples;
 let av=key.startsWith('rotation:')?a.rotations[key.slice(9)]:key==='hips'?a.hips:[a.leftOpen];
 let bv=key.startsWith('rotation:')?b.rotations[key.slice(9)]:key==='hips'?b.hips:[b.leftOpen];
 const pv=key.startsWith('rotation:')?p.rotations[key.slice(9)]:null;
 if(pv){av=signed(pv,av);bv=signed(pv,bv);}
 let d=Array.from({length:width},(_,j)=>(bv[j]-av[j])/(2*epsilon));
 if(pv){const q=normalized(pv),projection=d.reduce((s,x,j)=>s+x*q[j],0);d=d.map((x,j)=>x-projection*q[j]);if(q.reduce((s,x,j)=>s+x*referenceValue[j],0)<0)d=d.map(x=>-x);}
 return d;
}
function build(data,height='medium',onlyContacts=false){
 const d=structuredClone(reference.document),parts=[reference.binary];let length=reference.binary.length;
 d.animations=[];
 const addAccessor=(values,width,{componentType=5126,position=false}={})=>{
  const pad=(4-length%4)%4;if(pad){parts.push(Buffer.alloc(pad));length+=pad;}
  const array=componentType===5123?new Uint16Array(values):new Float32Array(values),bytes=Buffer.from(array.buffer),view=d.bufferViews.length;
  d.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length,...position||componentType===5123?{target:34962}:{}});parts.push(bytes);length+=bytes.length;
  const a={bufferView:view,componentType,count:values.length/width,type:{1:'SCALAR',3:'VEC3',4:'VEC4'}[width]};
  if(width===1){a.min=[Math.min(...values)];a.max=[Math.max(...values)];}
  if(position){a.min=Array.from({length:width},(_,j)=>Math.min(...values.filter((_,i)=>i%width===j)));a.max=Array.from({length:width},(_,j)=>Math.max(...values.filter((_,i)=>i%width===j)));}
  d.accessors.push(a);return d.accessors.length-1;
 };
 // Motion is reusable independently of appearance. Preserve the exact hierarchy,
 // bind matrices and morph binding, but package appearance only once in the
 // byte-identical reference fixture. Invisible triangles keep standard glTF
 // skin/morph animation bindings available to GLTFLoader without custom loaders.
 for(const node of d.nodes){delete node.mesh;delete node.skin;}
 delete d.images;delete d.textures;delete d.samplers;
 d.materials=[{name:'Invisible animation binding',alphaMode:'BLEND',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[0,0,0,0],metallicFactor:0,roughnessFactor:1}}];
 const position=addAccessor([0,-20,0,.001,-20,0,0,-20,.001],3,{position:true});
 const joints=addAccessor(Array(12).fill(0),4,{componentType:5123});
 const weights=addAccessor([1,0,0,0,1,0,0,0,1,0,0,0],4);
 d.bufferViews[d.accessors[weights].bufferView].target=34962;
 const morph=addAccessor(Array(9).fill(0),3,{position:true});
 d.meshes=[{name:'Canonical18 animation binding',primitives:[{attributes:{POSITION:position,JOINTS_0:joints,WEIGHTS_0:weights},material:0}]},{name:'Left hand morph binding',weights:[0],extras:{targetNames:['open']},primitives:[{attributes:{POSITION:position},targets:[{POSITION:morph}],material:0}]}];
 const body=d.nodes.find(n=>n.name==='player-01-kit-a-lod1');body.mesh=0;body.skin=0;
 d.nodes.find(n=>n.name==='grip_hand_L').mesh=1;
 for(const clip of data.clips.filter(c=>!onlyContacts||c.contactTime!==null)){
  const def=definitions.find(x=>x.id===clip.id),input=addAccessor(clip.frames.map(f=>f.time),1);
  const nearby=clip.frames.map(f=>[sample(def,f.time-epsilon,height),sample(def,f.time,height),sample(def,f.time+epsilon,height)]);
  const a={name:clip.id,samplers:[],channels:[],extras:{nativeRate:RATE,loop:clip.loop,rootMotion:false,metadata:clip.metadata,contactTime:clip.contactTime,contactHeight:height}};
  function channel(name,path,width,get,cubic=true,key=null){
   const node=d.nodes.findIndex(n=>n.name===name);if(node<0)throw Error('Missing node '+name);
   let previous=null;const values=[];
   for(const [index,f] of clip.frames.entries()){
    let value=get(f);let tangent=cubic?derivative(nearby[index],key,width,value):null;
    if(path==='rotation'){
     value=normalized(value);
     if(previous&&previous.reduce((s,x,j)=>s+x*value[j],0)<0){value=value.map(x=>-x);tangent=tangent?.map(x=>-x);}
     previous=value;
    }
    if(cubic)values.push(...tangent,...value,...tangent);else values.push(...value);
   }
   a.channels.push({sampler:a.samplers.length,target:{node,path}});
   a.samplers.push({input,output:addAccessor(values,width),interpolation:cubic?'CUBICSPLINE':'LINEAR'});
  }
  for(const b of bones)channel(b.name,'rotation',4,f=>f.rotations[b.name],true,'rotation:'+b.name);
  channel('Hips','translation',3,f=>f.hips,true,'hips');
  channel('grip_hand_L','weights',1,f=>[f.leftOpen],true,'leftOpen');
  // Impact intentionally changes ball velocity. Skeleton tracks remain C1.
  channel('Ball','translation',3,f=>f.ball,false);
  channel('Ball','scale',3,f=>[f.ballScale,f.ballScale,f.ballScale],false);
  d.animations.push(a);
 }
 d.asset={...d.asset,generator:'tennis-motion-v2 / original analytic IK / 30Hz CUBICSPLINE',copyright:'CC0-1.0; Third-party software licenses in LICENSES.md'};
 d.extras={library:'tennis-motion-v2',kind:'skeletal-animation-library',referenceAsset:'source/reference/grip-player.glb',units:'meters',nativeRate:RATE,boneCount:18,rootMotion:false,contactHeight:height,rigidGripSource:'a096e507b11389fc10272c38101f968820e89f7e',skeletonInterpolation:'CUBICSPLINE',ballInterpolation:'LINEAR; instantaneous collision impulse'};
 const bytes=compact(d,Buffer.concat(parts));
 if(bytes.length>2_000_000)throw Error('GLB exceeds repository 2MB budget: '+bytes.length);
 return {bytes,animations:d.animations.length};
}
const medium=author('medium');
if(medium.clips.length!==24)throw Error('Expected 24 logical clips');
const variants={};
for(const height of ['medium','low','high']){
 const data=height==='medium'?medium:author(height),result=build(data,height);
 const file=height==='medium'?'tennis-motion-v2.glb':`height-${height}.glb`;
 await fs.writeFile(new URL(file,base),result.bytes);
 variants[height]={asset:file,bytes:result.bytes.length,sha256:sha(result.bytes),animationCount:result.animations};
}
const clips=medium.clips.map(({frames,...c})=>({...c,durationSeconds:c.duration,sheet:`sheets/${c.id}.webp`,heightVariants:c.contactTime===null?null:Object.fromEntries(['low','medium','high'].map(height=>[height,{asset:variants[height].asset,animation:c.id}]))}));
const catalog={schemaVersion:2,library:'tennis-motion-v2',asset:'tennis-motion-v2.glb',referenceAsset:'source/reference/grip-player.glb',assetKind:'skeletal-animation-library; bind clips to the canonical18 reference fixture or a compatible actor by name',fps:RATE,nativeRate:RATE,logicalClipCount:24,units:'meters',coordinateSystem:{up:'+Y',forward:'+Z',left:'+X'},rootMotion:false,skeleton:medium.skeleton,grip:medium.grip,variants,clips,
 transitions:{runtime:'runtime.mjs',method:'Normalized quaternion and translation cubic Hermite bridge with shared endpoint derivatives',defaultDurationSeconds:.3,nativeAdjacent:[{from:'serve_toss',to:'serve_whip'},{from:'serve_whip',to:'serve_land'}]},
 provenance:{baseCommit:'f5f2b408',gripCommit:'a096e507b11389fc10272c38101f968820e89f7e',gripPlayerSha256:sha(original),qaCommit:'5eb4f093bc22523ee417a7f2345c3b813bffba24'},authorship:{method:'Original analytic IK tennis choreography; deterministic authored motion, not motion capture',license:'CC0-1.0'}};
await fs.writeFile(new URL('catalog.json',base),JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({logicalClips:clips.length,variants},null,2));
