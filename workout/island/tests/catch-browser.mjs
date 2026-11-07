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
await context.addInitScript(()=>{localStorage.setItem('island.sound','off');localStorage.setItem('island.catch.help','1');});
const page=await context.newPage(),errors=[],outside=[],csp=[];page.setDefaultTimeout(120000);
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(/content security policy|violates/i.test(m.text()))csp.push(m.text());});
page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(server.url).origin)outside.push(r.url());});
const session=()=>page.evaluate(()=>window.__island.ui.activityInterface.current.session.snapshot);
const solve=`(()=>{const e=window.__island.ui.activityInterface.current.session.engine,st=e.state;let best=null;
 for(const tool of e.tools.map(t=>t.id)){for(let a=12;a<=72&&!best;a+=1)for(let p=.2;p<=1&&!best;p+=.01){const f=e.trajectory(a,p,tool,{resolve:true,t0:e.clock+e.balance.physics.throwSeconds});if(f.kind==='catch')best=[a,p,tool];}if(best)break;}
 return best;})()`;
const launch=async stage=>{
  await page.evaluate(s=>window.__island.ui.activityInterface.launch('catchCriminal',undefined,s),stage);
  await page.waitForFunction(()=>window.__island.ui.activityInterface.current?.session?.snapshot.ready);
  await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting!=='true');
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
  await launch(1);
  await mkdir(out,{recursive:true});
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
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.deepEqual(csp,[]);
  await writeFile(join(out,'report.json'),JSON.stringify({checks:['library card','drag aim','pause','win pays and unlocks','loss pays nothing','exit clean','CSP clean','no external requests']},null,1));
  console.log('Catch the Criminal integration browser: all checks passed');
}finally{await browser.close();await server.close();}
