// SPDX-License-Identifier: CC0-1.0
// Bake original 30Hz soccer actions into the uncompressed canonical v10 CC0 mesh.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unpack,compact} from './glb.mjs';
const base=new URL('../',import.meta.url),runtime=new URL('runtime/',base);
const source=await fs.readFile(new URL('motions.json',runtime)),data=JSON.parse(source);
const template=unpack(await fs.readFile(new URL('reference/idle_relaxed.glb',runtime)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const entries=[];
for(const motion of data.clips){
  const document=structuredClone(template.document),parts=[template.binary];let length=template.binary.length;
  function accessor(values,width){
    const a=new Float32Array(values),bytes=Buffer.from(a.buffer),padding=(4-length%4)%4;
    if(padding){parts.push(Buffer.alloc(padding));length+=padding;}
    const view=document.bufferViews.length;document.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});parts.push(bytes);length+=bytes.length;
    const record={bufferView:view,componentType:5126,count:values.length/width,type:width===1?'SCALAR':width===3?'VEC3':'VEC4'};
    if(width===1){record.min=[Math.min(...values)];record.max=[Math.max(...values)];}
    document.accessors.push(record);return document.accessors.length-1;
  }
  const input=accessor(motion.frames.map(f=>f.time),1),animation={name:motion.id,samplers:[],channels:[],extras:{nativeRate:30,canonicalSkeleton:'motion2-18',license:'CC0-1.0',rootMotion:false,events:motion.events,coreRange:motion.coreRange}};
  function channel(name,path,values,width){
    const node=document.nodes.findIndex(n=>n.name===name);if(node<0)throw new Error(`Missing ${name}`);
    animation.channels.push({sampler:animation.samplers.length,target:{node,path}});animation.samplers.push({input,output:accessor(values,width),interpolation:'LINEAR'});
  }
  for(const {name} of data.skeleton){
    let previous;const values=[];
    for(const f of motion.frames){let q=f.rotations[name];const n=Math.hypot(...q);q=q.map(x=>x/n);
      if(previous&&q.reduce((s,x,i)=>s+x*previous[i],0)<0)q=q.map(x=>-x);values.push(...q);previous=q;
    }
    channel(name,'rotation',values,4);
  }
  channel('Hips','translation',motion.frames.flatMap(f=>f.hips),3);
  document.animations=[animation];document.buffers=[{byteLength:length}];
  document.asset.generator='Original CC0 soccer-clips-v13, canonical18, 30Hz, no compression';
  document.asset.copyright='CC0-1.0 original motion; fictional CC0 v10/v8 geometry. See LICENSES.md.';
  document.extras={library:data.version,id:motion.id,nativeRate:30,canonicalBoneCount:18,rootMotion:false,compression:'none',events:motion.events,coreRange:motion.coreRange};
  const bytes=compact(document,Buffer.concat(parts));
  await fs.writeFile(new URL(`clips/${motion.id}.glb`,runtime),bytes);
  const {frames,...entry}=motion;entries.push({...entry,asset:`clips/${motion.id}.glb`,bytes:bytes.length,sha256:hash(bytes),compression:'none'});
}
await fs.writeFile(new URL('catalog.json',runtime),JSON.stringify({...data,clips:entries,sourceMotionSha256:hash(source)},null,2)+'\n');
console.log(`Baked ${entries.length} uncompressed soccer-action GLBs, ${entries.reduce((s,c)=>s+c.bytes,0)} bytes.`);
