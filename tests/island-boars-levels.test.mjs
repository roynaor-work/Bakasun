// Boar island campaign (20/11/2026): the Codex integration patch boars-levels-patches-v1 (stages 1-20)
// plus the real design package codex/boars-levels-v1 (stages 21-40, six weather looks, 12 upgrades).
// Ported from design/boars-levels-patches-v1/tests/levels.test.mjs; the 20-stage and provisional-upgrade
// expectations moved to the 40-stage campaign on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshSave, sanitizeSave, enemyStats, weaponStats, wavePlan, waveWeather, waveBoss, waveBonus, ENEMIES, WEAPONS, WEAPON_ORDER, isBoss} from '../workout/island/minigames/boar-island/chain.mjs';
import {LEVELS, CHAPTERS, WEATHERS, WEATHER_OVERRIDES, WEATHER_LAYERS, WEAPON_UPGRADES, levelFor, levelPlan,
  levelEnemyStats, levelWeather, sanitizeProgress, completeLevel, upgradeStatus,
  buyLevelUpgrade, applyWeaponUpgrades} from '../workout/island/minigames/boar-island/levels.mjs';
import {BOARS_V1} from '../workout/island/minigames/boar-island/levels-v1-data.mjs';

const island = new URL('../workout/island/', import.meta.url);
const source = JSON.parse(readFileSync(new URL('../workout/island/offline-manifest.json', import.meta.url), 'utf8'));

test('forty stages: 1-20 on the existing waves, 21-40 from boars-levels-v1, then the endless waves', () => {
  assert.deepEqual(LEVELS.map(level => level.id), Array.from({length:40}, (_, i) => i + 1));
  for (const level of LEVELS) {
    const n = level.id;
    assert.equal(levelFor(n).id, n);
    assert.match(level.name, /[א-ת]/u);
    assert.ok(Object.hasOwn(WEATHERS, levelWeather(n)), n + ' weather');
    const plan = levelPlan(n);
    assert.deepEqual(plan, levelPlan(n));
    assert.ok(plan.length > 0);
    assert.ok(plan.every((e, i) => Object.hasOwn(ENEMIES, e.kind) && Number.isFinite(e.time) &&
      e.time >= 0 && (i === 0 || e.time >= plan[i - 1].time)), n + ' plan order');
    if (n <= 20 && waveBoss(n)) assert.equal(plan.filter(e => e.kind === waveBoss(n)).length, 1);
    for (const kind of new Set(plan.map(e => e.kind))) {
      const enemy = levelEnemyStats(kind, n);
      for (const key of ['hp', 'speed', 'damage', 'armor', 'reward']) {
        assert.ok(Number.isFinite(enemy[key]) && enemy[key] >= 0, [n, kind, key].join(' '));
      }
    }
  }
  assert.equal(levelFor(0), null);
  assert.equal(levelFor(41), null);
  for (const n of [41, 45, 60]) {
    assert.deepEqual(levelPlan(n), wavePlan(n));
    assert.deepEqual(levelEnemyStats('scout', n), enemyStats('scout', n));
    assert.equal(levelWeather(n), waveWeather(n));
  }
});

test('stages 21-40 follow the package: chapters, three attacks, lanes, timing, bosses and multipliers', () => {
  assert.deepEqual(CHAPTERS.map(c => [c.firstStage, c.lastStage]), [[21,25],[26,30],[31,35],[36,40]]);
  const windows = [];
  for (const data of BOARS_V1.levels) {
    const n = data.stage, level = levelFor(n), plan = levelPlan(n), d = data.difficulty;
    assert.equal(level.chapter, CHAPTERS.find(c => c.firstStage <= n && n <= c.lastStage).name);
    assert.equal(plan.length, 41 + 2 * (n - 20), n + ' planned enemies');
    assert.deepEqual(plan.filter(e => e.pulse).map(e => e.pulse), [2, 3]);
    assert.ok(plan.every(e => Array.isArray(e.lane) && e.lane.length === 3), n + ' lanes');
    windows.push(plan.at(-1).time);
    assert.equal(d.clearBonus, waveBonus(n));
    const bosses = plan.filter(e => isBoss(e.kind));
    assert.equal(bosses.length, data.objective.boss ? 1 : 0);
    if (data.objective.boss) {
      assert.equal(bosses[0].kind, data.objective.boss);
      assert.equal(levelEnemyStats(data.objective.boss, n).hp, d.bossHp);
    }
    const ref = enemyStats('heavy', 20), heavy = levelEnemyStats('heavy', n);
    assert.equal(heavy.hp, Math.round(ref.hp * d.hp));
    assert.equal(heavy.speed, ref.speed * d.speed);
    assert.equal(heavy.reward, ref.reward);
  }
  assert.equal(windows[0], 62.5);
  assert.ok(Math.abs(windows.at(-1) - 81.12) < .011);
});

test('nine weather profiles: the four original, heat and breeze from the patch, snow, night and sunset from the package', () => {
  const kinds = new Set(LEVELS.map(({id}) => levelWeather(id)));
  assert.deepEqual(Object.keys(WEATHERS).sort(), ['breeze','clear','fog','heat','night','rain','snow','storm','sunset']);
  assert.deepEqual(kinds, new Set(Object.keys(WEATHERS)));
  for (const id of ['heat', 'breeze']) {
    assert.match(WEATHERS[id].rule, /[א-ת]/u);
    assert.ok(WEATHERS[id].cooling > 0);
    assert.notDeepEqual(WEATHERS[id], WEATHERS.clear);
  }
  for (const id of ['heat', 'breeze', 'snow', 'night', 'sunset']) {
    assert.match(WEATHERS[id].name, /[א-ת]/u);
    assert.equal(WEATHER_OVERRIDES[id].base, 'clear');
  }
  for (const id of ['snow', 'night', 'sunset']) assert.deepEqual({cooling:WEATHERS[id].cooling, chain:WEATHERS[id].chain}, {cooling:1, chain:0});
  assert.deepEqual(Object.keys(WEATHER_LAYERS).sort(), ['fog','night','rain','snow','storm','sunset']);
  const offline = new Set(source.games.boar);
  for (const files of Object.values(WEATHER_LAYERS)) {
    assert.equal(files.length, 2);
    for (const file of files) {
      assert.ok(readFileSync(new URL(file, island)).length > 1000, file);
      assert.ok(offline.has(file), file + ' is in the boar offline pack');
    }
  }
});

test('a win unlocks the next stage once. A locked stage and a replay do not advance progress', () => {
  const progress = sanitizeProgress(null, freshSave());
  assert.deepEqual(progress, {unlocked:1, cleared:[], upgrades:[]});
  assert.equal(completeLevel(progress, 2), false);
  for (const {id} of LEVELS) {
    assert.equal(progress.unlocked, id);
    assert.equal(completeLevel(progress, id), true);
    const afterWin = structuredClone(progress);
    assert.equal(completeLevel(progress, id), false);
    assert.deepEqual(progress, afterWin);
  }
  assert.equal(progress.unlocked, 40);
  assert.deepEqual(progress.cleared, LEVELS.map(l => l.id));
  assert.equal(completeLevel(progress, 41), false);
});

test('migration derives the map from a stock save and retains a completed campaign on reload', () => {
  for (const legacy of [1, 2]) {
    const save = sanitizeSave({version:legacy, bestWave:6, nextWave:7, coins:987, kills:4});
    const before = structuredClone(save);
    const progress = sanitizeProgress(null, save);
    assert.equal(progress.unlocked, 7);
    assert.deepEqual(progress.cleared, [1,2,3,4,5,6]);
    assert.deepEqual(save, before);
  }
  const midway = sanitizeProgress(null, sanitizeSave({...freshSave(), bestWave:30, nextWave:31}));
  assert.equal(midway.unlocked, 31);
  assert.equal(midway.cleared.length, 30);
  const endless = sanitizeProgress(null, sanitizeSave({...freshSave(), bestWave:55, nextWave:56}));
  assert.equal(endless.unlocked, 40);
  assert.equal(endless.cleared.length, 40);
  assert.deepEqual(sanitizeProgress(JSON.parse(JSON.stringify(endless)), freshSave()), endless);
});

test('weapon upgrades enforce stage, ownership and wallet checks, deduct once, and only affect their own weapon', () => {
  const save = freshSave();
  const progress = sanitizeProgress(null, {...save, bestWave:20, nextWave:21});
  const id = 'reef-choke';
  const upgrade = WEAPON_UPGRADES.find(u => u.id === id);
  assert.equal(upgrade.weapon, 'shotgun');
  assert.equal(upgrade.minLevel, 21);
  save.coins = 100000;
  assert.equal(upgradeStatus(progress, save, id), 'locked', 'shotgun not owned');
  save.weapons.shotgun = 1;
  const early = sanitizeProgress(null, {...save, bestWave:19, nextWave:20});
  assert.equal(upgradeStatus(early, save, id), 'locked', 'stage 21 not reached');
  save.coins = upgrade.cost - 1;
  assert.equal(upgradeStatus(progress, save, id), 'funds');
  assert.equal(buyLevelUpgrade(progress, save, id), false);
  assert.equal(save.coins, upgrade.cost - 1);
  save.coins = upgrade.cost;
  assert.equal(upgradeStatus(progress, save, id), 'available');
  assert.equal(buyLevelUpgrade(progress, save, id), true);
  assert.equal(upgradeStatus(progress, save, id), 'owned');
  assert.equal(buyLevelUpgrade(progress, save, id), false);
  assert.equal(save.coins, 0);
  assert.deepEqual(progress.upgrades, [id]);
  for (const key of WEAPON_ORDER) {
    const stock = weaponStats(save, key);
    const before = structuredClone(stock);
    const stats = applyWeaponUpgrades(stock, progress, key);
    if (key === 'shotgun') assert.ok(stats.spread < stock.spread);
    else assert.deepEqual(stats, before, key + ' is untouched (shotgun2 and shotgun3 too)');
    assert.deepEqual(stock, before, 'base weapon definition is immutable');
  }
  const unknown = 'unknown-upgrade';
  assert.equal(buyLevelUpgrade(progress, save, unknown), false);
  assert.deepEqual(sanitizeProgress({...progress, upgrades:[id, id, unknown]}, save), progress);
});

test('the 12 package upgrades: two per V2 weapon, each changes its stated stat on that weapon only', () => {
  assert.equal(WEAPON_UPGRADES.length, 12);
  assert.equal(new Set(WEAPON_UPGRADES.map(u => u.id)).size, 12);
  for (const key of ['shotgun', 'cannon', 'shotgun2', 'cannon2', 'shotgun3', 'cannon3']) {
    assert.equal(WEAPON_UPGRADES.filter(item => item.weapon === key).length, 2, key);
  }
  for (const item of WEAPON_UPGRADES) {
    assert.ok(Object.hasOwn(WEAPONS[item.weapon], item.stat), item.id + ' stat exists');
    assert.ok(item.minLevel >= 21 && item.minLevel <= 40);
    assert.ok(readFileSync(new URL(item.icon, island)).toString().includes('<svg'), item.icon);
    assert.ok(source.games.boar.includes(item.icon), item.icon + ' offline');
    const save = freshSave();
    for (const key of WEAPON_ORDER) save.weapons[key] = 1;
    const progress = sanitizeProgress(null, {...save, bestWave:40, nextWave:41});
    save.coins = item.cost;
    assert.ok(buyLevelUpgrade(progress, save, item.id));
    for (const key of WEAPON_ORDER) {
      const original = weaponStats(save, key);
      const expected = {...original};
      if (key === item.weapon) expected[item.stat] = expected[item.stat] * (item.multiplier ?? 1) + (item.add ?? 0);
      assert.deepEqual(applyWeaponUpgrades(original, progress, key), expected);
    }
  }
});

test('stages 1-20 keep the patch difficulty curve against the existing waves', () => {
  let previous;
  for (const {id, difficulty} of LEVELS.slice(0, 20)) {
    const stock = enemyStats('scout', id);
    const campaign = levelEnemyStats('scout', id);
    assert.equal(campaign.hp, Math.round(stock.hp * difficulty.hp));
    assert.equal(campaign.speed, stock.speed * difficulty.speed);
    const originalPlan = wavePlan(id);
    const plan = levelPlan(id);
    assert.deepEqual(plan.map(e => e.kind), originalPlan.map(e => e.kind));
    assert.deepEqual(plan.map(e => e.time), originalPlan.map(e => Math.round(e.time * difficulty.gap * 100) / 100));
    if (previous) {
      for (const k of ['hp', 'damage', 'speed']) assert.ok(difficulty[k] >= previous[k]);
      assert.ok(difficulty.gap <= previous.gap);
    }
    previous = difficulty;
  }
  let prev;
  for (const {difficulty} of LEVELS.slice(20)) {
    if (prev) {
      for (const k of ['hp', 'damage', 'speed']) assert.ok(difficulty[k] >= prev[k]);
      assert.ok(difficulty.spawnGap < prev.spawnGap && difficulty.interWave < prev.interWave);
    }
    prev = difficulty;
  }
});

test('weather transitions update real sky, water and fog values, and can return to clear', async () => {
  const {Color} = await import('../workout/island/minigames/boar-island/vendor/three.module.js');
  const {createCampaignWeather} = await import('../workout/island/minigames/boar-island/levels-weather.js');
  const uniform = () => ({value:new Color()});
  const scene = {fog:{color:new Color(), density:0}};
  const world = {
    hemi:{color:new Color()}, sun:{color:new Color()},
    sky:{top:uniform(),mid:uniform(),horizon:uniform()},
    seaU:{fogColor:uniform(),skyTop:uniform(),skyHor:uniform(),uFog:{value:0},uChop:{value:0}},
    mountain:{color:new Color()},
  };
  const reset = () => {
    scene.fog.color.set('#ffffff');
    scene.fog.density = 0;
    world.sky.top.value.set('#ffffff');
    world.seaU.uChop.value = 0;
  };
  const calls = [];
  const base = {set(key){calls.push(key);reset();},update:reset,strike(){},flash:0};
  const weather = createCampaignWeather(base, {scene,world});
  for (const key of ['heat','breeze','sunset','night','snow']) {
    weather.set(key);
    for (let i=0; i<180; i++) weather.update(1/30);
    assert.equal(weather.kind,key);
    assert.equal(calls.at(-1),WEATHER_OVERRIDES[key].base);
    assert.notEqual(scene.fog.color.getHex(),0xffffff);
    assert.notEqual(world.sky.top.value.getHex(),0xffffff);
    if (WEATHER_OVERRIDES[key].chop !== undefined) assert.ok(Math.abs(world.seaU.uChop.value - WEATHER_OVERRIDES[key].chop) < 0.001);
    weather.set('clear',true);
    weather.update(1/30);
    assert.equal(weather.kind,'clear');
    assert.equal(world.seaU.uChop.value,0);
    assert.equal(scene.fog.color.getHex(),0xffffff);
  }
});

test('?boarsLevels=20 keeps only the patch campaign (20 stages, provisional family upgrades)', async () => {
  const {execFileSync} = await import('node:child_process');
  const url = new URL('../workout/island/minigames/boar-island/levels.mjs', import.meta.url).href;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e',
    `globalThis.location={search:'?boarsLevels=20'};const m=await import(${JSON.stringify(url)});` +
    `console.log(JSON.stringify({n:m.LEVELS.length,u:m.WEAPON_UPGRADES.length,mg:m.WEAPON_UPGRADES.filter(x=>x.weapon==='mg').length,only:m.PATCH_ONLY,l21:m.levelFor(21)}))`]).toString();
  assert.deepEqual(JSON.parse(out), {n:20, u:12, mg:3, only:true, l21:null});
});
