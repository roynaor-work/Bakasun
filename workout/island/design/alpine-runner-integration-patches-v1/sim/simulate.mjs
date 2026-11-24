import {access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {createRunnerBot, RUNNER_BOT_DIFFICULTIES} from './bots.mjs';

const STEP_SECONDS = 1 / 60;
const MAX_SEED = 0xffffffff;
const BASE_REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const ENGINE_PATH = 'workout/island/minigames/alpine-runner-engine.mjs';

export function simulateRun(createAlpineRunner, {seed = 1, courseDifficulty = 1, botDifficulty = 'hard', seconds = 120} = {}) {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError('seconds must be a positive, finite number');
  const runner = createAlpineRunner({seed, difficulty: courseDifficulty});
  const choose = createRunnerBot(botDifficulty, {seed});
  const actions = {left: 0, right: 0, jump: 0, slide: 0};
  const events = {coin: 0, powerup: 0, shield: 0, crash: 0};
  const stepCount = Math.ceil(seconds / STEP_SECONDS);
  if (!Number.isSafeInteger(stepCount)) throw new RangeError('seconds exceeds the fixed-step simulation range');
  let state = runner.snapshot();
  let peakUpcomingEvents = state.nextEvents.length;

  for (let frame = 0; frame < stepCount && state.status === 'running'; frame++) {
    const action = choose(state);
    if (action) {
      runner.command(action);
      actions[action]++;
    }
    runner.step(Math.min(STEP_SECONDS, seconds - frame * STEP_SECONDS));
    for (const event of runner.drainEvents()) {
      if (Object.hasOwn(events, event.type)) events[event.type]++;
    }
    state = runner.snapshot();
    peakUpcomingEvents = Math.max(peakUpcomingEvents, state.nextEvents.length);
  }

  return {seed, botDifficulty, courseDifficulty, status: state.status, distance: state.distance,
    elapsed: state.elapsed, coins: state.coins, score: state.score, actions, events, peakUpcomingEvents};
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const halfway = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[halfway] : (sorted[halfway - 1] + sorted[halfway]) / 2;
}

export function runSimulations(createAlpineRunner, {firstSeed = 1, seeds = 24, courseDifficulty = 1, seconds = 120} = {}) {
  if (!Number.isInteger(seeds) || seeds < 1) throw new RangeError('seeds must be a positive integer');
  if (!Number.isInteger(firstSeed) || firstSeed < 0 || firstSeed + seeds - 1 > MAX_SEED) {
    throw new RangeError('seed range must use unsigned 32-bit integers');
  }
  if (![1, 2, 3].includes(courseDifficulty)) throw new RangeError('course difficulty must be 1, 2 or 3');

  const runs = [];
  const byDifficulty = {};
  for (const botDifficulty of RUNNER_BOT_DIFFICULTIES) {
    const batch = [];
    for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
      const run = simulateRun(createAlpineRunner, {seed, courseDifficulty, botDifficulty, seconds});
      batch.push(run);
      runs.push(run);
    }
    const distance = batch.map(run => run.distance);
    byDifficulty[botDifficulty] = {
      crashes: batch.filter(run => run.status === 'crashed').length,
      medianDistance: median(distance),
      maximumDistance: distance.reduce((max, value) => Math.max(max, value), 0),
      medianCoins: median(batch.map(run => run.coins)),
      medianScore: median(batch.map(run => run.score)),
      peakUpcomingEvents: batch.reduce((max, run) => Math.max(max, run.peakUpcomingEvents), 0),
      actions: Object.fromEntries(['left', 'right', 'jump', 'slide'].map(action => [action,
        batch.reduce((total, run) => total + run.actions[action], 0)])),
    };
  }
  return {config: {firstSeed, seeds, courseDifficulty, seconds, stepSeconds: STEP_SECONDS}, byDifficulty, runs};
}

async function main() {
  const {values} = parseArgs({options: {
    repo: {type: 'string'},
    'first-seed': {type: 'string', default: '1'},
    seeds: {type: 'string', default: '24'},
    difficulty: {type: 'string', default: '1'},
    seconds: {type: 'string', default: '120'},
    json: {type: 'boolean'},
    help: {type: 'boolean', short: 'h'},
  }});
  if (values.help) {
    console.log('node simulate.mjs [--repo DIR] [--first-seed 1] [--seeds 24] [--difficulty 1|2|3] [--seconds 120] [--json]');
    return;
  }
  const enginePath = resolve(values.repo ?? BASE_REPO, ENGINE_PATH);
  try { await access(enginePath); } catch {
    throw new Error(`Runner engine is missing at ${enginePath}. Apply the patches or pass --repo with an applied worktree.`);
  }
  const {createAlpineRunner} = await import(pathToFileURL(enginePath));
  const result = runSimulations(createAlpineRunner, {firstSeed: Number(values['first-seed']), seeds: Number(values.seeds),
    courseDifficulty: Number(values.difficulty), seconds: Number(values.seconds)});
  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`${result.config.seeds} seeds per bot, course difficulty ${result.config.courseDifficulty}, ${result.config.seconds}s cap, fixed 60 Hz step`);
  const round = value => Math.round(value * 10) / 10;
  console.table(Object.fromEntries(Object.entries(result.byDifficulty).map(([difficulty, summary]) => [difficulty, {
    crashes: summary.crashes, 'median m': round(summary.medianDistance), 'max m': round(summary.maximumDistance),
    'median coins': summary.medianCoins, 'median score': summary.medianScore, 'peak upcoming': summary.peakUpcomingEvents,
    ...summary.actions,
  }])));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
