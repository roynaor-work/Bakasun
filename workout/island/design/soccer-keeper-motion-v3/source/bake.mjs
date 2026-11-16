// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unpack,compact} from './glb.mjs';
const base=new URL('../',import.meta.url),source=await fs.readFile(new URL('motions.json',base)),data=JSON.parse(source),hash=b=>createHash('sha256').update(b).digest('hex'),entries=[];
for(const motion of data.clips){
 const templatePath=motion.role==='goalkeeper'?'reference/keeper-template.glb':'reference/idle_relaxed.glb',templateBytes=await fs.readFile(new URL(templatePath,base)),template=unpack(templateBytes),document=structuredClone(template.document),parts=[template.binary];let length=template.binary.length;
 function accessor(values,width){const bytes=Buffer.from(new Float32Array(values).buffer),padding=(4-length%4)%4;if(padding){parts.push(Buffer.alloc(padding));length+=padding;}const bufferView=document.bufferViews.length;document.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});parts.push(bytes);length+=bytes.length;const a={bufferView,componentType:5126,count:values.length/width,type:width===1?'SCALAR':width===3?'VEC3':'VEC4'};if(width===1){a.min=[Math.min(...values)];a.max=[Math.max(...values)];}document.accessors.push(a);return document.accessors.length-1;}
 const input=accessor(motion.frames.map(f=>f.time),1),animation={name:motion.id,samplers:[],channels:[],extras:{nativeRate:30,rootMotion:false,license:'CC0-1.0',events:motion.events}};
 function channel(name,path,values,width){const node=document.nodes.findIndex(n=>n.name===name);if(node<0)throw Error('Missing '+name);animation.channels.push({sampler:animation.samplers.length,target:{node,path}});animation.samplers.push({input,output:accessor(values,width),interpolation:'LINEAR'});}
 for(const {name}of data.skeleton){let previous;const values=[];for(const f of motion.frames){let q=f.rotations[name],n=Math.hypot(...q);q=q.map(v=>v/n);if(previous&&q.reduce((s,v,i)=>s+v*previous[i],0)<0)q=q.map(v=>-v);values.push(...q);previous=q;}channel(name,'rotation',values,4);}
 channel('Hips','translation',motion.frames.flatMap(f=>f.hips),3);
 document.animations=[animation];document.buffers=[{byteLength:length}];document.asset.generator='CC0 soccer-keeper-motion-v3 canonical18 30Hz';document.asset.copyright='CC0-1.0 original choreography and inherited fictional MakeHuman mesh; see LICENSES.md';document.extras={library:data.version,id:motion.id,nativeRate:30,canonicalBoneCount:18,rootMotion:false,compression:'none'};
 const bytes=compact(document,Buffer.concat(parts));await fs.writeFile(new URL(`clips/${motion.id}.glb`,base),bytes);const {frames,...entry}=motion;entries.push({...entry,asset:`clips/${motion.id}.glb`,bytes:bytes.length,sha256:hash(bytes),compression:'none',meshSource:{path:templatePath,sha256:hash(templateBytes)},sheet:`sheets/${motion.id}.png`});
}
await fs.writeFile(new URL('catalog.json',base),JSON.stringify({...data,clips:entries,qaReferences:[{id:'idle_relaxed',role:'field',asset:'reference/idle_relaxed.glb'},{id:'run',role:'field',asset:'reference/run.glb'}],sourceMotionSha256:hash(source)},null,2)+'\n');
console.log(`Baked ${entries.length} self-contained GLBs (${entries.reduce((s,c)=>s+c.bytes,0)} bytes).`);
