// Visual review stills for Island Pro Basketball: broadcast frame, a close-up of the ball
// handler, a wide arena shot and the rim, in each phone viewport, plus an optional frame
// sequence (one tick apart) of the ball handler for motion review. Software WebGL
// (SwiftShader): the pictures show materials, lighting and poses, not the phone's GPU speed.
// Usage: node workout/island/tools/hoops-shots.mjs out=/tmp/shots [viewports=844x390,390x844] [seq=24] [ticks=2] [seed=4242] [dpr=2] [warm=900]
//        PLAYWRIGHT_MODULE and CHROMIUM_PATH select the browser; writes <viewport>-<name>.jpg into `out`.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,'1']:[a.slice(0,i),a.slice(i+1)];}));
const out=path.resolve(args.out||'/tmp/hoops-shots'),viewports=(args.viewports||'844x390,390x844').split(',').map(v=>{const [width,height]=v.split('x').map(Number);return {width,height};});
const seq=Number(args.seq||0),ticks=Number(args.ticks||2),seed=Number(args.seed||4242),dpr=Number(args.dpr||2),warm=Number(args.warm||900);
await mkdir(out,{recursive:true});
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-hoops.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
try{
 for(const viewport of viewports){
  const tag=`${viewport.width}x${viewport.height}`,context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:dpr});context.setDefaultTimeout(300000);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}?dev=1&dur=3600&seed=${seed}&hoopsAuto=1&hoopsQuality=2&hoopsProfile=quick`,{waitUntil:'load'});
  await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
  const err=await page.evaluate(()=>window.__session.snapshot.error);if(err)throw Error(tag+': '+err);
  await page.evaluate(()=>{document.getElementById('perf').hidden=true;const d=window.__session.debug;d.hold=true;});
  // hold the last frame, advance the game by hand to a live possession in the frontcourt
  await page.evaluate(n=>{const d=window.__session.debug;d.step(n);for(let i=0;i<1800;i++){const s=d.engine.snapshot();const h=s.players.find(p=>p.hasBall);if(s.phase==='live'&&h&&Math.abs(h.x)>4)break;d.step(1);}},warm);
  // render once with the camera snapped, then let the compositor catch up (software WebGL holds
  // stale HUD layers otherwise) before the screenshot
  const shot=async(name)=>{await page.evaluate(async()=>{const d=window.__session.debug;d.view.snapCamera();d.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.waitForTimeout(250);await page.screenshot({path:path.join(out,`${tag}-${name}.jpg`),type:'jpeg',quality:88,timeout:120000,animations:'disabled'});console.log(tag,name);};
  const override=(pos,look,fov)=>page.evaluate(([pos,look,fov])=>window.__session.debug.view.setCameraOverride(pos,look,fov),[pos,look,fov]);
  const scene=await page.evaluate(()=>{const d=window.__session.debug,s=d.engine.snapshot(),h=s.players.find(p=>p.hasBall)||s.players[0],c=d.engine.court;return {h:{x:h.x,z:h.z,face:h.face},rimX:c.rimX,hz:c.hz,side:s.dir[s.possession]||1,rimY:c.rimY};});
  await shot('01-broadcast');
  const f=scene.h.face,cx=scene.h.x+Math.sin(f+0.7)*2.6,cz=scene.h.z+Math.cos(f+0.7)*2.6;
  await override({x:cx,y:1.55,z:cz},{x:scene.h.x,y:1.15,z:scene.h.z},34);await shot('02-close');
  await override({x:scene.h.x+Math.sin(f+2.4)*4.5,y:1.3,z:scene.h.z+Math.cos(f+2.4)*4.5},{x:scene.h.x,y:1.0,z:scene.h.z},40);await shot('03-medium');
  await override({x:scene.side*(scene.rimX-5.5),y:3.4,z:4.2},{x:scene.side*scene.rimX,y:scene.rimY-0.3,z:0},36);await shot('04-rim');
  await override({x:0,y:13,z:-(scene.hz+18)},{x:0,y:1.5,z:0},46);await shot('05-wide');
  await override(null,null,0);
  if(seq>0){
   // chase the ball handler one tick at a time: pose continuity, foot slide and release timing
   for(let i=0;i<seq;i++){
    const s=await page.evaluate(()=>{const d=window.__session.debug,s=d.engine.snapshot(),h=s.players.find(p=>p.hasBall)||s.players.find(p=>p.controlled)||s.players[0];const av=d.view.avatars.get(h.id);return {x:h.x,z:h.z,face:h.face,act:h.act,actT:h.actT,motion:av?.motionState,phase:av?.motionPhase,ball:s.ball.state,speed:Math.hypot(h.vx,h.vz)};});
    const f2=s.face;await override({x:s.x+Math.sin(f2+1.3)*3.4,y:1.4,z:s.z+Math.cos(f2+1.3)*3.4},{x:s.x,y:1.0,z:s.z},36);
    await shot(`seq-${String(i).padStart(2,'0')}-${s.motion||'?'}-${s.act||'move'}-${s.ball}`);
    await page.evaluate(n=>window.__session.debug.step(n),ticks);
   }
   await override(null,null,0);
  }
  if(errors.filter(e=>!/favicon|manifest|404/.test(e)).length)console.log(tag,'console errors:',errors.slice(0,5));
  await context.close();
 }
}finally{await browser.close();server.close();}
console.log('shots written to',out);
