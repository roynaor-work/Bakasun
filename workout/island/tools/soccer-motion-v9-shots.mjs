/** Soccer motion v9 harness (evidence only): kickoff / idle / run / goal / slide frames at 844x390
 * plus a per-frame slide timeline (state, time, slideTime, recover).
 * Usage: node tools/soccer-motion-v9-shots.mjs <outDir> <label> [query] */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
const [outDir,label='run',extra='']=process.argv.slice(2);
await mkdir(outDir,{recursive:true});
const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
const report={label,query:extra,shots:[],slide:[]};
const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const shot=async n=>{const f=`${label}-${n}.png`;await page.screenshot({path:path.join(outDir,f)});report.shots.push(f);};
const S=()=>window.__island.games.current.session.debug;
try{
 await page.goto(server.url+'?dev=1'+(extra?'&'+extra:''),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
 await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer'))e.state.buildings.push({id:'t-soccer',typeId:'soccer',x:0,y:0,level:1});});
 await page.evaluate(()=>window.__island.games.start('soccer',undefined,1));
 if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
 await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready';},null,{timeout:240000});
 await shot('0-kickoff');await page.waitForTimeout(1500);await shot('1-idle');
 await page.evaluate(()=>{const d=window.__island.games.current.session.debug,s=d.model.getState();d.view.poseCamera(s.controlled,'close');});
 await page.waitForTimeout(800);await shot('1b-idle-close');
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(2500);await shot('1c-run-close');await page.keyboard.up('ArrowRight');await page.waitForTimeout(400);
 // arm metrics helper: angle between upper arm and the body's down axis, elbow flexion, from live bones
 const ctl=()=>page.evaluate(()=>{const d=window.__island.games.current.session.debug,s=d.model.getState(),p=s.players[s.controlled];return {phase:s.phase,mode:s.mode,x:p.x,z:p.z,speed:Math.hypot(p.vx||0,p.vz||0)};});
 report.start=await ctl();
 // slide: opponent owns ball, force a slide tackle on the controlled player
 await page.evaluate(()=>{const d=window.__island.games.current.session.debug,s=d.model.getState(),p=s.players[s.controlled],o=s.players.find(q=>q.team!==p.team&&q.role!=='keeper');s.phase='playing';o.x=p.x+3;o.z=p.z;s.ball.owner=o.id;s.ball.x=o.x;s.ball.z=o.z;p.slideKind='straight';p.slideTime=.78;p.slideX=1;p.slideZ=0;p.slideCooldown=1;p.slideAttempted=false;p.slideWon=false;window.__t0=performance.now();});
 for(let i=0;i<45;i++){
  const r=await page.evaluate(()=>{const d=window.__island.games.current.session.debug,s=d.model.getState(),p=s.players[s.controlled];return {t:Math.round(performance.now()-window.__t0),slideTime:+(p.slideTime||0).toFixed(2),recover:+(p.recover||0).toFixed(2),speed:+Math.hypot(p.vx||0,p.vz||0).toFixed(2),mode:s.mode};});
  report.slide.push(r);if(i%3===0&&i<40)await shot('2-slide-'+String(i).padStart(2,'0'));
  await page.waitForTimeout(10);
 }
 report.errors=errors;
}finally{await context.close();await browser.close();await server.close();}
await writeFile(path.join(outDir,`${label}-metrics.json`),JSON.stringify(report,null,1));
console.log(JSON.stringify({start:report.start,errors:report.errors,slide:report.slide.filter((_,i)=>i%4==0)}));
