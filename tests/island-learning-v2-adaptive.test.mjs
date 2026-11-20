import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAdaptiveSelector, RECENT_LIMIT} from '../workout/island/assets/learning-v2/src/adaptive.mjs';
import {DOMAINS} from '../workout/island/assets/learning-v2/src/data.mjs';

const bank = DOMAINS.flatMap(domain => Array.from({length: 7}, (_, index) => {
  const age = index + 6;
  return [1, 2, 3].flatMap(difficulty => Array.from({length: 6}, (_, topicIndex) => {
    const idFor = level => `${domain}-${age}-${topicIndex}-${level}`;
    return {
      id: idFor(difficulty), domain, age, difficulty, topic: `topic-${topicIndex}`,
      followUps: {correct: idFor(Math.min(3, difficulty + 1)), incorrect: idFor(Math.max(1, difficulty - 1))},
    };
  }));
}).flat());
const math = {domains: ['math']};
const ages = q => [q.age, q.difficulty];

test('a streak changes only the answered subject and selects a matching follow-up', () => {
  const selector = createAdaptiveSelector(bank, {age: 8, random: () => 0});
  const first = selector.select(math);
  assert.deepEqual(ages(first), [8, 2]);
  assert.equal(selector.record(first, {correct: true}), true);
  assert.equal(selector.record(first, {correct: true}), false);
  const second = selector.select(math);
  assert.deepEqual(ages(second), [8, 2]);
  selector.record(second, {correct: true});
  const harder = selector.select(math);
  assert.deepEqual(ages(harder), [8, 3]);
  assert.equal(harder.id, second.followUps.correct);
  selector.record(harder, {correct: false});
  const stillHard = selector.select(math);
  assert.deepEqual(ages(stillHard), [8, 3]);
  selector.record(stillHard, {correct: true, usedHint: true});
  assert.deepEqual(ages(selector.select(math)), [8, 2]);
  assert.deepEqual(ages(selector.select({domains: ['hebrew']})), [8, 2]);
});

test('skipping reduces difficulty, and the allowed age band has hard limits', () => {
  for (const age of [6, 9, 12]) {
    const selector = createAdaptiveSelector(bank, {age});
    let q = selector.select(math);
    selector.record(q, {skipped: true});
    assert.deepEqual(ages(selector.select(math)), [age, 1]);
    for (let index = 0; index < 120; index++) {
      q = selector.select(math);
      assert.ok(q.age >= Math.max(6, age - 1) && q.age <= Math.min(12, age + 1));
      selector.record(q, {correct: index >= 60});
    }
    const tier = selector.snapshot().subjects.math.tier;
    assert.equal(tier, (Math.min(12, age + 1) - 6) * 3 + 2);
  }
});

test('recent selections survive reload and prevent repeats in both narrow and mixed sessions', () => {
  let selector = createAdaptiveSelector(bank, {age: 6});
  const recent = [];
  for (let index = 0; index < 120; index++) {
    const question = selector.select(index < 70 ? math : {});
    assert.ok(question);
    assert.ok(!recent.slice(-RECENT_LIMIT).includes(question.id));
    recent.push(question.id);
    if (index % 7 === 0) {
      selector = createAdaptiveSelector(bank, {age: 6, state: JSON.parse(JSON.stringify(selector.snapshot()))});
    }
  }
  const lastFive = recent.slice(-5).map(id => bank.find(q => q.id === id).domain);
  assert.equal(new Set(lastFive).size, DOMAINS.length);
});

test('changing age keeps recent selections and resets levels; small pools never repeat', () => {
  const selector = createAdaptiveSelector(bank, {age: 10});
  for (let index = 0; index < 4; index++) selector.record(selector.select(math), {correct: true});
  const state = selector.snapshot();
  const changed = createAdaptiveSelector(bank, {age: 11, state});
  assert.deepEqual(changed.snapshot().recent, state.recent);
  assert.deepEqual(ages(changed.select(math)), [11, 2]);

  const tiny = createAdaptiveSelector(bank.slice(0, 1), {age: 6});
  assert.equal(tiny.select(math).id, bank[0].id);
  assert.equal(tiny.select(math), null);
});
