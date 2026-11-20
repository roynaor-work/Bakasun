import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMissions, createMissionState, mergeMissionSaves, validMissionState } from '../workout/island/assets/city-missions-v1/logic.mjs';

const house = { id: 'building-1', typeId: 'house' };
const fireStation = { id: 'building-2', typeId: 'fireStation' };
const police = { id: 'building-3', typeId: 'police' };
const fire = {
  id: 'fire', kind: 'rescue', event: true, minGameStage: 2, minBuildings: 2,
  requiresTypes: ['fireStation'], gameIds: ['fireRescue'], stageOffset: -1, weight: 3
};
const crime = {
  id: 'crime', kind: 'rescue', event: true, requiresTypes: ['police'],
  gameIds: ['catchCriminal'], weight: 1
};
const build = { id: 'build-house', kind: 'build', target: 'house' };
const upgrade = { id: 'upgrade-house', kind: 'upgrade', target: 'house' };
const collect = { id: 'collect-food', kind: 'collect', target: 'food', amount: 2 };
const connect = { id: 'connect-house', kind: 'connect', target: 'house', amount: 2, minDisconnected: 1 };
const play = { id: 'play-sports', kind: 'play', gameIds: ['soccer', 'tennis'] };

function catalog(rows, pacing = {}) {
  return {
    pacing: { firstEventAfter: 10, eventCooldown: 20, minMissionsBetweenEvents: 1, ...pacing },
    missions: rows.map(row => ({ reward: { money: 17 }, ...row }))
  };
}

function world(overrides = {}) {
  return {
    ready: true, cityStage: 0, playSeconds: 0, random: 0,
    buildings: [house], disconnectedCount: 1, connectable: true,
    buildTypes: ['house'], upgradeTypes: ['house'], resourcesEarnable: ['food'],
    games: { soccer: { stage: 2 }, tennis: { stage: 1 } },
    ...overrides
  };
}

const sync = (state, data, context = world()) => advanceMissions(state, data, context).state;
const skip = (state, data, context) => advanceMissions(state, data, context, { type: 'skip' }).state;
const game = (entry, outcome = 'win', overrides = {}) => ({
  type: 'game', token: entry.token, gameId: entry.gameId, stage: entry.stage, outcome, ...overrides
});

test('ignores tutorial time and actions, and never progresses an unseen next task', () => {
  const data = catalog([build, upgrade]);
  const initial = Object.freeze(createMissionState());
  const midTutorial = world({ ready: false, playSeconds: 200 });
  const signal = { type: 'build', target: 'house' };
  assert.deepEqual(advanceMissions(initial, data, midTutorial, signal), { state: initial, reward: null });

  const context = world({ playSeconds: 201 });
  const started = advanceMissions(initial, data, context, signal);
  assert.equal(started.reward, null);
  assert.equal(started.state.startedAt, 201);
  assert.equal(started.state.active.id, build.id);
  assert.equal(started.state.active.progress, 0);
  assert.equal(started.state.next.id, upgrade.id);
  assert.equal(started.state.next.token, undefined);

  const ignored = advanceMissions(started.state, data, context, { type: 'upgrade', target: 'house' });
  assert.equal(ignored.state, started.state);
  assert.equal(ignored.reward, null);

  const finished = advanceMissions(Object.freeze(started.state), data, context, signal);
  assert.deepEqual(finished.reward, { money: 17 });
  assert.equal(finished.state.active.id, upgrade.id);
  assert.equal(finished.state.active.progress, 0);
  assert.equal(finished.state.active.token, started.state.active.token + 1);
  assert.equal(started.state.active.id, build.id);
});

test('collects only net simulated resource income and persists fractional progress', () => {
  const data = catalog([collect, build]);
  const started = sync(createMissionState(), data);
  const signal = { type: 'collect', target: 'food', amount: 0.75 };
  assert.equal(advanceMissions(started, data, world(), { ...signal, target: 'energy' }).state, started);
  assert.equal(advanceMissions(started, data, world(), { ...signal, amount: -3 }).state, started);
  assert.equal(advanceMissions(started, data, world(), { ...signal, amount: Infinity }).state, started);

  const partial = advanceMissions(started, data, world(), signal);
  assert.equal(partial.state.active.progress, 0.75);
  assert.equal(partial.reward, null);
  assert.equal(started.active.progress, 0);

  const hydrated = JSON.parse(JSON.stringify(partial.state));
  assert.ok(validMissionState(hydrated));
  const finished = advanceMissions(hydrated, data, world(), { ...signal, amount: 1.25 });
  assert.deepEqual(finished.reward, { money: 17 });
  assert.equal(finished.state.active.id, build.id);
});

test('final upgrades and connections count after their eligibility changes', () => {
  const upgrading = catalog([upgrade, collect]);
  const s = sync(createMissionState(), upgrading);
  const upgraded = advanceMissions(s, upgrading, world({ upgradeTypes: [] }), { type: 'upgrade', target: 'house' });
  assert.deepEqual(upgraded.reward, { money: 17 });
  assert.equal(upgraded.state.active.id, collect.id);

  const connecting = catalog([connect, collect]);
  const c = sync(createMissionState(), connecting);
  const partial = advanceMissions(c, connecting, world(), { type: 'connect', amount: 2, connected: { house: 1, park: 1 } });
  assert.equal(partial.state.active.progress, 1);
  const finished = advanceMissions(partial.state, connecting, world({ disconnectedCount: 0, connectable: false }),
    { type: 'connect', target: 'house' });
  assert.deepEqual(finished.reward, { money: 17 });
  assert.equal(finished.state.active.id, collect.id);
});

test('undo and rebuild leave construction and connection rewards complete', () => {
  const cases = [
    { definition: build, signal: { type: 'build', target: 'house' } },
    { definition: upgrade, signal: { type: 'upgrade', target: 'house' } },
    { definition: { ...connect, amount: 1 }, signal: { type: 'connect', target: 'house' } }
  ];
  for (const { definition, signal } of cases) {
    const data = catalog([definition]);
    const started = sync(createMissionState(), data);
    const completed = advanceMissions(started, data, world(), signal);
    assert.deepEqual(completed.state.completedConstruction, [definition.id]);
    assert.deepEqual(completed.reward, { money: 17 });
    assert.equal(completed.state.active, null);
    assert.ok(validMissionState(completed.state));

    // The original action is available again after Undo or loading the save.
    const hydrated = JSON.parse(JSON.stringify(completed.state));
    const retried = advanceMissions(hydrated, data, world(), signal);
    assert.deepEqual(retried, { state: hydrated, reward: null });
  }
});

test('unreachable construction and game previews are replaced without payment', () => {
  const data = catalog([upgrade, play, build]);
  const started = sync(createMissionState(), data);
  assert.equal(started.active.id, upgrade.id);
  assert.equal(started.next.id, play.id);

  const changed = advanceMissions(started, data, world({ upgradeTypes: [], games: {} }));
  assert.equal(changed.reward, null);
  assert.equal(changed.state.active.id, build.id);
  assert.equal(changed.state.next, null);
});

test('events wait for the clock, city conditions, and a stage that is actually unlocked', () => {
  const data = catalog([build, collect, { ...fire, minCityStage: 1 }]);
  const start = sync(createMissionState(), data, world({ playSeconds: 200 }));
  const withCity = world({
    cityStage: 1, playSeconds: 209, buildings: [house, fireStation], games: { fireRescue: { stage: 2 } }
  });
  assert.equal(sync(start, data, withCity), start);
  assert.equal(sync(start, data, { ...withCity, playSeconds: 210, cityStage: 0 }), start);
  assert.equal(sync(start, data, { ...withCity, playSeconds: 210, games: { fireRescue: { stage: 1 } } }), start);
  assert.equal(sync(start, data, {
    ...withCity, playSeconds: 210, buildings: [fireStation, { typeId: 'road' }, { typeId: 'cityHall' }]
  }), start);

  const due = sync(start, data, { ...withCity, playSeconds: 210 });
  assert.equal(due.active, start.active);
  assert.equal(due.next.id, fire.id);
  assert.equal(due.next.stage, 2);
  assert.equal(due.lastEventAt, null);
  const nextContext = { ...withCity, games: { fireRescue: { stage: 5 } }, playSeconds: 212 };
  const kept = sync(due, data, nextContext);
  assert.equal(kept, due);
  const launched = skip(kept, data, nextContext);
  assert.equal(launched.active.id, fire.id);
  assert.equal(launched.active.stage, 2);
  assert.equal(launched.lastEventAt, 212);
  assert.equal(launched.next.id, collect.id);
  assert.equal(launched.routinesSinceEvent, 0);
});

test('weighted event choice is reproducible and draws only from eligible game routes', () => {
  const data = catalog([build, fire, crime, { ...play, id: 'sports', event: true }]);
  const started = sync(createMissionState(), data);
  const context = world({
    playSeconds: 10, buildings: [house, fireStation, police],
    games: { fireRescue: { stage: 4 }, catchCriminal: { stage: 1 }, tennis: { stage: 1 } }
  });
  const strongest = sync(started, data, context);
  assert.equal(strongest.next.id, fire.id);
  assert.equal(strongest.next.stage, 3);
  assert.deepEqual(sync(started, data, context), strongest);
  const laterDraw = sync(started, data, { ...context, random: 0.7 });
  assert.equal(laterDraw.next.id, crime.id);
  const latestDraw = sync(started, data, { ...context, random: 0.9 });
  assert.equal(latestDraw.next.id, 'sports');
  assert.equal(latestDraw.next.gameId, 'tennis');
});

test('rescue needs a win on the exact mission token, game and stage', () => {
  const data = catalog([build, fire]);
  const context = world({ buildings: [house, fireStation], games: { fireRescue: { stage: 3 } } });
  const initial = sync(createMissionState(), data, context);
  const activeContext = { ...context, playSeconds: 10 };
  const due = sync(initial, data, activeContext);
  assert.equal(advanceMissions(due, data, activeContext, game(due.next)).reward, null);

  const playing = skip(due, data, activeContext);
  for (const ignored of [
    game(playing.active, 'lose'),
    game(playing.active, 'win', { token: playing.active.token - 1 }),
    game(playing.active, 'win', { gameId: 'soccer' }),
    game(playing.active, 'win', { stage: 1 }),
    game(playing.active, 'cancelled')
  ]) {
    const result = advanceMissions(playing, data, activeContext, ignored);
    assert.equal(result.state, playing);
    assert.equal(result.reward, null);
  }

  const win = advanceMissions(playing, data, activeContext, game(playing.active));
  assert.deepEqual(win.reward, { money: 17 });
  assert.equal(win.state.active.id, build.id);
  assert.equal(advanceMissions(win.state, data, activeContext, game(playing.active)).reward, null);
});

test('ordinary play can finish with a loss; stale tokens remain stale after reissuance', () => {
  const data = catalog([play]);
  const initial = sync(createMissionState(), data);
  const first = game(initial.active, 'lose');
  const finished = advanceMissions(initial, data, world(), first);
  assert.deepEqual(finished.reward, { money: 17 });
  assert.equal(finished.state.active.id, play.id);
  assert.ok(finished.state.active.token > initial.active.token);
  assert.equal(advanceMissions(finished.state, data, world(), first).reward, null);
});

test('changed game access invalidates a preview without advancing the active routine', () => {
  const data = catalog([build, collect, fire, crime]);
  const context = world({
    buildings: [house, fireStation, police], games: { fireRescue: { stage: 2 }, catchCriminal: { stage: 1 } }
  });
  const initial = sync(createMissionState(), data, context);
  const due = sync(initial, data, { ...context, playSeconds: 10 });
  assert.equal(due.next.id, fire.id);

  const newContext = { ...context, playSeconds: 11, buildings: [house, police] };
  const changed = sync(due, data, newContext);
  assert.equal(changed.active, initial.active);
  assert.equal(changed.next.id, crime.id);
  assert.equal(changed.lastEventAt, null);
});

test('cooldown and routine completion both apply; skips and the last event never bypass them', () => {
  const data = catalog([build, collect, fire, crime]);
  const context = world({
    buildings: [house, fireStation, police], games: { fireRescue: { stage: 3 }, catchCriminal: { stage: 1 } }
  });
  const start = sync(createMissionState(), data, context);
  const firstContext = { ...context, playSeconds: 10 };
  const first = skip(sync(start, data, firstContext), data, firstContext);
  assert.equal(first.active.id, fire.id);
  const routine = skip(first, data, firstContext);
  assert.equal(routine.active.id, collect.id);
  const completed = advanceMissions(routine, data, { ...context, playSeconds: 29 }, {
    type: 'collect', target: 'food', amount: 2
  }).state;
  assert.equal(completed.next.id, collect.id);
  assert.equal(completed.routinesSinceEvent, 1);

  const withoutAlternatives = sync(completed, data, {
    ...context, buildings: [house, fireStation], playSeconds: 60
  });
  assert.equal(withoutAlternatives, completed);

  const nextContext = { ...context, playSeconds: 30 };
  const next = sync(completed, data, nextContext);
  assert.equal(next.next.id, crime.id);

  const onlySkipped = skip(routine, data, { ...context, playSeconds: 100 });
  assert.equal(onlySkipped.routinesSinceEvent, 0);
  assert.equal(onlySkipped.next.id, collect.id);
});

test('a long event starts a fresh cooldown on success, skip, or lost eligibility', () => {
  const data = catalog([build, collect, fire, crime]);
  const context = world({
    buildings: [house, fireStation, police], games: { fireRescue: { stage: 3 }, catchCriminal: { stage: 1 } }
  });
  const started = sync(createMissionState(), data, context);
  const early = { ...context, playSeconds: 10 };
  const active = skip(sync(started, data, early), data, early);
  const late = { ...context, playSeconds: 100 };
  const exits = [
    { world: late, signal: game(active.active), reward: { money: 17 } },
    { world: late, signal: { type: 'skip' }, reward: null },
    { world: { ...late, buildings: [house, police] }, signal: { type: 'sync' }, reward: null }
  ];
  for (const exit of exits) {
    const ended = advanceMissions(active, data, exit.world, exit.signal);
    assert.deepEqual(ended.reward, exit.reward);
    assert.equal(ended.state.lastEventAt, 100);
    assert.equal(ended.state.active.id, collect.id);
    const routine = advanceMissions(ended.state, data, exit.world, {
      type: 'collect', target: 'food', amount: 2
    }).state;
    assert.equal(routine.routinesSinceEvent, 1);
    assert.equal(sync(routine, data, { ...exit.world, playSeconds: 119 }).next.id, collect.id);
    assert.equal(sync(routine, data, { ...exit.world, playSeconds: 120 }).next.id, crime.id);
  }
});

test('a long series of syncs stays bounded, including a city with no reachable task', () => {
  const data = catalog([build, fire]);
  const context = world({ buildTypes: [], buildings: [], games: {} });
  let state = sync(createMissionState(), data, context);
  const initial = state;
  for (let i = 1; i <= 2000; i++) {
    const result = advanceMissions(state, data, { ...context, playSeconds: i });
    assert.equal(result.reward, null);
    assert.equal(result.state, initial);
    state = result.state;
  }
  assert.ok(validMissionState(state));
  assert.equal(state.active, null);
  assert.equal(state.next, null);
});

test('save validation rejects mismatched tokens, progress and schema versions', () => {
  const initial = createMissionState();
  const s = sync(initial, catalog([build, collect]));
  assert.ok(validMissionState(initial));
  assert.ok(validMissionState(JSON.parse(JSON.stringify(s))));
  assert.equal(validMissionState({ ...s, version: 2 }), false);
  assert.equal(validMissionState({ ...s, active: { ...s.active, token: 0 } }), false);
  assert.equal(validMissionState({ ...s, next: { ...s.next, progress: 1 } }), false);
  assert.equal(validMissionState({ ...s, next: { ...s.next, stage: 1 } }), false);
  assert.equal(validMissionState({ ...s, recentRoutines: [build.id, build.id] }), false);
  assert.equal(validMissionState({ ...s, completedConstruction: [build.id] }), false);
  assert.equal(validMissionState({ ...s, lastEvent: fire.id, lastEventAt: null }), false);
  assert.equal(validMissionState(null), false);
});

test('additive backup import keeps the local queue and deduplicates construction rewards', () => {
  const data = catalog([build, upgrade, collect]);
  const local = sync(createMissionState(), data);
  const imported = advanceMissions(local, data, world(), { type: 'build', target: 'house' }).state;
  const merged = mergeMissionSaves(local, imported);
  assert.equal(mergeMissionSaves(undefined, imported), imported);
  assert.equal(mergeMissionSaves(local, { version: 100 }), local);
  assert.equal(merged.active, null);
  assert.equal(merged.next, local.next);
  assert.ok(validMissionState(merged));
  assert.deepEqual(merged.completedConstruction, ['build-house']);
  assert.deepEqual(local.completedConstruction, []);
  const after = advanceMissions(merged, data, world(), { type: 'build', target: 'house' });
  assert.equal(after.reward, null);
  assert.equal(after.state.active.id, 'upgrade-house');
  assert.ok(validMissionState(after.state));
});
