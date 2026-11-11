/** Original v10 uncompressed GLB baking. CC0-1.0.
 * Run node source/bake.mjs after authoring runtime/motions.json.
 * Only v10 outputs are written. v8 geometry is read and decoded offline once;
 * no decoder or WebAssembly is used by the resulting runtime assets.
 */
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadNativeGLTF} from '../../soccer-motion-v8/verification/glb-reader.mjs';
import {unpack,compact} from './glb.mjs';

const base=new URL('../',import.meta.url),runtime=new URL('runtime/',base);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const requireThat=(ok,message)=>{if(!ok)throw new Error(message);};
const sourceAssets={field:new URL('../../soccer-motion-v8/runtime/player.glb',import.meta.url),keeper:new URL('../../soccer-motion-v8/runtime/keeper.glb',import.meta.url)};
const semanticNames={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',TEXCOORD_1:'uv1',COLOR_0:'color',JOINTS_0:'skinIndex',WEIGHTS_0:'skinWeight',TANGENT:'tangent'};
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

/** Preserve nodes, skins, materials, embedded images and exact decoded mesh
 * attributes. Only compression and old animations are removed. */
async function decodeTemplate(role){
 const source=sourceAssets[role],bytes=await fs.readFile(source),g=unpack(bytes),document=g.document;
 document.animations=[];
 const out=writer(document,g.binary),loaded=await loadNativeGLTF(fileURLToPath(source)),done=new Set();
 loaded.scene.traverse(object=>{
  if(!object.isMesh)return;
  const association=loaded.parser.associations.get(object);
  requireThat(association&&Number.isInteger(association.meshes)&&Number.isInteger(association.primitives),'Decoded mesh association absent');
  const key=association.meshes+':'+association.primitives;if(done.has(key))return;done.add(key);
  const primitive=document.meshes[association.meshes].primitives[association.primitives],geometry=object.geometry;
  for(const semantic of Object.keys(primitive.attributes)){
   const attribute=geometry.attributes[semanticNames[semantic]];requireThat(attribute&&!attribute.isInterleavedBufferAttribute,`Cannot preserve ${semantic}`);
   primitive.attributes[semantic]=out.append(attribute.array,attribute.itemSize,{target:34962,minmax:semantic==='POSITION',normalized:attribute.normalized});
  }
  requireThat(geometry.index,'Expected indexed source geometry');
  primitive.indices=out.append(geometry.index.array,1,{target:34963});
  if(primitive.extensions){delete primitive.extensions.KHR_draco_mesh_compression;delete primitive.extensions.EXT_meshopt_compression;if(!Object.keys(primitive.extensions).length)delete primitive.extensions;}
 });
 requireThat(done.size===document.meshes.reduce((sum,m)=>sum+m.primitives.length,0),'Not every source mesh was decoded');
 for(const field of ['extensionsUsed','extensionsRequired']){document[field]=(document[field]??[]).filter(x=>!['KHR_draco_mesh_compression','EXT_meshopt_compression'].includes(x));if(!document[field].length)delete document[field];}
 const result=unpack(out.finish());
 loaded.scene.traverse(object=>{object.geometry?.dispose();for(const m of Array.isArray(object.material)?object.material:[object.material])m?.dispose();});
 return {...result,source:{path:fileURLToPath(source),sha256:sha256(bytes)}};
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
 document.asset.generator='Soccer Motion v10 original animation; offline-decoded canonical CC0 geometry';
 document.asset.copyright=`CC0-1.0; fictional MakeHuman-derived v8 geometry; ${motion.sourceAsset?'reference motion from v9 native GLB samples':'original v10 motion'}. See LICENSES.md.`;
 document.extras={library:'soccer-motion-v10',id:motion.id,nativeRate:30,canonicalBoneCount:18,rootMotion:motion.rootMotion,events:motion.events??[],event:motion.event??null,contactFrame:motion.contactFrame??null,compression:'none'};
 if(motion.sourceAsset)document.extras.referenceSource={path:motion.sourceAsset,sha256:motion.sourceSha256};
 const bytes=out.finish(),check=unpack(bytes);
 requireThat(!JSON.stringify(check.document).includes('KHR_draco_mesh_compression')&&!JSON.stringify(check.document).includes('EXT_meshopt_compression'),`${motion.id}: compression remains`);
 return bytes;
}

await fs.mkdir(new URL('reference/',runtime),{recursive:true});
const references=JSON.parse(await fs.readFile(new URL('verification/reference.json',base),'utf8'));
const field=await decodeTemplate('field');
for(const reference of Object.values(references.clips)){
 if(reference.runtime===false)continue;
 const bytes=bakeClip(field,reference,references.skeleton);
 await fs.writeFile(new URL(`reference/${reference.id}.glb`,runtime),bytes);
 reference.runtimeSha256=sha256(bytes);reference.runtimeBytes=bytes.length;
}
await fs.writeFile(new URL('verification/reference.json',base),JSON.stringify(references,null,2)+'\n');
console.log('Baked uncompressed v9 locomotion references from recorded native GLB samples.');
if(!process.argv.includes('--references-only')){
 const motionBytes=await fs.readFile(new URL('motions.json',runtime));
 const data=JSON.parse(motionBytes.toString('utf8'));
 const templates={field};if(data.clips.some(c=>c.role==='keeper'))templates.keeper=await decodeTemplate('keeper');
 await fs.mkdir(new URL('clips/',runtime),{recursive:true});const clips=[];
 for(const motion of data.clips){
  requireThat(/^[a-z0-9_]+$/.test(motion.id),`Invalid clip id ${motion.id}`);
  const bytes=bakeClip(templates[motion.role==='keeper'?'keeper':'field'],motion,data.skeleton);
  await fs.writeFile(new URL(`clips/${motion.id}.glb`,runtime),bytes);
  const {frames,...metadata}=motion;clips.push({...metadata,asset:`clips/${motion.id}.glb`,bytes:bytes.length,sha256:sha256(bytes),compression:'none'});
 }
 const {clips:ignored,...metadata}=data;
 await fs.writeFile(new URL('catalog.json',runtime),JSON.stringify({...metadata,sourceMotionSha256:sha256(motionBytes),clips},null,2)+'\n');
 console.log(`Baked ${clips.length} no-Draco runtime clips (${clips.reduce((sum,c)=>sum+c.bytes,0)} bytes).`);
}
