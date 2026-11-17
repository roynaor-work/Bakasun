#!/usr/bin/env node
/** Reproducible authoring: only this package is written. Tool dependencies live in /tmp. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {groundBridges} from './ground-bridges.mjs';
import {repairGaitBridges} from './gait-bridges.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/hoops-technique-tools/package.json');
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const codec=require('draco3dgltf');
const {MeshoptDecoder}=require('meshoptimizer');
const {chromium}=require('playwright');
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await codec.createDecoderModule(),'meshopt.decoder':MeshoptDecoder});
const profile=JSON.parse(await fs.readFile(path.join(root,'authoring-profile.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const bakeHTML=`<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script><script type="module">import * as THREE from '/vendor/three.module.js';import{GLTFLoader}from'/vendor/GLTFLoader.js';import{DRACOLoader}from'/vendor/DRACOLoader.js';import{MeshoptDecoder}from'/vendor/meshopt_decoder.module.js';import{ACTIONS,BONE_NAMES,createMotionController}from'/source/motion.mjs';const d=new DRACOLoader().setDecoderPath('/vendor/draco/');const loader=new GLTFLoader().setDRACOLoader(d).setMeshoptDecoder(MeshoptDecoder);window.bake={THREE,loader,ACTIONS,BONE_NAMES,createMotionController};</script>`;
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost').pathname;if(u==='/bake.html'){res.setHeader('Content-Type','text/html');res.end(bakeHTML);return;}if(u==='/favicon.ico'){res.writeHead(204);res.end();return;}const f=path.resolve(root,'.'+decodeURIComponent(u));if(!f.startsWith(root+path.sep))throw Error('path');const bytes=await fs.readFile(f);res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
const page=await browser.newPage();page.on('pageerror',e=>console.error(e));
await page.goto(origin+'/bake.html');await page.waitForFunction(()=>window.bake);
const result=await page.evaluate(async profile=>{
 const {loader,ACTIONS,BONE_NAMES,createMotionController}=window.bake;
 const gltf=await loader.loadAsync('/models/athlete-bind.glb');
 gltf.scene.updateWorldMatrix(true,true);
 const pivotLocal=Object.fromEntries([['left','LeftFoot'],['right','RightFoot']].map(([side,name])=>[side,new window.bake.THREE.Vector3(0,0,.13).applyQuaternion(gltf.scene.getObjectByName(name).getWorldQuaternion(new window.bake.THREE.Quaternion()).invert()).toArray()]));
 const c=createMotionController(gltf.scene,{profile,id:'ref_idle'}),clips=[];
 const gripsOf=s=>{const grips={};for(const morph of s.morphs)for(const [name,index]of Object.entries(morph.targetNames))grips[name]=morph.weights[index];return grips;};
 const delta=(center,a,b,seconds,backward,quaternion=false)=>{
  if(quaternion){if(center.reduce((sum,v,k)=>sum+v*a[k],0)<0)a=a.map(v=>-v);if(center.reduce((sum,v,k)=>sum+v*b[k],0)<0)b=b.map(v=>-v);}
  return center.map((v,k)=>(backward?(3*v-4*a[k]+b[k]):(-3*v+4*a[k]-b[k]))/(2*seconds));
 };
 for(const a of ACTIONS){
  c.setAction(a.id,{immediate:true});const count=Math.round(a.duration*30),frames=[];
  for(let i=0;i<=count;i++){
   c.seek(i/count);const s=c.snapshot(),grips=gripsOf(s),derivatives={};
   // One-sided analytic-scale source sampling preserves real release and
   // impact tangents instead of averaging unrelated 30Hz neighbouring poses.
   for(const direction of ['incoming','outgoing']){
    const backward=direction==='incoming'?i>0:i===count,sign=backward?-1:1,epsilon=.0001;
    c.seek((i/30+sign*epsilon)/a.duration);const near=c.snapshot();
    c.seek((i/30+sign*epsilon*2)/a.duration);const far=c.snapshot(),ng=gripsOf(near),fg=gripsOf(far);
    const bones=Object.fromEntries(BONE_NAMES.map(name=>[name,{position:delta(s.bones[name].position,near.bones[name].position,far.bones[name].position,epsilon,backward),quaternion:delta(s.bones[name].quaternion,near.bones[name].quaternion,far.bones[name].quaternion,epsilon,backward,true)}]));
    const gd=Object.fromEntries(Object.entries(grips).map(([name,v])=>[name,delta([v],[ng[name]],[fg[name]],epsilon,backward)[0]]));
    derivatives[direction]={bones,grips:gd,ball:{position:delta(s.ballAnchor.position,near.ballAnchor.position,far.ballAnchor.position,epsilon,backward),quaternion:delta(s.ballAnchor.quaternion,near.ballAnchor.quaternion,far.ballAnchor.quaternion,epsilon,backward,true)}};
   }
   const supportMarkers=Object.fromEntries(['left','right'].filter(side=>s.pose[side+'SupportMarker']==='ball-of-foot').map(side=>[side,{kind:'ball-of-foot',localPointMeters:pivotLocal[side]}]));
   frames.push({t:i/30,bones:s.bones,ball:s.ballAnchor,grips,derivatives,contact:s.contact,footErrors:s.footErrors,supportMarkers,pose:s.pose});
  }
  clips.push({...a,durationSeconds:count/30,frames});
 }
 return {clips,measurements:c.measurements,boneNames:BONE_NAMES};
},profile);
await fs.writeFile('/tmp/hoops-technique-source-samples.json',JSON.stringify(result));
const document=await io.read(path.join(root,'models/athlete-bind.glb'));
const g=document.getRoot(),scene=g.getDefaultScene()||g.listScenes()[0];
for(const animation of [...g.listAnimations()])animation.dispose();
for(const node of [...g.listNodes()])if(node.getName()==='MotionBallAnchor')node.dispose();
for(const e of [...g.listExtensionsUsed()])if(['KHR_draco_mesh_compression','EXT_meshopt_compression'].includes(e.extensionName))e.dispose();
const buffer=g.listBuffers()[0]||document.createBuffer();
const anchor=document.createNode('MotionBallAnchor').setExtras({radiusMeters:.12,visibility:'scale=0 means hidden',space:'scene metres; includes Root travel'});scene.addChild(anchor);
const nodes=Object.fromEntries(g.listSkins()[0].listJoints().map(n=>[n.getName(),n]));
const morphNodes=g.listNodes().filter(n=>n.getMesh()?.listPrimitives().some(p=>p.listTargets().length));
const vec=(name,type,a)=>document.createAccessor(name).setType(type).setArray(new Float32Array(a)).setBuffer(buffer);
const channels=new Map();
function makeTrack(node,targetPath,times,values,size,interpolation='CUBICSPLINE',slopes=null){
 const incoming=slopes?.incoming,outgoing=slopes?.outgoing;
 if(targetPath==='rotation')for(let i=0;i<values.length;i+=4){const l=Math.hypot(...values.slice(i,i+4));for(let k=0;k<4;k++)values[i+k]/=l;if(i&&values.slice(i,i+4).reduce((s,v,k)=>s+v*values[i-4+k],0)<0)for(let k=0;k<4;k++){values[i+k]*=-1;if(incoming)incoming[i+k]*=-1;if(outgoing)outgoing[i+k]*=-1;}}
 const derivatives=outgoing||(Array.isArray(slopes)?slopes:null)||times.flatMap((t,i)=>Array.from({length:size},(_,k)=>{const lo=Math.max(0,i-1),hi=Math.min(times.length-1,i+1);return (values[hi*size+k]-values[lo*size+k])/(times[hi]-times[lo]);}));
 const inDerivatives=incoming||derivatives;
 const output=interpolation==='CUBICSPLINE'?times.flatMap((_,i)=>[...inDerivatives.slice(i*size,(i+1)*size),...values.slice(i*size,(i+1)*size),...derivatives.slice(i*size,(i+1)*size)]):values;
 return{node,targetPath,times,values,size,interpolation,derivatives,inDerivatives,output};
}
function writeTracks(id,tracks,extras){
 const animation=document.createAnimation(id).setExtras(extras);
 for(const t of tracks){
  const input=vec('', 'SCALAR',t.times),output=vec('',t.targetPath==='weights'?'SCALAR':t.size===4?'VEC4':'VEC3',t.output);
  const sampler=document.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(t.interpolation);
  animation.addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(t.node).setTargetPath(t.targetPath).setSampler(sampler));
 }
 channels.set(id,tracks);return animation;
}
for(const clip of result.clips){
 const times=clip.frames.map(f=>f.t),tracks=[];
 for(const [name,node]of Object.entries(nodes))for(const [target,field,size]of [['translation','position',3],['rotation','quaternion',4]])tracks.push(makeTrack(node,target,times,clip.frames.flatMap(f=>f.bones[name][field]),size,'CUBICSPLINE',{incoming:clip.frames.flatMap(f=>f.derivatives.incoming.bones[name][field]),outgoing:clip.frames.flatMap(f=>f.derivatives.outgoing.bones[name][field])}));
 for(const node of morphNodes){const names=node.getMesh().getExtras().targetNames||[];if(names.length)tracks.push(makeTrack(node,'weights',times,clip.frames.flatMap(f=>names.map(n=>f.grips[n]||0)),names.length,'CUBICSPLINE',{incoming:clip.frames.flatMap(f=>names.map(n=>f.derivatives.incoming.grips[n]||0)),outgoing:clip.frames.flatMap(f=>names.map(n=>f.derivatives.outgoing.grips[n]||0))}));}
 tracks.push(makeTrack(anchor,'translation',times,clip.frames.flatMap(f=>f.ball.position),3,'CUBICSPLINE',{incoming:clip.frames.flatMap(f=>f.derivatives.incoming.ball.position),outgoing:clip.frames.flatMap(f=>f.derivatives.outgoing.ball.position)}));
 tracks.push(makeTrack(anchor,'rotation',times,clip.frames.flatMap(f=>f.ball.quaternion),4,'CUBICSPLINE',{incoming:clip.frames.flatMap(f=>f.derivatives.incoming.ball.quaternion),outgoing:clip.frames.flatMap(f=>f.derivatives.outgoing.ball.quaternion)}));
 tracks.push(makeTrack(anchor,'scale',times,clip.frames.flatMap(f=>f.ball.scale),3,'STEP'));
 writeTracks(clip.id,tracks,{sampleHz:30,loop:!!clip.loop,rootMotion:true,kind:clip.category==='reference'?'reference':'technique',events:(clip.events||[]).map(e=>({...e,time:e.frame/30,timeSeconds:e.frame/30}))});
}
const allById=Object.fromEntries(result.clips.map(c=>[c.id,c]));
const zero=[0,0,0];
const endpointRoot=clip=>{const f=clip.frames.at(-1),a=clip.frames[0];return f.bones.Root.position.map((v,k)=>v-a.bones.Root.position[k]);};
const bridges=[];
function addBridge(id,from,to){
 const duration=.6,count=18,times=Array.from({length:count+1},(_,i)=>i/30),tracks=[];
 const source=channels.get(from.animation),target=channels.get(to.animation);
 for(const a of source){
  const b=target.find(t=>t.node===a.node&&t.targetPath===a.targetPath);if(!b)throw Error('Bridge channel mismatch');
  const ia=from.timeSeconds===0?0:a.times.length-1,ib=to.timeSeconds===0?0:b.times.length-1;
  const fromSlopes=ia===0?a.derivatives:a.inDerivatives,toSlopes=ib===0?b.derivatives:b.inDerivatives;
  let av=a.values.slice(ia*a.size,(ia+1)*a.size),bv=b.values.slice(ib*b.size,(ib+1)*b.size),ad=fromSlopes.slice(ia*a.size,(ia+1)*a.size),bd=toSlopes.slice(ib*b.size,(ib+1)*b.size);
  if(a.targetPath==='translation'&&(a.node===nodes.Root||a.node===anchor)){av=av.map((v,k)=>v+(from.rootOffsetMeters||zero)[k]);bv=bv.map((v,k)=>v+(to.rootOffsetMeters||zero)[k]);}
  if(a.targetPath==='rotation'&&av.reduce((s,v,k)=>s+v*bv[k],0)<0){bv=bv.map(v=>-v);bd=bd.map(v=>-v);}
  const values=[],slopes=[];
  for(const t of times){const u=t/duration,u2=u*u,u3=u2*u;
   for(let k=0;k<a.size;k++)values.push((2*u3-3*u2+1)*av[k]+(u3-2*u2+u)*duration*ad[k]+(-2*u3+3*u2)*bv[k]+(u3-u2)*duration*bd[k]);
   for(let k=0;k<a.size;k++)slopes.push((6*u2-6*u)/duration*av[k]+(3*u2-4*u+1)*ad[k]+(-6*u2+6*u)/duration*bv[k]+(3*u2-2*u)*bd[k]);
  }
  // Zero scale hides a previously released ball during a bridge; skeleton and grip remain C1.
  if(a.targetPath==='scale'&&a.node===anchor){const visible=av[0]>.5&&bv[0]>.5;for(let i=0;i<values.length;i++)values[i]=visible?1:0;}
  tracks.push(makeTrack(a.node,a.targetPath,times,values,a.size,a.node===anchor?'LINEAR':'CUBICSPLINE',slopes));
 }
 writeTracks(id,tracks,{kind:'C1-bridge',sampleHz:30,from,to,durationSeconds:duration});
 bridges.push({id,animation:id,glb:'models/athlete.glb',duration,durationSeconds:duration,from,to,ballPolicy:'visible only when both endpoints retain ball; attach ownership externally',rootPolicy:'apply indicated Root/ball offsets to adjacent reference playback'});
}
for(const clip of result.clips.filter(c=>c.category!=='reference')){
 const end=endpointRoot(clip),runEnd=endpointRoot(allById.ref_run);
 const runBridgeTravel=.5*2.2*.6;
 const moving=clip.id.startsWith('dribble_run_'),entryOffset=moving?[0,0,runBridgeTravel]:zero,exitOffset=end.map((v,k)=>v+(moving&&k===2?runBridgeTravel:0));
 addBridge('idle_to__'+clip.id,{animation:'ref_idle',timeSeconds:0,rootOffsetMeters:zero},{animation:clip.id,timeSeconds:0,rootOffsetMeters:entryOffset});
 addBridge(clip.id+'__to_idle',{animation:clip.id,timeSeconds:clip.durationSeconds,rootOffsetMeters:zero},{animation:'ref_idle',timeSeconds:0,rootOffsetMeters:exitOffset});
 addBridge('run_to__'+clip.id,{animation:'ref_run',timeSeconds:allById.ref_run.durationSeconds,rootOffsetMeters:zero},{animation:clip.id,timeSeconds:0,rootOffsetMeters:runEnd.map((v,k)=>v+(k===2?runBridgeTravel:0))});
 addBridge(clip.id+'__to_run',{animation:clip.id,timeSeconds:clip.durationSeconds,rootOffsetMeters:zero},{animation:'ref_run',timeSeconds:0,rootOffsetMeters:end.map((v,k)=>v+(k===2?runBridgeTravel:0))});
}
const gaitBridges=repairGaitBridges(document,{bridges});
await fs.writeFile(path.join(root,'verification/gait-bridges.json'),JSON.stringify(gaitBridges,null,2)+'\n');
const grounding=await groundBridges(document,{directory:root,io});
for(const bridge of bridges){const record=grounding.records.find(r=>r.id===bridge.id);bridge.grounding={method:grounding.method,rootLiftAmplitudeMeters:record.rootLiftAmplitudeMeters,sampleHz:grounding.sampleHz,clearanceMeters:grounding.clearanceMeters};}
await fs.writeFile(path.join(root,'verification/bridge-grounding.json'),JSON.stringify(grounding,null,2)+'\n');
g.getAsset().generator='Bakasun hoops-technique-v1 / authored poses + measured skin IK / uniform30Hz';
g.getAsset().extras={sampleHz:30,boneCount:18,techniques:24,bridges:bridges.length,axes:{up:'+Y',forward:'+Z',left:'+X'},units:'metres'};
const bytes=await io.writeBinary(document);await fs.writeFile(path.join(root,'models/athlete.glb'),bytes);
const skeleton=JSON.parse(await fs.readFile(path.join(root,'rig.json'),'utf8'));
const catalog={schemaVersion:1,id:'hoops-technique-v1',sampleHz:30,units:'metres',axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},glb:'models/athlete.glb',skeleton:{boneCount:18,names:result.boneNames,bind:'rig.json',profile:'pg',compatibility:'Canonical18 names and hierarchy; target bind from pg. Retarget rotations for different bind proportions.'},authorship:{method:'Original analytic basketball phase poses, measured two-bone IK and independent left/right grip morphs. No motion capture.',referenceAsset:'../hoops-v7/characters/models/pg-lod1.glb',sourceCommit:'43b27dc235387e3cb737aee9558cdf9d5fd5a262'},clips:[],references:[],bridges,files:{model:{path:'models/athlete.glb',bytes:bytes.length,sha256:hash(bytes)}},qa:{tool:'source/validate.mjs',report:'verification/motion-qa-v1.json',rubric:'Locally authored rubric; requested external motion-qa-v1 tool was unavailable. No external certification.'},integration:{rootMotion:'Root translation is authored world travel. Position the actor in an outer Group. Align the next animation using bridge.from/to.rootOffsetMeters, also offset MotionBallAnchor.',ball:'Attach a radius .12m basketball to scene node MotionBallAnchor; scale zero hides it. Gameplay determines possession, rim/recipient and world flight.',referenceRun:'One forward cycle, relative Root travel. Accumulate terminal displacement before repeating; do not reset Root abruptly.',hands:'18 bones have no finger joints. Independent grip_left/right morphs shape thumb/fingers; these are baked glTF weight channels.'}};
for(const clip of result.clips){
 const meta={...clip};delete meta.frames;
 const events=(clip.events||[]).map(e=>({...e,time:e.frame/30,timeSeconds:e.frame/30}));
 const row={...meta,duration:clip.durationSeconds,frames:clip.frames.length,sampleHz:30,events,glb:'models/athlete.glb',animation:clip.id,contacts:'contacts/'+clip.id+'.json',contactSheet:'contact-sheets/'+clip.id+'.webp'};
 if(clip.category==='reference')catalog.references.push(row);else catalog.clips.push(row);
 const contacts={schemaVersion:1,id:clip.id,sampleHz:30,durationSeconds:clip.durationSeconds,ballRadiusMeters:.12,palmLocalMeters:Object.fromEntries(Object.entries(profile.palms).map(([k,v])=>[k,v.palmPoint])),samples:clip.frames.map((f,i)=>({frame:i,timeSeconds:f.t,support:{left:f.footErrors.left.support,right:f.footErrors.right.support},hands:f.contact.map(c=>c.effector),...(Object.keys(f.supportMarkers).length?{supportMarkers:f.supportMarkers}:{})}))};
 await fs.writeFile(path.join(root,row.contacts),JSON.stringify(contacts)+'\n');
}
await fs.writeFile(path.join(root,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
await fs.writeFile(path.join(root,'verification/build.json'),JSON.stringify({schemaVersion:1,sampleHz:30,clips:catalog.clips.length,references:catalog.references.length,bridges:bridges.length,animations:g.listAnimations().length,bytes:bytes.length,sha256:hash(bytes),sourceHashes:await Promise.all(['source/build.mjs','source/ground-bridges.mjs','source/gait-bridges.mjs','source/motion.mjs','source/technique-poses.mjs','models/athlete-bind.glb'].map(async file=>({file,sha256:hash(await fs.readFile(path.join(root,file)))})))},null,2)+'\n');
console.log(JSON.stringify({clips:catalog.clips.length,bridges:bridges.length,animations:g.listAnimations().length,bytes:bytes.length}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
