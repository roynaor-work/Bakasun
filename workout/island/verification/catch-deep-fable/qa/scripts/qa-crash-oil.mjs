// QA check 3: a crash into a solid obstacle and an oil slick, stage 7 (seed 3 has one oil slick), stepping without rendering
// and drawing only the frame that is photographed (software GL cannot render hundreds of frames in time).
import {writeFile} from 'node:fs/promises';
import {launch, newPage, BASE, SHOTS} from './common.mjs';
const errors = [], browser = await launch(), page = await newPage(browser, errors);
await page.goto(`${BASE}tools/catch-view6-harness.html?stage=7&seed=3&auto=0&manual=1`); await page.waitForFunction('window.done===true', null, {timeout: 180000});
await page.evaluate(() => { window.quiet = (n, steer = 0, boost = false) => { for (let i = 0; i < n; i++) { chase.setSteer(steer); chase.setBoost(boost); chase.setBrake(false); chase.step(1 / 60); view.handleChase(chase.drainEvents()); view.update(1 / 60, {noRender: true}); } }; window.draw = () => view.update(1 / 60, {}); });
const crash = await page.evaluate(() => {
  const st = chase.state; while (st.phase !== 'run') quiet(1);
  const solid = chase.obstacles.filter(o => ['traffic', 'parked', 'barrier', 'cone'].includes(o.kind) && o.s > st.s + 20).sort((a, b) => a.s - b.s)[0];
  let guard = 0, hits0 = st.hits, vBefore = 0, dist = 99;
  while (st.hits === hits0 && guard++ < 60 * 30 && st.phase === 'run') { const os = chase.obstacleS(solid, st.t); vBefore = st.v; dist = os - st.s; quiet(1, Math.max(-1, Math.min(1, (solid.d - st.d) * 1.5 - st.slide * .9 / chase.C.steerSpeed)), os - st.s > 30); }
  quiet(3); draw();
  return {kind: solid.kind, model: solid.model, obstacleS: Math.round(solid.s), obstacleD: solid.d, hits: st.hits, vBefore: +vBefore.toFixed(1), vAfter: +st.v.toFixed(1), stun: +st.stun.toFixed(2), t: +st.t.toFixed(2), tank: +st.tank.toFixed(2)};
});
await page.screenshot({path: `${SHOTS}03-crash-stage7.png`});
const oil = await page.evaluate(() => {
  const st = chase.state, o = chase.obstacles.find(o => o.kind === 'oil'); st.s = o.s - 24; st.d = o.d; st.crim.s = st.s + 40; st.crim.d = o.d > 0 ? -3.3 : 3.3; st.v = 22; st.stun = 0; st.oil = 0;
  quiet(14); draw(); return {s: Math.round(o.s), d: o.d, carS: Math.round(st.s), k: +chase.track.curvatureAt(o.s).toFixed(4)};
});
await page.screenshot({path: `${SHOTS}03-oil-ahead-stage7.png`});
const oilHit = await page.evaluate(() => { const st = chase.state; let g = 0; const d0 = st.d; while (st.oil <= 0 && g++ < 400) quiet(1); const oilT = st.oil; let maxDrift = 0; for (let i = 0; i < 40; i++) { quiet(1); maxDrift = Math.max(maxDrift, Math.abs(st.d - d0)); } draw(); return {oilSeconds: +oilT.toFixed(2), slideNow: +st.slide.toFixed(2), dBefore: +d0.toFixed(2), dAfter: +st.d.toFixed(2), driftIn40Frames: +maxDrift.toFixed(2), scraping: st.scraping, v: +st.v.toFixed(1)}; });
await page.screenshot({path: `${SHOTS}03-oil-slide-stage7.png`});
const out = {crash, oil: {...oil, ...oilHit}, errors}; console.log(JSON.stringify(out));
await writeFile(new URL('../measurements-crash-oil.json', import.meta.url), JSON.stringify(out, null, 1));
await browser.close();
