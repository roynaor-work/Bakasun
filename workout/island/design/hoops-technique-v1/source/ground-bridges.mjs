/**
 * Ground an exported bridge through a smooth pelvis/root weight-shift envelope.
 * The bridge's endpoint values and derivatives stay unchanged. This is an
 * explicit transition hop, not a declaration that an interpolated foot plants.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire('/tmp/hoops-technique-tools/package.json');
const {chromium}=require('playwright');

export async function groundBridges(document,{directory,io,sampleHz=120,clearanceMeters=.003}={}){
 const bytes=await io.writeBinary(document),bridges=document.getRoot().listAnimations().filter(a=>a.getExtras().kind==='C1-bridge').map(a=>({id:a.getName(),duration:a.getExtras().durationSeconds,retainedGait:!!a.getExtras().gait}));
 const types={'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm'};
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost').pathname;if(u==='/ground.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,">');return;}if(u==='/bridge.glb'){res.setHeader('Content-Type','model/gltf-binary');res.end(bytes);return;}const f=path.resolve(directory,'.'+decodeURIComponent(u));if(!f.startsWith(directory+path.sep))throw Error('path');const b=await fs.readFile(f);res.setHeader('Content-Type',types[path.extname(f)]||'application/octet-stream');res.end(b);}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 let records;
 try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/ground.html`);
  records=await page.evaluate(async({bridges,sampleHz,clearanceMeters})=>{
   const THREE=await import('/vendor/three.module.js');
   const [{GLTFLoader},{DRACOLoader},{MeshoptDecoder}]=await Promise.all([import('/vendor/GLTFLoader.js'),import('/vendor/DRACOLoader.js'),import('/vendor/meshopt_decoder.module.js')]);await MeshoptDecoder.ready;
   const decoder=new DRACOLoader().setDecoderPath('/vendor/draco/');
   const gltf=await new GLTFLoader().setDRACOLoader(decoder).setMeshoptDecoder(MeshoptDecoder).loadAsync('/bridge.glb');
   const root=gltf.scene,mixer=new THREE.AnimationMixer(root),parts=[],footBones={left:root.getObjectByName('LeftFoot'),right:root.getObjectByName('RightFoot')};
   root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const j=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight,feet={left:[],right:[]};for(let i=0;i<j.count;i++){const ji=[j.getX(i),j.getY(i),j.getZ(i),j.getW(i)],wi=[w.getX(i),w.getY(i),w.getZ(i),w.getW(i)];for(const [side,name]of[['left','LeftFoot'],['right','RightFoot']]){let footWeight=0;for(let k=0;k<4;k++)if(mesh.skeleton.bones[ji[k]]?.name===name)footWeight+=wi[k];if(footWeight>.5)feet[side].push(i);}}parts.push({mesh,feet});});
   const point=new THREE.Vector3(),out=[];
   for(const bridge of bridges){
    mixer.stopAllAction();mixer.setTime(0);const clip=gltf.animations.find(c=>c.name===bridge.id),action=mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    const count=Math.round(bridge.duration*sampleHz),minimumFootHeightsMeters=[],footSamples=[];let minimum=Infinity,worstTime=0,endpointMinimum=Infinity;
    for(let i=0;i<=count;i++){
     const u=i/count;action.paused=false;action.enabled=true;mixer.setTime(u*bridge.duration);root.updateWorldMatrix(true,true);for(const p of parts)p.mesh.skeleton.update();let y=Infinity;
     const feet={};for(const side of ['left','right']){let footY=Infinity;for(const p of parts)for(const index of p.feet[side]){p.mesh.getVertexPosition(index,point).applyMatrix4(p.mesh.matrixWorld);footY=Math.min(footY,point.y);}feet[side]={soleMinY:footY,point:new THREE.Vector3(0,-.06,0).applyMatrix4(footBones[side].matrixWorld).toArray()};y=Math.min(y,footY);}footSamples.push(feet);
     minimumFootHeightsMeters.push(y);
     if(y<minimum){minimum=y;worstTime=u*bridge.duration;}
     if(i===0||i===count)endpointMinimum=Math.min(endpointMinimum,y);
    }
    let movingFootClearanceSamples=0,maxMovingFootClearanceDeficitMeters=0;
    const requiredLiftMeters=minimumFootHeightsMeters.map((y,i)=>{
     const floorNeed=y<.001?clearanceMeters-y:0;if(bridge.retainedGait||i===0||i===count)return floorNeed;
     let need=floorNeed;
     for(const side of ['left','right']){
      const a=footSamples[i-1][side].point,b=footSamples[i+1][side].point,speed=Math.hypot(b[0]-a[0],b[2]-a[2])/(2/sampleHz),u=Math.max(0,Math.min(1,speed/.5)),smooth=u*u*(3-2*u),target=clearanceMeters+(.025-clearanceMeters)*smooth;
      // Ignore submillimetre clearance changes at the endpoint so numerical
      // velocity/height noise cannot demand an abrupt first-key jump.
      if(target>clearanceMeters+.0005)need=Math.max(need,target-footSamples[i][side].soleMinY);
     }
     if(need>floorNeed+1e-6){movingFootClearanceSamples++;maxMovingFootClearanceDeficitMeters=Math.max(maxMovingFootClearanceDeficitMeters,need-floorNeed);}
     return Math.max(0,need);
    });
    out.push({id:bridge.id,durationSeconds:bridge.duration,sampleHz,retainedGait:bridge.retainedGait,rawMinFootVertexY:minimum,rawWorstTimeSeconds:worstTime,endpointMinFootVertexY:endpointMinimum,minimumFootHeightsMeters,requiredLiftMeters,movingFootClearanceSamples,maxMovingFootClearanceDeficitMeters});
   }
   decoder.dispose();return out;
  },{bridges,sampleHz,clearanceMeters});
 }finally{await browser.close();await new Promise(r=>server.close(r));}
 for(const record of records){
  if(record.endpointMinFootVertexY<-.001)throw Error(`Bridge endpoint is below floor: ${record.id}`);
  const count=Math.round(record.durationSeconds*30),heights=Array(count+1).fill(0),denseCount=record.minimumFootHeightsMeters.length-1,constraints=[];
  // With all interior keys at the same height, each constraint is feasible
  // exactly when peak*(free Hermite basis weights) covers its deficit. The
  // largest such bound is the minimum possible peak for this positive basis.
  let minimumFeasiblePeak=0;
  for(let i=1;i<denseCount;i++){
   const need=record.requiredLiftMeters[i];if(need<=0)continue;
   const key=i/denseCount*count,a=Math.min(count-1,Math.floor(key)),b=a+1,u=key-a,wa=2*u*u*u-3*u*u+1,wb=1-wa,da=a>0?wa:0,db=b<count?wb:0;
   if(da+db<1e-12)throw Error(`Cannot preserve grounded endpoint ${record.id}`);
   minimumFeasiblePeak=Math.max(minimumFeasiblePeak,need/(da+db));constraints.push({a,b,da,db,need});
  }
  // Zero additive tangents at each30Hz key give nonnegative smoothstep basis
  // weights. Raising either neighboring interior key can only improve all
  // already-satisfied floor inequalities, so a monotone pass suffices.
  for(const {a,b,da,db,need} of constraints){
   const deficit=need-da*heights[a]-db*heights[b];if(deficit<=0)continue;
   const denominator=da*da+db*db;
   if(da)heights[a]=Math.min(minimumFeasiblePeak,heights[a]+deficit*da/denominator);
   if(db)heights[b]=Math.min(minimumFeasiblePeak,heights[b]+deficit*db/denominator);
   let residual=need-da*heights[a]-db*heights[b];
   for(const [index,weight]of [[a,da],[b,db]])if(weight>0&&residual>1e-12){const increment=Math.min(minimumFeasiblePeak-heights[index],residual/weight);heights[index]+=increment;residual-=increment*weight;}
   if(residual>1e-8)throw Error(`Unsatisfied bridge grounding constraint ${record.id}`);
  }
  // Raise small valleys without increasing the maximum correction. This
  // softens the minimum envelope while preserving every floor inequality.
  for(let pass=0;pass<2;pass++){const previous=[...heights];for(let i=1;i<count;i++)heights[i]=Math.max(previous[i],.25*previous[i-1]+.5*previous[i]+.25*previous[i+1]);}
  record.rootLiftKeyHeightsMeters=heights;
  record.rootLiftAmplitudeMeters=Math.max(...heights);
  record.minimumFeasiblePeakMeters=minimumFeasiblePeak;
  record.predictedMinFootVertexY=Math.min(...record.minimumFootHeightsMeters.map((y,i)=>{const key=i/denseCount*count,a=Math.min(count-1,Math.floor(key)),u=key-a,wa=2*u*u*u-3*u*u+1;return y+wa*heights[a]+(1-wa)*heights[a+1];}));
  delete record.minimumFootHeightsMeters;
  delete record.requiredLiftMeters;
  // A very large correction indicates an authoring defect, not a small
  // interpolation-grounding correction. Fail rather than conceal it.
  if(record.rootLiftAmplitudeMeters>.35)throw Error(`Bridge requires excessive root lift ${record.id}: ${record.rootLiftAmplitudeMeters}`);
  const animation=document.getRoot().listAnimations().find(a=>a.getName()===record.id);
  if(record.rootLiftAmplitudeMeters>0)for(const channel of animation.listChannels()){
   if(channel.getTargetPath()!=='translation'||!['Root','MotionBallAnchor'].includes(channel.getTargetNode().getName()))continue;
   const sampler=channel.getSampler(),times=sampler.getInput().getArray(),accessor=sampler.getOutput(),values=new Float32Array(accessor.getArray());
   const cubic=sampler.getInterpolation()==='CUBICSPLINE';
   for(let i=0;i<times.length;i++){
    const lift=heights[Math.round(times[i]*30)]||0;
    if(cubic)values[i*9+4]+=lift;else values[i*3+1]+=lift;
   }
   accessor.setArray(values);
  }
  animation.setExtras({...animation.getExtras(),grounding:{method:'C1 additive Root-Y weight-shift envelope; no planted-foot claim during bridge',shape:'Nonnegative piecewise Hermite lift with zero additive tangents at all30Hz keys',keyHeightsMeters:heights,amplitudeMeters:record.rootLiftAmplitudeMeters,clearanceMeters,sampleHz,movingFootClearance:record.retainedGait?'Exempt: retained full gait':'Target grows smoothly from3mm to25mm as near-floor horizontal foot speed rises from0 to0.5m/s',movingFootClearanceSamples:record.movingFootClearanceSamples}});
 }
 return {schemaVersion:1,method:'Actual decoded footskin at120Hz determines a nonnegative C1 root lift. Piecewise Hermite keyheights at30Hz have zero additive tangents at everykey, preserving original endpoint derivatives. Generic transitions add smooth moving-foot clearance up to25mm; retained gait transitions are exempt. The transition may contain a short hop.',initialGLBSha256:createHash('sha256').update(bytes).digest('hex'),sampleHz,clearanceMeters,movingFootClearance:{maximumMeters:.025,fullClearanceAtSpeedMetersPerSecond:.5,transitionsUsing:records.filter(r=>r.movingFootClearanceSamples>0).length,retainedGaitExemptions:records.filter(r=>r.retainedGait).length},records};
}
