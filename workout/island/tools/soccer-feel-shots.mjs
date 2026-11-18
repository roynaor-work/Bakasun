/** Soccer feel v2 proof sheets (evidence only): the real island in software WebGL, a forced slide tackle on the controlled player and a
 * forced dive of the child's keeper, each as an 8-frame close-up sequence tiled 4 x 2 with the motion state under every frame, plus a
 * metrics JSON (states per frame, console errors). Run once with `soccerFeel=0` (before) and once without (after).
 * A software-WebGL screenshot takes seconds, so once play is live the match is frozen (model.update and view.render replaced) and stepped by
 * hand between frames: every frame is exactly `ticks` fixed steps (1/60 s) of simulation and of view time after the previous one.
 * Usage: node tools/soccer-feel-shots.mjs <outDir> <label> [query without ?]
 * Env: ISLAND_PLAYWRIGHT or PLAYWRIGHT_MODULE (path to playwright/index.mjs), CHROMIUM_PATH. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {serveIsland} from '../../../tests/helpers/island-browser.mjs';
const [outDir,label='run',extra='']=process.argv.slice(2);
if(!outDir)throw Error('usage: soccer-feel-shots.mjs <outDir> <label> [query]');
await mkdir(outDir,{recursive:true});
const playwrightPath=process.env.ISLAND_PLAYWRIGHT||process.env.PLAYWRIGHT_MODULE||'/opt/node-tools/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(playwrightPath).href);
const VIEW={width:844,height:390},FRAMES=8,SLIDE_TICKS=7,DIVE_TICKS=12;
const server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors']});
const report={label,query:extra,date:new Date().toISOString(),slide:[],dive:[],errors:[],sheets:{}};
const context=await browser.newContext({viewport:VIEW,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon|manifest|404/.test(m.text()))report.errors.push(m.text());});
const pad=i=>String(i).padStart(2,'0');
/** Live pose of player `id`: simulation clocks and the motion state the view plays. */
const sample=id=>page.evaluate(id=>{const d=window.__island.games.current.session.debug,s=d.model.getState(),p=s.players[id],rm=window.__island.games.current.session.snapshot.renderMetrics,pose=rm.poses?.[id]||null,metrics=d.view.characterMetrics?.(id)||null;
  return {t:Math.round(performance.now()),x:+p.x.toFixed(2),z:+p.z.toFixed(2),slideTime:+(p.slideTime||0).toFixed(2),recover:+(p.recover||0).toFixed(2),diveTime:+(p.diveTime||0).toFixed(2),hands:!!p.hands,mode:pose?.mode||null,clip:pose?.clip||null,state:metrics?.state||null};},id);
/** Advance the frozen match by `ticks` fixed steps and draw one frame with the same elapsed time. */
const advance=ticks=>page.evaluate(n=>{const d=window.__island.games.current.session.debug,R=window.__feelReal;for(let i=0;i<n;i++)R.update.call(d.model,1/60,{});R.render.call(d.view,d.model.renderState?.()??d.model.getState(),n/60,n/60*1000);},ticks);
async function sequence(kind,id,ticks){
  const frames=[],rows=[];
  for(let i=0;i<FRAMES;i++){
    await advance(i?ticks:0);
    const s=await sample(id);rows.push({i,simSeconds:+(i*ticks/60).toFixed(3),...s});
    const f=path.join(outDir,`${label}-${kind}-${pad(i)}.png`);frames.push(await page.screenshot({path:f,type:'png',animations:'disabled'}));
  }
  report[kind]=rows;return frames;
}
async function composeSheet(kind,frames,rows){
  const cols=4,tw=Math.round(VIEW.width*.5),th=Math.round(VIEW.height*.5),cap=22,head=46,gap=6,rowsN=Math.ceil(frames.length/cols),W=cols*tw+(cols+1)*gap,H=head+rowsN*(th+cap+gap)+gap;
  const title=`${label} · soccer ${kind} · ${report.date.slice(0,16).replace('T',' ')} · ${frames.length} frames every ${kind==='slide'?SLIDE_TICKS:DIVE_TICKS} ticks (${Math.round((kind==='slide'?SLIDE_TICKS:DIVE_TICKS)/60*1000)} ms of play)${extra?' · ?'+extra:''}`;
  const captions=rows.map(r=>`${pad(r.i)} +${r.simSeconds}s  ${r.state||r.clip||'?'}  ${kind==='slide'?`slide ${r.slideTime} rec ${r.recover}`:`dive ${r.diveTime}${r.hands?' hands':''}`}`);
  const sheetContext=await browser.newContext({viewport:{width:W,height:H},deviceScaleFactor:1});
  try{
    const sheet=await sheetContext.newPage();
    await sheet.setContent(`<!doctype html><html><body style="margin:0;background:#0b0f16"><canvas id="sheet" width="${W}" height="${H}"></canvas></body></html>`);
    await sheet.evaluate(async({frames,captions,title,cols,tw,th,cap,head,gap,W,H})=>{
      const c=document.getElementById('sheet'),x=c.getContext('2d');x.fillStyle='#0b0f16';x.fillRect(0,0,W,H);
      x.fillStyle='#f3f6fb';x.font='bold 18px system-ui, sans-serif';x.textBaseline='middle';x.fillText(title,gap,head/2);
      const load=src=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src;});
      for(let i=0;i<frames.length;i++){const im=await load('data:image/png;base64,'+frames[i]),col=i%cols,row=Math.floor(i/cols),px=gap+col*(tw+gap),py=head+row*(th+cap+gap);
        x.drawImage(im,px,py,tw,th);x.strokeStyle='#ffffff30';x.strokeRect(px+.5,py+.5,tw-1,th-1);x.fillStyle='#cfd8e6';x.font='13px system-ui, sans-serif';x.fillText(captions[i]||'',px+4,py+th+cap/2);}
    },{frames:frames.map(b=>b.toString('base64')),captions,title,cols,tw,th,cap,head,gap,W,H});
    const f=path.join(outDir,`${label}-${kind}-sheet.png`);await sheet.locator('#sheet').screenshot({path:f,type:'png'});report.sheets[kind]=path.basename(f);
  }finally{await sheetContext.close();}
}
try{
  await page.goto(server.url+'?dev=1'+(extra?'&'+extra:''),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
  await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer'))e.state.buildings.push({id:'t-soccer',typeId:'soccer',x:0,y:0,level:1});});
  await page.evaluate(()=>window.__island.games.start('soccer',undefined,1));
  if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
  await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready'&&(s.renderMetrics.drawCalls||0)>0;},null,{timeout:240000});
  report.motion=await page.evaluate(()=>window.__island.games.current.session.snapshot.renderMetrics?.assetStats?.motion??null);
  await page.waitForTimeout(1500);
  // The kickoff must be over: a restart in progress resets every player clock (positionKickoff), which would wipe the forced slide or dive.
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(2500);
  await page.waitForFunction(()=>{const s=window.__island.games.current.session.debug.model.getState();return s.phase==='playing'&&!s.restart;},null,{timeout:30000});
  await page.waitForTimeout(300);
  // Freeze: the session loop keeps running (HUD, input) but no longer steps the match or draws; advance() does both by hand.
  await page.evaluate(()=>{const d=window.__island.games.current.session.debug;window.__feelReal={update:d.model.update,render:d.view.render};d.model.update=()=>d.model.getState();d.view.render=()=>{};});
  // 1. slide: the controlled player runs, a rival carrier is placed 3 m ahead, and the simulation's slide clocks are started as a kick press would.
  const slideId=await page.evaluate(()=>{const d=window.__island.games.current.session.debug,s=d.model.getState(),p=s.players[s.controlled],o=s.players.find(q=>q.team!==p.team&&q.role!=='keeper');o.x=p.x+3;o.z=p.z;s.ball.owner=o.id;s.ball.x=o.x;s.ball.z=o.z;p.slideKind='straight';p.slideTime=.35;p.slideX=1;p.slideZ=0;p.slideCooldown=1;p.slideAttempted=false;p.slideWon=false;d.view.poseCamera(s.controlled,'close');return s.controlled;});
  await page.keyboard.up('ArrowRight');
  const slideFrames=await sequence('slide',slideId,SLIDE_TICKS);
  await page.evaluate(()=>window.__island.games.current.session.debug.view.poseCamera(null,null));await advance(90);
  // 2. dive: the child's keeper gets the simulation's dive clock (as a fast shot inside his reach does) with the ball low to his left.
  const keeperId=await page.evaluate(()=>{const d=window.__island.games.current.session.debug,s=d.model.getState(),k=s.players.find(q=>q.team===0&&q.role==='keeper');s.ball.owner=null;s.ball.x=k.x+1.5*(k.fx||1);s.ball.z=k.z+1.2;s.ball.y=.4;s.ball.vx=0;s.ball.vz=0;k.diveTime=.65;k.diveCooldown=.8;k.diveZ=1;k.hands=false;d.view.poseCamera(k.id,'close');return k.id;});
  const diveFrames=await sequence('dive',keeperId,DIVE_TICKS);
  await page.evaluate(()=>window.__island.games.current.session.debug.view.poseCamera(null,null));
  await composeSheet('slide',slideFrames,report.slide);await composeSheet('dive',diveFrames,report.dive);
}finally{await context.close();await browser.close();await server.close();}
await writeFile(path.join(outDir,`${label}-feel-metrics.json`),JSON.stringify(report,null,1));
console.log(JSON.stringify({label,errors:report.errors,slide:report.slide.map(r=>`${r.simSeconds}:${r.state||r.clip}/${r.slideTime}/${r.recover}`),dive:report.dive.map(r=>`${r.simSeconds}:${r.state||r.clip}/${r.diveTime}/${r.x},${r.z}`)}));
