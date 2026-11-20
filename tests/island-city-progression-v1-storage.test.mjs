import assert from 'node:assert/strict';
import test from 'node:test';
import { cityProgressEnabled, cityProgressStorage, PROGRESSION_WORLD } from '../workout/island/assets/city-progression-v1/storage.mjs';

test('rollback is selected with exactly cityProgression=0 (or the package name cityProgress=0)', () => {
  assert.equal(cityProgressEnabled('?cityProgression=0'), false);
  assert.equal(cityProgressEnabled('?cityProgression=1'), true);
  assert.equal(cityProgressEnabled(''), true);
  assert.equal(cityProgressEnabled('?cityProgress=1'), true);
  assert.equal(cityProgressEnabled('?dev=1&cityProgress=0'), false);
  assert.equal(cityProgressEnabled('?cityProgress=false'), true);
});

test('progression save and reset back up only their own namespace', () => {
  const entries = new Map([
    ['island.v1', 'legacy'], ['island.v1.corrupt.123', 'legacy backup'], ['island.sound', 'legacy sound'],
    ['unrelated', 'unrelated data'],
  ]);
  const backing = {
    get length() { return entries.size; },
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
    key: i => [...entries.keys()][i] ?? null,
  };
  const progression = cityProgressStorage(backing);
  assert.equal(progression.getItem('island.v1'), 'legacy');
  progression.setItem('island.v1', 'working city');
  progression.setItem('island.v1.corrupt.124', 'working backup');
  progression.setItem('island.sound', 'working sound');
  assert.equal(entries.get(PROGRESSION_WORLD), 'working city');
  assert.equal(cityProgressStorage(backing).getItem('island.v1'), 'working city');
  assert.deepEqual(Array.from({ length: progression.length }, (_, i) => progression.key(i)), [
    'island.v1', 'island.v1.corrupt.124', 'island.sound',
  ]);
  for (const key of ['island.v1', 'island.v1.corrupt.124', 'island.sound']) progression.removeItem(key);
  assert.deepEqual(entries, new Map([
    ['island.v1', 'legacy'], ['island.v1.corrupt.123', 'legacy backup'], ['island.sound', 'legacy sound'],
    ['unrelated', 'unrelated data'],
  ]));
});
