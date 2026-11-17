/** Alpine Rush: the alpine-v7 rider (assets/alpine-v7, GPT/Codex package of 05/11) as an upgrade over skier3.
 * Pure helpers only (no three.js), so node tests can run them; the loader lives in alpine-character.mjs.
 *
 * The point of v7 is performance through LOD: one rider is 19.9K / 9.9K / 4.1K triangles (LOD0 / LOD1 / LOD2) against
 * the 24.9K of skier3. The player is always near the camera and gets the best level the quality tier allows; rivals are
 * capped lower and drop to LOD2 by distance. A level nobody needs is never downloaded.
 * v7 is an upgrade, never a requirement: any load failure keeps skier3 (and then the older skier). */
export const V7_FILES = Object.freeze({0: 'ski-male.glb', 1: 'ski-male-lod1.glb', 2: 'ski-male-lod2.glb'});
/** Triangles per rider by level (ski-male, from the package's asset audit; used for metrics, never for decisions). */
export const V7_TRIANGLES = Object.freeze({0: 19916, 1: 9890, 2: 4129});
/** Clips the game graph needs, as named inside the v7 GLBs (the v7 set has 14; the rest are not used by the engine). */
export const V7_CLIPS = Object.freeze({glide: 'glide', crouch: 'crouch', boost: 'accelerate', fall: 'fall_roll', getUp: 'get_up', celebrate: 'celebrate'});
export const V7_DEFAULTS = Object.freeze({
  enabled: true, base: 'assets/alpine-v7/characters/',
  // level by role and tier; rivals beyond `farDistance` metres from the camera use LOD2 whatever the tier says
  lod: Object.freeze({player: Object.freeze({high: 0, low: 1}), rival: Object.freeze({high: 1, low: 2}), farDistance: 22, hysteresis: 2}),
  // skier3 stands 1.296 m in the asset and the game scales it 1.125; v7 stands 1.291 m, so the same factor keeps the course proportions
  // (the package manifest suggests 1.35, an adult 1.74 m, which would be 20% taller than the rider the camera and lanes were tuned for)
  scale: 1.125,
  // v7 clips are authored as a showcase (fall 4 s, get-up 3.8 s) but the engine recovers in about a second: fall, get-up
  // and boost fit the skier3 durations, which the state graph was timed for
  clipSeconds: Object.freeze({fall: 1.1, getUp: 1.9, boost: 1.2})
});

/** ?alpineV7=0 forces the earlier skier (before/after captures), ?alpineV7=1 forces v7 even when the config switch is off. */
export function v7Enabled(cfg, params) {
  const q = params?.get?.('alpineV7');
  if (q === '0') return false;
  if (!cfg) return false;
  if (q === '1') return true;
  return cfg.enabled !== false;
}
/** Config merged over the defaults (a partial or missing `assets.v7` block still works). */
export function v7Config(cfg) {
  const lod = {...V7_DEFAULTS.lod, ...cfg?.lod, player: {...V7_DEFAULTS.lod.player, ...cfg?.lod?.player}, rival: {...V7_DEFAULTS.lod.rival, ...cfg?.lod?.rival}};
  return {...V7_DEFAULTS, ...cfg, lod};
}
const tierOf = quality => quality === 'low' ? 'low' : 'high';
const clampLevel = level => Math.max(0, Math.min(2, Math.round(level)));

/** The level a rider should show, before availability. `current` (the level shown now) adds hysteresis at the distance
 * switch so a rival hovering around the boundary does not flicker. */
export function wantedLod({role, quality, distance = 0, current = null, config = V7_DEFAULTS}) {
  const lod = config.lod ?? V7_DEFAULTS.lod, tier = tierOf(quality);
  const base = clampLevel(lod[role === 'player' ? 'player' : 'rival'][tier]);
  if (role === 'player') return base;
  const far = lod.farDistance ?? 22, margin = lod.hysteresis ?? 2;
  const edge = current === 2 ? far - margin : far;
  return distance > edge ? 2 : base;
}
/** The best loaded level for a wanted one: the nearest loaded level at the wanted detail or coarser, else the finest below. */
export function pickAvailable(wanted, loaded) {
  const has = [...loaded].sort((a, b) => a - b);
  if (!has.length) return null;
  for (const level of has) if (level >= wanted) return level;
  return has[has.length - 1];
}
/** Levels a session of this tier needs at once (`now`, awaited before the race) and the one it may need later (`later`,
 * fetched only when some rider asks for it). Tier high: player LOD0, rivals LOD1, LOD2 on demand. Low: LOD1 and LOD2. */
export function lodPlan(quality, config = V7_DEFAULTS) {
  const lod = config.lod ?? V7_DEFAULTS.lod, tier = tierOf(quality);
  const player = clampLevel(lod.player[tier]), rival = clampLevel(lod.rival[tier]);
  const now = [...new Set([player, rival])].sort((a, b) => a - b);
  const later = [0, 1, 2].filter(level => !now.includes(level) && level >= Math.min(player, rival));
  return {player, rival, now, later};
}
/** Whether rider `role` can ever use `level` at this tier (a level that fails this is never worth fetching). */
export function levelUseful(level, role, quality, config = V7_DEFAULTS) {
  const lod = config.lod ?? V7_DEFAULTS.lod, tier = tierOf(quality);
  if (role === 'player') return level === clampLevel(lod.player[tier]);
  const base = clampLevel(lod.rival[tier]);
  return level === base || level === 2 && lod.farDistance != null;
}
/** Path of a level's GLB relative to the island root (the loader resolves it against its own module URL). */
export function v7Path(level, config = V7_DEFAULTS) { return config.base + V7_FILES[clampLevel(level)]; }
