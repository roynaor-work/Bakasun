import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as T from '../../../vendor/three.module.js';
import {documentScene} from '../../alpine-v7/tools/motion-bake.mjs';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const req=createRequire('/tmp/alpine-tools/package.json'),{NodeIO}=req('@gltf-transform/core'),{KHRDracoMeshCompression}=req('@gltf-transform/extensions');
const io=new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({'draco3d.decoder':await req('draco3dgltf').createDecoderModule()});
const bytes=await fs.readFile(path.join(dir,'clips.glb')),cat=JSON.parse(await fs.readFile(path.join(dir,'catalog.json'),'utf8'));
const src=await io.read(path.resolve(dir,cat.source.file)),dst=await io.readBinary(bytes),{scene,byName}=documentScene(src);
const raw=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const failures=[],gate=(ok,msg)=>{if(!ok)failures.push(msg);},r=n=>Math.round(n*1e8)/1e8;
for(const k of ['meshes','materials','textures','images','skins'])gate(!(raw[k]?.length),`Forbidden payload ${k}`);
gate(bytes.length<=300000,'GLB >300KB');
gate(createHash('sha256').update(bytes).digest('hex')===cat.sha256,'Catalog SHA256 differs');
const sourceNodes=Object.fromEntries(src.getRoot().listNodes().map(n=>[n.getName(),n]));
let bindDelta=0,parentMatches=true;
for(const n of dst.getRoot().listNodes()){
const o=sourceNodes[n.getName()];gate(!!o,`Unknown node ${n.getName()}`);if(!o)continue;
for(const p of ['Translation','Rotation','Scale'])bindDelta=Math.max(bindDelta,...n['get'+p]().map((v,i)=>Math.abs(v-o['get'+p]()[i])));
const p=n.getParentNode()?.getName()??null,q=o.getParentNode()?.getName()??null;parentMatches&&=p===q;
}
gate(bindDelta===0&&parentMatches,'v7 bind mismatch');
const ids=['snowplow_brake','landing','air_180','air_360','trick_landing','fall','get_up'];
gate(dst.getRoot().listAnimations().length===7&&ids.every(n=>dst.getRoot().listAnimations().some(a=>a.getName()===n)),'Expected seven clips');
const meshes=[];scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
const rest=Object.fromEntries(Object.entries(byName).map(([n,o])=>[n,{p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}]));
const reset=()=>{for(const[n,o]of Object.entries(byName)){o.position.copy(rest[n].p);o.quaternion.copy(rest[n].q);o.scale.copy(rest[n].s);}scene.updateMatrixWorld(true);};
const samplePose=()=>Object.fromEntries(dst.getRoot().listNodes().map(n=>{const o=byName[n.getName()];return[n.getName(),{p:o.position.toArray(),q:o.quaternion.toArray()}];}));
const posError=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function poseError(a,b){let p=0,q=0;for(const n of Object.keys(a)){p=Math.max(p,posError(a[n].p,b[n].p));q=Math.max(q,new T.Quaternion().fromArray(a[n].q).normalize().angleTo(new T.Quaternion().fromArray(b[n].q).normalize()));}return{positionMeters:r(p),orientationRadians:r(q)};}
function minimumGeometry(){
let body=Infinity,poles=Infinity;
for(const mesh of meshes){
const a=mesh.geometry.attributes,pp=a.position.array,ind=a.skinIndex?.array;
const mats=mesh.isSkinnedMesh?mesh.skeleton.bones.map((b,i)=>new T.Matrix4().copy(mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(b.matrixWorld).multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix).elements):[mesh.matrixWorld.elements];
for(let v=0;v<a.position.count;v++){
const x=pp[v*3],y=pp[v*3+1],z=pp[v*3+2];let out=0;
if(ind){for(let k=0;k<4;k++){const wt=a.skinWeight.getComponent(v,k);if(!wt)continue;const m=mats[ind[v*4+k]];out+=wt*(m[1]*x+m[5]*y+m[9]*z+m[13]);}body=Math.min(body,out);}
else{const m=mats[0];poles=Math.min(poles,m[1]*x+m[5]*y+m[9]*z+m[13]);}
}
}
return{body,poles};
}
const rows=[],ends={};let maxNorm=0,maxGrid=0;
for(const anim of dst.getRoot().listAnimations()){
const spec=cat.clips.find(c=>c.id===anim.getName()),tracks=[];
for(const c of anim.listChannels()){
const s=c.getSampler(),times=Array.from(s.getInput().getArray()),values=Array.from(s.getOutput().getArray()),prop=c.getTargetPath(),name=c.getTargetNode().getName();
gate(['rotation','translation'].includes(prop),'Bad channel path');
gate(s.getInterpolation()==='LINEAR','Bad interpolation');
if(times.length>1){gate(times.length===spec.samples,`${spec.id} sample count`);for(let i=0;i<times.length;i++)maxGrid=Math.max(maxGrid,Math.abs(times[i]-i/30));}
if(prop==='rotation')for(let i=0;i<values.length;i+=4)maxNorm=Math.max(maxNorm,Math.abs(Math.hypot(...values.slice(i,i+4))-1));
tracks.push(prop==='rotation'?new T.QuaternionKeyframeTrack(name+'.quaternion',times,values):new T.VectorKeyframeTrack(name+'.position',times,values));
}
reset();const mixer=new T.AnimationMixer(scene),clip=new T.AnimationClip(spec.id,spec.durationSeconds,tracks),action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
const stamp=t=>{action.paused=false;mixer.setTime(t);scene.updateMatrixWorld(true);};
const times=Array.from({length:Math.round(spec.durationSeconds*60)+1},(_,i)=>i/60);for(const c of spec.contacts)times.push(c.start,c.end);times.sort((a,b)=>a-b);
let minBody=Infinity,minPoles=Infinity,worstTime=0,yaw=0,lastYaw=null;
for(const t of times){
stamp(t);const m=minimumGeometry();if(m.body<minBody){minBody=m.body;worstTime=t;}minPoles=Math.min(minPoles,m.poles);
const v=new T.Vector3(0,0,1).applyQuaternion(byName.Root.quaternion),a=Math.atan2(v.x,v.z);if(lastYaw!==null)yaw+=Math.atan2(Math.sin(a-lastYaw),Math.cos(a-lastYaw));lastYaw=a;
}
let drift=0;
for(const c of spec.contacts){stamp(c.start);const first=new T.Vector3().fromArray(c.local).applyMatrix4(byName[c.bone].matrixWorld);for(const t of times.filter(t=>t>=c.start&&t<=c.end)){stamp(t);const v=new T.Vector3().fromArray(c.local).applyMatrix4(byName[c.bone].matrixWorld);drift=Math.max(drift,Math.hypot(v.x-first.x,v.z-first.z));}}
stamp(0);const start=samplePose();stamp(1/30);const next=samplePose();stamp(spec.durationSeconds-1/30);const prev=samplePose();stamp(spec.durationSeconds);const end=samplePose();ends[spec.id]={start,end};
const row={id:spec.id,samples60Hz:times.length,bodyMinY:r(minBody),poleMinY:r(minPoles),minimumAtSeconds:r(worstTime),contactDriftMeters:r(drift)};
gate(minBody>=-.001,`${spec.id}: actual weighted body floor ${r(minBody)}m at ${r(worstTime)}s`);gate(minPoles>=-.001,`${spec.id}: pole floor ${r(minPoles)}m`);gate(drift<.02,`${spec.id}: contact drift ${r(drift)}m`);
if(spec.id.startsWith('air_')){row.yawWindingDegrees=r(yaw*180/Math.PI);gate(Math.abs(yaw-(spec.id==='air_180'?Math.PI:2*Math.PI))<1e-5,`${spec.id}: winding`);}
if(spec.loop){row.loopC0=poseError(start,end);let linear=0,angular=0;for(const n of Object.keys(start)){linear=Math.max(linear,posError(next[n].p.map((v,i)=>(v-start[n].p[i])*30),end[n].p.map((v,i)=>(v-prev[n].p[i])*30)));const d=q=>new T.Quaternion().fromArray(q).normalize(),v1=d(start[n].q).invert().multiply(d(next[n].q)),v2=d(prev[n].q).invert().multiply(d(end[n].q));angular=Math.max(angular,v1.angleTo(v2)*30);}row.loopC1VelocityMismatch={linearMps:r(linear),angularRps:r(angular)};gate(row.loopC0.positionMeters<1e-7&&row.loopC0.orientationRadians<1e-6,'Loop C0 mismatch');gate(linear<.002&&angular<.01,`Loop sampled velocity mismatch ${r(linear)}m/s ${r(angular)}rad/s`);}
rows.push(row);mixer.stopAllAction();
}
const transition=poseError(ends.fall.end,ends.get_up.start);gate(transition.positionMeters<1e-7&&transition.orientationRadians<1e-6,'Fall/rise mismatch');gate(maxNorm<1e-6,'Quaternion norm');gate(maxGrid<2e-7,'30 Hz timestamps');
const report={schemaVersion:1,passed:!failures.length,method:'GLB with original v7 skin weights/inverse binds; every body/blade/boot/pole vertex at60Hz plus contacts. Three mixer; source read only.',limits:{minimumGeometryY:-.001,contactDriftMeters:.02,gridSeconds:2e-7,loopMps:.002,loopRps:.01},bytes:bytes.length,bindTRSDelta:bindDelta,parentsMatch:parentMatches,quaternionNormError:r(maxNorm),gridErrorSeconds:r(maxGrid),fallRecoveryError:transition,clips:rows,failures};
await fs.mkdir(path.join(dir,'verification'),{recursive:true});await fs.writeFile(path.join(dir,'verification/structure.json'),JSON.stringify(report)+'\n');console.log(JSON.stringify(report));if(failures.length)process.exitCode=1;
