// Pass review strips for Island Pro Basketball: for each pass kind the engine's pass is started between two
// frozen players 5-6 m apart and the game is advanced a few ticks at a time; a side camera on the pass line
// takes one frame per step. Output: <out>/<tag>-<kind>-NN.jpg plus a JSON trace of the ball (x,y,z per tick)
// and the receiver's facing. Usage: PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright node pass-shots.mjs out=DIR tag=before|after
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,'1']:[a.slice(0,i),a.slice(i+1)];}));
const out=path.resolve(args.out||'/tmp/pass-shots'),tag=args.tag||'run',extra=args.extra?'&'+args.extra:'';
const kinds=(args.kinds||'chest,lob,bounce,jump').split(','),frames=Number(args.frames||9),every=Number(args.every||5);
await mkdir(out,{recursive:true});
const workout=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'}).end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-hoops.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const trace={};
try{
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(300000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}?dev=1&dur=3600&seed=4242&hoopsAuto=1&hoopsQuality=2&hoopsProfile=quick${extra}`,{waitUntil:'load'});
 await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
 await page.evaluate(()=>{document.getElementById('perf').hidden=true;window.__session.debug.hold=true;});
 await page.evaluate(()=>{const d=window.__session.debug;d.step(900);for(let i=0;i<1800;i++){const s=d.engine.snapshot();const h=s.players.find(p=>p.hasBall);if(s.phase==='live'&&h&&Math.abs(h.x)>4)break;d.step(1);}});
 for(const kind of kinds){
  const ok=await page.evaluate(kind=>{
   const d=window.__session.debug,e=d.engine,a=e.debug.api,s=e.debug.state;s.phase='live';s.phaseT=0;s.clock=80;s.shotClock=24;
   const h=a.holder()||a.onCourt(0)[0];const mate=a.onCourt(h.team).find(q=>q!==h);
   for(const p of a.all()){p.think=1e9;p.goal=null;p.intent.speed=0;p.act=null;p.air=-1;p.vx=p.vz=0;p.stumble=0;}
   const i=a.all().indexOf(h);let k=0;
   for(const p of a.all()){if(p===h||p===mate)continue;e.debug.place(p.id,-12+(k++%5)*3,k<5?-6.5:6.5);}
   e.debug.place(h.id,-1.5,0);e.debug.place(mate.id,4.2,1.2);h.face=Math.atan2(0,1);mate.face=-Math.PI/2;
   h.dead=false;e.debug.give(h.id);s.controlled=h.id;
   window.__pass={h:h.id,m:mate.id};
   return a.startPass(h,mate,kind==='jump'?'jump':kind);
  },kind);
  const rows=[];
  for(let n=0;n<frames;n++){
   const info=await page.evaluate(async()=>{
    const d=window.__session.debug,s=d.engine.snapshot(),h=s.players.find(p=>p.id===window.__pass.h),m=s.players.find(p=>p.id===window.__pass.m),b=s.ball;
    const cx=(h.x+m.x)/2,cz=(h.z+m.z)/2;
    d.view.setCameraOverride({x:cx,y:1.5,z:cz-7.2},{x:cx,y:1.3,z:cz},38);d.view.snapCamera();d.render();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return {t:s.tick,ball:{x:+b.x.toFixed(2),y:+b.y.toFixed(2),z:+b.z.toFixed(2),state:b.state,passKind:b.passKind},passer:{act:h.act,face:+h.face.toFixed(2),x:+h.x.toFixed(2),z:+h.z.toFixed(2),pk:h.passKind},recv:{face:+m.face.toFixed(2),x:+m.x.toFixed(2),z:+m.z.toFixed(2),hasBall:m.hasBall}};
   });
   await page.waitForTimeout(120);
   await page.screenshot({path:path.join(out,`${tag}-${kind}-${String(n).padStart(2,'0')}.jpg`),type:'jpeg',quality:80});
   rows.push(info);
   await page.evaluate(n=>window.__session.debug.step(n),every);
  }
  trace[kind]={started:ok,rows};
 }
 await page.evaluate(()=>window.__session.debug.view.setCameraOverride(null,null,0));
 if(errors.length)console.log('console errors:',errors.slice(0,5));
 await context.close();
}finally{await browser.close();server.close();}
await writeFile(path.join(out,`${tag}-trace.json`),JSON.stringify(trace,null,1));
console.log('pass shots written to',out);
