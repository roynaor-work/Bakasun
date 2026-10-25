import {buildingCenter, levelFactor, levelValue} from './metrics.mjs?v=island-c2-20261025-1';
import {upgradeAvailability} from './rules.mjs?v=island-c2-20261025-1';

export const initialCity = () => ({investments: {}, claimedGoals: [], delivered: 0, port: {cycle: 0, readyAt: 0, slots: []}});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const id = value => typeof value === 'string' && /^[a-zA-Z][\w.-]*$/.test(value);

/** v18 is strict; only the v17 migration supplies missing city state. */
export function validCity(city, state, data) {
  if (!object(city) || !object(city.investments) || !Array.isArray(city.claimedGoals) || !count(city.delivered)) return false;
  if (!Array.isArray(state?.buildings) || !state.buildings.every(b=>object(b)&&id(b.id))) return false;
  const ids = new Set(state.buildings?.map(b => b.id));
  if (!Object.entries(city.investments).every(([key, tier]) => ids.has(key) && (!data.city || data.city.production.types.includes(state.buildings.find(b=>b.id===key).typeId)) && Number.isSafeInteger(tier) && tier >= 1 && tier <= (data.city?.production.tiers.length ?? 3))) return false;
  if (!city.claimedGoals.every(id) || new Set(city.claimedGoals).size !== city.claimedGoals.length) return false;
  if (data.city && !city.claimedGoals.every(key => data.city.goals.some(goal => goal.id === key))) return false;
  const port = city.port;
  if (!object(port) || !count(port.cycle) || !Number.isFinite(port.readyAt) || port.readyAt < 0 || !Array.isArray(port.slots) || port.slots.length > (data.city?.port.slots ?? 2)) return false;
  const seen = new Set();
  return port.slots.every(slot => {
    if (!object(slot) || !id(slot.id) || seen.has(slot.id) || !state.buildings?.some(b=>b.id===slot.harborId&&b.typeId==='harbor') || !['offered', 'delivered', 'skipped'].includes(slot.state)) return false;
    seen.add(slot.id);
    return ['food', 'materials', 'energy'].includes(slot.resource) && Number.isFinite(slot.amount) && slot.amount > 0 && Number.isFinite(slot.reward) && slot.reward >= 0 && (!data.city || data.city.port.orders.some(order => order.resource === slot.resource && order.amount === slot.amount && order.reward === slot.reward));
  });
}

export function productionTier(state, buildingId) {
  return Object.hasOwn(state.city?.investments ?? {}, buildingId) ? state.city.investments[buildingId] : 1;
}
export function productionMultiplier(state, buildingId, city) {
  return city?.production.tiers[productionTier(state, buildingId) - 1]?.multiplier ?? 1;
}

/** Pure, detached report. No DOM, clock reads, mutation, random choices or saves. */
export function cityReport(state, registry, config, city, management = null) {
  const damaged = row => state.events?.repairs?.[row.id] > state.updatedAt;
  const buildings = state.buildings.map(row => {
    const type = registry.buildings.get(row.typeId);
    const status = damaged(row) ? 'damaged' : 'ready';
    const report = {id: row.id, typeId: row.typeId, status, water: null, service: null, production: null,
      upgrade: JSON.parse(JSON.stringify(upgradeAvailability(state, registry, row.id))), repair: {ok: status === 'damaged' && state.money >= config.events.repairCost, cost: config.events.repairCost}};
    if (row.typeId === 'waterTower') report.service = {radius: type.radius * levelFactor(row, config), capacity: levelValue(row, type, 'supply', config), used: 0, serves: []};
    if (city.production.types.includes(row.typeId)) {
      const tier = productionTier(state, row.id), next = city.production.tiers[tier];
      report.production = {tier, multiplier: productionMultiplier(state, row.id, city), perMinute: Object.fromEntries(Object.entries(type.resources ?? {}).map(([resource, amount]) => [resource, status === 'damaged' ? 0 : amount * levelFactor(row, config) * productionMultiplier(state, row.id, city)])),
        investment: {ok: status !== 'damaged' && Boolean(next) && state.money >= next.cost, cost: next?.cost ?? null, reason: status === 'damaged' ? 'damaged' : !next ? 'max-tier' : state.money < next.cost ? 'money' : null}};
    }
    const factor=levelFactor(row,config), next=report.upgrade.nextLevel, nextRow={...row,level:row.level+1};
    report.summary={population:levelValue(row,type,'population',config),supply:levelValue(row,type,'supply',config),income:status==='damaged'?0:(type.income||0)*factor,capacity:(type.capacity||0)*factor,radius:(type.radius||0)*factor,effects:Object.fromEntries(Object.entries(type.effects||{}).map(([id,value])=>[id,value*factor])),resources:report.production?.perMinute??Object.fromEntries(Object.entries(type.resources||{}).map(([key,value])=>[key,status==='damaged'?0:value*factor])),next:next?{population:levelValue(nextRow,type,'population',config)-levelValue(row,type,'population',config),supply:levelValue(nextRow,type,'supply',config)-levelValue(row,type,'supply',config),income:(type.income||0)*levelFactor(nextRow,config)}:null};
    return report;
  });
  const byId = new Map(buildings.map(row => [row.id, row]));
  const sorted = [...state.buildings].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const towers = sorted.filter(row => row.typeId === 'waterTower' && !damaged(row));
  const houses=sorted.filter(row => levelValue(row, registry.buildings.get(row.typeId), 'population', config) > 0);
  for (const house of management ? [] : houses) {
    const row = byId.get(house.id), demand = levelValue(house, registry.buildings.get(house.typeId), 'population', config), center = buildingCenter(house, registry);
    const nearby = towers.filter(tower => {const p = buildingCenter(tower, registry); return Math.hypot(center.x - p.x, center.z - p.z) <= byId.get(tower.id).service.radius;});
    const tower = nearby.find(tower => {const service = byId.get(tower.id).service; return service.capacity - service.used >= demand;});
    row.water = {served: false, towerId: null, demand, reason: damaged(house) ? 'damaged' : nearby.length ? 'capacity' : 'out-of-range'};
    if (!damaged(house) && tower) {
      const service = byId.get(tower.id).service;
      service.used += demand; service.serves.push(house.id);
      row.water = {...row.water, served: true, towerId: tower.id, reason: null};
    } else if (!damaged(house)) row.status = 'unserved';
  }
  if (management) {
    const water=management.services.water,providers=water.providers;
    for(const tower of buildings.filter(row=>row.service)) {
      const provider=providers.find(provider=>provider.id===tower.id);
      tower.service=provider?{radius:provider.radius,capacity:provider.capacity,used:provider.used,serves:[...provider.serves]}:{radius:0,capacity:0,used:0,serves:[]};
      tower.summary.radius=tower.service.radius; tower.summary.supply=tower.service.capacity;
    }
    for(const house of houses) {
      const row=byId.get(house.id),demand=row.summary.population,supplied=water.supplied[house.id]??0;
      const towerIds=providers.filter(provider=>provider.allocations[house.id]>1e-8).map(provider=>provider.id),served=!damaged(house)&&supplied+1e-8>=demand;
      const reason=damaged(house)?'damaged':served?null:management.disconnected.includes(house.id)?'disconnected':providers.some(provider=>provider.inRange.includes(house.id))?'capacity':'out-of-range';
      row.water={served,towerId:towerIds[0]??null,towerIds,demand,supplied,reason};row.status=damaged(house)?'damaged':served?'ready':'unserved';
    }
  }
  const progress = {served: buildings.filter(row => row.water?.served).length, invested: buildings.filter(row => row.production?.tier > 1).length, delivered: state.city.delivered};
  const goals = city.goals.map(goal => ({...goal, progress: Math.min(goal.target, progress[goal.kind]), claimed: state.city.claimedGoals.includes(goal.id), ready: progress[goal.kind] >= goal.target && !state.city.claimedGoals.includes(goal.id)}));
  const slots = state.city.port.slots.map(slot => ({...slot, deliverable: slot.state === 'offered' && state.city.delivered < Number.MAX_SAFE_INTEGER && state.buildings.some(b=>b.id===slot.harborId&&!damaged(b)) && state.resources[slot.resource] >= slot.amount}));
  return {buildings, goals, port: {slots, readyAt: state.city.port.readyAt, canOffer: state.city.port.cycle < Number.MAX_SAFE_INTEGER && !slots.some(slot => slot.state === 'offered') && state.playSeconds >= state.city.port.readyAt && state.buildings.some(b => b.typeId === 'harbor' && !damaged(b))}, emergency: state.events.active ? {...state.events.active} : null};
}
