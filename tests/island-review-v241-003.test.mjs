import nodeTest from 'node:test';
// Browser suite (Chromium + Playwright), like the other island browser tests: runs with
//   ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=<playwright index.mjs> CHROMIUM_PATH=<chrome>
const test=process.env.ISLAND_CSP_BROWSER==='1'?nodeTest:nodeTest.skip;
import assert from 'node:assert/strict';
import {fireBrowser,startInterior} from './review-v241/fire-browser-support.mjs';

test('V241-003: tutorial has a semantic continue button activated by Enter and Space',async t=>{
  const h=await fireBrowser(t);
  for(const key of ['Enter','Space']){
    const page=await h.page();await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));await startInterior(page,{mode:'ready',tutorial:true});await page.clock.runFor(64);
    const button=page.locator('.fv24-card button');assert.equal(await button.count(),1,'tutorial needs a native button');await button.focus();await page.keyboard.press(key);assert.equal(await page.evaluate(()=>__probe.snapshot.tutorialOpen),false);assert.equal(await page.evaluate(()=>document.activeElement.className),'fire-v24-canvas');
    await page.evaluate(()=>__probe.dispose());assert.equal(await page.evaluate(()=>document.activeElement.id),'prior','restore focus to the preceding view');
  }
});
test('V241-003: semantic click works once and fireKeyboard=0 retains old markup',async t=>{
  const h=await fireBrowser(t),page=await h.page();await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));await startInterior(page,{mode:'ready',tutorial:true});await page.clock.runFor(64);assert.equal(await page.locator('.fv24-card button').count(),1);await page.locator('.fv24-card button').evaluate(n=>n.click());assert.equal(await page.evaluate(()=>__probe.snapshot.tutorialOpen),false);
  const old=await h.page('?fireKeyboard=0');await old.clock.install();await old.clock.pauseAt(await old.evaluate(()=>Date.now()+1000));await startInterior(old,{mode:'ready',tutorial:true});await old.clock.runFor(64);assert.equal(await old.locator('.fv24-card button').count(),0);assert.equal(await old.evaluate(()=>__probe.snapshot.tutorialOpen),true);
});
