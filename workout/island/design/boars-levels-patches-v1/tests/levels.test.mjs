import test from 'node:test';
import assert from 'node:assert/strict';
import {freshSave, sanitizeSave, enemyStats, weaponStats, wavePlan, waveWeather, waveBoss, ENEMIES, WEAPON_ORDER, fam} from '../../../minigames/boar-island/chain.mjs';
import {LEVELS, WEATHERS, WEATHER_OVERRIDES, WEAPON_UPGRADES, levelFor, levelPlan,
  levelEnemyStats, levelWeather, sanitizeProgress, completeLevel, upgradeStatus,
  buyLevelUpgrade, applyWeaponUpgrades} from '../../../minigames/boar-island/levels.mjs';

test('all twenty levels have a Hebrew title, a valid deterministic plan and their scheduled boss', () => {
  const ids = Array.from({length:20}, (_, i) => i + 1);
  assert.deepEqual(LEVELS.map(level => level.id), ids);
  for (const level of LEVELS) {
    const n = level.id;
    assert.equal(levelFor(n).id, n);
    assert.match(level.name, /[א-ת]/u);
    assert.ok(Object.hasOwn(WEATHERS, levelWeather(n)));
    const plan = levelPlan(n);
    assert.deepEqual(plan, levelPlan(n));
    assert.ok(plan.length > 0);
    assert.ok(plan.every((e, i) => Object.hasOwn(ENEMIES, e.kind) && Number.isFinite(e.time) &&
      e.time >= 0 && (i === 0 || e.time >= plan[i - 1].time)));
    if (waveBoss(n)) assert.equal(plan.filter(e => e.kind === waveBoss(n)).length, 1);
    for (const kind of new Set(plan.map(e => e.kind))) {
      const enemy = levelEnemyStats(kind, n);
      for (const key of ['hp', 'speed', 'damage', 'armor', 'reward']) {
        assert.ok(Number.isFinite(enemy[key]) && enemy[key] >= 0, [n, kind, key].join(' '));
      }
    }
  }
  assert.equal(levelFor(0), null);
  assert.equal(levelFor(21), null);
  for (const n of [21, 25, 43]) {
    assert.deepEqual(levelPlan(n), wavePlan(n));
    assert.deepEqual(levelEnemyStats('scout', n), enemyStats('scout', n));
    assert.equal(levelWeather(n), waveWeather(n));
  }
});

test('new weather profiles participate in campaign play and differ from clear skies', () => {
  const kinds = new Set(LEVELS.map(({id}) => levelWeather(id)));
  assert.equal(Object.keys(WEATHERS).length, 6);
  assert.deepEqual(kinds, new Set(Object.keys(WEATHERS)));
  for (const id of ['heat', 'breeze']) {
    assert.ok(kinds.has(id));
    assert.match(WEATHERS[id].name, /[א-ת]/u);
    assert.match(WEATHERS[id].rule, /[א-ת]/u);
    assert.ok(WEATHERS[id].cooling > 0);
    assert.ok(WEATHER_OVERRIDES[id]);
    assert.notDeepEqual(WEATHERS[id], WEATHERS.clear);
  }
});

test('a win unlocks the next level once. A locked level and a replay do not advance progress', () => {
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
  assert.equal(progress.unlocked, 20);
  assert.deepEqual(progress.cleared, LEVELS.map(l => l.id));
  assert.equal(completeLevel(progress, 21), false);
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
  const endless = sanitizeProgress(null, sanitizeSave({...freshSave(), bestWave:30, nextWave:31}));
  assert.equal(endless.unlocked, 20);
  assert.equal(endless.cleared.length, 20);
  assert.deepEqual(sanitizeProgress(JSON.parse(JSON.stringify(endless)), freshSave()), endless);
});

test('weapon upgrades enforce unlock, ownership and wallet checks, deduct once, and only affect their weapon', () => {
  const save = freshSave();
  const progress = sanitizeProgress(null, save);
  const id = 'mg-jacket';
  const upgrade = WEAPON_UPGRADES.find(u => u.id === id);
  assert.ok(upgrade);
  assert.equal(upgradeStatus(progress, save, id), 'locked');
  assert.equal(buyLevelUpgrade(progress, save, id), false);
  assert.equal(completeLevel(progress, 1), true);
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
    if (fam(key) === 'mg') assert.ok(stats.heatPerShot < stock.heatPerShot);
    else assert.deepEqual(stats, before);
    assert.deepEqual(stock, before, 'base weapon definition is immutable');
  }
  const unknown = 'unknown-upgrade';
  assert.equal(buyLevelUpgrade(progress, save, unknown), false);
  assert.deepEqual(sanitizeProgress({...progress, upgrades:[id, id, unknown]}, save), progress);
  const allUnlocked = sanitizeProgress(null, {...save, bestWave:20, nextWave:21});
  save.coins = 100000;
  for (const item of WEAPON_UPGRADES.filter(item => item.weapon !== 'mg')) {
    assert.equal(upgradeStatus(allUnlocked, save, item.id), 'locked');
  }
});

test('the difficulty curve changes enemy health and spawn timing throughout the campaign', () => {
  let previous;
  for (const {id, difficulty} of LEVELS) {
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
  assert.ok(previous.hp > LEVELS[0].difficulty.hp);
  assert.ok(previous.gap < LEVELS[0].difficulty.gap);
});

test('each purchased upgrade changes its stated stat on all three weapons of that family', () => {
  assert.equal(WEAPON_UPGRADES.length, 12);
  assert.equal(new Set(WEAPON_UPGRADES.map(u => u.id)).size, 12);
  for (const family of ['mg', 'shotgun', 'cannon', 'tesla']) {
    assert.equal(WEAPON_UPGRADES.filter(item => item.weapon === family).length, 3);
  }
  for (const item of WEAPON_UPGRADES) {
    const save = freshSave();
    for (const key of WEAPON_ORDER) save.weapons[key] = 1;
    const progress = sanitizeProgress(null, {...save, bestWave:20, nextWave:21});
    save.coins = item.cost;
    assert.ok(buyLevelUpgrade(progress, save, item.id));
    for (const key of WEAPON_ORDER) {
      const original = weaponStats(save, key);
      const expected = {...original};
      if (fam(key) === item.weapon) expected[item.stat] = expected[item.stat] * (item.multiplier ?? 1) + (item.add ?? 0);
      assert.deepEqual(applyWeaponUpgrades(original, progress, key), expected);
    }
  }
});

test('weather transitions update real sky, water and fog values, and can return to clear', async () => {
  const {Color} = await import('../../../minigames/boar-island/vendor/three.module.js');
  const {createCampaignWeather} = await import('../../../minigames/boar-island/levels-weather.js');
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
  for (const key of ['heat','breeze']) {
    weather.set(key);
    for (let i=0; i<180; i++) weather.update(1/30);
    assert.equal(weather.kind,key);
    assert.equal(calls.at(-1),WEATHER_OVERRIDES[key].base);
    assert.notEqual(scene.fog.color.getHex(),0xffffff);
    assert.notEqual(world.sky.top.value.getHex(),0xffffff);
    assert.ok(Math.abs(world.seaU.uChop.value - WEATHER_OVERRIDES[key].chop) < 0.001);
    weather.set('clear',true);
    weather.update(1/30);
    assert.equal(weather.kind,'clear');
    assert.equal(world.seaU.uChop.value,0);
    assert.equal(scene.fog.color.getHex(),0xffffff);
  }
});
