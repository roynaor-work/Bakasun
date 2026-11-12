// Proof sheets for the phone review of the island's soccer and basketball minigames.
// For each game: a broadcast still, a close-up of the controlled / ball player, an N-frame
// sequence of a running player with a close chase camera, one composite "sheet" (frames tiled
// 4 x 2 with a label) and a metrics JSON (render metrics, motion states per frame, console
// errors, load time to the first rendered frame). Software WebGL (SwiftShader): the pictures
// show materials, lighting and poses, not the phone's GPU speed.
//
// Usage:
//   node workout/island/tools/sports-sheets.mjs game=hoops|soccer|both out=<dir> label=<name>
//        [extra=<query string without ?>] [frames=8] [ticks=3] [dpr=1] [tile=0.5] [seed=4242] [warm=900]
// Env: ISLAND_PLAYWRIGHT or PLAYWRIGHT_MODULE (path to playwright/index.mjs), CHROMIUM_PATH.
// Output files (in `out`): <label>-<game>-broadcast.png, <label>-<game>-close.png,
//   <label>-<game>-seq-00..NN.png, <label>-<game>-sheet.png, <label>-<game>-metrics.json
//
// Hoops runs the perf-hoops.html harness (window.__session.debug: step/render/hold/view
// overrides); soccer runs the real island with ?dev=1 and window.__island.games.start('soccer').
// The sheet is composed inside a blank browser page (canvas + drawImage), so no image package
// is needed.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {serveIsland} from '../../../tests/helpers/island-browser.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,'1']:[a.slice(0,i),a.slice(i+1)];}));
const game=args.game||'both',out=path.resolve(args.out||'/tmp/sports-sheets'),label=args.label||'run',extra=args.extra||'';
const FRAMES=Math.max(1,Number(args.frames||8)),TICKS=Math.max(1,Number(args.ticks||3)),DPR=Number(args.dpr||1),TILE=Number(args.tile||0.5);
const SEED=Number(args.seed||4242),WARM=Number(args.warm||900),VIEWPORT={width:844,height:390};
const games=game==='both'?['hoops','soccer']:[game];
if(games.some(g=>!['hoops','soccer'].includes(g)))throw Error('game must be hoops, soccer or both');
await mkdir(out,{recursive:true});

const playwrightPath=process.env.ISLAND_PLAYWRIGHT||process.env.PLAYWRIGHT_MODULE||'/opt/node-tools/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(playwrightPath).href);
const CHROME_ARGS=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors'];
const ERROR_NOISE=/favicon|manifest|404/;
const file=(g,name)=>path.join(out,`${label}-${g}-${name}.png`);
const pad=i=>String(i).padStart(2,'0');

const server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:CHROME_ARGS});
const results={};
try{
 for(const g of games){
  const t0=Date.now();
  const report=g==='hoops'?await runHoops():await runSoccer();
  report.toolSeconds=Math.round((Date.now()-t0)/100)/10;
  report.sheet=path.basename(await composeSheet(g,report));
  await writeFile(path.join(out,`${label}-${g}-metrics.json`),JSON.stringify(report,null,1));
  results[g]=report;
  console.log(g,JSON.stringify({loadMs:report.loadMs,summary:report.summary,motion:report.sequence.map(f=>f.motion),errors:report.consoleErrors.length,seconds:report.toolSeconds}));
 }
}finally{await browser.close();await server.close();}
console.log('sheets written to',out);

// ---------------------------------------------------------------- shared helpers
function newContext(){return browser.newContext({viewport:VIEWPORT,hasTouch:true,deviceScaleFactor:DPR,serviceWorkers:'block'});}
function collectErrors(page){const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});return errors;}
function baseReport(g,query){return {label,game:g,query,viewport:VIEWPORT,dpr:DPR,date:new Date().toISOString(),frames:FRAMES,loadMs:null,summary:{},renderMetrics:null,sequence:[],consoleErrors:[],shots:{}};}
// screenshot to disk, keep the PNG bytes for the sheet
async function snap(page,g,name,report){const p=file(g,name);const buf=await page.screenshot({path:p,type:'png',timeout:120000,animations:'disabled'});report.shots[name]=path.basename(p);return buf;}

// ---------------------------------------------------------------- basketball (perf-hoops harness)
async function runHoops(){
 const report=baseReport('hoops',extra);report.ticks=TICKS;
 const context=await newContext();context.setDefaultTimeout(300000);
 const page=await context.newPage(),errors=collectErrors(page);
 try{
  const url=`${server.url}tools/perf-hoops.html?dev=1&dur=3600&seed=${SEED}&hoopsAuto=1&hoopsQuality=2&hoopsProfile=quick${extra?'&'+extra:''}`;
  await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
  const err=await page.evaluate(()=>window.__session.snapshot.error);if(err)throw Error('hoops: '+err);
  // the harness stamps performance.now() when the arena and players first rendered
  report.loadMs=await page.evaluate(()=>window.__perfLoadMs??Math.round(performance.now()));
  await page.evaluate(()=>{document.getElementById('perf').hidden=true;window.__session.debug.hold=true;});
  // advance by hand to a live possession in the frontcourt, then until the ball handler is running
  await page.evaluate(([warm])=>{const d=window.__session.debug;d.step(warm);for(let i=0;i<1800;i++){const s=d.engine.snapshot();const h=s.players.find(p=>p.hasBall);if(s.phase==='live'&&h&&Math.abs(h.x)>4)break;d.step(1);}
   for(let i=0;i<600;i++){const s=d.engine.snapshot();const h=s.players.find(p=>p.hasBall);if(s.phase==='live'&&h&&Math.hypot(h.vx,h.vz)>2)break;d.step(1);}},[WARM]);
  const override=(pos,look,fov)=>page.evaluate(([pos,look,fov])=>window.__session.debug.view.setCameraOverride(pos,look,fov),[pos,look,fov]);
  // render once with the camera snapped, let the compositor catch up, then screenshot
  const shot=async name=>{await page.evaluate(async()=>{const d=window.__session.debug;d.view.snapCamera();d.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.waitForTimeout(250);return snap(page,'hoops',name,report);};
  const sample=()=>page.evaluate(()=>{const d=window.__session.debug,s=d.engine.snapshot(),h=s.players.find(p=>p.hasBall)||s.players.find(p=>p.controlled)||s.players[0];const av=d.view.avatars.get(h.id);
   return {id:h.id,x:+h.x.toFixed(2),z:+h.z.toFixed(2),face:h.face,act:h.act||'move',actT:h.actT??null,motion:av?.motionState||null,phase:av?.motionPhase??null,ball:s.ball.state,gamePhase:s.phase,speed:+Math.hypot(h.vx,h.vz).toFixed(2),step:window.__session.snapshot.stepsRun};});
  const scene=await sample();
  await shot('broadcast');
  const f=scene.face;
  await override({x:scene.x+Math.sin(f+0.7)*2.6,y:1.55,z:scene.z+Math.cos(f+0.7)*2.6},{x:scene.x,y:1.15,z:scene.z},34);
  await shot('close');
  // chase the runner: one frame every TICKS engine steps, camera re-aimed each frame
  const frames=[];
  for(let i=0;i<FRAMES;i++){
   const s=await sample();
   await override({x:s.x+Math.sin(s.face+1.3)*3.4,y:1.4,z:s.z+Math.cos(s.face+1.3)*3.4},{x:s.x,y:1.0,z:s.z},36);
   const buf=await shot(`seq-${pad(i)}`);frames.push(buf);
   report.sequence.push({i,file:report.shots[`seq-${pad(i)}`],...s});
   await page.evaluate(n=>window.__session.debug.step(n),TICKS);
  }
  await override(null,null,0);
  const rm=await page.evaluate(()=>window.__session.snapshot.renderMetrics);
  report.renderMetrics=rm;
  report.summary={calls:rm.calls,triangles:rm.triangles,frameMs:rm.frameMs,players:rm.players,characterVersion:rm.characterVersion,tall:rm.tall,quality:rm.quality,dpr:rm.dpr,buffer:`${rm.bufferWidth}x${rm.bufferHeight}`,textures:rm.textures,geometries:rm.geometries,arena:rm.arenaSource,clipCount:rm.clipCount};
  report.frameBuffers=frames;
 }finally{report.consoleErrors=errors.filter(e=>!ERROR_NOISE.test(e));await context.close();}
 return report;
}

// ---------------------------------------------------------------- soccer (real island, ?dev=1)
async function runSoccer(){
 const report=baseReport('soccer',extra);report.frameIntervalMs=120;
 const context=await newContext();context.setDefaultTimeout(300000);
 const page=await context.newPage(),errors=collectErrors(page);
 const D=()=>window.__island.games.current.session.debug;
 try{
  await page.goto(server.url+'?dev=1'+(extra?'&'+extra:''),{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__island);
  await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer'))e.state.buildings.push({id:'t-soccer',typeId:'soccer',x:0,y:0,level:1});});
  await page.evaluate(()=>{window.__sheetsStart=performance.now();window.__island.games.start('soccer',undefined,1);});
  if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
  // ready = contracts loaded, 3D assets loaded, and the view has drawn at least one frame
  await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;const ok=s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready'&&(s.renderMetrics.drawCalls||0)>0;if(ok&&window.__sheetsReady==null)window.__sheetsReady=performance.now();return ok;},null,{timeout:240000});
  const load=await page.evaluate(()=>({sinceNavigationMs:Math.round(window.__sheetsReady),sinceStartMs:Math.round(window.__sheetsReady-window.__sheetsStart)}));
  report.loadMs=load.sinceNavigationMs;report.load=load;
  await page.waitForTimeout(1500);
  await snap(page,'soccer','broadcast',report);
  const state=()=>page.evaluate(()=>{const d=window.__island.games.current.session.debug,s=d.model.getState(),p=s.players[s.controlled],rm=window.__island.games.current.session.snapshot.renderMetrics,pose=rm.poses?.[s.controlled]||null;
   return {id:s.controlled,x:+p.x.toFixed(2),z:+p.z.toFixed(2),speed:+Math.hypot(p.vx||0,p.vz||0).toFixed(2),phase:s.phase,mode:s.mode,motion:rm.animations?.[s.controlled]||pose?.mode||null,clip:pose?.clip||null,lod:pose?.lod??null,lean:pose?.lean==null?null:+Number(pose.lean).toFixed(3),ballOwner:s.ball.owner??null,t:Math.round(performance.now())};});
  await page.evaluate(()=>{const d=window.__island.games.current.session.debug,s=d.model.getState();d.view.poseCamera(s.controlled,'close');});
  await page.waitForTimeout(800);
  await snap(page,'soccer','close',report);
  // run: hold ArrowRight (same as the joystick pushed right), frames every ~120 ms
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(700);
  const frames=[];
  for(let i=0;i<FRAMES;i++){
   const s=await state();
   const buf=await snap(page,'soccer',`seq-${pad(i)}`,report);frames.push(buf);
   report.sequence.push({i,file:report.shots[`seq-${pad(i)}`],...s});
   await page.waitForTimeout(120);
  }
  await page.keyboard.up('ArrowRight');
  await page.evaluate(()=>window.__island.games.current.session.debug.view.poseCamera(null,null));
  // one-second RAF sample for the frame rate in this (software) browser
  const fps=await page.evaluate(()=>new Promise(res=>{let n=0;const t0=performance.now();const tick=t=>{n++;if(t-t0<1000)requestAnimationFrame(tick);else res({frames:n,fps:+(n*1000/(t-t0)).toFixed(1)});};requestAnimationFrame(tick);}));
  const rm=await page.evaluate(()=>window.__island.games.current.session.snapshot.renderMetrics);
  report.renderMetrics=rm;report.rafSample=fps;
  report.summary={calls:rm.drawCalls,triangles:rm.triangles,fps:fps.fps,modelCount:rm.modelCount,fallbackCount:rm.fallbackCount,characterSet:rm.assetStats?.characterSet??rm.characterSet??null,characters:rm.characters??null,quality:rm.quality,pixelRatio:rm.pixelRatio,textures:rm.textures,geometries:rm.geometries,programs:rm.programs,stadium:rm.stadium,scene:rm.scene,crowd:rm.crowdCount,shadows:rm.shadows,kit:rm.kit,assetStatus:rm.assetStatus,loadReportMs:rm.ms??null};
  report.frameBuffers=frames;
 }finally{report.consoleErrors=errors.filter(e=>!ERROR_NOISE.test(e));await context.close();}
 return report;
}

// ---------------------------------------------------------------- composite sheet (browser canvas)
async function composeSheet(g,report){
 const frames=report.frameBuffers||[];delete report.frameBuffers;
 const cols=4,rows=Math.max(1,Math.ceil(frames.length/cols)),tw=Math.round(VIEWPORT.width*TILE),th=Math.round(VIEWPORT.height*TILE),cap=22,head=46,gap=6;
 const W=cols*tw+(cols+1)*gap,H=head+rows*(th+cap+gap)+gap;
 const title=`${label} · ${g} · ${report.date.slice(0,16).replace('T',' ')} · ${frames.length} frames, ${g==='hoops'?`every ${TICKS} ticks`:'every ~120 ms'} · ${report.summary.calls} calls / ${report.summary.triangles} tris`;
 const captions=report.sequence.map(s=>`${pad(s.i)}  ${s.motion||'?'}${s.clip?' · '+s.clip:''}${s.act&&s.act!=='move'?' · '+s.act:''}  v=${s.speed}`);
 const context=await browser.newContext({viewport:{width:Math.min(W,8000),height:Math.min(H,8000)},deviceScaleFactor:1});
 try{
  const page=await context.newPage();
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#0b0f16"><canvas id="sheet" width="${W}" height="${H}"></canvas></body></html>`);
  await page.evaluate(async({frames,captions,title,cols,tw,th,cap,head,gap,W,H})=>{
   const c=document.getElementById('sheet'),x=c.getContext('2d');
   x.fillStyle='#0b0f16';x.fillRect(0,0,W,H);
   x.fillStyle='#f3f6fb';x.font='bold 18px system-ui, sans-serif';x.textBaseline='middle';x.fillText(title,gap,head/2);
   const load=src=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src;});
   for(let i=0;i<frames.length;i++){
    const im=await load('data:image/png;base64,'+frames[i]);
    const col=i%cols,row=Math.floor(i/cols),px=gap+col*(tw+gap),py=head+row*(th+cap+gap);
    x.drawImage(im,px,py,tw,th);
    x.strokeStyle='#ffffff30';x.lineWidth=1;x.strokeRect(px+.5,py+.5,tw-1,th-1);
    x.fillStyle='#cfd8e6';x.font='13px system-ui, sans-serif';x.fillText(captions[i]||'',px+4,py+th+cap/2);
   }
  },{frames:frames.map(b=>b.toString('base64')),captions,title,cols,tw,th,cap,head,gap,W,H});
  const p=file(g,'sheet');
  await page.locator('#sheet').screenshot({path:p,type:'png',timeout:120000});
  return p;
 }finally{await context.close();}
}
