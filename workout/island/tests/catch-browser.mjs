import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';

/** "Catch the Criminal" through the real island: library card, launch, drag aim, throw,
 * pause, a won stage that pays and unlocks stage 2, a lost stage, and the page's own CSP
 * (script-src 'self', no WebAssembly) with no external request and no page error. */
const server=await serveIsland(),chromium=await islandChromium();
const out=process.env.CATCH_QA_DIR||join(tmpdir(),'island-catch-qa');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true});
await context.addInitScript(()=>{localStorage.setItem('island.sound','off');localStorage.setItem('island.catch.help2','1');});
const page=await context.newPage(),errors=[],outside=[],csp=[];page.setDefaultTimeout(120000);
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(/content security policy|violates/i.test(m.text()))csp.push(m.text());});
page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(server.url).origin)outside.push(r.url());});
const session=()=>page.evaluate(()=>window.__island.ui.activityInterface.current.session.snapshot);
const solve=`(()=>{const e=window.__island.ui.activityInterface.current.session.engine,st=e.state;let best=null;
 for(const tool of e.tools.map(t=>t.id)){for(let a=12;a<=72&&!best;a+=1)for(let p=.2;p<=1&&!best;p+=.01){const f=e.trajectory(a,p,tool,{resolve:true,t0:e.clock+e.balance.physics.throwSeconds});if(f.kind==='catch')best=[a,p,tool];}if(best)break;}
 return best;})()`;
const launch=async (stage,{skipChase=true,target=page}={})=>{
  await target.evaluate(s=>window.__island.ui.activityInterface.launch('catchCriminal',undefined,s),stage);
  await target.waitForFunction(()=>window.__island.ui.activityInterface.current?.session?.snapshot.ready);
  await target.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting!=='true');
  if(!skipChase)return;
  await target.waitForFunction(()=>window.__island.ui.activityInterface.current.session.snapshot.mode==='chase');
  await target.evaluate(()=>window.__island.ui.activityInterface.current.session.debug.skipChase());
  await target.waitForFunction(()=>window.__island.ui.activityInterface.current.session.snapshot.mode==='throw');
};
try{
  await page.goto(server.url+'?dev=1&games=1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
  await page.locator('[data-action=avatar-start]').click();
  await page.evaluate(()=>{const e=window.__island.engine;e.skipTutorial();e.tick=()=>({ok:true});window.__island.ui.activityInterface.requireDaily=()=>false;});
  await page.evaluate(()=>window.__island.ui.activityInterface.menu());
  assert.equal(await page.locator('[data-action=game-enter][data-game-id=catchCriminal]').count(),1,'one library card');
  console.log('library card: ok');
  await page.evaluate(()=>window.__island.ui.closeModal?.());
  // v2: every stage opens with the car chase
  await launch(1,{skipChase:false});
  await mkdir(out,{recursive:true});
  await page.waitForFunction(()=>window.__island.ui.activityInterface.current.session.snapshot.mode==='chase');
  assert.equal(await page.locator('.catch-boost').isVisible(),true,'boost button');
  assert.equal(await page.locator('.catch-throw').isVisible(),false,'no throw button during the chase');
  await page.evaluate(()=>{const d=window.__island.ui.activityInterface.current.session.debug;for(let i=0;i<60*4;i++)d.stepChase(1/60);});
  await page.screenshot({path:join(out,'00-chase.png')});
  const box=await page.locator('.catch-boost').boundingBox();
  await page.mouse.move(box.x+40,box.y+40);await page.mouse.down();await page.waitForTimeout(400);
  await page.evaluate(()=>{const d=window.__island.ui.activityInterface.current.session.debug;for(let i=0;i<60*2;i++)d.stepChase(1/60);});
  const boosting=await page.evaluate(()=>({v:window.__island.ui.activityInterface.current.session.chase.state.v,tank:window.__island.ui.activityInterface.current.session.chase.state.tank}));
  await page.mouse.up();
  assert.ok(boosting.v>25,'holding the boost button speeds the car up: '+JSON.stringify(boosting));
  await page.mouse.move(150,180);await page.mouse.down();await page.mouse.move(150,260,{steps:5});
  const steer=await page.evaluate(()=>window.__island.ui.activityInterface.current.session.chase.input.steer);
  await page.mouse.up();
  assert.ok(steer>.5,'dragging down on the left steers toward the camera lane: '+steer);
  console.log('chase controls: ok');
  await page.evaluate(()=>window.__island.ui.activityInterface.current.session.debug.skipChase());
  await page.waitForFunction(()=>window.__island.ui.activityInterface.current.session.snapshot.mode==='throw');
  console.log('chase hands over to the throw: ok');
  assert.equal((await session()).phase,'aim');
  assert.equal(await page.locator('.catch-throw').isVisible(),true);
  assert.equal(await page.locator('.catch-tool').count(),2,'two tools on stage 1');
  await page.screenshot({path:join(out,'01-aim.png')});
  const before=await page.evaluate(()=>({...window.__island.ui.activityInterface.current.session.engine.aim}));
  await page.mouse.move(380,230);await page.mouse.down();await page.mouse.move(330,250,{steps:6});await page.mouse.up();
  const after=await page.evaluate(()=>({...window.__island.ui.activityInterface.current.session.engine.aim}));
  assert.ok(after.power>before.power&&after.angle>before.angle,'dragging left and down raises power and angle: '+JSON.stringify([before,after]));
  console.log('drag aim: ok');
  // pause freezes the clock
  await page.locator('[data-action=game-pause]').click();
  const t0=await page.evaluate(()=>window.__island.ui.activityInterface.current.session.engine.clock);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>window.__island.ui.activityInterface.current.session.engine.clock),t0,'paused');
  await page.locator('[data-action=game-resume]').click();
  console.log('pause and resume: ok');
  // a solved throw wins stage 1, pays and unlocks stage 2
  const moneyBefore=await page.evaluate(()=>window.__island.engine.state.money);
  const sol=await page.evaluate(solve);assert.ok(sol,'stage 1 has a solution');
  await page.evaluate(([a,p,tool])=>{const s=window.__island.ui.activityInterface.current.session;s.engine.setTool(tool);s.engine.setAim({angle:a,power:p});},sol);
  await page.locator('.catch-throw').click();
  assert.equal((await session()).phase,'throw');
  await page.waitForTimeout(900);await page.screenshot({path:join(out,'02-flight.png')});
  await page.evaluate(()=>{const s=window.__island.ui.activityInterface.current.session;for(let i=0;i<60*20&&s.engine.state.phase!=='done';i++)s.debug.step(1/60);});
  await page.waitForSelector('[data-result=catchCriminal]');
  await page.screenshot({path:join(out,'03-result.png')});
  const won=await page.evaluate(()=>({stage:window.__island.engine.state.minigameProgress.catchCriminal.stage,stars:window.__island.engine.state.minigameProgress.catchCriminal.stars[0],money:window.__island.engine.state.money}));
  assert.equal(won.stage,2);assert.ok(won.stars>=1);assert.ok(won.money>moneyBefore);
  console.log('won stage pays and unlocks stage 2: ok');
  await page.evaluate(()=>window.__island.ui.closeModal());
  // three misses lose the stage and pay nothing
  const stars1=won.stars,money1=won.money;
  await launch(2);
  await page.evaluate(()=>{const s=window.__island.ui.activityInterface.current.session;s.engine.setAim({angle:75,power:1});for(let i=0;i<60*60&&s.engine.state.phase!=='done';i++){if(s.engine.state.phase==='aim')s.engine.release();s.debug.step(1/60);}});
  await page.waitForSelector('[data-result=catchCriminal]');
  const lost=await page.evaluate(()=>({stage:window.__island.engine.state.minigameProgress.catchCriminal.stage,money:window.__island.engine.state.money,stars:window.__island.engine.state.minigameProgress.catchCriminal.stars[0]}));
  assert.equal(lost.stage,2);assert.equal(lost.money,money1);assert.equal(lost.stars,stars1);
  console.log('lost stage: no payment, no progress: ok');
  await page.evaluate(()=>window.__island.ui.closeModal());
  // cancel mid-game leaves the island untouched
  await launch(2);
  const snapshot=await page.evaluate(()=>window.__island.engine.exportJSON());
  await page.locator('[data-action=game-pause]').click();await page.locator('[data-action=game-exit]').click();
  await page.waitForFunction(()=>!window.__island.engine.isMinigameActive());
  assert.equal(await page.evaluate(()=>window.__island.engine.exportJSON()),snapshot);
  assert.equal(await page.locator('.catch-hud').count(),0,'HUD removed on exit');
  console.log('exit leaves the island untouched: ok');
  // the off switch: ?catchV2=0 plays the v1 stage with no chase
  const page2=await context.newPage();page2.setDefaultTimeout(120000);page2.on('pageerror',e=>errors.push(e.message));
  await page2.goto(server.url+'?dev=1&games=1&catchV2=0',{waitUntil:'networkidle'});
  await page2.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
  if(await page2.locator('[data-action=avatar-start]').count())await page2.locator('[data-action=avatar-start]').click();
  await page2.evaluate(()=>{const e=window.__island.engine;e.skipTutorial();e.tick=()=>({ok:true});window.__island.ui.activityInterface.requireDaily=()=>false;});
  await launch(1,{skipChase:false,target:page2});
  const v1=await page2.evaluate(()=>{const s=window.__island.ui.activityInterface.current.session;return {mode:s.snapshot.mode,v2:s.snapshot.v2,throws:s.engine.throwsTotal};});
  assert.deepEqual(v1,{mode:'throw',v2:false,throws:3});assert.equal(await page2.locator('.catch-boost').isVisible(),false);
  console.log('?catchV2=0 keeps v1: ok');
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.deepEqual(csp,[]);
  await writeFile(join(out,'report.json'),JSON.stringify({checks:['library card','chase controls','chase to throw','catchV2=0 keeps v1','drag aim','pause','win pays and unlocks','loss pays nothing','exit clean','CSP clean','no external requests']},null,1));
  console.log('Catch the Criminal integration browser: all checks passed');
}finally{await browser.close();await server.close();}
