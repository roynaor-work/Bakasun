/** Island racing league, pure core: seasons, points, fixed drivers, car upgrades paid in league coins, validation and merge for the island save.
 * No imports and no track data, so the engine and the save code can load it at boot without cost. Plain-object state, no DOM, no storage.
 * `?racingLeague=0` turns the league off everywhere (leagueEnabled). The race-setup part that needs the track list lives in racing-league.mjs.
 *
 * racing-deep-m6 (11/11/2026, Roy: "פורמולה מעולה. נותר לבנות ליגה ארוכה"): the long league. Five seasons of 12-20 races over the six circuits
 * (every circuit in every time of day of the season's tiers: a Latin square, so no two consecutive races look alike), twelve scoring drivers in six
 * teams of two, F1 points 25-18-15-12-10-8-6-4-2-1 plus a point for the fastest lap, a rival, a season prize and a season podium, an ERS upgrade.
 * `?racingLongLeague=0` keeps the short league of racing-v9 (3 seasons of 6, five scoring cars). The save version stays 19: every new field is
 * optional, `normalizeLeague` fills what an older league lacks (upgrades.ers, the seven new table rows), and `validLeague` accepts both shapes. */

const QUERY = new URLSearchParams(globalThis.location?.search || '');
export const longLeagueEnabled = (search = globalThis.location?.search || '') => new URLSearchParams(search).get('racingLongLeague') !== '0';
export const LONG = longLeagueEnabled();

export const SHORT_POINTS = Object.freeze([25, 18, 15, 12, 10]);
export const LONG_POINTS = Object.freeze([25, 18, 15, 12, 10, 8, 6, 4, 2, 1]);
export const POINTS = LONG ? LONG_POINTS : SHORT_POINTS;
export const FASTEST_LAP_POINT = 1;
/** racing-deep-m6: six teams of two drivers, like a Formula 1 constructors' table. Our own names and colours, no real brands.
 * The colour is the livery racing-view paints on the first car of the pair; drivers keep their own car colour on the track. */
export const TEAMS = Object.freeze([
  { id: 'flame', name: 'להבה', color: '#d93228', drivers: ['player', 'noa'] },
  { id: 'ocean', name: 'אוקיינוס', color: '#18b6bd', drivers: ['almog', 'shemesh'] },
  { id: 'gold', name: 'זהב', color: '#d6aa3b', drivers: ['turkiz', 'yam'] },
  { id: 'silver', name: 'כסף', color: '#b7c2ca', drivers: ['barkat', 'gal'] },
  { id: 'forest', name: 'יער', color: '#7ac05a', drivers: ['rom', 'or'] },
  { id: 'night', name: 'לילה', color: '#a05fc4', drivers: ['dor', 'shaked'] }
].map(Object.freeze));
const teamOf = id => TEAMS.find(t => t.drivers.includes(id));
/** racing-liveries-v1 (13/11/2026, Codex design/racing-liveries-v1): every driver races in the colour of the team, on the car, the grid card, the timing tower
 * and the podium; the two team-mates share it and the car number and the stripe width tell them apart. ?racingLiveries=0 keeps each driver's own colour of
 * racing-deep-m4 everywhere, exactly as before. `paint` is the colour shown; `color` stays the driver's own colour (data, unchanged). */
export const liveriesEnabled = (search = globalThis.location?.search || '') => new URLSearchParams(search).get('racingLiveries') !== '0';
export const LIVERIES = liveriesEnabled();
/** The colour a driver's car wears: the team colour with liveries on, the driver's own colour with them off; a car outside the grid is neutral grey. */
export function paintOf(driver, on = LIVERIES) {
  if (!driver) return '#8a98a6';
  const team = on && TEAMS.find(t => t.id === driver.teamId);
  return team ? team.color : driver.color || '#8a98a6';
}
/** racing-deep-m4: the whole grid of twelve, fixed for every race and season: index = position in the race model's car list (0 = the player,
 * 1-11 = the computer drivers in the order racing-physics maps config.drivers[index-1]). number and colour are the ones racing-view.mjs paints
 * (CAR_NUMBERS / carColors), so the broadcast tower, the grid card and the podium match the cars on the track.
 * racing-deep-m6: every driver has a rating (multiplies the stage AI speed, plus the season's offset) and a team; in the long league all twelve
 * score, in the short league (?racingLongLeague=0) only the first five. Pure data; racing-view/physics may import it instead of their own copies. */
export const GRID_DRIVERS = Object.freeze([
  { id: 'player', name: 'אתם', number: 1, color: '#d93228', style: 'אתם', rating: 1 },
  { id: 'almog', name: 'אלמוג', number: 16, color: '#18b6bd', style: 'יציב', rating: 1.01 },
  { id: 'turkiz', name: 'טורקיז', number: 44, color: '#d6aa3b', style: 'תוקפני', rating: 1.03 },
  { id: 'shemesh', name: 'שמש', number: 63, color: '#566bd1', style: 'מהיר בפינות', rating: 1.05 },
  { id: 'barkat', name: 'ברקת', number: 11, color: '#b7c2ca', style: 'אלוף העונה', rating: 1.07 },
  { id: 'noa', name: 'נועה', number: 4, color: '#e07b39', style: 'זהירה', rating: 1.0 },
  { id: 'rom', name: 'רום', number: 27, color: '#7ac05a', style: 'עקבי', rating: 1.02 },
  { id: 'dor', name: 'דור', number: 55, color: '#a05fc4', style: 'אוהב קווים ישרים', rating: 0.98 },
  { id: 'yam', name: 'ים', number: 81, color: '#e0c3a1', style: 'רגוע', rating: 0.99 },
  { id: 'or', name: 'אור', number: 14, color: '#4b6a88', style: 'בולם מאוחר', rating: 1.04 },
  { id: 'shaked', name: 'שקד', number: 22, color: '#2b2f36', style: 'שקט', rating: 1.06 },
  { id: 'gal', name: 'גל', number: 31, color: '#e8e6d2', style: 'חדש בליגה', rating: 0.95 }
].map((d, i) => Object.freeze({ ...d, teamId: teamOf(d.id).id, team: teamOf(d.id).name, scoring: LONG || i < 5, paint: LIVERIES ? teamOf(d.id).color : d.color })));
/** Driver card for a car of the race model by its index in state.cars (an unknown index gets a neutral card with the car's own name). */
export function gridDriver(index, name = '') {
  return GRID_DRIVERS[index] || { id: 'car-' + index, name, number: 90 + index, color: '#8a98a6', paint: '#8a98a6', team: '', teamId: '', style: '', scoring: false, rating: 1 };
}
export const driverById = id => GRID_DRIVERS.find(d => d.id === id) || null;
/** The computer drivers of the league in grid order (racing-physics: config.drivers[index-1] is car index). Long: eleven; short: the four of racing-v9. */
export const DRIVERS = Object.freeze((LONG ? GRID_DRIVERS.slice(1) : GRID_DRIVERS.slice(1, 5)).map(d => Object.freeze({ id: d.id, name: d.name, rating: d.rating, style: d.style, teamId: d.teamId })));
/** Every id that scores in the league table, in grid order. */
export const LEAGUE_IDS = Object.freeze(['player', ...DRIVERS.map(d => d.id)]);
const ALL_IDS = Object.freeze(GRID_DRIVERS.map(d => d.id));

/** Season k uses the circuits of stage tiers 0, 2 and 4 (laps 4, 5, 5 on the longer racing-v10 circuits: about 3.5 to 4.5 minutes a race). */
// racing-look-v1: the circuits now force braking (laps about 8% slower), so a season is 3, 4, 4 laps to stay under the 295 s race cap (?racingLook=0: 4, 5, 5).
const LOOK = QUERY.get('racingLook') !== '0';
// ?racingTracks=v2 (Codex circuits, 70-95 s laps): 3, 3, 3 laps
// racing-deep-m2: the Codex circuits are the default set (65-90 s laps); ?racingTracks=f1 or v1 keep their lap counts
const V2 = !['f1', 'v1'].includes(QUERY.get('racingTracks'));
/** racing-deep-m2: laps of a league race on the default circuits. standard = 3 (3.4-3.9 minutes, measured), short = 2 (about 2.4 minutes). */
export const RACE_LAPS = Object.freeze({ standard: 3, short: 2 });
export const SHORT_SEASONS = Object.freeze([
  Object.freeze({ id: 1, name: 'עונת הפתיחה', tier: 0, laps: V2 ? RACE_LAPS.standard : LOOK ? 4 : 5, minRank: 0, rating: 0.02 }),
  Object.freeze({ id: 2, name: 'ליגת הכסף', tier: 2, laps: V2 ? RACE_LAPS.standard : LOOK ? 5 : 6, minRank: 3, rating: 0.045 }),
  Object.freeze({ id: 3, name: 'ליגת הזהב', tier: 4, laps: V2 ? RACE_LAPS.standard : LOOK ? 5 : 6, minRank: 3, rating: 0.045 })
]);
/** racing-deep-m6 long league. `tiers` = the stage tiers (time of day / direction of the six circuits) the calendar draws from, `races` = calendar
 * length (12..24), `distance` = the one place that sets the race length in metres (laps = distance / circuit length, rounded, so a 1.3 km ring runs
 * six laps and a 2.3 km grand prix three; lapVariant stretches or shortens it; M2 may retune it with the circuits), `laps` = the fallback when no
 * track length is at hand, `minRank` = the place in the previous season that opens this one (0 = open), `rating` = added to every computer
 * driver's rating, `corner` = multiplies the stage's aiCorner (how fast the computer takes bends: the real limiter of the computer drivers, measured
 * 11/11/2026: on tier 0 a stock casual bot wins at x1.3 and finishes 4th at x1.6, 11th at x2; on tier 4 it is 8th already at x1). The tiers make the
 * computer faster by themselves, so the factor eases season by season while the overall challenge still rises. */
// racing-deep-fable merge: `corner` multiplies the per-tier aiCorner of racing-tracks.mjs, which racing-deep-m2 raised for the Codex circuits (23..33 instead of 17..25.8);
// calibrated on the integration branch (m5/league-sim-long-final-3seasons.log): a normal driver is champion with upgrades and not without them from season 2;
// a slow driver finishes 9th-11th, so the gate into season 2 is place 10 (a slow child with a few upgrades gets through; a missed gate replays the season).
export const LONG_SEASONS = Object.freeze([
  Object.freeze({ id: 1, name: 'עונת הפתיחה', tiers: [0, 1], races: 12, distance: 6400, laps: 3, minRank: 0, rating: 0.05, corner: 1.5 }),
  Object.freeze({ id: 2, name: 'ליגת הכסף', tiers: [1, 2], races: 14, distance: 6400, laps: 3, minRank: 10, rating: 0.05, corner: 1.45 }),
  Object.freeze({ id: 3, name: 'ליגת הזהב', tiers: [2, 3], races: 16, distance: 6400, laps: 3, minRank: 8, rating: 0.05, corner: 1.35 }),
  Object.freeze({ id: 4, name: 'ליגת הפלטינה', tiers: [2, 3, 4], races: 18, distance: 6400, laps: 3, minRank: 5, rating: 0.05, corner: 1.25 }),
  Object.freeze({ id: 5, name: 'ליגת האלופים', tiers: [3, 4], races: 18, distance: 6400, laps: 3, minRank: 5, rating: 0.06, corner: 1.2 })
]);
/** Race distance factors of the variants and the ceiling a race may ask of a slow driver under the 295 s clock (about 31 m/s). The "short races"
 * league setting scales every race by SHORT_RACES_FACTOR. */
export const VARIANT_FACTOR = Object.freeze({ short: 0.65, normal: 1, long: 1.3 });
// MAX_DISTANCE: 295 s at about 32 m/s (the casual bot averages 38 m/s over a race, a slow child with crashes less); measured 11/11: 7,400 m gave 3.3 min, so 7,800 m with the long races now allowed 4 laps on the grand prix circuits aims at 3.5.
// racing-deep-fable merge: the default circuits are now 2.0-2.3 km (racing-deep-m2, scale 0.87) and a casual driver laps them in about 75 s, so 6,400 m = 3 laps
// (3.4-3.9 minutes measured on the integration branch) and 8,000 m is the most a slow driver finishes under the 295 s clock.
export const MAX_DISTANCE = 8000, SHORT_RACES_FACTOR = 0.7;
/** Laps of a race from its target distance and the circuit length: the nearest whole number of laps, never over MAX_DISTANCE, within MIN..MAX_LAPS. */
export function lapsForDistance(distance, length) {
  if (!(length > 0)) return MIN_LAPS;
  let laps = Math.round(distance / length); while (laps > MIN_LAPS && laps * length > MAX_DISTANCE) laps--;
  return Math.max(MIN_LAPS, Math.min(MAX_LAPS, laps));
}
/** Target distance of a calendar entry in metres (long league), after its variant and the short-races setting. */
export function raceDistance(season, variant, shortRaces = false) { return Math.round((season.distance || 6400) * (VARIANT_FACTOR[variant] || 1) * (shortRaces ? SHORT_RACES_FACTOR : 1)); }
export const SEASONS = LONG ? LONG_SEASONS : SHORT_SEASONS;
export const MAX_SEASONS = Math.max(LONG_SEASONS.length, SHORT_SEASONS.length);
export const CIRCUITS = 6;
export const MIN_LAPS = 2, MAX_LAPS = 7;
/** Race variants of a long season by calendar index: every second race is a long one (+1 lap), every eighth a sprint (-1 lap). One rule, one place. */
export function lapVariant(index) { return index % 8 === 4 ? 'short' : index % 2 === 1 ? 'long' : 'normal'; }
const VARIANT_DELTA = Object.freeze({ short: -1, normal: 0, long: 1 });
export const RACES_PER_SEASON = 6;
export const MAX_RACES = 24;
/** Number of races in a season (short league: always six). */
export function racesIn(seasonId) { const s = SEASONS[seasonId - 1]; return LONG && s ? s.races : RACES_PER_SEASON; }
/** The calendar of a season: [{race, stage, tier, circuit, laps, distance, variant}]. Long league: race i runs circuit i%6 in tier tiers[(i + floor(i/6)) % tiers.length]
 * (a Latin square: each circuit visits each tier once before any repeats). `lengths` (circuit index -> metres, from racing-league.mjs which has the
 * tracks) turns the race distance into laps; without it `laps` is the season fallback plus the variant. `shortRaces` (a league setting) shortens every race. */
export function seasonCalendar(seasonId, { shortRaces = false, lengths = null } = {}) {
  const season = SEASONS[seasonId - 1]; if (!season) return [];
  if (!LONG) return Array.from({ length: RACES_PER_SEASON }, (_, i) => ({ race: i, stage: season.tier * CIRCUITS + i + 1, tier: season.tier, circuit: i, laps: season.laps, variant: 'normal' }));
  return Array.from({ length: season.races }, (_, i) => {
    const circuit = i % CIRCUITS, tier = season.tiers[(i + Math.floor(i / CIRCUITS)) % season.tiers.length], variant = lapVariant(i), distance = raceDistance(season, variant, shortRaces);
    const laps = lengths?.[circuit] > 0 ? lapsForDistance(distance, lengths[circuit]) : Math.max(MIN_LAPS, Math.min(MAX_LAPS, season.laps + VARIANT_DELTA[variant] - (shortRaces ? 1 : 0)));
    return { race: i, stage: tier * CIRCUITS + circuit + 1, tier, circuit, laps, distance, variant };
  });
}
/** Stage ids of a season (the same list racing-tracks.mjs builds: tier k holds stages 6k+1 .. 6k+6). */
export function seasonStages(seasonId) { return seasonCalendar(seasonId).map(c => c.stage); }
export const UPGRADES = Object.freeze({
  engine: { name: 'מנוע', perLevel: 0.03, key: 'engine', cap: 1.16 },
  tires: { name: 'צמיגים', perLevel: 0.03, key: 'grip', cap: 1.16 },
  steering: { name: 'היגוי', perLevel: 0.02, key: 'steer', cap: 1.12 },
  brakes: { name: 'בלמים', perLevel: 0.05, key: 'brakes', cap: 1.3 },
  aero: { name: 'אירו', perLevel: 0.04, key: 'aero', cap: 1.25 },
  // racing-deep-m6: ERS (equipment.nitro in racing-physics: a bigger store, cheaper use, a bigger harvest cap). Optional in the save: normalizeLeague adds level 0.
  ers: { name: 'ERS', perLevel: 0.03, key: 'nitro', cap: 1.16 }
});
export const MAX_LEVEL = 5;
/** racing-deep-m6: five seasons of up to 24 races, plus one replay of a season, fit; each record is about 80 bytes. */
export const HISTORY_CAP = 150;
export const UPGRADE_COST = Object.freeze([100, 180, 280, 420, 600]);
/** League coins for a finish: 1st..last, plus a bonus for the fastest lap. Kept separate from island money. */
export const SHORT_PRIZE = Object.freeze([220, 160, 120, 90, 70]);
// racing-deep-m6 economy (measured 11/11/2026 with tools/racing-league-sim.mjs): with race prizes of 200..30 a winner earned 3,980 coins in season 1 and bought 19 of the 30
// upgrade levels at once, so every bot was champion from season 1. Halved: about 1,300 a season for a mid-field driver, 2,000 for a winner; the full garage (9,480) takes most of the five seasons.
export const LONG_PRIZE = Object.freeze([120, 95, 80, 70, 60, 50, 45, 40, 35, 30, 25, 20]);
export const PRIZE = LONG ? LONG_PRIZE : SHORT_PRIZE;
export const FASTEST_LAP_COINS = LONG ? 25 : 40;
/** racing-deep-m6: coins at the end of a season by place in the drivers' table, and a bonus when the player's team wins the teams' table. */
export const SEASON_PRIZE = Object.freeze([500, 350, 250, 180, 140, 110, 90, 70, 60, 50, 40, 30]);
export const TEAM_PRIZE = 150;

export function createLeague() {
  return { version: 1, season: 1, race: 0, coins: 0, upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])),
    table: Object.fromEntries(LEAGUE_IDS.map(id => [id, 0])), history: [], champion: {}, seasonRank: {}, seasonPodium: {}, teamChampion: {}, seasonPrize: {} };
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
  const level = state.upgrades[name] || 0, cost = upgradeCost(level);
  if (level >= MAX_LEVEL) return { ok: false, reason: 'max' };
  if (state.coins < cost) return { ok: false, reason: 'coins', need: cost - state.coins };
  state.coins -= cost; state.upgrades[name] = level + 1; return { ok: true, cost, level: level + 1 };
}
/** racing-deep-m6: league settings. shortRaces takes one lap off every race (for a child who tires of 3.5-minute races). Optional in the save. */
export function setShortRaces(state, on) { state.shortRaces = Boolean(on); return { ok: true, shortRaces: state.shortRaces }; }
const idOfCar = carId => carId === 'player' ? 'player' : DRIVERS[Number(String(carId).replace('ai-', '')) - 1]?.id;
/** order: car ids from first to last place as the race model reports them ('player', 'ai-1'..), exactly the scoring grid. fastestLapId optional.
 * Long league: F1 rule, the fastest-lap point goes only to a top-ten finisher. */
export function applyRace(state, { order, fastestLapId = null }) {
  const ids = order.map(idOfCar);
  if (ids.length !== LEAGUE_IDS.length || ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('invalid finishing order');
  const gained = {}, fastId = fastestLapId ? idOfCar(fastestLapId) : null;
  ids.forEach((id, index) => { const points = (POINTS[index] || 0) + (fastId === id && (!LONG || index < 10) ? FASTEST_LAP_POINT : 0); state.table[id] += points; gained[id] = points; });
  const place = ids.indexOf('player') + 1, coins = (PRIZE[place - 1] || 0) + (fastestLapId === 'player' ? FASTEST_LAP_COINS : 0);
  const entry = { season: state.season, race: state.race, place, points: gained.player, coins };
  const cal = seasonCalendar(state.season)[state.race];
  if (LONG) { if (cal) entry.stage = cal.stage; entry.order = ids.map(id => ALL_IDS.indexOf(id)); if (fastId) entry.fastest = ALL_IDS.indexOf(fastId); }
  state.coins += coins; state.history.push(entry); if (state.history.length > HISTORY_CAP) state.history.splice(0, state.history.length - HISTORY_CAP);
  state.race++;
  const done = state.race >= racesIn(state.season);
  let seasonPrize = 0, podium = null, teamChampion = null;
  if (done) {
    const table = standings(state), rank = table.findIndex(r => r.id === 'player') + 1;
    state.seasonRank[state.season] = rank; state.champion[state.season] = table[0].id;
    if (LONG) {
      podium = table.slice(0, 3).map(r => r.id); const teams = teamStandings(state); teamChampion = teams[0]?.id || null;
      seasonPrize = (SEASON_PRIZE[rank - 1] || 0) + (teamChampion === teamOf('player').id ? TEAM_PRIZE : 0);
      (state.seasonPodium ??= {})[state.season] = podium; (state.teamChampion ??= {})[state.season] = teamChampion; (state.seasonPrize ??= {})[state.season] = seasonPrize;
      state.coins += seasonPrize;
    }
  }
  return { place, points: gained.player, coins, seasonDone: done, seasonPrize, podium, teamChampion, rank: done ? state.seasonRank[state.season] : null };
}
export function nextSeason(state) {
  const done = state.race >= racesIn(state.season); if (!done) return { ok: false, reason: 'not finished' };
  const next = SEASONS[state.season]; if (!next) return { ok: false, reason: 'last season' };
  if (state.seasonRank[state.season] > next.minRank) return { ok: false, reason: 'rank', need: next.minRank };
  state.season++; state.race = 0; for (const id of Object.keys(state.table)) state.table[id] = 0; return { ok: true, season: state.season };
}
/** racing-deep-m6: a season that ended below the gate (or the last season) can be raced again: table and race counter reset, coins, upgrades
 * and history stay. The old league had no way on from a missed gate. */
export function restartSeason(state) {
  const done = state.race >= racesIn(state.season); if (!done) return { ok: false, reason: 'not finished' };
  const next = SEASONS[state.season];
  if (next && state.seasonRank[state.season] <= next.minRank) return { ok: false, reason: 'gate open' };
  state.race = 0; for (const id of Object.keys(state.table)) state.table[id] = 0; return { ok: true, season: state.season };
}
export function isRaceUnlocked(state, season, race) {
  if (season < state.season) return false;       // finished seasons are replayed from the history, not re-raced
  if (season > state.season) return false;
  return race <= state.race;
}
const nameOf = id => id === 'player' ? 'אתם' : (driverById(id)?.name || id);
/** Drivers' table: points, then (tie) the better best finish of the season (from the history), then grid order. */
export function standings(state) {
  const best = {};
  for (const h of state.history) if (h.season === state.season && Array.isArray(h.order)) h.order.forEach((gi, place) => { const id = ALL_IDS[gi]; if (id) best[id] = Math.min(best[id] ?? 99, place); });
  return Object.entries(state.table).filter(([id]) => LEAGUE_IDS.includes(id)).map(([id, points]) => { const d = driverById(id); return { id, name: nameOf(id), points, number: d?.number, color: d?.color, teamId: d?.teamId, team: d?.team, best: best[id] ?? 99 }; })
    .sort((a, b) => b.points - a.points || a.best - b.best || LEAGUE_IDS.indexOf(a.id) - LEAGUE_IDS.indexOf(b.id));
}
/** racing-deep-m6: teams' table (constructors): the sum of each pair's points. */
export function teamStandings(state) {
  return TEAMS.map(t => ({ id: t.id, name: t.name, color: t.color, drivers: t.drivers.filter(id => id in state.table), points: t.drivers.reduce((n, id) => n + (state.table[id] || 0), 0), mine: t.drivers.includes('player') }))
    .filter(t => t.drivers.length).sort((a, b) => b.points - a.points || TEAMS.indexOf(TEAMS.find(t => t.id === a.id)) - TEAMS.indexOf(TEAMS.find(t => t.id === b.id)));
}
/** racing-deep-m6: the rival: the computer driver just above the player in the table (the one to catch), or just below when the player leads;
 * with head-to-head numbers from this season's races. Null until anyone has points. */
export function rivalOf(state) {
  const table = standings(state), me = table.findIndex(r => r.id === 'player'); if (me < 0 || table.length < 2) return null;
  const row = me > 0 ? table[me - 1] : table[1], mine = table[me];
  const races = state.history.filter(h => h.season === state.season && Array.isArray(h.order)), gi = ALL_IDS.indexOf(row.id);
  const ahead = races.filter(h => h.order.indexOf(0) < h.order.indexOf(gi)).length, wins = races.filter(h => h.order[0] === gi).length, myWins = races.filter(h => h.order[0] === 0).length;
  const podiums = races.filter(h => h.order.indexOf(gi) < 3).length, myPodiums = races.filter(h => h.order.indexOf(0) < 3).length;
  return { id: row.id, name: row.name, number: row.number, color: row.color, team: row.team, points: row.points, myPoints: mine.points, diff: row.points - mine.points, place: table.indexOf(row) + 1, myPlace: me + 1,
    races: races.length, ahead, behind: races.length - ahead, wins, myWins, podiums, myPodiums, style: driverById(row.id)?.style || '' };
}

const int = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
/** racing-deep-m6: fills what a league saved by an older build lacks, in place, before validation: upgrades.ers, the table rows of the
 * seven drivers who did not score before, and the season maps. A fresh league is unchanged; anything that is not a league is returned as is. */
export function normalizeLeague(l) {
  if (!plain(l)) return l;
  if (plain(l.upgrades)) for (const k of Object.keys(UPGRADES)) l.upgrades[k] ??= 0;
  if (plain(l.table)) for (const id of LEAGUE_IDS) l.table[id] ??= 0;
  l.seasonPodium ??= {}; l.teamChampion ??= {}; l.seasonPrize ??= {};
  return l;
}
const validOrder = o => Array.isArray(o) && o.length >= 5 && o.length <= ALL_IDS.length && new Set(o).size === o.length && o.every(gi => int(gi, 0, ALL_IDS.length - 1));
/** Strict shape check for the island save. Anything outside the league's own rules is rejected, so a damaged save fails loudly.
 * racing-deep-m6: accepts both the short and the long shape (the flag may be switched on a saved league), new fields only when well formed. */
export function validLeague(l) {
  if (!plain(l) || l.version !== 1 || !int(l.season, 1, MAX_SEASONS) || !int(l.race, 0, MAX_RACES) || !int(l.coins, 0, 1e9)) return false;
  // every saved part is a known one with a legal level; the five parts of racing-v9 must be there, ers may be missing (older save)
  if (!plain(l.upgrades) || !Object.keys(l.upgrades).every(k => UPGRADES[k] && int(l.upgrades[k], 0, MAX_LEVEL)) || !Object.keys(UPGRADES).every(k => k === 'ers' || k in l.upgrades)) return false;
  if (!plain(l.table) || !Object.keys(l.table).every(id => ALL_IDS.includes(id) && int(l.table[id], 0, 1e6)) || !LEAGUE_IDS.slice(0, 5).every(id => id in l.table)) return false;
  if (!Array.isArray(l.history) || l.history.length > HISTORY_CAP) return false;
  if (!l.history.every(h => plain(h) && int(h.season, 1, MAX_SEASONS) && int(h.race, 0, MAX_RACES - 1) && int(h.place, 1, ALL_IDS.length) && int(h.points, 0, 100) && int(h.coins, 0, 1e6)
    && (h.stage === undefined || int(h.stage, 1, 30)) && (h.order === undefined || validOrder(h.order)) && (h.fastest === undefined || int(h.fastest, 0, ALL_IDS.length - 1)))) return false;
  if (!plain(l.champion) || !Object.entries(l.champion).every(([s, id]) => int(Number(s), 1, MAX_SEASONS) && ALL_IDS.includes(id))) return false;
  if (!plain(l.seasonRank) || !Object.entries(l.seasonRank).every(([s, r]) => int(Number(s), 1, MAX_SEASONS) && int(r, 1, ALL_IDS.length))) return false;
  if (l.seasonPodium !== undefined && (!plain(l.seasonPodium) || !Object.entries(l.seasonPodium).every(([s, p]) => int(Number(s), 1, MAX_SEASONS) && Array.isArray(p) && p.length <= 3 && p.every(id => ALL_IDS.includes(id))))) return false;
  if (l.teamChampion !== undefined && (!plain(l.teamChampion) || !Object.entries(l.teamChampion).every(([s, t]) => int(Number(s), 1, MAX_SEASONS) && (t === null || TEAMS.some(x => x.id === t))))) return false;
  if (l.seasonPrize !== undefined && (!plain(l.seasonPrize) || !Object.entries(l.seasonPrize).every(([s, v]) => int(Number(s), 1, MAX_SEASONS) && int(v, 0, 1e6)))) return false;
  return l.shortRaces === undefined || typeof l.shortRaces === 'boolean';
}
/** Backup import never lowers progress: the league that is further along wins, coins and upgrades take the larger value.
 * racing-deep-m6: season weighs 100 (a season holds up to 24 races); both sides are normalized first, season maps are merged. */
export function mergeLeague(current, incoming) {
  normalizeLeague(current); normalizeLeague(incoming);
  const at = l => l.season * 100 + l.race, base = at(incoming) > at(current) ? incoming : current, out = JSON.parse(JSON.stringify(base));
  out.coins = Math.max(current.coins, incoming.coins);
  for (const k of Object.keys(UPGRADES)) out.upgrades[k] = Math.max(current.upgrades[k] || 0, incoming.upgrades[k] || 0);
  for (const key of ['champion', 'seasonRank', 'seasonPodium', 'teamChampion', 'seasonPrize']) for (const [s, v] of Object.entries({ ...(incoming[key] || {}), ...(current[key] || {}) })) (out[key] ??= {})[s] ??= v;
  return out;
}
/** Everything a screen needs in one read: where the season stands, who leads, what the next season asks for.
 * racing-deep-m6: plus the calendar, the teams' table, the rival, the season podium and prize once the season is over, and whether a replay is offered. */
export function leagueSummary(state) {
  const season = SEASONS[state.season - 1] || SEASONS[SEASONS.length - 1], total = racesIn(state.season), done = state.race >= total, table = standings(state), place = table.findIndex(r => r.id === 'player') + 1;
  const next = SEASONS[state.season], gate = next ? { name: next.name, minRank: next.minRank, ok: !done || state.seasonRank[state.season] <= next.minRank } : null;
  return { season, seasonId: state.season, race: state.race, total, done, table, place, leader: table[0], coins: state.coins, gate,
    points: state.table.player, career: state.history.reduce((n, h) => n + h.points, 0), finalSeason: !next, long: LONG,
    calendar: seasonCalendar(state.season, { shortRaces: Boolean(state.shortRaces) }), teams: teamStandings(state), rival: rivalOf(state), shortRaces: Boolean(state.shortRaces),
    podium: done ? (state.seasonPodium?.[state.season] || table.slice(0, 3).map(r => r.id)) : null, teamChampion: done ? (state.teamChampion?.[state.season] ?? teamStandings(state)[0]?.id ?? null) : null,
    seasonPrize: done ? (state.seasonPrize?.[state.season] || 0) : 0, canRestart: done && (!gate || !gate.ok), wins: state.history.filter(h => h.season === state.season && h.place === 1).length,
    careerWins: state.history.filter(h => h.place === 1).length, titles: Object.values(state.champion).filter(id => id === 'player').length };
}
