import test from 'node:test';
import assert from 'node:assert/strict';
import {fireBrowser,startInterior,modelToSecondRoom} from './fire-browser-support.mjs';

test('V241-004: delayed second room is a loading barrier; no model time or stale picking',async t=>{
  const h=await fireBrowser(t),page=await h.page('?fireLoadRecovery=0');let release;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/fire-v24/rooms/living-room.glb*',async route=>{await gate;await route.continue();});
  t.after(()=>release());await page.clock.install();await startInterior(page,{level:9});await page.waitForFunction(()=>__probe.ready);await modelToSecondRoom(page);const before=await page.evaluate(()=>__probe.model.time);await page.clock.runFor(3000);
  const actual=await page.evaluate(()=>({ready:__probe.ready,phase:__probe.model.phase,time:__probe.model.time,pick:__probe.scene.pick(400,200),fade:document.querySelector('.fv24-fade').dataset.state}));
  assert.equal(actual.ready,false,'a required second room must reset readiness');assert.equal(actual.time,before,'the next room clock must wait for assets');assert.equal(actual.pick,null,'old geometry cannot receive picks');assert.equal(actual.fade,'in');
  release();await page.waitForFunction(()=>__probe.ready);assert.equal(await page.evaluate(()=>__probe.model.roomIndex),1);assert.equal(await page.evaluate(()=>__probe.scene.metrics().roomBuilt),false);assert.equal(await page.evaluate(()=>__probe.loadFailed),false);
});
test('V241-004: rejected prefetch is evicted and the real transition retries it',async t=>{
  const h=await fireBrowser(t),page=await h.page();let attempts=0;
  const isLiving=request=>request.url().includes('/fire-v24/rooms/living-room.glb');
  const failedPrefetch=page.waitForEvent('requestfailed',isLiving);
  await page.route('**/fire-v24/rooms/living-room.glb*',route=>++attempts===1?route.abort():route.continue());
  await page.clock.install();await startInterior(page,{level:9});await page.waitForFunction(()=>__probe.ready);await failedPrefetch;
  const retried=page.waitForRequest(isLiving,{timeout:5000}).then(()=>true,()=>false);await modelToSecondRoom(page);
  assert.equal(await retried,true,'a rejected prefetch must be requested again at the actual transition');await page.waitForFunction(()=>__probe.ready);assert.ok(attempts>=2,'a rejected prefetch must not poison the room cache');assert.equal(await page.evaluate(()=>__probe.model.roomIndex),1);assert.equal(await page.evaluate(()=>__probe.loadFailed),false);
});
test('V241-004: a pending friend is required too, and fireRoomBarrier=0 keeps the previous readiness',async t=>{
  const h=await fireBrowser(t);
  for(const rollback of [false,true]){
    const page=await h.page('?fireLoadRecovery=0'+(rollback?'&fireRoomBarrier=0':''));let release;const gate=new Promise(resolve=>release=resolve);
    await page.route('**/fire-v24/friends/girl.glb*',async route=>{await gate;await route.continue();});t.after(()=>release());
    await page.clock.install();await startInterior(page,{level:9});await page.waitForFunction(()=>__probe.ready);await modelToSecondRoom(page);const before=await page.evaluate(()=>__probe.model.time);await page.clock.runFor(1500);
    assert.equal(await page.evaluate(()=>__probe.ready),rollback,'readiness waits for the next friend only when the fix is enabled');
    const sampled=await page.evaluate(()=>({time:__probe.model.time,phase:__probe.model.phase,fade:document.querySelector('.fv24-fade')?.dataset.state,hidden:document.hidden,ready:__probe.ready,done:__done}));assert.equal(sampled.time>before,rollback,'the room timer follows the same barrier: '+JSON.stringify({before,...sampled}));
    release();await page.waitForFunction(()=>__probe.ready);await page.evaluate(()=>__probe.dispose());
  }
});
