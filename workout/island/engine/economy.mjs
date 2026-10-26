import { levelFactor, population } from './metrics.mjs?v=island-clean-ui-20261026-1';
import {productionMultiplier} from './city-depth.mjs?v=island-clean-ui-20261026-1';
import {municipalBudget} from './city-management.mjs?v=island-clean-ui-20261026-1';

/** All income sources are records in config.json or explicit registry extensions. Amounts are per minute. */
export function calculateIncome(state, registry, config, city) {
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
      for (const row of active) for (const [resource, amount] of Object.entries(registry.buildings.get(row.typeId)?.resources || {})) add(source.id, resource, amount * levelFactor(row, config) * productionMultiplier(state, row.id, city));
    } else if (source.kind === 'constant') {
      add(source.id, source.resource, source.perMinute);
    }
  }
  if(state.cityManagement?.enabled){
    const municipal=municipalBudget(state,registry,config);
    result.municipal=municipal;result.money+=municipal.net;
    result.sources.push({id:'municipalTaxes',resource:'money',amount:municipal.taxes},{id:'municipalServices',resource:'money',amount:-municipal.expenses});
  }
  return result;
}

export function accrueIncome(state, registry, config, seconds, city) {
  if (!Number.isFinite(seconds) || seconds <= 0) return { money: 0, food: 0, materials: 0, energy: 0 };
  const duration = Math.min(seconds, config.maxTickSeconds);
  const income = calculateIncome(state, registry, config, city);
  const gained = {};
  for (const resource of ['money', 'food', 'materials', 'energy']) {
    gained[resource] = income[resource] * duration / 60;
    if (resource === 'money') {
      const before=state.money,available=before+(income.money+(income.municipal?.expenses||0))*duration/60,expense=(income.municipal?.expenses||0)*duration/60;
      const paid=Math.min(available,expense);state.money=Math.max(0,available-paid);gained.money=state.money-before;
      if(state.cityManagement?.enabled)state.cityManagement.operatingRatio=expense>0?paid/expense:1;
    }
    else state.resources[resource] += gained[resource];
  }
  return gained;
}
