// racing-v24 browser proof: the Codex team liveries in a real league race, from the city to the league result, in Chromium/SwiftShader with REAL touch at 844x390
// (hasTouch + isMobile). Nothing is written into the island or the race: a fresh island is opened as a child would (avatar, "משחקים", racing, play, the league card,
// "למרוץ"), one finger (CDP Input.dispatchTouchEvent) holds the gas pedal for the whole race and a second finger steers on the left half of the screen. The race model
// is only read, to aim the steering finger (look-ahead on the centre line, like the test bot) and for the report. The real clock runs (no fake timers): a slow software
// frame advances the race by the session's 0.1 s cap, so a whole race is a few thousand frames.
// Checks: the formula cars wear the livery (view metrics), the grid card, the timing tower, the podium and the league table show the team colour (two cars per colour)
// and the team crests; no page error, no CSP violation, no request outside the island. RV24_QUERY=racingLiveries=0 checks the previous colours (RV24_FULL=0: grid,
// tower and a few seconds of racing only). Screenshots and the report: verification/<RV24_PART>/.
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium node workout/island/tests/racing-v24-browser.mjs
//        RV24_QUERY=racingLiveries=0 RV24_PART=racing-v24/off RV24_FULL=0 node workout/island/tests/racing-v24-browser.mjs
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {serveIsland,installIslandCspMonitor} from '../../../tests/helpers/island-browser.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const query=process.env.RV24_QUERY||'',part=process.env.RV24_PART||'racing-v24/league-race',full=process.env.RV24_FULL!=='0',maxMinutes=Number(process.env.RV24_MAX_MIN||240);
const dir=fileURLToPath(new URL(`../verification/${part}/`,import.meta.url));await mkdir(dir+'frames/',{recursive:true});
const TEAMS={flame:'#d93228',ocean:'#18b6bd',gold:'#d6aa3b',silver:'#b7c2ca',forest:'#7ac05a',night:'#a05fc4'};
const TEAM_OF={1:'flame',4:'flame',16:'ocean',63:'ocean',44:'gold',81:'gold',11:'silver',31:'silver',27:'forest',14:'forest',55:'night',22:'night'};
const OWN={1:'#d93228',16:'#18b6bd',44:'#d6aa3b',63:'#566bd1',11:'#b7c2ca',4:'#e07b39',27:'#7ac05a',55:'#a05fc4',81:'#e0c3a1',14:'#4b6a88',22:'#2b2f36',31:'#e8e6d2'};
const liveries=!/racingLiveries=0/.test(query),expect=n=>liveries?TEAMS[TEAM_OF[n]]:OWN[n];
const hex=c=>{const m=String(c||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);return m?'#'+[m[1],m[2],m[3]].map(v=>Number(v).toString(16).padStart(2,'0')).join(''):String(c||'').trim().toLowerCase();};
const server=await serveIsland('/workout/island/'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const report={part,query,liveries,full,browser:'Chromium / SwiftShader',physicalPhone:false,viewport:'844x390 hasTouch isMobile',steps:[],shots:[],laps:[],events:[]};
const t0=Date.now(),clock=()=>+((Date.now()-t0)/1000).toFixed(1);
let csp=null,context=null;
try{
 context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(300000);
 csp=await installIslandCspMonitor(context);const page=await context.newPage();await csp.attachPage(page);
 const errors=[],outside=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith('/workout/island/'))outside.push(u.href);});
 const missing=[];page.on('response',r=>{if(r.status()>=400)missing.push(r.status()+' '+new URL(r.url()).pathname);});
 // headless Chromium has no fullscreen and no orientation lock; the shell asks for both on a phone
 await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});});
 const shot=async(name,save=true)=>{const png=await page.screenshot({type:'png'});if(!save)return;const webp=await page.evaluate(async b=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],{type:'image/png'})),c=new OffscreenCanvas(bitmap.width,bitmap.height);c.getContext('2d').drawImage(bitmap,0,0);bitmap.close();const blob=await c.convertToBlob({type:'image/webp',quality:.6});return new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob);});},png.toString('base64'));await writeFile(dir+'frames/'+name+'.webp',Buffer.from(webp,'base64'));report.shots.push(name);};
 const tap=async(selector,label=selector)=>{const l=page.locator(selector).first();await l.waitFor({state:'visible'});await l.tap();report.steps.push({at:clock(),tap:label});};
 const race=()=>page.evaluate(()=>{const s=window.__island?.games?.current?.session,m=s?.debug?.model;if(!m)return null;const p=m.state.player;return {phase:m.state.phase,time:+m.state.time.toFixed(2),lap:p.lap,laps:m.state.laps,rank:p.rank,speed:+p.speed.toFixed(1),finished:!!p.finished,crashT:+(p.crashT||0).toFixed(2),lapTimes:[...p.lapTimes],frames:s.snapshot?.renderMetrics?.frames||0,quality:s.snapshot?.renderMetrics?.quality};});

 // 1. the city, as a child opens it: avatar, the games button, racing, play, the league card
 await page.goto(server.url+'?dev=1'+(query?'&'+query:''),{waitUntil:'load'});await csp.assertClean();
 await page.waitForFunction(()=>window.__island?.view?.metrics?.().avatarLoaded,null,{timeout:300000});
 await tap('[data-action=avatar-start]','avatar');await tap('[data-action=quick-games]','משחקים');await tap('[data-action=game-enter][data-game-id=islandRacing]','מרוצים');
 await tap('[data-action=game-play]','שחקו');await page.locator('[data-action=racing-league-go]').waitFor({state:'visible'});
 const leagueChips=await page.evaluate(()=>[...document.querySelectorAll('.rl-chip')].map(c=>({no:Number(c.textContent.trim()),team:getComputedStyle(c).getPropertyValue('--team').trim()})));
 report.leagueCardChips=leagueChips;await shot('1-league-card');
 await tap('[data-action=racing-league-go]','לליגה: המרוץ הבא');
 if(await page.locator('[data-action=game-understood]').count())await tap('[data-action=game-understood]','הבנתי');
 await page.waitForFunction(()=>window.__island?.games?.current?.session?.snapshot?.renderMetrics?.frames>1,null,{timeout:600000});report.steps.push({at:clock(),view:'ready'});

 // 2. the grid card: every chip in the expected colour (team colour, both team-mates alike), the team crest
 await page.locator('.racing-intro .rb-grid-slot').first().waitFor({state:'visible'});
 const grid=await page.evaluate(()=>[...document.querySelectorAll('.racing-intro .rb-grid-slot .rb-chip')].map(c=>({no:Number(c.querySelector('.rb-no')?.textContent),name:c.querySelector('.rb-name')?.textContent,team:getComputedStyle(c).getPropertyValue('--team').trim(),crest:c.querySelector('img')?.getAttribute('src')||''})));
 report.grid=grid;await shot('2-grid-card');
 assert.ok(grid.length>=8,'the grid card lists the field: '+grid.length);
 for(const g of grid){assert.equal(hex(g.team),expect(g.no),`grid chip #${g.no} ${g.name}`);if(g.crest)assert.match(g.crest,liveries?new RegExp(`/racing-league-v1/teams/${TEAM_OF[g.no]}\\.svg`):/\/racing-broadcast-v1\/teams\//,'crest #'+g.no);}
 if(liveries){const byColour=new Map();for(const g of grid)byColour.set(hex(g.team),(byColour.get(hex(g.team))||0)+1);report.gridColours=Object.fromEntries(byColour);assert.ok([...byColour.values()].some(n=>n===2),'team-mates share a colour on the grid card');}
 await tap('[data-action=racing-intro-go]','למרוץ');
 const metrics=await page.evaluate(()=>{const r=window.__island.games.current.session.snapshot.renderMetrics;return {liveries:r.liveries,failures:r.failures,carAsset:r.carAsset,drawCalls:r.drawCalls,triangles:r.triangles,quality:r.quality};});
 report.viewAtStart=metrics;
 if(liveries){assert.equal(metrics.liveries.active,true,'the liveries are on the cars: '+JSON.stringify(metrics.liveries));assert.ok(metrics.liveries.cars>=1&&metrics.liveries.plates===metrics.liveries.cars,'every formula car has its plate');assert.ok(!metrics.failures.includes('liveries'));}
 else assert.deepEqual(metrics.liveries,{enabled:false,active:false,reason:'off',cars:0,plates:0});

 // 3. real touch: finger 1 holds the gas pedal, finger 2 steers on the pad
 const cdp=await context.newCDPSession(page),touches=new Map();
 const send=async type=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...touches.values()]});
 const down=async(id,x,y)=>{touches.set(id,{x,y,id,radiusX:6,radiusY:6,force:1});await send('touchStart');};
 const move=async(id,x,y)=>{touches.set(id,{x,y,id,radiusX:6,radiusY:6,force:1});await send('touchMove');};
 const upAll=async()=>{touches.clear();await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 for(let i=0;i<600&&(await race())?.phase!=='racing';i++)await page.waitForTimeout(100);
 const gas=await page.locator('.racing-accelerate').boundingBox(),pad=await page.locator('.racing-pad').boundingBox();
 assert.ok(gas&&gas.width>20,'the gas pedal is on screen');assert.ok(pad&&pad.width>200,'the steering pad covers the left half');report.controls={gas,pad};
 await down(1,gas.x+gas.width/2,gas.y+gas.height/2);
 const x0=pad.x+pad.width*.5,y0=pad.y+pad.height*.6,travel=Math.max(44,Math.min(70,pad.width*.14)),DEAD=.04,EXPO=1.2;
 await down(2,x0,y0);
 // the steering finger: the bot's look-ahead steer (world, + = left), turned into the finger offset that racing-controls maps back to it (dead zone, expo)
 const aim=()=>page.evaluate(()=>{const m=window.__island.games.current?.session?.debug?.model;if(!m)return null;const p=m.state.player,tr=m.track,w=a=>Math.atan2(Math.sin(a),Math.cos(a)),pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),e=w(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);return Math.max(-1,Math.min(1,e*1.7));});
 const fingerFor=steer=>{const raw=-steer,a=Math.abs(raw);if(a<.01)return 0;return Math.sign(raw)*(DEAD+(1-DEAD)*Math.pow(a,1/EXPO))*travel;};
 let nextShot=0,lastLap=0,lastLog=0,state=await race(),checkedTower=false,frames0=state.frames;const raceStart=Date.now();
 const limit=full?Infinity:6;
 while(state&&state.phase!=='finished'&&!state.finished&&state.time<limit){
  if((Date.now()-t0)/60000>maxMinutes)throw Error('the race did not finish in '+maxMinutes+' minutes of real time');
  const steer=await aim();if(steer!==null)await move(2,x0+fingerFor(steer),y0);
  state=await race();if(!state)break;
  if(state.lap>lastLap){lastLap=state.lap;report.laps.push({lap:state.lap,at:state.time,rank:state.rank,real:clock()});}
  if(state.time>=nextShot){nextShot+=full?25:3;await shot(`3-race-${String(Math.round(state.time)).padStart(3,'0')}s`);}
  if(!checkedTower&&state.time>4){checkedTower=true;
   const tower=await page.evaluate(()=>[...document.querySelectorAll('.racing-tower .rt-row')].filter(r=>r.style.display!=='none').map(r=>({no:Number(r.querySelector('.rt-no')?.textContent),bar:r.querySelector('.rt-bar')?.style.background||''})));
   report.tower=tower;assert.ok(tower.length>=5,'the tower lists the field');
   for(const r of tower){if(/url\(/.test(r.bar))assert.match(r.bar,liveries?new RegExp(`/racing-league-v1/teams/${TEAM_OF[r.no]}\\.svg`):/\/racing-broadcast-v1\/teams\//,'tower crest #'+r.no);else assert.equal(hex(r.bar),expect(r.no),'tower bar #'+r.no);}
   await shot('4-tower');}
  if(Date.now()-lastLog>30000){lastLog=Date.now();console.log(part,clock(),'s real',JSON.stringify(state));}
  await page.waitForTimeout(30);
 }
 report.race={...state,realSeconds:Math.round((Date.now()-raceStart)/1000),frames:state.frames-frames0};
 report.events=await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.events?.slice?.(-20)||null).catch(()=>null);
 await upAll();
 if(full){
  assert.ok(state.phase==='finished'||state.finished,'the league race finished: '+JSON.stringify(state));
  // 4. the podium (broadcast): the three steps and the classification in the expected colours
  await page.locator('.racing-podium').waitFor({state:'visible',timeout:300000});
  const podium=await page.evaluate(()=>({steps:[...document.querySelectorAll('.racing-podium .racing-podium-step')].map(s=>({no:Number((s.querySelector('.rp-step-no')?.textContent||'').replace('#','')),car:getComputedStyle(s.querySelector('.racing-podium-car')).backgroundColor})),
   table:[...document.querySelectorAll('.racing-podium .rp-row .rb-chip')].map(c=>({no:Number(c.querySelector('.rb-no')?.textContent),team:getComputedStyle(c).getPropertyValue('--team').trim()}))}));
  report.podium=podium;await shot('5-podium');
  assert.equal(podium.steps.length,3,'three podium steps');for(const s of podium.steps)assert.equal(hex(s.car),expect(s.no),'podium step #'+s.no);
  assert.ok(podium.table.length>=8);for(const r of podium.table)assert.equal(hex(r.team),expect(r.no),'classification #'+r.no);
  await tap('.racing-podium','podium: continue');
  // 5. the league result screen: the table chips in the expected colours, the race recorded
  await page.locator('[data-racing-league-result]').waitFor({state:'visible',timeout:300000});
  const result=await page.evaluate(()=>({chips:[...document.querySelectorAll('[data-racing-league-result] .rl-chip')].map(c=>({no:Number(c.textContent.trim()),team:getComputedStyle(c).getPropertyValue('--team').trim()})),league:(({race,history})=>({race,history:history.length,last:history.at(-1)}))(window.__island.engine.state.islandRacingLeague)}));
  report.leagueResult=result;await shot('6-league-result');
  assert.equal(result.league.race,1,'the race is recorded in the league');assert.equal(result.league.history,1);
  for(const c of result.chips)if(c.no)assert.equal(hex(c.team),expect(c.no),'league chip #'+c.no);
 }else{
  // the off check ends here: leave the race through the pause sheet
  await tap('[data-action=game-pause]','pause');await tap('[data-action=game-exit]','exit');
 }
 await csp.assertClean();report.errors=errors;report.outside=outside;report.missing=missing;report.realSeconds=clock();
 assert.deepEqual(errors,[],'no page error');assert.deepEqual(outside,[],'no request outside the island');
 console.log(part,'verified',JSON.stringify({race:report.race,laps:report.laps.length,shots:report.shots.length}));
}catch(e){report.failed=true;report.error=e.stack||e.message;console.error(part,'failed',e.message);process.exitCode=1;}
finally{report.csp=csp?.snapshot?.()||null;await writeFile(dir+'verification.json',JSON.stringify(report,null,1)+'\n');await context?.close().catch(()=>{});await csp?.dispose?.();await browser.close();await server.close();}
