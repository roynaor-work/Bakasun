// QA check 3, second pass: a crash into a solid obstacle (speed before/after, stun) and an oil slick (st.oil set, grip, drift), stage 7, seed 3.
// Steps without rendering and draws only the photographed frames. Records the chase events so the oil hit is proven, not inferred.
import {writeFile} from 'node:fs/promises';
import {launch, newPage, BASE, SHOTS} from './common.mjs';
const errors = [], browser = await launch(), page = await newPage(browser, errors);
await page.goto(`${BASE}tools/catch-view6-harness.html?stage=7&seed=3&auto=0&manual=1`); await page.waitForFunction('window.done===true', null, {timeout: 180000});
await page.evaluate(() => { window.evs = []; window.quiet = (n, steer = 0, boost = false) => { for (let i = 0; i < n; i++) { chase.setSteer(steer); chase.setBoost(boost); chase.setBrake(false); chase.step(1 / 60); const ev = chase.drainEvents(); for (const e of ev) if (['crash', 'oil', 'scrape', 'nearMiss', 'pad'].includes(e.type)) evs.push({...e, t: +chase.state.t.toFixed(2)}); view.handleChase(ev); view.update(1 / 60, {noRender: true}); } }; window.draw = () => view.update(1 / 60, {}); });
const counts = await page.evaluate(() => { const c = {}; for (const o of chase.obstacles) c[o.kind] = (c[o.kind] || 0) + 1; return {total: chase.obstacles.length, ...c, oil: chase.obstacles.filter(o => o.kind === 'oil').map(o => ({s: Math.round(o.s), d: o.d}))}; });
const crash = await page.evaluate(() => {
  const st = chase.state; while (st.phase !== 'run') quiet(1);
  const solid = chase.obstacles.filter(o => ['traffic', 'parked', 'barrier', 'cone'].includes(o.kind) && o.s > st.s + 20).sort((a, b) => a.s - b.s)[0];
  let guard = 0, hits0 = st.hits, vBefore = 0;
  while (st.hits === hits0 && guard++ < 60 * 30 && st.phase === 'run') { const os = chase.obstacleS(solid, st.t); vBefore = st.v; quiet(1, Math.max(-1, Math.min(1, (solid.d - st.d) * 1.5 - st.slide * .9 / chase.C.steerSpeed)), os - st.s > 30); }
  const vHit = st.v, stun = st.stun; quiet(3); draw();
  const recover = []; for (let i = 0; i < 6; i++) { quiet(30); recover.push(+st.v.toFixed(1)); }
  return {kind: solid.kind, model: solid.model, obstacleS: Math.round(solid.s), lane: solid.d, hits: st.hits, vBefore: +vBefore.toFixed(1), vAfterHit: +vHit.toFixed(1), stun: +stun.toFixed(2), t: +st.t.toFixed(2), speedEveryHalfSecond: recover, events: evs.splice(0)};
});
await page.screenshot({path: `${SHOTS}03-crash-stage7.png`});
const oil = await page.evaluate(() => {
  const st = chase.state, o = chase.obstacles.find(o => o.kind === 'oil'); o.hitP = false;
  st.s = o.s - 24; st.d = o.d; st.crim.s = st.s + 45; st.crim.d = o.d > 0 ? -3.6 : 3.6; st.v = 22; st.stun = 0; st.oil = 0; st.slide = 0;
  quiet(14); draw(); return {oilS: Math.round(o.s), oilLane: o.d, carS: Math.round(st.s), carD: +st.d.toFixed(2), curvatureAtOil: +chase.track.curvatureAt(o.s).toFixed(4)};
});
await page.screenshot({path: `${SHOTS}03-oil-ahead-stage7.png`});
const oilHit = await page.evaluate(() => {
  const st = chase.state; let g = 0; const d0 = st.d; let maxOil = 0;
  while (st.oil <= 0 && g++ < 240) quiet(1);
  const hitAt = {s: Math.round(st.s), oil: +st.oil.toFixed(2), d: +st.d.toFixed(2), v: +st.v.toFixed(1)};
  const trace = []; for (let i = 0; i < 90; i++) { quiet(1); maxOil = Math.max(maxOil, st.oil); if (i % 15 === 14) trace.push({f: i + 1, oil: +st.oil.toFixed(2), slide: +st.slide.toFixed(2), d: +st.d.toFixed(2), v: +st.v.toFixed(1), scraping: st.scraping}); }
  draw();
  return {hitAt, dBefore: +d0.toFixed(2), trace, events: evs.splice(0), grip: 'oil>0 → .15 (C.oilSeconds ' + chase.C.oilSeconds + ', oilDrift ' + chase.C.oilDrift + ')'};
});
await page.screenshot({path: `${SHOTS}03-oil-slide-stage7.png`});
// steering while on oil: can the player counter it? same slick, full counter-steer
const oilSteer = await page.evaluate(() => {
  const st = chase.state, o = chase.obstacles.find(o => o.kind === 'oil'); o.hitP = false;
  st.s = o.s - 24; st.d = o.d; st.crim.s = st.s + 45; st.v = 22; st.stun = 0; st.oil = 0; st.slide = 0; quiet(14);
  let g = 0; while (st.oil <= 0 && g++ < 240) quiet(1); const d0 = st.d; let maxDev = 0;
  for (let i = 0; i < 90; i++) { quiet(1, Math.max(-1, Math.min(1, -(st.d - d0) * 1.2 - st.slide * .9))); maxDev = Math.max(maxDev, Math.abs(st.d - d0)); }
  return {maxDeviationWithCounterSteer: +maxDev.toFixed(2), scraping: st.scraping, v: +st.v.toFixed(1)};
});
const out = {counts, crash, oil: {...oil, ...oilHit}, oilSteer, errors}; console.log(JSON.stringify(out, null, 1));
await writeFile(new URL('../measurements-crash-oil2.json', import.meta.url), JSON.stringify(out, null, 1));
await browser.close();
