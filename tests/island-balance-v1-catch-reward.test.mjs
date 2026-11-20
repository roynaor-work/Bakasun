import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {idealAim, leadPoint, levels7} from '../workout/island/minigames/catch-assist.mjs';
import {createCatchEngine} from '../workout/island/minigames/catch-engine.mjs';
import {gameResult} from '../workout/island/minigames/result.mjs';

const {minigames} = JSON.parse(await readFile(new URL('../workout/island/data/config.json', import.meta.url), 'utf8'));
const balance = minigames.catchCriminal;
const currentBalance = {...balance, levels: levels7(balance)};

function startMatch(search, stage = 1) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {configurable: true, value: new URL(search, 'https://example.test/')});
  try {
    return createCatchEngine({balance: currentBalance, stage, seed: 1701, v2: true, arch: true});
  } finally {
    if (original) Object.defineProperty(globalThis, 'location', original);
    else delete globalThis.location;
  }
}

test('only balanceCatch=1 changes the narrow net reward region for a match', () => {
  const shared = structuredClone(balance.tools);
  const original = startMatch('', 3).tools;
  assert.deepEqual(original.map(t => t.id).sort(), ['narrow', 'rope', 'wide']);
  const originalNet = original.find(tool => tool.id === 'narrow');
  assert.equal(originalNet.perfectY, 1.5);
  assert.equal(originalNet.perfectX, 0.5);

  const expected = original.map(tool => tool.id === 'narrow' ? {...tool, perfectY: 1.1, perfectX: 0.75} : tool);
  assert.deepEqual(startMatch('?x=1&balanceCatch=1', 3).tools, expected);
  for (const query of ['', '?balanceCatch=0', '?balanceCatch=true', '?balanceFire=1']) {
    assert.deepEqual(startMatch(query, 3).tools, original);
  }
  assert.deepEqual(balance.tools, shared);
});

function playAtLeadMarker(search) {
  const engine = startMatch(search);
  const flights = [];
  const perfects = [];
  for (let frame = 0; frame < 60 * 30 && engine.state.phase !== 'done'; frame++) {
    if (engine.state.phase === 'aim') {
      engine.setAim({...idealAim(engine, leadPoint(engine)), power: 1});
      const {perfect, ...flight} = engine.release();
      flights.push(flight);
      perfects.push(perfect);
    }
    engine.step(1 / 60);
  }
  assert.equal(engine.state.phase, 'done');
  const result = gameResult(engine.summary(), {config: minigames, level: 1}, balance);
  return {flights, perfects, result, seconds: engine.clock};
}

test('the same two assisted catches earn a third star at the native settlement', () => {
  const before = playAtLeadMarker('');
  const after = playAtLeadMarker('?balanceCatch=1');
  assert.equal(before.result.outcome, 'win');
  assert.equal(after.result.outcome, 'win');
  assert.equal(before.result.stars, 2);
  assert.equal(after.result.stars, 3);
  assert.deepEqual(before.flights.map(flight => flight.kind), ['catch', 'catch']);
  assert.deepEqual(after.flights, before.flights);
  assert.equal(after.seconds, before.seconds);
  assert.deepEqual(before.perfects, [false, false]);
  assert.deepEqual(after.perfects, [true, false]);
});
