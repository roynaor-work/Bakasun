/** CC0-1.0. Independent acceptance measurements of delivered GLB bytes.
 * No source-motion functions, runtime IK, geometry decoder or browser mixer.
 * Usage: node verification/check.mjs [--validator /absolute/path/to/gltf-validator]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as T from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {measureAngles,assessAngles} from './angles.mjs';

const base=new URL('../',import.meta.url), out=new URL('./',import.meta.url);
const require=createRequire(import.meta.url), DEG=180/Math.PI;
const I=[0,0,0,1], V=a=>new T.Vector3(...a), Q=a=>new T.Quaternion(...a);
const canonical=[
 ['Root',null,[0,0,0]],['Hips','Root',[0,.86,0]],['Spine','Hips',[0,.2,0]],['Chest','Spine',[0,.18,0]],['Neck','Chest',[0,.1,0]],['Head','Neck',[0,.13,0]],
 ['LeftArm','Chest',[.16,.06,0]],['LeftForeArm','LeftArm',[0,-.27,0]],['LeftHand','LeftForeArm',[0,-.24,0]],['RightArm','Chest',[-.16,.06,0]],['RightForeArm','RightArm',[0,-.27,0]],['RightHand','RightForeArm',[0,-.24,0]],
 ['LeftUpLeg','Hips',[.1,0,0]],['LeftLeg','LeftUpLeg',[0,-.41,0]],['LeftFoot','LeftLeg',[0,-.37,0]],['RightUpLeg','Hips',[-.1,0,0]],['RightLeg','RightUpLeg',[0,-.41,0]],['RightFoot','RightLeg',[0,-.37,0]]
].map(([name,parent,rest])=>({name,parent,rest}));
const names=canonical.map(b=>b.name);
export const limits={sampleHz:120,footSlidingM:.02,anchorErrorM:.02,boundaryPositionM:.02,boundaryRotationDeg:1,boundaryVelocityMps:.5,rateErrorFraction:.05,validatorErrors:0};
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const horiz=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const qangle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(Q(a).normalize().dot(Q(b).normalize()))))*DEG;
const round=x=>Number.isFinite(x)?Number(x.toFixed(9)):null;
const max=(xs,fn=x=>x)=>xs.reduce((m,x)=>Math.max(m,fn(x)),0);
const mix=(a,b,u)=>a.map((x,i)=>x+(b[i]-x)*u);
const assert=(condition,message)=>{if(!condition)throw Error(message);};

/** Deliberately separate parser, rather than trusting the authoring writer. */
export function decode(bytes){
 assert(bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2,'Expected GLB2');
 assert(bytes.readUInt32LE(8)===bytes.length,'GLB length mismatch');
 const chunks=[];
 for(let at=12;at<bytes.length;){const n=bytes.readUInt32LE(at),type=bytes.readUInt32LE(at+4);assert(n%4===0&&at+8+n<=bytes.length,'Invalid GLB chunk');chunks.push({type,bytes:bytes.subarray(at+8,at+8+n)});at+=8+n;}
 assert(chunks.length===2&&chunks[0].type===0x4e4f534a&&chunks[1].type===0x004e4942,'Expected JSON/BIN chunks');
 const json=JSON.parse(chunks[0].bytes.toString()),binary=chunks[1].bytes;
 const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}, readers={5120:[1,'readInt8'],5121:[1,'readUInt8'],5122:[2,'readInt16LE'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
 const read=index=>{const a=json.accessors[index],view=json.bufferViews[a.bufferView],width=widths[a.type],r=readers[a.componentType];assert(a&&!a.sparse&&view&&width&&r,'Unsupported accessor');const [size,method]=r,stride=view.byteStride??width*size,start=(view.byteOffset??0)+(a.byteOffset??0);assert(start+(a.count-1)*stride+width*size<=(view.byteOffset??0)+view.byteLength,'Accessor exceeds view');return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>binary[method](start+i*stride+j*size)));};
 const animation=json.animations[0],tracks={};
 for(const channel of animation.channels){const sampler=animation.samplers[channel.sampler],name=json.nodes[channel.target.node].name;tracks[name]??={};tracks[name][channel.target.path]={times:read(sampler.input).flat(),values:read(sampler.output),interpolation:sampler.interpolation??'LINEAR'};}
 return {json,binary,read,tracks,duration:Math.max(...Object.values(tracks).flatMap(t=>Object.values(t).map(v=>v.times.at(-1))))};
}
function bracket(keys,t,getTime=x=>x.time){
 if(t<=getTime(keys[0]))return [keys[0],keys[0],0];
 let hi=keys.findIndex(k=>getTime(k)>=t);if(hi<0)return [keys.at(-1),keys.at(-1),0];
 const a=keys[hi-1],b=keys[hi];return [a,b,(t-getTime(a))/(getTime(b)-getTime(a))];
}
function trackAt(track,t,rotation){const [a,b,u]=bracket(track.times,t,x=>x),ia=track.times.indexOf(a),ib=track.times.indexOf(b);return rotation?Q(track.values[ia]).slerp(Q(track.values[ib]),u).normalize().toArray():mix(track.values[ia],track.values[ib],u);}
export function rootAt(root,t){
 const keys=root?.samples??[{time:0,position:[0,0,0],yaw:0}], [a,b,u]=bracket(keys,t);
 return {position:mix(a.position,b.position,u),yaw:(a.yaw??0)+((b.yaw??0)-(a.yaw??0))*u};
}
export function poseAt(data,t){const rotations={},hips=data.json.nodes.find(n=>n.name==='Hips').translation;for(const name of names)rotations[name]=data.tracks[name]?.rotation?trackAt(data.tracks[name].rotation,t,true):I;return {hips:data.tracks.Hips?.translation?trackAt(data.tracks.Hips.translation,t,false):hips,rotations};}
export function forward(p,root={position:[0,0,0],yaw:0}){const world={},rootQ=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),root.yaw*Math.PI/180);for(const b of canonical){const parent=world[b.parent]??{position:root.position,rotation:rootQ.toArray()},offset=b.name==='Hips'?p.hips:b.rest;world[b.name]={position:V(offset).applyQuaternion(Q(parent.rotation)).add(V(parent.position)).toArray(),rotation:Q(parent.rotation).multiply(Q(p.rotations[b.name])).toArray()};}return world;}
export function worldAt(data,meta,t){return forward(poseAt(data,t),rootAt(meta.referenceRootMotion??meta.rootMotion,t));}
const point=(w,bone,local)=>V(local).applyQuaternion(Q(w[bone].rotation)).add(V(w[bone].position)).toArray();
function referenceAt(ref,phase){const [a,b,u]=bracket(ref.frames,phase);return {hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(names.map(n=>[n,Q(a.rotations[n]).slerp(Q(b.rotations[n]),u).toArray()]))};}
function boundary(data,definition,time,refs){
 const p=poseAt(data,time),r=referenceAt(refs.clips[definition.reference],definition.phase??0),pw=forward(p),rw=forward(r);
 const ref=refs.clips[definition.reference],step=1/30,sign=time===0?1:-1,phase=definition.phase??0;
 let nextPhase=phase+sign*step;while(nextPhase<0)nextPhase+=ref.duration;while(nextPhase>ref.duration)nextPhase-=ref.duration;
 const pn=forward(poseAt(data,time+sign*step)),rn=forward(referenceAt(ref,nextPhase));
 const velocityMps=max(names,n=>dist(pn[n].position.map((v,i)=>(v-pw[n].position[i])/step),rn[n].position.map((v,i)=>(v-rw[n].position[i])/step)));
 return {reference:definition.reference,phase,editedReference:!!definition.editedReference,continuation:!!definition.continuation,blendSeconds:definition.blendSeconds??0,maxLocalRotationDeg:round(max(names,n=>qangle(p.rotations[n],r.rotations[n]))),hipsM:round(dist(p.hips,r.hips)),maxJointM:round(max(names,n=>dist(pw[n].position,rw[n].position))),maxJointVelocityErrorMps:round(velocityMps)};
}
function supportMeasure(data,meta,s){
 const samples=[s.start,s.end];for(let i=Math.ceil(s.start*120);i/120<s.end;i++)samples.push(i/120);
 const unique=[...new Set(samples)].sort((a,b)=>a-b),locals=[[0,-.08,0],[0,-.08,.12],[0,-.08,-.06]],paths=locals.map(()=>[]),nativeCenters=[];let anchorErrorM=0,verticalM=0;
 for(const t of unique){const w=worldAt(data,meta,t);for(let i=0;i<locals.length;i++)paths[i].push(point(w,s.bone,locals[i]));nativeCenters.push(point(forward(poseAt(data,t)),s.bone,locals[0]));const c=paths[0].at(-1);anchorErrorM=Math.max(anchorErrorM,dist(c,s.anchor));verticalM=Math.max(verticalM,Math.abs(c[1]-s.anchor[1]));}
 const excursion=paths.map(points=>{let result=0;for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)result=Math.max(result,horiz(points[i],points[j]));return result;});
 let nativeExcursion=0;for(let i=0;i<nativeCenters.length;i++)for(let j=i+1;j<nativeCenters.length;j++)nativeExcursion=Math.max(nativeExcursion,horiz(nativeCenters[i],nativeCenters[j]));
 return {bone:s.bone,start:s.start,end:s.end,samples:unique.length,frame:'simulation reference path applied once; native GLB root remains in place',centerSlidingM:round(excursion[0]),toeSlidingM:round(excursion[1]),heelSlidingM:round(excursion[2]),maxSlidingM:round(Math.max(...excursion)),anchorErrorM:round(anchorErrorM),verticalM:round(verticalM),nativeInPlaceCenterExcursionM:round(nativeExcursion)};
}
export function measure(data,meta,refs){
 const row={id:meta.id,duration:round(data.duration),frames:data.tracks.Hips.translation.times.length,failures:[]},check=(ok,code,details)=>{if(!ok)row.failures.push({code,details});};
 const {json,tracks}=data,extensions=[...(json.extensionsUsed??[]),...(json.extensionsRequired??[])];
 check(!extensions.some(s=>/draco|meshopt/i.test(s)),'compressed-extension',extensions);
 check(!JSON.stringify(json.meshes).match(/draco|meshopt/i),'compressed-primitive');
 const joints=[...new Set(json.skins.flatMap(s=>s.joints.map(i=>json.nodes[i].name)))];row.boneCount=joints.length;
 check(joints.length===18&&names.every(n=>joints.includes(n)),'canonical-joints',joints);
 for(const b of canonical){const node=json.nodes.find(n=>n.name===b.name),index=json.nodes.indexOf(node),parent=json.nodes.find(n=>n.children?.includes(index));check(node&&dist(node.translation??[0,0,0],b.rest)<.000001,'canonical-rest',b.name);check(b.name==='Root'||parent?.name===b.parent,'canonical-parent',b.name);}
 check(json.animations.length===1&&json.animations[0].name===meta.id,'single-native-clip');
 check(names.every(n=>tracks[n]?.rotation),'canonical-tracks');
 let rateError=0,gridError=0,normError=0;
 for(const [name,paths] of Object.entries(tracks))for(const [kind,t] of Object.entries(paths)){
  check(t.interpolation==='LINEAR','linear-track',{name,kind});check(t.times.length===Math.round(meta.duration*30)+1,'frame-count',{name,kind,count:t.times.length});
  for(let i=0;i<t.times.length;i++){gridError=Math.max(gridError,Math.abs(t.times[i]-i/30));if(i)rateError=Math.max(rateError,Math.abs(1/(t.times[i]-t.times[i-1])-30)/30);check(t.values[i].every(Number.isFinite),'finite-track',{name,kind,i});if(kind==='rotation')normError=Math.max(normError,Math.abs(Math.hypot(...t.values[i])-1));}
 }
 row.rateErrorPercent=round(rateError*100);row.maxGridErrorSeconds=round(gridError);row.maxQuaternionNormError=round(normError);
 check(rateError<=limits.rateErrorFraction,'rate-error',row.rateErrorPercent);check(normError<.000002,'unit-quaternions',normError);check(Math.abs(data.duration-meta.duration)<.000002,'duration',data.duration);
 const expectedDuration=meta.timing?.durationSeconds??meta.duration;
 row.actionTiming={expectedDurationSeconds:expectedDuration,decodedDurationSeconds:round(data.duration),durationErrorPercent:round(Math.abs(data.duration-expectedDuration)/expectedDuration*100),expectedContactFrame:meta.timing?.contactFrame??meta.contactFrame,decodedContactTimeSeconds:Number.isInteger(meta.contactFrame)?round(tracks.Hips.translation.times[meta.contactFrame]):null};
 check(row.actionTiming.durationErrorPercent<=5,'action-duration-rate',row.actionTiming);
 check(meta.rootMotion===false,'stationary-root-contract',meta.rootMotion);
 check(meta.referenceRootMotion?.mode==='reference-only','reference-root-contract',meta.referenceRootMotion?.mode);
 check(!json.animations[0].extras?.referenceRootMotion&&!json.extras?.referenceRootMotion,'root-curve-not-in-glb');
 check(Object.values(tracks.Root??{}).every(t=>t.values.every(v=>v.length===4?qangle(v,I)<.001:Math.hypot(...v)<.000001)),'double-root-motion');
 row.supports=(meta.supports??[]).map(s=>supportMeasure(data,meta,s));
 row.maxSlidingM=max(row.supports,s=>s.maxSlidingM);row.maxAnchorErrorM=max(row.supports,s=>s.anchorErrorM);
 check(row.supports.length>0,'declared-supports');check(row.maxSlidingM<=limits.footSlidingM,'foot-sliding',row.maxSlidingM);check(row.maxAnchorErrorM<=limits.anchorErrorM,'plant-anchor',row.maxAnchorErrorM);
 row.entry=boundary(data,meta.entry,0,refs);row.exit=boundary(data,meta.exit,data.duration,refs);
 for(const edge of ['entry','exit']){if(!meta[edge].editedReference&&!meta[edge].continuation){check(row[edge].maxLocalRotationDeg<=limits.boundaryRotationDeg,'boundary-rotation',{edge,...row[edge]});check(row[edge].maxJointM<=limits.boundaryPositionM,'boundary-position',{edge,...row[edge]});check(row[edge].maxJointVelocityErrorMps<=limits.boundaryVelocityMps,'boundary-velocity',{edge,...row[edge]});}const t=edge==='entry'?0:data.duration,h=edge==='entry'?1/30:-1/30,root=rootAt(meta.referenceRootMotion,t),next=rootAt(meta.referenceRootMotion,t+h);row[edge].referencePathSpeedMps=round(dist(root.position,next.position)/Math.abs(h));}
 const angularFrames=[];for(let i=0;i<=Math.round(data.duration*120);i++){const time=i/120,p=poseAt(data,time),w=forward(p);angularFrames.push({time,hips:p.hips,p:Object.fromEntries(names.map(n=>[n,w[n].position])),q:Object.fromEntries(names.map(n=>[n,w[n].rotation])),local:p.rotations});}
 row.angles=measureAngles(angularFrames);
 const mandatedTargets=['idle_relaxed','idle_scan','idle_weight_shift'].includes(meta.id)?{shoulderAbductionDeg:12,elbowFlexDeg:40}:meta.id==='run'?{elbowRangeDeg:[90,110],maxHipExcursionMeters:.025}:{};
 row.angleAcceptance=assessAngles(row.angles,{...mandatedTargets,...meta.qualityTargets});
 for(const failure of row.angleAcceptance.failures)row.failures.push(failure);
 row.events=[];
 if(meta.ball?.samples?.length){let minY=Infinity;for(let i=0;i<=Math.round(data.duration*120);i++){const [a,b,u]=bracket(meta.ball.samples,i/120),p=mix(a.position,b.position,u);check(p.every(Number.isFinite),'finite-ball-sample',i);minY=Math.min(minY,p[1]);}row.ball={radius:meta.ball.radius,minCenterY:round(minY),maxFloorPenetrationM:round(Math.max(0,meta.ball.radius-minY))};check(minY>=meta.ball.radius-.001,'ball-floor-penetration',row.ball);}
 for(const e of meta.events??[]){check(Number.isInteger(e.frame)&&Math.abs(e.time-e.frame/30)<1e-8,'event-frame',e);check(e.frame>=0&&e.frame<=Math.round(meta.duration*30),'event-range',e);if(!e.bone||!e.local||!e.position)continue;const actual=point(worldAt(data,meta,e.time),e.bone,e.local),contactError=dist(actual,e.position),item={event:e.event??e.type,frame:e.frame,bone:e.bone,contactErrorM:round(contactError)};check(contactError<.005,'event-fk-contact',item);if(meta.ball?.samples?.length&&['receive','release','contact','control','touch'].includes(item.event)){check(e.bone!=='Root','physical-ball-contact-bone',item);const [a,b,u]=bracket(meta.ball.samples,e.time),ball=mix(a.position,b.position,u);item.ballSurfaceErrorM=round(Math.abs(dist(actual,ball)-meta.ball.radius));check(item.ballSurfaceErrorM<.01,'ball-surface-contact',item);}row.events.push(item);}
 const primary=meta.event??(meta.events??[]).find(e=>e.event!=='plant')??(meta.events??[])[0];
 if(meta.category!=='idle'){check(!!primary,'primary-event');check(Number.isInteger(meta.contactFrame),'contact-frame');}else{check(meta.contactFrame===null&&!meta.event,'idle-no-invented-ball-contact');}
 if(/receive|first_touch/.test(meta.id))check((meta.events??[]).some(e=>(e.event??e.type)==='receive'),'explicit-receive-event');
 if(/^first_touch_(inside|outside)_/.test(meta.id)){
  const e=(meta.events??[]).find(e=>(e.event??e.type)==='receive'),inside=meta.id.startsWith('first_touch_inside_');
  check(e?.bone==='RightFoot','foot-receive-effector',e?.bone);
  check(e?.local?.[1]>=-.095&&e?.local?.[1]<=.035,'shoe-contact-height',e?.local);
  check(inside?e?.local?.[0]>=.02:e?.local?.[0]<=-.02,'inside-outside-contact-side',{expected:inside?'local x >= .02':'local x <= -.02',actual:e?.local});
 }
 if(/first_touch_.*_quick$/.test(meta.id))check(Math.abs(data.duration-.5)<.000002,'quick-first-touch-duration',data.duration);
 if(/cut_/.test(meta.id))check(data.duration>=.35&&data.duration<=.600001,'short-cut-duration',data.duration);
 row.pass=row.failures.length===0;return row;
}
async function validateFile(validator,url){const bytes=await fs.readFile(url),report=await validator.validateBytes(new Uint8Array(bytes),{uri:path.basename(fileURLToPath(url)),maxIssues:1000,externalResourceFunction:()=>Promise.reject(Error('External resources forbidden'))});return {asset:path.relative(fileURLToPath(base),fileURLToPath(url)),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos,messages:report.issues.messages,validatorVersion:validator.version()};}
export async function run(){
 const catalogBytes=await fs.readFile(new URL('runtime/catalog.json',base)),catalogSha256=createHash('sha256').update(catalogBytes).digest('hex'),catalog=JSON.parse(catalogBytes),refs=JSON.parse(await fs.readFile(new URL('reference.json',out)));
 const validatorArg=process.argv.indexOf('--validator'),validator=require(validatorArg<0?'/tmp/v10-tools/node_modules/gltf-validator':process.argv[validatorArg+1]);
 const rows=[],validation=[];
 for(const meta of catalog.clips){const url=new URL(`runtime/${meta.asset??`clips/${meta.id}.glb`}`,base),bytes=await fs.readFile(url),row=measure(decode(bytes),meta,refs);row.sha256=createHash('sha256').update(bytes).digest('hex');if(meta.sha256&&meta.sha256!==row.sha256){row.failures.push({code:'catalog-sha256',details:{expected:meta.sha256,actual:row.sha256}});row.pass=false;}rows.push(row);validation.push(await validateFile(validator,url));console.log(`${row.pass?'PASS':'FAIL'} ${meta.id}: slide=${row.maxSlidingM}m rate=${row.rateErrorPercent}% ${JSON.stringify(row.failures)}`);}
 for(const id of ['run','jog','idle_relaxed'])validation.push(await validateFile(validator,new URL(`runtime/reference/${id}.glb`,base)));
 const catalogSha256After=createHash('sha256').update(await fs.readFile(new URL('runtime/catalog.json',base))).digest('hex'),catalogStable=catalogSha256===catalogSha256After;
 const report={method:'Delivered float32 GLB tracks; shortest-path quaternion interpolation; independent FK at 120Hz; GLB Root stays identity; simulation reference path applied once only for documented plant/ball audits; center/toe/heel support excursion. Native raw boundary deltas retained; explicitly edited references and continuation exits are not reported as exact native pose matches.',catalogSha256,catalogSha256After,catalogStable,limits,sourceReferenceCommit:refs.sourceCommit,clips:rows,summary:{clips:rows.length,passed:rows.filter(r=>r.pass).length,maxSlidingM:max(rows,r=>r.maxSlidingM),maxAnchorErrorM:max(rows,r=>r.maxAnchorErrorM),maxRateErrorPercent:max(rows,r=>r.rateErrorPercent),maxRawBoundaryJointM:max(rows,r=>Math.max(r.entry.maxJointM,r.exit.maxJointM)),maxRawBoundaryRotationDeg:max(rows,r=>Math.max(r.entry.maxLocalRotationDeg,r.exit.maxLocalRotationDeg)),maxExactBoundaryJointM:max(rows,r=>Math.max(...['entry','exit'].map(k=>r[k].editedReference||r[k].continuation?0:r[k].maxJointM))),maxExactBoundaryRotationDeg:max(rows,r=>Math.max(...['entry','exit'].map(k=>r[k].editedReference||r[k].continuation?0:r[k].maxLocalRotationDeg))),validatorErrors:validation.reduce((s,r)=>s+r.errors,0)},pass:catalogStable&&rows.every(r=>r.pass)&&validation.every(r=>r.errors===0)};
 await fs.writeFile(new URL('metrics.json',out),JSON.stringify(report,null,2)+'\n');await fs.writeFile(new URL('validator.json',out),JSON.stringify({validator:validator.version(),files:validation,pass:validation.every(r=>r.errors===0)},null,2)+'\n');
 console.log(JSON.stringify(report.summary));if(!report.pass)process.exitCode=1;return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await run();
