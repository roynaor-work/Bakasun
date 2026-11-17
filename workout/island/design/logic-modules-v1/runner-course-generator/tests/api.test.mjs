import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { API_VERSION, generateCourse, generateSegment, validateCourse, THEMES } from '../src/index.mjs';

test('API v1 is deterministic under replay, JSON round-trip, random access and arbitrary chunks', () => {
  assert.equal(API_VERSION, 1);
  for (const difficulty of [1, 2, 3]) for (const theme of Object.keys(THEMES)) {
    const config = { seed: 'replay 🏔', difficulty, theme };
    const batch = generateCourse({ ...config, startSegment: 29, segmentCount: 37 });
    assert.deepEqual(batch, generateCourse({ ...config, startSegment: 29, segmentCount: 37 }));
    const chunks = [[29, 1], [30, 7], [37, 13], [50, 16]].flatMap(([startSegment, segmentCount]) => generateCourse({ ...config, startSegment, segmentCount }).segments);
    assert.deepEqual(chunks, batch.segments);
    for (const index of [65, 29, 48, 32, 36]) assert.deepEqual(generateSegment({ ...config, index }), batch.segments[index - 29]);
    const parsed = JSON.parse(JSON.stringify(batch));
    assert.deepEqual(parsed, batch);
    assert.equal(validateCourse(parsed).valid, true);
  }
  assert.notDeepEqual(generateCourse({ seed: 1 }), generateCourse({ seed: '1' }));
  assert.notDeepEqual(generateCourse({ seed: 1 }), generateCourse({ seed: 2 }));
});

test('v1 replay fixture pins byte-level output', () => {
  const course = generateCourse({ seed: 'runner-v1', difficulty: 2, theme: 'lava', segmentCount: 12 });
  const hash = createHash('sha256').update(JSON.stringify(course)).digest('hex');
  assert.equal(hash, 'e06ef6a46f7e6605a5e0b3161d91b6c915487f4e595ea67b18998a5301ef3e5e');
});

function deeplyFrozen(value) {
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) if (child && typeof child === 'object') deeplyFrozen(child);
}

test('inputs are not mutated or frozen; returned course, segment, report and constants are deeply immutable', () => {
  const options = { seed: 'immutable', difficulty: 3, theme: 'ice', segmentCount: 2 };
  const before = structuredClone(options), course = generateCourse(options);
  assert.deepEqual(options, before);
  assert.equal(Object.isFrozen(options), false);
  deeplyFrozen(course); deeplyFrozen(THEMES);
  deeplyFrozen(generateSegment({ seed: 'immutable', index: 3 }));
  const mutable = JSON.parse(JSON.stringify(course)), copy = structuredClone(mutable);
  deeplyFrozen(validateCourse(mutable));
  assert.deepEqual(mutable, copy);
  assert.equal(Object.isFrozen(mutable), false);
  assert.throws(() => { course.segments[0].obstacles[0].lane = 2; }, TypeError);
  assert.throws(() => { course.segments.push({}); }, TypeError);
});

test('strict malformed input handling and finite bounded ranges', () => {
  for (const input of [undefined, null, [], 'seed', 0, () => {}, new Date()]) assert.throws(() => generateCourse(input), TypeError);
  for (const seed of [undefined, null, '', '  ', 'x'.repeat(129), true, {}, [], -1, 2 ** 32, .5, NaN, Infinity]) {
    assert.throws(() => generateCourse({ seed }));
  }
  for (const difficulty of [0, 4, '1', true, NaN, Infinity, {}, 1.1]) assert.throws(() => generateCourse({ seed: 1, difficulty }));
  for (const theme of ['', 'snow', '__proto__', 'constructor', null, 1, {}]) assert.throws(() => generateCourse({ seed: 1, theme }));
  for (const startSegment of [-1, 1_000_000, .5, '0', null, NaN, Infinity]) assert.throws(() => generateCourse({ seed: 1, startSegment }));
  for (const segmentCount of [-1, 1025, .5, '1', null, NaN, Infinity]) assert.throws(() => generateCourse({ seed: 1, segmentCount }));
  assert.throws(() => generateCourse({ seed: 1, startSegment: 999_999, segmentCount: 2 }), RangeError);
  assert.throws(() => generateCourse({ seed: 1, count: 1 }), /Unknown option/);
  for (const index of [undefined, -1, 1_000_000, .5, '0', null]) assert.throws(() => generateSegment({ seed: 1, index }));
  assert.throws(() => generateSegment({ seed: 1, index: 1, segmentCount: 1 }), /Unknown option/);
  assert.equal(validateCourse(generateCourse({ seed: 0, segmentCount: 0 })).valid, true);
  assert.equal(validateCourse(generateCourse({ seed: 0xffffffff, segmentCount: 0 })).valid, true);
  assert.equal(validateCourse(generateCourse(Object.assign(Object.create(null), { seed: 'plain' }))).valid, true);
});
