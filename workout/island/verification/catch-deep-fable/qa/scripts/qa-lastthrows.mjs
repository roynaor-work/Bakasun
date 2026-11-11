// QA check 5b (Roy: "cannot aim the last throws"): at stages 1 and 3 miss three times on purpose (yaw +20) and record the thief's
// distance and the wind before throws 1..4; then solve throw 4 and confirm it catches. Verdict: the distance stays within fleeMax (4 m) of the start.
import {writeFile} from 'node:fs/promises';
import {launch, newPage, BASE, SHOTS} from './common.mjs';
const errors = [], out = {stages: []};
const browser = await launch();
const S = 'window.session';
const probe = `(()=>{const e=${S}.engine,c=e.criminalAt(e.clock);return {thrown:e.state.thrown,throwsLeft:e.state.throwsLeft,phase:e.state.phase,dist:+Math.hypot(c.x,c.z).toFixed(2),x:+c.x.toFixed(2),z:+c.z.toFixed(2),wind:+e.wind.toFixed(2),baseX:+e.state.baseX.toFixed(2),toX:+e.state.toX.toFixed(2),angle:+e.aim.angle.toFixed(2)}})()`;
const settle = `(()=>{const s=${S};const ev=[];for(let i=0;i<60*20&&s.engine.state.phase!=='aim'&&s.engine.state.phase!=='done';i++){s.debug.step(1/60);}return s.engine.state.phase})()`;
for (const stage of [1, 3]) {
  const page = await newPage(browser, errors);
  await page.goto(`${BASE}tools/catch-harness6.html?stage=${stage}&seed=3&dev=1`); await page.waitForFunction('window.done===true', null, {timeout: 180000});
  await page.waitForFunction(() => session.snapshot.mode === 'chase');
  await page.evaluate(() => session.debug.skipChase()); await page.waitForFunction(() => session.snapshot.mode === 'throw'); await page.waitForTimeout(3000);
  const row = {stage, throwsTotal: await page.evaluate(() => session.engine.throwsTotal), hitsNeeded: await page.evaluate(() => session.engine.hitsNeeded), fleeMax: await page.evaluate(() => session.engine.level.fleeMax), flee: await page.evaluate(() => session.engine.level.flee), before: [], misses: []};
  for (let n = 1; n <= 3; n++) {
    row.before.push(await page.evaluate(probe));
    const res = await page.evaluate(`(()=>{const s=${S},e=s.engine;e.setAim({angle:e.aim.angle,power:1,yaw:20});s.debug.release();const ev=[];let kind=null;
      for(let i=0;i<60*20&&e.state.phase!=='aim'&&e.state.phase!=='done';i++){s.debug.step(1/60);}
      return {phase:e.state.phase,catches:e.state.catches,thrown:e.state.thrown,throwsLeft:e.state.throwsLeft}})()`);
    row.misses.push(res);
    await page.waitForTimeout(300);
  }
  row.before.push(await page.evaluate(probe)); // before throw 4
  await page.screenshot({path: `${SHOTS}05b-before-throw4-stage${stage}.png`});
  const sol = await page.evaluate(`(()=>{const e=${S}.engine,P=e.balance.physics,t0=e.clock+P.throwSeconds;let best=null;const tool=e.aim.tool;
    for(let a=0;a<=50&&!best;a+=.25){const f0=e.trajectory(a,1,tool,{yaw:0,withWind:false}),c=e.criminalAt(t0+f0.duration),yaw=Math.atan2(c.z,c.x-P.release.x)*180/Math.PI;
      const f=e.trajectory(a,1,tool,{resolve:true,t0,yaw});if(f.kind==='catch')best={angle:a,tool,yaw:+yaw.toFixed(2),perfect:Boolean(f.perfect)};}return best;})()`);
  row.solution = sol;
  if (sol) {
    row.throw4 = await page.evaluate(`(()=>{const s=${S},e=s.engine;e.setAim({angle:${sol.angle},power:1,yaw:${sol.yaw}});s.debug.release();
      for(let i=0;i<60*20&&!['impact','caught','aim','done'].includes(e.state.phase);i++){s.debug.step(1/60);}for(let i=0;i<12;i++)s.debug.step(1/60);s.debug.view().update(1/60,{});
      const atImpact={phase:e.state.phase,catches:e.state.catches};window.__after=()=>{for(let i=0;i<60*20&&['throw','flight','impact'].includes(e.state.phase);i++)s.debug.step(1/60);return {phase:e.state.phase,catches:e.state.catches,bossHp:e.state.bossHp,thrown:e.state.thrown,throwsLeft:e.state.throwsLeft}};
      return atImpact})()`);
    await page.waitForTimeout(400);
    await page.screenshot({path: `${SHOTS}05b-throw4-impact-stage${stage}.png`});
    row.throw4 = {...row.throw4, ...(await page.evaluate('window.__after()'))};
    await page.waitForTimeout(400);
    await page.screenshot({path: `${SHOTS}05b-throw4-hit-stage${stage}.png`});
  }
  const d0 = row.before[0].dist, d3 = row.before[3].dist;
  row.verdict = {startDist: d0, beforeThrow4: d3, grew: +(d3 - d0).toFixed(2), within4m: d3 - d0 <= 4.001};
  out.stages.push(row); console.log(JSON.stringify(row));
  await page.close();
}
out.errors = errors;
await writeFile(new URL('../measurements-lastthrows.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('errors', errors.length, errors.slice(0, 5));
await browser.close();
