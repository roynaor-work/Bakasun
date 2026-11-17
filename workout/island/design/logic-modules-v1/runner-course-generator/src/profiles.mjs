/** Versioned, dependency-free course rules. Distances are metres; times are seconds. */
export const API_VERSION = 1;
export const SEGMENT_LENGTH_M = 30;
export const MAX_SEGMENTS = 1_000_000;
export const MAX_BATCH_SEGMENTS = 1024;
export const EPOCH_SEGMENTS = 8;

export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export const LANES = freeze([
  { index: 0, xM: -3, widthM: 3 },
  { index: 1, xM: 0, widthM: 3 },
  { index: 2, xM: 3, widthM: 3 },
]);

// All difficulties reserve for the existing game's 31 m/s boost ceiling, not only nominal speed.
export const DIFFICULTIES = freeze({
  1: { id: 1, name: 'easy', nominalSpeedMps: 20, maxSpeedMps: 31, reactionSeconds: .4,
    laneSwitchSeconds: .36, maxLateralSpeedMps: 3 / .36, playerHalfWidthM: .35,
    playerHalfLengthM: .8, lateralClearanceM: .15, longitudinalClearanceM: .2,
    hazardStartM: 29, maxObstacleHalfWidthM: .85, pairChance: 0, sideChance: .2, turnChance: .45 },
  2: { id: 2, name: 'medium', nominalSpeedMps: 25, maxSpeedMps: 31, reactionSeconds: .35,
    laneSwitchSeconds: .36, maxLateralSpeedMps: 3 / .36, playerHalfWidthM: .35,
    playerHalfLengthM: .8, lateralClearanceM: .15, longitudinalClearanceM: .2,
    hazardStartM: 28, maxObstacleHalfWidthM: 1, pairChance: .65, sideChance: .5, turnChance: .7 },
  3: { id: 3, name: 'hard', nominalSpeedMps: 28, maxSpeedMps: 31, reactionSeconds: .3,
    laneSwitchSeconds: .36, maxLateralSpeedMps: 3 / .36, playerHalfWidthM: .35,
    playerHalfLengthM: .8, lateralClearanceM: .15, longitudinalClearanceM: .2,
    hazardStartM: 27, maxObstacleHalfWidthM: 1.15, pairChance: 1, sideChance: .8, turnChance: .9 },
});

/** Theme IDs match alpine-league-theme.mjs; gameplay effects here are explicit, not hidden physics. */
export const THEMES = freeze({
  pine: { id: 'pine', label: 'Pine forest', accent: '#3f8f5a', background: '#e3eee7',
    obstacleKinds: ['pine', 'rock'], patternWeights: [4, 3, 1, 2], turnScale: .9, sideScale: .8, bonusKind: 'star' },
  ice: { id: 'ice', label: 'Ice canyon', accent: '#2f9fd6', background: '#deeff8',
    obstacleKinds: ['ice-spire', 'ice-block'], patternWeights: [2, 1, 5, 2], turnScale: .8, sideScale: .6, bonusKind: 'shield' },
  lava: { id: 'lava', label: 'Lava slopes', accent: '#e2683c', background: '#f3e0dc',
    obstacleKinds: ['basalt', 'lava-rock'], patternWeights: [3, 5, 2, 1], turnScale: 1.1, sideScale: 1.2, bonusKind: 'energy' },
  aurora: { id: 'aurora', label: 'Aurora night', accent: '#36c49a', background: '#dfe8f0',
    obstacleKinds: ['moon-crystal', 'night-pine'], patternWeights: [2, 2, 2, 5], turnScale: .95, sideScale: .8, bonusKind: 'energy' },
  village: { id: 'village', label: 'Snow village', accent: '#c98a2b', background: '#f1eadb',
    obstacleKinds: ['snow-bank', 'crate'], patternWeights: [3, 2, 1, 5], turnScale: .85, sideScale: .7, bonusKind: 'star' },
  peak: { id: 'peak', label: 'High peak', accent: '#5f8fc7', background: '#e2ebf2',
    obstacleKinds: ['granite', 'snow-spire'], patternWeights: [3, 4, 4, 1], turnScale: 1.15, sideScale: 1.1, bonusKind: 'shield' },
});

export const PATTERNS = freeze(['gate', 'stagger', 'long', 'reward']);

export function plainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${name} must be a plain object`);
  }
}

export function integer(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError(`${name} must be a safe integer`);
  if (value < min || value > max) throw new RangeError(`${name} must be in ${min}..${max}`);
  return value;
}

export function configuration(options, allowed) {
  plainObject(options, 'options');
  for (const key of Object.keys(options)) if (!allowed.includes(key)) throw new TypeError(`Unknown option: ${key}`);
  const seed = options.seed;
  if (typeof seed === 'number') integer(seed, 'seed', 0, 0xffffffff);
  else if (typeof seed !== 'string' || seed.length < 1 || seed.length > 128 || !seed.trim()) {
    throw new TypeError('seed must be a nonblank string of 1..128 UTF-16 code units or an unsigned 32-bit integer');
  }
  const difficulty = options.difficulty === undefined ? 1 : integer(options.difficulty, 'difficulty', 1, 3);
  const theme = options.theme === undefined ? 'pine' : options.theme;
  if (typeof theme !== 'string' || !Object.hasOwn(THEMES, theme)) throw new TypeError('theme must be one of pine, ice, lava, aurora, village, peak');
  return { seed, difficulty, theme };
}

export const round = n => Math.round(n * 1_000_000) / 1_000_000;
