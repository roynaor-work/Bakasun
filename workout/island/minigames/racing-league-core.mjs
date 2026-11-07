/** Island racing league, pure core: seasons, points, fixed drivers, car upgrades paid in league coins, validation and merge for the island save.
 * No imports and no track data, so the engine and the save code can load it at boot without cost. Plain-object state, no DOM, no storage.
 * `?racingLeague=0` turns the league off everywhere (leagueEnabled). The race-setup part that needs the track list lives in racing-league.mjs. */

export const POINTS = Object.freeze([25, 18, 15, 12, 10]);
export const FASTEST_LAP_POINT = 1;
/** Fixed rivals: rating multiplies the stage AI speed; style is used for flavour text only. Same four names as the existing grid. */
export const DRIVERS = Object.freeze([
  Object.freeze({ id: 'almog', name: 'אלמוג', rating: 1.01, style: 'יציב' }),
  Object.freeze({ id: 'turkiz', name: 'טורקיז', rating: 1.03, style: 'תוקפני' }),
  Object.freeze({ id: 'shemesh', name: 'שמש', rating: 1.05, style: 'מהיר בפינות' }),
  Object.freeze({ id: 'barkat', name: 'ברקת', rating: 1.07, style: 'אלוף העונה' })
]);
/** Season k uses the circuits of stage tiers 0, 2 and 4 (laps 4, 5, 5 on the longer racing-v10 circuits: about 3.5 to 4.5 minutes a race). */
// racing-look-v1: the circuits now force braking (laps about 8% slower), so a season is 3, 4, 4 laps to stay under the 295 s race cap (?racingLook=0: 4, 5, 5).
const LOOK = new URLSearchParams(globalThis.location?.search || '').get('racingLook') !== '0';
// ?racingTracks=v2 (Codex circuits, 70-90 s laps): 2, 3, 3 laps
const V2 = new URLSearchParams(globalThis.location?.search || '').get('racingTracks') === 'v2';
export const SEASONS = Object.freeze([
  Object.freeze({ id: 1, name: 'עונת הפתיחה', tier: 0, laps: V2 ? 2 : LOOK ? 4 : 5, minRank: 0, rating: 0.02 }),
  Object.freeze({ id: 2, name: 'ליגת הכסף', tier: 2, laps: V2 ? 3 : LOOK ? 5 : 6, minRank: 3, rating: 0.045 }),
  Object.freeze({ id: 3, name: 'ליגת הזהב', tier: 4, laps: V2 ? 3 : LOOK ? 5 : 6, minRank: 3, rating: 0.045 })
]);
export const UPGRADES = Object.freeze({
  engine: { name: 'מנוע', perLevel: 0.03, key: 'engine', cap: 1.16 },
  tires: { name: 'צמיגים', perLevel: 0.03, key: 'grip', cap: 1.16 },
  steering: { name: 'היגוי', perLevel: 0.02, key: 'steer', cap: 1.12 },
  brakes: { name: 'בלמים', perLevel: 0.05, key: 'brakes', cap: 1.3 },
  aero: { name: 'אירו', perLevel: 0.04, key: 'aero', cap: 1.25 }
});
export const MAX_LEVEL = 5;
export const HISTORY_CAP = 36;
export const UPGRADE_COST = Object.freeze([100, 180, 280, 420, 600]);
/** League coins for a finish: 1st..5th, plus a bonus for the fastest lap. Kept separate from island money. */
export const PRIZE = Object.freeze([220, 160, 120, 90, 70]);
export const FASTEST_LAP_COINS = 40;

export function createLeague() {
  return { version: 1, season: 1, race: 0, coins: 0, upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])),
    table: Object.fromEntries(['player', ...DRIVERS.map(d => d.id)].map(id => [id, 0])), history: [], champion: {}, seasonRank: {} };
}
export const RACES_PER_SEASON = 6;
/** Stage ids of a season: tier k holds stages 6k+1 .. 6k+6 (the same list racing-tracks.mjs builds). */
export function seasonStages(seasonId) {
  const season = SEASONS[seasonId - 1]; if (!season) return [];
  return Array.from({ length: RACES_PER_SEASON }, (_, i) => season.tier * RACES_PER_SEASON + i + 1);
}
export const leagueEnabled = (search = globalThis.location?.search || '') => new URLSearchParams(search).get('racingLeague') !== '0';
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
  state.coins += coins; state.history.push({ season: state.season, race: state.race, place, points: gained.player, coins }); if (state.history.length > HISTORY_CAP) state.history.splice(0, state.history.length - HISTORY_CAP);
  state.race++;
  const done = state.race >= RACES_PER_SEASON;
  if (done) {
    const standings = Object.entries(state.table).sort((a, b) => b[1] - a[1]), rank = standings.findIndex(([id]) => id === 'player') + 1;
    state.seasonRank[state.season] = rank; state.champion[state.season] = standings[0][0];
  }
  return { place, points: gained.player, coins, seasonDone: done };
}
export function nextSeason(state) {
  const done = state.race >= RACES_PER_SEASON; if (!done) return { ok: false, reason: 'not finished' };
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

const ids = ['player', ...DRIVERS.map(d => d.id)];
const int = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
/** Strict shape check for the island save. Anything outside the league's own rules is rejected, so a damaged save fails loudly. */
export function validLeague(l) {
  if (!plain(l) || l.version !== 1 || !int(l.season, 1, SEASONS.length) || !int(l.race, 0, RACES_PER_SEASON) || !int(l.coins, 0, 1e9)) return false;
  if (!plain(l.upgrades) || Object.keys(l.upgrades).length !== Object.keys(UPGRADES).length || !Object.keys(UPGRADES).every(k => int(l.upgrades[k], 0, MAX_LEVEL))) return false;
  if (!plain(l.table) || Object.keys(l.table).length !== ids.length || !ids.every(id => int(l.table[id], 0, 1e6))) return false;
  if (!Array.isArray(l.history) || l.history.length > HISTORY_CAP) return false;
  if (!l.history.every(h => plain(h) && int(h.season, 1, SEASONS.length) && int(h.race, 0, RACES_PER_SEASON - 1) && int(h.place, 1, ids.length) && int(h.points, 0, 100) && int(h.coins, 0, 1e6))) return false;
  if (!plain(l.champion) || !Object.entries(l.champion).every(([s, id]) => int(Number(s), 1, SEASONS.length) && ids.includes(id))) return false;
  return plain(l.seasonRank) && Object.entries(l.seasonRank).every(([s, r]) => int(Number(s), 1, SEASONS.length) && int(r, 1, ids.length));
}
/** Backup import never lowers progress: the league that is further along wins, coins and upgrades take the larger value. */
export function mergeLeague(current, incoming) {
  const at = l => l.season * 10 + l.race, base = at(incoming) > at(current) ? incoming : current, out = JSON.parse(JSON.stringify(base));
  out.coins = Math.max(current.coins, incoming.coins);
  for (const k of Object.keys(UPGRADES)) out.upgrades[k] = Math.max(current.upgrades[k], incoming.upgrades[k]);
  for (const [s, id] of Object.entries({ ...incoming.champion, ...current.champion })) out.champion[s] ??= id;
  for (const [s, r] of Object.entries({ ...incoming.seasonRank, ...current.seasonRank })) out.seasonRank[s] ??= r;
  return out;
}
/** Everything a screen needs in one read: where the season stands, who leads, what the next season asks for. */
export function leagueSummary(state) {
  const season = SEASONS[state.season - 1], done = state.race >= RACES_PER_SEASON, table = standings(state), place = table.findIndex(r => r.id === 'player') + 1;
  const next = SEASONS[state.season], gate = next ? { name: next.name, minRank: next.minRank, ok: !done || state.seasonRank[state.season] <= next.minRank } : null;
  return { season, seasonId: state.season, race: state.race, total: RACES_PER_SEASON, done, table, place, leader: table[0], coins: state.coins, gate,
    points: state.table.player, career: state.history.reduce((n, h) => n + h.points, 0), finalSeason: !next };
}
