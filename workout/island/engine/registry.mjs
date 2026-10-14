/** Registries contain content, not rendering or DOM behavior. Extension modules call these methods. */
export function createRegistry(data = {}) {
  const registry = {
    buildings: new Map(), sports: new Map(), minigames: new Map(), eventTypes: new Map(), metrics: new Map(), incomeSources: new Map(),
  };
  function add(map, record) {
    if (!record || typeof record.id !== 'string' || !/^[a-zA-Z][\w.-]*$/.test(record.id)) throw new TypeError('reason.invalid');
    if (map.has(record.id)) throw new TypeError('reason.duplicate');
    const value = Object.freeze({ ...record });
    map.set(value.id, value);
    return value;
  }
  registry.registerBuilding = record => add(registry.buildings, {
    ...record,
    ...(data.config?.buildings?.[record.balanceId || record.id] || {}),
    visual: { ...(record.visual || {}), ...(data.config?.buildings?.[record.balanceId || record.id]?.visual || {}) },
  });
  registry.registerSport = record => add(registry.sports, { ...record, ...(data.config?.sports?.[record.balanceId || record.id] || {}) });
  registry.registerMinigame = record => {
    if (typeof record.start !== 'function' || typeof record.onResult !== 'function') throw new TypeError('reason.invalid');
    return add(registry.minigames, record);
  };
  registry.registerEventType = record => add(registry.eventTypes, record);
  registry.registerMetric = record => add(registry.metrics, { ...record, ...(data.config?.metrics?.[record.balanceId || record.id] || {}) });
  registry.registerIncomeSource = record => add(registry.incomeSources, record);
  for (const row of data.buildings || []) registry.registerBuilding(row);
  for (const row of data.sports || []) registry.registerSport(row);
  for (const row of data.metrics || []) registry.registerMetric(row);
  for (const installer of data.extensionInstallers || []) installer(registry, data);
  return registry;
}

export const registerBuilding = (registry, record) => registry.registerBuilding(record);
export const registerSport = (registry, record) => registry.registerSport(record);
export const registerMinigame = (registry, record) => registry.registerMinigame(record);
export const registerEventType = (registry, record) => registry.registerEventType(record);
export const registerMetric = (registry, record) => registry.registerMetric(record);
