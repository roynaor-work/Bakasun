// QA check 3: an oil slick that is actually hit (stage 3, seed 3: the slick lies on a straight at s≈1503), photographed before and during the slide.
import {writeFile} from 'node:fs/promises';
import {launch, newPage, BASE, SHOTS} from './common.mjs';
const errors = [], browser = await launch(), page = await newPage(browser, errors);
await page.goto(`${BASE}tools/catch-view6-harness.html?stage=3&seed=3&auto=0&manual=1`); await page.waitForFunction('window.done===true', null, {timeout: 180000});
await page.evaluate(() => { window.evs = []; window.quiet = (n, steer = 0) => { for (let i = 0; i < n; i++) { chase.setSteer(steer); chase.setBoost(false); chase.setBrake(false); chase.step(1 / 60); const ev = chase.drainEvents(); for (const e of ev) if (['oil', 'scrape', 'crash'].includes(e.type)) evs.push({...e, t: +chase.state.t.toFixed(2)}); view.handleChase(ev); view.update(1 / 60, {noRender: true}); } }; window.draw = () => view.update(1 / 60, {}); });
const res = await page.evaluate(() => {
  const st = chase.state; while (st.phase !== 'run') quiet(1);
  const o = chase.obstacles.find(o => o.kind === 'oil'); st.s = o.s - 24; st.d = o.d; st.steer = 0; st.v = 22; st.stun = 0; st.oil = 0; st.crim.s = st.s + 30; st.crim.d = 0; st.crim.v = 22;
  quiet(20); draw(); return {oilS: Math.round(o.s), lane: o.d, carS: Math.round(st.s), d: +st.d.toFixed(2)};
});
await page.screenshot({path: `${SHOTS}03-oil-ahead-stage3.png`});
const hit = await page.evaluate(() => { const st = chase.state; let g = 0; while (st.oil <= 0 && g++ < 200) quiet(1); const at = {s: Math.round(st.s), oil: +st.oil.toFixed(2), d: +st.d.toFixed(2)}; const d0 = st.d; const trace = []; for (let i = 0; i < 66; i++) { quiet(1, -1); if (i % 11 === 10) trace.push({f: i + 1, oil: +st.oil.toFixed(2), dd: +(st.d - d0).toFixed(2), v: +st.v.toFixed(1)}); } draw(); return {at, trace, events: evs}; });
await page.screenshot({path: `${SHOTS}03-oil-slide-stage3.png`});
const out = {...res, ...hit, errors}; console.log(JSON.stringify(out));
await writeFile(new URL('../measurements-oil-stage3.json', import.meta.url), JSON.stringify(out, null, 1));
await browser.close();
