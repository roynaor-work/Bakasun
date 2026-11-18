const DAY_MILLISECONDS = 86_400_000;
const START_DATE = Date.UTC(2026, 0, 1);
export const TICK_SECONDS = 10;
const LOCATION_REASONS = new Set(['reason.bounds', 'reason.occupied', 'reason.road', 'reason.shore']);
export const INELIGIBLE_REASONS = new Set(['sim.catalog', 'sim.notBuilt', 'sim.levelUnavailable']);

export function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

const cell = (x, z) => `${x},${z}`;

function spatialCandidates(engine, type) {
  const { buildings, world } = engine.state;
  const occupied = new Set();
  const roadAccess = new Set();
  for (const { x, z, typeId } of buildings) {
    const record = engine.registry.buildings.get(typeId);
    const [width, depth] = record.footprint;
    for (let dx = 0; dx < width; dx++) {
      for (let dz = 0; dz < depth; dz++) {
        const cx = x + dx;
        const cz = z + dz;
        occupied.add(cell(cx, cz));
        if (!record.isRoad) continue;
        roadAccess.add(cell(cx - 1, cz));
        roadAccess.add(cell(cx + 1, cz));
        roadAccess.add(cell(cx, cz - 1));
        roadAccess.add(cell(cx, cz + 1));
      }
    }
  }

  const [width, depth] = type.footprint;
  const candidates = [];
  for (let z = 0; z <= world.size - depth; z++) {
    for (let x = 0; x <= world.size - width; x++) {
      const shore = x === 0 || z === 0 || x + width === world.size || z + depth === world.size;
      if (type.requiresShore && !shore) continue;
      const keys = Array.from({ length: width * depth }, (_, index) => cell(x + index % width, z + Math.floor(index / width)));
      if (keys.some(key => occupied.has(key)) || type.requiresRoad && !keys.some(key => roadAccess.has(key))) continue;
      candidates.push({ x, z });
    }
  }
  const centerDistance = ({ x, z }) => Math.abs(x + width / 2 - world.size / 2) + Math.abs(z + depth / 2 - world.size / 2);
  return candidates.sort((first, second) => centerDistance(first) - centerDistance(second));
}

function findPlot(engine, typeId, readySites) {
  const type = engine.registry.buildings.get(typeId);
  if (!type) return { ok: false, reason: 'sim.catalog' };
  const site = readySites.find(row => row.typeId === typeId && row.ok);
  if (site) {
    const validation = engine.validatePlacement(typeId, site.x, site.z);
    if (validation.ok) return { ok: true, siteId: site.id };
    if (!LOCATION_REASONS.has(validation.reason)) return validation;
  }
  const candidates = spatialCandidates(engine, type);
  for (const { x, z } of candidates) {
    const validation = engine.validatePlacement(typeId, x, z);
    if (validation.ok) return { ok: true, x, z };
    if (!LOCATION_REASONS.has(validation.reason)) return validation;
  }
  return { ok: false, reason: 'sim.noPlot' };
}

function unfinished(engine, goal) {
  const rows = engine.state.buildings.filter(row => row.typeId === goal.id);
  return goal.kind === 'build' ? rows.length < goal.count : !rows.some(row => row.level >= goal.level);
}

function tryGoal(engine, goal, readySites) {
  if (goal.kind === 'build') {
    const plot = findPlot(engine, goal.id, readySites);
    if (!plot.ok) return plot;
    return plot.siteId ? engine.buildReadyPlot(plot.siteId) : engine.place(goal.id, plot.x, plot.z);
  }
  const type = engine.registry.buildings.get(goal.id);
  if (!type) return { ok: false, reason: 'sim.catalog' };
  if (type.levels.length < goal.level) return { ok: false, reason: 'sim.levelUnavailable' };
  const building = engine.state.buildings.filter(row => row.typeId === goal.id)
    .sort((first, second) => second.level - first.level)[0];
  if (!building) return { ok: false, reason: 'sim.notBuilt' };
  return engine.upgrade(building.id);
}

function decide(engine, pending) {
  if (!pending.length) return { failures: [] };
  const readySites = engine.readyPlots();
  const failures = [];
  for (const goal of pending) {
    const result = tryGoal(engine, goal, readySites);
    if (result.ok) return { action: { ...goal, buildingId: result.id }, failures };
    failures.push({ kind: goal.kind, id: goal.id, reason: result.reason });
  }
  return { failures };
}

const round = value => Math.round(value * 10) / 10;

function unlockedIds(report) {
  return (report?.unlocked || []).map(row => typeof row === 'string' ? row : row.id ?? row.typeId);
}

export function runScenario({ createEngine, data, profile, enabled, assetTypeIds, constructionStage, progressMetrics, createStorage = memoryStorage }) {
  let timestamp = START_DATE;
  const engine = createEngine(data, { storage: createStorage(), now: () => timestamp });
  const readProgress = () => engine.cityProgress?.() ?? null;
  if (enabled && !readProgress()) throw new Error('Run against an island with the integration patch applied.');
  if (!enabled && readProgress()) throw new Error('City progression is still enabled in the rollback engine.');
  const prepared = engine.enableReadyBuilding();
  if (!prepared.ok) throw new Error(`Could not prepare the island: ${prepared.reason}`);
  const initialRows = new Set(engine.state.buildings.map(row => row.id));
  const playerBuilding = row => !initialRows.has(row.id) && !engine.registry.buildings.get(row.typeId)?.isRoad;
  const initialReport = readProgress();
  const events = [];
  const decisions = [];
  const days = [];
  const completedIds = new Set();
  let activeSeconds = 0;
  let calendarDay = 0;
  let previousProgress = new Map();
  let unlocked = new Set(unlockedIds(initialReport));
  let assetTypesCompleted = new Set();
  let scriptCompleted;

  function emit(kind, detail) {
    events.push({ kind, calendarDay, activeSeconds, ...detail });
  }

  function snapshotProgress() {
    const current = new Map();
    for (const row of engine.state.buildings) {
      if (!playerBuilding(row)) continue;
      const stage = enabled ? constructionStage(engine.state, row.id) : 'complete';
      const previous = previousProgress.get(row.id);
      const progress = { stage, level: row.level };
      current.set(row.id, progress);
      if (stage !== 'complete' && previous?.stage !== stage) emit('construction-stage', { id: row.typeId, buildingId: row.id, stage });
      if (stage === 'complete' && (previous?.stage !== 'complete' || previous?.level !== row.level)) {
        const kind = previous && (previous.level !== row.level || row.level > 1) ? 'upgrade-completed' : 'build-completed';
        if (kind === 'build-completed') completedIds.add(row.id);
        emit(kind, { id: row.typeId, buildingId: row.id, level: row.level });
      }
    }
    previousProgress = current;
    const report = readProgress();
    const next = new Set(unlockedIds(report));
    for (const id of next) {
      if (!unlocked.has(id)) emit('unlocked', { id });
    }
    unlocked = next;
    return report;
  }

  for (const [index, sessionMinutes] of profile.sessionMinutes.entries()) {
    calendarDay = index + 1;
    timestamp = START_DATE + index * DAY_MILLISECONDS;
    const startEvents = events.length;
    const startDecisions = decisions.length;
    const dayDuration = sessionMinutes * 60;
    const parts = profile.partGrants[calendarDay];
    if (sessionMinutes && parts) {
      const result = engine.grantParts(data.world.partGroup, parts);
      if (!result.ok) throw new Error(`Could not grant scripted activity parts: ${result.reason}`);
      emit('activity-parts', { parts });
    }

    const decisionInterval = 60 / profile.decisionsPerMinute;
    for (let elapsed = 0; elapsed < dayDuration;) {
      const seconds = Math.min(TICK_SECONDS, decisionInterval - elapsed % decisionInterval, data.config.maxTickSeconds, dayDuration - elapsed);
      activeSeconds += seconds;
      timestamp += seconds * 1000;
      elapsed += seconds;
      const tick = engine.tick(seconds);
      if (!tick.ok) throw new Error(`Tick rejected: ${tick.reason}`);
      snapshotProgress();
      if (elapsed % decisionInterval !== 0) continue;
      const pending = profile.goals.filter(goal => unfinished(engine, goal));
      const decision = decide(engine, pending);
      decisions.push({ calendarDay, activeSeconds, ...decision });
      if (!decision.action) continue;
      const { kind, id, buildingId } = decision.action;
      emit(`${kind}-accepted`, { id, buildingId });
      snapshotProgress();
    }

    const report = readProgress();
    const metrics = engine.metrics();
    const currentEvents = events.slice(startEvents);
    const currentDecisions = decisions.slice(startDecisions);
    const completed = engine.state.buildings.filter(row => completedIds.has(row.id));
    assetTypesCompleted = new Set(completed.filter(row => assetTypeIds.has(row.typeId)).map(row => row.typeId));
    if (!scriptCompleted && profile.goals.every(goal => !unfinished(engine, goal)) && !report?.projects.length) {
      scriptCompleted = { calendarDay, activeSeconds };
    }
    days.push({
      calendarDay,
      sessionSeconds: dayDuration,
      activeSeconds,
      cityDay: report?.day ?? null,
      worldStage: engine.state.world.stage,
      population: report?.population ?? engine.population(),
      capacity: report?.capacity ?? engine.population(),
      satisfaction: round(report?.satisfaction ?? progressMetrics(engine.state, engine.registry, metrics).satisfaction),
      happiness: round(metrics.happiness ?? 0),
      money: round(engine.state.money),
      moneyPerMinute: round(engine.incomePerMinute()),
      materials: round(engine.state.resources.materials),
      food: round(engine.state.resources.food),
      energy: round(engine.state.resources.energy),
      builds: completed.length,
      assetTypesBuilt: assetTypesCompleted.size,
      upgrades: currentEvents.filter(row => row.kind === 'upgrade-completed').length,
      unlocks: report ? unlocked.size : null,
      newUnlocks: currentEvents.filter(row => row.kind === 'unlocked').map(row => row.id),
      stages: currentEvents.filter(row => row.kind === 'construction-stage').length,
      choices: currentDecisions.filter(row => row.action).length,
      noProfileChoice: currentDecisions.filter(row => !row.action && row.failures.some(failure => !INELIGIBLE_REASONS.has(failure.reason))).length,
    });
  }
  const incompleteGoals = profile.goals.filter(goal => unfinished(engine, goal));
  const readySites = engine.readyPlots();
  const built = new Set(engine.state.buildings.map(row => row.typeId));
  const unbuiltAvailableTypes = [...assetTypeIds].filter(id => !built.has(id) && findPlot(engine, id, readySites).ok);
  return {
    profile: profile.id, name: profile.name, mode: enabled ? 'progression' : 'rollback',
    days, decisions, events, assetTypesCompleted: [...assetTypesCompleted],
    incompleteGoals, goals: profile.goals.length, scriptCompleted, unbuiltAvailableTypes,
  };
}
