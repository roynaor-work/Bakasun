import test from 'node:test';
import assert from 'node:assert/strict';
import {createStateMachine, STATE_IDS, DRIBBLE_STATES, LEGAL_TRANSITIONS, TRANSITION_GRAPH,
  effectiveTransitionGraph} from '../runtime/state-machine.mjs';

test('transition policy enumerates named, unique, guarded edges without a wildcard', () => {
  const keys = new Set();
  assert.equal(STATE_IDS.length, 16);
  for (const edge of LEGAL_TRANSITIONS) {
    assert.ok(STATE_IDS.includes(edge.from) && STATE_IDS.includes(edge.to));
    assert.equal(typeof edge.requiresPossession, 'boolean');
    assert.equal(typeof edge.requiresDribbleAvailable, 'boolean');
    const key = `${edge.from}:${edge.to}`;
    assert.equal(keys.has(key), false, key); keys.add(key);
    assert.ok(TRANSITION_GRAPH[edge.from].includes(edge.to));
  }
  assert.ok(LEGAL_TRANSITIONS.length > 50);
  assert.equal(createStateMachine().transition('*').reason, 'unknown-state');
  assert.equal(createStateMachine().transition('pass_chest').reason, 'edge-not-listed');
});

function stopped(path = []) {
  const machine = createStateMachine({possession: {epoch: 7, owner: 'self'}});
  assert.ok(machine.transition('receive_moving').ok);
  assert.ok(machine.transition('dribble_run').ok);
  assert.ok(machine.transition('stop_two_feet').ok);
  for (const id of path) assert.ok(machine.transition(id).ok, path.join(' → '));
  return machine;
}

test('every direct and indirect path after a stop preserves the same-possession dribble lock', () => {
  const queue = [[]], visited = new Set();
  while (queue.length) {
    const path = queue.shift(), machine = stopped(path), context = machine.snapshot();
    const key = JSON.stringify(context);
    if (visited.has(key)) continue;
    visited.add(key);
    assert.equal(context.possessionEpoch, 7);
    assert.equal(context.dribbleEnded, true);
    for (const target of DRIBBLE_STATES) assert.equal(machine.canTransition(target).ok, false, `${path.join(' → ')} → ${target}`);
    for (const target of STATE_IDS) if (machine.canTransition(target).ok) queue.push([...path, target]);
  }
  assert.ok(visited.size >= 10, `Only explored ${visited.size} states`);
  const machine = stopped(['pivot', 'receive_two_hands']);
  assert.equal(machine.transition('dribble_idle').reason, 'dribble-ended-this-possession');
  const graph = machine.effectiveGraph();
  assert.deepEqual(graph, effectiveTransitionGraph(machine.context));
  for (const targets of Object.values(graph)) for (const target of DRIBBLE_STATES) assert.equal(targets.includes(target), false);
});

test('receiving, release, contact, seek and completion cannot grant authoritative possession', () => {
  const machine = createStateMachine();
  machine.transition('receive_two_hands');
  for (const name of ['contact', 'secure', 'release', 'completed', 'seek']) {
    const before = machine.snapshot();
    machine.handlePresentationEvent({domain: 'presentation', name, epoch: 99, owner: 'self'});
    assert.deepEqual(machine.snapshot(), before);
  }
  assert.equal(machine.transition('dribble_idle').reason, 'authoritative-possession-required');
  assert.throws(() => machine.handlePresentationEvent({name: 'possession', domain: 'gameplay'}), TypeError);
});

test('only a fresh authoritative epoch reopens dribbling; stale, invalid and opponent epochs do not', () => {
  const machine = stopped(['pivot', 'receive_two_hands']);
  for (const epoch of [7, 6, -1, 7.5, NaN, Infinity, '8']) {
    assert.throws(() => machine.authorizePossession({epoch, owner: 'self'}));
    assert.equal(machine.context.dribbleEnded, true);
  }
  assert.throws(() => machine.authorizePossession({epoch: 8, owner: 'animation'}), TypeError);
  machine.authorizePossession({epoch: 8, owner: 'other'});
  assert.equal(machine.canTransition('dribble_idle').reason, 'authoritative-possession-required');
  machine.authorizePossession({epoch: 9, owner: 'self'});
  assert.equal(machine.transition('dribble_idle').ok, true);
  assert.equal(machine.context.dribbleStarted, true);
});

test('bootstrap stop and bootstrap dribble preserve possession history', () => {
  const stoppedAtStart = createStateMachine({initialState: 'stop_two_feet', possession: {epoch: 0, owner: 'self'}});
  stoppedAtStart.transition('pivot'); stoppedAtStart.transition('receive_moving');
  assert.equal(stoppedAtStart.transition('dribble_run').reason, 'dribble-ended-this-possession');
  const dribblingAtStart = createStateMachine({initialState: 'dribble_idle', possession: {epoch: 1, owner: 'self'}});
  assert.equal(dribblingAtStart.context.dribbleStarted, true);
  dribblingAtStart.transition('pass_side'); dribblingAtStart.transition('receive_moving');
  assert.equal(dribblingAtStart.transition('dribble_run').reason, 'dribble-ended-this-possession');
});

test('legal pre-dribble pivot can start a dribble; invalid requests never mutate state', () => {
  const machine = createStateMachine({possession: {epoch: 1, owner: 'self'}});
  machine.transition('receive_two_hands'); machine.transition('pivot');
  assert.equal(machine.transition('dribble_idle').ok, true);
  const before = machine.snapshot();
  assert.equal(machine.transition('not_a_clip').ok, false);
  assert.deepEqual(machine.snapshot(), before);
  assert.throws(() => {machine.context.dribbleEnded = false;}, TypeError);
});
