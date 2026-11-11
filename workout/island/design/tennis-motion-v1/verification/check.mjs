/** Original tennis asset verification, CC0-1.0. No dependency on authoring FK/IK. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const pack = path.resolve(here, '..');
const repo = path.resolve(pack, '../../../..');
const FPS = 30;
const EPS = 2e-5;
const sum = (a,b)=>a.map((x,i)=>x+b[i]);
const dif = (a,b)=>a.map((x,i)=>x-b[i]);
const mul = (a,k)=>a.map(x=>x*k);
const norm = a=>Math.hypot(...a);
const distance = (a,b)=>norm(dif(a,b));
const lerp = (a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
const dot = (a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const qmul = (a,b)=>[
 a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
 a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
 a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
 a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
];
const rotate = (q,v)=>qmul(qmul(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]).slice(0,3);
export function slerp(a,b,t) {
 let c=dot(a,b), target=b;
 if(c<0){c=-c;target=mul(b,-1);}
 if(c>.9995){const q=lerp(a,target,t);return mul(q,1/norm(q));}
 const theta=Math.acos(Math.min(1,c)), s=Math.sin(theta);
 return a.map((v,i)=>(v*Math.sin((1-t)*theta)+target[i]*Math.sin(t*theta))/s);
}
export function sample(clip,seconds) {
 const frames=clip.keyframes;
 const frame=Math.max(0,Math.min(frames.length-1,seconds*FPS));
 const i=Math.min(frames.length-2,Math.floor(frame)), alpha=frame-i;
 const a=frames[i],b=frames[i+1];
 return {rotations:Object.fromEntries(Object.keys(a.rotations).map(n=>[n,slerp(a.rotations[n],b.rotations[n],alpha)])),
 hipsOffsetMeters:lerp(a.hipsOffsetMeters,b.hipsOffsetMeters,alpha),
 referenceRootTranslationMeters:lerp(a.referenceRootTranslationMeters,b.referenceRootTranslationMeters,alpha)};
}
export function forward(skeleton,pose) {
 const world={};
 for(const bone of skeleton.bones){
  const parent=bone.parent?world[bone.parent]:null;
  let p=bone.restTranslationMeters;
  if(bone.name==='Root')p=sum(p,pose.referenceRootTranslationMeters);
  if(bone.name==='Hips')p=sum(p,pose.hipsOffsetMeters);
  const q=pose.rotations[bone.name];
  world[bone.name]={position:parent?sum(parent.position,rotate(parent.rotation,p)):[...p],rotation:parent?qmul(parent.rotation,q):q};
 }
 world.Racket=world.RightHand;
 world.RacketHead={position:sum(world.RightHand.position,rotate(world.RightHand.rotation,[0,.50,0])),rotation:world.RightHand.rotation};
 return world;
}
export function point(world,node,local=[0,0,0]) {
 if(!world[node])throw new Error(`Unknown event/plant node: ${node}`);
 return sum(world[node].position,rotate(world[node].rotation,local));
}
export function parseGlb(bytes){
 if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB header');
 let offset=12,json,bin;
 while(offset<bytes.length){const len=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);offset+=8;
  if(offset+len>bytes.length||len%4)throw new Error('Invalid GLB chunk bounds');
  const data=bytes.subarray(offset,offset+len);if(type===0x4e4f534a)json=JSON.parse(data.toString('utf8').trim());if(type===0x004e4942)bin=data;offset+=len;
 }
 if(!json||!bin)throw new Error('GLB requires JSON and BIN chunks');return {json,bin};
}
function accessor(glb,index){
 const a=glb.json.accessors[index],v=glb.json.bufferViews[a.bufferView];
 const n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];
 const reads={5126:['readFloatLE',4],5125:['readUInt32LE',4],5123:['readUInt16LE',2],5121:['readUInt8',1]};
 const [read,size]=reads[a.componentType]||[];if(!read)throw new Error(`Unsupported accessor component ${a.componentType}`);
 const out=[];for(let i=0;i<a.count;i++){const row=[];for(let c=0;c<n;c++)row.push(glb.bin[read]((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n*size)+c*size));out.push(row);}return out;
}
function decodePng(data){
 if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Invalid PNG signature');
 let offset=8,width,height,depth,type,interlace,ended=false;const idats=[];
 while(offset<data.length){
  if(offset+12>data.length)throw new Error('Truncated PNG chunk');
  const size=data.readUInt32BE(offset),tag=data.toString('ascii',offset+4,offset+8),end=offset+12+size;
  if(end>data.length)throw new Error('PNG chunk exceeds file');
  const bytes=data.subarray(offset+4,offset+8+size);let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  if(((crc^0xffffffff)>>>0)!==data.readUInt32BE(offset+8+size))throw new Error('PNG chunk CRC mismatch');
  if(tag==='IHDR'){width=data.readUInt32BE(offset+8);height=data.readUInt32BE(offset+12);depth=data[offset+16];type=data[offset+17];interlace=data[offset+20];}
  if(tag==='IDAT')idats.push(data.subarray(offset+8,offset+8+size));if(tag==='IEND')ended=true;
  offset=end;
 }
 if(!width||!height||!ended||!idats.length)throw new Error('Incomplete PNG image');
 if(interlace!==0)throw new Error('Coverage decoder expects non-interlaced screenshot PNG');
 const channels={0:1,2:3,3:1,4:2,6:4}[type];if(!channels)throw new Error('Unknown PNG color type');
 const rowBytes=Math.ceil(width*channels*depth/8),pixels=inflateSync(Buffer.concat(idats));
 if(pixels.length!==(rowBytes+1)*height)throw new Error('PNG decompressed size mismatch');
 for(let row=0;row<height;row++)if(pixels[row*(rowBytes+1)]>4)throw new Error('Invalid PNG scanline filter');
 return {width,height};
}
async function walk(dir){let out=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const name=path.join(dir,entry.name);out.push(...(entry.isDirectory()?await walk(name):[name]));}return out.sort();}
const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const finiteArray=(a,length)=>Array.isArray(a)&&a.length===length&&a.every(Number.isFinite);
const rounded=n=>Number(n.toFixed(8));

export async function verify({write=true}={}) {
 const failures=[];
 const requireThat=(truth,message)=>{if(!truth)failures.push(message);};
 const catalog=await readJson(path.join(pack,'runtime/catalog.json'));
 const motions=await readJson(path.join(pack,'runtime/motions.json'));
 const canonical=await readJson(path.resolve(pack,'../motion2/hoops.json'));
 const skeleton=motions.skeleton;
 requireThat(JSON.stringify(skeleton.bones)===JSON.stringify(canonical.skeleton.bones),'Canonical 18-bone names, parents and rest translations differ');
 requireThat(skeleton.bones.length===18,'Expected exactly 18 canonical bones');
 requireThat(catalog.fps===FPS,'Catalog must declare 30Hz');
 requireThat(catalog.clips.length>=40&&catalog.clips.length<=50,'Clip count must be 40–50');
 const ids=catalog.clips.map(c=>c.id);requireThat(new Set(ids).size===ids.length,'Duplicate catalog clip ids');
 requireThat(Object.keys(motions.states).length===ids.length,'Motion state count differs from catalog');
 const validatorModule=process.env.GLTF_VALIDATOR_MODULE||'/tmp/tennis-tools/node_modules/gltf-validator/index.js';
 const imported=await import(pathToFileURL(validatorModule));const validator=imported.default||imported;
 const metrics=[],validation=[];
 for(const entry of catalog.clips){
  const id=entry.id, clip=motions.states[id];if(!clip){failures.push(`${id}: no motion state`);continue;}
  const frames=clip.keyframes, expected=clip.durationSeconds*FPS;
  requireThat(Math.abs(expected-Math.round(expected))<EPS,`${id}: duration not on 30Hz grid`);
  requireThat(frames.length===Math.round(expected)+1,`${id}: wrong frame count`);
  requireThat(Math.abs(entry.durationSeconds-clip.durationSeconds)<EPS,`${id}: catalog duration mismatch`);
  let quatError=0,boneError=0,groundMin=Infinity,rootMaxSpeed=0,rootMaxAcceleration=0,rootMaxHeight=0;
  for(let fi=0;fi<frames.length;fi++){
   const f=frames[fi];requireThat(Math.abs(f.time-fi/(frames.length-1))<EPS,`${id}: frame ${fi} wrong normalized time`);
   requireThat(finiteArray(f.hipsOffsetMeters,3)&&finiteArray(f.referenceRootTranslationMeters,3),`${id}: frame ${fi} non-finite translation`);
   requireThat(Object.keys(f.rotations).length===18,`${id}: frame ${fi} rotation count`);
   for(const bone of skeleton.bones){const q=f.rotations[bone.name];if(!finiteArray(q,4)){failures.push(`${id}: invalid rotation ${fi} ${bone.name}`);continue;}quatError=Math.max(quatError,Math.abs(norm(q)-1));}
   rootMaxHeight=Math.max(rootMaxHeight,Math.abs(f.referenceRootTranslationMeters[1]));
   if(fi>0)rootMaxSpeed=Math.max(rootMaxSpeed,distance(f.referenceRootTranslationMeters,frames[fi-1].referenceRootTranslationMeters)*FPS);
   if(fi>1){const v1=dif(f.referenceRootTranslationMeters,frames[fi-1].referenceRootTranslationMeters),v0=dif(frames[fi-1].referenceRootTranslationMeters,frames[fi-2].referenceRootTranslationMeters);rootMaxAcceleration=Math.max(rootMaxAcceleration,norm(dif(v1,v0))*FPS*FPS);}
   const w=forward(skeleton,f);for(const bone of skeleton.bones){if(!bone.parent||bone.name==='Hips')continue;boneError=Math.max(boneError,Math.abs(distance(w[bone.name].position,w[bone.parent].position)-norm(bone.restTranslationMeters)));}
   for(const foot of ['LeftFoot','RightFoot'])groundMin=Math.min(groundMin,point(w,foot,[0,-.08,0])[1]);
  }
  requireThat(quatError<2e-5,`${id}: quaternion norm error ${quatError}`);
  requireThat(boneError<2e-5,`${id}: FK bone length error ${boneError}`);
  requireThat(rootMaxHeight<EPS,`${id}: locomotion root leaves ground plane`);
  requireThat(rootMaxSpeed<=6,`${id}: root has frame displacement exceeding 6m/s`);
  let loopClosure=null;
  if(clip.loop){
   const initial=forward(skeleton,frames[0]),lastPose={...frames.at(-1),referenceRootTranslationMeters:frames[0].referenceRootTranslationMeters},last=forward(skeleton,lastPose);
   let position=0,angle=0;for(const name of Object.keys(initial)){position=Math.max(position,distance(initial[name].position,last[name].position));angle=Math.max(angle,2*Math.acos(Math.min(1,Math.abs(dot(initial[name].rotation,last[name].rotation)))));}
   loopClosure={positionMeters:rounded(position),quaternionAngleRadians:rounded(angle)};
   requireThat(position<=.02&&angle<=.035,`${id}: loop seam pose mismatch ${position}m/${angle}rad`);
  }
  const plants=[];
  for(const plant of clip.footPlants||[]){
   requireThat(Number.isInteger(plant.startFrame)&&Number.isInteger(plant.endFrame)&&plant.endFrame>plant.startFrame,`${id}: invalid plant window`);
   requireThat(plant.startFrame>=0&&plant.endFrame<frames.length,`${id}: plant outside clip`);
   const local=plant.localPointMeters||[0,-.08,0];
   const anchor=plant.anchorWorldMeters||point(forward(skeleton,frames[plant.startFrame]),plant.bone,local);
   let slip=0,height=0,samples=0;
   for(let fi=plant.startFrame;fi<=plant.endFrame;fi+=.25){const p=point(forward(skeleton,sample(clip,fi/FPS)),plant.bone,local);slip=Math.max(slip,distance(anchor,p));height=Math.max(height,Math.abs(p[1]));samples++;}
   plants.push({bone:plant.bone,startFrame:plant.startFrame,endFrame:plant.endFrame,samples,maxSlipMeters:rounded(slip),maxSoleHeightMeters:rounded(height)});
   requireThat(slip<=.020001,`${id}: ${plant.bone} plant slips ${slip.toFixed(6)}m`);
   requireThat(height<=.020001,`${id}: ${plant.bone} plant height ${height.toFixed(6)}m`);
  }
  const events=[];
  for(const e of clip.events||entry.events||[]){
   requireThat(Number.isInteger(e.frame)&&e.frame>=0&&e.frame<frames.length,`${id}: invalid event frame`);
   requireThat(Math.abs(e.atSeconds-e.frame/FPS)<EPS,`${id}: event seconds disagree with frame`);
   if(!e.node)continue;
   const actual=point(forward(skeleton,frames[e.frame]),e.node,e.localPointMeters||[0,0,0]);
   const contactError=e.worldPointMeters?distance(actual,e.worldPointMeters):null;
   requireThat(contactError!==null&&contactError<.0001,`${id}: ${e.name} world point missing or inconsistent`);
   const out={name:e.name,frame:e.frame,atSeconds:e.atSeconds,node:e.node,worldPointMeters:actual.map(rounded),pointErrorMeters:rounded(contactError||0)};
   if(e.name==='racket_contact'){
    requireThat(e.frame>0&&e.frame<frames.length-1,`${id}: contact must allow central difference`);
    const position=t=>point(forward(skeleton,sample(clip,t)),'RacketHead');
    const t=e.frame/FPS;
    const speed=distance(position(t+1/FPS),position(t-1/FPS))*FPS/2;
    const dt=1/(FPS*100);const speedSubframe=distance(position(t+dt),position(t-dt))/(2*dt);
    out.racketHeadSpeedMps=rounded(speed);out.slerpDerivativeSpeedMps=rounded(speedSubframe);
    const contactWorld=forward(skeleton,frames[e.frame]),normal=rotate(contactWorld.RacketHead.rotation,[0,0,1]),velocity=dif(position(t+1/FPS),position(t-1/FPS));
    out.faceNormalVelocityAlignment=rounded(Math.abs(dot(normal,velocity))/(norm(normal)*norm(velocity)||1));
    const subframeVelocity=dif(position(t+dt),position(t-dt));
    out.faceNormalSlerpVelocityAlignment=rounded(Math.abs(dot(normal,subframeVelocity))/(norm(normal)*norm(subframeVelocity)||1));
    const sweepStart=Math.max(0,t-.30),sweepEnd=Math.min(clip.durationSeconds,t+.30),step=1/120;
    let sweep=0,previous=position(sweepStart);
    for(let at=sweepStart+step;at<sweepEnd;at+=step){const p=position(at);sweep+=distance(previous,p);previous=p;}
    sweep+=distance(previous,position(sweepEnd));
    out.contactSwingPathMeters=rounded(sweep);out.contactSwingWindowSeconds=[rounded(sweepStart),rounded(sweepEnd)];
    const band=entry.speedBandMps||clip.speedBandMps;
    requireThat(finiteArray(band,2),`${id}: missing realistic contact speed band`);
    if(band){
     requireThat(speed>=band[0]&&speed<=band[1],`${id}: contact speed ${speed.toFixed(3)}m/s outside ${band.join('–')}`);
     requireThat(speedSubframe>=band[0]&&speedSubframe<=band[1],`${id}: SLERP contact speed ${speedSubframe.toFixed(3)}m/s outside ${band.join('–')}`);
    }
   }
   if(e.name==='racket_ground_contact'){
    out.groundHeightMeters=rounded(actual[1]);requireThat(Math.abs(actual[1])<=.020001,`${id}: racket ground-contact point height ${actual[1]}m`);
   }
   events.push(out);
  }
  const file=path.resolve(pack,'runtime',entry.file);requireThat(file.startsWith(path.join(pack,'runtime')+path.sep),`${id}: file escapes runtime`);
  const bytes=await fs.readFile(file), glb=parseGlb(bytes),j=glb.json;
  requireThat(!(j.extensionsUsed||[]).some(x=>/draco|meshopt/i.test(x)),`${id}: runtime GLB compressed with unsupported decoder`);
  requireThat(!JSON.stringify(j).includes('.wasm'),`${id}: runtime GLB references WASM`);
  const names=new Map(j.nodes.map((n,i)=>[n.name,i]));
  const right=names.get('RightHand'),racket=names.get('Racket'),head=names.get('RacketHead');
  requireThat(j.nodes[right]?.children?.includes(racket),`${id}: racket detached from RightHand`);
  requireThat(j.nodes[racket]?.children?.includes(head),`${id}: RacketHead not child of Racket`);
  requireThat(distance(j.nodes[head]?.translation||[0,0,0],[0,.50,0])<EPS,`${id}: incorrect RacketHead offset`);
  requireThat((j.skins||[]).some(s=>s.joints.length===18),`${id}: no 18-joint skin`);
  for(const bone of skeleton.bones){
   const index=names.get(bone.name), node=j.nodes[index];
   requireThat(Boolean(node),`${id}: missing GLB bone ${bone.name}`);
   if(bone.parent)requireThat(j.nodes[names.get(bone.parent)]?.children?.includes(index),`${id}: incorrect GLB parent ${bone.name}`);
   if(node)requireThat(distance(node.translation||[0,0,0],bone.restTranslationMeters)<EPS,`${id}: GLB rest translation ${bone.name}`);
  }
  const anim=j.animations?.find(a=>a.name===id)||j.animations?.[0];requireThat(Boolean(anim),`${id}: no GLB animation`);
  if(anim){
   const channelKeys=new Set(anim.channels.map(c=>j.nodes[c.target.node].name+':'+c.target.path));
   for(const bone of skeleton.bones)requireThat(channelKeys.has(bone.name+':rotation'),`${id}: GLB lacks animated rotation ${bone.name}`);
   for(const name of ['Root','Hips'])requireThat(channelKeys.has(name+':translation'),`${id}: GLB lacks translation ${name}`);
  }
  let glbError=0,timeError=0;
  if(anim)for(const channel of anim.channels){
   const sampler=anim.samplers[channel.sampler];const times=accessor(glb,sampler.input).flat();const values=accessor(glb,sampler.output);
   requireThat(values.length===frames.length,`${id}: GLB channel frame count`);
   requireThat(sampler.interpolation===undefined||sampler.interpolation==='LINEAR',`${id}: expected LINEAR interpolation`);
   const name=j.nodes[channel.target.node].name;
   for(let fi=0;fi<Math.min(values.length,frames.length);fi++){
    timeError=Math.max(timeError,Math.abs(times[fi]-fi/FPS));
    let expectedValue;
    if(channel.target.path==='rotation')expectedValue=frames[fi].rotations[name];
    else if(channel.target.path==='translation'&&name==='Root')expectedValue=sum(skeleton.bones.find(b=>b.name===name).restTranslationMeters,frames[fi].referenceRootTranslationMeters);
    else if(channel.target.path==='translation'&&name==='Hips')expectedValue=sum(skeleton.bones.find(b=>b.name===name).restTranslationMeters,frames[fi].hipsOffsetMeters);
    if(expectedValue)glbError=Math.max(glbError,...values[fi].map((v,k)=>Math.abs(v-expectedValue[k])));
   }
  }
  requireThat(glbError<EPS&&timeError<EPS,`${id}: GLB differs from authored JSON (${glbError}, ${timeError})`);
  const result=await validator.validateBytes(new Uint8Array(bytes),{uri:entry.file,maxIssues:100});
  requireThat(result.issues.numErrors===0,`${id}: glTF validator ${result.issues.numErrors} errors`);
  validation.push({id,file:entry.file,bytes:bytes.length,errors:result.issues.numErrors,warnings:result.issues.numWarnings,infos:result.issues.numInfos,messages:result.issues.messages});
  metrics.push({id,durationSeconds:clip.durationSeconds,frames:frames.length,rootMaxSpeedMps:rounded(rootMaxSpeed),rootMaxAccelerationMps2:rounded(rootMaxAcceleration),rootMaxVerticalMeters:rounded(rootMaxHeight),loopClosure,footPlantCount:plants.length,maxPlantSlipMeters:rounded(Math.max(0,...plants.map(p=>p.maxSlipMeters))),maxQuaternionNormError:rounded(quatError),maxBoneLengthErrorMeters:rounded(boneError),minSoleHeightMeters:rounded(groundMin),maxGlbValueError:rounded(glbError),maxGlbTimeError:rounded(timeError),plants,events});
 }
 const compactSwingComparisons=[];
 for(const long of metrics.filter(c=>c.id.endsWith('_long'))){
  const short=metrics.find(c=>c.id===long.id.replace(/_long$/,'_short'));if(!short)continue;
  const longPath=long.events.find(e=>e.name==='racket_contact')?.contactSwingPathMeters,shortPath=short.events.find(e=>e.name==='racket_contact')?.contactSwingPathMeters;
  if(longPath!==undefined&&shortPath!==undefined){
   compactSwingComparisons.push({longClip:long.id,shortClip:short.id,longPathMeters:longPath,shortPathMeters:shortPath,shortToLongRatio:rounded(shortPath/longPath)});
   requireThat(shortPath<longPath,`${short.id}: compact swing path ${shortPath}m is not shorter than long ${longPath}m`);
  }
 }
 const result={pass:failures.length===0,fps:FPS,clipCount:metrics.length,plantSamplingHz:120,contactSpeedMethod:'World-space RacketHead central difference at contact frame ±1/30 s; additional ±1/3000 s SLERP derivative diagnostic.',maxPlantSlipMeters:rounded(Math.max(0,...metrics.map(m=>m.maxPlantSlipMeters))),failures,compactSwingComparisons,clips:metrics};
 if(write){await fs.writeFile(path.join(here,'metrics.json'),JSON.stringify(result,null,2)+'\n');await fs.writeFile(path.join(here,'validator.json'),JSON.stringify({pass:validation.every(v=>v.errors===0),validatorVersion:validator.version(),files:validation},null,2)+'\n');}
 return result;
}
export async function verifyTransitions({write=true}={}) {
 const motions=await readJson(path.join(pack,'runtime/motions.json'));
 const {transitionFrame}=await import(pathToFileURL(path.join(pack,'runtime/player.mjs')));
 const skeleton=motions.skeleton,states=motions.states,failures=[],cases=[];
 const duration=.3,epsilon=1/300,runs=['run_forward','run_left','run_right','run_backward'],shots=['forehand_flat_long','backhand_topspin_short'];
 const stages=runs.flatMap(source=>shots.flatMap(target=>[.15,.40,.65].map(sourceTime=>({source,target,sourceTime})))).concat(shots.flatMap(source=>runs.map(target=>({source,target,sourceTime:1.50}))));
 const nodes=skeleton.bones.map(b=>b.name).concat('RacketHead');
 for(const stage of stages){
  const source=states[stage.source],target=states[stage.target],st=stage.sourceTime;
  const output=t=>transitionFrame(skeleton,source,target,st,t,duration);
  const start=sample(source,st),actual0=output(0),actualEnd=output(duration),targetEnd=sample(target,duration);
  const offset=dif(actualEnd.referenceRootTranslationMeters,targetEnd.referenceRootTranslationMeters);
  const alignedTarget=t=>{const p=sample(target,t);p.referenceRootTranslationMeters=sum(p.referenceRootTranslationMeters,offset);return p;};
  const wstart=forward(skeleton,start),w0=forward(skeleton,actual0),wend=forward(skeleton,actualEnd),wdst=forward(skeleton,alignedTarget(duration));
  let startPosition=0,endPosition=0,startVelocity=0,endVelocity=0,startAddedVelocity=0,endAddedVelocity=0,slip=0;
  const before=forward(skeleton,sample(source,st-epsilon)),after=forward(skeleton,output(epsilon)),sourceAfter=forward(skeleton,sample(source,st+epsilon));
  const beforeEnd=forward(skeleton,output(duration-epsilon)),afterEnd=forward(skeleton,alignedTarget(duration+epsilon)),nativeBeforeEnd=forward(skeleton,alignedTarget(duration-epsilon));
  const velocity=(a,b,node)=>mul(dif(b[node].position,a[node].position),1/epsilon);
  for(const node of nodes){
   startPosition=Math.max(startPosition,distance(wstart[node].position,w0[node].position));
   endPosition=Math.max(endPosition,distance(wend[node].position,wdst[node].position));
   startVelocity=Math.max(startVelocity,distance(velocity(before,wstart,node),velocity(w0,after,node)));
   endVelocity=Math.max(endVelocity,distance(velocity(beforeEnd,wend,node),velocity(wdst,afterEnd,node)));
   startAddedVelocity=Math.max(startAddedVelocity,distance(velocity(wstart,sourceAfter,node),velocity(w0,after,node)));
   endAddedVelocity=Math.max(endAddedVelocity,distance(velocity(beforeEnd,wend,node),velocity(nativeBeforeEnd,wdst,node)));
  }
  const rootStart=distance(velocity(before,wstart,'Root'),velocity(w0,after,'Root'));
  const rootEnd=distance(velocity(beforeEnd,wend,'Root'),velocity(wdst,afterEnd,'Root'));
  const active=(source.footPlants||[]).filter(p=>st*FPS>=p.startFrame&&st*FPS<=p.endFrame);
  for(const plant of active){const anchor=point(wstart,plant.bone,plant.localPointMeters);
   const holdUntil=Math.min(duration*.55,Math.max(0,plant.endFrame/FPS-st));for(let t=0;t<=holdUntil+1e-9;t+=1/120)slip=Math.max(slip,distance(anchor,point(forward(skeleton,output(t)),plant.bone,plant.localPointMeters)));
   slip=Math.max(slip,distance(anchor,point(forward(skeleton,output(holdUntil)),plant.bone,plant.localPointMeters)));
  }
  const result={...stage,blendSeconds:duration,finiteDifferenceSeconds:epsilon,startPositionDiscontinuityMeters:rounded(startPosition),endPositionDiscontinuityMeters:rounded(endPosition),startRootVelocityChangeMps:rounded(rootStart),endRootVelocityChangeMps:rounded(rootEnd),startMaxJointVelocityChangeMps:rounded(startVelocity),endMaxJointVelocityChangeMps:rounded(endVelocity),startTransitionAddedJointVelocityMps:rounded(startAddedVelocity),endTransitionAddedJointVelocityMps:rounded(endAddedVelocity),carriedPlantCount:active.length,maxCarriedPlantSlipMeters:rounded(slip)};
  if(startPosition>.001||endPosition>.001)failures.push(`${stage.source}->${stage.target}@${st}: joint position discontinuity ${startPosition}/${endPosition}m`);
  if(rootStart>.10||rootEnd>.10)failures.push(`${stage.source}->${stage.target}@${st}: root velocity change ${rootStart}/${rootEnd}m/s`);
  if(startAddedVelocity>.75||endAddedVelocity>.75)failures.push(`${stage.source}->${stage.target}@${st}: transition-added joint velocity change ${startAddedVelocity}/${endAddedVelocity}m/s`);
  if(slip>.020001)failures.push(`${stage.source}->${stage.target}@${st}: carried plant slip ${slip}m`);
  cases.push(result);
 }
 const result={pass:failures.length===0,method:'Production transitionFrame output measured with independent FK. Entry from three phases of forward, left, right and backward runs, with forehand/backhand and reverse strike-to-run handoffs; destination continuation root offset aligned at blend end. Plant anchors sampled at 120Hz until earlier of authored release or 55% of blend. Raw one-sided velocity changes include native 30Hz keyframe corners; added velocity compares transition interval to native same-side interval.',thresholds:{jointPositionDiscontinuityMeters:.001,rootVelocityChangeMps:.10,maxTransitionAddedJointVelocityMps:.75,carriedPlantSlipMeters:.02},failures,cases};
 if(write)await fs.writeFile(path.join(here,'transitions.json'),JSON.stringify(result,null,2)+'\n');
 return result;
}
export async function loadFiles({write=true}={}){
 const all=await walk(pack), files=[],failures=[];
 for(const file of all){const relative=path.relative(pack,file);if(relative==='verification/files.json')continue;
  const data=await fs.readFile(file);let kind='utf8';
  try{if(file.endsWith('.glb')){parseGlb(data);kind='glb';}else if(file.endsWith('.json')){JSON.parse(data.toString('utf8'));kind='json';}else if(file.endsWith('.png')){decodePng(data);kind='png';}else{new TextDecoder('utf-8',{fatal:true}).decode(data);if(!data.length)throw new Error('Empty file');if(file.endsWith('.mjs')||file.endsWith('.js')){const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(checked.status!==0)throw new Error(checked.stderr||'JavaScript syntax check failed');kind='javascript';}}}
  catch(error){failures.push(`${relative}: ${error.message}`);}
  files.push({path:relative,kind,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
 }
 const result={pass:failures.length===0,coverage:'Every current pack file is read and decoded by format, including a JSON parse of this output after writing. Only its self-referential SHA-256 is omitted.',fileCount:files.length+1,hashedFileCount:files.length,readBackSelfValidated:false,failures,files};
 if(write){
  const self=path.join(here,'files.json');
  await fs.writeFile(self,JSON.stringify(result,null,2)+'\n');
  JSON.parse(await fs.readFile(self,'utf8'));result.readBackSelfValidated=true;
  await fs.writeFile(self,JSON.stringify(result,null,2)+'\n');
  const parsed=JSON.parse(await fs.readFile(self,'utf8'));
  if(parsed.fileCount!==result.fileCount||parsed.readBackSelfValidated!==true)throw new Error('File coverage self-readback failed');
 }
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=process.argv.includes('--files-only')?await loadFiles():process.argv.includes('--transitions')?await verifyTransitions():await verify();console.log(JSON.stringify({pass:result.pass,clipCount:result.clipCount,fileCount:result.fileCount,maxPlantSlipMeters:result.maxPlantSlipMeters,failures:result.failures},null,2));if(!result.pass)process.exitCode=1;}catch(error){console.error(error.stack);process.exitCode=1;}
}
