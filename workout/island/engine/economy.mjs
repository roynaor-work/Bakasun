import { levelFactor, population } from './metrics.mjs?v=island-cityscape-20261025-1';

/** All income sources are records in config.json or explicit registry extensions. Amounts are per minute. */
export function calculateIncome(state, registry, config) {
  const active = state.buildings.filter(row => !(state.events?.repairs?.[row.id] > state.updatedAt));
  const result = { money: 0, food: 0, materials: 0, energy: 0, sources: [] };
  const add = (id, resource, amount) => {
    if (!Number.isFinite(amount) || amount < 0 || !(resource in result) || resource === 'sources') return;
    result[resource] += amount;
    result.sources.push({ id, resource, amount });
  };
  for (const source of [...config.incomeSources, ...registry.incomeSources.values()]) {
    if (typeof source.calculate === 'function') {
      const amounts = source.calculate({ state, registry, config, activeBuildings: active });
      for (const [resource, amount] of Object.entries(amounts)) add(source.id, resource, amount);
    } else if (source.kind === 'tourists') {
      const parks = active.filter(row => row.typeId === 'park').length;
      add(source.id, source.resource, source.basePerMinute + population(state, registry, config) * source.populationRate + parks * source.parkRate);
    } else if (source.kind === 'buildingIncome') {
      for (const row of active) add(source.id, source.resource, (registry.buildings.get(row.typeId)?.income || 0) * levelFactor(row, config));
    } else if (source.kind === 'production') {
      for (const row of active) for (const [resource, amount] of Object.entries(registry.buildings.get(row.typeId)?.resources || {})) add(source.id, resource, amount * levelFactor(row, config));
    } else if (source.kind === 'constant') {
      add(source.id, source.resource, source.perMinute);
    }
  }
  return result;
}

export function accrueIncome(state, registry, config, seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return { money: 0, food: 0, materials: 0, energy: 0 };
  const duration = Math.min(seconds, config.maxTickSeconds);
  const income = calculateIncome(state, registry, config);
  const gained = {};
  for (const resource of ['money', 'food', 'materials', 'energy']) {
    gained[resource] = income[resource] * duration / 60;
    if (resource === 'money') state.money += gained[resource];
    else state.resources[resource] += gained[resource];
  }
  return gained;
}
