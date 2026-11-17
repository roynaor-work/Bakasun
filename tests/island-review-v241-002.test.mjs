import nodeTest from 'node:test';
// Browser suite (Chromium + Playwright), like the other island browser tests: runs with
//   ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=<playwright index.mjs> CHROMIUM_PATH=<chrome>
const test=process.env.ISLAND_CSP_BROWSER==='1'?nodeTest:nodeTest.skip;
import assert from 'node:assert/strict';
import {fireBrowser,startInterior} from './review-v241/fire-browser-support.mjs';

test('V241-002: actual WebGL loss freezes room time and restore resumes from the same time',async t=>{
  const h=await fireBrowser(t),page=await h.page();await page.clock.install();await startInterior(page);await page.waitForFunction(()=>__probe.ready);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));await page.clock.runFor(4500);
  const before=await page.evaluate(()=>new Promise(resolve=>{const canvas=document.querySelector('.fire-v24-canvas');canvas.addEventListener('webglcontextlost',()=>resolve(__probe.model.time),{once:true});window.__ext=canvas.getContext('webgl2').getExtension('WEBGL_lose_context');__ext.loseContext();}));await page.clock.runFor(5000);
  assert.equal(await page.evaluate(()=>__probe.model.time),before,'model time must stop while the renderer is lost');assert.equal(await page.evaluate(()=>__probe.ready),false);assert.equal(await page.evaluate(()=>__done.length),0);
  await page.evaluate(()=>{__probe.setPaused(true);__probe.setPaused(false);});assert.equal(await page.evaluate(()=>__probe.snapshot.audio.paused),true,'shell resume must keep audio paused during context loss');
  await page.evaluate(()=>new Promise(resolve=>{document.querySelector('.fire-v24-canvas').addEventListener('webglcontextrestored',()=>resolve(),{once:true});__ext.restoreContext();}));await page.clock.runFor(1500);assert.ok(await page.evaluate(()=>__probe.model.time)>before,'restored renderer resumes time');assert.equal(await page.evaluate(()=>__probe.ready),true);
});
test('V241-002: permanent context loss exits once; disposed listeners cannot fire',async t=>{
  const h=await fireBrowser(t),page=await h.page();await page.clock.install();await startInterior(page,{mode:'ready'});await page.evaluate(()=>document.querySelector('.fire-v24-canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true})));await page.clock.runFor(16000);
  assert.equal(await page.evaluate(()=>__done.length),1,'permanent context loss must recover to the street');assert.match(await page.evaluate(()=>__done[0].error),/context/i);
  await page.evaluate(()=>__probe.dispose());await page.clock.runFor(16000);assert.equal(await page.evaluate(()=>__done.length),1);
});
test('V241-002: fireContextRecovery=0 retains the previous clock behavior',async t=>{
  const h=await fireBrowser(t),page=await h.page('?fireContextRecovery=0');await page.clock.install();await startInterior(page,{mode:'ready'});await page.clock.runFor(1000);const before=await page.evaluate(()=>__probe.model.time);await page.evaluate(()=>document.querySelector('.fire-v24-canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true})));await page.clock.runFor(1000);assert.ok(await page.evaluate(()=>__probe.model.time)>before);
});
