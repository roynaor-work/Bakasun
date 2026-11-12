// QA check 1+2+3+6: pure node, no browser. Track geometry per stage, heading change over the first 30 s of the model driver,
// steer 0 vs counter-steer through the first bend, obstacle counts, and the throw engine's throwsTotal/hitsNeeded.
import {readFile, writeFile} from 'node:fs/promises';
import {createChaseEngine6, DRIVING6} from '../../../../minigames/catch-chase6.mjs';
import {createCatchEngine} from '../../../../minigames/catch-engine.mjs';
import {seededRandom} from '../../../../minigames/catch-track.mjs';
const config = JSON.parse(await readFile(new URL('../../../../data/config.json', import.meta.url), 'utf8'));
const balance = config.minigames.catchCriminal;
const SEED = +(process.argv[2] || 3);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const deg = r => r * 180 / Math.PI;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** The same model driver as tools/catch-view6-harness.html / driveChase6 (good), but it stops after `seconds`. */
function driveFor(chase, seconds, dr = DRIVING6.good, rnd = seededRandom(SEED * 13), {steerOverride = null, log = null} = {}) {
  const dt = 1 / 60, C = chase.C, st = chase.state; let timer = 0, want = 0, fireTimer = 0;
  while (st.phase !== 'end' && st.t < seconds) {
    timer -= dt; fireTimer -= dt;
    if (timer <= 0 && st.phase === 'run') {
      timer = dr.react; let best = want, bs = -1e9;
      for (const lane of C.lanes) { let free = 60; for (const o of chase.obstacles) { if (o.kind === 'pad') continue; const os = chase.obstacleS(o, st.t) - st.s; if (os > -2 && os < 60 && Math.abs(o.d - lane) < 2.2) free = Math.min(free, os); } const sc = free - Math.abs(lane - st.d) * 1.5; if (sc > bs) { bs = sc; best = lane; } }
      want = rnd() < dr.miss ? want : best; const ds = st.crim.s - st.s; if (ds > -9 && ds < 26 && rnd() >= dr.miss) want = clamp(st.crim.d, -3.3, 3.3);
    }
    const wantVel = clamp((want - st.d) * 2.2, -C.steerSpeed, C.steerSpeed);
    chase.setSteer(steerOverride ? steerOverride(st) : clamp((wantVel - st.slide * .9) / C.steerSpeed, -1, 1));
    let near = 99; for (const o of chase.obstacles) { if (o.kind === 'pad') continue; const os = chase.obstacleS(o, st.t) - st.s; if (os > 0 && os < near && Math.abs(o.d - st.d) < 2.2) near = os; }
    const ds = st.crim.s - st.s, kA = Math.abs(chase.track.curvatureAt(st.s + 25));
    chase.setBoost(st.tank > .12 && ds > 4 && near > 18 && kA < 1 / 110); chase.setBrake(ds < -1.5 || (kA > 1 / 60 && st.v > C.baseSpeed + 2));
    if (chase.gun.state.locked && chase.gun.state.reload <= 0 && fireTimer <= 0) { fireTimer = .25 + rnd() * .3; if (rnd() >= dr.aim && chase.gun.state.hitChance > .22) chase.fire(); }
    chase.step(dt); const ev = chase.drainEvents(); log?.(st, ev);
  }
}

const out = {seed: SEED, stages: []};
console.log('--- check 1: track per stage (seed ' + SEED + ') ---');
console.log('stage curve arcs S-bends minR maxR length  heading30s(deg) arcsPassed30s dist30s');
for (let stage = 1; stage <= 10; stage++) {
  const chase = createChaseEngine6({balance, stage, seed: SEED});
  const segs = chase.track.segments, arcs = segs.filter(s => s.kind === 'arc');
  // S-bend: arc followed by a short straight (<35 m) then an arc the other way
  let sBends = 0; for (let i = 0; i + 2 < segs.length; i++) if (segs[i].kind === 'arc' && segs[i + 1].kind === 'straight' && segs[i + 1].len < 35 && segs[i + 2].kind === 'arc' && segs[i + 2].dir !== segs[i].dir) sBends++;
  let heading = 0, lastYaw = chase.track.yawAt(0), passed = new Set(), maxSlide = 0, scrape = 0;
  driveFor(chase, 30 + chase.C.countdownSeconds, DRIVING6.good, seededRandom(SEED * 13 + stage), {log: st => { const y = chase.track.yawAt(st.s); heading += Math.abs(wrap(y - lastYaw)); lastYaw = y; const seg = chase.track.segmentAt(st.s); if (seg.kind === 'arc') passed.add(seg.s0); maxSlide = Math.max(maxSlide, Math.abs(st.slide)); }});
  const st = chase.state;
  const row = {stage, curve: chase.spec.curve, arcs: arcs.length, sBends, minR: Math.min(...arcs.map(a => a.radius)), maxR: Math.max(...arcs.map(a => a.radius)), length: Math.round(chase.track.length), heading30: Math.round(deg(heading)), arcsPassed30: passed.size, dist30: Math.round(st.s), maxSlide: +maxSlide.toFixed(2), scrape30: +st.scrape.toFixed(1), v: +st.v.toFixed(1), phase: st.phase, outcome: st.outcome, totalTurn: Math.round(deg(arcs.reduce((a, s) => a + s.angle, 0))), segments: segs.map(s => s.kind === 'arc' ? `${s.dir > 0 ? 'L' : 'R'}${s.radius}/${Math.round(deg(s.angle))}°` : `S${s.len}`)};
  out.stages.push(row);
  console.log(String(stage).padStart(5), String(row.curve).padStart(5), String(row.arcs).padStart(4), String(row.sBends).padStart(7), String(row.minR).padStart(4), String(row.maxR).padStart(4), String(row.length).padStart(6), String(row.heading30).padStart(15), String(row.arcsPassed30).padStart(13), String(row.dist30).padStart(7), ' slide', row.maxSlide, 'scrape', row.scrape30, row.phase, row.outcome || '');
}
for (const r of out.stages) console.log('  stage', r.stage, 'turn total', r.totalTurn + '°', r.segments.join(' '));

console.log('\n--- check 2: first bend, steer 0 vs counter-steer (same seed) ---');
out.steer = [];
for (const stage of [1, 2, 3, 5, 8, 10]) {
  const res = {};
  for (const mode of ['zero', 'counter']) {
    const chase = createChaseEngine6({balance, stage, seed: SEED});
    const firstArc = chase.track.segments.find(s => s.kind === 'arc');
    // run to the first bend with the model driver, then through it with the chosen steering
    const toBend = st => st.s < firstArc.s0 - 5;
    let maxD = 0, scrape0 = 0, vIn = null, vMin = 99, vOut = null, inBend = false, crashes = 0;
    driveFor(chase, 60, DRIVING6.good, seededRandom(SEED * 13 + stage), {
      steerOverride: st => { if (toBend(st)) return null; return mode === 'zero' ? 0 : clamp(-st.slide * .9 / chase.C.steerSpeed + (-st.d) * .3, -1, 1); },
      log: (st, ev) => {
        if (st.s >= firstArc.s0 && st.s <= firstArc.s1) { if (!inBend) { inBend = true; vIn = st.v; scrape0 = st.scrape; } maxD = Math.max(maxD, Math.abs(st.d)); vMin = Math.min(vMin, st.v); crashes += ev.filter(e => e.type === 'crash').length; }
        if (inBend && st.s > firstArc.s1 && vOut === null) { vOut = st.v; chase.state.phase = 'end'; }
      },
    });
    // steerOverride returning null means "use the model"; patch: the driver treats null as 0, so handle it inside
    res[mode] = {maxD: +maxD.toFixed(2), scrapeSeconds: +(chase.state.scrape - scrape0).toFixed(2), vIn: +(vIn ?? 0).toFixed(1), vMin: +vMin.toFixed(1), vOut: +(vOut ?? chase.state.v).toFixed(1), crashesInBend: crashes};
  }
  out.steer.push({stage, radius: createChaseEngine6({balance, stage, seed: SEED}).track.segments.find(s => s.kind === 'arc').radius, ...res});
  console.log('stage', stage, 'first bend R=' + out.steer.at(-1).radius, 'zero:', JSON.stringify(res.zero), 'counter:', JSON.stringify(res.counter));
}

console.log('\n--- check 3: obstacles by kind per stage ---');
out.obstacles = [];
for (let stage = 1; stage <= 10; stage++) {
  const chase = createChaseEngine6({balance, stage, seed: SEED});
  const by = {}; for (const o of chase.obstacles) by[o.kind] = (by[o.kind] || 0) + 1;
  const inBend = chase.obstacles.filter(o => Math.abs(chase.track.curvatureAt(o.s)) > 1 / 120).length;
  out.obstacles.push({stage, density: chase.spec.density, total: chase.obstacles.length, inBend, ...by});
  console.log('stage', stage, 'density', chase.spec.density, 'total', chase.obstacles.length, 'inBend', inBend, JSON.stringify(by));
}

console.log('\n--- check 6: throwsTotal / hitsNeeded per stage (engine, arch v2, mods from a tyre stop = closeness 1) ---');
out.throws = [];
const balance6 = {...balance, levels: balance.levels.map(l => ({...l, ...(l.v6 || {})}))};
for (let stage = 1; stage <= 10; stage++) {
  const chase = createChaseEngine6({balance, stage, seed: SEED});
  // what the session does after a tyre stop: closeness 1 → extraThrows 1
  chase.state.outcome = 'caught'; chase.gun.state.stopped = true; const mods = chase.result().mods;
  const eng = createCatchEngine({balance: balance6, stage, seed: SEED, equipment: {}, city: {police: 0, prison: 0}, v2: true, mods, feel: true, arch: true});
  const engFar = createCatchEngine({balance: balance6, stage, seed: SEED, equipment: {}, city: {police: 0, prison: 0}, v2: true, mods: {distScale: 1.3, windScale: 1.25, extraThrows: 0}, feel: true, arch: true});
  const row = {stage, throwsTotal: eng.throwsTotal, throwsTotalRoadblock: engFar.throwsTotal, hitsNeeded: eng.hitsNeeded, crew: eng.level.crew || 1, dist: eng.level.dist, distAfterStop: +(eng.state.baseX).toFixed(1), distAfterRoadblock: +(engFar.state.baseX).toFixed(1), wind: eng.level.wind, extraThrows: mods.extraThrows};
  out.throws.push(row); console.log(JSON.stringify(row));
}
await writeFile(new URL('../measurements-node.json', import.meta.url), JSON.stringify(out, null, 1));
