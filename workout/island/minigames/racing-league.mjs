/** Island racing league (racing-v9, option B chosen by Roy): seasons, points, fixed drivers, unlocks and car upgrades paid in league coins.
 * Pure logic with a plain-object state: no DOM, no storage, so it is simulated and tested without a browser. Not wired to the island save or
 * screens yet (see verification/racing-v9/REPORT.md). Disabled unless a screen asks for it (`?racingLeague=0` is reserved as the off flag). */
import {RACING_STAGES} from './racing-tracks.mjs';

export const POINTS = Object.freeze([25, 18, 15, 12, 10]);
export const FASTEST_LAP_POINT = 1;
/** Fixed rivals: rating multiplies the stage AI speed; style is used for flavour text only. Same four names as the existing grid. */
export const DRIVERS = Object.freeze([
  Object.freeze({ id: 'almog', name: 'אלמוג', rating: 1.01, style: 'יציב' }),
  Object.freeze({ id: 'turkiz', name: 'טורקיז', rating: 1.03, style: 'תוקפני' }),
  Object.freeze({ id: 'shemesh', name: 'שמש', rating: 1.05, style: 'מהיר בפינות' }),
  Object.freeze({ id: 'barkat', name: 'ברקת', rating: 1.07, style: 'אלוף העונה' })
]);
/** Season k uses the circuits of stage tiers 0, 2 and 4, more laps each (a race of about 2.5 to 3.5 minutes). */
export const SEASONS = Object.freeze([
  Object.freeze({ id: 1, name: 'עונת הפתיחה', tier: 0, laps: 5, minRank: 0, rating: 0 }),
  Object.freeze({ id: 2, name: 'ליגת הכסף', tier: 2, laps: 6, minRank: 3, rating: 0.025 }),
  Object.freeze({ id: 3, name: 'ליגת הזהב', tier: 4, laps: 7, minRank: 3, rating: 0.01 })
]);
export const UPGRADES = Object.freeze({
  engine: { name: 'מנוע', perLevel: 0.03, key: 'engine', cap: 1.16 },
  tires: { name: 'צמיגים', perLevel: 0.03, key: 'grip', cap: 1.16 },
  steering: { name: 'היגוי', perLevel: 0.02, key: 'steer', cap: 1.12 },
  brakes: { name: 'בלמים', perLevel: 0.05, key: 'brakes', cap: 1.3 },
  aero: { name: 'אירו', perLevel: 0.04, key: 'aero', cap: 1.25 }
});
export const MAX_LEVEL = 5;
export const UPGRADE_COST = Object.freeze([100, 180, 280, 420, 600]);
/** League coins for a finish: 1st..5th, plus a bonus for the fastest lap. Kept separate from island money. */
export const PRIZE = Object.freeze([220, 160, 120, 90, 70]);
export const FASTEST_LAP_COINS = 40;

export function createLeague() {
  return { version: 1, season: 1, race: 0, coins: 0, upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])),
    table: Object.fromEntries(['player', ...DRIVERS.map(d => d.id)].map(id => [id, 0])), history: [], champion: {}, seasonRank: {} };
}
export function seasonStages(seasonId) {
  const season = SEASONS[seasonId - 1]; if (!season) return [];
  return RACING_STAGES.filter(s => s.tier === season.tier).map(s => s.id);
}
export function raceSetup(state) {
  const season = SEASONS[state.season - 1], stages = seasonStages(state.season), stageId = stages[state.race];
  if (!season || stageId === undefined) return null;
  const base = RACING_STAGES[stageId - 1], laps = season.laps;
  // drivers get the season's name and rating, equipment follows the player's upgrades
  return { stage: stageId, laps, equipment: equipmentFor(state.upgrades), drivers: DRIVERS.map(d => ({ name: d.name, rating: d.rating + season.rating })),
    stageOverride: { laps, timeLimit: Math.ceil(base.timeLimit / base.laps * laps * 1.0) } };
}
export function equipmentFor(upgrades) {
  const out = {};
  for (const [name, spec] of Object.entries(UPGRADES)) out[spec.key] = Math.min(spec.cap, 1 + spec.perLevel * (upgrades?.[name] || 0));
  return out;
}
export function upgradeCost(level) { return level >= MAX_LEVEL ? Infinity : UPGRADE_COST[level]; }
export function buyUpgrade(state, name) {
  if (!UPGRADES[name]) return { ok: false, reason: 'unknown' };
  const level = state.upgrades[name], cost = upgradeCost(level);
  if (level >= MAX_LEVEL) return { ok: false, reason: 'max' };
  if (state.coins < cost) return { ok: false, reason: 'coins', need: cost - state.coins };
  state.coins -= cost; state.upgrades[name] = level + 1; return { ok: true, cost, level: level + 1 };
}
/** order: car ids from first to last place as the race model reports them ('player', 'ai-1'..). fastestLapId optional. */
export function applyRace(state, { order, fastestLapId = null }) {
  const ids = order.map(id => id === 'player' ? 'player' : DRIVERS[Number(String(id).replace('ai-', '')) - 1]?.id);
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('invalid finishing order');
  const gained = {};
  ids.forEach((id, index) => { const points = (POINTS[index] || 0) + (fastestLapId && fastestLapId === order[index] ? FASTEST_LAP_POINT : 0); state.table[id] += points; gained[id] = points; });
  const place = ids.indexOf('player') + 1, coins = (PRIZE[place - 1] || 0) + (fastestLapId === 'player' ? FASTEST_LAP_COINS : 0);
  state.coins += coins; state.history.push({ season: state.season, race: state.race, place, points: gained.player, coins });
  state.race++;
  const done = state.race >= seasonStages(state.season).length;
  if (done) {
    const standings = Object.entries(state.table).sort((a, b) => b[1] - a[1]), rank = standings.findIndex(([id]) => id === 'player') + 1;
    state.seasonRank[state.season] = rank; state.champion[state.season] = standings[0][0];
  }
  return { place, points: gained.player, coins, seasonDone: done };
}
export function nextSeason(state) {
  const done = state.race >= seasonStages(state.season).length; if (!done) return { ok: false, reason: 'not finished' };
  const next = SEASONS[state.season]; if (!next) return { ok: false, reason: 'last season' };
  if (state.seasonRank[state.season] > next.minRank) return { ok: false, reason: 'rank', need: next.minRank };
  state.season++; state.race = 0; for (const id of Object.keys(state.table)) state.table[id] = 0; return { ok: true, season: state.season };
}
export function isRaceUnlocked(state, season, race) {
  if (season < state.season) return false;       // finished seasons are replayed from the history, not re-raced
  if (season > state.season) return false;
  return race <= state.race;
}
export function standings(state) {
  return Object.entries(state.table).map(([id, points]) => ({ id, name: id === 'player' ? 'אתם' : DRIVERS.find(d => d.id === id).name, points })).sort((a, b) => b.points - a.points);
}
