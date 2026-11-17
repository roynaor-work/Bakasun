import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = resolve(process.env.REVIEW_FIX_ROOT || process.cwd());
const url = p => pathToFileURL(resolve(root, 'workout/island', p));
const sessionModule = await import(url('minigames/alpine-session.mjs'));
const {withoutV241} = await import(url('minigames/alpine-v241.mjs'));
const {leagueBalance} = await import(url('minigames/alpine-league-stages.mjs'));
const {createAlpineEngine} = await import(url('minigames/alpine-engine.mjs'));
const {loadRecords, recordRun} = await import(url('minigames/alpine-records.mjs'));
const {GHOST_KEY, loadGhost, saveGhost} = await import(url('minigames/alpine-league-ghost.mjs'));
const {installAlpineLeague} = await import(url('minigames/alpine-league-island.mjs'));
const League = await import(url('minigames/alpine-league-core.mjs'));
const {LEAGUE_KEY, saveLeague} = await import(url('minigames/alpine-league-store.mjs'));
const {createKidBot} = await import(url('tools/alpine-league-bot.mjs'));
const {leagueCard} = await import(url('ui/alpine-league.mjs'));
const base = JSON.parse(await readFile(url('data/config.json'), 'utf8')).minigames.alpineRush;
const memory = () => { const entries = new Map(); return {entries, getItem: k => entries.get(k) ?? null, setItem: (k, v) => entries.set(k, String(v))}; };
const ghost = ms => ({v: 1, step: .25, ms, d: [0, 0, 0, 50, 20, 0]});
const result = (trackId, ms, seed) => ({trackId, elapsedMs: ms, rank: 1, completed: true, runId: `alpine-${trackId}-${seed}-1`});
const balance = leagueBalance(base, 1), legacy = leagueBalance(withoutV241(base), 1), stage = 4, trackId = balance.levels[stage - 1].trackId;
function session(storage, search = '') {
  const saved = globalThis.location; globalThis.location = {search};
  try { return sessionModule.runAlpineSession({balance: base, level: stage, seed: 8, storage, debug: true, equipment: {}, power: 1,
    alpineLeague: {n: 1, theme: 'peak', goals: []}, finish: () => ({ok: true}), cancel() {}}); }
  finally { if (saved === undefined) delete globalThis.location; else globalThis.location = saved; }
}

test('V241-012: the actual session excludes old-course times and ghosts and restores them on rollback', () => {
  const storage = memory(), oldResult = result(trackId, 59931, 7);
  assert.ok(recordRun(storage, legacy.records, loadRecords(storage, legacy.records), oldResult).recorded);
  assert.ok(saveGhost(storage, 1, ghost(oldResult.elapsedMs)).saved);
  const legacyBytes = new Map(storage.entries);
  const current = session(storage);
  try {
    assert.equal(current.snapshot.records.best, null, 'the v24 best must not be compared against the v24.1 course');
    assert.equal(current.snapshot.league.ghost, null, 'the v24 ghost must not ride through new hazards');
    console.log(JSON.stringify({case: 'session-new-ruleset', best: current.snapshot.records.best, ghost: current.snapshot.league.ghost}));
  } finally { current.dispose(); }
  for (const query of ['?alpineV241=0', '?alpineHistoryFix=0']) {
    const old = session(storage, query);
    try { assert.equal(old.snapshot.records.best.ms, oldResult.elapsedMs); assert.equal(old.snapshot.league.ghost.ms, oldResult.elapsedMs); }
    finally { old.dispose(); }
  }
  assert.deepEqual(storage.entries, legacyBytes, 'merely loading either ruleset never edits old history');
});

test('V241-012: records and ghosts write into matching course/physics namespaces, without altering legacy bytes', () => {
  assert.equal(typeof sessionModule.alpineHistoryStorage, 'function');
  const storage = memory(), engine = createAlpineEngine({balance, stage, seed: 8});
  const space = sessionModule.alpineHistoryStorage(storage, balance, engine.course, '');
  const oldResult = result(trackId, 59931, 7), nextResult = result(trackId, 56171, 8);
  recordRun(storage, legacy.records, loadRecords(storage, legacy.records), oldResult); saveGhost(storage, 1, ghost(oldResult.elapsedMs));
  const oldRecordBytes = storage.getItem(legacy.records.storageKey), oldGhostBytes = storage.getItem(GHOST_KEY);
  assert.equal(loadRecords(space, balance.records).status, 'empty'); assert.equal(loadGhost(space, 1), null);
  assert.ok(recordRun(space, balance.records, loadRecords(space, balance.records), nextResult).recorded);
  assert.ok(saveGhost(space, 1, ghost(nextResult.elapsedMs)).saved);
  const reload = session(storage);
  try { assert.equal(reload.snapshot.records.best.ms, nextResult.elapsedMs); assert.equal(reload.snapshot.league.ghost.ms, nextResult.elapsedMs); }
  finally { reload.dispose(); }
  for (const query of ['?alpineAir=0', '?alpineFall=0']) {
    const differentRules = session(storage, query);
    try { assert.equal(differentRules.snapshot.records.best, null, query); assert.equal(differentRules.snapshot.league.ghost, null, query); }
    finally { differentRules.dispose(); }
  }
  const presentationOnly = session(storage, '?alpineYawFix=0&dev=1');
  try { assert.equal(presentationOnly.snapshot.records.best.ms, nextResult.elapsedMs); assert.equal(presentationOnly.snapshot.league.ghost.ms, nextResult.elapsedMs); }
  finally { presentationOnly.dispose(); }
  assert.equal(storage.getItem(legacy.records.storageKey), oldRecordBytes); assert.equal(storage.getItem(GHOST_KEY), oldGhostBytes);
  const otherCourse = structuredClone(engine.course); otherCourse.objects[0].x += .1;
  const changedCourse = sessionModule.alpineHistoryStorage(storage, balance, otherCourse, '');
  assert.equal(loadRecords(changedCourse, balance.records).status, 'empty'); assert.equal(loadGhost(changedCourse, 1), null);
  const otherPhysics = structuredClone(balance); otherPhysics.physics.baseSpeed *= .9;
  const changedRules = sessionModule.alpineHistoryStorage(storage, otherPhysics, engine.course, '');
  assert.equal(loadRecords(changedRules, balance.records).status, 'empty'); assert.equal(loadGhost(changedRules, 1), null);
  assert.equal(sessionModule.alpineHistoryStorage(storage, legacy, engine.course, ''), storage);
  assert.equal(sessionModule.alpineHistoryStorage(storage, balance, engine.course, '?alpineHistoryFix=0'), storage);
  space.setItem(balance.records.storageKey, '{damaged');
  assert.equal(loadRecords(space, balance.records).status, 'corrupt');
  assert.equal(space.getItem(balance.records.storageKey + '.corrupt'), '{damaged');
  assert.equal(storage.getItem(legacy.records.storageKey), oldRecordBytes, 'corrupt backup also stays inside its ruleset');
  console.log(JSON.stringify({keys: [...storage.entries.keys()], oldMs: oldResult.elapsedMs, newMs: nextResult.elapsedMs}));
  engine.dispose();
});

// The map's DOM contract needs only tree/text operations. Render the real UI with
// these small elements; do not copy its record-selection logic into the test.
function renderMap(engine) {
  class Element {
    constructor(tag) { this.tagName = tag; this.className = ''; this.children = []; this.dataset = {}; this.style = {setProperty() {}}; this._text = ''; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(c => typeof c === 'string' ? c : c.textContent).join(''); }
    setAttribute() {}
    append(...children) { for (const c of children) { this.children.push(c); if (typeof c !== 'string') c.parentElement = this; } }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    replaceWith(next) { const p = this.parentElement; if (!p) return; const i = p.children.indexOf(this); p.children[i] = next; next.parentElement = p; }
  }
  const saved = globalThis.document;
  globalThis.document = {head: new Element('head'), createElement: tag => new Element(tag), querySelector: () => null};
  try {
    const card = leagueCard({engine, go() {}, season() {}, shop() {}, refresh() {}}), times = [];
    const visit = n => { if (typeof n === 'string') return; if (n.className.split(' ').includes('al-stage-best')) times.push(n.textContent); n.children.forEach(visit); };
    visit(card); return times;
  } finally { if (saved === undefined) delete globalThis.document; else globalThis.document = saved; }
}
function islandLeague(storage, search = '') {
  const saved = globalThis.location; globalThis.location = {search};
  try {
    const engine = {registry: {minigames: new Map([['alpineRush', {}]])}};
    installAlpineLeague(engine, {storage, config: {minigames: {alpineRush: base}}, flags: {minigames: true, alpineRush: true}});
    return engine;
  } finally { if (saved === undefined) delete globalThis.location; else globalThis.location = saved; }
}

test('V241-012: the real league map isolates times and finishing a new run preserves old timing, stars, gear and progress', () => {
  const storage = memory(), oldState = League.createLeague(), order = ['player', 'rival-1', 'rival-2', 'rival-3', 'rival-4', 'rival-5'];
  League.applyStage(oldState, {n: 1, passed: true, stars: 2, place: 1, ms: 59931, completed: true, coins: 20, order});
  oldState.gear = {skis: 1, helmet: 1, goggles: 1}; assert.ok(saveLeague(storage, oldState).ok);
  const legacyBytes = storage.getItem(LEAGUE_KEY), island = islandLeague(storage), api = island.alpineLeague;
  assert.equal(api.stage(1).best.ms, 0, 'map data must not label the legacy time as a current-course record');
  assert.deepEqual(renderMap(island), [], 'the actual card must omit the unmatched old time');
  assert.equal(api.stage(1).best.stars, 2); assert.deepEqual(api.state.gear, oldState.gear); assert.equal(api.state.stage, oldState.stage);
  assert.equal(storage.getItem(LEAGUE_KEY), legacyBytes, 'viewing the map never migrates or edits progress');
  for (const query of ['?alpineHistoryFix=0', '?alpineV241=0']) {
    const rollback = islandLeague(storage, query);
    assert.equal(rollback.alpineLeague.stage(1).best.ms, 59931); assert.deepEqual(renderMap(rollback), ['0:59.93']);
  }
  const equipment = League.equipmentFor(oldState.gear), race = createAlpineEngine({balance, stage, seed: 8, equipment, power: 1});
  const bot = createKidBot({seed: 31, physics: balance.physics}); race.command({type: 'start'});
  try {
    for (let f = 0; f < 60 * 250 && race.phase !== 'finished'; f++) {
      const snap = race.snapshot(); if (snap.phase === 'racing') { const d = bot.decide(snap); race.command({type: 'steer', value: d.steer}); if (d.boost) race.command({type: 'boost'}); if (d.trick) race.command({type: 'trick', id: d.trick}); } race.step(1 / 60);
    }
    const r = race.snapshot().result, stats = race.leagueStats(); assert.ok(r?.completed, 'exercise a real validated race');
    const done = api.finish({outcome: r.won ? 'win' : 'lose', score: r.score, alpine: r, league: {order: stats.order, gates: stats.gates}},
      {level: stage, seed: 8, equipment, power: 1, alpineLeague: {n: 1}});
    assert.ok(done, 'the actual league settlement accepts the race');
    const stored = JSON.parse(storage.getItem(LEAGUE_KEY));
    assert.equal(stored.best[1].ms, 59931, 'new rules never overwrite the v24 timing field');
    assert.equal(stored.stage, oldState.stage); assert.deepEqual(stored.gear, oldState.gear);
    assert.ok(stored.best[1].stars >= oldState.best[1].stars); assert.equal(stored.runs, oldState.runs + 1);
    assert.equal(api.stage(1).best.ms, r.elapsedMs);
    assert.equal(renderMap(island).length, 1, 'the new record now appears in the real card');
    const current = session(storage); try { assert.equal(current.snapshot.records.best.ms, r.elapsedMs); } finally { current.dispose(); }
    const rollback = islandLeague(storage, '?alpineHistoryFix=0'); assert.deepEqual(renderMap(rollback), ['0:59.93']);
    console.log(JSON.stringify({case: 'real-league-card-and-settlement', oldMs: stored.best[1].ms, newMs: api.stage(1).best.ms, stage: stored.stage, gear: stored.gear, stars: stored.best[1].stars}));
  } finally { race.dispose(); }
});
