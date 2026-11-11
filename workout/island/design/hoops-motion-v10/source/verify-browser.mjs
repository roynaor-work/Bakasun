/** Original CC0-1.0. Exercise delivered animation GLBs on the three delivered skins. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const PACKAGE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REPOSITORY=path.resolve(PACKAGE,'../../../..');
const OUTPUT=path.join(PACKAGE,'verification');
const require=createRequire(path.join(process.env.HOOPS_V10_TOOLS||'/tmp/hoops-v10-tools','package.json'));
const {chromium}=require('playwright');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.gz':'application/octet-stream'};
const server=http.createServer(async(request,response)=>{
  try {
    const url=new URL(request.url,'http://localhost'),filename=path.resolve(REPOSITORY,'.'+decodeURIComponent(url.pathname));
    if(!filename.startsWith(REPOSITORY+path.sep)){response.writeHead(403);response.end();return;}
    const bytes=await fs.readFile(filename);
    response.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'});response.end(bytes);
  }catch(error){response.writeHead(error.code==='ENOENT'?404:500);response.end(error.code||'server error');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const url=`${base}/workout/island/design/hoops-motion-v10/preview.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const page=await context.newPage();
const httpErrors=[],requestErrors=[],pageErrors=[],consoleErrors=[],requests=new Map();
page.on('response',response=>{requests.set(response.url().replace(base,''),response.status());if(response.status()>=400)httpErrors.push({url:response.url().replace(base,''),status:response.status()});});
page.on('requestfailed',request=>requestErrors.push({url:request.url().replace(base,''),error:request.failure()?.errorText}));
page.on('pageerror',error=>pageErrors.push(error.message));
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
await page.addInitScript(()=>{window.__observedCSP=[];window.addEventListener('securitypolicyviolation',event=>window.__observedCSP.push({directive:event.effectiveDirective,blockedURI:event.blockedURI,disposition:event.disposition}));});
const result={schemaVersion:1,method:'Chromium/Playwright, actual delivered GLBs, software WebGL; not a hardware performance benchmark',viewport:{desktop:[1440,1000],mobile:[390,844]},clips:[],httpErrors,requestErrors,pageErrors,consoleErrors};
await fs.mkdir(OUTPUT,{recursive:true});
try {
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.motionPreview?.ready,{timeout:60000});
  await page.evaluate(async()=>{await window.motionPreview.ready;});
  result.webgl=await page.evaluate(()=>{const canvas=document.querySelector('canvas'),gl=canvas?.getContext('webgl2')||canvas?.getContext('webgl');if(!gl)return null;const debug=gl.getExtension('WEBGL_debug_renderer_info');return {version:gl.getParameter(gl.VERSION),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
  const catalog=await page.evaluate(()=>window.motionPreview.catalog);
  const clips=Array.isArray(catalog)?catalog:catalog.clips;
  if(!clips?.length)throw Error('Preview exposed no clips');
  for(const entry of clips){
    const clip=await page.evaluate(async id=>{const preview=window.motionPreview;await preview.load(id);const current=preview.current;return {id,duration:current?.duration||current?.meta?.durationSeconds||current?.data?.durationSeconds||0};},entry.id);
    if(!(clip.duration>0))clip.duration=entry.durationSeconds;
    const snapshots=[];
    for(const phase of [0,.25,.5,.75,1]){
      const observation=await page.evaluate(({seconds,phase})=>{
        const preview=window.motionPreview;preview.seek(seconds);
        const current=preview.current,actors=current?.actors||preview.actors;
        if(!actors)throw Error('Preview must expose current.actors or actors for actual skin inspection');
        const list=Array.isArray(actors)?actors:Object.values(actors),THREE=preview.THREE;
        if(!THREE)throw Error('Preview must expose THREE for independent skin samples');
        const states=[];
        for(const actor of list){
          const scene=actor.scene||actor.model||actor.motion||actor.motionGroup||actor.group||actor.root;
          if(!scene?.traverse)throw Error('Actor has no inspectable scene');
          const motion=actor.motion||actor.motionGroup||scene.parent?.getObjectByName('Motion')||scene;
          motion.updateMatrixWorld(true);
          const bones=[],skins=[],bounds={minimum:[Infinity,Infinity,Infinity],maximum:[-Infinity,-Infinity,-Infinity]};let sampledVertices=0,finite=true,maxQuaternionError=0,maxScaleError=0;
          scene.traverse(object=>{
            if(object.isBone){bones.push(object.name);maxQuaternionError=Math.max(maxQuaternionError,Math.abs(object.quaternion.length()-1));maxScaleError=Math.max(maxScaleError,...object.scale.toArray().map(v=>Math.abs(v-1)));}
            if(!object.isSkinnedMesh)return;
            object.skeleton.update();object.updateMatrixWorld(true);
            const positions=object.geometry.getAttribute('position'),stride=Math.max(1,Math.floor(positions.count/512));
            for(let index=0;index<positions.count;index+=stride){
              const point=new THREE.Vector3().fromBufferAttribute(positions,index);object.applyBoneTransform(index,point);object.localToWorld(point);const values=point.toArray();finite&&=values.every(Number.isFinite);values.forEach((v,k)=>{bounds.minimum[k]=Math.min(bounds.minimum[k],v);bounds.maximum[k]=Math.max(bounds.maximum[k],v);});sampledVertices++;
            }
            skins.push({name:object.name,vertices:positions.count,bones:object.skeleton.bones.map(bone=>bone.name)});
          });
          const ball=motion.getObjectByName('Ball')||scene.getObjectByName('Ball'),ballPosition=ball?ball.getWorldPosition(new THREE.Vector3()).toArray():null;
          const id=actor.profile?.id||actor.profileId||actor.id||String(states.length);
          states.push({profile:id,bones:[...new Set(bones)],skins,sampledVertices,finite,maxQuaternionError,maxScaleError,bounds,root:{position:motion.position.toArray(),quaternion:motion.quaternion.toArray()},ballPosition});
        }
        return {phase,timeSeconds:seconds,actors:states};
      },{seconds:clip.duration*phase,phase});
      snapshots.push(observation);
    }
    result.clips.push({id:entry.id,durationSeconds:clip.duration,snapshots});
    if(result.clips.length===1){await page.screenshot({path:path.join(OUTPUT,'preview-desktop.png'),fullPage:true});}
  }
  const featured=clips.find(clip=>clip.id.includes('dunk'))||clips[0];
  await page.evaluate(async id=>{await window.motionPreview.load(id,{autoplay:true});},featured.id);
  await page.waitForFunction(()=>window.motionPreview.current?.time>.06,{timeout:10000});
  result.playback=await page.evaluate(()=>({id:window.motionPreview.current.id,timeSeconds:window.motionPreview.current.time,advanced:window.motionPreview.current.time>.06}));
  await page.evaluate(seconds=>window.motionPreview.seek(seconds),featured.durationSeconds*.5);
  await page.screenshot({path:path.join(OUTPUT,'preview-desktop.png'),fullPage:true});
  const wasm=await page.evaluate(async()=>{try{await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));return {blocked:false,blockedByCSP:false};}catch(error){return {blocked:true,blockedByCSP:error.name==='CompileError'&&/content security policy/i.test(error.message),name:error.name,message:error.message};}});
  result.webAssembly=wasm;
  result.previewErrors=await page.evaluate(()=>window.motionPreview.errors||[]);
  result.csp=await page.evaluate(()=>({policy:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,violations:window.__observedCSP}));
  const escapeHTML=text=>String(text).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  async function figure(filename,title,panels){
    const sheet=await context.newPage();
    await sheet.setViewportSize({width:1400,height:1000});
    const cards=panels.map(panel=>`<figure><figcaption><b>${escapeHTML(panel.label)}</b><span dir="ltr">${panel.seconds.toFixed(2)} s</span></figcaption><img src="data:image/png;base64,${panel.image.toString('base64')}" alt="${escapeHTML(panel.label)}"></figure>`).join('');
    await sheet.setContent(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f2f0e5;color:#24453b;font:20px Arial,sans-serif}h1{font-size:28px;margin:0 0 8px}p{font-size:16px;margin:0 0 18px;color:#526b59}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;background:#fffdf4;border:1px solid #cdd2bc;border-radius:6px;overflow:hidden}figcaption{padding:12px 15px;display:flex;align-items:center;justify-content:space-between;font-size:19px}figcaption span{font-size:16px}img{display:block;width:100%;height:auto}</style><h1>${escapeHTML(title)}</h1><p>שלוש מידות גוף · 18 עצמות · 30 דגימות לשנייה · גובה טבעת 3.05 מ׳</p><div class="grid">${cards}</div></html>`,{waitUntil:'load'});
    await sheet.screenshot({path:path.join(OUTPUT,filename),fullPage:true});
    await sheet.close();
    return {file:filename,title,panels:panels.map(({label,id,seconds})=>({label,id,timeSeconds:seconds}))};
  }
  const representative=[];
  for(const id of ['dunk_high','layup_right','sprint_brake','turn_180_left','defensive_slide_left','dribble_behind_back']){
    const meta=clips.find(clip=>clip.id===id);if(!meta)continue;
    const seconds=await page.evaluate(async id=>{const preview=window.motionPreview;await preview.load(id);preview.setCamera(id.startsWith('layup')||id==='dribble_behind_back'?'side':'angle');const current=preview.current;const seconds=id.startsWith('dunk')?current.actors[0].metrics.peakTime:id.startsWith('layup')?.6:current.duration*.5;preview.seek(seconds);return seconds;},id);
    representative.push({id,label:meta.labelHe||meta.label||id,seconds,image:await page.locator('#stage').screenshot()});
  }
  result.figures=[await figure('contact-sheet.png','שישה מהלכים על שלוש הדמויות',representative)];
  const layup=clips.find(clip=>clip.id==='layup_right');
  if(layup){
    const times=await page.evaluate(async id=>{const preview=window.motionPreview;await preview.load(id);preview.setCamera('side');const events=preview.current.actors[0].data.events,gather=events.find(event=>event.type==='ball_gather')?.timeSeconds||0;const release=events.find(event=>event.type==='ball_release')?.timeSeconds||1;const plants=events.filter(event=>event.type==='foot_plant'&&event.timeSeconds>gather&&event.timeSeconds<release);const lift=events.find(event=>event.type==='foot_lift'&&event.timeSeconds>(plants[1]?.timeSeconds||0))?.timeSeconds||release-.2;const landing=events.find(event=>event.type==='foot_plant'&&event.timeSeconds>release)?.timeSeconds||preview.current.duration;return [{label:'איסוף הכדור',seconds:gather},{label:'צעד ראשון',seconds:plants[0]?.timeSeconds||.3},{label:'צעד שני והרמה',seconds:plants[1]?.timeSeconds||.6},{label:'ניתוק מהרצפה',seconds:lift},{label:'שחרור מעל הראש',seconds:release},{label:'נחיתה',seconds:landing}];},layup.id);
    const panels=[];
    for(const sample of times){await page.evaluate(seconds=>window.motionPreview.seek(seconds),sample.seconds);panels.push({...sample,id:layup.id,image:await page.locator('#stage').screenshot()});}
    result.figures.push(await figure('layup-sequence.png','צעד וחצי: איסוף, שני צעדים, הרמה ושחרור',panels));
  }
  await page.evaluate(async({id,seconds})=>{const preview=window.motionPreview;await preview.load(id);preview.setCamera('front');preview.seek(seconds);},{id:featured.id,seconds:featured.durationSeconds*.5});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{window.motionPreview.resize?.();});
  await page.screenshot({path:path.join(OUTPUT,'preview-mobile.png'),fullPage:true});
  result.mobile=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,canvas:document.querySelector('canvas')?.getBoundingClientRect().toJSON()}));
  result.requests=[...requests].map(([url,status])=>({url,status}));
  result.assetLoads={models:result.requests.filter(r=>/\/runtime\/models\/[^/]+\.glb$/.test(r.url)).length,animations:result.requests.filter(r=>/\/runtime\/clips\/[^/]+\/[^/]+\.glb$/.test(r.url)).length,keyframes:result.requests.filter(r=>/\/runtime\/keyframes\/[^/]+\/[^/]+\.json$/.test(r.url)).length};
  const canonical=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
  const actorPass=result.clips.every(clip=>clip.snapshots.every(snapshot=>snapshot.actors.length===3&&snapshot.actors.every(actor=>actor.finite&&actor.skins.length>0&&actor.bones.length===canonical.length&&canonical.every(name=>actor.bones.includes(name))&&actor.skins.every(skin=>skin.bones.length===canonical.length)&&actor.maxQuaternionError<1e-5&&actor.maxScaleError<1e-8&&actor.ballPosition?.every(Number.isFinite))));
  result.pass=actorPass&&!!result.webgl&&wasm.blockedByCSP&&result.playback.advanced&&httpErrors.length===0&&requestErrors.length===0&&pageErrors.length===0&&result.previewErrors.length===0&&result.mobile.document<=result.mobile.viewport+1&&result.assetLoads.models===3&&result.assetLoads.animations===clips.length*3&&result.assetLoads.keyframes===clips.length*3;
}catch(error){result.error={message:error.message,stack:error.stack};result.pass=false;}
finally {
  await fs.mkdir(OUTPUT,{recursive:true});
  await fs.writeFile(path.join(OUTPUT,'browser.json'),JSON.stringify(result,null,2)+'\n');
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
console.log(JSON.stringify({pass:result.pass,clips:result.clips.length,error:result.error?.message,httpErrors:result.httpErrors.length,pageErrors:result.pageErrors.length,webAssembly:result.webAssembly},null,2));
if(!result.pass)process.exitCode=1;
