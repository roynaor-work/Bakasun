import nodeTest from 'node:test';
// Browser suite (Chromium + Playwright), like the other island browser tests: runs with
//   ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=<playwright index.mjs> CHROMIUM_PATH=<chrome>
const test=process.env.ISLAND_CSP_BROWSER==='1'?nodeTest:nodeTest.skip;
import assert from 'node:assert/strict';
import {fireBrowser,startInterior} from './review-v241/fire-browser-support.mjs';

test('V241-001: failed required room calls completion once and restores the street DOM',async t=>{
  const h=await fireBrowser(t),page=await h.page();await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));await startInterior(page,{mode:'failed'});await page.clock.runFor(64);
  const actual=await page.evaluate(()=>({done:__done,inside:document.querySelectorAll('.fire-v24-canvas,.fv24').length,hidden:document.querySelector('.game-controls').style.visibility}));
  assert.equal(actual.done.length,1,'a failed scene must leave the interior instead of waiting forever');assert.match(actual.done[0].error,/load/i);assert.equal(actual.inside,0);assert.equal(actual.hidden,'');
  await page.evaluate(()=>__probe.dispose());assert.equal(await page.evaluate(()=>__done.length),1);
});
test('V241-001: stalled request has bounded wait and disposal cancels the watchdog',async t=>{
  const h=await fireBrowser(t),page=await h.page();await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));await startInterior(page,{mode:'pending'});await page.clock.runFor(16000);
  assert.equal(await page.evaluate(()=>__done.length),1,'pending first room must time out');assert.match(await page.evaluate(()=>__done[0].error),/timed out/i);
  const clean=await h.page();await clean.clock.install();await clean.clock.pauseAt(await clean.evaluate(()=>Date.now()+1000));await startInterior(clean,{mode:'pending'});await clean.evaluate(()=>__probe.dispose());await clean.clock.runFor(16000);assert.equal(await clean.evaluate(()=>__done.length),0,'disposed session must not notify its old parent');
});
test('V241-001: fireLoadRecovery=0 preserves the old waiting path',async t=>{
  const h=await fireBrowser(t),page=await h.page('?fireLoadRecovery=0');await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));await startInterior(page,{mode:'failed'});await page.clock.runFor(16000);assert.equal(await page.evaluate(()=>__done.length),0);assert.equal(await page.locator('.fire-v24-canvas').count(),1);
});
test('V241-001: parent entry flow resumes the paused street after a required scene failure',async t=>{
  const h=await fireBrowser(t),page=await h.page();await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
  await page.evaluate(async()=>{
    const strings=await fetch('/workout/island/data/strings.he.json').then(r=>r.json());window.__ctx={dialog:document.querySelector('#dialog'),canvas:document.querySelector('#street'),t:(key,vars={})=>Object.entries(vars).reduce((str,[k,v])=>str.replaceAll('{'+k+'}',v),strings[key]||key),lite:true};
    const {startFireEntry}=await import('/workout/island/minigames/fire-v24-flow.mjs');
    const {entryBuilding}=await import('/workout/island/minigames/fire-v24.mjs');const {fireScenario}=await import('/workout/island/minigames/fire-campaign.mjs');const {runFireV24Interior}=await import('/workout/island/minigames/fire-v24-session.mjs');const config=await fetch('/workout/island/data/config.json').then(r=>r.json());
    const balance=fireScenario(config.minigames.fireRescue,3),building=entryBuilding(balance,3);window.__streetPaused=false;
    const ctx={...__ctx,balance,level:3,config:{width:844,height:390},finish(){}};
    const createModel=()=>({truck:{x:building.door[0],z:building.door[2]+3,driving:false,velocityX:0,velocityZ:0},time:0,update(){}});
    const runSession=(ctx,create)=>{const model=create(ctx);return{setPaused(value){__streetPaused=value},get snapshot(){return{paused:__streetPaused}},get debug(){return{model}},dispose(){}}};
    const loadInterior=async()=>({runFireV24Interior:(ctx,options)=>runFireV24Interior(ctx,{...options,createScene:()=>({ready:false,loadFailed:true,update(){},render(){},pick(){return null},resize(){},dispose(){},project(){return{x:0,y:0}},metrics(){return{}}})})});
    window.__entry=startFireEntry(ctx,createModel,()=>{},()=>null,{runSession,loadInterior});__entry.v24.enterRequested=true;__entry.debug.model.update(.016,{});
  });
  await page.clock.runFor(64);
  const result=await page.evaluate(()=>({paused:__streetPaused,inside:__entry.v24.inside,done:__entry.v24.done,failed:__entry.v24.result?.failed,interior:__entry.debug.interior===null}));
  assert.deepEqual(result,{paused:false,inside:false,done:true,failed:true,interior:true},'the actual entry wrapper must release the street and discard the failed interior');
  await page.evaluate(()=>__entry.dispose());
});
