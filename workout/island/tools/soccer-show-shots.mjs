/** soccerShow v1 proof sheet (evidence only): the real island in software WebGL, a forced goal by the controlled player after a few seconds of
 * recorded play, then the show stepped by hand (the match is frozen like soccer-feel-shots: model.update / view.render replaced, advanced in fixed
 * steps, the model held exactly when the view holds) and photographed at the live behind-goal cut, the wide and the close replay angles (with the
 * HUD tag), the celebration (scorer in the corner, mates, keeper) and the kickoff after it. One run with the show, one with ?soccerShow=0.
 * Usage: node tools/soccer-show-shots.mjs <outDir> <label> [query without ?]
 * Env: ISLAND_PLAYWRIGHT or PLAYWRIGHT_MODULE (path to playwright/index.mjs), CHROMIUM_PATH. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {serveIsland} from '../../../tests/helpers/island-browser.mjs';
const [outDir,label='show',extra='']=process.argv.slice(2);
if(!outDir)throw Error('usage: soccer-show-shots.mjs <outDir> <label> [query]');
await mkdir(outDir,{recursive:true});
const playwrightPath=process.env.ISLAND_PLAYWRIGHT||process.env.PLAYWRIGHT_MODULE||'/opt/node-tools/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(playwrightPath).href);
const VIEW={width:844,height:390},off=/soccerShow=0/.test(extra);
const server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors']});
const report={label,query:extra,date:new Date().toISOString(),shots:[],errors:[]};
const context=await browser.newContext({viewport:VIEW,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon|manifest|404/.test(m.text()))report.errors.push(m.text());});
/** Advance the frozen match by `ticks` fixed steps (the model only while the view does not hold, as the session does) and draw one frame. */
const advance=ticks=>page.evaluate(n=>{const d=D(),R=window.__showReal;for(let i=0;i<n;i++)if(!d.view.hold)R.update.call(d.model,1/60,{});R.render.call(d.view,d.model.renderState?.()??d.model.getState(),n/60,n/60*1000);
  const s=d.model.getState(),m=d.view.metrics(),sh=m.show,c=d.view.characters,ids=sh?.cast?[sh.cast.scorer,...sh.cast.mates,sh.cast.keeper].filter(x=>x!=null):[];
  return {phase:s.phase,phaseTime:+(s.phaseTime||0).toFixed(2),elapsed:+s.elapsed.toFixed(2),score:s.score.slice(),show:sh?{phase:sh.phase,hold:sh.hold,elapsed:+sh.elapsed.toFixed(2),reason:sh.reason,wall:sh.wall,cuts:sh.cuts,mood:sh.mood,recording:sh.recording}:null,replay:{active:m.replay.active,reason:m.replay.reason},banner:document.querySelector('.soccer-phase-banner')?.textContent||'',half:document.querySelector('.soccer-half')?.textContent||'',states:ids.map(id=>({id,role:m.poses?.[id]?.mode,clip:c[id]?.metrics?.().state}))};},ticks);
const shot=async(name,caption,info)=>{const f=`${label}-${name}.png`;await page.screenshot({path:path.join(outDir,f),type:'png',animations:'disabled'});report.shots.push({file:f,caption,...info});return f;};
try{
  await page.goto(server.url+'?dev=1'+(extra?'&'+extra:''),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
  await page.evaluate(()=>{window.D=()=>window.__island.games.current.session.debug;}); // page-side shorthand for the dev handles
  await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer'))e.state.buildings.push({id:'t-soccer',typeId:'soccer',x:0,y:0,level:1});});
  await page.evaluate(()=>window.__island.games.start('soccer',undefined,1));
  if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
  await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready'&&(s.renderMetrics.drawCalls||0)>0;},null,{timeout:240000});
  await page.waitForTimeout(1200);
  // Live play for the recording: run toward the rival goal with the ball for a few seconds (the kickoff must be over).
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(2500);
  await page.waitForFunction(()=>{const s=D().model.getState();return s.phase==='playing'&&!s.restart;},null,{timeout:30000});
  await page.waitForTimeout(3500);await page.keyboard.up('ArrowRight');
  // Freeze, then a few more recorded steps of play so the ring buffer holds the build-up at a steady 20 Hz.
  await page.evaluate(()=>{const d=D();window.__showReal={update:d.model.update,render:d.view.render};d.model.update=()=>d.model.getState();d.view.render=()=>{};});
  for(let i=0;i<30;i++)await advance(3);
  // The forced goal: the controlled player strikes from the edge of the box (kick clock set as a kick press would), the ball flies into the net.
  report.before=await page.evaluate(()=>{const d=D(),s=d.model.getState(),p=s.players[s.controlled],hx=window.__island.engine.data.config.minigames.soccer.pitch.length/2,dir=s.attackDir;
    p.x=dir*(hx-5.5);p.z=1.2;p.fx=dir;p.fz=0;p.vx=0;p.vz=0;p.kickTime=.42;p.cooldown=.5;
    Object.assign(s.ball,{owner:null,flight:null,x:p.x+dir*.6,z:p.z,y:.3,vx:dir*15,vz:-.9,vy:1.2,curve:0,lastPlayer:p.id,lastTeam:p.team,grace:.3,shot:null});
    return {controlled:s.controlled,x:+p.x.toFixed(1),z:+p.z.toFixed(1),attackDir:dir,recording:d.view.metrics().show?.recording||null};});
  let info=await advance(2),guard=0;
  while(info.phase!=='goal'&&guard++<120)info=await advance(2);
  if(info.phase!=='goal')throw Error('no goal: '+JSON.stringify(info));
  report.goalAt=info;
  const targets=off?[['A-goal','phase','goal',.3,'goal phase, previous presentation (single-path replay or the live frame)'],['B-goal-1s','phase','goal',1,'goal phase 1.0 s'],['C-goal-2s','phase','goal',2,'goal phase 2.0 s']]
    :[['A-cut','show','cut',.35,'live behind-goal angle (cut), ball rolling in'],['B-replay-wide','show','replay',.9,'replay, wide build-up'],['C-replay-close','show','replay',null,'replay, low close angle at half speed'],['D-celebrate','show','celebrate',1.4,'celebration: scorer running to the corner'],['E-celebrate-2','show','celebrate',2.7,'celebration: mates arrived, keeper beaten'],['F-kickoff','phase','playing',.4,'kickoff after the show, live camera back']];
  // Step until each target (a show phase at a time inside it, or a live phase at a time since it began), then photograph.
  let since={phase:null,t:0};
  for(const [name,kind,phase,at,caption] of targets){
    for(let tries=0;;tries++){
      if(tries>600)throw Error('target not reached: '+name+' '+JSON.stringify(info));
      if(info.phase!==since.phase)since={phase:info.phase,t:0};
      const sh=info.show,wantAt=at??(sh?.cuts?.length>1?(sh.cuts[0].wall||0)+.8:.6);
      const ok=kind==='show'?(sh?.phase===phase&&sh.elapsed>=wantAt)||(phase==='celebrate'&&info.phase==='playing'):(info.phase===phase&&since.t>=at);
      if(ok)break;
      info=await advance(2);since.t+=2/60;
    }
    await shot(name,caption,info);
  }
  report.after=info;
  // Crowd mood and the stands: a wide still from the replay angle is in B; the mood numbers travel in the metrics of every shot.
}catch(error){report.errors.push(String(error?.stack||error));}
finally{await context.close();await browser.close();await server.close();}
await writeFile(path.join(outDir,`${label}-shots.json`),JSON.stringify(report,null,1));
console.log(JSON.stringify({label,shots:report.shots.map(s=>[s.file,s.show?.phase||s.phase,s.show?.elapsed,s.banner,s.states]),errors:report.errors}));
