#!/usr/bin/env node
/** Fine-time audit of the actual measured-skin controller, independent of GLB
 * export sampling. Detects reach correction at the release boundary and reports
 * elbow extension from forward kinematics. No existing repository file is read
 * as executable code or changed. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire('/tmp/hoops-technique-tools/package.json'),{chromium}=require('playwright');
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const html=`<!doctype html><script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script><script type="module">import*as THREE from'/vendor/three.module.js';import{GLTFLoader}from'/vendor/GLTFLoader.js';import{DRACOLoader}from'/vendor/DRACOLoader.js';import{MeshoptDecoder}from'/vendor/meshopt_decoder.module.js';import{ACTIONS,createMotionController}from'/source/motion.mjs';import{techniquePose}from'/source/technique-poses.mjs';window.audit={THREE,ACTIONS,createMotionController,techniquePose,loader:new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/vendor/draco/')).setMeshoptDecoder(MeshoptDecoder)};</script>`;
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost').pathname;if(u==='/audit.html'){res.setHeader('Content-Type','text/html');res.end(html);return;}if(u==='/favicon.ico'){res.writeHead(204);res.end();return;}const file=path.resolve(root,'.'+decodeURIComponent(u));if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();page.on('pageerror',e=>console.error(e));await page.goto(`http://127.0.0.1:${server.address().port}/audit.html`);await page.waitForFunction(()=>window.audit);
 const profile=JSON.parse(await fs.readFile(path.join(root,'authoring-profile.json'),'utf8'));
 const records=await page.evaluate(async profile=>{
  const{THREE,ACTIONS,createMotionController,techniquePose,loader}=window.audit,gltf=await loader.loadAsync('/models/athlete-bind.glb'),root=gltf.scene,c=createMotionController(root,{profile,id:'ref_idle'}),m=c.measurements,records=[];
  const diff=(a,b)=>a.map((v,i)=>v-b[i]),len=a=>Math.hypot(...a),point=name=>root.getObjectByName(name).getWorldPosition(new THREE.Vector3());
  const handParts=[];root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const pos=mesh.geometry.attributes.position,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;if(!indices||!weights)return;const hands={left:[],right:[]};for(let i=0;i<pos.count;i++)for(const[side,name]of[['left','LeftHand'],['right','RightHand']]){let w=0;for(let k=0;k<4;k++)if(mesh.skeleton.bones[indices.getComponent(i,k)]?.name===name)w+=weights.getComponent(i,k);if(w>.5)hands[side].push(i);}handParts.push({mesh,hands});});
  for(const a of ACTIONS.filter(a=>a.releaseFrame!==undefined)){
   c.setAction(a.id,{immediate:true});const r=a.releaseFrame/30,eps=.0001;
   function sample(seconds){c.seek(seconds/a.duration);const s=c.snapshot(),p=point('RightArm'),e=point('RightForeArm'),w=point('RightHand'),internal=p.clone().sub(e).angleTo(w.clone().sub(e))*180/Math.PI;const hip=point('RightUpLeg'),knee=point('RightLeg'),ankle=point('RightFoot'),kneeFlexion=180-hip.clone().sub(knee).angleTo(ankle.clone().sub(knee))*180/Math.PI;return{ball:s.ballAnchor.position,hand:w.toArray(),grips:s.morphs.flatMap(x=>x.weights),elbowDegrees:internal,kneeFlexionDegrees:kneeFlexion,shoulder:p.toArray(),elbow:e.toArray(),palm:s.handContactErrorMeters};}
   const l2=sample(r-2*eps),l=sample(r-eps),at=sample(r),rr=sample(r+eps),r2=sample(r+2*eps),planned=techniquePose(a.id,r/a.duration,m),desired=planned.ball.map((v,i)=>v+planned.rootTravel[i]);
   const before=at.ball.map((v,i)=>(3*v-4*l.ball[i]+l2.ball[i])/(2*eps)),after=at.ball.map((v,i)=>(-3*v+4*rr.ball[i]-r2.ball[i])/(2*eps));
   let maxSkinPenetration=0,maxSkinGap=0,maxPalmResidual=0,worstSkin=null,skinSamples=0;
   const frameCenters=[a.releaseFrame-1];if(a.id.includes('behind_back'))frameCenters.push(5.5);if(a.id==='alley_oop_dunk')frameCenters.push(25.75);
   for(const center of frameCenters)for(let f=Math.max(0,center-2);f<=Math.min(a.frames,center+2)+1e-8;f+=.25){
    c.seek(f/30/a.duration);const s=c.snapshot(),ball=new THREE.Vector3(...s.ballAnchor.position),v=new THREE.Vector3();for(const part of handParts)part.mesh.skeleton.update();
    for(const[side,name]of[['left','LeftHand'],['right','RightHand']])if(s.pose[side].contact>.9999){
     skinSamples++;let penetration=0,nearest=Infinity;for(const part of handParts)for(const index of part.hands[side]){part.mesh.getVertexPosition(index,v).applyMatrix4(part.mesh.matrixWorld);const distance=v.distanceTo(ball);penetration=Math.max(penetration,m.ballRadius-distance);nearest=Math.min(nearest,Math.abs(distance-m.ballRadius));}
     if(penetration>maxSkinPenetration){maxSkinPenetration=penetration;worstSkin={frame:f,side};}maxSkinGap=Math.max(maxSkinGap,nearest);const palm=new THREE.Vector3(...m.handFrames[side].center).applyMatrix4(root.getObjectByName(name).matrixWorld);maxPalmResidual=Math.max(maxPalmResidual,Math.abs(palm.distanceTo(ball)-m.ballRadius));
    }
   }
   let catchAudit=null;if(a.id==='alley_oop_dunk'){
    const time=20/30,l2=sample(time-2*eps),l=sample(time-eps),at=sample(time),r=sample(time+eps),r2=sample(time+2*eps),incoming=at.hand.map((v,i)=>(3*v-4*l.hand[i]+l2.hand[i])/(2*eps)),outgoing=at.hand.map((v,i)=>(-3*v+4*r.hand[i]-r2.hand[i])/(2*eps));
    catchAudit={frame:20,handC0StepMeters:len(diff(at.hand,l.hand)),handC1ResidualMetersPerSecond:len(diff(incoming,outgoing)),gripC0Step:Math.max(...at.grips.map((v,i)=>Math.abs(v-l.grips[i]))),pass:len(diff(at.hand,l.hand))<.001&&len(diff(incoming,outgoing))<.30&&Math.max(...at.grips.map((v,i)=>Math.abs(v-l.grips[i])))<.001};
   }
   records.push({id:a.id,releaseFrame:a.releaseFrame,actualBallRelease:at.ball,authoredBallRelease:desired,releaseCorrectionMeters:len(diff(at.ball,desired)),ballC1ResidualMetersPerSecond:len(diff(before,after)),rightElbowDegrees:at.elbowDegrees,rightKneeFlexionDegrees:at.kneeFlexionDegrees,rightShoulder:at.shoulder,rightElbow:at.elbow,rightWrist:at.hand,handC0ResidualMeters:len(diff(at.hand,rr.hand)),palmResidualMeters:at.palm,catchAudit,sourceSurfaceAudit:{sampleHz:120,samples:skinSamples,maxHandVertexPenetrationMeters:maxSkinPenetration,maxNearestHandVertexGapMeters:maxSkinGap,maxPalmResidualMeters:maxPalmResidual,worstSkin}});
  }
  c.dispose();return records;
 },profile);
 const sources=await Promise.all(['source/technique-poses.mjs','source/motion.mjs','source/audit-technique.mjs','models/athlete-bind.glb'].map(async file=>({file,sha256:createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')})));
 const report={schemaVersion:1,sampleEpsilonSeconds:.0001,scope:'Fine-time live controller FK and measured-skin reach audit plus actual source hand vertices at120Hz around release and reported quarter-key trouble spots. Independent exported GLB measurements are in motion-qa-v1.json.',sources,records,pass:records.every(r=>r.releaseCorrectionMeters<.003&&r.ballC1ResidualMetersPerSecond<.30&&r.handC0ResidualMeters<.003&&r.sourceSurfaceAudit.maxHandVertexPenetrationMeters<=.02&&r.sourceSurfaceAudit.maxPalmResidualMeters<=.003&&(!r.catchAudit||r.catchAudit.pass))};
 await fs.writeFile(path.join(root,'verification/technique-audit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
