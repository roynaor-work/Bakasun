import {cityConnections} from './city-connections.mjs?v=island-people-scale-20261026-1';

export function buildingCenter(building, registry) {
  const type = registry.buildings.get(building.typeId);
  return { x: building.x + (type.footprint[0] - 1) / 2, z: building.z + (type.footprint[1] - 1) / 2 };
}

export function levelFactor(building, config) {
  return 1 + (building.level - 1) * (config.levelMultiplier ?? 0);
}

/** Explicit level values override the legacy multiplier, including a value of zero. */
export function levelValue(building, type, field, config) {
  return type?.levels?.[building.level - 1]?.[field] ?? (type?.[field] || 0) * levelFactor(building, config);
}

export function population(state, registry, config) {
  return state.buildings.reduce((sum, row) => sum + levelValue(row, registry.buildings.get(row.typeId), 'population', config), 0);
}

/** Service radius is measured between footprint centers, including its boundary. */
export function coverageForBuilding(state, registry, id, config = { levelMultiplier: 0 },connections) {
  const building = state.buildings.find(row => row.id === id);
  if (!building) return [];
  const type = registry.buildings.get(building.typeId);
  const center = buildingCenter(building, registry);
  const department=config.cityManagement?.services?.[building.typeId]?.department;
  const funding=state.cityManagement?.enabled&&department?state.cityManagement.funding[department]/100*state.cityManagement.operatingRatio:1;
  if(state.cityManagement?.enabled&&department){connections??=cityConnections(state,registry);if(!connections.hasAccess(building))return [];}
  const radius = type.radius * levelFactor(building, config)*Math.sqrt(funding);
  return state.buildings.filter(row => {
    if (row.id === id || !(levelValue(row, registry.buildings.get(row.typeId), 'population', config) > 0)) return false;
    if(connections&&!connections.hasAccess(row))return false;
    const target = buildingCenter(row, registry);
    return Math.hypot(target.x - center.x, target.z - center.z) <= radius;
  }).map(row => row.id);
}

/** City values are population-weighted service coverage; no per-citizen needs are stored. */
export function calculateMetrics(state, registry, config) {
  const connections=state.cityManagement?.enabled?cityConnections(state,registry):null;
  const households = state.buildings.filter(row => levelValue(row, registry.buildings.get(row.typeId), 'population', config) > 0);
  const totalPopulation = population(state, registry, config);
  const values = {};
  for (const metric of registry.metrics.values()) {
    let score = metric.base || 0;
    for (const source of state.buildings) {
      const type = registry.buildings.get(source.typeId);
      if(state.cityManagement?.enabled&&state.events?.repairs?.[source.id]>state.updatedAt)continue;
      const department=config.cityManagement?.services?.[source.typeId]?.department;
      const funding=state.cityManagement?.enabled&&department?state.cityManagement.funding[department]/100*state.cityManagement.operatingRatio:1;
      const effect = type.effects?.[metric.id] || 0;
      if (!effect || !type.radius) continue;
      const coveredIds = coverageForBuilding(state, registry, source.id, config,connections);
      const coveredPopulation = households.filter(row => coveredIds.includes(row.id)).reduce((sum, row) => sum + levelValue(row, registry.buildings.get(row.typeId), 'population', config), 0);
      const coverage = totalPopulation ? coveredPopulation / totalPopulation : 0;
      score += effect * levelFactor(source, config) * coverage * funding;
    }
    if (typeof metric.calculate === 'function') score = metric.calculate({ state, registry, config, score, population: totalPopulation });
    values[metric.id] = Math.round(Math.min(config.metricMax, Math.max(config.metricMin, score)));
  }
  return values;
}
