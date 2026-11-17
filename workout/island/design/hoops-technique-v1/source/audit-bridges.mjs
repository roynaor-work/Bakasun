#!/usr/bin/env node
/** Independent decoded bridge surface observations. No live IK is applied. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/hoops-technique-tools/package.json');
const {chromium}=require('playwright');
const sha=b=>createHash('sha256').update(b).digest('hex');
const model=await fs.readFile(path.join(root,'models/athlete.glb'));
const catalogBytes=await fs.readFile(path.join(root,'catalog.json'));
const catalog=JSON.parse(catalogBytes),errors=[];
const types={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost').pathname;if(u==='/audit.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,"><title>Bridge surface audit</title>');return;}const f=path.resolve(root,'.'+decodeURIComponent(u));if(!f.startsWith(root+path.sep))throw Error('path');const bytes=u==='/models/athlete.glb'?model:await fs.readFile(f);res.setHeader('Content-Type',types[path.extname(f)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
let records;
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${server.address().port}/audit.html`);
 records=await page.evaluate(async bridges=>{
  const THREE=await import('/vendor/three.module.js');
  const [{GLTFLoader},{DRACOLoader},{MeshoptDecoder}]=await Promise.all([import('/vendor/GLTFLoader.js'),import('/vendor/DRACOLoader.js'),import('/vendor/meshopt_decoder.module.js')]);
  await MeshoptDecoder.ready;
  const decoder=new DRACOLoader().setDecoderPath('/vendor/draco/');
  const gltf=await new GLTFLoader().setDRACOLoader(decoder).setMeshoptDecoder(MeshoptDecoder).loadAsync('/models/athlete.glb');
  const root=gltf.scene,mixer=new THREE.AnimationMixer(root),bones={left:root.getObjectByName('LeftFoot'),right:root.getObjectByName('RightFoot')},parts=[];
  root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const j=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight,feet={left:[],right:[]};for(let i=0;i<j.count;i++){const ji=[j.getX(i),j.getY(i),j.getZ(i),j.getW(i)],wi=[w.getX(i),w.getY(i),w.getZ(i),w.getW(i)];for(const [side,name]of[['left','LeftFoot'],['right','RightFoot']]){let weight=0;for(let k=0;k<4;k++)if(mesh.skeleton.bones[ji[k]]?.name===name)weight+=wi[k];if(weight>.5)feet[side].push(i);}}parts.push({mesh,feet});});
  const v=new THREE.Vector3(),result=[];
  for(const bridge of bridges){
   mixer.stopAllAction();mixer.setTime(0);const clip=gltf.animations.find(c=>c.name===(bridge.animation||bridge.id));if(!clip)throw Error('Missing '+bridge.id);
   const action=mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
   const duration=bridge.durationSeconds??bridge.duration,sampleHz=120,frameCount=Math.round(duration*sampleHz),samples=[],windows={left:null,right:null};
   let minY=Infinity,worstFrame=0,maxFootSpeed=0,maxNearFloorFootSpeed=0,maxInferredGroundWindowDrift=0;
   for(let frame=0;frame<=frameCount;frame++){
    action.paused=false;action.enabled=true;mixer.setTime(frame/sampleHz);root.updateWorldMatrix(true,true);for(const p of parts)p.mesh.skeleton.update();
    const sample={sampleIndex:frame,frame:frame*30/sampleHz,timeSeconds:frame/sampleHz,feet:{},root:root.getObjectByName('Root').getWorldPosition(new THREE.Vector3()).toArray()};
    for(const side of ['left','right']){
     let soleMinY=Infinity;for(const p of parts)for(const i of p.feet[side]){p.mesh.getVertexPosition(i,v).applyMatrix4(p.mesh.matrixWorld);soleMinY=Math.min(soleMinY,v.y);}
     const point=new THREE.Vector3(0,-.06,0).applyMatrix4(bones[side].matrixWorld).toArray(),previous=samples.at(-1)?.feet[side];
     const horizontalSpeed=previous?Math.hypot(point[0]-previous.markerWorldMeters[0],point[2]-previous.markerWorldMeters[2])*sampleHz:0;
     const nearFloor=soleMinY<=.015,aboveFloor=soleMinY>=-.010;
     let drift=0;
     if(nearFloor&&aboveFloor){windows[side]??=point;drift=Math.hypot(point[0]-windows[side][0],point[2]-windows[side][2]);maxInferredGroundWindowDrift=Math.max(maxInferredGroundWindowDrift,drift);}else windows[side]=null;
     maxFootSpeed=Math.max(maxFootSpeed,horizontalSpeed);if(nearFloor)maxNearFloorFootSpeed=Math.max(maxNearFloorFootSpeed,horizontalSpeed);
     if(soleMinY<minY){minY=soleMinY;worstFrame=frame*30/sampleHz;}
     sample.feet[side]={soleMinY,markerWorldMeters:point,horizontalSpeedMetersPerSecond:horizontalSpeed,nearFloor,nearFloorWindowDriftMeters:drift};
    }
    samples.push(sample);
   }
   let maxMovingFootClearanceResidualMeters=0;
   if(!bridge.gait)for(let i=1;i<samples.length-1;i++)for(const side of ['left','right']){
    const a=samples[i-1].feet[side].markerWorldMeters,b=samples[i+1].feet[side].markerWorldMeters,speed=Math.hypot(b[0]-a[0],b[2]-a[2])/(2/sampleHz),u=Math.max(0,Math.min(1,speed/.5)),target=.003+(.025-.003)*u*u*(3-2*u);
    if(target>.0035)maxMovingFootClearanceResidualMeters=Math.max(maxMovingFootClearanceResidualMeters,target-samples[i].feet[side].soleMinY);
   }
   result.push({id:bridge.id,durationSeconds:duration,sampleHz,samples,minFootVertexY:minY,worstFrame,maxFootHorizontalSpeedMetersPerSecond:maxFootSpeed,maxNearFloorFootHorizontalSpeedMetersPerSecond:maxNearFloorFootSpeed,maxInferredGroundWindowDriftMeters:maxInferredGroundWindowDrift,movingFootClearanceExempt:!!bridge.gait,maxMovingFootClearanceResidualMeters,movingFootClearancePass:maxMovingFootClearanceResidualMeters<=.001,floorPass:minY>=-.001});
  }
  decoder.dispose();return result;
 },catalog.bridges);
}finally{await browser.close();await new Promise(r=>server.close(r));}
const currentModel=await fs.readFile(path.join(root,'models/athlete.glb')),currentCatalog=await fs.readFile(path.join(root,'catalog.json'));
const report={schemaVersion:1,kind:'independent-decoded-bridge-surface-audit',generatedAtUTC:new Date().toISOString(),inputs:[{file:'models/athlete.glb',sha256:sha(model)},{file:'catalog.json',sha256:sha(catalogBytes)}],inputsUnchanged:sha(currentModel)===sha(model)&&sha(currentCatalog)===sha(catalogBytes),method:'Fresh Three.js AnimationMixer playback of frozen delivered GLB; all vertices weighted >50% to a foot are transformed. Sampled at120Hz, including all30Hz keys and three interior points per interval. No live IK, target positions, or source choreography are used. Generic bridge clearance is independently compared with3mm+22mm*smoothstep(horizontal foot speed/0.5m/s); four retained-gait transitions are exempt.',limits:{floorPenetrationMeters:.001,nearFloorThresholdMeters:.015,movingFootClearanceResidualMeters:.001},limitations:['Inferred near-floor windows are observations, not authored stance declarations; their drift does not establish a planted-foot QA result.','Reported peak speeds use consecutive120Hz differences; the independent clearance check uses centered differences.','Surface minimum samples vertices, not triangle collisions.'],records,summary:{bridges:records.length,minFootVertexY:Math.min(...records.map(r=>r.minFootVertexY)),floorFailures:records.filter(r=>!r.floorPass).map(r=>({id:r.id,minFootVertexY:r.minFootVertexY,worstFrame:r.worstFrame})),movingFootClearanceFailures:records.filter(r=>!r.movingFootClearancePass).map(r=>({id:r.id,maxResidualMeters:r.maxMovingFootClearanceResidualMeters})),maxMovingFootClearanceResidualMeters:Math.max(...records.map(r=>r.maxMovingFootClearanceResidualMeters)),maxNearFloorFootHorizontalSpeedMetersPerSecond:Math.max(...records.map(r=>r.maxNearFloorFootHorizontalSpeedMetersPerSecond)),maxInferredGroundWindowDriftMeters:Math.max(...records.map(r=>r.maxInferredGroundWindowDriftMeters))},browserErrors:errors,pass:records.length===96&&records.every(r=>r.floorPass&&r.movingFootClearancePass)&&errors.length===0&&sha(currentModel)===sha(model)&&sha(currentCatalog)===sha(catalogBytes)};
// Full dense traces are reproducible but need not fill a code review. Keep
// extrema and failure samples in the committed report; preserve full traces
// outside the repository, or opt in explicitly with --include-samples.
const fullTraceFile='/tmp/hoops-technique-bridge-surfaces-full.json';
await fs.writeFile(fullTraceFile,JSON.stringify(report)+'\n');
if(!process.argv.includes('--include-samples'))report.records=report.records.map(record=>{
 const {samples,...metrics}=record;
 const indices=new Set([0,samples.length-1,Math.round(record.worstFrame/30*record.sampleHz)]);
 let maxSpeed=-1,maxDrift=-1;
 for(let i=0;i<samples.length;i++)for(const foot of Object.values(samples[i].feet)){
  if(foot.nearFloor&&foot.horizontalSpeedMetersPerSecond>maxSpeed){maxSpeed=foot.horizontalSpeedMetersPerSecond;indices.add(i);}
  if(foot.nearFloorWindowDriftMeters>maxDrift){maxDrift=foot.nearFloorWindowDriftMeters;indices.add(i);}
  if(foot.soleMinY<-.001)indices.add(i);
 }
 // Keep only the actual extrema, plus endpoints and penetration failures.
 const worstSpeed=samples.findIndex(s=>Object.values(s.feet).some(f=>f.nearFloor&&Math.abs(f.horizontalSpeedMetersPerSecond-maxSpeed)<1e-12));
 const worstDrift=samples.findIndex(s=>Object.values(s.feet).some(f=>Math.abs(f.nearFloorWindowDriftMeters-maxDrift)<1e-12));
 const selected=new Set([0,samples.length-1,Math.round(record.worstFrame/30*record.sampleHz),worstSpeed,worstDrift]);
 for(let i=0;i<samples.length;i++)if(Object.values(samples[i].feet).some(f=>f.soleMinY<-.001))selected.add(i);
 return{...metrics,sampleCount:samples.length,worstSamples:[...selected].filter(i=>i>=0&&i<samples.length).sort((a,b)=>a-b).map(i=>samples[i])};
});
report.denseTrace={savedOutsideRepository:fullTraceFile,includeAllSamplesFlag:'--include-samples',defaultReport:'Per-bridge metrics, endpoint/worst samples and every floor-failure sample. Full120Hz traces are regenerated by this script.'};
await fs.writeFile(path.join(root,'verification/bridge-surfaces.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,...report.summary},null,2));
if(!report.pass)process.exitCode=1;
