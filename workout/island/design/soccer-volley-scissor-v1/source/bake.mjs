// SPDX-License-Identifier: CC0-1.0
// Canonical18 GLB bake derived from soccer-kicks-v2; actual mesh and skin retained.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unpack,compact,readAccessor} from './glb.mjs';
import {BufferGeometry,Float32BufferAttribute} from '../vendor/three.module.js';
const base=new URL('../',import.meta.url),source=await fs.readFile(new URL('motions.json',base)),data=JSON.parse(source),template=unpack(await fs.readFile(new URL('reference/idle_relaxed.glb',base)));
const hash=b=>createHash('sha256').update(b).digest('hex'),entries=[];
for(const motion of data.clips){const document=structuredClone(template.document),parts=[template.binary];let length=template.binary.length;
function accessor(values,width){const bytes=Buffer.from(new Float32Array(values).buffer),padding=(4-length%4)%4;if(padding){parts.push(Buffer.alloc(padding));length+=padding;}const view=document.bufferViews.length;document.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});parts.push(bytes);length+=bytes.length;const r={bufferView:view,componentType:5126,count:values.length/width,type:width===1?'SCALAR':width===3?'VEC3':'VEC4'};if(width===1){r.min=[Math.min(...values)];r.max=[Math.max(...values)];}document.accessors.push(r);return document.accessors.length-1;}
// Existing normal maps need explicit tangents for portable glTF rendering.
// Preserve all position/normal/UV/skin data and derive only the tangent stream.
for(const mesh of document.meshes)for(const primitive of mesh.primitives){
 if(!document.materials?.[primitive.material]?.normalTexture||primitive.attributes.TANGENT!==undefined)continue;
 const g=new BufferGeometry();
 for(const [semantic,attribute,width]of [['POSITION','position',3],['NORMAL','normal',3],['TEXCOORD_0','uv',2]])g.setAttribute(attribute,new Float32BufferAttribute(readAccessor(template,primitive.attributes[semantic]).values,width));
 g.setIndex(readAccessor(template,primitive.indices).values);g.computeTangents();
 const tangent=g.getAttribute('tangent');
 if(!tangent||Array.from(tangent.array).some(v=>!Number.isFinite(v)))throw new Error('Invalid generated tangents');
 // Degenerate UV triangles in the source hair have no unique UV tangent.
 // Use a deterministic unit vector perpendicular to their vertex normal.
 const normal=g.getAttribute('normal');
 for(let i=0;i<tangent.count;i++)if(Math.hypot(tangent.getX(i),tangent.getY(i),tangent.getZ(i))<1e-8){
  const nx=normal.getX(i),ny=normal.getY(i),nz=normal.getZ(i);
  let tx,ty,tz;if(Math.abs(nx)<.9){tx=0;ty=nz;tz=-ny;}else{tx=-nz;ty=0;tz=nx;}
  const n=Math.hypot(tx,ty,tz);tangent.setXYZW(i,tx/n,ty/n,tz/n,1);
 }
 primitive.attributes.TANGENT=accessor(tangent.array,4);
 document.bufferViews[document.accessors[primitive.attributes.TANGENT].bufferView].target=34962;
 g.dispose();
}
const input=accessor(motion.frames.map(f=>f.time),1),animation={name:motion.id,samplers:[],channels:[],extras:{nativeRate:30,canonicalSkeleton:'motion2-18',license:'CC0-1.0',rootMotion:false,events:motion.events,coreRange:motion.coreRange}};
function channel(name,path,values,width){const node=document.nodes.findIndex(n=>n.name===name);if(node<0)throw new Error('Missing '+name);animation.channels.push({sampler:animation.samplers.length,target:{node,path}});animation.samplers.push({input,output:accessor(values,width),interpolation:'LINEAR'});}
for(const{name}of data.skeleton){let prev;const values=[];for(const f of motion.frames){let q=f.rotations[name],n=Math.hypot(...q);q=q.map(v=>v/n);if(prev&&q.reduce((s,v,i)=>s+v*prev[i],0)<0)q=q.map(v=>-v);values.push(...q);prev=q;}channel(name,'rotation',values,4);}channel('Hips','translation',motion.frames.flatMap(f=>f.hips),3);
document.animations=[animation];document.buffers=[{byteLength:length}];document.asset.generator='Original CC0 soccer-volley-scissor-v1; canonical18; 30Hz; uncompressed';document.asset.copyright='CC0-1.0 motion and existing fictional CC0 canonical18 geometry. See LICENSES.md.';document.extras={library:data.version,id:motion.id,nativeRate:30,canonicalBoneCount:18,rootMotion:false,compression:'none',events:motion.events,contact:motion.contact,contactGeometry:motion.contactGeometry,ballHeightRangeMeters:motion.ballHeightRangeMeters};
const bytes=compact(document,Buffer.concat(parts));await fs.writeFile(new URL(`clips/${motion.id}.glb`,base),bytes);const{frames,...entry}=motion;entries.push({...entry,asset:`clips/${motion.id}.glb`,bytes:bytes.length,sha256:hash(bytes),compression:'none'});}
await fs.writeFile(new URL('catalog.json',base),JSON.stringify({...data,clips:entries,sourceMotionSha256:hash(source)},null,2)+'\n');console.log(`Baked ${entries.length} GLBs; ${entries.reduce((s,c)=>s+c.bytes,0)} bytes`);
