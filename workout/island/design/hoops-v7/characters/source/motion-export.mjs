#!/usr/bin/env node
/** Bake the live, mesh-aware motion solver into the delivered GLBs.
 * Viewing needs no build. This authoring command needs the external tool prefix.
 * Default: validate staged files in /tmp only. Pass --write for the final bake.
 * Geometry uses Draco; animation-only bufferViews use byte-for-byte lossless
 * Meshopt. Consumers must register both bundled local decoders with GLTFLoader.
 * node source/motion-export.mjs --modules /tmp/hoops-v7-tools [--only pg] [--write]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const require=createRequire(path.resolve(arg('--modules','/tmp/hoops-v7-tools'),'package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {prune,dedup,resample,sparse,draco}=require('@gltf-transform/functions');
const codec=require('draco3dgltf'),validator=require('gltf-validator'),{chromium}=require('playwright');
const {MeshoptEncoder,MeshoptDecoder}=require('meshoptimizer');await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const sha=b=>createHash('sha256').update(b).digest('hex');
const ALL_IDS=['pg','sg','sf','pf','c','referee'];
const MODEL_FILES=ALL_IDS.flatMap(id=>[`models/${id}.glb`,`models/${id}-lod1.glb`]);
const COMMON_INPUTS=['source/motion.mjs','motions.json','motion-contract.json','rig.json','model-authoring.json','vendor/three.module.js','vendor/GLTFLoader.js','vendor/DRACOLoader.js','vendor/BufferGeometryUtils.js','vendor/meshopt_decoder.module.js','vendor/draco/draco_wasm_wrapper.js','vendor/draco/draco_decoder.wasm'];
const requested=arg('--only',null),ids=requested?requested.split(','):ALL_IDS;
if(ids.some(id=>!ALL_IDS.includes(id)))throw Error('Unknown --only profile');
const hz=Number(arg('--hz','30'));
if(!Number.isFinite(hz)||hz<30||hz>120)throw Error('--hz must be30..120');
const resampleTolerance=Number(arg('--resample-tolerance','.0001'));
if(!Number.isFinite(resampleTolerance)||resampleTolerance<.00001||resampleTolerance>.0001)throw Error('--resample-tolerance must be .00001..0001');
const write=process.argv.includes('--write'),startedAtUTC=new Date().toISOString();
const useMeshopt=!process.argv.includes('--no-meshopt');if(write&&!useMeshopt)throw Error('--no-meshopt is a dry-run diagnostic; final clips use lossless animation compression');
const commitReport=arg('--commit-staged',null);if(commitReport){await commitStaged(commitReport);process.exit(0);}
const comparisonFile=arg('--compare-stage',null),comparisonReport=comparisonFile?JSON.parse(await fs.readFile(path.resolve(comparisonFile),'utf8')):null,changedActions=arg('--changed-actions','fall').split(',');
const stage=await fs.mkdtemp('/tmp/hoops-v7-baked-');
const exporterSource=await fs.readFile(fileURLToPath(import.meta.url));await fs.writeFile(path.join(stage,'exporter-executed.mjs'),exporterSource);
const sourceFiles=new Map(),inputHashes=[];
async function freeze(file){const bytes=await fs.readFile(path.join(root,file));sourceFiles.set('/'+file,bytes);inputHashes.push({file,bytes:bytes.length,sha256:sha(bytes)});return bytes;}
for(const file of COMMON_INPUTS)await freeze(file);
for(const id of ids)for(const suffix of ['', '-lod1'])await freeze(`models/${id}${suffix}.glb`);
const rig=JSON.parse(sourceFiles.get('/rig.json')),authoring=JSON.parse(sourceFiles.get('/model-authoring.json'));
const manifest=JSON.parse(sourceFiles.get('/motions.json')),motionContract=JSON.parse(sourceFiles.get('/motion-contract.json')),motionSourceSha=sha(sourceFiles.get('/source/motion.mjs'));
if(manifest.runtime.sourceSha256!==motionSourceSha||motionContract.sourceSha256!==motionSourceSha)throw Error('Regenerate motions.json and motion-contract.json for the exact source before baking');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await codec.createDecoderModule(),'draco3d.encoder':await codec.createEncoderModule(),'meshopt.decoder':MeshoptDecoder});
const html='<!doctype html><meta charset="utf-8"><title>Local motion bake</title><script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script><script type="module">import * as THREE from "/vendor/three.module.js";import {GLTFLoader}from"/vendor/GLTFLoader.js";import{DRACOLoader}from"/vendor/DRACOLoader.js";import{MeshoptDecoder}from"/vendor/meshopt_decoder.module.js";import{ACTIONS,BONE_NAMES,createMotionController}from"/source/motion.mjs";const draco=new DRACOLoader();draco.setDecoderPath("/vendor/draco/");draco.setWorkerLimit(2);const loader=new GLTFLoader();loader.setDRACOLoader(draco);loader.setMeshoptDecoder(MeshoptDecoder);window.__bake={THREE,loader,draco,ACTIONS,BONE_NAMES,createMotionController,truth:new Map()};</script>';
sourceFiles.set('/bake.html',Buffer.from(html));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const server=http.createServer((request,response)=>{const pathname=new URL(request.url,'http://localhost').pathname;if(pathname==='/favicon.ico'){response.writeHead(204);response.end();return;}const bytes=sourceFiles.get(pathname);if(!bytes){response.writeHead(404);response.end();return;}response.writeHead(200,{'Content-Type':mime[path.extname(pathname)]||'application/octet-stream','Cache-Control':'no-store'});response.end(bytes);});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:arg('--executable','/usr/bin/chromium'),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext(),page=await context.newPage(),browserErrors=[],externalRequests=[];
await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin)||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();externalRequests.push(url);return route.abort();});
page.on('pageerror',error=>browserErrors.push(String(error)));
page.on('console',message=>{if(message.type()==='error')browserErrors.push(message.text());});
const assets=[],profileSummaries=[],staged=new Map();let fatalError=null;
function same(a,b,epsilon=1e-7){return a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=epsilon);}
function quaternionNormalize(q){const l=Math.hypot(...q);if(!Number.isFinite(l)||l<1e-6)throw Error('Non-finite/zero baked quaternion');return q.map(v=>v/l);}
function canonicalizeQuaternionTrack(values){for(let i=0;i<values.length;i+=4){const q=quaternionNormalize(values.slice(i,i+4));if(i&&q.reduce((s,v,k)=>s+v*values[i-4+k],0)<0)for(let k=0;k<4;k++)q[k]*=-1;values.splice(i,4,...q);}return values;}
function removeDraco(document){for(const extension of [...document.getRoot().listExtensionsUsed()])if(['KHR_draco_mesh_compression','EXT_meshopt_compression'].includes(extension.extensionName))extension.dispose();}
function animationHashes(document){return document.getRoot().listAnimations().map(animation=>{const hash=createHash('sha256');for(const channel of [...animation.listChannels()].sort((a,b)=>(a.getTargetNode().getName()+'/'+a.getTargetPath()).localeCompare(b.getTargetNode().getName()+'/'+b.getTargetPath()))){hash.update(channel.getTargetNode().getName()+'/'+channel.getTargetPath());for(const accessor of [channel.getSampler().getInput(),channel.getSampler().getOutput()]){const array=accessor.getArray();hash.update(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));}}return{action:animation.getName(),sha256:hash.digest('hex')};});}
function compressAnimationBuffers(input){
 const original=Buffer.from(input),jsonLength=original.readUInt32LE(12),json=JSON.parse(original.subarray(20,20+jsonLength)),binary=original.subarray(28+jsonLength);
 if(json.buffers.length!==1||json.buffers[0].uri)throw Error('Lossless animation compression expects a self-contained single-buffer GLB');
 const animationAccessors=new Set(json.animations.flatMap(a=>a.samplers.flatMap(s=>[s.input,s.output])));let animationViews=new Set([...animationAccessors].map(i=>json.accessors[i].bufferView).filter(i=>i!==undefined));
 const otherViews=new Set([...json.accessors.flatMap((a,i)=>[...(!animationAccessors.has(i)?[a.bufferView]:[]),a.sparse?.indices?.bufferView,a.sparse?.values?.bufferView]),...(json.images??[]).map(i=>i.bufferView),...(json.meshes??[]).flatMap(m=>m.primitives.map(p=>p.extensions?.KHR_draco_mesh_compression?.bufferView))].filter(i=>i!==undefined));
 if(!animationViews.size||[...animationViews].some(i=>otherViews.has(i)))throw Error('Animation views are missing or shared with geometry');
 const originalSlices=json.bufferViews.map(v=>binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength)),groupSources=new Map();
 // Group the unchanged float bytes by element width before compression. This
 // gives the lossless predictor consistent scalar/vector/quaternion columns,
 // saving another~30KB per actor without changing a single animation value.
 if(animationViews.size!==1)throw Error('Expected the single packed NodeIO animation view');
 const originalAnimationView=[...animationViews][0],groups=new Map();
 for(const index of [...animationAccessors].sort((a,b)=>a-b)){
  const a=json.accessors[index];if(a.bufferView===undefined)continue;
  const stride={SCALAR:4,VEC3:12,VEC4:16}[a.type],v=json.bufferViews[a.bufferView];
  if(!stride||a.componentType!==5126||a.sparse||v.byteStride)throw Error('Animation accessor is not a tightly packed float array');
  const bytes=originalSlices[a.bufferView].subarray(a.byteOffset??0,(a.byteOffset??0)+a.count*stride);if(bytes.length!==a.count*stride)throw Error('Truncated animation accessor');
  const group=groups.get(stride)??{chunks:[],accessors:[],length:0};group.accessors.push({index,byteOffset:group.length});group.chunks.push(bytes);group.length+=bytes.length;groups.set(stride,group);
 }
 animationViews=new Set();
 for(const group of [...groups.values()]){
  const index=animationViews.size===0?originalAnimationView:json.bufferViews.length,bytes=Buffer.concat(group.chunks);
  json.bufferViews[index]={buffer:0,byteOffset:0,byteLength:bytes.length};animationViews.add(index);groupSources.set(index,bytes);
  for(const accessor of group.accessors){json.accessors[accessor.index].bufferView=index;json.accessors[accessor.index].byteOffset=accessor.byteOffset;}
 }
 const chunks=[],views=[],unchangedViews=[];let offset=0,fallback=0;
 for(const[index,view]of json.bufferViews.entries()){
  if(view.buffer!==0)throw Error('Input bufferView references an unexpected buffer');
  const bytes=groupSources.get(index)??originalSlices[index];
  if(animationViews.has(index)){
   const choices=[4,8,12,16,24,32,48,64].filter(stride=>bytes.length%stride===0).map(stride=>({stride,bytes:MeshoptEncoder.encodeGltfBuffer(bytes,bytes.length/stride,stride,'ATTRIBUTES')})).sort((a,b)=>a.bytes.length-b.bytes.length),best=choices[0],decoded=new Uint8Array(bytes.length);
   MeshoptDecoder.decodeGltfBuffer(decoded,bytes.length/best.stride,best.stride,best.bytes,'ATTRIBUTES');
   if(sha(decoded)!==sha(bytes))throw Error('Animation codec failed byte-for-byte losslessness');
   views.push({bufferView:index,uncompressedBytes:bytes.length,compressedBytes:best.bytes.length,byteStride:best.stride,sourceSha256:sha(bytes),decodedSha256:sha(decoded),bitIdentical:true});
   view.buffer=1;view.byteOffset=fallback;fallback+=bytes.length;
   view.extensions={...view.extensions,EXT_meshopt_compression:{buffer:0,byteOffset:offset,byteLength:best.bytes.length,byteStride:best.stride,count:bytes.length/best.stride,mode:'ATTRIBUTES'}};
   chunks.push(Buffer.from(best.bytes));offset+=best.bytes.length;
  }else{view.byteOffset=offset;chunks.push(bytes);offset+=bytes.length;unchangedViews.push({bufferView:index,sha256:sha(bytes),bytes:bytes.length});}
  const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
 }
 json.buffers[0].byteLength=offset;json.buffers.push({byteLength:fallback,extensions:{EXT_meshopt_compression:{fallback:true}}});
 for(const field of ['extensionsUsed','extensionsRequired'])json[field]=[...new Set([...(json[field]??[]),'EXT_meshopt_compression'])];
 let jsonBytes=Buffer.from(JSON.stringify(json));jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc((4-jsonBytes.length%4)%4,32)]);
 const output=Buffer.alloc(28+jsonBytes.length+offset);output.writeUInt32LE(0x46546c67);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);output.writeUInt32LE(jsonBytes.length,12);output.writeUInt32LE(0x4e4f534a,16);jsonBytes.copy(output,20);output.writeUInt32LE(offset,20+jsonBytes.length);output.writeUInt32LE(0x004e4942,24+jsonBytes.length);Buffer.concat(chunks).copy(output,28+jsonBytes.length);
 return{bytes:output,proof:{extension:'EXT_meshopt_compression',mode:'ATTRIBUTES',filter:'NONE (lossless)',groupedByElementWidth:true,bytesBefore:original.length,bytesAfter:output.length,bytesSaved:original.length-output.length,views,unchangedGeometryMorphTextureViews:unchangedViews}};
}
function validationSummary(report){return{errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos,messages:report.issues.messages,truncated:report.issues.truncated};}
function bindRecords(document){const skin=document.getRoot().listSkins()[0],joints=skin.listJoints(),inverse=skin.getInverseBindMatrices();return Object.fromEntries(joints.map((n,i)=>[n.getName(),{parent:n.getParentNode()?.getName()??null,translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale(),inverseBind:inverse.getElement(i,[]),worldMatrix:n.getWorldMatrix()}]));}
function assertSharedBind(high,low,id){for(const [name,a]of Object.entries(high)){const b=low[name];if(!b||a.parent!==b.parent||!same(a.translation,b.translation,1e-6)||!same(a.rotation,b.rotation,1e-6)||!same(a.scale,b.scale,1e-6)||!same(a.inverseBind,b.inverseBind,1e-6)||!same(a.worldMatrix,b.worldMatrix,1e-6))throw Error(`LOD bind differs: ${id}/${name}`);}}
async function bake(document,samples,id,lod){
 const g=document.getRoot(),buffer=g.listBuffers()[0]||document.createBuffer('Baked presentation motion');
 for(const animation of [...g.listAnimations()])animation.dispose();
 for(const node of [...g.listNodes()])if(node.getName()==='MotionBallAnchor')node.dispose();
 const scene=g.getDefaultScene()||g.listScenes()[0];
 const anchor=document.createNode('MotionBallAnchor').setExtras({presentationOnly:true,radiusMeters:.12,units:'meters',purpose:'Attach an unbranded basketball mesh. Position/rotation/scale are authored presentation only; scale zero means hidden. No ownership, score or physics is implied.'});scene.addChild(anchor);
 const boneNodes=Object.fromEntries(g.listSkins()[0].listJoints().map(n=>[n.getName(),n]));
 const meshNodes=g.listNodes().filter(n=>n.getMesh()&&n.getMesh().listPrimitives().some(p=>p.listTargets().length));
 // Accessor labels do not affect playback; omitting thousands of repeated
 // labels leaves more of the1.5MB budget for geometry and actual keyframes.
 const accessor=(name,type,array)=>document.createAccessor().setType(type).setArray(new Float32Array(array)).setBuffer(buffer);
 const clipStatistics=[];
 for(const clip of samples.clips){
  const animation=document.createAnimation(clip.id).setExtras({loop:clip.loop,durationSeconds:clip.duration,presentationOnly:true,rootMotion:false});
  const times=clip.frames.map(frame=>frame.t),input=accessor(clip.id+' times','SCALAR',times);
  let omittedBindChannels=0,constantPoseChannels=0,storedChannels=0;
  const channel=(node,targetPath,values,size,bindValue,interpolation='LINEAR')=>{
   if(targetPath==='rotation')canonicalizeQuaternionTrack(values);
   if(!values.every(Number.isFinite))throw Error(`Non-finite ${id}/${clip.id}/${node.getName()}/${targetPath}`);
   const first=values.slice(0,size),constant=values.every((v,i)=>Math.abs(v-first[i%size])<1e-8);
   const sameBind=bindValue&&same(first,bindValue,1e-7);
   if(constant&&sameBind){omittedBindChannels++;return;}
   const channelInput=constant?accessor(clip.id+' constant time','SCALAR',[0]):input;
   const output=accessor(`${clip.id} ${node.getName()} ${targetPath}`,targetPath==='weights'?'SCALAR':size===4?'VEC4':'VEC3',constant?first:values);
   const sampler=document.createAnimationSampler().setInput(channelInput).setOutput(output).setInterpolation(interpolation);
   animation.addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath(targetPath).setSampler(sampler));storedChannels++;if(constant)constantPoseChannels++;
  };
  for(const [name,node]of Object.entries(boneNodes)){
   channel(node,'translation',clip.frames.flatMap(f=>f.bones[name].position),3,node.getTranslation());
   channel(node,'rotation',clip.frames.flatMap(f=>f.bones[name].quaternion),4,node.getRotation());
   channel(node,'scale',clip.frames.flatMap(f=>f.bones[name].scale),3,node.getScale());
  }
  for(const node of meshNodes){
   const names=node.getMesh().getExtras().targetNames||node.getMesh().listPrimitives()[0].listTargets().map(t=>t.getName());
   const values=clip.frames.flatMap(f=>names.map(name=>f.grips[name]??0));
   channel(node,'weights',values,names.length,node.getWeights().length?node.getWeights():names.map(()=>0));
  }
  channel(anchor,'translation',clip.frames.flatMap(f=>f.ball.position),3,null);
  channel(anchor,'rotation',clip.frames.flatMap(f=>f.ball.quaternion),4,null);
  channel(anchor,'scale',clip.frames.flatMap(f=>f.ball.scale),3,null,'STEP');
  clipStatistics.push({id:clip.id,durationSeconds:clip.duration,loop:clip.loop,sourceFrames:clip.frames.length,adaptive:clip.adaptive,storedChannels,constantPoseChannels,omittedBindChannels});
 }
 removeDraco(document);
 await document.transform(resample({tolerance:resampleTolerance}),prune({keepLeaves:true}),dedup(),sparse({ratio:.15}),draco({method:'edgebreaker',encodeSpeed:1,decodeSpeed:5,quantizePosition:lod?13:14,quantizeNormal:lod?9:11,quantizeTexcoord:lod?11:12,quantizeGeneric:16}));
 g.getAsset().generator='Hoops characters v7 / canonical18 / mesh-aware30Hz original basketball motion / Draco';
 g.getAsset().extras={...(g.getAsset().extras||{}),motion:{sampleHz:hz,resampleTolerance,source:'source/motion.mjs',presentationOnly:true,rootMotion:false}};
 const bytes=await io.writeBinary(document);
 return{bytes,clipStatistics};
}
try{
 await page.goto(origin+'/bake.html',{waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.__bake,null,{timeout:120000});
 for(const id of ids){
  console.log(`Sampling ${id}: all27actions at${hz}Hz from the actual high-detail mesh.`);
  const profile=authoring.profiles.find(p=>p.id===id);if(!profile)throw Error('Missing authoring profile '+id);
  const samples=await page.evaluate(async({id,profile,rig,hz,manifest})=>{
   const e=window.__bake,{THREE,loader,ACTIONS,BONE_NAMES,createMotionController}=e;
   const gltf=await loader.loadAsync('/models/'+id+'.glb'),root=gltf.scene;
   const controller=createMotionController(root,{profile:{...profile,...rig,heightMeters:profile.heightMeters}});
   const palmOffsets={};for(const contact of controller.snapshot().contact){const point=root.localToWorld(new THREE.Vector3(...contact.palm));palmOffsets[contact.effector]=root.getObjectByName(contact.effector).worldToLocal(point).toArray();}
   const clips=[],loopSeams=[];let maxPalm=0,minSole=Infinity,maxMorphDisagreement=0;
   const joints=Object.fromEntries(BONE_NAMES.map(name=>[name,root.getObjectByName(name)]));
   const seedEvents={dribble_right:[.025,.08,.5,.92,.975],dribble_left:[.025,.08,.5,.92,.975],dribble_power:[.025,.08,.5,.92,.975],dribble_crossover:[.0125,.04,.25,.46,.4875,.5,.5125,.54,.75,.96,.9875],dribble_between_legs:[.0125,.04,.25,.46,.4875,.5,.5125,.54,.75,.96,.9875],shot_set:[.24,.35,.48,.49,.65,.82,.96],shot_jump:[.24,.35,.48,.49,.65,.82,.96],shot_fadeaway:[.24,.35,.48,.49,.65,.82,.96],shot_stepback:[.24,.35,.48,.49,.65,.82,.96],layup:[.23,.31,.34,.43,.58,.74,.84,.97],dunk_one_hand:[.25,.29,.37,.55,.57,.63,.64,.68,.74,.86,.95],dunk_two_hand:[.29,.55,.57,.63,.64,.68,.74,.86,.95],dunk_reverse:[.28,.29,.55,.56,.57,.63,.64,.68,.74,.86,.95],run:[.05,.5,.55],walk:[.12,.5,.62],decelerate:[.02,.24,.48,.78],defense_shuffle:[.25,.5,.75],block:[.24,.84],rebound:[.22,.43,.78]};
   const adaptiveLimits={translationMeters:.0006,rotationRadians:.006,morphWeight:.004,ballPositionMeters:.002,ballRotationRadians:.002,palmContactMeters:.0015};
   for(const action of ACTIONS){
    controller.setAction(action.id,{immediate:true});const steps=Math.ceil(action.duration*hz),cache=new Map(),unresolved=[];
    const sample=phase=>{
     if(cache.has(phase))return cache.get(phase);
     controller.seek(phase);const snapshot=controller.snapshot();
     for(const name of BONE_NAMES){const bone=snapshot.bones[name];if(!bone||![...bone.position,...bone.quaternion,...bone.scale].every(Number.isFinite))throw Error('Invalid sampled bone '+name);}
     const grips={};for(const morph of snapshot.morphs)for(const[name,index]of Object.entries(morph.targetNames)){const value=morph.weights[index];if(grips[name]!==undefined)maxMorphDisagreement=Math.max(maxMorphDisagreement,Math.abs(grips[name]-value));grips[name]=value;}
     maxPalm=Math.max(maxPalm,snapshot.handContactErrorMeters);for(const v of Object.values(snapshot.soleProbeHeights))if(Number.isFinite(v))minSole=Math.min(minSole,v);
     const frame={t:action.duration*phase,bones:snapshot.bones,grips,ball:snapshot.ballAnchor,contacts:snapshot.contact.map(c=>c.effector)};cache.set(phase,frame);return frame;
    };
    const interpolateError=(a,m,b)=>{
     const u=(m.t-a.t)/(b.t-a.t);let pError=0,qError=0,mError=0;
     for(const name of BONE_NAMES){const x=a.bones[name],y=b.bones[name],z=m.bones[name],joint=joints[name];joint.position.fromArray(x.position).lerp(new THREE.Vector3(...y.position),u);joint.quaternion.fromArray(x.quaternion).slerp(new THREE.Quaternion(...y.quaternion),u);joint.scale.fromArray(x.scale).lerp(new THREE.Vector3(...y.scale),u);pError=Math.max(pError,joint.position.distanceTo(new THREE.Vector3(...z.position)));qError=Math.max(qError,joint.quaternion.angleTo(new THREE.Quaternion(...z.quaternion)));}
     for(const name of Object.keys(m.grips))mError=Math.max(mError,Math.abs((a.grips[name]+(b.grips[name]-a.grips[name])*u)-m.grips[name]));
     const center=new THREE.Vector3(...a.ball.position).lerp(new THREE.Vector3(...b.ball.position),u),ballP=center.distanceTo(new THREE.Vector3(...m.ball.position)),ballQ=new THREE.Quaternion(...a.ball.quaternion).slerp(new THREE.Quaternion(...b.ball.quaternion),u).angleTo(new THREE.Quaternion(...m.ball.quaternion));
     root.updateWorldMatrix(true,true);const centerWorld=root.localToWorld(center.clone());let palm=0;for(const name of m.contacts){if(!palmOffsets[name])continue;const point=new THREE.Vector3(...palmOffsets[name]).applyMatrix4(joints[name].matrixWorld);palm=Math.max(palm,Math.abs(point.distanceTo(centerWorld)-.12));}
     return{translationMeters:pError,rotationRadians:qError,morphWeight:mError,ballPositionMeters:ballP,ballRotationRadians:ballQ,palmContactMeters:palm};
    };
    const declared=manifest.clips.find(c=>c.id===action.id);if(!declared||Math.abs(declared.duration-action.duration)>1e-8)throw Error('Stale manifest duration: '+action.id);
    const profileWindows=declared.contactWindowsByProfile?.[id]??[];
    const phases=new Set(Array.from({length:steps+1},(_,i)=>i/steps));for(const phase of [...(seedEvents[action.id]??[]),...(declared.events??[]).map(e=>e.timeNormalized),...(declared.contactWindows??[]).flatMap(c=>[c.startNormalized,c.endNormalized]),...profileWindows.flatMap(c=>[c.startNormalized,c.endNormalized])]){if(!Number.isFinite(phase)||phase<0||phase>1)throw Error('Invalid declared event phase');phases.add(phase);}
    // Keep an initial30Hz grid and add coherent TRS/morph/ball keys wherever
    // actual mesh-aware poses bend between it. Quarter samples prevent a
    // midpoint at a symmetric inflection from hiding curvature or contact loss.
    const refine=(left,right,depth=0)=>{
     const a=sample(left),b=sample(right);let bad=false,worst=null;
     for(const u of [.25,.5,.75]){const phase=left+(right-left)*u,m=sample(phase),error=interpolateError(a,m,b);if(Object.entries(error).some(([name,value])=>value>adaptiveLimits[name])){bad=true;worst=error;}}
     if(!bad)return;
     if(depth>=10||action.duration*(right-left)<.0001){unresolved.push({from:left,to:right,error:worst});return;}
     const mid=(left+right)/2;phases.add(mid);refine(left,mid,depth+1);refine(mid,right,depth+1);
    };
    const initial=[...phases].sort((a,b)=>a-b);for(let i=0;i<initial.length-1;i++)refine(initial[i],initial[i+1]);
    const frames=[...phases].sort((a,b)=>a-b).map(sample);
    if(action.loop){
     // seek(1) deliberately wraps. Test the left-hand limit separately so an
     // authored discontinuity cannot hide behind an identical wrapped endpoint.
     controller.seek(1-1e-6);const a=controller.snapshot();controller.seek(0);const b=controller.snapshot();
     let position=0,rotation=0,morph=0;for(const name of BONE_NAMES){position=Math.max(position,new THREE.Vector3(...a.bones[name].position).distanceTo(new THREE.Vector3(...b.bones[name].position)));rotation=Math.max(rotation,new THREE.Quaternion(...a.bones[name].quaternion).angleTo(new THREE.Quaternion(...b.bones[name].quaternion)));}
     for(let i=0;i<a.morphs.length;i++)for(let j=0;j<a.morphs[i].weights.length;j++)morph=Math.max(morph,Math.abs(a.morphs[i].weights[j]-b.morphs[i].weights[j]));
     const ballVisible=a.ballAnchor.scale.some(v=>v!==0)&&b.ballAnchor.scale.some(v=>v!==0),ballPosition=new THREE.Vector3(...a.ballAnchor.position).distanceTo(new THREE.Vector3(...b.ballAnchor.position)),ballRotation=new THREE.Quaternion(...a.ballAnchor.quaternion).angleTo(new THREE.Quaternion(...b.ballAnchor.quaternion));
     loopSeams.push({action:action.id,epsilonNormalized:1e-6,maxBonePositionMeters:position,maxBoneRotationRadians:rotation,maxMorphWeightError:morph,visibleBall:ballVisible,ballPositionMeters:ballPosition,ballRotationRadians:ballRotation,pass:position<.001&&rotation<.012&&morph<.001&&(!ballVisible||(ballPosition<.001&&ballRotation<.012))});
    }
    clips.push({...action,frames,adaptive:{baseFrames:steps+1,storedFrames:frames.length,evaluatedFrames:cache.size,limits:adaptiveLimits,unresolved}});
   }
   e.truth.set(id,{clips,controller,root,palmOffsets});
   return{id,clips,summary:{actions:clips.length,frames:clips.reduce((s,c)=>s+c.frames.length,0),evaluatedFrames:clips.reduce((s,c)=>s+c.adaptive.evaluatedFrames,0),unresolvedInterpolationIntervals:clips.flatMap(c=>c.adaptive.unresolved.map(x=>({action:c.id,...x}))),maxPalmResidualMeters:maxPalm,minSoleProbeMeters:Number.isFinite(minSole)?minSole:null,maxMorphDisagreement,nearEndLoopSeams:loopSeams}};
  },{id,profile,rig:rig.profiles[id],hz,manifest});
  if(samples.summary.maxMorphDisagreement>1e-7)throw Error(`Morph primitives disagree for ${id}`);
  const sourceLoopsPass=samples.summary.nearEndLoopSeams.every(s=>s.pass),adaptivePass=samples.summary.unresolvedInterpolationIntervals.length===0;
  if(!sourceLoopsPass)console.error(`Source loop discontinuity: ${id} ${JSON.stringify(samples.summary.nearEndLoopSeams.filter(s=>!s.pass))}`);
  const highDoc=await io.readBinary(sourceFiles.get(`/models/${id}.glb`)),highBind=bindRecords(highDoc);
  for(const lod of [0,1]){
   const file=`models/${id}${lod?'-lod1':''}.glb`,document=lod?await io.readBinary(sourceFiles.get('/'+file)):highDoc;
   if(lod)assertSharedBind(highBind,bindRecords(document),id);
   const{bytes:rawBytes,clipStatistics}=await bake(document,samples,id,lod),beforeClipHashes=animationHashes(await io.readBinary(rawBytes));
   const packed=useMeshopt?compressAnimationBuffers(rawBytes):{bytes:rawBytes,proof:null},bytes=packed.bytes;
   const compressed=validationSummary(await validator.validateBytes(bytes,{uri:file,maxIssues:1000}));
   const decodedDoc=await io.readBinary(bytes),afterClipHashes=animationHashes(decodedDoc),accessorsBitIdentical=JSON.stringify(beforeClipHashes)===JSON.stringify(afterClipHashes);
   const animationCodec={...packed.proof,clipAccessorsBefore:beforeClipHashes,clipAccessorsAfter:afterClipHashes,accessorsBitIdentical};
   let unchangedPayloads=null;if(comparisonReport){
    const previous=comparisonReport.assets.find(a=>a.file===file);if(!previous)throw Error('Comparison stage is missing '+file);
    const previousClips=new Map(previous.animationCodec.clipAccessorsAfter.map(c=>[c.action,c.sha256]));
    const actions=afterClipHashes.filter(c=>!changedActions.includes(c.action)).map(c=>({action:c.action,beforeSha256:previousClips.get(c.action)??null,afterSha256:c.sha256,bitIdentical:previousClips.get(c.action)===c.sha256}));
    const payloads=x=>x.map(v=>({bytes:v.bytes,sha256:v.sha256})).sort((a,b)=>a.sha256.localeCompare(b.sha256));
    const geometryBitIdentical=JSON.stringify(payloads(previous.animationCodec.unchangedGeometryMorphTextureViews))===JSON.stringify(payloads(animationCodec.unchangedGeometryMorphTextureViews)),templateBitIdentical=previous.sourceSha256===sha(sourceFiles.get('/'+file));
    unchangedPayloads={comparisonReport:path.resolve(comparisonFile),allowedChangedActions:changedActions,actions,geometryMorphTexturePayloadsBitIdentical:geometryBitIdentical,templateBitIdentical,pass:actions.length===27-changedActions.length&&actions.every(a=>a.bitIdentical)&&geometryBitIdentical&&templateBitIdentical};
   }
   removeDraco(decodedDoc);const decoded=validationSummary(await validator.validateBytes(await io.writeBinary(decodedDoc),{uri:file.replace('.glb','-decoded.glb'),maxIssues:1000}));
   sourceFiles.set('/baked/'+file,Buffer.from(bytes));
   const roundTrip=await page.evaluate(async({id,file})=>{
    const{THREE,loader,BONE_NAMES,truth}=window.__bake,gltf=await loader.loadAsync('/baked/'+file),root=gltf.scene,mixer=new THREE.AnimationMixer(root),bones={},morphs=[],original=truth.get(id);
    root.traverse(o=>{if(o.isBone)bones[o.name]=o;if(o.morphTargetDictionary&&o.morphTargetInfluences)morphs.push(o);});
    const anchor=root.getObjectByName('MotionBallAnchor');if(!anchor)throw Error('Missing baked ball anchor');
    let maxTranslation=0,maxRotation=0,maxScale=0,maxMorph=0,maxBallPosition=0,maxBallRotation=0,maxVisibility=0,maxKeyPalm=0,samples=0;const clipResults=[];
    const emptyBetween=()=>({samples:0,maxTranslationMeters:0,maxRotationRadians:0,maxMorphWeightError:0,maxBallPositionMeters:0,maxBallRotationRadians:0,maxPalmContactErrorMeters:0,visibilityDifferentSamples:0,worst:{}}),between=emptyBetween();
    for(const source of original.clips){
     const clip=gltf.animations.find(a=>a.name===source.id);if(!clip)throw Error('Missing baked clip '+source.id);
     mixer.stopAllAction();const action=mixer.clipAction(clip);action.reset();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
     let clipP=0,clipQ=0;const clipBetween=emptyBetween();original.controller.setAction(source.id,{immediate:true});
     const compare=(expected,isMidpoint=false)=>{
      // glTF input timestamps areFLOAT32. Comparing aSTEP visibility marker
      // at the correspondingDOUBLE just before its rounded key is ambiguous.
      mixer.setTime(Math.fround(expected.t));root.updateWorldMatrix(true,true);
      let pMax=0,qMax=0,sMax=0,mMax=0,palmMax=0;
      for(const name of BONE_NAMES){const b=bones[name],x=expected.bones[name];if(!b)throw Error('Missing baked bone '+name);pMax=Math.max(pMax,b.position.distanceTo(new THREE.Vector3(...x.position)));qMax=Math.max(qMax,b.quaternion.angleTo(new THREE.Quaternion(...x.quaternion)));sMax=Math.max(sMax,b.scale.distanceTo(new THREE.Vector3(...x.scale)));}
      for(const mesh of morphs)for(const[name,index]of Object.entries(mesh.morphTargetDictionary))mMax=Math.max(mMax,Math.abs(mesh.morphTargetInfluences[index]-(expected.grips[name]??0)));
      for(const effector of expected.contacts??[]){const offset=original.palmOffsets[effector];if(!offset)continue;const palm=new THREE.Vector3(...offset).applyMatrix4(bones[effector].matrixWorld),center=anchor.getWorldPosition(new THREE.Vector3());palmMax=Math.max(palmMax,Math.abs(palm.distanceTo(center)-.12));}
      const ballP=anchor.position.distanceTo(new THREE.Vector3(...expected.ball.position)),ballQ=anchor.quaternion.angleTo(new THREE.Quaternion(...expected.ball.quaternion)),visibility=anchor.scale.distanceTo(new THREE.Vector3(...expected.ball.scale));
      if(isMidpoint){for(const stats of [between,clipBetween]){stats.samples++;for(const[key,value]of Object.entries({maxTranslationMeters:pMax,maxRotationRadians:qMax,maxMorphWeightError:mMax,maxBallPositionMeters:ballP,maxBallRotationRadians:ballQ,maxPalmContactErrorMeters:palmMax})){if(value>stats[key]){stats[key]=value;stats.worst[key]={action:source.id,phase:expected.t/source.duration};}}if(visibility>1e-5)stats.visibilityDifferentSamples++;}}
      else{maxTranslation=Math.max(maxTranslation,pMax);maxRotation=Math.max(maxRotation,qMax);clipP=Math.max(clipP,pMax);clipQ=Math.max(clipQ,qMax);maxScale=Math.max(maxScale,sMax);maxMorph=Math.max(maxMorph,mMax);maxBallPosition=Math.max(maxBallPosition,ballP);maxBallRotation=Math.max(maxBallRotation,ballQ);maxVisibility=Math.max(maxVisibility,visibility);maxKeyPalm=Math.max(maxKeyPalm,palmMax);samples++;}
     };
     for(let i=0;i<source.frames.length;i++){
      compare(source.frames[i]);
      if(i<source.frames.length-1)for(const u of [.25,.5,.75]){const phase=(source.frames[i].t+(source.frames[i+1].t-source.frames[i].t)*u)/source.duration;original.controller.seek(phase);const snapshot=original.controller.snapshot(),grips={};for(const morph of snapshot.morphs)for(const[name,index]of Object.entries(morph.targetNames))grips[name]=morph.weights[index];compare({t:source.duration*phase,bones:snapshot.bones,grips,ball:snapshot.ballAnchor,contacts:snapshot.contact.map(c=>c.effector)},true);}
     }
     clipResults.push({action:source.id,durationSeconds:clip.duration,tracks:clip.tracks.length,maxTranslationMeters:clipP,maxRotationRadians:clipQ,betweenKeyChecks:clipBetween});
    }
    mixer.stopAllAction();mixer.uncacheRoot(root);root.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
    between.visibilityNote='Visibility is aSTEP track; authored release/hide event times are explicitly keyed and visibility is independently compared at every interval quarter, midpoint and three-quarter.';
    between.pass=between.maxTranslationMeters<.001&&between.maxRotationRadians<.008&&between.maxMorphWeightError<.006&&between.maxBallPositionMeters<.003&&between.maxBallRotationRadians<.003&&between.maxPalmContactErrorMeters<.002&&between.visibilityDifferentSamples===0;
    return{samples,maxTranslationMeters:maxTranslation,maxRotationRadians:maxRotation,maxScale,maxMorphWeightError:maxMorph,maxBallPositionMeters:maxBallPosition,maxBallRotationRadians:maxBallRotation,maxVisibilityScaleError:maxVisibility,maxKeyPalmContactErrorMeters:maxKeyPalm,betweenKeyChecks:between,clips:clipResults,pass:maxTranslation<.001&&maxRotation<.002&&maxScale<1e-5&&maxMorph<.001&&maxBallPosition<.001&&maxBallRotation<.002&&maxVisibility<1e-5&&maxKeyPalm<.003&&between.pass};
   },{id,file});
   const result={file,profile:id,lod,bytes:bytes.length,MB:bytes.length/1e6,sha256:sha(bytes),sourceSha256:sha(sourceFiles.get('/'+file)),sourceLoopsPass,adaptivePass,animationCodec,unchangedPayloads,compressedKhronos:compressed,decodedKhronos:decoded,roundTrip,clips:clipStatistics,pass:sourceLoopsPass&&adaptivePass&&accessorsBitIdentical&&(!unchangedPayloads||unchangedPayloads.pass)&&bytes.length<=1500000&&compressed.errors===0&&decoded.errors===0&&roundTrip.pass};
   assets.push(result);staged.set(file,Buffer.from(bytes));await fs.writeFile(path.join(stage,path.basename(file)),bytes);
   console.log(`${result.pass?'PASS':'FAIL'} ${file}: ${bytes.length}B,${clipStatistics.length}clips; positionError=${roundTrip.maxTranslationMeters.toExponential(2)}m; rotationError=${roundTrip.maxRotationRadians.toExponential(2)}rad.`);
  }
  profileSummaries.push({id,...samples.summary});await page.evaluate(id=>{const e=window.__bake,x=e.truth.get(id);x.controller.dispose();x.root.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});e.truth.delete(id);},id);
 }
}catch(error){fatalError=error.stack??String(error);console.error(fatalError);}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
const sourceChanged=[];for(const input of inputHashes){try{const current=await fs.readFile(path.join(root,input.file));if(sha(current)!==input.sha256)sourceChanged.push(input.file);}catch{sourceChanged.push(input.file);}}
let pass=!fatalError&&assets.length===ids.length*2&&assets.every(a=>a.pass)&&sourceChanged.length===0&&browserErrors.length===0&&externalRequests.length===0;
let written=false,writeError=null,rollbackDirectory=null,rollbackErrors=[];
if(write&&pass){
 ({written,writeError,rollbackDirectory,rollbackErrors}=await installValidatedFiles(staged,stage,inputHashes));pass=written;
}
const report={schemaVersion:1,startedAtUTC,finishedAtUTC:new Date().toISOString(),scope:'ActualGLBs parsed in Chromium, same mesh-aware canonical solver sampled at30Hz plus semantic event and adaptive keys,27 authored clips embedded byNodeIO. Geometry uses Draco; animation-only bufferViews use lossless Meshopt with byte-identical decode proof for all27 clip accessors. External AnimationMixer playback is compared with every source sample and every interval quarter/midpoint/three-quarter. Bone/ball/morph fidelity is measured; gameplay physics and deviceFPS are not implied. LOD1 reuses the corresponding high-detail animation after exact shared-bind checks. Actual LODfloor/hand surfaces are independently audited by validate-skin.mjs.',sampleHz:hz,resampleTolerance,losslessAnimationCompression:useMeshopt,requestedProfiles:ids,allProfiles:ids.length===ALL_IDS.length,stageDirectory:stage,writeRequested:write,written,writeError,rollbackDirectory,rollbackErrors,inputHashes,sourceChanged,fatalError,browserErrors,externalRequests,profiles:profileSummaries,assets,pass};
report.exporterSha256=sha(exporterSource);report.exporterSnapshot='exporter-executed.mjs';
await fs.mkdir(path.join(root,'verification'),{recursive:true});await fs.writeFile(path.join(root,'verification/baked-validation.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile(path.join(stage,'baked-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass,written,profiles:ids.length,assets:assets.length,maxBytes:Math.max(0,...assets.map(a=>a.bytes)),stageDirectory:stage,sourceChanged,browserErrors,externalRequests}));
if(!pass)process.exitCode=1;

async function installValidatedFiles(files,directory,inputs){
 // A single rename is atomic; a twelve-file set is not. Keep every original
 // before the first rename and restore all committed files if a write throws.
 // The persistent journal also supports recovery after process interruption.
 const result={written:false,writeError:null,rollbackDirectory:path.join(directory,'originals'),rollbackErrors:[]};
 const journal={state:'preparing',root,files:[...files.keys()],committed:[],originalHashes:inputs.filter(x=>x.file.startsWith('models/'))},saveJournal=()=>fs.writeFile(path.join(directory,'write-journal.json'),JSON.stringify(journal,null,2)+'\n');
 try{
  await fs.mkdir(result.rollbackDirectory);await saveJournal();
  for(const[file,bytes]of files){
   const backup=path.join(result.rollbackDirectory,path.basename(file));await fs.copyFile(path.join(root,file),backup);
   if(sha(await fs.readFile(backup))!==inputs.find(x=>x.file===file)?.sha256)throw Error('Template changed before install: '+file);
   await fs.writeFile(path.join(root,file+'.next'),bytes);
  }
  journal.state='committing';await saveJournal();
  for(const[file]of files){await fs.rename(path.join(root,file+'.next'),path.join(root,file));journal.committed.push(file);await saveJournal();}
  journal.state='complete';await saveJournal();result.written=true;
 }catch(error){
  result.writeError=error.stack??String(error);journal.state='restoring';await saveJournal().catch(()=>{});
  for(const file of journal.committed){try{await fs.copyFile(path.join(result.rollbackDirectory,path.basename(file)),path.join(root,file+'.next'));await fs.rename(path.join(root,file+'.next'),path.join(root,file));}catch(restoreError){result.rollbackErrors.push({file,error:String(restoreError)});}}
  journal.state=result.rollbackErrors.length?'restore-incomplete':'restored';journal.writeError=result.writeError;journal.rollbackErrors=result.rollbackErrors;await saveJournal().catch(()=>{});
 }finally{for(const[file]of files)await fs.rm(path.join(root,file+'.next'),{force:true}).catch(()=>{});}
 return result;
}

async function commitStaged(reportFile){
 const report=JSON.parse(await fs.readFile(path.resolve(reportFile),'utf8')),expectedInputs=[...COMMON_INPUTS,...MODEL_FILES];
 if(report.schemaVersion!==1||!report.pass||!report.allProfiles||report.written||report.assets.length!==12||!report.losslessAnimationCompression||!MODEL_FILES.every(file=>report.assets.filter(a=>a.file===file&&a.pass&&a.animationCodec?.accessorsBitIdentical).length===1))throw Error('Only a complete, unwritten twelve-file PASS report can be committed');
 if(report.inputHashes.length!==expectedInputs.length||!expectedInputs.every(file=>report.inputHashes.filter(i=>i.file===file).length===1))throw Error('Staged report does not cover the exact required input files');
 const files=new Map(),changes=[];
 for(const input of report.inputHashes){try{const b=await fs.readFile(path.join(root,input.file));if(b.length!==input.bytes||sha(b)!==input.sha256)changes.push(input.file);}catch{changes.push(input.file);}}
 for(const asset of report.assets){try{const b=await fs.readFile(path.join(report.stageDirectory,path.basename(asset.file)));if(b.length!==asset.bytes||b.length>1500000||sha(b)!==asset.sha256)changes.push('staged:'+asset.file);else files.set(asset.file,b);}catch{changes.push('staged:'+asset.file);}}
 if(changes.length)throw Error('Staged commit refused; input/output SHA changed: '+changes.join(', '));
 const installed=await installValidatedFiles(files,report.stageDirectory,report.inputHashes);
 Object.assign(report,installed,{writeRequested:true,writeMethod:'Exact validated staged bytes after full input/output SHA recheck',commitFinishedAtUTC:new Date().toISOString(),pass:report.pass&&installed.written});
 const json=JSON.stringify(report,null,2)+'\n';await fs.writeFile(path.join(report.stageDirectory,'baked-validation.json'),json);await fs.writeFile(path.join(root,'verification/baked-validation.json'),json);
 console.log(JSON.stringify({pass:report.pass,written:report.written,files:files.size,maxBytes:Math.max(...report.assets.map(a=>a.bytes)),stageDirectory:report.stageDirectory,rollbackDirectory:report.rollbackDirectory,writeError:report.writeError,rollbackErrors:report.rollbackErrors}));
 if(!report.pass)throw Error('Staged install failed; inspect the report and write journal');
}
