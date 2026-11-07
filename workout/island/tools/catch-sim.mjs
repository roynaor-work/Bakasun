// Headless measurement for "תפוס את הפושע": N games per stage with a model player.
//   node workout/island/tools/catch-sim.mjs [games=200] [levels=1-10] [--json out.json]
// The model player sees exactly what the officer sees (the wind-free preview, the wind
// number, the thief's movement) and carries a human error: angle, power and release
// timing noise, plus an imperfect wind correction. Three skills are reported.
import {readFile, writeFile} from 'node:fs/promises';
import {createCatchEngine, seededRandom} from '../minigames/catch-engine.mjs';
import {createChaseEngine} from '../minigames/catch-chase.mjs';

const config = JSON.parse(await readFile(new URL('../data/config.json', import.meta.url), 'utf8'));
const defaultBalance = config.minigames.catchCriminal;
export const SKILLS = {
  expert: {angle: 1.8, power: 0.045, time: 0.12, windComp: 0.65, head: 0.5},
  good: {angle: 3.0, power: 0.070, time: 0.20, windComp: 0.4, head: 0.35},
  casual: {angle: 4.5, power: 0.100, time: 0.30, windComp: 0.1, head: 0.15},
};
/** How well the model player drives: reaction time, chance to ignore a hazard, how late he boosts. */
export const DRIVING = {expert: {react: .14, miss: .06}, good: {react: .3, miss: .2}, casual: {react: .45, miss: .36}};
export function driveChase(chase, driving, rnd) {
  const dt = 1 / 60, C = chase.balance.chase, st = chase.state;
  let timer = 0, want = 0, guard = 0;
  while (st.phase !== 'end' && guard++ < 60 * 120) {
    timer -= dt;
    if (timer <= 0 && st.phase === 'run') {
      timer = driving.react;
      let best = st.lat > .5 ? 1 : st.lat < -.5 ? -1 : 0, bestFree = -1;
      for (const lane of [-1, 0, 1]) {
        let free = 55;
        for (const o of chase.obstacles) { if (o.kind === 'pad') continue; const ox = chase.obstacleX(o, st.t) - st.x; if (ox > -2 && ox < 55 && Math.abs(o.lat - lane) < .6) free = Math.min(free, ox); }
        const score = free - Math.abs(lane - st.lat) * 4;
        if (score > bestFree) { bestFree = score; best = lane; }
      }
      want = rnd() < driving.miss ? want : best;
    }
    chase.setSteer(clamp((want - st.lat) * 3.2, -1, 1));
    // boost on the open road, not into the next car
    let near = 99; for (const o of chase.obstacles) { if (o.kind === 'pad') continue; const ox = chase.obstacleX(o, st.t) - st.x; if (ox > 0 && ox < near && Math.abs(o.lat - st.lat) < .7) near = ox; }
    chase.setBoost(st.tank > .12 && st.gap > C.catchGap + 2 && near > 16);
    chase.step(dt); chase.drainEvents();
  }
  return chase.result();
}
const gauss = r => { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Analytic no-wind power that lands on (tx, ty) at a given angle; null if impossible. */
function solvePower(balance, tool, angle, tx, ty) {
  const P = balance.physics, a = angle * Math.PI / 180, dx = tx - P.release.x, dy = ty - P.release.y;
  const den = 2 * Math.cos(a) ** 2 * (dx * Math.tan(a) - dy);
  if (den <= 0 || dx <= 0) return null;
  const v = Math.sqrt(tool.gravity * dx * dx / den);
  const p = (v / tool.vmax - P.powerMin) / (1 - P.powerMin);
  return p < 0 || p > 1 ? null : p;
}

/** The player's plan for the current turn: tool, angle, power, wait. */
export function plan(engine, skill, rnd) {
  const balance = engine.balance, P = balance.physics, Pt = P.throwSeconds, C = balance.criminal, level = engine.level;
  const order = ['narrow', 'rope', 'wide'].filter(id => engine.tools.some(t => t.id === id));
  const angles = [34, 44, 26, 54, 18, 64, 8, 72, 3];
  const period = level.move?.period || (level.move?.kind === 'dash' ? 2 * (2 * level.move.amp / level.move.speed + level.move.pause) : 0);
  const popCycle = level.pop ? level.pop.up + level.pop.down : 0;
  const horizon = Math.max(period, popCycle, 0) + 0.4;
  const delays = [0]; for (let d = 0.2; d <= horizon; d += 0.2) delays.push(d);
  let best = null;
  for (const id of order) {
    const tool = engine.tools.find(t => t.id === id);
    for (const angle of angles) {
      for (const delay of delays) {
        // The thief's position at impact depends on the flight time; two fixed-point passes are enough.
        let T = 1.2, x = 0, c;
        const headShot = rnd() < skill.head;
        const ty = headShot ? 1.7 : 1.0;
        let power = null;
        for (let i = 0; i < 3; i++) {
          c = engine.criminalAt(engine.clock + delay + Pt + T); x = c.x;
          // Wind pushes the net sideways; the player corrects by a fraction of the drift.
          const drift = 0.5 * engine.wind * tool.windScale * T * T;
          power = solvePower(balance, tool, angle, x - skill.windComp * drift, ty);
          if (power === null) break;
          const speed = tool.vmax * (P.powerMin + (1 - P.powerMin) * power);
          T = Math.max(0.2, (2 * speed * Math.sin(angle * Math.PI / 180)) / tool.gravity * 0.97);
        }
        if (power === null || !c.exposed) continue;
        // Reject lines the preview shows as blocked.
        const pre = engine.trajectory(angle, power, id, {withWind: false, t0: engine.clock + delay + Pt, resolve: true});
        if (pre.kind !== 'catch') continue;
        // Score the candidate: wide margins beat narrow ones. Test a few perturbations of the final aim.
        let ok = 0, n = 0;
        for (const [da, dp] of [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.02], [0, -0.02]]) {
          const r = engine.trajectory(angle + da, clamp(power + dp, 0, 1), id, {withWind: true, t0: engine.clock + delay + Pt, resolve: true});
          n++; if (r.kind === 'catch') ok++;
        }
        const score = ok / n - delay * 0.01 - (id === 'wide' ? 0.02 : 0);
        if (!best || score > best.score) best = {id, angle, power, delay, score};
        if (score >= 0.99) return best;
      }
    }
  }
  return best;
}

export function playGame(stage, seed, skill, balance = defaultBalance, {v2 = false, driving = DRIVING.good} = {}) {
  const rnd = seededRandom(seed * 7919 + stage);
  let chased = null, mods = {};
  if (v2) { chased = driveChase(createChaseEngine({balance, stage, seed}), driving, rnd); mods = chased.mods; }
  const engine = createCatchEngine({balance, stage, seed, v2, mods});
  const dt = 1 / 60;
  let guard = 0, throws = 0, hits = 0, flightTime = 0;
  while (engine.state.phase !== 'done' && guard++ < 60 * 120) {
    if (engine.state.phase === 'aim') {
      const p = plan(engine, skill, rnd) || {id: engine.tools[0].id, angle: 40, power: 0.5, delay: 0};
      const wait = Math.max(0, p.delay + gauss(rnd) * skill.time);
      for (let t = 0; t < wait; t += dt) engine.step(dt);
      engine.setTool(p.id);
      // The player watches the crosshair sway and corrects for it at the moment he plans to release.
      const plannedAt = engine.clock - (wait - p.delay), sway = engine.wobbleAt(plannedAt);
      // A short preview means the player has to extrapolate the arc: his aim gets less exact.
      const blur = 1 + 1.2 * (1 - engine.previewFraction);
      engine.setAim({angle: p.angle - sway.angle + gauss(rnd) * skill.angle * blur, power: clamp(p.power - sway.power + gauss(rnd) * skill.power * blur, 0, 1)});
      const f = engine.release(); throws++; flightTime += f.duration; if (f.kind === 'catch') hits++;
    }
    engine.step(dt);
  }
  const sum = engine.summary();
  return {chase: chased, won: sum.outcome === 'win', perfect: sum.perfect, throws, score: sum.score, performance: sum.performance, seconds: engine.clock + (chased ? chased.seconds + balance.chase.countdownSeconds : 0), flight: flightTime};
}

export function measure(games, stages, skills = SKILLS, balance = defaultBalance, opts = {}) {
  const out = {};
  for (const [name, skill] of Object.entries(skills)) {
    out[name] = stages.map(stage => {
      let close = 0, chaseHits = 0, wins = 0, perfect = 0, throws = 0, seconds = 0, firstThrow = 0, stars = [0, 0, 0, 0], coins = 0;
      for (let g = 0; g < games; g++) {
        const r = playGame(stage, g + 1, skill, balance, {...opts, driving: DRIVING[name] || DRIVING.good});
        if (r.chase) { close += r.chase.closeness; chaseHits += r.chase.hits; }
        if (r.won) { wins++; if (r.perfect) perfect++; if (r.throws === 1) firstThrow++; stars[1 + (r.performance >= 0.45) + (r.performance >= 0.8)]++; coins += Math.floor(r.score / balance.pointsPerCoin) + balance.levels[stage - 1].winMoney; } else stars[0]++;
        throws += r.throws; seconds += r.seconds;
      }
      return {stage, games, catchRate: wins / games, perfectRate: perfect / games, firstThrowRate: firstThrow / games, avgThrows: throws / games, avgSeconds: seconds / games, stars: stars.map(n => n / games), avgCoins: coins / games, closeness: close / games, chaseHits: chaseHits / games};
    });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), games = Number(args[0]) || 200;
  const range = (args[1] && !args[1].startsWith('--') ? args[1] : '1-10').split('-').map(Number);
  const listArg = args.find(a => a.startsWith('--stages='));
  const stages = listArg ? listArg.slice(9).split(',').map(Number) : Array.from({length: (range[1] || range[0]) - range[0] + 1}, (_, i) => range[0] + i);
  const v1 = args.includes('--v1'), onlyArg = args.find(a => a.startsWith('--only=')), skills = onlyArg ? Object.fromEntries(Object.entries(SKILLS).filter(([k]) => onlyArg.slice(7).split(',').includes(k))) : SKILLS, started = Date.now(), result = measure(games, stages, skills, defaultBalance, {v2: !v1});
  console.log('games per stage:', games, 'seconds:', ((Date.now() - started) / 1000).toFixed(1));
  for (const [name, rows] of Object.entries(result)) {
    console.log(`\n[${name}]  stage  catch%  first%  perfect%  throws  secs  coins`);
    for (const r of rows) console.log(`        ${String(r.stage).padStart(2)}   ${(r.catchRate * 100).toFixed(0).padStart(5)}  ${(r.firstThrowRate * 100).toFixed(0).padStart(5)}  ${(r.perfectRate * 100).toFixed(0).padStart(7)}  ${r.avgThrows.toFixed(2).padStart(6)} ${r.avgSeconds.toFixed(0).padStart(5)} ${r.avgCoins.toFixed(0).padStart(6)}`);
  }
  const j = args.indexOf('--json');
  if (j >= 0) await writeFile(args[j + 1], JSON.stringify({games, result}, null, 1));
}
