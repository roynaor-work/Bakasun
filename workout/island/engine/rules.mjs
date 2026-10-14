export function cellsFor(type, x, z) {
  const [width, depth] = type.footprint;
  const cells = [];
  for (let dx = 0; dx < width; dx++) for (let dz = 0; dz < depth; dz++) cells.push([x + dx, z + dz]);
  return cells;
}

export function isAdjacent(a, b, registry) {
  const ca = cellsFor(registry.buildings.get(a.typeId), a.x, a.z);
  const cb = cellsFor(registry.buildings.get(b.typeId), b.x, b.z);
  return ca.some(([x, z]) => cb.some(([bx, bz]) => Math.abs(x - bx) + Math.abs(z - bz) === 1));
}

export function validatePlacement(state, registry, typeId, x, z, ignoreId, flags = {}) {
  const type = registry.buildings.get(typeId);
  if (!type || !Number.isInteger(x) || !Number.isInteger(z)) return { ok: false, reason: 'reason.invalid' };
  if (type.locked || (type.featureFlag && !flags[type.featureFlag])) return { ok: false, reason: 'reason.locked' };
  const cells = cellsFor(type, x, z);
  if (cells.some(([cx, cz]) => cx < 0 || cz < 0 || cx >= state.world.size || cz >= state.world.size)) return { ok: false, reason: 'reason.bounds' };
  const others = state.buildings.filter(row => row.id !== ignoreId);
  const occupied = new Set(others.flatMap(row => cellsFor(registry.buildings.get(row.typeId), row.x, row.z).map(cell => cell.join(','))));
  if (cells.some(cell => occupied.has(cell.join(',')))) return { ok: false, reason: 'reason.occupied' };
  if (!ignoreId && state.money < type.cost) return { ok: false, reason: 'reason.money' };
  if (type.requiresShore && !cells.some(([cx, cz]) => cx === 0 || cz === 0 || cx === state.world.size - 1 || cz === state.world.size - 1)) return { ok: false, reason: 'reason.shore' };
  const target = { typeId, x, z };
  if (type.requiresRoad && !others.some(row => registry.buildings.get(row.typeId)?.isRoad && isAdjacent(target, row, registry))) return { ok: false, reason: 'reason.road' };
  // Moving a road must preserve access for every previously connected building.
  if (ignoreId && type.isRoad) {
    const oldRoad = state.buildings.find(row => row.id === ignoreId);
    const roads = [...others.filter(row => registry.buildings.get(row.typeId)?.isRoad), target];
    if (oldRoad && others.some(row => registry.buildings.get(row.typeId)?.requiresRoad && isAdjacent(row, oldRoad, registry) && !roads.some(road => isAdjacent(row, road, registry)))) return { ok: false, reason: 'reason.road' };
  }
  return { ok: true, reason: 'reason.allowed' };
}

export function canRemove(state, registry, id) {
  const building = state.buildings.find(row => row.id === id);
  if (!building) return { ok: false, reason: 'reason.invalid' };
  if (registry.buildings.get(building.typeId)?.isRoad) {
    const others = state.buildings.filter(row => row.id !== id);
    const roads = others.filter(row => registry.buildings.get(row.typeId)?.isRoad);
    if (others.some(row => registry.buildings.get(row.typeId)?.requiresRoad && isAdjacent(row, building, registry) && !roads.some(road => isAdjacent(row, road, registry)))) return { ok: false, reason: 'reason.road' };
  }
  return { ok: true };
}
