// SPDX-License-Identifier: CC0-1.0
// Independent adapter for the pinned, unchanged motion-qa-v1 numerical evaluator.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {parseGLB, readAccessor, sampleGLB} from './qa-vendor/motion-qa-v1/glb.mjs';
import {analyzeClip, METRICS} from './qa-vendor/motion-qa-v1/metrics.mjs';
import * as T from './qa-vendor/soccer-motion-v8/runtime/vendor/three.module.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(process.env.TENNIS_TOOLS_PACKAGE??'/tmp/tennis-officials-tools/package.json');
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const validator=require('gltf-validator');
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const upstreamCommit='5eb4f093bc22523ee417a7f2345c3b813bffba24';
const upstreamBase='workout/island/design/motion-qa-v1/';
const canonical=(await json(path.join(root,'../motion2/soccer.json'))).skeleton.bones;
const checks=[];
const check=(name,pass,evidence)=>{checks.push({name,pass:!!pass,evidence});};
const vec=new T.Vector3();
const rot=(q,p)=>new T.Vector3(...p).applyQuaternion(new T.Quaternion(...q)).toArray();
const localPoint=(frame,bone,local)=>frame.joints[bone].map((v,i)=>v+rot(frame.rotations[bone],local.map((x,k)=>x*(frame.scales?.[bone]?.[k]??1)))[i]);

function rigReport(gltf){
 const parents=new Map();gltf.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
 return (gltf.skins??[]).map(skin=>({name:skin.name,joints:skin.joints.map(i=>({name:gltf.nodes[i].name,parent:gltf.nodes[parents.get(i)]?.name??null})),pass:skin.joints.length===18&&skin.joints.every((i,k)=>gltf.nodes[i].name===canonical[k].name&&(canonical[k].parent===null||gltf.nodes[parents.get(i)]?.name===canonical[k].parent))}));
}
function surfaces(doc){
 const data=[];let triangles=0;
 for(const node of doc.getRoot().listNodes()){
  const mesh=node.getMesh(),skin=node.getSkin();if(!mesh||!skin)continue;
  const joints=skin.listJoints().map(n=>n.getName());
  const ibm=skin.getInverseBindMatrices().getArray();
  for(const p of mesh.listPrimitives()){
   const positions=p.getAttribute('POSITION')?.getArray(),weights=p.getAttribute('WEIGHTS_0'),indices=p.getAttribute('JOINTS_0');
   assert(positions&&weights&&indices,'Skinned surface must have POSITION, WEIGHTS_0, JOINTS_0');
   const w=[],j=[],temp=[];for(let i=0;i<weights.getCount();i++){weights.getElement(i,temp);w.push(...temp);indices.getElement(i,temp);j.push(...temp);}
   data.push({positions,weights:w,indices:j,joints,ibm});
   triangles+=(p.getIndices()?.getCount()??positions.length/3)/3;
  }
 }
 return {data,triangles};
}
function floorAudit(frames,data){
 let minimum=Infinity,worst=null,vertexSamples=0;
 for(const frame of frames){
  let floor=Infinity,lowest=null;
  for(const surface of data){
   const matrices=surface.joints.map((name,i)=>new T.Matrix4().compose(new T.Vector3(...frame.joints[name]),new T.Quaternion(...frame.rotations[name]),new T.Vector3(...frame.scales[name])).multiply(new T.Matrix4().fromArray(surface.ibm,i*16)));
   for(let i=0;i<surface.positions.length/3;i++){
    const result=[0,0,0];
    for(let k=0;k<4;k++){
     const weight=surface.weights[i*4+k];if(!weight)continue;
     vec.fromArray(surface.positions,i*3).applyMatrix4(matrices[surface.indices[i*4+k]]);
     result[0]+=weight*vec.x;result[1]+=weight*vec.y;result[2]+=weight*vec.z;
    }
    vertexSamples++;if(result[1]<floor){floor=result[1];lowest=result;}
   }
  }
  assert(lowest,'No decoded skinned vertices');
  frame.floorPoints=[{bone:'full-decoded-skin-minimum',position:lowest}];
  if(floor<minimum){minimum=floor;worst={t:frame.t,position:lowest};}
 }
 return {minimumY:minimum,maximumPenetrationMeters:Math.max(0,-minimum),worst,vertexSamples,method:'Every decoded skinned vertex at every 120Hz sample and embedded key time; linear blend skinning with decoded normalized weights and inverse binds.'};
}
function ballIndependence(gltf,animation){
 const ball=gltf.nodes.findIndex(n=>/^ball$/i.test(n.name));if(ball<0)return {exists:false,independent:false};
 const parents=new Map();gltf.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
 const ancestors=[];let p=parents.get(ball);while(p!==undefined){ancestors.push(gltf.nodes[p].name);p=parents.get(p);}
 return {exists:true,ancestors,independent:!ancestors.some(n=>canonical.some(b=>b.name===n)),ownTranslationTrack:animation.channels.some(c=>c.target.node===ball&&c.target.path==='translation')};
}
function idleReference(id,samples,extras){
 const name=extras.idleReference??extras.idle??(/^(chair_|umpire_)/.test(id)&&!/(stand|idle)$/.test(id)?'chair_seated':null);
 if(name&&samples.has(name))return {name,frames:samples.get(name).frames};
 const matched=[...samples.keys()].find(n=>n!==id&&/idle|stance|standing/.test(n))??[...samples.keys()].find(n=>/idle|stance|standing|seated/.test(n));
 return {name:matched,frames:samples.get(matched)?.frames};
}
function footPlaneAudit(frames,metadata){
 if(!Number.isFinite(metadata.supportPlaneY))return null;
 const observations=(metadata.supports??[]).flatMap(s=>frames.filter(f=>f.t>=s.start-1e-6&&f.t<=s.end+1e-6).map(f=>({time:f.t,bone:s.bone,delta:Math.abs(localPoint(f,s.bone,s.local??metadata.soleLocal??[0,-.08,0])[1]-metadata.supportPlaneY)})));
 return {supportPlaneY:metadata.supportPlaneY,maxVerticalErrorMeters:observations.length?Math.max(...observations.map(o=>o.delta)):null,samples:observations.length};
}
function representEndpointTimes(metadata,duration){
 const result=structuredClone(metadata),adjustments=[];
 for(const key of ['supports','contacts','ballContacts','contactWindows','events'])for(const record of result[key]??[]){
  for(const field of ['time','atSeconds','start','end'])if(Number.isFinite(record[field])){
   const nominal=record[field];
   const decoded=Math.abs(nominal-duration)<=1e-6?duration:Math.abs(nominal)<=1e-6?0:nominal;
   if(decoded!==nominal){record[field]=decoded;adjustments.push({collection:key,field,nominalSeconds:nominal,decodedSeconds:decoded,errorSeconds:decoded-nominal});}
  }
 }
 return {metadata:result,adjustments};
}
function activeLocomotionDiagnostic(sampled,metadata,id){
 if(!metadata.locomotion)return null;
 const frames=sampled.frames,moving=[];
 for(let i=1;i<frames.length;i++){
  const a=frames[i-1],b=frames[i],dt=b.t-a.t;
  const speed=Math.hypot(b.root[0]-a.root[0],b.root[2]-a.root[2])/dt;
  if(speed>.025*sampled.height)moving.push(i);
 }
 if(!moving.length)return null;
 const first=Math.max(0,moving[0]-1),last=moving.at(-1),segment=frames.slice(first,last+1);
 const start=segment[0].t,end=segment.at(-1).t,duration=end-start;
 const segmentMetadata={...metadata,supports:(metadata.supports??[]).map(s=>({...s,start:Math.max(s.start,start),end:Math.min(s.end,end)})).filter(s=>s.end>s.start),contacts:[],ballContacts:[],ballContactExpected:false,ballVisible:false};
 const measured=analyzeClip({frames:segment,duration,height:sampled.height,metadata:segmentMetadata,idleFrames:segment,clipId:id,sport:'tennis'});
 return {start,end,duration,selection:'First through last observed horizontal root speed >2.5% stature per second; support windows are intersected with that interval.',metric:measured.metrics.bodySliding,note:'Supplementary diagnostic only. The delivered clip score retains the upstream full-clip bodySliding result and all its original thresholds.'};
}

const report={schemaVersion:1,kind:'tennis-officials-motion-qa-v1',generatedAt:new Date().toISOString(),upstream:{repository:'https://github.com/roynaor-work/Bakasun',branch:'codex/motion-qa-v1',commit:upstreamCommit,path:upstreamBase,evaluator:'source/qa-vendor/motion-qa-v1/metrics.mjs',thresholdsModified:false},sampleHz:120,requiredScoreExclusive:88,metricDefinitions:METRICS,models:[],checks,pass:false,limitations:['The motion-qa-v1 score is a reproducible weighted numerical screening proxy; it is not a perceptual rating.','The adapter additionally checks every decoded skinned mesh vertex against the court plane. Footrest contact is reported separately from the court plane.','Game integration, real-device GPU timing, and live referee logic are outside this asset-only package.']};
const expectedHashes=await json(path.join(root,'source/qa-vendor/provenance.json'));
for(const f of expectedHashes.files){const actual=sha(await fs.readFile(path.join(root,'source/qa-vendor',f.file)));check('Pinned QA source '+f.file,actual===f.deliveredSha256,{expected:f.deliveredSha256,actual});}
const files=(await fs.readdir(path.join(root,'models'))).filter(f=>f.endsWith('.glb')).sort();
for(const file of files){
 const bytes=await fs.readFile(path.join(root,'models',file));
 const glb=parseGLB(bytes);if(!glb.json.skins?.length)continue;
 const decoded=await io.readBinary(bytes),surface=surfaces(decoded);
 const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:file,maxIssues:100});
 const rigs=rigReport(glb.json);check(file+' canonical18',rigs.every(r=>r.pass),rigs);
 check(file+' approximately 1,200 triangles',surface.triangles>=1080&&surface.triangles<=1320,{triangles:surface.triangles});
 check(file+' glTF has zero errors',validation.issues.numErrors===0,validation.issues);
 const model={file:'models/'+file,sha256:sha(bytes),bytes:bytes.length,triangles:surface.triangles,rigs,gltfValidation:validation.issues,clips:[]};report.models.push(model);
 const expectedCount=/^chair-umpire/.test(file)?5:/^line-judge/.test(file)?3:/^ball-kid/.test(file)?6:0;
 check(file+' required clip count',(glb.json.animations?.length??0)===expectedCount,{expected:expectedCount,actual:glb.json.animations?.length??0});
 const expectedNames=/^chair-umpire/.test(file)?['chair_idle','chair_seated','chair_score','chair_good','chair_nod']:/^line-judge/.test(file)?['line_idle','line_out','line_good']:['kid_idle','kid_bend','kid_run_collect','kid_roll','kid_offer','kid_return'];
 const actualNames=(glb.json.animations??[]).map(a=>a.name);
 check(file+' exact requested clip coverage',JSON.stringify([...actualNames].sort())===JSON.stringify([...expectedNames].sort()),{expected:expectedNames,actual:actualNames});
 const samples=new Map();
 for(const animation of glb.json.animations??[]){
  const meta=animation.extras?.motionQA??animation.extras?.qa??{};
  const extraTimes=[...(meta.supports??[]).flatMap(s=>[s.start,s.end]),...(meta.contacts??[]).map(c=>c.time??c.atSeconds),...(meta.ballContacts??[]).flatMap(c=>[c.start,c.end])];
  const sampled=sampleGLB(glb,{animation:animation.name,fps:120,extraTimes});
  const keyReports=[...new Set(animation.samplers.map(s=>s.input))].map(input=>{
   const times=Array.from(readAccessor(glb,input));
   const maxGridError=Math.max(...times.map(t=>Math.abs(t*30-Math.round(t*30))));
   const maxIntervalError=Math.max(0,...times.slice(1).map((t,i)=>Math.abs(t-times[i]-1/30)));
   return {input,count:times.length,duration:times.at(-1),maxGridErrorFrames:maxGridError,maxIntervalErrorSeconds:maxIntervalError,pass:Math.abs(times[0])<1e-6&&maxGridError<.001&&maxIntervalError<.00004};
  });
  check(file+'/'+animation.name+' dense 30Hz animation keys',keyReports.every(r=>r.pass),keyReports);
  sampled.floor=floorAudit(sampled.frames,surface.data);samples.set(animation.name,sampled);
 }
 for(const animation of glb.json.animations??[]){
  const id=animation.name,sampled=samples.get(id),extras=animation.extras??{};
  // The pinned sampler merges near-equal Float32 key and decimal metadata times.
  // Match the surviving endpoint representation, always within one microsecond.
  const represented=representEndpointTimes({...extras.motionQA,...extras.qa},sampled.frames.at(-1).t);
  const metadata={...represented.metadata,floorProbeKind:'minimum over every decoded skinned vertex plus all skeletal joint centers',coordinateSpace:'decoded GLB world in metres'};
  if(metadata.loop===undefined)metadata.loop=extras.loop??false;
  const reference=idleReference(id,samples,metadata);
  const result=analyzeClip({frames:sampled.frames,duration:sampled.duration,height:sampled.height,metadata,idleFrames:reference.frames,clipId:id,sport:'tennis'});
  const independence=ballIndependence(glb.json,animation);
  const contactExpected=metadata.ballContactExpected||(metadata.contacts?.length??0)>0||(metadata.ballContacts?.length??0)>0;
  if(contactExpected)check(file+'/'+id+' independent ball track',independence.independent&&independence.ownTranslationTrack,independence);
  check(file+'/'+id+' score >88',result.score>88,{score:result.score,coverage:result.coverage,reasons:result.reasons});
  check(file+'/'+id+' full metric coverage',result.coverage===1,{coverage:result.coverage});
  check(file+'/'+id+' decoded skin does not penetrate court',sampled.floor.minimumY>=-.002,sampled.floor);
  const plane=footPlaneAudit(sampled.frames,metadata);if(plane)check(file+'/'+id+' support plane contact',plane.maxVerticalErrorMeters!==null&&plane.maxVerticalErrorMeters<=.012,plane);
  const keyTimes=animation.samplers.map(s=>glb.json.accessors[s.input].count);
  const clip={id,duration:sampled.duration,samples:sampled.frames.length,embeddedSamplerKeyCounts:keyTimes,idleReference:reference.name,metadata,endpointRepresentationAdjustments:represented.adjustments,ballIndependence:independence,fullSkinFloor:sampled.floor,supportPlane:plane,activeLocomotionDiagnostic:activeLocomotionDiagnostic(sampled,metadata,id),...result};
  model.clips.push(clip);
  const slug=(file+'--'+id).replace(/[^a-zA-Z0-9_.-]/g,'_');
  await fs.writeFile(path.join(root,'verification','motion-qa-v1-'+slug+'.json'),JSON.stringify(clip,null,2)+'\n');
  console.log(file,id,result.score,result.coverage,result.reasons.map(r=>r.metric+':'+r.value).join(','));
 }
}
check('Seven animated character GLBs',report.models.length===7,{models:report.models.map(m=>m.file)});
check('Thirty-five delivered character clips',report.models.reduce((n,m)=>n+m.clips.length,0)===35,{count:report.models.reduce((n,m)=>n+m.clips.length,0)});
report.minimumScore=Math.min(...report.models.flatMap(m=>m.clips.map(c=>c.score)));
report.clipCount=report.models.reduce((n,m)=>n+m.clips.length,0);
report.pass=checks.every(c=>c.pass);
await fs.writeFile(path.join(root,'verification/motion-qa-v1.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,models:report.models.length,clips:report.clipCount,minimumScore:report.minimumScore,failed:checks.filter(c=>!c.pass).map(c=>c.name)}));
if(!report.pass)process.exitCode=1;
