import {STAGE_COUNT,BASE_STAGES,stageInfo,engineStageOf,RIVALS} from './alpine-league-core.mjs?v=island-v2-20261107-12';
import {THEME_LOOKS} from './alpine-league-theme.mjs?v=island-v2-20261107-12';
import {generateCourse} from './alpine-track.mjs?v=island-v2-20261107-12';

/** Ski league v23: the 30 courses, their rivals and goals, built from one difficulty curve plus each theme's flavour. Pure (no DOM, no
 * three.js); the island engine, the session, the result check, the screens and the bot simulation all build the same stage from here.
 *
 * Difficulty rises with the stage (d = 0 at stage 1, 1 at stage 30): a faster course (speed scale on the base and boost speed), rows of
 * obstacles closer together with narrower gaps, more and denser slalom gates, narrow passages, rocks behind jumps, tighter turns, side wind
 * from the aurora night on, sharper and faster rivals, and the place to reach (3rd, then 2nd, then 1st). The fifth stage of a theme is its
 * boss: a 40% longer course with double points. The curve was set with tools/alpine-league-sim.mjs (a child-like bot on the real engine). */

const lerp = (a, b, t) => a + (b - a) * t;
const r2 = v => Math.round(v * 100) / 100;
/** Theme flavour: multipliers on the shared curve (slalom, rocks, ramps, narrow passages, wind). */
export const FLAVOUR = Object.freeze({
  pine: Object.freeze({slalom: 1, rocks: 1, ramps: 1, narrow: 1, wind: 0, turns: 1}),
  ice: Object.freeze({slalom: 1.4, rocks: .85, ramps: .8, narrow: 1.5, wind: 0, turns: 1.1}),
  lava: Object.freeze({slalom: .9, rocks: 1.35, ramps: 1.25, narrow: 1.2, wind: 0, turns: 1}),
  aurora: Object.freeze({slalom: 1.2, rocks: 1.25, ramps: 1.1, narrow: 1.3, wind: 1.15, turns: 1.05}),
  village: Object.freeze({slalom: 1.2, rocks: .9, ramps: 1.5, narrow: 1, wind: .6, turns: 1.15}),
  peak: Object.freeze({slalom: 1.15, rocks: 1.15, ramps: 1.1, narrow: 1.35, wind: 1.5, turns: 1.1})
});
/** The curve. Every number the tuning touched lives here. */
export const CURVE = Object.freeze({
  length: [1450, 1850], bossLength: 1.4, speed: [1, 1.06],
  rowSpacing: [[40, 52], [30, 38]], gap: [[5.8, 7], [4.4, 5.4]], rockDensity: [.66, .84], rockRadius: [[.65, .95], [.72, 1.04]],
  slalomGates: [3, 5], slalomStep: [15, 13.5], slalomOffset: [1.4, 1.55],
  narrowFrom: .12, narrowChance: [.1, .3], narrowScale: [.9, .87],
  wind: {from: .5, speed: [.9, 1.8]},
  /** Rival strength s = 0..1 maps to every AI parameter (speed stays within config.aiCaps). */
  ai: {speed: [.93, 1], spread: [.012, .004], reaction: [.5, .2], lookahead: [28, 60], error: [.9, .3], mistake: [.14, .03], margin: [.15, .35],
    boostChance: [.3, .8], boostTank: [.9, .6], trickChance: [.3, .7], trickMargin: [.35, .15], padDesire: [4, 6], rampDesire: [2, 4], gateDesire: [1, 5], windComp: [.8, .92]},
  goals: {gates: [.6, .5]}
});
/** Rival strength of each stage (index n - 1), calibrated with tools/alpine-league-sim.mjs so the child-like bot passes about 85% of
 * stages 1-5 and about 35% of stage 30, falling steadily in between (the place goal steps 3 -> 2 -> 1 at stages 11 and 16, so the rivals
 * ease a little there). */
// Measured 13/11/2026: a bisection with 32 races a stage (common seeds), then one secant step on the pooled estimate of that and an
// independent 48-race check, then a second independent 48-race check that moved the two stages furthest from the line (13 and 30:
// a scan of s with 96 independent races a point on two new seed sets, pooled); gear as tools/alpine-league-sim.mjs gearByProgress.
export const AI_STRENGTH = Object.freeze([1, .969, .691, 1, .774, 1, .728, .75, .814, .75, .569, .969, .75, 1, .964,
  .995, .669, .719, .863, .781, .688, .594, .75, .625, .834, .699, .528, .671, 1, .62]);

const difficultyOf = n => Math.min(1, (n - 1) / (STAGE_COUNT - 1) + (stageInfo(n)?.boss ? .02 : 0));
const LETTERS = 'abcd';
/** Track id of a stage: letters only (the records file accepts [a-z-] ids): pine-a .. pine-d, pine-boss, ice-a .. */
export const trackIdOf = n => { const i = stageInfo(n); return `${i.theme}-${i.boss ? 'boss' : LETTERS[i.index - 1]}`; };

/** The track entry of league stage n, in the shape of config.minigames.alpineRush.tracks. */
export function leagueTrack(n) {
  const info = stageInfo(n); if (!info) throw new Error('alpine league: stage');
  const d = difficultyOf(n), f = FLAVOUR[info.theme], look = THEME_LOOKS[info.theme], c = CURVE;
  const at = ([a, b]) => lerp(a, b, d), pair = ([lo, hi]) => [r2(lerp(lo[0], hi[0], d)), r2(lerp(lo[1], hi[1], d))];
  const length = Math.round(at(c.length) * (info.boss ? c.bossLength : 1) / 10) * 10;
  // Side wind from the aurora night on (d >= wind.from), strongest on the peak.
  const windSpeed = d >= c.wind.from ? at(c.wind.speed) * f.wind : 0;
  const slalomGates = Math.min(5, Math.round(at(c.slalomGates) + (f.slalom > 1.25 ? 1 : 0))), slalomStep = r2(at(c.slalomStep));
  return {
    name: info.name, number: info.number, difficulty: Math.min(3, 1 + Math.floor(d * 3)), league: n, theme: info.theme, boss: info.boss,
    // A longer slalom section reaches further down: the last row stays clear of the finish by the extra gates' length.
    length, seed: 5101 + n * 977, calmStart: Math.round(lerp(150, 110, d)), finishRunout: Math.round(lerp(70, 60, d) + Math.max(0, slalomGates - 3) * slalomStep),
    rowSpacing: pair(c.rowSpacing), gap: pair(c.gap), reachFactor: r2(lerp(.75, .72, d)), corridorLimit: r2(lerp(4.2, 4.3, d)),
    ...(d >= c.narrowFrom ? {narrow: {chance: r2(Math.min(.5, at(c.narrowChance) * f.narrow)), gapScale: r2(at(c.narrowScale))}} : {}),
    rockPitch: r2(lerp(3.4, 3, d)), rockDensity: r2(Math.min(.95, at(c.rockDensity) * Math.sqrt(f.rocks))), rockRadius: pair(c.rockRadius),
    slalomOffset: r2(at(c.slalomOffset)), slalomStep, slalomGates,
    rampRockDistance: 7, landingClearance: Math.round(lerp(46, 50, d)),
    turns: {firstStraight: [Math.round(lerp(120, 90, d)), Math.round(lerp(150, 120, d))], radius: [Math.round(lerp(115, 72, d) / f.turns), Math.round(lerp(170, 118, d) / f.turns)],
      length: [Math.round(lerp(50, 60, d)), Math.round(lerp(95, 120, d))], straight: [Math.round(lerp(45, 30, d)), Math.round(lerp(90, 70, d))], transition: Math.round(lerp(18, 15, d)), alternate: r2(lerp(.7, .82, d))},
    grade: [r2(lerp(.1, .15, d)), r2(lerp(.17, .24, d))], wallCoins: r2(lerp(.45, .55, d)),
    ...(windSpeed > .2 ? {wind: {start: 170, end: 90, every: [Math.round(lerp(190, 110, d)), Math.round(lerp(270, 170, d))], length: [40, Math.round(lerp(60, 95, d))], speed: [r2(windSpeed * .6), r2(windSpeed)]}} : {}),
    visual: {environment: look.environment, theme: info.theme, ...look.visual},
    opening: d < .2 ? ['gate', 'pad', 'rocks'] : d < .6 ? ['gate', 'rocks'] : ['pad', 'ramp'],
    patterns: {rocks: r2(lerp(4, 3.4, d) * f.rocks), gate: r2(lerp(3, 1, d)), pad: r2(lerp(2, 2.6, d)), ramp: r2(lerp(1, 2, d) * f.ramps),
      rampRocks: r2(d < .1 ? 0 : lerp(.6, 2.2, d) * f.ramps), slalom: r2(lerp(.6, 1.6, d) * f.slalom)}
  };
}
/** The five rivals of stage n (rival-1 = ברק, the strongest). Within config.aiCaps: speed <= 1, reaction >= 0.12, lookahead <= 70. */
export function leagueAi(n, caps = {maxSpeed: 1, minReaction: .12, maxLookahead: 70}, strength = AI_STRENGTH[n - 1]) {
  const info = stageInfo(n), s = Math.max(0, Math.min(1, strength)), a = CURVE.ai, at = ([x, y]) => lerp(x, y, s);
  return RIVALS.map((_, i) => ({
    speed: Math.round(Math.min(caps.maxSpeed, at(a.speed) - i * at(a.spread) + (info.boss && i === 0 ? .005 : 0)) * 1000) / 1000,
    reaction: r2(Math.max(caps.minReaction, at(a.reaction) + i * .02)), lookahead: Math.round(Math.min(caps.maxLookahead, at(a.lookahead) - i * 2)),
    error: r2(at(a.error) + i * .05), mistakeRate: r2(at(a.mistake) + i * .008), margin: r2(Math.max(.05, at(a.margin) - i * .02)), boostChance: r2(at(a.boostChance) - i * .03), boostTank: r2(at(a.boostTank)),
    padDesire: r2(at(a.padDesire)), rampDesire: r2(at(a.rampDesire)), gateDesire: r2(at(a.gateDesire)), trickChance: r2(at(a.trickChance)), trickMargin: r2(at(a.trickMargin)), windComp: r2(at(a.windComp))
  }));
}
/** The level entry of stage n (config.minigames.alpineRush.levels shape). League runs pay no island money (winMoney 0). */
export function leagueLevel(n, caps) {
  const info = stageInfo(n);
  return {stage: info.number, trackId: trackIdOf(n), targetRank: info.targetRank, feature: info.name, winMoney: 0, winParts: 0, difficulty: Math.min(3, 1 + Math.floor(difficultyOf(n) * 3)), ai: leagueAi(n, caps)};
}

const balances = new WeakMap();
/** A balance in which game stage 3 + n is league stage n: the base levels and tracks stay first and untouched, the 30 league stages
 * follow, and the physics of stage n carry its speed scale. Cached per base object and stage (the result check and the session reuse it). */
export function leagueBalance(base, n) {
  if (!stageInfo(n)) throw new Error('alpine league: stage');
  let byStage = balances.get(base); if (!byStage) balances.set(base, byStage = new Map());
  if (byStage.has(n)) return byStage.get(n);
  const caps = base.aiCaps, levels = [...base.levels.slice(0, BASE_STAGES)], tracks = {...base.tracks};
  for (let k = 1; k <= STAGE_COUNT; k++) { const level = leagueLevel(k, caps); levels.push(level); tracks[level.trackId] = leagueTrack(k); }
  const speed = lerp(CURVE.speed[0], CURVE.speed[1], difficultyOf(n));
  const balance = {...base, levels, tracks, physics: {...base.physics, baseSpeed: r2(base.physics.baseSpeed * speed), boostSpeed: r2(base.physics.boostSpeed * speed)}, league: {n, speed: r2(speed)}};
  byStage.set(n, balance); return balance;
}
const facts = new WeakMap();
/** Course facts of stage n (generated once per base object): gates, coins and length. */
export function courseFacts(base, n) {
  let byStage = facts.get(base); if (!byStage) facts.set(base, byStage = new Map());
  if (!byStage.has(n)) {
    const balance = leagueBalance(base, n), level = balance.levels[engineStageOf(n) - 1], course = generateCourse({...balance.tracks[level.trackId], id: level.trackId}, balance.physics);
    byStage.set(n, Object.freeze({gates: course.objects.filter(o => o.type === 'gate').length, coins: course.coins, length: course.length, windZones: course.wind?.length || 0, trackId: level.trackId}));
  }
  return byStage.get(n);
}
/** The three goals of stage n: place (required), time, and gates or a clean run. Time = course length at the stage's reference pace. */
export function stageGoals(base, n) {
  const info = stageInfo(n), d = difficultyOf(n), f = courseFacts(base, n), b = leagueBalance(base, n);
  const pace = b.physics.baseSpeed * lerp(GOAL_PACE[0], GOAL_PACE[1], d);
  const goals = [{kind: 'place', target: info.targetRank}, {kind: 'time', ms: Math.ceil(f.length / pace * 2) * 500}];
  goals.push(info.goals[2] === 'gates' && f.gates > 0 ? {kind: 'gates', count: Math.max(1, Math.round(f.gates * lerp(CURVE.goals.gates[0], CURVE.goals.gates[1], d))), total: f.gates} : {kind: 'clean'});
  return goals;
}
/** Time goal pace as a share of the stage's base speed (boosts, pads and gates lift a run above 1): the child-like bot's median pace at
 * stage 1 and stage 30 (tools/alpine-league-sim.mjs, 48 races a stage), so about half of such runs earn the time star. */
export const GOAL_PACE = Object.freeze([1.19, 1.25]);
/** Checks a verified race against the goals: [{kind, ok, ...}] in the goal order. */
export function judgeGoals(goals, {completed, rank, elapsedMs, gates, crashes}) {
  return goals.map(g => ({...g, ok: g.kind === 'place' ? completed && rank <= g.target : g.kind === 'time' ? completed && elapsedMs <= g.ms : g.kind === 'gates' ? gates >= g.count : completed && crashes === 0}));
}
