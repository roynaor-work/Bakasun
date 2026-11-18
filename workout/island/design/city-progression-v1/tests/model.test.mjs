import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadData } from '../../../engine/load-data.mjs';
import { createInitialState } from '../../../engine/persistence.mjs';
import { createRegistry } from '../../../engine/registry.mjs';
import { BUILDINGS } from '../data/catalog.mjs';
import {
  advanceProgress, cancelProgressProject, constructionStage, initProgress, isOperational, operatingState,
  progressAvailability, progressIncome, progressMetrics, progressPartTarget, progressReport,
  startProgressProject, upgradeProgressAvailability, validProgress,
} from '../src/progression.mjs';

const islandRoot = new URL('../../../', import.meta.url);
const data = await loadData(islandRoot, async url => ({
  ok: true,
  json: async () => JSON.parse(await readFile(url, 'utf8')),
}));
const resources = ['food', 'materials', 'energy'];

function fixture() {
  const registry = createRegistry(data);
  for (const [id, record] of Object.entries(BUILDINGS)) {
    const base = registry.buildings.get(id);
    registry.buildings.set(id, {
      ...base,
      id,
      footprint: base?.footprint ?? record.footprint,
      cost: record.cost.money,
      levels: [{...base?.levels[0], cost: 0}, ...record.upgrades.map((option, index) => ({
        ...base?.levels[index + 1], cost: option.cost.money,
      }))],
    });
  }
  const state = createInitialState(data, 1000);
  initProgress(state);
  return { state, registry };
}

function fund(state, amount = 10_000) {
  state.money = amount;
  for (const resource of resources) state.resources[resource] = amount;
}

const starter = Object.entries(BUILDINGS).find(([, row]) => row.assetId && row.day <= 1 &&
  !row.population && !row.requires?.length && row.stageSeconds > 0 && row.upgrades.length &&
  resources.some(resource => row.cost[resource] > 0));

function stageStarter(state, registry, id = 'test-construction') {
  assert.ok(starter, 'there is a resource-cost starter with an upgrade');
  const [typeId, record] = starter;
  assert.equal(progressAvailability(state, registry, typeId).ok, true);
  const row = { id, typeId, x: 4, z: 5, level: 1 };
  state.buildings.push(row);
  const before = {...state.resources};
  startProgressProject(state, registry, row);
  for (const resource of resources) {
    assert.equal(state.resources[resource], before[resource] - (record.cost[resource] ?? 0), resource);
  }
  return { row, record };
}

test('progression starts on day one and advances only by accepted active intervals', () => {
  const { state, registry } = fixture();
  const initial = progressReport(state, registry);
  assert.equal(initial.day, 1);
  assert.equal(initial.activeSeconds, 0);
  assert.ok(initial.daySeconds > 0);
  const before = structuredClone(state.cityProgress);
  state.updatedAt += 86_400_000;
  for (const seconds of [0, -5, NaN, Infinity]) advanceProgress(state, registry, seconds);
  assert.deepEqual(state.cityProgress, before);
  advanceProgress(state, registry, initial.daySeconds / 2);
  assert.equal(progressReport(state, registry).day, 1);
  advanceProgress(state, registry, initial.daySeconds / 2);
  const next = progressReport(state, registry);
  assert.equal(next.day, 2);
  assert.equal(next.activeSeconds, initial.daySeconds);
});

test('the starting balance supports multiple staged projects and unaffordable checks are read-only', () => {
  const { state, registry } = fixture();
  const candidates = Object.entries(BUILDINGS).filter(([id, row]) => row.assetId &&
    progressAvailability(state, registry, id).ok);
  assert.ok(candidates.length >= 2, candidates.map(([id]) => id).join(', '));
  assert.ok(starter);
  const [typeId, record] = starter;
  const scarce = resources.find(resource => record.cost[resource] > 0);
  state.resources[scarce] = record.cost[scarce] - 1;
  const before = structuredClone(state);
  const rejected = progressAvailability(state, registry, typeId);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.reason);
  assert.deepEqual(state, before);
});

test('foundation and half-built stages occupy a lot while production waits for completion', () => {
  const { state, registry } = fixture();
  fund(state);
  const { row, record } = stageStarter(state, registry);
  const { id } = row;
  assert.equal(constructionStage(state, id), 'foundation');
  assert.equal(isOperational(state, id), false);
  assert.equal(operatingState(state).buildings.some(building => building.id === id), false);
  assert.equal(state.buildings.some(building => building.id === id), true);
  advanceProgress(state, registry, record.stageSeconds / 2);
  assert.equal(constructionStage(state, id), 'half-built');
  assert.equal(isOperational(state, id), false);
  advanceProgress(state, registry, record.stageSeconds / 2);
  assert.equal(constructionStage(state, id), 'complete');
  assert.equal(isOperational(state, id), true);
  assert.equal(operatingState(state).buildings.some(building => building.id === id), true);
});

test('upgrade preserves the old operating level until completion and consumes the resource price only once', () => {
  const { state, registry } = fixture();
  fund(state);
  const { row, record } = stageStarter(state, registry);
  advanceProgress(state, registry, record.stageSeconds);
  const upgrade = record.upgrades[0];
  const daySeconds = progressReport(state, registry).daySeconds;
  for (let day = 1; day < (upgrade.day ?? 1); day++) advanceProgress(state, registry, daySeconds);
  assert.equal(upgradeProgressAvailability(state, registry, row.id).ok, true);
  const before = {...state.resources};
  startProgressProject(state, registry, row, { upgrade: true });
  assert.equal(row.level, 1);
  assert.equal(isOperational(state, row.id), true);
  assert.equal(upgradeProgressAvailability(state, registry, row.id).ok, false);
  advanceProgress(state, registry, upgrade.stageSeconds);
  assert.equal(state.buildings.find(building => building.id === row.id).level, 2);
  advanceProgress(state, registry, upgrade.stageSeconds);
  assert.equal(state.buildings.find(building => building.id === row.id).level, 2);
  for (const resource of resources) assert.equal(state.resources[resource], before[resource] - (upgrade.cost[resource] ?? 0), resource);
});

test('an empty city has finite bounded satisfaction and a positive recovery income', () => {
  const { state, registry } = fixture();
  const legacyMetrics = { security: 0, education: 0, health: 0, fun: 0, happiness: 0 };
  const metrics = progressMetrics(state, registry, legacyMetrics);
  for (const metric of Object.values(metrics)) assert.ok(Number.isFinite(metric) && metric >= 0 && metric <= 100);
  const zero = { money: 0, food: 0, materials: 0, energy: 0, sources: [] };
  const income = progressIncome(state, registry, zero);
  for (const resource of ['money', ...resources]) assert.ok(income[resource] > 0, resource);
  assert.ok(progressReport(state, registry).population >= 0);
  assert.ok(progressPartTarget(state, registry) >= 0);
});

test('an unfinished prerequisite does not unlock a build, while the grace window opens a second route', () => {
  const { state, registry } = fixture();
  fund(state);
  state.buildings.push({ id: 'home-readiness', typeId: 'house', x: 4, z: 5, level: 1 });
  const { daySeconds } = progressReport(state, registry);
  advanceProgress(state, registry, daySeconds);
  assert.equal(progressAvailability(state, registry, 'bakery').ok, false);
  const grocery = { id: 'grocery-readiness', typeId: 'grocery', x: 7, z: 5, level: 1 };
  state.buildings.push(grocery);
  startProgressProject(state, registry, grocery);
  assert.equal(progressAvailability(state, registry, 'bakery').ok, false);
  advanceProgress(state, registry, BUILDINGS.grocery.stageSeconds);
  assert.equal(progressAvailability(state, registry, 'bakery').ok, true);

  const alternative = fixture();
  fund(alternative.state);
  for (let day = 1; day < BUILDINGS.bakery.day + 2; day++) {
    advanceProgress(alternative.state, alternative.registry, daySeconds);
  }
  assert.equal(progressAvailability(alternative.state, alternative.registry, 'bakery').ok, true);
});

test('saved project validation rejects orphan references and bad active time', () => {
  const { state, registry } = fixture();
  fund(state);
  assert.equal(validProgress(state), true);
  const { row } = stageStarter(state, registry);
  assert.equal(validProgress(JSON.parse(JSON.stringify(state))), true);
  assert.equal(validProgress({ ...state, buildings: state.buildings.filter(item => item.id !== row.id) }), false);
  assert.equal(validProgress({ ...state, cityProgress: { ...state.cityProgress, activeSeconds: -1 } }), false);
  assert.ok(cancelProgressProject(state, row.id));
  assert.equal(cancelProgressProject(state, row.id), null);
  assert.equal(validProgress(state), true);
});
