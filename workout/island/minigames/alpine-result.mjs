import {alpineReward} from './alpine-engine.mjs?v=island-alpine-20261026-1';

/** Island reward contract for Alpine Rush. The settlement is recomputed from the
 * validated race summary; any field that disagrees rejects the whole result. */
const FIELDS = ['runId', 'rank', 'elapsedMs', 'peakKmh', 'reward', 'won', 'stars', 'score', 'completed', 'stage', 'trackId', 'seed', 'totalRiders', 'collisions'];

export function alpineResult(raw, ctx, balance) {
  const r = raw?.alpine;
  if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).length !== FIELDS.length || !FIELDS.every(key => Object.hasOwn(r, key))) return null;
  if (!Number.isInteger(r.stage) || r.stage !== ctx.level || r.stage < 1 || r.stage > balance.levels.length) return null;
  const level = balance.levels[r.stage - 1];
  if (r.trackId !== level.trackId || r.totalRiders !== balance.riders) return null;
  if (!Number.isInteger(r.seed) || r.seed !== (Number(ctx.seed) >>> 0)) return null;
  if (typeof r.runId !== 'string' || !/^alpine-[a-z-]+-\d+-\d+$/.test(r.runId) || !r.runId.startsWith(`alpine-${r.trackId}-${r.seed}-`)) return null;
  if (!Number.isInteger(r.rank) || r.rank < 1 || r.rank > balance.riders || typeof r.completed !== 'boolean') return null;
  if (!Number.isSafeInteger(r.elapsedMs) || r.elapsedMs <= 0 || r.elapsedMs > balance.maximumSeconds * 1000) return null;
  if (!Number.isInteger(r.peakKmh) || r.peakKmh < 0 || r.peakKmh > Math.ceil(balance.physics.boostSpeed * 3.6 * 1.2)) return null;
  if (!Number.isSafeInteger(r.collisions) || r.collisions < 0) return null;
  const settled = alpineReward(balance, r.stage, r.rank, r.completed);
  if (r.won !== settled.won || r.stars !== settled.stars || r.score !== settled.score || r.reward !== settled.money) return null;
  if (raw.outcome !== (settled.won ? 'win' : 'lose') || raw.score !== settled.score) return null;
  return {outcome: raw.outcome, score: settled.score, stars: settled.stars, money: settled.money};
}
