import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import test from 'node:test';
import {BADGES, BADGE_GROUPS} from '../workout/island/assets/progress-board-v1/data/badges.mjs';
import {COMPLIMENTS, complimentsByReason} from '../workout/island/assets/progress-board-v1/data/compliments.mjs';
import {arcadeEvent, islandEvent, workoutEvent} from '../workout/island/assets/progress-board-v1/src/events.mjs';
import {COOLDOWN_MS, LEVELS, cleanLabel, createState, enabled, localDay, normalizeEvent, praiseCopy} from '../workout/island/assets/progress-board-v1/src/progress.mjs';
import {createMemoryStore, createStore} from '../workout/island/assets/progress-board-v1/src/store.mjs';

const at = (day = 15, hour = 12, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
const makeId = () => String(++serial);
let serial = 0;

function game({when = at(), gameId = 'soccer', score = 1, stars = 1, outcome = 'win', stage = 1, ...rest} = {}) {
  return islandEvent({runId: makeId(), gameId, at: when, result: {score, stars, outcome, stage}, ...rest});
}

function workout({when = at(), count = 1, target = 8, programId = 'strength', feedback} = {}) {
  const items = ['squat', 'balance', 'jump'].map((exId, index) => ({
    exId, type: 'reps', target, done: index < count ? target : 1,
  }));
  return workoutEvent({id: makeId(), programId, feedback, items},
    {at: when, stars: count === 3 ? 3 : 2, label: 'אימון כוח'});
}

function drill(when, hits, attempts = 5, kind = 'targets') {
  return islandEvent({runId: makeId(), gameId: 'soccer', at: when, drillAttempts: 5,
    result: {outcome: 'lose', stage: 1, score: hits, stars: 0, drill: {kind, hits, attempts}}});
}

test('the corpus has 300 distinct sentences, two forms and ten choices per age and reason', () => {
  assert.equal(COMPLIMENTS.length, 300);
  assert.equal(new Set(COMPLIMENTS.map(row => row.id)).size, 300);
  assert.equal(new Set(COMPLIMENTS.map(row => row.masculine.text)).size, 300);
  assert.equal(Object.keys(complimentsByReason).length, 15);
  for (const group of Object.values(complimentsByReason)) {
    assert.equal(group['6-8'].length, 10);
    assert.equal(group['9-12'].length, 10);
  }
  for (const row of COMPLIMENTS) {
    assert.notEqual(row.masculine.spoken, row.feminine.spoken, row.id);
    assert.equal(row.masculine.text, row.feminine.text);
    for (const form of [row.masculine, row.feminine]) {
      assert.match(form.text, /^[\p{Script=Hebrew}\s.,]+$/u, row.id);
      assert.doesNotMatch(form.text, /[\u05B0-\u05C7]/);
      assert.match(form.spoken, /^[\p{Script=Hebrew}\s.,]+$/u, row.id);
      for (const word of form.spoken.match(/[\p{Script=Hebrew}]+/gu)) {
        assert.match(word, /[\u05B0-\u05BB\u05C7]|ו\u05BC/, `${row.id} ${word}`);
      }
    }
  }
  const praise = {reason: 'new-workout', slot: 0};
  assert.equal(praiseCopy(praise, {}).spoken, null);
  assert.match(praiseCopy(praise, {ageBand: '6-8', form: 'masculine'}).spoken, /עָשִׂיתָ/);
  assert.match(praiseCopy(praise, {ageBand: '6-8', form: 'feminine'}).spoken, /עָשִׂיתְ/);
  assert.notEqual(praiseCopy(praise, {ageBand: '6-8'}).text, praiseCopy(praise, {ageBand: '9-12'}).text);
});

test('all twenty badge assets and eight distinct animation frames are SVGs at 128 by 128', async () => {
  assert.deepEqual(BADGE_GROUPS.map(([id]) => BADGES.filter(badge => badge.group === id).length), [4, 4, 3, 3, 3, 3]);
  const check = async (directory, expected) => {
    const path = new URL(`../workout/island/assets/progress-board-v1/art/${directory}/`, import.meta.url);
    assert.deepEqual((await readdir(path)).sort(), expected.toSorted());
    const drawings = await Promise.all(expected.map(file => readFile(new URL(file, path), 'utf8')));
    assert.equal(new Set(drawings).size, expected.length);
    for (const xml of drawings) assert.match(xml, /width="128" height="128" viewBox="0 0 128 128"/);
  };
  await check('badges', BADGES.map(badge => `${badge.id}.svg`));
  await check('unlock', ['01.svg', '02.svg', '03.svg', '04.svg', '05.svg', '06.svg', '07.svg', '08.svg']);
  assert.match(await readFile(new URL('../workout/island/assets/progress-board-v1/art/praise-ribbon.svg', import.meta.url), 'utf8'), /^<svg /);
});

test('weekly stars roll over on Sunday and the streak survives until a complete day is missed', async () => {
  let now = at(15);
  const store = createMemoryStore(createState(), () => now);
  for (const day of [13, 14, 15]) await store.record(game({when: at(day), stars: 2}));
  assert.equal((await store.read()).weeklyStars, 2);
  assert.equal((await store.read()).stars, 6);
  assert.equal((await store.read()).streak, 3);
  now = at(16);
  assert.equal((await store.read()).streak, 3);
  now = at(17);
  assert.equal((await store.read()).streak, 0);
  assert.equal(localDay(at(16, 0, 0)) - localDay(at(15, 23, 59)), 1);
  assert.equal(localDay(new Date(2026, 9, 26, 12)) - localDay(new Date(2026, 9, 25, 12)), 1);
});

test('levels use total stars and have a terminal state', async () => {
  const store = createMemoryStore(createState(), () => at());
  for (let i = 0; i < 3; i++) await store.record(game({stars: 3}));
  assert.deepEqual((await store.read()).level, {number: 2, floor: 8, next: 20});
  for (let i = 0; i < 100; i++) await store.record(game({stars: 3}));
  assert.deepEqual((await store.read()).level, {number: LEVELS.length, floor: LEVELS.at(-1), next: null});
});

test('all twenty tags unlock once when the observed criteria accumulate', async () => {
  const store = createMemoryStore(createState(), () => at(21));
  const emitted = [];
  const record = async event => emitted.push(...(await store.record(event)).newBadges.map(badge => badge.id));

  for (let i = 0; i < 7; i++) {
    const day = 15 + i;
    await record(game({when: at(day, 10), score: i + 1, stars: 3, stage: 1}));
    await record(game({when: at(day, 11), score: 1, stars: 0, outcome: 'lose', stage: 2}));
    await record(game({when: at(day, 12), score: 1, stars: 3, stage: 2}));
    if (i < 3) await record(workout({when: at(day, 13), count: i + 1, feedback: 'hard'}));
    if (i < 3) await record(game({when: at(day, 14), gameId: 'fireRescue', stars: 3, stage: 3,
      eventId: `fire-${i}`, resolvedFireEvent: true, fireSummary: {rescued: 1}}));
  }
  await record(game({when: at(21, 15), gameId: 'tennis'}));
  await record(game({when: at(21, 16), gameId: 'islandRacing'}));
  const ids = BADGES.map(badge => badge.id).toSorted();
  assert.deepEqual(emitted.toSorted(), ids);
  assert.deepEqual((await store.read()).earned.toSorted(), ids);
});

test('eligible praise reasons are chosen only for the actions they describe', async () => {
  const was = async (reason, ...events) => {
    const store = createMemoryStore(createState(), () => at(26));
    let last;
    for (const event of events) last = await store.record(event);
    assert.equal(last.praise?.reason, reason);
  };
  const first = at(15);
  const second = at(16);
  const third = at(17);
  await was('new-workout', workout());
  await was('new-game', game());
  await was('new-drill', drill(first, 1));
  await was('workout-effort', workout({when: first}), workout({when: at(15, 13)}), workout({when: at(15, 14)}));
  await was('workout-goals', workout({when: first, count: 3}), workout({when: second, count: 3}));
  await was('workout-improve', workout({when: first, count: 1}), workout({when: second, count: 2}));
  await was('game-round', game({when: first}), game({when: at(15, 13)}), game({when: at(15, 14)}));
  await was('game-improve', game({when: first}), game({when: second, score: 2}));
  await was('drill-improve', drill(first, 1), drill(second, 2));
  await was('streak', game({when: first}), game({when: second}), game({when: third}));
  await was('game-mastery', game({when: first}), game({when: second, stars: 3}));
  await was('game-retry', game({when: first, outcome: 'lose', stars: 0}), game({when: second}));
  await was('honest-feedback', workout({feedback: 'hard'}));
  await was('rescue', game({gameId: 'fireRescue', outcome: 'lose', stars: 0, fireSummary: {rescued: 1}}));
  await was('help-mission', game({gameId: 'fireRescue', eventId: 'fire', resolvedFireEvent: true}));
});

test('praise has a shared cooldown, a daily cap and eight different recent messages', async () => {
  const store = createMemoryStore(createState(), () => at(25));
  const start = at();
  const first = await store.record(workout({when: start, feedback: 'hard'}));
  assert.equal(first.praise.slot, 0);
  assert.equal((await store.record(workout({when: start + COOLDOWN_MS - 1, feedback: 'hard'}))).praise, null);
  const second = await store.record(game({when: start + COOLDOWN_MS, gameId: 'fireRescue', eventId: 'fire', resolvedFireEvent: true}));
  assert.equal(second.praise.reason, 'help-mission');
  assert.equal((await store.record(workout({when: start + 2 * COOLDOWN_MS, feedback: 'hard'}))).praise, null);
  const slots = [];
  for (let day = 16; day <= 25; day++) {
    slots.push((await store.record(workout({when: at(day), feedback: 'hard'}))).praise.slot);
  }
  for (let i = 8; i < slots.length; i++) assert.ok(!slots.slice(i - 8, i).includes(slots[i]));

  const midnight = createMemoryStore();
  await midnight.record(workout({when: at(15, 23, 58), feedback: 'hard'}));
  assert.equal((await midnight.record(workout({when: at(16, 0, 2), feedback: 'hard'}))).praise, null);
});

test('similar measurements compare within a track and equal results earn no improvement', async () => {
  const store = createMemoryStore();
  await store.record(game({when: at(15), score: 4}));
  await store.record(game({when: at(16), score: 7, stage: 2}));
  const tie = await store.record(game({when: at(17), score: 4}));
  assert.ok(tie.newBadges.every(badge => badge.group !== 'improvement'));
  const high = await store.record(game({when: at(18), score: 5}));
  assert.equal(high.praise.reason, 'game-improve');
  await store.record(workout({when: at(15), count: 1}));
  assert.equal((await store.record(workout({when: at(18), count: 3, target: 9}))).newBadges.some(b => b.id === 'practice-progress'), false);
  const board = await store.read();
  assert.equal(board.tracks.length, 1);
  assert.deepEqual(board.tracks[0].points.map(point => point.value), [4, 4, 5]);
  for (let i = 0; i < 8; i++) await store.record(game({when: at(19, 10, i), score: i}));
  assert.deepEqual((await store.read()).tracks[0].points.map(point => point.value), [2, 3, 4, 5, 6, 7]);
});

test('an older delivery updates totals without replaying a dated compliment or removing awards', async () => {
  const store = createMemoryStore(createState(), () => at(18));
  const later = await store.record(game({when: at(17), score: 2}));
  const earlier = await store.record(game({when: at(16), score: 5}));
  assert.equal(earlier.praise, null);
  const board = await store.read();
  assert.equal(board.stars, 2);
  assert.equal(board.streak, 2);
  assert.equal(board.latest.at, later.praise.at);
  assert.deepEqual(board.tracks[0].points.map(point => point.value), [5, 2]);
  assert.ok(board.earned.includes('first-step'));
});

test('event adapters reject exits, incomplete drills, zero-effort workouts and unrelated help', () => {
  assert.equal(islandEvent({runId: 'cancel', gameId: 'soccer', result: {cancelled: true}}), null);
  assert.equal(drill(at(), 1, 2), null);
  assert.equal(workoutEvent({id: 'a', items: []}, {at: at(), stars: 0}), null);
  const input = {runId: 'x', gameId: 'pong', label: 'הוקי שולחן', seconds: 30, result: {score: 4, stars: 2}};
  assert.equal(arcadeEvent(input), null);
  assert.equal(arcadeEvent({...input, result: {...input.result, completed: true}}).metric.key, 'pong:30');
  assert.equal(game({gameId: 'soccer', fireSummary: {rescued: 1}, resolvedFireEvent: true}).rescued, false);
  assert.equal(game({gameId: 'fireRescue', eventId: 'fire', resolvedFireEvent: false}).helpMission, false);
  assert.equal(game({gameId: 'fireRescue', resolvedFireEvent: true}).helpMission, false);
  assert.equal(game({gameId: 'fireRescue', eventId: 'fire', resolvedFireEvent: true, outcome: 'lose'}).helpMission, false);
  assert.notEqual(game({gameId: 'tennis', tennisDifficulty: 'easy'}).metric.key, game({gameId: 'tennis', tennisDifficulty: 'hard'}).metric.key);
});

test('the rollback flag is explicit and runtime labels use Hebrew without exclamation marks', () => {
  assert.equal(enabled(''), true);
  assert.equal(enabled('?progressBoard=1'), true);
  assert.equal(enabled('?foo=1&progressBoard=0'), false);
  assert.equal(normalizeEvent({...game(), stars: -1}), null);
  assert.equal(normalizeEvent({...game(), at: NaN}), null);
  assert.equal(normalizeEvent({...game(), id: 'bad label'}), null);
  assert.equal(cleanLabel('מרוץ! \u062a\u064e 🏁', 'משחק'), 'מרוץ');
  assert.equal(cleanLabel('999 English', 'משחק'), 'משחק');
});

test('deduplication, preference defaults and memory fallback preserve local state', async () => {
  const store = await createStore({storage: {setItem() { throw new Error('blocked'); }}, now: () => at()});
  assert.equal(store.persistent, false);
  const event = game();
  assert.ok(await store.record(event));
  assert.equal(await store.record(event), null);
  await store.preferences({ageBand: '9-12'}, true);
  await store.preferences({ageBand: '6-8', form: 'feminine'}, true);
  assert.deepEqual((await store.read()).preferences, {ageBand: '9-12', form: 'feminine'});
  await store.preferences({ageBand: '6-8'});
  assert.equal((await store.read()).preferences.ageBand, '6-8');
  assert.equal((await store.read()).weeklyStars, 1);
});
