/** Ski league v23 measurement (headless, the real engine at 60 Hz, the real league stages and goals): the child-like bot of
 * tools/alpine-league-bot.mjs races every stage `--runs` times (different race seeds and bot noise) and the tool reports, per stage,
 * the pass rate (the place goal, which opens the next stage), the stars, the stage time and the falls. No browser.
 * Usage: node workout/island/tools/alpine-league-sim.mjs [--runs 40] [--from 1] [--to 30] [--gear 0..5 | --gear progress] [--json out.json] [--quiet]
 * --gear progress: the bot buys gear with the coins a run of the league would have earned by that stage (an estimate of a real season). */
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createAlpineEngine} from '../minigames/alpine-engine.mjs';
import {STAGE_COUNT, engineStageOf, stageInfo, equipmentFor, GEAR, MAX_LEVEL} from '../minigames/alpine-league-core.mjs';
import {leagueBalance, stageGoals, judgeGoals, courseFacts} from '../minigames/alpine-league-stages.mjs';
import {createKidBot} from './alpine-league-bot.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const config = JSON.parse(await readFile(fileURLToPath(new URL('../data/config.json', import.meta.url)), 'utf8'));
const base = config.minigames.alpineRush, DT = 1 / 60;

/** One race of league stage n by the bot. Returns the verified-run facts the league uses. */
export function raceStage(n, {seed = 1, botSeed = seed, gear = 0, bot: botOptions = {}, maxFrames = 60 * 260} = {}) {
  const balance = leagueBalance(base, n), level = gear && typeof gear === 'object' ? gear : Object.fromEntries(Object.keys(GEAR).map(k => [k, gear]));
  const engine = createAlpineEngine({balance, stage: engineStageOf(n), seed, equipment: equipmentFor(level), power: 1});
  const bot = createKidBot({seed: botSeed, physics: balance.physics, ...botOptions});
  engine.command({type: 'start'});
  for (let f = 0; f < maxFrames && engine.phase !== 'finished'; f++) {
    if (engine.phase === 'racing') {
      const d = bot.decide(engine.snapshot());
      engine.command({type: 'steer', value: d.steer}); if (d.boost) engine.command({type: 'boost'}); if (d.trick) engine.command({type: 'trick', id: d.trick});
    }
    engine.step(DT); engine.drainEvents();
  }
  const r = engine.snapshot().result, stats = engine.leagueStats(), goals = judgeGoals(stageGoals(base, n), {...r, gates: stats.gates});
  const passed = goals[0].ok, stars = passed ? goals.filter(g => g.ok).length : 0;
  engine.dispose();
  return {n, passed, stars, rank: r.rank, ms: r.elapsedMs, completed: r.completed, crashes: r.crashes, gates: stats.gates, gatesTotal: stats.gatesTotal, coins: r.coins, goals: goals.map(g => g.ok)};
}
const pct = v => Math.round(v * 1000) / 10;
const median = list => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
export function measure({runs = 40, from = 1, to = STAGE_COUNT, gear = 0, bot = {}, seeds = 500000} = {}) {
  const rows = [];
  for (let n = from; n <= to; n++) {
    // Race and bot seeds are independent of the calibration's (tools/alpine-league-calibrate.mjs uses 1000 + k * 7919 + n * 31).
    const list = Array.from({length: runs}, (_, k) => raceStage(n, {seed: seeds + k * 6151 + n * 53, botSeed: seeds + 91 + k * 92821 + n, gear: typeof gear === 'function' ? gear(n) : gear, bot}));
    const info = stageInfo(n), facts = courseFacts(base, n), goals = stageGoals(base, n);
    rows.push({n, number: info.number, theme: info.theme, boss: info.boss, target: info.targetRank, length: facts.length, gates: facts.gates, wind: facts.windZones,
      pass: pct(list.filter(r => r.passed).length / runs), stars: +(list.reduce((a, r) => a + r.stars, 0) / runs).toFixed(2), three: pct(list.filter(r => r.stars === 3).length / runs),
      timeGoal: goals[1].ms, timeOk: pct(list.filter(r => r.goals[1]).length / runs), thirdGoal: goals[2].kind, thirdOk: pct(list.filter(r => r.goals[2]).length / runs),
      medianS: +(median(list.map(r => r.ms)) / 1000).toFixed(1), minS: +(Math.min(...list.map(r => r.ms)) / 1000).toFixed(1), maxS: +(Math.max(...list.map(r => r.ms)) / 1000).toFixed(1),
      p60S: +(([...list.map(r => r.ms)].sort((a, b) => a - b)[Math.floor(runs * .6)] || 0) / 1000).toFixed(1), p40S: +(([...list.map(r => r.ms)].sort((a, b) => a - b)[Math.floor(runs * .4)] || 0) / 1000).toFixed(1),
      crashes: +(list.reduce((a, r) => a + r.crashes, 0) / runs).toFixed(2), rank: +(list.reduce((a, r) => a + r.rank, 0) / runs).toFixed(2), completed: pct(list.filter(r => r.completed).length / runs)});
    if (!process.argv.includes('--quiet')) { const r = rows.at(-1); console.error(`stage ${String(n).padStart(2)} (${r.number}) ${r.theme.padEnd(7)}${r.boss ? ' boss' : '     '} target ${r.target} pass ${String(r.pass).padStart(5)}% stars ${r.stars} time ${r.medianS}s [${r.minS}-${r.maxS}] goal ${(r.timeGoal / 1000).toFixed(1)}s ok ${r.timeOk}% ${r.thirdGoal} ok ${r.thirdOk}% crashes ${r.crashes} rank ${r.rank}`); }
  }
  return rows;
}
/** Gear a child would own when it reaches stage n (a cautious reading of the league economy: one more level of skis per finished theme,
 * helmet and goggles one level behind). The calibration of the rivals assumes this gear. */
export function gearByProgress(n) { const step = Math.min(MAX_LEVEL, Math.floor((n - 1) / 5)); return {skis: step, helmet: Math.max(0, step - 1), goggles: Math.max(0, step - 1)}; }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runs = Number(arg('--runs', 40)), from = Number(arg('--from', 1)), to = Number(arg('--to', STAGE_COUNT)), gearArg = arg('--gear', '0');
  const gear = gearArg === 'progress' ? gearByProgress : Number(gearArg);
  const t0 = Date.now(), rows = measure({runs, from, to, gear, seeds: Number(arg('--seeds', 500000))});
  const early = rows.filter(r => r.n <= 5), last = rows.find(r => r.n === STAGE_COUNT);
  const summary = {runs, gear: gearArg, seconds: Math.round((Date.now() - t0) / 1000), stages1to5: early.length ? +(early.reduce((a, r) => a + r.pass, 0) / early.length).toFixed(1) : null, stage30: last?.pass ?? null,
    medianStageS: median(rows.filter(r => !r.boss).map(r => r.medianS)), medianBossS: median(rows.filter(r => r.boss).map(r => r.medianS))};
  console.error(JSON.stringify(summary));
  if (arg('--json')) await writeFile(arg('--json'), JSON.stringify({summary, rows}, null, 1) + '\n');
}
