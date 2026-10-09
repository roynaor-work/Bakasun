import test from 'node:test';
import assert from 'node:assert/strict';
import { companionProgress, companionKit, companionCard } from '../workout/js/companion.js';
import { stats, rankOf } from '../workout/js/logic.js';
import { FRAGMENTS, splitVoiceText } from '../workout/js/voice-lines.js';

test('every saved workout improves the character, including after later levels', () => {
  const base = { shirt: '#0B7A3B', number: '7', stripe: null };
  for (let n = 0; n < 150; n++) {
    const before = companionKit(base, n), after = companionKit(base, n + 1);
    assert.notDeepEqual(after, before);
    assert.equal(after.patch, String(n + 1));
    assert.equal(after.number, '7'); assert.equal(after.shirt, base.shirt);
  }
  assert.deepEqual(base, { shirt: '#0B7A3B', number: '7', stripe: null });
  assert.equal(companionKit(base, 0).patch, '');
  assert.equal(companionKit(base, 4).stripe, null);
  assert.ok(companionKit(base, 5).stripe);
  assert.notEqual(companionKit(base, 10).stripe, companionKit(base, 5).stripe);
});

test('progress at level boundaries and invalid counts stays usable', () => {
  for (const [count, level, remaining] of [[0, 1, 5], [1, 1, 4], [4, 1, 1], [5, 2, 5], [6, 2, 4], [100, 21, 5]]) {
    const p = companionProgress(count);
    assert.equal(p.workouts, count); assert.equal(p.level, level); assert.equal(p.toNext, remaining);
  }
  for (const count of [-1, 1.5, NaN, Infinity, '5', null]) assert.equal(companionProgress(count).workouts, 0);
});

test('old history contributes; saving, feedback and reload add exactly one improvement', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  globalThis.localStorage = storage;
  const sessions = Array.from({ length: 4 }, (_, n) => ({ id: `test-${n}`, date: '2026-10-01T09:00:00Z',
    items: [{ type: 'reps', target: 10, done: n + 1 }], feedback: 'hard' }));
  storage.setItem('kidfit.v1', JSON.stringify({ sessions, tokens: 3, games: { resetV: 2 } }));
  const { store } = await import('../workout/js/store.js?companion-before');
  assert.equal(companionProgress(store.sessions.length).level, 1);
  const before = stats(store.sessions), session = { id: 'test-new', date: '2026-10-02T09:00:00Z', items: [{ type: 'reps', target: 10, done: 1 }] };
  store.addSession(session);
  session.feedback = 'hard'; store.save();
  const after = companionProgress(store.sessions.length);
  assert.equal(after.workouts, 5); assert.equal(after.level, 2);
  const { store: reloaded } = await import('../workout/js/store.js?companion-reloaded');
  assert.deepEqual(companionProgress(reloaded.sessions.length), after);
  assert.equal(reloaded.tokens, 3);
  assert.deepEqual(reloaded.sessions.slice(0, 4), sessions);
  assert.equal(stats(reloaded.sessions).stars, before.stars + 2);
  assert.equal(rankOf(reloaded.sessions.length).belt, 'חגורה צהובה');
  delete globalThis.localStorage;
});

test('new spoken celebration uses a catalog clip and a short visible message', () => {
  assert.deepEqual(splitVoiceText(FRAGMENTS['companion-upgraded']), [
    { id: 'companion-upgraded', text: FRAGMENTS['companion-upgraded'] },
  ]);
  assert.match(companionCard(5, { fresh: true }), /role="status"/);
});
