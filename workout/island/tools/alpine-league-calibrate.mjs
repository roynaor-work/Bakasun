/** Ski league v23: finds the rival strength of every stage (AI_STRENGTH in minigames/alpine-league-stages.mjs) so that the child-like bot,
 * with the gear a child would own by then (sim gearByProgress), passes about TARGET(n) of its runs: 85% for stages 1-5, then two points
 * less per stage down to 35% at stage 30. Bisection on s in [0, 1] with common random numbers (the same race seeds for every s, so the pass
 * rate is close to monotone in s), then a light smoothing. Prints the array to paste.
 * Usage: node workout/island/tools/alpine-league-calibrate.mjs [--runs 32] [--steps 6] [--from 1] [--to 30] */
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createAlpineEngine} from '../minigames/alpine-engine.mjs';
import {STAGE_COUNT, engineStageOf, equipmentFor} from '../minigames/alpine-league-core.mjs';
import {leagueBalance, leagueAi} from '../minigames/alpine-league-stages.mjs';
import {createKidBot} from './alpine-league-bot.mjs';
import {gearByProgress} from './alpine-league-sim.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const base = JSON.parse(await readFile(fileURLToPath(new URL('../data/config.json', import.meta.url)), 'utf8')).minigames.alpineRush;
export const TARGET = n => n <= 5 ? 85 : 85 - (n - 5) * 2;
export function passAt(n, s, runs) {
  const b0 = leagueBalance(base, n), es = engineStageOf(n), balance = {...b0, levels: b0.levels.map((l, i) => i === es - 1 ? {...l, ai: leagueAi(n, base.aiCaps, s)} : l)};
  const target = balance.levels[es - 1].targetRank; let pass = 0;
  for (let k = 0; k < runs; k++) {
    const e = createAlpineEngine({balance, stage: es, seed: 1000 + k * 7919 + n * 31, equipment: equipmentFor(gearByProgress(n)), power: 1});
    const bot = createKidBot({seed: 77 + k * 104729 + n, physics: balance.physics}); e.command({type: 'start'});
    for (let f = 0; f < 60 * 260 && e.phase !== 'finished'; f++) {
      if (e.phase === 'racing') { const d = bot.decide(e.snapshot()); e.command({type: 'steer', value: d.steer}); if (d.boost) e.command({type: 'boost'}); if (d.trick) e.command({type: 'trick', id: d.trick}); }
      e.step(1 / 60); e.drainEvents();
    }
    const r = e.snapshot().result; pass += r.completed && r.rank <= target; e.dispose();
  }
  return pass / runs * 100;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runs = Number(arg('--runs', 32)), steps = Number(arg('--steps', 6)), from = Number(arg('--from', 1)), to = Number(arg('--to', STAGE_COUNT)), out = [];
  for (let n = from; n <= to; n++) {
    let lo = 0, hi = 1, best = null;
    const atLo = passAt(n, 0, runs), atHi = passAt(n, 1, runs);
    if (atHi >= TARGET(n)) best = {s: 1, pass: atHi}; else if (atLo <= TARGET(n)) best = {s: 0, pass: atLo};
    else for (let i = 0; i < steps; i++) { const mid = (lo + hi) / 2, p = passAt(n, mid, runs); if (!best || Math.abs(p - TARGET(n)) < Math.abs(best.pass - TARGET(n))) best = {s: mid, pass: p}; if (p > TARGET(n)) lo = mid; else hi = mid; }
    out.push(+best.s.toFixed(3)); console.error(`stage ${n}: target ${TARGET(n)}% -> s ${best.s.toFixed(3)} (pass ${best.pass.toFixed(1)}%, s=0 ${atLo.toFixed(0)}%, s=1 ${atHi.toFixed(0)}%)`);
  }
  console.log(JSON.stringify(out));
}
