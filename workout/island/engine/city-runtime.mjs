import {cityReport} from './city-depth.mjs?v=island-naval-aim-20261027-1';

/** City commands share the engine's save/event/undo transaction boundary. */
export function installCity(engine, {changed, notify, remember}) {
  if (!engine.data.city) return;
  const {state, data, registry} = engine, config = data.city;
  const report = () => cityReport(state, registry, data.config, config, state.cityManagement?.enabled ? engine.cityReport({includeZones:false}) : null);
  const fail = reason => ({ok: false, reason: `city.reason.${reason}`});
  function sync() {
    const ids = new Set(state.buildings.map(b => b.id));
    for (const id of Object.keys(state.city.investments)) if (!ids.has(id)) delete state.city.investments[id];
    for (const id of Object.keys(state.events.repairs)) if (!ids.has(id)) delete state.events.repairs[id];
    state.city.port.slots = state.city.port.slots.filter(slot => ids.has(slot.harborId));
  }
  function transaction(type, mutate, detail = {}, repairs) {
    const beforeMoney = state.money, beforeResources = {...state.resources};
    const action = {kind: 'city', moneyDelta: 0, resourcesDelta: {}, repairs};
    remember(action); mutate();
    action.moneyDelta = state.money - beforeMoney;
    for (const key of Object.keys(beforeResources)) action.resourcesDelta[key] = state.resources[key] - beforeResources[key];
    changed(type, detail);
    return {ok: true};
  }
  function offer() {
    if (!report().port.canOffer) return fail('port-unavailable');
    return transaction('city-port', () => {
      const port = state.city.port, harbor = [...state.buildings].sort((a,b) => a.id.localeCompare(b.id, 'en')).find(b => b.typeId === 'harbor' && !(state.events.repairs[b.id] > state.updatedAt));
      port.slots = Array.from({length: config.port.slots}, (_, index) => ({...config.port.orders[(port.cycle * config.port.slots + index) % config.port.orders.length], id: `order-${port.cycle}-${index}`, harborId: harbor.id, state: 'offered'}));
      port.cycle++; port.readyAt = state.playSeconds + config.port.cooldownSeconds;
    });
  }
  engine.city = {
    report, sync, port: offer,
    invest(id) {
      const row = report().buildings.find(row => row.id === id), investment = row?.production?.investment;
      if (!investment?.ok) return fail(investment?.reason ?? 'invalid');
      return transaction('city-invest', () => {state.money -= investment.cost; state.city.investments[id] = row.production.tier + 1;}, {id});
    },
    upgrade: id => engine.upgrade(id),
    repair(id) {
      const row = report().buildings.find(row => row.id === id);
      if (row?.status !== 'damaged') return fail('invalid');
      if (!row.repair.ok) return fail('money');
      return transaction('city-repair', () => {state.money -= row.repair.cost; delete state.events.repairs[id];}, {id}, {id, until: state.events.repairs[id]});
    },
    deliver(id) {
      const slot = report().port.slots.find(slot => slot.id === id);
      if (!slot?.deliverable) return fail('order-unavailable');
      return transaction('city-deliver', () => {state.resources[slot.resource] -= slot.amount; state.money += slot.reward; state.city.delivered++; state.city.port.slots.find(row => row.id === id).state = 'delivered';}, {id});
    },
    skip(id) {
      if (!state.city.port.slots.some(slot => slot.id === id && slot.state === 'offered')) return fail('order-unavailable');
      return transaction('city-skip', () => {state.city.port.slots.find(slot => slot.id === id).state = 'skipped';}, {id});
    },
    goal(id) {
      const goal = report().goals.find(goal => goal.id === id);
      if (!goal?.ready) return fail('goal-unavailable');
      return transaction('city-goal', () => {state.money += goal.reward; state.city.claimedGoals.push(id);}, {id});
    },
    // Existing activity events own emergencies and damage. This only announces
    // their already-persisted result to ordinary engine subscribers.
    emergency() {notify('city-emergency');},
  };
  sync();
}
