import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';

/** "Catch the Criminal" v6 through the real island: library card, the chase on the track (steer by horizontal drag,
 * boost, fire at the tyres), the handover to the archery throw, hold-drag-release shoots, pause, a won stage pays and
 * unlocks stage 2, a lost stage pays nothing, exit leaves the island untouched, ?catchV6=0 plays v5, and the page's
 * own CSP with no external request and no page error. */
const server=await serveIsland(),chromium=await islandChromium();
const out=process.env.CATCH_QA_DIR||join(tmpdir(),'island-catch-v6-qa');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true});
await context.addInitScript(()=>{localStorage.setItem('island.sound','off');localStorage.setItem('island.catch.help2','1');localStorage.setItem('island.catch.help6','1');});
const page=await context.newPage(),errors=[],outside=[],csp=[];page.setDefaultTimeout(120000);
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(/content security policy|violates/i.test(m.text()))csp.push(m.text());});
page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(server.url).origin)outside.push(r.url());});
const cur=()=>'window.__island.ui.activityInterface.current.session';
const session=()=>page.evaluate(()=>window.__island.ui.activityInterface.current.session.snapshot);
const launch=async (stage,{skipChase=true,target=page}={})=>{
  await target.evaluate(s=>window.__island.ui.activityInterface.launch('catchCriminal',undefined,s),stage);
  await target.waitForFunction(()=>window.__island.ui.activityInterface.current?.session?.snapshot.ready);
  await target.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting!=='true');
  await target.waitForFunction(()=>window.__island.ui.activityInterface.current.session.snapshot.mode==='chase');
  if(!skipChase)return;
  await target.evaluate(()=>window.__island.ui.activityInterface.current.session.debug.skipChase());
  await target.waitForFunction(()=>window.__island.ui.activityInterface.current.session.snapshot.mode==='throw');
  await target.waitForTimeout(400);
};
// a solved shot at full draw: the angle whose arc catches the thief where he will be
const solve=`(()=>{const e=${cur()}.engine,P=e.balance.physics,t0=e.clock+P.throwSeconds;let best=null;
 for(const tool of e.tools.map(t=>t.id)){for(let a=0;a<=50&&!best;a+=.5){
  const f0=e.trajectory(a,1,tool,{yaw:0,withWind:false}),c=e.criminalAt(t0+f0.duration),yaw=Math.atan2(c.z,c.x-P.release.x)*180/Math.PI;
  const f=e.trajectory(a,1,tool,{resolve:true,t0,yaw});if(f.kind==='catch')best=[a,tool,yaw];}if(best)break;}
 return best;})()`;
const finishThrow=async ()=>{await page.evaluate(()=>{const s=window.__island.ui.activityInterface.current.session;for(let i=0;i<60*20&&!['aim','done'].includes(s.engine.state.phase)||(i===0);i++)s.debug.step(1/60);});};
try{
  await page.goto(server.url+'?dev=1&games=1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
  await page.locator('[data-action=avatar-start]').click();
  await page.evaluate(()=>{const e=window.__island.engine;e.skipTutorial();e.tick=()=>({ok:true});window.__island.ui.activityInterface.requireDaily=()=>false;});
  await page.evaluate(()=>window.__island.ui.activityInterface.menu());
  assert.equal(await page.locator('[data-action=game-enter][data-game-id=catchCriminal]').count(),1,'one library card');
  console.log('library card: ok');
  await page.evaluate(()=>window.__island.ui.closeModal?.());
  await launch(1,{skipChase:false});
  await mkdir(out,{recursive:true});
  assert.equal(await page.evaluate(()=>window.__island.ui.activityInterface.current.session.v6),true,'the v6 session runs by default');
  assert.equal(await page.locator('.catch-boost').isVisible(),true,'boost button');
  assert.equal(await page.locator('.catch-throw').isVisible(),false,'no throw button during the chase');
  const track=await page.evaluate(()=>{const t=window.__island.ui.activityInterface.current.session.chase.track;return {arcs:t.segments.filter(s=>s.kind==='arc').length,length:Math.round(t.length)};});
  assert.ok(track.arcs>=3,'the chase road has bends: '+JSON.stringify(track));
  // the countdown, then the opening straight (70 m): boost there, before the first bend pulls the car to the kerb
  await page.evaluate(()=>{const s=window.__island.ui.activityInterface.current.session;for(let i=0;i<60*6&&s.chase.state.phase!=='run';i++)s.debug.stepChase(1/60);});
  await page.waitForTimeout(300);await page.screenshot({path:join(out,'00-chase.png')});
  const box=await page.locator('.catch-boost').boundingBox();
  // the held button reaches the engine through the session's frame loop: wait for two drawn frames (software GL draws slowly)
  const f0=await page.evaluate(()=>window.__island.ui.activityInterface.current.session.debug.held().frames);
  await page.mouse.move(box.x+40,box.y+40);await page.mouse.down();
  await page.waitForFunction(f=>window.__island.ui.activityInterface.current.session.debug.held().frames>=f+2,f0);
  await page.evaluate(()=>{const d=window.__island.ui.activityInterface.current.session.debug;for(let i=0;i<60;i++)d.stepChase(1/60);});
  const boosting=await page.evaluate(()=>({v:window.__island.ui.activityInterface.current.session.chase.state.v,tank:window.__island.ui.activityInterface.current.session.chase.state.tank}));
  await page.mouse.up();
  assert.ok(boosting.v>25,'holding the boost button speeds the car up: '+JSON.stringify(boosting));
  await page.mouse.move(150,200);await page.mouse.down();await page.mouse.move(230,200,{steps:5});
  const steer=await page.evaluate(()=>window.__island.ui.activityInterface.current.session.chase.input.steer);
  await page.mouse.up();
  assert.ok(steer>.5,'dragging right on the left half steers right: '+steer);
  // the tyre gun: lock the reticle by putting the thief close and in line, then the fire button shoots
  await page.evaluate(()=>{const c=window.__island.ui.activityInterface.current.session.chase;c.state.crim.s=c.state.s+12;c.state.crim.d=c.state.d;c.state.stun=0;c.debug;for(let i=0;i<6;i++)c.step(1/60);c.drainEvents();});
  assert.equal(await page.evaluate(()=>window.__island.ui.activityInterface.current.session.chase.gun.state.locked),true,'the reticle locks when the thief is close and in line');
  assert.equal(await page.locator('.catch-fire').isVisible(),true,'fire button');
  const ammo0=await page.evaluate(()=>window.__island.ui.activityInterface.current.session.chase.gun.state.ammo);
  await page.locator('.catch-fire').dispatchEvent('pointerdown');
  await page.waitForTimeout(100);
  const ammo1=await page.evaluate(()=>window.__island.ui.activityInterface.current.session.chase.gun.state.ammo);
  assert.equal(ammo1,ammo0-1,'the fire button spends a bullet');
  await page.screenshot({path:join(out,'01-reticle.png')});
  console.log('chase controls and tyre gun: ok');
  await page.evaluate(()=>window.__island.ui.activityInterface.current.session.debug.skipChase());
  await page.waitForFunction(()=>window.__island.ui.activityInterface.current.session.snapshot.mode==='throw');
  await page.waitForTimeout(500);
  console.log('chase hands over to the throw: ok');
  assert.equal((await session()).phase,'aim');
  assert.equal(await page.locator('.catch-throw').isVisible(),true);
  assert.equal(await page.locator('.catch-bow-sight').count(),1,'the archery sight exists');
  await page.screenshot({path:join(out,'02-aim.png')});
  // archery: hold draws (power 1), dragging right and up turns the aim right and raises it, release shoots
  const before=await page.evaluate(()=>({...window.__island.ui.activityInterface.current.session.engine.aim}));
  await page.mouse.move(520,250);await page.mouse.down();await page.waitForTimeout(350);await page.mouse.move(580,205,{steps:6});await page.waitForTimeout(150);
  const drawn=await page.evaluate(()=>({...window.__island.ui.activityInterface.current.session.engine.aim}));
  assert.equal(drawn.power,1,'holding draws the string to full');
  assert.ok(drawn.yaw>before.yaw&&drawn.angle>before.angle,'dragging right and up turns the aim right and raises it: '+JSON.stringify([before,drawn]));
  await page.screenshot({path:join(out,'03-drawn.png')});
  await page.mouse.up();await page.waitForTimeout(100);
  assert.equal((await session()).phase,'throw','releasing the finger shoots');
  console.log('archery hold, drag and release: ok');
  await finishThrow();
  // pause freezes the clock
  await page.waitForFunction(()=>window.__island.ui.activityInterface.current.session.engine.state.phase==='aim');
  await page.locator('[data-action=game-pause]').click();
  const t0=await page.evaluate(()=>window.__island.ui.activityInterface.current.session.engine.clock);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>window.__island.ui.activityInterface.current.session.engine.clock),t0,'paused');
  await page.locator('[data-action=game-resume]').click();
  console.log('pause and resume: ok');
  // solved shots win stage 1 (two hits), pay and unlock stage 2
  const moneyBefore=await page.evaluate(()=>window.__island.engine.state.money);
  for(let k=0;k<6;k++){
    const st=await page.evaluate(()=>window.__island.ui.activityInterface.current.session.engine.state);
    if(st.phase==='done')break;
    const sol=await page.evaluate(solve);assert.ok(sol,'stage 1 has a solution at full draw (shot '+(k+1)+')');
    await page.evaluate(([a,tool,yaw])=>{const s=window.__island.ui.activityInterface.current.session;s.engine.setTool(tool);s.engine.setAim({angle:a,power:1,yaw});s.engine.release();},sol);
    if(k===0){await page.waitForTimeout(900);await page.screenshot({path:join(out,'04-flight.png')});}
    await finishThrow();
  }
  await page.evaluate(()=>{const s=window.__island.ui.activityInterface.current.session;for(let i=0;i<60*20&&s.engine.state.phase!=='done';i++)s.debug.step(1/60);});
  await page.waitForSelector('[data-result=catchCriminal]');
  await page.screenshot({path:join(out,'05-result.png')});
  const won=await page.evaluate(()=>({stage:window.__island.engine.state.minigameProgress.catchCriminal.stage,stars:window.__island.engine.state.minigameProgress.catchCriminal.stars[0],money:window.__island.engine.state.money}));
  assert.equal(won.stage,2);assert.ok(won.stars>=1);assert.ok(won.money>moneyBefore);
  console.log('won stage pays and unlocks stage 2: ok');
  await page.evaluate(()=>window.__island.ui.closeModal());
  const stars1=won.stars,money1=won.money;
  await launch(2);
  await page.evaluate(()=>{const s=window.__island.ui.activityInterface.current.session;for(let i=0;i<60*90&&s.engine.state.phase!=='done';i++){if(s.engine.state.phase==='aim'){s.engine.setAim({angle:50,power:1,yaw:20});s.engine.release();}s.debug.step(1/60);}});
  await page.waitForSelector('[data-result=catchCriminal]');
  const lost=await page.evaluate(()=>({stage:window.__island.engine.state.minigameProgress.catchCriminal.stage,money:window.__island.engine.state.money,stars:window.__island.engine.state.minigameProgress.catchCriminal.stars[0]}));
  assert.equal(lost.stage,2);assert.equal(lost.money,money1);assert.equal(lost.stars,stars1);
  console.log('lost stage: no payment, no progress: ok');
  await page.evaluate(()=>window.__island.ui.closeModal());
  await launch(2);
  const snapshot=await page.evaluate(()=>window.__island.engine.exportJSON());
  await page.locator('[data-action=game-pause]').click();await page.locator('[data-action=game-exit]').click();
  await page.waitForFunction(()=>!window.__island.engine.isMinigameActive());
  assert.equal(await page.evaluate(()=>window.__island.engine.exportJSON()),snapshot);
  assert.equal(await page.locator('.catch-hud').count(),0,'HUD removed on exit');
  console.log('exit leaves the island untouched: ok');
  // the off switch: ?catchV6=0 plays v5 (the over-the-shoulder throw with the v5 session)
  const page2=await context.newPage();page2.setDefaultTimeout(120000);page2.on('pageerror',e=>errors.push(e.message));
  await page2.goto(server.url+'?dev=1&games=1&catchV6=0',{waitUntil:'networkidle'});
  await page2.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
  if(await page2.locator('[data-action=avatar-start]').count())await page2.locator('[data-action=avatar-start]').click();
  await page2.evaluate(()=>{const e=window.__island.engine;e.skipTutorial();e.tick=()=>({ok:true});window.__island.ui.activityInterface.requireDaily=()=>false;});
  await launch(1,{skipChase:false,target:page2});
  const v5=await page2.evaluate(()=>{const s=window.__island.ui.activityInterface.current.session;return {mode:s.snapshot.mode,v6:s.v6};});
  assert.deepEqual(v5,{mode:'chase',v6:undefined});assert.equal(await page2.locator('.catch-fire').count(),0,'no fire button in v5');
  console.log('?catchV6=0 keeps v5: ok');
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.deepEqual(csp,[]);
  await writeFile(join(out,'report.json'),JSON.stringify({checks:['library card','v6 by default','track has bends','boost','steer drag','reticle lock','fire button','chase to throw','archery sight','hold draws','drag aims','release shoots','pause','win pays and unlocks','loss pays nothing','exit clean','catchV6=0 keeps v5','CSP clean','no external requests']},null,1));
  console.log('Catch the Criminal v6 browser: all checks passed');
}finally{await browser.close();await server.close();}
