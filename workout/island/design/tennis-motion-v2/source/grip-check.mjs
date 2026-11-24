// SPDX-License-Identifier: CC0-1.0
// Independent 120Hz checks on decoded output GLBs; no authoring IK is imported.
import './qa-register.mjs';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {parseGLB,sampleGLB,readAccessor}=await import('../vendor/motion-qa-v1/glb.mjs');
const base=new URL('../',import.meta.url),catalog=JSON.parse(await fs.readFile(new URL('catalog.json',base)));
const reference=parseGLB(await fs.readFile(new URL('source/reference/grip-player.glb',base)));
const SHA=b=>createHash('sha256').update(b).digest('hex');
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>Math.hypot(...a),distance=(a,b)=>norm(sub(a,b));
const unit=a=>a.map(v=>v/norm(a)),scale=(a,s)=>a.map(v=>v*s);
function qm(a,b){const[x,y,z,w]=a,[X,Y,Z,W]=b;return[w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];}
function rotate(q,v){const p=qm(qm(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]);return p.slice(0,3);}
const round=v=>Number(v.toFixed(9));
const HANDLE_CENTER=[0,-.055,.020],LEFT_SUPPORT_Y=.153,RADIUS=.0335;
const goldenMount=reference.json.nodes.find(n=>n.name==='racket_mount');
const goldenHead=reference.json.nodes.find(n=>n.name==='head');
const headLocal=add(goldenMount.translation,rotate(goldenMount.rotation,goldenHead.translation));
const transforms=n=>({translation:n.translation??[0,0,0],rotation:n.rotation??[0,0,0,1],scale:n.scale??[1,1,1]});
const limits={leftGripMeters:.002,rightWristDegrees:62,rootMeters:1e-6,rootRadians:1e-6,scale:1e-6,contactPositionMeters:1e-5,contactHeightGapMeters:.02,ballSurfaceMeters:1e-4};
const errors=[],clips=[],files=[];
function requireThat(condition,message){if(!condition)errors.push(message);}
function morphTrack(glb,animation){
 const index=glb.json.nodes.findIndex(n=>n.name==='grip_hand_L');
 const channel=animation.channels.find(c=>c.target.node===index&&c.target.path==='weights');
 if(!channel)throw new Error(`${animation.name}: missing left-hand opening morph`);
 const sampler=animation.samplers[channel.sampler],times=Array.from(readAccessor(glb,sampler.input)),values=Array.from(readAccessor(glb,sampler.output));
 return time=>{
  const cubic=sampler.interpolation==='CUBICSPLINE',row=(i,j=1)=>values[cubic?i*3+j:i];
  if(time<=times[0])return row(0);if(time>=times.at(-1))return row(times.length-1);
  let hi=1;while(time>times[hi])hi++;const lo=hi-1,h=times[hi]-times[lo],u=(time-times[lo])/h;
  if(sampler.interpolation==='STEP')return row(lo);
  if(!cubic)return row(lo)+(row(hi)-row(lo))*u;
  return (2*u**3-3*u**2+1)*row(lo)+(u**3-2*u**2+u)*h*row(lo,2)+(-2*u**3+3*u**2)*row(hi)+(u**3-u**2)*h*row(hi,0);
 };
}
function descendantIndices(nodes,index){const found=new Set([index]);for(const child of nodes[index].children??[])for(const i of descendantIndices(nodes,child))found.add(i);return found;}

for(const [height,entry]of Object.entries(catalog.variants)){
 const bytes=await fs.readFile(new URL(entry.asset,base)),glb=parseGLB(bytes),nodes=glb.json.nodes;
 const mountIndex=nodes.findIndex(n=>n.name==='racket_mount'),handIndex=nodes.findIndex(n=>n.name==='RightHand'),mount=nodes[mountIndex];
 const frozen=JSON.stringify(transforms(mount))===JSON.stringify(transforms(goldenMount))&&(nodes[handIndex].children??[]).includes(mountIndex);
 const equipment=descendantIndices(nodes,mountIndex);
 const staticEquipment=glb.json.animations.every(a=>a.channels.every(c=>!equipment.has(c.target.node)));
 const equipmentUnitScale=[...equipment].every(i=>(nodes[i].scale??[1,1,1]).every(v=>v===1));
 const frozenEquipmentTransforms=[...equipment].every(i=>{
  const n=nodes[i],j=reference.json.nodes.findIndex(o=>o.name===n.name),golden=reference.json.nodes[j];
  const parent=nodes.find(o=>(o.children??[]).includes(i))?.name,goldenParent=reference.json.nodes.find(o=>(o.children??[]).includes(j))?.name;
  return golden&&parent===goldenParent&&JSON.stringify(transforms(n))===JSON.stringify(transforms(golden));
 });
 requireThat(frozen&&staticEquipment&&equipmentUnitScale&&frozenEquipmentTransforms,`${height}: frozen rigid racket contract changed`);
 files.push({height,asset:entry.asset,sha256:SHA(bytes),animations:glb.json.animations.length,frozenMount:frozen,staticEquipment,equipmentUnitScale,frozenEquipmentTransforms});
 for(const animation of glb.json.animations){
  const definition=catalog.clips.find(c=>c.id===animation.name);
  requireThat(!!definition,`${height}/${animation.name}: absent from catalog`);if(!definition)continue;
  const contactTime=animation.extras?.contactTime??definition.contactTime,events=animation.extras?.metadata?.events??definition.metadata.events;
  const extraTimes=[...events.map(e=>e.time),...(contactTime===null?[]:[contactTime])];
  const decoded=sampleGLB(glb,{animation:animation.name,fps:120,extraTimes}),openAt=morphTrack(glb,animation);
  let maxLeftGripError=0,maxLeftGripTime=0,maxRightWristBend=0,maxRightWristTime=0,maxRoot=0,maxRootRotation=0,maxRacketScaleError=0,minHeadY=Infinity,heldSamples=0,openSamples=0,contactHeight=null,contactPositionError=null,ballSurfaceError=null,ballTangentialError=null;
  for(const frame of decoded.frames){
   const rh=frame.joints.RightHand,rq=frame.rotations.RightHand,racketQ=qm(rq,mount.rotation??[0,0,0,1]),racketRoot=add(rh,rotate(rq,mount.translation??[0,0,0]));
   const sweet=add(rh,rotate(rq,headLocal));minHeadY=Math.min(minHeadY,sweet[1]);
   const forearm=unit(sub(rh,frame.joints.RightForeArm)),palm=unit(rotate(rq,[0,-1,0]));
   const wristBend=Math.acos(Math.max(-1,Math.min(1,dot(forearm,palm))))*180/Math.PI;
   if(wristBend>maxRightWristBend){maxRightWristBend=wristBend;maxRightWristTime=frame.t;}
   maxRoot=Math.max(maxRoot,norm(frame.root));maxRootRotation=Math.max(maxRootRotation,2*Math.acos(Math.min(1,Math.abs(frame.rotations.Root[3]))));
   maxRacketScaleError=Math.max(maxRacketScaleError,distance(frame.scales.RightHand,[1,1,1]));
   if(openAt(frame.t)<=1e-6){
    const actual=add(frame.joints.LeftHand,rotate(frame.rotations.LeftHand,HANDLE_CENTER)),expected=add(racketRoot,rotate(racketQ,[0,LEFT_SUPPORT_Y,0]));
    const gripError=distance(actual,expected);if(gripError>maxLeftGripError){maxLeftGripError=gripError;maxLeftGripTime=frame.t;}heldSamples++;
   }else openSamples++;
   if(contactTime!==null&&Math.abs(frame.t-contactTime)<1e-7){
    contactHeight=sweet[1];
    const declared=(definition.contactHeightVariants??definition.metadata.contactHeights??[]).find(c=>c.height===height);
    if(declared)contactPositionError=distance(sweet,declared.contactPoint);
    else requireThat(false,`${height}/${animation.name}: missing declared contact-height point`);
    const normal=rotate(racketQ,[0,0,1]),delta=sub(frame.ball,sweet),normalDistance=dot(delta,normal);
    ballSurfaceError=Math.abs(normalDistance-RADIUS);ballTangentialError=norm(sub(delta,scale(normal,normalDistance)));
   }
  }
  const twoHandedApplicable=animation.name==='backhand_two_handed',twoHandedCoverage=!twoHandedApplicable||heldSamples===decoded.frames.length;
  const pass=frozen&&staticEquipment&&equipmentUnitScale&&frozenEquipmentTransforms&&twoHandedCoverage&&maxLeftGripError<limits.leftGripMeters&&maxRightWristBend<limits.rightWristDegrees&&maxRoot<limits.rootMeters&&maxRootRotation<limits.rootRadians&&maxRacketScaleError<limits.scale&&(contactTime===null||(contactHeight!==null&&contactPositionError!==null&&contactPositionError<limits.contactPositionMeters&&ballSurfaceError<limits.ballSurfaceMeters&&ballTangentialError<limits.ballSurfaceMeters));
  const result={height,id:animation.name,asset:entry.asset,samples:decoded.frames.length,leftSupportApplicable:heldSamples>0,heldSamples,openSamples,twoHandedCoverage,maxLeftGripErrorMeters:round(maxLeftGripError),maxLeftGripTimeSeconds:round(maxLeftGripTime),maxRightWristBendDegrees:round(maxRightWristBend),maxRightWristTimeSeconds:round(maxRightWristTime),maxRootMeters:round(maxRoot),maxRootRotationRadians:round(maxRootRotation),maxRacketScaleError:round(maxRacketScaleError),minimumHeadHeightMeters:round(minHeadY),actualContactHeightMeters:contactHeight===null?null:round(contactHeight),contactPositionErrorMeters:contactPositionError===null?null:round(contactPositionError),ballSurfaceErrorMeters:ballSurfaceError===null?null:round(ballSurfaceError),ballTangentialErrorMeters:ballTangentialError===null?null:round(ballTangentialError),pass};
  clips.push(result);requireThat(pass,`${height}/${animation.name}: grip, wrist, root, scale or contact check failed`);
 }
}
const heightOrdering=[];
for(const definition of catalog.clips.filter(c=>c.contactTime!==null)){
 const y=Object.fromEntries(['low','medium','high'].map(height=>[height,clips.find(c=>c.height===height&&c.id===definition.id)?.actualContactHeightMeters]));
 const pass=Object.values(y).every(Number.isFinite)&&y.medium-y.low>limits.contactHeightGapMeters&&y.high-y.medium>limits.contactHeightGapMeters;
 heightOrdering.push({id:definition.id,heightMeters:y,pass});requireThat(pass,`${definition.id}: low/medium/high contact heights not ordered by at least 2cm`);
}
const report={schemaVersion:1,reader:'Unchanged motion-qa-v1 GLB reader',measurementRate:120,geometryDecoded:false,physicalAnimationStreams:clips.length,expectedStreams:catalog.clips.length*Object.keys(catalog.variants).length,limits,referenceContract:{source:'tennis-grip-v1@a096e507b11389fc10272c38101f968820e89f7e',handleCenterInHand:HANDLE_CENTER,leftSupportY:LEFT_SUPPORT_Y,headLocalInRightHand:headLocal},files,clips,heightOrdering,errors,pass:errors.length===0};
requireThat(report.physicalAnimationStreams===report.expectedStreams,'Unexpected physical animation stream count');
report.pass=errors.length===0;
await fs.writeFile(new URL('verification/grip.json',base),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({streams:clips.length,maximumLeftGripErrorMeters:Math.max(...clips.map(c=>c.maxLeftGripErrorMeters)),maximumRightWristBendDegrees:Math.max(...clips.map(c=>c.maxRightWristBendDegrees)),failed:clips.filter(c=>!c.pass),heightOrderingPass:heightOrdering.every(c=>c.pass),pass:report.pass},null,2));
if(!report.pass)process.exitCode=1;
