import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {runSimulations} from '../sim/simulate.mjs';

const defaultRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const root = path.resolve(process.env.ALPINE_TEST_ROOT || defaultRoot);
const minigame = name => pathToFileURL(path.join(root, 'workout/island/minigames', name));
const {createAlpineRunner} = await import(minigame('alpine-runner-engine.mjs'));
const {DIFFICULTIES, THEMES, generateCourse, validateCourse} = await import(minigame('alpine-runner-generator/index.mjs'));
const {alpineRunnerEnabled, alpineRunnerProgress, alpineRunnerResult} = await import(minigame('alpine-runner-rules.mjs'));
const config = JSON.parse(await readFile(new URL('../data/config.json', minigame('alpine-runner-engine.mjs')), 'utf8'));
const dt = 1 / 60;
const sampleEvents = (state, kind) => state.nextEvents.filter(event => event.kind === kind);

function followRoute(runner, state) {
  if (state.distance < state.segments[0].startM && state.segments[0].index === 0) return;
  const current = state.segments.find(segment => state.distance >= segment.startM - 1e-8 && state.distance < segment.endM - 1e-8);
  assert.ok(current, `a streamed segment covers ${state.distance} m`);
  const target = state.distance >= current.moveStartM ? current.exitLane : current.entryLane;
  if (target !== state.lane) runner.command(target > state.lane ? 'right' : 'left');
}

function advance(runner, predicate, {seconds = 90, steer = followRoute} = {}) {
  let state = runner.snapshot();
  for (let tick = 0; tick < 60 * seconds && state.status === 'running' && !predicate(state); tick += 1) {
    steer(runner, state);
    runner.step(dt);
    state = runner.snapshot();
  }
  return state;
}

test('streaming agrees with the generator, crosses chunk seams and retains a bounded lookahead', () => {
  for (const difficulty of [1, 2, 3]) {
    const seed = `witness-${difficulty}`;
    const runner = createAlpineRunner({seed, difficulty});
    const first = runner.snapshot();
    assert.ok(Object.hasOwn(THEMES, first.theme));
    assert.equal(first.lane, 1);
    assert.equal(first.difficulty, difficulty);
    const leadIn = first.segments[0].startM;
    let lastIndex = -1;
    let maxEvents = 0;
    const final = advance(runner, state => state.distance > 3_000, {
      seconds: 210,
      steer(engine, state) {
        assert.ok(state.speed <= DIFFICULTIES[difficulty].maxSpeedMps);
        assert.ok(state.lanePosition >= 0 && state.lanePosition <= 2);
        maxEvents = Math.max(maxEvents, state.nextEvents.length);
        assert.equal(new Set(state.nextEvents.map(event => event.id)).size, state.nextEvents.length);
        const edge = state.segments.at(-1);
        if (edge.index > lastIndex) {
          const generated = generateCourse({
            seed, theme: state.theme, difficulty, startSegment: edge.index, segmentCount: 1,
          });
          assert.equal(validateCourse(generated).valid, true);
          const [expected] = generated.segments;
          const {index, startM, endM, entryLane, exitLane, path: {moveStartM, moveEndM}} = expected;
          assert.deepEqual(
            edge,
            {index, startM: startM + leadIn, endM: endM + leadIn, entryLane, exitLane,
              moveStartM: moveStartM + leadIn, moveEndM: moveEndM + leadIn},
          );
          lastIndex = edge.index;
        }
        followRoute(engine, state);
      },
    });
    assert.equal(final.status, 'running', `the certified route survived at difficulty ${difficulty}`);
    assert.ok(final.distance > 3_000 && lastIndex >= 100);
    assert.ok(final.coins > 0, 'the certified route reaches coins');
    assert.equal(final.score, Math.floor(final.distance) + 5 * final.coins);
    assert.ok(maxEvents > 0 && maxEvents < 400, `bounded retained event window: ${maxEvents}`);
  }
});

test('the same seed and command stream produce the same run and event order', () => {
  const run = seed => {
    const runner = createAlpineRunner({seed, difficulty: 3});
    const states = [];
    const events = [];
    for (let tick = 0; tick < 1_800 && runner.snapshot().status === 'running'; tick += 1) {
      followRoute(runner, runner.snapshot());
      runner.step(dt);
      if (tick % 60 === 0) states.push(runner.snapshot());
      events.push(...runner.drainEvents());
    }
    return {states, events, final: runner.snapshot()};
  };
  const a = run('replay-a');
  assert.deepEqual(a, run('replay-a'));
  assert.notDeepEqual(a, run('replay-b'));
  assert.ok(a.events.length > 0);
});

test('left and right are discrete and bounded, and jump and slide are exclusive and temporary', () => {
  const runner = createAlpineRunner({seed: 42, difficulty: 1});
  assert.equal(runner.snapshot().lane, 1);
  runner.command('left');
  runner.step(dt);
  assert.equal(runner.snapshot().lane, 0);
  assert.ok(runner.snapshot().lanePosition > 0 && runner.snapshot().lanePosition < 1);
  runner.command('left');
  runner.step(dt);
  assert.equal(runner.snapshot().lane, 0);
  runner.command('right');
  runner.step(dt);
  assert.equal(runner.snapshot().lane, 1);
  runner.command('right');
  runner.step(dt);
  assert.equal(runner.snapshot().lane, 2);
  runner.command('right');
  runner.step(dt);
  assert.equal(runner.snapshot().lane, 2);
  runner.command('jump');
  runner.step(dt);
  let state = runner.snapshot();
  assert.equal(state.stance, 'jump');
  assert.ok(state.jumpHeight > 0);
  runner.command('slide');
  runner.step(dt);
  assert.equal(runner.snapshot().stance, 'slide');
  assert.equal(runner.snapshot().sliding, true);
  assert.equal(runner.snapshot().jumpHeight, 0, 'a downward swipe ends the jump and starts a slide');
  runner.command('jump');
  runner.step(dt);
  assert.equal(runner.snapshot().stance, 'slide');
  state = advance(runner, sample => sample.stance === 'stand', {seconds: 2, steer() {}});
  assert.equal(state.stance, 'stand');
  assert.equal(state.sliding, false);
});

for (const [seed, kind, leadSeconds, wrongAction] of [[1, 'jump', .43, 'slide'], [32, 'slide', .27, 'jump']]) {
  test(`a ${kind} obstacle requires the matching gesture when staying in its lane`, () => {
    const run = action => {
      const runner = createAlpineRunner({seed});
      const target = runner.snapshot().nextEvents.find(event => event.lane === 1 && event.startDistance !== undefined);
      assert.equal(target.kind, kind);
      let pressed = false;
      return advance(runner, state => state.distance > target.endDistance + 2, {
        seconds: 20,
        steer(engine, state) {
          if (action && !pressed && (target.distance - state.distance) / state.speed < leadSeconds) {
            assert.equal(engine.command(action), true);
            pressed = true;
          }
        },
      });
    };
    assert.equal(run().status, 'crashed');
    assert.equal(run(wrongAction).status, 'crashed');
    assert.equal(run(kind).status, 'running');
  });
}

test('unavoided hazards end a run and a crashed runner stops accepting progress', () => {
  const runner = createAlpineRunner({seed: 'leave-the-controller-down', difficulty: 3});
  const final = advance(runner, () => false, {seconds: 20, steer() {}});
  assert.equal(final.status, 'crashed');
  assert.ok(final.distance > 0);
  assert.ok(final.elapsed > 0);
  for (const action of ['left', 'right', 'jump', 'slide']) runner.command(action);
  for (let tick = 0; tick < 120; tick += 1) runner.step(dt);
  assert.deepEqual(runner.snapshot(), final);
});

test('the delivered generator supplies the three-lane geometry and the full hazard and pickup set', () => {
  const runner = createAlpineRunner({seed: 'variety', difficulty: 2});
  const kinds = new Set();
  const lanes = new Set();
  const powers = new Set();
  const final = advance(runner, state => state.distance > 2_000, {
    seconds: 140,
    steer(engine, state) {
      for (const event of state.nextEvents) {
        kinds.add(event.kind);
        lanes.add(event.lane);
      }
      for (const power of Object.keys(state.powerups)) {
        if (state.powerups[power] > 0) powers.add(power);
      }
      followRoute(engine, state);
    },
  });
  assert.equal(final.status, 'running');
  assert.deepEqual([...lanes].sort(), [0, 1, 2]);
  assert.deepEqual([...kinds].sort(), ['block', 'coin', 'double', 'jump', 'magnet', 'shield', 'slide']);
  assert.deepEqual([...powers].sort(), ['double', 'magnet', 'shield']);
  assert.equal(sampleEvents(final, 'coin').every(event => event.distance >= final.distance - 2), true);
});

test('shield absorbs a collision, magnet reaches the adjacent lane, and double boosts coin value', () => {
  const shielded = createAlpineRunner({seed: 1, difficulty: 2});
  const armed = advance(shielded, state => state.powerups.shield);
  assert.equal(armed.powerups.shield, true);
  let hit = false;
  const protectedState = advance(shielded, () => hit, {
    seconds: 8,
    steer(engine) { hit ||= engine.drainEvents().some(event => event.type === 'shield'); },
  });
  assert.equal(hit, true);
  assert.equal(protectedState.status, 'running');
  assert.equal(protectedState.powerups.shield, false);

  const magnetic = createAlpineRunner({seed: 1, difficulty: 2});
  const charged = advance(magnetic, state => state.powerups.magnet > 0);
  assert.ok(charged.powerups.magnet > 0);
  magnetic.drainEvents();
  magnetic.command(charged.lane === 2 ? 'left' : 'right');
  let offLane = false;
  advance(magnetic, () => offLane, {
    seconds: 3,
    steer(engine, state) {
      offLane ||= engine.drainEvents().some(({type, event}) => (
        type === 'coin' && Math.abs(state.lanePosition - event.lane) > .8 && state.powerups.magnet > 0
      ));
    },
  });
  assert.equal(offLane, true);

  const doubled = createAlpineRunner({seed: 1, difficulty: 2});
  const boost = advance(doubled, state => state.powerups.double > 0);
  assert.ok(boost.powerups.double > 0);
  doubled.drainEvents();
  let previousCoins = boost.coins;
  let collected = false;
  advance(doubled, () => collected, {
    seconds: 3,
    steer(engine, state) {
      const coins = engine.drainEvents().filter(event => event.type === 'coin');
      if (coins.length) {
        const baseValue = coins.reduce((sum, item) => sum + item.event.value, 0);
        assert.ok(state.powerups.double > 0);
        assert.equal(state.coins - previousCoins, 2 * baseValue);
        collected = true;
      }
      previousCoins = state.coins;
      followRoute(engine, state);
    },
  });
  assert.equal(collected, true);
});

test('all three bot profiles run the same seeds with increasing median survival', () => {
  const results = runSimulations(createAlpineRunner, {seeds: 12, courseDifficulty: 3, seconds: 45});
  const {easy, medium, hard} = results.byDifficulty;
  assert.equal(results.runs.length, 36);
  assert.ok(easy.medianDistance < medium.medianDistance);
  assert.ok(medium.medianDistance < hard.medianDistance);
});

test('score, stage thresholds and settlement validate an honest long run and reject malformed results', () => {
  assert.equal(alpineRunnerEnabled(''), true);
  assert.equal(alpineRunnerEnabled('?alpineRunner=1'), true);
  assert.equal(alpineRunnerEnabled('?other=1&alpineRunner=0'), false);
  assert.deepEqual(alpineRunnerProgress(149, 1), {outcome: 'lose', stars: 0});
  assert.deepEqual(alpineRunnerProgress(150, 1), {outcome: 'win', stars: 1});
  assert.deepEqual(alpineRunnerProgress(325, 2), {outcome: 'win', stars: 2});
  assert.deepEqual(alpineRunnerProgress(600, 3), {outcome: 'win', stars: 3});
  const runner = createAlpineRunner({seed: 'variety', difficulty: 2});
  const state = advance(runner, current => current.distance >= 800);
  const details = {
    distance: Math.floor(state.distance), elapsed: Math.round(state.elapsed * 1000),
    coins: state.coins, score: state.score, theme: state.theme, difficulty: 2, crashed: true,
  };
  const raw = {outcome: 'win', score: details.score, runner: details};
  const level = {level: 2};
  const balance = config.minigames.alpineRush;
  const settled = alpineRunnerResult(raw, level, balance);
  assert.deepEqual(settled, {
    outcome: 'win', stars: 3, score: details.score, money: balance.levels[1].winMoney + Math.min(details.coins, 30),
  });
  for (const change of [
    {distance: -1}, {elapsed: 1}, {coins: -1}, {coins: 100_000}, {score: details.score + 1},
    {theme: 'unknown'}, {difficulty: 3}, {crashed: false}, {unexpected: true},
  ]) {
    assert.equal(alpineRunnerResult({...raw, runner: {...details, ...change}}, level, balance), null);
  }
  assert.equal(alpineRunnerResult({...raw, outcome: 'lose'}, level, balance), null);
});

test('the fallback runs the existing regular race through the registered Alpine extension', async () => {
  const {install} = await import(pathToFileURL(path.join(root, 'workout/island/extensions/alpine-rush.mjs')));
  let entry;
  const registry = {registerMinigame: value => { entry = value; }};
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const original = process.env.ALPINE_LEGACY_ROOT && await import(pathToFileURL(
    path.join(process.env.ALPINE_LEGACY_ROOT, 'workout/island/extensions/alpine-rush.mjs'),
  ));
  function menu(start, search) {
    Object.defineProperty(globalThis, 'location', {value: {search}, configurable: true});
    start(registry, {config, extensions: {alpineRush: {id: 'alpineRush'}}});
    const session = entry.start({seed: 15, level: 1, debug: true});
    try {
      const opening = session.snapshot;
      session.start();
      for (let tick = 0; tick < 400; tick += 1) session.debug.step(dt);
      const race = session.snapshot;
      return {opening, race};
    } finally {
      session.dispose();
    }
  }
  try {
    const current = menu(install, '?alpineRunner=0');
    assert.equal(current.opening.trackId, 'ice-peak');
    assert.equal(current.opening.phase, 'menu');
    assert.equal(current.race.phase, 'racing');
    assert.equal(current.race.frame.rivals.length, config.minigames.alpineRush.riders - 1);
    if (original) assert.deepEqual(current, menu(original.install, ''));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else delete globalThis.location;
  }
});
