/** CC0-1.0. Real Chromium loading/rendering with WebAssembly forbidden by CSP.
 * Usage: node verification/browser-check.mjs [--executable /usr/bin/chromium]
 * Optional PLAYWRIGHT_MODULE points to an installed Playwright entrypoint.
 * Optional --spotchecks /absolute/temp/folder writes extra local review captures.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const base=new URL('../',import.meta.url),out=new URL('./',import.meta.url),repo=path.resolve(fileURLToPath(base),'../../../..');
const pwPath=process.env.PLAYWRIGHT_MODULE??'/tmp/soccer-v11-tools/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(pwPath));
const executableArg=process.argv.indexOf('--executable'),executablePath=executableArg<0?'/usr/bin/chromium':process.argv[executableArg+1];
const contentTypes={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.glb':'model/gltf-binary','.png':'image/png','.md':'text/plain'};
const server=http.createServer(async(req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname),filename=path.resolve(repo,'.'+relative);if(!filename.startsWith(repo+path.sep))throw Error('outside repo');const data=await fs.readFile(filename);res.writeHead(200,{'content-type':contentTypes[path.extname(filename)]??'application/octet-stream','content-length':data.length,'cache-control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,prefix='/workout/island/design/soccer-motion-v11/';
let browser;
const catalogHash=async()=>createHash('sha256').update(await fs.readFile(new URL('runtime/catalog.json',base))).digest('hex');
const report={browser:'Chromium',executablePath,catalogSha256:await catalogHash(),csp:null,wasmBlocked:false,loads:[],playback:[],screenshots:[],pageErrors:[],requestFailures:[],pass:false};
try{
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1}),page=await context.newPage();
 page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('requestfailed',r=>report.requestFailures.push({url:r.url().replace(origin,''),error:r.failure()?.errorText}));
 await page.goto(origin+prefix+'preview.html',{waitUntil:'networkidle',timeout:120000});
 await page.waitForFunction(()=>!!window.v11,{timeout:120000});
 await page.evaluate(async()=>{await window.v11.loadAll();window.v11.setPlaying(false);});
 const csp=await page.evaluate(()=>({policy:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,blocked:(()=>{try{new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]));return false;}catch(e){return /unsafe-eval|CSP|Content Security Policy|Wasm code generation disallowed|not allowed/i.test(e.message);}})()}));
 report.csp=csp.policy;report.wasmBlocked=csp.blocked;if(!csp.blocked)throw Error('WebAssembly was not blocked by CSP');
 // The real glTF loader receives every original image, skin, vertex and track.
 // No decoder is constructed, registered, or imported.
 report.loads=await page.evaluate(async()=>{
  const T=await import('../soccer-motion-v8/runtime/vendor/three.module.js'),{GLTFLoader}=await import('../soccer-motion-v8/runtime/vendor/GLTFLoader.js'),catalog=await(await fetch('./runtime/catalog.json')).json(),loader=new GLTFLoader(),results=[];
  const assets=[...catalog.clips.map(c=>({id:c.id,url:'./runtime/'+(c.asset??'clips/'+c.id+'.glb')})),...catalog.references.map(r=>({id:'reference/'+r.id,url:'./runtime/'+r.asset}))];
  for(const asset of assets){const response=await fetch(asset.url);if(!response.ok)throw Error('HTTP '+response.status+' '+asset.url);const bytes=await response.arrayBuffer(),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join(''),view=new DataView(bytes),json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,view.getUint32(12,true)))),gltf=await loader.parseAsync(bytes,location.href),animation=gltf.animations[0];if(!animation)throw Error('No animation '+asset.id);let meshes=0,bones=0;const images=new Set();gltf.scene.traverse(n=>{if(n.isSkinnedMesh)meshes++;if(n.isBone)bones++;for(const m of Array.isArray(n.material)?n.material:[n.material])if(m)for(const value of Object.values(m))if(value?.isTexture){const image=value.source?.data??value.image;if(!image?.width||!image?.height)throw Error('Undecoded texture '+asset.id);images.add(image);}});if(!meshes||bones!==18)throw Error('Missing skin or canonical bones '+asset.id);if(images.size<(json.images?.length??0))throw Error('Texture fallback detected '+asset.id+': '+images.size+'/'+json.images.length);const mixer=new T.AnimationMixer(gltf.scene),action=mixer.clipAction(animation).setLoop(T.LoopOnce,1).play();action.clampWhenFinished=true;for(let frame=0;frame<=Math.round(animation.duration*30);frame++){action.time=Math.min(animation.duration,frame/30);mixer.update(0);gltf.scene.updateMatrixWorld(true);}results.push({id:asset.id,bytes:bytes.byteLength,sha256,duration:animation.duration,bones,skinnedMeshes:meshes,decodedImages:images.size,expectedImages:json.images?.length??0,framesSampled:Math.round(animation.duration*30)+1,loaded:true,decoderConfigured:false});mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);gltf.scene.traverse(n=>{n.geometry?.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material])if(m){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});}
  return results;
 });
 const catalog=JSON.parse(await fs.readFile(new URL('runtime/catalog.json',base)));
 await page.evaluate(async()=>await window.v11.loadAll());
 for(const c of catalog.clips){
  const item=await page.evaluate(async clip=>{const api=window.v11;await api.select(clip.id);const modes=[];for(const mode of ['loop','transition']){await api.setMode(mode);const initial=await api.snapshot(),start=mode==='transition'?initial.actionStart:0,contact=clip.event?.time??(Number.isInteger(clip.contactFrame)?clip.contactFrame/30:clip.duration*.5),snapshots=[];for(const t of [...new Set([0,start,start+contact,start+clip.duration,initial.totalDuration])]){await api.seek(t);snapshots.push(await api.snapshot());}modes.push({mode,snapshots});}api.setMode('loop');const loop=api.loopAudit?.(clip.id);const repeats=[];for(const mode of ['loop','transition']){api.setMode(mode);const duration=api.snapshot().totalDuration;api.seek(0);api.setPlaying(true);api.tick(duration*2+1/30);api.setPlaying(false);const state=api.snapshot();repeats.push({mode,expectedTime:1/30,time:state.time,pass:Math.abs(state.time-1/30)<1e-5});}const transitions={};for(const version of ['v9','v10'])transitions[version]=api.transitionAudit?await api.transitionAudit(clip.id,version):null;return {id:clip.id,modes,transitions,loop,repeats};},c);report.playback.push(item);
 }
 const first=catalog.clips.find(c=>c.id==='shot_power')??catalog.clips.find(c=>c.id.includes('receive'))??catalog.clips[0];
 await page.evaluate(async c=>{await window.v11.select(c.id);await window.v11.setMode('loop');await window.v11.seek((c.event?.time??c.contactFrame/30));},first);
 for(const [width,height] of [[1280,800],[390,844],[844,390]]){await page.setViewportSize({width,height});await page.waitForTimeout(150);const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));if(layout.scrollWidth>width+1)throw Error('Horizontal overflow at '+width);const name=`preview-${width}x${height}.png`;await page.screenshot({path:fileURLToPath(new URL(name,out)),fullPage:true});report.screenshots.push({file:name,width,height});}
 const spotArg=process.argv.indexOf('--spotchecks');
 if(spotArg>=0){const directory=path.resolve(process.argv[spotArg+1]);await fs.mkdir(directory,{recursive:true});await page.setViewportSize({width:1280,height:800});for(const id of ['dribble_sprint','shot_power','tackle_slide_clean','header_jump','throw_in','goalkeeper_catch_up_right','celebrate_team_huddle']){const c=catalog.clips.find(c=>c.id===id);if(!c)continue;for(const [label,time] of [['contact',c.event.time],['tail',c.duration]]){await page.evaluate(async c=>{await window.v11.select(c.id);await window.v11.setMode('loop');await window.v11.seek(c.time);}, {id,time});await page.locator('#viewport').screenshot({path:path.join(directory,`${id}-${label}.png`)});}}}
 report.transitionSummary={clips:report.playback.length,maxPoseJumpMeters:Math.max(0,...report.playback.map(r=>Math.max(...['v9','v10'].map(v=>r.transitions[v]?.maxPoseJumpMeters??Infinity)))),framesProcessed:report.playback.reduce((s,r)=>s+['v9','v10'].reduce((n,v)=>n+(r.transitions[v]?.framesProcessed??0),0),0),pass:report.playback.every(r=>['v9','v10'].every(v=>r.transitions[v]?.finite&&r.transitions[v].maxPoseJumpMeters<=.001))};
 report.loopSummary={clips:report.playback.length,maxPoseJumpMeters:Math.max(0,...report.playback.map(r=>r.loop?.maxPoseJumpMeters??Infinity)),loopBlendSeconds:report.playback[0]?.loop?.loopBlendSeconds,minClosureSeconds:Math.min(...report.playback.map(r=>r.loop?.loopBlendSeconds??Infinity)),maxClosureSeconds:Math.max(...report.playback.map(r=>r.loop?.loopBlendSeconds??0)),maxBallJumpMeters:Math.max(0,...report.playback.map(r=>r.loop?.maxBallJumpMeters??Infinity)),maxClosurePlantSlipMeters:Math.max(0,...report.playback.map(r=>r.loop?.closurePlantSlipMeters??Infinity)),nativeLoops:report.playback.filter(r=>r.loop?.nativeLoop).length,pass:report.playback.every(r=>r.loop&&r.loop.maxPoseJumpMeters<=.001&&r.loop.maxBallJumpMeters<=.001&&r.loop.closurePlantSlipMeters<=.02&&r.repeats.every(p=>p.pass))};
 report.catalogSha256After=await catalogHash();report.catalogStable=report.catalogSha256===report.catalogSha256After;
 report.pass=report.catalogStable&&report.wasmBlocked&&report.loads.length===catalog.clips.length+catalog.references.length&&report.loads.every(r=>r.loaded)&&report.playback.length===catalog.clips.length&&report.transitionSummary.pass&&report.loopSummary.pass&&report.pageErrors.length===0&&report.requestFailures.length===0;
 await context.close();
}catch(error){report.error=error.stack??String(error);process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await fs.writeFile(new URL('browser.json',out),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({pass:report.pass,wasmBlocked:report.wasmBlocked,loads:report.loads.length,playback:report.playback.length,pageErrors:report.pageErrors,requestFailures:report.requestFailures,error:report.error}));
if(!report.pass)process.exitCode=1;
