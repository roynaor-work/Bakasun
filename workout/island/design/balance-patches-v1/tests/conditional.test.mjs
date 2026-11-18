import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';

const island = process.env.BALANCE_SOURCE_ROOT
  ? pathToFileURL(resolve(process.env.BALANCE_SOURCE_ROOT, 'workout/island') + '/')
  : new URL('../../../', import.meta.url);
const load = path => import(new URL(path, island));
const {minigames} = JSON.parse(await readFile(new URL('data/config.json', island), 'utf8'));

function setQuery(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else delete globalThis.location;
  });
  return search => Object.defineProperty(globalThis, 'location', {
    configurable: true, value: new URL(search, 'https://example.test/'),
  });
}

test('quick quarters use the same timing for the clock and strict result validation', async t => {
  const query = setQuery(t);
  const [{loadData}, {createHoopsEngine}, {initialHoops, matchTeams}, {hoopsResult}] = await Promise.all([
    load('engine/load-data.mjs'), load('minigames/hoops-engine.mjs'),
    load('minigames/hoops-franchise.mjs'), load('minigames/hoops-result.mjs'),
  ]);
  // Exercise the app's JSON loading boundary. These clock checks need no extension installers.
  const fetcher = async url => ({
    ok: true, json: async () => url.pathname.endsWith('/data/extensions.json')
      ? {modules: [], records: {}} : JSON.parse(await readFile(url, 'utf8')),
  });
  for (const [search, expected] of [['', 90], ['?balanceHoops=0', 90],
    ['?balanceHoops=true', 90], ['?balanceAlpine=1', 90], ['?label=demo&balanceHoops=1', 45]]) {
    query(search);
    const {config} = await loadData(island, fetcher);
    const balance = config.minigames.streetSlam;
    const expectedRules = structuredClone(minigames.streetSlam.rules);
    expectedRules.profiles.quick.quarterSeconds = expected;
    assert.deepEqual(balance.rules, expectedRules);
    const {teams} = matchTeams(balance, initialHoops(balance), {stage: 1});
    const game = createHoopsEngine({config: balance, teams, profile: 'quick', seed: 1});
    assert.equal(game.snapshot().clock, expected);
    game.dispose();
    const box = teams[0].players.slice(0, 5).map((p, i) => ({
      id: p.id, pts: i === 0 ? 2 : 0, reb: 0, ast: 0, stl: 0, blk: 0, sec: 30,
      fgm: i === 0 ? 1 : 0, fga: i === 0 ? 1 : 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pf: 0, tov: 0,
    }));
    const result = {won: true, scoreFor: 2, scoreAgainst: 0, quarters: 5, overtime: 1,
      profile: 'quick', stage: 1, seed: 1, gameSeconds: 4 * expected + 45,
      gameId: null, opponent: teams[1].id, box, mvp: null};
    const settle = r => hoopsResult({outcome: 'win', score: 2, streetSlam: r}, {level: 1, seed: 1}, balance);
    assert.equal(settle(result)?.outcome, 'win');
    assert.equal(settle({...result, gameSeconds: 4 * expected}), null, 'overtime is required');
    assert.equal(settle({...result, gameSeconds: 4 * (expected === 90 ? 45 : 90) + 45}), null);
  }
});

test('stage 24 changes only the sixth naval fleet row’s HP, including the spawned target', async t => {
  const query = setQuery(t);
  const [{navalCampaignStage}, {createNavalModel}] = await Promise.all([
    load('minigames/naval-campaign.mjs'), load('minigames/naval.mjs'),
  ]);
  const balance = minigames.navalDuel;
  const model = () => createNavalModel({config: {...minigames, height: balance.render.height}, balance, level: 24, seed: 8});
  query('');
  const before = model();
  const original = balance.levels[23].fleet[5];
  assert.equal(original.behavior, 'base');
  assert.equal(original.hpScale, 4);
  const expected = structuredClone(balance);
  expected.levels[23].fleet[5].hpScale = 3;
  const campaign = (b, n) => navalCampaignStage(b, n, 8);
  const stages = balance.levels.map((_, i) => i + 1);
  const targets = stages.map(n => campaign(expected, n));
  for (const flag of ['?balanceNaval=0', '?balanceNaval=true', '?balanceAlien=1']) {
    query(flag);
    assert.equal(campaign(balance, 24).settings.fleet[5].hpScale, 4);
  }
  query('?balanceNaval=1');
  assert.deepEqual(stages.map(n => campaign(balance, n)), targets);
  const after = model();
  assert.equal(after.enemies[5].maxHp, before.enemies[5].maxHp * .75);
  assert.equal(after.enemies[5].cannons, 4);
  assert.equal(after.enemies[5].hp, after.enemies[5].maxHp);
  assert.deepEqual(after.enemies.slice(0, 5), before.enemies.slice(0, 5));
  assert.equal(original.hpScale, 4);
});

test('stage 10 alien lives are set before the regular v9, power and shield modifiers', async t => {
  const query = setQuery(t);
  const {createAlienModel} = await load('minigames/alien-flight-model.mjs');
  const balance = minigames.alienDefense;
  const model = (b, level) => createAlienModel({config: minigames, balance: b, level, random: () => .5,
    power: 1.4, equipment: {shield: 2}, roundChoices: false, completion: 'waves'});
  query('');
  const control = model(balance, 10);
  assert.equal(balance.levels[9].lives, 5);
  for (const search of ['?balanceAlien=0', '?balanceAlien=true', '?balanceNaval=1']) {
    query(search);
    assert.equal(model(balance, 10).maxLives, control.maxLives);
  }
  const expected = structuredClone(balance);
  expected.levels[9].lives = 6;
  for (const stage of [9, 10, 11]) {
    query('');
    const target = model(expected, stage);
    query('?balanceAlien=1');
    const tested = model(balance, stage);
    assert.deepEqual(tested.settings, target.settings);
    assert.equal(tested.maxLives, target.maxLives);
    assert.equal(tested.lives, target.lives);
    if (stage === 10) assert.ok(tested.lives > control.lives);
  }
  assert.equal(balance.levels[9].lives, 5);
});

test('the ski flag changes v24.1 league time stars, including the stage 19 boundary', async t => {
  const query = setQuery(t);
  const {stageGoals, judgeGoals} = await load('minigames/alpine-league-stages.mjs');
  const balance = minigames.alpineRush;
  const legacy = {...balance, physics: {...balance.physics, v241: false}};
  const stages = Array.from({length: 30}, (_, i) => i + 1);
  query('');
  const before = stages.map(n => stageGoals(balance, n));
  const legacyBefore = stages.map(n => stageGoals(legacy, n));
  for (const flag of ['?balanceAlpine=0', '?balanceAlpine=true', '?balanceHoops=1']) {
    query(flag);
    assert.deepEqual(stageGoals(balance, 16), before[15]);
  }
  query('?balanceAlpine=1');
  const after = stages.map(n => stageGoals(balance, n));
  assert.deepEqual(after[0], before[0]);
  assert.deepEqual(stages.map(n => stageGoals(legacy, n)), legacyBefore);
  for (const i of before.keys()) {
    assert.deepEqual([after[i][0], after[i][2]], [before[i][0], before[i][2]]);
    assert.ok(after[i][1].ms >= before[i][1].ms);
  }
  assert.deepEqual([before[15][1].ms, after[15][1].ms], [62500, 63500]);
  assert.deepEqual([before[29][1].ms, after[29][1].ms], [92000, 94000]);
  const race = {completed: true, rank: 1, elapsedMs: 63000, gates: 12, crashes: 0};
  assert.equal(judgeGoals(before[15], race)[1].ok, false);
  assert.equal(judgeGoals(after[15], race)[1].ok, true);
});
