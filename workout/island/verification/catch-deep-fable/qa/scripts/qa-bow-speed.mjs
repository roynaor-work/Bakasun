// QA check 5, fine aiming: through CDP touch every move waits a software-GL frame (0.3-0.8 s), so a "fast" finger cannot be produced
// here. This dispatches real PointerEvents on the stage element from inside the page with controlled timing: 6 moves in one task
// (speed → thousands of px/s → coarse 0.11°/px) against 20 moves 100 ms apart (30 px/s → fine 0.045°/px). Same handler, same engine.
import {writeFile} from 'node:fs/promises';
import {launch, newPage, BASE} from './common.mjs';
const errors = [], out = {stages: []};
const browser = await launch();
const run = `(async (mode)=>{const s=session,e=s.engine;const el=document.getElementById('stage');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const ev=(type,x,y)=>el.dispatchEvent(new PointerEvent(type,{pointerId:7,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,bubbles:true}));
  for(let i=0;i<60*20&&e.state.phase!=='aim'&&e.state.phase!=='done';i++)s.debug.step(1/60);
  const before={...e.aim};ev('pointerdown',520,250);await sleep(400);const held={...e.aim,drawn:document.querySelector('.catch-bow-sight')?.dataset.drawn};
  const t0=performance.now();
  if(mode==='fast'){for(let i=1;i<=6;i++)ev('pointermove',520+10*i,250-7.5*i);}
  else{for(let i=1;i<=20;i++){ev('pointermove',520+3*i,250-2.25*i);await sleep(100);}}
  const ms=performance.now()-t0;const dragged={...e.aim};ev('pointerup',580,205);await sleep(50);
  return {mode,before,held,dragged,deltas:{yaw:+(dragged.yaw-held.yaw).toFixed(2),angle:+(dragged.angle-held.angle).toFixed(2)},ms:Math.round(ms),released:{phase:e.state.phase,thrown:e.state.thrown}}})`;
for (const stage of [1, 5, 10]) {
  const page = await newPage(browser, errors);
  await page.goto(`${BASE}tools/catch-harness6.html?stage=${stage}&seed=3&dev=1&quality=low`); await page.waitForFunction('window.done===true', null, {timeout: 180000});
  await page.waitForFunction(() => session.snapshot.mode === 'chase');
  await page.evaluate(() => session.debug.skipChase()); await page.waitForFunction(() => session.snapshot.mode === 'throw'); await page.waitForTimeout(3000);
  const row = {stage, expected: {coarseYaw: 6.6, coarseAngle: 4.95, fineYaw: 2.7, fineAngle: 2.03}};
  row.fast = await page.evaluate(`${run}('fast')`); await page.waitForTimeout(300);
  row.slow = await page.evaluate(`${run}('slow')`); await page.waitForTimeout(300);
  row.fast2 = await page.evaluate(`${run}('fast')`);
  out.stages.push(row); console.log(JSON.stringify(row)); await page.close();
}
out.errors = errors;
await writeFile(new URL('../measurements-bow-speed.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('errors', errors.length, errors.slice(0, 5));
await browser.close();
