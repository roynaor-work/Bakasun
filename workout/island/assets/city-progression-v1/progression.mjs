import { calculateMetrics, population } from '../../engine/metrics.mjs?v=island-v2-20261107-24';
import {
  BUILDINGS, CONSTRUCTION_STAGES, DAY_SECONDS, LAND_MILESTONES, MONEY_ABOVE_CAP_FACTOR,
  MONEY_SOFT_CAP, RECOVERY_MONEY_PER_MINUTE, STARTER_SUPPLIES, UNLOCK_GRACE_DAYS,
} from './catalog.mjs?v=island-v2-20261107-24';

const [FOUNDATION, HALF_BUILT, COMPLETE] = CONSTRUCTION_STAGES;
const buildingIds = Object.keys(BUILDINGS);
const goods = Object.keys(STARTER_SUPPLIES);
const EPSILON = 1e-8;

const progressOf = state => state.cityProgress;
const timeOf = state => progressOf(state)?.activeSeconds ?? 0;
const dayOf = state => Math.floor((timeOf(state) + EPSILON) / DAY_SECONDS) + 1;
const queueLimit = day => day >= 7 ? 5 : day >= 4 ? 4 : 3;
const ok = detail => ({ ...detail, ok: true, reason: 'reason.allowed' });
const blocked = (reason, detail) => ({ ...detail, ok: false, reason });

export function initProgress(state) {
  if (!Object.hasOwn(state, 'cityProgress')) {
    // A copy of an old city begins its new clock at day one. Existing builds are complete.
    state.cityProgress = {
      version: 1,
      activeSeconds: 0,
      unlocked: [...new Set(state.buildings.map(row => row.typeId).filter(id => Object.hasOwn(BUILDINGS, id)))],
      projects: {},
    };
  }
  return state.cityProgress;
}

export function validProgress(state) {
  if (!Object.hasOwn(state, 'cityProgress')) return true;
  const value = state.cityProgress;
  if (!value || value.version !== 1 || !Number.isFinite(value.activeSeconds) ||
      value.activeSeconds < 0 || value.activeSeconds > Number.MAX_SAFE_INTEGER ||
      !Array.isArray(value.unlocked) || value.unlocked.some(id => !Object.hasOwn(BUILDINGS, id)) ||
      new Set(value.unlocked).size !== value.unlocked.length ||
      !value.projects || typeof value.projects !== 'object' || Array.isArray(value.projects)) return false;
  const byId = new Map(state.buildings.map(row => [row.id, row]));
  const projects = Object.entries(value.projects);
  return projects.length <= queueLimit(dayOf(state)) && projects.every(([id, project]) => {
    const row = byId.get(id);
    if (!row || !project || project.typeId !== row.typeId || !Object.hasOwn(BUILDINGS, row.typeId) ||
        !Number.isFinite(project.startedAt) || !Number.isFinite(project.finishesAt) ||
        project.startedAt < 0 || project.startedAt > value.activeSeconds ||
        project.finishesAt <= value.activeSeconds || project.finishesAt <= project.startedAt ||
        project.finishesAt - project.startedAt > DAY_SECONDS) return false;
    if (project.kind === 'build') return project.level === 1 && row.level === 1;
    return project.kind === 'upgrade' && project.level === row.level + 1 &&
      project.level <= BUILDINGS[row.typeId].upgrades.length + 1;
  });
}

export function isOperational(state, id) {
  return progressOf(state)?.projects[id]?.kind !== 'build';
}

/** Upgrades keep the previous level in service. New construction reserves its lot immediately. */
export function operatingState(state) {
  if (!Object.values(progressOf(state)?.projects ?? {}).some(project => project.kind === 'build')) return state;
  return { ...state, buildings: state.buildings.filter(row => isOperational(state, row.id)) };
}

function context(state, registry) {
  const live = operatingState(state);
  return {
    day: dayOf(state),
    population: population(live, registry, registry.config),
    built: new Set(live.buildings.map(row => row.typeId)),
    earned: new Set(progressOf(state)?.unlocked ?? []),
  };
}

function unlockDetails({ day, population, requires }) {
  return { day, population, requires, fallbackDay: day + UNLOCK_GRACE_DAYS };
}

function unlockStatus(id, foundation) {
  const detail = unlockDetails(BUILDINGS[id]);
  const { day, population: residents, built, earned } = foundation;
  if (earned.has(id)) return ok(detail);
  if (day < detail.day) return blocked('progress.day', detail);
  if (day >= detail.fallbackDay) return ok(detail);
  if (residents < detail.population) return blocked('progress.population', detail);
  if (detail.requires.length && !detail.requires.some(typeId => built.has(typeId))) {
    return blocked('progress.prerequisite', detail);
  }
  return ok(detail);
}

function updateUnlocks(state, registry) {
  const value = initProgress(state);
  if (value.unlocked.length === buildingIds.length) return [];
  const conditions = context(state, registry);
  const unlocked = buildingIds.filter(id => !conditions.earned.has(id) && unlockStatus(id, conditions).ok);
  value.unlocked.push(...unlocked);
  return unlocked;
}

function costAvailability(state, terms, detail) {
  const info = { ...detail, cost: terms.cost, stageSeconds: terms.stageSeconds };
  if (Object.keys(progressOf(state)?.projects ?? {}).length >= queueLimit(dayOf(state))) {
    return blocked('progress.queue', info);
  }
  if (state.money < terms.cost.money) return blocked('reason.money', info);
  for (const resource of goods) {
    if (state.resources[resource] + EPSILON < terms.cost[resource]) return blocked(`progress.${resource}`, info);
  }
  return ok(info);
}

/** These progression checks supplement the engine's footprint, roads, feature flags and count limits. */
export function progressAvailability(state, registry, typeId) {
  if (!Object.hasOwn(BUILDINGS, typeId)) return ok();
  const blueprint = progressOf(state)?.unlocked.includes(typeId)
    ? ok(unlockDetails(BUILDINGS[typeId]))
    : unlockStatus(typeId, context(state, registry));
  if (!blueprint.ok) return blueprint;
  return costAvailability(state, BUILDINGS[typeId], blueprint);
}

export function upgradeProgressAvailability(state, registry, id) {
  const row = state.buildings.find(building => building.id === id);
  if (!row) return blocked('reason.invalid');
  if (!Object.hasOwn(BUILDINGS, row.typeId)) return ok();
  if (progressOf(state)?.projects[id]) return blocked('progress.pending');
  const upgrade = BUILDINGS[row.typeId].upgrades[row.level - 1];
  if (!upgrade) return blocked('reason.maxLevel');
  const nextLevel = registry.buildings.get(row.typeId)?.levels?.[row.level];
  const details = { nextLevel, day: upgrade.day, title: upgrade.title };
  if (dayOf(state) < upgrade.day) return blocked('progress.day', details);
  return costAvailability(state, upgrade, details);
}

/** The caller charges coins and maintains undo history as part of the engine command. */
export function startProgressProject(state, registry, row, { upgrade = false } = {}) {
  if (!Object.hasOwn(BUILDINGS, row.typeId)) return null;
  const value = initProgress(state);
  if (Object.hasOwn(value.projects, row.id)) return null;
  const definition = BUILDINGS[row.typeId];
  const terms = upgrade ? definition.upgrades[row.level - 1] : definition;
  if (!terms) return null;
  const startedAt = timeOf(state);
  for (const resource of goods) state.resources[resource] = Math.max(0, state.resources[resource] - terms.cost[resource]);
  const project = {
    typeId: row.typeId, kind: upgrade ? 'upgrade' : 'build',
    level: row.level + Number(upgrade), startedAt, finishesAt: startedAt + terms.stageSeconds,
  };
  value.projects[row.id] = project;
  updateUnlocks(state, registry);
  return project;
}

export function cancelProgressProject(state, id) {
  const projects = progressOf(state)?.projects;
  if (!projects || !Object.hasOwn(projects, id)) return null;
  const project = projects[id];
  delete projects[id];
  return project;
}

const halfwayAt = project => project.startedAt + (project.finishesAt - project.startedAt) / 3;

export function constructionStage(state, id) {
  const project = progressOf(state)?.projects[id];
  if (!project) return COMPLETE;
  return timeOf(state) + EPSILON >= halfwayAt(project) ? HALF_BUILT : FOUNDATION;
}

/** Allows a batched tick to accrue old and new income on the correct sides of completion. */
export function secondsUntilProgressEvent(state) {
  const now = timeOf(state);
  const upcoming = Object.values(progressOf(state)?.projects ?? {}).flatMap(project => [halfwayAt(project), project.finishesAt]);
  return Math.min(dayOf(state) * DAY_SECONDS, ...upcoming.filter(at => at > now + EPSILON)) - now;
}

export function advanceProgress(state, registry, seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return [];
  const value = initProgress(state);
  const end = Math.min(Number.MAX_SAFE_INTEGER, value.activeSeconds + seconds);
  const events = [];
  // Cross event boundaries in order so a completed prerequisite can earn a blueprint on its own day.
  while (value.activeSeconds < end) {
    const before = value.activeSeconds;
    const oldDay = dayOf(state);
    value.activeSeconds = Math.min(end, before + secondsUntilProgressEvent(state));
    const now = value.activeSeconds;
    if (now <= before) break;
    if (dayOf(state) !== oldDay) events.push({ kind: 'day', day: dayOf(state) });
    for (const [id, project] of Object.entries(value.projects)) {
      const event = { kind: project.kind, id, typeId: project.typeId, level: project.level };
      if (before + EPSILON < halfwayAt(project) && now + EPSILON >= halfwayAt(project)) {
        events.push({ ...event, stage: HALF_BUILT });
      }
      if (now + EPSILON >= project.finishesAt) {
        const row = state.buildings.find(item => item.id === id);
        if (row && project.kind === 'upgrade') row.level = project.level;
        cancelProgressProject(state, id);
        if (row) events.push({ ...event, stage: COMPLETE });
      }
    }
    const unlocked = updateUnlocks(state, registry);
    if (unlocked.length) events.push({ kind: 'unlock', ids: unlocked });
  }
  return events;
}

export function progressPartTarget(state, registry) {
  const day = dayOf(state);
  if (day < LAND_MILESTONES[0].day) return 0;
  const residents = population(operatingState(state), registry, registry.config);
  return LAND_MILESTONES.findLast(mark => day >= mark.day && residents >= mark.population)?.parts ?? 0;
}

export function progressMetrics(state, registry, legacyMetrics = calculateMetrics(operatingState(state), registry, registry.config)) {
  const { happiness = 40, fun = 25, health = 35, security = 35, education = 25 } = legacyMetrics;
  const satisfaction = Math.round(0.40 * happiness + 0.20 * fun + 0.15 * health + 0.15 * security + 0.10 * education);
  return { ...legacyMetrics, satisfaction };
}

export function progressIncome(state, registry, legacyIncome) {
  const aboveCap = Math.max(0, legacyIncome.money - MONEY_SOFT_CAP);
  const adjusted = legacyIncome.money - aboveCap * (1 - MONEY_ABOVE_CAP_FACTOR);
  const result = {
    ...legacyIncome,
    money: Math.max(RECOVERY_MONEY_PER_MINUTE, adjusted),
    sources: [...(legacyIncome.sources ?? [])],
  };
  if (adjusted < RECOVERY_MONEY_PER_MINUTE) {
    result.sources.push({ id: 'progress.recovery', resource: 'money', amount: result.money - adjusted });
  }
  if (aboveCap) result.sources.push({ id: 'progress.diminishingReturns', resource: 'money', amount: adjusted - legacyIncome.money });
  for (const [resource, amount] of Object.entries(STARTER_SUPPLIES)) {
    result[resource] = (legacyIncome[resource] ?? 0) + amount;
    result.sources.push({ id: 'progress.supplies', resource, amount });
  }
  return result;
}

export function progressReport(state, registry, legacyMetrics) {
  const conditions = context(state, registry);
  const metrics = progressMetrics(state, registry, legacyMetrics);
  const projects = Object.entries(progressOf(state)?.projects ?? {}).map(([id, project]) => ({
    id, ...project, stage: constructionStage(state, id), remainingSeconds: Math.ceil(project.finishesAt - timeOf(state)),
  }));
  const blueprints = Object.fromEntries(buildingIds.map(id => [id, unlockStatus(id, conditions)]));
  return {
    day: conditions.day, daySeconds: DAY_SECONDS, activeSeconds: timeOf(state),
    population: conditions.population, capacity: population(state, registry, registry.config),
    satisfaction: metrics.satisfaction, metrics, projects, queueLimit: queueLimit(conditions.day),
    unlocked: buildingIds.filter(id => blueprints[id].ok), blueprints,
  };
}
