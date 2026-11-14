// SPDX-License-Identifier: CC0-1.0
// Independent reader of FINAL decoded GLB channels. No authoring evaluator is imported.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as T from '../../../vendor/three.module.js';
const BASE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(process.env.ALPINE_TRICKS_MODULES??'/tmp/alpine-tricks-tools/package.json');
const NAMES=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const norm=a=>Math.hypot(...a), unit=a=>a.map(v=>v/norm(a));
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(dot(unit(a),unit(b)))));
const sha=b=>createHash('sha256').update(b).digest('hex');
const vector=a=>new T.Vector3().fromArray(a);
const quaternion=a=>new T.Quaternion().fromArray(a);
export async function readFinal(){
 const {NodeIO}=require('@gltf-transform/core'),{KHRDracoMeshCompression}=require('@gltf-transform/extensions'),codec=require('draco3dgltf');
 const io=new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({'draco3d.decoder':await codec.createDecoderModule()});
 const catalog=JSON.parse(await fs.readFile(path.join(BASE,'catalog.json'),'utf8'));
 const file=catalog.asset??catalog.glb??'alpine-tricks.glb';
 const bytes=await fs.readFile(path.join(BASE,typeof file==='string'?file:file.file));
 const doc=await io.readBinary(bytes),root=doc.getRoot(),nodes=root.listNodes(),nodeIndex=new Map(nodes.map((n,i)=>[n,i]));
 const parents=nodes.map(n=>{const p=n.getParentNode();return p?nodeIndex.get(p):-1;});
 const rest=nodes.map(n=>({p:n.getTranslation(),q:n.getRotation(),s:n.getScale()}));
 const clips=root.listAnimations().map(a=>({id:a.getName(),tracks:a.listChannels().map(c=>{const s=c.getSampler();return {node:nodeIndex.get(c.getTargetNode()),name:c.getTargetNode().getName(),path:c.getTargetPath(),type:s.getInterpolation(),times:Array.from(s.getInput().getArray()),values:Array.from(s.getOutput().getArray()),size:s.getOutput().getElementSize()};})}));
 for(const c of clips)c.duration=Math.max(...c.tracks.map(t=>t.times.at(-1)));
 const byName=Object.fromEntries(nodes.map((n,i)=>[n.getName(),i]));
 const skins=root.listSkins().map(s=>({joints:s.listJoints().map(n=>nodeIndex.get(n)),inverse:s.getInverseBindMatrices().getArray()}));
 const vertices=[],rigidFoot={LeftFoot:[],RightFoot:[]},equipment=[];
 for(const n of nodes){if(!n.getMesh())continue;const skin=n.getSkin(),si=skin?root.listSkins().indexOf(skin):-1;
  for(const p of n.getMesh().listPrimitives()){
   const pos=p.getAttribute('POSITION'),j=p.getAttribute('JOINTS_0'),w=p.getAttribute('WEIGHTS_0');
   for(let i=0;i<pos.getCount();i++){
    const vertex={p:pos.getElement(i,[]),node:nodeIndex.get(n),skin:si};
    if(si>=0){vertex.j=j.getElement(i,[]);vertex.w=w.getElement(i,[]);vertices.push(vertex);
     const major=vertex.w.indexOf(Math.max(...vertex.w)),bone=nodes[skins[si].joints[vertex.j[major]]].getName();
     if(rigidFoot[bone]&&vertex.w[major]>.9999){const m=new T.Matrix4().fromArray(skins[si].inverse,vertex.j[major]*16);rigidFoot[bone].push(vector(vertex.p).applyMatrix4(m).toArray());}
    }else equipment.push(vertex);
   }
  }
 }
 return {catalog,bytes,doc,nodes,parents,rest,clips,byName,skins,vertices,rigidFoot,equipment};
}
/** glTF normalized Hermite interpolation and derivative in seconds. */
export function evaluateTrack(track,t){
 const {times,values,size,type}=track,n=times.length,cubic=type==='CUBICSPLINE',factor=cubic?3:1;
 const key=i=>values.slice((i*factor+(cubic?1:0))*size,(i*factor+(cubic?1:0)+1)*size);
 let lo=0,hi=n-1;while(hi-lo>1){const m=(lo+hi)>>1;if(times[m]<=t)lo=m;else hi=m;}
 if(t<=times[0])lo=hi=0;else if(t>=times.at(-1))lo=hi=n-1;
 let value,derivative;
 if(lo===hi){value=key(lo);derivative=cubic?values.slice((lo*3+(lo===n-1?0:2))*size,(lo*3+(lo===n-1?0:2)+1)*size):new Array(size).fill(0);}
 else{const dt=times[hi]-times[lo],u=(t-times[lo])/dt,a=key(lo),b=key(hi);
  if(cubic){const u2=u*u,u3=u2*u,ma=values.slice((lo*3+2)*size,(lo*3+3)*size),mb=values.slice(hi*3*size,(hi*3+1)*size);
   value=a.map((v,i)=>(2*u3-3*u2+1)*v+(u3-2*u2+u)*dt*ma[i]+(-2*u3+3*u2)*b[i]+(u3-u2)*dt*mb[i]);
   derivative=a.map((v,i)=>(6*u2-6*u)*v/dt+(3*u2-4*u+1)*ma[i]+(-6*u2+6*u)*b[i]/dt+(3*u2-2*u)*mb[i]);
  }else if(track.path==='rotation'){value=quaternion(a).slerp(quaternion(b),u).toArray();derivative=new Array(size).fill(0);}
  else {value=a.map((v,i)=>v+(b[i]-v)*u);derivative=a.map((v,i)=>(b[i]-v)/dt);}
 }
 if(track.path==='rotation'){const len=norm(value),projection=dot(value,derivative)/(len*len);derivative=derivative.map((v,i)=>(v-value[i]*projection)/len);value=value.map(v=>v/len);}
 return {value,derivative};
}
export function sampleFinal(data,clip,t,{rootShift=0}={}){
 const local=data.rest.map(v=>({p:[...v.p],q:[...v.q],s:[...v.s]}));
 for(const track of clip.tracks){const v=evaluateTrack(track,t).value;local[track.node][track.path==='rotation'?'q':track.path==='scale'?'s':'p']=v;}
 local[data.byName.Root].p[0]+=rootShift;
 const world=new Array(local.length),make=i=>{if(world[i])return world[i];const v=local[i],m=new T.Matrix4().compose(vector(v.p),quaternion(v.q),vector(v.s));if(data.parents[i]>=0)m.premultiply(make(data.parents[i]));return world[i]=m;};
 for(let i=0;i<world.length;i++)make(i);
 const joints={},rotations={},localRotations={},scales={};for(const n of NAMES){const i=data.byName[n],p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();world[i].decompose(p,q,s);joints[n]=p.toArray();rotations[n]=q.toArray();localRotations[n]=local[i].q;scales[n]=s.toArray();}
 const markers={};for(const bone of ['LeftFoot','RightFoot']){markers[bone]={};for(const [name,p] of Object.entries(data.catalog.contactMarkers?.[bone]??{}))markers[bone][name]=vector(p).applyMatrix4(world[data.byName[bone]]).toArray();}
 return {t,world,local,joints,rotations,localRotations,scales,root:joints.Root,assetRoot:joints.Root,localJoints:structuredClone(joints),ball:null,markers};
}
function transformedY(p,m){const e=m.elements;return e[1]*p[0]+e[5]*p[1]+e[9]*p[2]+e[13];}
function floorMinimum(data,frame,full=false){
 let min=Infinity;
 for(const [bone,points]of Object.entries(data.rigidFoot))for(const p of points)min=Math.min(min,transformedY(p,frame.world[data.byName[bone]]));
 for(const v of data.equipment)min=Math.min(min,transformedY(v.p,frame.world[v.node]));
 if(full){const matrices=data.skins.map(s=>s.joints.map((j,i)=>frame.world[j].clone().multiply(new T.Matrix4().fromArray(s.inverse,i*16))));
  for(const v of data.vertices){let y=0;for(let k=0;k<4;k++)if(v.w[k])y+=v.w[k]*transformedY(v.p,matrices[v.skin][v.j[k]]);min=Math.min(min,y);}
 }
 return min;
}
function referenceAt(samples,t,bone,marker){
 let lo=0,hi=samples.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(samples[m].time<=t)lo=m;else hi=m;}
 if(t<=samples[0].time)lo=hi=0;if(t>=samples.at(-1).time)lo=hi=samples.length-1;
 const a=samples[lo][bone]?.[marker],b=samples[hi][bone]?.[marker];if(!a||!b)return null;
 const u=lo===hi?0:(t-samples[lo].time)/(samples[hi].time-samples[lo].time);return a.map((v,i)=>v+(b[i]-v)*u);
}
function contactError(data,clip,entry,shift=0){
 let max=0,maxNormal=0,count=0,intentionalTravel=0,worst=null;const perMarker={};
 for(const c of entry.contacts??[]){
  const reference=sampleFinal(data,clip,c.referenceTime??c.start),times=new Set([c.start,c.end]);
  for(let i=Math.ceil(c.start*120);i<=Math.floor(c.end*120);i++)times.add(i/120);
  if(c.referenceSamples)for(const s of c.referenceSamples)if(s.time>=c.start&&s.time<=c.end)times.add(s.time);
  for(const t of [...times].sort((a,b)=>a-b)){
   const actual=sampleFinal(data,clip,t,{rootShift:shift});
   for(const bone of c.bones??['LeftFoot','RightFoot'])for(const marker of ['binding','toe','heel']){
    const p=actual.markers[bone]?.[marker],target=c.mode==='planted'?reference.markers[bone]?.[marker]:referenceAt(c.referenceSamples??[],t,bone,marker);
    if(!p||!target)throw new Error(`${entry.id}: incomplete ${c.mode} ${bone}/${marker} reference`);
    const error=dist(p,target);count++;perMarker[`${bone}/${marker}`]=Math.max(perMarker[`${bone}/${marker}`]??0,error);
    maxNormal=Math.max(maxNormal,Math.abs(p[1]-target[1]));intentionalTravel=Math.max(intentionalTravel,dist(target,reference.markers[bone][marker]));
    if(error>max){max=error;worst={time:t,bone,marker,actual:p,desired:target,mode:c.mode};}
   }
  }
 }
 return {maxResidualMeters:max,maxNormalResidualMeters:maxNormal,intentionalTravelMeters:intentionalTravel,pointSamples:count,perMarker,worst,pass:count>0&&max<.02};
}
function trackErrors(a,b,ta,tb,heading=0,translation=[0,0,0]){
 let maxPosition=0,maxAngle=0,maxVelocity=0,maxAngularVelocity=0;
 const yaw=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),heading);
 for(const track of a.tracks){const other=b.tracks.find(t=>t.name===track.name&&t.path===track.path);if(!other)continue;const x=evaluateTrack(track,ta),y=evaluateTrack(other,tb);
  if(track.name==='Root'&&heading&&track.path==='rotation'){y.value=yaw.clone().multiply(quaternion(y.value)).toArray();y.derivative=yaw.clone().multiply(quaternion(y.derivative)).toArray();}
  if(track.name==='Root'&&track.path==='translation'){y.value=vector(y.value).applyQuaternion(yaw).toArray().map((v,i)=>v+translation[i]);y.derivative=vector(y.derivative).applyQuaternion(yaw).toArray();}
  if(track.path==='rotation'){const sign=dot(x.value,y.value)<0?-1:1;maxAngle=Math.max(maxAngle,angle(x.value,y.value));maxAngularVelocity=Math.max(maxAngularVelocity,2*dist(x.derivative,y.derivative.map(v=>v*sign)));}
  else{maxPosition=Math.max(maxPosition,dist(x.value,y.value));maxVelocity=Math.max(maxVelocity,dist(x.derivative,y.derivative));}
 }
 return {maxPositionMeters:maxPosition,maxAngleRadians:maxAngle,maxVelocityMetersPerSecond:maxVelocity,maxAngularVelocityRadiansPerSecond:maxAngularVelocity,pass:maxPosition<.0001&&maxAngle<.0001&&maxVelocity<.002&&maxAngularVelocity<.002};
}
export async function auditFinal(){
 const data=await readFinal(),errors=[],checks=[];const fail=s=>errors.push(s);
 const skin=data.doc.getRoot().listSkins()[0],names=skin?.listJoints().map(n=>n.getName());
 if(JSON.stringify(names)!==JSON.stringify(NAMES))fail('Exact canonical18 skin joint order');
 const expected={Root:null,Hips:'Root',Spine:'Hips',Chest:'Spine',Neck:'Chest',Head:'Neck',LeftArm:'Chest',LeftForeArm:'LeftArm',LeftHand:'LeftForeArm',RightArm:'Chest',RightForeArm:'RightArm',RightHand:'RightForeArm',LeftUpLeg:'Hips',LeftLeg:'LeftUpLeg',LeftFoot:'LeftLeg',RightUpLeg:'Hips',RightLeg:'RightUpLeg',RightFoot:'RightLeg'};
 for(const n of NAMES){const parent=data.nodes[data.parents[data.byName[n]]]?.getName()??null;if(expected[n]!==parent)fail(`${n}: canonical parent`);}
 // Check that declared running-surface probes belong to the actual rigid foot footprint.
 const bindFrame=sampleFinal(data,{tracks:[]},0),markerIntegrity=[];
 for(const bone of ['LeftFoot','RightFoot']){
  const points=data.rigidFoot[bone].map(p=>vector(p).applyMatrix4(bindFrame.world[data.byName[bone]]).toArray());
  const minY=Math.min(...points.map(p=>p[1])),minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minZ=Math.min(...points.map(p=>p[2])),maxZ=Math.max(...points.map(p=>p[2]));
  const records=['binding','toe','heel'].map(name=>{const p=bindFrame.markers[bone]?.[name];const pass=!!p&&p.every(Number.isFinite)&&p[0]>=minX-.001&&p[0]<=maxX+.001&&p[2]>=minZ-.001&&p[2]<=maxZ+.001&&Math.abs(p[1]-minY)<.003;return {bone,marker:name,bindPosition:p,rigidVertices:points.length,pass};});
  markerIntegrity.push(...records);if(records.some(r=>!r.pass))fail(`${bone}: running-surface marker is not within the actual foot geometry`);
 }
 const validator=require('gltf-validator'),validity=await validator.validateBytes(new Uint8Array(data.bytes),{maxIssues:30});
 if(validity.issues.numErrors)fail(`Khronos validator ${validity.issues.numErrors} errors`);
 for(const entry of data.catalog.clips){
  const clip=data.clips.find(c=>c.id===entry.id),issues=[];if(!clip){fail(`${entry.id}: absent GLB animation`);continue;}
  const reject=s=>issues.push(s);let maxQuat=0,maxTangent=0,sourceSamples=0,constantHoldTracks=0;
  for(const track of clip.tracks){
   if(track.type!=='CUBICSPLINE')reject(`${track.name}: interpolation`);
   const count=Math.round(entry.durationSeconds*30)+1;sourceSamples=Math.max(sourceSamples,track.times.length);
   const hold=track.times.length===2&&Math.abs(track.times[0])<3e-6&&Math.abs(track.times[1]-entry.durationSeconds)<3e-6&&track.values.every((v,i)=>{const slot=Math.floor(i/track.size)%3,k=i%track.size;return slot===1?Math.abs(v-track.values[track.size+k])<=1e-7:Math.abs(v)<1e-10;});
   if(hold)constantHoldTracks++;else if(track.times.length!==count||track.times.some((t,i)=>Math.abs(t-i/30)>3e-6))reject(`${track.name}: exact30Hz changing channel`);
   if(track.values.length!==track.times.length*track.size*3)reject(`${track.name}: cubic key count`);
   if(!track.values.every(Number.isFinite))reject(`${track.name}: nonfinite`);
   for(let i=0;i<track.times.length;i++){
    if(track.path==='rotation')maxQuat=Math.max(maxQuat,Math.abs(norm(track.values.slice((i*3+1)*4,(i*3+2)*4))-1));
    if(i>0&&i<track.times.length-1)for(let k=0;k<track.size;k++)maxTangent=Math.max(maxTangent,Math.abs(track.values[(i*3)*track.size+k]-track.values[(i*3+2)*track.size+k]));
   }
  }
  if(maxQuat>2e-5)reject('unit quaternion keys');if(maxTangent>.002)reject('C1 shared tangents');
  for(const n of NAMES)if(!clip.tracks.some(t=>t.name===n&&t.path==='rotation'))reject(`missing rotation ${n}`);
  if(Math.abs(clip.duration-entry.durationSeconds)>3e-6)reject('duration');
  const contact=contactError(data,clip,entry);if(!contact.pass)reject('ski contact residual <.02m');
  let minFoot=Infinity,minGeometry=Infinity,frames=0,headingPrevious=null,headingTravel=0;
  for(let i=0;i<=Math.round(clip.duration*120);i++){const t=Math.min(clip.duration,i/120),frame=sampleFinal(data,clip,t);const forward=new T.Vector3(0,0,1).applyQuaternion(quaternion(frame.rotations.Root)),heading=Math.atan2(forward.x,forward.z);if(headingPrevious!==null){let step=heading-headingPrevious;while(step>Math.PI)step-=2*Math.PI;while(step< -Math.PI)step+=2*Math.PI;headingTravel+=step;}headingPrevious=heading;minFoot=Math.min(minFoot,floorMinimum(data,frame,false));if(i%4===0)minGeometry=Math.min(minGeometry,floorMinimum(data,frame,true));frames++;}
  if(minFoot<-.003||minGeometry<-.003)reject('ground penetration');if(entry.spin!==undefined&&Math.abs(headingTravel-entry.spin)>.001)reject('air spin winding');
  const continuity={};if(entry.loop){continuity.loop=trackErrors(clip,clip,0,clip.duration);if(!continuity.loop.pass)reject('loop C0/C1');}
  if(entry.kind==='bridge'){
   const from=data.clips.find(c=>c.id===entry.from),to=data.clips.find(c=>c.id===entry.to);
   if(!from||!to)reject('bridge references');else{
    continuity.entry=trackErrors(clip,from,0,entry.fromTime??from.duration,entry.sourceHeadingOffsetRadians??0);
    continuity.exit=trackErrors(clip,to,clip.duration,entry.toTime??0,entry.headingOffsetRadians??0,entry.translationOffsetMeters??[0,0,0]);
    if(!continuity.entry.pass||!continuity.exit.pass)reject('bridge C0/C1 endpoints');
   }
  }
  const result={id:entry.id,kind:entry.kind,pass:!issues.length,issues,sourceSamples,constantHoldTracks,evaluatedFrames:frames,maxQuaternionKeyNormError:maxQuat,maxSharedTangentComponentError:maxTangent,contact,minimumRigidFootEquipmentY:minFoot,minimumWeightedGeometryY:minGeometry,accumulatedRootHeadingRadians:headingTravel,continuity};
  checks.push(result);for(const s of issues)fail(`${entry.id}: ${s}`);
 }
 // Adversarial checks act on decoded animation data/poses, not authoring helpers.
 const supported=data.catalog.clips.find(e=>(e.contacts??[]).length),sampleClip=data.clips.find(c=>c.id===supported?.id);
 const shift=sampleClip?contactError(data,sampleClip,supported,.03):null;
 const first=data.clips.find(c=>c.tracks.some(t=>t.times.length>3)),tampered=structuredClone(first),tangentTrack=tampered?.tracks.find(t=>t.times.length>3&&t.path==='translation');
 let tangentRejected=false;if(tangentTrack){tangentTrack.values[(1*3+2)*tangentTrack.size]+=.1;tangentRejected=Math.abs(tangentTrack.values[(1*3+2)*tangentTrack.size]-tangentTrack.values[(1*3)*tangentTrack.size])>.002;}
 const loopEntry=data.catalog.clips.find(e=>e.loop),loop=data.clips.find(c=>c.id===loopEntry?.id),open=structuredClone(loop);let loopRejected=false;
 if(open){const tr=open.tracks.find(t=>t.name==='Hips'&&t.path==='translation');if(tr){tr.values[((tr.times.length-1)*3+1)*tr.size]+=.03;loopRejected=!trackErrors(open,open,0,open.duration).pass;}}
 const negativeControls={contactShift3cmRejected:!!shift&&!shift.pass,tangentBreakRejected:tangentRejected,openLoopRejected:loopRejected};
 for(const [k,v]of Object.entries(negativeControls))if(!v)fail(`Negative control ${k}`);
 const report={schemaVersion:1,kind:'alpine-tricks-final-glb-independent-audit',sampleHz:120,assetSha256:sha(data.bytes),canonical18:{names,hierarchyPassed:!errors.some(e=>/canonical/.test(e))},markerIntegrity,khronos:{errors:validity.issues.numErrors,warnings:validity.issues.numWarnings,messages:validity.issues.messages},limits:{contactResidualMetersExclusive:.02,floorMeters:-.003,c1PositionMeters:.0001,c1AngleRadians:.0001,c1VelocityMetersPerSecond:.002,c1AngularVelocityRadiansPerSecond:.002},minimumWeightedGeometryY:Math.min(...checks.map(c=>c.minimumWeightedGeometryY)),maxContactResidualMeters:Math.max(...checks.map(c=>c.contact.maxResidualMeters)),clips:checks,negativeControls,errors,pass:!errors.length};
 await fs.writeFile(path.join(BASE,'verification/qa.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const r=await auditFinal();console.log(JSON.stringify({pass:r.pass,clips:r.clips.length,maxContactResidualMeters:r.maxContactResidualMeters,errors:r.errors},null,2));if(!r.pass)process.exitCode=1;}
