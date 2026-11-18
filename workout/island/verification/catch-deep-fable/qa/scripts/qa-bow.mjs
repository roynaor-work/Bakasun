// QA check 5: the archery stage with real touch (CDP touch events): hold → power 1, drag → yaw/angle deltas, release → throw;
// screenshots idle / drawn / flight / hit; the thief's height in pixels at stages 1, 7, 10.
import {writeFile} from 'node:fs/promises';
import {launch, newPage, BASE, SHOTS} from './common.mjs';
const errors = [], out = {stages: []};
const browser = await launch();
const S = 'window.session';
const thiefPx = `(()=>{const v=${S}.debug.view();const th=v.thieves[0].actor;const p=th.root.position;const foot=v.project(p.x,p.y,p.z);const head=v.project(p.x,p.y+1.82,p.z);
 const h=new v.camera.position.constructor();th.headWorld(h);const hb=v.project(h.x,h.y,h.z);const e=${S}.engine,c=e.criminalAt(e.clock);
 return {footY:Math.round(foot.y),headY:Math.round(head.y),headBoneY:Math.round(hb.y),x:Math.round(foot.x),heightPx:Math.round(foot.y-head.y),heightPxBone:Math.round(foot.y-hb.y),distM:+Math.hypot(c.x,c.z).toFixed(1),fov:+v.camera.fov.toFixed(1),visible:foot.visible}})()`;
for (const stage of [1, 7, 10]) {
  const page = await newPage(browser, errors);
  await page.goto(`${BASE}tools/catch-harness6.html?stage=${stage}&seed=3&dev=1`); await page.waitForFunction('window.done===true', null, {timeout: 180000});
  await page.waitForFunction(() => session.snapshot.mode === 'chase');
  await page.evaluate(() => session.debug.skipChase()); await page.waitForFunction(() => session.snapshot.mode === 'throw'); await page.waitForTimeout(1500);
  const row = {stage, thief: await page.evaluate(thiefPx), aimStart: await page.evaluate(() => ({...session.engine.aim})), throwsTotal: await page.evaluate(() => session.engine.throwsTotal), hitsNeeded: await page.evaluate(() => session.engine.hitsNeeded)};
  await page.screenshot({path: `${SHOTS}05-bow-idle-stage${stage}.png`});
  if (stage === 1) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{x, y, id: 1}]});
    const before = await page.evaluate(() => ({...session.engine.aim, phase: session.engine.state.phase}));
    await touch('touchStart', 520, 250); await page.waitForTimeout(400);
    const held = await page.evaluate(() => ({...session.engine.aim, drawn: document.querySelector('.catch-bow-sight')?.dataset.drawn, drawBar: document.querySelector('.catch-bow-draw i')?.style.width}));
    for (let i = 1; i <= 6; i++) await touch('touchMove', 520 + 10 * i, 250 - 7.5 * i);
    await page.waitForTimeout(150);
    const dragged = await page.evaluate(() => ({...session.engine.aim, drawn: document.querySelector('.catch-bow-sight')?.dataset.drawn, sightLeft: document.querySelector('.catch-bow-sight')?.style.left, sightTop: document.querySelector('.catch-bow-sight')?.style.top, hidden: document.querySelector('.catch-bow-sight')?.hidden}));
    await page.screenshot({path: `${SHOTS}05-bow-drawn-stage1.png`});
    await touch('touchEnd', 580, 205); await page.waitForTimeout(120);
    const released = await page.evaluate(() => ({phase: session.engine.state.phase, thrown: session.engine.state.thrown}));
    await page.waitForTimeout(700);
    await page.screenshot({path: `${SHOTS}05-bow-flight-stage1.png`});
    const flight = await page.evaluate(() => { const f = session.engine.flightNow(); return f ? {x: +f.x.toFixed(1), y: +f.y.toFixed(1), z: +f.z.toFixed(1), share: +f.share.toFixed(2)} : null; });
    row.touch = {before, held, dragged, deltas: {yaw: +(dragged.yaw - held.yaw).toFixed(2), angle: +(dragged.angle - held.angle).toFixed(2), expectedYaw: 60 * .11, expectedAngle: 45 * .11}, released, flight};
    // a hit: a solved shot (the browser test's solver) at full draw; step to the moment of contact
    await page.evaluate(() => { const s = session; for (let i = 0; i < 60 * 20 && s.engine.state.phase !== 'aim' && s.engine.state.phase !== 'done'; i++) s.debug.step(1 / 60); });
    const sol = await page.evaluate(`(()=>{const e=${S}.engine,P=e.balance.physics,t0=e.clock+P.throwSeconds;let best=null;
      for(const tool of e.tools.map(t=>t.id)){for(let a=0;a<=50&&!best;a+=.5){const f0=e.trajectory(a,1,tool,{yaw:0,withWind:false}),c=e.criminalAt(t0+f0.duration),yaw=Math.atan2(c.z,c.x-P.release.x)*180/Math.PI;
       const f=e.trajectory(a,1,tool,{resolve:true,t0,yaw});if(f.kind==='catch')best=[a,tool,yaw];}if(best)break;}return best;})()`);
    row.solution = sol;
    if (sol) {
      await page.evaluate(([a, tool, yaw]) => { const s = session; s.engine.setTool(tool); s.engine.setAim({angle: a, power: 1, yaw}); s.debug.release(); }, sol);
      await page.evaluate(() => { const s = session; for (let i = 0; i < 60 * 10 && !['impact', 'caught', 'aim', 'done'].includes(s.engine.state.phase); i++) s.debug.step(1 / 60); for (let i = 0; i < 12; i++) s.debug.step(1 / 60); s.debug.view().update(1 / 60, {}); });
      await page.waitForTimeout(300);
      row.afterHit = await page.evaluate(() => ({phase: session.engine.state.phase, catches: session.engine.state.catches, bossHp: session.engine.state.bossHp, thrown: session.engine.state.thrown}));
      await page.screenshot({path: `${SHOTS}05-bow-hit-stage1.png`});
    }
  }
  out.stages.push(row); console.log(JSON.stringify(row));
  await page.close();
}
out.errors = errors;
await writeFile(new URL('../measurements-bow.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('errors', errors.length, errors.slice(0, 5));
await browser.close();
