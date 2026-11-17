#!/usr/bin/env node
/**
 * Local motion-qa-v1, authored for this delivery. This is NOT an installed or
 * official external motion-qa-v1 package: none was available in this workspace.
 * Scores describe the measured export/contact/transition criteria below. They
 * are not a basketball coach's assessment or a claim of motion-capture quality.
 *
 * node source/validate.mjs [--modules /tmp/hoops-technique-tools]
 *   [--samples /tmp/hoops-technique-source-samples.json]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(root,'../../../..');
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const require=createRequire(path.resolve(arg('--modules','/tmp/hoops-technique-tools'),'package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf'),validator=require('gltf-validator'),{chromium}=require('playwright');
const {MeshoptDecoder}=require('meshoptimizer');await MeshoptDecoder.ready;
const names=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
const parentNames=[null,'Root','Hips','Spine','Chest','Neck','Chest','LeftArm','LeftForeArm','Chest','RightArm','RightForeArm','Hips','LeftUpLeg','LeftLeg','Hips','RightUpLeg','RightLeg'];
const limits={sampleHz:30,scoreExclusiveMinimum:88,footSlipExclusiveMeters:.02,palmContactMeters:.003,interpolatedPalmContactMeters:.020,gripWeightEpsilon:.001,solePenetrationMeters:.010,supportedSoleGapMeters:.010,handSurfaceGapMeters:.020,handPenetrationMeters:.020,staticCOMOutsideSupportMeters:.15,quaternionNormError:.00001,sourcePositionMeters:.001,sourceRotationRadians:.002,sourceMorphWeight:.001,sourceBallMeters:.001,bridgePositionMeters:.001,bridgeRotationRadians:.002,bridgeLinearVelocityMetersPerSecond:.03,bridgeAngularVelocityRadiansPerSecond:.10,bridgeMorphVelocityPerSecond:.03};
const startedAtUTC=new Date().toISOString(),inputHashes=[];
async function frozenRead(rel){const b=await fs.readFile(path.join(root,rel));inputHashes.push({file:rel,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});return b;}
const catalog=JSON.parse(await frozenRead('catalog.json'));
await frozenRead('source/validate.mjs');
const contacts=Object.fromEntries(await Promise.all(catalog.clips.map(async clip=>[clip.id,JSON.parse(await frozenRead(clip.contacts))])));
const modelFile=catalog.clips[0]?.glb||'models/athlete.glb',bytes=await frozenRead(modelFile);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule(),'meshopt.decoder':MeshoptDecoder});
const document=await io.readBinary(bytes),g=document.getRoot(),animations=g.listAnimations();
const gltfValidation=await validator.validateBytes(new Uint8Array(bytes),{uri:path.basename(modelFile),maxIssues:100});
const skins=g.listSkins().map(skin=>({names:skin.listJoints().map(n=>n.getName()),parents:skin.listJoints().map(n=>n.getParentNode()?.getName()??null)}));
const canonical=skins.length>0&&skins.every(s=>s.names.length===18&&names.every((n,i)=>s.names.includes(n)&&(s.parents[s.names.indexOf(n)]===parentNames[i]||n==='Root'&&!names.includes(s.parents[s.names.indexOf(n)]))));
const exactClipCount=catalog.clips.length===24&&new Set(catalog.clips.map(c=>c.id)).size===24;
const structural=catalog.clips.map(clip=>{
 const a=animations.find(a=>a.getName()===(clip.animation||clip.id)),n=Math.round(clip.duration*30)+1,tracks=[];let finite=true,norm=0;
 if(a)for(const channel of a.listChannels()){
  const sampler=channel.getSampler(),times=Array.from(sampler.getInput().getArray()),values=Array.from(sampler.getOutput().getArray()),interpolation=sampler.getInterpolation();
  finite&&=times.every(Number.isFinite)&&values.every(Number.isFinite);
  const uniform=times.length===n&&times.every((t,i)=>Math.abs(t-i/30)<2e-6);
  if(channel.getTargetPath()==='rotation')for(let i=0;i<times.length;i++){const q=values.slice((i*(interpolation==='CUBICSPLINE'?3:1)+(interpolation==='CUBICSPLINE'?1:0))*4,(i*(interpolation==='CUBICSPLINE'?3:1)+(interpolation==='CUBICSPLINE'?1:0))*4+4);norm=Math.max(norm,Math.abs(Math.hypot(...q)-1));}
  tracks.push({node:channel.getTargetNode()?.getName(),path:channel.getTargetPath(),interpolation,keys:times.length,uniform30Hz:uniform});
 }
 const animatedBones=new Set(tracks.filter(t=>names.includes(t.node)&&t.path==='rotation').map(t=>t.node));
 const events=clip.events||[],embedded=a?.getExtras()?.events;
 const eventTimes=events.every(e=>Number.isInteger(e.frame)&&e.frame>=0&&e.frame<n&&Math.abs((e.time??e.timeSeconds)-e.frame/30)<1e-6);
 const eventsEmbedded=Array.isArray(embedded)&&JSON.stringify(events)===JSON.stringify(embedded);
 return {id:clip.id,expectedFrames:n,declaredFrames:clip.frames,exists:!!a,tracks,finite,maxQuaternionNormError:norm,all18BoneRotations:animatedBones.size===18,eventTimes,eventDataEmbedded:eventsEmbedded,pass:!!a&&finite&&norm<=limits.quaternionNormError&&tracks.length>0&&tracks.every(t=>t.uniform30Hz)&&animatedBones.size===18&&clip.frames===n&&eventTimes&&eventsEmbedded};
});
let samples=null,sampleFile=arg('--samples','/tmp/hoops-technique-source-samples.json'),sourceSamplesSha256=null;
try{const sampleBytes=await fs.readFile(sampleFile);samples=JSON.parse(sampleBytes);sourceSamplesSha256=createHash('sha256').update(sampleBytes).digest('hex');}catch(error){if(error.code!=='ENOENT')throw error;}
let vendorRel='workout/island/design/hoops-technique-v1/vendor';
try{await fs.access(path.join(repo,vendorRel,'three.module.js'));}catch{vendorRel='workout/island/design/hoops-v7/characters/vendor';}
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');if(u.pathname==='/qa.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><head><link rel="icon" href="data:,"><title>Independent baked motion QA</title></head><body>motion-qa-v1</body></html>');return;}
  const p=path.resolve(repo,'.'+decodeURIComponent(u.pathname));if(!p.startsWith(repo+path.sep))throw Error('Path outside repository');
  const b=await fs.readFile(p);res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,errors=[],externalRequests=[];
const browser=await chromium.launch({executablePath:arg('--executable','/usr/bin/chromium'),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let measured;
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();externalRequests.push(u);return route.abort();});
 await page.goto(origin+'/qa.html');
 measured=await page.evaluate(async({catalog,contacts,samples,vendorRel,modelURL,names,limits})=>{
  const THREE=await import('/'+vendorRel+'/three.module.js');
  const [{GLTFLoader},{DRACOLoader},{MeshoptDecoder}]=await Promise.all([import('/'+vendorRel+'/GLTFLoader.js'),import('/'+vendorRel+'/DRACOLoader.js'),import('/'+vendorRel+'/meshopt_decoder.module.js')]);
  await MeshoptDecoder.ready;
  const decoder=new DRACOLoader().setDecoderPath('/'+vendorRel+'/draco/').setWorkerLimit(2);
  const loader=new GLTFLoader().setDRACOLoader(decoder).setMeshoptDecoder(MeshoptDecoder),gltf=await loader.loadAsync(modelURL),root=gltf.scene,mixer=new THREE.AnimationMixer(root);
  const bone=Object.fromEntries(names.map(n=>[n,root.getObjectByName(n)])),ball=root.getObjectByName('MotionBallAnchor');
  if(names.some(n=>!bone[n])||!ball)throw Error('Missing canonical bones or MotionBallAnchor');
  const v=new THREE.Vector3(),bcenter=new THREE.Vector3(),skins=[];
  root.updateWorldMatrix(true,true);
  root.traverse(mesh=>{
   if(!mesh.isSkinnedMesh)return;const p=mesh.geometry.attributes.position,j=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight,feet={left:[],right:[]},hands={left:[],right:[]};
   for(let i=0;i<p.count;i++)for(const [side,prefix]of[['left','Left'],['right','Right']]){
    const ji=[j.getX(i),j.getY(i),j.getZ(i),j.getW(i)],wi=[w.getX(i),w.getY(i),w.getZ(i),w.getW(i)];
    let wf=0,wh=0;for(let k=0;k<4;k++){const n=mesh.skeleton.bones[ji[k]]?.name;if(n===prefix+'Foot')wf+=wi[k];if(n===prefix+'Hand')wh+=wi[k];}
    if(wf>.5)feet[side].push(i);if(wh>.5)hands[side].push(i);
   }
   skins.push({mesh,feet,hands});
  });
  let current=null,currentAction=null;
  const reset=id=>{
   mixer.stopAllAction();mixer.setTime(0);current=gltf.animations.find(c=>c.name===id);if(!current)throw Error('Missing animation '+id);
   const a=mixer.clipAction(current).reset().setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();currentAction=a;
  };
  const seek=t=>{currentAction.paused=false;currentAction.enabled=true;mixer.setTime(Math.min(current.duration,Math.max(0,t)));root.updateWorldMatrix(true,true);for(const s of skins)s.mesh.skeleton.update();};
  const state=()=>({bones:Object.fromEntries(names.map(n=>[n,{position:bone[n].position.toArray(),quaternion:bone[n].quaternion.toArray()}])),morphs:skins.map(s=>({name:s.mesh.name,weights:[...(s.mesh.morphTargetInfluences||[])],targets:s.mesh.morphTargetDictionary||{}})),ball:{position:ball.position.toArray(),quaternion:ball.quaternion.toArray(),scale:ball.scale.toArray()}});
  const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),qdist=(a,b)=>new THREE.Quaternion(...a).angleTo(new THREE.Quaternion(...b));
  const world=n=>bone[n].getWorldPosition(new THREE.Vector3());
  const jointAngle=(a,b,c)=>world(a).sub(world(b)).angleTo(world(c).sub(world(b)))*180/Math.PI;
  const flexions=()=>Object.fromEntries([['left','Left'],['right','Right']].map(([side,p])=>[side,{kneeFlexionDegrees:180-jointAngle(p+'UpLeg',p+'Leg',p+'Foot'),elbowExtensionDegrees:jointAngle(p+'Arm',p+'ForeArm',p+'Hand')}]));
  function approximateCOM(){
   const out=new THREE.Vector3();const add=(mass,a,b,u=.5)=>out.addScaledVector(world(a).lerp(world(b),u),mass);
   add(.081,'Neck','Head',.6);add(.497,'Hips','Chest',.55);
   for(const p of ['Left','Right']){add(.028,p+'Arm',p+'ForeArm',.436);add(.016,p+'ForeArm',p+'Hand',.43);add(.006,p+'Hand',p+'Hand');add(.100,p+'UpLeg',p+'Leg',.433);add(.0465,p+'Leg',p+'Foot',.433);add(.0145,p+'Foot',p+'Foot');}
   return out;
  }
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  function convexHull(points){const p=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;const lo=[],hi=[];for(const x of p){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),x)<=0)lo.pop();lo.push(x);}for(const x of [...p].reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),x)<=0)hi.pop();hi.push(x);}lo.pop();hi.pop();return [...lo,...hi];}
  function outsideHull(point,hull){
   if(!hull.length)return null;if(hull.length>2&&hull.every((a,i)=>cross(a,hull[(i+1)%hull.length],point)>=-1e-9))return 0;
   let d=Infinity;for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length],dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/(dx*dx+dz*dz||1)));d=Math.min(d,Math.hypot(point[0]-a[0]-u*dx,point[1]-a[1]-u*dz));}return d;
  }
  const poseAt=(id,t)=>{reset(id);seek(t);return state();};
  const sourceClips=Object.fromEntries((samples?.clips||[]).map(c=>[c.id,c]));
  const records=[];
  for(const clip of catalog.clips){
   reset(clip.animation||clip.id);const c=contacts[clip.id],anchors={left:null,right:null},windows={left:0,right:0};
   let maxSlip=0,maxPalm=0,maxInterpolatedPalm=0,minSole=Infinity,maxSupportedSoleGap=0,maxHandGap=0,maxHandPenetration=0,maxSourceP=0,maxSourceQ=0,maxSourceBall=0,maxSourceMorph=0,fullContacts=0,plantSamples=0,finite=true,sourceChecked=0,maxBallBelowFloor=0,minGripWeight=Infinity,maxGripWeight=-Infinity;
   const worstGrip={palm:null,penetration:null,surfaceGap:null};
   const snapshotFrames=sourceClips[clip.id]?.frames||[],sampleCount=c.samples?.length||0;
   const balanceSamples=[],staticBalance=[],kinematics={left:{minKneeFlexionDegrees:180,maxKneeFlexionDegrees:0},right:{minKneeFlexionDegrees:180,maxKneeFlexionDegrees:0},eventObservations:[]};
   const releaseFrame=(clip.events||[]).find(e=>/release/.test(e.type))?.frame??Math.floor(clip.frames/3);
   const contactSchema=c.id===clip.id&&c.sampleHz===30&&sampleCount===clip.frames&&c.samples.every((s,i)=>s.frame===i&&Math.abs(s.timeSeconds-i/30)<2e-6&&typeof s.support?.left==='boolean'&&typeof s.support?.right==='boolean'&&Array.isArray(s.hands));
   const auditSamples=[];
   for(let i=0;i<sampleCount;i++){
    const a=c.samples[i],b=c.samples[i+1];auditSamples.push(a);
    if(b)for(const u of [.25,.5,.75])auditSamples.push({...a,frame:a.frame+u,timeSeconds:a.timeSeconds+(b.timeSeconds-a.timeSeconds)*u,intermediate:true,support:{left:a.support.left&&b.support.left,right:a.support.right&&b.support.right},hands:a.hands.filter(h=>b.hands.includes(h))});
   }
   for(const s of auditSamples){
    seek(s.timeSeconds);const a=state();finite&&=names.every(n=>[...a.bones[n].position,...a.bones[n].quaternion].every(Number.isFinite));
    for(const m of a.morphs)for(const[name,index]of Object.entries(m.targets))if(/^grip/.test(name)){const weight=m.weights[index];finite&&=Number.isFinite(weight);minGripWeight=Math.min(minGripWeight,weight);maxGripWeight=Math.max(maxGripWeight,weight);}
    ball.getWorldPosition(bcenter);const visible=ball.getWorldScale(v).lengthSq()>1e-8,footprint=[];
    const angles=flexions();for(const side of ['left','right']){kinematics[side].minKneeFlexionDegrees=Math.min(kinematics[side].minKneeFlexionDegrees,angles[side].kneeFlexionDegrees);kinematics[side].maxKneeFlexionDegrees=Math.max(kinematics[side].maxKneeFlexionDegrees,angles[side].kneeFlexionDegrees);}
    for(const e of clip.events||[])if(e.frame===s.frame&&['load','release','takeoff','landing'].includes(e.type))kinematics.eventObservations.push({type:e.type,frame:s.frame,...angles});
    if(visible)maxBallBelowFloor=Math.max(maxBallBelowFloor,c.ballRadiusMeters-bcenter.y);
    for(const [side,effector]of[['left','LeftFoot'],['right','RightFoot']]){
     // A fixed point in the actual foot frame captures plant translation and
     // roll. It is independent of the solver's authored ankle target.
     const markerLocal=s.supportMarkers?.[side]?.localPointMeters||[0,-.06,0];
     const marker=new THREE.Vector3(...markerLocal).applyMatrix4(bone[effector].matrixWorld);
     if(s.support[side]){if(!anchors[side]){anchors[side]=marker.clone();windows[side]++;}plantSamples++;maxSlip=Math.max(maxSlip,Math.hypot(marker.x-anchors[side].x,marker.z-anchors[side].z));}else anchors[side]=null;
     let sideSole=Infinity;
     for(const part of skins)for(const i of part.feet[side]){part.mesh.getVertexPosition(i,v).applyMatrix4(part.mesh.matrixWorld);minSole=Math.min(minSole,v.y);sideSole=Math.min(sideSole,v.y);finite&&=Number.isFinite(v.y);if(s.support[side])footprint.push([v.x,v.z]);}
     if(s.support[side])maxSupportedSoleGap=Math.max(maxSupportedSoleGap,sideSole);
     const handName=side==='left'?'LeftHand':'RightHand';if(!s.hands.includes(handName)||!visible)continue;
     fullContacts++;const local=c.palmLocalMeters?.[handName];if(!local){finite=false;continue;}
     const palm=new THREE.Vector3(...local).applyMatrix4(bone[handName].matrixWorld),palmResidual=Math.abs(palm.distanceTo(bcenter)-c.ballRadiusMeters);if(!worstGrip.palm||palmResidual>worstGrip.palm.meters)worstGrip.palm={frame:s.frame,timeSeconds:s.timeSeconds,side,meters:palmResidual,intermediate:!!s.intermediate};if(s.intermediate)maxInterpolatedPalm=Math.max(maxInterpolatedPalm,palmResidual);else maxPalm=Math.max(maxPalm,palmResidual);
     let nearest=Infinity,penetration=0;for(const part of skins)for(const i of part.hands[side]){part.mesh.getVertexPosition(i,v).applyMatrix4(part.mesh.matrixWorld);const d=v.distanceTo(bcenter);nearest=Math.min(nearest,Math.abs(d-c.ballRadiusMeters));penetration=Math.max(penetration,c.ballRadiusMeters-d);}
     if(Number.isFinite(nearest)){if(nearest>maxHandGap)worstGrip.surfaceGap={frame:s.frame,timeSeconds:s.timeSeconds,side,meters:nearest,intermediate:!!s.intermediate};maxHandGap=Math.max(maxHandGap,nearest);}if(penetration>maxHandPenetration)worstGrip.penetration={frame:s.frame,timeSeconds:s.timeSeconds,side,meters:penetration,intermediate:!!s.intermediate};maxHandPenetration=Math.max(maxHandPenetration,penetration);
    }
    if(footprint.length){const com=approximateCOM(),outsideMeters=outsideHull([com.x,com.z],convexHull(footprint)),observation={frame:s.frame,timeSeconds:s.timeSeconds,outsideMeters,comWorldMeters:com.toArray(),support:[...['left','right'].filter(side=>s.support[side])]};balanceSamples.push(observation);if(['pass','shot'].includes(clip.category)&&s.support.left&&s.support.right&&s.frame<=releaseFrame)staticBalance.push(observation);}
    const expected=snapshotFrames[s.frame];if(expected){sourceChecked++;for(const n of names){maxSourceP=Math.max(maxSourceP,dist(a.bones[n].position,expected.bones[n].position));maxSourceQ=Math.max(maxSourceQ,qdist(a.bones[n].quaternion,expected.bones[n].quaternion));}maxSourceBall=Math.max(maxSourceBall,dist(a.ball.position,expected.ball.position));for(const m of a.morphs)for(const[name,index]of Object.entries(m.targets))if(expected.grips?.[name]!==undefined)maxSourceMorph=Math.max(maxSourceMorph,Math.abs(m.weights[index]-expected.grips[name]));}
   }
   const releases=(clip.events||[]).filter(e=>/release/.test(e.type));
   const releaseChecks=releases.map(e=>{
    const frame=e.frame,current=c.samples[frame],before=c.samples[Math.max(0,frame-1)],after=c.samples[Math.min(sampleCount-1,frame+1)];
    const time=e.time??e.timeSeconds,h=.0001;seek(time);const b=ball.position.toArray();seek(time-2*h);const preceding2=ball.position.toArray();seek(time-h);const preceding=ball.position.toArray();seek(time+h);const next=ball.position.toArray();seek(time+2*h);const next2=ball.position.toArray();
    const incomingVelocity=b.map((v,i)=>(v-preceding[i])/h),outgoingVelocity=next.map((v,i)=>(v-b[i])/h),velocityResidual=dist(incomingVelocity,outgoingVelocity);
    const extrapolatedIncoming=preceding.map((v,i)=>2*v-preceding2[i]),extrapolatedOutgoing=next.map((v,i)=>2*v-next2[i]),c0=dist(extrapolatedIncoming,extrapolatedOutgoing);
    return {type:e.type,frame,timeSeconds:time,previousContactCount:before?.hands.length||0,atContactCount:current?.hands.length||0,nextContactCount:after?.hands.length||0,outgoingSpeedMetersPerSecond:Math.hypot(...outgoingVelocity),trajectory:{method:'One-sided0.1ms derivatives of the actual delivered ball track. Extrapolated C0 uses disjoint sample pairs on each side. Finite-difference C1 is observed rather than assumed from authoring metadata.',incomingVelocityMetersPerSecond:incomingVelocity,outgoingVelocityMetersPerSecond:outgoingVelocity,velocityDifferenceMetersPerSecond:velocityResidual,c0ExtrapolatedMeters:c0},pass:(before?.hands.length||0)>0&&(after?.hands.length||0)===0&&Math.hypot(...outgoingVelocity)>.1&&c0<=.0005&&velocityResidual<=3};
   });
   const floorContacts=(clip.events||[]).filter(e=>e.type==='floor_contact').map(e=>{seek(e.time??e.timeSeconds);const center=ball.getWorldPosition(new THREE.Vector3()).toArray(),error=Math.abs(center[1]-c.ballRadiusMeters);return{frame:e.frame,timeSeconds:e.time??e.timeSeconds,centerMeters:center,surfaceResidualMeters:error,pass:error<=.002};});
   const balanceSummary=rows=>{const sorted=rows.map(r=>r.outsideMeters).sort((a,b)=>a-b);return{samples:rows.length,maxOutsideMeters:sorted.at(-1)??null,p95OutsideMeters:sorted.length?sorted[Math.floor((sorted.length-1)*.95)]:null,worst:rows.reduce((a,b)=>!a||b.outsideMeters>a.outsideMeters?b:a,null)};};
   records.push({id:clip.id,samples:sampleCount,intermediateSamples:auditSamples.length-sampleCount,contactSchema,finite,maxFootSlipMeters:maxSlip,plantSamples,plantWindows:windows,fullHandContactSamples:fullContacts,gripWeightRange:{min:minGripWeight,max:maxGripWeight},worstGrip,maxPalmResidualMeters:maxPalm,maxInterpolatedPalmResidualMeters:maxInterpolatedPalm,minFootVertexY:minSole,maxSupportedSoleGapMeters:maxSupportedSoleGap,maxHandSurfaceGapMeters:maxHandGap,maxHandPenetrationMeters:maxHandPenetration,maxBallBelowFloorMeters:Math.max(0,maxBallBelowFloor),sourceSamplesCompared:sourceChecked,sourceFidelity:{maxPositionMeters:maxSourceP,maxRotationRadians:maxSourceQ,maxBallMeters:maxSourceBall,maxMorphWeight:maxSourceMorph},releaseChecks,floorContacts,kinematics,balance:{model:'Approximate human segment-mass COM projected onto the convex hull of actual supported shoe vertices; not a force-plate or dynamic-stability model.',allSupportedFrames:balanceSummary(balanceSamples),staticLoadFrames:balanceSummary(staticBalance),staticGateApplicable:['pass','shot'].includes(clip.category)}});
  }
  const bridgeRecords=[];const eps=.0001;
  for(const bridge of catalog.bridges||[]){
   const id=bridge.animation||bridge.id,duration=bridge.duration??.6;
   const boundaries=[];
   for(const [end,ref]of[['start',bridge.from],['end',bridge.to]]){
    if(!ref){boundaries.push({end,pass:false,reason:'Missing endpoint reference'});continue;}
    const rt=ref.timeSeconds??0,refClip=gltf.animations.find(c=>c.name===ref.animation),refEnd=rt>=(refClip?.duration||0)-1e-6,bs=end==='start'?0:duration;
    const r0=poseAt(ref.animation,rt),r1=poseAt(ref.animation,rt+(refEnd?-eps:eps)),b0=poseAt(id,bs),b1=poseAt(id,bs+(end==='start'?eps:-eps));
    const off=ref.rootOffsetMeters||((end==='end'&&bridge.rootOffsetMeters)||[0,0,0]);
    let p=0,q=0,linear=0,angular=0,morph=0,morphWeight=0;
    for(const n of names){
     const expected=r0.bones[n].position.map((v,i)=>v+(n==='Root'?off[i]:0));p=Math.max(p,dist(expected,b0.bones[n].position));q=Math.max(q,qdist(r0.bones[n].quaternion,b0.bones[n].quaternion));
     const rv=r1.bones[n].position.map((v,i)=>(v-r0.bones[n].position[i])/(refEnd?-eps:eps)),bv=b1.bones[n].position.map((v,i)=>(v-b0.bones[n].position[i])/(end==='start'?eps:-eps));linear=Math.max(linear,dist(rv,bv));
     const velocity=(a,b,dt)=>{const delta=new THREE.Quaternion(...a).invert().multiply(new THREE.Quaternion(...b));if(delta.w<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w);const sin=Math.hypot(delta.x,delta.y,delta.z),scale=sin>1e-12?2*Math.atan2(sin,delta.w)/(sin*dt):2/dt;return[delta.x*scale,delta.y*scale,delta.z*scale];};
     angular=Math.max(angular,dist(velocity(r0.bones[n].quaternion,r1.bones[n].quaternion,refEnd?-eps:eps),velocity(b0.bones[n].quaternion,b1.bones[n].quaternion,end==='start'?eps:-eps)));
    }
    for(let j=0;j<b0.morphs.length;j++)for(let k=0;k<b0.morphs[j].weights.length;k++){morphWeight=Math.max(morphWeight,Math.abs(r0.morphs[j].weights[k]-b0.morphs[j].weights[k]));const rv=(r1.morphs[j].weights[k]-r0.morphs[j].weights[k])/(refEnd?-eps:eps),bv=(b1.morphs[j].weights[k]-b0.morphs[j].weights[k])/(end==='start'?eps:-eps);morph=Math.max(morph,Math.abs(rv-bv));}
    boundaries.push({end,reference:ref,maxPositionMeters:p,maxRotationRadians:q,maxLinearVelocityResidualMetersPerSecond:linear,maxAngularVelocityResidualRadiansPerSecond:angular,maxMorphWeightResidual:morphWeight,maxMorphVelocityResidualPerSecond:morph,pass:p<=limits.bridgePositionMeters&&q<=limits.bridgeRotationRadians&&linear<=limits.bridgeLinearVelocityMetersPerSecond&&angular<=limits.bridgeAngularVelocityRadiansPerSecond&&morphWeight<=limits.sourceMorphWeight&&morph<=limits.bridgeMorphVelocityPerSecond});
   }
   bridgeRecords.push({id,boundaries,pass:boundaries.length===2&&boundaries.every(b=>b.pass)});
  }
  const gripMorphsAvailable=['grip_left','grip_right'].every(name=>skins.some(s=>Object.hasOwn(s.mesh.morphTargetDictionary||{},name)));
  decoder.dispose();return {records,bridges:bridgeRecords,skinMeshes:skins.length,gripMorphsAvailable,animationCount:gltf.animations.length};
 },{catalog,contacts,samples,vendorRel,modelURL:'/workout/island/design/hoops-technique-v1/'+modelFile,names,limits});
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
const globalIntegrity=canonical&&exactClipCount&&gltfValidation.issues.numErrors===0&&errors.length===0&&externalRequests.length===0;
const results=measured.records.map(row=>{
 const contract=structural.find(s=>s.id===row.id),clip=catalog.clips.find(c=>c.id===row.id);
 const clipBridges=measured.bridges.filter(b=>b.id===`idle_to__${row.id}`||b.id===`${row.id}__to_idle`||b.id===`run_to__${row.id}`||b.id===`${row.id}__to_run`);
 const requiresRelease=['pass','shot','finish'].includes(clip.category);
 const checks={integrity:globalIntegrity&&contract.pass&&row.contactSchema&&row.finite,plant:row.plantSamples>0&&row.maxFootSlipMeters<limits.footSlipExclusiveMeters,grip:measured.gripMorphsAvailable&&row.gripWeightRange.min>=-limits.gripWeightEpsilon&&row.gripWeightRange.max<=1+limits.gripWeightEpsilon&&(clip.category==='expression'||row.fullHandContactSamples>0)&&row.maxPalmResidualMeters<=limits.palmContactMeters&&row.maxInterpolatedPalmResidualMeters<=limits.interpolatedPalmContactMeters&&row.maxHandSurfaceGapMeters<=limits.handSurfaceGapMeters&&row.maxHandPenetrationMeters<=limits.handPenetrationMeters,bridges:clipBridges.length===4&&clipBridges.every(b=>b.pass),surface:row.minFootVertexY>=-limits.solePenetrationMeters&&row.maxSupportedSoleGapMeters<=limits.supportedSoleGapMeters&&row.maxBallBelowFloorMeters<=.001,release:(!requiresRelease||row.releaseChecks.length>0)&&row.releaseChecks.every(r=>r.pass)&&row.floorContacts.every(r=>r.pass),balance:!row.balance.staticGateApplicable||(row.balance.staticLoadFrames.samples>0&&row.balance.staticLoadFrames.maxOutsideMeters<=limits.staticCOMOutsideSupportMeters),fidelity:row.sourceSamplesCompared===clip.frames&&row.sourceFidelity.maxPositionMeters<=limits.sourcePositionMeters&&row.sourceFidelity.maxRotationRadians<=limits.sourceRotationRadians&&row.sourceFidelity.maxBallMeters<=limits.sourceBallMeters&&row.sourceFidelity.maxMorphWeight<=limits.sourceMorphWeight};
 const weights={integrity:20,plant:20,grip:20,bridges:20,surface:5,release:5,balance:5,fidelity:5},deductions=Object.entries(checks).filter(([,pass])=>!pass).map(([check])=>({check,points:weights[check]})),score=100-deductions.reduce((n,d)=>n+d.points,0);
 return {...row,checks,score,deductions,pass:score>88&&Object.values(checks).every(Boolean)};
});
const changed=[];for(const input of inputHashes){const bytes=await fs.readFile(path.join(root,input.file));if(createHash('sha256').update(bytes).digest('hex')!==input.sha256)changed.push(input.file);}
const report={schemaVersion:1,tool:'motion-qa-v1',implementation:'Locally authored for this delivery; the requested external tool/skill was unavailable. This is not an official certification.',startedAtUTC,finishedAtUTC:new Date().toISOString(),limits,rubric:{integrity:20,plant:20,grip:20,bridges:20,surface:5,release:5,balance:5,fidelity:5,rule:'Start at100 and deduct the entire category weight on failure. Every category is also a hard gate; each clip must exceed88. No score is assigned for subjective basketball aesthetics.'},method:{playback:'Fresh Three.js AnimationMixer of actual delivered GLB; no live IK modifies the tested model.',sampleRate:'All30Hz main-clip frames and interval quarter/mid/three-quarter interpolation samples; bridge derivatives measured with one-sided0.1ms finite differences.',footSlip:'Horizontal world displacement of a fixed local foot marker per contiguous declared full-support window, independent of solver target positions.',hands:'Actual transformed palmar markers plus all vertices weighted>50% to the contacting hand; vertex distances do not establish continuous triangle collision.',sourceFidelity:samples?sampleFile:'UNAVAILABLE: source fidelity hard gate fails.',bridgeScope:'All96 explicit standing/running ingress/egress bridges; skeletal translation/rotation and grip morph endpoint derivatives. Free-flight ball visibility may change; no ball C1 claim is inferred.'},limitations:['Numeric score assesses export integrity, authored contacts, support drift, transitions and bake fidelity. Professional basketball technique remains a visual/coaching judgement.','The18-joint rig has no finger joints; independent hand grip morphs deform fingers.','Planted-foot declarations are authored metadata; actual interpolation support and hand contact is checked where both adjacent authored samples declare contact. This finite120Hz sampling does not prove continuous collision freedom.','Vertex-based contact tests sample vertices, not continuous mesh collision.','Approximate anthropometric COM uses nominal segment fractions and a geometric shoe hull. Dynamic stability, forces and athlete-specific mass distribution are not measured. No gameplay integration, physical phone performance, motion-capture provenance or coach approval is established.'],inputs:inputHashes,sourceSamplesSha256,changedDuringValidation:changed,canonical18:canonical,exactly24MainClips:exactClipCount,khronos:{errors:gltfValidation.issues.numErrors,warnings:gltfValidation.issues.numWarnings,messages:gltfValidation.issues.messages},structural,results,bridges:measured.bridges,browserErrors:errors,externalRequests,summary:{mainClips:results.length,bridges:measured.bridges.length,minimumScore:Math.min(...results.map(r=>r.score)),maximumFootSlipMeters:Math.max(...results.map(r=>r.maxFootSlipMeters)),maximumPalmResidualMeters:Math.max(...results.map(r=>r.maxPalmResidualMeters)),maximumInterpolatedPalmResidualMeters:Math.max(...results.map(r=>r.maxInterpolatedPalmResidualMeters)),maximumSupportedSoleGapMeters:Math.max(...results.map(r=>r.maxSupportedSoleGapMeters)),poseSamples:results.reduce((n,r)=>n+r.samples+r.intermediateSamples,0),failures:results.filter(r=>!r.pass).map(r=>({id:r.id,score:r.score,failedChecks:Object.entries(r.checks).filter(([,v])=>!v).map(([k])=>k)}))},pass:globalIntegrity&&results.every(r=>r.pass)&&changed.length===0};
await fs.mkdir(path.join(root,'verification'),{recursive:true});await fs.writeFile(path.join(root,'verification/motion-qa-v1.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,...report.summary,canonical18:canonical,khronosErrors:gltfValidation.issues.numErrors,browserErrors:errors},null,2));if(!report.pass)process.exitCode=1;
