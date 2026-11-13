// "תפוס את הפושע" v7: how often an average 7-year-old hits, v22 (catchV6=1 with the v22 rules) against v7, same seeds.
//   node workout/island/tools/catch-sim7.mjs [games=150] [--stages=1,2,3] [--json out.json] [--versions=v22,v7,v7noassist]
// The child model (13/11 brief): aim noise with a standard deviation of 8 to 12 degrees (drawn per attempt) and a reaction
// time of 0.3 to 0.6 s. In the chase the noise is the angle between the police car's line and the target zone he steers
// for; he taps the fire button when the reticle shows, after his reaction time, whatever its colour. In the catch he looks
// for a moment, puts the sight on the thief (v22) or on the lead marker (v7) with the noise in both directions, and lifts
// the finger after his reaction time. Wind: he trusts the sight (it carries the wind on stages 1-6, not on 7-10).
// Counted per attempt: a tool shot in the chase (a spike strip counts when he reaches it) and a net throw in the catch.
import {readFile, writeFile} from 'node:fs/promises';
import {createCatchEngine, seededRandom} from '../minigames/catch-engine.mjs';
import {createChaseEngine6} from '../minigames/catch-chase6.mjs';
import {ASSIST7, levels7, leadPoint, idealAim, assistInfo, assistRelease, pick} from '../minigames/catch-assist.mjs';

const config = JSON.parse(await readFile(new URL('../data/config.json', import.meta.url), 'utf8'));
export const BALANCE = config.minigames.catchCriminal;
export const KID = Object.freeze({sigma: [8, 12], rt: [.3, .6], think: [.35, .9], hazardMiss: .25, slideComp: .85, tryOther: .18});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const gauss = r => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const between = (r, [a, b]) => a + (b - a) * r();
const RAD = Math.PI / 180;

/** The versions measured: v22 = the shipped v6 rules (tyre gun armed after 14 s, plain release); v7 = tools + assist + elements. */
export const VERSIONS = {
  v22: {chase: null, levels: b => b.levels.map(l => ({...l, obstacles: [], movers: [], ...(l.v6 || {})})), assist: false},
  v7: {chase: {weapons: true, assist: true, elements: true}, levels: b => levels7(b), assist: true},
  v7noassist: {chase: {weapons: true, assist: false, elements: true}, levels: b => b.levels.map(l => ({...l, obstacles: [], movers: [], ...(l.v6 || {})})), assist: false},
};

/** A child driving the chase: steers for lanes at his reaction pace, lines up on the zone with the noise, taps fire late. */
export function kidDrive(chase, rnd, kid = KID) {
  const dt = 1 / 60, C = chase.C, st = chase.state, gun = chase.gun, W7 = Boolean(chase.v7?.weapons);
  const out = {shots: 0, hits: 0, byTool: {}, firstShotAt: null, closes: 0, cycles: 0};
  let timer = 0, want = 0, fireAt = -1, guard = 0;
  const tally = (tool, hit) => { const b = out.byTool[tool] ||= {shots: 0, hits: 0}; b.shots++; out.shots++; if (hit) { b.hits++; out.hits++; } };
  while (st.phase !== 'end' && guard++ < 60 * 160) {
    timer -= dt;
    const g = gun.state, gap = st.crim.s - st.s;
    if (timer <= 0 && st.phase === 'run') {
      timer = between(rnd, kid.rt);
      let best = want, bestScore = -1e9;
      for (const lane of C.lanes) {
        let free = 60;
        for (const o of chase.obstacles) { if (o.kind === 'pad' || o.kind === 'nitro') continue; const os = chase.obstacleS(o, st.t) - st.s; if (os > -2 && os < 60 && Math.abs(o.d - lane) < 2.2) free = Math.min(free, os); }
        const score = free - Math.abs(lane - st.d) * 1.5;
        if (score > bestScore) { bestScore = score; best = lane; }
      }
      want = rnd() < kid.hazardMiss ? want : best;
      if (g.locked) { // the reticle is on: he steers for the zone, his line off by the aim noise
        const a = W7 ? gun.aimInfo() : null, zoneD = a ? (a.weapon === 'spikes' ? a.predD : a.zoneD) : st.crim.d + (st.crim.wobble || 0);
        const dist = a ? a.dist : Math.max(3, gap), sigma = between(rnd, kid.sigma);
        want = clamp(zoneD + dist * Math.tan(clamp(gauss(rnd) * sigma, -60, 60) * RAD), -C.shoulder + .3, C.shoulder - .3);
      } else if (gap > -9 && gap < 30 && rnd() >= kid.hazardMiss) want = clamp(st.crim.d, C.lanes[0], C.lanes[2]);
    }
    const wantVel = clamp((want - st.d) * 2.2, -C.steerSpeed, C.steerSpeed);
    chase.setSteer(clamp((wantVel - st.slide * kid.slideComp) / C.steerSpeed, -1, 1));
    let near = 99; for (const o of chase.obstacles) { if (o.kind === 'pad' || o.kind === 'nitro') continue; const os = chase.obstacleS(o, st.t) - st.s; if (os > 0 && os < near && Math.abs(o.d - st.d) < 2.2) near = os; }
    const kAhead = Math.abs(chase.track.curvatureAt(st.s + 25));
    chase.setBoost(st.tank > .15 && gap > 7 && near > 18 && kAhead < 1 / 110);
    chase.setBrake(gap < -1.5 || (kAhead > 1 / 60 && st.v > C.baseSpeed + 2));
    // the fire button: when the reticle shows and the tool is ready, a tap after the reaction time
    if (st.phase === 'run' && g.locked && g.reload <= 0 && g.ammo > 0 && fireAt < 0) fireAt = st.t + between(rnd, kid.rt);
    if (fireAt >= 0 && st.t >= fireAt) { fireAt = -1; if (chase.fire() && out.firstShotAt === null) out.firstShotAt = st.t; }
    if (W7 && st.phase === 'run') { // the tool button: an empty tool is swapped, and now and then he tries another one
      const s2 = gun.state; if ((s2.ammo <= 0 && s2.reload <= 0) || (fireAt < 0 && s2.reload > 0 && rnd() < kid.tryOther * dt)) { chase.cycle(); out.cycles++; }
    }
    chase.step(dt);
    for (const e of chase.drainEvents()) {
      if (e.type === 'shot') tally(e.weapon || 'tyres', e.hit);
      else if (e.type === 'wshot') tally(e.weapon, e.hit);
      else if (e.type === 'closeTime') out.closes++;
    }
  }
  return {...chase.result(), kid: out};
}

/** A child throwing the net: looks, aims with the noise at the thief (or at the lead marker with the assist), releases late. */
export function kidThrow(engine, rnd, stage, {assist = false, kid = KID, A = ASSIST7} = {}) {
  const dt = 1 / 60, P = engine.balance.physics, out = {throws: 0, hits: 0, locks: 0, pulled: 0};
  let guard = 0;
  while (engine.state.phase !== 'done' && guard++ < 60 * 150) {
    if (engine.state.phase === 'aim') {
      const think = between(rnd, kid.think); for (let t = 0; t < think && engine.state.phase === 'aim'; t += dt) engine.step(dt);
      if (engine.state.phase !== 'aim') continue;
      const target = assist ? leadPoint(engine, {A}) : (() => { const c = engine.criminalAt(engine.clock); return {x: c.x, y: A.chest + (c.y || 0), z: c.z || 0}; })();
      const sigma = between(rnd, kid.sigma), dist = Math.hypot(target.x - A.eye.x, target.z);
      const noisy = {x: target.x, y: target.y + dist * Math.tan(clamp(gauss(rnd) * sigma, -40, 40) * RAD), z: target.z + dist * Math.tan(clamp(gauss(rnd) * sigma, -40, 40) * RAD)};
      // he trusts the sight: it shows the wind on the helped stages (aimHelp >= 1), not on the others
      const aim = idealAim(engine, noisy, {wind: (engine.aimHelp || 0) >= 1, tool: engine.aim.tool}), w = engine.wobbleAt(engine.clock);
      engine.setAim({yaw: aim.yaw - (w.yaw || 0), angle: aim.angle - (w.angle || 0), power: 1});
      // the HUD opens the close time the moment the sight comes into the cone on its way from where it started (on the
      // street centre at his distance) to where the finger stops: the sweep passes the target zone even when the stop is off
      if (assist) {
        const info = assistInfo(engine, stage, {A}), c = info.lead, ex = A.eye.x, ey = A.eye.y, D = RAD * 180 / Math.PI;
        const ang = p => [Math.atan2(p.z, p.x - ex) / RAD, Math.atan2(p.y - ey, Math.hypot(p.x - ex, p.z)) / RAD];
        const [tY, tP] = ang(c), [eY, eP] = ang(info.sight), [sY, sP] = ang({x: c.x, y: A.chest, z: 0});
        const vx = eY - sY, vy = eP - sP, len2 = vx * vx + vy * vy, u = len2 > 1e-9 ? clamp(((tY - sY) * vx + (tP - sP) * vy) / len2, 0, 1) : 0;
        const sweep = Math.hypot(sY + vx * u - tY, sP + vy * u - tP) * D;
        if ((info.locked || (sweep <= info.cone && c.exposed)) && engine.closeTime(pick(A.closeSeconds, stage), pick(A.closeRate, stage))) out.locks++;
      }
      const rt = between(rnd, kid.rt); for (let t = 0; t < rt; t += dt) engine.step(dt);
      if (engine.state.phase !== 'aim') continue;
      if (assist) { const r = assistRelease(engine, stage, {A}); if (r?.pull > 0) out.pulled++; }
      const f = engine.release(); out.throws++; if (f.kind === 'catch') out.hits++;
    }
    engine.step(dt);
    engine.drainEvents();
  }
  const sum = engine.summary();
  return {...out, won: sum.outcome === 'win'};
}

export function playKid(stage, seed, version = 'v7', balance = BALANCE, kid = KID) {
  const V = VERSIONS[version], rnd = seededRandom(seed * 7919 + stage * 31 + 5);
  const chase = kidDrive(createChaseEngine6({balance, stage, seed, v7: V.chase}), rnd, kid);
  const engine = createCatchEngine({balance: {...balance, levels: V.levels(balance)}, stage, seed, v2: true, mods: chase.mods, feel: true, arch: true});
  const thr = kidThrow(engine, rnd, stage, {assist: V.assist, kid});
  return {chase, thr};
}

const wilson = (k, n, z = 1.96) => { if (!n) return [0, 0]; const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [Math.max(0, c - h), Math.min(1, c + h)]; };
export function measureKid(games, stages, versions = ['v22', 'v7'], balance = BALANCE, kid = KID) {
  const out = {};
  for (const v of versions) {
    out[v] = stages.map(stage => {
      const r = {stage, games, shots: 0, hits: 0, throws: 0, throwHits: 0, wins: 0, stops: 0, chaseSec: 0, firstShot: 0, firstShotN: 0, locks: 0, closes: 0, byTool: {}, nitro: 0, nearMisses: 0};
      for (let g = 1; g <= games; g++) {
        const {chase, thr} = playKid(stage, g, v, balance, kid);
        r.shots += chase.kid.shots; r.hits += chase.kid.hits; r.chaseSec += chase.seconds; if (chase.byTyres) r.stops++;
        if (chase.kid.firstShotAt !== null) { r.firstShot += chase.kid.firstShotAt; r.firstShotN++; }
        r.closes += chase.kid.closes; r.nitro += chase.nitro || 0; r.nearMisses += chase.nearMisses || 0;
        for (const [k, b] of Object.entries(chase.kid.byTool)) { const t = r.byTool[k] ||= {shots: 0, hits: 0}; t.shots += b.shots; t.hits += b.hits; }
        r.throws += thr.throws; r.throwHits += thr.hits; r.locks += thr.locks; if (thr.won) r.wins++;
      }
      return {...r, shotHit: r.shots ? r.hits / r.shots : 0, shotCI: wilson(r.hits, r.shots), throwHit: r.throws ? r.throwHits / r.throws : 0, throwCI: wilson(r.throwHits, r.throws),
        allHit: (r.hits + r.throwHits) / Math.max(1, r.shots + r.throws), allCI: wilson(r.hits + r.throwHits, r.shots + r.throws), winRate: r.wins / games, stopRate: r.stops / games,
        chaseSecAvg: r.chaseSec / games, firstShotAvg: r.firstShotN ? r.firstShot / r.firstShotN : null, shotsPerGame: r.shots / games, throwsPerGame: r.throws / games};
    });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), games = Number(args.find(a => /^\d+$/.test(a))) || 150;
  const sArg = args.find(a => a.startsWith('--stages=')), vArg = args.find(a => a.startsWith('--versions='));
  const stages = sArg ? sArg.slice(9).split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], versions = vArg ? vArg.slice(11).split(',') : ['v22', 'v7'];
  const t0 = Date.now(), res = measureKid(games, stages, versions);
  const pc = x => (x * 100).toFixed(0).padStart(3), ci = c => `${pc(c[0])}-${pc(c[1]).trim()}`;
  console.log('games per stage:', games, 'seconds:', ((Date.now() - t0) / 1000).toFixed(1));
  for (const v of versions) {
    console.log(`\n[${v}] stage | chase shots/g hit% (95% CI) | first shot s | chase s | stop% | throws/g hit% (95% CI) | all hit% | win%`);
    for (const r of res[v]) console.log(`  ${String(r.stage).padStart(2)} | ${r.shotsPerGame.toFixed(1).padStart(4)} ${pc(r.shotHit)} (${ci(r.shotCI)}) n=${r.shots} | ${r.firstShotAvg === null ? '  -' : r.firstShotAvg.toFixed(1).padStart(4)} | ${r.chaseSecAvg.toFixed(0).padStart(3)} | ${pc(r.stopRate)} | ${r.throwsPerGame.toFixed(1)} ${pc(r.throwHit)} (${ci(r.throwCI)}) n=${r.throws} | ${pc(r.allHit)} | ${pc(r.winRate)}  tools ${Object.entries(r.byTool).map(([k, b]) => `${k} ${b.hits}/${b.shots}`).join(', ')}`);
  }
  const j = args.indexOf('--json'); if (j >= 0) await writeFile(args[j + 1], JSON.stringify({games, kid: KID, result: res}, null, 1));
}
