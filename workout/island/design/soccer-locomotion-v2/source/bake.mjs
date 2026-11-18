// SPDX-License-Identifier: CC0-1.0
// Same canonical skin and GLB layout as soccer-header-v1; no compressed data.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unpack,compact} from '../../soccer-header-v1/source/glb.mjs';
const base=new URL('../',import.meta.url),runtime=new URL('runtime/',base);
const source=await fs.readFile(new URL('motions.json',runtime)),data=JSON.parse(source);
const templateBytes=await fs.readFile(new URL('../../soccer-header-v1/runtime/reference/idle_relaxed.glb',import.meta.url));
const template=unpack(templateBytes),hash=b=>createHash('sha256').update(b).digest('hex');
const entries=[];
for(const motion of data.clips){
 const document=structuredClone(template.document),parts=[template.binary];let length=template.binary.length;
 function accessor(values,width){
  const bytes=Buffer.from(new Float32Array(values).buffer),padding=(4-length%4)%4;
  if(padding){parts.push(Buffer.alloc(padding));length+=padding;}
  const bufferView=document.bufferViews.length;document.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});parts.push(bytes);length+=bytes.length;
  const record={bufferView,componentType:5126,count:values.length/width,type:width===1?'SCALAR':width===3?'VEC3':'VEC4'};
  if(width===1){record.min=[Math.min(...values)];record.max=[Math.max(...values)];}
  document.accessors.push(record);return document.accessors.length-1;
 }
 const input=accessor(motion.frames.map(f=>f.time),1),animation={name:motion.id,samplers:[],channels:[],extras:{nativeRate:30,rootMotion:false,license:'CC0-1.0'}};
 function channel(name,path,values,width){const node=document.nodes.findIndex(n=>n.name===name);if(node<0)throw Error('Missing '+name);animation.channels.push({sampler:animation.samplers.length,target:{node,path}});animation.samplers.push({input,output:accessor(values,width),interpolation:'LINEAR'});}
 for(const {name}of data.skeleton){let previous;const values=[];for(const f of motion.frames){let q=f.rotations[name],n=Math.hypot(...q);q=q.map(v=>v/n);if(previous&&q.reduce((s,v,i)=>s+v*previous[i],0)<0)q=q.map(v=>-v);values.push(...q);previous=q;}channel(name,'rotation',values,4);}
 channel('Hips','translation',motion.frames.flatMap(f=>f.hips),3);
 document.animations=[animation];document.buffers=[{byteLength:length}];document.asset.generator='Original CC0 soccer-locomotion-v2 canonical18 30Hz';document.asset.copyright='CC0-1.0 motion and fictional v10/v8 mesh; see LICENSES.md';
 document.extras={library:data.version,id:motion.id,nativeRate:30,canonicalBoneCount:18,rootMotion:false,compression:'none'};
 const bytes=compact(document,Buffer.concat(parts));await fs.writeFile(new URL(`clips/${motion.id}.glb`,runtime),bytes);
 const {frames,...entry}=motion;entries.push({...entry,asset:`clips/${motion.id}.glb`,bytes:bytes.length,sha256:hash(bytes),compression:'none'});
}
await fs.writeFile(new URL('catalog.json',runtime),JSON.stringify({...data,clips:entries,sourceMotionSha256:hash(source),meshSource:{path:'../soccer-header-v1/runtime/reference/idle_relaxed.glb',sha256:hash(templateBytes)}},null,2)+'\n');
console.log(`Baked ${entries.length} uncompressed GLBs.`);
