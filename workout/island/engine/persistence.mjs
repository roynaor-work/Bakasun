import { cellsFor } from './rules.mjs';
import { initialActivity, validActivity, mergeActivity } from '../activity/state.mjs';

export const CURRENT_VERSION = 3;
export const STORAGE_KEY = 'island.v1';
const clone = value => JSON.parse(JSON.stringify(value));
const finitePositive = value => Number.isFinite(value) && value >= 0;
const validId = value => typeof value === 'string' && /^[a-zA-Z][\w.-]*$/.test(value);
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const validColor = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

export function createInitialState(data, now = Date.now()) {
  const road = data.config.seedRoad;
  const buildings = [];
  for (let x = road.startX; x <= road.endX; x++) buildings.push({ id: `seed-road-${x}`, typeId: 'road', x, z: road.z, level: 1 });
  return {
    version: CURRENT_VERSION, money: data.config.startingMoney, resources: clone(data.config.startingResources),
    buildings, world: { size: data.config.worldStages[0].size, stage: 0 }, parts: { [data.world.partGroup]: 0 },
    avatar: clone(data.avatar.defaults), team: clone(data.team), players: (data.players || []).map(row => ({ ...data.config.playerDefaults, ...row })),
    tutorial: { step: 0, completed: false, skipped: false }, claimedRewards: [], completedMissions: [], completedEpisodes: [],
    nextId: 1, playSeconds: 0, createdAt: now, updatedAt: now,
    ...initialActivity(data,now),
  };
}

/** Each migration is explicit. Existing building positions, currencies, avatar and progress survive. */
export const migrations = {
  2(old,data) { return {...old,...initialActivity(data,old.updatedAt||old.createdAt||Date.now()),version:3}; },
  1(old, data) {
    const initial = createInitialState(data, old.createdAt || Date.now());
    const size = old.world?.size || old.worldSize || initial.world.size;
    const stage = data.config.worldStages.findIndex(row => row.size === size);
    return {
      ...initial, ...old, version: 2,
      money: old.money ?? old.coins ?? initial.money,
      resources: { ...initial.resources, ...old.resources },
      buildings: (old.buildings || initial.buildings).map((row, index) => ({ ...row, id: row.id || `legacy-${index}`, typeId: row.typeId || row.type, level: row.level || 1 })),
      world: { ...initial.world, ...old.world, size, stage: Math.max(stage, 0) },
      parts: { ...initial.parts, ...old.parts }, avatar: { ...initial.avatar, ...old.avatar },
      tutorial: { ...initial.tutorial, ...old.tutorial },
      claimedRewards: old.claimedRewards || [], completedMissions: old.completedMissions || [], completedEpisodes: old.completedEpisodes || [],
    };
  },
};

export function migrateSave(value, data, registry) {
  if (!isObject(value)) return { ok: false, reason: 'reason.invalid' };
  let state;
  try { state = clone(value); } catch { return { ok: false, reason: 'reason.invalid' }; }
  if (state.version == null && Array.isArray(state.buildings)) state.version = 1;
  if (!Number.isInteger(state.version) || state.version < 1) return { ok: false, reason: 'reason.invalid' };
  if (state.version > CURRENT_VERSION) return { ok: false, reason: 'reason.future' };
  const fromVersion = state.version;
  while (state.version < CURRENT_VERSION) {
    const migrate = migrations[state.version];
    if (!migrate) return { ok: false, reason: 'reason.invalid' };
    state = migrate(state, data);
  }
  const validation = validateSave(state, data, registry);
  return validation.ok ? { ok: true, state, migrated: fromVersion !== CURRENT_VERSION } : validation;
}

export function validateSave(state, data, registry) {
  const invalid = () => ({ ok: false, reason: 'reason.invalid' });
  if (!isObject(state) || state.version !== CURRENT_VERSION || !finitePositive(state.money) || !isObject(state.resources)) return invalid();
  if (!Object.keys(data.config.startingResources).every(key => finitePositive(state.resources[key]))) return invalid();
  if (!isObject(state.world) || !data.config.worldStages.some(row => row.size === state.world.size) || !Number.isInteger(state.world.stage) || state.world.stage < 0 || state.world.stage >= data.config.worldStages.length || data.config.worldStages[state.world.stage].size !== state.world.size) return invalid();
  if (!Array.isArray(state.buildings) || state.buildings.length > data.config.maxSaveBuildings) return invalid();
  const ids = new Set(), occupied = new Set();
  for (const row of state.buildings) {
    const type = registry.buildings.get(row?.typeId);
    if (!type || !validId(row.id) || ids.has(row.id) || !Number.isInteger(row.x) || !Number.isInteger(row.z) || !Number.isInteger(row.level) || row.level < 1 || row.level > type.levels.length) return invalid();
    ids.add(row.id);
    for (const [x, z] of cellsFor(type, row.x, row.z)) {
      const key = `${x},${z}`;
      if (x < 0 || z < 0 || x >= state.world.size || z >= state.world.size || occupied.has(key)) return invalid();
      occupied.add(key);
    }
  }
  if (!isObject(state.avatar) || typeof state.avatar.created !== 'boolean' || !data.avatar.genders.some(row => row.id === state.avatar.gender) || !data.avatar.hairstyles.some(row => row.id === state.avatar.hairstyle)) return invalid();
  if (!['skinColor', 'hairColor', 'shirtColor', 'pantsColor'].every(key => validColor(state.avatar[key]))) return invalid();
  if (typeof state.avatar.nameId !== 'string' || (state.avatar.name != null && (typeof state.avatar.name !== 'string' || state.avatar.name.length > 30))) return invalid();
  if (!isObject(state.tutorial) || !Number.isInteger(state.tutorial.step) || state.tutorial.step < 0 || state.tutorial.step > data.tutorial.steps.length || typeof state.tutorial.completed !== 'boolean' || typeof state.tutorial.skipped !== 'boolean') return invalid();
  if (!isObject(state.team) || !validId(state.team.id) || typeof state.team.nameId !== 'string' || !Array.isArray(state.team.colors) || !state.team.colors.every(validColor) || !Array.isArray(state.players)) return invalid();
  if (!state.players.every(player => isObject(player) && validId(player.id) && typeof player.nameId === 'string' && validColor(player.color) && ['speed', 'kick', 'guard', 'level'].every(key => finitePositive(player[key])))) return invalid();
  if (!isObject(state.parts) || !Object.entries(state.parts).every(([key, value]) => validId(key) && Number.isSafeInteger(value) && value >= 0)) return invalid();
  for (const key of ['claimedRewards', 'completedMissions', 'completedEpisodes']) if (!Array.isArray(state[key]) || !state[key].every(value => typeof value === 'string')) return invalid();
  if (!Number.isSafeInteger(state.nextId) || state.nextId < 1 || !finitePositive(state.playSeconds)) return invalid();
  if (!validActivity(state,data,registry)) return invalid();
  return { ok: true };
}

export function loadWorld(storage, data, registry, now = Date.now()) {
  if (!storage) return { ok: false, reason: 'reason.storage' };
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return { ok: false, reason: 'reason.storage' }; }
  if (raw == null) return { ok: true, state: null };
  let value;
  try { value = JSON.parse(raw); } catch { value = null; }
  const result = migrateSave(value, data, registry);
  if (result.ok) return result;
  const backupKey = `${STORAGE_KEY}.corrupt.${now}`;
  let backupSaved = false;
  try { storage.setItem(backupKey, raw); backupSaved = true; } catch { /* The original is never overwritten. */ }
  return { ...result, backupKey: backupSaved ? backupKey : null };
}

export function saveWorld(storage, state) {
  try { storage.setItem(STORAGE_KEY, exportWorld(state)); return { ok: true }; }
  catch { return { ok: false, reason: 'reason.storage' }; }
}

export function exportWorld(state) { return JSON.stringify({ ...state, version: CURRENT_VERSION }, null, 2); }

/** Import is an additive merge. Current buildings win on conflicts; current progress is never reduced. */
export function importWorld(raw, current, data, registry) {
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { ok: false, reason: 'reason.import' }; }
  const migrated = migrateSave(parsed, data, registry);
  if (!migrated.ok) return migrated;
  const incoming = migrated.state;
  const merged = clone(current);
  if (incoming.world.size > merged.world.size) merged.world = clone(incoming.world);
  const occupied = new Set(merged.buildings.flatMap(row => cellsFor(registry.buildings.get(row.typeId), row.x, row.z).map(cell => cell.join(','))));
  const ids = new Set(merged.buildings.map(row => row.id));
  let added = 0, conflicts = 0;
  for (const row of incoming.buildings) {
    if (ids.has(row.id)) {
      const existing = merged.buildings.find(item => item.id === row.id);
      if (existing.typeId === row.typeId) existing.level = Math.max(existing.level, row.level);
      else conflicts++;
      continue;
    }
    const cells = cellsFor(registry.buildings.get(row.typeId), row.x, row.z).map(cell => cell.join(','));
    if (cells.some(key => occupied.has(key))) { conflicts++; continue; }
    merged.buildings.push(clone(row));
    ids.add(row.id); cells.forEach(key => occupied.add(key)); added++;
  }
  merged.money = Math.max(merged.money, incoming.money);
  for (const resource of Object.keys(merged.resources)) merged.resources[resource] = Math.max(merged.resources[resource], incoming.resources[resource]);
  for (const [group, count] of Object.entries(incoming.parts)) merged.parts[group] = Math.max(merged.parts[group] || 0, count);
  data.config.worldStages.forEach((stage, index) => {
    if (index > merged.world.stage && (merged.parts[data.world.partGroup] || 0) >= stage.requiredParts) merged.world = { size: stage.size, stage: index };
  });
  for (const key of ['claimedRewards', 'completedMissions', 'completedEpisodes']) merged[key] = [...new Set([...merged[key], ...incoming[key]])];
  if (incoming.tutorial.step > merged.tutorial.step) merged.tutorial = clone(incoming.tutorial);
  merged.tutorial.completed ||= incoming.tutorial.completed;
  if (!merged.avatar.created && incoming.avatar.created) merged.avatar = clone(incoming.avatar);
  merged.nextId = Math.max(merged.nextId, incoming.nextId);
  merged.playSeconds = Math.max(merged.playSeconds, incoming.playSeconds);
  mergeActivity(merged,incoming,data);
  merged.updatedAt = Date.now();
  const validation = validateSave(merged, data, registry);
  return validation.ok ? { ok: true, state: merged, added, conflicts } : validation;
}
