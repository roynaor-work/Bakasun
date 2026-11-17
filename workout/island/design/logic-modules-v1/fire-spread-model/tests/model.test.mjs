import test from 'node:test';
import assert from 'node:assert/strict';
import { API_VERSION, createGame, DIFFICULTIES, EXTINGUISHERS, getAvailableActions, getResult, MATERIALS, nextRandom, snapshot, step, validateState } from '../src/index.mjs';
import { advance, fixture, playPatiently } from './helpers.mjs';

const frozen = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};
const sampleSeed = index => index < 60 ? index : index === 119 ? 0xffffffff : (Math.imul(index, 2654435761) + 1013904223) >>> 0;

test('versioned API, catalogs and RNG are deterministic detached data', () => {
  assert.equal(API_VERSION, '1.0.0');
  assert.deepEqual(nextRandom(0), { state: 1013904223, value: 1013904223 / 4294967296 });
  assert.throws(() => { EXTINGUISHERS.water.efficacy.A = 9; }, TypeError);
  assert.equal(MATERIALS.concrete.fuel, 0);
  const state = createGame({ seed: 0 });
  assert.equal(validateState(state), true);
  assert.equal(state.apiVersion, API_VERSION);
  assert.equal(getResult(state), null);
});

test('all public state operations preserve frozen inputs and produce detached values', () => {
  const options = frozen({ seed: 17, difficulty: 'hard' });
  const original = createGame(options), text = JSON.stringify(original), state = frozen(original);
  const next = step(state, frozen({ type: 'spray', roomId: state.rooms.find(room => room.fire > 0).id, agent: 'powder' }), 0.3);
  getAvailableActions(state); getResult(state); validateState(state);
  const saved = snapshot(state); saved.rooms[0].heat = 0.4;
  next.state.rooms[0].heat = 0.7;
  assert.equal(JSON.stringify(state), text);
  assert.notStrictEqual(next.state.rooms, state.rooms);
  assert.equal(state.rooms[0].heat, 0.08);
});

test('fixed ticks are invariant to frame chunking and events have stable ordering', () => {
  const start = createGame({ seed: 98 });
  const whole = step(start, null, 10);
  const small = advance(start, 10, null, 0.016);
  assert.deepEqual(small.state, whole.state);
  assert.deepEqual(small.events, whole.events);
  const odd = step(step(start, null, 0.037).state, null, 0.063);
  assert.deepEqual(odd.state, step(start, null, 0.1).state);
  for (const chunks of [3, 60, 144]) {
    let sliced = start;
    for (let i = 0; i < chunks; i += 1) sliced = step(sliced, null, 1 / chunks).state;
    assert.deepEqual(sliced, step(start, null, 1).state);
  }
  assert.equal(step(start, null, 0.0000000001).state.tick, 0);
});

test('JSON save/replay carries all random state and resumes exactly', () => {
  const initial = createGame({ seed: 42 });
  const middle = advance(initial, 21.37, null, 0.29).state;
  const loaded = JSON.parse(JSON.stringify(middle));
  assert.deepEqual(advance(loaded, 55.3).state, advance(middle, 55.3).state);
  assert.notDeepEqual(createGame({ seed: 43 }).rooms, initial.rooms);
  assert.notEqual(step(middle, null, 1).state.rngState, middle.rngState);
});

test('pause preserves fractional tick, tasks, travel, inventory and simulation clock', () => {
  let state = createGame({ seed: 1 });
  state = step(state, { type: 'move', roomId: 'landing-1' }, 0.05).state;
  const paused = step(state, { type: 'pause' }, 60).state;
  const held = step(paused, null, 60).state;
  assert.deepEqual(held, paused);
  assert.equal(held.pendingNs, 50000000);
  const reject = step(paused, { type: 'move', roomId: 'room-0-0' }, 20);
  assert.equal(reject.events[0].code, 'paused');
  const resumed = step(paused, { type: 'resume' }, 0.05).state;
  assert.deepEqual(resumed.clock, step(state, null, 0.05).state.clock);
  assert.equal(resumed.tick, 1);
  assert.ok(resumed.actor.travel.remaining < state.actor.travel.remaining);
});

test('range, travel, unsafe entry and doors prevent remote extinguishing or teleporting', () => {
  const initial = createGame({ building: fixture(), seed: 1 });
  const remote = step(initial, { type: 'spray', roomId: 'target', agent: 'water' }, 0);
  assert.equal(remote.events[0].code, 'out-of-range');
  assert.equal(remote.state.metrics.agentUsed, 0);
  assert.equal(step(initial, { type: 'move', roomId: 'target' }, 0).events[0].code, 'not-adjacent');
  assert.equal(step(initial, { type: 'move', roomId: 'source' }, 0).events[0].code, 'unsafe-entry');
  const closed = step(initial, { type: 'door', linkId: 'entry', open: false }, 0).state;
  assert.equal(step(closed, { type: 'spray', roomId: 'source', agent: 'water' }, 0).events[0].code, 'out-of-range');
  assert.equal(step(closed, { type: 'door', linkId: 'spread', open: false }, 0).events[0].code, 'out-of-reach');
  let state = createGame({ building: fixture({ sourceFire: 0, sourceHeat: 0.08 }) });
  state = step(state, { type: 'move', roomId: 'source' }, 0.5).state;
  assert.equal(state.actor.roomId, 'exit');
  assert.equal(step(state, { type: 'spray', roomId: 'source', agent: 'water' }, 0).events[0].code, 'travelling');
  state = step(state, null, 0.7).state;
  assert.equal(state.actor.roomId, 'source'); assert.equal(state.actor.travel, null);
});

test('arrival rechecks a room that becomes unsafe while travelling', () => {
  const building = fixture({ sourceFire: 0.34, sourceHeat: 0.77, ventilation: 1 });
  const initial = createGame({ building, difficulty: 'hard' });
  const next = advance(initial, 1.2, { type: 'move', roomId: 'source' });
  assert.equal(next.state.actor.roomId, 'exit');
  assert.equal(next.events.at(-1).type, 'travel-blocked');
});

test('stairs carry heat and smoke upwards, ignite fuel and respect noncombustible concrete', () => {
  const initial = createGame({ building: fixture({ upper: true, sourceFire: 1, sourceHeat: 1, people: false }), timeLimit: 300 });
  const next = advance(initial, 80, null, 20);
  const upper = next.state.rooms.find(room => room.id === 'target');
  assert.ok(upper.heat > 0.58); assert.ok(upper.smoke > 0.1); assert.ok(upper.fire > 0);
  assert.ok(next.events.some(event => event.type === 'fire-ignited' && event.roomId === 'target' && event.floor === 1));
  const exit = next.state.rooms[0]; assert.equal(exit.fire, 0); assert.equal(exit.fuel, 0); assert.ok(exit.heat > 0.08);
  assert.equal(validateState(next.state), true);
});

test('closed doors delay heat and smoke transfer and oxygen starvation limits combustion', () => {
  const open = advance(createGame({ building: fixture({ sourceFire: 1, sourceHeat: 1, people: false }) }), 50).state;
  const closed = advance(createGame({ building: fixture({ sourceFire: 1, sourceHeat: 1, people: false, open: false }) }), 50).state;
  assert.ok(open.rooms[2].heat > closed.rooms[2].heat + 0.2);
  assert.ok(open.rooms[2].smoke > closed.rooms[2].smoke + 0.1);
  const sealed = fixture({ sourceFire: 0.6, sourceHeat: 0.7, people: false, ventilation: 0, open: false });
  sealed.links[0].open = false; sealed.rooms[1].oxygen = 0.02;
  const low = advance(createGame({ building: sealed }), 10).state.rooms[1];
  const vented = fixture({ sourceFire: 0.6, sourceHeat: 0.7, people: false, ventilation: 1, open: false });
  const high = advance(createGame({ building: vented }), 10).state.rooms[1];
  assert.ok(low.fire < high.fire * 0.7); assert.ok(low.fuel > high.fuel);
});

for (const [material, agent] of [['wood', 'water'], ['liquid', 'foam'], ['electrical', 'co2'], ['cookingOil', 'wetChemical']]) {
  test(`correct ${agent} extinguishes ${material}; incorrect agent wastes finite supply`, () => {
    const initial = createGame({ building: fixture({ material, sourceFire: 0.6 }), difficulty: 'normal' });
    const good = advance(initial, 10, { type: 'spray', roomId: 'source', agent });
    const wrongAgent = material === 'wood' ? 'co2' : 'water';
    const bad = advance(initial, 10, { type: 'spray', roomId: 'source', agent: wrongAgent });
    assert.equal(good.state.rooms[1].fire, 0);
    assert.ok(good.state.rooms[1].heat < 0.4);
    assert.ok(bad.state.rooms[1].fire > 0.2);
    assert.ok(bad.state.metrics.agentWasted > good.state.metrics.agentWasted);
    assert.ok(bad.events.some(event => event.type === 'agent-mismatch'));
    assert.ok(good.state.inventory[agent] < initial.inventory[agent]);
    assert.ok(good.events.some(event => event.type === 'fire-extinguished'));
  });
}

test('empty agents stop exactly at available resource without negative inventory or free cooling', () => {
  const initial = createGame({ building: fixture(), inventory: { water: 0.11 } });
  const next = step(initial, { type: 'spray', roomId: 'source', agent: 'water' }, 2);
  assert.equal(next.state.inventory.water, 0); assert.equal(next.state.metrics.agentUsed, 0.11);
  assert.equal(next.state.actor.task, null);
  assert.ok(next.events.some(event => event.type === 'agent-empty'));
  assert.equal(step(next.state, { type: 'spray', roomId: 'source', agent: 'water' }, 0).events[0].code, 'empty-agent');
});

test('rescue requires safe same-room timed pickup and a real return to an exit', () => {
  const building = fixture({ sourceFire: 0, sourceHeat: 0.08 });
  let state = createGame({ building });
  assert.equal(step(state, { type: 'rescue', personId: 'person' }, 0).events[0].code, 'out-of-reach');
  state = advance(state, 1.2, { type: 'move', roomId: 'source' }).state;
  state = advance(state, 1.2, { type: 'move', roomId: 'target' }).state;
  state = advance(state, 1, { type: 'rescue', personId: 'person' }).state;
  assert.equal(state.people[0].status, 'waiting'); assert.equal(state.people[0].progress, 0.9999999999999999);
  state = step(state, { type: 'wait' }, 0).state;
  assert.equal(state.people[0].progress, 0);
  state = advance(state, 2, { type: 'rescue', personId: 'person' }).state;
  assert.equal(state.people[0].status, 'escorted'); assert.equal(state.metrics.rescued, 0); assert.equal(state.status, 'running');
  assert.equal(step(state, { type: 'spray', roomId: 'target', agent: 'water' }, 0).events[0].code, 'carrying-person');
  state = advance(state, 1.7, { type: 'move', roomId: 'source' }).state;
  const done = advance(state, 1.7, { type: 'move', roomId: 'exit' }); state = done.state;
  assert.equal(state.people[0].status, 'rescued'); assert.equal(state.status, 'won'); assert.equal(state.metrics.rescued, 1);
  assert.ok(done.events.some(event => event.type === 'person-rescued'));
  assert.equal(getResult(state).stars, 3);
  const after = step(state, { type: 'rescue', personId: 'person' }, 60);
  assert.deepEqual(after.state, state); assert.deepEqual(after.events, []);
});

test('unsafe rescue has no progress; hot rooms can reignite when suppression expires', () => {
  const building = fixture({ sourceFire: 0, sourceHeat: 0.08 });
  building.people[0].roomId = 'exit'; building.rooms[0].smoke = 0.9;
  const blocked = step(createGame({ building }), { type: 'rescue', personId: 'person' }, 1);
  assert.equal(blocked.events[0].code, 'unsafe-rescue'); assert.equal(blocked.state.people[0].progress, 0);
  const hot = fixture({ sourceFire: 0, sourceHeat: 0.9, people: false });
  const next = step(createGame({ building: hot }), null, 0.1);
  assert.ok(next.events.some(event => event.type === 'fire-ignited' && event.roomId === 'source'));
});

test('clock ends at its exact limit and terminal states freeze with one participation star', () => {
  const initial = createGame({ seed: 22, timeLimit: 10.1 });
  const ended = advance(initial, 30);
  assert.equal(ended.state.status, 'lost'); assert.equal(ended.state.reason, 'timeout');
  assert.equal(ended.state.clock.elapsed, 10.1); assert.equal(ended.state.clock.remaining, 0);
  assert.equal(getResult(ended.state).stars, 1);
  assert.equal(ended.events.filter(event => event.type === 'game-ended').length, 1);
  assert.deepEqual(step(ended.state, null, 60).state, ended.state);
  const close = createGame({ timeLimit: 10.100000000000001 });
  assert.equal(close.clock.limit, 10.1);
  assert.equal(step(close, null, 10.1).state.status, 'lost');
});

test('all difficulties support patient three-second choices over 120 independent seeds each', () => {
  const totals = {};
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    let slowest = 0;
    for (let index = 0; index < 120; index += 1) {
      const seed = sampleSeed(index);
      const played = playPatiently(seed, difficulty, { thinkingSeconds: 3, frameSeconds: index % 2 ? 0.2 : 0.5 });
      assert.equal(played.state.status, 'won', `${difficulty} seed ${seed}: ${JSON.stringify(getResult(played.state))}`);
      assert.ok(getResult(played.state).stars >= 2);
      assert.equal(played.state.metrics.rescued, DIFFICULTIES[difficulty].people);
      assert.equal(validateState(played.state), true);
      assert.ok(!played.events.some(event => event.type === 'action-rejected'));
      slowest = Math.max(slowest, played.state.clock.elapsed);
    }
    totals[difficulty] = slowest;
  }
  assert.ok(totals.hard < 200);
});

test('idle runs lose with one star over 40 seeds on every difficulty; bounds remain finite', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) for (let seed = 0; seed < 40; seed += 1) {
    let state = createGame({ seed, difficulty });
    while (state.status === 'running') {
      state = step(state, null, 30).state;
      assert.equal(validateState(state), true);
      for (const room of state.rooms) {
        assert.ok(room.fuel <= room.initialFuel);
        for (const field of ['fire', 'heat', 'smoke', 'oxygen', 'integrity']) assert.ok(Number.isFinite(room[field]) && room[field] >= 0 && room[field] <= 1);
      }
    }
    assert.equal(getResult(state).stars, 1); assert.equal(state.metrics.rescued, 0); assert.equal(state.status, 'lost');
  }
});

test('strict options, actions, topology and saved states reject malformed and nonfinite data', () => {
  for (const options of [null, [], { seed: NaN }, { seed: Infinity }, { seed: -1 }, { seed: 0x100000000 }, { seed: 1.5 }, { seed: null }, { difficulty: null }, { difficulty: 'impossible' }, { timeLimit: 0 }, { timeLimit: 10.01 }, { inventory: { water: -1 } }, { inventory: { acid: 1 } }, { typo: 1 }]) assert.throws(() => createGame(options), TypeError);
  const state = createGame();
  for (const seconds of [NaN, Infinity, -1, 61, null, '1']) assert.throws(() => step(state, null, seconds), TypeError);
  for (const action of [{}, [], { type: 'move', roomId: 4 }, { type: 'spray', roomId: 'room', agent: 'acid' }, { type: 'pause', extra: true }, { type: 'door', linkId: 'entry', open: 1 }]) assert.throws(() => step(state, action), TypeError);
  for (const mutate of [s => { s.rooms[0].heat = NaN; }, s => { s.rngState = -1; }, s => { s.clock.remaining += 1; }, s => { s.inventory.water = -1; }, s => { s.actor.roomId = 'unknown'; }, s => { s.apiVersion = '2.0.0'; }, s => { s.actor.carrying = 'ghost'; }, ...['agentUsed', 'agentWasted', 'usefulActions', 'extinguished', 'wrongAgentUses'].map(key => s => { delete s.metrics[key]; }), s => { s.actor.task = { type: 'rescue', personId: s.people[0].id }; }]) {
    const invalid = snapshot(state); mutate(invalid); assert.throws(() => validateState(invalid), TypeError);
  }
  for (const mutate of [b => { b.rooms[2].id = 'source'; }, b => { b.links[1].type = 'stairs'; }, b => { b.links[0].to = 'unknown'; }, b => { b.rooms[0].exit = false; }, b => { b.links = []; }, b => { b.people[0].roomId = 'unknown'; }]) {
    const building = fixture(); mutate(building); assert.throws(() => createGame({ building }), TypeError);
  }
});
