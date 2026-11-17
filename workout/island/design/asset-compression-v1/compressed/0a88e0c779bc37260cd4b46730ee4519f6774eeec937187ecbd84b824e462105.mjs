/** Ski league v23 (13/11/2026, Roy: "סקי אפשר לבנות כמו ליגה ולהוסיף עוד שלבים"), pure core.
 * 30 stages in six themes of five (pine forest, ice cave, volcano, aurora night, alpine village, peak and clouds). Each theme is a
 * season: a points table of six riders (the child and five named rivals), the fifth stage is a boss stage on a long course with double
 * points, the season ends with a podium, a cup for first place and a season prize. Every stage has three clear goals: the place
 * (required, opens the next stage), a time and either a gate count or a clean run (no fall); each goal is a star. League coins (course
 * coins, place prize, new stars, season prize) buy three pieces of gear the engine really reads: skis (speed), helmet (shorter falls),
 * goggles (less wind drift, gates fill more of the boost tank).
 *
 * The league stages run as game stages 4..33, after the three existing ones (BASE_STAGES), and never touch the island save: the
 * league lives in its own key (alpine-league-store.mjs), the regular three stages, their stars and records stay as they are.
 * `?alpineLeague=0` turns the league off (leagueEnabled): the ski game is then exactly v22.1.
 * No imports, no DOM, no storage, no course data (that is alpine-league-stages.mjs), so the island engine can load it at boot. */

export const VERSION = 1;
export const BASE_STAGES = 3;
export const PER_THEME = 5;
export const THEMES = Object.freeze([
  {id: 'pine', name: 'יער אורנים', line: 'גולשים בין אורנים ירוקים', boss: 'בוס היער'},
  {id: 'ice', name: 'מערת קרח', line: 'קירות קרח כחולים ושערים צפופים', boss: 'בוס הקרח'},
  {id: 'lava', name: 'הר געש', line: 'סלעים כהים ואור כתום. הלבה רחוקה ולא מסוכנת', boss: 'בוס הר הגעש'},
  {id: 'aurora', name: 'לילה עם אורורה', line: 'גלישת לילה תחת אורות הצפון, עם רוח', boss: 'בוס האורורה'},
  {id: 'village', name: 'כפר אלפיני', line: 'בין בתי הכפר, קפיצות ושערים', boss: 'בוס הכפר'},
  {id: 'peak', name: 'פסגה ועננים', line: 'מעל העננים, רוח חזקה ומסלול ארוך', boss: 'בוס הפסגה'}
].map(Object.freeze));
export const STAGE_COUNT = THEMES.length * PER_THEME;
/** The five computer riders of the league, in the engine's order (rival-1 .. rival-5) and the colours alpine-view paints them. */
export const RIVALS = Object.freeze([
  {id: 'barak', name: 'ברק', color: '#bd974e', style: 'אלוף הליגה, מהיר בישורות'},
  {id: 'yam', name: 'ים', color: '#498b9d', style: 'מלך הקפיצות'},
  {id: 'gal', name: 'גל', color: '#746b96', style: 'יציב בסלאלום'},
  {id: 'anbar', name: 'ענבר', color: '#a95d5b', style: 'מתחילה מהר'},
  {id: 'ori', name: 'אורי', color: '#7b8d5b', style: 'מנסה הכול'}
].map(Object.freeze));
export const PLAYER_COLOR = '#ce6545';
export const RIDERS = Object.freeze(['player', ...RIVALS.map(r => r.id)]);
const ENGINE_IDS = Object.freeze(['player', 'rival-1', 'rival-2', 'rival-3', 'rival-4', 'rival-5']);
export const POINTS = Object.freeze([10, 8, 6, 4, 2, 1]);
export const BOSS_FACTOR = 2;
/** League coins: place prize on the first pass of a stage, a bonus per new star, the course coins of every run, and a season prize by place. */
export const PRIZE = Object.freeze([50, 40, 32, 26, 20, 15]);
export const STAR_COINS = 10;
export const COIN_VALUE = 1;
export const SEASON_PRIZE = Object.freeze([200, 140, 100, 70, 50, 40]);
export const MAX_LEVEL = 5;
export const GEAR_COST = Object.freeze([70, 130, 200, 290, 400]);
/** key = the equipment value the engine reads (alpine-engine.mjs clamps each one: wax 1..1.1, helmet 1..1.3, goggles 1..1.4). */
export const GEAR = Object.freeze({
  skis: Object.freeze({name: 'מגלשיים', key: 'wax', perLevel: .01, what: 'גלישה מהירה יותר'}),
  helmet: Object.freeze({name: 'קסדה', key: 'helmet', perLevel: .06, what: 'קמים מהר יותר אחרי נפילה'}),
  goggles: Object.freeze({name: 'משקפיים', key: 'goggles', perLevel: .08, what: 'הרוח מזיזה פחות, ושער ממלא יותר את המיכל'})
});
export const HISTORY_CAP = 60;
const GOAL_THIRD = Object.freeze(['gates', 'clean', 'gates', 'clean', 'gates']);

const QUERY_OFF = search => new URLSearchParams(search).get('alpineLeague') === '0';
export const leagueEnabled = (search = globalThis.location?.search || '') => !QUERY_OFF(search);
export const engineStageOf = n => BASE_STAGES + n;
export const leagueStageOf = stage => stage - BASE_STAGES;
export const isLeagueEngineStage = stage => Number.isInteger(stage) && stage > BASE_STAGES && stage <= BASE_STAGES + STAGE_COUNT;
const validN = n => Number.isInteger(n) && n >= 1 && n <= STAGE_COUNT;

/** Place a stage asks for: third place in the first two themes (forest, ice cave), second on the volcano, and from the aurora night on
 * only a win opens the next stage (bosses included). */
export function targetRankOf(n) { return n <= 10 ? 3 : n <= 15 ? 2 : 1; }
/** Facts of league stage n (1..30) that need no course: theme, place in the theme, boss, the game stage it runs as, the goal kinds. */
export function stageInfo(n) {
  if (!validN(n)) return null;
  const t = Math.floor((n - 1) / PER_THEME), index = (n - 1) % PER_THEME + 1, theme = THEMES[t], boss = index === PER_THEME;
  return Object.freeze({n, number: engineStageOf(n), theme: theme.id, themeIndex: t + 1, themeName: theme.name, index, boss, targetRank: targetRankOf(n),
    name: boss ? `${theme.name} · ${theme.boss}` : `${theme.name} · שלב ${index}`, goals: Object.freeze(['place', 'time', GOAL_THIRD[index - 1]])});
}
export function themeOfStage(n) { return validN(n) ? THEMES[Math.floor((n - 1) / PER_THEME)] : null; }
/** Stars of a verified run: none without the place goal, otherwise one plus each other goal reached. */
export function starsFor(goals) { return goals[0]?.ok ? goals.filter(g => g.ok).length : 0; }

const zeros = () => Object.fromEntries(RIDERS.map(id => [id, 0]));
export function createLeague() {
  return {version: VERSION, stage: 1, best: {}, first: {}, season: {theme: 1, table: zeros()}, seasons: {}, coins: 0,
    gear: Object.fromEntries(Object.keys(GEAR).map(k => [k, 0])), cups: 0, runs: 0, history: []};
}
export function equipmentFor(gear) {
  const out = {};
  for (const [name, spec] of Object.entries(GEAR)) out[spec.key] = +(1 + spec.perLevel * Math.min(MAX_LEVEL, gear?.[name] || 0)).toFixed(4);
  return out;
}
export const gearCost = level => level >= MAX_LEVEL ? Infinity : GEAR_COST[level];
export function buyGear(state, name) {
  if (!GEAR[name]) return {ok: false, reason: 'unknown'};
  const level = state.gear[name] || 0, cost = gearCost(level);
  if (level >= MAX_LEVEL) return {ok: false, reason: 'max'};
  if (state.coins < cost) return {ok: false, reason: 'coins', need: cost - state.coins};
  state.coins -= cost; state.gear[name] = level + 1; return {ok: true, cost, level: level + 1};
}
/** Stages 1..state.stage are open; the frontier opens on the first pass of the stage before it. */
export const isStageOpen = (state, n) => validN(n) && n <= state.stage;
export const leagueComplete = state => (state.best[STAGE_COUNT]?.stars || 0) > 0;
const riderOf = id => RIDERS[ENGINE_IDS.indexOf(id)];

/** Applies one verified run (alpine-league-result.mjs) to the league, in place.
 * run: {n, passed, stars, place, ms, completed, coins, order: engine ids first to last}. Failed runs and replays only pay their course
 * coins and new stars; the season table changes once per stage, on its first pass (the race that opened the next stage). */
export function applyStage(state, run) {
  const info = stageInfo(run.n);
  if (!info || !isStageOpen(state, run.n)) throw new Error('alpine league: stage not open');
  const ids = run.order.map(riderOf);
  if (ids.length !== RIDERS.length || ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('alpine league: invalid order');
  const prev = state.best[run.n] || {stars: 0, ms: 0, place: 0}, firstPass = run.passed && run.n === state.stage && !(prev.stars > 0);
  const newStars = Math.max(0, run.stars - prev.stars);
  state.best[run.n] = {stars: Math.max(prev.stars, run.stars), ms: run.completed && (!prev.ms || run.ms < prev.ms) ? run.ms : prev.ms,
    place: run.completed ? (prev.place ? Math.min(prev.place, run.place) : run.place) : prev.place};
  let coins = run.coins * COIN_VALUE + newStars * STAR_COINS, points = 0, season = null;
  if (firstPass) {
    coins += PRIZE[run.place - 1] || 0;
    ids.forEach((id, i) => { const p = (POINTS[i] || 0) * (info.boss ? BOSS_FACTOR : 1); state.season.table[id] += p; if (id === 'player') points = p; });
    state.first[run.n] = {place: run.place, points};
    if (run.n < STAGE_COUNT) state.stage = run.n + 1;
    if (info.boss) {
      const table = standings(state), rank = table.findIndex(r => r.id === 'player') + 1, prize = SEASON_PRIZE[rank - 1] || 0;
      season = {theme: info.themeIndex, rank, champion: table[0].id, points: state.season.table.player, podium: table.slice(0, 3).map(r => r.id), prize, cup: rank === 1};
      state.seasons[info.themeIndex] = {rank, champion: season.champion, points: season.points, podium: season.podium, prize};
      if (season.cup) state.cups++;
      coins += prize;
      if (info.themeIndex < THEMES.length) state.season = {theme: info.themeIndex + 1, table: zeros()};
    }
  }
  state.coins += coins; state.runs++;
  state.history.push({n: run.n, place: run.place, stars: run.stars, ms: run.ms, coins, points, passed: run.passed});
  if (state.history.length > HISTORY_CAP) state.history.splice(0, state.history.length - HISTORY_CAP);
  return {n: run.n, firstPass, newStars, coins, points, season, stage: state.stage, complete: leagueComplete(state)};
}
const nameOf = id => id === 'player' ? 'אתם' : RIVALS.find(r => r.id === id)?.name || id;
/** The live season table: points, then the better best place in this theme (from the first passes), then the rider order. */
export function standings(state) {
  return Object.entries(state.season.table).map(([id, points]) => ({id, name: nameOf(id), points, color: id === 'player' ? PLAYER_COLOR : RIVALS.find(r => r.id === id)?.color}))
    .sort((a, b) => b.points - a.points || RIDERS.indexOf(a.id) - RIDERS.indexOf(b.id));
}
/** The rival to chase: the rider just above the child in the table (or just below when the child leads). Null before any points. */
export function rivalOf(state) {
  const table = standings(state), me = table.findIndex(r => r.id === 'player');
  if (!table.some(r => r.points > 0)) return null;
  const row = me > 0 ? table[me - 1] : table[1], spec = RIVALS.find(r => r.id === row.id);
  return {id: row.id, name: row.name, color: row.color, style: spec?.style || '', points: row.points, myPoints: table[me].points, diff: row.points - table[me].points, place: table.indexOf(row) + 1, myPlace: me + 1};
}
/** What the next run of stage n needs (n defaults to the frontier). Null for a closed or unknown stage. */
export function stageSetup(state, n = state.stage) {
  const info = stageInfo(n); if (!info || !isStageOpen(state, n)) return null;
  return {...info, equipment: equipmentFor(state.gear), best: state.best[n] ? {...state.best[n]} : null, firstPass: !(state.best[n]?.stars > 0) && n === state.stage,
    rivals: RIVALS.map(r => ({id: r.id, name: r.name, color: r.color}))};
}
/** Everything a screen needs in one read. */
export function leagueSummary(state) {
  const frontier = stageInfo(state.stage), t = state.season.theme, table = standings(state), place = table.findIndex(r => r.id === 'player') + 1;
  const themes = THEMES.map((theme, i) => {
    const from = i * PER_THEME + 1, stars = Array.from({length: PER_THEME}, (_, k) => state.best[from + k]?.stars || 0);
    return {id: theme.id, name: theme.name, line: theme.line, index: i + 1, from, to: from + PER_THEME - 1, numbers: [engineStageOf(from), engineStageOf(from + PER_THEME - 1)],
      open: from <= state.stage, done: stars[PER_THEME - 1] > 0, stars, totalStars: stars.reduce((a, b) => a + b, 0), result: state.seasons[i + 1] || null, live: i + 1 === t && !(stars[PER_THEME - 1] > 0)};
  });
  const totalStars = Object.values(state.best).reduce((n, b) => n + b.stars, 0);
  return {stage: state.stage, frontier, theme: THEMES[t - 1], themeIndex: t, themes, table, place, rival: rivalOf(state), coins: state.coins, cups: state.cups,
    gear: {...state.gear}, equipment: equipmentFor(state.gear), totalStars, maxStars: STAGE_COUNT * 3, complete: leagueComplete(state), runs: state.runs};
}

const int = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const stageKeys = o => Object.keys(o).every(k => validN(Number(k)) && String(Number(k)) === k);
const validTable = table => plain(table) && Object.keys(table).length === RIDERS.length && RIDERS.every(id => int(table[id], 0, 1e6));
/** Strict shape check: anything outside the league's rules is rejected (the store then keeps a copy aside and starts fresh). */
export function validLeague(l) {
  if (!plain(l) || l.version !== VERSION || !int(l.stage, 1, STAGE_COUNT) || !int(l.coins, 0, 1e9) || !int(l.cups, 0, THEMES.length) || !int(l.runs, 0, 1e9)) return false;
  if (!plain(l.gear) || Object.keys(l.gear).length !== Object.keys(GEAR).length || !Object.keys(GEAR).every(k => int(l.gear[k], 0, MAX_LEVEL))) return false;
  if (!plain(l.best) || !stageKeys(l.best) || !Object.entries(l.best).every(([n, b]) => plain(b) && Number(n) <= l.stage && int(b.stars, 0, 3) && int(b.ms, 0, 1e7) && int(b.place, 0, RIDERS.length))) return false;
  if (!plain(l.first) || !stageKeys(l.first) || !Object.entries(l.first).every(([n, f]) => plain(f) && Number(n) <= l.stage && int(f.place, 1, RIDERS.length) && int(f.points, 0, 100))) return false;
  // every stage before the frontier was passed (the frontier opens only on a pass)
  for (let n = 1; n < l.stage; n++) if (!(l.best[n]?.stars > 0) || !l.first[n]) return false;
  if (!plain(l.season) || !int(l.season.theme, 1, THEMES.length) || !validTable(l.season.table)) return false;
  if (!plain(l.seasons) || !Object.entries(l.seasons).every(([t, s]) => int(Number(t), 1, THEMES.length) && plain(s) && int(s.rank, 1, RIDERS.length) && RIDERS.includes(s.champion) && int(s.points, 0, 1e6) && int(s.prize, 0, 1e6)
    && Array.isArray(s.podium) && s.podium.length <= 3 && s.podium.every(id => RIDERS.includes(id)))) return false;
  if (!Array.isArray(l.history) || l.history.length > HISTORY_CAP || !l.history.every(h => plain(h) && validN(h.n) && int(h.place, 1, RIDERS.length) && int(h.stars, 0, 3) && int(h.ms, 0, 1e7) && int(h.coins, 0, 1e6) && int(h.points, 0, 100) && typeof h.passed === 'boolean')) return false;
  return true;
}
/** Backup or second device: never lowers progress. The league further along wins; coins, cups and gear take the larger value; best stars and times merge per stage. */
export function mergeLeague(current, incoming) {
  const base = incoming.stage > current.stage ? incoming : current, out = JSON.parse(JSON.stringify(base));
  out.coins = Math.max(current.coins, incoming.coins); out.cups = Math.max(current.cups, incoming.cups); out.runs = Math.max(current.runs, incoming.runs);
  for (const k of Object.keys(GEAR)) out.gear[k] = Math.max(current.gear[k], incoming.gear[k]);
  for (const src of [current, incoming]) {
    for (const [n, b] of Object.entries(src.best)) { const o = out.best[n]; if (Number(n) > out.stage) continue; out.best[n] = !o ? {...b} : {stars: Math.max(o.stars, b.stars), ms: o.ms && b.ms ? Math.min(o.ms, b.ms) : o.ms || b.ms, place: o.place && b.place ? Math.min(o.place, b.place) : o.place || b.place}; }
    for (const [n, f] of Object.entries(src.first)) if (Number(n) <= out.stage) out.first[n] ??= {...f};
    for (const [t, s] of Object.entries(src.seasons)) out.seasons[t] ??= JSON.parse(JSON.stringify(s));
  }
  return out;
}
