import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../workout/island/engine/registry.mjs';
import { calculateMetrics, coverageForBuilding, population } from '../workout/island/engine/metrics.mjs';
import { calculateIncome, accrueIncome } from '../workout/island/engine/economy.mjs';

const config = { levelMultiplier: 0.5, metricMin: 0, metricMax: 100, maxTickSeconds: 60, incomeSources: [
  { id: 'tourists', kind: 'tourists', resource: 'money', basePerMinute: 10, populationRate: 1, parkRate: 2 },
  { id: 'buildings', kind: 'buildingIncome', resource: 'money' },
  { id: 'production', kind: 'production' },
] };
const registry = () => createRegistry({ buildings: [
  { id: 'house', footprint: [1, 1], population: 4, income: 3, effects: {} },
  { id: 'largeHouse', footprint: [2, 2], population: 8, income: 5, effects: {} },
  { id: 'park', footprint: [1, 1], radius: 3, effects: { happiness: 24 }, income: 7 },
  { id: 'factory', footprint: [1, 1], income: 2, resources: { materials: 6, energy: 2 } },
], metrics: [{ id: 'happiness', base: 40 }, { id: 'health', base: 30 }] });
const row = (id, typeId, x, z, level = 1) => ({ id, typeId, x, z, level });
const world = buildings => ({ money: 20, resources: { food: 1, materials: 2, energy: 3 }, buildings });

test('island radius includes its exact boundary and excludes diagonal distance beyond it', () => {
  const state = world([row('p', 'park', 0, 0), row('edge', 'house', 3, 0), row('outside', 'house', 3, 1)]);
  assert.deepEqual(coverageForBuilding(state, registry(), 'p', config), ['edge']);
  assert.deepEqual(coverageForBuilding(state, registry(), 'unknown', config), []);
});

test('island service coverage measures footprint centers rather than anchor corners', () => {
  const state = world([row('p', 'park', 0, 0), row('large', 'largeHouse', 3, 0)]);
  assert.deepEqual(coverageForBuilding(state, registry(), 'p', config), []);
  state.buildings[1].x = 2;
  assert.deepEqual(coverageForBuilding(state, registry(), 'p', config), ['large']);
});

test('island city metrics weight households by their population', () => {
  const state = world([row('p', 'park', 0, 0), row('near', 'house', 2, 0), row('far', 'largeHouse', 7, 7)]);
  assert.equal(population(state, registry(), config), 12);
  assert.deepEqual(calculateMetrics(state, registry(), config), { happiness: 48, health: 30 });
});

test('island service upgrades increase radius and effect without storing individual needs', () => {
  const state = world([row('p', 'park', 0, 0, 2), row('home', 'house', 4, 0)]);
  assert.deepEqual(coverageForBuilding(state, registry(), 'p', config), ['home']);
  assert.equal(calculateMetrics(state, registry(), config).happiness, 76);
  assert.equal('citizens' in state, false);
});

test('island empty cities retain baseline metrics and large effects are clamped', () => {
  const reg = registry();
  assert.deepEqual(calculateMetrics(world([]), reg, config), { happiness: 40, health: 30 });
  reg.registerBuilding({ id: 'festival', footprint: [1, 1], radius: 10, effects: { happiness: 200 } });
  const state = world([row('event', 'festival', 0, 0), row('home', 'house', 1, 0)]);
  assert.equal(calculateMetrics(state, reg, config).happiness, 100);
});

test('island new metric is registered without a change to the calculation engine', () => {
  const reg = registry();
  reg.registerMetric({ id: 'community', base: 5, calculate: ({ score, population: count }) => score + count * 2 });
  assert.equal(calculateMetrics(world([row('home', 'house', 0, 0)]), reg, config).community, 13);
});

test('island income lists tourists, buildings and production in one auditable breakdown', () => {
  const state = world([row('h', 'house', 0, 0), row('p', 'park', 2, 0), row('f', 'factory', 5, 0)]);
  const income = calculateIncome(state, registry(), config);
  assert.equal(income.money, 28); // tourists 16 + building income 12
  assert.equal(income.materials, 6);
  assert.equal(income.energy, 2);
  for (const resource of ['money', 'food', 'materials', 'energy']) {
    assert.equal(income[resource], income.sources.filter(s => s.resource === resource).reduce((sum, s) => sum + s.amount, 0));
  }
});

test('island an extension income source adds rewards without editing economy code', () => {
  const reg = registry();
  reg.registerIncomeSource({ id: 'market', calculate: () => ({ money: 12, food: 3, materials: -9, energy: NaN }) });
  const income = calculateIncome(world([]), reg, config);
  assert.equal(income.money, 22);
  assert.equal(income.food, 3);
  assert.equal(income.materials, 0);
  assert.equal(income.energy, 0);
});

test('island elapsed time accrues proportional income with a bounded catch-up interval', () => {
  const state = world([row('home', 'house', 0, 0)]);
  const income = calculateIncome(state, registry(), config);
  const half = accrueIncome(state, registry(), config, 30);
  assert.equal(half.money, income.money / 2);
  assert.equal(state.money, 20 + income.money / 2);
  const bounded = accrueIncome(state, registry(), config, 6000);
  assert.equal(bounded.money, income.money, 'a long pause cannot become unbounded offline income');
});

test('island invalid or reversed time never changes the economy', () => {
  for (const seconds of [NaN, Infinity, -10, 0]) {
    const state = world([]), before = structuredClone(state);
    accrueIncome(state, registry(), config, seconds);
    assert.deepEqual(state, before);
  }
});
