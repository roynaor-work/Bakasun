// QA check 2 (steer 0 vs counter-steer through the first bend, gun off so the bend is actually driven) and
// check 1b (whole chase: how long it lasts, how many bends the player actually drives before the thief stops), per driver and seed.
import {readFile, writeFile} from 'node:fs/promises';
import {createChaseEngine6, DRIVING6} from '../../../../minigames/catch-chase6.mjs';
import {seededRandom} from '../../../../minigames/catch-track.mjs';
const config = JSON.parse(await readFile(new URL('../../../../data/config.json', import.meta.url), 'utf8'));
const balance = config.minigames.catchCriminal;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const deg = r => r * 180 / Math.PI;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function run(chase, {seconds = 200, dr = DRIVING6.good, rnd, steerOverride = null, fire = true, log = null} = {}) {
  const dt = 1 / 60, C = chase.C, st = chase.state; let timer = 0, want = 0, fireTimer = 0;
  while (st.phase !== 'end' && st.t < seconds) {
    timer -= dt; fireTimer -= dt;
    if (timer <= 0 && st.phase === 'run') {
      timer = dr.react; let best = want, bs = -1e9;
      for (const lane of C.lanes) { let free = 60; for (const o of chase.obstacles) { if (o.kind === 'pad') continue; const os = chase.obstacleS(o, st.t) - st.s; if (os > -2 && os < 60 && Math.abs(o.d - lane) < 2.2) free = Math.min(free, os); } const sc = free - Math.abs(lane - st.d) * 1.5; if (sc > bs) { bs = sc; best = lane; } }
      want = rnd() < dr.miss ? want : best; const ds = st.crim.s - st.s; if (ds > -9 && ds < 26 && rnd() >= dr.miss) want = clamp(st.crim.d, -3.3, 3.3);
    }
    const wantVel = clamp((want - st.d) * 2.2, -C.steerSpeed, C.steerSpeed);
    const model = clamp((wantVel - st.slide * .9) / C.steerSpeed, -1, 1);
    const ov = steerOverride ? steerOverride(st, model) : null;
    chase.setSteer(ov === null || ov === undefined ? model : ov);
    let near = 99; for (const o of chase.obstacles) { if (o.kind === 'pad') continue; const os = chase.obstacleS(o, st.t) - st.s; if (os > 0 && os < near && Math.abs(o.d - st.d) < 2.2) near = os; }
    const ds = st.crim.s - st.s, kA = Math.abs(chase.track.curvatureAt(st.s + 25));
    chase.setBoost(st.tank > .12 && ds > 4 && near > 18 && kA < 1 / 110); chase.setBrake(ds < -1.5 || (kA > 1 / 60 && st.v > C.baseSpeed + 2));
    if (fire && chase.gun.state.locked && chase.gun.state.reload <= 0 && fireTimer <= 0) { fireTimer = .25 + rnd() * .3; if (rnd() >= dr.aim && chase.gun.state.hitChance > .22) chase.fire(); }
    chase.step(dt); const ev = chase.drainEvents(); log?.(st, ev);
  }
}
const out = {steer: [], whole: []};
console.log('--- check 2: first bend with the gun off, steer 0 vs counter-steer, seed 3 ---');
for (const stage of [1, 2, 3, 5, 8, 10]) {
  const res = {};
  for (const mode of ['zero', 'counter']) {
    const chase = createChaseEngine6({balance, stage, seed: 3});
    const arc = chase.track.segments.find(s => s.kind === 'arc');
    let maxD = 0, scrapeIn = 0, vIn = null, vMin = 99, vOut = null, inBend = false, crashes = 0, boostIn = false;
    run(chase, {fire: false, rnd: seededRandom(39 + stage), steerOverride: (st, model) => st.s < arc.s0 - 5 ? model : mode === 'zero' ? 0 : clamp((-st.slide * .9 - st.d * 1.2) / chase.C.steerSpeed, -1, 1),
      log: (st, ev) => { if (st.s >= arc.s0 && st.s <= arc.s1) { if (!inBend) { inBend = true; vIn = st.v; scrapeIn = st.scrape; boostIn = st.boosting; } maxD = Math.max(maxD, Math.abs(st.d)); vMin = Math.min(vMin, st.v); crashes += ev.filter(e => e.type === 'crash').length; } if (inBend && st.s > arc.s1 && vOut === null) { vOut = st.v; chase.state.phase = 'end'; } }});
    res[mode] = {maxD: +maxD.toFixed(2), scrapeSeconds: +(chase.state.scrape - scrapeIn).toFixed(2), vIn: +vIn.toFixed(1), vMin: +vMin.toFixed(1), vOut: +vOut.toFixed(1), speedLoss: +(vIn - vMin).toFixed(1), crashesInBend: crashes, boostAtEntry: boostIn};
  }
  const arc = createChaseEngine6({balance, stage, seed: 3}).track.segments.find(s => s.kind === 'arc');
  out.steer.push({stage, radius: arc.radius, angleDeg: Math.round(deg(arc.angle)), lengthM: Math.round(arc.radius * arc.angle), ...res});
  console.log('stage', stage, `R=${arc.radius} ${Math.round(deg(arc.angle))}° ${Math.round(arc.radius * arc.angle)}m`, '\n   zero   ', JSON.stringify(res.zero), '\n   counter', JSON.stringify(res.counter));
}
console.log('\n--- check 1b: the whole chase per driver (seeds 1..8): seconds of driving, metres, bends actually driven, how it ended ---');
console.log('stage driver  secs(avg min-max)  metres(avg)  bends driven(avg, of total)  heading(avg deg)  stopped-by-tyres%  roadblock%  shots  flats');
for (let stage = 1; stage <= 10; stage++) for (const name of ['expert', 'good', 'casual']) {
  const rows = [];
  for (let seed = 1; seed <= 8; seed++) {
    const chase = createChaseEngine6({balance, stage, seed});
    const arcs = chase.track.segments.filter(s => s.kind === 'arc');
    let heading = 0, lastYaw = chase.track.yawAt(0); const passed = new Set();
    run(chase, {dr: DRIVING6[name], rnd: seededRandom(seed * 13 + stage), log: st => { const y = chase.track.yawAt(st.s); heading += Math.abs(wrap(y - lastYaw)); lastYaw = y; const seg = chase.track.segmentAt(st.s); if (seg.kind === 'arc' && st.phase === 'run') passed.add(seg.s0); }});
    const r = chase.result(), st = chase.state;
    rows.push({secs: st.t, s: st.s, bends: passed.size, total: arcs.length, heading: deg(heading), tyres: r.byTyres, how: r.how, shots: r.shots, flats: r.flats});
  }
  const avg = k => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  const row = {stage, driver: name, secs: +avg('secs').toFixed(1), secsMin: +Math.min(...rows.map(r => r.secs)).toFixed(1), secsMax: +Math.max(...rows.map(r => r.secs)).toFixed(1), metres: Math.round(avg('s')), bends: +avg('bends').toFixed(1), bendsTotal: rows[0].total, heading: Math.round(avg('heading')), tyresPct: Math.round(100 * rows.filter(r => r.tyres).length / rows.length), roadblockPct: Math.round(100 * rows.filter(r => r.how === 'roadblock').length / rows.length), shots: +avg('shots').toFixed(1), flats: +avg('flats').toFixed(1), zeroBends: rows.filter(r => r.bends === 0).length};
  out.whole.push(row);
  console.log(String(stage).padStart(5), name.padEnd(7), `${row.secs} (${row.secsMin}-${row.secsMax})`.padEnd(19), String(row.metres).padStart(11), `${row.bends} of ${row.bendsTotal}`.padStart(27), String(row.heading).padStart(16), String(row.tyresPct).padStart(18), String(row.roadblockPct).padStart(11), String(row.shots).padStart(6), String(row.flats).padStart(6), row.zeroBends ? ` (0 bends in ${row.zeroBends}/8 runs)` : '');
}
await writeFile(new URL('../measurements-steer-length.json', import.meta.url), JSON.stringify(out, null, 1));
