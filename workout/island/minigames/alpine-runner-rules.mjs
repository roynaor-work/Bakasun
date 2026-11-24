const STAGE_GOALS_M = Object.freeze([
  [150, 225, 300],
  [225, 325, 450],
  [300, 450, 600],
].map(Object.freeze));
const THEMES = ['pine', 'ice', 'lava', 'aurora', 'village', 'peak'];
const RESULT_KEYS = ['distance', 'elapsed', 'coins', 'score', 'theme', 'difficulty', 'crashed'];
const MAX_SPEED_MPS = 31;
const SEGMENT_LENGTH_M = 30;
// Two approach coins plus three generated rewards of at most 1, 1, and 3, doubled by the bonus.
const COINS_PER_SEGMENT = 14;
const MAX_REWARD_COINS = 30;

/** The three-lane runner plays the three ski stages. ?alpineRunnerPatch=0 (or the pack's own ?alpineRunner=0) brings the race back. */
export function alpineRunnerEnabled(search = globalThis.location?.search ?? '') {
  const params = new URLSearchParams(search);
  return params.get('alpineRunnerPatch') !== '0' && params.get('alpineRunner') !== '0';
}

/** The six theme packs of the runner (alpine-runner-themes.mjs). ?alpineThemes=0 keeps the base tiles and sky. */
export function alpineThemesEnabled(search = globalThis.location?.search ?? '') {
  return new URLSearchParams(search).get('alpineThemes') !== '0';
}

export function alpineRunnerScore(distance, coins) {
  return Math.floor(distance) + 5 * coins;
}

export function alpineRunnerGoals(difficulty) {
  return STAGE_GOALS_M[difficulty - 1];
}

export function alpineRunnerProgress(distance, difficulty) {
  const goals = alpineRunnerGoals(difficulty) ?? [];
  const stars = goals.filter(goal => distance >= goal).length;
  return {outcome: stars ? 'win' : 'lose', stars};
}

/** Distances are whole meters and elapsed time is milliseconds in the island result. */
export function alpineRunnerResult(raw, ctx, balance) {
  const run = raw?.runner;
  if (!run || typeof run !== 'object' || Array.isArray(run) || Object.keys(run).length !== RESULT_KEYS.length || !RESULT_KEYS.every(key => Object.hasOwn(run, key))) return null;
  const {distance, elapsed, coins, score, theme, difficulty, crashed} = run;
  if (!Number.isInteger(difficulty) || difficulty !== ctx.level || !alpineRunnerGoals(difficulty) || !THEMES.includes(theme) || crashed !== true) return null;
  if (!Number.isSafeInteger(elapsed) || elapsed <= 0 || !Number.isSafeInteger(distance) || distance < 0 || distance > Math.ceil(elapsed * (MAX_SPEED_MPS / 1000))) return null;
  // Allow the segment immediately ahead for pickups pulled forward by a bonus.
  const maxCoins = (Math.floor(distance / SEGMENT_LENGTH_M) + 2) * COINS_PER_SEGMENT;
  if (!Number.isSafeInteger(coins) || coins < 0 || coins > maxCoins || !Number.isSafeInteger(score) || score !== alpineRunnerScore(distance, coins) || raw.score !== score) return null;
  const {outcome, stars} = alpineRunnerProgress(distance, difficulty);
  const level = balance.levels[difficulty - 1];
  if (!level || raw.outcome !== outcome) return null;
  const money = Math.min(coins, MAX_REWARD_COINS) + (stars ? level.winMoney : 0);
  return {outcome, stars, score, money};
}
