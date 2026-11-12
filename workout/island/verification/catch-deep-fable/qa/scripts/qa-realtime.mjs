// QA check 4: a real-time run of stage 2 in tools/catch-harness6.html: the session's own frame loop runs; a model driver is
// applied by wrapping session.chase.step; events are logged with the chase clock; screenshots at lock / shot / flat / stop / handover.
import {writeFile} from 'node:fs/promises';
import {launch, newPage, BASE, SHOTS} from './common.mjs';
const errors = [], stage = +(process.argv[2] || 2), quality = process.argv[3] || 'low';
const browser = await launch();
const page = await newPage(browser, errors);
const t0 = Date.now();
await page.goto(`${BASE}tools/catch-harness6.html?stage=${stage}&seed=3&dev=1&quality=${quality}`); await page.waitForFunction('window.done===true', null, {timeout: 180000});
await page.waitForFunction(() => session.snapshot.mode === 'chase');
const loadMs = Date.now() - t0;
await page.evaluate(() => {
  const chase = session.chase, C = chase.C, st = chase.state; const dr = {react: .25, miss: .18, aim: .15};
  let seed = 99; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let timer = 0, want = 0, fireTimer = 0; window.__log = []; window.__frames = []; const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const step0 = chase.step.bind(chase), drain0 = chase.drainEvents.bind(chase);
  chase.drainEvents = () => { const ev = drain0(); for (const e of ev) window.__log.push({t: +st.t.toFixed(2), real: +((performance.now()) / 1000).toFixed(2), ...e}); return ev; };
  chase.step = dt => {
    timer -= dt; fireTimer -= dt;
    if (timer <= 0 && st.phase === 'run') { timer = dr.react; let best = want, bs = -1e9; for (const lane of C.lanes) { let free = 60; for (const o of chase.obstacles) { if (o.kind === 'pad') continue; const os = chase.obstacleS(o, st.t) - st.s; if (os > -2 && os < 60 && Math.abs(o.d - lane) < 2.2) free = Math.min(free, os); } const sc = free - Math.abs(lane - st.d) * 1.5; if (sc > bs) { bs = sc; best = lane; } } want = rnd() < dr.miss ? want : best; const ds = st.crim.s - st.s; if (ds > -9 && ds < 26 && rnd() >= dr.miss) want = clamp(st.crim.d, -3.3, 3.3); }
    const wantVel = clamp((want - st.d) * 2.2, -C.steerSpeed, C.steerSpeed); chase.setSteer(clamp((wantVel - st.slide * .9) / C.steerSpeed, -1, 1));
    let near = 99; for (const o of chase.obstacles) { if (o.kind === 'pad') continue; const os = chase.obstacleS(o, st.t) - st.s; if (os > 0 && os < near && Math.abs(o.d - st.d) < 2.2) near = os; }
    const ds = st.crim.s - st.s, kA = Math.abs(chase.track.curvatureAt(st.s + 25)); chase.setBoost(st.tank > .12 && ds > 4 && near > 18 && kA < 1 / 110); chase.setBrake(ds < -1.5 || (kA > 1 / 60 && st.v > C.baseSpeed + 2));
    if (chase.gun.state.locked && chase.gun.state.reload <= 0 && fireTimer <= 0) { fireTimer = .25 + rnd() * .3; if (rnd() >= dr.aim && chase.gun.state.hitChance > .35) chase.fire(); }
    step0(dt);
  };
  window.__fps = {frames: 0, start: performance.now()}; const raf0 = window.requestAnimationFrame; window.requestAnimationFrame = cb => raf0(ts => { window.__fps.frames++; cb(ts); });
});
const shots = [], seen = new Set(), want = ['go', 'lock', 'shot', 'flat', 'stopped', 'skid', 'end'];
let last = {}, i = 0; const started = Date.now();
while (Date.now() - started < 14 * 60 * 1000) {
  const snap = await page.evaluate(() => ({mode: session.snapshot.mode, t: session.chase.state.t, phase: session.chase.state.phase, v: session.chase.state.v, s: session.chase.state.s, gun: {locked: session.chase.gun.state.locked, ammo: session.chase.gun.state.ammo, shots: session.chase.gun.state.shots, hits: session.chase.gun.state.hits, flats: session.chase.gun.state.flatCount, chance: +session.chase.gun.state.hitChance.toFixed(2)}, log: window.__log.length, frames: window.__fps.frames, elapsed: (performance.now() - window.__fps.start) / 1000, reticle: (() => { const r = document.querySelector('.catch-reticle:not([hidden]), .catch-fire-reticle:not([hidden]), [class*=reticle]:not([hidden])'); return r ? {cls: r.className, q: r.dataset.q || r.dataset.state || null} : null; })(), fireBtn: (() => { const b = document.querySelector('.catch-fire') || document.querySelector('[class*=catch-fire]'); return b ? {cls: b.className, locked: b.dataset.locked, hidden: b.hidden} : null; })()}));
  const log = await page.evaluate(n => window.__log.slice(n), last.log || 0);
  for (const e of log) {
    const key = e.type === 'shot' ? (e.hit ? 'shot-hit' : 'shot-miss') : e.type === 'flat' ? 'flat' + e.flatCount : e.type === 'lock' ? (e.on ? 'lock-on' : 'lock-off') : e.type;
    if ((want.includes(e.type) || e.type === 'turn' || e.type === 'crash' || e.type === 'oil') && !seen.has(key) && shots.length < 14) {
      seen.add(key); const file = `04-rt-stage${stage}-${String(shots.length).padStart(2, '0')}-${key}.png`;
      await page.screenshot({path: SHOTS + file}); shots.push({file, event: e, snap: {t: +snap.t.toFixed(1), v: +snap.v.toFixed(1), gun: snap.gun}});
      console.log('shot', file, JSON.stringify(e));
    }
  }
  last = snap;
  if (i++ % 5 === 0) console.log('t', snap.t.toFixed(1), snap.mode, snap.phase, 'v', snap.v.toFixed(1), 'gun', JSON.stringify(snap.gun), 'fps', (snap.frames / snap.elapsed).toFixed(2));
  if (snap.mode === 'throw') { await page.waitForTimeout(1500); await page.screenshot({path: `${SHOTS}04-rt-stage${stage}-handover-throw.png`}); break; }
  await page.waitForTimeout(700);
}
const log = await page.evaluate(() => window.__log);
const firstLock = log.find(e => e.type === 'lock' && e.on), firstShot = log.find(e => e.type === 'shot'), flats = log.filter(e => e.type === 'flat'), stopped = log.find(e => e.type === 'stopped'), end = log.find(e => e.type === 'end'), go = log.find(e => e.type === 'go');
const summary = {stage, quality, loadMs, fps: +(last.frames / last.elapsed).toFixed(2), realSeconds: +((Date.now() - started) / 1000).toFixed(0), chaseSeconds: +last.t.toFixed(1), go: go?.t, firstLockT: firstLock?.t, firstShotT: firstShot?.t, shots: log.filter(e => e.type === 'shot').length, hits: log.filter(e => e.type === 'shot' && e.hit).length, flatsT: flats.map(e => e.t), stoppedT: stopped?.t, endT: end?.t, endHow: end?.how, locks: log.filter(e => e.type === 'lock' && e.on).length, turns: log.filter(e => e.type === 'turn').length, crashes: log.filter(e => e.type === 'crash').length, scrapes: log.filter(e => e.type === 'scrape').length, mode: last.mode, gun: last.gun, errors, shots: shots.map(s => s.file), reticle: last.reticle, fireBtn: last.fireBtn};
console.log(JSON.stringify(summary, null, 1));
await writeFile(new URL(`../measurements-realtime-stage${stage}.json`, import.meta.url), JSON.stringify({summary, log, shots}, null, 1));
await browser.close();
