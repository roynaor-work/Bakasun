// Measures the dunk / layup / jump shot reach of the avatars in the live game: plays the shot plan through av.pose with a fake act clock and reads the
// palm height against the rim (3.05 m) for each body profile. Usage: node hoops-dunk.mjs [query]
import {createRequire} from 'node:module';import {createServer} from 'node:http';import {readFile,stat} from 'node:fs/promises';import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(''+(process.env.PLAYWRIGHT_MODULE||"/opt/node-tools/node_modules/playwright/index.mjs")+'');
const extra=process.argv[2]||'';
const workout=path.resolve('/home/user/Bakasun/workout');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.glb':'model/gltf-binary','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.ogg':'audio/ogg','.wasm':'application/wasm','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);let f=path.resolve(workout,p.slice('/workout/'.length));if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-hoops.html`;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(300000);
const page=await context.newPage();
try{
 await page.goto(`${base}?dev=1&dur=3600&seed=4242&hoopsAuto=1&hoopsQuality=2&hoopsProfile=quick${extra?'&'+extra:''}`,{waitUntil:'load'});
 await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>60);});
 const r=await page.evaluate(()=>{
  const d=window.__session.debug,view=d.view;d.hold=true;const out=[];const V=new (view.scene.position.constructor)();
  const byRole={};for(const av of view.avatars.values()){if(!byRole[av.role])byRole[av.role]=av;}
  for(const [role,av] of Object.entries(byRole)){
   for(const [type,dur,rel] of [['dunk',1.5,.8],['layup',1.5,.8],['jump',1.5,.8]]){
    let best={y:0,t:0},hipsBest=0,wristBest=0;const p={id:99,x:0,z:0,vx:0,vz:0,face:0,act:'shoot',shotType:type,actT:0,hasBall:true,y:0};
    av.root.position.set(0,0,0);av.root.rotation.y=0;
    for(let t=0;t<=2.6;t+=1/60){p.actT=t;p.hasBall=t<rel;av.pose(p,{engineAnim:d.engine.cfg?.anim||window.__session.config?.anim,rimDist:1.2,shotAir:.62,layupSide:'right'},1/60);av.root.updateMatrixWorld(true);
     for(const k of ['r','l']){const pos=av.hands[k].getWorldPosition(V);if(pos.y>best.y)best={y:pos.y,t:+t.toFixed(2),hand:k};}
     const hips=av.root.getObjectByName('Hips').getWorldPosition(V).y;hipsBest=Math.max(hipsBest,hips);}
    out.push({role,type,palmMax:+best.y.toFixed(2),at:best.t,hand:best.hand,hipsMax:+hipsBest.toFixed(2),state:av.motionState});
   }
  }
  return {motion:window.__session.snapshot.renderMetrics.motionSource,dunks:window.__session.snapshot.renderMetrics.dunks,out};
 });
 console.log(JSON.stringify(r));
}finally{await context.close();await browser.close();server.close();}
