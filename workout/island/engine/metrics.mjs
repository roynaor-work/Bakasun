export function buildingCenter(building, registry) {
  const type = registry.buildings.get(building.typeId);
  return { x: building.x + (type.footprint[0] - 1) / 2, z: building.z + (type.footprint[1] - 1) / 2 };
}

export function levelFactor(building, config) {
  return 1 + (building.level - 1) * config.levelMultiplier;
}

export function population(state, registry, config) {
  return state.buildings.reduce((sum, row) => sum + (registry.buildings.get(row.typeId)?.population || 0) * levelFactor(row, config), 0);
}

/** Service radius is measured between footprint centers, including its boundary. */
export function coverageForBuilding(state, registry, id, config = { levelMultiplier: 0 }) {
  const building = state.buildings.find(row => row.id === id);
  if (!building) return [];
  const type = registry.buildings.get(building.typeId);
  const center = buildingCenter(building, registry);
  const radius = type.radius * levelFactor(building, config);
  return state.buildings.filter(row => {
    if (row.id === id || !(registry.buildings.get(row.typeId)?.population > 0)) return false;
    const target = buildingCenter(row, registry);
    return Math.hypot(target.x - center.x, target.z - center.z) <= radius;
  }).map(row => row.id);
}

/** City values are population-weighted service coverage; no per-citizen needs are stored. */
export function calculateMetrics(state, registry, config) {
  const households = state.buildings.filter(row => registry.buildings.get(row.typeId)?.population > 0);
  const totalPopulation = population(state, registry, config);
  const values = {};
  for (const metric of registry.metrics.values()) {
    let score = metric.base || 0;
    for (const source of state.buildings) {
      const type = registry.buildings.get(source.typeId);
      const effect = type.effects?.[metric.id] || 0;
      if (!effect || !type.radius) continue;
      const coveredIds = coverageForBuilding(state, registry, source.id, config);
      const coveredPopulation = households.filter(row => coveredIds.includes(row.id)).reduce((sum, row) => sum + registry.buildings.get(row.typeId).population * levelFactor(row, config), 0);
      const coverage = totalPopulation ? coveredPopulation / totalPopulation : 0;
      score += effect * levelFactor(source, config) * coverage;
    }
    if (typeof metric.calculate === 'function') score = metric.calculate({ state, registry, config, score, population: totalPopulation });
    values[metric.id] = Math.round(Math.min(config.metricMax, Math.max(config.metricMin, score)));
  }
  return values;
}
