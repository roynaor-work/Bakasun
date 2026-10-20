import {waitForGameStart,prepareGameBuildings} from './shell-ready.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland} from '../../../tests/helpers/island-browser.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=fileURLToPath(new URL('../verification/g3b/',import.meta.url));await mkdir(directory,{recursive:true});
const server=await serveIsland('/workout/island/'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const reports=[],soccerColors=process.argv.includes('--soccer-colors');
try{for(const width of (process.env.G3B_WIDTH?[Number(process.env.G3B_WIDTH)]:soccerColors?[390]:[390,360,1440])){
 const context=await browser.newContext({viewport:{width,height:Number(process.env.G3B_HEIGHT)||(width===360?740:width===390?844:1000)},hasTouch:true,deviceScaleFactor:1}),page=await context.newPage(),errors=[],outside=[],requests=[],shots=[];
 context.setDefaultTimeout(240000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')){requests.push(u.href);if(!u.pathname.startsWith('/workout/island/'))outside.push(u.href);}});
 let decodedBytes=0;const pendingBodies=new Set();page.on('response',response=>{if(!response.url().startsWith(server.url))return;const task=response.body().then(body=>{decodedBytes+=body.length;}).catch(()=>{});pendingBodies.add(task);task.finally(()=>pendingBodies.delete(task));});
 const loadBytes=async()=>{await Promise.all([...pendingBodies]);return decodedBytes;};
 const tick=ms=>page.clock.runFor(ms),snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot),tap=selector=>page.locator(selector).tap();
 async function shot(name){if(soccerColors&&!['soccer-pitch','failure'].includes(name))return;const file=`${width}-${name}.png`;await page.screenshot({path:directory+file});shots.push(file);}
 async function exit(){if(!await page.locator('[data-action=game-exit]').count())await page.locator('[data-action=game-pause]').tap();await page.evaluate(()=>{window.__previousSession=window.__island.games.current.session;window.__previousModel=window.__previousSession.debug?.model;});await tap('[data-action=game-exit]');assert.equal(await page.evaluate(()=>window.__island.engine.isMinigameActive()),false);assert.equal(await page.evaluate(()=>window.__island.view.paused),false);if(await page.evaluate(()=>window.__previousSession.snapshot.disposed!==undefined))assert.equal(await page.evaluate(()=>window.__previousSession.snapshot.disposed),true);await page.evaluate(()=>{window.__previousSnapshot=window.__previousModel?.snapshot();});}
 async function readySoccer(){if(await page.locator('[data-action=game-understood]').count()){await page.clock.runFor(32);await tap('[data-action=game-understood]');}await waitForGameStart(page);await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.renderMetrics?.assetStatus==='ready');await tick(100);assert.equal(await page.evaluate(()=>window.__island.view.paused),true);}
 async function start(id){await page.evaluate(id=>window.__island.games.start(id,undefined,1),id);if(await page.locator('[data-action=game-understood]').count()){await page.clock.runFor(32);await tap('[data-action=game-understood]');}await waitForGameStart(page);await tick(100);}
 try{
  // The root Python server also serves sibling lab routes; the default
  // subtree server retains its isolation check.
  if(!process.env.ISLAND_URL)assert.equal((await context.request.get(server.url.replace('/workout/island/','/codex-lab/island-soccer/'))).status(),404);
  await page.clock.install();await page.goto(server.url+'?dev=1&games=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await tap('[data-action=avatar-start]');
  await page.evaluate(()=>{const {engine,data}=window.__island;engine.skipTutorial();data.featureFlags.events=false;data.config.minigames.slowFrameMs=10000;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;data.config.minigames.soccer.view.slowFrameMs=10000;});await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));
  const initialLoadBytes=await loadBytes();
  const card=page.locator('.game-card[data-game=soccer]');assert.equal(await card.getAttribute('data-locked'),'true');assert.equal(await card.locator('[data-action=game-play]').isEnabled(),true);assert.match(await card.innerText(),/יש לבנות מגרש כדורגל/);await shot('locked');await tap('[data-action=close-modal]');
  const pitch=await page.evaluate(()=>{const {engine}=window.__island;for(let z=0;z<16;z++)for(let x=0;x<16;x++){const result=engine.place('soccer',x,z);if(result.ok)return result;}throw Error('no soccer placement');});
  const soccerBefore=await loadBytes();await page.evaluate(()=>window.__island.games.menu());await card.locator('[data-action=game-play]').tap();await tap('[data-stage="1"]');await readySoccer();
  if(soccerColors){
   const m=await snap(),expected=await page.evaluate(()=>({team:window.__island.data.team.colors,opponent:window.__island.data.config.minigames.soccer.opponents.teams[0].colors}));
   assert.equal(m.stage,1);assert.deepEqual(m.team.colors,expected.team);assert.deepEqual(m.opponent.colors,expected.opponent);assert.equal(m.opponent.colors[0],'#e94d51');assert.notEqual(m.team.colors[0],m.opponent.colors[0]);
   await shot('soccer-pitch');await exit();assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
   reports.push({width,stage:m.stage,teamColors:m.team.colors,opponentColors:m.opponent.colors,soccer:m.renderMetrics,outsideRequests:outside,consoleErrors:errors,shots});console.log('G3b jersey colors verified',width);continue;
  }
  // Charge/input is tested with possession secured; the live rival may now
  // legally win the ball during the preceding movement exercise.
  const chargePossession=()=>page.evaluate(()=>{const q=window.__island.games.current.session,s=q.debug.model.getState(),c=window.__island.data.config.minigames.soccer,p=s.players[s.controlled];q.debug.model.clearInput();Object.assign(s,{phase:'playing',restart:null});p.cooldown=0;Object.assign(s.ball,{owner:p.id,x:p.x+p.fx*c.physics.dribbleOffset,z:p.z+p.fz*c.physics.dribbleOffset,y:c.physics.ballRadius,grace:2,flight:null,lastTeam:0,lastPlayer:p.id});});
  let m=await snap();const initial=m.players[0].x;await page.keyboard.down('ArrowRight');await tick(1700);await page.keyboard.up('ArrowRight');m=await snap();assert.ok(m.players[0].x>initial+1,JSON.stringify({initial,player:m.players[0],phase:m.phase,elapsed:m.elapsed,paused:m.paused,active:await page.evaluate(()=>document.activeElement.outerHTML)}));await chargePossession();await page.keyboard.down('Space');await tick(600);assert.ok((await snap()).charge>0);await page.keyboard.up('Space');await tick(300);
  const soccerLoadBytes=(await loadBytes())-soccerBefore;assert.ok(soccerLoadBytes>0);const metrics=(await snap()).renderMetrics;assert.ok(metrics.triangles<=130000,JSON.stringify(metrics));assert.ok(metrics.drawCalls<=90);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await shot('soccer-menu');
  // Pause freezes time and clears a held kick before reopening play.
  await page.keyboard.down('Space');await tick(100);await tap('[data-action=game-pause]');const pausedElapsed=(await snap()).elapsed;await tick(500);assert.equal((await snap()).elapsed,pausedElapsed);assert.equal((await snap()).charging,false);await page.keyboard.up('Space');await tap('[data-action=game-resume]');await tick(100);await exit();
  await page.evaluate(id=>window.__island.ui.showInfo(id),pitch.id);await tap('[data-action=soccer-building-play]');await tap('[data-stage="1"]');await readySoccer();
  const cdp=await context.newCDPSession(page),stick=await page.locator('.soccer-stick-zone').boundingBox(),shoot=await page.locator('#shoot').boundingBox();const touches=[{id:1,x:stick.x+stick.width/2,y:stick.y+stick.height/2},{id:2,x:shoot.x+shoot.width/2,y:shoot.y+shoot.height/2}];
  await chargePossession();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches});touches[0].x+=30;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches});await tick(800);assert.ok((await snap()).charge>0);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await tick(300);await shot('soccer-pitch');
  assert.deepEqual(await page.evaluate(()=>window.__previousModel.snapshot()),await page.evaluate(()=>window.__previousSnapshot));
  // Scenario injection follows the lab's testing contract, then ordinary model update finishes the match.
  await page.evaluate(()=>{const s=window.__island.games.current.session.debug.model.getState();s.half=2;s.halfElapsed=74.95;s.elapsed=149.95;s.score=[1,0];});await tick(150);assert.equal(await page.locator('[data-result=soccer]').count(),1);assert.equal(await page.evaluate(()=>window.__island.engine.state.team.wins),1);await shot('soccer-result');await tap('[data-action=game-exit]');
  await page.evaluate(()=>window.__island.games.team());assert.match(await page.locator('[data-team=soccer]').innerText(),/ליגה ד/);await tap('[data-action=close-modal]');
  await prepareGameBuildings(page);const patrolBefore=await loadBytes();await start('navalDuel');await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.renderMetrics?.playerLoaded);await tick(100);const patrolLoadBytes=(await loadBytes())-patrolBefore;const patrol=(await snap()).renderMetrics;await shot('patrol-model');await exit();
  await page.route('**/assets/models/boat-patrol-512.glb*',route=>route.fulfill({status:200,contentType:'model/gltf-binary',body:'invalid model for fallback test'}));await start('navalDuel');await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.renderMetrics?.models.failed>0);await tick(100);const fallback=(await snap()).renderMetrics;assert.equal(fallback.playerLoaded,false);await shot('patrol-fallback');await exit();
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  reports.push({width,initialLoadBytes,soccerLoadBytes,patrolLoadBytes,soccer:metrics,patrol,fallback,lockedWithoutPitch:true,menuEntry:true,pitchEntry:true,keyboardAndMultitouch:true,pauseClearsInput:true,reopenAndCleanup:true,resultAndTeamWin:true,labBlocked:process.env.ISLAND_URL?null:true,outsideRequests:outside,consoleErrors:errors,requestCount:requests.length,shots});console.log('G3b verified',width);
 }catch(error){await shot('failure');throw error;}finally{await context.close();}
}
 const sizes={};for(const path of ['assets/kid-full.glb','assets/models/boat-patrol-512.glb','minigames/soccer.mjs','minigames/soccer-view.mjs','minigames/soccer-session.mjs'])sizes[path]=(await stat(new URL('../'+path,import.meta.url))).size;
 await writeFile(directory+(soccerColors?'soccer-colors.json':'verification.json'),JSON.stringify({release:'task016-20261016-1',saveVersion:8,browser:'Chromium / ANGLE SwiftShader',physicalPhone:false,realFPS:false,sizes,reports},null,2)+'\n');
}finally{await browser.close();await server.close();}
