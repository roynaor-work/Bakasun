import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'node:test';
import {navalBattleEnabled} from '../workout/island/minigames/naval-battle.mjs';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';

const island = fileURLToPath(new URL('../workout/island/', import.meta.url));
// v24.5 (main before the naval battle patch): the stock game the URL rollback must reproduce.
const STOCK_COMMIT = '264609c47';
const repo = fileURLToPath(new URL('../', import.meta.url));
const dataPath = 'workout/island/data/config.json';
const modelPath = 'workout/island/minigames/naval.mjs';
const battlePath = 'workout/island/minigames/naval-battle.mjs';
const corePaths = [dataPath, modelPath, battlePath, 'workout/island/minigames/naval-air.mjs', 'workout/island/offline-manifest.json'];
const minigames = JSON.parse(await readFile(join(island, 'data/config.json'), 'utf8')).minigames;
const balance = minigames.navalDuel;
const config = {...minigames, width: balance.render.width, height: balance.render.height};
const dt = .02;

function make(level, options = {}) {
  const seed = options.seed ?? 13;
  return createNavalModel({config, balance, level, seed, random: seededRandom(seed), navalBattle: true, ...options});
}

function liveShips(model) {
  return model.enemies.filter(enemy => enemy.active && enemy.hp > 0 && enemy.behavior !== 'base');
}

function replayInput(frame) {
  const cycle = frame % 67;
  const ammoIndex = [0, 2, 4][Math.floor(frame / 67) % 3];
  const input = {
    ammoIndex,
    moveX: Math.sin(frame / 82) * .55,
    moveZ: frame < 120 ? -.75 : 0,
    aimYaw: Math.sin(frame / 100) * .23,
    aimElevation: 14,
    aimPower: .9,
  };
  if (cycle < 14) input.aimHeld = true;
  if (cycle === 14) input.fireRelease = true;
  return input;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('the URL switch defaults on and disables the battle only for navalBattle=0', () => {
  for (const search of ['', '?navalBattle=1', '?navalAim=v23', '?other=navalBattle%3D0']) {
    assert.equal(navalBattleEnabled(search), true, search);
  }
  assert.equal(navalBattleEnabled('?navalAim=v23&navalBattle=0'), false);
  assert.equal(make(1, {navalBattle: false}).navalBattle, false);
  assert.equal(make(1).navalBattle, true);
  const unconfigured = {...balance};
  delete unconfigured.battleV1;
  const fallback = make(1, {balance: unconfigured});
  assert.equal(fallback.navalBattle, false);
  assert.deepEqual(fallback.snapshot(), make(1, {navalBattle: false}).snapshot());
});

test('a fixed seed and input replay produce the same battle without changing source balance', () => {
  const frozenBalance = deepFreeze(structuredClone(balance));
  const previous = make(21, {seed: 0, navalBattle: false}).snapshot().composition;
  const first = make(21, {seed: 42, previousFleet: previous, balance: frozenBalance});
  const second = make(21, {seed: 42, previousFleet: previous, balance: frozenBalance});
  for (let frame = 0; frame < 850; frame++) {
    const input = replayInput(frame);
    first.update(dt, input);
    second.update(dt, input);
    if (frame % 125 === 0) assert.deepEqual(first.snapshot(), second.snapshot(), `frame ${frame}`);
  }
  assert.deepEqual(first.snapshot(), second.snapshot());
  assert.deepEqual(frozenBalance, balance);
  assert.ok(first.fired > 0 && first.enemyFired > 0);
});

test('the additional opening hulls fit in the battle camera and stay on separate patrols', () => {
  for (const width of [740, 844]) {
    for (const stage of [1, 2, 3, 6, 11, 17, 30]) {
      for (const seed of [0, 13, 99]) {
        const off = make(stage, {seed, navalBattle: false});
        const on = make(stage, {seed, config: {...config, width}});
        const opening = liveShips(on);
        const moreShips = opening.length > liveShips(off).length;
        assert.ok(opening.length >= liveShips(off).length, `stage ${stage} lost opening ships`);
        if (stage <= 3) {
          assert.ok(moreShips, `stage ${stage} should open with more ships`);
        }
        if (stage === 1) {
          assert.ok(opening.every(enemy => !balance.shipTypes[enemy.kind].submarine && !enemy.boss));
        }
        for (let frame = 0; frame <= 200; frame++) {
          const ships = liveShips(on);
          const label = `stage ${stage}, seed ${seed}, width ${width}, t=${on.time.toFixed(2)}`;
          assert.ok(ships.length <= 3, label);
          const points = ships.map(ship => on.screenPoint(ship.x, ship.z));
          for (let i = 0; i < ships.length; i++) {
            const {x, y, depth} = points[i];
            assert.ok(depth > 0 && x > 0 && x < width && y > 0 && y < config.height, label);
            for (let j = i + 1; j < ships.length; j++) {
              const space = Math.hypot(ships[i].x - ships[j].x, ships[i].z - ships[j].z);
              const beams = balance.aim.hullBeam * (ships[i].hullScale + ships[j].hullScale);
              assert.ok(space > beams, `${label}, ships ${i} and ${j} are too close in the arena`);
              if (stage <= 3) {
                assert.ok(Math.hypot(x - points[j].x, y - points[j].y) > config.height * .05,
                  `${label}, ships ${i} and ${j} are too close on screen`);
              }
            }
          }
          on.update(dt);
        }
      }
    }
  }
});

function openingFire(stage, navalBattle) {
  const model = make(stage, {navalBattle, equipment: {shield: 1000}, random: () => .5});
  const seen = new Set();
  const attacks = new Map();
  const shots = [];
  for (let frame = 0; frame < 20 / dt; frame++) {
    model.update(dt);
    for (const enemy of liveShips(model)) {
      if (enemy.attack && !attacks.has(enemy.attack)) {
        attacks.set(enemy.attack, {at: model.time, until: enemy.attack.fireTime});
      }
    }
    for (const shot of model.enemyShots) {
      if (seen.has(shot)) continue;
      seen.add(shot);
      shots.push({...shot, at: model.time});
    }
  }
  return {model, shots, attacks: [...attacks.values()]};
}

test('opening cannon fire arrives sooner, launches more shots and remains avoidable at stage one', () => {
  const off = openingFire(1, false);
  const on = openingFire(1, true);
  assert.ok(off.shots.length > 0, 'stock fixture must observe fire');
  assert.ok(on.shots.length > off.shots.length, `${on.shots.length} vs ${off.shots.length}`);
  assert.ok(on.model.enemyFired > off.model.enemyFired);
  assert.ok(on.shots[0].at < off.shots[0].at);
  assert.ok(on.shots[0].damage <= off.shots[0].damage, 'the scout should not hit harder');
  assert.ok(on.shots.every(shot => shot.damage > 0 && shot.damage < on.model.maxLives * .15));
  assert.ok(on.attacks.length > 0);
  for (const {at, until} of on.attacks) {
    assert.ok(until - at >= 1.3, `warning lasted ${until - at}s`);
  }
  const evasive = make(1, {random: () => .5});
  while (!liveShips(evasive).some(enemy => enemy.attack) && evasive.time < 15) evasive.update(dt);
  const enemy = liveShips(evasive).find(enemy => enemy.attack);
  assert.ok(enemy, 'an attack should begin in the opening');
  const {x, z, fireTime} = enemy.attack;
  while (evasive.time + dt < fireTime) {
    evasive.update(dt, {moveX: 1});
    assert.deepEqual([enemy.attack.x, enemy.attack.z], [x, z]);
  }
  let launchedAtWarning = false;
  while (evasive.time < fireTime + 1.5) {
    evasive.update(dt, {moveX: 1});
    launchedAtWarning ||= evasive.enemyShots.some(shot => shot.targetX === x && shot.targetZ === z);
  }
  assert.ok(launchedAtWarning);
  assert.equal(evasive.lives, evasive.maxLives, 'sailing away from the warning avoids damage');
});

test('many sources of fire and player salvos together respect the projectile budget', () => {
  const projectiles = 6;
  const tightBalance = {
    ...balance,
    render: {...balance.render, effects: {...balance.render.effects, maxProjectiles: projectiles}},
  };
  const stages = [6, 9, 25];
  for (const stage of stages) {
    const model = make(stage, {balance: tightBalance, equipment: {shield: 1000, rate: 80}});
    let peak = 0;
    let bothSidesFiring = false;
    let aircraftWaitingAtCap = false;
    for (let frame = 0; frame < 27 / dt; frame++) {
      if (frame % 50 === 0) model.ammo[4] = 6;
      const saturate = frame < 250 || (frame >= 1050 && frame < 1250);
      const fireRelease = saturate || model.enemyShots.length > 0;
      model.update(dt, {ammoIndex: 4, fireRelease, aimYaw: Math.PI, aimElevation: 24});
      const player = model.extraShots.length + Number(model.ball.active);
      const enemy = model.enemyShots.length;
      peak = Math.max(peak, player + enemy);
      bothSidesFiring ||= player > 0 && enemy > 0;
      aircraftWaitingAtCap ||= player + enemy === projectiles
        && model.air.some(aircraft => aircraft.attack?.fireTime <= model.time);
      assert.ok(player + enemy <= projectiles, `stage ${stage} t=${model.time.toFixed(2)}: ${player}+${enemy}`);
    }
    assert.equal(peak, projectiles, `stage ${stage} must exercise the cap`);
    assert.ok(bothSidesFiring, `stage ${stage} must exercise mixed projectile traffic`);
    if (stage === 6) assert.ok(aircraftWaitingAtCap, 'an aircraft must attempt to fire at the cap');
    assert.ok(model.enemyFired > 0 && model.fired > 0);
  }
});

test('priority targets, escorts and main base structures retain their objectives', () => {
  const objectives = [
    [11, 'subhunt', enemy => enemy.behavior === 'dive'],
    [12, 'intercept', enemy => enemy.behavior === 'flank'],
    [30, 'flagship', enemy => enemy.boss],
    [25, 'flagship', enemy => enemy.boss],
  ];
  for (const [stage, objective, isPriority] of objectives) {
    const on = make(stage);
    const off = make(stage, {navalBattle: false});
    assert.equal(on.mission.id, objective);
    assert.deepEqual(on.mission, off.mission);
    const targets = on.enemies.filter(enemy => !enemy.structure && isPriority(enemy));
    const base = on.enemies.filter(enemy => enemy.structure && enemy.main !== false);
    if (stage === 25) assert.ok(base.length > 0, 'the late flagship fixture should include a shore objective');
    assert.deepEqual(targets.map(enemy => enemy.kind), off.enemies
      .filter(enemy => !enemy.structure && isPriority(enemy)).map(enemy => enemy.kind));
    assert.equal(on.missionState.total, off.missionState.total);
    assert.ok(targets.length > 0);
    const escort = on.enemies.find(enemy => !enemy.structure && !isPriority(enemy));
    assert.ok(escort?.hp > 0);
    for (const enemy of targets) enemy.hp = 0;
    assert.equal(on.missionState.complete, !base.length);
    for (const structure of base) structure.hp = 0;
    assert.equal(on.missionState.complete, true);
    assert.ok(escort.hp > 0);
  }
});

test('?navalBattle=0 reproduces the v24.5 stock snapshots', async t => {
  let stockFiles;
  try {
    stockFiles = corePaths.filter(path => path !== battlePath && !path.endsWith('offline-manifest.json'))
      .map(path => [path, execFileSync('git', ['show', `${STOCK_COMMIT}:${path}`], {cwd: repo, maxBuffer: 1 << 26})]);
  } catch {
    t.skip('the v24.5 commit is not in this clone');
    return;
  }
  const root = await mkdtemp(join(tmpdir(), 'naval-battle-stock-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const runtime = join(root, 'workout/island');
  await mkdir(runtime, {recursive: true});
  const paths = ['activity', 'data', 'engine', 'extensions', 'minigames', 'offline-manifest.json', 'presentation', 'release.mjs', 'ui', 'vendor', 'view'];
  await Promise.all([
    ...paths.map(path => cp(join(island, path), join(runtime, path), {recursive: true})),
    cp(join(island, 'design/hud-kit'), join(runtime, 'design/hud-kit'), {recursive: true}),
    cp(join(island, '../../package.json'), join(root, 'package.json')),
  ]);
  for (const [path, bytes] of stockFiles) await writeFile(join(root, path), bytes);
  const original = await import(pathToFileURL(join(root, modelPath)).href);
  const stockMinigames = JSON.parse(await readFile(join(root, dataPath), 'utf8')).minigames;

  const oldLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {configurable: true, value: {search: '?navalBattle=0'}});
  try {
    assert.equal(navalBattleEnabled(), false);
    for (const [stage, seed] of [[1, 0], [15, 42], [30, 99]]) {
      const onPage = make(stage, {seed, navalBattle: navalBattleEnabled()});
      const stock = original.createNavalModel({
        level: stage, seed, random: seededRandom(seed),
        config: {...stockMinigames, width: config.width, height: config.height},
        balance: stockMinigames.navalDuel,
      });
      assert.deepEqual(onPage.snapshot(), stock.snapshot(), `stage ${stage} at the opening`);
      for (let frame = 0; frame < 1000; frame++) {
        const input = replayInput(frame);
        onPage.update(dt, input);
        stock.update(dt, input);
        if (frame % 137 === 0) assert.deepEqual(onPage.snapshot(), stock.snapshot(), `stage ${stage}, frame ${frame}`);
      }
      assert.deepEqual(onPage.snapshot(), stock.snapshot(), `stage ${stage} after replay`);
    }
  } finally {
    if (oldLocation) Object.defineProperty(globalThis, 'location', oldLocation);
    else delete globalThis.location;
  }

});
