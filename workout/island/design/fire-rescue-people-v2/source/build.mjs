// SPDX-License-Identifier: CC0-1.0
// Deterministic, dependency-free glTF 2.0 binary writer.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createClips,skeleton} from './motions.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rawDir=process.env.FIRE_RESCUE_RAW??'/tmp/fire-rescue-people-v2/raw';
const world={};for(const b of skeleton.bones)world[b.name]=b.restTranslationMeters.map((x,i)=>x+(b.parent?world[b.parent][i]:0));
const records=[];
await fs.mkdir(path.join(root,'models'),{recursive:true});
for(const file of (await fs.readdir(rawDir)).filter(f=>f.endsWith('.json')).sort()){
 const raw=JSON.parse(await fs.readFile(path.join(rawDir,file),'utf8')),clips=createClips(raw),scale=raw.metadata.scale;
 const j={asset:{version:'2.0',generator:'Fire rescue people v2 deterministic original builder',copyright:'CC0-1.0; fictional characters. See LICENSES.md.'},scene:0,scenes:[{name:'rescue-character',nodes:[18]}],nodes:[],meshes:[],skins:[],materials:[{name:'linear vertex colour / cloth and equipment',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.83}}],animations:[],accessors:[],bufferViews:[],buffers:[{byteLength:0}],extras:{id:raw.id,units:'metres',up:'+Y',forward:'+Z',canonical18:true,nativeHz:30,triangles:raw.metadata.triangles,authorship:'Original authored geometry and skeletal phase poses; not motion capture',...raw.metadata}};
 const chunks=[];let length=0;
 function accessor(name,values,type,componentType=5126,target){
  const width={SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[type];
  const array=componentType===5126?new Float32Array(values.flat?.()??values):componentType===5123?new Uint16Array(values.flat?.()??values):new Uint8Array(values.flat?.()??values);
  while(length%4){chunks.push(Buffer.alloc(1));length++;}
  const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=j.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length,...(target?{target}:{})})-1;chunks.push(bytes);length+=bytes.length;
  const item={name,bufferView:view,componentType,count:array.length/width,type};
  if(type==='SCALAR'||name==='POSITION'){item.min=Array(width).fill(Infinity);item.max=Array(width).fill(-Infinity);for(let i=0;i<array.length;i++){item.min[i%width]=Math.min(item.min[i%width],array[i]);item.max[i%width]=Math.max(item.max[i%width],array[i]);}}
  return j.accessors.push(item)-1;
 }
 for(const b of skeleton.bones)j.nodes.push({name:b.name,translation:b.restTranslationMeters.slice(),children:[]});
 for(const [i,b]of skeleton.bones.entries())if(b.parent)j.nodes[skeleton.bones.findIndex(x=>x.name===b.parent)].children.push(i);
 const character={name:'Character',scale:[scale,scale,scale],children:[0],extras:{id:raw.id,role:raw.metadata.role}};j.nodes.push(character);
 // Meshes are identity scene roots, as required by the glTF skinning contract.
 // Stature is applied to mesh vertices and to the rig wrapper; inverse binds
 // undo that wrapper scale as well as each canonical joint translation.
 const ibm=skeleton.bones.flatMap(b=>{const [x,y,z]=world[b.name];return[1/scale,0,0,0,0,1/scale,0,0,0,0,1/scale,0,-x,-y,-z,1];});
 j.skins.push({name:'canonical18',joints:Array.from({length:18},(_,i)=>i),skeleton:0,inverseBindMatrices:accessor('inverse bind matrices',ibm,'MAT4')});
 const attrs={POSITION:accessor('POSITION',raw.positions.map(p=>p.map(x=>x*scale)),'VEC3',5126,34962),NORMAL:accessor('NORMAL',raw.normals,'VEC3',5126,34962),COLOR_0:accessor('COLOR_0',raw.colors,'VEC4',5126,34962),JOINTS_0:accessor('JOINTS_0',raw.joints,'VEC4',5121,34962),WEIGHTS_0:accessor('WEIGHTS_0',raw.weights,'VEC4',5126,34962)};
 const categories=new Map();const tagged=Array(raw.indices.length).fill('body');for(const p of raw.parts)for(let i=p.firstIndex;i<p.firstIndex+p.indexCount;i++)tagged[i]=p.category;
 for(let i=0;i<raw.indices.length;i+=3){const c=tagged[i];if(!categories.has(c))categories.set(c,[]);categories.get(c).push(...raw.indices.slice(i,i+3));}
 for(const [category,indices]of categories){const mesh=j.meshes.push({name:raw.id+'/'+category,primitives:[{attributes:attrs,indices:accessor(category+' indices',indices,'SCALAR',5123,34963),material:0,mode:4}],extras:{category}})-1;const ni=j.nodes.push({name:category,mesh,skin:0,extras:{category,clipVisibility:['hose','extinguisher'].includes(category)?[category]:null}})-1;j.scenes[0].nodes.push(ni);}
 for(const [name,socket]of Object.entries(raw.sockets)){const bone=skeleton.bones.findIndex(b=>b.name===socket.bone);const ni=j.nodes.push({name,translation:socket.translation,...(socket.rotation?{rotation:socket.rotation}:{}),extras:{socket:true,direction:socket.direction??[0,0,1]}})-1;j.nodes[bone].children.push(ni);}
 for(const clip of clips){const anim={name:clip.name,samplers:[],channels:[],extras:{labelHe:clip.label,loop:clip.loop,rootMotion:clip.rootMotion,equipment:clip.equipment,qa:clip.qa,...(clip.pair?{pair:clip.pair}:{})}};
  const input=accessor(clip.name+' time',clip.frames.map(f=>f.t),'SCALAR');
  const channel=(node,pth,type,values)=>{const sampler=anim.samplers.push({input,output:accessor(clip.name+'/'+j.nodes[node].name+'/'+pth,values,type),interpolation:'LINEAR'})-1;anim.channels.push({sampler,target:{node,path:pth}});};
  for(let i=0;i<18;i++)channel(i,'rotation','VEC4',clip.frames.map(f=>f.rotations[i]));
  channel(0,'translation','VEC3',clip.frames.map(f=>f.root));channel(1,'translation','VEC3',clip.frames.map(f=>f.hips));j.animations.push(anim);
 }
 for(const n of j.nodes)if(!n.children?.length)delete n.children;
 while(length%4){chunks.push(Buffer.alloc(1));length++;}j.buffers[0].byteLength=length;
 let json=Buffer.from(JSON.stringify(j));if(json.length%4)json=Buffer.concat([json,Buffer.alloc(4-json.length%4,32)]);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(length);binHeader.writeUInt32LE(0x004e4942,4);
 const bytes=Buffer.concat([header,json,binHeader,...chunks]);await fs.writeFile(path.join(root,'models',raw.id+'.glb'),bytes);
 records.push({id:raw.id,label:raw.metadata.labelHe,role:raw.metadata.role,file:'models/'+raw.id+'.glb',scale,scaleBakedIntoGLB:true,triangles:raw.metadata.triangles,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),clips:clips.map(({name,label,duration,loop,equipment,rootMotion,pair})=>({name,label,duration,loop,equipment,rootMotion,...(pair?{pair}:{})})),sockets:raw.sockets,categories:[...categories.keys()]});
 console.log(raw.id,bytes.length,raw.metadata.triangles,clips.length);
}
await fs.writeFile(path.join(root,'skeleton.json'),JSON.stringify(skeleton,null,2)+'\n');
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({schemaVersion:2,id:'fire-rescue-people-v2',version:'2.0.0',units:'metres',axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},skeleton:'skeleton.json',boneCount:18,nativeHz:30,triangleBudget:[1000,1300],folderBudgetBytes:8000000,preview:{file:'preview.html',width:844,height:390},license:'CC0-1.0',qa:{tool:'motion-qa-v1',sourceCommit:'5eb4f093bc22523ee417a7f2345c3b813bffba24',thresholdExclusive:88,report:'verification/motion-qa.json'},equipmentVisibility:'Show only the categories named by active clip.equipment; body and stroller remain visible. Equipment remains in GLB for host-controlled switching.',pairing:'Synchronize 5.6 second rescue_carry and carried_shoulder at identical local scene origins. Character scale is baked in Character wrapper; do not apply it again.',characters:records},null,2)+'\n');
