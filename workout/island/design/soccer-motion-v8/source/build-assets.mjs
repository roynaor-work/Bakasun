#!/usr/bin/env node
/** Build canonical-18 native clips over the original Draco meshes. Original
 * bytes remain intact while authoring; the reachability pass then copies every
 * live geometry/skin/texture/animation block verbatim and removes stale data. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {buildMotions,bones,initial,transitionMap,rebuildBallPaths} from './motions.mjs';
import {compactGLB} from './compact-glb.mjs';
import {calibrateContacts} from './calibrate-contacts.mjs';
import {bakeHeldPaths} from './bake-held-paths.mjs';
const directory=new URL('../',import.meta.url),runtime=new URL('runtime/',directory);
const motions=buildMotions();
const sourceFiles={field:new URL('../../soccer-v7/characters/models/player-01-lod1.glb',import.meta.url),keeper:new URL('../../soccer-v7/characters/models/goalkeeper-lod1.glb',import.meta.url)};
const calibration=await calibrateContacts(motions,sourceFiles);rebuildBallPaths(motions);
await bakeHeldPaths(motions,sourceFiles);
console.log(`Calibrated ${calibration.length} cues against actual skinned triangles`);
await mkdir(runtime,{recursive:true});
function parse(bytes){if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2)throw Error('Invalid source GLB');let json,bin;for(let offset=12;offset<bytes.length;){const size=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),chunk=bytes.subarray(offset+8,offset+8+size);if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8'));if(type===0x004e4942)bin=chunk;offset+=size+8;}if(!json||!bin)throw Error('Source chunks missing');return {json,bin};}
function assemble(json,bin){const raw=Buffer.from(JSON.stringify(json)),jsonBytes=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(jsonBytes);const binary=Buffer.alloc(Math.ceil(bin.length/4)*4);bin.copy(binary);const total=12+8+jsonBytes.length+8+binary.length,head=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(total,8);jh.writeUInt32LE(jsonBytes.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([head,jh,jsonBytes,bh,binary]);}
for(const role of ['field','keeper']){
 const source=sourceFiles[role];
 const original=await readFile(source),{json,bin}=parse(original),parts=[bin];let byteLength=bin.length;
 const accessor=(values,components,type)=>{const pad=(4-byteLength%4)%4;if(pad){parts.push(Buffer.alloc(pad));byteLength+=pad;}const bytes=Buffer.alloc(values.length*4);values.forEach((value,i)=>bytes.writeFloatLE(value,i*4));const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:bytes.length});parts.push(bytes);byteLength+=bytes.length;const index=json.accessors.length,entry={bufferView:view,componentType:5126,count:values.length/components,type};if(type==='SCALAR'){entry.min=[Math.min(...values)];entry.max=[Math.max(...values)];}json.accessors.push(entry);return index;};
 json.animations=[];
 for(const motion of motions.filter(m=>m.metadata.role===role)){
  const input=accessor(motion.frames.map(f=>f.time),1,'SCALAR'),animation={name:motion.metadata.id,samplers:[],channels:[],extras:{duration:motion.metadata.duration,loop:motion.metadata.loop,rootMotion:false,canonicalSkeleton:'motion2-18'}};
  for(const bone of bones){const index=json.nodes.findIndex(n=>n.name===bone.name);if(index<0)throw Error(`Missing ${bone.name}`);const values=motion.frames.flatMap(f=>f.rotations[bone.name]),output=accessor(values,4,'VEC4'),sampler=animation.samplers.length;animation.samplers.push({input,output,interpolation:'LINEAR'});animation.channels.push({sampler,target:{node:index,path:'rotation'}});}
  const hipsIndex=json.nodes.findIndex(n=>n.name==='Hips'),output=accessor(motion.frames.flatMap(f=>f.hips),3,'VEC3'),sampler=animation.samplers.length;animation.samplers.push({input,output,interpolation:'LINEAR'});animation.channels.push({sampler,target:{node:hipsIndex,path:'translation'}});json.animations.push(animation);
 }
 json.asset.generator='Soccer Motion v8 · original canonical-18 motion authoring';json.asset.copyright='Fictional athlete asset and original authored motions; see ../LICENSE.md';json.buffers[0].byteLength=byteLength;
 json.extras={...json.extras,library:'soccer-motion-v8',canonicalBoneCount:18,sourceMesh:'soccer-v7 LOD1',nativeRate:30,rootMotion:false};
 const packed=compactGLB(assemble(json,Buffer.concat(parts))),bytes=packed.bytes;if(bytes.length>1_500_000)throw Error(`${role} exceeds 1.5 MB: ${bytes.length}`);
 const name=role==='field'?'player.glb':'keeper.glb';await writeFile(new URL(name,runtime),bytes);console.log(`${name}: ${bytes.length.toLocaleString()} bytes, ${json.animations.length} clips; removed ${packed.accessorsRemoved} stale accessors / ${packed.viewsRemoved} stale views`);
}
// Authoring seeds are intentionally absent from the public event contract.
for(const motion of motions)motion.metadata.events=motion.metadata.events.map(({time,type,bone,local,position})=>({time,type,bone,local,position}));
const clips=motions.map(m=>m.metadata),transitions=transitionMap(motions);
const contents=`/** Generated compact runtime metadata. Canonical +Y up, +Z forward, +X anatomical left; metres and seconds. */\nexport const bones=${JSON.stringify(bones)};\nexport const clips=${JSON.stringify(clips)};\nexport const transitions=${JSON.stringify(transitions)};\nexport const initial=${JSON.stringify(initial)};\n`;
await writeFile(new URL('catalog.mjs',runtime),contents);console.log(`catalog: ${clips.length} clips, ${transitions.length} legal edges`);
