#!/usr/bin/env node
import {readFile, stat} from 'node:fs/promises';
import {availableParallelism} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isMainThread, parentPort, Worker, workerData} from 'node:worker_threads';

export const BOTS = Object.freeze({
  novice: {cadence: 5.2, yawError: 5, reachError: 2.4, lead: .2, dodge: .24, reaction: 1.35, repair: .36, guided: .22, approach: 98, radar: .7, skyReaction: 1.5, skyError: 7, skyTrack: .36},
  learning: {cadence: 4.1, yawError: 3.2, reachError: 1.6, lead: .53, dodge: .47, reaction: 1.05, repair: .45, guided: .52, approach: 124, radar: .53, skyReaction: 1, skyError: 4.5, skyTrack: .27},
  practiced: {cadence: 3.15, yawError: 2.1, reachError: 1.05, lead: .82, dodge: .68, reaction: .77, repair: .56, guided: .82, approach: 150, radar: .28, skyReaction: .6, skyError: 2.5, skyTrack: .18},
});

const DT = 1 / 30;
const DEG = Math.PI / 180;
const FIRST_MINUTE = 60;
const OPENING_SECONDS = 15;
const DEFAULT_SEEDS = 24;
const DEFAULT_SEED = 20261118;

const noise = random => Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random()))) * Math.cos(2 * Math.PI * random());
const mix = value => {
  let n = value >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return (n ^ (n >>> 15)) >>> 0;
};

export async function loadEngine(root) {
  const island = await stat(resolve(root, 'data/config.json')).catch(() => null) ? resolve(root) : resolve(root, 'workout/island');
  const href = pathToFileURL(island + '/').href;
  const [data, model, context, ballistics, controls, campaign, air, radar] = await Promise.all([
    readFile(join(island, 'data/config.json'), 'utf8'),
    import(href + 'minigames/naval.mjs'),
    import(href + 'minigames/context.mjs'),
    import(href + 'minigames/naval-ballistics.mjs'),
    import(href + 'minigames/naval-controls.mjs'),
    import(href + 'minigames/naval-campaign.mjs'),
    import(href + 'minigames/naval-air.mjs'),
    import(href + 'minigames/naval-v241.mjs'),
  ]);
  const gameConfig = JSON.parse(data).minigames;
  const balance = gameConfig.navalDuel;
  const config = {...gameConfig, height: balance.render.height};
  return {config, balance, ...model, ...context, ...ballistics, ...controls, ...campaign, ...air, ...radar};
}

function aimAt(engine, ship, target, ammo, pressure, wind, profile, random) {
  const {balance, navalLaunch, navalLanding, navalReachAim, navalReachRange, navalSolveLaunch, navalReachOf} = engine;
  const range = navalReachRange(balance);
  const launch = (yaw, reach) => navalLaunch({ship, yaw, ...navalReachAim(reach, balance, ammo), wind, ammo, pressure}, balance);
  // Fit a reachable drag to a visible point. The bot adds its own hand error
  // after this estimate and leaves the actual projectile to the game.
  const solve = point => {
    if (ammo === 2) {
      const solution = navalSolveLaunch(ship, point, {ammo, wind, pressure}, balance);
      return {yaw: solution.yaw, reach: navalReachOf(solution, balance, ammo)};
    }

    let yaw = Math.atan2(point.z - ship.z, point.x - ship.x);
    let reach = range.low;
    for (let pass = 0; pass < 3; pass++) {
      let lo = range.min;
      let hi = range.max;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      for (let i = 0; i < 17; i++) {
        const mid = (lo + hi) / 2;
        const shot = launch(yaw, mid);
        const end = navalLanding(shot);
        const difference = (end.x - point.x) * cy + (end.z - point.z) * sy;
        if (difference < 0) lo = mid;
        else hi = mid;
      }
      reach = (lo + hi) / 2;
      const shot = launch(yaw, reach);
      const end = navalLanding(shot);
      const side = (point.z - end.z) * cy - (point.x - end.x) * sy;
      yaw += Math.atan2(side, Math.max(1, Math.hypot(end.x - shot.origin.x, end.z - shot.origin.z)));
    }
    return {yaw, reach};
  };

  const first = solve(target);
  const lead = launch(first.yaw, first.reach).duration * profile.lead;
  const aim = solve({x: target.x + target.vx * lead, z: target.z + target.vz * lead});
  const {elevation, power} = navalReachAim(aim.reach + noise(random) * profile.reachError, balance, ammo);
  return {aimYaw: aim.yaw + noise(random) * profile.yawError * DEG, aimElevation: elevation, aimPower: power};
}

function rangeTo(player, goal) {
  return Math.hypot(goal.x - player.x, goal.z - player.z);
}

function targetQueue(model) {
  const live = model.enemies.filter(enemy => enemy.active && enemy.hp > 0);
  const mission = model.mission.id;
  const priority = enemy => (mission === 'flagship' && enemy.boss) ||
    (mission === 'intercept' && enemy.behavior === 'flank') ||
    (mission === 'subhunt' && enemy.behavior === 'dive');
  const order = enemy => priority(enemy) ? 0 : enemy.chain && rangeTo(model.playerShip, enemy) < 355 ? 1 : enemy.structure ? (enemy.main === false ? 4 : 3) : 2;
  return live.sort((a, b) => order(a) - order(b) || rangeTo(model.playerShip, a) - rangeTo(model.playerShip, b));
}

function targets(model, engine, profile, random, goals) {
  const {balance, navalTargetable} = engine;
  const goal = goals[0];
  if (!goal) return null;
  if (model.ammo[5] && !model.cooldowns[5] && model.lives / model.maxLives <= profile.repair) return {goal, ammo: 5};
  if (goal.subMode === 'v24' && model.ammo[2]) return {goal, ammo: 2, torpedoButton: true};
  if (model.ammo[1] && navalTargetable(goal, 1, balance) && (goal.boss || model.lives < model.maxLives * .6) && random() < profile.guided) {
    return {goal, ammo: 1};
  }
  for (const enemy of goals) {
    const ammo = [0, 4, 2, 1].find(kind => model.ammo[kind] && (kind !== 0 || model.loaded > 0) && navalTargetable(enemy, kind, balance));
    if (ammo !== undefined) return {goal: enemy, ammo};
  }
  return null;
}

function steerTo(model, x, z, throttle) {
  const heading = Math.atan2(z - model.playerShip.z, x - model.playerShip.x) - model.camera.heading;
  return {moveX: Math.sin(heading) * throttle, moveZ: -Math.cos(heading) * throttle};
}

function helm(model, state, profile, random, goal) {
  const warnings = [...model.enemies.flatMap(enemy => enemy.attacks ?? [enemy.attack]), ...model.air.map(enemy => enemy.attack)];
  for (const warning of warnings) {
    if (!warning || state.seenWarnings.has(warning)) continue;
    state.seenWarnings.add(warning);
    if (random() > profile.dodge) continue;

    const reaction = profile.reaction * (.75 + .65 * random());
    const side = Math.abs(model.playerShip.z) > 105 ? -Math.sign(model.playerShip.z) : random() < .5 ? -1 : 1;
    state.dodges.push({start: model.time + reaction, end: model.time + reaction + .92, side});
  }

  state.dodges = state.dodges.filter(dodge => dodge.end > model.time);
  const dodge = state.dodges.find(dodge => dodge.start <= model.time);
  if (dodge) return {moveX: dodge.side, moveZ: 0};
  const buoy = model.buoys[0];
  if (buoy && (model.loaded <= 2 || model.belt !== null && model.belt <= 6)) return steerTo(model, buoy.x, buoy.z, .85);
  if (goal && rangeTo(model.playerShip, goal) > (goal.structure ? 295 : 320)) return steerTo(model, goal.x, goal.z, .82);
  if (model.playerShip.x < profile.approach) return steerTo(model, profile.approach + 20, 0, .82);
  return {};
}

function vulcan(model, engine, state, profile, random) {
  const active = model.air.filter(craft => craft.state !== 'down' && craft.hp > 0 && model.time - craft.born >= profile.skyReaction);
  const aimed = active.find(craft => craft.id === state.sky?.id) ||
    active.sort((a, b) => rangeTo(model.playerShip, a) - rangeTo(model.playerShip, b))[0];
  if (!aimed || rangeTo(model.playerShip, aimed) > 175 || model.belt === 0) {
    state.sky = null;
    return {skyMode: 'manual'};
  }
  if (state.sky?.id !== aimed.id || model.time >= state.sky.next) {
    const angles = engine.navalSkyAngles(model.playerShip, aimed, engine.balance);
    state.sky = {
      id: aimed.id, next: model.time + profile.skyTrack,
      yaw: angles.yaw + noise(random) * profile.skyError * DEG,
      pitch: Math.max(0, Math.min(55 * DEG, angles.pitch + noise(random) * profile.skyError * DEG)),
    };
  }
  return {skyMode: 'manual', skyHeld: true, skyYaw: state.sky.yaw, skyPitch: state.sky.pitch};
}

export function runBattle(engine, {stage, seed, bot, patched}) {
  if (!Object.hasOwn(BOTS, bot)) throw new Error(`Unknown bot ${bot}`);
  const base = BOTS[bot];
  const {config, balance, createNavalModel, seededRandom, navalStagePressure} = engine;
  const model = createNavalModel({config, balance, level: stage, seed, random: seededRandom(seed), navalBattle: patched});
  if (patched && !model.navalBattle) throw new Error('Naval battle patch is unavailable in the patched checkout. Apply the patch or choose --mode baseline.');
  // Pilot random streams do not consume the engine's wind, projectile or spawn draws.
  const aimRandom = seededRandom(mix(seed ^ 0xa724c81f));
  const steerRandom = seededRandom(mix(seed ^ 0x0c13abd1));
  const skyRandom = seededRandom(mix(seed ^ 0xd3079053));
  const profile = {...base, cadence: base.cadence * (.82 + .36 * aimRandom()), yawError: base.yawError * (.72 + .56 * aimRandom())};
  const openingEnemies = model.enemies.filter(enemy => enemy.active && enemy.hp > 0 && enemy.behavior !== 'base').length;
  const state = {seenWarnings: new WeakSet(), airProjectiles: new WeakSet(), dodges: [], sky: null};
  const pressure = navalStagePressure(stage);
  let nextRelease = 1.2 + profile.cadence * .33 + aimRandom();
  let openingEnemyShots = 0;
  let openingPlayerShots = 0;
  let firstMinuteEnemyShots = 0;
  let airShots = 0;
  // The match clock can stop for the last aircraft while model time keeps advancing.
  const maxTime = model.settings.seconds + balance.sinkSeconds + 60;

  while (!model.result && model.time < maxTime) {
    const goals = targetQueue(model);
    const input = {...helm(model, state, profile, steerRandom, goals[0]), ...vulcan(model, engine, state, profile, skyRandom)};
    if (model.time >= nextRelease && !input.skyHeld && !model.radar && !model.homing?.queued) {
      const selected = targets(model, engine, profile, aimRandom, goals);
      if (selected) {
        const {goal, ammo, torpedoButton} = selected;
        const radar = ammo !== 5 && !torpedoButton && model.radarOn &&
          engine.navalRadarInRange(rangeTo(model.playerShip, goal), ammo, false, model.radarConfig) && aimRandom() < profile.radar;
        if (torpedoButton) {
          Object.assign(input, {torpedoShot: true, torpedoTarget: goal.index});
        } else if (radar) {
          Object.assign(input, {ammoIndex: ammo, lockClear: true, lockTarget: goal.index, quickShot: true});
        } else {
          Object.assign(input, {
            lockClear: true, fireRelease: true, releaseCurrent: true,
            releaseTarget: {target: goal.index}, selectTargetIndex: goal.index, ammoIndex: ammo,
          });
          if (ammo !== 1 && ammo !== 5) {
            Object.assign(input, aimAt(engine, model.playerShip, goal, ammo, pressure, model.wind, profile, aimRandom));
          }
        }
        const interval = profile.cadence * (.74 + .52 * aimRandom());
        nextRelease = model.time + (radar ? Math.max(4.1, interval) : interval);
      } else {
        nextRelease = model.time + .3;
      }
    }
    model.update(DT, input);
    // enemyFired counts sea and shore projectiles. Count visible aircraft
    // projectiles once each so the incoming-shot total includes the air wave.
    for (const projectile of model.enemyShots) {
      if (projectile.air && !state.airProjectiles.has(projectile)) {
        state.airProjectiles.add(projectile);
        airShots++;
      }
    }
    if (model.time <= OPENING_SECONDS + 1e-7) {
      openingEnemyShots = model.enemyFired + airShots;
      openingPlayerShots = model.fired;
    }
    if (model.time <= FIRST_MINUTE + 1e-7) firstMinuteEnemyShots = model.enemyFired + airShots;
  }

  const stateAtEnd = model.snapshot();
  return {
    stage, seed, bot, won: model.result?.outcome === 'win', outcome: model.result?.outcome ?? 'cap',
    duration: model.time, openingEnemies, fleet: model.enemies.filter(enemy => enemy.behavior !== 'base').length, openingEnemyShots, openingPlayerShots,
    enemyShots: model.enemyFired + airShots, enemyAirShots: airShots, playerShots: model.fired, vulcanShots: stateAtEnd.vulcan?.shots ?? 0,
    hits: stateAtEnd.hits, firstMinuteEnemyShots, radarLocks: stateAtEnd.v241.radarLocks,
    timerLimit: model.settings.seconds, playerHp: model.lives, ammoResupplies: stateAtEnd.resupplies + stateAtEnd.supplies,
    finish: !model.result ? 'cap' : model.result.outcome === 'win' ? 'mission' : model.lives <= 0 ? 'hull' : 'timer',
  };
}

export function summarize(rounds) {
  if (!rounds.length) throw new Error('Cannot summarize an empty round set');
  const n = rounds.length;
  const mean = key => rounds.reduce((sum, round) => sum + round[key], 0) / n;
  const count = (key, value) => rounds.filter(round => round[key] === value).length;
  const durations = rounds.map(round => round.duration).sort((a, b) => a - b);
  const winningDurations = rounds.filter(round => round.won).map(round => round.duration).sort((a, b) => a - b);
  const quantile = (values, p) => {
    if (!values.length) return null;
    const index = (values.length - 1) * p;
    const lower = values[Math.floor(index)];
    return lower + (values[Math.ceil(index)] - lower) * (index % 1);
  };
  const wins = winningDurations.length;
  const seconds = mean('duration');
  return {
    n, wins, winRate: wins / n, meanSeconds: seconds,
    medianSeconds: quantile(durations, .5), p10Seconds: quantile(durations, .1), p90Seconds: quantile(durations, .9),
    winningMeanSeconds: wins ? winningDurations.reduce((sum, time) => sum + time, 0) / wins : null,
    winningMedianSeconds: quantile(winningDurations, .5),
    meanOpeningEnemies: mean('openingEnemies'), meanFleet: mean('fleet'),
    meanOpeningPlayerShots: mean('openingPlayerShots'), meanOpeningEnemyShots: mean('openingEnemyShots'),
    meanPlayerShots: mean('playerShots'), meanEnemyShots: mean('enemyShots'),
    playerShotsPerMinute: 60 * mean('playerShots') / seconds, enemyShotsPerMinute: 60 * mean('enemyShots') / seconds,
    meanEnemyAirShots: mean('enemyAirShots'), meanVulcanShots: mean('vulcanShots'), meanRadarLocks: mean('radarLocks'),
    meanFirstMinuteEnemyShots: mean('firstMinuteEnemyShots'), meanPlayerHits: mean('hits'),
    meanTimerLimitSeconds: mean('timerLimit'),
    finishes: {mission: wins, hull: count('finish', 'hull'), timer: count('finish', 'timer'), cap: count('finish', 'cap')},
  };
}

function integer(value, name, minimum = 1) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) throw new Error(`Invalid ${name} ${value}`);
  return Number(value);
}

function stageList(value, max) {
  const selected = new Set();
  for (const source of value.split(',')) {
    const [start, end = start, ...rest] = source.split('-');
    const a = integer(start, 'stage');
    const b = integer(end, 'stage');
    if (rest.length || a > b || b > max) throw new Error(`Invalid stage range ${source}`);
    for (let stage = a; stage <= b; stage++) selected.add(stage);
  }
  return [...selected].sort((a, b) => a - b);
}

async function findRoot(start) {
  for (let current = start;; current = dirname(current)) {
    if (await stat(join(current, 'workout/island/data/config.json')).catch(() => null)) return current;
    if (current === dirname(current)) throw new Error('Bakasun checkout not found. Pass --root PATH.');
  }
}

function runStages(engine, baseline, {modes, stages, bots, seeds}) {
  return modes.flatMap(mode => {
    const patched = mode === 'patched';
    const activeEngine = patched ? engine : baseline;
    return stages.map(stage => ({
      mode, stage, rounds: bots.flatMap(bot => seeds.map(seed => runBattle(activeEngine, {stage, seed, bot, patched}))),
    }));
  });
}

function inWorker(options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {workerData: {navalSimulation: options}});
    let received = false;
    worker.once('message', result => {
      received = true;
      resolve(result);
    });
    worker.once('error', reject);
    worker.once('exit', code => {
      if (!received) reject(new Error(`Simulation worker finished without results (code ${code})`));
    });
  });
}

export function compareSummaries(before, after) {
  return {
    durationRatio: after.medianSeconds / before.medianSeconds,
    meanDurationRatio: after.meanSeconds / before.meanSeconds,
    winningDurationRatio: before.winningMedianSeconds && after.winningMedianSeconds ? after.winningMedianSeconds / before.winningMedianSeconds : null,
    winRateChange: after.winRate - before.winRate,
  };
}

async function main(args) {
  const help = `Usage: node sim.mjs [--root PATH] [--baseline-root PATH] [--stages 1,3,20-30] [--seeds N] [--seed N] [--bots novice,learning,practiced] [--mode both|baseline|patched] [--jobs N] [--rows]\n`;
  if (args.includes('--help')) {
    process.stdout.write(help);
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--rows') options.rows = true;
    else if (['--root', '--baseline-root', '--stages', '--seeds', '--seed', '--bots', '--mode', '--jobs'].includes(flag) && args[i + 1] && !args[i + 1].startsWith('--')) {
      options[flag.slice(2)] = args[++i];
    } else throw new Error(`Unknown or incomplete option ${flag}\n${help}`);
  }

  const root = options.root ?? await findRoot(process.cwd()).catch(() => findRoot(dirname(fileURLToPath(import.meta.url))));
  const modes = options.mode === 'baseline' ? ['baseline'] : options.mode === 'patched' ? ['patched'] : ['baseline', 'patched'];
  if (options.mode && !['baseline', 'patched', 'both'].includes(options.mode)) throw new Error(`Invalid mode ${options.mode}`);
  const engine = await loadEngine(root);
  const baseline = options['baseline-root'] ? await loadEngine(options['baseline-root']) : engine;
  const max = modes.length === 1 && modes[0] === 'baseline' ? baseline.balance.levels.length :
    modes.length === 1 ? engine.balance.levels.length : Math.min(engine.balance.levels.length, baseline.balance.levels.length);
  const stages = stageList(options.stages ?? `1-${max}`, max);
  const n = options.seeds ? integer(options.seeds, 'seed count') : DEFAULT_SEEDS;
  const seed = options.seed ? integer(options.seed, 'seed', 0) : DEFAULT_SEED;
  const bots = options.bots ? [...new Set(options.bots.split(','))] : Object.keys(BOTS);
  if (bots.some(bot => !Object.hasOwn(BOTS, bot))) throw new Error(`Unknown bots ${bots.join(',')}`);
  const seeds = Array.from({length: n}, (_, i) => mix(seed + i));
  const jobs = Math.min(stages.length, options.jobs ? integer(options.jobs, 'jobs') : Math.min(3, availableParallelism()));
  const work = {root, baselineRoot: options['baseline-root'], modes, stages, bots, seeds};
  const batches = jobs === 1 ? runStages(engine, baseline, work) :
    (await Promise.all(Array.from({length: jobs}, (_, job) =>
      inWorker({...work, stages: stages.filter((_, index) => index % jobs === job)})))).flat();
  const output = {seed, seeds: n, stages, bots: Object.fromEntries(bots.map(bot => [bot, BOTS[bot]])), openingSeconds: OPENING_SECONDS, stepSeconds: DT, results: {}};

  for (const mode of modes) {
    const all = [];
    const byStage = {};
    for (const stage of stages) {
      const {rounds} = batches.find(batch => batch.mode === mode && batch.stage === stage);
      all.push(...rounds);
      byStage[stage] = {
        total: summarize(rounds),
        bots: Object.fromEntries(bots.map(bot => [bot, summarize(rounds.filter(round => round.bot === bot))])),
      };
    }
    const late = all.filter(round => round.stage >= 21);
    output.results[mode] = {
      total: summarize(all), late: late.length ? summarize(late) : null, stages: byStage, ...(options.rows ? {rows: all} : {}),
    };
  }

  if (modes.length === 2) {
    const {baseline: before, patched: after} = output.results;
    output.comparison = Object.fromEntries(stages.map(stage => [stage, compareSummaries(before.stages[stage].total, after.stages[stage].total)]));
    output.aggregateComparison = {
      total: compareSummaries(before.total, after.total),
      late: before.late ? compareSummaries(before.late, after.late) : null,
    };
  }
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

if (!isMainThread && workerData?.navalSimulation) {
  const work = workerData.navalSimulation;
  const engine = await loadEngine(work.root);
  const baseline = work.baselineRoot ? await loadEngine(work.baselineRoot) : engine;
  parentPort.postMessage(runStages(engine, baseline, work));
} else if (isMainThread && process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  });
}
