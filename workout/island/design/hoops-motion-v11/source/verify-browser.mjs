/** Original CC0-1.0. Load and exercise every shipped animation on every skin. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const PACKAGE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUTPUT=path.join(PACKAGE,'verification');
const require=createRequire(path.join(process.env.HOOPS_V11_TOOLS||'/tmp/hoops-v11-tools','package.json'));
const {chromium}=require('playwright'),sharp=require('sharp');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.md':'text/plain; charset=utf-8'};
// Serve only this package: successful loading proves no sibling design checkout
// or remote CDN is silently supplying a runtime dependency.
const server=http.createServer(async(request,response)=>{
  try{
    const url=new URL(request.url,'http://localhost'),relative=decodeURIComponent(url.pathname).replace(/^\//,''),filename=path.resolve(PACKAGE,relative||'preview.html');
    if(!filename.startsWith(PACKAGE+path.sep)){response.writeHead(403);response.end();return;}
    const bytes=await fs.readFile(filename);
    response.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store'});response.end(bytes);
  }catch(error){response.writeHead(error.code==='ENOENT'?404:500);response.end(error.code||'server error');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1});
const page=await context.newPage(),requests=new Map();
const result={schemaVersion:1,method:'Chromium/Playwright software WebGL, actual delivered GLB animation mixers and skinned vertex samples; package-only HTTP server; not a hardware performance benchmark.',viewports:{desktop:[1440,1050],mobile:[390,844]},clips:[],httpErrors:[],requestErrors:[],pageErrors:[],consoleErrors:[]};
page.on('response',response=>{requests.set(response.url().replace(base,''),response.status());if(response.status()>=400)result.httpErrors.push({url:response.url().replace(base,''),status:response.status()});});
page.on('requestfailed',request=>result.requestErrors.push({url:request.url().replace(base,''),error:request.failure()?.errorText}));
page.on('pageerror',error=>result.pageErrors.push(error.message));
page.on('console',message=>{if(message.type()==='error')result.consoleErrors.push(message.text());});
await page.addInitScript(()=>{
  window.__observedCSP=[];
  window.addEventListener('securitypolicyviolation',event=>window.__observedCSP.push({directive:event.effectiveDirective,blockedURI:event.blockedURI,disposition:event.disposition}));
});
await fs.mkdir(OUTPUT,{recursive:true});

async function inspectAt(seconds){
  return page.evaluate(seconds=>{
    const preview=window.__hoopsV11;preview.seek(seconds);preview.render?.();
    const THREE=preview.THREE;
    if(!THREE)throw Error('Preview exposes no THREE for independent skin samples');
    const list=Array.isArray(preview.actors)?preview.actors:Object.values(preview.actors||{});
    const actors=list.map(actor=>{
      const scene=actor.model||actor.scene,motion=actor.motion||actor.motionGroup||scene;
      if(!scene?.traverse)throw Error('Actor has no actual model scene');
      motion.updateMatrixWorld(true);
      const bones=[],skins=[],bounds={minimum:[Infinity,Infinity,Infinity],maximum:[-Infinity,-Infinity,-Infinity]};
      let sampledVertices=0,finite=true,maxQuaternionError=0,maxScaleError=0;
      scene.traverse(object=>{
        if(object.isBone){bones.push(object.name);maxQuaternionError=Math.max(maxQuaternionError,Math.abs(object.quaternion.length()-1));maxScaleError=Math.max(maxScaleError,...object.scale.toArray().map(v=>Math.abs(v-1)));}
        if(!object.isSkinnedMesh)return;
        object.skeleton.update();object.updateMatrixWorld(true);
        const positions=object.geometry.getAttribute('position'),stride=Math.max(1,Math.floor(positions.count/384));
        for(let index=0;index<positions.count;index+=stride){
          const point=new THREE.Vector3().fromBufferAttribute(positions,index);object.applyBoneTransform(index,point);object.localToWorld(point);
          const values=point.toArray();finite&&=values.every(Number.isFinite);values.forEach((v,k)=>{bounds.minimum[k]=Math.min(bounds.minimum[k],v);bounds.maximum[k]=Math.max(bounds.maximum[k],v);});sampledVertices++;
        }
        skins.push({name:object.name,vertices:positions.count,bones:object.skeleton.bones.map(bone=>bone.name)});
      });
      const ball=actor.ball||motion.getObjectByName('Ball');
      const ballWorld=ball?.getWorldPosition(new THREE.Vector3()).toArray();
      const data=actor.data,frames=data.keyframes,t=Math.max(0,Math.min(1,seconds/data.durationSeconds));
      let lo=0,hi=frames.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(frames[mid].time<=t)lo=mid;else hi=mid;}
      const a=frames[lo],b=frames[hi],u=Math.max(0,Math.min(1,(t-a.time)/(b.time-a.time||1)));
      const linear=(x,y)=>x.map((v,i)=>v+(y[i]-v)*u),qlinear=(x,y)=>new THREE.Quaternion(...x).slerp(new THREE.Quaternion(...y),u).toArray();
      const vectorError=(x,y)=>Math.hypot(...x.map((v,i)=>v-y[i])),quaternionError=(x,y)=>Math.min(vectorError(x,y),vectorError(x,y.map(v=>-v)));
      let maximumBoneQuaternionParityError=0;
      for(const name of Object.keys(a.rotations)){const bone=scene.getObjectByName(name);if(!bone)throw Error(`Missing rendered bone ${name}`);maximumBoneQuaternionParityError=Math.max(maximumBoneQuaternionParityError,quaternionError(bone.quaternion.toArray(),qlinear(a.rotations[name],b.rotations[name])));}
      const hips=scene.getObjectByName('Hips'),rest=actor.profile.joints.find(j=>j.name==='Hips').translation,offset=linear(a.hipsOffsetMeters,b.hipsOffsetMeters);
      const parity={maximumBoneQuaternionParityError,hipsPositionErrorMeters:vectorError(hips.position.toArray(),rest.map((v,i)=>v+offset[i])),rootPositionErrorMeters:vectorError(motion.position.toArray(),linear(a.referenceRootTranslationMeters,b.referenceRootTranslationMeters)),rootQuaternionError:quaternionError(motion.quaternion.toArray(),qlinear(a.rootRotationQuaternion,b.rootRotationQuaternion)),ballLocalPositionErrorMeters:vectorError(ball.position.toArray(),linear(a.ballPositionMeters,b.ballPositionMeters))};
      return {profile:actor.profile?.id||actor.profileId,dataProfile:data.profileId,dataId:data.id,bones:[...new Set(bones)],skins,sampledVertices,finite,maxQuaternionError,maxScaleError,bounds,root:{position:motion.position.toArray(),quaternion:motion.quaternion.toArray()},ballWorld,parity,animationTracks:actor.action?.getClip?.().tracks.length||null,animationName:actor.action?.getClip?.().name||null};
    });
    return {timeSeconds:seconds,actors};
  },seconds);
}

async function select(id){
  await page.evaluate(async id=>{await window.__hoopsV11.selectClip(id);},id);
}
async function capture(id,seconds){
  await select(id);await inspectAt(seconds);
  return page.locator('#stage').screenshot();
}
async function makeSheet(filename,panels){
  const width=1280,cellWidth=640,captionHeight=46,margin=10,rows=Math.ceil(panels.length/2),cellHeight=340;
  const composite=[];
  for(let index=0;index<panels.length;index++){
    const panel=panels[index],left=(index%2)*cellWidth,top=Math.floor(index/2)*cellHeight;
    const svg=`<svg width="${cellWidth}" height="${captionHeight}"><rect width="100%" height="100%" fill="#122723"/><text x="16" y="28" fill="#eaf2e7" font-family="sans-serif" font-size="17">${panel.id.replace(/[<&]/g,'')} · ${panel.seconds.toFixed(2)}s</text></svg>`;
    composite.push({input:Buffer.from(svg),left,top});
    composite.push({input:await sharp(panel.image).resize(cellWidth-margin*2,cellHeight-captionHeight-margin*2,{fit:'contain',background:'#0d1716'}).png().toBuffer(),left:left+margin,top:top+captionHeight+margin});
  }
  await sharp({create:{width,height:rows*cellHeight,channels:3,background:'#0d1716'}}).composite(composite).png().toFile(path.join(OUTPUT,filename));
  return {path:filename,panels:panels.map(({id,seconds})=>({id,timeSeconds:seconds}))};
}

try{
  await page.goto(`${base}/preview.html`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__hoopsV11?.ready,{timeout:60000});
  await page.evaluate(async()=>{await window.__hoopsV11.ready;});
  result.webgl=await page.evaluate(()=>{
    const canvas=document.querySelector('canvas'),gl=canvas?.getContext('webgl2')||canvas?.getContext('webgl');if(!gl)return null;
    const debug=gl.getExtension('WEBGL_debug_renderer_info');return {version:gl.getParameter(gl.VERSION),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  });
  const catalog=await page.evaluate(()=>window.__hoopsV11.catalog),clips=catalog.clips||catalog;
  if(clips.length!==30)throw Error(`Expected 30 clips, found ${clips.length}`);
  await page.waitForFunction(()=>window.__hoopsV11.state.timeSeconds>.05,{timeout:15000});
  result.playback=await page.evaluate(()=>({id:window.__hoopsV11.state.id,timeSeconds:window.__hoopsV11.state.timeSeconds,advanced:window.__hoopsV11.state.timeSeconds>.05}));
  for(const meta of clips){
    await select(meta.id);
    const snapshots=[];
    for(const phase of [0,.25,.5,.75,1])snapshots.push(await inspectAt(meta.durationSeconds*phase));
    result.clips.push({id:meta.id,durationSeconds:meta.durationSeconds,snapshots});
    console.log(`BROWSER ${meta.id}: 3 skins × 5 poses`);
  }
  const featureIds=[];
  for(const expression of [/crossover/,/between/,/behind.*dribble|dribble.*behind/,/chest/,/jump_shot|shot_jump/,/three.*catch|catch.*three/,/rebound/,/shot_block|block_shot/,/screen/,/intercept/]){
    const meta=clips.find(c=>expression.test(c.id));if(meta&&!featureIds.includes(meta.id))featureIds.push(meta.id);
  }
  const panels=[];
  for(const id of featureIds){
    const meta=clips.find(c=>c.id===id),events=await page.evaluate(async id=>{await window.__hoopsV11.selectClip(id);return window.__hoopsV11.actors[0].data.events;},id);
    const release=events.find(e=>e.type==='ball_release'&&e.bounceIndex===undefined);
    const interesting=['shot','pass'].includes(meta.kind)?release:events.find(e=>['ball_floor_contact','ball_catch','ball_deflect'].includes(e.type))||release;
    const seconds=interesting?.timeSeconds??meta.durationSeconds*.5;
    panels.push({id,seconds,image:await capture(id,seconds)});
  }
  result.figures=[await makeSheet('contact-sheet.png',panels)];
  // A full bounce sequence makes the return-to-palm requirement inspectable.
  const dribble=clips.find(c=>/crossover/.test(c.id))||clips.find(c=>c.kind==='dribble');
  if(dribble){
    await select(dribble.id);
    const events=await page.evaluate(()=>window.__hoopsV11.actors[0].data.events);
    const moments=events.filter(e=>['ball_release','ball_floor_contact','ball_return'].includes(e.type)).slice(0,6),sequence=[];
    for(const event of moments)sequence.push({id:`${dribble.id} / ${event.type}`,seconds:event.timeSeconds,image:await capture(dribble.id,event.timeSeconds)});
    result.figures.push(await makeSheet('dribble-sequence.png',sequence));
  }
  const representative=clips.find(c=>/jump_shot|shot_jump/.test(c.id))||clips[0];
  await select(representative.id);
  const representativeTime=await page.evaluate(()=>window.__hoopsV11.actors[0].data.ball.releaseTimeSeconds||window.__hoopsV11.state.durationSeconds*.5);
  await capture(representative.id,representativeTime);
  await page.screenshot({path:path.join(OUTPUT,'preview-desktop.png'),fullPage:true});
  result.desktop=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,canvas:document.querySelector('canvas')?.getBoundingClientRect().toJSON()}));
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{window.__hoopsV11.resize?.();window.__hoopsV11.render?.();});
  await page.screenshot({path:path.join(OUTPUT,'preview-mobile.png'),fullPage:true});
  result.mobile=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,canvas:document.querySelector('canvas')?.getBoundingClientRect().toJSON()}));
  result.runtimeConsoleErrors=result.consoleErrors.slice();
  result.webAssembly=await page.evaluate(async()=>{
    try{await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));return {blocked:false,blockedByCSP:false};}
    catch(error){return {blocked:true,blockedByCSP:error.name==='CompileError'&&/content security policy/i.test(error.message),name:error.name,message:error.message};}
  });
  result.previewErrors=await page.evaluate(()=>window.__hoopsV11.errors||[]);
  result.csp=await page.evaluate(()=>({policy:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,violations:window.__observedCSP}));
  result.requests=[...requests].map(([url,status])=>({url,status}));
  result.assetLoads={models:result.requests.filter(r=>/\/runtime\/models\/[^/]+\.glb$/.test(r.url)).length,animations:result.requests.filter(r=>/\/runtime\/clips\/[^/]+\/[^/]+\.glb$/.test(r.url)).length,keyframes:result.requests.filter(r=>/\/runtime\/keyframes\/[^/]+\/[^/]+\.json$/.test(r.url)).length};
  // Prefix-independent local server paths begin with /runtime/.
  const canonical=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
  const actorPass=result.clips.every(clip=>clip.snapshots.every(snapshot=>snapshot.actors.length===3&&snapshot.actors.map(actor=>actor.profile).sort().join(',')==='center,guard,wing'&&snapshot.actors.every(actor=>actor.profile===actor.dataProfile&&actor.dataId===clip.id&&actor.animationName===clip.id&&actor.finite&&actor.skins.length>0&&actor.sampledVertices>0&&actor.bones.length===canonical.length&&canonical.every(name=>actor.bones.includes(name))&&actor.skins.every(skin=>skin.bones.length===canonical.length)&&actor.maxQuaternionError<1e-5&&actor.maxScaleError<1e-8&&actor.ballWorld?.every(Number.isFinite)&&actor.animationTracks>=22&&Object.values(actor.parity).every(error=>error<2e-5))));
  result.pass=actorPass&&!!result.webgl&&result.webAssembly.blockedByCSP&&result.playback.advanced&&result.httpErrors.length===0&&result.requestErrors.length===0&&result.pageErrors.length===0&&result.runtimeConsoleErrors.length===0&&result.previewErrors.length===0&&result.mobile.document<=result.mobile.viewport+1&&result.desktop.document<=result.desktop.viewport+1&&result.assetLoads.models===3&&result.assetLoads.animations===clips.length*3&&result.assetLoads.keyframes===clips.length*3;
  result.actorPass=actorPass;
}catch(error){result.error={message:error.message,stack:error.stack};result.pass=false;}
finally{
  await fs.writeFile(path.join(OUTPUT,'browser.json'),JSON.stringify(result,null,2)+'\n');
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
console.log(JSON.stringify({pass:result.pass,clips:result.clips.length,error:result.error?.message,httpErrors:result.httpErrors.length,pageErrors:result.pageErrors.length,assetLoads:result.assetLoads,webAssembly:result.webAssembly},null,2));
if(!result.pass)process.exitCode=1;
