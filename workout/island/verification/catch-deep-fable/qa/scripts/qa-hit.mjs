// QA check 5: a net that hits the thief (a solved full-draw shot), photographed at the catch; the engine's phases on the way.
import {writeFile} from 'node:fs/promises';
import {launch, newPage, BASE, SHOTS} from './common.mjs';
const errors = [], browser = await launch(), page = await newPage(browser, errors);
await page.goto(`${BASE}tools/catch-harness6.html?stage=1&seed=3&dev=1`); await page.waitForFunction('window.done===true', null, {timeout: 180000});
await page.waitForFunction(() => session.snapshot.mode === 'chase');
await page.evaluate(() => session.debug.skipChase()); await page.waitForFunction(() => session.snapshot.mode === 'throw'); await page.waitForTimeout(1500);
const res = await page.evaluate(() => new Promise(resolve => {
  const e = session.engine, P = e.balance.physics, t0 = e.clock + P.throwSeconds; let best = null;
  for (const tool of e.tools.map(t => t.id)) { for (let a = 0; a <= 50 && !best; a += .5) { const f0 = e.trajectory(a, 1, tool, {yaw: 0, withWind: false}), c = e.criminalAt(t0 + f0.duration), yaw = Math.atan2(c.z, c.x - P.release.x) * 180 / Math.PI; const f = e.trajectory(a, 1, tool, {resolve: true, t0, yaw}); if (f.kind === 'catch') best = [a, tool, yaw]; } if (best) break; }
  const phases = []; let last = null;
  e.setTool(best[1]); e.setAim({angle: best[0], power: 1, yaw: best[2]}); e.release();
  // let the session's own loop run (real time): poll the phase until the catch or the next aim
  const iv = setInterval(() => { const ph = e.state.phase; if (ph !== last) { phases.push({ph, clock: +e.clock.toFixed(2), catches: e.state.catches, bossHp: e.state.bossHp}); last = ph; } if (ph === 'caught' || (ph === 'impact') || ph === 'aim' && phases.length > 1 || phases.length > 8) { clearInterval(iv); resolve({best, phases, catches: e.state.catches, bossHp: e.state.bossHp}); } }, 40);
}));
await page.screenshot({path: `${SHOTS}05-bow-hit-stage1.png`});
await page.waitForTimeout(600); await page.screenshot({path: `${SHOTS}05-bow-hit-stage1-b.png`});
const after = await page.evaluate(() => ({phase: session.engine.state.phase, catches: session.engine.state.catches, bossHp: session.engine.state.bossHp, thrown: session.engine.state.thrown, hitsNeeded: session.engine.hitsNeeded}));
console.log(JSON.stringify({...res, after, errors}));
await writeFile(new URL('../measurements-hit.json', import.meta.url), JSON.stringify({...res, after, errors}, null, 1));
await browser.close();
