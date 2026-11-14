import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {gameContext} from '../workout/island/minigames/context.mjs';
import {createAlpineEngine, RIDER_IDS} from '../workout/island/minigames/alpine-engine.mjs';
import {generateCourse, windAt, nextWind} from '../workout/island/minigames/alpine-track.mjs';
import * as L from '../workout/island/minigames/alpine-league-core.mjs';
import {leagueBalance, leagueTrack, leagueAi, stageGoals, judgeGoals, courseFacts, trackIdOf, AI_STRENGTH} from '../workout/island/minigames/alpine-league-stages.mjs';
import {alpineLeagueResult} from '../workout/island/minigames/alpine-league-result.mjs';
import {loadLeague, saveLeague, createLeagueStore, LEAGUE_KEY} from '../workout/island/minigames/alpine-league-store.mjs';
import {createGhostRecorder, decodeGhost, ghostAt, ghostTimeAt, saveGhost, loadGhost, validGhost, GHOST_KEY} from '../workout/island/minigames/alpine-league-ghost.mjs';
import {ALPINE_THEME_ASSETS as ALPINE_THEMES, THEME_LOOKS, THEME_IDS, THEME_DIR, themeAssetFiles, themePackFiles} from '../workout/island/minigames/alpine-league-theme.mjs';
import {createKidBot} from '../workout/island/tools/alpine-league-bot.mjs';
import {buildShell} from '../workout/island/tools/offline-shell.mjs';
import {leagueOfflineFiles} from '../workout/island/tools/alpine-league-offline.mjs';
import {OFFLINE_GAMES} from '../workout/island/ui/offline.mjs';

/** Ski league v23: 30 stages after the three ski stages, in six themes, with seasons, points, stars, gear, goals, a record ghost and
 * bosses. Node part only (the real-touch browser proof is tools/alpine-league-browser.mjs). */
const root = new URL('../workout/island/', import.meta.url);
const data = await loadData(root, async url => ({ok: true, json: async () => JSON.parse(await readFile(url, 'utf8'))}));
const base = data.config.minigames.alpineRush, P = base.physics;
const memory = (entries = new Map()) => ({entries, getItem: k => entries.has(k) ? entries.get(k) : null, setItem(k, v) { entries.set(k, String(v)); }, removeItem(k) { entries.delete(k); }});
const DT = 1 / 60;
/** One league race of stage n with the child-like bot; returns the engine (finished) and its result. */
function botRace(n, seed = 7, {gear = {}, maxFrames = 60 * 260} = {}) {
  const balance = leagueBalance(base, n), e = createAlpineEngine({balance, stage: L.engineStageOf(n), seed, equipment: L.equipmentFor(gear), power: 1}), bot = createKidBot({seed: seed * 31 + n, physics: balance.physics});
  e.command({type: 'start'});
  for (let f = 0; f < maxFrames && e.phase !== 'finished'; f++) { if (e.phase === 'racing') { const d = bot.decide(e.snapshot()); e.command({type: 'steer', value: d.steer}); if (d.boost) e.command({type: 'boost'}); if (d.trick) e.command({type: 'trick', id: d.trick}); } e.step(DT); e.drainEvents(); }
  return {engine: e, result: e.snapshot().result, stats: e.leagueStats()};
}

test('thirty stages in six themes of five, every fifth a boss, numbered after the three ski stages', () => {
  assert.equal(L.STAGE_COUNT, 30); assert.equal(L.THEMES.length, 6); assert.equal(L.PER_THEME, 5); assert.equal(L.BASE_STAGES, 3);
  assert.deepEqual(L.THEMES.map(t => t.name), ['יער אורנים', 'מערת קרח', 'הר געש', 'לילה עם אורורה', 'כפר אלפיני', 'פסגה ועננים']);
  assert.match(L.THEMES[2].line, /לא מסוכנת/, 'the volcano says its lava is far away and harmless');
  for (let n = 1; n <= 30; n++) {
    const i = L.stageInfo(n); assert.equal(i.number, n + 3, 'league stage n runs as game stage 3 + n'); assert.equal(i.boss, n % 5 === 0); assert.equal(i.theme, L.THEMES[Math.floor((n - 1) / 5)].id);
    assert.equal(i.targetRank, n <= 10 ? 3 : n <= 15 ? 2 : 1); assert.deepEqual(i.goals.slice(0, 2), ['place', 'time']); assert.ok(['gates', 'clean'].includes(i.goals[2]));
    assert.match(trackIdOf(n), /^[a-z][a-z-]*$/, 'records accept the track id');
  }
  assert.equal(L.stageInfo(0), null); assert.equal(L.stageInfo(31), null);
  assert.equal(new Set(Array.from({length: 30}, (_, k) => trackIdOf(k + 1))).size, 30);
  for (const id of Object.keys(base.tracks)) assert.ok(!Array.from({length: 30}, (_, k) => trackIdOf(k + 1)).includes(id), 'no clash with the three ski tracks');
  assert.equal(base.levels.length, 3, 'the island config keeps three ski stages: saves and stage stars do not change');
});

test('difficulty rises: denser rows, narrower gaps, more slalom gates, faster, wind from the aurora night, longer bosses, rivals within the caps', () => {
  const tracks = Array.from({length: 30}, (_, k) => leagueTrack(k + 1)), speed = n => leagueBalance(base, n).league.speed;
  for (let n = 2; n <= 30; n++) {
    const a = tracks[n - 2], b = tracks[n - 1];
    assert.ok(b.rowSpacing[0] <= a.rowSpacing[0] + 1e-9 && b.gap[0] <= a.gap[0] + 1e-9, `rows and gaps at ${n}`);
    assert.ok(speed(n) >= speed(n - 1) - 1e-9, `speed at ${n}`);
  }
  assert.ok(tracks[29].rowSpacing[0] < tracks[0].rowSpacing[0] - 8 && tracks[29].gap[0] < tracks[0].gap[0] - 1);
  assert.ok(tracks[29].slalomGates > tracks[0].slalomGates && tracks[29].slalomStep < tracks[0].slalomStep);
  assert.ok(speed(30) > speed(1) + .05);
  for (let n = 1; n <= 15; n++) assert.equal(tracks[n - 1].wind, undefined, `no wind before the aurora night (${n})`);
  for (let n = 16; n <= 30; n++) assert.ok(tracks[n - 1].wind, `wind at ${n}`);
  assert.ok(tracks[29].wind.speed[1] > tracks[15].wind.speed[1], 'the peak is windier than the first aurora night');
  for (let n = 5; n <= 30; n += 5) assert.ok(tracks[n - 1].length >= tracks[n - 2].length * 1.3, `boss ${n} is a long course`);
  for (let n = 1; n <= 30; n++) for (const ai of leagueAi(n, base.aiCaps)) { assert.ok(ai.speed <= base.aiCaps.maxSpeed && ai.reaction >= base.aiCaps.minReaction && ai.lookahead <= base.aiCaps.maxLookahead, `caps at ${n}`); }
  assert.equal(AI_STRENGTH.length, 30); assert.ok(AI_STRENGTH.every(s => s >= 0 && s <= 1));
  assert.ok(Object.keys(THEME_LOOKS).every(id => ['sunset', 'fog', 'night-floodlit'].includes(THEME_LOOKS[id].environment)));
});

test('every league course is fair: a free corridor in every row, reachable from the last, a gentle opening, stable ids, wind zones inside the course', () => {
  for (let n = 1; n <= 30; n++) {
    const b = leagueBalance(base, n), level = b.levels[L.engineStageOf(n) - 1], c = generateCourse({...b.tracks[level.trackId], id: level.trackId}, b.physics);
    assert.ok(c.objects[0].s >= 100, `opening ${n}`); assert.ok(c.objects.at(-1).s < c.length - 40);
    assert.equal(new Set(c.objects.map(o => o.id)).size, c.objects.length);
    for (const row of c.rows) {
      assert.ok(row.to - row.from >= .8, `stage ${n} corridor at ${row.s} is ${row.to - row.from}`);
      for (const o of c.objects.filter(o => o.type === 'rock' && Math.abs(o.s - row.s) < 2)) for (const x of [row.from, row.to, (row.from + row.to) / 2])
        if (x > row.from + .01 && x < row.to - .01) assert.ok(Math.abs(x - o.x) >= o.radius * b.physics.rockHitScale, `stage ${n} ${o.id}`);
    }
    for (let i = 1; i < c.rows.length; i++) { const a = c.rows[i - 1], r = c.rows[i], gap = Math.max(0, r.from - a.to, a.from - r.to); assert.ok(gap <= b.physics.lateralSpeed * (r.s - a.s) / b.physics.boostSpeed, `stage ${n} rows ${a.s}->${r.s}`); }
    for (const z of c.wind || []) assert.ok(z.s0 > 100 && z.s1 < c.length && z.s1 > z.s0 && Math.abs(z.dir) === 1 && z.speed > 0 && z.speed < 4);
    assert.equal(courseFacts(base, n).gates, c.objects.filter(o => o.type === 'gate').length);
  }
});

test('the three ski stages are exactly v22.1: same courses (no wind key) and the same races, to the millisecond', () => {
  // Fingerprints taken from origin/main (v22.1) with the same scripted pilot: objects, sums of s and x, coins; rank, time, coins, falls.
  const COURSES = {'ice-peak': [172, 14505249, -5107, 125], 'frost-forest': [213, 18977979, 8201, 130], 'storm-ridge': [210, 21315562, -7474, 95]};
  for (const [id, t] of Object.entries(base.tracks)) {
    const c = generateCourse({...t, id}, P), want = COURSES[id];
    assert.deepEqual([c.objects.length, Math.round(c.objects.reduce((a, o) => a + o.s, 0) * 100), Math.round(c.objects.reduce((a, o) => a + o.x, 0) * 100), c.coins], want, id);
    assert.deepEqual(Object.keys(c), ['id', 'length', 'objects', 'rows', 'path', 'coins']);
  }
  const pilot = e => { const d = e.debug()[0], objs = e.course.objects.filter(o => o.s > d.s + 1 && o.s < d.s + 40); let best = d.x, bc = Infinity;
    for (let cx = -8; cx <= 8; cx += .4) { let c = Math.abs(cx - d.x) * .12; for (const o of objs) { const near = 1 / (1 + (o.s - d.s) / 18);
      if (o.type === 'rock' && Math.abs(cx - o.x) < o.radius * P.rockHitScale + P.board.halfWidth + .25) c += 100 * near;
      if (o.type === 'gate' && Math.abs(Math.abs(cx - o.x) - P.gateHalfWidth) < 1.2) c += 100 * near;
      if (o.type === 'ramp') { const off = Math.abs(cx - o.x); if (off >= 1.6 && off < 2.5) c += 60 * near; }
      if (o.type === 'boost' && Math.abs(cx - o.x) < 1.3) c -= 4 * near; } if (c < bc) { bc = c; best = cx; } }
    e.command({type: 'steer', value: Math.max(-1, Math.min(1, (best - d.x) * .7))}); if (e.snapshot().boostReady) e.command({type: 'boost'}); };
  const RACES = [[1, 11, 1, 64159, 5, 0], [2, 11, 6, 78953, 15, 2], [3, 42, 1, 77996, 0, 2]];
  for (const [stage, seed, rank, ms, coins, crashes] of RACES) {
    const e = createAlpineEngine({balance: base, stage, seed}); e.command({type: 'start'});
    for (let f = 0; f < 30000 && e.phase !== 'finished'; f++) { if (e.phase === 'racing') pilot(e); e.step(DT); }
    const r = e.snapshot().result; assert.deepEqual([r.rank, r.elapsedMs, r.coins, r.crashes], [rank, ms, coins, crashes], `stage ${stage} seed ${seed}`);
    assert.equal(e.snapshot().wind, undefined, 'no wind on the ski stages');
  }
});

test('wind pushes every rider the same way, the computer leans into it, goggles soften it; the helmet shortens a fall', () => {
  const zones = Object.freeze([Object.freeze({s0: 60, s1: 300, dir: 1, speed: 2})]);
  assert.equal(windAt(zones, 50), 0); assert.ok(Math.abs(windAt(zones, 150) - 2) < 1e-9); assert.ok(windAt(zones, 65) > 0 && windAt(zones, 65) < 2, 'eases in');
  assert.deepEqual(nextWind(zones, 20), {dir: 1, speed: 2, inM: 40}); assert.equal(nextWind(zones, 150), null);
  const drift = ({goggles = 1} = {}) => {
    const b = structuredClone(base); b.physics.grid = [{s: 0, x: 0}, ...Array.from({length: 5}, (_, i) => ({s: -300 - i * 6, x: i * 2 - 4}))];
    const course = {id: 'wind', length: 1200, objects: [], rows: [], path: null, coins: 0, wind: zones};
    const e = createAlpineEngine({balance: b, stage: 1, seed: 3, course, equipment: {goggles}}); e.command({type: 'start'}); while (e.phase === 'countdown') e.step(DT);
    for (let i = 0; i < 60 * 8; i++) { e.command({type: 'steer', value: 0}); e.step(DT); }
    const snap = e.snapshot(); return {x: e.debug()[0].x, wind: snap.wind};
  };
  const plain = drift(), shielded = drift({goggles: 1.4});
  assert.ok(plain.x > 3, `the stick centred, the board drifts with the gust: ${plain.x}`); assert.ok(shielded.x < plain.x - .5, `goggles: ${shielded.x} < ${plain.x}`);
  assert.ok(plain.wind && typeof plain.wind.v === 'number', 'the snapshot carries the wind on a league course');
  // Helmet: the same rock, a shorter fall.
  const fall = helmet => { const b = structuredClone(base); b.physics.grid = [{s: 0, x: 0}, ...Array.from({length: 5}, (_, i) => ({s: -300 - i * 6, x: i * 2 - 4}))];
    const e = createAlpineEngine({balance: b, stage: 1, seed: 3, course: {id: 'rock', length: 600, objects: [{id: 'r', type: 'rock', s: 40, x: 0, radius: .9}], rows: [], path: null, coins: 0}, equipment: {helmet}});
    e.command({type: 'start'}); while (e.phase === 'countdown') e.step(DT); let down = 0, speedAfter = null;
    for (let i = 0; i < 60 * 6; i++) { e.command({type: 'steer', value: 0}); e.step(DT); const s = e.snapshot(); if (s.player.crashed) { down++; speedAfter ??= e.debug()[0].speed; } }
    return {down, speedAfter}; };
  const bare = fall(1), helmet = fall(1.3);
  assert.ok(bare.down > 0 && helmet.down < bare.down * .85, `fall frames ${bare.down} -> ${helmet.down}`); assert.ok(helmet.speedAfter > bare.speedAfter, 'and keeps more speed');
});

test('goals and stars: the place opens the next stage, time and gates or a clean run add a star each', () => {
  for (let n = 1; n <= 30; n++) {
    const g = stageGoals(base, n); assert.equal(g.length, 3); assert.equal(g[0].kind, 'place'); assert.equal(g[0].target, L.stageInfo(n).targetRank);
    assert.equal(g[1].kind, 'time'); assert.equal(g[1].ms % 500, 0); assert.ok(g[1].ms > 30000 && g[1].ms < 200000);
    if (g[2].kind === 'gates') assert.ok(g[2].count >= 1 && g[2].count <= g[2].total && g[2].total === courseFacts(base, n).gates);
  }
  const goals = [{kind: 'place', target: 2}, {kind: 'time', ms: 60000}, {kind: 'clean'}];
  const judge = r => judgeGoals(goals, {completed: true, rank: 1, elapsedMs: 59000, gates: 0, crashes: 0, ...r});
  assert.equal(L.starsFor(judge({})), 3); assert.equal(L.starsFor(judge({crashes: 1})), 2); assert.equal(L.starsFor(judge({elapsedMs: 61000, crashes: 2})), 1);
  assert.equal(L.starsFor(judge({rank: 3})), 0, 'no place, no stars, whatever else'); assert.equal(L.starsFor(judge({completed: false})), 0);
});

const order = place => { const o = ['rival-1', 'rival-2', 'rival-3', 'rival-4', 'rival-5']; o.splice(place - 1, 0, 'player'); return o; };
const run = (n, place, {stars = place <= L.stageInfo(n).targetRank ? 2 : 0, coins = 10, ms = 60000} = {}) => ({n, passed: place <= L.stageInfo(n).targetRank, stars, place, ms, completed: true, coins, order: order(place)});
test('league rules: first pass scores the table and opens the next stage, a failed run only pays its coins, replays pay new stars, bosses end the season', () => {
  const s = L.createLeague(); assert.ok(L.validLeague(s)); assert.equal(L.stageSetup(s, 2), null, 'stage 2 is closed');
  const fail = L.applyStage(s, run(1, 5)); assert.equal(fail.firstPass, false); assert.equal(s.stage, 1); assert.equal(fail.coins, 10); assert.deepEqual(Object.values(s.season.table), [0, 0, 0, 0, 0, 0]);
  const a = L.applyStage(s, run(1, 2)); assert.equal(a.firstPass, true); assert.equal(s.stage, 2); assert.equal(a.points, 8); assert.equal(a.coins, 10 + 2 * L.STAR_COINS + L.PRIZE[1]);
  assert.equal(s.season.table.player, 8); assert.equal(s.season.table.barak, 10);
  const again = L.applyStage(s, run(1, 1, {stars: 3})); assert.equal(again.firstPass, false); assert.equal(again.points, 0); assert.equal(again.coins, 10 + L.STAR_COINS, 'a replay pays its coins and the one new star');
  assert.equal(s.best[1].stars, 3); assert.equal(s.season.table.player, 8, 'the table changes once per stage');
  for (let n = 2; n <= 4; n++) L.applyStage(s, run(n, 1));
  const boss = L.applyStage(s, run(5, 1)); assert.equal(boss.points, 20, 'double points at the boss'); assert.ok(boss.season); assert.equal(boss.season.theme, 1);
  assert.equal(boss.season.rank, 1); assert.equal(boss.season.cup, true); assert.equal(s.cups, 1); assert.equal(s.season.theme, 2); assert.deepEqual(Object.values(s.season.table), [0, 0, 0, 0, 0, 0]);
  assert.equal(s.seasons[1].rank, 1); assert.equal(s.stage, 6); assert.ok(L.validLeague(s));
  for (let n = 6; n <= 30; n++) L.applyStage(s, run(n, 1, {stars: 3}));
  assert.ok(L.leagueComplete(s)); assert.equal(s.stage, 30); assert.equal(s.cups, 6); assert.ok(L.validLeague(s));
  const sum = L.leagueSummary(s); assert.equal(sum.complete, true); assert.equal(sum.themes.every(t => t.done), true); assert.equal(sum.totalStars, 3 + 2 * 4 + 25 * 3);
  assert.throws(() => L.applyStage(L.createLeague(), run(3, 1)), /not open/); assert.throws(() => L.applyStage(L.createLeague(), {...run(1, 1), order: ['player']}), /order/);
});

test('gear: three parts, five levels, paid with league coins, read by the engine', () => {
  const s = L.createLeague(); assert.deepEqual(L.buyGear(s, 'skis'), {ok: false, reason: 'coins', need: L.GEAR_COST[0]}); assert.equal(L.buyGear(s, 'boots').reason, 'unknown');
  s.coins = 5000; for (let i = 0; i < 5; i++) assert.ok(L.buyGear(s, 'skis').ok); assert.equal(L.buyGear(s, 'skis').reason, 'max');
  for (let i = 0; i < 5; i++) { L.buyGear(s, 'helmet'); L.buyGear(s, 'goggles'); }
  assert.deepEqual(L.equipmentFor(s.gear), {wax: 1.05, helmet: 1.3, goggles: 1.4}); assert.deepEqual(L.equipmentFor({}), {wax: 1, helmet: 1, goggles: 1});
  assert.equal(s.coins, 5000 - 3 * L.GEAR_COST.reduce((a, b) => a + b, 0)); assert.deepEqual(Object.keys(L.GEAR), ['skis', 'helmet', 'goggles']);
});

test('save: its own key only, strict validation, damaged data kept aside, a newer format never overwritten, merge never lowers progress', () => {
  const st = memory(); const store = createLeagueStore(st); assert.equal(store.status, 'empty');
  store.state.coins = 77; assert.ok(store.save().ok); assert.deepEqual([...st.entries.keys()], [LEAGUE_KEY]); assert.equal(loadLeague(st).state.coins, 77);
  const broken = memory(new Map([[LEAGUE_KEY, '{oops']])); const b = loadLeague(broken); assert.equal(b.status, 'corrupt'); assert.equal(broken.getItem(LEAGUE_KEY + '.corrupt'), '{oops');
  const future = memory(new Map([[LEAGUE_KEY, JSON.stringify({version: 99})]])), f = createLeagueStore(future); assert.equal(f.status, 'future'); assert.equal(f.save().ok, false); assert.equal(future.getItem(LEAGUE_KEY), JSON.stringify({version: 99}));
  const good = L.createLeague(); for (let n = 1; n <= 3; n++) L.applyStage(good, run(n, 1));
  for (const bad of [{...good, stage: 31}, {...good, coins: -1}, {...good, gear: {skis: 9, helmet: 0, goggles: 0}}, {...good, stage: 6}, {...good, best: {...good.best, 9: {stars: 1, ms: 1, place: 1}}}, {...good, season: {theme: 1, table: {player: 0}}}, {...good, history: 'x'}, null])
    assert.equal(L.validLeague(bad), false); assert.equal(saveLeague(memory(), {...good, coins: -5}).ok, false);
  const ahead = L.createLeague(); for (let n = 1; n <= 7; n++) L.applyStage(ahead, run(n, 2)); good.coins = 9999; good.gear.helmet = 4;
  const m = L.mergeLeague(good, ahead); assert.equal(m.stage, 8); assert.equal(m.coins, 9999); assert.equal(m.gear.helmet, 4); assert.equal(m.best[1].place, 1); assert.ok(L.validLeague(m));
});

test('ghost: a run recorded on the step grid, stored compactly, replayed by race time; only a faster run replaces it', () => {
  const rec = createGhostRecorder();
  for (let t = 0; t <= 60000; t += 16.667) rec.record({phase: 'racing', timeMs: t, player: {s: t / 1000 * 25, x: Math.sin(t / 3000) * 3, height: t > 20000 && t < 21000 ? 1.2 : 0}});
  const g = rec.encode(60000); assert.ok(validGhost(g)); assert.ok(JSON.stringify(g).length < 6000, `${JSON.stringify(g).length} bytes for a minute`);
  const d = decodeGhost(g), p = ghostAt(d, 30000); assert.ok(Math.abs(p.s - 750) < .2 && Math.abs(p.x - Math.sin(10) * 3) < .05);
  assert.ok(ghostAt(d, 20500).airborne); assert.ok(Math.abs(ghostTimeAt(d, 500) - 20000) < 30); assert.equal(ghostAt(d, 61000).finished, true);
  const st = memory(); assert.ok(saveGhost(st, 4, g).saved); assert.equal(saveGhost(st, 4, {...g, ms: 61000}).saved, false, 'a slower run keeps the record ghost');
  assert.ok(saveGhost(st, 4, {...g, ms: 59000}).saved); assert.equal(loadGhost(st, 4).ms, 59000); assert.equal(loadGhost(st, 5), null);
  assert.deepEqual([...st.entries.keys()], [GHOST_KEY]); assert.equal(validGhost({...g, d: [1, 2]}), false); assert.equal(loadGhost(memory(new Map([[GHOST_KEY, '{x']])), 4), null);
});

test('island: a league run is checked and applied to the league key only; the island save, stars, money and stage map do not change', () => {
  const storage = memory(), engine = createEngine(data, {storage, now: () => 1e6}); engine.spendPlayTime = () => {};
  assert.equal(engine.alpineLeague.enabled(), true); engine.save(); const islandBefore = storage.getItem('island.v1'), stateBefore = JSON.stringify(engine.state);
  let finish; engine.registry.minigames.set('alpineRush', {...engine.registry.minigames.get('alpineRush'), start: c => { finish = c; return {dispose() {}}; }});
  assert.equal(engine.startMinigame('alpineRush', {...gameContext(engine, data.config.minigames, 42, 'alpineRush'), alpineLeague: 2}).reason, 'reason.invalid', 'stage 2 is closed');
  const start = engine.startMinigame('alpineRush', {...gameContext(engine, data.config.minigames, 42, 'alpineRush'), alpineLeague: 1}); assert.ok(start.ok);
  assert.equal(finish.level, 4); assert.equal(finish.alpineLeague.n, 1); assert.deepEqual(finish.equipment, {wax: 1, helmet: 1, goggles: 1}); assert.equal(finish.power, 1);
  // A real bot race on the league stage with the same seed, reported the way the session reports it.
  const b = leagueBalance(base, 1), e = createAlpineEngine({balance: b, stage: 4, seed: 42, equipment: finish.equipment, power: 1}), bot = createKidBot({seed: 5, physics: b.physics});
  e.command({type: 'start'}); for (let f = 0; f < 60 * 200 && e.phase !== 'finished'; f++) { if (e.phase === 'racing') { const d = bot.decide(e.snapshot()); e.command({type: 'steer', value: d.steer}); if (d.boost) e.command({type: 'boost'}); } e.step(DT); }
  const r = e.snapshot().result, stats = e.leagueStats(), raw = {outcome: r.won ? 'win' : 'lose', score: r.score, alpine: {...r}, league: {order: stats.order, gates: stats.gates}};
  for (const bad of [{...raw, league: {...raw.league, gates: 999}}, {...raw, league: {order: [...raw.league.order].reverse(), gates: raw.league.gates}}, {...raw, league: {...raw.league, extra: 1}}, {...raw, alpine: {...r, stage: 5}}, {...raw, league: undefined}, {...raw, alpine: {...r, coins: r.coins + 500}}])
    assert.equal(alpineLeagueResult(bad, finish, base), null);
  const done = finish.finish(raw); assert.ok(done.ok, String(done.reason)); const lr = done.result.alpineLeague;
  assert.equal(done.result.money, 0); assert.equal(lr.n, 1); assert.equal(lr.place, r.rank); assert.equal(lr.stars, L.starsFor(lr.goals)); assert.equal(lr.passed, r.rank <= 3);
  assert.equal(storage.getItem('island.v1'), islandBefore, 'the island save is not written'); assert.equal(JSON.stringify(engine.state), stateBefore, 'nor the island state');
  const saved = JSON.parse(storage.getItem(LEAGUE_KEY)); assert.equal(saved.runs, 1); assert.equal(saved.stage, lr.passed ? 2 : 1); assert.ok(saved.coins >= r.coins);
  assert.equal(finish.finish(raw).reason, 'reason.duplicate'); assert.equal(engine.isMinigameActive(), false);
  // Reload: the league comes back from its own key.
  const again = createEngine(data, {storage}); assert.equal(again.alpineLeague.state.runs, 1); assert.deepEqual(again.state.minigameProgress.alpineRush, engine.state.minigameProgress.alpineRush);
  // Gear is refused while a game runs.
  again.alpineLeague.state.coins = 500; again.registry.minigames.set('alpineRush', {...again.registry.minigames.get('alpineRush'), start: () => ({dispose() {}})});
  const busy = again.startMinigame('alpineRush', {...gameContext(again, data.config.minigames, 7, 'alpineRush'), alpineLeague: 1}); assert.ok(busy.ok); assert.equal(again.alpineLeague.buy('skis').reason, 'reason.gameBusy'); busy.cancel();
  assert.ok(again.alpineLeague.buy('skis').ok); assert.equal(JSON.parse(storage.getItem(LEAGUE_KEY)).gear.skis, 1);
});

test('?alpineLeague=0 turns the league off everywhere: no setup, no run, the regular stages still play', () => {
  assert.equal(L.leagueEnabled('?alpineLeague=0'), false); assert.equal(L.leagueEnabled(''), true);
  const saved = globalThis.location; globalThis.location = {search: '?alpineLeague=0'};
  try {
    const engine = createEngine(data, {storage: memory(), now: () => 1e6}); assert.equal(engine.alpineLeague.enabled(), false); assert.equal(engine.alpineLeague.setup(1), null);
    engine.registry.minigames.set('alpineRush', {...engine.registry.minigames.get('alpineRush'), start: () => ({dispose() {}})});
    assert.equal(engine.startMinigame('alpineRush', {...gameContext(engine, data.config.minigames, 1, 'alpineRush'), alpineLeague: 1}).reason, 'reason.invalid');
    const regular = engine.startMinigame('alpineRush', gameContext(engine, data.config.minigames, 1, 'alpineRush', 1)); assert.ok(regular.ok); regular.cancel();
  } finally { if (saved === undefined) delete globalThis.location; else globalThis.location = saved; }
});

test('the real session starts a league stage headless: league balance, game stage 4, goals in the snapshot', () => {
  const engine = createEngine(data, {storage: memory(), now: () => 1e6}); engine.spendPlayTime = () => {};
  const runI = engine.startMinigame('alpineRush', {...gameContext(engine, data.config.minigames, 11, 'alpineRush'), alpineLeague: 1, storage: null}); assert.ok(runI.ok, String(runI.reason));
  const snap = runI.session.snapshot; assert.equal(snap.stage, 4); assert.equal(snap.trackId, 'pine-a'); assert.equal(snap.league.n, 1); assert.equal(snap.league.goals.length, 3); assert.equal(snap.league.ghost, null);
  assert.ok(runI.session.start()); runI.cancel(); assert.equal(engine.isMinigameActive(), false);
});

test('child-like bot on the real engine: early stages mostly passed, the last stage rarely, stage times 45-90 s and bosses 70-135 s', () => {
  const pass = (n, runs) => Array.from({length: runs}, (_, k) => botRace(n, 900 + k * 17, {gear: {skis: Math.min(5, Math.floor((n - 1) / 5)), helmet: Math.max(0, Math.floor((n - 1) / 5) - 1), goggles: Math.max(0, Math.floor((n - 1) / 5) - 1)}}));
  const first = pass(1, 6), last = pass(30, 6);
  const rate = list => list.filter(x => x.result.completed && x.result.rank <= x.engine.level.targetRank).length / list.length;
  assert.ok(rate(first) >= .66, `stage 1 passes ${rate(first)}`); assert.ok(rate(last) <= .67, `stage 30 passes ${rate(last)}`);
  for (const x of first) { assert.ok(x.result.completed); assert.ok(x.result.elapsedMs > 45000 && x.result.elapsedMs < 90000, `stage 1 ${x.result.elapsedMs}`); }
  for (const x of last) assert.ok(x.result.elapsedMs > 70000 && x.result.elapsedMs < 135000, `boss 30 ${x.result.elapsedMs}`);
  assert.deepEqual(first[0].stats.order.slice().sort(), [...RIDER_IDS].sort());
});

/** Positions of every primitive of an uncompressed glTF binary: [{min, max, points}] (the Codex pack is plain glTF, no Draco). */
async function primitivesOf(file) {
  const b = await readFile(new URL(file, root)), len = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + len).toString()), bin = 20 + len + 8;
  return j.meshes.flatMap(m => m.primitives.map(p => {
    const a = j.accessors[p.attributes.POSITION], v = j.bufferViews[a.bufferView], off = bin + (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || 12;
    return {min: a.min, max: a.max, points: Array.from({length: a.count}, (_, i) => [0, 4, 8].map(k => b.readFloatLE(off + i * stride + k)))};
  }));
}
test('Codex theme art matches the fits in the asset map: gate poles where poleHalf says and flags above 0.5 m, ramps rising toward -Z (flipped), landmarks upright', async () => {
  for (const id of THEME_IDS) {
    const a = ALPINE_THEMES[id];
    for (const gate of a.gates) {
      const parts = await primitivesOf(gate.path), ground = parts.filter(p => p.min[1] <= .5), flags = parts.filter(p => p.min[1] > .5);
      assert.ok(ground.length && flags.length, `${gate.path}: poles and flags`);
      for (const p of ground) for (const [x] of p.points) assert.ok(Math.abs(Math.abs(x) - gate.poleHalf) < .25, `${gate.path}: pole or foot at ${x}`);
      for (const p of flags) for (const [x] of p.points) assert.ok(Math.abs(x) <= gate.poleHalf + .01 && Math.abs(x) > 1, `${gate.path}: flag hangs inward from its pole (${x})`);
    }
    const ramp = await primitivesOf(a.track.kicker.path), top = ramp.flatMap(p => p.points).reduce((m, q) => q[1] > m[1] ? q : m);
    assert.equal(a.track.kicker.flip, true); assert.ok(top[2] < 0, `${id}: the pack's ramp rises toward -Z`); assert.deepEqual([...a.track.kicker.box], [4, 1.8, 6]);
    for (const l of a.landmarks) { const parts = await primitivesOf(l.path); assert.ok(Math.min(...parts.map(p => p.min[1])) >= -.01 && Math.max(...parts.map(p => p.max[1])) > 2, l.path); assert.ok(l.height > 2 && l.spacing[0] > 20 && l.offset[0] >= 8, l.path); }
  }
});

test('offline: every league module is in the shell; every theme file exists and is in the league group (the pack) or the ski group (shipped fallbacks), both within budget', async () => {
  const manifest = JSON.parse(await readFile(new URL('offline-manifest.json', root), 'utf8')), shell = await buildShell();
  assert.deepEqual(manifest.shell, shell, 'run node workout/island/tools/offline-shell.mjs');
  for (const f of ['minigames/alpine-league-core.mjs', 'minigames/alpine-league-stages.mjs', 'minigames/alpine-league-result.mjs', 'minigames/alpine-league-store.mjs', 'minigames/alpine-league-island.mjs', 'minigames/alpine-league-ghost.mjs', 'minigames/alpine-league-theme.mjs', 'minigames/alpine-league-look.mjs', 'minigames/alpine-league.css', 'ui/alpine-league.mjs', 'ui/alpine-league.css'])
    assert.ok(manifest.shell.includes(f), f);
  assert.deepEqual(manifest.games.alpineLeague, leagueOfflineFiles(), 'run node workout/island/tools/alpine-league-offline.mjs');
  assert.equal(OFFLINE_GAMES.alpineLeague, 'ליגת הסקי');
  const ski = new Set(manifest.games.alpine), league = new Set(manifest.games.alpineLeague);
  for (const id of THEME_IDS) {
    assert.ok(themePackFiles(id).length >= 9, `${id} uses the Codex pack`);
    for (const f of themeAssetFiles(id)) { await stat(new URL(f, root)); assert.ok(f.startsWith(THEME_DIR) ? league.has(f) : ski.has(f), `${f} (${id}) is listed`); }
  }
  // Runtime files only: no previews, review sheets, sources or the reference skier from design/, no inventory or licence text.
  for (const f of league) assert.match(f, /^assets\/alpine-themes-v23\/(pine|ice|lava|aurora|village|peak)\/[a-z-]+\.(glb|webp|png)$/, f);
  const size = async list => { let n = 0; for (const f of list) n += (await stat(new URL(f, root))).size; return n; };
  const skiBytes = await size(manifest.games.alpine), leagueBytes = await size(manifest.games.alpineLeague);
  assert.ok(skiBytes < 8_500_000, `games.alpine ${skiBytes} bytes`); assert.ok(leagueBytes < 1_200_000, `games.alpineLeague ${leagueBytes} bytes`);
});

test('the island UI wires the league behind the flag; screens are Hebrew and never use exclamation marks', async () => {
  const activity = await readFile(new URL('ui/activity.mjs', root), 'utf8'), screens = await readFile(new URL('ui/alpine-league.mjs', root), 'utf8');
  assert.match(activity, /if\(id==='alpineRush'&&this\.alpineLeagueOn\(\)\)this\.alpineLeagueCard\(outer\)/);
  assert.match(activity, /if\(id==='alpineRush'&&result\.alpineLeague\)\{this\.alpineLeagueResult/); assert.match(activity, /alpineLeague:rescue\.alpineLeague/);
  for (const text of [...screens.matchAll(/'([^'\n]*[֐-׿][^'\n]*)'/g)].map(m => m[1])) assert.doesNotMatch(text, /!/, text);
  assert.doesNotMatch(screens + activity, /[؀-ۿ]/, 'no Arabic letters');
});
