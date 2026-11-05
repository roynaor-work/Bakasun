// Motion review strips for Island Pro Basketball characters: a frozen scene (everyone else standing), one
// player doing one thing, a side camera following him, one frame every `every` ticks.
// Scenarios: dribble (standing), run (dribbling at speed), hold (two hands, walking), shot, layup, steal, defend, idle.
// Usage: PLAYWRIGHT_MODULE=... node motion-shots.mjs out=DIR tag=before|after scenarios=dribble,run frames=8 every=3 extra=hoopsV7=0 [w=844 h=390 dpr=1]
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,'1']:[a.slice(0,i),a.slice(i+1)];}));
const out=path.resolve(args.out||'/tmp/motion-shots'),tag=args.tag||'run',extra=args.extra?'&'+args.extra:'';
const scenarios=(args.scenarios||'dribble,run').split(','),frames=Number(args.frames||8),every=Number(args.every||3),W=Number(args.w||844),H=Number(args.h||390),dpr=Number(args.dpr||1);
await mkdir(out,{recursive:true});
const workout=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'}).end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-hoops.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:W,height:H},hasTouch:true,isMobile:true,deviceScaleFactor:dpr});context.setDefaultTimeout(300000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}?dev=1&dur=3600&seed=4242&hoopsAuto=1&hoopsQuality=2&hoopsProfile=quick${extra}`,{waitUntil:'load'});
 await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
 await page.evaluate(()=>{document.getElementById('perf').hidden=true;window.__session.debug.hold=true;});
 await page.evaluate(()=>{const d=window.__session.debug;d.step(900);for(let i=0;i<1800;i++){const s=d.engine.snapshot();const h=s.players.find(p=>p.hasBall);if(s.phase==='live'&&h&&Math.abs(h.x)>4)break;d.step(1);}});
 const meta=await page.evaluate(()=>{const m=window.__session.snapshot.renderMetrics;return {v:m.characterVersion,motion:m.motion};});
 console.log('characters',meta.v);
 for(const sc of scenarios){
  await page.evaluate(sc=>{
   const d=window.__session.debug,e=d.engine,a=e.debug.api,s=e.debug.state;s.phase='live';s.phaseT=0;s.clock=80;s.shotClock=24;
   const h=a.holder()||a.onCourt(0)[0];let k=0;
   for(const p of a.all()){p.think=1e9;p.goal=null;p.intent.speed=0;p.act=null;p.air=-1;p.vx=p.vz=0;p.stumble=0;p.dead=false;}
   for(const p of a.all()){if(p===h)continue;e.debug.place(p.id,-14+(k%5)*2.2,(k<5?-6.5:6.5));k++;}
   e.debug.place(h.id,-2,0);h.face=Math.PI/2;s.controlled=h.id;e.debug.give(h.id);
   window.__who=h.id;window.__sc=sc;window.__n=0;
   if(sc==='steal'||sc==='defend'){const o=a.onCourt(1)[0];e.debug.place(o.id,-1.0,0);o.face=-Math.PI/2;e.debug.give(o.id);s.controlled=h.id;window.__who=h.id;}
   if(sc==='shot'){h.shot=null;}
  },sc);
  for(let n=0;n<frames;n++){
   const info=await page.evaluate(async([sc,n,every])=>{
    const d=window.__session.debug,e=d.engine,a=e.debug.api;const h=a.byId(window.__who);
    d.view.setCameraOverride({x:h.x+0.0,y:1.35,z:h.z-3.6},{x:h.x+.2,y:1.05,z:h.z},34);d.view.snapCamera();d.render();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const snap=e.snapshot(),p=snap.players.find(q=>q.id===window.__who);
    return {t:snap.tick,act:p.act,x:+p.x.toFixed(2),speed:+Math.hypot(p.vx,p.vz).toFixed(2),ball:snap.ball.state,mo:window.__session.snapshot.renderMetrics.motion[0]};
   },[sc,n,every]);
   await page.waitForTimeout(90);
   await page.screenshot({path:path.join(out,`${tag}-${sc}-${String(n).padStart(2,'0')}.jpg`),type:'jpeg',quality:82});
   await page.evaluate(([sc,every])=>{
    const d=window.__session.debug,e=d.engine,a=e.debug.api;const h=a.byId(window.__who);
    const NOI={move:{x:0,z:0},sprint:false,shootDown:false,shootUp:false,shootCancel:false,passPress:false,passLong:false,passDir:null,altPress:false,movePress:false,spinPress:false,fakePress:false,switchPress:false,timeoutPress:false,call:null};
    window.__n=(window.__n||0);
    for(let i=0;i<every;i++){
     const inp={...NOI};
     if(sc==='run')inp.move={x:1,z:0};
     if(sc==='hold')inp.move={x:.35,z:0};
     if(sc==='shot'||sc==='layup'){if(window.__n===0){e.debug.place(h.id,sc==='layup'?-4.2:-6.5,0);h.face=Math.PI/2;a.startShot(h,false);}if(window.__n===7)inp.shootUp=true;}
     if(sc==='steal'&&window.__n===0)a.startSteal(a.onCourt(0).find(q=>q!==h));
     if(sc==='pass'&&window.__n===0){const m=a.onCourt(0).find(q=>q!==h);e.debug.place(m.id,3.5,1.2);a.startPass(h,m,null);}
     d.step(1,inp);window.__n++;
    }
   },[sc,every]);
  }
 }
 await page.evaluate(()=>window.__session.debug.view.setCameraOverride(null,null,0));
 if(errors.length)console.log('console errors:',errors.slice(0,4));
 await context.close();
}finally{await browser.close();server.close();}
console.log('motion shots written to',out);
