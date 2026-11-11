// racing-deep-m2 browser proof: the real racing session (model, view, HUD) in headless Chromium with touch at 844x390 (SwiftShader), screenshots of the grid, the pit
// straight, mid-race traffic and a flip on three circuits, plus the render metrics of each frame. Writes to verification/racing-deep-fable/m2/shots/.
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium node workout/island/tools/racing-m2-shots.mjs [stages=1,2,4] [extra query]
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,stat,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),out=path.join(workout,'island/verification/racing-deep-fable/m2/shots/');await mkdir(out,{recursive:true});
const stages=(process.argv[2]||'1,2,4').split(',').map(Number),extra=process.argv[3]||'';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.glb':'model/gltf-binary','.webp':'image/webp','.png':'image/png','.ogg':'audio/ogg','.wasm':'application/wasm','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);let f=path.resolve(workout,p.slice('/workout/'.length));if(!f.startsWith(workout)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');const body=await readFile(f);res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','cache-control':'no-store'}).end(body);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-racing.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(400000);
const report=[];
async function open(query){const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,200));});
 await page.goto(`${base}?shot=1&${query}${extra?'&'+extra:''}`,{waitUntil:'load'});
 await page.waitForFunction(()=>window.__session?.snapshot?.renderMetrics?.frames>2||window.__session?.snapshot?.error,null,{timeout:900000});return {page,errors};}
const snap=page=>page.evaluate(()=>{const s=window.__session.snapshot,m=s.renderMetrics;return {phase:s.phase,time:+s.time.toFixed(1),cars:s.cars.length,visible:s.cars.filter(c=>Math.hypot(c.x-s.player.x,c.z-s.player.z)<320).length,drawCalls:m.drawCalls,triangles:m.triangles,quality:m.quality,f1:m.f1,envV2:m.envV2,playerCrashT:+s.player.crashT.toFixed(2),rank:s.player.rank,speed:+s.player.speed.toFixed(1)};});
for(const stage of stages){
 // 1. the grid during the countdown (hold=1: nobody drives yet); a touch on the canvas proves the touch path
 let {page,errors}=await open(`hold=1&stage=${stage}&seed=7`);
 await page.touchscreen.tap(700,300);await page.waitForTimeout(1500);
 await page.screenshot({path:`${out}stage${stage}-1-grid.png`});report.push({stage,shot:'grid',...await snap(page),errors});await page.close();
 // 2. the pit straight just after the start (the player drives; the pits run along the main straight)
 ({page,errors}=await open(`at=2.5&stage=${stage}&seed=7`));await page.waitForFunction(()=>window.__perf?.shot,null,{timeout:900000});
 await page.screenshot({path:`${out}stage${stage}-2-pits.png`});report.push({stage,shot:'pits',...await snap(page),errors});await page.close();
 // 3. mid-race traffic: the player starts 60 m behind the grid and catches the pack
 ({page,errors}=await open(`at=12&fixed=0&stage=${stage}&seed=7&behind=1`));await page.waitForFunction(()=>window.__perf?.shot,null,{timeout:900000});   // fixed=0: real dt (0.1 s a frame on SwiftShader), so 12 s of race pass in about 120 frames
 await page.screenshot({path:`${out}stage${stage}-3-midrace.png`});report.push({stage,shot:'midrace',...await snap(page),errors});await page.close();
 // 4. a flip: after the start the player is turned into the fence at 40 m/s; the session keeps stepping, the frame is taken while crashT > 0
 ({page,errors}=await open(`hold=1&stage=${stage}&seed=7`));
 await page.waitForFunction(()=>window.__session.debug.model.state.phase==='racing',null,{timeout:900000});
 await page.evaluate(()=>{const m=window.__session.debug.model,p=m.state.player,tr=m.track,q=tr.sample(p.s+30),lane=tr.width/2-.6;Object.assign(p,{x:q.x+q.normal.x*lane,y:q.y,z:q.z+q.normal.z*lane,heading:q.heading+1.1,speed:40,lateral:lane,s:q.s});window.__session.debug.input.sample=()=>({steer:0,throttle:1,autoAccelerate:true});});
 await page.waitForFunction(()=>{const p=window.__session.debug.model.state.player;if(p.crashT>0&&p.crashT<.45){window.__session.setPaused(true);return true;}return p.crashes>0&&p.crashT===0;},null,{timeout:120000,polling:20});
 await page.waitForTimeout(800);
 await page.screenshot({path:`${out}stage${stage}-4-flip.png`});report.push({stage,shot:'flip',...await snap(page),errors});await page.close();
 console.log('stage',stage,'done');
}
await writeFile(out+'shots.json',JSON.stringify(report,null,1));
for(const r of report)console.log(`stage ${r.stage} ${r.shot.padEnd(8)} t=${r.time} cars ${r.cars} visible ${r.visible} calls ${r.drawCalls} tris ${r.triangles} crashT ${r.playerCrashT} errors ${r.errors.length}`);
await browser.close();server.close();
