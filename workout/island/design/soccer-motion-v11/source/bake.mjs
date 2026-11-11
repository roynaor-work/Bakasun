/** CC0-1.0. Bake original v11 motion onto the existing CC0 fictional rig.
 * Already decoded v10 geometry is read offline; resulting GLBs need no codec.
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unpack,compact} from './glb.mjs';
const base=new URL('../',import.meta.url),runtime=new URL('runtime/',base);
const legacy=new URL('../../soccer-motion-v10/',import.meta.url);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const requireThat=(ok,message)=>{if(!ok)throw Error(message);};
const arrayTypes=new Map([[Float32Array,5126],[Uint32Array,5125],[Uint16Array,5123],[Uint8Array,5121],[Int16Array,5122],[Int8Array,5120]]);
const shapes={1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4',16:'MAT4'};
function writer(document,binary){
 const parts=[binary];let length=binary.length;
 function append(array,itemSize,{target,minmax=false,normalized=false}={}){
  requireThat(arrayTypes.has(array.constructor)&&shapes[itemSize],'Unsupported typed accessor');
  const padding=(4-length%4)%4;if(padding){parts.push(Buffer.alloc(padding));length+=padding;}
  const buffer=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=document.bufferViews.length;
  document.bufferViews.push({buffer:0,byteOffset:length,byteLength:buffer.length,...(target?{target}:{})});parts.push(buffer);length+=buffer.length;
  const accessor={bufferView:view,componentType:arrayTypes.get(array.constructor),count:array.length/itemSize,type:shapes[itemSize],...(normalized?{normalized:true}:{})};
  if(minmax){accessor.min=Array(itemSize).fill(Infinity);accessor.max=Array(itemSize).fill(-Infinity);for(let i=0;i<array.length;i++){accessor.min[i%itemSize]=Math.min(accessor.min[i%itemSize],array[i]);accessor.max[i%itemSize]=Math.max(accessor.max[i%itemSize],array[i]);}}
  document.accessors.push(accessor);return document.accessors.length-1;
 }
 return {append,finish(){document.buffers=[{byteLength:length}];return compact(document,Buffer.concat(parts));}};
}

function bakeClip(template,motion,skeleton){
 const document=structuredClone(template.document),out=writer(document,template.binary),frames=motion.frames;
 requireThat(Array.isArray(frames)&&frames.length>=2,`${motion.id}: frames absent`);
 requireThat(Math.abs(frames.at(-1).time-motion.duration)<2e-6,`${motion.id}: duration mismatch`);
 for(let i=0;i<frames.length;i++)requireThat(Math.abs(frames[i].time-i/30)<2e-6,`${motion.id}: not native 30Hz`);
 const input=out.append(new Float32Array(frames.map(f=>f.time)),1,{minmax:true});
 const animation={name:motion.id,samplers:[],channels:[],extras:{nativeRate:30,canonicalSkeleton:'motion2-18',license:'CC0-1.0',loop:!!motion.loop,events:motion.events??[],event:motion.event??null,contactFrame:motion.contactFrame??null,rootMotion:motion.rootMotion}};
 function channel(node,path,output){animation.channels.push({sampler:animation.samplers.length,target:{node,path}});animation.samplers.push({input,output,interpolation:'LINEAR'});}
 for(const bone of skeleton){
  const node=document.nodes.findIndex(n=>n.name===bone.name);requireThat(node>=0,`${motion.id}: absent ${bone.name}`);
  let previous;const values=[];
  for(const frame of frames){let q=frame.rotations[bone.name];requireThat(q?.length===4&&q.every(Number.isFinite),`${motion.id}: invalid ${bone.name}`);
   const norm=Math.hypot(...q);requireThat(Math.abs(norm-1)<1e-4,`${motion.id}: unnormalized ${bone.name}`);q=q.map(x=>x/norm);
   if(bone.name==='Root')requireThat(Math.hypot(...q.slice(0,3))<1e-6&&Math.abs(Math.abs(q[3])-1)<1e-6,`${motion.id}: Root must remain identity when motion is extracted`);
   if(previous&&q.reduce((sum,x,i)=>sum+x*previous[i],0)<0)q=q.map(x=>-x);values.push(...q);previous=q;
  }
  channel(node,'rotation',out.append(new Float32Array(values),4));
 }
 const hips=document.nodes.findIndex(n=>n.name==='Hips');
 channel(hips,'translation',out.append(new Float32Array(frames.flatMap(f=>{requireThat(f.hips?.length===3&&f.hips.every(Number.isFinite),`${motion.id}: invalid hips`);return f.hips;})),3));
 document.animations=[animation];
 document.asset.generator='Soccer Motion v11 original animation; offline-decoded canonical CC0 geometry';
 document.asset.copyright=`CC0-1.0; fictional MakeHuman-derived v8 geometry; ${motion.sourceAsset?'reference motion from v9 native GLB samples':'original v11 motion'}. See LICENSES.md.`;
 document.extras={library:'soccer-motion-v11',id:motion.id,nativeRate:30,canonicalBoneCount:18,rootMotion:motion.rootMotion,events:motion.events??[],event:motion.event??null,contactFrame:motion.contactFrame??null,compression:'none'};
 if(motion.sourceAsset)document.extras.referenceSource={path:motion.sourceAsset,sha256:motion.sourceSha256};
 const bytes=out.finish(),check=unpack(bytes);
 requireThat(!JSON.stringify(check.document).includes('KHR_draco_mesh_compression')&&!JSON.stringify(check.document).includes('EXT_meshopt_compression'),`${motion.id}: compression remains`);
 return bytes;
}


await fs.mkdir(new URL('clips/',runtime),{recursive:true});
await fs.mkdir(new URL('reference/',runtime),{recursive:true});
const provenance={license:'CC0-1.0',library:'soccer-motion-v11',sourceCommits:{v10:'57c536e1291803161e069eff97987295c6194466',v9:'5d516207d66cdf91af062b93142e04c6dcbae131'},sources:[],references:[]};
const templates={};
for(const [role,name] of [['field','idle_relaxed'],['keeper','goalkeeper_hand_roll']]){
 const path=`runtime/clips/${name}.glb`,bytes=await fs.readFile(new URL(path,legacy)),g=unpack(bytes);
 g.document.animations=[];templates[role]=unpack(compact(g.document,g.binary));
 provenance.sources.push({role,path:`../soccer-motion-v10/${path}`,sha256:sha256(bytes),license:'CC0-1.0'});
}
const oldReference=JSON.parse(await fs.readFile(new URL('verification/reference.json',legacy),'utf8'));
const oldMotions=JSON.parse(await fs.readFile(new URL('runtime/motions.json',legacy),'utf8'));

for(const version of ['v9','v10'])for(const name of ['idle_relaxed','run']){
 const id=`${version}_${name}`,path=`runtime/${version==='v9'?'reference':'clips'}/${name}.glb`,bytes=await fs.readFile(new URL(path,legacy)),g=unpack(bytes);
 requireThat(!JSON.stringify(g.document).includes('KHR_draco_mesh_compression'),'Reference must be decoded');
 await fs.writeFile(new URL(`reference/${id}.glb`,runtime),bytes);
 const record={id,asset:`reference/${id}.glb`,bytes:bytes.length,sha256:sha256(bytes),source:`../soccer-motion-v10/${path}`,license:'CC0-1.0',version};
 if(version==='v9')record.nativeSource={commit:oldReference.sourceCommit,path:oldReference.clips[name].sourceAsset,sha256:oldReference.clips[name].sourceSha256,note:'Native v9 animation channels re-baked by v10 onto decoded identical canonical CC0 geometry.'};
 const referenceMeta=version==='v9'?oldReference.clips[name]:oldMotions.clips.find(c=>c.id===name);
 Object.assign(record,{duration:referenceMeta.duration,nativeRate:30,supports:referenceMeta.supports,referenceRootMotion:referenceMeta.referenceRootMotion});
 provenance.references.push(record);
}
const motionBytes=await fs.readFile(new URL('motions.json',runtime)),data=JSON.parse(motionBytes);
const clips=[];
for(const motion of data.clips){
 requireThat(/^[a-z0-9_]+$/.test(motion.id),'Unsafe clip ID');
 const bytes=bakeClip(templates[motion.role==='keeper'?'keeper':'field'],motion,data.skeleton);
 await fs.writeFile(new URL(`clips/${motion.id}.glb`,runtime),bytes);
 const {frames,...metadata}=motion;
 clips.push({...metadata,asset:`clips/${motion.id}.glb`,bytes:bytes.length,sha256:sha256(bytes),compression:'none'});
}
const {clips:omitted,...metadata}=data;
await fs.writeFile(new URL('catalog.json',runtime),JSON.stringify({...metadata,sourceMotionSha256:sha256(motionBytes),references:provenance.references,clips},null,2)+'\n');
await fs.writeFile(new URL('verification/provenance.json',base),JSON.stringify(provenance,null,2)+'\n');
console.log(`Baked ${clips.length} original v11 clips; ${provenance.references.length} decoded reference GLBs.`);
