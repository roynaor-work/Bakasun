import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {fireScenario} from '../workout/island/minigames/fire-campaign.mjs';
import {createFireModel} from '../workout/island/minigames/fire.mjs';

const {minigames} = JSON.parse(await readFile(new URL('../workout/island/data/config.json', import.meta.url), 'utf8'));
const original = minigames.fireRescue;
const changes = new Map([
  [7, {resistance: 1.15}],
  [8, {resistance: 1.25}],
  [9, {resistance: 1.4, seconds: 104}],
  [10, {resistance: 1.55, seconds: 108}],
]);

function withQuery(search, run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {configurable: true, value: new URL(search, 'https://example.test/')});
  try {
    return run();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else delete globalThis.location;
  }
}

test('fire URL switch changes only the six audited values for the currently selected stage', () => {
  const before = structuredClone(original);
  for (let level = 1; level <= original.levels.length; level++) {
    const baseline = withQuery('', () => fireScenario(original, level));
    const expected = structuredClone(baseline);
    if (changes.has(level)) {
      assert.deepEqual(baseline, before);
      Object.assign(expected.levels[level - 1], changes.get(level));
      for (const search of ['?balanceFire=0', '?balanceFire=true', '?unrelated=1']) {
        assert.deepEqual(withQuery(search, () => fireScenario(original, level)), baseline);
      }
    }
    withQuery('?unrelated=1&balanceFire=1', () => {
      const scenario = fireScenario(original, level);
      assert.deepEqual(scenario, expected, `stage ${level}`);
      assert.deepEqual(fireScenario(scenario, level), expected, 'session and model both derive a scenario');
    });
  }
  assert.deepEqual(original, before);
});

test('the fire model uses the selected stage clock and resistance when the player sprays', () => {
  for (const [level, changesForStage] of changes) {
    const makeModel = () => createFireModel({config: minigames, balance: original, level, random: () => 0.5});
    const baseline = withQuery('', makeModel);
    const candidate = withQuery('?balanceFire=1', makeModel);
    const settings = original.levels[level - 1];
    assert.equal(baseline.remaining, settings.seconds + original.startGrace);
    assert.equal(candidate.remaining, (changesForStage.seconds ?? settings.seconds) + original.startGrace);
    const target = baseline.flames[0];
    const initialHeat = target.heat;
    const input = {x: target.x, y: target.y, firing: true};
    baseline.update(1 / 60, input);
    candidate.update(1 / 60, input);
    const baselineCooling = initialHeat - baseline.flames[0].heat;
    const candidateCooling = initialHeat - candidate.flames[0].heat;
    assert.ok(baselineCooling > 0);
    assert.ok(candidateCooling > baselineCooling);
    assert.ok(Math.abs(candidateCooling / baselineCooling - settings.resistance / changesForStage.resistance) < 1e-9);
    assert.equal(candidate.water, baseline.water);
  }
});
