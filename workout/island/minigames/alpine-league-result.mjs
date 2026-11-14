import {alpineResult} from './alpine-result.mjs?v=island-v2-20261107-12';
import {RIDER_IDS} from './alpine-engine.mjs?v=island-v2-20261107-12';
import {stageInfo,engineStageOf,starsFor} from './alpine-league-core.mjs?v=island-v2-20261107-12';
import {leagueBalance,stageGoals,judgeGoals,courseFacts} from './alpine-league-stages.mjs?v=island-v2-20261107-12';

/** Ski league v23 result path. A league run reports the same strict race summary as a regular run (raw.alpine, checked by
 * alpine-result.mjs against the league stage: track, seed, run id, coins on the course, time, speed, reward fields), plus raw.league:
 * {order: the six engine rider ids first to last, gates: gates the player went through}. The goals and stars are recomputed here from the
 * verified numbers, never taken from the session. Returns null for anything that does not add up. No island money, stars or stage progress. */
export function alpineLeagueResult(raw, ctx, base) {
  const setup = ctx?.alpineLeague, n = setup?.n;
  if (!setup || !stageInfo(n) || ctx.level !== engineStageOf(n)) return null;
  const settled = alpineResult(raw, ctx, leagueBalance(base, n)); if (!settled) return null;
  const r = raw.alpine, l = raw.league;
  if (!l || typeof l !== 'object' || Array.isArray(l) || Object.keys(l).length !== 2 || !Array.isArray(l.order) || !Number.isSafeInteger(l.gates)) return null;
  if (l.order.length !== RIDER_IDS.length || new Set(l.order).size !== RIDER_IDS.length || !l.order.every(id => RIDER_IDS.includes(id)) || l.order.indexOf('player') + 1 !== r.rank) return null;
  const facts = courseFacts(base, n); if (l.gates < 0 || l.gates > facts.gates) return null;
  const goals = judgeGoals(stageGoals(base, n), {completed: r.completed, rank: r.rank, elapsedMs: r.elapsedMs, gates: l.gates, crashes: r.crashes});
  return {n, passed: goals[0].ok, stars: starsFor(goals), goals, place: r.rank, ms: r.elapsedMs, completed: r.completed, coins: r.coins, crashes: r.crashes,
    gates: l.gates, gatesTotal: facts.gates, order: [...l.order], score: settled.score, outcome: settled.outcome, trackId: r.trackId, runId: r.runId};
}
