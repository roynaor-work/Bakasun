import {getRacingStage} from './racing-tracks.mjs?v=island-v2-20261107-8';

/** A league race has its own result path: it checks the same ordered-checkpoint run as racing-result.mjs (with the season's laps and clock),
 * plus the finishing order of the whole grid, and returns no island money and no stars. The regular race path is never touched. */
const IDS = ['player', 'ai-1', 'ai-2', 'ai-3', 'ai-4'];
export function racingLeagueResult(raw, ctx, balance) {
  const r = raw?.racing, league = ctx?.league, order = raw?.league?.order, fastest = raw?.league?.fastestLapId ?? null;
  if (!league || !r || typeof r !== 'object' || Array.isArray(r) || !Array.isArray(order)) return null;
  const fields = ['won', 'stars', 'rank', 'stage', 'seed', 'durationSeconds', 'laps', 'checkpoints', 'requiredCheckpoints', 'finished'];
  if (Object.keys(r).length !== fields.length || !fields.every(key => Object.hasOwn(r, key))) return null;
  if (order.length !== IDS.length || new Set(order).size !== IDS.length || !order.every(id => IDS.includes(id))) return null;
  if (fastest !== null && !IDS.includes(fastest)) return null;
  if (!Number.isInteger(r.stage) || r.stage !== ctx.level || r.stage !== league.stage) return null;
  const stage = { ...getRacingStage(r.stage), ...league.stageOverride }, required = stage.laps * 16;
  if (!Number.isInteger(r.seed) || r.seed < 0 || r.seed > 0xffffffff || r.seed !== (ctx.seed >>> 0)) return null;
  if (!Number.isInteger(r.rank) || r.rank < 1 || r.rank > IDS.length || r.finished !== true || order.indexOf('player') + 1 !== r.rank) return null;
  if (!Number.isFinite(r.durationSeconds) || r.durationSeconds <= 0 || r.durationSeconds > Math.min(balance.maximumSeconds, stage.timeLimit + .2)) return null;
  if (!Number.isInteger(r.laps) || r.laps < 0 || r.laps > stage.laps || !Number.isInteger(r.checkpoints) || r.checkpoints < 0 || r.checkpoints > required || r.requiredCheckpoints !== required) return null;
  if (r.laps !== Math.floor(r.checkpoints / 16)) return null;
  const complete = r.checkpoints === required && r.laps === stage.laps;
  const won = complete && r.rank <= stage.targetRank, stars = won ? Math.max(1, 4 - r.rank) : 0, score = complete ? stage.opponents + 2 - r.rank : 0;
  if (r.won !== won || r.stars !== stars || raw.outcome !== (won ? 'win' : 'lose') || raw.score !== score) return null;
  return { outcome: raw.outcome, score, stars: 0, money: 0, order: [...order], fastestLapId: fastest };
}
