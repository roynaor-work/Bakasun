#!/usr/bin/env node
// Independent vertex-space audit of the actual decoded, posed meshes in Three r160.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/hoops-v7-tools/package.json');
const {chromium}=require('playwright');
const baked=process.argv.includes('--baked');
const selectedRoles=process.argv.includes('--roles')?process.argv[process.argv.indexOf('--roles')+1].split(','):null;
const hz=Math.max(12,Number(process.argv[process.argv.indexOf('--hz')+1])||30);
const frozen=await fs.mkdtemp('/tmp/hoops-v7-skin-');
async function freeze(folder=root,rel=''){for(const e of await fs.readdir(folder,{withFileTypes:true})){if(['iterations','verification','standalone.html'].includes(e.name))continue;const n=path.join(rel,e.name),p=path.join(folder,e.name),q=path.join(frozen,n);if(e.isDirectory()){await fs.mkdir(q,{recursive:true});await freeze(p,n);}else await fs.copyFile(p,q);}}
await freeze();
if(process.argv.includes('--models-dir')){
 const supplied=path.resolve(process.argv[process.argv.indexOf('--models-dir')+1]);
 for(const name of await fs.readdir(supplied))if(name.endsWith('.glb'))await fs.copyFile(path.join(supplied,name),path.join(frozen,'models',name));
}
const files=(await fs.readdir(path.join(frozen,'models'))).filter(n=>n.endsWith('.glb'));
const auditFiles=[...files.map(name=>'models/'+name),'source/motion.mjs','model-authoring.json','rig.json','vendor/three.module.js','vendor/GLTFLoader.js','vendor/DRACOLoader.js','vendor/meshopt_decoder.module.js'];
async function hashes(){return Promise.all(auditFiles.map(async file=>({file,sha256:createHash('sha256').update(await fs.readFile(path.join(frozen,file))).digest('hex')})));}
const inputs=await hashes();
const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const server=http.createServer(async(req,res)=>{try{const url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(url==='/favicon.ico'){res.writeHead(204);res.end();return;}if(url==='/audit.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body>Vertex audit</body></html>');return;}const p=path.resolve(frozen,'.'+(url==='/'?'/index.html':url));if(!p.startsWith(frozen+path.sep))throw Error('path');const b=await fs.readFile(p);res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],externalRequests=[];
page.on('pageerror',error=>errors.push(String(error)));
await page.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin)||u.startsWith('blob:')||u.startsWith('data:'))return route.continue();externalRequests.push(u);return route.abort();});
let result;
try{
 await page.goto(origin+(baked?'/audit.html':'/index.html?capture=1'));
 if(!baked){await page.waitForFunction(()=>!!window.__hoopsLab,null,{timeout:120000});await page.evaluate(async()=>{await window.__hoopsLab.ready;window.__hoopsLab.pause(true);window.__hoopsLab.setView('near');});}
 result=await page.evaluate(async({hz,baked,selectedRoles})=>{
  const THREE=await import('./vendor/three.module.js');let api=window.__hoopsLab;
  if(baked){
   const [{GLTFLoader},{DRACOLoader},utils,motion,metadata,rig,{MeshoptDecoder}]=await Promise.all([
    import('./vendor/GLTFLoader.js'),import('./vendor/DRACOLoader.js'),import('./vendor/SkeletonUtils.js'),import('./source/motion.mjs'),
    fetch('./model-authoring.json').then(r=>r.json()),fetch('./rig.json').then(r=>r.json()),import('./vendor/meshopt_decoder.module.js'),
   ]);
   await MeshoptDecoder.ready;
   const decoder=new DRACOLoader().setDecoderPath('vendor/draco/').setDecoderConfig({type:'wasm'}).setWorkerLimit(2),loader=new GLTFLoader().setDRACOLoader(decoder).setMeshoptDecoder(MeshoptDecoder);
   api={actors:[],actions:motion.ACTIONS,selectRole(){},setLOD(){}};
   try{for(const profile of metadata.profiles.filter(p=>!selectedRoles||selectedRoles.includes(p.id)))for(const level of[0,1]){
    const gltf=await loader.loadAsync('models/'+profile.id+(level?'-lod1':'')+'.glb'),root=gltf.scene,ghost=utils.clone(root);
    const controller=motion.createMotionController(ghost,{profile:{...profile,...rig.profiles[profile.id]}});
    const anchor=root.getObjectByName('MotionBallAnchor');if(!anchor)throw Error('Missing baked MotionBallAnchor: '+profile.id+' LOD'+level);
    api.actors.push({id:profile.id,auditLOD:level,root,roots:[root],controller,mixer:new THREE.AnimationMixer(root),clips:gltf.animations,anchor});
   }}finally{decoder.dispose();}
  }
  if(selectedRoles&&!baked)api={...api,actors:api.actors.filter(a=>selectedRoles.includes(a.id))};
  const v=new THREE.Vector3(),center=new THREE.Vector3(),models=[],records=[];
  for(const actor of api.actors){
   api.selectRole(actor.id);
   for(let level=0;level<actor.roots.length;level++){
    const root=actor.roots[level],parts=[];
    root.updateWorldMatrix(true,true);
    root.traverse(mesh=>{
     if(!mesh.isSkinnedMesh)return;
     const skeleton=mesh.skeleton,position=mesh.geometry.attributes.position,joints=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
     const names=skeleton.bones.map(b=>b.name),hand={left:[],right:[]},feet={left:[],right:[]};
     for(let i=0;i<position.count;i++){
      const row=[joints.getX(i),joints.getY(i),joints.getZ(i),joints.getW(i)],w=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)];
      for(const [side,prefix]of[['left','Left'],['right','Right']]){
       if(row.reduce((n,j,k)=>n+(names[j]===prefix+'Hand'?w[k]:0),0)>.50)hand[side].push(i);
       if(row.reduce((n,j,k)=>n+(names[j]===prefix+'Foot'?w[k]:0),0)>.50)feet[side].push(i);
      }
     }
     parts.push({mesh,hand,feet,all:Array.from({length:position.count},(_,i)=>i)});
    });
    models.push({actor,level:actor.auditLOD??level,root,parts});
   }
  }
  for(const model of models){
   const {actor,root,parts,level}=model;
   api.selectRole(actor.id);api.setLOD(level?'low':'high');
   for(const action of api.actions){
    const controller=actor.controller;controller.setAction(action.id,{immediate:true});
    let clip=null;
    if(baked){
     clip=actor.clips.find(c=>c.name===action.id);if(!clip)throw Error('Missing baked clip '+actor.id+'/'+action.id);
     actor.mixer.stopAllAction();actor.mixer.setTime(0);
     const playback=actor.mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce,1);playback.clampWhenFinished=true;playback.play();
    }
    const steps=Math.max(2,Math.ceil(action.duration*hz));
    const row={role:actor.id,lod:level,action:action.id,samples:steps+1,handContacts:0,
     minFootVertexY:Infinity,maxSupportedSoleGap:0,maxHandPenetration:0,maxNearestHandSurfaceGap:0,
     worstFloorPhase:null,worstHandPhase:null,worstHandSide:null,nonFiniteVertices:0,missingDeclaredBallFrames:0,fallBodyMinimumY:null,worstBodyPhase:null,worstBodyMesh:null,worstBodyVertex:null};
    for(let sample=0;sample<=steps;sample++){
     const phase=sample/steps;controller.seek(phase);if(baked)actor.mixer.setTime(phase*clip.duration);root.updateWorldMatrix(true,true);
     const diag=controller.getDiagnostics();
     if(baked){
      const actualVisible=actor.anchor.getWorldScale(new THREE.Vector3()).lengthSq()>1e-8;
      if(diag.ballVisible&&!actualVisible)row.missingDeclaredBallFrames++;
      const actual=root.worldToLocal(actor.anchor.getWorldPosition(new THREE.Vector3()));diag.ballPosition=actual.toArray();diag.ballVisible=actualVisible;
     }
     for(const part of parts)part.mesh.skeleton.update();
     for(const side of ['left','right']){
      let sole=Infinity;
      for(const part of parts)for(const index of part.feet[side]){
       part.mesh.getVertexPosition(index,v).applyMatrix4(part.mesh.matrixWorld);
       // Actors are laid out at y=0; world transform is included independently.
       if(!Number.isFinite(v.y))row.nonFiniteVertices++;else sole=Math.min(sole,v.y);
      }
      if(sole<row.minFootVertexY){row.minFootVertexY=sole;row.worstFloorPhase=phase;}
      if(diag.footErrors?.[side]?.support)row.maxSupportedSoleGap=Math.max(row.maxSupportedSoleGap,sole);
      const contact=diag.contact?.some(c=>c.effector===(side==='left'?'LeftHand':'RightHand'));
      if(!contact||!diag.ballVisible)continue;
      center.fromArray(diag.ballPosition);actor.root.localToWorld(center);
      let nearest=Infinity,penetration=0,vertices=0;
      for(const part of parts)for(const index of part.hand[side]){
       part.mesh.getVertexPosition(index,v).applyMatrix4(part.mesh.matrixWorld);
       const distance=v.distanceTo(center);if(!Number.isFinite(distance)){row.nonFiniteVertices++;continue;}
       vertices++;nearest=Math.min(nearest,Math.abs(distance-.12));penetration=Math.max(penetration,.12-distance);
      }
      if(vertices){row.handContacts++;if(penetration>row.maxHandPenetration){row.maxHandPenetration=penetration;row.worstHandPhase=phase;row.worstHandSide=side;}row.maxNearestHandSurfaceGap=Math.max(row.maxNearestHandSurfaceGap,nearest);}
     }
     if(action.id==='fall'){
      let bodyY=Infinity;
      for(const part of parts)for(const index of part.all){part.mesh.getVertexPosition(index,v).applyMatrix4(part.mesh.matrixWorld);if(v.y<bodyY){bodyY=v.y;if(row.fallBodyMinimumY===null||v.y<row.fallBodyMinimumY){row.worstBodyPhase=phase;row.worstBodyMesh=part.mesh.name;row.worstBodyVertex=index;}}}
      row.fallBodyMinimumY=row.fallBodyMinimumY===null?bodyY:Math.min(row.fallBodyMinimumY,bodyY);
     }
    }
    row.floorPass=row.minFootVertexY>=-.010&&(row.fallBodyMinimumY===null||row.fallBodyMinimumY>=-.015);
    row.handPass=row.maxHandPenetration<=.020&&row.maxNearestHandSurfaceGap<=.020;
    row.pass=row.floorPass&&row.handPass&&row.nonFiniteVertices===0&&row.missingDeclaredBallFrames===0;
    records.push(row);
   }
  }
  return{sampleHz:hz,records,totals:{poseSamples:records.reduce((n,r)=>n+r.samples,0),handContacts:records.reduce((n,r)=>n+r.handContacts,0)},
   thresholds:{floorPenetrationMeters:.010,fallBodyPenetrationMeters:.015,handPenetrationMeters:.020,nearestHandVertexSurfaceGapMeters:.020},
   scope:(baked?'Actual decoded GLBs played by a fresh AnimationMixer with NO runtime IK modifying the baked root. Ghost runtime clone provides declared contact/support windows only; sphere centre/visibility come from the baked MotionBallAnchor. ':'Live controller posed meshes. ')+'Actual Three.js skinned/morphed vertices, not virtual IK palm markers. Foot-dominant vertices sampled for all actions; all vertices additionally sampled for fall. Hand-dominant vertices sampled only during declared full contact. This measures vertices, not continuous triangle/ball collision or physical simulation.',
   pass:records.every(r=>r.pass)};
 },{hz,baked,selectedRoles});
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
const after=await hashes(),changed=inputs.filter(a=>!after.some(b=>a.file===b.file&&a.sha256===b.sha256));
const report={schemaVersion:1,generatedAtUtc:new Date().toISOString(),mode:baked?'baked-animation-mixer':'live-controller',selectedRoles:selectedRoles||'all-six',frozenSourceDirectory:frozen,inputs,changedDuringAudit:changed,errors,externalRequests,...result,pass:result?.pass&&changed.length===0&&errors.length===0&&externalRequests.length===0};
const reportName=(baked?'skin-baked':'skin')+(selectedRoles?'-'+selectedRoles.join('-'):'')+'-validation.json';
await fs.writeFile(path.join(root,'verification',reportName),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,totals:report.totals,failures:report.records?.filter(r=>!r.pass),errors,changedDuringAudit:changed}));
if(!report.pass)process.exitCode=1;
