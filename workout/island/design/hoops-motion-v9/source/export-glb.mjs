/** Bake original 30Hz canonical clips into standalone Draco-compressed GLBs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createIO,buildModel,PACKAGE_ROOT} from './model.mjs';
import {CLIPS} from '../runtime/catalog.mjs';
import {SKELETON} from '../runtime/skeleton.mjs';
const require=createRequire(path.join(process.env.HOOPS_TOOLS_DIR||'/tmp/hoops-v9-tools','package.json'));
const {Accessor}=require('@gltf-transform/core');
const {draco}=require('@gltf-transform/functions');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function exportClips({ids=null,rebuildModel=false,modelBytes=null,outputDirectory=path.join(PACKAGE_ROOT,'runtime/clips')}={}){
 const io=await createIO(),modelPath=path.join(PACKAGE_ROOT,'source/preview-model.glb');
 if(rebuildModel)await buildModel();
 let model=modelBytes; if(!model)try{model=await fs.readFile(modelPath);}catch(error){if(error.code!=='ENOENT')throw error;model=(await buildModel()).bytes;}
 const directory=path.join(PACKAGE_ROOT,'runtime/keyframes');
 const files=(await fs.readdir(directory)).filter(n=>n.endsWith('.json.gz')&&(!ids||ids.includes(n.slice(0,-8)))).sort();
 if(!files.length)throw new Error('No 30Hz source clips found; run source/build.mjs first');
 await fs.mkdir(outputDirectory,{recursive:true});const results=[];
 for(const name of files){
   const jsonBytes=await fs.readFile(path.join(directory,name)),clip=JSON.parse(gunzipSync(jsonBytes)),id=clip.id;
   if(!CLIPS[id])throw new Error(`Unknown catalog clip: ${id}`);
   const duration=clip.durationSeconds,frames=clip.keyframes;
   if(clip.sampleRate!==30||frames.length!==Math.round(duration*30)+1)throw new Error(`${id}: expected exact 30Hz frame grid`);
   for(let i=0;i<frames.length;i++)if(Math.abs(frames[i].time*duration-i/30)>1e-6)throw new Error(`${id}: off-grid frame ${i}`);
   const doc=await io.readBinary(model),root=doc.getRoot(),buffer=root.listBuffers()[0],nodes=Object.fromEntries(root.listNodes().map(n=>[n.getName(),n]));
   for(const skin of root.listSkins())if(JSON.stringify(skin.listJoints().map(j=>j.getName()))!==JSON.stringify(SKELETON.bones.map(b=>b.name)))throw new Error('Exact18 model skin was changed');
   const times=doc.createAccessor(id+' seconds').setBuffer(buffer).setType(Accessor.Type.SCALAR).setArray(new Float32Array(frames.map((f,i)=>i/30)));
   const animation=doc.createAnimation(id).setExtras({loop:!!clip.loop,sampleRate:30,durationSeconds:duration,events:clip.events||[]});
   function track(node,property,values,width){
     const accessor=doc.createAccessor(`${id} ${node.getName()} ${property}`).setBuffer(buffer).setType(width===4?Accessor.Type.VEC4:Accessor.Type.VEC3).setArray(new Float32Array(values));
     const sampler=doc.createAnimationSampler().setInput(times).setOutput(accessor).setInterpolation('LINEAR');
     animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setSampler(sampler).setTargetNode(node).setTargetPath(property));
   }
   function quaternions(extract){const result=[];let previous;for(const frame of frames){let q=extract(frame)||[0,0,0,1];if(q.length!==4||Math.abs(Math.hypot(...q)-1)>1e-5)throw new Error(`${id}: invalid quaternion`);if(previous&&q.reduce((s,v,k)=>s+v*previous[k],0)<0)q=q.map(v=>-v);result.push(...q);previous=q;}return result;}
   for(const bone of SKELETON.bones)track(nodes[bone.name],'rotation',quaternions(f=>f.rotations[bone.name]),4);
   const hipsRest=nodes.Hips.getTranslation();track(nodes.Hips,'translation',frames.flatMap(f=>hipsRest.map((v,i)=>v+f.hipsOffsetMeters[i])),3);
   track(nodes.Ball,'translation',frames.flatMap(f=>f.ballPositionMeters),3);track(nodes.Ball,'rotation',quaternions(f=>f.ballRotationQuaternion),4);
   if(!CLIPS[id].ball)nodes.Ball.setScale([0,0,0]);
   nodes.Ball.setExtras({radiusMeters:.12,visible:!!CLIPS[id].ball,trajectory:clip.ball?.trajectory||[],simulationOwned:true});
   root.setExtras({...root.getExtras(),clip:id,sampleRate:30,loop:!!clip.loop,durationSeconds:duration,keyframeSha256:hash(jsonBytes),previewModelSha256:hash(model),rootMotion:false,referenceRootTranslationMeters:frames.map(f=>({time:f.time,positionMeters:f.referenceRootTranslationMeters})),events:clip.events||[],supportWindows:clip.supportWindows||[],ballContactWindows:clip.ballContactWindows||[],ballContacts:clip.ballContacts||[],phases:clip.phases||[],courtTarget:clip.courtTarget||null,semantics:clip.semantics||{events:'presentation-only'}});
   await doc.transform(draco({method:'edgebreaker',encodeSpeed:4,decodeSpeed:5,quantizePosition:14,quantizeNormal:10,quantizeGeneric:16}));
   const bytes=await io.writeBinary(doc);if(bytes.length>1500000)throw new Error(`${id}: ${bytes.length} exceeds 1.5MB`);
   await fs.writeFile(path.join(outputDirectory,id+'.glb'),bytes);results.push({id,bytes:bytes.length,keys:frames.length,channels:animation.listChannels().length,sha256:hash(bytes)});
   console.log(`${id}: ${bytes.length} bytes; ${frames.length} frames @30Hz`);
 }
 return results;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await exportClips({ids:process.argv.slice(2).length?process.argv.slice(2):null});
