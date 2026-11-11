/** Alpine Rush league, pure core (v12, phase 1): seasons of six rounds, points by place with a par-time bonus, fixed named rivals with
 * a season rivalry, league coins, ski upgrades (wax and boost tank, the two equipment values the engine already reads), strict validation
 * and a progress-keeping merge. No imports, no DOM, no storage, same shape as racing-league-core.mjs, so the save code can load it at boot.
 * `?alpineLeague=0` turns the league off (leagueEnabled). Screens, the save slot and the result path are phase 2 (see REPORT.md). */

export const POINTS = Object.freeze([10, 8, 6, 4, 2, 1]);
export const PAR_BONUS_POINTS = 1;
export const PRIZE = Object.freeze([120, 90, 70, 50, 35, 25]);
export const PAR_BONUS_COINS = 30;
export const ROUNDS_PER_SEASON = 6;
export const HISTORY_CAP = 54;
export const MAX_LEVEL = 5;
export const UPGRADE_COST = Object.freeze([80, 140, 220, 320, 450]);
/** Fixed rivals. `rating` multiplies the stage AI speed (never above the engine's 1.0 cap on its own: the season adds a little). */
export const DRIVERS = Object.freeze([
  Object.freeze({ id: 'barak', name: 'ברק', rating: 1.0, style: 'אלוף העונה, מהיר בישורת' }),
  Object.freeze({ id: 'yam', name: 'ים', rating: 0.985, style: 'מלך הקפיצות' }),
  Object.freeze({ id: 'gal', name: 'גל', rating: 0.97, style: 'יציב בסלאלום' }),
  Object.freeze({ id: 'anbar', name: 'ענבר', rating: 0.955, style: 'מתחילה מהר' }),
  Object.freeze({ id: 'ori', name: 'אורי', rating: 0.94, style: 'מנסה הכול' })
]);
export const RIVAL_IDS = Object.freeze(DRIVERS.map(d => d.id));
/** Season k: a mountain tier. `stages` are the engine stages used by its six rounds, `rating` is added to every rival, `par` scales the par time. */
export const SEASONS = Object.freeze([
  Object.freeze({ id: 1, name: 'עונת החורף', stages: [1, 1, 1, 2, 2, 2], rating: 0, minRank: 0, rival: 'ori' }),
  Object.freeze({ id: 2, name: 'ליגת ההר', stages: [2, 2, 2, 3, 3, 3], rating: 0.02, minRank: 4, rival: 'gal' }),
  Object.freeze({ id: 3, name: 'אליפות הפסגה', stages: [3, 3, 3, 3, 3, 3], rating: 0.04, minRank: 4, rival: 'barak' })
]);
export const DISCIPLINES = Object.freeze(['free', 'slalom', 'jumps', 'cross', 'duel', 'final']);
export const UPGRADES = Object.freeze({
  skis: { name: 'מגלשיים', key: 'wax', perLevel: 0.01, cap: 1.05 },
  boost: { name: 'מיכל האצה', key: 'tank', perLevel: 0.1, cap: 1.5 }
});
/** Par time of a stage in ms: the clean-run pace. Beating it earns the time bonus. Values come from the season simulation. */
export const PAR_MS = Object.freeze({ 1: 84000, 2: 91000, 3: 98000 });

export const leagueEnabled = (search = globalThis.location?.search || '') => new URLSearchParams(search).get('alpineLeague') !== '0';
const IDS = ['player', ...RIVAL_IDS];

export function createLeague() {
  return { version: 1, season: 1, round: 0, coins: 0, upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])),
    table: Object.fromEntries(IDS.map(id => [id, 0])), history: [], champion: {}, seasonRank: {}, cups: 0 };
}
export const roundSetup = state => {
  const season = SEASONS[state.season - 1], stage = season?.stages[state.round];
  if (!stage) return null;
  return { season: season.id, round: state.round, discipline: DISCIPLINES[state.round], stage, parMs: PAR_MS[stage], rivalId: season.rival, rating: season.rating,
    equipment: equipmentFor(state.upgrades), drivers: DRIVERS.map(d => ({ id: d.id, name: d.name, rating: d.rating + season.rating })) };
};
export function equipmentFor(upgrades) {
  const out = {};
  for (const [name, spec] of Object.entries(UPGRADES)) out[spec.key] = Math.min(spec.cap, 1 + spec.perLevel * (upgrades?.[name] || 0));
  return out;
}
export const upgradeCost = level => level >= MAX_LEVEL ? Infinity : UPGRADE_COST[level];
export function buyUpgrade(state, name) {
  if (!UPGRADES[name]) return { ok: false, reason: 'unknown' };
  const level = state.upgrades[name], cost = upgradeCost(level);
  if (level >= MAX_LEVEL) return { ok: false, reason: 'max' };
  if (state.coins < cost) return { ok: false, reason: 'coins', need: cost - state.coins };
  state.coins -= cost; state.upgrades[name] = level + 1; return { ok: true, cost, level: level + 1 };
}
/** order: rider ids first to last ('player', 'rival-1'..'rival-5' as the engine names them). elapsedMs: the player's time. */
export function applyRound(state, { order, elapsedMs = 0 }) {
  const ids = order.map(id => id === 'player' ? 'player' : DRIVERS[Number(String(id).replace('rival-', '')) - 1]?.id);
  if (ids.length !== IDS.length || ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('invalid finishing order');
  const setup = roundSetup(state); if (!setup) throw new Error('season finished');
  const place = ids.indexOf('player') + 1, par = elapsedMs > 0 && elapsedMs <= setup.parMs;
  const gained = {}; ids.forEach((id, i) => { gained[id] = (POINTS[i] || 0) + (id === 'player' && par ? PAR_BONUS_POINTS : 0); state.table[id] += gained[id]; });
  const coins = (PRIZE[place - 1] || 0) + (par ? PAR_BONUS_COINS : 0);
  state.coins += coins; state.history.push({ season: state.season, round: state.round, place, points: gained.player, coins }); if (state.history.length > HISTORY_CAP) state.history.splice(0, state.history.length - HISTORY_CAP);
  state.round++;
  const done = state.round >= ROUNDS_PER_SEASON;
  if (done) {
    const table = Object.entries(state.table).sort((a, b) => b[1] - a[1]), rank = table.findIndex(([id]) => id === 'player') + 1;
    state.seasonRank[state.season] = rank; state.champion[state.season] = table[0][0]; if (rank === 1) state.cups++;
  }
  return { place, points: gained.player, coins, par, seasonDone: done };
}
export function nextSeason(state) {
  if (state.round < ROUNDS_PER_SEASON) return { ok: false, reason: 'not finished' };
  const next = SEASONS[state.season]; if (!next) return { ok: false, reason: 'last season' };
  if (state.seasonRank[state.season] > next.minRank) return { ok: false, reason: 'rank', need: next.minRank };
  state.season++; state.round = 0; for (const id of IDS) state.table[id] = 0; return { ok: true, season: state.season };
}
export function standings(state) {
  return Object.entries(state.table).map(([id, points]) => ({ id, name: id === 'player' ? 'אתם' : DRIVERS.find(d => d.id === id).name, points })).sort((a, b) => b.points - a.points || (a.id === 'player' ? -1 : 1));
}
const int = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
/** Strict shape check for the island save. Anything outside the league's rules is rejected. */
export function validLeague(l) {
  if (!plain(l) || l.version !== 1 || !int(l.season, 1, SEASONS.length) || !int(l.round, 0, ROUNDS_PER_SEASON) || !int(l.coins, 0, 1e9) || !int(l.cups, 0, 99)) return false;
  if (!plain(l.upgrades) || Object.keys(l.upgrades).length !== Object.keys(UPGRADES).length || !Object.keys(UPGRADES).every(k => int(l.upgrades[k], 0, MAX_LEVEL))) return false;
  if (!plain(l.table) || Object.keys(l.table).length !== IDS.length || !IDS.every(id => int(l.table[id], 0, 1e6))) return false;
  if (!Array.isArray(l.history) || l.history.length > HISTORY_CAP) return false;
  if (!l.history.every(h => plain(h) && int(h.season, 1, SEASONS.length) && int(h.round, 0, ROUNDS_PER_SEASON - 1) && int(h.place, 1, IDS.length) && int(h.points, 0, 100) && int(h.coins, 0, 1e6))) return false;
  if (!plain(l.champion) || !Object.entries(l.champion).every(([s, id]) => int(Number(s), 1, SEASONS.length) && IDS.includes(id))) return false;
  return plain(l.seasonRank) && Object.entries(l.seasonRank).every(([s, r]) => int(Number(s), 1, SEASONS.length) && int(r, 1, IDS.length));
}
/** Backup import never lowers progress: the league further along wins; coins, cups and upgrades take the larger value. */
export function mergeLeague(current, incoming) {
  const at = l => l.season * 10 + l.round, base = at(incoming) > at(current) ? incoming : current, out = JSON.parse(JSON.stringify(base));
  out.coins = Math.max(current.coins, incoming.coins); out.cups = Math.max(current.cups, incoming.cups);
  for (const k of Object.keys(UPGRADES)) out.upgrades[k] = Math.max(current.upgrades[k], incoming.upgrades[k]);
  for (const [s, id] of Object.entries({ ...incoming.champion, ...current.champion })) out.champion[s] ??= id;
  for (const [s, r] of Object.entries({ ...incoming.seasonRank, ...current.seasonRank })) out.seasonRank[s] ??= r;
  return out;
}
/** Everything a season screen needs in one read, for a seven-year-old: where I am, who leads, the rival, what comes next. */
export function leagueSummary(state) {
  const season = SEASONS[state.season - 1], done = state.round >= ROUNDS_PER_SEASON, table = standings(state), place = table.findIndex(r => r.id === 'player') + 1;
  const next = SEASONS[state.season], rival = DRIVERS.find(d => d.id === season.rival);
  return { season, seasonId: state.season, round: state.round, total: ROUNDS_PER_SEASON, done, table, place, leader: table[0], coins: state.coins, cups: state.cups,
    rival: { id: rival.id, name: rival.name, points: state.table[rival.id], ahead: state.table[rival.id] > state.table.player },
    podium: done ? table.slice(0, 3) : null, next: next ? { name: next.name, minRank: next.minRank, ok: !done || state.seasonRank[state.season] <= next.minRank } : null, finalSeason: !next };
}
