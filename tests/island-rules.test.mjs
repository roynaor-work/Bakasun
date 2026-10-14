import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../workout/island/engine/registry.mjs';
import { cellsFor, isAdjacent, validatePlacement, canRemove } from '../workout/island/engine/rules.mjs';

const registry = createRegistry({ buildings: [
  { id: 'road', footprint: [1, 1], cost: 5, isRoad: true },
  { id: 'house', footprint: [2, 2], cost: 40, requiresRoad: true },
  { id: 'harbor', footprint: [3, 2], cost: 60, requiresRoad: true, requiresShore: true },
  { id: 'park', footprint: [2, 1], cost: 30 },
  { id: 'wall', footprint: [1, 1], cost: 5, locked: true },
  { id: 'future', footprint: [1, 1], cost: 5, featureFlag: 'future' },
] });
const world = (buildings = [], money = 100) => ({ money, world: { size: 8 }, buildings });
const row = (id, typeId, x, z) => ({ id, typeId, x, z, level: 1 });

test('island footprint includes every occupied grid cell exactly once', () => {
  const cells = cellsFor(registry.buildings.get('harbor'), 2, 3);
  assert.deepEqual(new Set(cells.map(c => c.join(','))), new Set(['2,3', '2,4', '3,3', '3,4', '4,3', '4,4']));
  assert.equal(cells.length, 6);
});

test('island adjacency uses a shared edge, including the far edge of a footprint', () => {
  const house = row('h', 'house', 2, 2);
  assert.equal(isAdjacent(house, row('r', 'road', 4, 3), registry), true);
  assert.equal(isAdjacent(house, row('r', 'road', 4, 4), registry), false, 'corner touching is insufficient');
  assert.equal(isAdjacent(house, row('r', 'road', 5, 3), registry), false);
});

test('island placement rejects unknown types and fractional grid positions', () => {
  for (const args of [['missing', 1, 1], ['park', 1.5, 1], ['park', 1, NaN]]) {
    assert.equal(validatePlacement(world(), registry, ...args).reason, 'reason.invalid');
  }
});

test('island bounds account for complete footprint, not just its anchor', () => {
  for (const [x, z] of [[-1, 0], [7, 2], [2, 8]]) {
    assert.equal(validatePlacement(world(), registry, 'park', x, z).reason, 'reason.bounds');
  }
  assert.equal(validatePlacement(world(), registry, 'park', 6, 7).ok, true);
});

test('island placement detects overlap at any footprint cell', () => {
  const state = world([row('h', 'house', 2, 2)]);
  assert.equal(validatePlacement(state, registry, 'park', 3, 3).reason, 'reason.occupied');
  assert.equal(validatePlacement(state, registry, 'park', 4, 3).ok, true);
});

test('island buildings require a road at their actual edge', () => {
  const corner = world([row('r', 'road', 4, 4)]);
  assert.equal(validatePlacement(corner, registry, 'house', 2, 2).reason, 'reason.road');
  const edge = world([row('r', 'road', 4, 3)]);
  assert.equal(validatePlacement(edge, registry, 'house', 2, 2).ok, true);
});

test('island shoreline and road requirements both apply to a harbor', () => {
  assert.equal(validatePlacement(world([row('r', 'road', 3, 3)]), registry, 'harbor', 3, 4).reason, 'reason.shore');
  assert.equal(validatePlacement(world(), registry, 'harbor', 0, 2).reason, 'reason.road');
  assert.equal(validatePlacement(world([row('r', 'road', 3, 2)]), registry, 'harbor', 0, 2).ok, true);
});

test('island money check allows exact balance and prevents an unaffordable purchase', () => {
  assert.equal(validatePlacement(world([], 29), registry, 'park', 1, 1).reason, 'reason.money');
  assert.equal(validatePlacement(world([], 30), registry, 'park', 1, 1).ok, true);
});

test('island locked defense remains locked even when its feature flag is enabled', () => {
  assert.equal(validatePlacement(world(), registry, 'wall', 1, 1, undefined, { defense: true }).reason, 'reason.locked');
  assert.equal(validatePlacement(world(), registry, 'future', 1, 1).reason, 'reason.locked');
  assert.equal(validatePlacement(world(), registry, 'future', 1, 1, undefined, { future: true }).ok, true);
});

test('island moving a building ignores its old footprint and does not charge it again', () => {
  const state = world([row('p', 'park', 2, 2)], 0);
  assert.equal(validatePlacement(state, registry, 'park', 3, 2, 'p').ok, true);
  assert.equal(validatePlacement(state, registry, 'park', 3, 2).ok, false);
});

test('island moving the last access road cannot strand a building', () => {
  const state = world([row('r', 'road', 4, 3), row('h', 'house', 2, 2)]);
  assert.equal(validatePlacement(state, registry, 'road', 6, 6, 'r').reason, 'reason.road');
  assert.equal(validatePlacement(state, registry, 'road', 4, 2, 'r').ok, true);
});

test('island moving a road is permitted when another road keeps access', () => {
  const state = world([row('r', 'road', 4, 3), row('r2', 'road', 4, 2), row('h', 'house', 2, 2)]);
  assert.equal(validatePlacement(state, registry, 'road', 6, 6, 'r').ok, true);
});

test('island removal preserves existing road access and rejects an unknown instance', () => {
  const state = world([row('r', 'road', 4, 3), row('h', 'house', 2, 2)]);
  assert.equal(canRemove(state, registry, 'r').reason, 'reason.road');
  assert.equal(canRemove(state, registry, 'h').ok, true);
  assert.equal(canRemove(state, registry, 'missing').reason, 'reason.invalid');
  state.buildings.push(row('backup', 'road', 4, 2));
  assert.equal(canRemove(state, registry, 'r').ok, true);
});
