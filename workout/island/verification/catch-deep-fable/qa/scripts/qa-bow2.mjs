// QA check 5 (second pass, after the v21 fixes): the archery stage with real touch at stages 1, 5, 10: hold → power, a fast drag
// (+60 px right, -45 px up in one burst) and a slow drag (60 px over ~2 s) → yaw/angle deltas (fine aiming), release → throw,
// a solved hit; screenshots idle / drawn / flight / hit. Thief height in pixels at stages 1, 5, 7, 8, 10; the throw at day/dusk/night (check 8).
import {writeFile, copyFile} from 'node:fs/promises';
import {launch, newPage, BASE, SHOTS} from './common.mjs';
const errors = [], out = {stages: []};
const browser = await launch();
const S = 'window.session';
const thiefPx = `(()=>{const v=${S}.debug.view();const th=v.thieves[0].actor;const p=th.root.position;const foot=v.project(p.x,0,p.z);const head=v.project(p.x,1.75,p.z);
 const h=new v.camera.position.constructor();th.headWorld(h);const hb=v.project(h.x,h.y,h.z);const e=${S}.engine,c=e.criminalAt(e.clock);
 return {footY:Math.round(foot.y),headY:Math.round(head.y),headBoneY:Math.round(hb.y),x:Math.round(foot.x),heightPx:Math.round(foot.y-head.y),heightPxBone:Math.round(foot.y-hb.y),distM:+Math.hypot(c.x,c.z).toFixed(1),fov:+v.camera.fov.toFixed(1),visible:foot.visible,rootY:+p.y.toFixed(2)}})()`;
const aimNow = () => ({...session.engine.aim, phase: session.engine.state.phase, drawn: document.querySelector('.catch-bow-sight')?.dataset.drawn, drawBar: document.querySelector('.catch-bow-draw i')?.style.width});
const toAim = async page => { await page.evaluate(() => { const s = session; for (let i = 0; i < 60 * 20 && s.engine.state.phase !== 'aim' && s.engine.state.phase !== 'done'; i++) s.debug.step(1 / 60); }); await page.waitForTimeout(400); };
const THEME = {1: 'day', 5: 'dusk', 8: 'night'};
for (const stage of [1, 5, 7, 8, 10]) {
  const page = await newPage(browser, errors);
  await page.goto(`${BASE}tools/catch-harness6.html?stage=${stage}&seed=3&dev=1`); await page.waitForFunction('window.done===true', null, {timeout: 180000});
  await page.waitForFunction(() => session.snapshot.mode === 'chase');
  await page.evaluate(() => session.debug.skipChase()); await page.waitForFunction(() => session.snapshot.mode === 'throw'); await page.waitForTimeout(3500);
  const row = {stage, thief: await page.evaluate(thiefPx), aimStart: await page.evaluate(() => ({...session.engine.aim})), throwsTotal: await page.evaluate(() => session.engine.throwsTotal), hitsNeeded: await page.evaluate(() => session.engine.hitsNeeded), wind: await page.evaluate(() => +session.engine.wind.toFixed(2))};
  await page.screenshot({path: `${SHOTS}05-bow-idle-stage${stage}.png`});
  if (THEME[stage]) await copyFile(`${SHOTS}05-bow-idle-stage${stage}.png`, `${SHOTS}08-throw-${THEME[stage]}-stage${stage}.png`);
  if ([1, 5, 10].includes(stage)) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{x, y, id: 1}]});
    // --- fast drag ---
    const before = await page.evaluate(aimNow);
    await touch('touchStart', 520, 250); await page.waitForTimeout(400);
    const held = await page.evaluate(aimNow);
    const tf0 = Date.now();
    for (let i = 1; i <= 6; i++) await touch('touchMove', 520 + 10 * i, 250 - 7.5 * i);
    const fastMs = Date.now() - tf0;
    await page.waitForTimeout(200);
    const dragged = await page.evaluate(aimNow);
    await page.screenshot({path: `${SHOTS}05-bow-drawn-stage${stage}.png`});
    await touch('touchEnd', 580, 205); await page.waitForTimeout(120);
    const released = await page.evaluate(() => ({phase: session.engine.state.phase, thrown: session.engine.state.thrown}));
    await page.waitForTimeout(700);
    await page.screenshot({path: `${SHOTS}05-bow-flight-stage${stage}.png`});
    const flight = await page.evaluate(() => { const f = session.engine.flightNow(); return f ? {x: +f.x.toFixed(1), y: +f.y.toFixed(1), z: +f.z.toFixed(1), share: +f.share.toFixed(2)} : null; });
    row.fast = {before, held, dragged, deltas: {yaw: +(dragged.yaw - held.yaw).toFixed(2), angle: +(dragged.angle - held.angle).toFixed(2), expectedYaw: 60 * .11, expectedAngle: 45 * .11}, burstMs: fastMs, released, flight};
    await toAim(page);
    // --- slow drag: 60 px right over ~2 s (30 px/s, under the 60 px/s fine-aiming threshold) ---
    const before2 = await page.evaluate(aimNow);
    await touch('touchStart', 520, 250); await page.waitForTimeout(400);
    const held2 = await page.evaluate(aimNow);
    const ts0 = Date.now();
    for (let i = 1; i <= 20; i++) { await touch('touchMove', 520 + 3 * i, 250); await page.waitForTimeout(100); }
    const slowMs = Date.now() - ts0;
    const dragged2 = await page.evaluate(aimNow);
    await touch('touchEnd', 580, 250); await page.waitForTimeout(120);
    const released2 = await page.evaluate(() => ({phase: session.engine.state.phase, thrown: session.engine.state.thrown}));
    row.slow = {before: before2, held: held2, dragged: dragged2, deltas: {yaw: +(dragged2.yaw - held2.yaw).toFixed(2), angle: +(dragged2.angle - held2.angle).toFixed(2), expectedFineYaw: 60 * .045, expectedCoarseYaw: 60 * .11}, dragMs: slowMs, released: released2};
    await toAim(page);
    // --- a solved hit at full draw, stepped to the contact ---
    const sol = await page.evaluate(`(()=>{const e=${S}.engine,P=e.balance.physics,t0=e.clock+P.throwSeconds;let best=null;
      for(const tool of e.tools.map(t=>t.id)){for(let a=0;a<=50&&!best;a+=.5){const f0=e.trajectory(a,1,tool,{yaw:0,withWind:false}),c=e.criminalAt(t0+f0.duration),yaw=Math.atan2(c.z,c.x-P.release.x)*180/Math.PI;
       const f=e.trajectory(a,1,tool,{resolve:true,t0,yaw});if(f.kind==='catch')best=[a,tool,yaw];}if(best)break;}return best;})()`);
    row.solution = sol;
    if (sol) {
      const pre = await page.evaluate(() => ({catches: session.engine.state.catches, bossHp: session.engine.state.bossHp, thrown: session.engine.state.thrown}));
      await page.evaluate(([a, tool, yaw]) => { const s = session; s.engine.setTool(tool); s.engine.setAim({angle: a, power: 1, yaw}); s.debug.release(); }, sol);
      await page.evaluate(() => { const s = session; for (let i = 0; i < 60 * 10 && !['impact', 'caught', 'aim', 'done'].includes(s.engine.state.phase); i++) s.debug.step(1 / 60); for (let i = 0; i < 12; i++) s.debug.step(1 / 60); s.debug.view().update(1 / 60, {}); });
      await page.waitForTimeout(400);
      row.hit = {pre, after: await page.evaluate(() => ({phase: session.engine.state.phase, catches: session.engine.state.catches, bossHp: session.engine.state.bossHp, thrown: session.engine.state.thrown}))};
      await page.screenshot({path: `${SHOTS}05-bow-hit-stage${stage}.png`});
    }
  }
  out.stages.push(row); console.log(JSON.stringify(row));
  await page.close();
}
out.errors = errors;
await writeFile(new URL('../measurements-bow2.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('errors', errors.length, errors.slice(0, 5));
await browser.close();
